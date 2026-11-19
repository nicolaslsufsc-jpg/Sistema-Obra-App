"""Monta o histórico da FVS a partir do que foi lido do Construpoint (módulo FVS).

Uso (no PC):
    py pipeline/integracoes/construpoint/importar_construpoint.py PASTA_CONSTRUPOINT --pacotes PASTA_DOS_PACOTES --saida historico.json
        --obra CODIGO --fichas-do-app FICHA_DE_PILAR,FICHA_DE_VIGA

PASTA_CONSTRUPOINT (fora do repositório) tem os relatórios já salvos. Este script NÃO acessa o
Construpoint nem o servidor: só lê arquivos do PC e grava outros arquivos do PC.
    cp_verificacoes.json   relatório "Verificações por Modelo", com o histórico completo
    cp_inspecoes.json      relatório "Inspeções por Modelo" (uma linha por ficha)
    cp_fichas.json         itens de cada ficha modelo, na ordem da ficha

Regras:
- Data e hora de cada registro = as da verificação no Construpoint, não as de hoje.
- Quem marcou vai em "verificado_por", pelo nome (a pessoa pode não ter conta no app).
- Rodada: V01 até o primeiro R; o registro seguinte a um R é a rodada seguinte (mesma regra do app).
- Ficha duplicada: a mesma peça com duas fichas no Construpoint. As duas entram, cada uma com os
  seus registros (ficha_campo_id). Nenhuma apaga a outra.
- Local sem peça na planta (laje, bloco, cortina, nome que não está na prancha): a ficha entra na
  lista, com a situação e as contagens, e o motivo vai para o arquivo de pendências.

Só biblioteca padrão: testado em pipeline/integracoes/construpoint/testes/.
"""

from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import json
import pathlib
import re
import sys
import uuid

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent))

ESPACO_DE_IDS = uuid.UUID("0c6f9a52-6a0b-4b7e-8f3d-2b9c7a4e1d10")
# Horário de Brasília, sem horário de verão desde 2019. O app compara datas como texto em UTC.
FUSO = dt.timezone(dt.timedelta(hours=-3))
# C (conforme), NC (não conforme), NA (não aplicável). Até 08/11/2026 eram A e R; o app lê os dois.
RESULTADO = {"Aprovado": "C", "Reprovado": "NC", "N/A": "NA"}
RE_PECA = re.compile(r"^([PV])(\d+[A-Z]?)$")
RE_O_NO_LUGAR_DE_ZERO = re.compile(r"^([PV]\d+)O$")


class ErroImportacao(Exception):
    pass


def novo_id(obra: str, tipo: str, chave) -> str:
    return str(uuid.uuid5(ESPACO_DE_IDS, f"{obra}|{tipo}|{chave}"))


def data_utc(texto: str | None) -> str | None:
    """"30/09/2026 08:15:51" (Brasília) -> "2026-09-30T11:15:51.000Z", como o app grava."""
    if not texto:
        return None
    texto = texto.strip()
    for formato in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            d = dt.datetime.strptime(texto, formato).replace(tzinfo=FUSO)
            return d.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        except ValueError:
            continue
    raise ErroImportacao(f"data em formato desconhecido: {texto}")


def texto_do_item(texto: str | None) -> str:
    return re.sub(r"\s+", " ", texto or "").strip()


def peca_do_local(local: str) -> tuple[str, str, str] | None:
    """(pavimento, tipo, nome) de "Pilotis \\ Trecho 1 \\ Pilares \\ P27", ou None se o local não é peça.

    O tipo vem do nome da peça: a ficha pode estar errada (ficha de pilar aberta numa viga).
    "2° Pavimento" (grau) vira "2º Pavimento" (ordinal), como nas plantas; "p216" vira "P216" e
    "P9O" (letra O) vira "P90". O nome volta em maiúsculas para comparar com as peças da planta.
    """
    partes = [p.strip() for p in local.split("\\")]
    if len(partes) < 2:
        return None
    pavimento = (partes[1] if partes[0] == "Torre" else partes[0]).replace("°", "º")
    nome = partes[-1].replace(" ", "").upper()
    nome = RE_O_NO_LUGAR_DE_ZERO.sub(r"\g<1>0", nome)
    m = RE_PECA.match(nome)
    return (pavimento, m.group(1), nome) if m else None


def observacao_de(problemas, solucoes) -> str | None:
    """Texto do "O que fazer?": o problema e, se houver, a solução anotada no Construpoint."""
    junta = lambda lista: "; ".join(t for t in (texto_do_item(x.get("Descricao")) for x in (lista or [])) if t)
    problema, solucao = junta(problemas), junta(solucoes)
    if problema and solucao:
        return f"{problema}. Solução: {solucao}"[:2000]
    return (problema or (f"Solução: {solucao}" if solucao else ""))[:2000] or None


def linhas_de(relatorio: dict) -> list[dict]:
    """Os relatórios vêm por ficha modelo: {"EXE-PVS-001": {"data": [...]}} ou {"...": [...]}."""
    saida = []
    for codigo, conteudo in relatorio.items():
        for linha in conteudo["data"] if isinstance(conteudo, dict) else conteudo:
            saida.append({**linha, "_ficha_codigo": codigo})
    return saida


def montar(obra: str, verificacoes: list[dict], inspecoes: list[dict], itens_por_ficha: dict[str, list[str]],
           pecas: dict[str, dict[str, dict[str, str]]], fichas_do_app: set[str]) -> dict:
    """pecas: {pavimento: {tipo: {NOME EM MAIÚSCULAS: elementos.id}}}.
    fichas_do_app: códigos das fichas cadastradas (só elas viram registros marcáveis na planta)."""
    numero_do_item = {cod: {texto_do_item(t): i for i, t in enumerate(itens, 1)} for cod, itens in itens_por_ficha.items()}
    pendencias: list[dict] = []
    fichas: dict[int, dict] = {}
    for f in inspecoes:
        local = f["Location"]
        peca = peca_do_local(local)
        reg = {
            "id": novo_id(obra, "ficha_campo", f["Id"]),
            "codigo": f["Code"],
            "construpoint_id": f["Id"],
            "local_construpoint": local,
            "ficha_codigo": f["_ficha_codigo"],
            "ficha_titulo": f.get("Model"),
            "status": f["Status"],
            "inspetor": f.get("Inspector") or None,
            "parceiro": f.get("ProviderFantasyName") or None,
            "agendada_em": data_utc(f.get("ScheduleDate")),
            "atualizada_em": data_utc(f.get("UpdateDate")),
            "pavimento": None, "tipo": None, "nome": None, "elemento_id": None,
            "qtd_a": 0, "qtd_r": 0, "qtd_na": 0,
        }
        motivo = None
        if f["_ficha_codigo"] not in fichas_do_app:
            motivo = "ficha ainda sem peça no app (laje, bloco, cortina...)"
        elif peca is None:
            motivo = "local não é uma peça"
        else:
            pavimento, tipo, nome = peca
            eid = pecas.get(pavimento, {}).get(tipo, {}).get(nome)
            if eid is None:
                motivo = "peça não está na planta do pavimento"
            else:
                reg.update({"pavimento": pavimento, "tipo": tipo, "nome": nome, "elemento_id": eid})
        if motivo:
            pendencias.append({"motivo": motivo, "local": local, "ficha": f["_ficha_codigo"], "codigo": f["Code"], "status": f["Status"]})
        fichas[f["Id"]] = reg

    por_trilha: dict[tuple[int, int], list[dict]] = collections.defaultdict(list)
    vistos: set = set()
    descartados = collections.Counter()
    for v in verificacoes:
        ficha = fichas.get(v["Id"])
        if ficha is None:
            descartados["ficha fora do relatório de inspeções"] += 1
            continue
        resultado = RESULTADO.get(v.get("VerificationStatus"))
        if resultado is None:
            descartados[f"resultado desconhecido: {v.get('VerificationStatus')}"] += 1
            continue
        if v["InspectionChklId"] in vistos:
            descartados["repetido no relatório"] += 1
            continue
        vistos.add(v["InspectionChklId"])
        ficha[{"C": "qtd_a", "NC": "qtd_r", "NA": "qtd_na"}[resultado]] += 1
        if ficha["elemento_id"] is None:
            continue
        item = numero_do_item.get(ficha["ficha_codigo"], {}).get(texto_do_item(v["Verificacoes"]))
        if item is None:
            descartados["item que não está na ficha"] += 1
            continue
        por_trilha[(v["Id"], item)].append({**v, "_resultado": resultado})

    eventos: list[dict] = []
    for (ficha_id, item), linhas in sorted(por_trilha.items()):
        ficha = fichas[ficha_id]
        linhas.sort(key=lambda r: (data_utc(r["DateVerification"]), r["InspectionChklId"]))
        rodada, anterior, ultima_data, mesma_data = 1, None, None, 0
        for r in linhas:
            if anterior == "NC":
                rodada += 1
            quando = data_utc(r["DateVerification"])
            # dois registros do mesmo item no mesmo segundo: um milissegundo de diferença mantém a ordem
            mesma_data = mesma_data + 1 if quando == ultima_data else 0
            ultima_data = quando
            eventos.append({
                "id": novo_id(obra, "verificacao", r["InspectionChklId"]),
                "ficha_campo_id": ficha["id"],
                "elemento_id": ficha["elemento_id"],
                "ficha_codigo": ficha["ficha_codigo"],
                "item": item,
                "resultado": r["_resultado"],
                "rodada": rodada,
                "observacao": observacao_de(r.get("Problem"), r.get("Solution")),
                "verificado_por": r.get("VerificadoPor") or None,
                "criado_em": quando.replace(".000Z", f".{mesma_data:03d}Z"),
                "origem_id": str(r["InspectionChklId"]),
            })
            anterior = r["_resultado"]

    lista = list(fichas.values())
    por_peca: dict[str, list[dict]] = collections.defaultdict(list)
    for f in lista:
        if f["elemento_id"]:
            por_peca[f["elemento_id"]].append(f)
    duplicadas = {k: v for k, v in por_peca.items() if len(v) > 1}
    for grupo in duplicadas.values():
        pendencias.append({"motivo": "ficha duplicada (as duas entraram)", "local": grupo[0]["local_construpoint"],
                           "ficha": " + ".join(sorted({f["ficha_codigo"] for f in grupo})),
                           "codigo": " + ".join(f["codigo"] for f in grupo), "status": " + ".join(f["status"] for f in grupo)})
    outro_tipo = [f for f in lista if f["elemento_id"] and not ficha_combina(f)]
    for f in outro_tipo:
        pendencias.append({"motivo": "ficha de outro tipo de peça (entrou como está)", "local": f["local_construpoint"],
                           "ficha": f["ficha_codigo"], "codigo": f["codigo"], "status": f["status"]})
    motivos = collections.Counter(p["motivo"] for p in pendencias)
    return {
        "obra": obra,
        "fichas_campo": lista,
        "eventos": eventos,
        "pendencias": pendencias,
        "resumo": {
            "fichas": len(lista),
            "fichas_com_peca": sum(1 for f in lista if f["elemento_id"]),
            "verificacoes_lidas": len(vistos),
            "eventos_na_planta": len(eventos),
            "pecas_com_ficha_duplicada": len(duplicadas),
            "pendencias": dict(motivos),
            "descartados": dict(descartados),
            "por_pessoa": dict(collections.Counter(e["verificado_por"] for e in eventos)),
            "por_resultado": dict(collections.Counter(e["resultado"] for e in eventos)),
            "status": dict(collections.Counter(f["status"] for f in lista)),
        },
    }


# Ficha de pilar e de viga da obra: vêm de --fichas-do-app (a 1ª é a de pilar, a 2ª a de viga).
# O padrão é o da obra de exemplo; nenhum código de empresa fica fixo aqui.
FICHA_DO_TIPO = {"P": "EXE-PVS-001", "V": "EXE-PVS-002"}


def ficha_combina(ficha: dict) -> bool:
    esperada = FICHA_DO_TIPO.get(ficha["tipo"])
    return esperada is None or ficha["ficha_codigo"] == esperada


def ler_pecas(pasta: pathlib.Path) -> dict[str, dict[str, dict[str, str]]]:
    pecas: dict[str, dict[str, dict[str, str]]] = {}
    for sub in sorted(p for p in pasta.iterdir() if p.is_dir()):
        rel = sub / "relatorio.json"
        if rel.exists():
            d = json.loads(rel.read_text(encoding="utf-8"))
            for p in d.get("pecas", []):
                pecas.setdefault(d["pavimento"], {}).setdefault(p["tipo"], {})[p["nome"].upper()] = p["id"]
    return pecas


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Monta o histórico da FVS a partir dos relatórios do Construpoint já salvos no PC.")
    ap.add_argument("pasta", help="pasta com cp_verificacoes.json, cp_inspecoes.json e cp_fichas.json")
    ap.add_argument("--pacotes", required=True, help="pasta dos pacotes de planta (de onde saem as peças)")
    ap.add_argument("--saida", required=True, help="arquivo do histórico (fora do repositório)")
    ap.add_argument("--obra", required=True, help="código da obra no app")
    ap.add_argument("--fichas-do-app", default="EXE-PVS-001,EXE-PVS-002", help="códigos das fichas com peça na planta: a de pilar, a de viga (e outras, se houver)")
    args = ap.parse_args(argv)
    codigos = [c.strip() for c in args.fichas_do_app.split(",") if c.strip()]
    FICHA_DO_TIPO.update(dict(zip(("P", "V"), codigos)))
    from exportar_obra import dentro_de_repositorio

    pasta, saida = pathlib.Path(args.pasta), pathlib.Path(args.saida).resolve()
    if dentro_de_repositorio(saida.parent):
        print("PROBLEMA: a saída está dentro de um repositório git: dado de obra não entra no repositório")
        return 1
    ler = lambda nome: json.loads((pasta / nome).read_text(encoding="utf-8"))
    try:
        itens: dict[str, list[str]] = {}
        for f in ler("cp_fichas.json"):
            if f.get("itens"):
                itens[f["codigo"]] = [i["texto"] for i in f["itens"]]
        h = montar(args.obra, linhas_de(ler("cp_verificacoes.json")), linhas_de(ler("cp_inspecoes.json")), itens,
                   ler_pecas(pathlib.Path(args.pacotes)), set(codigos))
    except (ErroImportacao, FileNotFoundError, KeyError) as e:
        print(f"PROBLEMA: {e}")
        return 1
    pendencias = h.pop("pendencias")
    saida.write_text(json.dumps(h, ensure_ascii=False), encoding="utf-8")
    csv_path = saida.with_name("pendencias_importacao.csv")
    with csv_path.open("w", encoding="utf-8-sig", newline="") as arq:  # BOM e ponto e vírgula: abre certo no Excel
        w = csv.DictWriter(arq, ["motivo", "local", "ficha", "codigo", "status"], delimiter=";")
        w.writeheader()
        w.writerows(sorted(pendencias, key=lambda p: (p["motivo"], p["local"])))
    print(json.dumps(h["resumo"], ensure_ascii=False, indent=1))
    print(f"Histórico: {saida}\nPendências: {csv_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

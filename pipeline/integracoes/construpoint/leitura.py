"""Leitura completa do Construpoint (pasta do PC) -> linhas do servidor (módulo FVS, contrato v1.7).

Lê a pasta de uma leitura já salva no PC (fora do repositório). NÃO acessa o Construpoint nem o servidor.
    cp_locais.json            árvore de locais (Work/ListLocationByWorkPlant)
    cp_mapa_fvs.json          Mapa de Inspeção: cada ficha com o LocalId e o código da ficha modelo
    cp_fvs_inspecoes.json     relatório "Inspeções por Modelo" (inspetor, parceiro, datas)
    cp_fvs_verificacoes.json  relatório "Verificações por Modelo", histórico completo

Regras (docs/02_CONTRATO_NUCLEO.md, "Dados lidos de um sistema oficial"):
- Todo local de lá vira uma linha de locais_sistema (id fixo, calculado do id de lá).
- Toda ficha aberta vira fvs_fichas_campo com local_id; a que é pilar ou viga da planta ganha também elemento_id.
- O item verificado só vira registro (fvs_eventos) quando a ficha tem peça na planta. Os demais ficam só nas
  contagens da ficha: nenhuma verificação só com local_id é publicada até a tela da FVS saber mostrar.
- As fichas modelo do servidor não mudam: o registro é ligado ao item da ficha vigente pelo texto do item.

Só biblioteca padrão: testado em pipeline/integracoes/construpoint/testes/test_construpoint_leitura.py.
"""

from __future__ import annotations

import collections
import json
import pathlib
import re
import unicodedata

import importar_construpoint as ic

SISTEMA = "construpoint"
ARQUIVOS = ("cp_locais.json", "cp_mapa_fvs.json", "cp_fvs_inspecoes.json", "cp_fvs_verificacoes.json")


def ler_pasta(pasta: pathlib.Path) -> dict:
    """Os quatro arquivos da leitura, já sem o envelope {"arquivo", "lido_em", "dados"}."""
    saida = {}
    for nome in ARQUIVOS:
        d = json.loads((pasta / nome).read_text(encoding="utf-8"))
        saida[nome] = d.get("dados", d) if isinstance(d, dict) and "dados" in d else d
        saida.setdefault("lido_em", d.get("lido_em") if isinstance(d, dict) else None)
    return saida


def _norm(texto: str | None) -> str:
    """Compara textos de item sem ligar para acento, caixa, espaço e pontuação."""
    t = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def texto_item_servidor(item: dict) -> str:
    """O item da ficha do servidor escrito como o Construpoint escreve: "(ETAPA) Título: descrição"."""
    etapa, titulo, desc = (str(item.get(k) or "").strip() for k in ("etapa", "titulo", "descricao"))
    texto = f"({etapa}) {titulo}" if etapa else titulo
    return f"{texto}: {desc}" if desc else texto


def indice_de_itens(fichas_servidor: dict[str, dict]) -> dict[str, dict[str, int]]:
    """{código: {texto normalizado: n}} das fichas vigentes do servidor."""
    return {cod: {_norm(texto_item_servidor(i)): int(i["n"]) for i in (f.get("itens") or [])}
            for cod, f in fichas_servidor.items()}


def nivel_de(nome_completo: str) -> int:
    return min(20, max(0, len([p for p in nome_completo.split("\\") if p.strip()]) - 1))


def linhas_locais(obra: str, locais: list[dict], elemento_do_local: dict[int, str] | None = None) -> list[dict]:
    """Linhas de locais_sistema. Nome vazio lá vira "(sem nome)" (o banco não aceita vazio)."""
    elemento_do_local = elemento_do_local or {}
    saida = []
    for l in locais:
        nome = (str(l.get("Name") or "").strip() or "(sem nome)")[:300]
        completo = (str(l.get("FullName") or "").strip() or nome)[:600]
        saida.append({
            "id": ic.novo_id(obra, "local", l["Id"]),
            "sistema": SISTEMA,
            "origem_id": str(l["Id"]),
            "origem_pai_id": str(l["ParentId"]) if l.get("ParentId") else None,
            "nome": nome,
            "nome_completo": completo,
            "nivel": nivel_de(completo),
            "apagado_no_sistema": bool(l.get("DeleteDate")),
            "elemento_id": elemento_do_local.get(l["Id"]),
        })
    return saida


def para_montar(dados: dict, itens_servidor: dict[str, dict[str, int]]) -> tuple[list[dict], list[dict], dict[str, list[str]], dict]:
    """Prepara as listas no formato do importar_construpoint.montar.

    O código da ficha modelo de cada ficha aberta vem do mapa (o relatório só traz o título). O texto de cada
    verificação é trocado pelo texto do item da ficha do servidor que bate com ele; o que não bate fica como veio
    (e o montar descarta como "item que não está na ficha").
    """
    mapa = {m["Id"]: m for m in dados["cp_mapa_fvs.json"]["inspection"]}
    inspecoes, sem_mapa = [], 0
    for f in dados["cp_fvs_inspecoes.json"]["data"]:
        m = mapa.get(f["Id"])
        if m is None:
            sem_mapa += 1
        inspecoes.append({**f, "_ficha_codigo": (m or {}).get("Identification") or f.get("Model") or "?",
                          "_local_id": (m or {}).get("LocalId")})
    codigo_da_ficha = {f["Id"]: f["_ficha_codigo"] for f in inspecoes}
    # lista de textos por ficha, na posição n (o montar numera pela posição na lista)
    itens_por_ficha: dict[str, list[str]] = {}
    for cod, por_texto in itens_servidor.items():
        lista = [f"\x00vazio {cod} {i}" for i in range(max(por_texto.values(), default=0))]
        for texto, n in por_texto.items():
            lista[n - 1] = texto
        itens_por_ficha[cod] = lista
    verificacoes, sem_item = [], collections.Counter()
    for v in dados["cp_fvs_verificacoes.json"]["data"]:
        cod = codigo_da_ficha.get(v["Id"])
        texto = _norm(v.get("Verificacoes"))
        if cod in itens_servidor and texto not in itens_servidor[cod]:
            sem_item[cod] += 1
        verificacoes.append({**v, "Verificacoes": texto})
    return verificacoes, inspecoes, itens_por_ficha, {"fichas_sem_mapa": sem_mapa, "verificacoes_sem_item": dict(sem_item)}


def pecas_do_servidor(pavimentos: list[dict], elementos: list[dict]) -> dict[str, dict[str, dict[str, str]]]:
    """{nome do pavimento: {tipo: {NOME: elementos.id}}} das peças publicadas (P e V)."""
    nome_pav = {p["id"]: p["nome"].strip() for p in pavimentos if not p.get("apagado")}
    pecas: dict[str, dict[str, dict[str, str]]] = {}
    for e in elementos:
        if e.get("apagado") or e.get("tipo") not in ("P", "V") or e.get("pavimento_id") not in nome_pav:
            continue
        pecas.setdefault(nome_pav[e["pavimento_id"]], {}).setdefault(e["tipo"], {})[e["nome"].upper()] = e["id"]
    return pecas


def montar_leitura(obra: str, dados: dict, fichas_servidor: dict[str, dict], pavimentos: list[dict],
                   elementos: list[dict], fichas_com_peca: set[str]) -> dict:
    """Tudo o que a leitura publica: locais, fichas de campo (com local_id e datas) e registros com peça."""
    itens = indice_de_itens(fichas_servidor)
    verificacoes, inspecoes, itens_por_ficha, avisos = para_montar(dados, itens)
    h = ic.montar(obra, verificacoes, inspecoes, itens_por_ficha, pecas_do_servidor(pavimentos, elementos), fichas_com_peca)
    por_cp = {f["Id"]: f for f in inspecoes}
    elemento_do_local: dict[int, str] = {}
    for f in h["fichas_campo"]:
        orig = por_cp[f["construpoint_id"]]
        f["local_id"] = ic.novo_id(obra, "local", orig["_local_id"]) if orig.get("_local_id") else None
        f["reinspecao_em"] = ic.data_utc(orig.get("ReinspectionDate"))
        f["medicao"] = (str(orig.get("MedicaoTitle") or "").strip() or None)
        if f["elemento_id"] and orig.get("_local_id"):
            elemento_do_local[orig["_local_id"]] = f["elemento_id"]
    locais = linhas_locais(obra, dados["cp_locais.json"], elemento_do_local)
    ids_locais = {l["id"] for l in locais}
    sem_local = 0
    for f in h["fichas_campo"]:
        if f["local_id"] not in ids_locais:
            f["local_id"], sem_local = None, sem_local + 1
    h["locais"] = locais
    h["resumo"].update({"locais": len(locais), "fichas_sem_local": sem_local, **avisos})
    return h

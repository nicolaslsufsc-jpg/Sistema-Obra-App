"""Importa a lista vigente do Autodoc (CSV da página Relatórios) para o Sistema Obra e imprime
a lista de ações do dia: Imprimir / Entregar / Recolher / Atualizar escritório / Conferir.

Uso (no PC, com internet):
    py pipeline/projetos/importar_lista.py EXE --csv "C:\\...\\05_revisoes_vigentes_autodoc_2026-11-03.csv"
    py pipeline/projetos/importar_lista.py EXE --pasta "C:\\...\\Exportacoes_Sistema_Obra\\autodoc"

Com --pasta, usa o CSV mais novo chamado 05_revisoes_vigentes_autodoc_AAAA-MM-DD.csv. Sem lista,
não conclui nada: avisa e sai com código 2 (regra 11 da rotina: nunca supor que não houve revisão).

Login: o mesmo do app (código por e-mail). A sessão fica guardada em %LOCALAPPDATA%\\SistemaObra
para as rodadas agendadas não pedirem código; com --sem-perguntar o script nunca pergunta nada
(sem login válido, sai com código 2). Sem chave secreta: grava o que o seu login pode gravar
(precisa ser gestor da obra ou admin).

O que grava: documentos, revisoes (novas e as que viraram obsoletas) e uma linha em listas_autodoc.
Nunca apaga nada. A mesma lista importada duas vezes não grava nada de novo.
Relatório: na tela e em relatorio_AAAA-MM-DD.txt ao lado do CSV.

Códigos de saída: 0 ok; 1 erro; 2 sem lista ou sem login.
Só biblioteca padrão do Python (3.9 ou mais novo).
"""

from __future__ import annotations

import argparse
import datetime as dt
import pathlib
import re
import sys
import urllib.parse
from dataclasses import dataclass, field

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent))

import acoes  # noqa: E402
import autodoc_csv  # noqa: E402
import sessao_local  # noqa: E402
from autodoc_csv import ErroLista, RevisaoLida  # noqa: E402
from exportar_obra import URL_PADRAO, CHAVE_PADRAO, ErroExportacao, Supabase  # noqa: E402

NOME_LISTA = re.compile(r"^05_revisoes_vigentes_autodoc_(\d{4}-\d{2}-\d{2})\.csv$", re.I)
FASES_CONHECIDAS = {"Liberado Obra": "LO", "Projeto Executivo": "EX"}
PAGINA_VIEW = 1000


class SemLista(Exception):
    """Sem lista do dia ou sem login: o script para sem concluir nada (código de saída 2)."""


# ---------------------------------------------------------------------------
# Parte pura (testada em pipeline/testes/test_importar_lista.py)
# ---------------------------------------------------------------------------

@dataclass
class Diferencas:
    documentos_novos: list[RevisaoLida] = field(default_factory=list)     # uma por chave nova
    revisoes_novas: list[tuple[RevisaoLida, str | None]] = field(default_factory=list)  # (lida, documento_id ou None se o documento é novo)
    obsoletas_novas: list[tuple[dict, RevisaoLida]] = field(default_factory=list)       # (linha do banco, lida)
    atualizacoes: list[tuple[dict, dict]] = field(default_factory=list)                 # (linha do banco, campos novos)


def _rank_fase(fase: str) -> int:
    return {"LO": 2, "EX": 1}.get(fase, 0)


def vigente_local(revs: list[dict]) -> dict | None:
    """Mesma regra da view revisoes_vigentes: LO > EX > outras; maior número; obsoleta não concorre."""
    candidatas = [r for r in revs if not r.get("apagado") and not r.get("obsoleta")]
    if not candidatas:
        return None
    return max(candidatas, key=lambda r: (_rank_fase(r["fase"]), r["numero"], r.get("cadastrada_em_autodoc") or ""))


def _rotulo(fase: str, numero: str) -> str:
    return f"{fase} R{numero}"


def _data_local(valor: dt.datetime | None) -> str | None:
    """Data do CSV (hora local, sem fuso) em ISO com o fuso deste PC, como o banco guarda."""
    return valor.astimezone().isoformat() if valor else None


def _mesma_data(existente_iso: str | None, lida: dt.datetime | None) -> bool:
    if existente_iso is None or lida is None:
        return existente_iso is None and lida is None
    try:
        existente = dt.datetime.fromisoformat(existente_iso.replace("Z", "+00:00"))
    except ValueError:
        return False
    return existente.astimezone(dt.timezone.utc) == lida.astimezone(dt.timezone.utc)


def _campos_revisao(lida: RevisaoLida) -> dict:
    return {
        "titulo": lida.titulo or None,
        "status_autodoc": lida.status or None,
        "obsoleta": lida.obsoleta,
        "data_obsoleta": _data_local(lida.data_obsoleta),
        "cadastrada_em_autodoc": _data_local(lida.cadastrada_em),
        "cadastrada_por": lida.cadastrada_por or None,
        "atualizada_em_autodoc": _data_local(lida.atualizada_em),
        "extensoes": lida.extensoes,
    }


def calcular_diferencas(lidas: list[RevisaoLida], documentos: list[dict], revisoes: list[dict]) -> Diferencas:
    """Compara a lista lida com o que o banco já tem (listas de dicionários como o PostgREST devolve)."""
    d = Diferencas()
    doc_por_codigo = {x["codigo"]: x for x in documentos if not x.get("apagado")}
    rev_por_chave = {(r["documento_id"], r["fase"], r["numero"]): r for r in revisoes if not r.get("apagado")}
    vistos: set[str] = set()
    for lida in lidas:
        doc = doc_por_codigo.get(lida.chave)
        if doc is None:
            if lida.chave not in vistos:
                vistos.add(lida.chave)
                d.documentos_novos.append(lida)
            d.revisoes_novas.append((lida, None))
            continue
        existente = rev_por_chave.get((doc["id"], lida.fase, lida.numero))
        if existente is None:
            d.revisoes_novas.append((lida, doc["id"]))
            continue
        mudancas = {}
        if (existente.get("titulo") or None) != (lida.titulo or None):
            mudancas["titulo"] = lida.titulo or None
        if (existente.get("status_autodoc") or None) != (lida.status or None):
            mudancas["status_autodoc"] = lida.status or None
        if bool(existente.get("obsoleta")) != lida.obsoleta:
            mudancas["obsoleta"] = lida.obsoleta
            if lida.obsoleta:
                d.obsoletas_novas.append((existente, lida))
        if not _mesma_data(existente.get("data_obsoleta"), lida.data_obsoleta):
            mudancas["data_obsoleta"] = _data_local(lida.data_obsoleta)
        if (existente.get("extensoes") or "") != lida.extensoes:
            mudancas["extensoes"] = lida.extensoes
        if mudancas:
            d.atualizacoes.append((existente, mudancas))
    return d


def data_da_lista(nome_arquivo: str, emitida_em: dt.datetime | None) -> dt.date:
    m = NOME_LISTA.match(pathlib.Path(nome_arquivo).name)
    if m:
        return dt.date.fromisoformat(m.group(1))
    if emitida_em:
        return emitida_em.date()
    return dt.date.today()


def escolher_csv(args) -> pathlib.Path:
    if args.csv:
        caminho = pathlib.Path(args.csv)
        if not caminho.is_file():
            raise SemLista(f"Não achei a lista {caminho}. Sem a lista do dia não dá para dizer se houve revisão nova.")
        return caminho
    pasta = pathlib.Path(args.pasta.strip('"'))  # aspas sobrando de uma linha de comando do Windows
    candidatos = sorted(p for p in pasta.glob("05_revisoes_vigentes_autodoc_*.csv") if NOME_LISTA.match(p.name))
    if not candidatos:
        raise SemLista(
            f"Nenhuma lista 05_revisoes_vigentes_autodoc_AAAA-MM-DD.csv em {pasta}. "
            "Exporte a lista do Autodoc (Relatórios > Exportar CSV) e salve na pasta."
        )
    escolhido = candidatos[-1]
    if data_da_lista(escolhido.name, None) < dt.date.today() and not args.aceitar_antiga:
        raise SemLista(
            f"A lista mais nova é de {data_da_lista(escolhido.name, None):%d/%m/%Y} ({escolhido.name}); não há lista de hoje. "
            "Exporte a de hoje ou rode com --aceitar-antiga."
        )
    return escolhido


# ---------------------------------------------------------------------------
# Servidor
# ---------------------------------------------------------------------------

def entrar(sb: Supabase, args) -> str | None:
    sessao = sessao_local.carregar_sessao()
    if sessao:
        sb.refresh_token = sessao["refresh_token"]
        try:
            sb.renovar()
            sessao_local.guardar_sessao(sb.refresh_token, sessao.get("email"))
            return sessao.get("email")
        except ErroExportacao as e:
            print(f"O login guardado venceu ({e}).")
            sessao_local.esquecer_sessao()
    if args.sem_perguntar:
        raise SemLista("Sem login válido. Rode o script uma vez na mão (sem --sem-perguntar) e digite o código do e-mail.")
    email = (args.email or input("Seu e-mail do app: ")).strip()
    print(f"Enviando o código para {email}...")
    sb.entrar(email, lambda: input("Código que chegou por e-mail: "))
    sessao_local.guardar_sessao(sb.refresh_token, email)
    return email


def todas(sb: Supabase, caminho: str, filtros: dict[str, str]) -> list[dict]:
    """Todas as linhas de uma view (sem coluna id), em páginas por offset."""
    linhas: list[dict] = []
    offset = 0
    while True:
        params = dict(filtros)
        params.update({"select": "*", "limit": str(PAGINA_VIEW), "offset": str(offset)})
        pagina = sb.json("GET", f"/rest/v1/{caminho}?{urllib.parse.urlencode(params)}")
        linhas.extend(pagina)
        if len(pagina) < PAGINA_VIEW:
            return linhas
        offset += PAGINA_VIEW


def obra_por_codigo(sb: Supabase, codigo: str) -> dict:
    linhas = sb.json("GET", f"/rest/v1/obras?{urllib.parse.urlencode({'codigo': f'eq.{codigo}', 'select': 'id,codigo,nome'})}")
    if not linhas:
        raise ErroExportacao(f"Obra {codigo} não existe ou o seu login não tem acesso a ela.")
    return linhas[0]


def gravar(sb: Supabase, obra_id: str, dif: Diferencas, data_lista: dt.date, dispositivo: str) -> dict[str, str]:
    """Grava documentos e revisões novas e as alterações. Devolve chave -> documento_id dos documentos novos."""
    agora = dt.datetime.now().astimezone().isoformat()
    base = {"obra_id": obra_id, "dispositivo_id": dispositivo, "criado_em_dispositivo": agora}
    ids: dict[str, str] = {}
    if dif.documentos_novos:
        corpo = [dict(base, codigo=l.chave, disciplina_sigla=l.disciplina, disciplina=l.disciplina_nome or None,
                      numero=l.numero_documento, nome_curto=l.nome, titulo=l.titulo or None,
                      pasta_autodoc=l.pasta or None, link_pasta=l.link_pasta or None)
                 for l in dif.documentos_novos]
        criados = sb.json("POST", "/rest/v1/documentos", corpo, {"Prefer": "return=representation"})
        ids = {c["codigo"]: c["id"] for c in criados}
    if dif.revisoes_novas:
        corpo = []
        for lida, documento_id in dif.revisoes_novas:
            documento_id = documento_id or ids[lida.chave]
            corpo.append(dict(base, documento_id=documento_id, fase=lida.fase, numero=lida.numero,
                              vista_em=data_lista.isoformat(), **_campos_revisao(lida)))
        sb.json("POST", "/rest/v1/revisoes", corpo, {"Prefer": "return=minimal"})
    for existente, mudancas in dif.atualizacoes:
        sb.json("PATCH", f"/rest/v1/revisoes?{urllib.parse.urlencode({'id': 'eq.' + existente['id']})}", mudancas,
                {"Prefer": "return=minimal"})
    return ids


def registrar_lista(sb: Supabase, obra_id: str, caminho: pathlib.Path, data_lista: dt.date, lista, dif: Diferencas,
                    dispositivo: str, resultado: str) -> None:
    corpo = {
        "obra_id": obra_id, "dispositivo_id": dispositivo, "criado_em_dispositivo": dt.datetime.now().astimezone().isoformat(),
        "data_lista": data_lista.isoformat(), "arquivo": caminho.name, "emitida_em": _data_local(lista.emitida_em),
        "linhas": len(lista.arquivos) + len(lista.invalidos), "documentos_novos": len(dif.documentos_novos),
        "revisoes_novas": len(dif.revisoes_novas), "obsoletas_novas": len(dif.obsoletas_novas),
        "conferir": len(lista.invalidos), "resultado": resultado[:4000],
    }
    sb.json("POST", "/rest/v1/listas_autodoc", corpo, {"Prefer": "return=minimal"})


def lista_ja_importada(sb: Supabase, obra_id: str, caminho: pathlib.Path, data_lista: dt.date) -> dict | None:
    params = {"obra_id": f"eq.{obra_id}", "data_lista": f"eq.{data_lista.isoformat()}", "arquivo": f"eq.{caminho.name}",
              "select": "id,criado_em_servidor,resultado"}
    linhas = sb.json("GET", f"/rest/v1/listas_autodoc?{urllib.parse.urlencode(params)}")
    return linhas[0] if linhas else None


def montar_relatorio_do_banco(sb: Supabase, obra_id: str, novas_lidas: list[tuple[RevisaoLida, str | None]],
                              anteriores: dict[str, str | None], lista, avisos: list[str], agora: dt.datetime) -> str:
    documentos = sb.linhas("documentos", {"obra_id": f"eq.{obra_id}", "apagado": "eq.false"})
    revisoes = sb.linhas("revisoes", {"obra_id": f"eq.{obra_id}", "apagado": "eq.false"})
    empresas = sb.linhas("empresas", {"obra_id": f"eq.{obra_id}"})
    situacao = todas(sb, "situacao_distribuicao", {"obra_id": f"eq.{obra_id}"})
    escritorio = todas(sb, "documentos_escritorio", {"obra_id": f"eq.{obra_id}"})
    vigentes = {v["documento_id"]: v for v in todas(sb, "revisoes_vigentes", {"obra_id": f"eq.{obra_id}"})}

    codigo_por_doc = {d["id"]: d["codigo"] for d in documentos}
    nome_empresa = {e["id"]: e["nome"] for e in empresas}
    rotulo_rev = {r["id"]: _rotulo(r["fase"], r["numero"]) for r in revisoes}

    novas = [{
        "chave": lida.chave, "titulo": lida.titulo, "disciplina": lida.disciplina_nome or lida.disciplina,
        "fase": lida.fase, "numero": lida.numero, "anterior": anteriores.get(lida.chave),
        "cadastrada_em": lida.cadastrada_em, "cadastrada_por": lida.cadastrada_por,
        "link_pasta": lida.link_pasta, "observacoes": lida.observacoes,
    } for lida, _ in novas_lidas if not lida.obsoleta]

    situacoes = [{
        "chave": codigo_por_doc.get(s["documento_id"], s["documento_id"]),
        "empresa": nome_empresa.get(s["empresa_id"], s["empresa_id"]),
        "situacao": s["situacao"],
        "revisao_em_campo": rotulo_rev.get(s.get("revisao_em_campo_id")),
        "revisao_vigente": rotulo_rev.get(s.get("revisao_vigente_id")),
        "entregas_abertas": s.get("entregas_abertas") or 0,
    } for s in situacao]

    escritorio_linhas = [{
        "chave": codigo_por_doc.get(e["documento_id"], e["documento_id"]),
        "revisao_escritorio": rotulo_rev.get(e.get("revisao_id")),
        "revisao_vigente": rotulo_rev.get((vigentes.get(e["documento_id"]) or {}).get("id")),
        "atualizado": bool(e.get("atualizado")),
    } for e in escritorio]

    return acoes.montar_relatorio(agora, novas, situacoes, escritorio_linhas, list(lista.invalidos), avisos)


def importar(args) -> int:
    caminho = escolher_csv(args)
    lista = autodoc_csv.ler_lista(caminho)
    data_lista = data_da_lista(caminho.name, lista.emitida_em)
    todas_lidas = autodoc_csv.agrupar_revisoes(lista.arquivos)
    lidas = [r for r in todas_lidas if r.obra == args.obra.upper()]
    avisos: list[str] = []
    outras = len(todas_lidas) - len(lidas)
    if outras:
        avisos.append(f"{outras} revisão(ões) de outra obra no relatório foram ignoradas (o código não começa com {args.obra.upper()}).")
    for r in lidas:
        esperada = FASES_CONHECIDAS.get(r.fase_nome)
        if esperada and esperada != r.fase:
            avisos.append(f"{r.chave} R{r.numero}: a pasta diz {r.fase_nome} mas o nome do arquivo diz {r.fase}.")
    print(f"Lista {caminho.name} ({data_lista:%d/%m/%Y}): {len(lista.arquivos)} arquivos, {len(lidas)} revisões, "
          f"{len(lista.invalidos)} fora do padrão.")

    sb = Supabase(args.url, args.chave)
    email = entrar(sb, args)
    obra = obra_por_codigo(sb, args.obra.upper())
    obra_id = obra["id"]
    dispositivo = sessao_local.dispositivo_id()

    documentos = sb.linhas("documentos", {"obra_id": f"eq.{obra_id}"})
    revisoes = sb.linhas("revisoes", {"obra_id": f"eq.{obra_id}"})
    dif = calcular_diferencas(lidas, documentos, revisoes)

    # Revisão vigente de cada documento ANTES desta lista (para "anterior -> nova").
    por_doc: dict[str, list[dict]] = {}
    for r in revisoes:
        por_doc.setdefault(r["documento_id"], []).append(r)
    id_por_codigo = {d["codigo"]: d["id"] for d in documentos if not d.get("apagado")}
    anteriores: dict[str, str | None] = {}
    for lida, documento_id in dif.revisoes_novas:
        v = vigente_local(por_doc.get(documento_id or id_por_codigo.get(lida.chave) or "", []))
        anteriores[lida.chave] = _rotulo(v["fase"], v["numero"]) if v else None

    print(f"Mudanças: {len(dif.documentos_novos)} documento(s) novo(s), {len(dif.revisoes_novas)} revisão(ões) nova(s), "
          f"{len(dif.obsoletas_novas)} que viraram obsoletas, {len(dif.atualizacoes)} atualização(ões).")

    ja = lista_ja_importada(sb, obra_id, caminho, data_lista)
    agora = dt.datetime.now()
    if ja:
        quando = ja.get("criado_em_servidor") or "outra rodada"
        print(f"Esta lista já foi importada ({quando}). Nada gravado de novo; segue o relatório do banco.")
        relatorio = montar_relatorio_do_banco(sb, obra_id, [], {}, lista, avisos, agora)
    elif args.sem_gravar:
        print("--sem-gravar: nada foi gravado.")
        for l in dif.documentos_novos:
            print(f"  documento novo: {l.chave}")
        for lida, _ in dif.revisoes_novas:
            print(f"  revisão nova: {lida.chave} {_rotulo(lida.fase, lida.numero)} (anterior: {anteriores.get(lida.chave) or 'nenhuma'})")
        for existente, lida in dif.obsoletas_novas:
            print(f"  virou obsoleta: {lida.chave} {_rotulo(lida.fase, lida.numero)}")
        relatorio = montar_relatorio_do_banco(sb, obra_id, dif.revisoes_novas, anteriores, lista, avisos, agora)
    else:
        gravar(sb, obra_id, dif, data_lista, dispositivo)
        relatorio = montar_relatorio_do_banco(sb, obra_id, dif.revisoes_novas, anteriores, lista, avisos, agora)
        registrar_lista(sb, obra_id, caminho, data_lista, lista, dif, dispositivo, relatorio.split("\n", 1)[0])

    if sb.refresh_token:
        sessao_local.guardar_sessao(sb.refresh_token, email)

    print()
    print(relatorio)
    destino = caminho.with_name(f"relatorio_{data_lista.isoformat()}.txt")
    try:
        destino.write_text(relatorio + "\n", encoding="utf-8")
        print(f"\nRelatório salvo em {destino}")
    except OSError as e:
        print(f"\n(não consegui salvar o relatório em {destino}: {e})")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Importa a lista vigente do Autodoc e imprime a lista de ações.")
    p.add_argument("obra", help="código da obra no Sistema Obra (ex.: EXE)")
    origem = p.add_mutually_exclusive_group(required=True)
    origem.add_argument("--csv", help="arquivo CSV exportado do Autodoc")
    origem.add_argument("--pasta", help="pasta com os CSV 05_revisoes_vigentes_autodoc_AAAA-MM-DD.csv (usa o mais novo)")
    p.add_argument("--aceitar-antiga", action="store_true", help="com --pasta, aceita uma lista que não é de hoje")
    p.add_argument("--sem-gravar", action="store_true", help="só mostra o que mudaria; não grava nada")
    p.add_argument("--sem-perguntar", action="store_true", help="nunca pede e-mail nem código (rodadas agendadas)")
    p.add_argument("--email", help="e-mail do login (senão pergunta)")
    p.add_argument("--url", default=URL_PADRAO)
    p.add_argument("--chave", default=CHAVE_PADRAO, help="chave pública (publishable) do Supabase")
    args = p.parse_args(argv)
    # Saída redirecionada para arquivo no Windows vem em cp1252, que não tem "→": força UTF-8.
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    try:
        return importar(args)
    except SemLista as e:
        print(f"PARADO: {e}")
        return 2
    except (ErroLista, ErroExportacao) as e:
        print(f"ERRO: {e}")
        return 1
    except KeyboardInterrupt:
        print("\nInterrompido.")
        return 1


if __name__ == "__main__":
    sys.exit(main())

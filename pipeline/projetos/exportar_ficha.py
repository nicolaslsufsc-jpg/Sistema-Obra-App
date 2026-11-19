"""Exporta a ficha de controle de cópias (CSV para o Excel em português) direto do servidor,
sem abrir o app: uma linha por entrega, com a devolução e a situação na mesma linha.

Uso (no PC, com internet):
    py pipeline/projetos/exportar_ficha.py EXE --saida "C:\\...\\Exportacoes_Sistema_Obra\\projetos"

Mesmo login do app (código por e-mail), sessão guardada como no importar_lista.py. Gera
ficha-copias-EXE_AAAA-MM-DD.csv (separador ";", datas dd/mm/aaaa, texto que começa com =, +, -, @
recebe apóstrofo). Mesmas colunas da exportação feita pelo app (app/src/projetos/ficha.ts).
Códigos de saída: 0 ok; 1 erro; 2 sem login.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import pathlib
import sys
import urllib.parse

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent))

from exportar_obra import URL_PADRAO, CHAVE_PADRAO, ErroExportacao, Supabase  # noqa: E402
from importar_lista import SemLista, entrar, obra_por_codigo, todas  # noqa: E402

COLUNAS = (
    "Data entrega", "Empresa", "Colaborador", "Código Autodoc", "Fase", "Revisão", "Data devolução", "Situação",
    "Revisão vigente", "Observação",
)


def data_br(valor) -> str:
    if not valor:
        return ""
    s = str(valor)[:10]
    a, m, d = s.split("-")
    return f"{d}/{m}/{a}"


def valor_csv(v) -> str:
    s = "" if v is None else str(v)
    if s[:1] in ("=", "+", "-", "@"):
        s = "'" + s
    return s


def rotulo(rev: dict | None) -> str:
    return f"{rev['fase']} R{rev['numero']}" if rev else ""


def montar_ficha(documentos: list[dict], revisoes: list[dict], empresas: list[dict], eventos: list[dict],
                 situacoes: list[dict], vigentes: list[dict]) -> str:
    """Monta o CSV a partir das linhas do servidor (listas de dicionários)."""
    doc = {d["id"]: d for d in documentos}
    rev = {r["id"]: r for r in revisoes}
    emp = {e["id"]: e for e in empresas}
    vig = {v["documento_id"]: v for v in vigentes}
    sit = {(s["empresa_id"], s["documento_id"]): s for s in situacoes}
    devolucao_da = {e["entrega_id"]: e for e in eventos if e.get("tipo") == "devolucao" and not e.get("apagado")}

    linhas = []
    for e in eventos:
        if e.get("tipo") != "entrega" or e.get("apagado"):
            continue
        dev = devolucao_da.get(e["id"])
        s = sit.get((e["empresa_id"], e["documento_id"]))
        d = doc.get(e["documento_id"], {})
        r = rev.get(e["revisao_id"])
        nome_emp = emp.get(e["empresa_id"], {}).get("nome", e["empresa_id"])
        obs = " / ".join(x for x in (e.get("observacao"), dev.get("observacao") if dev else None) if x)
        linhas.append((
            f"{nome_emp}|{d.get('codigo', '')}|{e.get('data_evento', '')}",
            [
                data_br(e.get("data_evento")), nome_emp, e.get("colaborador") or "", d.get("codigo", e["documento_id"]),
                r["fase"] if r else "", f"R{r['numero']}" if r else "", data_br(dev.get("data_evento")) if dev else "",
                "DEVOLVIDO" if dev else (s["situacao"] if s else ""), rotulo(vig.get(e["documento_id"])), obs,
            ],
        ))
    linhas.sort(key=lambda x: x[0])
    saida = io.StringIO()
    w = csv.writer(saida, delimiter=";", lineterminator="\r\n", quoting=csv.QUOTE_MINIMAL)
    w.writerow(COLUNAS)
    for _, campos in linhas:
        w.writerow([valor_csv(c) for c in campos])
    return "\ufeff" + saida.getvalue()


def exportar(args) -> int:
    sb = Supabase(args.url, args.chave)
    entrar(sb, args)
    obra = obra_por_codigo(sb, args.obra.upper())
    obra_id = obra["id"]
    f = {"obra_id": f"eq.{obra_id}"}
    texto = montar_ficha(
        sb.linhas("documentos", f), sb.linhas("revisoes", f), sb.linhas("empresas", f),
        sb.linhas("distribuicao_eventos", f), todas(sb, "situacao_distribuicao", f), todas(sb, "revisoes_vigentes", f),
    )
    pasta = pathlib.Path(args.saida)
    pasta.mkdir(parents=True, exist_ok=True)
    destino = pasta / f"ficha-copias-{obra['codigo']}_{dt.date.today().isoformat()}.csv"
    destino.write_text(texto, encoding="utf-8", newline="")
    n = texto.count("\r\n") - 1
    print(f"Ficha salva: {destino} ({n} entrega(s)).")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Exporta a ficha de controle de cópias em CSV.")
    p.add_argument("obra", help="código da obra no Sistema Obra (ex.: EXE)")
    p.add_argument("--saida", required=True, help="pasta de saída (fora do repositório)")
    p.add_argument("--sem-perguntar", action="store_true", help="nunca pede e-mail nem código")
    p.add_argument("--email")
    p.add_argument("--url", default=URL_PADRAO)
    p.add_argument("--chave", default=CHAVE_PADRAO)
    args = p.parse_args(argv)
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    try:
        return exportar(args)
    except SemLista as e:
        print(f"PARADO: {e}")
        return 2
    except ErroExportacao as e:
        print(f"ERRO: {e}")
        return 1
    except KeyboardInterrupt:
        print("\nInterrompido.")
        return 1


if __name__ == "__main__":
    sys.exit(main())

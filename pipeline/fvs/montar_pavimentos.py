"""Monta um pavimento.json por pavimento a partir das pranchas de estrutura baixadas do Autodoc.

Uso (no PC):
    py pipeline/fvs/montar_pavimentos.py "C:\\...\\Autodoc EXE\\Estrutura" --obra EXE --saida "C:\\...\\pavimentos"

A pasta de estrutura tem as subpastas Formas, Pilares e Vigas, com os PDFs nomeados pelo código
do Autodoc (ex.: EXE.ES.LO.129.FOR3PAVTIP-R03.pdf). Em Formas, o indice.csv dá o título de cada
prancha, de onde sai o trecho ("FORMA DO 3 PAVTO TIPO - TRECHO 1"). O trecho vale o do Autodoc,
não o do carimbo (a prancha EX.145 tem o carimbo errado).

Se houver mais de uma revisão da mesma folha, vale a regra do Autodoc: LO vale mais que EX, mesmo
com número menor; dentro da mesma etapa vale o maior RXX.

Prancha de detalhe de pilar entra no pavimento do nome do arquivo e também no que o carimbo diz
("Planta: Térreo Comercial"): na obra piloto, 18 pranchas chamadas PILPILOTIS são do Térreo Comercial, e o
lance delas (do Subsolo ao Pilotis) passa pelos dois. Ler o carimbo precisa de pymupdf; sem ele, o
script avisa e usa só o nome.

A montagem é só biblioteca padrão: testada em pipeline/testes/test_fvs_pacote.py.
"""

from __future__ import annotations

import argparse
import csv
import json
import pathlib
import re
import sys

RE_CODIGO = re.compile(r"^(?P<obra>[A-Z0-9]+)\.(?P<disc>[A-Z]+)\.(?P<etapa>[A-Z]+)\.(?P<folha>\d+)\.(?P<nome>[A-Z0-9]+)-R(?P<rev>\d+)$")
RE_TRECHO = re.compile(r"TRECHO\s*(\d+)", re.I)

# Último pedaço do nome do documento no Autodoc -> nome do pavimento cadastrado na obra.
# (FOR/PIL/VIG + pavimento; os nomes do Autodoc têm 10 letras e variam entre as disciplinas.)
PAVIMENTOS = [
    (re.compile(r"SUBSOLO"), "Subsolo", 1),
    (re.compile(r"TERREO|COMERCI"), "Térreo Comercial", 2),
    (re.compile(r"PILOTIS"), "Pilotis", 3),
    (re.compile(r"MEZANIN"), "Mezanino", 4),
    (re.compile(r"2PAVTIP"), "2º Pavimento", 5),
    (re.compile(r"3PAVTIP"), "3º Pavimento", 6),
    (re.compile(r"4PAVTIP"), "4º Pavimento", 7),
    (re.compile(r"5PAVTIP"), "5º Pavimento", 8),
    (re.compile(r"6PAVTIP"), "6º Pavimento", 9),
    (re.compile(r"COBERTU"), "Cobertura", 10),
]


class ErroPavimentos(Exception):
    pass


def ler_codigo(codigo: str) -> dict | None:
    m = RE_CODIGO.match(codigo)
    if not m:
        return None
    d = m.groupdict()
    return {"codigo": codigo, "etapa": d["etapa"], "folha": int(d["folha"]), "nome": d["nome"], "rev": int(d["rev"])}


def pavimento_do_nome(nome: str) -> str | None:
    for rx, pav, _ in PAVIMENTOS:
        if rx.search(nome):
            return pav
    return None


def pavimento_do_carimbo(texto: str) -> str | None:
    """"Planta: 4°Pavto Tipo" -> "4º Pavimento"; "Planta: Térreo Comercial" -> "Térreo Comercial"."""
    m = re.match(r"\s*planta:\s*(.+)$", texto, re.I)
    if not m:
        return None
    nome = m.group(1).strip()
    tipo = re.match(r"(\d)\s*[°ºo]?\s*pavto", nome, re.I)
    if tipo:
        return f"{tipo.group(1)}º Pavimento"
    limpo = nome.lower().replace("é", "e")
    for chave, pav in (("subsolo", "Subsolo"), ("terreo", "Térreo Comercial"), ("pilotis", "Pilotis"), ("mezanino", "Mezanino"), ("cobertura", "Cobertura")):
        if chave in limpo:
            return pav
    return None


def ordem_do_pavimento(nome: str) -> int:
    return next((o for _, p, o in PAVIMENTOS if p == nome), 99)


def _peso(c: dict) -> tuple:
    # LO vale mais que EX; dentro da etapa, o maior RXX
    return (1 if c["etapa"] == "LO" else 0, c["rev"])


def vigentes(codigos: list[str]) -> list[dict]:
    """A revisão vigente de cada folha. Código fora do padrão fica de fora."""
    por_folha: dict[tuple[str, int], dict] = {}
    for cod in codigos:
        c = ler_codigo(cod)
        if not c:
            continue
        chave = (c["nome"], c["folha"])
        if chave not in por_folha or _peso(c) > _peso(por_folha[chave]):
            por_folha[chave] = c
    return sorted(por_folha.values(), key=lambda c: c["folha"])


def montar(formas: list[str], titulos: dict[str, str], pilares: list[str], vigas: list[str], obra: str,
           carimbos: dict[str, str] | None = None) -> dict[str, dict]:
    """{pavimento: dados do pavimento.json}. Caminhos ficam como o código + .pdf, relativos às subpastas.
    carimbos: código da prancha de detalhe -> pavimento escrito no carimbo."""
    saida: dict[str, dict] = {}
    # uma folha de forma de cada trecho: aqui a folha repetida é outra etapa da mesma prancha
    for c in vigentes(formas):
        pav = pavimento_do_nome(c["nome"])
        if not pav:
            continue
        m = RE_TRECHO.search(titulos.get(c["codigo"], ""))
        if not m:
            raise ErroPavimentos(f"{c['codigo']}: não achei o trecho no título do Autodoc ({titulos.get(c['codigo'])!r})")
        d = saida.setdefault(pav, {"obra": obra, "pavimento": pav, "formas": [], "det_pilares": [], "det_vigas": []})
        d["formas"].append({"trecho": f"Trecho {int(m.group(1))}", "pdf": f"Formas/{c['codigo']}.pdf"})
    for lista, campo, pasta in ((pilares, "det_pilares", "Pilares"), (vigas, "det_vigas", "Vigas")):
        for c in vigentes(lista):
            pavs = [pavimento_do_nome(c["nome"]), (carimbos or {}).get(c["codigo"])]
            for pav in dict.fromkeys(pavs):  # sem repetir, na ordem
                if pav in saida:
                    saida[pav][campo].append(f"{pasta}/{c['codigo']}.pdf")
    for d in saida.values():
        trechos = [f["trecho"] for f in d["formas"]]
        if len(set(trechos)) != len(trechos):
            raise ErroPavimentos(f"{d['pavimento']}: trecho repetido nas formas: {sorted(trechos)}")
        d["formas"].sort(key=lambda f: int(f["trecho"].split()[1]))
    return dict(sorted(saida.items(), key=lambda kv: ordem_do_pavimento(kv[0])))


def nome_de_arquivo(pavimento: str) -> str:
    base = pavimento.lower().replace("º", "").replace(" ", "_").replace("é", "e")
    return f"{ordem_do_pavimento(pavimento):02d}_{base}.json"


def _pdfs(pasta: pathlib.Path) -> list[str]:
    return sorted(p.stem for p in pasta.glob("*.pdf")) if pasta.is_dir() else []


def ler_carimbos(pasta: pathlib.Path) -> dict[str, str]:
    """Código da prancha -> pavimento do carimbo. Só as pranchas que têm "Planta: ..." escrito."""
    try:
        import pymupdf
    except ImportError:
        print("Aviso: sem pymupdf, as pranchas de detalhe entram só pelo nome do arquivo.")
        return {}
    carimbos: dict[str, str] = {}
    for pdf in sorted(pasta.glob("*.pdf")):
        with pymupdf.open(pdf) as doc:
            for a in doc[0].annots() or []:
                pav = pavimento_do_carimbo((a.info.get("content") or "").strip())
                if pav:
                    carimbos[pdf.stem] = pav
                    break
    return carimbos


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Monta um pavimento.json por pavimento.")
    ap.add_argument("pasta", help="pasta com as subpastas Formas, Pilares e Vigas")
    ap.add_argument("--obra", required=True)
    ap.add_argument("--saida", required=True, help="onde gravar os pavimento.json (fora do repositório)")
    args = ap.parse_args(argv)
    base = pathlib.Path(args.pasta).resolve()
    titulos: dict[str, str] = {}
    with open(base / "Formas" / "indice.csv", encoding="utf-8-sig", newline="") as f:
        for linha in csv.DictReader(f, delimiter=";"):
            titulos[linha["codigo"]] = linha["titulo"]
    try:
        pavs = montar(_pdfs(base / "Formas"), titulos, _pdfs(base / "Pilares"), _pdfs(base / "Vigas"), args.obra.upper(),
                      ler_carimbos(base / "Pilares"))
    except ErroPavimentos as e:
        print(f"PROBLEMA: {e}")
        return 1
    saida = pathlib.Path(args.saida)
    saida.mkdir(parents=True, exist_ok=True)
    for pav, d in pavs.items():
        # caminho absoluto: o pavimento.json fica noutra pasta
        d = {**d, "formas": [{**f, "pdf": str(base / f["pdf"])} for f in d["formas"]],
             "det_pilares": [str(base / x) for x in d["det_pilares"]], "det_vigas": [str(base / x) for x in d["det_vigas"]]}
        (saida / nome_de_arquivo(pav)).write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{pav}: {len(d['formas'])} trechos, {len(d['det_pilares'])} pranchas de pilares, {len(d['det_vigas'])} de vigas")
    return 0


if __name__ == "__main__":
    sys.exit(main())

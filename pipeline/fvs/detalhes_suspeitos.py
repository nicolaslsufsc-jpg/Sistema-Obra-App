"""Lista, por pavimento, as peças da FVS cujo detalhe pode estar errado e as peças sem detalhe.

Só lê: os pavimento.json (saída de montar_pavimentos.py), os manifest.json dos pacotes gerados
(publicar_planta.py --so-gerar) e as pranchas de detalhe em PDF. Não muda nenhum pacote.

    py pipeline/fvs/detalhes_suspeitos.py <pasta dos pavimento.json> <pasta dos pacotes> <saída.csv>

Suspeitas de cada peça (pilar ou viga) que tem detalhe:
  - varias_pranchas: o nome aparece em mais de uma prancha de detalhe lida para o pavimento. O
    gerador guarda um detalhe por nome e vale o último lido (gerador_fvs.detalhes_pilares).
  - titulo_diferente: o título do detalhe usado não traz o nome da peça.
  - outro_pavimento: a prancha do detalhe usado é, pelo nome, de outro pavimento (entrou pelo carimbo).
  - lance_diferente (pilares): os níveis escritos no quadro do detalhe (ex.: "Fundação", "Subsolo")
    não chegam ao pavimento. O pilar do pavimento é o de baixo: o detalhe tem de terminar nele.
  - quadro_pequeno (pilares): o detalhe está num quadro com menos de 200 de altura, que o gerador
    ignora; ele recorta pelo desenho em volta do primeiro rótulo com o nome, que pode ser outro.
  - sem_quadro (pilares): o nome não está dentro de quadro nenhum; recorte pelo desenho.
A seção do detalhe só existe como desenho (não como texto) nas pranchas da obra piloto, por isso a
comparação com a seção da forma fica para a conferência humana: as duas colunas saem lado a lado.

Também sai uma linha "sem_detalhe" para cada pilar ou viga da forma sem detalhe no pavimento (item 1).
"""

from __future__ import annotations

import csv
import json
import pathlib
import re
import sys

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "legado"))
sys.path.insert(0, str(AQUI))

from lances import nome_do_nivel, ordem_do_nivel  # noqa: E402,F401
from montar_pavimentos import PAVIMENTOS, ler_codigo, pavimento_do_nome  # noqa: E402


def pavimento_da_prancha(prancha: str) -> str | None:
    c = ler_codigo(prancha)
    return pavimento_do_nome(c["nome"]) if c else None


def ler_ocorrencias(pdfs: list[str], viga: bool) -> dict[str, list[dict]]:
    """nome -> onde aparece como detalhe: prancha, título do quadro e níveis escritos nele."""
    import gerador_fvs as legado
    import pymupdf as fitz

    rx = legado.RE_LISTA_V if viga else legado.RE_LISTA_P
    out: dict[str, list[dict]] = {}
    for caminho in pdfs:
        page = fitz.open(caminho)[0]
        quadros = [d["rect"] for d in page.get_drawings()
                   if d.get("layer") in ("CORTE_LINHAS_DA_TABELA_DE_DETALHE", "QUADRO_PILAR") and d["rect"].width > 250 and d["rect"].height > 100]
        # o gerador só aceita quadro com mais de 200 de altura; os menores (lance curto) entram aqui
        # para mostrar quando o gerador ignorou o quadro e recortou pelo desenho em volta do rótulo
        anns = legado.anotacoes(page)
        rot = [(c, r) for c, r in anns if rx.fullmatch(c)]
        tabs = legado.Tabelas(page, rot, anns)
        prancha = legado.PREFIXO + pathlib.Path(caminho).stem
        if viga:
            # título de viga = nomes empilhados logo acima de "Escala vigas" (como em detalhes_vigas);
            # o nome solto em outro lugar é só citação (corte, viga vizinha) e não conta
            titulos = []
            for e in [r for c, r in anns if c.lower().startswith("escala vigas")]:
                ref = e
                while True:
                    cand = [(c, r) for c, r in rot if (c, r) not in titulos and -3 < ref.x0 - r.x0 < 9 and 0 < ref.y0 - r.y0 < 15]
                    if not cand:
                        break
                    c, r = max(cand, key=lambda x: x[1].y0)
                    titulos.append((c, r))
                    ref = r
            rot = titulos
        for c, r in rot:
            if tabs.contem(r):
                continue
            q = next((q for q in quadros if q.contains(r)), None)
            niveis = sorted({o for t, rr in anns if q is not None and q.contains(rr) for o in [ordem_do_nivel(t)] if o is not None})
            for n in legado.nomes_lista(c, viga):
                out.setdefault(n, []).append({"prancha": prancha, "titulo": c, "niveis": niveis,
                                             "quadro": q is not None and q.height > 200, "quadro_pequeno": q is not None and q.height <= 200})
    return out


def analisar(pav: dict, manifests: list[dict], ocorr: dict[str, list[dict]]) -> list[dict]:
    nome_pav = pav["pavimento"]
    ordem_pav = next((o for _, p, o in PAVIMENTOS if p == nome_pav), None)
    linhas = []
    vistos = set()
    for m in manifests:
        for e in m["elementos"].values():
            if e.get("tipo") not in ("P", "V") or (e["tipo"], e["nome"]) in vistos:
                continue
            vistos.add((e["tipo"], e["nome"]))
            base = {"pavimento": nome_pav, "tipo": e["tipo"], "nome": e["nome"], "secao_forma": e.get("secao") or "", "trecho": m.get("trecho", "")}
            det = m.get("detalhes", {}).get(e.get("detalhe") or "")
            if not det:
                linhas.append({**base, "suspeita": "sem_detalhe", "prancha_usada": "", "titulo_usado": "", "pranchas_com_o_nome": "", "lance_do_detalhe": ""})
                continue
            oc = ocorr.get(e["nome"], [])
            pranchas = sorted({o["prancha"] for o in oc})
            # como o gerador: na prancha usada, o rótulo dentro de quadro ganha do rótulo solto
            iguais = [o for o in oc if o["prancha"] == det["prancha"] and o["titulo"] == det["titulo"]]
            usada = next((o for o in iguais if o["quadro"] or o.get("quadro_pequeno")), iguais[0] if iguais else None)
            tem_quadro = any(o["quadro"] for o in iguais)
            niveis = usada["niveis"] if usada else []
            suspeitas = []
            if len(pranchas) > 1:
                suspeitas.append("varias_pranchas")
            if e["nome"] not in [x.strip() for x in det["titulo"].split("=")]:
                suspeitas.append("titulo_diferente")
            pp = pavimento_da_prancha(det["prancha"])
            if pp and pp != nome_pav:
                suspeitas.append("outro_pavimento")
            if e["tipo"] == "P" and ordem_pav is not None and len(niveis) >= 2 and ordem_pav not in niveis[1:]:
                suspeitas.append("lance_diferente")
            if e["tipo"] == "P" and usada is not None and not tem_quadro:
                suspeitas.append("quadro_pequeno" if any(o.get("quadro_pequeno") for o in iguais) else "sem_quadro")
            if suspeitas:
                linhas.append({**base, "suspeita": " ".join(suspeitas), "prancha_usada": det["prancha"], "titulo_usado": det["titulo"],
                               "pranchas_com_o_nome": " | ".join(pranchas), "lance_do_detalhe": " > ".join(nome_do_nivel(o) for o in niveis)})
    return linhas


COLUNAS = ["pavimento", "tipo", "nome", "suspeita", "secao_forma", "prancha_usada", "titulo_usado", "lance_do_detalhe", "pranchas_com_o_nome", "trecho"]


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__)
        return 1
    pasta_pav, pasta_pacotes, saida = map(pathlib.Path, argv)
    todas = []
    for arq in sorted(pasta_pav.glob("*.json")):
        pav = json.loads(arq.read_text(encoding="utf-8"))
        if "det_pilares" not in pav:
            continue
        manifests = [json.loads(m.read_text(encoding="utf-8")) for m in sorted((pasta_pacotes / arq.stem).glob("*/manifest.json"))]
        if not manifests:
            print(f"{arq.stem}: sem pacote gerado em {pasta_pacotes / arq.stem}, pulado")
            continue
        ocorr = ler_ocorrencias(pav["det_pilares"], False)
        for n, oc in ler_ocorrencias(pav["det_vigas"], True).items():
            ocorr.setdefault(n, []).extend(oc)
        linhas = analisar(pav, manifests, ocorr)
        todas += linhas
        sem = sum(1 for l in linhas if l["suspeita"] == "sem_detalhe")
        print(f"{pav['pavimento']}: {len(linhas) - sem} suspeitas, {sem} sem detalhe")
    with open(saida, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, COLUNAS, delimiter=";")
        w.writeheader()
        w.writerows(todas)
    print(f"{len(todas)} linhas em {saida}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

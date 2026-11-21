"""Furos numa planta própria, com o projeto de furação no fundo (pedido do Nicolas de 21/11/2026, via Professor).

"Usa o mesmo princípio das armaduras de lajes": abrir os furos leva a uma planta só deles, com a prancha de
FURAÇÃO no fundo (no Autodoc, Furação > Modelagem > Projeto Executivo; a outra pasta de furação não vale), e
não os pontos por cima da planta de forma. Cada furo marcado vai para a ficha da peça onde está: viga, pilar
ou laje.

As pranchas de furação saem do Revit: sem camadas, uma por setor, na escala 1:75. Os pilares são os
retângulos cheios de cinza médio. Cada prancha é encaixada na folha de forma pelos centros dos pilares (o
mesmo alinhamento das barras, pipeline/alinhamento), então a planta de furação tem as coordenadas da forma:
os furos têm a mesma posição e o mesmo id nas duas, e as áreas de laje desenhadas na forma valem aqui.

A forma continua levando os furos (o item de furação da viga conta por eles), marcada com "furos_separados"
para o app não mostrá-los lá. No servidor, a planta é um setor do pavimento com disciplina "furacao" (texto
livre: sem migração).
"""

from __future__ import annotations

import pathlib
import sys

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent))

DISCIPLINA = "furacao"
TRECHO = "Furação"
ESCALA_PADRAO = 75.0  # as pranchas de furação da obra piloto são 1:75
ESCALA_DA_FORMA = 50.0
CINZA_DO_PILAR = 0.5
TOLERANCIA_COR = 0.02
MARGEM_CM = 400.0  # em volta dos pilares: balanço de laje e furos perto da borda


class ErroFuracao(Exception):
    pass


def eh_retangulo_de_pilar(desenho: dict) -> bool:
    """Retângulo cheio de cinza médio (o pilar cortado no Revit)."""
    f = desenho.get("fill")
    itens = desenho.get("items") or []
    return bool(f) and len(f) == 3 and all(abs(c - CINZA_DO_PILAR) <= TOLERANCIA_COR for c in f) \
        and bool(itens) and all(i[0] == "re" for i in itens)


def pilares_da_pagina(page) -> list:
    """Centros e tamanhos dos pilares da prancha, nas coordenadas da página (já girada)."""
    from alinhamento import alinhar as al

    M = page.rotation_matrix
    saida = []
    for d in page.get_drawings():
        if not eh_retangulo_de_pilar(d):
            continue
        r = d["rect"] * M
        saida.append(al.Ponto((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, w=r.width, h=r.height))
    return saida


def janela_dos_pilares(pilares: list, largura: float, altura: float, escala: float, limite_x: float | None = None) -> tuple[float, float, float, float]:
    """O pedaço da prancha que vai para o fundo: os pilares com uma margem (MARGEM_CM de obra), sem passar da
    página nem da coluna da legenda (limite_x)."""
    if not pilares:
        raise ErroFuracao("nenhum pilar achado na prancha (retângulo cinza)")
    m = MARGEM_CM * 72 / 2.54 / escala
    x0 = max(0.0, min(p.x - p.w / 2 for p in pilares) - m)
    y0 = max(0.0, min(p.y - p.h / 2 for p in pilares) - m)
    x1 = min(largura, max(p.x + p.w / 2 for p in pilares) + m)
    y1 = min(altura, max(p.y + p.h / 2 for p in pilares) + m)
    if limite_x is not None and limite_x > x0:
        x1 = min(x1, limite_x)
    return (round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2))


def coluna_da_legenda(page) -> float | None:
    """Onde começa a coluna da direita (legenda, quadros, carimbo): o x do primeiro "LEGENDA" ou "FURAÇÃO"
    da metade direita da folha."""
    meio = page.rect.width / 2
    xs = [w[0] for w in page.get_text("words") if w[0] > meio and w[4].upper().startswith(("LEGENDA", "FURAÇÃO", "FURACAO"))]
    return min(xs) - 10 if xs else None


def ler_prancha(pdf: str, escala: float = ESCALA_PADRAO) -> dict:
    """Pilares e janela de uma prancha de furação."""
    import pymupdf

    with pymupdf.open(pdf) as doc:
        page = doc[0]
        pilares = pilares_da_pagina(page)
        janela = janela_dos_pilares(pilares, page.rect.width, page.rect.height, escala, coluna_da_legenda(page))
    return {"pdf": pdf, "nome": pathlib.Path(pdf).stem, "pilares": pilares, "janela": janela, "escala": escala}


def alinhar_pranchas(pecas: list[dict], lidas: list[dict], manuais: dict | None = None) -> tuple[list[dict], list[dict]]:
    """Encaixa cada prancha lida na folha de forma pelos pilares. Devolve (as que alinharam, com
    "transformacao"; resumo por prancha). A que não alinha fica de fora e o resumo diz por quê."""
    import barras_laje
    from alinhamento import alinhar as al

    destino = barras_laje.pontos_dos_pilares(pecas)
    ok, resumo = [], []
    for pr in lidas:
        T = (manuais or {}).get(pr["nome"])
        esperada = float(pr.get("escala") or ESCALA_PADRAO) / ESCALA_DA_FORMA
        res = al.manual(T, pr["pilares"], destino) if T else al.alinhar(pr["pilares"], destino, escala=esperada)
        d = res.como_dict()
        resumo.append({"prancha": pr["nome"], "pilares": len(pr["pilares"]), "alinhamento": d})
        if res.ok:
            ok.append({**pr, "transformacao": res.transformacao})
    return ok, resumo


def _dentro(x: float, y: float, poly) -> bool:
    d = False
    n = len(poly)
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[i - 1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            d = not d
    return d


def pilar_do_furo(furo: dict, pilares: list[dict]) -> str | None:
    """O pilar em que o centro do furo (ou da caixinha) cai, pelo contorno da forma."""
    r = furo["rotulo"]
    x, y = (r[0] + r[2]) / 2, (r[1] + r[3]) / 2
    for p in pilares:
        if any(len(poly) >= 3 and _dentro(x, y, poly) for poly in p["polys"]):
            return p["nome"]
    return None


def marcar_pilares(pecas: list[dict]) -> None:
    """O furo de laje (sem viga) que cai num pilar ganha "pilar" (o nome), na própria lista de peças."""
    pilares = [p for p in pecas if p.get("tipo") == "P" and p.get("polys") and not p.get("so_detalhe")]
    for f in pecas:
        if f.get("tipo") == "F" and not f.get("viga"):
            pilar = pilar_do_furo(f, pilares)
            if pilar:
                f["pilar"] = pilar


def folha_de_furacao(forma: dict, alinhadas: list[dict], imprimir=print) -> dict | None:
    """A planta de furação do pavimento (no formato de folha_unica.ler_folha_unica). Marca
    forma["furos_separados"] = True. Sem prancha alinhada ou sem furo, não sai planta."""
    import armadura_laje
    import folha_unica

    if not alinhadas or not any(p.get("tipo") == "F" for p in forma["pecas"]):
        return None
    marcar_pilares(forma["pecas"])  # na forma também: o app grava na ficha certa nas duas
    furos = [dict(p) for p in forma["pecas"] if p.get("tipo") == "F"]
    if len(alinhadas) == 1:  # uma prancha só: o nome dela (nome_da_folha juntaria "001-001")
        nome = alinhadas[0]["nome"]
        revisao = nome.rsplit("-", 1)[-1] if "-R" in nome else "R00"
    else:
        nome, revisao = folha_unica.nome_da_folha([p["nome"] for p in alinhadas])
    imprimir(f"  {TRECHO}: {len(alinhadas)} pranchas coladas na folha, {len(furos)} furos"
             f" ({sum(1 for f in furos if f.get('viga'))} em viga, {sum(1 for f in furos if f.get('pilar'))} em pilar,"
             f" {sum(1 for f in furos if not f.get('viga') and not f.get('pilar'))} em laje)")
    forma["furos_separados"] = True
    return {
        "prancha": nome,
        "revisao": revisao,
        "largura": forma["largura"],
        "altura": forma["altura"],
        "tile": forma.get("tile", folha_unica.TILE),
        "niveis": forma["niveis"],
        "tiles": armadura_laje.tiles_da_camada(alinhadas, forma["niveis"]),
        "pecas": furos,
        "trecho": TRECHO,
        "disciplina": DISCIPLINA,
        "origens": [{"prancha": p["nome"], "transformacao": p["transformacao"]} for p in alinhadas],
    }

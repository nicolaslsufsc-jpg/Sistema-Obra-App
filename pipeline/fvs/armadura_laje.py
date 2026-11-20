"""Armadura de laje em camadas separadas (pedido do Nicolas de 20/11/2026, aprovado pelo Professor).

Cada direção da armadura (longitudinal inferior, transversal superior...) vira uma planta própria do
pavimento, com a imagem das próprias pranchas de armação no fundo, coladas numa folha só, e só as barras
daquela direção para ver e tocar (o pacote leva todas, para o item da laje). Nada da forma por cima: "é meio que um layer a mais, porque senão vai encher de
informação demais".

As pranchas são coladas com o mesmo encaixe que já leva as barras para a folha de forma (alinhamento pelos
pilares, pipeline/alinhamento). Assim a planta de armadura tem as coordenadas da forma: as áreas de laje
desenhadas na forma valem nela também, e o id de cada barra é o mesmo nas duas.

No servidor, cada direção é um setor do pavimento com disciplina "armadura" (texto livre: sem migração).
A planta de forma continua levando todas as barras (o item de armadura da área de laje é calculado por
elas), marcada com "camadas_separadas" para o app não mostrar a aba Barras lá.
"""

from __future__ import annotations

import math
import pathlib
import sys

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import barras_laje  # noqa: E402
import folha_unica  # noqa: E402

DISCIPLINA = "armadura"


def nome_do_setor(camada: str) -> str:
    """Nome do setor (e do trecho no pacote): "Armadura longitudinal inferior"."""
    return f"Armadura {barras_laje.NOME_DA_CAMADA[camada].lower()}"


def matriz_de_desenho(T: dict, k: float):
    """A transformação do alinhamento (x' = a x + b y + tx; y' = c x + d y + ty) como matriz do PyMuPDF,
    já com os k pixels por ponto do nível mais fino."""
    import pymupdf

    a, b, c, d = T["matriz"]
    tx, ty = T["t"]
    # PyMuPDF: x' = a x + c y + e, y' = b x + d y + f
    return pymupdf.Matrix(a * k, c * k, b * k, d * k, tx * k, ty * k)


def _colar(page, janela, T: dict, nivel: dict) -> None:
    """Como folha_unica._colar_janela, mas com a transformação completa do alinhamento (a prancha de armação
    pode vir girada ou espelhada em relação à de forma)."""
    import pymupdf

    k = folha_unica.ESCALA_MAX
    matriz = matriz_de_desenho(T, k)
    a, b, c, d = T["matriz"]
    escala = math.sqrt(abs(a * d - b * c)) or 1.0
    lista = page.get_displaylist(annots=False)
    passo = folha_unica.PEDACO_PX / (k * escala)
    y = janela[1]
    while y < janela[3]:
        x = janela[0]
        while x < janela[2]:
            clip = pymupdf.Rect(x, y, min(x + passo, janela[2]), min(y + passo, janela[3]))
            folha_unica._guardar_pedaco(lista.get_pixmap(matrix=matriz, colorspace=pymupdf.csRGB, alpha=False, clip=clip), nivel)
            x += passo
        y += passo


def tiles_da_camada(pranchas: list[dict], niveis: list[int]) -> dict[str, bytes]:
    """pranchas: [{"pdf", "janela", "transformacao"}] já alinhadas. Devolve os tiles {"z/x/y": webp}."""
    import pymupdf

    fino: dict = {}
    for p in pranchas:
        with pymupdf.open(p["pdf"]) as doc:
            _colar(doc[0], p["janela"], p["transformacao"], fino)
    saida: dict[str, bytes] = {}
    atual = fino
    for z in sorted(niveis, reverse=True):
        for (x, y), png in atual.items():
            w = folha_unica._webp(png)
            if w:
                saida[f"{z}/{x}/{y}"] = w
        if z != min(niveis):
            atual = folha_unica._nivel_abaixo(atual)
    return saida


def pranchas_por_camada(lidas: list[dict], resumo: list[dict]) -> dict[str, list[dict]]:
    """As pranchas de armação que alinharam, por camada, na ordem dos trechos.

    lidas: barras_laje.ler_prancha de cada uma; resumo: o terceiro retorno de barras_laje.juntar_barras
    (com a transformação de cada prancha). Prancha que não alinhou fica de fora (já está nos conflitos)."""
    transf = {r["prancha"]: r["alinhamento"].get("transformacao") for r in resumo if r["alinhamento"].get("ok")}
    saida: dict[str, list[dict]] = {}
    for p in lidas:
        T = transf.get(p["nome"])
        if not T:
            continue
        saida.setdefault(p["camada"], []).append({"pdf": p["pdf"], "janela": p["janela"], "nome": p["nome"], "transformacao": T})
    return saida


def folhas_de_armadura(forma: dict, lidas: list[dict], resumo: list[dict], imprimir=print) -> list[dict]:
    """Uma "forma" por camada (no formato de folha_unica.ler_folha_unica), para publicar como planta própria.

    forma: a folha de forma do pavimento, já com forma["barras"] ({id: barra}, de publicar_planta.por_barras).
    Marca forma["camadas_separadas"] = True quando sai alguma camada."""
    por_camada = pranchas_por_camada(lidas, resumo)
    folhas = []
    for camada in barras_laje.CAMADAS:
        pranchas = por_camada.get(camada)
        barras = forma.get("barras") or {}
        if not pranchas or not any(b["camada"] == camada for b in barras.values()):
            continue
        nome, revisao = folha_unica.nome_da_folha([p["nome"] for p in pranchas])
        n = sum(1 for b in barras.values() if b["camada"] == camada)
        imprimir(f"  {nome_do_setor(camada)}: {len(pranchas)} pranchas coladas na folha, {n} barras")
        folhas.append({
            "prancha": nome,
            "revisao": revisao,
            "largura": forma["largura"],
            "altura": forma["altura"],
            "tile": forma.get("tile", folha_unica.TILE),
            "niveis": forma["niveis"],
            "tiles": tiles_da_camada(pranchas, forma["niveis"]),
            "pecas": [],
            "trecho": nome_do_setor(camada),
            "disciplina": DISCIPLINA,
            "camada": camada,
            # todas as barras (mesmos ids da forma): o item da área de laje conta as quatro direções; o app
            # mostra só as de "camada"
            "barras": barras,
            "origens": [{"prancha": p["nome"], "transformacao": p["transformacao"]} for p in pranchas],
        })
    if folhas:
        forma["camadas_separadas"] = True
    return folhas

"""Modulação nos ambientes (FVS ambientes, fatia F3, código preparado em 19/11/2026).

A planta de modulação da 1ª fiada (uma prancha por setor do pavimento) aparece como "detalhe" ao tocar
o ambiente, como o detalhamento do pilar: a pessoa confere a alvenaria olhando o pedaço da prancha
daquele apartamento. Nada de digitar medida: a modulação vem da prancha.

**Feito sem as pranchas no disco** (o download dos PDFs espera o Nicolas no PC). A parte pura (qual
prancha mostra cada apartamento e onde recortar) está testada com dados fictícios. A leitura do PDF
reaproveita o casamento das paredes do IFC com a prancha (ambientes.casar_com_a_prancha), o mesmo que
já põe os ambientes na prancha de arquitetura. Quando os PDFs chegarem, conferir: a escala, se a prancha
desenha as paredes com hachura escura (o casamento depende disso) e a coincidência mínima.

Recorte por apartamento: os ambientes do mesmo apartamento ganham a mesma imagem (o apartamento inteiro
com folga), que é como a prancha se lê na obra, e o pacote fica com um recorte por apartamento, não um
por cômodo. Ambiente de área comum tem o recorte só dele. Vale a prancha em que o apartamento cabe
inteiro e mais longe da borda; se ele não cabe inteiro em nenhuma, cada cômodo procura a sua.

No pavimento.json, dentro de "ambientes":
  "modulacao": {"pranchas": "../Modulacao/*.VD.EX.02[4-8].*.pdf", "escala": 50}
  opcionais: "margem_m" (folga em volta do recorte, 0,30 m), "coincidencia_minima" (0,08: a prancha de
  um setor mostra só parte das paredes do andar, então a coincidência é baixa por natureza).
"""

from __future__ import annotations

import re

MARGEM_M = 0.30
COINCIDENCIA_MINIMA = 0.08
ESCALA_IMG = 2.4  # a mesma do detalhe do pilar (gerador_fvs.DET_ESCALA)
AREA_COMUM = "Área comum"


class ErroModulacao(Exception):
    pass


def caixa_dos_pontos(pts) -> tuple[float, float, float, float]:
    xs = [float(p[0]) for p in pts]
    ys = [float(p[1]) for p in pts]
    if not xs:
        raise ErroModulacao("contorno vazio")
    return (min(xs), min(ys), max(xs), max(ys))


def juntar_caixas(caixas) -> tuple[float, float, float, float]:
    caixas = list(caixas)
    return (min(c[0] for c in caixas), min(c[1] for c in caixas), max(c[2] for c in caixas), max(c[3] for c in caixas))


def folga_na_folha(caixa, largura: float, altura: float) -> float:
    """Menor distância da caixa até a borda da folha; negativa se a caixa sai da folha."""
    x0, y0, x1, y1 = caixa
    return min(x0, y0, largura - x1, altura - y1)


def escolher_prancha(caixas: dict[str, tuple], folhas: dict[str, tuple[float, float]]) -> str | None:
    """Das pranchas em que a caixa cabe inteira, a que a deixa mais longe da borda (empate: a de nome menor)."""
    boas = [(folga_na_folha(c, *folhas[p]), p) for p, c in caixas.items() if p in folhas]
    boas = [(f, p) for f, p in boas if f >= 0]
    if not boas:
        return None
    return sorted(boas, key=lambda fp: (-fp[0], fp[1]))[0][1]


def recorte(caixa, largura: float, altura: float, margem_pt: float) -> tuple[float, float, float, float]:
    """A caixa com folga, sem sair da folha."""
    x0, y0, x1, y1 = caixa
    return (max(0.0, x0 - margem_pt), max(0.0, y0 - margem_pt), min(largura, x1 + margem_pt), min(altura, y1 + margem_pt))


def chave_da_modulacao(unidade: str) -> str:
    """"Apto 303" -> "M_Apto_303" (nome seguro para o pedaço do pacote, como pacote.chave_de_detalhe)."""
    return re.sub(r"[^A-Za-z0-9_-]", "_", f"M_{unidade}")[:120]


def plano_da_modulacao(ambientes: list[dict], folhas: dict[str, tuple[float, float]], pt_por_m: dict[str, float],
                       margem_m: float = MARGEM_M) -> tuple[dict[str, dict], dict[str, str], dict]:
    """O que recortar de cada prancha.

    ambientes: [{"nome": "303-05", "grupo": "Apto 303", "caixas": {prancha: (x0, y0, x1, y1)}}], com a caixa
    do ambiente em pontos de cada prancha em que o modelo casou. folhas: prancha -> (largura, altura).
    pt_por_m: prancha -> pontos por metro (da escala).

    Devolve (recortes, de_cada_ambiente, relatório):
      recortes: chave -> {"prancha", "clip", "titulo", "ambientes"}
      de_cada_ambiente: nome do ambiente -> chave
    """
    unidades: dict[str, list[dict]] = {}
    for a in ambientes:
        unidade = a["nome"] if (a.get("grupo") or AREA_COMUM) == AREA_COMUM else a["grupo"]
        unidades.setdefault(unidade, []).append(a)
    recortes: dict[str, dict] = {}
    de_cada: dict[str, str] = {}
    sem: list[str] = []

    def guardar(titulo: str, membros: list[dict], prancha: str, caixa) -> None:
        chave = chave_da_modulacao(titulo)
        larg, alt = folhas[prancha]
        recortes[chave] = {"prancha": prancha, "clip": recorte(caixa, larg, alt, margem_m * pt_por_m[prancha]),
                           "titulo": titulo, "ambientes": sorted(m["nome"] for m in membros)}
        for m in membros:
            de_cada[m["nome"]] = chave

    for unidade in sorted(unidades):
        membros = unidades[unidade]
        # pranchas em que todos os cômodos do apartamento casaram
        comuns = set.intersection(*(set(m["caixas"]) for m in membros))
        juntas = {p: juntar_caixas(m["caixas"][p] for m in membros) for p in comuns}
        p = escolher_prancha(juntas, folhas)
        if p:
            guardar(unidade, membros, p, juntas[p])
            continue
        # o apartamento não cabe inteiro em nenhuma prancha (fica entre dois setores): cada cômodo procura a sua
        for m in membros:
            pm = escolher_prancha(m["caixas"], folhas)
            if pm:
                guardar(m["nome"], [m], pm, m["caixas"][pm])
            else:
                sem.append(m["nome"])
    rel = {
        "pranchas": len(folhas),
        "recortes": len(recortes),
        "com_modulacao": len(de_cada),
        "sem_modulacao": sorted(sem),
        "por_prancha": {p: sum(1 for r in recortes.values() if r["prancha"] == p) for p in sorted(folhas)},
    }
    return recortes, de_cada, rel


def detalhes_dos_ambientes(recortes: dict[str, dict], de_cada: dict[str, str], imagens: dict[str, bytes],
                           nome_da_prancha=lambda p: p) -> dict[str, dict]:
    """No formato de detalhes["A"] de publicar_planta.montar_trecho: nome do ambiente -> detalhe."""
    saida = {}
    for nome, chave in de_cada.items():
        r = recortes[chave]
        if chave not in imagens:
            continue
        saida[nome] = {"chave": chave, "titulo": f"Modulação · {r['titulo']}", "prancha": nome_da_prancha(r["prancha"]),
                       "img": imagens[chave], "aco": None}
    return saida


# ---------------------------------------------------------------------------
# PDF (precisa de pymupdf, numpy e pillow; chamado por ambientes.ler_planta)
# ---------------------------------------------------------------------------

def ler_modulacao(cfg: dict, paredes, geometrias: dict[str, object], grupos: dict[str, str], casar) -> tuple[dict[str, dict], dict]:
    """detalhes["A"] e o relatório, a partir das pranchas de modulação.

    geometrias: nome do ambiente -> polígono no modelo (metros); grupos: nome -> "Apto 303" ou "Área comum";
    casar: ambientes.casar_com_a_prancha (passado para não importar ambientes daqui)."""
    import base64

    import pymupdf as fitz

    import gerador_fvs as legado
    from estrutura import nome_da_prancha

    pranchas = cfg.get("pranchas") or []
    if isinstance(pranchas, str):
        pranchas = [pranchas]
    if not pranchas:
        raise ErroModulacao("falta \"pranchas\" em \"modulacao\"")
    escala = float(cfg.get("escala") or 50)
    minima = float(cfg.get("coincidencia_minima") or COINCIDENCIA_MINIMA)
    folhas, pt_por_m, paginas, nao_casaram, coincidencias = {}, {}, {}, [], {}
    caixas: dict[str, dict[str, tuple]] = {n: {} for n in geometrias}
    for pdf in pranchas:
        page = fitz.open(pdf)[0]
        t = casar(page, paredes, escala)
        coincidencias[pdf] = round(t["coincidencia"], 2)
        if t["coincidencia"] < minima:
            nao_casaram.append(nome_da_prancha(pdf))
            continue
        folhas[pdf] = (page.rect.width, page.rect.height)
        pt_por_m[pdf] = t["pt_por_m"]
        paginas[pdf] = page
        for nome, g in geometrias.items():
            x0, y0, x1, y1 = g.bounds
            caixas[nome][pdf] = ((x0 - t["x0"]) * t["pt_por_m"] + t["dx_pt"], (t["y1"] - y1) * t["pt_por_m"] + t["dy_pt"],
                                 (x1 - t["x0"]) * t["pt_por_m"] + t["dx_pt"], (t["y1"] - y0) * t["pt_por_m"] + t["dy_pt"])
    lista = [{"nome": n, "grupo": grupos.get(n), "caixas": caixas[n]} for n in sorted(geometrias)]
    recortes, de_cada, rel = plano_da_modulacao(lista, folhas, pt_por_m, float(cfg.get("margem_m") or MARGEM_M))
    imagens = {chave: base64.b64decode(legado.render(paginas[r["prancha"]], fitz.Rect(*r["clip"]), ESCALA_IMG)) for chave, r in recortes.items()}
    rel["nao_casaram"] = nao_casaram
    rel["coincidencia"] = {nome_da_prancha(p): c for p, c in coincidencias.items()}
    rel["por_prancha"] = {nome_da_prancha(p): n for p, n in rel["por_prancha"].items()}
    return detalhes_dos_ambientes(recortes, de_cada, imagens, nome_da_prancha), rel

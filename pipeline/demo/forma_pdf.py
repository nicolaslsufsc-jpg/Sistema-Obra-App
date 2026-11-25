"""Leitura simples de uma planta de forma em PDF com texto de verdade (rótulos "P12", "V203 14x40").

Para projetos de fora (ex.: projeto padrão público) cujas pranchas não seguem o padrão do leitor da obra
(pipeline/fvs/estrutura.py, que espera as camadas do escritório da obra). Aqui:
- pilar: o retângulo da camada de pilares mais perto de um rótulo "Pn" (aceita "Pn(MORRE)", "Pn(NASCE)");
- viga: o par de faces paralelas ao lado de cada rótulo "Vn" (a mesma busca do leitor da obra,
  estrutura.faixa_reta), com as coordenadas multiplicadas por FATOR: vigas de 14 cm na escala 1:75 ficam
  com ~5 pontos, abaixo do mínimo do leitor da obra (7 pontos, escala 1:50);
- seção: o texto "LxA" logo depois do rótulo (viga) ou logo abaixo (pilar).
O texto e os desenhos do PDF vêm sem o giro da página; o que sai (contornos, rótulos, largura e altura) é
na página como ela aparece, a mesma da imagem renderizada.

Precisa de: pip install pymupdf
"""

from __future__ import annotations

import math
import pathlib
import re
import sys

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "fvs"))

import pymupdf  # noqa: E402

import estrutura  # noqa: E402

FATOR = 2.0
RE_PILAR = re.compile(r"P(\d+)(?:\((MORRE|NASCE|PASSA)\))?")
RE_VIGA = re.compile(r"V\d{1,3}[A-Z]?")
RE_SECAO = re.compile(r"\d{1,3}x\d{1,3}")
DIST_PILAR = 40.0  # pontos: rótulo até o retângulo do pilar
LADO_MAX_PILAR = 80.0


def _segmentos(page, ignorar: set[str]) -> tuple[list, list]:
    hs, vs = [], []
    for d in page.get_drawings():
        if (d.get("layer") or "") in ignorar:
            continue
        for it in d["items"]:
            if it[0] != "l":
                continue
            a, b = it[1], it[2]
            if abs(a.y - b.y) < 0.3 and abs(a.x - b.x) > 3:
                hs.append((round(FATOR * (a.y + b.y) / 2, 1), FATOR * min(a.x, b.x), FATOR * max(a.x, b.x)))
            elif abs(a.x - b.x) < 0.3 and abs(a.y - b.y) > 3:
                vs.append((round(FATOR * (a.x + b.x) / 2, 1), FATOR * min(a.y, b.y), FATOR * max(a.y, b.y)))
    return hs, vs


def _secao_depois(ws: list, i: int, horizontal: bool) -> str:
    """A palavra seguinte na mesma linha de texto, se for "LxA"."""
    if i + 1 < len(ws) and ws[i + 1][5:7] == ws[i][5:7] and RE_SECAO.fullmatch(ws[i + 1][4]):
        return ws[i + 1][4]
    return ""


def ler_forma(pdf: str | pathlib.Path, camada_pilares: str = "FO-Pilares", ignorar: set[str] | None = None,
              tirar: tuple[str, ...] = ()) -> dict:
    """{"largura", "altura", "pecas": [{tipo, nome, secao, rotulo, polys}], "sem_contorno": [...]}.

    tirar: situações de pilar que ficam de fora (ex.: ("NASCE",): pilar que nasce na viga é do pavimento de cima)."""
    page = pymupdf.open(str(pdf))[0]
    M = page.rotation_matrix

    def girar(x: float, y: float) -> list[float]:
        p = pymupdf.Point(x, y) * M
        return [round(p.x, 2), round(p.y, 2)]

    def caixa(r) -> list[list[float]]:
        return [girar(r.x0, r.y0), girar(r.x1, r.y0), girar(r.x1, r.y1), girar(r.x0, r.y1)]

    ws = page.get_text("words")
    ignorar = set(ignorar or ()) | {camada_pilares}

    # ---- pilares
    retangulos = []
    for d in page.get_drawings():
        if (d.get("layer") or "") == camada_pilares:
            r = d["rect"]
            if 1 < r.width < LADO_MAX_PILAR and 1 < r.height < LADO_MAX_PILAR:
                retangulos.append(r)
    rotulos_p: dict[str, list] = {}
    situacao: dict[str, str] = {}
    secao_p: dict[str, str] = {}
    for w in ws:
        m = RE_PILAR.fullmatch(w[4])
        if not m:
            continue
        nome = f"P{m.group(1)}"
        rotulos_p.setdefault(nome, []).append(pymupdf.Rect(w[:4]))
        if m.group(2):
            situacao[nome] = m.group(2)
        # seção: "LxA" logo abaixo do rótulo (no sentido do texto)
        r = pymupdf.Rect(w[:4])
        for o in ws:
            if RE_SECAO.fullmatch(o[4]) and pymupdf.Rect(o[:4]).intersects(pymupdf.Rect(r.x0 - 20, r.y0 - 20, r.x1 + 20, r.y1 + 20)):
                secao_p.setdefault(nome, o[4])
                break
    pecas, sem_contorno = [], []
    usados: set[int] = set()
    for nome in sorted(rotulos_p, key=lambda n: int(n[1:])):
        if situacao.get(nome) in tirar:
            continue
        melhor = None
        for lbl in rotulos_p[nome]:
            c = ((lbl.x0 + lbl.x1) / 2, (lbl.y0 + lbl.y1) / 2)
            for k, r in enumerate(retangulos):
                if k in usados:
                    continue
                dx = max(r.x0 - c[0], 0, c[0] - r.x1)
                dy = max(r.y0 - c[1], 0, c[1] - r.y1)
                dist = math.hypot(dx, dy)
                if dist <= DIST_PILAR and (melhor is None or dist < melhor[0]):
                    melhor = (dist, k, lbl)
        if melhor is None:
            sem_contorno.append(nome)
            continue
        _, k, lbl = melhor
        usados.add(k)
        r = retangulos[k]
        pecas.append({"tipo": "P", "nome": nome, "secao": secao_p.get(nome, ""), "rotulo": girar((lbl.x0 + lbl.x1) / 2, (lbl.y0 + lbl.y1) / 2),
                      "polys": [caixa(r)]})

    # ---- vigas
    hs, vs = _segmentos(page, ignorar)
    vigas: dict[str, dict] = {}
    for i, w in enumerate(ws):
        if not RE_VIGA.fullmatch(w[4]):
            continue
        r = pymupdf.Rect(w[:4])
        # rótulo curto ("V1") pode ser mais alto que largo: tenta o sentido do retângulo e, sem achar, o outro
        rk = pymupdf.Rect(r.x0 * FATOR, r.y0 * FATOR, r.x1 * FATOR, r.y1 * FATOR)
        fx = None
        for h in ((True, False) if r.width >= r.height else (False, True)):
            fx = estrutura.faixa_reta(rk, h, hs if h else vs, [])
            if fx is not None:
                break
        v = vigas.setdefault(w[4], {"polys": [], "secao": "", "rotulo": None})
        if fx is None:
            continue
        fx = pymupdf.Rect(fx.x0 / FATOR, fx.y0 / FATOR, fx.x1 / FATOR, fx.y1 / FATOR)
        if not any(pymupdf.Rect(p).intersects(fx) for p in v.get("_rects", [])):
            v.setdefault("_rects", []).append(fx)
            v["polys"].append(caixa(fx))
        if v["rotulo"] is None:
            v["rotulo"] = girar((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)
        v["secao"] = v["secao"] or _secao_depois(ws, i, h)
    for nome in sorted(vigas, key=lambda n: (len(n), n)):
        v = vigas[nome]
        if not v["polys"]:
            sem_contorno.append(nome)
            continue
        pecas.append({"tipo": "V", "nome": nome, "secao": v["secao"], "rotulo": v["rotulo"], "polys": v["polys"]})
    return {"largura": round(page.rect.width), "altura": round(page.rect.height), "pecas": pecas,
            "sem_contorno": sem_contorno}


def imagem(pdf: str | pathlib.Path, destino: pathlib.Path, zoom: float = 2.0) -> None:
    """A página inteira, como aparece (com o giro), em PNG. Nada é cortado."""
    page = pymupdf.open(str(pdf))[0]
    page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False).save(str(destino))


def nomes_no_texto(pdf: str | pathlib.Path, padrao: str) -> list[str]:
    """Nomes que casam com o padrão no texto da página (ex.: "B\\d+" para os blocos numa locação)."""
    page = pymupdf.open(str(pdf))[0]
    rx = re.compile(padrao)
    achados = {w[4] for w in page.get_text("words") if rx.fullmatch(w[4])}
    return sorted(achados, key=lambda n: (len(n), n))

"""Leitura simples de uma planta de forma em DXF (DWG exportado com DXFOUT), para a obra de demonstração.

Mesma saída do leitor de PDF (pipeline/demo/forma_pdf.py), para o pacote do carga_pacote.py:
{"largura", "altura", "pecas": [{tipo, nome, secao, rotulo, polys}], "lajes": [...], "sem_contorno": [...],
 "extensao": [xmin, ymin, xmax, ymax], "escala": pontos por unidade do desenho}

As camadas vêm de fora (CAMADAS_PADRAO é o padrão de nomes do Revit/AIA, comum em projeto exportado):
- pilar: o contorno é a hachura da camada "pilar_contorno" mais perto do rótulo "Pn" (camada "pilar_rotulo");
- viga: o rótulo "Vn" (camada "viga_rotulo") e o par de faces paralelas ao lado dele, com a mesma busca do leitor
  da obra (pipeline/fvs/estrutura.faixa_reta; com o desenho girado, faixa_inclinada), entre as linhas de todas as camadas menos as de "ignorar";
- laje: o rótulo "Ln" e a espessura "h=15" (camada "laje_rotulo"); contorno = a hachura da laje que contém o rótulo
  ou, sem hachura, a menor região fechada pelas linhas de "laje_contorno" (vigas e bordas); vai em "lajes";
- seção: o texto "20/45" ou "20x45" mais perto do rótulo, na mesma camada.

Coordenadas de saída: "página" em pontos de uma folha na escala 1:50, origem no canto de cima à esquerda da
extensão do desenho, y para baixo (o mesmo sentido do PDF e da imagem). É a escala em que a busca de vigas do
leitor da obra foi afinada. Para casar com uma imagem plotada: x_img = x * (largura_img / largura), idem y.

Precisa de: pip install ezdxf pymupdf
"""

from __future__ import annotations

import math
import pathlib
import re
import sys

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "fvs"))

import ezdxf  # noqa: E402
import ezdxf.bbox  # noqa: E402
import ezdxf.path  # noqa: E402
import pymupdf  # noqa: E402

import estrutura  # noqa: E402

CAMADAS_PADRAO = {
    "pilar_contorno": "S-_COLN----_E",
    "pilar_rotulo": "S-_COLN----_A",
    "viga_rotulo": "S-_BEAM----_A",
    "laje_rotulo": "A-_FLOR----_A",
    # linhas que fecham a laje: faces das vigas, bordas da laje e contorno dos pilares
    "laje_contorno": ["S-_STRL----_A", "A-_FLOR----_E", "S-_COLN----_E"],
    "ignorar": ["A-_ANOT----_D", "A-_ANOTTEXT_T", "S-_ANOTGRID_E"],
}
# $INSUNITS -> centímetros por unidade do desenho
CM_POR_UNIDADE = {1: 2.54, 2: 30.48, 4: 0.1, 5: 1.0, 6: 100.0}
CM_POR_PONTO_1_50 = 2.54 / 72 * 50  # 1 ponto da folha = 1,764 cm na obra, na escala 1:50
RE_PILAR = re.compile(r"P[CD]?\d+[A-Z]?")  # PC: pilar-parede; PD: pilar circular (diâmetro)
RE_VIGA = re.compile(r"VP?\d{1,3}[A-Z]?")  # VP: viga protendida
RE_LAJE = re.compile(r"L\d{1,3}[A-Z]?")
RE_SECAO = re.compile(r"\d{1,3}\s*[/x]\s*\d{1,3}")
RE_DIAMETRO = re.compile(r"(?:[Øø∅]|%%[cC])?\s*\d{2,3}")
RE_ESPESSURA = re.compile(r"h\s*=\s*\d{1,3}", re.I)
DIST_PILAR = 40.0  # pontos (~70 cm): rótulo até a hachura do pilar
DIST_SECAO = 25.0  # pontos: rótulo até o texto da seção (pilar, laje)
DIST_SECAO_VIGA = 45.0  # na viga a seção vem depois do nome, na mesma linha
LADO_MAX_PILAR_CM = 300.0  # bloco maior que isso na camada de pilares não é pilar (cortina, poço)
LARGURA_MAX_CM = 150.0  # viga mais larga que isso não é procurada pelas faces (viga-faixa, laje)


def largura_da_busca(secao: str) -> float:
    """Largura máxima entre as faces (pontos da folha 1:50) para achar a viga: a normal do leitor da obra (até
    ~53 cm) ou, se a seção do rótulo ("140x63": largura x altura, em cm) disser mais, a largura dela com folga."""
    m = re.match(r"(\d+)x", secao or "")
    if not m:
        return estrutura.LARGURA_NORMAL
    cm = min(float(m.group(1)), LARGURA_MAX_CM)
    return max(estrutura.LARGURA_NORMAL, cm / CM_POR_PONTO_1_50 * 1.15 + 2)


def _contorno(pts):
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return (min(xs), min(ys), max(xs), max(ys)), list(pts)


def _lacos(linhas, tol: float = 0.2) -> list[list[tuple[float, float]]]:
    """Laços fechados formados por linhas soltas (cada ponta encontra exatamente outra ponta)."""
    def chave(p):
        return (round(p[0] / tol), round(p[1] / tol))
    viz: dict = {}
    ponto: dict = {}
    for a, b in linhas:
        ka, kb = chave(a), chave(b)
        if ka == kb:
            continue
        ponto[ka], ponto[kb] = a, b
        viz.setdefault(ka, []).append(kb)
        viz.setdefault(kb, []).append(ka)
    vistos, lacos = set(), []
    for ini in viz:
        if ini in vistos or len(viz[ini]) != 2:
            continue
        laco, ant, atual, ok = [ini], None, ini, True
        while True:
            vistos.add(atual)
            prox = [k for k in viz[atual] if k != ant]
            if len(viz[atual]) != 2 or not prox:
                ok = False
                break
            ant, atual = atual, prox[0]
            if atual == ini:
                break
            if atual in vistos:
                ok = False
                break
            laco.append(atual)
        if ok and len(laco) >= 3:
            lacos.append([ponto[k] for k in laco])
    return lacos


AREA_MIN_LAJE_M2 = 1.0  # região menor que isso é miolo de viga, pilar ou detalhe, não laje


def _regioes(segs, aneis=()):
    """Regiões fechadas: pelas linhas soltas (segs) ou já dadas como anéis (hachuras). Precisa do shapely;
    sem ele, a laje fica sem contorno."""
    try:
        from shapely.geometry import LineString, Polygon
        from shapely.ops import polygonize, unary_union
    except ImportError:
        return []
    minima = AREA_MIN_LAJE_M2 * (100 / CM_POR_PONTO_1_50) ** 2
    polys = [Polygon(a).buffer(0) for a in aneis if len(a) >= 3]
    linhas = [LineString([(a, b), (c, d)]) for a, b, c, d in segs if (a, b) != (c, d)]
    if linhas:
        polys += list(polygonize(unary_union(linhas)))
    polys = [g for p in polys for g in getattr(p, "geoms", [p])]  # buffer(0) pode partir em várias
    return sorted((p for p in polys if p.area >= minima), key=lambda p: p.area)


def _regiao_do_ponto(regioes, ponto) -> list[list[float]] | None:
    """A menor região que contém o ponto, já simplificada (as linhas da obra têm muitos nós)."""
    from shapely.geometry import Point
    alvo = Point(ponto)
    for reg in regioes:  # da menor para a maior
        if reg.contains(alvo):
            simples = reg.simplify(0.5)
            return [[round(x, 2), round(y, 2)] for x, y in list(simples.exterior.coords)[:-1]]
    return None


class Texto:
    def __init__(self, texto: str, camada: str, caixa: tuple[float, float, float, float], angulo: float):
        self.texto, self.camada, self.caixa, self.angulo = texto, camada, caixa, angulo

    @property
    def centro(self) -> tuple[float, float]:
        x0, y0, x1, y1 = self.caixa
        return (x0 + x1) / 2, (y0 + y1) / 2

    @property
    def horizontal(self) -> bool:
        a = self.angulo % 180
        return a < 45 or a > 135


def _angulo(e) -> float:
    if e.dxftype() == "MTEXT":
        if e.dxf.hasattr("text_direction"):
            d = e.dxf.text_direction
            return math.degrees(math.atan2(d.y, d.x))
        return e.dxf.get("rotation", 0.0)
    return e.dxf.get("rotation", 0.0)


def _textos(entidades, profundidade: int = 0):
    for e in entidades:
        t = e.dxftype()
        if t in ("TEXT", "MTEXT"):
            s = (e.plain_text() if t == "MTEXT" else e.dxf.text).strip()
            if s:
                yield e, s
        elif t == "INSERT" and profundidade < 2:
            try:
                yield from _textos(e.virtual_entities(), profundidade + 1)
            except Exception:  # bloco quebrado: segue sem ele
                continue


def ler_forma(dxf: str | pathlib.Path, camadas: dict | None = None) -> dict:
    cam = {**CAMADAS_PADRAO, **(camadas or {})}
    doc = ezdxf.readfile(str(dxf))
    msp = doc.modelspace()
    cm = CM_POR_UNIDADE.get(doc.header.get("$INSUNITS", 5), 1.0)
    escala = cm / CM_POR_PONTO_1_50  # pontos por unidade do desenho

    ext = ezdxf.bbox.extents(msp, fast=True)
    xmin, ymin = ext.extmin.x, ext.extmin.y
    xmax, ymax = ext.extmax.x, ext.extmax.y

    def P(x: float, y: float) -> tuple[float, float]:
        return (x - xmin) * escala, (ymax - y) * escala

    # ---- textos (com caixa na página)
    textos: list[Texto] = []
    for e, s in _textos(msp):
        bb = ezdxf.bbox.extents([e], fast=True)
        if not bb.has_data:
            continue
        a, b = P(bb.extmin.x, bb.extmax.y), P(bb.extmax.x, bb.extmin.y)
        textos.append(Texto(s, e.dxf.layer, (a[0], a[1], b[0], b[1]), _angulo(e)))

    def perto(t: Texto, rx, camada: str, dist: float) -> str:
        cx, cy = t.centro
        melhor = None
        for o in textos:
            if o is t or o.camada != camada or not rx.fullmatch(o.texto):
                continue
            d = math.hypot(o.centro[0] - cx, o.centro[1] - cy)
            if d <= dist and (melhor is None or d < melhor[0]):
                melhor = (d, o.texto)
        return re.sub(r"\s+", "", melhor[1]).replace("/", "x") if melhor else ""

    def caixa(r) -> list[list[float]]:
        return [[round(r.x0, 2), round(r.y0, 2)], [round(r.x1, 2), round(r.y0, 2)], [round(r.x1, 2), round(r.y1, 2)],
                [round(r.x0, 2), round(r.y1, 2)]]

    pecas, lajes, sem_contorno = [], [], []

    # ---- pilares: hachuras da camada de contorno
    contornos = []
    for h in msp.query("HATCH"):
        if h.dxf.layer != cam["pilar_contorno"]:
            continue
        for caminho in ezdxf.path.from_hatch(h):
            pts = [P(v.x, v.y) for v in caminho.flattening(distance=0.5)]
            if len(pts) >= 3:
                xs, ys = [p[0] for p in pts], [p[1] for p in pts]
                contornos.append(((min(xs), min(ys), max(xs), max(ys)), pts))
    # pilar sem hachura: polilinha fechada ou linhas que fecham um contorno, na camada de contorno
    lado_max = LADO_MAX_PILAR_CM / CM_POR_PONTO_1_50
    linhas = []
    for e in msp.query("LWPOLYLINE LINE"):
        if e.dxf.layer != cam["pilar_contorno"]:
            continue
        if e.dxftype() == "LINE":
            linhas.append((P(e.dxf.start.x, e.dxf.start.y), P(e.dxf.end.x, e.dxf.end.y)))
            continue
        vv = [P(x, y) for x, y in e.get_points("xy")]
        if e.closed or (len(vv) > 3 and math.dist(vv[0], vv[-1]) < 0.2):
            contornos.append(_contorno(vv))
        else:
            linhas += list(zip(vv, vv[1:]))
    for laco in _lacos(linhas):
        c = _contorno(laco)
        if c[0][2] - c[0][0] <= lado_max and c[0][3] - c[0][1] <= lado_max:
            contornos.append(c)
    # pilar desenhado como bloco (ex.: pilar circular): o contorno é o desenho do bloco
    for ins in msp.query("INSERT"):
        if ins.dxf.layer != cam["pilar_contorno"]:
            continue
        pts = []
        try:
            for v in ins.virtual_entities():
                tipo = v.dxftype()
                if tipo == "CIRCLE":
                    c, r0 = v.dxf.center, v.dxf.radius
                    pts = [P(c.x + r0 * math.cos(a / 12 * math.pi), c.y + r0 * math.sin(a / 12 * math.pi)) for a in range(24)]
                elif tipo in ("HATCH", "LWPOLYLINE") and not pts:
                    caminhos = ezdxf.path.from_hatch(v) if tipo == "HATCH" else [ezdxf.path.make_path(v)]
                    for cam_ in caminhos:
                        pts = [P(q.x, q.y) for q in cam_.flattening(distance=0.5)]
                        break
                if tipo == "CIRCLE":
                    break
        except Exception:  # bloco que não explode: fica sem contorno
            continue
        if len(pts) >= 3:
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            if max(xs) - min(xs) <= lado_max and max(ys) - min(ys) <= lado_max:
                contornos.append(((min(xs), min(ys), max(xs), max(ys)), pts))
    usados: set[int] = set()
    vistos: set[str] = set()
    for t in textos:
        m = RE_PILAR.fullmatch(t.texto)
        if t.camada != cam["pilar_rotulo"] or not m or t.texto in vistos:
            continue
        vistos.add(t.texto)
        cx, cy = t.centro
        melhor = None
        for k, ((x0, y0, x1, y1), _) in enumerate(contornos):
            if k in usados:
                continue
            d = math.hypot(max(x0 - cx, 0, cx - x1), max(y0 - cy, 0, cy - y1))
            if d <= DIST_PILAR and (melhor is None or d < melhor[0]):
                melhor = (d, k)
        if melhor is None:
            sem_contorno.append(t.texto)
            continue
        usados.add(melhor[1])
        pts = contornos[melhor[1]][1]
        secao = perto(t, RE_SECAO, t.camada, DIST_SECAO)
        if not secao:  # pilar circular: só o diâmetro ("Ø70")
            d = perto(t, RE_DIAMETRO, t.camada, DIST_SECAO)
            secao = "D" + re.sub(r"\D", "", d) if d else ""
        pecas.append({"tipo": "P", "nome": t.texto, "secao": secao,
                      "rotulo": [round(cx, 2), round(cy, 2)], "polys": [[[round(x, 2), round(y, 2)] for x, y in pts]]})

    # ---- vigas: par de faces ao lado do rótulo
    ignorar = set(cam.get("ignorar") or ())
    hs, vs, segs = [], [], []
    for e in msp.query("LINE LWPOLYLINE"):
        if e.dxf.layer in ignorar:
            continue
        if e.dxftype() == "LINE":
            trechos = [(P(e.dxf.start.x, e.dxf.start.y), P(e.dxf.end.x, e.dxf.end.y))]
        else:
            vv = [P(x, y) for x, y in e.get_points("xy")]
            if e.closed:
                vv.append(vv[0])
            trechos = list(zip(vv, vv[1:]))
        for a, b in trechos:
            if math.hypot(b[0] - a[0], b[1] - a[1]) > 3:
                segs.append((a[0], a[1], b[0], b[1]))
            if abs(a[1] - b[1]) < 0.3 and abs(a[0] - b[0]) > 3:
                hs.append((round((a[1] + b[1]) / 2, 1), min(a[0], b[0]), max(a[0], b[0])))
            elif abs(a[0] - b[0]) < 0.3 and abs(a[1] - b[1]) > 3:
                vs.append((round((a[0] + b[0]) / 2, 1), min(a[1], b[1]), max(a[1], b[1])))
    vigas: dict[str, dict] = {}
    for t in textos:
        if t.camada != cam["viga_rotulo"] or not RE_VIGA.fullmatch(t.texto):
            continue
        v = vigas.setdefault(t.texto, {"polys": [], "caixas": [], "secao": "", "rotulo": None})
        v["secao"] = v["secao"] or perto(t, RE_SECAO, t.camada, DIST_SECAO_VIGA)
        larg = largura_da_busca(v["secao"])
        r = pymupdf.Rect(*t.caixa)
        poly = None
        for h in ((True, False) if t.horizontal else (False, True)):
            fx = estrutura.faixa_reta(r, h, hs if h else vs, [], larg)
            if fx is not None:
                poly = caixa(fx)
                break
        if poly is None:  # desenho girado ou viga inclinada: gira até a viga ficar deitada (leitor da obra)
            poly = estrutura.faixa_inclinada(r, segs, larg)
        if poly is None:
            continue
        xs, ys = [p[0] for p in poly], [p[1] for p in poly]
        cx0 = pymupdf.Rect(min(xs), min(ys), max(xs), max(ys))
        if not any(o.intersects(cx0) for o in v["caixas"]):
            v["caixas"].append(cx0)
            v["polys"].append(poly)
        v["rotulo"] = v["rotulo"] or [round(c, 2) for c in t.centro]
    for nome in sorted(vigas, key=lambda n: (len(n), n)):
        v = vigas[nome]
        if not v["polys"]:
            sem_contorno.append(nome)
            continue
        pecas.append({"tipo": "V", "nome": nome, "secao": v["secao"], "rotulo": v["rotulo"], "polys": v["polys"]})

    # ---- lajes: rótulo, espessura e, se der, o contorno (a menor região fechada pelas linhas em volta do rótulo)
    de_laje = set(cam.get("laje_contorno") or ())
    bordas = []
    for e in msp.query("LINE LWPOLYLINE ARC"):
        if e.dxf.layer not in de_laje:
            continue
        if e.dxftype() == "LINE":
            vv = [P(e.dxf.start.x, e.dxf.start.y), P(e.dxf.end.x, e.dxf.end.y)]
        else:  # polilinha e arco: bordas curvas também fecham laje
            vv = [P(q.x, q.y) for q in ezdxf.path.make_path(e).flattening(distance=0.5)]
        bordas += [(a[0], a[1], b[0], b[1]) for a, b in zip(vv, vv[1:])]
    # a laje desenhada como hachura (é o que o Revit exporta) vale mais que a região fechada pelas linhas
    hachuras = []
    for h in msp.query("HATCH"):
        if h.dxf.layer in de_laje and h.dxf.layer != cam["pilar_contorno"]:
            hachuras += [[P(v.x, v.y) for v in c.flattening(distance=0.5)] for c in ezdxf.path.from_hatch(h)]
    regioes = _regioes([], hachuras) + _regioes(bordas)
    vistas: set[str] = set()
    for t in textos:
        if t.camada != cam["laje_rotulo"] or not RE_LAJE.fullmatch(t.texto) or t.texto in vistas:
            continue
        vistas.add(t.texto)
        h = perto(t, RE_ESPESSURA, t.camada, DIST_SECAO)
        laje = {"tipo": "L", "nome": t.texto, "secao": re.sub(r"(?i)h=", "h", h) if h else "",
                "rotulo": [round(c, 2) for c in t.centro]}
        poly = _regiao_do_ponto(regioes, t.centro)
        if poly:
            laje["polys"] = [poly]
        lajes.append(laje)
    lajes.sort(key=lambda l: (len(l["nome"]), l["nome"]))

    return {"largura": round((xmax - xmin) * escala), "altura": round((ymax - ymin) * escala), "pecas": pecas,
            "lajes": lajes, "sem_contorno": sem_contorno, "extensao": [xmin, ymin, xmax, ymax], "escala": escala}


def extensao_do_cad(dxf: str | pathlib.Path) -> tuple[float, float, float, float]:
    """EXTMIN/EXTMAX gravados pelo AutoCAD no DXF: é a extensão que o plotar_dwg.py usa ao plotar o Model ("E")."""
    h = ezdxf.readfile(str(dxf)).header
    (x0, y0, *_), (x1, y1, *_) = h["$EXTMIN"], h["$EXTMAX"]
    return x0, y0, x1, y1


def na_folha(resultado: dict, extensao_cad: tuple[float, float, float, float], largura: float, altura: float) -> dict:
    """Passa as coordenadas do leitor para a folha plotada pelo plotar_dwg.py (Model inteiro, "cabe na folha",
    centrado), na página como ela aparece (largura x altura, y para baixo). Devolve um resultado novo."""
    ex0, ey0, ex1, ey1 = extensao_cad
    s = min(largura / (ex1 - ex0), altura / (ey1 - ey0))
    ox, oy = (largura - s * (ex1 - ex0)) / 2, (altura - s * (ey1 - ey0)) / 2
    xmin, _ymin, _xmax, ymax = resultado["extensao"]
    e = resultado["escala"]

    def ponto(p):
        x, y = p[0] / e + xmin, ymax - p[1] / e
        return [round(ox + s * (x - ex0), 2), round(oy + s * (ey1 - y), 2)]

    pecas = [{**p, "rotulo": ponto(p["rotulo"]), "polys": [[ponto(q) for q in poly] for poly in p["polys"]]}
             for p in resultado["pecas"]]
    lajes = [{**l, "rotulo": ponto(l["rotulo"]),
              **({"polys": [[ponto(q) for q in poly] for poly in l["polys"]]} if l.get("polys") else {})}
             for l in resultado["lajes"]]
    return {**resultado, "largura": round(largura), "altura": round(altura), "pecas": pecas, "lajes": lajes}

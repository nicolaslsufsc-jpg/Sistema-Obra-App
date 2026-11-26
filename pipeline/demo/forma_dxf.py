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
LARGURA_MAX_CM = 300.0  # viga mais larga que isso não é procurada pelas faces (viga-faixa, laje); a VP de 240 cm entra


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


DIST_FAIXA = 50.0  # pontos (~90 cm) entre o rótulo da viga e a hachura dela


def _hachuras(entidades, P, profundidade: int = 0):
    """(camada, anel) de cada hachura, também dentro de blocos (até 2 níveis), em coordenadas da página."""
    for e in entidades:
        if e.dxftype() == "INSERT" and profundidade < 2:
            try:
                yield from _hachuras(e.virtual_entities(), P, profundidade + 1)
            except Exception:  # bloco que não explode
                continue
        elif e.dxftype() == "HATCH":
            for c in ezdxf.path.from_hatch(e):
                pts = [P(q.x, q.y) for q in c.flattening(distance=1)]
                if len(pts) >= 3:
                    yield e.dxf.layer, pts


def _faixas_hachuradas(msp, P, cam: dict, textos) -> list:
    """Hachuras compridas (comprimento >= 3x a largura média, largura de 10 a 300 cm) que podem ser viga.
    Ficam de fora as camadas de pilar, as de "ignorar" e as camadas cujas hachuras são lajes (contêm o rótulo de
    uma laje). Precisa do shapely; sem ele, nenhuma."""
    try:
        from shapely.geometry import Point, Polygon
    except ImportError:
        return []
    todas = [(c, Polygon(a).buffer(0)) for c, a in _hachuras(msp, P)]
    lajes = [Point(t.centro) for t in textos if t.camada == cam["laje_rotulo"] and RE_LAJE.fullmatch(t.texto)]
    fora = set(cam.get("ignorar") or ()) | {cam["pilar_contorno"], cam["pilar_rotulo"]}
    fora |= {c for c, g in todas if any(g.contains(p) for p in lajes)}
    faixas = []
    for c, g in todas:
        if c in fora or g.is_empty or g.length == 0:
            continue
        larg = 2 * g.area / g.length * CM_POR_PONTO_1_50  # largura média em cm (faixa longa: 2·área/perímetro)
        compr = g.length / 2 * CM_POR_PONTO_1_50
        if 10 <= larg <= 300 and compr >= 3 * larg:
            faixas.append(g)
    return faixas


def _faixa_mais_perto(faixas, ponto, largura_cm: float | None = None) -> list[list[float]] | None:
    """A hachura comprida mais perto do ponto (até DIST_FAIXA); com largura_cm, só as de largura média entre
    0,7 e 1,3 vez essa."""
    from shapely.geometry import Point
    alvo = Point(ponto)
    perto = [(g.distance(alvo), k) for k, g in enumerate(faixas)
             if largura_cm is None or 0.7 <= 2 * g.area / g.length * CM_POR_PONTO_1_50 / largura_cm <= 1.3]
    perto = [p for p in perto if p[0] <= DIST_FAIXA]
    if not perto:
        return None
    g = faixas[min(perto)[1]]
    g = max(getattr(g, "geoms", [g]), key=lambda x: x.area).simplify(0.5)
    return [[round(x, 2), round(y, 2)] for x, y in list(g.exterior.coords)[:-1]]


def _lajes_hachuradas(msp, P, cam: dict, textos) -> list:
    """Polígonos das hachuras que contêm o rótulo de uma laje. Precisa do shapely; sem ele, nenhum."""
    try:
        from shapely.geometry import Point, Polygon
    except ImportError:
        return []
    lajes = [Point(t.centro) for t in textos if t.camada == cam["laje_rotulo"] and RE_LAJE.fullmatch(t.texto)]
    polys = [Polygon(a).buffer(0) for _, a in _hachuras(msp, P)]
    return [g for g in polys if not g.is_empty and any(g.contains(p) for p in lajes)]


def _vao_entre_lajes(lajes, centro, direcao: float, largura_cm: float) -> list[list[float]] | None:
    """Viga que só aparece como o vão entre duas lajes hachuradas (comum nas protendidas): na perpendicular ao
    rótulo, o vão entre bordas de laje com 0,7 a 1,3 vez a largura da seção, mais perto do rótulo; depois o vão
    é seguido na direção do rótulo até bater numa laje ou sair do pavimento. Devolve o retângulo."""
    if not lajes:
        return None
    from shapely.geometry import LineString, Point
    from shapely.ops import unary_union
    todas = unary_union(lajes)
    casco = todas.convex_hull
    a = math.radians(direcao)
    ux, uy = math.cos(a), math.sin(a)
    nx, ny = -uy, ux
    cx, cy = centro
    w = largura_cm / CM_POR_PONTO_1_50
    alcance = 1.5 * w + 20
    corte = LineString([(cx - nx * alcance, cy - ny * alcance), (cx + nx * alcance, cy + ny * alcance)])
    cruz = corte.intersection(todas.boundary)
    ts = sorted({round((q.x - cx) * nx + (q.y - cy) * ny, 2) for q in getattr(cruz, "geoms", [cruz])
                 if isinstance(q, Point)})
    melhor = None
    for t1, t2 in zip(ts, ts[1:]):
        meio = (t1 + t2) / 2
        if not 0.7 <= (t2 - t1) / w <= 1.3 or todas.contains(Point(cx + nx * meio, cy + ny * meio)):
            continue
        if melhor is None or abs(meio) < abs(melhor[0]):
            melhor = (meio, t1, t2)
    if melhor is None:
        return None
    meio, t1, t2 = melhor
    mx, my = cx + nx * meio, cy + ny * meio

    def livre(d):
        q = Point(mx + ux * d, my + uy * d)
        return casco.contains(q) and not todas.contains(q)

    passo, ida, volta = 2.0, 0.0, 0.0
    while livre(ida + passo) and ida < 5000:
        ida += passo
    while livre(volta - passo) and volta > -5000:
        volta -= passo
    if ida - volta < 2 * w:  # vão curto não é viga
        return None
    cantos = [(volta, t1), (ida, t1), (ida, t2), (volta, t2)]
    return [[round(cx + ux * sv + nx * tv, 2), round(cy + uy * sv + ny * tv, 2)] for sv, tv in cantos]


DIST_SEMENTE = 25.0  # pontos (~44 cm) entre o rótulo e um pedaço hachurado da viga
PEDACOS_MIN = 3  # viga em pedaços: pelo menos 3 pedaços encadeados (uma viga reta hachurada é um pedaço só)


def _pedacos_hachurados(msp, P, cam: dict, textos) -> list:
    """(camada, polígono, largura média em cm) das hachuras de 10 a 300 cm de largura e até 4 m de comprimento,
    fora das camadas de pilar, de laje e de "ignorar". Precisa do shapely; sem ele, nenhuma."""
    try:
        from shapely.geometry import Point, Polygon
    except ImportError:
        return []
    todas = [(c, Polygon(a).buffer(0)) for c, a in _hachuras(msp, P)]
    lajes = [Point(t.centro) for t in textos if t.camada == cam["laje_rotulo"] and RE_LAJE.fullmatch(t.texto)]
    fora = set(cam.get("ignorar") or ()) | {cam["pilar_contorno"], cam["pilar_rotulo"]}
    fora |= {c for c, g in todas if any(g.contains(p) for p in lajes)}
    out = []
    for c, g in todas:
        if c in fora or g.is_empty or g.length == 0:
            continue
        larg = 2 * g.area / g.length * CM_POR_PONTO_1_50
        if 10 <= larg <= 300 and g.length / 2 * CM_POR_PONTO_1_50 <= 400:
            out.append((c, g, larg))
    return out


def _direcao(g) -> float:
    """Direção (graus, 0 a 180) do lado maior do retângulo mínimo em volta do pedaço."""
    (x0, y0), (x1, y1), (x2, y2) = list(g.minimum_rotated_rectangle.exterior.coords)[:3]
    a, b = (x1 - x0, y1 - y0), (x2 - x1, y2 - y1)
    lx, ly = a if math.hypot(*a) >= math.hypot(*b) else b
    return math.degrees(math.atan2(ly, lx)) % 180


def _mesma_direcao(g, h, tol: float = 20.0) -> bool:
    """Pedaços vizinhos da mesma viga curva mudam pouco de direção; uma viga reta que chega em T muda muito."""
    d = abs(_direcao(g) - _direcao(h)) % 180
    return min(d, 180 - d) <= tol


def _cadeia_da_viga(pedacos, rotulos, outros_rotulos, vizinhas) -> list | None:
    """rotulos: (centro, direção na página). Pedaços perto dos rótulos da viga e os que se encostam neles (mesma camada, largura parecida), sem passar
    por pedaço perto do rótulo de outra viga ou dentro do contorno já achado de outra viga. Com PEDACOS_MIN ou
    mais, devolve o contorno da união (um polígono por trecho contínuo); senão, None."""
    import statistics

    from shapely.geometry import Point, Polygon
    from shapely.ops import unary_union
    meus = [(Point(c), a) for c, a in rotulos]
    deles = [Point(c) for c in outros_rotulos]
    ocupado = unary_union([Polygon(q).buffer(0) for q in vizinhas]) if vizinhas else None

    def livre(g):
        if any(g.distance(p) < DIST_SEMENTE for p in deles):
            return False
        return ocupado is None or g.intersection(ocupado).area < 0.5 * g.area

    def junto(g, p, a):  # perto do rótulo e na direção em que ele está escrito (o nome vai ao longo da viga)
        d = abs(_direcao(g) - a) % 180
        return g.distance(p) < DIST_SEMENTE and min(d, 180 - d) <= 20

    semente = {k for k, (_, g, _) in enumerate(pedacos) if livre(g) and any(junto(g, p, a) for p, a in meus)}
    if not semente:
        return None
    camadas = {pedacos[k][0] for k in semente}
    w = statistics.median(pedacos[k][2] for k in semente)
    grupo, mudou = set(semente), True
    while mudou:
        mudou = False
        for k, (c, g, larg) in enumerate(pedacos):
            if k in grupo or c not in camadas or not 0.6 <= larg / w <= 1.6 or not livre(g):
                continue
            if any(g.distance(pedacos[j][1]) < 1.0 and _mesma_direcao(g, pedacos[j][1]) for j in grupo):
                grupo.add(k)
                mudou = True
    if len(grupo) < PEDACOS_MIN:
        return None
    u = unary_union([pedacos[k][1].buffer(0.6) for k in grupo]).buffer(-0.6)
    partes = [g.simplify(0.5) for g in getattr(u, "geoms", [u]) if g.area > 0]
    return [[[round(x, 2), round(y, 2)] for x, y in list(g.exterior.coords)[:-1]] for g in partes] or None


def _dentro_da_cadeia(polys, cadeia) -> bool:
    """O contorno (polys) está, na maior parte, dentro da cadeia (é um pedaço reto da viga curva)?"""
    if not polys:
        return True
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    antes = unary_union([Polygon(q).buffer(0) for q in polys])
    depois = unary_union([Polygon(q).buffer(0) for q in cadeia]).buffer(1.0)
    return antes.area > 0 and antes.intersection(depois).area >= 0.7 * antes.area


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

    def perto(t: Texto, rx, camada: str, dist: float, mesmo_angulo: bool = False) -> str:
        """Texto mais perto do rótulo; com mesmo_angulo, o escrito na mesma direção do rótulo vem antes (a seção
        da viga fica ao lado do nome dela, e a de uma viga vizinha pode estar mais perto em outra direção)."""
        cx, cy = t.centro
        melhor = None
        for o in textos:
            if o is t or o.camada != camada or not rx.fullmatch(o.texto):
                continue
            d = math.hypot(o.centro[0] - cx, o.centro[1] - cy)
            dif = abs(o.angulo - t.angulo) % 180
            torto = mesmo_angulo and min(dif, 180 - dif) > 5
            if d <= dist and (melhor is None or (torto, d) < melhor[0]):
                melhor = ((torto, d), o.texto)
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
    faixas = None  # hachuras que podem ser viga: só lidas se alguma viga não tiver faces retas
    lajes_h = None  # hachuras das lajes (para a viga que é só o vão entre elas)
    for t in textos:
        if t.camada != cam["viga_rotulo"] or not RE_VIGA.fullmatch(t.texto):
            continue
        sec = perto(t, RE_SECAO, t.camada, DIST_SECAO_VIGA, mesmo_angulo=True)
        nome = t.texto
        antes = vigas.get(nome, {}).get("secao") or ""
        if sec and antes and sec.split("x")[0] != antes.split("x")[0]:
            # duas vigas diferentes com o mesmo nome no pavimento (larguras diferentes): a segunda vira
            # "VP1(140x63)". Mesma largura e outra altura é a mesma viga com vãos diferentes (fica uma só).
            nome = f"{t.texto}({sec})"  # sem espaço: o núcleo não aceita espaço no nome da peça
        v = vigas.setdefault(nome, {"polys": [], "caixas": [], "secao": "", "rotulo": None, "rotulos": []})
        v["rotulos"].append((t.centro, (-t.angulo) % 180))  # direção na página (y para baixo)
        v["secao"] = v["secao"] or sec
        larg = largura_da_busca(v["secao"])
        r = pymupdf.Rect(*t.caixa)
        poly = None
        sec_cm = re.match(r"(\d+)x", v["secao"] or "")
        if sec_cm and float(sec_cm.group(1)) > 60:  # viga larga (protendida) costuma vir hachurada: a hachura da
            if faixas is None:                       # largura da seção, ao lado do rótulo, vale antes das faces
                faixas = _faixas_hachuradas(msp, P, cam, textos)
            poly = _faixa_mais_perto(faixas, t.centro, float(sec_cm.group(1)))
            if poly is None:  # sem hachura própria: o vão entre as lajes hachuradas, na direção do rótulo
                if lajes_h is None:
                    lajes_h = _lajes_hachuradas(msp, P, cam, textos)
                poly = _vao_entre_lajes(lajes_h, t.centro, (-t.angulo) % 180, float(sec_cm.group(1)))
        for h in (() if poly else (True, False) if t.horizontal else (False, True)):
            fx = estrutura.faixa_reta(r, h, hs if h else vs, [], larg)
            if fx is not None:
                poly = caixa(fx)
                break
        if poly is None:  # desenho girado ou viga inclinada: gira até a viga ficar deitada (leitor da obra)
            poly = estrutura.faixa_inclinada(r, segs, larg)
        if poly is None:  # sem faces retas (viga curva, ou só hachura, comum nas protendidas): a hachura comprida
            if faixas is None:  # mais perto do rótulo, fora das camadas de pilar, de laje e de "ignorar"
                faixas = _faixas_hachuradas(msp, P, cam, textos)
            larg_sec = re.match(r"(\d+)x", v["secao"] or "")
            poly = _faixa_mais_perto(faixas, t.centro, float(larg_sec.group(1)) if larg_sec else None)
        if poly is None:
            continue
        xs, ys = [p[0] for p in poly], [p[1] for p in poly]
        cx0 = pymupdf.Rect(min(xs), min(ys), max(xs), max(ys))
        if not any(o.intersects(cx0) for o in v["caixas"]):
            v["caixas"].append(cx0)
            v["polys"].append(poly)
        v["rotulo"] = v["rotulo"] or [round(c, 2) for c in t.centro]
    # viga curva desenhada em pedaços retos hachurados (um por trecho): a cadeia de pedaços vira um contorno só
    pedacos = _pedacos_hachurados(msp, P, cam, textos)
    if pedacos:
        for nome, v in vigas.items():
            outros = [c for n, o in vigas.items() if n != nome for c, _ in o["rotulos"]]
            vizinhas = [q for n, o in vigas.items() if n != nome for q in o["polys"]]
            cadeia = _cadeia_da_viga(pedacos, v["rotulos"], outros, vizinhas)
            if cadeia:  # a cadeia entra no lugar dos pedaços que estão dentro dela; o resto da viga fica
                v["polys"] = cadeia + [q for q in v["polys"] if not _dentro_da_cadeia([q], cadeia)]
                v["rotulo"] = v["rotulo"] or [round(c, 2) for c in v["rotulos"][0][0]]
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

"""
Gerador do app de conferencia (FVS) - planta de forma clicavel com pilares e vigas.

Uso:
  python3 gerador_fvs.py --config config.exemplo.json   (o config da obra fica fora do repositório)

config.json:
{
  "obra": "EXE", "nome_obra": "Obra Exemplo", "pavimento": "Pavimento tipo", "chave": "EXE-PAVTIP",
  "formas": [{"trecho": "Trecho 1", "pdf": "in/forma/001.pdf"}, ...],
  "det_pilares": ["in/pil/010.pdf", ...],
  "det_vigas": ["in/vig/020.pdf", ...],
  "itens": "itens_fvs.exemplo.json",
  "modelo": "modelo_app.html",
  "saida": "saida"
}

Depende de PDFs exportados do AutoCAD (ex.: Eberick) com:
  - layers preservadas: PILAR_CONCRETO e VIG_FACES na forma;
    CORTE_LINHAS_DA_TABELA_DE_DETALHE nas pranchas de pilar
  - textos SHX exportados como comentarios (o nome "P124" ou "V 132" fica legivel no PDF)
"""
import argparse, base64, io, json, os, re, sys
import numpy as np
import pymupdf as fitz
from PIL import Image
from scipy import ndimage

TILE = 512
ESCALA_MAX = 2
NIVEIS = [-2, -1, 0, 1]
RE_PILAR = re.compile(r"P\d+[a-z]*")
RE_DIM = re.compile(r"\((\d+)x(\d+)\)")
RE_VIGA = re.compile(r"V ?\d+[A-Za-z]*")
RE_SEC_VIGA = re.compile(r"[ab]: ?(\d+/\d+)")
DET_ESCALA = 2.4
PREFIXO = ""


def b64webp(im, **kw):
    b = io.BytesIO()
    im.save(b, "WEBP", **kw)
    return base64.b64encode(b.getvalue()).decode()


def render(page, clip, escala):
    pix = page.get_pixmap(matrix=fitz.Matrix(escala, escala), clip=clip, annots=False, colorspace=fitz.csGRAY)
    im = Image.frombytes("L", (pix.width, pix.height), pix.samples).point(lambda v: min(255, round(v / 85) * 85))
    return b64webp(im, lossless=True, method=6)


def nome_viga(c):
    return "V" + c.replace("V", "").strip()


# ----------------------------------------------------------------------------- planta de forma

def tiles_da_forma(page):
    pix = page.get_pixmap(matrix=fitz.Matrix(ESCALA_MAX, ESCALA_MAX), annots=False)
    base = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    tiles = {}
    for z in NIVEIS:
        f = (2 ** z) / ESCALA_MAX
        im = base if f == 1 else base.resize((max(1, round(base.width * f)), max(1, round(base.height * f))), Image.LANCZOS)
        for ty in range(0, im.height, TILE):
            for tx in range(0, im.width, TILE):
                t = Image.new("RGB", (TILE, TILE), "white")
                t.paste(im.crop((tx, ty, min(tx + TILE, im.width), min(ty + TILE, im.height))), (0, 0))
                if t.convert("L").getextrema()[0] > 250:
                    continue
                t = t.quantize(colors=24, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
                tiles[f"{z}/{tx // TILE}/{ty // TILE}"] = b64webp(t, lossless=True, method=4)
    return tiles


def anotacoes(page):
    M = page.rotation_matrix
    return [(a.info.get("content", "").strip(), a.rect * M) for a in page.annots()]


def textos_soltos(page, anns):
    """Linhas de texto comum do PDF que nenhum comentario cobre. Em algumas pranchas de viga parte dos
    detalhes vem com o texto como fonte de verdade (ex.: "V 145" e "Escala vigas 1:50"), sem o comentario SHX
    que o resto da prancha tem; sem isto, o leitor nao acha o titulo e a viga fica sem detalhe."""
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            txt = " ".join(s["text"] for s in l["spans"]).strip()
            txt = re.sub(r"\s+", " ", txt)
            if not txt:
                continue
            r = fitz.Rect(l["bbox"])
            if any(r.intersects(ra) for _, ra in anns):
                continue
            out.append((txt, r))
    return out


def ret(r):
    return [round(r.x0, 1), round(r.y0, 1), round(r.x1, 1), round(r.y1, 1)]


def toca(z, r):
    """Sobreposicao que tambem vale para linhas (retangulo de altura ou largura zero)."""
    return not z.is_empty and r.x0 <= z.x1 and r.x1 >= z.x0 and r.y0 <= z.y1 and r.y1 >= z.y0


def dist_ret(a, b):
    dx = max(a.x0 - b.x1, b.x0 - a.x1, 0)
    dy = max(a.y0 - b.y1, b.y0 - a.y1, 0)
    return (dx * dx + dy * dy) ** 0.5


def pilares_da_forma(page, anns):
    """Rotulo Pxx com secao '(axb)' logo abaixo -> contorno mais proximo na layer PILAR_CONCRETO."""
    M = page.rotation_matrix
    quads = []
    for d in page.get_drawings():
        if d.get("layer") != "PILAR_CONCRETO":
            continue
        for it in d["items"]:
            if it[0] == "qu":
                q = it[1]
                quads.append([q.ul * M, q.ur * M, q.lr * M, q.ll * M])
            elif it[0] == "re":
                r = it[1] * M
                quads.append([r.tl, r.tr, r.br, r.bl])
    qrects = [fitz.Rect(min(p.x for p in q), min(p.y for p in q), max(p.x for p in q), max(p.y for p in q)) for q in quads]
    dims = [(c, r) for c, r in anns if RE_DIM.fullmatch(c)]
    cand = {}
    for nome, r in anns:
        if not RE_PILAR.fullmatch(nome):
            continue
        cx = (r.x0 + r.x1) / 2
        secs, yref = [], r.y1
        for c, dr in sorted(dims, key=lambda x: x[1].y0):        # secoes empilhadas logo abaixo do nome
            if abs((dr.x0 + dr.x1) / 2 - cx) < 22 and -9 < dr.y0 - yref < 12:
                secs.append(c.strip("()"))
                yref = dr.y1
        if not secs:
            continue
        i = min(range(len(qrects)), key=lambda k: dist_ret(qrects[k], r)) if qrects else None
        d = dist_ret(qrects[i], r) if i is not None else 1e9
        poly = [[round(p.x, 2), round(p.y, 2)] for p in quads[i]] if d < 80 else None
        rot = r
        for c, dr in dims:
            if c.strip("()") in secs and abs((dr.x0 + dr.x1) / 2 - cx) < 22 and 0 <= dr.y0 - r.y0 < 40:
                rot = rot | dr
        reg = {"tipo": "P", "secao": " / ".join(dict.fromkeys(secs)), "polys": [poly] if poly else [],
               "rotulo": ret(rot), "dist": round(d, 1)}
        ant = cand.get(nome)
        if ant is None or (not ant["polys"] and poly) or (poly and ant["polys"] and d < ant["dist"]):
            cand[nome] = reg
    return cand


def segmentos_vigas(page):
    M = page.rotation_matrix
    hs, vs = [], []
    for d in page.get_drawings():
        if d.get("layer") != "VIG_FACES":
            continue
        for it in d["items"]:
            if it[0] != "l":
                continue
            a, b = it[1] * M, it[2] * M
            if abs(a.y - b.y) < 0.3 and abs(a.x - b.x) > 1:
                hs.append((round((a.y + b.y) / 2, 1), min(a.x, b.x), max(a.x, b.x)))
            elif abs(a.x - b.x) < 0.3 and abs(a.y - b.y) > 1:
                vs.append((round((a.x + b.x) / 2, 1), min(a.y, b.y), max(a.y, b.y)))
    return hs, vs


def intervalos(segs, linha, tol=0.6):
    iv = sorted((s0, s1) for l, s0, s1 in segs if abs(l - linha) <= tol)
    out = []
    for s0, s1 in iv:
        if out and s0 <= out[-1][1] + 1.5:
            out[-1][1] = max(out[-1][1], s1)
        else:
            out.append([s0, s1])
    return out


def faixa_da_viga(lbl, horizontal, segs, outros):
    """Acha o par de faces paralelas ao lado do rotulo e estende ao longo do eixo."""
    if horizontal:
        c_ax, c_tr, t0, t1 = (lbl.x0 + lbl.x1) / 2, (lbl.y0 + lbl.y1) / 2, lbl.y0, lbl.y1
        a0, a1 = lbl.x0, lbl.x1
    else:
        c_ax, c_tr, t0, t1 = (lbl.y0 + lbl.y1) / 2, (lbl.x0 + lbl.x1) / 2, lbl.x0, lbl.x1
        a0, a1 = lbl.y0, lbl.y1
    linhas = sorted({l for l, s0, s1 in segs if s0 - 25 <= c_ax <= s1 + 25 and abs(l - c_tr) < 40})
    melhor = None
    for i, la in enumerate(linhas):
        for lb in linhas[i + 1:]:
            w = lb - la
            if not 7 <= w <= 30:
                continue
            ia, ib = intervalos(segs, la), intervalos(segs, lb)
            if not any(s0 - 25 <= c_ax <= s1 + 25 for s0, s1 in ia) or not any(s0 - 25 <= c_ax <= s1 + 25 for s0, s1 in ib):
                continue
            d = 0 if la <= c_tr <= lb else min(abs(c_tr - la), abs(c_tr - lb), abs(t0 - lb), abs(t1 - la))
            if d > 22:
                continue
            if melhor is None or d < melhor[0] or (d == melhor[0] and w < melhor[2] - melhor[1]):
                melhor = (d, la, lb)
    if not melhor:
        return None
    _, la, lb = melhor
    iv = sorted(intervalos(segs, la) + intervalos(segs, lb))
    juntos = []
    for s0, s1 in iv:
        if juntos and s0 <= juntos[-1][1] + 2:
            juntos[-1][1] = max(juntos[-1][1], s1)
        else:
            juntos.append([s0, s1])
    # rotulos de outras vigas encostados nesta mesma faixa marcam inicio de outra viga
    cortes = [o0 for (o0, o1, otr) in outros if la - 24 <= otr <= lb + 24 and not (o0 <= c_ax <= o1)]
    k = min(range(len(juntos)), key=lambda j: 0 if juntos[j][0] - 25 <= c_ax <= juntos[j][1] + 25 else min(abs(juntos[j][0] - c_ax), abs(juntos[j][1] - c_ax)))
    ini, fim = juntos[k]
    j = k
    while j + 1 < len(juntos) and juntos[j + 1][0] - juntos[j][1] <= 45 and not any(juntos[j][1] - 5 < c <= juntos[j + 1][0] + 30 for c in cortes):
        j += 1
        fim = juntos[j][1]
    j = k
    while j - 1 >= 0 and juntos[j][0] - juntos[j - 1][1] <= 45 and not any(juntos[j - 1][1] - 5 < c <= juntos[j][0] + 30 for c in cortes) and juntos[j][0] > a0 - 25:
        j -= 1
        ini = juntos[j][0]
    for c in cortes:                       # outra viga comeca dentro do mesmo intervalo
        if c_ax < c < fim:
            fim = min(fim, c - 6)
        if ini < c < a0 - 30:
            ini = max(ini, c)
    if horizontal:
        return fitz.Rect(ini, la, fim, lb)
    return fitz.Rect(la, ini, lb, fim)


def vigas_da_forma(page, anns):
    hs, vs = segmentos_vigas(page)
    rot = [(nome_viga(c), r) for c, r in anns if RE_VIGA.fullmatch(c)]
    secs = [(m.group(1), r) for c, r in anns for m in [RE_SEC_VIGA.fullmatch(c)] if m]
    hor = [(r.x0, r.x1, (r.y0 + r.y1) / 2) for _, r in rot if r.width >= r.height]
    ver = [(r.y0, r.y1, (r.x0 + r.x1) / 2) for _, r in rot if r.width < r.height]
    res = {}
    for nome, r in rot:
        h = r.width >= r.height
        outros = [o for o in (hor if h else ver) if not (abs(o[0] - (r.x0 if h else r.y0)) < 0.5 and abs(o[2] - ((r.y0 + r.y1) / 2 if h else (r.x0 + r.x1) / 2)) < 0.5)]
        fx = faixa_da_viga(r, h, hs if h else vs, outros)
        reg = res.setdefault(nome, {"tipo": "V", "secao": "", "polys": [], "rotulo": ret(r), "_secs": []})
        if fx is None:
            continue
        reg["polys"].append([[round(fx.x0, 2), round(fx.y0, 2)], [round(fx.x1, 2), round(fx.y0, 2)],
                             [round(fx.x1, 2), round(fx.y1, 2)], [round(fx.x0, 2), round(fx.y1, 2)]])
        if reg["rotulo"] == ret(r) or len(reg["polys"]) == 1:
            reg["rotulo"] = ret(r)
        zona = fx + ((-26, -26, 26, 26))
        for s, sr in secs:
            sh = sr.width >= sr.height
            if sh == h and zona.intersects(sr):
                reg["_secs"].append(s)
    for reg in res.values():
        reg["secao"] = " / ".join(dict.fromkeys(reg.pop("_secs")))
    return res


# ----------------------------------------------------------------------------- pranchas de detalhe

EXCLUIR = {"A-FOLHA", "ALAN-FOLHA", "SELO", "TABELAS", "TEXTO_TABELAS", "TAB_MED_LINHAS", "TAB_MED_TEXTOS", "VIEW"}
RE_LISTA_P = re.compile(r"P\d+[a-z]*( ?= ?P\d+[a-z]*)*")
RE_LISTA_V = re.compile(r"V ?\d+[A-Za-z]*( ?= ?V ?\d+[A-Za-z]*)*")


def nomes_lista(c, viga):
    return [nome_viga(x) if viga else x.strip() for x in c.split("=")]


def componentes(page, filtro, rects_extra=(), s=0.25, dil=5, com_mascara=False):
    """Rotula grupos de desenho proximos (cada detalhe vira um grupo)."""
    W, H = page.rect.width, page.rect.height
    mask = np.zeros((int(H * s) + 2, int(W * s) + 2), bool)
    for r in [d["rect"] for d in page.get_drawings() if filtro(d)] + list(rects_extra):
        mask[int(r.y0 * s):int(r.y1 * s) + 1, int(r.x0 * s):int(r.x1 * s) + 1] = True
    lab, _ = ndimage.label(ndimage.binary_dilation(mask, iterations=dil) if dil else mask)
    if com_mascara:
        return lab, ndimage.find_objects(lab), s, mask
    return lab, ndimage.find_objects(lab), s


def caixa_comp(lab, objs, s, r, page):
    y, x = int((r.y0 + r.y1) / 2 * s), int((r.x0 + r.x1) / 2 * s)
    k = lab[min(y, lab.shape[0] - 1), min(x, lab.shape[1] - 1)]
    if k == 0:
        return None
    sl = objs[k - 1]
    return (fitz.Rect(sl[1].start / s, sl[0].start / s, sl[1].stop / s, sl[0].stop / s) + (-2, -2, 2, 2)) & page.rect


class Tabelas:
    """Tabelas de aco da prancha: acha a tabela que contem o rotulo e recorta as linhas do elemento."""
    def __init__(self, page, rotulos, anns=()):
        self.page = page
        self.totais = [r for c, r in anns if c.startswith("Total") or c.startswith("(x")]
        ds = [d for d in page.get_drawings() if d.get("layer") in ("TABELAS", "TEXTO_TABELAS")]
        self.area = fitz.Rect()
        for d in ds:
            self.area |= d["rect"]
        self.lab, self.objs, self.s = componentes(page, lambda d: d.get("layer") in ("TABELAS", "TEXTO_TABELAS"), s=0.5, dil=2)
        self.caixas = [fitz.Rect(sl[1].start / self.s, sl[0].start / self.s, sl[1].stop / self.s, sl[0].stop / self.s) for sl in self.objs]
        self.caixas = [c for c in self.caixas if c.width > 80 and c.height > 40]
        self.rot = [(c, r) for c, r in rotulos if self.contem(r)]

    def contem(self, r):
        return any(toca(c, r) for c in self.caixas)

    def recorte(self, nomes, viga):
        alvos = sorted([(c, r) for c, r in self.rot if set(nomes_lista(c, viga)) & set(nomes)], key=lambda x: x[1].y0)
        if not alvos:
            return None
        c, r = alvos[0]
        cx = caixa_comp(self.lab, self.objs, self.s, fitz.Rect(r.x0 - 1, r.y1 + 2, r.x1 + 1, r.y1 + 4), self.page)
        if cx is None or cx.width < 60:
            cx = caixa_comp(self.lab, self.objs, self.s, r, self.page)
        if cx is None:
            return None
        ult = max(rr.y0 for cc, rr in alvos if abs(rr.x0 - r.x0) < 60)
        prox = sorted(rr.y0 for cc, rr in self.rot if rr.y0 > ult + 2 and cx.contains(rr) and abs(rr.x0 - r.x0) < 60)
        if prox:
            y1 = prox[0] - 1.5
        else:                                      # ultimo da tabela: para no "Total" do elemento
            tt = sorted((t for t in self.totais if t.y0 > ult and cx.contains(t)), key=lambda t: t.y0)
            y1 = cx.y1
            if tt:
                y1 = tt[0].y1 + 2
                for t in tt[1:]:
                    if t.y0 - y1 < 6:
                        y1 = t.y1 + 2
        prim = min((rr.y0 for cc, rr in self.rot if cx.contains(rr)), default=r.y0)
        corpo = fitz.Rect(cx.x0, r.y0 - 3, cx.x1, y1)
        cab = fitz.Rect(cx.x0, cx.y0, cx.x1, prim - 3)
        if cab.height < 8 or cab.height > 60:
            return render(self.page, corpo, 3)
        a, b = [self.page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=c, annots=False, colorspace=fitz.csGRAY) for c in (cab, corpo)]
        ia, ib = [Image.frombytes("L", (p.width, p.height), p.samples) for p in (a, b)]
        im = Image.new("L", (max(ia.width, ib.width), ia.height + ib.height), 255)
        im.paste(ia, (0, 0)); im.paste(ib, (0, ia.height))
        return b64webp(im.point(lambda v: min(255, round(v / 85) * 85)), lossless=True, method=6)


QUADRO_MIN_ALTURA = 100  # pontos. Era 200 até 17/11/2026: o lance curto (Fundação > Subsolo) tem quadro de ~170
                         # e ficava de fora; o recorte caía em volta de outro rótulo com o mesmo nome.


def detalhes_pilares(pdfs):
    """nome -> detalhe. Mesmo nome em mais de um quadro: vale o último lido (uso no HTML da obra)."""
    out = {}
    for nome, cands in detalhes_pilares_todos(pdfs).items():
        com_quadro = [c for c in cands if c["quadro"]]
        out[nome] = com_quadro[-1] if com_quadro else cands[0]
    return out


def detalhes_pilares_todos(pdfs, nivel=None, nomes_procurados=None):
    """nome -> todos os detalhes lidos com esse nome, na ordem de leitura. Cada um traz "quadro" (se veio
    de um quadro de detalhe) e "niveis": as ordens dos níveis escritos no quadro, dadas por nivel(texto).
    nomes_procurados: se dado, só lê os rótulos que têm algum desses nomes (mais rápido)."""
    out = {}
    for caminho in pdfs:
        page = fitz.open(caminho)[0]
        quadros = [d["rect"] for d in page.get_drawings()
                   if d.get("layer") in ("CORTE_LINHAS_DA_TABELA_DE_DETALHE", "QUADRO_PILAR") and d["rect"].width > 250 and d["rect"].height > QUADRO_MIN_ALTURA]
        anns = anotacoes(page)
        rot = [(c, r) for c, r in anns if RE_LISTA_P.fullmatch(c)]
        tabs = Tabelas(page, rot, anns)
        selo = fitz.Rect()
        for d in page.get_drawings():
            if d.get("layer") == "SELO":
                selo |= d["rect"]
        comp = None
        for c, r in rot:
            if tabs.contem(r):
                continue
            nomes = nomes_lista(c, False)
            if nomes_procurados is not None and not any(n in nomes_procurados for n in nomes):
                continue
            # o menor quadro que contém o nome (quadro pequeno dentro de um maior fica com o pequeno)
            q = min((q for q in quadros if q.contains(r)), key=lambda q: q.width * q.height, default=None)
            em_quadro = q is not None
            if q is None:                          # pilar-parede sem quadro: usa o grupo de desenho
                if all(n in out for n in nomes):
                    continue
                if comp is None:
                    fora = lambda rr: not tabs.contem(rr) and not toca(selo, rr) and not any(toca(qq, rr) for qq in quadros)
                    comp = componentes(page, lambda d: d.get("layer") not in EXCLUIR and d.get("layer") != "CORTE_LINHAS_DA_TABELA_DE_DETALHE" and fora(d["rect"]) and d["rect"].width < page.rect.width * .6,
                                       [rr for cc, rr in anns if fora(rr)], s=0.5, dil=4)
                q = caixa_comp(*comp, r, page)
                if q is None or q.width > 900 or q.height > 700:
                    continue
            reg = {"titulo": "=".join(nomes), "prancha": PREFIXO + os.path.basename(caminho).replace(".pdf", ""),
                   "img": render(page, q + (-4, -4, 4, 4), DET_ESCALA), "tabela": tabs.recorte(nomes, False),
                   "quadro": em_quadro, "niveis": []}
            if em_quadro and nivel is not None:
                reg["niveis"] = sorted({o for t, rr in anns if q.contains(rr) for o in [nivel(t)] if o is not None})
            for n in nomes:
                out.setdefault(n, []).append(reg)
    return out


def detalhes_vigas(pdfs):
    out = {}
    for caminho in pdfs:
        page = fitz.open(caminho)[0]
        anns = anotacoes(page)
        # só os títulos (nome de viga e "Escala ..."): o resto do texto mudaria o agrupamento dos desenhos
        anns += [(c, r) for c, r in textos_soltos(page, anns) if RE_LISTA_V.fullmatch(c) or c.lower().startswith("escala")]
        rot = [(c, r) for c, r in anns if RE_LISTA_V.fullmatch(c)]
        tabs = Tabelas(page, rot, anns)
        selo = fitz.Rect()
        for d in page.get_drawings():
            if d.get("layer") == "SELO":
                selo |= d["rect"]
        carimbo = fitz.Rect(selo.x0 - 30, selo.y0 - 160, page.rect.x1, page.rect.y1) if not selo.is_empty else fitz.Rect()
        esc_tit = [r for c, r in anns if c.lower().startswith("escala vigas") and any(-3 < r.x0 - rr.x0 < 9 and 0 < r.y0 - rr.y0 < 15 for cc, rr in rot)]
        notas = []                                 # bloco de notas gerais ("Escala vigas" sem nome de viga em cima)
        for c, r in anns:
            if c.lower().startswith("escala vigas") and not any(abs(r.x0 - e.x0) < 2 and abs(r.y0 - e.y0) < 1 for e in esc_tit):
                z = fitz.Rect(r)
                for c2, r2 in anns:
                    if c2.lower().startswith("escala") and abs(r2.x0 - r.x0) < 2 and 0 < r2.y0 - r.y0 < 35:
                        z |= r2
                notas.append(z + (-25, -70, 25, 10))
        livre = lambda r: not tabs.contem(r)
        lab, objs, s, mask = componentes(page, lambda d: d.get("layer") not in EXCLUIR and livre(d["rect"]) and d["rect"].width < page.rect.width * .6,
                                         [r for c, r in anns if livre(r)], s=0.25, dil=2, com_mascara=True)
        caixas = [fitz.Rect(sl[1].start / s, sl[0].start / s, sl[1].stop / s, sl[0].stop / s) for sl in objs]
        titulos = []
        for e in [r for c, r in anns if c.lower().startswith("escala vigas")]:
            pilha = []
            ref = e
            while True:                            # nomes empilhados logo acima de "Escala vigas"
                cand = [(c, r) for c, r in rot if (c, r) not in pilha and -3 < ref.x0 - r.x0 < 9 and 0 < ref.y0 - r.y0 < 15]
                if not cand:
                    break
                c, r = max(cand, key=lambda x: x[1].y0)
                pilha.append((c, r))
                ref = r
            if pilha:
                nomes = []
                for c, r in reversed(pilha):
                    nomes += nomes_lista(c, True)
                titulos.append((nomes, pilha[-1][1]))
        # grupo com dois titulos dentro (detalhes encostados): quebra sem dilatacao
        sep = []
        for k, cxa in enumerate(caixas):
            dentro = [t for n, t in titulos if cxa.contains(fitz.Point((t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2))]
            if len(dentro) < 2:
                sep.append(cxa)
                continue
            sl = objs[k]
            sub = mask[sl] & (lab[sl] == k + 1)
            l2, _ = ndimage.label(sub)
            for sl2 in ndimage.find_objects(l2):
                sep.append(fitz.Rect((sl[1].start + sl2[1].start) / s, (sl[0].start + sl2[0].start) / s,
                                     (sl[1].start + sl2[1].stop) / s, (sl[0].start + sl2[0].stop) / s))
        caixas = sep
        # cada grupo de desenho vai para o titulo mais proximo acima e a esquerda dele
        regiao = {i: fitz.Rect(t) for i, (n, t) in enumerate(titulos)}
        for cxa in caixas:
            if cxa.height > 560 or cxa.width > 1500 or cxa.width * cxa.height > 600000:
                continue
            cc = fitz.Point((cxa.x0 + cxa.x1) / 2, (cxa.y0 + cxa.y1) / 2)
            if (not carimbo.is_empty and carimbo.contains(cc)) or any(z.contains(cc) for z in notas):
                continue
            melhor = None
            for i, (n, t) in enumerate(titulos):
                dy, dx = cxa.y0 - t.y0, max(0, cxa.x0 - t.x0)
                if dy < -40 or t.x0 > cxa.x1 + 10 or dy > 520 or dx > 1500:
                    continue
                sc = dy + 0.3 * dx
                if melhor is None or sc < melhor[0]:
                    melhor = (sc, i)
            if melhor:
                regiao[melhor[1]] |= cxa
        for i, (nomes, t) in enumerate(titulos):
            clip = (regiao[i] + (-4, -4, 4, 4)) & page.rect
            reg = {"titulo": "=".join(nomes), "prancha": PREFIXO + os.path.basename(caminho).replace(".pdf", ""),
                   "img": render(page, clip, DET_ESCALA), "tabela": tabs.recorte(nomes, True)}
            for n in nomes:
                out[n] = reg
    return out


# ----------------------------------------------------------------------------- montagem

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    a = ap.parse_args()
    cfg = json.load(open(a.config, encoding="utf-8"))
    global PREFIXO
    PREFIXO = cfg.get("prefixo_prancha", "")
    base = os.path.dirname(os.path.abspath(a.config))
    P = lambda x: os.path.join(base, x)

    print("lendo detalhes de pilares...")
    detP = detalhes_pilares([P(x) for x in cfg["det_pilares"]])
    print("  ", len(detP), "pilares detalhados")
    print("lendo detalhes de vigas...")
    detV = detalhes_vigas([P(x) for x in cfg["det_vigas"]])
    print("  ", len(detV), "vigas detalhadas")
    itens = json.load(open(P(cfg["itens"]), encoding="utf-8"))
    modelo = open(P(cfg["modelo"]), encoding="utf-8").read()
    leaflet_css = open(P(cfg.get("leaflet_css", "node_modules/leaflet/dist/leaflet.css"))).read()
    leaflet_js = open(P(cfg.get("leaflet_js", "node_modules/leaflet/dist/leaflet.js"))).read()
    os.makedirs(P(cfg["saida"]), exist_ok=True)

    relatorio, usadosP, usadosV = [], set(), set()
    trechos = [{"nome": f["trecho"], "arquivo": f["arquivo"]} for f in cfg["formas"]]
    for f in cfg["formas"]:
        page = fitz.open(P(f["pdf"]))[0]
        anns = anotacoes(page)
        pil = pilares_da_forma(page, anns)
        vig = vigas_da_forma(page, anns)
        elem, dets = {}, {}
        for nome, e in sorted(pil.items()):
            e.pop("dist", None)
            d = detP.get(nome)
            if d:
                dets.setdefault("P:" + d["titulo"], {k: d[k] for k in ("img", "tabela", "prancha")})
                e["detalhe"] = "P:" + d["titulo"]
                usadosP.add(nome)
            e["nome"] = nome
            elem["P:" + nome] = e
        for nome, e in sorted(vig.items()):
            d = detV.get(nome)
            if d:
                dets.setdefault("V:" + d["titulo"], {k: d[k] for k in ("img", "tabela", "prancha")})
                e["detalhe"] = "V:" + d["titulo"]
                usadosV.add(nome)
            e["nome"] = nome
            elem["V:" + nome] = e
        dados = {
            "obra": cfg["obra"], "pavimento": cfg["pavimento"], "trecho": f["trecho"], "trechos": trechos,
            "chave": cfg["chave"], "forma": os.path.basename(f.get("nome", f["pdf"])),
            "largura": page.rect.width, "altura": page.rect.height, "tile": TILE, "niveis": NIVEIS,
            "tiles": tiles_da_forma(page), "elementos": elem, "detalhes": dets, "itens": itens,
        }
        html = modelo.replace("/*LEAFLET_CSS*/", leaflet_css).replace("/*LEAFLET_JS*/", leaflet_js)
        html = html.replace("/*DADOS*/null", json.dumps(dados, ensure_ascii=False, separators=(",", ":")))
        html = html.replace("<title>Conferência FVS</title>", f"<title>FVS {cfg['obra']} {f['trecho']}</title>")
        arq = f["arquivo"]
        open(os.path.join(P(cfg["saida"]), arq), "w", encoding="utf-8").write(html)
        np_ = sum(1 for k in elem if k[0] == "P"); nv = sum(1 for k in elem if k[0] == "V")
        r = {
            "trecho": f["trecho"], "arquivo": arq, "mb": round(len(html.encode()) / 1e6, 1),
            "pilares": np_, "pil_sem_contorno": sorted(e["nome"] for k, e in elem.items() if k[0] == "P" and not e["polys"]),
            "pil_sem_detalhe": sorted(e["nome"] for k, e in elem.items() if k[0] == "P" and not e.get("detalhe")),
            "vigas": nv, "vig_sem_faixa": sorted(e["nome"] for k, e in elem.items() if k[0] == "V" and not e["polys"]),
            "vig_sem_detalhe": sorted(e["nome"] for k, e in elem.items() if k[0] == "V" and not e.get("detalhe")),
        }
        relatorio.append(r)
        print(f"{f['trecho']}: {np_} pilares, {nv} vigas, {r['mb']} MB")
    rel = {"trechos": relatorio,
           "pilares_detalhados_fora_das_plantas": sorted(set(detP) - usadosP),
           "vigas_detalhadas_fora_das_plantas": sorted(set(detV) - usadosV)}
    json.dump(rel, open(os.path.join(P(cfg["saida"]), "relatorio_geracao.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(rel, ensure_ascii=False)[:3000])


if __name__ == "__main__":
    main()

"""Folha única: o pavimento inteiro numa planta só, sem trechos, com a mesma segmentação das pranchas.

Cada prancha de forma é uma janela (viewport do AutoCAD) sobre o mesmo desenho, o Model do DWG. Juntar
as janelas das pranchas, cada uma no lugar dela, dá o mesmo que plotar o Model:

    1. acha a janela de cada prancha (o maior recorte do PDF, que não é a folha inteira);
    2. acha o encaixe entre as pranchas pelas peças que aparecem em mais de uma: deslocamento e, se a
       prancha foi plotada em outra escala (o Trecho 2 do 2º pavimento da obra piloto está 2,8% menor), escala;
    3. leva os textos e as linhas de pilar e viga para a folha e usa o mesmo leitor das pranchas
       (estrutura.ler_pecas). Viga cortada pela borda de uma prancha agora vem inteira;
    4. desenha cada janela no lugar dela e corta em tiles, nos níveis de sempre e em mais alguns,
       porque a folha inteira numa tela de celular precisa de imagem mais leve.

Se houver o DWG de forma do pavimento, o caminho é pipeline/fvs/plotar_dwg.py: ele plota o Model num
PDF só, e aqui ler_plotada() lê esse PDF do mesmo jeito.

As partes puras (encaixe, repetidos, janela, níveis, nome da prancha) não precisam de pymupdf e são
testadas em pipeline/testes/test_fvs_folha_unica.py.
"""

from __future__ import annotations

import io
import math
import pathlib
import random
import re
import sys
from contextlib import contextmanager
from dataclasses import dataclass

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

TRECHO = "Planta inteira"
TILE = 512
PEDACO_PX = 4096  # lado do pedaço desenhado de uma vez: limita a memória
ESCALA_MAX = 2  # pixels por ponto no nível mais fino (nível 1), igual às pranchas
MARGEM = 20.0  # pontos em volta do desenho
TOLERANCIA_ENCAIXE = 1.5  # pontos: quanto um rótulo pode errar para contar como igual nas duas pranchas
MIN_EM_COMUM = 3  # rótulos em comum para confiar num encaixe
RE_ROTULO_DE_PECA = re.compile(r"(?:P\d+[a-z]*|V ?\d+[A-Za-z]*)$")
RE_CODIGO = re.compile(r"^(?P<ini>.+\.)(?P<folha>\d+)\.(?P<nome>[^.]+)-R(?P<rev>\d+)$")


class ErroFolhaUnica(Exception):
    pass


@dataclass(frozen=True)
class Encaixe:
    """x_outra = escala * x_esta + dx (e o mesmo para y)."""

    escala: float
    dx: float
    dy: float
    em_comum: int = 0

    def ponto(self, x: float, y: float) -> tuple[float, float]:
        return self.escala * x + self.dx, self.escala * y + self.dy

    def depois(self, outro: "Encaixe") -> "Encaixe":
        """Primeiro este, depois o outro."""
        return Encaixe(self.escala * outro.escala, outro.escala * self.dx + outro.dx, outro.escala * self.dy + outro.dy, min(self.em_comum, outro.em_comum))

    def inverso(self) -> "Encaixe":
        return Encaixe(1 / self.escala, -self.dx / self.escala, -self.dy / self.escala, self.em_comum)


# ---------------------------------------------------------------------------
# Parte pura
# ---------------------------------------------------------------------------

def janela_principal(recortes: list[tuple[float, float, float, float]], largura: float, altura: float) -> tuple[float, float, float, float] | None:
    """O maior recorte que não é a folha inteira. Janela pequena (detalhe, legenda) não conta."""
    area_folha = largura * altura
    melhor = None
    melhor_area = 0.0
    for r in recortes:
        a = max(0.0, r[2] - r[0]) * max(0.0, r[3] - r[1])
        if 0.05 * area_folha <= a <= 0.97 * area_folha and a > melhor_area:
            melhor, melhor_area = r, a
    return melhor


def _ajustar(pares: list[tuple[float, float, float, float]]) -> Encaixe:
    """Escala e deslocamento pelos mínimos quadrados, em cima dos pares que já se sabe que batem."""
    n = len(pares)
    mxa = sum(p[0] for p in pares) / n
    mya = sum(p[1] for p in pares) / n
    mxb = sum(p[2] for p in pares) / n
    myb = sum(p[3] for p in pares) / n
    num = sum((p[0] - mxa) * (p[2] - mxb) + (p[1] - mya) * (p[3] - myb) for p in pares)
    den = sum((p[0] - mxa) ** 2 + (p[1] - mya) ** 2 for p in pares)
    s = num / den if den > 1e-6 else 1.0
    if abs(s - 1) < 0.0015:  # igual dentro do que dá para medir: não inventa escala
        s = 1.0
    return Encaixe(s, mxb - s * mxa, myb - s * mya, n)


def _bons(pares, e: Encaixe, tol: float) -> list:
    saida = []
    for p in pares:
        x, y = e.ponto(p[0], p[1])
        if abs(x - p[2]) <= tol and abs(y - p[3]) <= tol:
            saida.append(p)
    return saida


def encaixe_entre(a: dict[str, list[tuple[float, float]]], b: dict[str, list[tuple[float, float]]], tol: float = TOLERANCIA_ENCAIXE) -> Encaixe | None:
    """Encaixe que leva a prancha A para a prancha B, pelos rótulos com o mesmo nome.

    Um nome pode aparecer mais de uma vez na mesma prancha (corte, laje do elevador), e nem todo par
    bate: procura o encaixe em que mais pares batem. Primeiro sem escala, que é o caso comum.
    """
    pares = [(pa[0], pa[1], pb[0], pb[1]) for nome in a.keys() & b.keys() for pa in a[nome][:4] for pb in b[nome][:4]]
    if not pares:
        return None
    melhor: list = []
    # sem escala: cada par propõe um deslocamento
    vistos: set[tuple[int, int]] = set()
    for p in pares:
        chave = (round((p[2] - p[0]) / tol), round((p[3] - p[1]) / tol))
        if chave in vistos:
            continue
        vistos.add(chave)
        bons = _bons(pares, Encaixe(1.0, p[2] - p[0], p[3] - p[1]), tol)
        if len(bons) > len(melhor):
            melhor = bons
    # com escala: dois pares propõem escala e deslocamento
    if len(pares) >= 2:
        sorteio = random.Random(7)
        for _ in range(4000):
            p, q = sorteio.sample(pares, 2)
            da = math.hypot(q[0] - p[0], q[1] - p[1])
            db = math.hypot(q[2] - p[2], q[3] - p[3])
            if da < 100:  # perto demais: não mede escala
                continue
            s = db / da
            if not 0.9 <= s <= 1.1:
                continue
            bons = _bons(pares, Encaixe(s, p[2] - s * p[0], p[3] - s * p[1]), tol)
            # com escala precisa ganhar por mais de um par, senão fica o encaixe simples
            if len(bons) > len(melhor) + 1:
                melhor = bons
    if not melhor:
        return None
    e = _ajustar(melhor)
    return Encaixe(e.escala, e.dx, e.dy, len(_bons(pares, e, tol)))


def montar_encaixes(rotulos: list[dict[str, list[tuple[float, float]]]], minimo: int = MIN_EM_COMUM) -> list[Encaixe]:
    """Um encaixe por prancha, todos para a mesma folha. A base é a escala da maioria das pranchas.

    Liga primeiro os pares com mais rótulos em comum (árvore de maior peso): um par com 1 rótulo em
    comum nunca decide nada se houver caminho melhor.
    """
    n = len(rotulos)
    if n == 0:
        return []
    pares: list[tuple[int, int, int, Encaixe]] = []
    for i in range(n):
        for j in range(i + 1, n):
            e = encaixe_entre(rotulos[i], rotulos[j])
            if e and e.em_comum >= minimo:
                pares.append((e.em_comum, i, j, e))
    pares.sort(key=lambda p: -p[0])
    # até a prancha 0, por enquanto
    ate_zero: dict[int, Encaixe] = {0: Encaixe(1.0, 0.0, 0.0, 10**9)}
    while len(ate_zero) < n:
        for _, i, j, e in pares:
            if i in ate_zero and j not in ate_zero:
                ate_zero[j] = e.inverso().depois(ate_zero[i])
                break
            if j in ate_zero and i not in ate_zero:
                ate_zero[i] = e.depois(ate_zero[j])
                break
        else:
            soltas = sorted(set(range(n)) - set(ate_zero))
            raise ErroFolhaUnica(f"não achei peças em comum para encaixar as pranchas {[s + 1 for s in soltas]} nas outras")
    # a escala da folha é a que a maioria das pranchas tem; no empate, a da primeira prancha
    grupos: dict[float, int] = {}
    for e in ate_zero.values():
        k = round(e.escala, 3)
        grupos[k] = grupos.get(k, 0) + 1
    base = max(grupos, key=lambda k: (grupos[k], -abs(k - 1)))
    ajuste = 1 / base if abs(base - 1) > 0.0015 else 1.0
    return [Encaixe(ate_zero[i].escala * ajuste, ate_zero[i].dx * ajuste, ate_zero[i].dy * ajuste, ate_zero[i].em_comum) for i in range(n)]


def sem_repetidos(anotacoes: list[tuple[str, tuple[float, float, float, float]]], tol: float = 2.0) -> list[tuple[str, tuple[float, float, float, float]]]:
    """Tira o mesmo texto no mesmo lugar: quem está na sobra entre duas pranchas aparece nas duas."""
    vistos: dict[str, list[tuple[float, float]]] = {}
    saida = []
    for texto, r in anotacoes:
        c = ((r[0] + r[2]) / 2, (r[1] + r[3]) / 2)
        lista = vistos.setdefault(texto, [])
        if any(abs(c[0] - o[0]) <= tol and abs(c[1] - o[1]) <= tol for o in lista):
            continue
        lista.append(c)
        saida.append((texto, r))
    return saida


def niveis_da_folha(largura: float, altura: float, lado_menor: int = 1024) -> list[int]:
    """Níveis de imagem: de 1 (2 pixels por ponto) até a folha inteira caber numa imagem pequena."""
    z = -2
    while max(largura, altura) * 2.0**z > lado_menor:
        z -= 1
    return list(range(z, 2))


def nome_da_folha(pranchas: list[str]) -> tuple[str, str]:
    """(nome da folha, revisão). "EXE.ES.LO.129.FOR3PAVTIP-R03" a "...133...-R03" -> "EXE.ES.LO.129-133.FOR3PAVTIP-R03".
    Revisão: a maior das pranchas. Se forem diferentes, o nome diz (a folha mistura revisões)."""
    lidas = [RE_CODIGO.match(p) for p in pranchas]
    revs = sorted({int(m.group("rev")) for m in lidas if m})
    revisao = f"R{revs[-1]:02d}" if revs else "R00"
    if not lidas or not all(lidas):
        return (f"{pranchas[0]} + {len(pranchas) - 1} pranchas" if len(pranchas) > 1 else (pranchas[0] if pranchas else "Folha única"))[:160], revisao
    folhas = sorted(int(m.group("folha")) for m in lidas)
    primeira = lidas[0]
    # etapas diferentes (LO e EX) não cabem num código só: fica o da primeira prancha
    nome = f"{primeira.group('ini')}{folhas[0]}-{folhas[-1]}.{primeira.group('nome')}-{revisao}"
    if len(revs) > 1:
        nome += f" (R{revs[0]:02d} a R{revs[-1]:02d})"
    return nome[:160], revisao


# ---------------------------------------------------------------------------
# Leitura dos PDFs
# ---------------------------------------------------------------------------

CAMADAS_DO_LEITOR = {"PILAR_CONCRETO", "VIG_FACES", "consolo"}


class IndiceDeSegmentos:
    """Acha depressa os segmentos de uma linha. O leitor de vigas pergunta isso milhares de vezes, e
    numa prancha percorrer a lista toda não pesa; na folha inteira, levava mais de 10 minutos."""

    def __init__(self, segs: list[tuple[float, float, float]]):
        self.segs = segs
        self.baldes: dict[int, list[tuple[float, float, float]]] = {}
        for s in segs:
            self.baldes.setdefault(math.floor(s[0]), []).append(s)

    def perto(self, linha: float, tol: float) -> list[tuple[float, float, float]]:
        saida: list[tuple[float, float, float]] = []
        for k in range(math.floor(linha - tol), math.floor(linha + tol) + 1):
            saida += self.baldes.get(k, [])
        return saida


@contextmanager
def _leitor_rapido():
    """Enquanto lê a folha, o leitor legado só olha os segmentos perto da linha. O resultado é o mesmo:
    quem fica de fora é quem a própria função descartaria."""
    import gerador_fvs as legado

    original = legado.intervalos
    indices: dict[int, IndiceDeSegmentos] = {}

    def intervalos(segs, linha, tol=0.6):
        indice = indices.get(id(segs))
        if indice is None or indice.segs is not segs:
            indice = indices[id(segs)] = IndiceDeSegmentos(segs)
        return original(indice.perto(linha, tol), linha, tol)

    legado.intervalos = intervalos
    try:
        yield
    finally:
        legado.intervalos = original


class FolhaVirtual:
    """O que o leitor de peças usa de uma página, com os desenhos já nas coordenadas da folha."""

    def __init__(self, desenhos: list[dict]):
        import pymupdf

        self.rotation_matrix = pymupdf.Identity
        self._desenhos = desenhos

    def get_drawings(self):
        return self._desenhos


@dataclass
class Prancha:
    trecho: str
    pdf: str
    nome: str
    janela: tuple[float, float, float, float]
    largura: float
    altura: float
    anotacoes: list
    encaixe: Encaixe | None = None


def _recortes(page) -> list[tuple[float, float, float, float]]:
    import pymupdf

    M = page.rotation_matrix
    saida = set()
    for d in page.get_drawings(extended=True):
        if d.get("type") == "clip" and d.get("scissor"):
            r = pymupdf.Rect(d["scissor"]) * M
            saida.add((round(r.x0, 2), round(r.y0, 2), round(r.x1, 2), round(r.y1, 2)))
    return sorted(saida)


def _dentro(j, x: float, y: float, folga: float = 0.0) -> bool:
    return j[0] - folga <= x <= j[2] + folga and j[1] - folga <= y <= j[3] + folga


def ler_prancha(trecho: str, pdf: str) -> Prancha:
    """Janela e textos (rótulos das peças, seções) de uma prancha de forma."""
    import estrutura
    import pymupdf

    with pymupdf.open(pdf) as doc:
        page = doc[0]
        r = page.rect
        janela = janela_principal(_recortes(page), r.width, r.height)
        if janela is None:
            raise ErroFolhaUnica(f"{pathlib.Path(pdf).name}: não achei a janela do desenho na prancha")
        M = page.rotation_matrix
        anotacoes = []
        for a in page.annots() or []:
            texto = (a.info.get("content") or "").strip()
            q = a.rect * M
            if texto and _dentro(janela, (q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2):
                anotacoes.append((texto, (q.x0, q.y0, q.x1, q.y1)))
        return Prancha(trecho, pdf, estrutura.nome_da_prancha(pdf), janela, r.width, r.height, anotacoes)


def _rotulos_de_peca(p: Prancha) -> dict[str, list[tuple[float, float]]]:
    saida: dict[str, list[tuple[float, float]]] = {}
    for texto, r in p.anotacoes:
        if RE_ROTULO_DE_PECA.fullmatch(texto):
            saida.setdefault(texto.replace(" ", ""), []).append(((r[0] + r[2]) / 2, (r[1] + r[3]) / 2))
    return saida


def _desenhos_na_folha(p: Prancha, camada_ok=None) -> list[dict]:
    """Linhas de pilar e viga da janela desta prancha, nas coordenadas da folha.
    camada_ok: outra escolha de camadas (as cubetas, para o aviso de maciço em partes.py)."""
    import pymupdf

    e = p.encaixe
    T = pymupdf.Matrix(e.escala, 0, 0, e.escala, e.dx, e.dy)
    saida = []
    with pymupdf.open(p.pdf) as doc:
        page = doc[0]
        M = page.rotation_matrix
        total = M * T
        for d in page.get_drawings():
            camada = d.get("layer")
            if not (camada_ok(camada) if camada_ok else camada in CAMADAS_DO_LEITOR):
                continue
            itens = []
            for it in d["items"]:
                if it[0] == "l":
                    a, b = it[1] * M, it[2] * M
                    if _dentro(p.janela, a.x, a.y, 1) or _dentro(p.janela, b.x, b.y, 1):
                        itens.append(("l", it[1] * total, it[2] * total))
                elif it[0] == "qu":
                    q = it[1]
                    c = q.ul * M
                    if _dentro(p.janela, c.x, c.y, 1):
                        itens.append(("qu", q * total))
                elif it[0] == "re":
                    c = it[1].tl * M
                    if _dentro(p.janela, c.x, c.y, 1):
                        itens.append(("re", it[1] * total) + tuple(it[2:]))
            if itens:
                saida.append({"layer": camada, "items": itens})
    return saida


def _marcar_macicos(pranchas: list[Prancha], pecas: list[dict], imprimir=print) -> None:
    """Pilares com maciço na forma (cubetas longe nos quatro lados): ganham "macico_na_forma"."""
    import partes

    cubetas = []
    for p in pranchas:
        cubetas += partes.cubetas_dos_desenhos(_desenhos_na_folha(p, partes.e_camada_de_cubeta))
    if cubetas:
        nomes = partes.marcar_macico_na_forma(pecas, cubetas)
        imprimir(f"  {len(cubetas)} cubetas; {len(nomes)} pilares com maciço na forma")


def _coordenadas_da_folha(pranchas: list[Prancha]) -> tuple[float, float, float, float]:
    """Canto da folha e tamanho, para todas as coordenadas ficarem positivas. Mexe nos encaixes."""
    x0 = y0 = math.inf
    x1 = y1 = -math.inf
    for p in pranchas:
        for x, y in ((p.janela[0], p.janela[1]), (p.janela[2], p.janela[3])):
            wx, wy = p.encaixe.ponto(x, y)
            x0, x1 = min(x0, wx), max(x1, wx)
            y0, y1 = min(y0, wy), max(y1, wy)
    desloc_x, desloc_y = MARGEM - x0, MARGEM - y0
    for p in pranchas:
        e = p.encaixe
        p.encaixe = Encaixe(e.escala, e.dx + desloc_x, e.dy + desloc_y, e.em_comum)
    return x1 - x0 + 2 * MARGEM, y1 - y0 + 2 * MARGEM, desloc_x, desloc_y


def _imagem(pix):
    from PIL import Image

    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def _png(im) -> bytes:
    b = io.BytesIO()
    im.save(b, "PNG", compress_level=1)
    return b.getvalue()


def _webp(png: bytes) -> bytes | None:
    """O tile final, como nas pranchas: 24 cores, sem perda. Tile em branco não entra."""
    from PIL import Image

    t = Image.open(io.BytesIO(png)).convert("RGB")
    if t.convert("L").getextrema()[0] > 250:
        return None
    t = t.quantize(colors=24, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    b = io.BytesIO()
    t.save(b, "WEBP", lossless=True, method=4)
    return b.getvalue()


def _colar_janela(page, janela, e: Encaixe, nivel: dict[tuple[int, int], bytes]) -> None:
    """Desenha a janela no nível mais fino, no lugar dela, e guarda por tile. Desenha em pedaços: uma
    folha inteira de uma vez seriam centenas de megabytes na memória.
    Onde duas pranchas se sobrepõem fica o traço das duas (o desenho é o mesmo)."""
    import pymupdf

    k = e.escala * ESCALA_MAX
    matriz = pymupdf.Matrix(k, 0, 0, k, e.dx * ESCALA_MAX, e.dy * ESCALA_MAX)
    lista = page.get_displaylist(annots=False)
    passo = PEDACO_PX / k
    y = janela[1]
    while y < janela[3]:
        x = janela[0]
        while x < janela[2]:
            clip = pymupdf.Rect(x, y, min(x + passo, janela[2]), min(y + passo, janela[3]))
            _guardar_pedaco(lista.get_pixmap(matrix=matriz, colorspace=pymupdf.csRGB, alpha=False, clip=clip), nivel)
            x += passo
        y += passo


def _guardar_pedaco(pix, nivel: dict[tuple[int, int], bytes]) -> None:
    from PIL import Image, ImageChops

    x0, y0 = pix.x, pix.y
    im = _imagem(pix)
    largura, altura = im.size
    for ty in range(max(0, y0) // TILE, (y0 + altura - 1) // TILE + 1):
        for tx in range(max(0, x0) // TILE, (x0 + largura - 1) // TILE + 1):
            box = (tx * TILE - x0, ty * TILE - y0, (tx + 1) * TILE - x0, (ty + 1) * TILE - y0)
            pedaco = im.crop(box)  # o que passa da borda da janela vem preto: fica branco abaixo
            mascara = Image.new("L", (TILE, TILE), 0)
            mascara.paste(255, (max(0, -box[0]), max(0, -box[1]), min(TILE, largura - box[0]), min(TILE, altura - box[1])))
            branco = Image.new("RGB", (TILE, TILE), "white")
            branco.paste(pedaco, (0, 0), mascara)
            if branco.convert("L").getextrema()[0] > 250:
                continue
            ja = nivel.get((tx, ty))
            if ja:
                branco = ImageChops.darker(Image.open(io.BytesIO(ja)).convert("RGB"), branco)
            nivel[(tx, ty)] = _png(branco)


def _nivel_abaixo(nivel: dict[tuple[int, int], bytes]) -> dict[tuple[int, int], bytes]:
    """Cada tile do nível abaixo são quatro deste, reduzidos pela metade."""
    from PIL import Image

    pais = {(x // 2, y // 2) for x, y in nivel}
    saida: dict[tuple[int, int], bytes] = {}
    for px, py in pais:
        tela = Image.new("RGB", (TILE * 2, TILE * 2), "white")
        for dy in (0, 1):
            for dx in (0, 1):
                filho = nivel.get((px * 2 + dx, py * 2 + dy))
                if filho:
                    tela.paste(Image.open(io.BytesIO(filho)).convert("RGB"), (dx * TILE, dy * TILE))
        saida[(px, py)] = _png(tela.resize((TILE, TILE), Image.LANCZOS))
    return saida


def _tiles(pranchas: list[Prancha], niveis: list[int]) -> dict[str, bytes]:
    import pymupdf

    fino: dict[tuple[int, int], bytes] = {}
    for p in pranchas:
        with pymupdf.open(p.pdf) as doc:
            _colar_janela(doc[0], p.janela, p.encaixe, fino)
    saida: dict[str, bytes] = {}
    atual = fino
    for z in sorted(niveis, reverse=True):
        for (x, y), png in atual.items():
            w = _webp(png)
            if w:
                saida[f"{z}/{x}/{y}"] = w
        if z != min(niveis):
            atual = _nivel_abaixo(atual)
    return saida


def ler_folha_unica(formas: list[dict], imprimir=print) -> dict:
    """As pranchas de forma de um pavimento -> uma planta só, no formato de estrutura.ler_forma."""
    import estrutura

    pranchas = [ler_prancha(f["trecho"], f["pdf"]) for f in formas]
    encaixes = montar_encaixes([_rotulos_de_peca(p) for p in pranchas])
    for p, e in zip(pranchas, encaixes):
        p.encaixe = e
    largura, altura, _, _ = _coordenadas_da_folha(pranchas)
    for p in pranchas:
        escala = f", escala {p.encaixe.escala:.4f}" if p.encaixe.escala != 1.0 else ""
        imprimir(f"  {p.trecho} ({p.nome}): janela {[round(v) for v in p.janela]}, no lugar ({p.encaixe.dx:.1f}, {p.encaixe.dy:.1f}){escala}")
    anotacoes = []
    for p in pranchas:
        e = p.encaixe
        for texto, r in p.anotacoes:
            x0, y0 = e.ponto(r[0], r[1])
            x1, y1 = e.ponto(r[2], r[3])
            anotacoes.append((texto, (x0, y0, x1, y1)))
    anotacoes = sem_repetidos(anotacoes)
    import pymupdf

    anns = [(t, pymupdf.Rect(r)) for t, r in anotacoes]
    desenhos: list[dict] = []
    for p in pranchas:
        desenhos += _desenhos_na_folha(p)
    with _leitor_rapido():
        pecas = estrutura.ler_pecas(FolhaVirtual(desenhos), anns)
    del desenhos
    _marcar_macicos(pranchas, pecas, imprimir)
    imprimir(f"  folha de {round(largura)} x {round(altura)} pontos: {sum(1 for x in pecas if x['tipo'] == 'P')} pilares, {sum(1 for x in pecas if x['tipo'] == 'V')} vigas")
    niveis = niveis_da_folha(largura, altura)
    tiles = _tiles(pranchas, niveis)
    nome, revisao = nome_da_folha([p.nome for p in pranchas])
    return {
        "prancha": nome,
        "revisao": revisao,
        "largura": largura,
        "altura": altura,
        "tile": TILE,
        "niveis": niveis,
        "tiles": tiles,
        "pecas": pecas,
        "trecho": TRECHO,
        "origens": [
            {"trecho": p.trecho, "prancha": p.nome, "janela": list(p.janela), "escala": p.encaixe.escala, "dx": round(p.encaixe.dx, 2), "dy": round(p.encaixe.dy, 2), "em_comum": p.encaixe.em_comum}
            for p in pranchas
        ],
    }


def ler_plotada(pdf: str, escala: float = 1.0, nome: str | None = None, imprimir=print) -> dict:
    """Um PDF só com o pavimento inteiro (plotado do Model do DWG por plotar_dwg.py).

    escala: quantas vezes o PDF é menor que a folha de 1:50, a medida que o leitor de peças usa.
    Vale a mesma leitura e os mesmos níveis da folha montada das pranchas.
    """
    import estrutura
    import pymupdf

    with pymupdf.open(pdf) as doc:
        page = doc[0]
        r = page.rect
        M = page.rotation_matrix
        anotacoes = []
        for a in page.annots() or []:
            texto = (a.info.get("content") or "").strip()
            if texto:
                q = a.rect * M
                anotacoes.append((texto, (q.x0, q.y0, q.x1, q.y1)))
        p = Prancha(TRECHO, pdf, nome or estrutura.nome_da_prancha(pdf), (0.0, 0.0, r.width, r.height), r.width, r.height, anotacoes, Encaixe(escala, 0.0, 0.0))
    largura, altura = r.width * escala, r.height * escala
    anns = [(t, pymupdf.Rect(*p.encaixe.ponto(q[0], q[1]), *p.encaixe.ponto(q[2], q[3]))) for t, q in sem_repetidos(p.anotacoes)]
    with _leitor_rapido():
        pecas = estrutura.ler_pecas(FolhaVirtual(_desenhos_na_folha(p)), anns)
    _marcar_macicos([p], pecas, imprimir)
    imprimir(f"  folha de {round(largura)} x {round(altura)} pontos: {sum(1 for x in pecas if x['tipo'] == 'P')} pilares, {sum(1 for x in pecas if x['tipo'] == 'V')} vigas")
    niveis = niveis_da_folha(largura, altura)
    return {
        "prancha": p.nome,
        "revisao": estrutura.revisao_da_prancha(p.nome),
        "largura": largura,
        "altura": altura,
        "tile": TILE,
        "niveis": niveis,
        "tiles": _tiles([p], niveis),
        "pecas": pecas,
        "trecho": TRECHO,
        "origens": [{"trecho": TRECHO, "prancha": p.nome, "janela": list(p.janela), "escala": escala, "dx": 0, "dy": 0, "em_comum": 0}],
    }

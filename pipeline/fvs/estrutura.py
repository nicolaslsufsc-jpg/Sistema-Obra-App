"""Leitura das pranchas de estrutura (forma, detalhamento de pilares e de vigas) para o pacote da FVS.

A leitura em si é a do gerador legado (pipeline/legado/gerador_fvs.py), que está em uso na obra
e foi conferido num pavimento tipo de uma obra real (todos os pilares e vigas com detalhe). Aqui só
se adapta a saída: imagens em bytes (não base64) e nomes de prancha sem o título.
Quando o HTML legado sair de uso, o código de leitura muda para cá.

Precisa de: pip install pymupdf pillow numpy scipy
"""

from __future__ import annotations

import base64
import math
import os
import pathlib
import re
import sys

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "legado"))

import gerador_fvs as legado  # noqa: E402
import pymupdf as fitz  # noqa: E402

sys.path.insert(0, str(AQUI))
import lances  # noqa: E402
from pacote import chave_de_detalhe  # noqa: E402
import partes  # noqa: E402

RE_REVISAO = re.compile(r"-R(\d+)$", re.I)


def nome_da_prancha(caminho: str | os.PathLike) -> str:
    """"EXE.ES.LO.129.FOR3PAVTIP-R03 - PLANTA DE FORMA ... .pdf" -> "EXE.ES.LO.129.FOR3PAVTIP-R03"."""
    base = pathlib.Path(caminho).name
    if base.lower().endswith(".pdf"):
        base = base[:-4]
    return base.split(" - ")[0].strip()


def revisao_da_prancha(nome: str) -> str:
    m = RE_REVISAO.search(nome)
    return f"R{m.group(1)}" if m else "R00"


def _bytes(b64: str | None) -> bytes | None:
    return base64.b64decode(b64) if b64 else None


def ler_detalhes(pdfs_pilares: list[str], pdfs_vigas: list[str], pavimento: str | None = None) -> dict[str, dict[str, dict]]:
    """{"P": {nome_do_pilar: detalhe}, "V": {nome_da_viga: detalhe}}; detalhe = {chave, titulo, prancha, img, aco}.

    Pilar: entre os detalhes com o mesmo nome, vale o do lance que termina no pavimento (lances.py), e o
    detalhe leva "situacao" (termina, nasce, passa, fora, sem_lance) e "lance" ("Subsolo > Pilotis")."""
    legado.PREFIXO = ""
    ordem_pav = lances.ordem_do_pavimento(pavimento) if pavimento else None
    pilares = {}
    for nome, cands in legado.detalhes_pilares_todos(pdfs_pilares, lances.ordem_do_nivel).items():
        d, sit = lances.escolher(cands, ordem_pav, pavimento)
        pilares[nome] = {**d, "situacao": sit, "lance": lances.texto_do_lance(d["niveis"]) if len(d["niveis"]) >= 2 else ""}
    saida: dict[str, dict[str, dict]] = {"P": {}, "V": {}}
    for tipo, lidos in (("P", pilares), ("V", legado.detalhes_vigas(pdfs_vigas))):
        for nome, d in lidos.items():
            saida[tipo][nome] = {
                "chave": chave_de_detalhe(tipo, d["titulo"]),
                "titulo": d["titulo"],
                "prancha": nome_da_prancha(d["prancha"]),
                "img": _bytes(d["img"]),
                "aco": _bytes(d.get("tabela")),
            }
            if tipo == "P":
                saida[tipo][nome].update(situacao=d["situacao"], lance=d["lance"])
    return saida


def completar_pilares(detalhes: dict, nomes: set[str], pdfs_obra: list[str], pavimento: str) -> list[str]:
    """Pilar da forma sem detalhe nas pranchas do pavimento: procura nas pranchas de pilar da obra inteira.
    O detalhe do arranque (P150a, "Subsolo > Pilotis") fica nas pranchas do pavimento de cima. Só vale o que o
    lance liga a este pavimento (termina, sai da fundação, nasce ou passa); o resto continua sem detalhe. Muda detalhes["P"]."""
    ordem_pav = lances.ordem_do_pavimento(pavimento)
    faltam = {n for n in nomes if n not in detalhes["P"]}
    if not faltam or ordem_pav is None or not pdfs_obra:
        return []
    achados = []
    for nome, cands in legado.detalhes_pilares_todos(pdfs_obra, lances.ordem_do_nivel, faltam).items():
        if nome not in faltam:
            continue
        d, sit = lances.escolher(cands, ordem_pav, pavimento)
        if sit not in ("termina", "sai_da_fundacao", "passa_com_detalhe", "nasce", "passa"):
            continue
        detalhes["P"][nome] = {"chave": chave_de_detalhe("P", d["titulo"]), "titulo": d["titulo"], "prancha": nome_da_prancha(d["prancha"]),
                               "img": _bytes(d["img"]), "aco": _bytes(d.get("tabela")), "situacao": sit,
                               "lance": lances.texto_do_lance(d["niveis"])}
        achados.append(nome)
    return sorted(achados)


RE_ALTURA = re.compile(r"h ?= ?\d")
RE_ROTULO = re.compile(r"[A-Z]{1,3} ?\d+[A-Za-z]*")


def rotulos_de_painel(anns) -> set[int]:
    """Índices dos rótulos "V12" que são painel de laje, não viga.

    Nas formas com laje treliçada (rampa do Térreo, por exemplo) o painel se chama "V40" e tem
    "h=12+5" encostado embaixo. A viga é "V 40" com a seção ao lado ("a: 20/50"). Cada "h=..." é
    dado ao rótulo mais próximo; se for um rótulo de viga encostado, ele é painel.
    """
    rotulos = [(i, r) for i, (c, r) in enumerate(anns) if RE_ROTULO.fullmatch(c)]
    fora: set[int] = set()
    for c, h in anns:
        if not RE_ALTURA.match(c) or not rotulos:
            continue
        i, r = min(rotulos, key=lambda x: legado.dist_ret(x[1], h))
        if legado.dist_ret(r, h) < 6 and legado.RE_VIGA.fullmatch(anns[i][0]):
            fora.add(i)
    return fora


def segmentos_inclinados(page) -> list[tuple[float, float, float, float]]:
    """Faces de viga que não são horizontais nem verticais (rampas)."""
    M = page.rotation_matrix
    saida = []
    for d in page.get_drawings():
        if d.get("layer") != "VIG_FACES":
            continue
        for it in d["items"]:
            if it[0] == "l":
                pares = [(it[1], it[2])]
            elif it[0] == "qu":
                q = it[1]
                pares = [(q.ul, q.ur), (q.ur, q.lr), (q.lr, q.ll), (q.ll, q.ul)]
            else:
                continue
            for a, b in pares:
                a, b = a * M, b * M
                dx, dy = b.x - a.x, b.y - a.y
                if abs(dx) > 1 and abs(dy) > 1 and math.hypot(dx, dy) > 6:
                    saida.append((a.x, a.y, b.x, b.y))
    return saida


def _dist_ponto_segmento(px, py, s) -> float:
    ax, ay, bx, by = s
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _angulo(s) -> float:
    return math.degrees(math.atan2(s[3] - s[1], s[2] - s[0])) % 180


LARGURA_NORMAL = 30  # pontos: viga de até 53 cm na escala 1:50 (o limite do leitor em uso na obra)
LARGURA_LARGA = 48   # viga de até 85 cm (vigas de 60 e 70 cm das rampas e transições)


def faixa_reta(lbl, horizontal, segs, outros, larg_max=LARGURA_NORMAL):
    """Par de faces paralelas ao lado do rótulo, estendido ao longo do eixo.
    É a busca do leitor em uso na obra (legado.faixa_da_viga), com a largura máxima como parâmetro."""
    if horizontal:
        c_ax, c_tr, t0, t1 = (lbl.x0 + lbl.x1) / 2, (lbl.y0 + lbl.y1) / 2, lbl.y0, lbl.y1
        a0 = lbl.x0
    else:
        c_ax, c_tr, t0, t1 = (lbl.y0 + lbl.y1) / 2, (lbl.x0 + lbl.x1) / 2, lbl.x0, lbl.x1
        a0 = lbl.y0
    linhas = sorted({l for l, s0, s1 in segs if s0 - 25 <= c_ax <= s1 + 25 and abs(l - c_tr) < 40 + larg_max - LARGURA_NORMAL})
    melhor = None
    for i, la in enumerate(linhas):
        for lb in linhas[i + 1:]:
            w = lb - la
            if not 7 <= w <= larg_max:
                continue
            ia, ib = legado.intervalos(segs, la), legado.intervalos(segs, lb)
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
    juntos: list[list[float]] = []
    for s0, s1 in sorted(legado.intervalos(segs, la) + legado.intervalos(segs, lb)):
        if juntos and s0 <= juntos[-1][1] + 2:
            juntos[-1][1] = max(juntos[-1][1], s1)
        else:
            juntos.append([s0, s1])
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
    for c in cortes:
        if c_ax < c < fim:
            fim = min(fim, c - 6)
        if ini < c < a0 - 30:
            ini = max(ini, c)
    return fitz.Rect(ini, la, fim, lb) if horizontal else fitz.Rect(la, ini, lb, fim)


def faixa_inclinada(rotulo, segs, larg_max=LARGURA_NORMAL) -> list[list[float]] | None:
    """Contorno de uma viga inclinada: gira o desenho até a viga ficar horizontal, usa a mesma
    busca das vigas retas (par de faces paralelas ao lado do nome) e gira o resultado de volta."""
    cx, cy = (rotulo.x0 + rotulo.x1) / 2, (rotulo.y0 + rotulo.y1) / 2
    perto = [s for s in segs if _dist_ponto_segmento(cx, cy, s) < 45]
    angulos: list[float] = []
    for a in sorted(_angulo(s) for s in perto):
        if not angulos or a - angulos[-1] > 2:
            angulos.append(a)
    meio = max(rotulo.width, rotulo.height) / 2
    nome = fitz.Rect(-meio, -5, meio, 5)
    melhor = None
    for ang in angulos:
        th = math.radians(ang)
        cos, sin = math.cos(th), math.sin(th)
        hs = []
        for s in segs:
            dif = abs(_angulo(s) - ang)
            if min(dif, 180 - dif) > 1.5:
                continue
            (x0, y0), (x1, y1) = [((x - cx) * cos + (y - cy) * sin, -(x - cx) * sin + (y - cy) * cos) for x, y in ((s[0], s[1]), (s[2], s[3]))]
            hs.append((round((y0 + y1) / 2, 1), min(x0, x1), max(x0, x1)))
        fx = faixa_reta(nome, True, hs, [], larg_max)
        if fx is None:
            continue
        d = 0 if fx.y0 <= 0 <= fx.y1 else min(abs(fx.y0), abs(fx.y1))
        if melhor is None or d < melhor[0]:
            melhor = (d, cos, sin, fx)
    if melhor is None:
        return None
    _, cos, sin, fx = melhor
    cantos = [(fx.x0, fx.y0), (fx.x1, fx.y0), (fx.x1, fx.y1), (fx.x0, fx.y1)]
    return [[round(cx + x * cos - y * sin, 2), round(cy + x * sin + y * cos, 2)] for x, y in cantos]


def ler_pecas(page, anns) -> list[dict]:
    """Pilares e vigas de uma forma, com contorno e rótulo. Usa o leitor em uso na obra e acrescenta:
    painel de laje não vira viga; viga inclinada (rampa) ganha contorno; pilar com consolo ganha
    "consolo" (o contorno dele na forma)."""
    paineis = rotulos_de_painel(anns)
    sem_paineis = [a for i, a in enumerate(anns) if i not in paineis]
    pecas = []
    for nome, e in sorted(legado.pilares_da_forma(page, anns).items()):
        pecas.append({"tipo": "P", "nome": nome, "secao": e.get("secao") or "", "rotulo": e["rotulo"], "polys": e["polys"]})
    # consolo: retângulo da camada "consolo" encostado no pilar que o rótulo "CONSOLO Pxx" nomeia (partes.py)
    for nome, q in partes.consolos_da_forma(page, anns, pecas).items():
        for p in pecas:
            if p["nome"] == nome:
                p["consolo"] = q
    retos = inclinados = None
    rotulos: dict[str, list] = {}
    for c, r in sem_paineis:
        if legado.RE_VIGA.fullmatch(c):
            rotulos.setdefault(legado.nome_viga(c), []).append(r)
    for nome, e in sorted(legado.vigas_da_forma(page, sem_paineis).items()):
        polys = e["polys"]
        if not polys:
            # o leitor da obra não achou: tenta viga larga, inclinada e inclinada larga, nessa ordem
            if retos is None:
                retos = legado.segmentos_vigas(page)
                inclinados = segmentos_inclinados(page)
            for r in rotulos.get(nome, []):
                h = r.width >= r.height
                fx = faixa_reta(r, h, retos[0] if h else retos[1], [], LARGURA_LARGA)
                if fx is not None:
                    p = [[round(fx.x0, 2), round(fx.y0, 2)], [round(fx.x1, 2), round(fx.y0, 2)],
                         [round(fx.x1, 2), round(fx.y1, 2)], [round(fx.x0, 2), round(fx.y1, 2)]]
                else:
                    p = faixa_inclinada(r, inclinados) or faixa_inclinada(r, inclinados, LARGURA_LARGA)
                if p:
                    polys = polys + [p]
        pecas.append({"tipo": "V", "nome": nome, "secao": e.get("secao") or "", "rotulo": e["rotulo"], "polys": polys})
    return pecas


def ler_forma(pdf_forma: str) -> dict:
    """Uma prancha de forma: tamanho, tiles e peças (pilares e vigas) com contorno e rótulo."""
    page = fitz.open(pdf_forma)[0]
    anns = legado.anotacoes(page)
    pecas = ler_pecas(page, anns)
    M = page.rotation_matrix  # as peças vêm nas coordenadas da página girada; os desenhos, não
    cubetas = [(r.x0, r.y0, r.x1, r.y1) for r in (fitz.Rect(c[:2], c[2:]) * M for c in partes.cubetas_dos_desenhos(page.get_drawings()))]
    partes.marcar_macico_na_forma(pecas, cubetas)
    tiles = {k: base64.b64decode(v) for k, v in legado.tiles_da_forma(page).items()}
    prancha = nome_da_prancha(pdf_forma)
    return {
        "prancha": prancha,
        "revisao": revisao_da_prancha(prancha),
        "largura": page.rect.width,
        "altura": page.rect.height,
        "tile": legado.TILE,
        "niveis": list(legado.NIVEIS),
        "tiles": tiles,
        "pecas": pecas,
    }

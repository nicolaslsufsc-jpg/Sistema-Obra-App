"""Planta de blocos de fundação: cada bloco é um local "K" da FVS (item 2.2 da lista de conferências, 23/11/2026).

A ficha de blocos de fundação era conferida só pela lista "Locais fora da planta" (o local do sistema oficial).
Aqui a planta de locação das estacas vira uma planta tocável: toca no bloco, abre a ficha dele.

De onde sai cada coisa:
- os blocos: os contornos da camada dos blocos nas pranchas de locação ("camada_bloco", padrão "Sapatas"),
  com o pilar dentro (camada "PILAR_CONCRETO", a mesma das formas). O rótulo do tipo ("BL-04") é a seção;
- o nome: o do pilar que o bloco carrega, como no Concreto ("BL-P65"; dois pilares, "BL-P65-P66"). Na
  locação o nome do pilar é desenho (texto de AutoCAD explodido), então ele sai das formas já geradas
  (--so-gerar) de outros pavimentos ("referencias"): cada prancha de locação é encaixada nos pilares de
  uma referência pelo tamanho e pela posição (só deslocamento: a locação e a forma estão na mesma escala),
  e cada pilar de dentro de um bloco ganha o nome do pilar da forma que cai em cima dele;
- o fundo: as pranchas de locação, cada uma no lugar dela, encaixadas na primeira referência (folha_unica.py).
Bloco que aparece em duas pranchas (as pranchas se sobrepõem na divisa) entra uma vez.

Estacas (item 2.1, 24/11/2026): os círculos da camada das estacas ("camada_estaca", padrão "EC-ESTACA-60")
que caem dentro de um bloco viram locais "S" com o nome do bloco trocando "BL-" por "E-": uma estaca só,
"E-P65"; várias, "E-P65.1", "E-P65.2"... na ordem de leitura (de cima para baixo, da esquerda para a direita),
como a máquina numera. A seção é o diâmetro ("D50"), pela escala da prancha (1:50 = 56,7 pontos por metro).
Estaca fora de bloco fica fora (vai para o resumo).

Escavação (item 1.2, 24/11/2026), opcional: com "escavacao": {"area_m2": 30, "fichas": ["EXE-PVS-ESC"], "perto_m": 6} no
fundacao.json, uma grade de quadrados de cerca de 30 m² cobre a caixa dos blocos; ficam só os quadrados com o
centro a até "perto_m" metros (padrão 6) de algum bloco (o resto é terreno fora do prédio). Cada quadrado é um local "A"
("ESC-A1") com "grade": "escavacao", e o pacote leva "fichas_da_grade" (só essas fichas valem nos quadrados; no
app eles ficam fora do andamento dos ambientes).

Vigas baldrames (etapa 2, 24/11/2026), opcional: com "baldrames": true, as vigas da forma da primeira referência
(o pavimento mais baixo, cujas vigas são as baldrames) entram na planta como locais "K" com "grade": "baldrame" e o
nome "VB-" + o da viga ("VB-V27"). Ficam no mesmo tipo dos blocos de propósito: a ficha de blocos de fundação já
vale para blocos e vigas baldrames, e uma ficha de fundação com tipo "V" apareceria em todas as vigas do prédio.
As coordenadas são as da primeira referência, as mesmas em que os blocos foram encaixados.

No pavimento.json (um pavimento só para a fundação, cadastrado na obra):
  "fundacao": {"locacao": "../Fundacao/*.FU.LO.*.pdf",
               "referencias": ["../pacotes/01_subsolo", "../pacotes/02_terreo"],
               "trecho": "Blocos", "camada_bloco": "Sapatas", "camada_pilar": "PILAR_CONCRETO"}

As partes puras (encaixe, nome, repetidos) não precisam de pymupdf e são testadas em
pipeline/testes/test_fvs_blocos.py.
"""

from __future__ import annotations

import json
import math
import pathlib
import re
import sys
from collections import Counter

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

DISCIPLINA = "fundacao"
TRECHO = "Blocos"
CAMADA_BLOCO = "Sapatas"
CAMADA_PILAR = "PILAR_CONCRETO"
CAMADA_ESTACA = "EC-ESTACA-60"
PONTOS_POR_METRO = 72 / 0.0254 / 50  # prancha de locação em 1:50
TOL_TAMANHO = 1.5  # pontos: quanto o lado de um pilar pode diferir entre a locação e a forma
PASSO_VOTO = 2.0  # pontos: o deslocamento é votado em degraus deste tamanho
TOL_PAR = 6.0  # pontos: pilar da locação e da forma que contam como o mesmo, no refino do encaixe
TOL_NOME = 4.0  # pontos: pilar da forma que dá nome ao pilar do bloco
MIN_EM_COMUM = 8  # pilares em comum para confiar no encaixe de uma prancha
TOL_REPETIDO = 6.0  # pontos: o mesmo bloco em duas pranchas
RE_TIPO_DE_BLOCO = re.compile(r"BL-?\d+[A-Za-z]?$")
_ordem = re.compile(r"(\d+)")


class ErroBlocos(Exception):
    pass


# ---------------------------------------------------------------------------
# Parte pura
# ---------------------------------------------------------------------------

Pilar = tuple[float, float, float, float]  # centro x, centro y, largura, altura
PilarComNome = tuple[str, float, float, float, float]


def encaixe_por_pilares(locacao: list[Pilar], forma: list[PilarComNome]) -> tuple[float, float, int] | None:
    """Deslocamento (dx, dy) que leva os pilares da locação aos da forma, e quantos casaram.

    Cada par de pilares do mesmo tamanho vota num deslocamento; o mais votado é refinado pela média dos
    pares que ficam a menos de TOL_PAR. Sem par nenhum, None."""
    votos: Counter[tuple[int, int]] = Counter()
    for x, y, w, h in locacao:
        for _, X, Y, W, H in forma:
            if abs(w - W) < TOL_TAMANHO and abs(h - H) < TOL_TAMANHO:
                votos[(round((X - x) / PASSO_VOTO), round((Y - y) / PASSO_VOTO))] += 1
    if not votos:
        return None
    (vx, vy), _ = votos.most_common(1)[0]
    dx, dy = vx * PASSO_VOTO, vy * PASSO_VOTO
    pares = []
    for x, y, _w, _h in locacao:
        perto = min(forma, key=lambda f: (f[1] - x - dx) ** 2 + (f[2] - y - dy) ** 2)
        if math.hypot(perto[1] - x - dx, perto[2] - y - dy) < TOL_PAR:
            pares.append((perto[1] - x, perto[2] - y))
    if not pares:
        return None
    return sum(a for a, _ in pares) / len(pares), sum(b for _, b in pares) / len(pares), len(pares)


def nome_do_pilar(x: float, y: float, forma: list[PilarComNome], dx: float, dy: float) -> str | None:
    """O nome do pilar da forma que cai em cima do pilar (x, y) da locação, já com o encaixe."""
    if not forma:
        return None
    perto = min(forma, key=lambda f: (f[1] - x - dx) ** 2 + (f[2] - y - dy) ** 2)
    return perto[0] if math.hypot(perto[1] - x - dx, perto[2] - y - dy) < TOL_NOME else None


def _chave_natural(nome: str):
    return [int(p) if p.isdigit() else p for p in _ordem.split(nome)]


def nome_do_bloco(pilares: list[str]) -> str:
    """["P65"] -> "BL-P65"; ["P66", "P65"] -> "BL-P65-P66" (o mesmo nome que o Concreto usa)."""
    if not pilares:
        raise ErroBlocos("bloco sem pilar não tem nome")
    return "BL-" + "-".join(sorted(set(pilares), key=_chave_natural))


def nomes_das_estacas(bloco: str, centros: list[tuple[float, float]], tol: float = 6.0) -> list[str]:
    """Nome de cada estaca de um bloco, na ordem de `centros`: "BL-P65" com uma estaca -> ["E-P65"]; com várias,
    "E-P65.1", "E-P65.2"... de cima para baixo e da esquerda para a direita (a mesma linha até `tol` pontos)."""
    base = "E-" + bloco.removeprefix("BL-")
    if len(centros) == 1:
        return [base]
    ordem = sorted(range(len(centros)), key=lambda i: (round(centros[i][1] / tol), centros[i][0]))
    nomes = [""] * len(centros)
    for n, i in enumerate(ordem, 1):
        nomes[i] = f"{base}.{n}"
    return nomes


def secao_da_estaca(diametro_pt: float, pontos_por_metro: float = PONTOS_POR_METRO) -> str:
    """Diâmetro do círculo em pontos -> "D50" (centímetros, de 5 em 5)."""
    return "D%d" % (round(diametro_pt / pontos_por_metro * 100 / 5) * 5)


def poligono_do_circulo(cx: float, cy: float, r: float, lados: int = 16) -> list[tuple[float, float]]:
    return [(cx + r * math.cos(2 * math.pi * k / lados), cy + r * math.sin(2 * math.pi * k / lados)) for k in range(lados)]


def grade_de_escavacao(caixa: tuple[float, float, float, float], area_m2: float = 30.0,
                       pontos_por_metro: float = PONTOS_POR_METRO) -> list[dict]:
    """Quadrados de cerca de `area_m2` cobrindo `caixa` (x0, y0, x1, y1 em pontos), um local "A" cada (item 1.2,
    24/11/2026). Nome por linha (letra, de cima para baixo) e coluna (número): "ESC-A1", "ESC-A2", "ESC-B1"...
    O lado é ajustado para a caixa caber num número inteiro de quadrados (área perto de `area_m2`)."""
    x0, y0, x1, y1 = caixa
    lado = math.sqrt(area_m2) * pontos_por_metro
    ncol = max(1, round((x1 - x0) / lado))
    nlin = max(1, round((y1 - y0) / lado))
    lx, ly = (x1 - x0) / ncol, (y1 - y0) / nlin
    def letra(i):
        s = ""
        i += 1
        while i:
            i, r = divmod(i - 1, 26)
            s = chr(65 + r) + s
        return s
    out = []
    for i in range(nlin):
        for j in range(ncol):
            a, b, c, d = x0 + j * lx, y0 + i * ly, x0 + (j + 1) * lx, y0 + (i + 1) * ly
            out.append({"nome": f"ESC-{letra(i)}{j + 1}", "poly": [(a, b), (c, b), (c, d), (a, d)],
                        "area_m2": round(lx * ly / pontos_por_metro ** 2, 1)})
    return out


def so_perto_dos_blocos(grade: list[dict], centros: list[tuple[float, float]], dist_pt: float) -> list[dict]:
    """Só os quadrados com o centro a até `dist_pt` do centro de algum bloco: a caixa dos blocos pega muito
    terreno fora do prédio. O nome continua o da posição na grade (pode pular: "ESC-A3" sem "ESC-A2")."""
    def centro(q):
        xs = [x for x, _ in q["poly"]]
        ys = [y for _, y in q["poly"]]
        return (sum(xs) / len(xs), sum(ys) / len(ys))
    return [q for q in grade if centros and min(math.dist(centro(q), c) for c in centros) <= dist_pt]


def juntar_repetidos(blocos: list[dict], tol: float = TOL_REPETIDO) -> tuple[list[dict], list[dict]]:
    """Um bloco por nome. O mesmo nome perto (prancha vizinha) é o mesmo bloco: fica o primeiro. O mesmo nome
    longe é conflito: fica o primeiro e o outro vai para a lista de conflitos."""
    por_nome: dict[str, dict] = {}
    conflitos = []
    for b in blocos:
        ja = por_nome.get(b["nome"])
        if ja is None:
            por_nome[b["nome"]] = b
        elif math.dist(ja["centro"], b["centro"]) > tol:
            conflitos.append({"nome": b["nome"], "prancha": b.get("prancha"), "centro": [round(v, 1) for v in b["centro"]],
                              "ja_em": ja.get("prancha"), "centro_ja": [round(v, 1) for v in ja["centro"]]})
    return sorted(por_nome.values(), key=lambda b: _chave_natural(b["nome"])), conflitos


def pilares_da_referencia(pasta: str | pathlib.Path) -> list[PilarComNome]:
    """Os pilares (com nome e contorno) das plantas de forma de uma pasta gerada (--so-gerar)."""
    pasta = pathlib.Path(pasta)
    try:
        rel = json.loads((pasta / "relatorio.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise ErroBlocos(f"referência {pasta}: falta o relatorio.json da pasta gerada ({e})") from e
    saida: list[PilarComNome] = []
    for t in rel.get("trechos") or []:
        if (t.get("disciplina") or "estrutura") != "estrutura":
            continue
        man = json.loads((pasta / t["pasta"] / "manifest.json").read_text(encoding="utf-8"))
        for e in man.get("elementos", {}).values():
            if e.get("tipo") != "P" or e.get("so_detalhe") or not e.get("polys"):
                continue
            xs = [x for poly in e["polys"] for x, _ in poly]
            ys = [y for poly in e["polys"] for _, y in poly]
            saida.append((e["nome"], (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, max(xs) - min(xs), max(ys) - min(ys)))
    if not saida:
        raise ErroBlocos(f"referência {pasta}: nenhum pilar com contorno nas plantas de forma")
    return saida


def baldrames_da_referencia(pasta: str | pathlib.Path) -> list[dict]:
    """As vigas (nome, seção, contorno, rótulo) das plantas de forma de uma pasta gerada: as vigas baldrames."""
    pasta = pathlib.Path(pasta)
    try:
        rel = json.loads((pasta / "relatorio.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise ErroBlocos(f"referência {pasta}: falta o relatorio.json da pasta gerada ({e})") from e
    saida: dict[str, dict] = {}
    for t in rel.get("trechos") or []:
        if (t.get("disciplina") or "estrutura") != "estrutura":
            continue
        man = json.loads((pasta / t["pasta"] / "manifest.json").read_text(encoding="utf-8"))
        for e in man.get("elementos", {}).values():
            if e.get("tipo") != "V" or e.get("so_detalhe") or not e.get("polys") or e["nome"] in saida:
                continue
            saida[e["nome"]] = {"nome": "VB-" + e["nome"], "secao": e.get("secao") or "",
                                "polys": [[(x, y) for x, y in p] for p in e["polys"]], "rotulo": tuple(e.get("rotulo") or ())}
    return sorted(saida.values(), key=lambda v: _chave_natural(v["nome"]))


# ---------------------------------------------------------------------------
# Leitura dos PDFs
# ---------------------------------------------------------------------------


def ler_prancha_de_locacao(pdf: str, camada_bloco: str = CAMADA_BLOCO, camada_pilar: str = CAMADA_PILAR,
                           camada_estaca: str = CAMADA_ESTACA) -> dict:
    """Blocos (contorno), pilares (centro e tamanho), estacas (centro e diâmetro), rótulos de tipo e a janela do
    desenho de uma prancha."""
    import folha_unica
    import pymupdf

    with pymupdf.open(pdf) as doc:
        page = doc[0]
        M = page.rotation_matrix
        r = page.rect
        janela = folha_unica.janela_principal(folha_unica._recortes(page), r.width, r.height) or (0.0, 0.0, r.width, r.height)
        blocos, pilares, estacas = [], [], []
        for d in page.get_drawings():
            camada = d.get("layer")
            if camada == camada_estaca:
                # o círculo da estaca: um desenho só de curvas (4 por círculo), quadrado
                its = d["items"]
                q = d["rect"] * M
                if its and len(its) % 4 == 0 and all(it[0] == "c" for it in its) and abs(q.width - q.height) < 0.5:
                    estacas.append(((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2, q.width))
                continue
            if camada not in (camada_bloco, camada_pilar):
                continue
            for it in d["items"]:
                if it[0] == "qu":
                    pts = [pt * M for pt in (it[1].ul, it[1].ur, it[1].lr, it[1].ll)]
                elif it[0] == "re":
                    q = it[1].quad
                    pts = [pt * M for pt in (q.ul, q.ur, q.lr, q.ll)]
                else:
                    continue
                xs = [p.x for p in pts]
                ys = [p.y for p in pts]
                if camada == camada_bloco:
                    blocos.append({"poly": [(p.x, p.y) for p in pts], "caixa": (min(xs), min(ys), max(xs), max(ys))})
                else:
                    pilares.append(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, max(xs) - min(xs), max(ys) - min(ys)))
        rotulos = []
        for w in page.get_text("words"):
            if RE_TIPO_DE_BLOCO.fullmatch(w[4]):
                q = pymupdf.Rect(w[:4]) * M
                rotulos.append((w[4], (q.x0, q.y0, q.x1, q.y1)))
    return {"pdf": pdf, "janela": janela, "blocos": blocos, "pilares": pilares, "estacas": estacas, "rotulos": rotulos}


def _dentro(caixa, x: float, y: float) -> bool:
    return caixa[0] <= x <= caixa[2] and caixa[1] <= y <= caixa[3]


def _rotulo_do_bloco(caixa, rotulos, folga: float = 40.0):
    """O rótulo de tipo ("BL-04") mais perto do bloco, até `folga` pontos da caixa dele."""
    melhor, dist = None, folga
    for texto, r in rotulos:
        cx, cy = (r[0] + r[2]) / 2, (r[1] + r[3]) / 2
        d = math.hypot(max(caixa[0] - cx, 0, cx - caixa[2]), max(caixa[1] - cy, 0, cy - caixa[3]))
        if d <= dist:
            melhor, dist = (texto, r), d
    return melhor


def ler_planta(cfg: dict, imprimir=print) -> dict:
    """As pranchas de locação -> uma planta de blocos (no formato de folha_unica.ler_folha_unica)."""
    import estrutura
    import folha_unica

    pdfs = cfg.get("locacao") or []
    if not pdfs:
        raise ErroBlocos("\"locacao\": nenhuma prancha de locação achada")
    refs = [(pathlib.Path(p).name, pilares_da_referencia(p)) for p in cfg.get("referencias") or []]
    if not refs:
        raise ErroBlocos("\"referencias\": falta a pasta gerada de pelo menos um pavimento (os nomes dos pilares saem dela)")
    camada_bloco = cfg.get("camada_bloco") or CAMADA_BLOCO
    camada_pilar = cfg.get("camada_pilar") or CAMADA_PILAR
    camada_estaca = cfg.get("camada_estaca") or CAMADA_ESTACA
    lidos, sem_nome, fora = [], [], []
    estacas_lidas, estacas_fora = [], 0
    pranchas = []
    for pdf in pdfs:
        nome_pdf = estrutura.nome_da_prancha(pdf)
        lp = ler_prancha_de_locacao(pdf, camada_bloco, camada_pilar, camada_estaca)
        if not lp["blocos"]:
            fora.append({"prancha": nome_pdf, "motivo": f"nenhum bloco na camada \"{camada_bloco}\""})
            imprimir(f"  {nome_pdf}: nenhum bloco na camada \"{camada_bloco}\" (fica fora)")
            continue
        encaixes = [(nome_ref, ref, encaixe_por_pilares(lp["pilares"], ref)) for nome_ref, ref in refs]
        base = encaixes[0][2]
        if base is None or base[2] < MIN_EM_COMUM:
            n = 0 if base is None else base[2]
            fora.append({"prancha": nome_pdf, "motivo": f"não encaixou em {encaixes[0][0]} ({n} pilares em comum)"})
            imprimir(f"  {nome_pdf}: não encaixou em {encaixes[0][0]} ({n} pilares em comum; precisa de {MIN_EM_COMUM}): fica fora")
            continue
        bons = [(n, r, e) for n, r, e in encaixes if e and e[2] >= MIN_EM_COMUM]
        imprimir(f"  {nome_pdf}: {len(lp['blocos'])} blocos; encaixe " + ", ".join(f"{n} ({e[2]} pilares)" for n, _, e in bons))
        pranchas.append(folha_unica.Prancha(TRECHO, pdf, nome_pdf, lp["janela"], 0, 0, [], folha_unica.Encaixe(1.0, base[0], base[1], base[2])))
        usadas = set()
        for b in lp["blocos"]:
            dentro = [p for p in lp["pilares"] if _dentro(b["caixa"], p[0], p[1])]
            nomes = []
            for x, y, _w, _h in dentro:
                nome = next((nm for _, ref, e in bons if (nm := nome_do_pilar(x, y, ref, e[0], e[1]))), None)
                nomes.append(nome)
            cx, cy = (b["caixa"][0] + b["caixa"][2]) / 2 + base[0], (b["caixa"][1] + b["caixa"][3]) / 2 + base[1]
            if not dentro or None in nomes:
                sem_nome.append({"prancha": nome_pdf, "centro": [round(cx, 1), round(cy, 1)], "pilares_dentro": len(dentro)})
                continue
            rot = _rotulo_do_bloco(b["caixa"], lp["rotulos"])
            caixa_rot = rot[1] if rot else b["caixa"]
            nome_bloco = nome_do_bloco([n for n in nomes if n])
            ests = [(i, e) for i, e in enumerate(lp["estacas"]) if _dentro(b["caixa"], e[0], e[1])]
            usadas.update(i for i, _ in ests)
            for nome_e, (_, (ex, ey, ed)) in zip(nomes_das_estacas(nome_bloco, [(e[0], e[1]) for _, e in ests]), ests):
                x, y = ex + base[0], ey + base[1]
                estacas_lidas.append({"nome": nome_e, "secao": secao_da_estaca(ed), "prancha": nome_pdf, "centro": (x, y),
                                      "poly": poligono_do_circulo(x, y, ed / 2),
                                      "rotulo": (x - ed / 2, y - ed / 2, x + ed / 2, y + ed / 2)})
            lidos.append({
                "nome": nome_bloco,
                "secao": rot[0] if rot else "",
                "prancha": nome_pdf,
                "centro": (cx, cy),
                "poly": [(x + base[0], y + base[1]) for x, y in b["poly"]],
                "rotulo": (caixa_rot[0] + base[0], caixa_rot[1] + base[1], caixa_rot[2] + base[0], caixa_rot[3] + base[1]),
            })
        estacas_fora += len(lp["estacas"]) - len(usadas)
    if not pranchas:
        raise ErroBlocos("nenhuma prancha de locação encaixou nas referências")
    blocos, conflitos = juntar_repetidos(lidos)
    estacas, conflitos_e = juntar_repetidos(estacas_lidas)
    largura, altura, desloc_x, desloc_y = folha_unica._coordenadas_da_folha(pranchas)

    def mover(x, y):
        return [round(x + desloc_x, 2), round(y + desloc_y, 2)]

    pecas = [{
        "tipo": "K",
        "nome": b["nome"],
        "secao": b["secao"],
        "rotulo": [*mover(b["rotulo"][0], b["rotulo"][1]), *mover(b["rotulo"][2], b["rotulo"][3])],
        "polys": [[mover(x, y) for x, y in b["poly"]]],
    } for b in blocos]
    pecas += [{
        "tipo": "S",
        "nome": e["nome"],
        "secao": e["secao"],
        "rotulo": [*mover(e["rotulo"][0], e["rotulo"][1]), *mover(e["rotulo"][2], e["rotulo"][3])],
        "polys": [[mover(x, y) for x, y in e["poly"]]],
    } for e in estacas]
    n_blocos = len(blocos)
    baldrames = baldrames_da_referencia(cfg["referencias"][0]) if cfg.get("baldrames") else []
    # antes dos blocos: no desenho os blocos ficam por cima (toque na ponta da viga abre o bloco)
    pecas[:0] = [{
        "tipo": "K",
        "nome": v["nome"],
        "secao": v["secao"],
        "grade": "baldrame",
        "rotulo": ([*mover(v["rotulo"][0], v["rotulo"][1]), *mover(v["rotulo"][2], v["rotulo"][3])] if len(v["rotulo"]) == 4
                   else [*mover(*v["polys"][0][0]), *mover(*v["polys"][0][0])]),
        "polys": [[mover(x, y) for x, y in p] for p in v["polys"]],
    } for v in baldrames]
    esc = cfg.get("escavacao")
    if esc and blocos:
        xs = [x for b in blocos for x, _ in b["poly"]]
        ys = [y for b in blocos for _, y in b["poly"]]
        centros_bl = [(sum(x for x, _ in b["poly"]) / len(b["poly"]), sum(y for _, y in b["poly"]) / len(b["poly"])) for b in blocos]
        grade = grade_de_escavacao((min(xs), min(ys), max(xs), max(ys)), float(esc.get("area_m2") or 30))
        for q in so_perto_dos_blocos(grade, centros_bl, float(esc.get("perto_m") or 6) * PONTOS_POR_METRO):
            (a, b_), _, (c, d), _ = q["poly"]
            pecas.append({"tipo": "A", "nome": q["nome"], "secao": f"{q['area_m2']:.1f} m²".replace(".", ","), "grade": "escavacao",
                          "rotulo": [*mover(a, b_), *mover(a + 40, b_ + 14)],
                          "polys": [[mover(x, y) for x, y in q["poly"]]]})
    imprimir(f"  folha de {round(largura)} x {round(altura)} pontos: {n_blocos} blocos, {len(baldrames)} vigas baldrames, {len(estacas)} estacas"
             + (f" ({estacas_fora} estacas fora de bloco)" if estacas_fora else "")
             + (f"; {len(sem_nome)} sem nome (sem pilar dentro, ou pilar fora das referências)" if sem_nome else "")
             + (f"; {len(conflitos)} nomes repetidos longe um do outro" if conflitos else ""))
    niveis = folha_unica.niveis_da_folha(largura, altura)
    tiles = folha_unica._tiles(pranchas, niveis)
    nome, revisao = folha_unica.nome_da_folha([p.nome for p in pranchas])
    return {
        **({"fichas_da_grade": list(esc.get("fichas") or [])} if esc else {}),
        "disciplina": DISCIPLINA,
        "prancha": nome,
        "revisao": revisao,
        "largura": largura,
        "altura": altura,
        "tile": folha_unica.TILE,
        "niveis": niveis,
        "tiles": tiles,
        "pecas": pecas,
        "trecho": cfg.get("trecho") or TRECHO,
        "origens": [{"trecho": p.trecho, "prancha": p.nome, "janela": list(p.janela), "escala": 1.0, "dx": round(p.encaixe.dx, 2),
                     "dy": round(p.encaixe.dy, 2), "em_comum": p.encaixe.em_comum} for p in pranchas],
        "resumo": {"blocos": n_blocos, "baldrames": len(baldrames), "escavacao": sum(1 for p in pecas if p.get("grade") == "escavacao"), "estacas": len(estacas), "estacas_fora_de_bloco": estacas_fora,
                   "conflitos_estacas": conflitos_e, "sem_nome": sem_nome, "conflitos": conflitos, "fora": fora,
                   "referencias": [n for n, _ in refs]},
    }

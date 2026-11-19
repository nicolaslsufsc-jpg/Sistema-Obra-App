"""Consolos e capitéis do pilar (FVS, item 2 do pedido de 17/11/2026).

São concretados com a laje, mas os itens de aço ficam na ficha do pilar. No pacote, cada um vira uma
"parte" do pilar: um contorno próprio na planta (tocar nele abre os itens da parte) e, se achado, o
recorte do detalhe.

De onde vem cada um:
- Consolo: na forma, o retângulo da camada `consolo` com o rótulo "CONSOLO Pxx" apontando para ele.
  Nos pavimentos tipo a mesma camada guarda outros desenhos (hachura de rebaixo), por isso só vale o
  desenho encostado no pilar que o rótulo nomeia. Detalhe: as pranchas "DETALHAMENTO DOS CONSOLOS"
  (quadros com título "CONSOLO P102=P103").
- Capitel ("maciço no pilar" no projeto): a forma não marca. A lista de pilares vem das pranchas
  "LAJE ... - MACIÇOS" (títulos "ARMADURA DO MACIÇO NO PILAR (P67 - P102/102a - P123)"). Na planta,
  o capitel é um anel em volta do pilar.

Parte pura (nomes, anel, distribuição entre os pilares do par) testada em
pipeline/testes/test_fvs_partes.py; a leitura dos PDFs precisa de pymupdf, numpy e scipy.
"""

from __future__ import annotations

import re

TIPOS_DE_PARTE = ("consolo", "capitel")
# Meio metro em volta do pilar, em pontos de uma planta 1:50 (1 ponto = 0,0254/72 m no papel).
MARGEM_CAPITEL = 0.5 / (0.0254 / 72 * 50)

RE_ROTULO_CONSOLO = re.compile(r"^CONSOLO\s+(P\s?\d+[a-z]*(?:\s*=\s*P\s?\d+[a-z]*)*)$", re.I)
RE_PILAR = re.compile(r"^P\d+[a-z]*$")


# ---------------------------------------------------------------------------
# Nomes nos títulos
# ---------------------------------------------------------------------------

def _limpo(texto: str) -> str:
    return re.sub(r"\s+", " ", texto or "").strip()


def nomes_do_consolo(texto: str) -> list[str]:
    """"2xCONSOLO P102=P103" ou "CONSOLO P219=P220=..." -> ["P102", "P103"]. Outro texto: []."""
    t = _limpo(texto)
    t = re.sub(r"^\d+\s*x\s*", "", t, flags=re.I)
    t = re.sub(r"\s+ESC[\s.:].*$", "", t, flags=re.I)  # "CONSOLO P81 ESC 1:25": o título com a escala embaixo
    m = RE_ROTULO_CONSOLO.match(t)
    if not m:
        return []
    return [n.replace(" ", "") for n in re.split(r"\s*=\s*", m.group(1))]


def nomes_do_macico(texto: str) -> list[str]:
    """"ARMADURA DO MACIÇO NO PILAR (P67 - P102/102a - P123)" -> ["P67", "P102", "P102a", "P123"].

    "P78a/78aa" é P78a e P78aa: o que vem depois da barra repete o número com outra letra."""
    t = _limpo(texto)
    m = re.search(r"MACI\S*\s+NO\s+PILAR\s*\((.*?)\)?\s*$", t, re.I)
    if not m:
        return []
    nomes: list[str] = []
    for bloco in re.split(r"\s*-\s*|\s*,\s*", m.group(1)):
        primeiro = None
        for pedaco in bloco.split("/"):
            p = pedaco.strip().replace(" ", "")
            if not p:
                continue
            if not p.upper().startswith("P") and primeiro:
                p = "P" + p
            if RE_PILAR.match(p):
                nomes.append(p)
                primeiro = primeiro or p
    return list(dict.fromkeys(nomes))


# ---------------------------------------------------------------------------
# Geometria pura
# ---------------------------------------------------------------------------

def _caixa(polys) -> tuple[float, float, float, float] | None:
    pts = [pt for p in polys or [] for pt in p]
    if not pts:
        return None
    xs = [float(x) for x, _ in pts]
    ys = [float(y) for _, y in pts]
    return min(xs), min(ys), max(xs), max(ys)


def anel_do_capitel(polys, margem: float = MARGEM_CAPITEL) -> list[list[float]] | None:
    """O capitel na planta: um quadrado em volta do pilar, com folga de `margem` pontos de cada lado."""
    c = _caixa(polys)
    if c is None:
        return None
    x0, y0, x1, y1 = c[0] - margem, c[1] - margem, c[2] + margem, c[3] + margem
    return [[round(x0, 2), round(y0, 2)], [round(x1, 2), round(y0, 2)], [round(x1, 2), round(y1, 2)], [round(x0, 2), round(y1, 2)]]


def _sobreposicao(a, b) -> float:
    dx = min(a[2], b[2]) - max(a[0], b[0])
    dy = min(a[3], b[3]) - max(a[1], b[1])
    return max(dx, 0) * max(dy, 0)


def _perto(a, b, folga: float) -> bool:
    return a[0] - folga <= b[2] and b[0] - folga <= a[2] and a[1] - folga <= b[3] and b[1] - folga <= a[3]


def consolo_do_pilar(quads: list[list[list[float]]], pilar_polys, tamanho_max: float = 150.0) -> list[list[float]] | None:
    """Dos quadriláteros da camada `consolo`, o que está encostado no pilar (o que mais cobre o pilar).
    Desenho grande demais para ser consolo (hachura de rebaixo, por exemplo) não conta."""
    cp = _caixa(pilar_polys)
    if cp is None:
        return None
    melhor = None
    for q in quads:
        cq = _caixa([q])
        if cq is None or cq[2] - cq[0] > tamanho_max or cq[3] - cq[1] > tamanho_max:
            continue
        if not _perto(cq, cp, 2.0):
            continue
        s = _sobreposicao(cq, cp)
        area = (cq[2] - cq[0]) * (cq[3] - cq[1])
        chave = (s, -area)
        if melhor is None or chave > melhor[0]:
            melhor = (chave, q)
    return [[round(float(x), 2), round(float(y), 2)] for x, y in melhor[1]] if melhor else None


def base_do_nome(nome: str) -> str:
    """"P78aa" -> "P78": os pilares do mesmo par (P78, P78a, P78aa) têm a mesma base."""
    m = re.match(r"^(P\d+)", nome)
    return m.group(1) if m else nome


def distribuir_partes(pecas: list[dict], consolos: dict[str, list[list[float]]], com_capitel: set[str],
                      detalhes: dict[str, dict[str, dict]] | None = None) -> dict:
    """Põe as partes nos pilares de `pecas` (muda a lista: o pilar ganha "partes").

    consolos: nome no rótulo da forma -> contorno do consolo.
    com_capitel: nomes de pilar listados nas pranchas de maciços.
    detalhes: {"consolo": {nome: detalhe}, "capitel": {nome: detalhe}}, detalhe = {chave, ...}.

    O pilar do par que fica só com o detalhe (so_detalhe, item 4) não tem ficha: a parte vai para o
    pilar do par que tem (mesma base do nome; o mais perto). Devolve o relatório: o que entrou e o que
    ficou sem pilar."""
    detalhes = detalhes or {}
    pilares = [p for p in pecas if p.get("tipo") == "P"]
    por_nome = {p["nome"]: p for p in pilares}

    def com_ficha(nome: str) -> dict | None:
        p = por_nome.get(nome)
        if p is not None and not p.get("so_detalhe"):
            return p
        base = base_do_nome(nome)
        cands = [q for q in pilares if base_do_nome(q["nome"]) == base and not q.get("so_detalhe")]
        if not cands:
            return None
        if p is None or len(cands) == 1:
            return sorted(cands, key=lambda q: q["nome"])[0]
        cp = _caixa(p.get("polys")) or tuple(p.get("rotulo") or (0, 0, 0, 0))

        def dist(q):
            cq = _caixa(q.get("polys")) or tuple(q.get("rotulo") or (0, 0, 0, 0))
            return abs((cq[0] + cq[2]) / 2 - (cp[0] + cp[2]) / 2) + abs((cq[1] + cq[3]) / 2 - (cp[1] + cp[3]) / 2)

        return min(cands, key=dist)

    def detalhe_de(tipo: str, *nomes: str) -> dict | None:
        dets = detalhes.get(tipo) or {}
        for n in nomes:
            if n in dets:
                return dets[n]
        return None

    rel = {"consolos": [], "capiteis": [], "consolo_sem_pilar": [], "capitel_sem_pilar": [], "sem_detalhe": []}
    for nome in sorted(consolos):
        alvo = com_ficha(nome)
        if alvo is None:
            rel["consolo_sem_pilar"].append(nome)
            continue
        parte = {"tipo": "consolo", "polys": [consolos[nome]]}
        d = detalhe_de("consolo", nome, alvo["nome"])
        if d:
            parte["detalhe"] = d
        else:
            rel["sem_detalhe"].append(f"consolo {nome}")
        _juntar(alvo, parte)
        rel["consolos"].append(alvo["nome"] if alvo["nome"] == nome else f"{alvo['nome']} ({nome})")
    nomes_na_forma = {p["nome"] for p in pilares}
    for nome in sorted(com_capitel):
        if nome not in nomes_na_forma and not any(base_do_nome(n) == base_do_nome(nome) for n in nomes_na_forma):
            continue  # pilar de outro pavimento na mesma lista (a prancha de maciços cobre o pavimento todo)
        alvo = com_ficha(nome)
        anel = anel_do_capitel(alvo.get("polys")) if alvo else None
        if alvo is None or anel is None:
            rel["capitel_sem_pilar"].append(nome)
            continue
        if any(pt["tipo"] == "capitel" for pt in alvo.get("partes") or []):
            continue  # P78a/78aa: os dois nomes caem no mesmo pilar com ficha
        parte = {"tipo": "capitel", "polys": [anel]}
        d = detalhe_de("capitel", nome, alvo["nome"])
        if d:
            parte["detalhe"] = d
        else:
            rel["sem_detalhe"].append(f"capitel {nome}")
        _juntar(alvo, parte)
        rel["capiteis"].append(alvo["nome"] if alvo["nome"] == nome else f"{alvo['nome']} ({nome})")
    return rel


def _juntar(pilar: dict, parte: dict) -> None:
    lista = pilar.setdefault("partes", [])
    for pt in lista:
        if pt["tipo"] == parte["tipo"]:
            return
    lista.append(parte)


# ---------------------------------------------------------------------------
# Leitura dos PDFs (pymupdf)
# ---------------------------------------------------------------------------

def quads_de_consolo(page) -> list[list[list[float]]]:
    """Quadriláteros da camada `consolo`, nas coordenadas da folha (página já girada)."""
    M = page.rotation_matrix
    saida = []
    for d in page.get_drawings():
        if d.get("layer") != "consolo":
            continue
        for it in d["items"]:
            if it[0] == "qu":
                q = it[1]
                saida.append([[p.x, p.y] for p in (q.ul * M, q.ur * M, q.lr * M, q.ll * M)])
            elif it[0] == "re":
                r = it[1] * M
                saida.append([[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]])
    return saida


def consolos_da_forma(page, anns, pilares: list[dict]) -> dict[str, list[list[float]]]:
    """Rótulo "CONSOLO Pxx" -> contorno do consolo encostado no pilar Pxx. anns: [(texto, Rect)]."""
    nomes = []
    for c, _ in anns:
        nomes += nomes_do_consolo(c)
    if not nomes:
        return {}
    quads = quads_de_consolo(page)
    por_nome = {p["nome"]: p for p in pilares if p.get("tipo") == "P"}
    saida = {}
    for nome in dict.fromkeys(nomes):
        p = por_nome.get(nome)
        if p is None or not p.get("polys"):
            continue
        q = consolo_do_pilar(quads, p["polys"])
        if q:
            saida[nome] = q
    return saida


EXCLUIR = {"A-FOLHA", "ALAN-FOLHA", "SELO", "TABELAS", "TEXTO_TABELAS", "VPORT", "VIEW", "Relação do aço", "Rela��o do a�o"}


def _blocos_de_titulo(page, nomes_de):
    """[(texto, Rect sem girar, nomes)] dos títulos da prancha que dão nome de pilar."""
    import pymupdf

    saida = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        linhas = [" ".join(s["text"] for s in ln["spans"]) for ln in b["lines"]]
        texto = _limpo(" ".join(linhas))
        nomes = nomes_de(texto)
        if nomes:
            saida.append((texto, pymupdf.Rect(b["bbox"]), nomes))
    return saida


def ler_detalhes_de_partes(pdfs: list[str], tipo: str, escala: float = 2.4) -> dict[str, dict]:
    """Detalhes do consolo (tipo "consolo") ou do maciço (tipo "capitel"): nome do pilar -> detalhe.

    detalhe = {chave, titulo, prancha, img (WebP), aco: None}. O recorte é o grupo de desenho em volta
    do título (os quadros do consolo e os desenhos soltos do maciço)."""
    import base64
    import os

    import numpy as np
    import pymupdf
    from scipy import ndimage

    import estrutura
    import gerador_fvs as legado
    from pacote import chave_de_detalhe

    nomes_de = nomes_do_consolo if tipo == "consolo" else nomes_do_macico
    titulo_de = (lambda t: "CONSOLO " + "=".join(nomes_do_consolo(t))) if tipo == "consolo" else (lambda t: "MACIÇO NO PILAR " + "=".join(nomes_do_macico(t)))
    saida: dict[str, dict] = {}
    for caminho in pdfs:
        with pymupdf.open(caminho) as doc:
            page = doc[0]
            M = page.rotation_matrix
            titulos = [t for t in _blocos_de_titulo(page, nomes_de) if not re.match(r"^\d+\s*x", t[0], re.I)]
            if not titulos:
                continue
            # tudo em coordenadas sem girar (as do get_drawings e do get_text)
            W, H = page.mediabox.width, page.mediabox.height
            s = 0.25
            mask = np.zeros((int(H * s) + 2, int(W * s) + 2), bool)
            for d in page.get_drawings():
                r = d["rect"]
                if d.get("layer") in EXCLUIR or r.width > W * 0.5 or r.height > H * 0.5:
                    continue
                mask[max(int(r.y0 * s), 0):int(r.y1 * s) + 1, max(int(r.x0 * s), 0):int(r.x1 * s) + 1] = True
            for _, r, _ in titulos:
                mask[max(int(r.y0 * s), 0):int(r.y1 * s) + 1, max(int(r.x0 * s), 0):int(r.x1 * s) + 1] = True
            lab, _ = ndimage.label(ndimage.binary_dilation(mask, iterations=3))
            objs = ndimage.find_objects(lab)
            prancha = estrutura.nome_da_prancha(caminho)
            # quadro desenhado em volta do detalhe (as pranchas de consolo têm): o menor que contém o título
            quadros = [d["rect"] for d in page.get_drawings()
                       if d.get("layer") not in EXCLUIR and 150 < d["rect"].width < W * 0.5 and 100 < d["rect"].height < H * 0.5]
            for texto, r, nomes in titulos:
                q = min((q for q in quadros if q.contains(r)), key=lambda q: q.width * q.height, default=None)
                if q is not None:
                    caixa = q + (-2, -2, 2, 2)
                else:
                    y, x = int((r.y0 + r.y1) / 2 * s), int((r.x0 + r.x1) / 2 * s)
                    k = lab[min(y, lab.shape[0] - 1), min(x, lab.shape[1] - 1)]
                    if k == 0:
                        continue
                    sl = objs[k - 1]
                    caixa = pymupdf.Rect(sl[1].start / s, sl[0].start / s, sl[1].stop / s, sl[0].stop / s) + (-4, -4, 4, 4)
                if caixa.width > 1200 or caixa.height > 1200:
                    continue  # pegou a prancha inteira: melhor sem imagem que com a errada
                if caixa.width < 80 or caixa.height < 80:
                    continue  # só o texto (a linha da tabela de aço com o mesmo nome)
                clip = (caixa * M) & page.rect
                img = base64.b64decode(legado.render(page, clip, escala))
                titulo = titulo_de(texto)
                det = {"chave": chave_de_detalhe("C" if tipo == "consolo" else "K", titulo), "titulo": titulo,
                       "prancha": prancha, "img": img, "aco": None}
                for n in nomes:
                    saida.setdefault(n, det)
    return saida


def nomes_com_capitel(pdfs: list[str]) -> set[str]:
    """Todos os pilares listados nos títulos das pranchas de maciços."""
    import pymupdf

    nomes: set[str] = set()
    for caminho in pdfs:
        with pymupdf.open(caminho) as doc:
            for _, _, ns in _blocos_de_titulo(doc[0], nomes_do_macico):
                nomes.update(ns)
    return nomes

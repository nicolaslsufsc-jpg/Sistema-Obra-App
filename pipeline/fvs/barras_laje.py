"""Barras de aço da laje (FVS, plano A aprovado pelo Nicolas em 18/11/2026; fatia 1: longitudinal inferior).

As pranchas "LAJE DO nº PAVTO TIPO ARMADURA {LONGITUDINAL|TRANSVERSAL} {INFERIOR|SUPERIOR}" desenham cada
barra como um traço numa camada do PDF (ARR_LONG_INF na longitudinal inferior), com a etiqueta de posição
ao lado ("N25-1%%c10 C=850+N15-1%%c8 C=710": duas barras na nervura, uma de cada posição).

O que este módulo faz, por prancha:
  1. lê os traços da camada, as etiquetas e os contornos dos pilares (PILAR_CONCRETO), dentro da janela do
     desenho (o maior recorte da folha; a planta chave fica de fora). Prancha sem esses contornos (as do 4º
     pavimento da obra piloto desenham o pilar na camada das vigas) guarda os retângulos das camadas de
     reserva (CAMADAS_DE_CONTORNO), e só os do tamanho de um pilar da forma entram no encaixe;
  2. liga cada etiqueta às barras dela: traço paralelo, encostado na etiqueta, com o comprimento do "C=";
  3. alinha a prancha na folha de forma pelos pilares (pipeline/alinhamento). Se não alinhar com segurança,
     a prancha inteira fica FORA do pacote e vai para o relatório de conflitos;
  4. leva as barras para as coordenadas da folha.

No app (aba Barras), cada barra é tocada como OK ou errada; todas as barras de todas as camadas dentro da
área de uma laje OK deixam o item de armadura da ficha dessa laje C sozinho.

Parte pura (etiqueta, ligação, pilares da forma, encaixe) testada em pipeline/testes/test_fvs_barras_laje.py.
"""

from __future__ import annotations

import math
import pathlib
import re
import sys

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent))

from alinhamento import alinhar as al  # noqa: E402

# As quatro camadas, como nas pranchas (decisão do Nicolas, 18/11/2026). A ordem é a do app.
CAMADAS = ("transversal_superior", "transversal_inferior", "longitudinal_superior", "longitudinal_inferior")
NOME_DA_CAMADA = {
    "transversal_superior": "Transversal superior",
    "transversal_inferior": "Transversal inferior",
    "longitudinal_superior": "Longitudinal superior",
    "longitudinal_inferior": "Longitudinal inferior",
}
# Camada do PDF de cada uma. Conferidas nas pranchas do 2º pavimento da obra piloto (longitudinal inferior em
# 18/11; as outras três em 20/11: a transversal é "TRANS", não "TRANSV"). Outra obra pode passar o nome no
# pavimento.json ("camada_pdf").
CAMADA_DO_PDF = {
    "longitudinal_inferior": "ARR_LONG_INF",
    "longitudinal_superior": "ARR_LONG_SUP",
    "transversal_inferior": "ARR_TRANS_INF",
    "transversal_superior": "ARR_TRANS_SUP",
}
CAMADAS_DE_PILAR = ("PILAR_CONCRETO",)
# Reserva, quando a prancha não tem o contorno do pilar na camada dele (4º pavimento da obra piloto, 20/11/2026:
# o pilar vem em VIG_FACES, junto das cubetas da nervurada). Desses retângulos, só os que têm o tamanho de um
# pilar da folha de forma (até 5 cm, deitado ou em pé) entram no encaixe; as cubetas não têm e ficam de fora.
CAMADAS_DE_CONTORNO = ("PILAR_BETAO", "VIG_FACES")

PT_POR_CM = al.PT_POR_CM_1_50
DIST_ETIQUETA = 14.0  # pontos: até onde a barra pode estar da etiqueta dela
TOLERANCIA_COMPRIMENTO = 0.08  # do "C=" da etiqueta (mínimo de 20 cm)
TOLERANCIA_PT = al.TOLERANCIA_CM * PT_POR_CM  # 5 cm: a mesma barra em duas pranchas vizinhas

RE_PARTE = re.compile(r"N\s*(?P<n>\d+)\s*-\s*(?P<qtd>\d*)\s*(?:%%[cC]|ø|Ø|∅)\s*(?P<bitola>\d+(?:[.,]\d+)?)"
                      r"\s*(?:c\s*/\s*(?P<esp>\d+(?:[.,]\d+)?))?\s*C\s*=\s*(?P<c>\d+(?:[.,]\d+)?)", re.I)


class ErroBarras(Exception):
    pass


# ---------------------------------------------------------------------------
# Parte pura
# ---------------------------------------------------------------------------

def _num(t: str) -> float:
    return float(t.replace(",", "."))


def _fmt(v: float) -> str:
    return f"{v:g}".replace(".", ",")


def ler_etiqueta(texto: str) -> list[dict]:
    """"N25-1%%c10 C=850+N15-1%%c8 C=710" -> [{posicao: "N25", quantidade: 1, bitola: 10, comprimento: 850,
    texto: "N25 1ø10 C=850"}, {... N15 ...}]. Barra corrida: "N2-%%c8c/10 C=130" tem espacamento: 10."""
    saida = []
    for m in RE_PARTE.finditer(texto or ""):
        parte = {"posicao": f"N{int(m.group('n'))}", "bitola": _num(m.group("bitola")), "comprimento": _num(m.group("c"))}
        if m.group("qtd"):
            parte["quantidade"] = int(m.group("qtd"))
        if m.group("esp"):
            parte["espacamento"] = _num(m.group("esp"))
        qtd = f"{parte['quantidade']}" if "quantidade" in parte else ""
        esp = f" c/{_fmt(parte['espacamento'])}" if "espacamento" in parte else ""
        parte["texto"] = f"{parte['posicao']} {qtd}ø{_fmt(parte['bitola'])}{esp} C={_fmt(parte['comprimento'])}"
        saida.append(parte)
    return saida


def comprimento(linha) -> float:
    return sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(linha, linha[1:]))


def _trecho_principal(linha):
    """O maior segmento da barra (a barra sem as dobras)."""
    return max(zip(linha, linha[1:]), key=lambda s: math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]))


def _encosta(linha, r, dist: float) -> bool:
    """O trecho principal da barra é paralelo à etiqueta (retângulo r) e passa encostado nela."""
    (x0, y0), (x1, y1) = _trecho_principal(linha)
    horizontal_etq = (r[2] - r[0]) >= (r[3] - r[1])
    if horizontal_etq != (abs(x1 - x0) >= abs(y1 - y0)):
        return False
    if horizontal_etq:
        y = (y0 + y1) / 2
        lo, hi = min(x0, x1), max(x0, x1)
        cobre = min(hi, r[2]) - max(lo, r[0])
        return r[1] - dist <= y <= r[3] + dist and cobre >= 0.5 * (r[2] - r[0])
    x = (x0 + x1) / 2
    lo, hi = min(y0, y1), max(y0, y1)
    cobre = min(hi, r[3]) - max(lo, r[1])
    return r[0] - dist <= x <= r[2] + dist and cobre >= 0.5 * (r[3] - r[1])


def _dist_etiqueta(linha, r) -> float:
    (x0, y0), (x1, y1) = _trecho_principal(linha)
    cx, cy = (r[0] + r[2]) / 2, (r[1] + r[3]) / 2
    if abs(x1 - x0) >= abs(y1 - y0):
        return abs((y0 + y1) / 2 - cy)
    return abs((x0 + x1) / 2 - cx)


def casar_etiquetas(barras: list[dict], etiquetas: list[tuple[str, tuple]], pt_por_cm: float = PT_POR_CM,
                    dist: float = DIST_ETIQUETA) -> int:
    """Põe em cada barra a posição da etiqueta dela (barra["posicao"], ["texto"], ["bitola"]...). Uma parte da
    etiqueta por barra: a de comprimento mais parecido com o traço; no empate, a mais perto. Devolve quantas
    barras ganharam posição. Muda barras."""
    livres = set(range(len(barras)))
    ligadas = 0
    for texto, r in etiquetas:
        partes = ler_etiqueta(texto)
        if not partes:
            continue
        perto = [i for i in livres if _encosta(barras[i]["linha"], r, dist)]
        for p in partes:
            alvo = p["comprimento"] * pt_por_cm
            folga = max(20 * pt_por_cm, TOLERANCIA_COMPRIMENTO * alvo)
            cand = [(abs(comprimento(barras[i]["linha"]) - alvo), _dist_etiqueta(barras[i]["linha"], r), i) for i in perto
                    if abs(comprimento(barras[i]["linha"]) - alvo) <= folga]
            if not cand:
                continue
            _, _, i = min(cand)
            perto.remove(i)
            livres.discard(i)
            barras[i].update({k: v for k, v in p.items()})
            ligadas += 1
    return ligadas


def pontos_dos_pilares(pecas: list[dict]) -> list[al.Ponto]:
    """Os pilares da folha de forma como pontos para o alinhamento: centro e tamanho do contorno."""
    saida = []
    for p in pecas:
        if p.get("tipo") != "P" or not p.get("polys"):
            continue
        xs = [pt[0] for poly in p["polys"] for pt in poly]
        ys = [pt[1] for poly in p["polys"] for pt in poly]
        saida.append(al.Ponto((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, w=max(xs) - min(xs), h=max(ys) - min(ys)))
    return saida


def do_tamanho_de_um_pilar(p: al.Ponto, destino: list[al.Ponto], tol: float | None = None) -> bool:
    """O retângulo tem a largura e a altura de algum pilar da folha (deitado ou em pé), até a tolerância (5 cm)."""
    tol = al.TOLERANCIA_CM * PT_POR_CM if tol is None else tol
    if p.w is None or p.h is None:
        return False
    return any(d.w is not None and d.h is not None
               and ((abs(p.w - d.w) <= tol and abs(p.h - d.h) <= tol) or (abs(p.w - d.h) <= tol and abs(p.h - d.w) <= tol))
               for d in destino)


def pilares_da_prancha(pr: dict, destino: list[al.Ponto]) -> tuple[list[al.Ponto], str]:
    """Os pontos da prancha para o encaixe e de onde vieram. Os contornos de pilar (PILAR_CONCRETO) valem
    primeiro; com menos que o mínimo do encaixe, entram os retângulos das camadas de reserva que têm o tamanho
    de um pilar da folha de forma."""
    pilares = pr.get("pilares") or []
    reserva = pr.get("retangulos") or []
    if len(pilares) >= al.MIN_PONTOS or not reserva:
        return pilares, "contorno do pilar"
    return [p for p in reserva if do_tamanho_de_um_pilar(p, destino)], "retângulo do tamanho do pilar"


def levar_para_folha(barras: list[dict], T: dict) -> list[dict]:
    """As barras nas coordenadas da folha de forma."""
    saida = []
    for b in barras:
        nova = dict(b)
        nova["linha"] = [[round(c, 2) for c in al.transformar(T, x, y)] for x, y in b["linha"]]
        saida.append(nova)
    return saida


def juntar_barras(pecas: list[dict], pranchas: list[dict], manuais: dict | None = None) -> tuple[list[dict], list[dict], list[dict]]:
    """Alinha cada prancha lida (ler_prancha) na folha e junta as barras das que alinharam.

    manuais: {nome da prancha: {"matriz": [...], "t": [...]}} passados à mão no pavimento.json.
    Devolve (barras na folha, conflitos para o relatório, resumo por prancha)."""
    from alinhamento import relatorio

    destino = pontos_dos_pilares(pecas)
    barras, conflitos, resumo = [], [], []
    for pr in pranchas:
        T = (manuais or {}).get(pr["nome"])
        origem, por = pilares_da_prancha(pr, destino)
        res = al.manual(T, origem, destino) if T else al.alinhar(origem, destino)
        d = res.como_dict()
        linha = {"prancha": pr["nome"], "camada": pr["camada"], "barras": len(pr["barras"]),
                 "com_posicao": sum(1 for b in pr["barras"] if b.get("posicao")), "alinhamento": d, "pilares_por": por}
        resumo.append(linha)
        if not res.ok:
            conflitos.append(relatorio.linha(pr["nome"], pr["camada"], d))
            continue
        linha["repetidas"] = 0
        for b in levar_para_folha(pr["barras"], res.transformacao):
            b["prancha"] = pr["nome"]
            igual = next((x for x in barras if mesma_barra(x, b)), None)
            if igual:
                # pranchas vizinhas se sobrepõem na emenda: a mesma barra vem nas duas e conta uma vez só
                linha["repetidas"] += 1
                continue
            barras.append(b)
    return barras, conflitos, resumo


def mesma_barra(a: dict, b: dict, tol: float = TOLERANCIA_PT) -> bool:
    """A mesma barra desenhada em duas pranchas vizinhas (faixa de emenda): mesma camada, mesma etiqueta
    e todos os pontos a menos da tolerância (5 cm), num sentido ou no outro. Barras da mesma prancha nunca
    são juntadas (duas barras de verdade podem estar lado a lado)."""
    if a.get("prancha") == b.get("prancha") or a["camada"] != b["camada"] or a.get("texto") != b.get("texto"):
        return False
    la, lb = a["linha"], b["linha"]
    if len(la) != len(lb):
        return False
    perto = lambda u, v: all(abs(p[0] - q[0]) <= tol and abs(p[1] - q[1]) <= tol for p, q in zip(u, v))
    return perto(la, lb) or perto(la, lb[::-1])


# ---------------------------------------------------------------------------
# Leitura do PDF (pymupdf)
# ---------------------------------------------------------------------------

def _janela(page):
    import folha_unica

    r = page.rect
    return folha_unica.janela_principal(folha_unica._recortes(page), r.width, r.height)


def ler_prancha(pdf: str, camada: str, camada_pdf: str | None = None) -> dict:
    """Barras, etiquetas e pilares de uma prancha de armação, nas coordenadas da folha da prancha."""
    import estrutura
    import pymupdf

    if camada not in CAMADAS:
        raise ErroBarras(f"camada desconhecida: {camada}")
    nome_pdf = camada_pdf or CAMADA_DO_PDF[camada]
    with pymupdf.open(pdf) as doc:
        page = doc[0]
        M = page.rotation_matrix
        j = _janela(page)
        if j is None:
            raise ErroBarras(f"{pathlib.Path(pdf).name}: não achei a janela do desenho na prancha")

        def dentro(x, y):
            return j[0] <= x <= j[2] and j[1] <= y <= j[3]

        barras, pilares, retangulos = [], [], []
        for d in page.get_drawings():
            camada_d = d.get("layer")
            if camada_d == nome_pdf:
                pts = []
                for it in d["items"]:
                    if it[0] != "l":
                        continue
                    a, b = it[1] * M, it[2] * M
                    if not pts or math.hypot(pts[-1][0] - a.x, pts[-1][1] - a.y) > 0.05:
                        pts.append([a.x, a.y])
                    pts.append([b.x, b.y])
                if len(pts) >= 2:
                    meio = pts[len(pts) // 2]
                    if dentro(*meio):
                        barras.append({"camada": camada, "linha": [[round(x, 2), round(y, 2)] for x, y in pts]})
            elif camada_d in CAMADAS_DE_PILAR or camada_d in CAMADAS_DE_CONTORNO:
                destino_d = pilares if camada_d in CAMADAS_DE_PILAR else retangulos
                for it in d["items"]:
                    if it[0] == "qu":
                        q = it[1].rect * M
                    elif it[0] == "re":
                        q = it[1] * M
                    else:
                        continue
                    if dentro((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2) and q.width > 2 and q.height > 2:
                        destino_d.append(al.Ponto((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2, w=q.width, h=q.height))
        etiquetas = []
        for a in page.annots() or []:
            texto = (a.info.get("content") or "").strip()
            if texto.upper().startswith("N") and ler_etiqueta(texto):
                q = a.rect * M
                if dentro((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2):
                    etiquetas.append((texto, (q.x0, q.y0, q.x1, q.y1)))
        if not barras:
            raise ErroBarras(f"{pathlib.Path(pdf).name}: nenhum traço na camada {nome_pdf}")
    casar_etiquetas(barras, etiquetas)
    nome = estrutura.nome_da_prancha(pdf)
    base = re.sub(r"-R\d+$", "", nome)  # a revisão nova da prancha não muda a barra que não mexeu
    for b in barras:
        (x0, y0), (x1, y1) = b["linha"][0], b["linha"][-1]
        b["chave"] = f"{camada}|{base}|{x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f}"
    return {"nome": nome, "pdf": pdf, "camada": camada, "janela": j,
            "barras": barras, "etiquetas": len(etiquetas), "pilares": _sem_repetidos(pilares),
            "retangulos": _sem_repetidos(retangulos)}


def _sem_repetidos(pontos: list[al.Ponto], tol: float = 0.5) -> list[al.Ponto]:
    """O mesmo pilar desenhado duas vezes (contorno e hachura) conta uma vez."""
    saida: list[al.Ponto] = []
    grade: dict[tuple[int, int], list[al.Ponto]] = {}  # por casa da grade: milhares de cubetas sem custo quadrático
    for p in pontos:
        cx, cy = math.floor(p.x / tol), math.floor(p.y / tol)
        perto = (q for i in (-1, 0, 1) for j in (-1, 0, 1) for q in grade.get((cx + i, cy + j), ()))
        if not any(abs(p.x - q.x) <= tol and abs(p.y - q.y) <= tol for q in perto):
            saida.append(p)
            grade.setdefault((cx, cy), []).append(p)
    return saida

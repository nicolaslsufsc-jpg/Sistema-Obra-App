"""Furos de viga (FVS, fatia 1 da conferência por elemento, pedido de 17/11/2026, itens 3 e 7).

Cada furo de passagem de instalação numa viga vira um local de inspeção próprio (tipo "F") no pacote da
planta de forma, ligado à viga onde está. Na obra, a pessoa toca no furo: OK, errado ou vazio.

De onde vêm: do modelo de furação em IFC (o "modelo geral" da pasta de modelagem da furação, exportado do
Revit). Nele, cada furo é um IfcBuildingElementProxy com:
- a família: "... circular viga ..." ou "... retangular viga ..."; os de laje ("... circular laje ...", "... retangular
  laje ...", item 4 da frente FVS estrutura, 19/11/2026) entram também, sem viga: no app cada um é ligado à
  área de laje desenhada onde cai (decisão do Nicolas de 19/11);
- as cotas (conjunto "Dimensions"): FURO.DIAMETRO ou FURO.LARGURA e FURO.ALTURA, DIST.TOPO.VIGA (hT),
  DIST.FUNDO.VIGA (hB), LARGURA.VIGA e ALTURA.VIGA, em cm;
- a disciplina (caixas "p.FURO.SAN", "p.FURO.HID", "p.FURO.ELT/TEL"...);
- o nível (conjunto "Constraints", "Level"), que diz a que pavimento ele pertence.
O nome da viga não está no modelo. Ele sai da planta: os furos de um nível são encaixados na folha de forma
do pavimento (rotação de 90 em 90 graus, espelho, escala da prancha e deslocamento) pela posição em que mais
furos caem dentro de uma viga (votação). Furo que não cai em nenhuma viga vai para o relatório.

Parte pura (encaixe, distribuição, nomes, leitura das propriedades) testada em
pipeline/testes/test_fvs_furos.py; a leitura do IFC precisa de ifcopenshell.
"""

from __future__ import annotations

import math
import re
import unicodedata


# Pontos do PDF por cm de obra, numa prancha 1:N.
PT_POR_CM_PAPEL = 72 / 2.54
# Furo a até 10 cm de obra do contorno da viga conta como da viga (o desenho da forma e o modelo não
# batem ao milímetro). Aprovado pelo Nicolas em 18/11: traz os furos de borda para a viga.
FOLGA_CM = 10.0


class ErroFuros(Exception):
    pass


DISCIPLINAS = (
    ("SAN", "Sanitário / drenagem"),
    ("HID", "Hidráulica"),
    ("ELT", "Elétrica / telecom"),
    ("PCI", "Incêndio / gás"),
    ("CLI", "Climatização"),
    ("GERAL", "Geral"),
)


def _so_letras(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^A-Z0-9]", "", sem_acento.upper())


def mesmo_nivel(a: str, b: str) -> bool:
    """Nível do modelo e nível do pavimento.json: compara só letras e números, sem acento. Se o modelo veio
    com a letra acentuada estragada ("T?RREO"), compara só as consoantes e os números."""
    ka, kb = _so_letras(a), _so_letras(b)
    if not ka or not kb:
        return False
    return ka == kb or re.sub(r"[AEIOU]", "", ka) == re.sub(r"[AEIOU]", "", kb)


def disciplinas_de(caixas: dict) -> list[str]:
    """{"p.FURO.SAN": True, "p.FURO.HID": False, ...} -> ["Sanitário / drenagem"] (na ordem de DISCIPLINAS)."""
    marcadas = [_so_letras(k)[5:] for k, v in (caixas or {}).items() if v is True and _so_letras(k).startswith("PFURO")]
    return [nome for sigla, nome in DISCIPLINAS if any(m.startswith(sigla) for m in marcadas)]


def _num(v) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def furo_das_propriedades(nome_familia: str, psets: dict, x_cm: float, y_cm: float, ident: str = "") -> dict | None:
    """Um furo de viga ou de laje a partir das propriedades do IFC. Outro objeto: None.

    Devolve {id, x, y (cm, coordenadas do modelo), forma, diametro?, largura?, altura?, topo?, fundo?,
    largura_viga?, disciplinas, nivel}; o de laje tem "laje": true e "espessura" (a da laje) no lugar de
    topo, fundo e largura da viga."""
    familia = (nome_familia or "").lower()
    if "laje" in familia and "viga" not in familia:
        return _furo_de_laje(familia, psets, x_cm, y_cm, ident)
    if "viga" not in familia:
        return None
    forma = "retangular" if "retangular" in familia else "circular" if "circular" in familia else None
    if forma is None:
        return None
    dim = psets.get("Dimensions") or {}
    outros = psets.get("Other") or {}
    furo = {"id": str(ident), "x": float(x_cm), "y": float(y_cm), "forma": forma,
            "nivel": (psets.get("Constraints") or {}).get("Level") or "",
            "disciplinas": disciplinas_de(psets.get("Materials and Finishes") or {})}
    if forma == "circular":
        d = _num(dim.get("FURO.DIAMETRO")) or _num(outros.get("FURO.DIAMETRO"))
        if d:
            furo["diametro"] = round(d, 1)
    else:
        for campo, chave in (("largura", "FURO.LARGURA"), ("altura", "FURO.ALTURA")):
            v = _num(dim.get(chave))
            if v:
                furo[campo] = round(v, 1)
    for campo, chave in (("topo", "DIST.TOPO.VIGA"), ("fundo", "DIST.FUNDO.VIGA"), ("largura_viga", "LARGURA.VIGA")):
        v = _num(dim.get(chave))
        if v is not None:
            furo[campo] = round(v, 1)
    return furo


def _furo_de_laje(familia: str, psets: dict, x_cm: float, y_cm: float, ident: str) -> dict | None:
    forma = "retangular" if "retangular" in familia else "circular" if "circular" in familia else None
    if forma is None:
        return None
    dim = psets.get("Dimensions") or {}
    outros = psets.get("Other") or {}
    furo = {"id": str(ident), "x": float(x_cm), "y": float(y_cm), "forma": forma, "laje": True,
            "nivel": (psets.get("Constraints") or {}).get("Level") or "",
            "disciplinas": disciplinas_de(psets.get("Materials and Finishes") or {})}
    campos = (("diametro", "FURO.DIAMETRO"),) if forma == "circular" else (("largura", "FURO.LARGURA"), ("altura", "FURO.ALTURA"))
    for campo, chave in campos:
        v = _num(dim.get(chave)) or _num(outros.get(chave))
        if v:
            furo[campo] = round(v, 1)
    e = _num(dim.get("ALTURA.LAJE"))
    if e:
        furo["espessura"] = round(e, 1)
    return furo


def _cm(v: float) -> str:
    return f"{v:g}".replace(".", ",")


def secao_do_furo(f: dict) -> str:
    """"Ø 10 cm · 25 cm do topo" ou "175×15 cm · 62 cm do topo"."""
    if f["forma"] == "circular":
        medida = f"Ø {_cm(f['diametro'])} cm" if f.get("diametro") else "circular"
    else:
        medida = f"{_cm(f['largura'])}×{_cm(f['altura'])} cm" if f.get("largura") and f.get("altura") else "retangular"
    if f.get("topo") is not None:
        medida += f" · {_cm(f['topo'])} cm do topo"
    return medida


# ---------------------------------------------------------------------------
# Geometria pura
# ---------------------------------------------------------------------------

def _rotacoes() -> list[list[list[float]]]:
    """As 8 orientações (4 giros de 90 graus, com e sem espelho), como matrizes 2x2."""
    saida = []
    for espelho in (1, -1):
        for c, s in ((1, 0), (0, 1), (-1, 0), (0, -1)):
            saida.append([[float(c), float(-s * espelho)], [float(s), float(c * espelho)]])
    return saida


ROTACOES = _rotacoes()


def ponto_dentro(x: float, y: float, poly) -> bool:
    """Ponto dentro do polígono (raio cruzando as arestas)."""
    dentro = False
    n = len(poly)
    for i in range(n):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % n]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0:
            dentro = not dentro
    return dentro


def dist_ao_poligono(x: float, y: float, poly) -> float:
    """Distância do ponto ao contorno (0 se estiver dentro)."""
    if ponto_dentro(x, y, poly):
        return 0.0
    melhor = math.inf
    n = len(poly)
    for i in range(n):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % n]
        dx, dy = x1 - x0, y1 - y0
        t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)))
        melhor = min(melhor, math.hypot(x0 + t * dx - x, y0 + t * dy - y))
    return melhor


def _perto(x, y, poly, folga) -> bool:
    xs = [pt[0] for pt in poly]
    ys = [pt[1] for pt in poly]
    return min(xs) - folga <= x <= max(xs) + folga and min(ys) - folga <= y <= max(ys) + folga


def transformar(enc: dict, x_cm: float, y_cm: float) -> tuple[float, float]:
    """Ponto do modelo (cm) na folha de forma (pontos do PDF), pelo encaixe."""
    (a, b), (c, d) = enc["rotacao"]
    f = float(enc["fator"])
    return (a * x_cm + b * y_cm) * f + enc["t"][0], (c * x_cm + d * y_cm) * f + enc["t"][1]


def _contar_dentro(pts, vigas: list[tuple[str, list]], folga: float) -> int:
    n = 0
    for x, y in pts:
        if any(dist_ao_poligono(x, y, poly) <= folga for _, polys in vigas for poly in polys if _perto(x, y, poly, folga)):
            n += 1
    return n


def _amostras_das_vigas(vigas: list[tuple[str, list]], passo: float):
    import numpy as np

    pts = []
    for _, polys in vigas:
        for poly in polys:
            if len(poly) < 3:
                continue
            xs_, ys_ = [pt[0] for pt in poly], [pt[1] for pt in poly]
            x0, x1, y0, y1 = min(xs_), max(xs_), min(ys_), max(ys_)
            dentro_ = [(x, y) for x in np.arange(x0 + passo / 2, x1, passo) for y in np.arange(y0 + passo / 2, y1, passo)
                       if ponto_dentro(float(x), float(y), poly)]
            pts += dentro_ or [((x0 + x1) / 2, (y0 + y1) / 2)]  # viga fina: pelo menos o centro
    return np.asarray(pts, float).reshape(-1, 2)


def encaixar(pontos_cm: list[tuple[float, float]], vigas: list[tuple[str, list]], escala_prancha: float = 50.0,
             ajustes=(0.98, 0.99, 1.0, 1.01, 1.02), passo: float = 4.0, folga: float = 3.0) -> dict | None:
    """Encaixa os furos (cm do modelo) nas vigas da folha (pontos do PDF). Precisa de numpy.

    Para cada orientação e cada ajuste fino de escala (a folha única pode ter sido ajustada ao juntar as
    pranchas), cada par (furo, ponto dentro de uma viga) vota num deslocamento; o mais votado é refinado
    (média do quanto falta para cada furo chegar à viga mais perto) e vale o encaixe em que mais furos caem
    numa viga. Devolve {rotacao, fator, t, dentro, total, segundo} (segundo = quantos caíram no melhor
    encaixe das outras orientações: mostra se o encaixe é claro)."""
    import numpy as np

    if not pontos_cm or not vigas:
        return None
    p = np.asarray(pontos_cm, float)
    am = _amostras_das_vigas(vigas, passo)
    if not len(am):
        return None
    base = PT_POR_CM_PAPEL / float(escala_prancha)
    bins = 6.0
    resultados = []
    for R in ROTACOES:
        Rm = np.asarray(R, float)
        melhor_rot = None
        for aj in ajustes:
            fator = base * aj
            q = (p @ Rm.T) * fator
            lo = am.min(0) - q.max(0)
            hi = am.max(0) - q.min(0)
            nx, ny = int((hi[0] - lo[0]) / bins) + 2, int((hi[1] - lo[1]) / bins) + 2
            H = np.zeros((nx, ny), np.int32)
            for i in range(0, len(q), 20):
                t = (am[None, :, :] - q[i:i + 20, None, :]).reshape(-1, 2)
                np.add.at(H, (((t[:, 0] - lo[0]) / bins).astype(np.int64), ((t[:, 1] - lo[1]) / bins).astype(np.int64)), 1)
            j = np.unravel_index(int(H.argmax()), H.shape)
            t0 = np.array([lo[0] + (j[0] + 0.5) * bins, lo[1] + (j[1] + 0.5) * bins])
            # refino: para cada furo, o quanto falta até o ponto de viga mais perto (só os que já estão perto)
            difs = []
            for x, y in q + t0:
                d = am - (x, y)
                k = int(np.argmin((d ** 2).sum(1)))
                if abs(d[k, 0]) <= bins and abs(d[k, 1]) <= bins:
                    difs.append(d[k])
            if difs:
                t0 = t0 + np.median(np.asarray(difs), axis=0)
            n = _contar_dentro((q + t0).tolist(), vigas, folga)
            if melhor_rot is None or n > melhor_rot["dentro"]:
                melhor_rot = {"rotacao": R, "fator": float(fator), "t": [float(t0[0]), float(t0[1])], "dentro": n}
        resultados.append(melhor_rot)
    resultados.sort(key=lambda r: -r["dentro"])
    melhor = dict(resultados[0])
    melhor["total"] = len(p)
    melhor["segundo"] = resultados[1]["dentro"] if len(resultados) > 1 else 0
    return melhor


def _ordem_na_viga(polys, x: float, y: float) -> float:
    """Posição do furo ao longo da viga (da esquerda para a direita ou de cima para baixo)."""
    xs = [pt[0] for poly in polys for pt in poly]
    ys = [pt[1] for poly in polys for pt in poly]
    return x if max(xs) - min(xs) >= max(ys) - min(ys) else y


def contorno_do_furo(x: float, y: float, raio: float, lados: int = 8) -> list[list[float]]:
    """Octógono em volta do ponto (o furo na planta; o app desenha um alvo maior para o dedo)."""
    return [[round(x + raio * math.cos(2 * math.pi * k / lados), 2), round(y + raio * math.sin(2 * math.pi * k / lados), 2)] for k in range(lados)]


def distribuir_furos(furos: list[dict], pecas: list[dict], enc: dict, folga_cm: float = FOLGA_CM) -> tuple[list[dict], dict]:
    """Os furos viram locais "F" da planta, cada um na viga onde cai (ou a até folga_cm de obra dela; vale a mais perto).

    pecas: as peças da forma (só as vigas contam). Devolve (locais novos, relatório). O nome do furo é o da
    viga com o número do furo ao longo dela ("V12-F1", "V12-F2"); a viga que tem só um furo também ganha F1."""
    furos = [f for f in furos if not f.get("laje")]  # os de laje: furos_de_laje
    folga = folga_cm * float(enc["fator"])  # cm de obra -> pontos da folha
    vigas = [p for p in pecas if p.get("tipo") == "V" and p.get("polys")]
    por_viga: dict[str, list[tuple[float, dict, tuple[float, float]]]] = {}
    sem_viga = []
    for f in furos:
        x, y = transformar(enc, f["x"], f["y"])
        melhor = None
        for v in vigas:
            if not any(_perto(x, y, poly, folga) for poly in v["polys"]):
                continue
            d = min(dist_ao_poligono(x, y, poly) for poly in v["polys"])
            if d <= folga and (melhor is None or d < melhor[0] or (d == melhor[0] and v["nome"] < melhor[1]["nome"])):
                melhor = (d, v)
        if melhor is None:
            sem_viga.append({"id": f["id"], "x": round(x, 1), "y": round(y, 1), "secao": secao_do_furo(f), "disciplinas": f.get("disciplinas") or []})
            continue
        v = melhor[1]
        por_viga.setdefault(v["nome"], []).append((_ordem_na_viga(v["polys"], x, y), f, (x, y)))
    locais = []
    raio = max(2.0, 5.0 * float(enc["fator"]))  # 5 cm de obra, no mínimo 2 pontos
    for nome_viga in sorted(por_viga, key=_chave_natural):
        lista = sorted(por_viga[nome_viga], key=lambda t: (t[0], t[1]["id"]))
        for k, (_, f, (x, y)) in enumerate(lista, 1):
            nome = f"{nome_viga}-F{k}"
            info = {c: f[c] for c in ("forma", "diametro", "largura", "altura", "topo", "fundo", "disciplinas") if f.get(c) not in (None, [], "")}
            if f.get("id"):
                info["modelo_id"] = f["id"]
            locais.append({
                "tipo": "F", "nome": nome, "secao": secao_do_furo(f),
                "rotulo": [round(x - raio, 1), round(y - raio, 1), round(x + raio, 1), round(y + raio, 1)],
                "polys": [contorno_do_furo(x, y, raio)],
                "viga": nome_viga, "furo": info,
            })
    rel = {
        "furos": len(furos),
        "em_viga": len(locais),
        "vigas_com_furo": len(por_viga),
        "sem_viga": sem_viga,
        "encaixe": {"dentro": enc.get("dentro"), "segundo": enc.get("segundo"), "total": enc.get("total"),
                    "fator": round(float(enc["fator"]), 5), "rotacao": enc["rotacao"], "t": [round(v, 1) for v in enc["t"]],
                    "duvidoso": encaixe_duvidoso(enc)},
    }
    return locais, rel


def furos_de_laje(furos: list[dict], enc: dict) -> list[dict]:
    """Os furos de laje viram locais "F" sem viga ("laje": true no furo), com o mesmo encaixe dos furos de
    viga. O nome segue a folha, de cima para baixo e da esquerda para a direita (faixas de 1 m de obra):
    "FL1", "FL2"... A área de laje de cada um é achada no app (ela é desenhada lá, depois do pacote)."""
    raio = max(2.0, 5.0 * float(enc["fator"]))
    faixa = 100.0 * float(enc["fator"])  # 1 m de obra, em pontos da folha
    pontos = []
    for f in furos:
        if not f.get("laje"):
            continue
        x, y = transformar(enc, f["x"], f["y"])
        pontos.append((round(y / faixa), x, f.get("id") or "", x, y, f))
    locais = []
    for k, (_, _, _, x, y, f) in enumerate(sorted(pontos, key=lambda t: t[:3]), 1):
        info = {c: f[c] for c in ("forma", "diametro", "largura", "altura", "espessura", "disciplinas") if f.get(c) not in (None, [], "")}
        info["laje"] = True
        if f.get("id"):
            info["modelo_id"] = f["id"]
        locais.append({
            "tipo": "F", "nome": f"FL{k}", "secao": secao_do_furo(f),
            "rotulo": [round(x - raio, 1), round(y - raio, 1), round(x + raio, 1), round(y + raio, 1)],
            "polys": [contorno_do_furo(x, y, raio)],
            "furo": info,
        })
    return locais


def encaixe_duvidoso(enc: dict) -> bool:
    """O encaixe automático não convence: menos da metade dos furos caiu em viga, ou outra orientação
    chegou perto (até 30% a menos). Aí vale conferir na tela ou passar "encaixe" à mão no pavimento.json."""
    dentro, segundo, total = enc.get("dentro"), enc.get("segundo") or 0, enc.get("total") or 0
    if dentro is None:
        return False
    return dentro * 2 < total or dentro < 1.3 * segundo


def _chave_natural(nome: str):
    return [int(p) if p.isdigit() else p for p in re.split(r"(\d+)", nome)]


def juntar_furos(forma: dict, furos: list[dict], escala_prancha: float = 50.0, encaixe: dict | None = None) -> dict:
    """Encaixa os furos na forma lida e põe os locais "F" em forma["pecas"]. Devolve o relatório.

    encaixe: o encaixe já sabido (do pavimento.json), para não recalcular ou para corrigir à mão."""
    for p in [p for p in forma["pecas"] if p.get("tipo") == "F"]:
        forma["pecas"].remove(p)
    if not furos:
        return {"furos": 0, "em_viga": 0, "vigas_com_furo": 0, "sem_viga": [], "em_laje": 0}
    de_viga = [f for f in furos if not f.get("laje")]
    vigas = [(p["nome"], p["polys"]) for p in forma["pecas"] if p.get("tipo") == "V" and p.get("polys")]
    # o encaixe é votado pelos furos de viga (caem dentro das vigas da forma); o de laje vai junto
    enc = encaixe or (encaixar([(f["x"], f["y"]) for f in de_viga], vigas, escala_prancha) if de_viga else None)
    if enc is None:
        raise ErroFuros("a forma não tem vigas com contorno para encaixar os furos" if de_viga
                        else "só há furos de laje: sem furo de viga não dá para encaixar; passe \"encaixe\" no pavimento.json")
    locais, rel = distribuir_furos(de_viga, forma["pecas"], enc)
    de_laje = furos_de_laje(furos, enc)
    forma["pecas"].extend(locais + de_laje)
    # rel["furos"] segue sendo o número de furos de viga ("X de Y em vigas")
    rel["em_laje"] = len(de_laje)
    por_disc: dict[str, int] = {}
    for p in de_laje:
        for d in p["furo"].get("disciplinas") or ["sem disciplina"]:
            por_disc[d] = por_disc.get(d, 0) + 1
    rel["laje_por_disciplina"] = por_disc
    return rel


# ---------------------------------------------------------------------------
# Leitura do IFC (ifcopenshell)
# ---------------------------------------------------------------------------

def ler_ifc(caminho: str, niveis: list[str]) -> list[dict]:
    """Furos de viga e de laje do modelo de furação, nos níveis pedidos (os nomes de "Level" do modelo)."""
    try:
        import ifcopenshell
        import ifcopenshell.util.element as ue
        import ifcopenshell.util.placement as up
        import ifcopenshell.util.unit as uu
    except ImportError as e:  # pragma: no cover - depende do PC
        raise ErroFuros("falta o ifcopenshell (pip install ifcopenshell)") from e
    f = ifcopenshell.open(caminho)
    cm_por_unidade = uu.calculate_unit_scale(f) * 100.0
    saida = []
    for p in f.by_type("IfcBuildingElementProxy"):
        nome = p.Name or ""
        if "viga" not in nome.lower() and "laje" not in nome.lower():
            continue
        psets = ue.get_psets(p)
        nivel = (psets.get("Constraints") or {}).get("Level") or ""
        if not any(mesmo_nivel(nivel, n) for n in niveis):
            continue
        m = up.get_local_placement(p.ObjectPlacement)
        furo = furo_das_propriedades(nome, psets, m[0, 3] * cm_por_unidade, m[1, 3] * cm_por_unidade, p.Tag or p.GlobalId)
        if furo:
            saida.append(furo)
    return saida

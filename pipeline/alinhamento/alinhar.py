"""Alinha os pontos de uma prancha (origem) com os da folha de forma (destino). Funções puras, sem pymupdf.

Os pontos são os pilares: o centro e o tamanho do contorno (na prancha de armação de laje o pilar não tem
nome escrito, só o desenho). Quando os dois lados têm nome (rótulo P12, eixo A), só se juntam pontos com
o mesmo nome.

Como acha o encaixe:
  1. para cada orientação (4 giros de 90 graus, com e sem espelho) e cada escala perto da esperada, cada par
     (ponto da prancha, ponto da folha) de mesmo tamanho vota num deslocamento;
  2. os deslocamentos mais votados são refinados: cada ponto da prancha procura o da folha mais perto, e
     escala e deslocamento saem pelos mínimos quadrados, algumas vezes, apertando a distância;
  3. vale a solução com mais pontos que batem; a segunda melhor (outra orientação ou outro lugar) mostra se
     a escolha é clara.

Só aceita se (decisão do Nicolas, 18/11/2026):
  - cada ponto usado erra no máximo 5 cm na obra (TOLERANCIA_CM);
  - há pelo menos 4 pontos (MIN_PONTOS), espalhados por 30% da largura e da altura da prancha;
  - a escala achada fica a até 3% da esperada;
  - nenhuma outra solução chega perto (80% dos pontos da melhor);
  - pelo menos metade dos pilares da prancha bate com um da folha.
Se não passar, devolve ok=False com o motivo e o encaixe sugerido, para alguém conferir ou passar à mão.
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field

# Pontos do PDF por cm de obra numa prancha 1:50 (a escala das plantas de forma)
PT_POR_CM_1_50 = 72 / 2.54 / 50
TOLERANCIA_CM = 5.0
MIN_PONTOS = 4
ESPALHAMENTO = 0.30
TOLERANCIA_ESCALA = 0.03
PARECIDA = 0.8  # a segunda solução com 80% dos pontos da melhor já deixa dúvida
MINIMO_QUE_BATE = 0.5
AJUSTES_DE_ESCALA = (0.97, 0.98, 0.99, 1.0, 1.01, 1.02, 1.03)


@dataclass(frozen=True)
class Ponto:
    x: float
    y: float
    nome: str | None = None
    w: float | None = None  # largura e altura do contorno (pilar), nas unidades do lado dele
    h: float | None = None


def _orientacoes() -> list[tuple[tuple[float, float], tuple[float, float]]]:
    """As 8 orientações (4 giros de 90 graus, com e sem espelho). A primeira é a identidade."""
    saida = []
    for espelho in (1, -1):
        for c, s in ((1, 0), (0, 1), (-1, 0), (0, -1)):
            saida.append(((float(c), float(-s * espelho)), (float(s), float(c * espelho))))
    return saida


ORIENTACOES = _orientacoes()


@dataclass
class Resultado:
    ok: bool
    motivo: str | None
    transformacao: dict | None  # {"matriz": [a, b, c, d], "t": [tx, ty]}: x' = a x + b y + tx, y' = c x + d y + ty
    escala: float | None = None
    escala_esperada: float = 1.0
    pontos: int = 0
    total: int = 0
    residuo_max: float | None = None
    residuo_medio: float | None = None
    segundo: int = 0
    nao_bateram: list = field(default_factory=list)
    manual: bool = False

    def como_dict(self) -> dict:
        return {
            "ok": self.ok, "motivo": self.motivo, "manual": self.manual,
            "transformacao": self.transformacao,
            "escala": None if self.escala is None else round(self.escala, 5),
            "escala_esperada": self.escala_esperada,
            "pontos": self.pontos, "total": self.total, "segundo": self.segundo,
            "residuo_max_cm": None if self.residuo_max is None else round(self.residuo_max / PT_POR_CM_1_50, 1),
            "residuo_medio_cm": None if self.residuo_medio is None else round(self.residuo_medio / PT_POR_CM_1_50, 1),
            "nao_bateram": self.nao_bateram,
        }


def transformar(T: dict, x: float, y: float) -> tuple[float, float]:
    a, b, c, d = T["matriz"]
    return a * x + b * y + T["t"][0], c * x + d * y + T["t"][1]


def _matriz(R, s: float) -> list[float]:
    return [R[0][0] * s, R[0][1] * s, R[1][0] * s, R[1][1] * s]


def _compativeis(o: Ponto, d: Ponto, R, s: float, tol_tam: float) -> bool:
    if o.nome and d.nome:
        return o.nome == d.nome
    if None in (o.w, o.h, d.w, d.h):
        return True
    w, h = (o.h, o.w) if R[0][0] == 0 else (o.w, o.h)  # giro de 90 graus troca largura e altura
    return abs(w * s - d.w) <= tol_tam and abs(h * s - d.h) <= tol_tam


def _girar(R, s: float, o: Ponto) -> tuple[float, float]:
    return s * (R[0][0] * o.x + R[0][1] * o.y), s * (R[1][0] * o.x + R[1][1] * o.y)


def _parear(origem, destino, R, s, t, raio, tol_tam):
    """Cada ponto da origem com o da folha mais perto (até raio). Um ponto da folha serve a um só."""
    melhor: dict[int, tuple[float, int]] = {}
    for i, o in enumerate(origem):
        qx, qy = _girar(R, s, o)
        x, y = qx + t[0], qy + t[1]
        perto = None
        for j, d in enumerate(destino):
            if abs(d.x - x) > raio or abs(d.y - y) > raio:
                continue
            dist = math.hypot(d.x - x, d.y - y)
            if dist <= raio and _compativeis(o, d, R, s, tol_tam) and (perto is None or dist < perto[0]):
                perto = (dist, j)
        if perto and (perto[1] not in melhor or perto[0] < melhor[perto[1]][0]):
            melhor[perto[1]] = (perto[0], i)
    return [(i, j) for j, (_, i) in melhor.items()]


def _ajustar(origem, destino, pares, R) -> tuple[float, tuple[float, float]]:
    """Escala e deslocamento pelos mínimos quadrados, com a orientação fixa."""
    qs = [_girar(R, 1.0, origem[i]) for i, _ in pares]
    ds = [(destino[j].x, destino[j].y) for _, j in pares]
    n = len(pares)
    mqx, mqy = sum(q[0] for q in qs) / n, sum(q[1] for q in qs) / n
    mdx, mdy = sum(d[0] for d in ds) / n, sum(d[1] for d in ds) / n
    num = sum((q[0] - mqx) * (d[0] - mdx) + (q[1] - mqy) * (d[1] - mdy) for q, d in zip(qs, ds))
    den = sum((q[0] - mqx) ** 2 + (q[1] - mqy) ** 2 for q in qs)
    s = num / den if den > 1e-9 else 1.0
    return s, (mdx - s * mqx, mdy - s * mqy)


def _refinar(origem, destino, R, s, t, tol, tol_tam):
    for raio in (4 * tol, 2 * tol, tol, tol):
        pares = _parear(origem, destino, R, s, t, raio, tol_tam)
        if len(pares) < 2:
            return None
        s, t = _ajustar(origem, destino, pares, R)
    pares = _parear(origem, destino, R, s, t, tol, tol_tam)
    if not pares:
        return None
    res = []
    for i, j in pares:
        qx, qy = _girar(R, s, origem[i])
        res.append(math.hypot(qx + t[0] - destino[j].x, qy + t[1] - destino[j].y))
    return {"R": R, "s": s, "t": t, "pares": pares, "res": res}


def _imagem_do_centro(sol, origem) -> tuple[float, float]:
    cx = sum(o.x for o in origem) / len(origem)
    cy = sum(o.y for o in origem) / len(origem)
    qx, qy = _girar(sol["R"], sol["s"], Ponto(cx, cy))
    return qx + sol["t"][0], qy + sol["t"][1]


def _rotulo(o: Ponto) -> str:
    return o.nome or f"({o.x:.0f}, {o.y:.0f})"


def alinhar(origem: list[Ponto], destino: list[Ponto], escala: float = 1.0, tol: float | None = None,
            min_pontos: int = MIN_PONTOS, espalhamento: float = ESPALHAMENTO, tol_escala: float = TOLERANCIA_ESCALA,
            orientacoes=None) -> Resultado:
    """Encaixe que leva a origem (prancha) para o destino (folha). escala: a esperada (1.0 se as duas são 1:50).

    tol: o erro aceito por ponto, nas unidades da folha (padrão: 5 cm numa folha 1:50)."""
    tol = TOLERANCIA_CM * PT_POR_CM_1_50 if tol is None else tol
    tol_tam = tol
    orientacoes = ORIENTACOES if orientacoes is None else orientacoes
    total = len(origem)
    if total < min_pontos or len(destino) < min_pontos:
        return Resultado(False, f"poucos pontos em comum ({min(total, len(destino))}; mínimo {min_pontos})", None,
                         escala_esperada=escala, total=total, nao_bateram=[_rotulo(o) for o in origem])
    caixa = 4 * tol  # o voto é grosso; o refino aperta
    candidatas = []
    for R in orientacoes:
        for aj in AJUSTES_DE_ESCALA:
            s = escala * aj
            votos: Counter = Counter()
            for o in origem:
                qx, qy = _girar(R, s, o)
                for d in destino:
                    if _compativeis(o, d, R, s, tol_tam):
                        votos[(round((d.x - qx) / caixa), round((d.y - qy) / caixa))] += 1
            for (bx, by), n in votos.most_common(3):
                if n < 2:
                    break
                sol = _refinar(origem, destino, R, s, (bx * caixa, by * caixa), tol, tol_tam)
                if sol:
                    candidatas.append(sol)
    if not candidatas:
        return Resultado(False, "nenhum encaixe: os pilares da prancha não batem com os da folha", None,
                         escala_esperada=escala, total=total, nao_bateram=[_rotulo(o) for o in origem])
    candidatas.sort(key=lambda c: (-len(c["pares"]), sum(c["res"]) / len(c["res"])))
    melhor = candidatas[0]
    centro = _imagem_do_centro(melhor, origem)
    segundo = 0
    for c in candidatas[1:]:
        outro = _imagem_do_centro(c, origem)
        if c["R"] != melhor["R"] or math.hypot(outro[0] - centro[0], outro[1] - centro[1]) > 10 * tol:
            segundo = max(segundo, len(c["pares"]))
    n = len(melhor["pares"])
    usados = {i for i, _ in melhor["pares"]}
    T = {"matriz": [round(v, 6) for v in _matriz(melhor["R"], melhor["s"])], "t": [round(melhor["t"][0], 3), round(melhor["t"][1], 3)]}
    r = Resultado(True, None, T, escala=melhor["s"], escala_esperada=escala, pontos=n, total=total,
                  residuo_max=max(melhor["res"]), residuo_medio=sum(melhor["res"]) / n, segundo=segundo,
                  nao_bateram=[_rotulo(o) for i, o in enumerate(origem) if i not in usados])
    motivos = []
    if n < min_pontos:
        motivos.append(f"poucos pontos em comum ({n}; mínimo {min_pontos})")
    xs = [o.x for o in origem]
    ys = [o.y for o in origem]
    ux = [origem[i].x for i in usados]
    uy = [origem[i].y for i in usados]
    larg, alt = max(xs) - min(xs), max(ys) - min(ys)
    if n >= 2 and ((larg > 0 and (max(ux) - min(ux)) < espalhamento * larg) or (alt > 0 and (max(uy) - min(uy)) < espalhamento * alt)):
        motivos.append("pontos concentrados numa parte da prancha")
    if abs(melhor["s"] / escala - 1) > tol_escala:
        motivos.append(f"escala fora do esperado ({melhor['s'] / escala:.3f} da esperada)")
    if segundo >= min_pontos and segundo >= PARECIDA * n:
        motivos.append(f"duas soluções parecidas ({n} e {segundo} pontos)")
    if n < MINIMO_QUE_BATE * total:
        motivos.append(f"resíduo alto: {total - n} de {total} pilares da prancha não bateram com a folha")
    if motivos:
        r.ok = False
        r.motivo = "; ".join(motivos)
    return r


def manual(T: dict, origem: list[Ponto] | None = None, destino: list[Ponto] | None = None, tol: float | None = None) -> Resultado:
    """Encaixe passado à mão (pavimento.json): vale como está. Com os pontos, mede o erro para o relatório."""
    tol = TOLERANCIA_CM * PT_POR_CM_1_50 if tol is None else tol
    a, b, c, d = T["matriz"]
    s = math.sqrt(abs(a * d - b * c))
    r = Resultado(True, None, {"matriz": list(T["matriz"]), "t": list(T["t"])}, escala=s, manual=True)
    if origem and destino:
        res = []
        for o in origem:
            x, y = transformar(T, o.x, o.y)
            dist = min(math.hypot(p.x - x, p.y - y) for p in destino)
            if dist <= tol:
                res.append(dist)
        r.total, r.pontos = len(origem), len(res)
        if res:
            r.residuo_max, r.residuo_medio = max(res), sum(res) / len(res)
    return r

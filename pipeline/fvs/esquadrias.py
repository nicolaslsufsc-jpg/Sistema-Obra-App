"""Esquadrias nos ambientes (FVS ambientes, fatia F2, pedido de 19/11/2026).

Cada porta ou janela do modelo de arquitetura vira um local de inspeção próprio (tipo "E") na planta de
ambientes, ligado ao ambiente onde está. É o padrão dos furos de viga (furos.py), com o ambiente no lugar
da viga: na obra, a pessoa escolhe o serviço (alvenaria, reboco, piso, pintura...) e o item da ficha que
fala de vão ou esquadria, e toca em cada esquadria: OK, errado ou vazio. Todas OK, o item do ambiente
fica C; alguma errada, NC.

De onde vêm: do mesmo IFC dos ambientes (ambientes.extrair_do_ifc, chave "portas" do cache do andar).
Cada esquadria é o retângulo dela na planta, com o nome do objeto (PM80, PA260, JA120B VVP...). O código
é a primeira palavra do nome; ele já diz o tamanho (nada de digitar medida).

Ligação com os ambientes (decisões do Nicolas, 18/11): a porta entre dois cômodos aparece nos dois, um
local de cada lado da parede (cada lado tem o seu reboco e a sua pintura). A janela fica no cômodo do
lado de dentro (do lado de fora não há ambiente). Para achar os lados, o meio do retângulo anda para os
dois lados da parede, na direção da espessura, e o ambiente que contém o ponto é o daquele lado.
Esquadria sem ambiente em nenhum lado vai só para o relatório.

Tudo aqui é Python puro (testado em pipeline/testes/test_fvs_esquadrias.py, sem bibliotecas).
"""

from __future__ import annotations

import math
import re

from furos import _chave_natural, contorno_do_furo, ponto_dentro

# Quanto o ponto anda além da face do retângulo, para cada lado, até achar um ambiente (em metros de obra).
# O retângulo do modelo é o caixilho ou a folha, mais fino que a parede: o primeiro passo já passa a parede
# comum; os outros cobrem parede grossa e shaft.
AFASTAMENTOS_M = (0.15, 0.30, 0.50)
# Janela pelo código (J, JA...); o resto é porta (PM, PA, PV, PCF...).
RE_JANELA = re.compile(r"^J", re.I)


def codigo_da_esquadria(nome: str) -> str:
    """"JA120B VVP" -> "JA120B" (a primeira palavra, em maiúsculas)."""
    partes = (nome or "").strip().split()
    return partes[0].upper() if partes else ""


def classe_da_esquadria(codigo: str) -> str:
    return "janela" if RE_JANELA.match(codigo or "") else "porta"


def eixos_do_retangulo(pts) -> tuple[tuple[float, float], tuple[float, float], float, float]:
    """Centro, direção da espessura (unitária), meia espessura e meio comprimento de um retângulo
    (4 cantos, em qualquer ordem de giro; o fechamento repetido no fim é ignorado)."""
    pts = [tuple(p) for p in pts]
    if len(pts) > 4 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if len(pts) < 3:
        raise ValueError("retângulo precisa de ao menos 3 cantos")
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    a = (pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])
    b = (pts[2][0] - pts[1][0], pts[2][1] - pts[1][1])
    la, lb = math.hypot(*a), math.hypot(*b)
    curto, lc, ll = (a, la, lb) if la <= lb else (b, lb, la)
    if lc == 0:
        return (cx, cy), (0.0, 1.0), 0.0, ll / 2
    return (cx, cy), (curto[0] / lc, curto[1] / lc), lc / 2, ll / 2


def ambientes_dos_lados(pts, ambientes: list[dict], pt_por_m: float) -> list[tuple[dict, tuple[float, float]]]:
    """Os ambientes dos dois lados da esquadria, cada um com o ponto onde foi achado (dentro dele).

    ambientes: locais "A" ({"nome", "polys"}), no mesmo sistema de coordenadas de pts."""
    (cx, cy), (nx, ny), meia, _ = eixos_do_retangulo(pts)
    achados: list[tuple[dict, tuple[float, float]]] = []
    for sinal in (1, -1):
        for d in AFASTAMENTOS_M:
            dist = meia + d * pt_por_m
            x, y = cx + sinal * nx * dist, cy + sinal * ny * dist
            amb = next((a for a in ambientes if a.get("polys") and ponto_dentro(x, y, a["polys"][0])), None)
            if amb is not None:
                if all(a is not amb for a, _ in achados):
                    achados.append((amb, (x, y)))
                break
    return achados


def distribuir_esquadrias(esquadrias: list[dict], pecas: list[dict], pt_por_m: float) -> tuple[list[dict], dict]:
    """As esquadrias viram locais "E", um para cada ambiente vizinho.

    esquadrias: [{"nome": "PM80", "pts": [[x, y] x4]}] já na folha (pontos do PDF). pecas: os locais da
    planta (só os ambientes contam). Devolve (locais novos, relatório).

    Nome do local: o do ambiente com o código ("303-05-PM80"); com duas do mesmo código no mesmo ambiente,
    numeradas na ordem de leitura ("303-05-PM80-1", "303-05-PM80-2")."""
    ambientes = [p for p in pecas if p.get("tipo") == "A" and p.get("polys")]
    por_amb: dict[str, list[tuple[tuple[float, float], dict, str]]] = {}
    sem_ambiente, em_dois, em_um = [], 0, 0
    for k, esq in enumerate(esquadrias):
        codigo = codigo_da_esquadria(esq.get("nome", ""))
        if not codigo or not esq.get("pts"):
            continue
        lados = ambientes_dos_lados(esq["pts"], ambientes, pt_por_m)
        if not lados:
            (cx, cy), _, _, _ = eixos_do_retangulo(esq["pts"])
            sem_ambiente.append({"nome": esq.get("nome"), "x": round(cx, 1), "y": round(cy, 1)})
            continue
        em_dois += len(lados) > 1
        em_um += len(lados) == 1
        outros = [a["nome"] for a, _ in lados]
        for amb, ponto in lados:
            vizinho = next((n for n in outros if n != amb["nome"]), None)
            por_amb.setdefault(amb["nome"], []).append((ponto, {**esq, "_k": k, "_vizinho": vizinho}, codigo))
    locais = []
    raio = max(2.0, 0.12 * pt_por_m)  # bolinha de ~12 cm de obra, no mínimo 2 pontos
    for nome_amb in sorted(por_amb, key=_chave_natural):
        lista = sorted(por_amb[nome_amb], key=lambda t: (round(t[0][1], 1), round(t[0][0], 1), t[1]["_k"]))
        repetidos = {c for c in {t[2] for t in lista} if sum(1 for t in lista if t[2] == c) > 1}
        contagem: dict[str, int] = {}
        for (x, y), esq, codigo in lista:
            if codigo in repetidos:
                contagem[codigo] = contagem.get(codigo, 0) + 1
                nome = f"{nome_amb}-{codigo}-{contagem[codigo]}"
            else:
                nome = f"{nome_amb}-{codigo}"
            _, _, _, meio = eixos_do_retangulo(esq["pts"])
            meio = max(meio, raio)
            info = {"codigo": codigo, "classe": classe_da_esquadria(codigo)}
            if esq.get("nome") and esq["nome"].strip().upper() != codigo:
                info["modelo"] = esq["nome"].strip()
            if esq["_vizinho"]:
                info["outro_lado"] = esq["_vizinho"]
            locais.append({
                "tipo": "E", "nome": nome, "secao": codigo,
                # a largura do rótulo é a da esquadria: o app escreve o código só quando ele cabe na tela
                "rotulo": [round(x - meio, 1), round(y - raio, 1), round(x + meio, 1), round(y + raio, 1)],
                "polys": [contorno_do_furo(x, y, raio)],
                "ambiente": nome_amb, "esquadria": info,
            })
    rel = {
        "esquadrias": len(esquadrias),
        "em_ambiente": em_um + em_dois,
        "em_dois_ambientes": em_dois,
        "locais": len(locais),
        "ambientes_com_esquadria": len(por_amb),
        "sem_ambiente": sem_ambiente,
    }
    return locais, rel


def juntar_esquadrias(planta: dict, esquadrias: list[dict], pt_por_m: float) -> dict:
    """Põe os locais "E" em planta["pecas"] (tirando os de antes). Devolve o relatório."""
    planta["pecas"] = [p for p in planta["pecas"] if p.get("tipo") != "E"]
    locais, rel = distribuir_esquadrias(esquadrias, planta["pecas"], pt_por_m)
    planta["pecas"].extend(locais)
    return rel

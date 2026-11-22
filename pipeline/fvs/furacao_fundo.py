"""Furos numa planta própria, com o projeto de furação no fundo (pedido do Nicolas de 21/11/2026, via Professor).

"Usa o mesmo princípio das armaduras de lajes": abrir os furos leva a uma planta só deles, com a prancha de
FURAÇÃO no fundo (no Autodoc, Furação > Modelagem > Projeto Executivo; a outra pasta de furação não vale), e
não os pontos por cima da planta de forma. Cada furo marcado vai para a ficha da peça onde está: viga, pilar
ou laje.

As pranchas de furação saem do Revit: sem camadas, uma por setor, na escala 1:75. Os pilares são os
retângulos cheios de cinza médio. Cada prancha é encaixada na folha de forma pelos centros dos pilares (o
mesmo alinhamento das barras, pipeline/alinhamento), então a planta de furação tem as coordenadas da forma:
os furos têm a mesma posição e o mesmo id nas duas, e as áreas de laje desenhadas na forma valem aqui.

A forma continua levando os furos (o item de furação da viga conta por eles), marcada com "furos_separados"
para o app não mostrá-los lá. No servidor, a planta é um setor do pavimento com disciplina "furacao" (texto
livre: sem migração).
"""

from __future__ import annotations

import pathlib
import sys

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent))

DISCIPLINA = "furacao"
TRECHO = "Furação"
ESCALA_PADRAO = 75.0  # as pranchas de furação da obra piloto são 1:75
ESCALA_DA_FORMA = 50.0
CINZA_DO_PILAR = 0.5
TOLERANCIA_COR = 0.02
PILAR_MIN_CM = 12.0  # menor lado de um pilar
PILAR_MAX_CM = 400.0  # maior lado (pilar parede)
MARGEM_CM = 400.0  # em volta dos pilares: balanço de laje e furos perto da borda


class ErroFuracao(Exception):
    pass


def eh_retangulo_de_pilar(desenho: dict, cinza: float = CINZA_DO_PILAR) -> bool:
    """Retângulo cheio do cinza dado (o pilar cortado no Revit; cinza médio na maioria das pranchas)."""
    f = desenho.get("fill")
    itens = desenho.get("items") or []
    return bool(f) and len(f) == 3 and all(abs(c - cinza) <= TOLERANCIA_COR for c in f)         and bool(itens) and all(i[0] == "re" for i in itens)


def _cinza(desenho: dict) -> float | None:
    """O tom de um retângulo cheio de cinza (ou branco), arredondado; None se não for."""
    f = desenho.get("fill")
    itens = desenho.get("items") or []
    if not f or len(f) != 3 or not itens or not all(i[0] == "re" for i in itens):
        return None
    if max(f) - min(f) > TOLERANCIA_COR:
        return None
    return round(sum(f) / 3, 2)


def pilares_da_pagina(page, cinza: float = CINZA_DO_PILAR) -> list:
    """Centros e tamanhos dos pilares da prancha, nas coordenadas da página (já girada)."""
    from alinhamento import alinhar as al

    M = page.rotation_matrix
    saida = []
    for d in page.get_drawings():
        if not eh_retangulo_de_pilar(d, cinza):
            continue
        r = d["rect"] * M
        saida.append(al.Ponto((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, w=r.width, h=r.height))
    return saida


def outros_tons(page, escala: float) -> list[tuple[float, list]]:
    """Quando o cinza médio não basta (algumas pranchas desenham o pilar em cinza claro ou só com o
    contorno): os retângulos cheios dos outros tons de cinza (e do branco), do tamanho de um pilar
    (PILAR_MIN_CM a PILAR_MAX_CM de lado), um conjunto por tom, o mais cheio primeiro."""
    from alinhamento import alinhar as al

    M = page.rotation_matrix
    k = 72 / 2.54 / escala
    por_tom: dict[float, list] = {}
    for d in page.get_drawings():
        t = _cinza(d)
        if t is None or abs(t - CINZA_DO_PILAR) <= TOLERANCIA_COR:
            continue
        r = d["rect"] * M
        lados = sorted((r.width / k, r.height / k))
        if lados[0] < PILAR_MIN_CM or lados[1] > PILAR_MAX_CM:
            continue
        por_tom.setdefault(t, []).append(al.Ponto((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, w=r.width, h=r.height))
    return sorted(((t, ps) for t, ps in por_tom.items() if len(ps) >= 3), key=lambda x: -len(x[1]))


def janela_dos_pilares(pilares: list, largura: float, altura: float, escala: float, limite_x: float | None = None) -> tuple[float, float, float, float]:
    """O pedaço da prancha que vai para o fundo: os pilares com uma margem (MARGEM_CM de obra), sem passar da
    página nem da coluna da legenda (limite_x)."""
    if not pilares:
        raise ErroFuracao("nenhum pilar achado na prancha (retângulo cinza)")
    m = MARGEM_CM * 72 / 2.54 / escala
    x0 = max(0.0, min(p.x - p.w / 2 for p in pilares) - m)
    y0 = max(0.0, min(p.y - p.h / 2 for p in pilares) - m)
    x1 = min(largura, max(p.x + p.w / 2 for p in pilares) + m)
    y1 = min(altura, max(p.y + p.h / 2 for p in pilares) + m)
    if limite_x is not None and limite_x > x0:
        x1 = min(x1, limite_x)
    return (round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2))


def coluna_da_legenda(page) -> float | None:
    """Onde começa a coluna da direita (legenda, quadros, carimbo): o x do primeiro "LEGENDA" ou "FURAÇÃO"
    da metade direita da folha."""
    meio = page.rect.width / 2
    xs = [w[0] for w in page.get_text("words") if w[0] > meio and w[4].upper().startswith(("LEGENDA", "FURAÇÃO", "FURACAO"))]
    return min(xs) - 10 if xs else None


def ler_prancha(pdf: str, escala: float = ESCALA_PADRAO) -> dict:
    """Pilares e janela de uma prancha de furação. Os pilares são os retângulos de cinza médio; os de
    outros tons ficam em "outros" (tom, pilares), para tentar se o cinza médio não encaixar. Prancha sem
    nenhum candidato fica com janela None (não encaixa e vai para o relatório)."""
    import pymupdf

    with pymupdf.open(pdf) as doc:
        page = doc[0]
        pilares = pilares_da_pagina(page)
        outros = outros_tons(page, escala)
        pagina = (page.rect.width, page.rect.height, coluna_da_legenda(page))
    janela = janela_dos_pilares(pilares, pagina[0], pagina[1], escala, pagina[2]) if pilares else None
    return {"pdf": pdf, "nome": pathlib.Path(pdf).stem, "pilares": pilares, "janela": janela, "escala": escala,
            "outros": outros, "pagina": pagina}


def _cobertos(pr: dict, T: dict, destino: list, tol: float) -> set[int]:
    """Índices dos pilares da folha que os pilares da prancha, levados por T, cobrem."""
    import math

    from alinhamento import alinhar as al

    saida = set()
    for o in pr["pilares"]:
        x, y = al.transformar(T, o.x, o.y)
        i, d = min(((i, math.hypot(p.x - x, p.y - y)) for i, p in enumerate(destino)), key=lambda t: t[1], default=(None, 1e9))
        if i is not None and d <= tol:
            saida.add(i)
    return saida


def orientacao(T: dict) -> tuple[tuple[float, float], tuple[float, float]]:
    """O giro/espelho do encaixe (a matriz sem a escala), no formato de alinhamento.ORIENTACOES."""
    a, b, c, d = T["matriz"]
    s = max(abs(a), abs(b), abs(c), abs(d)) or 1.0
    return ((float(round(a / s)), float(round(b / s))), (float(round(c / s)), float(round(d / s))))


def contorno_na_folha(pr: dict, T: dict) -> tuple[float, float, float, float]:
    """O retângulo da janela da prancha, levado à folha."""
    from alinhamento import alinhar as al

    x0, y0, x1, y1 = pr["janela"]
    pts = [al.transformar(T, x, y) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
    return (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))


def _sobreposicao(r: tuple, outros: list[tuple]) -> float:
    """Fração da área de r coberta pelos outros retângulos (soma; pode passar de 1 se eles se sobrepõem)."""
    area = max(1e-9, (r[2] - r[0]) * (r[3] - r[1]))
    soma = 0.0
    for o in outros:
        w = min(r[2], o[2]) - max(r[0], o[0])
        h = min(r[3], o[3]) - max(r[1], o[1])
        if w > 0 and h > 0:
            soma += w * h
    return soma / area


def desempatar(pr: dict, ok: list[dict], destino: list, esperada: float, orient, tol: float) -> dict | None:
    """Prancha com duas soluções parecidas (o prédio repete a malha de pilares): as duas melhores, na
    orientação dos setores que já encaixaram; vale a que cai mais na parte do pavimento que os setores
    encaixados não cobrem e tem pelo menos tantos pilares batendo quanto a outra. Os pilares da escolhida têm que bater (no mínimo
    MIN_PONTOS, erro dentro da tolerância)."""
    from alinhamento import alinhar as al

    r1 = al.alinhar(pr["pilares"], destino, escala=esperada, orientacoes=orient)
    if not r1.transformacao:
        return None
    cob = _cobertos(pr, r1.transformacao, destino, tol)
    r2 = al.alinhar(pr["pilares"], [p for i, p in enumerate(destino) if i not in cob], escala=esperada, orientacoes=orient)
    outros = [contorno_na_folha(o, o["transformacao"]) for o in ok]
    cands = [(r, _sobreposicao(contorno_na_folha(pr, r.transformacao), outros)) for r in (r1, r2) if r.transformacao]
    cands.sort(key=lambda c: c[1])
    melhor, sob = cands[0]
    # a escolhida tem que ganhar nas duas: cai mais na parte livre (10 pontos percentuais a menos, no mínimo)
    # e tem pelo menos tantos pilares batendo quanto a outra
    if len(cands) > 1 and not (cands[1][1] - sob >= 0.10 and melhor.pontos >= cands[1][0].pontos):
        return None
    if melhor.pontos < al.MIN_PONTOS or melhor.residuo_max is None or melhor.residuo_max > tol:
        return None
    return {"transformacao": melhor.transformacao,
            "motivo": f"duas soluções; ficou a que cai na parte livre do pavimento ({sob:.0%} sobre os setores já encaixados"
                      + (f", a outra {cands[1][1]:.0%})" if len(cands) > 1 else ")")}


def alinhar_pranchas(pecas: list[dict], lidas: list[dict], manuais: dict | None = None) -> tuple[list[dict], list[dict]]:
    """Encaixa cada prancha lida na folha de forma pelos pilares. Devolve (as que alinharam, com
    "transformacao"; resumo por prancha). A que não alinha fica de fora e o resumo diz por quê.

    Desempate pelos vizinhos: o prédio repete a malha de pilares, e aí a prancha de um setor pode encaixar
    quase igual em dois lugares (na obra piloto, o segundo vinha girado e espelhado). As pranchas de um
    pavimento saem do mesmo modelo, com a mesma orientação, e os setores não se repetem: para a que ficou em
    dúvida, vale a solução na orientação dos setores já encaixados que cai na parte livre (desempatar)."""
    import barras_laje
    from alinhamento import alinhar as al

    destino = barras_laje.pontos_dos_pilares(pecas)
    tol = al.TOLERANCIA_CM * al.PT_POR_CM_1_50
    ok, resumo, duvida = [], [], []
    for pr in lidas:
        T = (manuais or {}).get(pr["nome"])
        esperada = float(pr.get("escala") or ESCALA_PADRAO) / ESCALA_DA_FORMA
        res = al.manual(T, pr["pilares"], destino) if T else al.alinhar(pr["pilares"], destino, escala=esperada)
        d = res.como_dict()
        if not res.ok and not T and "parecidas" not in (d.get("motivo") or ""):
            for tom, pts in pr.get("outros") or []:
                r2 = al.alinhar(pts, destino, escala=esperada)
                d2 = r2.como_dict()
                if r2.ok or "parecidas" in (d2.get("motivo") or ""):
                    larg, alt, lim = pr["pagina"]
                    pr = {**pr, "pilares": pts, "tom": tom,
                          "janela": janela_dos_pilares(pts, larg, alt, pr["escala"] or ESCALA_PADRAO, lim)}
                    res, d = r2, {**d2, "tom_do_pilar": tom}
                    break
        linha = {"prancha": pr["nome"], "pilares": len(pr["pilares"]), "alinhamento": d}
        resumo.append(linha)
        if res.ok:
            ok.append({**pr, "transformacao": res.transformacao})
        elif not T and "parecidas" in (d.get("motivo") or ""):
            duvida.append((pr, linha, esperada))
    if duvida and ok:
        orient = sorted({orientacao(pr["transformacao"]) for pr in ok})
        for pr, linha, esperada in duvida:
            T = desempatar(pr, ok, destino, esperada, orient, tol)
            if T:
                linha["alinhamento"] = {**linha["alinhamento"], "ok": True, "transformacao": T["transformacao"],
                                        "desempate": T["motivo"]}
                ok.append({**pr, "transformacao": T["transformacao"]})
        ordem = {p["nome"]: i for i, p in enumerate(lidas)}
        ok.sort(key=lambda p: ordem[p["nome"]])
    return ok, resumo


def _dentro(x: float, y: float, poly) -> bool:
    d = False
    n = len(poly)
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[i - 1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            d = not d
    return d


def pilar_do_furo(furo: dict, pilares: list[dict]) -> str | None:
    """O pilar em que o centro do furo (ou da caixinha) cai, pelo contorno da forma."""
    r = furo["rotulo"]
    x, y = (r[0] + r[2]) / 2, (r[1] + r[3]) / 2
    for p in pilares:
        if any(len(poly) >= 3 and _dentro(x, y, poly) for poly in p["polys"]):
            return p["nome"]
    return None


def marcar_pilares(pecas: list[dict]) -> None:
    """O furo de laje (sem viga) que cai num pilar ganha "pilar" (o nome), na própria lista de peças."""
    pilares = [p for p in pecas if p.get("tipo") == "P" and p.get("polys") and not p.get("so_detalhe")]
    for f in pecas:
        if f.get("tipo") == "F" and not f.get("viga"):
            pilar = pilar_do_furo(f, pilares)
            if pilar:
                f["pilar"] = pilar


LONGE_DA_ESTRUTURA_CM = 300.0  # largura da faixa em que se procura estrutura para cada lado do furo
MESMO_PONTO_CM = 5.0
COLUNA_MIN = 5  # furos em fila, com vão pequeno entre eles: pilha a conferir
COLUNA_VAO_CM = 50.0


def _centro(p: dict) -> tuple[float, float]:
    r = p["rotulo"]
    return ((r[0] + r[2]) / 2, (r[1] + r[3]) / 2)


def a_conferir(pecas: list[dict], pt_por_cm: float) -> dict:
    """Furos que pedem conferência (nada sai da planta; vai para o relatório):
    - fora do contorno: para algum lado (esquerda, direita, acima, abaixo) não há pilar nem viga da forma,
      numa faixa de LONGE_DA_ESTRUTURA_CM;
    - pilhas: dois ou mais no mesmo ponto (MESMO_PONTO_CM), ou COLUNA_MIN ou mais em fila reta (mesmo x ou
      mesmo y) com vão de até COLUNA_VAO_CM entre um e outro."""
    import math

    faixa = LONGE_DA_ESTRUTURA_CM * pt_por_cm
    pts = []  # contorno de pilares e vigas, com um ponto a cada meia faixa (viga longa tem vértice só nas pontas)
    for p in pecas:
        if p.get("tipo") not in ("P", "V"):
            continue
        for poly in p.get("polys") or []:
            for i in range(len(poly)):
                (ax, ay), (bx, by) = poly[i - 1], poly[i]
                n = max(1, math.ceil(math.hypot(bx - ax, by - ay) / (faixa / 2)))
                pts.extend((ax + (bx - ax) * k / n, ay + (by - ay) * k / n) for k in range(n))
    furos = [p for p in pecas if p.get("tipo") == "F"]
    fora = []
    for f in furos:
        x, y = _centro(f)
        # fora do prédio: numa das quatro direções não há pilar nem viga (numa faixa de 3 m de largura)
        lados = {"esquerda": any(q[0] < x and abs(q[1] - y) <= faixa for q in pts),
                 "direita": any(q[0] > x and abs(q[1] - y) <= faixa for q in pts),
                 "acima": any(q[1] < y and abs(q[0] - x) <= faixa for q in pts),
                 "abaixo": any(q[1] > y and abs(q[0] - x) <= faixa for q in pts)}
        vazios = [k for k, tem in lados.items() if not tem]
        if vazios:
            fora.append({"furo": f["nome"], "x": round(x, 1), "y": round(y, 1), "sem_estrutura": vazios})
    tol = MESMO_PONTO_CM * pt_por_cm
    grupos: dict[tuple[int, int], list[str]] = {}
    for f in furos:
        x, y = _centro(f)
        grupos.setdefault((round(x / tol), round(y / tol)), []).append(f["nome"])
    mesmo_ponto = [sorted(g) for g in grupos.values() if len(g) > 1]
    colunas = []
    vao = COLUNA_VAO_CM * pt_por_cm
    for eixo in (0, 1):
        filas: dict[int, list[tuple[float, str]]] = {}
        for f in furos:
            c = _centro(f)
            filas.setdefault(round(c[eixo] / tol), []).append((c[1 - eixo], f["nome"]))
        for fila in filas.values():
            fila.sort()
            atual = [fila[0]] if fila else []
            for item in fila[1:] + [(float("inf"), "")]:
                if item[0] - atual[-1][0] <= vao and item[1]:
                    atual.append(item)
                    continue
                if len(atual) >= COLUNA_MIN:
                    colunas.append({"direcao": "vertical" if eixo == 0 else "horizontal", "furos": [n for _, n in atual]})
                atual = [item]
    return {"fora_do_contorno": fora, "mesmo_ponto": mesmo_ponto, "em_fila": colunas}


RAIO_DO_SIMBOLO_CM = 20.0  # no 3º da obra piloto, todo furo do modelo tem o símbolo a até ~13 cm
SIMBOLO_MAX_CM = 200.0
COR_MIN = 0.3  # o símbolo do furo é cheio de uma cor (uma por disciplina); cinza e branco não contam


def simbolos_de_furo(alinhadas: list[dict]) -> list[tuple[float, float]]:
    """Os símbolos de furo das pranchas encaixadas, nas coordenadas da folha: os desenhos cheios de cor
    (azul, ciano, rosa, verde...; nada de cinza ou branco) de até SIMBOLO_MAX_CM."""
    import pymupdf
    from alinhamento import alinhar as al

    saida = []
    for pr in alinhadas:
        k = 72 / 2.54 / float(pr.get("escala") or ESCALA_PADRAO)
        with pymupdf.open(pr["pdf"]) as doc:
            page = doc[0]
            M = page.rotation_matrix
            for d in page.get_drawings():
                f = d.get("fill")
                if not f or len(f) != 3 or max(f) - min(f) <= COR_MIN:
                    continue
                r = d["rect"] * M
                if max(r.width, r.height) > SIMBOLO_MAX_CM * k:
                    continue
                saida.append(al.transformar(pr["transformacao"], (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2))
    return saida


def sem_desenho(pecas: list[dict], simbolos: list[tuple[float, float]], pt_por_cm: float,
                raio_cm: float = RAIO_DO_SIMBOLO_CM) -> list[str]:
    """Nomes dos furos sem símbolo de furo da prancha a até raio_cm (furo que a prancha não desenha)."""
    R = raio_cm * pt_por_cm
    grade: dict[tuple[int, int], list] = {}
    for x, y in simbolos:
        grade.setdefault((int(x // R), int(y // R)), []).append((x, y))
    saida = []
    for p in pecas:
        if p.get("tipo") != "F":
            continue
        x0, y0, x1, y1 = p["rotulo"]
        x, y = (x0 + x1) / 2, (y0 + y1) / 2
        gx, gy = int(x // R), int(y // R)
        perto = any((sx - x) ** 2 + (sy - y) ** 2 <= R * R
                    for i in (-1, 0, 1) for j in (-1, 0, 1) for sx, sy in grade.get((gx + i, gy + j), ()))
        if not perto:
            saida.append(p["nome"])
    return saida


def marcar_tipo(furos: list[dict], tipo_de: str, sem: list[str]) -> None:
    """Pavimento cujos furos vêm de outro (tipo): cada furo leva furo.tipo_de; o que a prancha do próprio
    pavimento não desenha leva furo.a_conferir (decisão do Nicolas de 21/11: nada se apaga)."""
    falta = set(sem)
    for f in furos:
        f["furo"] = {**(f.get("furo") or {}), "tipo_de": tipo_de}
        if f["nome"] in falta:
            f["furo"]["a_conferir"] = True


def folha_de_furacao(forma: dict, alinhadas: list[dict], imprimir=print) -> dict | None:
    """A planta de furação do pavimento (no formato de folha_unica.ler_folha_unica). Marca
    forma["furos_separados"] = True. Sem prancha alinhada ou sem furo, não sai planta."""
    import armadura_laje
    import folha_unica

    if not alinhadas or not any(p.get("tipo") == "F" for p in forma["pecas"]):
        return None
    marcar_pilares(forma["pecas"])  # na forma também: o app grava na ficha certa nas duas
    furos = [dict(p) for p in forma["pecas"] if p.get("tipo") == "F"]
    if len(alinhadas) == 1:  # uma prancha só: o nome dela (nome_da_folha juntaria "001-001")
        nome = alinhadas[0]["nome"]
        revisao = nome.rsplit("-", 1)[-1] if "-R" in nome else "R00"
    else:
        nome, revisao = folha_unica.nome_da_folha([p["nome"] for p in alinhadas])
    imprimir(f"  {TRECHO}: {len(alinhadas)} pranchas coladas na folha, {len(furos)} furos"
             f" ({sum(1 for f in furos if f.get('viga'))} em viga, {sum(1 for f in furos if f.get('pilar'))} em pilar,"
             f" {sum(1 for f in furos if not f.get('viga') and not f.get('pilar'))} em laje)")
    forma["furos_separados"] = True
    return {
        "prancha": nome,
        "revisao": revisao,
        "largura": forma["largura"],
        "altura": forma["altura"],
        "tile": forma.get("tile", folha_unica.TILE),
        "niveis": forma["niveis"],
        "tiles": armadura_laje.tiles_da_camada(alinhadas, forma["niveis"]),
        "pecas": furos,
        "trecho": TRECHO,
        "disciplina": DISCIPLINA,
        "origens": [{"prancha": p["nome"], "transformacao": p["transformacao"]} for p in alinhadas],
    }

"""Ambientes tirados só da prancha PDF de arquitetura, para os pavimentos sem modelo IFC (térreo comercial,
pilotis, mezanino: o IFC da obra piloto não traz paredes nesses andares).

Como funciona (sem IFC, sem casar modelo com prancha: as coordenadas já são as da prancha):
1. paredes: os preenchimentos escuros e pequenos da prancha (a hachura das paredes, o mesmo critério de
   ambientes.casar_com_a_prancha), desenhados numa imagem de RESOLUCAO_M metros por pixel;
2. portas fechadas: a parede é engordada FECHA_VAO_M de cada lado (pela distância à parede, o mesmo custo
   para qualquer raio), o que fecha vãos de porta de até 2 × FECHA_VAO_M; o espaço livre que sobra é
   separado em pedaços, e cada pedaço volta ao tamanho original (cada pixel livre fica com o pedaço mais
   perto);
3. sala = pedaço que tem um rótulo de área da prancha ("A: 18,02m2"). Sem rótulo não vira ambiente
   (fundo da prancha, shaft, área externa). Dois rótulos no mesmo pedaço = parede aberta entre eles:
   fica um ambiente só, com os dois nomes, e o aviso no resumo;
4. nome do cômodo: as linhas de texto logo acima do rótulo de área, na mesma letra ("DEPÓSITO" +
   "CONDOMINIAL" = "Depósito Condominial");
5. vão largo (vitrine, passagem): onde dois rótulos caem no mesmo espaço, parede virtual de raio crescente
   só ali; sala partida por traço fino (desnível, projeção) é juntada ao pedaço do outro lado;
6. segunda passada, só para os rótulos que ficaram ruins (área a mais de 15% da do rótulo): refaz com
   outras leituras da prancha, da mais fiel para a menos fiel (sem a parede escondida por um branco opaco
   desenhado depois, como a do shaft sob a bancada do WC; com caixilho, vidro e grade como parede; parede
   virtual maior) e fica com a primeira que bate com o rótulo. Proteções contra o falso acerto: a sala não
   cresce mais que o dobro, a parede virtual não faz sala pequena crescer, e o espaço que vaza para fora da
   planta (estacionamento aberto, calçada) fica sem ambiente quando a parede virtual não acha a área dele;
7. conferência: a área medida de cada sala é comparada com a do rótulo; diferença grande vai para o resumo.

Devolve o mesmo formato de ambientes.extrair_do_ifc (paredes, ambientes e portas em "metros do modelo"),
com x = ponto/pt_por_m e y = -ponto/pt_por_m, para ambientes.base_da_planta usar sem casar nada.

No pavimento.json: "ambientes": {"fonte": "pdf", "prancha": "...022.MEZANINOXX-R03.pdf", "escala": 200, ...}

Precisa de: pip install pymupdf shapely numpy scipy pillow
"""

from __future__ import annotations

import re
import unicodedata

RESOLUCAO_M = 0.05  # metros por pixel
LEITURA_RAPIDA = True  # get_cdrawings (False = get_drawings, a leitura antiga, mais lenta)
FECHA_VAO_M = 0.55  # fecha vãos de até 1,10 m (portas)
# vão maior (vitrine, passagem aberta): onde dois rótulos caem no mesmo espaço, a parede virtual cresce
# até separar um do outro (fecha vãos de até 2 × o raio), só naquele espaço
RAIOS_VIRTUAIS_M = (0.8, 1.2, 1.8, 2.5, 3.5)
AREA_MINIMA_M2 = 1.0
USAR_OUTRAS = True  # segunda passada tenta caixilho e grade como parede, e sem a parede escondida
CRESCE_MAX = 2.0  # a segunda passada não deixa uma sala passar do dobro do que a primeira achou
FOLGA_AREA = 0.15  # área medida a até 15% da do rótulo: a sala está boa
VAZOU = 3.0  # pedaço com mais que 3 × a área do rótulo vazou para fora da planta: sem ambiente
# rótulo de área da prancha: "A: 18,02m2", "A=18,02 m²", "ÁREA: 18,02m2"
RE_AREA = re.compile(r"^(?:A|ÁREA|AREA)\s*[:=]\s*(\d+(?:[.,]\d+)?)\s*m[2²]$", re.I)
# texto acima do rótulo que não é nome (cotas, eixos, alturas de forro, níveis)
RE_NAO_NOME = re.compile(r"^[\d\s.,+\-=/()%]*$|^(H|PD|FORRO|NÍVEL|NIVEL|N\.|ELEV)\b|^[+-]?\d", re.I)


# unidade inteira sem rótulo de área (a prancha geral só escreve "CASA 1"): o contorno vem das paredes grossas
PAREDE_GROSSA_M = 0.15  # parede de divisa (a de dentro da unidade é mais fina)
PAREDE_LONGA_M = 3.0  # só parede comprida limita a unidade (pilar e trecho curto não)
ALCANCE_M = 25.0  # do nome até a parede de divisa, em cada direção


class ErroAmbientesPdf(Exception):
    pass


def pt_por_m(escala: float) -> float:
    return 1000.0 / escala * 72 / 25.4


def e_parede(fill, largura_pt: float, altura_pt: float, ppm: float) -> bool:
    """Preenchimento escuro e pequeno = hachura de parede (área branca, piso e forro claros não contam)."""
    if fill is None or sum(fill) / 3 > CINZA_MAX:
        return False
    return largura_pt * altura_pt <= (ppm * 3) ** 2


CINZA_MAX = 0.88  # preenchimento mais claro que isso é piso, forro ou fundo, não parede
TRACO_FINO_PX = 2  # juntar_partidos atravessa traço de até 1 pixel (5 cm), não parede
FINO_MIN_M = 0.6  # linha fina que fecha vão (caixilho, grade): pelo menos 60 cm
TRACO_MIN_PT = 0.25  # contorno de parede: traço escuro e grosso (cota, hachura e mobiliário são finos)


def e_traco_de_parede(cor, largura_pt) -> bool:
    """Traço escuro e grosso = contorno de parede (prancha que desenha a parede com duas linhas, sem hachura)."""
    return cor is not None and sum(cor) / 3 <= 0.35 and (largura_pt or 0) >= TRACO_MIN_PT


def nome_do_comodo(linhas: list[str]) -> str | None:
    """["DEPÓSITO", "CONDOMINIAL"] -> "Depósito Condominial"; descarta cotas e números."""
    partes = [t.strip() for t in linhas if t.strip() and not RE_NAO_NOME.match(t.strip())]
    if not partes:
        return None
    texto = " ".join(partes)
    texto = unicodedata.normalize("NFC", texto)
    pequenas = {"de", "da", "do", "das", "dos", "e"}
    palavras = texto.lower().split()
    return " ".join(p if (i and p in pequenas) else p[:1].upper() + p[1:] for i, p in enumerate(palavras))


def area_do_rotulo(texto: str) -> float | None:
    m = RE_AREA.match(texto.strip())
    return float(m.group(1).replace(",", ".")) if m else None


def rotulos_de_area(linhas: list[dict]) -> list[dict]:
    """Rótulos de área com o nome do cômodo logo acima.

    linhas: [{"texto", "bbox": (x0, y0, x1, y1), "tamanho"}] em pontos da prancha (y para baixo).
    Devolve [{"area", "x", "y", "nome"}] com (x, y) = centro do rótulo de área.
    """
    saida = []
    for l in linhas:
        area = area_do_rotulo(l["texto"])
        if area is None:
            continue
        x0, y0, x1, y1 = l["bbox"]
        cx, alt = (x0 + x1) / 2, (y1 - y0) or 1
        # linhas de cima, mesma letra (±20%), centradas no rótulo, empilhadas sem buraco
        acima, topo = [], y0
        tam = l.get("tamanho") or 1
        # o nome costuma ter letra igual ou maior que a do rótulo e pode encostar nele (cotas têm letra menor)
        candidatas = sorted(
            (o for o in linhas if o is not l and 0.9 * tam <= o.get("tamanho", 0) <= 2.5 * tam
             and o["bbox"][0] - alt <= cx <= o["bbox"][2] + alt and o["bbox"][3] <= (y0 + y1) / 2),
            key=lambda o: -o["bbox"][3])
        for o in candidatas:
            if topo - o["bbox"][3] > 1.2 * alt:
                break
            if area_do_rotulo(o["texto"]) is not None:
                break
            acima.insert(0, (o["texto"], o.get("tamanho", 0)))
            topo = o["bbox"][1]
            if len(acima) >= 3:
                break
        # o nome tem uma letra só; nota de letra menor encostada em cima ("Zona-026", "GUARDA-CORPO") fica de fora
        maior = max((s for _, s in acima), default=0)
        nome = [tx for tx, s in acima if s >= 0.9 * maior]
        saida.append({"area": area, "x": cx, "y": (y0 + y1) / 2, "nome": nome_do_comodo(nome)})
    return saida


def linhas_da_pagina(page) -> list[dict]:
    M = page.rotation_matrix
    saida = []
    for bloco in page.get_text("dict")["blocks"]:
        for linha in bloco.get("lines", []):
            texto = "".join(s["text"] for s in linha["spans"]).strip()
            if not texto:
                continue
            import pymupdf as fitz
            r = fitz.Rect(linha["bbox"]) * M
            saida.append({"texto": texto, "bbox": (r.x0, r.y0, r.x1, r.y1), "tamanho": linha["spans"][0]["size"]})
    return saida


def desenhos_da_pagina(page) -> list[dict]:
    """Desenhos da prancha já girados para a vista da página: [{"fill", "color", "width", "rect", "items"}],
    com rect = (x0, y0, x1, y1) e items = [("l", p, q) | ("c", p, q) | ("poly", [pontos])], pontos em tuplas.

    Usa get_cdrawings (quatro vezes mais rápido que get_drawings numa prancha de 500 mil traços)."""
    a, b, c, d, e, f = tuple(page.rotation_matrix)

    def gira(p):
        return (a * p[0] + c * p[1] + e, b * p[0] + d * p[1] + f)

    rapido = LEITURA_RAPIDA and hasattr(page, "get_cdrawings")
    saida = []
    for dr in (page.get_cdrawings() if rapido else page.get_drawings()):
        itens = []
        for it in dr["items"]:
            if it[0] == "l":
                itens.append(("l", gira(tuple(it[1])), gira(tuple(it[2]))))
            elif it[0] == "c":
                itens.append(("c", gira(tuple(it[1])), gira(tuple(it[4]))))
            elif it[0] == "re":
                x0, y0, x1, y1 = tuple(it[1])
                itens.append(("poly", [gira(q) for q in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]))
            elif it[0] == "qu":
                q = it[1]
                if rapido:  # (ul, ur, ll, lr)
                    ul, ur, ll, lr = (tuple(v) for v in q)
                else:
                    ul, ur, ll, lr = tuple(q.ul), tuple(q.ur), tuple(q.ll), tuple(q.lr)
                itens.append(("poly", [gira(ul), gira(ur), gira(lr), gira(ll)]))
        x0, y0, x1, y1 = tuple(dr["rect"])
        saida.append({"fill": dr.get("fill"), "color": dr.get("color"), "width": dr.get("width"),
                      "opacidade": dr.get("fill_opacity"), "rect": (x0, y0, x1, y1), "items": itens})
    return saida


def mascara_de_paredes(page, escala: float, recorte=None, desenhos=None, finos: float = 0.0,
                       cobre: bool = False):
    """Imagem (numpy bool, True = parede) com RESOLUCAO_M metros por pixel e k (pixel por ponto).

    finos: conta também as linhas retas finas de pelo menos FINO_MIN_M com cinza até esse valor (0 = não
    conta; caixilho, vidro, grade, gradil de abrigo, guarda-corpo), que fecham vãos sem parede.
    cobre: preenchimento claro e opaco desenhado depois apaga a parede que ficou embaixo (parede de outro
    pavimento, shaft sob a bancada do WC: a prancha impressa não mostra).
    Só a segunda passada (melhorar_por_raio) usa finos e cobre, e só fica com o resultado se a área da sala
    bater melhor com o rótulo (mobiliário e cota também são linhas finas; nem todo branco por cima é forro)."""
    import numpy as np
    from PIL import Image, ImageDraw

    ppm = pt_por_m(escala)
    k = 1 / (ppm * RESOLUCAO_M)
    x0, y0, x1, y1 = recorte or (0, 0, page.rect.width, page.rect.height)
    im = Image.new("1", (int((x1 - x0) * k) + 1, int((y1 - y0) * k) + 1), 0)
    dw = ImageDraw.Draw(im)

    def px(p):
        return ((p[0] - x0) * k, (p[1] - y0) * k)

    for d in (desenhos if desenhos is not None else desenhos_da_pagina(page)):
        r = d["rect"]
        cheio = e_parede(d.get("fill"), r[2] - r[0], r[3] - r[1], ppm)
        traco = e_traco_de_parede(d.get("color"), d.get("width"))
        if not (cheio or traco) and cobre and d.get("fill") is not None and (d.get("opacidade") or 1) >= 0.99:
            pts = []
            for it in d["items"]:
                pts += [it[1], it[2]] if it[0] in ("l", "c") else it[1]
            if len(pts) >= 3:
                dw.polygon([px(q) for q in pts], fill=0)
            continue
        if finos and not (cheio or traco) and d.get("color") is not None and sum(d["color"]) / 3 <= finos:
            for it in d["items"]:
                if it[0] == "l" and ((it[1][0] - it[2][0]) ** 2 + (it[1][1] - it[2][1]) ** 2) ** 0.5 >= FINO_MIN_M * ppm:
                    dw.line([px(it[1]), px(it[2])], fill=1, width=1)
            continue
        if not (cheio or traco):
            continue
        if traco and not cheio:
            lw = max(1, int(round((d.get("width") or 0) * k)))
            for it in d["items"]:
                if it[0] == "l":
                    dw.line([px(it[1]), px(it[2])], fill=1, width=lw)
                elif it[0] == "poly":
                    dw.polygon([px(q) for q in it[1]], outline=1, width=lw)
            continue
        pts = []
        for it in d["items"]:
            pts += [it[1], it[2]] if it[0] in ("l", "c") else it[1]
        if len(pts) >= 3:
            dw.polygon([px(q) for q in pts], fill=1)
    return np.asarray(im, dtype=bool), k, (x0, y0)


def salas_da_mascara(paredes, rotulos_px: list[tuple[float, float]], fecha_px: int, dist_parede=None):
    """Rótulo -> número do pedaço de espaço livre em que ele cai (0 = caiu na parede ou fora).

    paredes: numpy bool. rotulos_px: [(coluna, linha)]. dist_parede: distância de cada pixel à parede
    (ndimage.distance_transform_edt(~paredes)), para reaproveitar entre raios.
    Devolve (rotulado, [número por rótulo]).
    """
    import numpy as np
    from scipy import ndimage

    # engordar a parede com um disco de raio fecha_px = pixel a até fecha_px da parede (a distância custa
    # o mesmo para qualquer raio; a dilatação com disco grande era o que deixava o pilotis lento)
    if dist_parede is None:
        dist_parede = ndimage.distance_transform_edt(~paredes)
    gorda = dist_parede <= fecha_px
    pedacos, _ = ndimage.label(~gorda)
    # cada pixel livre volta para o pedaço mais perto; o canto da sala fica a fecha_px × √2 do miolo
    dist, (iy, ix) = ndimage.distance_transform_edt(pedacos == 0, return_indices=True)
    rotulado = pedacos[iy, ix]
    rotulado[paredes | (dist > fecha_px * 1.5 + 1)] = 0
    # sobras (faixa estreita demais para ter miolo): pedaços próprios, para juntar_partidos poder usar
    sobras = (rotulado == 0) & ~paredes
    extra, _ = ndimage.label(sobras)
    rotulado[sobras] = extra[sobras] + rotulado.max()
    numeros = []
    for c, l in rotulos_px:
        ci, li = int(round(c)), int(round(l))
        n = 0
        if 0 <= li < rotulado.shape[0] and 0 <= ci < rotulado.shape[1]:
            # o rótulo pode estar em cima de uma linha: procura o pedaço num raio de 0,3 m
            r = max(1, int(0.3 / RESOLUCAO_M))
            janela = rotulado[max(0, li - r):li + r + 1, max(0, ci - r):ci + r + 1]
            vals, cont = np.unique(janela[janela > 0], return_counts=True)
            n = int(vals[np.argmax(cont)]) if len(vals) else 0
        numeros.append(n)
    return rotulado, numeros


def separar_por_parede_virtual(rotulado, numeros: list[int], pontos_px: list[tuple[float, float]]) -> int:
    """Espaço com mais de um rótulo (vão largo, vitrine aberta): fecha os vãos com raio crescente
    (RAIOS_VIRTUAIS_M) só dentro desse espaço, até cada rótulo ficar num pedaço. Muda rotulado e numeros
    no lugar; devolve quantos espaços separou."""
    import numpy as np
    from scipy import ndimage

    separados = 0
    for n in sorted({x for x in numeros if x and numeros.count(x) > 1}):
        idx = [i for i, x in enumerate(numeros) if x == n]
        ys, xs = np.nonzero(rotulado == n)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        dentro = rotulado[y0:y1, x0:x1] == n
        dist = ndimage.distance_transform_edt(dentro)
        for raio in RAIOS_VIRTUAIS_M:
            sub, nums = salas_da_mascara(~dentro, [(pontos_px[i][0] - x0, pontos_px[i][1] - y0) for i in idx],
                                         max(1, int(round(raio / RESOLUCAO_M))), dist)
            if 0 in nums or len(set(nums)) < len(nums):
                continue
            base = int(rotulado.max()) + 1
            janela = rotulado[y0:y1, x0:x1]
            # o que não ficou com nenhum rótulo vira sobra (juntar_partidos ainda pode usar)
            janela[dentro] = sub[dentro] + base
            for i, v in zip(idx, nums):
                numeros[i] = v + base
            separados += 1
            break
    return separados




def primeira_passada(paredes, pontos_px: list[tuple[float, float]], alvos: list[float]):
    """Portas fechadas, vão largo com parede virtual onde dois rótulos dividem o espaço, sala partida
    por traço fino juntada. Devolve (rotulado, numeros, quantos espaços separou, avisos de junção)."""
    rotulado, numeros = salas_da_mascara(paredes, pontos_px, max(1, int(round(FECHA_VAO_M / RESOLUCAO_M))))
    separados = separar_por_parede_virtual(rotulado, numeros, pontos_px)
    por_n: dict[int, float] = {}
    for n, a in zip(numeros, alvos):
        if n:
            por_n[n] = por_n.get(n, 0.0) + a
    return rotulado, numeros, separados, juntar_partidos(rotulado, por_n, RESOLUCAO_M ** 2)


def melhorar_por_raio(paredes, rotulado, numeros: list[int], pontos_px: list[tuple[float, float]],
                      alvos: list[float], outras=()) -> dict[int, float]:
    """Segunda passada, só para os rótulos que ainda ficaram ruins (área fora da folga, ou dividindo o
    espaço com outro rótulo): refaz a planta inteira com cada raio de parede virtual e dá ao rótulo o
    pedaço, sem outro rótulo dentro, cuja área mais se aproxima da área escrita nele. Antes das paredes
    virtuais tenta as outras máscaras (caixilho e grade como parede, sem a parede escondida), com o raio
    normal. O pedaço não toma pixel de sala que já estava boa. Muda rotulado e numeros no lugar; devolve
    {rótulo: raio da parede virtual usada (0 = outra máscara)}."""
    import numpy as np
    from scipy import ndimage

    px_m2 = RESOLUCAO_M ** 2
    cont = np.bincount(rotulado.ravel())
    quantos = {n: numeros.count(n) for n in numeros if n}

    def erro(i, area):
        return abs(area - alvos[i]) / alvos[i]

    ruins = [i for i, n in enumerate(numeros)
             if n and (quantos[n] > 1 or erro(i, cont[n] * px_m2) > FOLGA_AREA - 0.03)]
    if not ruins or (not RAIOS_VIRTUAIS_M and not outras):
        return {}
    bons = np.isin(rotulado, [n for n, q in quantos.items() if q == 1 and n not in {numeros[i] for i in ruins}])
    atual = {i: (erro(i, cont[numeros[i]] * px_m2) if quantos[numeros[i]] == 1 else 9.0) for i in ruins}
    melhor: dict[int, tuple[float, float, tuple]] = {}  # rótulo -> (erro, raio, (y0, x0, máscara recortada))
    dist = ndimage.distance_transform_edt(~paredes)
    tentativas = [(m, 0.0, None) for m in outras]
    tentativas += [(paredes, r, dist) for r in sorted(r for r in RAIOS_VIRTUAIS_M if r > FECHA_VAO_M)]
    for mascara, raio, d in tentativas:
        if raio:
            rot_r, nums = salas_da_mascara(mascara, pontos_px, max(1, int(round(raio / RESOLUCAO_M))), d)
        else:  # outra máscara: a primeira passada inteira de novo, com ela
            rot_r, nums = primeira_passada(mascara, pontos_px, alvos)[:2]
        for i in ruins:
            v = nums[i]
            if v == 0 or nums.count(v) > 1:
                continue
            # parede virtual só encolhe espaço grande demais ou divide espaço com vários rótulos: sala
            # pequena demais crescendo por parede virtual pega a sala vizinha sem rótulo (falso acerto)
            if raio and quantos[numeros[i]] == 1 and cont[numeros[i]] * px_m2 < alvos[i]:
                continue
            # espaço que vaza para fora da planta (estacionamento aberto, calçada): só a parede virtual
            # separa os rótulos dele; refazer com outra máscara junta o que sobrou até bater com o rótulo,
            # levando a sala vizinha (a casa ao lado do estacionamento)
            if not raio and cont[numeros[i]] * px_m2 > VAZOU * sum(alvos[j] for j, n in enumerate(numeros) if n == numeros[i]):
                continue
            ys, xs = np.nonzero(rot_r == v)
            y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            m = (rot_r[y0:y1, x0:x1] == v) & ~bons[y0:y1, x0:x1]
            # sala pequena demais pode crescer (bancada do WC atrás de parede escondida, frente da loja)
            # até o dobro; mais que isso é pegar a sala vizinha para bater com o rótulo (falso acerto)
            if quantos[numeros[i]] == 1 and m.sum() > CRESCE_MAX * cont[numeros[i]]:
                continue
            e = erro(i, m.sum() * px_m2)
            # a primeira correção que já basta fica (a ordem vai da mais fiel à planta para a menos fiel):
            # uma depois pode bater melhor o número pegando a sala vizinha
            if i in melhor and melhor[i][0] <= FOLGA_AREA:
                continue
            ref = melhor[i][0] if i in melhor else atual[i]
            if e < ref - 0.02 and e < atual[i] - 0.05:
                melhor[i] = (e, raio, (y0, x0, m))
    usados = {}
    prox = int(rotulado.max()) + 1
    tomados = np.zeros(rotulado.shape, dtype=bool)
    for i, (e, raio, (y0, x0, m)) in sorted(melhor.items(), key=lambda t: t[1][0]):
        janela = rotulado[y0:y0 + m.shape[0], x0:x0 + m.shape[1]]
        livre = m & ~tomados[y0:y0 + m.shape[0], x0:x0 + m.shape[1]]
        if erro(i, livre.sum() * px_m2) >= atual[i] - 0.05:
            continue
        janela[livre] = prox
        tomados[y0:y0 + m.shape[0], x0:x0 + m.shape[1]] |= livre
        numeros[i] = prox
        usados[i] = raio
        prox += 1
    return usados


def juntar_partidos(rotulado, alvos: dict[int, float], px_m2: float, folga: float = 0.12) -> dict[int, list[str]]:
    """Sala partida por traço que não é parede (desnível, projeção, forro): junta o pedaço com rótulo aos
    vizinhos sem rótulo do outro lado de um traço fino, um por vez, enquanto a soma chega mais perto da
    área do rótulo sem passar dela mais que a folga. Muda rotulado no lugar; devolve os avisos."""
    import numpy as np
    from scipy import ndimage

    areas = np.bincount(rotulado.ravel()) * px_m2
    com_rotulo = set(alvos)
    juntado: dict[int, float] = {}
    for n, alvo in alvos.items():
        while True:
            atual = areas[n]
            if atual >= alvo * (1 - folga):
                break
            ys, xs = np.nonzero(rotulado == n)
            f = int(TRACO_FINO_PX) + 1
            y0, x0 = max(0, ys.min() - f), max(0, xs.min() - f)
            janela = rotulado[y0:ys.max() + f + 1, x0:xs.max() + f + 1]
            m = janela == n
            # 2 pixels atravessam um traço fino (1 pixel), não uma parede (duas linhas com o miolo entre elas)
            borda = ndimage.binary_dilation(m, iterations=int(TRACO_FINO_PX)) & ~m
            vizinhos = [int(v) for v in np.unique(janela[borda]) if v and v not in com_rotulo]
            melhor = min(vizinhos, key=lambda v: abs(atual + areas[v] - alvo), default=None)
            if melhor is None or abs(atual + areas[melhor] - alvo) >= abs(atual - alvo) or atual + areas[melhor] > alvo * (1 + folga):
                break
            rotulado[rotulado == melhor] = n
            areas[n] += areas[melhor]
            areas[melhor] = 0
            juntado[n] = juntado.get(n, 0.0) + areas[n] - atual
    return {n: [f"juntei {m2:.1f} m² do outro lado de um traço fino"] for n, m2 in juntado.items() if m2 >= 0.1}


def unidades_pelo_nome(paredes, pontos_px: list[tuple[float, float]], ocupado=None):
    """Uma unidade inteira (casa) por nome escrito na prancha, sem rótulo de área e sem os cômodos de dentro.

    Do nome, anda em cruz até a primeira parede grossa e comprida de cada lado: o retângulo é o limite. Dentro
    dele, a unidade é o que se alcança a partir do nome sem atravessar parede grossa (as paredes finas de dentro
    não contam). Duas unidades no mesmo bloco dividem o espaço pela que chega primeiro.
    ocupado: pixels que já são de uma sala com rótulo (não entram). Devolve (rotulado, [número por ponto; 0 = o
    nome não está cercado de paredes])."""
    from collections import deque

    import numpy as np
    from scipy import ndimage

    lado = max(2, int(round(PAREDE_GROSSA_M / RESOLUCAO_M)))
    grossa = ndimage.binary_opening(paredes, structure=np.ones((lado, lado), dtype=bool))
    comp, _ = ndimage.label(grossa)
    longa_px = PAREDE_LONGA_M / RESOLUCAO_M
    longas = [i + 1 for i, s in enumerate(ndimage.find_objects(comp))
              if max(s[0].stop - s[0].start, s[1].stop - s[1].start) >= longa_px]
    longa = np.isin(comp, longas)
    alt, larg = paredes.shape
    alcance = int(ALCANCE_M / RESOLUCAO_M)

    def ate_a_parede(x, y, dx, dy):
        for s in range(1, alcance):
            xx, yy = x + dx * s, y + dy * s
            if not (0 <= xx < larg and 0 <= yy < alt):
                return None
            if longa[yy, xx]:
                return s
        return None

    livre = np.zeros(paredes.shape, dtype=bool)
    sementes = []
    for c, l in pontos_px:
        x, y = int(round(c)), int(round(l))
        r = [ate_a_parede(x, y, *d) for d in ((-1, 0), (1, 0), (0, -1), (0, 1))] if 0 <= x < larg and 0 <= y < alt else [None]
        if None in r:
            sementes.append(None)
            continue
        livre[y - r[2]:y + r[3] + 1, x - r[0]:x + r[1] + 1] = True
        sementes.append((y, x))
    livre &= ~grossa
    if ocupado is not None:
        livre &= ~ocupado
    rotulado = np.zeros(paredes.shape, dtype=np.int32)
    fila = deque()
    for i, s in enumerate(sementes, 1):
        if s and livre[s]:
            rotulado[s] = i
            fila.append(s)
    while fila:
        y, x = fila.popleft()
        n = rotulado[y, x]
        for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= yy < alt and 0 <= xx < larg and livre[yy, xx] and not rotulado[yy, xx]:
                rotulado[yy, xx] = n
                fila.append((yy, xx))
    return rotulado, [i if (rotulado == i).any() else 0 for i in range(1, len(sementes) + 1)]


def poligono_do_pedaco(rotulado, numero: int):
    """Contorno (shapely, em pixels) do pedaço: une as faixas de cada linha da imagem."""
    import numpy as np
    from shapely.geometry import box
    from shapely.ops import unary_union

    m = rotulado == numero
    caixas = []
    for li in np.nonzero(m.any(axis=1))[0]:
        linha = np.concatenate(([0], m[li].view(np.int8), [0]))
        d = np.diff(linha)
        for a, b in zip(np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]):
            caixas.append(box(a, li, b, li + 1))
    # a sala juntada por juntar_partidos tem o traço no meio: fecha a fresta de até 5 pixels (25 cm)
    g = unary_union(caixas)
    if g.geom_type == "MultiPolygon":
        g = g.buffer(2.5, join_style="mitre").buffer(-2.5, join_style="mitre")
    if g.geom_type == "MultiPolygon":
        g = max(g.geoms, key=lambda p: p.area)
    return g


def extrair_do_pdf(page, escala: float, recorte=None, unidades: str | None = None,
                   espacos: str | None = None) -> dict:
    """Paredes, ambientes (com o nome do cômodo) e portas (nenhuma) da prancha, em metros do modelo.

    recorte: (x0, y0, x1, y1) em pontos, para ler só a planta (sem legenda, detalhes e carimbo).
    unidades: expressão regular do nome das unidades inteiras sem rótulo de área (ex.: "CASA [0-9]+"); cada uma
    vira um ambiente só, pelo contorno das paredes grossas (unidades_pelo_nome).
    espacos: expressão regular do nome dos espaços grandes sem rótulo de área (ex.: "ESTACIONAMENTO"); cada um
    vira um cômodo só: o espaço livre em volta do nome, com as portas fechadas, se não vazar para fora da planta.
    Devolve {"andar", "paredes", "ambientes", "comodos", "areas_da_prancha", "portas", "avisos", "unidades",
    "espacos"} ("unidades" e "espacos": os índices, em "ambientes", dos que são unidade inteira ou espaço).
    """
    import numpy as np
    import shapely
    from shapely.affinity import affine_transform
    from shapely.geometry import Polygon
    from shapely.ops import unary_union

    ppm = pt_por_m(escala)
    desenhos = desenhos_da_pagina(page)
    paredes, k, (ox, oy) = mascara_de_paredes(page, escala, recorte, desenhos)
    if not paredes.any():
        raise ErroAmbientesPdf("nenhuma parede na prancha (sem preenchimento escuro de hachura)")
    linhas = linhas_da_pagina(page)
    rot = [r for r in rotulos_de_area(linhas)
           if recorte is None or (recorte[0] <= r["x"] <= recorte[2] and recorte[1] <= r["y"] <= recorte[3])]
    if not rot:
        raise ErroAmbientesPdf("nenhum rótulo de área (\"A: 12,34m2\") na prancha: sem ele não sei o que é sala")
    pontos = [((r["x"] - ox) * k, (r["y"] - oy) * k) for r in rot]
    alvos = [r["area"] for r in rot]
    rotulado, numeros, virtuais, juntou = primeira_passada(paredes, pontos, alvos)
    # rótulo cujo espaço vazou para fora da planta na primeira passada: se a parede virtual não achar
    # um pedaço com a área dele, fica sem ambiente (um pedaço qualquer do estacionamento não serve)
    cont0 = np.bincount(rotulado.ravel())
    soma0: dict[int, float] = {}
    for n, a in zip(numeros, alvos):
        if n:
            soma0[n] = soma0.get(n, 0.0) + a
    vazados = {i for i, n in enumerate(numeros) if n and cont0[n] * RESOLUCAO_M ** 2 > VAZOU * soma0[n]}
    outras = [mascara_de_paredes(page, escala, recorte, desenhos, **o)[0]
              for o in ({"cobre": True}, {"finos": 0.35}, {"finos": 0.7, "cobre": True})] if USAR_OUTRAS else []
    melhorados = melhorar_por_raio(paredes, rotulado, numeros, pontos, alvos, outras)
    virtuais += sum(1 for r in melhorados.values() if r > 0)
    fechados_fino = sum(1 for r in melhorados.values() if r == 0)
    # pixel -> metros do modelo (x = ponto/ppm, y = -ponto/ppm)
    para_m = [1 / k / ppm, 0, 0, -1 / k / ppm, ox / ppm, -oy / ppm]
    ambientes, comodos, areas, avisos = [], [], [], []
    if fechados_fino:
        avisos.append(f"{fechados_fino} espaço(s) refeitos com caixilho ou grade como parede, ou sem parede escondida: conferir")
    if virtuais:
        avisos.append(f"{virtuais} espaço(s) com vão largo (vitrine, passagem, área aberta) fechados por parede virtual: conferir")
    por_pedaco: dict[int, list[dict]] = {}
    cont = np.bincount(rotulado.ravel())
    for i, (r, n) in enumerate(zip(rot, numeros)):
        if n and i in vazados and abs(cont[n] * RESOLUCAO_M ** 2 - r["area"]) > FOLGA_AREA * r["area"]:
            avisos.append(f"{r['nome'] or 'sem nome'}: o espaço vaza para fora da planta e a parede virtual não achou "
                          f"a área de {r['area']:.2f} m²: sem ambiente, desenhar à mão")
            continue
        if n == 0:
            avisos.append(f"rótulo {r['nome'] or '(sem nome)'} {r['area']:.2f} m² caiu em cima de parede: sem ambiente")
            continue
        por_pedaco.setdefault(n, []).append(r)
    for n, rs in sorted(por_pedaco.items(), key=lambda kv: (kv[1][0]["y"], kv[1][0]["x"])):
        g = affine_transform(poligono_do_pedaco(rotulado, n), para_m).simplify(RESOLUCAO_M)
        if not isinstance(g, Polygon) or g.area < AREA_MINIMA_M2:
            continue
        nomes = [r["nome"] for r in rs if r["nome"]]
        area_prancha = sum(r["area"] for r in rs)
        if n in juntou:
            avisos.append(f"{' + '.join(nomes) or 'sem nome'}: {'; '.join(juntou[n])}")
        if len(rs) > 1:
            avisos.append(f"{' + '.join(nomes) or 'sem nome'}: {len(rs)} rótulos no mesmo espaço (passagem aberta?), ficou um ambiente só")
        if g.area > VAZOU * area_prancha:
            avisos.append(f"{' + '.join(nomes) or 'sem nome'}: o espaço vaza para fora da planta (medido {g.area:.0f} m², "
                          f"a prancha diz {area_prancha:.2f} m²): sem ambiente, desenhar à mão")
            continue
        if abs(g.area - area_prancha) > max(1.0, 0.25 * area_prancha):
            avisos.append(f"{' + '.join(nomes) or 'sem nome'}: medido {g.area:.1f} m², a prancha diz {area_prancha:.2f} m²")
        ambientes.append(shapely.to_wkt(g, rounding_precision=3))
        comodos.append(" + ".join(dict.fromkeys(nomes)) or None)
        areas.append(round(area_prancha, 2))
    indices_unidades = []
    if unidades:
        padrao = re.compile(unidades, re.I)
        nomes_u = []
        for l in linhas:
            x, y = (l["bbox"][0] + l["bbox"][2]) / 2, (l["bbox"][1] + l["bbox"][3]) / 2
            if padrao.fullmatch(l["texto"].strip()) and (recorte is None or (recorte[0] <= x <= recorte[2] and recorte[1] <= y <= recorte[3])):
                nomes_u.append((nome_do_comodo([l["texto"]]), (x - ox) * k, (y - oy) * k))
        rot_u, nums_u = unidades_pelo_nome(paredes, [(c, l) for _, c, l in nomes_u], np.isin(rotulado, list(por_pedaco)))
        for (nome, _, _), n in zip(nomes_u, nums_u):
            g = affine_transform(poligono_do_pedaco(rot_u, n), para_m).simplify(RESOLUCAO_M) if n else None
            if g is None or not isinstance(g, Polygon) or g.area < AREA_MINIMA_M2:
                avisos.append(f"{nome}: o nome não está cercado de paredes grossas: sem ambiente, desenhar à mão")
                continue
            indices_unidades.append(len(ambientes))
            ambientes.append(shapely.to_wkt(Polygon(g.exterior), rounding_precision=3))
            comodos.append(nome)
            areas.append(None)
        if nomes_u:
            avisos.append(f"{len(indices_unidades)} unidade(s) inteira(s) pelo contorno das paredes grossas, sem área na prancha: conferir")
    indices_espacos = []
    if espacos:
        padrao = re.compile(espacos, re.I)
        for l in linhas:
            x, y = (l["bbox"][0] + l["bbox"][2]) / 2, (l["bbox"][1] + l["bbox"][3]) / 2
            if not padrao.fullmatch(l["texto"].strip()) or not (recorte is None or (recorte[0] <= x <= recorte[2] and recorte[1] <= y <= recorte[3])):
                continue
            nome = nome_do_comodo([l["texto"]])
            li, ci = int(round((y - oy) * k)), int(round((x - ox) * k))
            n = int(rotulado[li, ci]) if 0 <= li < rotulado.shape[0] and 0 <= ci < rotulado.shape[1] else 0
            if n == 0 or n in por_pedaco:
                avisos.append(f"{nome}: o nome caiu em parede ou numa sala que já tem rótulo: sem ambiente")
                continue
            m = rotulado == n
            if m[0].any() or m[-1].any() or m[:, 0].any() or m[:, -1].any():
                avisos.append(f"{nome}: o espaço vaza para fora da planta: sem ambiente, desenhar à mão")
                continue
            g = affine_transform(poligono_do_pedaco(rotulado, n), para_m).simplify(RESOLUCAO_M)
            if not isinstance(g, Polygon) or g.area < AREA_MINIMA_M2:
                continue
            por_pedaco[n] = []  # outro nome no mesmo espaço não faz um segundo ambiente
            indices_espacos.append(len(ambientes))
            ambientes.append(shapely.to_wkt(g, rounding_precision=3))
            comodos.append(nome)
            areas.append(None)
            avisos.append(f"{nome}: espaço inteiro de {g.area:.0f} m² pelo nome, sem área na prancha: conferir")
    # as paredes em vetor só servem à modulação e aos projetos por ambiente (que casam com o IFC): ficam vazias
    return {"andar": "", "paredes": "GEOMETRYCOLLECTION EMPTY",
            "ambientes": ambientes, "comodos": comodos, "areas_da_prancha": areas, "portas": [], "avisos": avisos,
            "unidades": indices_unidades, "espacos": indices_espacos}

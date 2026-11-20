"""Projetos nos ambientes: modulação (fatia F3, 19/11/2026), paginação de piso e impermeabilização (20/11/2026).

A prancha de um projeto do ambiente aparece como "detalhe" ao tocar o ambiente, como o detalhamento do
pilar: a pessoa confere o serviço olhando o pedaço da prancha daquele apartamento. Nada de digitar medida:
o que vale é o desenho do projeto.

- Modulação: a planta de 1ª fiada (uma prancha por setor do pavimento). É o `detalhe` do ambiente.
- Outros projetos ("projetos" no pavimento.json): paginação de piso (uma prancha por setor), impermeabilização
  (uma prancha por pavimento)... Cada um vira um recorte a mais do ambiente (`projetos` no pacote), mostrado
  só nas fichas listadas em "fichas" (sem a lista, em todas).

Como a prancha é posta em cima do modelo:
- pelas paredes (padrão): as paredes do IFC são casadas com as paredes hachuradas da prancha
  (ambientes.casar_com_a_prancha, o mesmo casamento que já põe os ambientes na prancha de arquitetura).
  A prancha de um setor mostra só parte do andar, então a coincidência geral é baixa por natureza; por isso
  cada apartamento é conferido sozinho (nota_local): só ganha o recorte da prancha em que as paredes DELE
  batem. Parte da prancha desenhada fora de posição (um canto girado, uma vista à parte) não passa.
- pela arquitetura ("pela_arquitetura": true): para a prancha que desenha por cima da planta de arquitetura
  do pavimento, com as paredes só em traço (a impermeabilização). A prancha é casada com a planta de
  arquitetura pela imagem inteira (deslocamento_entre_pranchas) e herda dela o casamento com o modelo.
  Na mesma escala, só o deslocamento (deslocamento_entre_pranchas). Em outra escala (a paginação em 1:50 sobre a
  arquitetura em 1:200) ou com "giros": encaixe_entre_pranchas acha escala, giro e lugar, e cada apartamento é
  conferido na tinta da prancha (nota_local com para_pt), como no casamento pelas paredes.

Recorte por apartamento: os ambientes do mesmo apartamento ganham a mesma imagem (o apartamento inteiro
com folga), que é como a prancha se lê na obra, e o pacote fica com um recorte por apartamento, não um
por cômodo. Ambiente de área comum tem o recorte só dele. Vale a prancha em que o apartamento cabe
inteiro e (quando há nota) em que as paredes dele batem melhor; sem nota, a mais longe da borda. Se ele
não cabe inteiro em nenhuma, cada cômodo procura a sua.

No pavimento.json, dentro de "ambientes":
  "modulacao": {"pranchas": "../Modulacao/*.VD.EX.02[4-8].*.pdf", "escala": 50}
  "projetos": [
    {"titulo": "Paginação de piso", "pranchas": "../Piso/*.AR.DE.05[3-7].*.pdf", "escala": 50, "fichas": ["PVS-024"]},
    {"titulo": "Impermeabilização", "pranchas": "../Imperm/*.IM.EX.006.*.pdf", "escala": 200, "pela_arquitetura": true,
     "fichas": ["PVS-024", "PVS-015"]}
  ]
  opcionais: "margem_m" (folga em volta do recorte, 0,30 m), "coincidencia_minima" (0,08 pelas paredes, 0,30 pela
  arquitetura), "nota_minima" (0,50: parte das paredes do apartamento que precisa bater na prancha),
  "sigla" (nome curto do recorte no pacote; padrão: as iniciais do título), "px_por_m" (resolução do recorte
  colorido dos projetos, 80 pixels por metro de obra), "giros" (pelas paredes, os giros do modelo tentados em cada
  prancha: [0, 90, 180, 270]; a prancha de setor pode desenhar uma ala da torre girada), "destaque_minimo" (1,3:
  pela arquitetura em outra escala, o melhor ponto sobre o segundo), "aptos_por_prancha" ({"trecho do nome do
  arquivo": ["602", "603"]}: a prancha só vale para esses apartamentos; a do 2º ao 5º usada no 6º).
"""

from __future__ import annotations

import pathlib
import re
import unicodedata

MARGEM_M = 0.30
COINCIDENCIA_MINIMA = 0.08
COINCIDENCIA_MINIMA_ARQ = 0.30  # pela imagem inteira, contra a planta de arquitetura (conferido nos 5 andares da obra piloto)
NOTA_MINIMA = 0.50
COINCIDENCIA_MINIMA_ESCALA = 0.05  # pela arquitetura em outra escala: a prancha de setor cobre só parte do andar
DESTAQUE_MINIMO = 1.30  # e o ponto achado tem que ser 1,3 vez melhor que o segundo (fora disso é chute)
NOTA_MINIMA_TINTA = 0.50  # parte das paredes do apartamento em cima de desenho da prancha
ESCALA_IMG = 2.4  # a mesma do detalhe do pilar (gerador_fvs.DET_ESCALA)
PX_POR_M = 80.0  # recorte colorido dos projetos: 80 pixels por metro de obra (1:200 → 5,6 px/pt; 1:50 → 1,4 px/pt)
FOLGA_PAREDE_M = 0.20  # a nota de um apartamento olha as paredes até 0,20 m fora dele
AREA_COMUM = "Área comum"


class ErroModulacao(Exception):
    pass


def caixa_dos_pontos(pts) -> tuple[float, float, float, float]:
    xs = [float(p[0]) for p in pts]
    ys = [float(p[1]) for p in pts]
    if not xs:
        raise ErroModulacao("contorno vazio")
    return (min(xs), min(ys), max(xs), max(ys))


def juntar_caixas(caixas) -> tuple[float, float, float, float]:
    caixas = list(caixas)
    return (min(c[0] for c in caixas), min(c[1] for c in caixas), max(c[2] for c in caixas), max(c[3] for c in caixas))


def folga_na_folha(caixa, largura: float, altura: float) -> float:
    """Menor distância da caixa até a borda da folha; negativa se a caixa sai da folha."""
    x0, y0, x1, y1 = caixa
    return min(x0, y0, largura - x1, altura - y1)


def escolher_prancha(caixas: dict[str, tuple], folhas: dict[str, tuple[float, float]],
                     notas: dict[str, float] | None = None, nota_minima: float = 0.0) -> str | None:
    """Das pranchas em que a caixa cabe inteira, a que a deixa mais longe da borda (empate: a de nome menor).

    Com notas (prancha -> parte das paredes que bate ali), só vale prancha com nota >= nota_minima, e vence a
    de nota maior (a folga desempata)."""
    boas = [(folga_na_folha(c, *folhas[p]), p) for p, c in caixas.items() if p in folhas]
    boas = [(f, p) for f, p in boas if f >= 0]
    if notas is not None:
        boas = [(notas.get(p, 0.0), f, p) for f, p in boas if notas.get(p, 0.0) >= nota_minima]
        if not boas:
            return None
        return sorted(boas, key=lambda nfp: (-nfp[0], -nfp[1], nfp[2]))[0][2]
    if not boas:
        return None
    return sorted(boas, key=lambda fp: (-fp[0], fp[1]))[0][1]


def recorte(caixa, largura: float, altura: float, margem_pt: float) -> tuple[float, float, float, float]:
    """A caixa com folga, sem sair da folha."""
    x0, y0, x1, y1 = caixa
    return (max(0.0, x0 - margem_pt), max(0.0, y0 - margem_pt), min(largura, x1 + margem_pt), min(altura, y1 + margem_pt))


def _unidade(nome: str) -> str:
    """"602" ou "Apto 602" -> "602" (para "aptos_por_prancha")."""
    nome = str(nome).strip()
    return nome[5:].strip() if nome.lower().startswith("apto ") else nome


def aptos_por_prancha(cfg: dict) -> dict[str, list[str]]:
    """"aptos_por_prancha" do projeto, conferido: {"trecho do nome da prancha": ["602", "603"]}."""
    so = cfg.get("aptos_por_prancha") or {}
    if not isinstance(so, dict) or not all(isinstance(k, str) and k and isinstance(v, list) and v
                                           and all(isinstance(u, str) and u.strip() for u in v) for k, v in so.items()):
        raise ErroModulacao("\"aptos_por_prancha\" tem que ser {\"trecho do nome da prancha\": [\"602\", \"603\"]}")
    return so


def chave_da_modulacao(unidade: str, sigla: str = "M") -> str:
    """"Apto 303" -> "M_Apto_303" (nome seguro para o pedaço do pacote, como pacote.chave_de_detalhe)."""
    return re.sub(r"[^A-Za-z0-9_-]", "_", f"{sigla}_{unidade}")[:120]


def sigla_do_titulo(titulo: str) -> str:
    """"Paginação de piso" -> "PP"; "Impermeabilização" -> "I" (iniciais das palavras de 3 letras ou mais)."""
    sem_acento = "".join(c for c in unicodedata.normalize("NFD", titulo) if unicodedata.category(c) != "Mn")
    palavras = [w for w in re.findall(r"[A-Za-z0-9]+", sem_acento) if len(w) >= 3] or re.findall(r"[A-Za-z0-9]+", sem_acento)
    return "".join(w[0].upper() for w in palavras) or "X"


def plano_da_modulacao(ambientes: list[dict], folhas: dict[str, tuple[float, float]], pt_por_m: dict[str, float],
                       margem_m: float = MARGEM_M, sigla: str = "M", nota=None,
                       nota_minima: float = NOTA_MINIMA) -> tuple[dict[str, dict], dict[str, str], dict]:
    """O que recortar de cada prancha.

    ambientes: [{"nome": "303-05", "grupo": "Apto 303", "caixas": {prancha: (x0, y0, x1, y1)}}], com a caixa
    do ambiente em pontos de cada prancha em que o modelo casou. folhas: prancha -> (largura, altura).
    pt_por_m: prancha -> pontos por metro (da escala).
    nota (opcional): função (prancha, [nomes dos ambientes]) -> parte das paredes deles que bate na prancha
    (0 a 1). Sem ela, vale só caber na folha.

    Devolve (recortes, de_cada_ambiente, relatório):
      recortes: chave -> {"prancha", "clip", "titulo", "ambientes", "nota"?}
      de_cada_ambiente: nome do ambiente -> chave
    """
    unidades: dict[str, list[dict]] = {}
    for a in ambientes:
        unidade = a["nome"] if (a.get("grupo") or AREA_COMUM) == AREA_COMUM else a["grupo"]
        unidades.setdefault(unidade, []).append(a)
    recortes: dict[str, dict] = {}
    de_cada: dict[str, str] = {}
    sem: list[str] = []
    nao_bateu: list[str] = []

    def notas_de(nomes: list[str], pranchas) -> dict[str, float] | None:
        return None if nota is None else {p: nota(p, nomes) for p in pranchas}

    def guardar(titulo: str, membros: list[dict], prancha: str, caixa, n: float | None) -> None:
        chave = chave_da_modulacao(titulo, sigla)
        larg, alt = folhas[prancha]
        recortes[chave] = {"prancha": prancha, "clip": recorte(caixa, larg, alt, margem_m * pt_por_m[prancha]),
                           "titulo": titulo, "ambientes": sorted(m["nome"] for m in membros)}
        if n is not None:
            recortes[chave]["nota"] = round(n, 2)
        for m in membros:
            de_cada[m["nome"]] = chave

    def cabe(caixas) -> list[str]:
        return [p for p, c in caixas.items() if p in folhas and folga_na_folha(c, *folhas[p]) >= 0]

    for unidade in sorted(unidades):
        membros = unidades[unidade]
        # pranchas em que todos os cômodos do apartamento casaram
        comuns = set.intersection(*(set(m["caixas"]) for m in membros))
        juntas = {p: juntar_caixas(m["caixas"][p] for m in membros) for p in comuns}
        notas = notas_de([m["nome"] for m in membros], cabe(juntas))
        p = escolher_prancha(juntas, folhas, notas, nota_minima)
        if p:
            guardar(unidade, membros, p, juntas[p], notas[p] if notas else None)
            continue
        # o apartamento não cabe inteiro (ou não bate) em nenhuma prancha: cada cômodo procura a sua
        for m in membros:
            nm = notas_de([m["nome"]], cabe(m["caixas"]))
            pm = escolher_prancha(m["caixas"], folhas, nm, nota_minima)
            if pm:
                guardar(m["nome"], [m], pm, m["caixas"][pm], nm[pm] if nm else None)
            else:
                sem.append(m["nome"])
                if nm:  # cabia em alguma prancha, mas as paredes não bateram
                    nao_bateu.append(m["nome"])
    rel = {
        "pranchas": len(folhas),
        "recortes": len(recortes),
        "com_recorte": len(de_cada),
        "sem_recorte": sorted(sem),
        "por_prancha": {p: sum(1 for r in recortes.values() if r["prancha"] == p) for p in sorted(folhas)},
    }
    if nota is not None:
        rel["paredes_nao_bateram"] = sorted(nao_bateu)
    return recortes, de_cada, rel


def detalhes_dos_ambientes(recortes: dict[str, dict], de_cada: dict[str, str], imagens: dict[str, bytes],
                           nome_da_prancha=lambda p: p, titulo: str = "Modulação",
                           fichas: list[str] | None = None) -> dict[str, dict]:
    """No formato de detalhes["A"] de publicar_planta.montar_trecho: nome do ambiente -> detalhe."""
    saida = {}
    for nome, chave in de_cada.items():
        r = recortes[chave]
        if chave not in imagens:
            continue
        d = {"chave": chave, "titulo": f"{titulo} · {r['titulo']}", "prancha": nome_da_prancha(r["prancha"]),
             "img": imagens[chave], "aco": None}
        if fichas:
            d["fichas"] = list(fichas)
        saida[nome] = d
    return saida


# ---------------------------------------------------------------------------
# Conferência por pedaço e casamento entre pranchas (numpy e pillow)
# ---------------------------------------------------------------------------

def nota_local(imagem, k: float, t: dict | None, paredes_perto, para_pt=None) -> float | None:
    """Parte das paredes do modelo (paredes_perto, em metros) que cai em cima da hachura da prancha.

    imagem e k: a prancha desenhada pelo casamento (ambientes.casar_com_a_prancha com com_imagem=True);
    t: o casamento. Ou para_pt: função (x, y) do modelo -> (x, y) em pontos da prancha (no lugar de t), com
    imagem e k da tinta da prancha (tinta_da_prancha). None se não há parede para conferir."""
    import numpy as np
    from PIL import Image, ImageDraw

    polys = [g for g in getattr(paredes_perto, "geoms", [paredes_perto]) if not g.is_empty and g.geom_type == "Polygon"]
    if not polys:
        return None

    if para_pt is None:
        def para_pt(x, y):
            return ((x - t["x0"]) * t["pt_por_m"] + t["dx_pt"], (t["y1"] - y) * t["pt_por_m"] + t["dy_pt"])

    def px(x, y):
        X, Y = para_pt(x, y)
        return (X * k, Y * k)

    x0, y0, x1, y1 = paredes_perto.bounds
    cantos = [px(x0, y0), px(x1, y0), px(x0, y1), px(x1, y1)]
    c0, l0 = int(min(c for c, _ in cantos)) - 1, int(min(l for _, l in cantos)) - 1
    c1, l1 = int(max(c for c, _ in cantos)) + 2, int(max(l for _, l in cantos)) + 2
    larg, alt = c1 - c0, l1 - l0
    if larg <= 0 or alt <= 0:
        return None
    im = Image.new("L", (larg, alt), 0)
    d = ImageDraw.Draw(im)
    for g in polys:
        d.polygon([(px(x, y)[0] - c0, px(x, y)[1] - l0) for x, y in g.exterior.coords], fill=255)
        for furo in g.interiors:
            d.polygon([(px(x, y)[0] - c0, px(x, y)[1] - l0) for x, y in furo.coords], fill=0)
    m = np.asarray(im, dtype=np.float32) / 255
    if not m.sum():
        return None
    # a janela da prancha (o que sai da folha conta como sem hachura)
    janela = np.zeros_like(m)
    a0, b0 = max(0, l0), max(0, c0)
    a1, b1 = min(imagem.shape[0], l1), min(imagem.shape[1], c1)
    if a1 > a0 and b1 > b0:
        janela[a0 - l0:a1 - l0, b0 - c0:b1 - c0] = imagem[a0:a1, b0:b1]
    return float((janela * m).sum() / m.sum())


def _de_volta_do_giro(xr: float, yr: float, giro: int, largura: float, altura: float) -> tuple[float, float]:
    """Ponto na imagem girada (np.rot90 de giro/90 quartos de volta, anti-horário) -> ponto na imagem original
    (largura x altura, em pixels)."""
    return {0: (xr, yr), 90: (largura - yr, xr), 180: (largura - xr, altura - yr), 270: (yr, altura - xr)}[giro % 360]


def encaixe_entre_pranchas(page_base, escala_base: float, page, escala: float, giros=(0,),
                           zoom: float = 0.5) -> dict:
    """Onde a prancha base (a planta de arquitetura) cai na outra prancha, com escala e giro diferentes.

    A outra prancha é desenhada na mesma escala da base (metro por pixel igual) e girada de 90 em 90 graus;
    vale o giro de maior correlação da tinta. Devolve {"giro", "coincidencia" (correlação normalizada no melhor
    ponto), "destaque" (melhor ponto / segundo melhor ponto do mesmo giro, longe dele), "para_outra": função
    (x, y) em pontos da base -> (x, y) em pontos da outra}. Na mesma escala e sem giro, é o mesmo que
    deslocamento_entre_pranchas."""
    import numpy as np
    import pymupdf as fitz

    zb = zoom
    zo = zoom * float(escala) / float(escala_base)  # 1:50 contra 1:200: a outra em 1/4 do zoom

    def tinta(pg, z):
        pm = pg.get_pixmap(matrix=fitz.Matrix(z, z), colorspace=fitz.csGRAY, annots=False)
        a = 1 - np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width).astype(np.float32) / 255
        return a - a.mean()

    base, outra0 = tinta(page_base, zb), tinta(page, zo)
    m_por_px = 0.0254 / 72 * float(escala_base) / zb
    raio = max(8, int(2.0 / m_por_px))  # o segundo pico é procurado a mais de 2 m do primeiro
    melhor = None
    for giro in giros:
        outra = np.rot90(outra0, (int(giro) % 360) // 90)
        forma = (base.shape[0] + outra.shape[0], base.shape[1] + outra.shape[1])
        c = np.fft.irfft2(np.fft.rfft2(outra, forma) * np.fft.rfft2(base[::-1, ::-1], forma), forma)
        iy, ix = np.unravel_index(np.argmax(c), c.shape)
        norma = float(np.sqrt((base * base).sum() * (outra * outra).sum())) or 1.0
        valor = float(c[iy, ix])
        c[max(0, iy - raio):iy + raio + 1, max(0, ix - raio):ix + raio + 1] = -np.inf
        segundo = float(c.max())
        if melhor is None or valor / norma > melhor["coincidencia"]:
            melhor = {"giro": int(giro) % 360, "ox": ix - (base.shape[1] - 1), "oy": iy - (base.shape[0] - 1),
                      "coincidencia": valor / norma,
                      "destaque": valor / segundo if segundo > 0 else float("inf")}
    g, ox, oy = melhor["giro"], melhor["ox"], melhor["oy"]
    larg_px, alt_px = float(outra0.shape[1]), float(outra0.shape[0])

    def para_outra(x: float, y: float) -> tuple[float, float]:
        xo, yo = _de_volta_do_giro(x * zb + ox, y * zb + oy, g, larg_px, alt_px)
        return xo / zo, yo / zo

    return {"giro": g, "coincidencia": melhor["coincidencia"], "destaque": melhor["destaque"], "para_outra": para_outra}


def tinta_da_prancha(page, pt_por_m: float, resolucao_m: float = 0.05):
    """(imagem 0/1 de onde há desenho na prancha, k em pixel por ponto), para nota_local com para_pt.

    Um pixel a mais em volta de cada traço (o traço da parede da prancha de projeto pode ser fino)."""
    import numpy as np
    import pymupdf as fitz

    k = 1 / (pt_por_m * resolucao_m)
    pm = page.get_pixmap(matrix=fitz.Matrix(k, k), colorspace=fitz.csGRAY, annots=False)
    a = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width) < 200
    b = a.copy()
    b[1:, :] |= a[:-1, :]
    b[:-1, :] |= a[1:, :]
    b[:, 1:] |= a[:, :-1]
    b[:, :-1] |= a[:, 1:]
    return b.astype(np.float32), k


def deslocamento_entre_pranchas(page_base, page, zoom: float = 0.5) -> tuple[float, float, float]:
    """(dx, dy, coincidência): o ponto (x, y) da prancha base fica em (x + dx, y + dy) na outra prancha.

    As duas na mesma escala (a outra prancha desenha por cima da base, como a impermeabilização por cima da
    planta de arquitetura). Casamento pela imagem inteira (tinta), em pontos da folha já girada. A
    coincidência é a correlação normalizada no melhor deslocamento (1 = desenhos iguais)."""
    import numpy as np
    import pymupdf as fitz

    def tinta(pg):
        pm = pg.get_pixmap(matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csGRAY, annots=False)
        a = 1 - np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width).astype(np.float32) / 255
        return a - a.mean()

    base, outra = tinta(page_base), tinta(page)
    forma = (base.shape[0] + outra.shape[0], base.shape[1] + outra.shape[1])
    c = np.fft.irfft2(np.fft.rfft2(outra, forma) * np.fft.rfft2(base[::-1, ::-1], forma), forma)
    iy, ix = np.unravel_index(np.argmax(c), c.shape)
    oy, ox = iy - (base.shape[0] - 1), ix - (base.shape[1] - 1)
    norma = float(np.sqrt((base * base).sum() * (outra * outra).sum())) or 1.0
    return ox / zoom, oy / zoom, float(c[iy, ix] / norma)


def render_cor(page, clip, escala: float, qualidade: int = 80) -> bytes:
    """Recorte colorido (a legenda de impermeabilização e de piso é por cor), WebP com perda."""
    import io

    import pymupdf as fitz
    from PIL import Image

    pix = page.get_pixmap(matrix=fitz.Matrix(escala, escala), clip=clip, annots=False, colorspace=fitz.csRGB, alpha=False)
    im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    b = io.BytesIO()
    im.save(b, "WEBP", quality=qualidade, method=6)
    return b.getvalue()


# ---------------------------------------------------------------------------
# PDF (precisa de pymupdf, numpy, shapely e pillow; chamado por ambientes.ler_planta)
# ---------------------------------------------------------------------------

def _lista(pranchas) -> list[str]:
    if isinstance(pranchas, str):
        pranchas = [pranchas]
    return list(pranchas or [])


def ler_projeto(cfg: dict, paredes, geometrias: dict[str, object], grupos: dict[str, str], casar,
                base: dict | None = None, *, titulo: str | None = None, sigla: str | None = None,
                cor: bool = True) -> tuple[dict[str, dict], dict]:
    """detalhes de cada ambiente (nome -> detalhe) e o relatório, a partir das pranchas de um projeto.

    geometrias: nome do ambiente -> polígono no modelo (metros); grupos: nome -> "Apto 303" ou "Área comum";
    casar: ambientes.casar_com_a_prancha (passado para não importar ambientes daqui);
    base: {"page", "t", "escala"} da planta de arquitetura do pavimento (para "pela_arquitetura")."""
    import base64

    import pymupdf as fitz
    from shapely.affinity import rotate
    from shapely.geometry import box

    import gerador_fvs as legado
    from estrutura import nome_da_prancha

    titulo = titulo or cfg.get("titulo")
    if not titulo:
        raise ErroModulacao("falta \"titulo\" no projeto")
    sigla = sigla or cfg.get("sigla") or sigla_do_titulo(titulo)
    if not re.fullmatch(r"[A-Za-z0-9]{1,12}", sigla):
        raise ErroModulacao(f"sigla inválida ({sigla}): só letras e números, até 12")
    pranchas = _lista(cfg.get("pranchas"))
    if not pranchas:
        raise ErroModulacao("falta \"pranchas\"")
    fichas = cfg.get("fichas") or None
    if fichas is not None and (not isinstance(fichas, list) or not all(isinstance(f, str) and f for f in fichas)):
        raise ErroModulacao("\"fichas\" tem que ser uma lista de códigos de ficha")
    escala = float(cfg.get("escala") or 50)
    pela_arq = bool(cfg.get("pela_arquitetura"))
    if pela_arq and not base:
        raise ErroModulacao("\"pela_arquitetura\" precisa da planta de arquitetura do pavimento")
    # pela arquitetura com escala diferente ou com giro (a paginação de piso em 1:50 sobre a arquitetura em
    # 1:200): encaixe_entre_pranchas, e cada apartamento conferido na tinta da prancha
    encaixe = pela_arq and (abs(float(base["escala"]) - escala) > 1e-6 or bool(cfg.get("giros")))
    if encaixe:
        minima = float(cfg.get("coincidencia_minima") or COINCIDENCIA_MINIMA_ESCALA)
    else:
        minima = float(cfg.get("coincidencia_minima") or (COINCIDENCIA_MINIMA_ARQ if pela_arq else COINCIDENCIA_MINIMA))
    destaque_minimo = float(cfg.get("destaque_minimo") or DESTAQUE_MINIMO)
    nota_minima = float(cfg.get("nota_minima") if cfg.get("nota_minima") is not None
                        else (NOTA_MINIMA_TINTA if encaixe else NOTA_MINIMA))
    margem_m = float(cfg.get("margem_m") or MARGEM_M)
    so_aptos = aptos_por_prancha(cfg)
    folhas, pt_por_m, paginas, nao_casaram, coincidencias, casamentos, giros = {}, {}, {}, [], {}, {}, {}
    mapas, tintas, destaques = {}, {}, {}
    caixas: dict[str, dict[str, tuple]] = {n: {} for n in geometrias}
    # a prancha de setor pode desenhar a ala do prédio girada (a torre em L numa folha deitada): pelas paredes,
    # o modelo é girado de 90 em 90 graus e vale o giro que casa melhor ("giros": [0] para só o direto)
    if pela_arq and not encaixe:
        angulos = [0]
    else:
        angulos = [int(a) % 360 for a in (cfg.get("giros") or (0, 90, 180, 270))]
    girados = {a: (paredes if a == 0 else rotate(paredes, a, origin=(0, 0))) for a in angulos} if not pela_arq else {}
    for pdf in pranchas:
        page = fitz.open(pdf)[0]
        # "aptos_por_prancha": esta prancha só vale para estes apartamentos (a do 2º ao 5º usada no 6º)
        chaves = [k for k in so_aptos if k in pathlib.Path(pdf).name]
        so = {_unidade(u) for k in chaves for u in so_aptos[k]} if chaves else None
        if encaixe:
            enc = encaixe_entre_pranchas(base["page"], base["escala"], page, escala, angulos)
            coincidencias[pdf] = round(enc["coincidencia"], 3)
            destaques[pdf] = round(min(enc["destaque"], 99.0), 2)
            if enc["coincidencia"] < minima or enc["destaque"] < destaque_minimo:
                nao_casaram.append(nome_da_prancha(pdf))
                continue
            tb = base["t"]

            def mapa(x, y, para=enc["para_outra"], tb=tb):
                return para((x - tb["x0"]) * tb["pt_por_m"] + tb["dx_pt"], (tb["y1"] - y) * tb["pt_por_m"] + tb["dy_pt"])

            folhas[pdf] = (page.rect.width, page.rect.height)
            pt_por_m[pdf] = 1000.0 / escala * 72 / 25.4
            paginas[pdf] = page
            mapas[pdf] = mapa
            tintas[pdf] = tinta_da_prancha(page, pt_por_m[pdf])
            giros[pdf] = enc["giro"]
            for nome, g in geometrias.items():
                if so is not None and _unidade(grupos.get(nome) or "") not in so:
                    continue
                x0, y0, x1, y1 = g.bounds
                cantos = [mapa(x0, y0), mapa(x1, y0), mapa(x0, y1), mapa(x1, y1)]
                caixas[nome][pdf] = caixa_dos_pontos(cantos)
            continue
        if pela_arq:
            dx, dy, coinc = deslocamento_entre_pranchas(base["page"], page)
            t = dict(base["t"])
            t.update(dx_pt=t["dx_pt"] + dx, dy_pt=t["dy_pt"] + dy, coincidencia=coinc)
            t.pop("imagem", None)
            ang = 0
        else:
            t, ang = None, 0
            for a in angulos:
                ta = casar(page, girados[a], escala, com_imagem=True)
                if t is None or ta["coincidencia"] > t["coincidencia"]:
                    t, ang = ta, a
        coincidencias[pdf] = round(t["coincidencia"], 2)
        if t["coincidencia"] < minima:
            nao_casaram.append(nome_da_prancha(pdf))
            continue
        folhas[pdf] = (page.rect.width, page.rect.height)
        pt_por_m[pdf] = t["pt_por_m"]
        paginas[pdf] = page
        casamentos[pdf] = t
        giros[pdf] = ang
        for nome, g in geometrias.items():
            if so is not None and _unidade(grupos.get(nome) or "") not in so:
                continue
            x0, y0, x1, y1 = (g if ang == 0 else rotate(g, ang, origin=(0, 0))).bounds
            caixas[nome][pdf] = ((x0 - t["x0"]) * t["pt_por_m"] + t["dx_pt"], (t["y1"] - y1) * t["pt_por_m"] + t["dy_pt"],
                                 (x1 - t["x0"]) * t["pt_por_m"] + t["dx_pt"], (t["y1"] - y0) * t["pt_por_m"] + t["dy_pt"])

    nota = None
    if encaixe:
        # cada apartamento conferido sozinho: as paredes dele (até 0,20 m fora) têm que cair em cima de desenho
        # da prancha (a prancha de setor tem legenda, carimbo e partes em branco onde o encaixe também põe gente)
        def nota(prancha, nomes):
            gs = [geometrias[n] for n in nomes]
            x0, y0 = min(g.bounds[0] for g in gs), min(g.bounds[1] for g in gs)
            x1, y1 = max(g.bounds[2] for g in gs), max(g.bounds[3] for g in gs)
            perto = paredes.intersection(box(x0 - FOLGA_PAREDE_M, y0 - FOLGA_PAREDE_M, x1 + FOLGA_PAREDE_M, y1 + FOLGA_PAREDE_M))
            img, k = tintas[prancha]
            n = nota_local(img, k, None, perto, para_pt=mapas[prancha])
            return 0.0 if n is None else n
    elif not pela_arq:
        # cada apartamento conferido sozinho: as paredes dele (até 0,20 m fora) têm que bater na prancha
        def nota(prancha, nomes):
            ang = giros[prancha]
            gs = [geometrias[n] if ang == 0 else rotate(geometrias[n], ang, origin=(0, 0)) for n in nomes]
            x0, y0 = min(g.bounds[0] for g in gs), min(g.bounds[1] for g in gs)
            x1, y1 = max(g.bounds[2] for g in gs), max(g.bounds[3] for g in gs)
            perto = girados[ang].intersection(box(x0 - FOLGA_PAREDE_M, y0 - FOLGA_PAREDE_M, x1 + FOLGA_PAREDE_M, y1 + FOLGA_PAREDE_M))
            t = casamentos[prancha]
            n = nota_local(t["imagem"], t["k"], t, perto)
            return 0.0 if n is None else n

    lista = [{"nome": n, "grupo": grupos.get(n), "caixas": caixas[n]} for n in sorted(geometrias)]
    recortes, de_cada, rel = plano_da_modulacao(lista, folhas, pt_por_m, margem_m, sigla, nota, nota_minima)
    if cor:
        px_por_m = float(cfg.get("px_por_m") or PX_POR_M)
        imagens = {chave: render_cor(paginas[r["prancha"]], fitz.Rect(*r["clip"]), px_por_m / pt_por_m[r["prancha"]])
                   for chave, r in recortes.items()}
    else:
        imagens = {chave: base64.b64decode(legado.render(paginas[r["prancha"]], fitz.Rect(*r["clip"]), ESCALA_IMG))
                   for chave, r in recortes.items()}
    rel["titulo"] = titulo
    rel["sigla"] = sigla
    if fichas:
        rel["fichas"] = list(fichas)
    rel["nao_casaram"] = nao_casaram
    rel["coincidencia"] = {nome_da_prancha(p): c for p, c in coincidencias.items()}
    if destaques:
        rel["destaque"] = {nome_da_prancha(p): d for p, d in destaques.items()}
    if any(giros.values()):
        rel["giro"] = {nome_da_prancha(p): g for p, g in giros.items() if g}
    rel["por_prancha"] = {nome_da_prancha(p): n for p, n in rel["por_prancha"].items()}
    rel["kb"] = round(sum(len(v) for v in imagens.values()) / 1024)
    dets = detalhes_dos_ambientes(recortes, de_cada, imagens, nome_da_prancha, titulo, fichas)
    return dets, rel


def ler_modulacao(cfg: dict, paredes, geometrias: dict[str, object], grupos: dict[str, str], casar) -> tuple[dict[str, dict], dict]:
    """detalhes["A"] e o relatório, a partir das pranchas de modulação (o `detalhe` do ambiente, em cinza
    como o detalhe do pilar). O relatório guarda os nomes de antes (com_modulacao, sem_modulacao)."""
    if not _lista(cfg.get("pranchas")):
        raise ErroModulacao("falta \"pranchas\" em \"modulacao\"")
    dets, rel = ler_projeto(cfg, paredes, geometrias, grupos, casar, titulo="Modulação", sigla="M", cor=False)
    rel["com_modulacao"] = rel.pop("com_recorte")
    rel["sem_modulacao"] = rel.pop("sem_recorte")
    for d in dets.values():
        d.pop("fichas", None)  # a modulação é o detalhe do ambiente: aparece em toda ficha
    return dets, rel

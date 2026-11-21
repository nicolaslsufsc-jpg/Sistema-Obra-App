"""Planta de modulação do pavimento: cada parede de alvenaria é um local da FVS (pedido do Nicolas, 20/11/2026,
"super importante"; aprovado pelo Professor).

Até aqui a modulação só entrava no ambiente, como recorte da planta de 1ª fiada (modulacao.py). Agora ela é
uma disciplina própria do pavimento, como a armadura de laje: no servidor, um setor com disciplina "vedacao"
(texto livre: sem migração no setor); no app, a seção "Modulação" no menu do pavimento.

De onde sai cada coisa:
- as paredes: do mesmo IFC de arquitetura dos ambientes. Cada parede do modelo é dividida em camadas
  (reboco, bloco, drywall...); vale a parede que tem camada de bloco ("materiais", padrão ["BLOCO"]: bloco de
  concreto e bloco cerâmico). Drywall, vidro e guarda-corpo ficam de fora. O contorno é o do bloco, com os
  vãos fechados (a porta não corta a parede em duas);
- o apartamento de cada parede: o dos ambientes em volta dela (ambientes.py), pelo que mais encosta. Parede de
  área comum fica "AC". Nome "303-M01", "303-M02"... na ordem de leitura, por apartamento ("AC-M01" na área
  comum). A seção diz comprimento e espessura ("3,45 m · 14 cm");
- o fundo: a prancha de 1ª fiada do pavimento ("prancha" e "escala"), casada com as paredes do modelo como a
  de arquitetura. Sem ela (no tipo da obra piloto as pranchas de 1ª fiada estão bloqueadas), a própria planta
  de arquitetura dos ambientes.

A ficha é a de alvenaria (aplica_a com "M"): 1ª fiada, prumo, nível, amarração, vergas e contravergas... por
parede, sem medida digitada. O tipo "M" em elementos e em fichas_modelo.aplica_a pede a migração
supabase/migrations/20261120200000_nucleo_elementos_m.sql (núcleo, só com o "pode" do Nicolas).

No pavimento.json, dentro de "ambientes":
  "vedacao": true
  ou "vedacao": {"paredes": "area_comum", "prancha": "../Modulacao/*.VD.EX.0xx.*.pdf", "escala": 50, "materiais": ["BLOCO"], "trecho": "Modulação"}
"paredes" diz quais paredes viram local: "todas" (padrão, e o que vale com "vedacao": true), "area_comum" (só
as de área comum: fachada, poços, corredor) ou "apartamentos" (só as de dentro dos apartamentos). É dado da obra:
na obra piloto o Nicolas quis só as de área comum (20/11/2026).
O IFC lido fica guardado ao lado dele (<arquivo>.andar<N>.paredes.json), como o dos ambientes.
"""

from __future__ import annotations

import json
import pathlib
import unicodedata

DISCIPLINA = "vedacao"
TRECHO = "Modulação"
MATERIAIS = ("BLOCO",)
ENCOSTO_M = 0.20  # a parede "encosta" no ambiente que fica a até 20 cm dela
LINHA_M = 1.5  # ordem de leitura: paredes com o centro a menos de 1,5 m na vertical estão na mesma linha
ROTULO_PT = (14, 5)  # meia largura e meia altura do rótulo, em pontos da folha
PAREDES = ("todas", "area_comum", "apartamentos")  # "paredes" em "vedacao": quais viram local


class ErroVedacao(Exception):
    pass


def _sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto or "") if unicodedata.category(c) != "Mn").upper()


def e_de_alvenaria(materiais_da_parede, materiais=MATERIAIS) -> bool:
    """A parede tem alguma camada de bloco ("BLOCO DE CONCRETO", "BLOCO CERÂMICO")? Sem acento, sem caixa."""
    alvos = [_sem_acento(m) for m in materiais]
    return any(a in _sem_acento(m) for m in materiais_da_parede for a in alvos)


def medidas(geom) -> tuple[float, float]:
    """(comprimento, espessura) da parede em metros, pelo menor retângulo que a contém."""
    r = geom.minimum_rotated_rectangle
    pts = list(r.exterior.coords)[:4]
    if len(pts) < 4:
        return 0.0, 0.0
    lados = sorted(((pts[i][0] - pts[i + 1][0]) ** 2 + (pts[i][1] - pts[i + 1][1]) ** 2) ** 0.5 for i in range(2))
    return lados[1], lados[0]


def secao(comprimento: float, espessura: float) -> str:
    """"3,45 m · 14 cm"."""
    return f"{comprimento:.2f}".replace(".", ",") + f" m · {round(espessura * 100):d} cm"


def unidade_da_parede(geom, ambientes_nomeados: list[tuple[str, str, object]]) -> tuple[str, str]:
    """(unidade, grupo) da parede: o do ambiente em que ela mais encosta (a até ENCOSTO_M), somando os cômodos
    do mesmo apartamento. ambientes_nomeados: [(nome "303-05", grupo "Apto 303", polígono)]. Sem ambiente
    perto, ou só área comum: ("AC", "Área comum")."""
    faixa = geom.buffer(ENCOSTO_M)
    soma: dict[tuple[str, str], float] = {}
    for nome, grupo, g in ambientes_nomeados:
        if not faixa.intersects(g):
            continue
        a = faixa.intersection(g).area
        if a > 0:
            u = nome.split("-")[0]
            soma[(u, grupo)] = soma.get((u, grupo), 0.0) + a
    aptos = {k: v for k, v in soma.items() if k[0] != "AC"}
    if not aptos:
        return "AC", "Área comum"
    # empate: o menor número, para o nome não mudar de uma geração para outra
    return max(sorted(aptos), key=lambda k: aptos[k])


def nomear(paredes: list[dict]) -> list[dict]:
    """paredes: [{"unidade", "centro": (x, y) do modelo, ...}]. Devolve a mesma lista, com "nome" ("303-M01"),
    na ordem: apartamento pelo número (área comum no fim), dentro dele de cima para baixo e da esquerda para
    a direita."""
    def ordem_unidade(u: str):
        return (u == "AC", len(u), u)

    por_unidade: dict[str, list[dict]] = {}
    for p in paredes:
        por_unidade.setdefault(p["unidade"], []).append(p)
    saida = []
    for u in sorted(por_unidade, key=ordem_unidade):
        lista = sorted(por_unidade[u], key=lambda p: (-round(p["centro"][1] / LINHA_M), p["centro"][0]))
        for k, p in enumerate(lista, 1):
            saida.append({**p, "nome": f"{u}-M{k:02d}"})
    return saida


def quais_paredes(cfg_vedacao) -> str:
    """O valor de "paredes" em "vedacao" ("todas" se não houver, ou com "vedacao": true)."""
    quais = (cfg_vedacao.get("paredes") if isinstance(cfg_vedacao, dict) else None) or "todas"
    if quais not in PAREDES:
        raise ErroVedacao(f"\"paredes\": \"{quais}\" não existe; use " + ", ".join(f'\"{p}\"' for p in PAREDES))
    return quais


def _entra(unidade: str, quais: str) -> bool:
    if quais == "area_comum":
        return unidade == "AC"
    if quais == "apartamentos":
        return unidade != "AC"
    return True


def pecas_das_paredes(paredes: list[dict], ambientes_nomeados, para_prancha, quais: str = "todas") -> tuple[list[dict], dict]:
    """As paredes do modelo (geometria shapely em metros, em "geom") viram locais "M" da planta, em pontos da
    folha; só as que "quais" pede ("todas", "area_comum", "apartamentos"). Devolve (peças, resumo)."""
    lidas = []
    curtas = 0
    fora = 0
    for p in paredes:
        g = p["geom"]
        comp, esp = medidas(g)
        if comp < 0.10:
            curtas += 1
            continue
        u, grupo = unidade_da_parede(g, ambientes_nomeados)
        if not _entra(u, quais):
            fora += 1
            continue
        c = g.representative_point()
        lidas.append({**p, "unidade": u, "grupo": grupo, "centro": (c.x, c.y), "comprimento": comp, "espessura": esp})
    pecas = []
    for p in nomear(lidas):
        g = p["geom"]
        cx, cy = para_prancha(*p["centro"])
        polys = []
        for parte in getattr(g, "geoms", [g]):
            anel = parte.simplify(0.005).exterior.coords[:-1]
            if len(anel) >= 3:
                polys.append([para_prancha(x, y) for x, y in anel])
        pecas.append({
            "tipo": "M", "nome": p["nome"], "secao": secao(p["comprimento"], p["espessura"]), "grupo": p["grupo"],
            "rotulo": [cx - ROTULO_PT[0], cy - ROTULO_PT[1], cx + ROTULO_PT[0], cy + ROTULO_PT[1]],
            "polys": polys,
        })
    resumo = {
        "paredes": len(pecas),
        "por_apartamento": {u: n for u, n in sorted(_contar(pecas).items(), key=lambda kv: (kv[0] == "AC", len(kv[0]), kv[0]))},
        "metros": round(sum(p["comprimento"] for p in lidas), 1),
        **({"curtas_fora": curtas} if curtas else {}),
        "quais": quais,
        **({"fora_pela_escolha": fora} if fora else {}),
    }
    return pecas, resumo


def _contar(pecas: list[dict]) -> dict[str, int]:
    n: dict[str, int] = {}
    for p in pecas:
        u = p["nome"].split("-")[0]
        n[u] = n.get(u, 0) + 1
    return n


# ---------------------------------------------------------------------------
# IFC e prancha (precisa de ifcopenshell, shapely e pymupdf)
# ---------------------------------------------------------------------------

def paredes_do_ifc(caminho_ifc: str, andar: str, materiais=MATERIAIS) -> list[dict]:
    """As paredes de alvenaria do andar: [{"modelo_id", "tipo" ("Parede-404"), "materiais", "wkt"}], em metros.
    O contorno é a união das camadas de bloco da parede, com os vãos fechados."""
    import ifcopenshell
    import ifcopenshell.geom
    import shapely
    from shapely.geometry import Polygon
    from shapely.ops import unary_union

    f = ifcopenshell.open(caminho_ifc)
    contido = {}
    for r in f.by_type("IfcRelContainedInSpatialStructure"):
        for e in r.RelatedElements:
            contido[e.id()] = r.RelatingStructure
    andares = [s for s in f.by_type("IfcBuildingStorey") if (s.Name or "").strip().startswith(andar)]
    if len(andares) != 1:
        raise ErroVedacao(f"andar \"{andar}\" não encontrado no IFC (ou há mais de um)")
    st = andares[0]
    cota = (st.Elevation or 0) / 1000.0
    ajustes = ifcopenshell.geom.settings()
    ajustes.set("use-world-coords", True)
    ajustes.set("disable-opening-subtractions", True)

    camadas: dict[int, list] = {}
    for e in f.by_type("IfcBuildingElementPart"):
        if not e.Decomposes:
            continue
        pai = e.Decomposes[0].RelatingObject
        if contido.get(pai.id()) == st:
            camadas.setdefault(pai.id(), []).append(e)
    saida = []
    for pid, partes in camadas.items():
        nomes = [p.Name or "" for p in partes]
        if not e_de_alvenaria(nomes, materiais):
            continue
        tris, zs = [], []
        for p in partes:
            if not e_de_alvenaria([p.Name or ""], materiais):
                continue
            try:
                sh = ifcopenshell.geom.create_shape(ajustes, p)
            except Exception:
                continue
            v, fa = sh.geometry.verts, sh.geometry.faces
            xs, ys = v[0::3], v[1::3]
            zs += list(v[2::3])
            for i in range(0, len(fa), 3):
                a, b, c = fa[i], fa[i + 1], fa[i + 2]
                t = Polygon([(xs[a], ys[a]), (xs[b], ys[b]), (xs[c], ys[c])])
                if t.area > 1e-7:
                    tris.append(t)
        # só o que passa a 1 m do piso ou tem mais de 1,5 m de altura (parede, não peitoril solto)
        if not tris or not (min(zs) <= cota + 1.0 <= max(zs) or max(zs) - min(zs) > 1.5):
            continue
        g = unary_union(tris).buffer(0.005).buffer(-0.005)
        if g.is_empty:
            continue
        pai = f.by_id(pid)
        saida.append({"modelo_id": pai.GlobalId, "tipo": (pai.Name or "").strip(), "materiais": sorted(set(n for n in nomes if n)),
                      "wkt": shapely.to_wkt(g, rounding_precision=3)})
    if not saida:
        raise ErroVedacao(f"nenhuma parede de alvenaria no andar {st.Name} (camadas com {', '.join(materiais)})")
    return saida


def paredes_com_guarda(caminho_ifc: str, andar: str, materiais=MATERIAIS) -> list[dict]:
    """paredes_do_ifc guardando o resultado ao lado do IFC (reaproveita se o IFC e os materiais não mudaram)."""
    ifc = pathlib.Path(caminho_ifc)
    guarda = ifc.with_name(f"{ifc.name}.andar{andar}.paredes.json")
    chave = sorted(materiais)
    if guarda.exists() and guarda.stat().st_mtime >= ifc.stat().st_mtime:
        d = json.loads(guarda.read_text(encoding="utf-8"))
        if d.get("materiais") == chave:
            return d["paredes"]
    print(f"Lendo as paredes de alvenaria do andar {andar} do IFC (alguns minutos)...")
    paredes = paredes_do_ifc(str(ifc), andar, materiais)
    guarda.write_text(json.dumps({"materiais": chave, "paredes": paredes}), encoding="utf-8")
    return paredes


def ler_planta(cfg_amb: dict, base: dict) -> dict:
    """Planta de modulação no formato de estrutura.ler_forma (para publicar_planta.montar_trecho).
    cfg_amb: "ambientes" do pavimento.json; base: ambientes.base_da_planta(cfg_amb)."""
    import base64

    import pymupdf as fitz
    from shapely import wkt

    import ambientes as mod_amb
    import gerador_fvs as legado
    from estrutura import nome_da_prancha, revisao_da_prancha

    cfg = cfg_amb.get("vedacao")
    cfg = cfg if isinstance(cfg, dict) else {}
    materiais = tuple(cfg.get("materiais") or MATERIAIS)
    paredes = [{**p, "geom": wkt.loads(p["wkt"])} for p in paredes_com_guarda(cfg_amb["ifc"], str(cfg_amb["andar"]), materiais)]
    nomeados = [(a["nome"], a["grupo"], base["ambientes"][a["indice"]]) for a in base["nomeados"]]
    # fundo: a prancha de 1ª fiada, se houver; senão, a de arquitetura (já casada nos ambientes)
    if cfg.get("prancha"):
        caminho = cfg["prancha"]
        page = fitz.open(caminho)[0]
        escala = float(cfg.get("escala") or 50)
        t = mod_amb.casar_com_a_prancha(page, base["paredes"], escala)
        if t["coincidencia"] < 0.2:
            raise ErroVedacao(f"o modelo não casou com a prancha de modulação (coincidência {t['coincidencia']:.0%}). "
                              f"Confira a escala ({escala:.0f}) e se a prancha é do pavimento inteiro.")

        def para_prancha(x, y):
            return [round((x - t["x0"]) * t["pt_por_m"] + t["dx_pt"], 2), round((t["y1"] - y) * t["pt_por_m"] + t["dy_pt"], 2)]
        fundo = "modulação"
    else:
        caminho, page, t, para_prancha = cfg_amb["prancha"], base["page"], base["t"], base["para_prancha"]
        fundo = "arquitetura"
    quais = quais_paredes(cfg)
    pecas, resumo = pecas_das_paredes(paredes, nomeados, para_prancha, quais)
    if not pecas:
        raise ErroVedacao(f"nenhuma parede de alvenaria com \"paredes\": \"{quais}\" neste pavimento "
                          f"({resumo.get('fora_pela_escolha', 0)} ficaram fora pela escolha). Confira \"paredes\" em \"vedacao\".")
    prancha = nome_da_prancha(caminho)
    return {
        "trecho": cfg.get("trecho") or TRECHO, "disciplina": DISCIPLINA,
        "prancha": prancha, "revisao": revisao_da_prancha(prancha),
        "largura": page.rect.width, "altura": page.rect.height, "tile": legado.TILE, "niveis": list(legado.NIVEIS),
        "tiles": {k: base64.b64decode(v) for k, v in legado.tiles_da_forma(page).items()},
        "pecas": pecas,
        "resumo": {**resumo, "fundo": fundo, "coincidencia": round(t["coincidencia"], 2), "materiais": list(materiais)},
    }

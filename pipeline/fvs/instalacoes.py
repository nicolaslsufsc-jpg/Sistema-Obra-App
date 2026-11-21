"""Pontos de instalações (frente INSTALAÇÕES, 20/11/2026): ralos, caixas e pontos de água do modelo IFC de
cada disciplina, numa planta própria do pavimento, como a armadura de laje (armadura_laje.py).

Escolha provisória (aprovada pelo Professor como suposição; a final é do Nicolas): o ponto NÃO é peça em
"elementos". Vai no pacote da planta como sobreposição ("pontos", como as "barras"), com id fixo calculado
da disciplina e do id do objeto no modelo. A ficha (PVS 010.x, lote por ambiente) fica no ambiente; o ponto
conferido alimenta o item dela. Alternativa, se o Nicolas preferir: tipo de peça novo "I" em elementos
(precisa de migração do núcleo).

Cada disciplina vira um setor do pavimento (disciplina "hidro" ou "sanitario" em setores: texto livre, sem
migração), com o fundo da folha de forma e só os pontos daquela disciplina.

Encaixe (modelo -> folha): o mesmo dos furos do pavimento ("furos" no pavimento.json), ou "encaixe" à mão.
Suposição: os modelos de hidráulica e de sanitário estão nas mesmas coordenadas do modelo de furação (os
três saem do Revit do mesmo projeto). Conferir na tela: os pontos têm que cair dentro do contorno da laje.

Classificação dos pontos (suposição, ajustar com o IFC real): pela classe IFC e pelo nome do objeto.

Elétrico e SPDA (20/11/2026, pedido do Professor): mesmo padrão. Elétrico = caixas na laje (PES 009.4: caixa
de passagem, caixa octogonal do ponto de luz) e quadros (PVS 009.x). SPDA = captores (PVS 009.2.1), descidas e
caixas de inspeção (PVS 009.2.2), hastes de aterramento. Sem os IFC reais, a classificação é SUPOSIÇÃO: nomes
usuais do Revit em português e as classes IFC de elétrica. O eletroduto é linha, não ponto: fica fora (a
decidir se entra como linha, como as barras). A descida do SPDA, vertical, aparece na planta como ponto.

Eletroduto como linha (21/11/2026, decisão do Nicolas: "eletroduto como linha"): no elétrico, o trecho de
eletroduto entra na mesma planta dos pontos, com "linha" (começo e fim na folha) além de "ponto" (o meio dele).
O toque e o registro são os do ponto (barra_id). A linha sai do eixo do objeto ("Axis", IfcPolyline) ou do
sólido extrudado do corpo ("Body", IfcExtrudedAreaSolid). Trecho vertical (menos de 5 cm na planta) fica fora:
na planta ele é um ponto, e a caixa de passagem já marca o lugar.
"""

from __future__ import annotations

import re
import unicodedata
import uuid

# Disciplina -> nome do setor no app. A ordem é a do menu.
DISCIPLINAS = {
    "hidro": "Água fria e quente",
    "sanitario": "Esgoto e pluvial",
    "eletrico": "Caixas, quadros e eletrodutos",
    "spda": "Captores e descidas",
}

# Tipo de ponto -> nome para a pessoa
TIPOS_DE_PONTO = {
    "ponto_agua": "Ponto de água",
    "registro": "Registro",
    "hidrometro": "Hidrômetro",
    "ralo": "Ralo",
    "caixa_sifonada": "Caixa sifonada",
    "caixa": "Caixa",
    "ponto_esgoto": "Ponto de esgoto",
    "caixa_passagem": "Caixa de passagem",
    "ponto_luz": "Ponto de luz",
    "quadro": "Quadro",
    "captor": "Captor",
    "descida": "Descida",
    "caixa_inspecao": "Caixa de inspeção",
    "haste": "Haste de aterramento",
    "eletroduto": "Eletroduto",
}
# Tipos que vão na planta como linha (com "linha" além de "ponto").
TIPOS_DE_LINHA = ("eletroduto",)
# Trecho mais curto que isto na planta (cm) é vertical: fica fora (ver acima).
LINHA_MINIMA_CM = 5.0

# Namespace fixo dos ids dos pontos (uuid5): o mesmo objeto do modelo, na mesma obra e pavimento, dá o mesmo id
# em toda geração (id_do_ponto).
_NS = uuid.UUID("6f1d3c2a-9b7e-4c51-8a40-1e2f3a4b5c6d")

# Classes IFC que podem ser ponto (as que o Revit usa para aparelhos, ralos, registros e conexões).
CLASSES = ("IfcSanitaryTerminal", "IfcWasteTerminal", "IfcValve", "IfcFlowTerminal", "IfcFlowController",
           "IfcDistributionChamberElement", "IfcFlowMeter", "IfcBuildingElementProxy", "IfcFurnishingElement",
           # elétrica e SPDA (IFC4 e IFC2x3; suposição até ver os IFC reais)
           "IfcJunctionBox", "IfcElectricDistributionBoard", "IfcElectricDistributionPoint", "IfcLightFixture",
           "IfcOutlet", "IfcFlowFitting", "IfcProtectiveDevice", "IfcCableSegment", "IfcCableCarrierSegment",
           "IfcFlowSegment", "IfcDiscreteAccessory", "IfcMember")
# Trecho de tubo, cabo ou eletroduto: só serve como ponto na descida do SPDA (vertical: na planta, um ponto).
SEGMENTOS = ("IfcCableSegment", "IfcCableCarrierSegment", "IfcFlowSegment", "IfcMember")
# conexões (joelho, tê, luva, adaptador): não são ponto de conferência em disciplina nenhuma
CONEXOES = ("IfcFlowFitting", "IfcPipeFitting", "IfcDuctFitting", "IfcCableCarrierFitting", "IfcCableFitting")


class ErroInstalacoes(Exception):
    pass


def _sem_acento(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    return re.sub(r"\s+", " ", "".join(c for c in s if not unicodedata.combining(c)).upper()).strip()


def classificar(disciplina: str, classe: str, nome: str) -> str | None:
    """O tipo do ponto (chave de TIPOS_DE_PONTO), ou None se o objeto não é ponto desta disciplina."""
    # o Revit põe prefixo com sublinhado (HID_, SAN_): vira espaço para o \b das buscas funcionar
    n = re.sub(r"_+", " ", _sem_acento(nome)).strip()
    if classe in CONEXOES:
        return None
    if disciplina == "eletrico" and classe in SEGMENTOS:
        if re.search(r"ELETROCALHA|\bLEITO\b|PERFILADO|\bCABO\b", n):
            return None
        if re.search(r"ELETRODUTO|CONDUITE|CONDUIT", n) or classe == "IfcCableCarrierSegment":
            return "eletroduto"
        return None
    if classe in SEGMENTOS and disciplina != "spda":
        return None
    if disciplina == "eletrico":
        if re.search(r"\bQUADRO\b|\bQGBT\b|\bQD[A-Z]*\d*\b|\bCD\b", n) or classe in (
                "IfcElectricDistributionBoard", "IfcElectricDistributionPoint"):
            return "quadro"
        if re.search(r"LUMINARIA|PONTO DE LUZ|OCTOGONAL", n) or classe == "IfcLightFixture":
            return "ponto_luz"
        if re.search(r"\bC(AI)?XA?\b.*(PASSAGEM|4 ?X ?[24]|ELETRIC)|\bCAIXA DE PASSAGEM\b", n) or classe == "IfcJunctionBox":
            return "caixa_passagem"
        # Revit (21/11): a caixa 4x2/4x4 da tomada de teto ou de piso fica na laje
        if re.search(r"TOMADAS? DE (TETO|PISO)", n):
            return "caixa_passagem"
        return None
    if disciplina == "spda":
        if re.search(r"CAPTOR|FRANKLIN|TERMINAL AEREO|MASTRO", n):
            return "captor"
        if re.search(r"C(AI)?XA?\.? ?(DE )?INSP|EQUALIZ|\bBEP\b", n):
            return "caixa_inspecao"
        if re.search(r"\bHASTE\b|ATERRAMENTO", n):
            return "haste"
        if "DESCIDA" in n:
            return "descida"
        return None
    if disciplina == "sanitario":
        # acessório da caixa (prolongamento) e nicho de parede não são ponto
        if re.search(r"PROLONGAMENTO|\bNICHO\b", n):
            return None
        if "RALO" in n or classe == "IfcWasteTerminal":
            return "ralo"
        if re.search(r"\bC(AI)?XA?\.? ?SIF", n):
            return "caixa_sifonada"
        if re.search(r"\bCAIXA\b|\bCX\b", n) or classe == "IfcDistributionChamberElement":
            return "caixa"
        if classe == "IfcSanitaryTerminal":
            return "ponto_esgoto"  # vaso, lavatório, pia: a saída de esgoto do aparelho
        return None
    if disciplina == "hidro":
        if "HIDROMETRO" in n or classe == "IfcFlowMeter":
            return "hidrometro"
        # peça de barrilete e de incêndio no meio do tubo: não é ponto do ambiente
        if re.search(r"\bPCI\b|FLANGE|FILTRO|VENTOSA", n):
            return None
        if re.search(r"REGISTRO|VALVULA", n) or classe == "IfcValve":
            return "registro"
        if re.search(r"MISTURADOR|DUCHA|CHUVEIRO|TORNEIRA", n):
            return "ponto_agua"
        if classe in ("IfcSanitaryTerminal", "IfcFlowTerminal") or re.search(r"\bPONTO\b|\bSAIDA\b", n):
            return "ponto_agua"
        return None
    raise ErroInstalacoes(f"disciplina desconhecida: {disciplina} (use {', '.join(DISCIPLINAS)})")


def id_do_ponto(obra: str, pavimento: str, disciplina: str, modelo_id: str) -> str:
    """Id do ponto (vai em fvs_eventos.barra_id). Leva a planta: obra, pavimento e disciplina (uma planta por
    disciplina no pavimento). Assim o mesmo IFC usado em dois pavimentos ou em duas obras não repete id, e o id
    não muda ao republicar (o planta_id do servidor muda a cada publicação; obra e pavimento, não)."""
    return str(uuid.uuid5(_NS, f"{obra.strip().upper()}|{pavimento.strip()}|{disciplina}|{modelo_id}"))


def _nivel_do(elemento, psets: dict) -> str:
    """O nível do objeto: o pavimento (IfcBuildingStorey) que o contém; senão o "Level" das propriedades."""
    import ifcopenshell.util.element as ue

    cont = ue.get_container(elemento)
    if cont is not None and cont.is_a("IfcBuildingStorey") and cont.Name:
        return cont.Name
    for grupo in ("Constraints", "Restrições"):
        g = psets.get(grupo) or {}
        for chave in ("Level", "Reference Level", "Nível", "Nível de referência"):
            if g.get(chave):
                return str(g[chave])
    return ""


def _posicao(p):
    """Matriz 4x4 do IfcAxis2Placement3D. Feita aqui porque o ifcopenshell dá NaN quando o eixo (Axis) é
    paralelo à direção de referência padrão (tubo que corre em x, sem RefDirection)."""
    import numpy as np

    mat = np.eye(4)
    if p is None:
        return mat
    z = np.array(p.Axis.DirectionRatios if getattr(p, "Axis", None) else (0.0, 0.0, 1.0), dtype=float)
    z /= np.linalg.norm(z) or 1.0
    x = np.array(p.RefDirection.DirectionRatios if getattr(p, "RefDirection", None) else (1.0, 0.0, 0.0), dtype=float)
    x = x - x.dot(z) * z
    if np.linalg.norm(x) < 1e-9:  # referência paralela ao eixo: qualquer perpendicular serve (o tubo é redondo)
        x = np.array((0.0, 1.0, 0.0)) - z[1] * z
        if np.linalg.norm(x) < 1e-9:
            x = np.array((0.0, 0.0, 1.0)) - z[2] * z
    x /= np.linalg.norm(x)
    mat[:3, 0], mat[:3, 1], mat[:3, 2] = x, np.cross(z, x), z
    loc = list(p.Location.Coordinates) + [0.0] * (3 - len(p.Location.Coordinates))
    mat[:3, 3] = loc
    return mat


def _linha_do_segmento(el, m, cm_por_unidade: float) -> list[list[float]] | None:
    """Começo e fim do trecho na planta (cm): pelo eixo ("Axis", IfcPolyline) ou pelo sólido extrudado do
    corpo (IfcExtrudedAreaSolid). None se não achar ou se o trecho é vertical."""
    import numpy as np

    def plano(v):
        return [float(v[0]) * cm_por_unidade, float(v[1]) * cm_por_unidade]

    linha = None
    for r in (el.Representation.Representations if el.Representation else ()):
        for it in r.Items:
            if r.RepresentationIdentifier == "Axis" and it.is_a("IfcPolyline") and len(it.Points) >= 2:
                pts = [list(p.Coordinates) + [0.0] * (3 - len(p.Coordinates)) for p in it.Points]
                linha = [plano(m @ np.array([*pts[0], 1.0])), plano(m @ np.array([*pts[-1], 1.0]))]
                break
            if it.is_a("IfcExtrudedAreaSolid") and it.Depth:
                pos = _posicao(it.Position)
                d = np.array(list(it.ExtrudedDirection.DirectionRatios), dtype=float)
                d = d / (np.linalg.norm(d) or 1.0) * float(it.Depth)
                linha = [plano(m @ pos @ np.array([0.0, 0.0, 0.0, 1.0])), plano(m @ pos @ np.array([*d, 1.0]))]
        if linha:
            break
    if not linha or ((linha[1][0] - linha[0][0]) ** 2 + (linha[1][1] - linha[0][1]) ** 2) ** 0.5 < LINHA_MINIMA_CM:
        return None
    return linha


# Faixa de altura do pavimento: de um pouco abaixo do piso (ralo, caixa sifonada sob a laje) até o pavimento de cima.
ABAIXO_DO_PISO_CM = 150.0
SEM_PAVIMENTO_ACIMA_CM = 400.0
# Elétrico: só o que fica na laje do pavimento (embutido), de 50 cm abaixo do nível até 20 cm acima. No IFC
# real, o eletroduto do teto do andar de baixo fica 36 cm abaixo do nível de cima e a caixa da tomada de
# teto, no nível: são da laje deste pavimento, mesmo contidos no nível de baixo (suposição de 21/11: embutido
# na laje, e não no forro; a confirmar com o Nicolas).
LAJE_ABAIXO_CM = 50.0
LAJE_ACIMA_CM = 20.0


def _faixa_de_altura(f, niveis: list[str], cm_por_unidade: float) -> tuple[float, float, float] | None:
    """(z mínimo, z máximo, z do piso) em cm do pavimento pedido, ou None se o arquivo não tem esse nível.

    O nome do nível não basta: no Revit, o modelo do pavimento tipo vinculado no 2º, 3º... 6º chega no IFC com
    cinco IfcBuildingStorey de mesmo nome ("2° PAVIMENTO"), cada um na altura real do andar (piloto do 2º,
    21/11). O pavimento certo é o mais baixo dos de mesmo nome; a faixa vai até o próximo nível acima. Com a
    faixa, o objeto entra se o nível que o contém está na altura do piso, seja qual for o nome dele (o 3º do
    tipo vinculado vem num nível chamado "2° PAVIMENTO", na altura do 3º), e se ele mesmo está na faixa."""
    import ifcopenshell.util.placement as up
    from furos import mesmo_nivel

    def z(s):
        return float(up.get_local_placement(s.ObjectPlacement)[2, 3]) * cm_por_unidade

    andares = [s for s in f.by_type("IfcBuildingStorey") if s.ObjectPlacement]
    alvo = [z(s) for s in andares if any(mesmo_nivel(s.Name or "", n) for n in niveis)]
    if not alvo:
        return None
    z0 = min(alvo)
    acima = sorted(z(s) for s in andares if z(s) > z0 + 50.0)
    return z0 - ABAIXO_DO_PISO_CM, acima[0] if acima else z0 + SEM_PAVIMENTO_ACIMA_CM, z0


def ler_ifc(caminho: str, niveis: list[str], disciplina: str) -> list[dict]:
    """Os pontos da disciplina no modelo, nos níveis pedidos: [{modelo_id, tipo, nome, x, y}] (x, y em cm).
    O eletroduto vem com "linha" ([[x, y], [x, y]] em cm) e x, y no meio dele."""
    try:
        import ifcopenshell
        import ifcopenshell.util.element as ue
        import ifcopenshell.util.placement as up
        import ifcopenshell.util.unit as uu
    except ImportError as e:  # pragma: no cover - depende do PC
        raise ErroInstalacoes("falta o ifcopenshell (pip install ifcopenshell)") from e
    from furos import mesmo_nivel

    f = ifcopenshell.open(caminho)
    cm_por_unidade = uu.calculate_unit_scale(f) * 100.0
    faixa = _faixa_de_altura(f, niveis, cm_por_unidade)
    vistos: set[str] = set()
    # o mesmo modelo vinculado mais de uma vez no mesmo lugar: o objeto igual na mesma posição entra uma vez;
    # o Tag repetido em outra posição (outra cópia) usa o GlobalId, para o id do ponto não se repetir
    lugares: set[tuple] = set()
    tags: set[str] = set()
    saida = []
    for classe in CLASSES:
        try:
            objetos = f.by_type(classe)
        except RuntimeError:  # classe que não existe no esquema do arquivo (IFC2x3 x IFC4)
            continue
        for el in objetos:
            if el.GlobalId in vistos or not el.ObjectPlacement:
                continue
            vistos.add(el.GlobalId)
            tipo = classificar(disciplina, el.is_a(), f"{el.Name or ''} {el.ObjectType or ''}")
            if not tipo:
                continue
            if not faixa and not any(mesmo_nivel(_nivel_do(el, ue.get_psets(el)), n) for n in niveis):
                continue
            m = up.get_local_placement(el.ObjectPlacement)
            if faixa and disciplina == "eletrico":
                if not faixa[2] - LAJE_ABAIXO_CM <= float(m[2, 3]) * cm_por_unidade <= faixa[2] + LAJE_ACIMA_CM:
                    continue  # fora da laje deste pavimento
            elif faixa:
                if not faixa[0] <= float(m[2, 3]) * cm_por_unidade < faixa[1]:
                    continue  # de outro pavimento
                cont = ue.get_container(el)
                if cont is not None and cont.is_a("IfcBuildingStorey") and cont.ObjectPlacement and abs(
                        float(up.get_local_placement(cont.ObjectPlacement)[2, 3]) * cm_por_unidade - faixa[2]) > 50.0:
                    continue  # num nível de outra altura: é do andar de baixo ou de cima (forro, cópia vinculada)
            item = {"modelo_id": str(el.Tag or el.GlobalId), "tipo": tipo, "nome": (el.Name or "").split(":")[0].strip(),
                    "x": float(m[0, 3]) * cm_por_unidade, "y": float(m[1, 3]) * cm_por_unidade}
            if tipo in TIPOS_DE_LINHA:
                linha = _linha_do_segmento(el, m, cm_por_unidade)
                if not linha:
                    continue
                item.update({"linha": linha, "x": (linha[0][0] + linha[1][0]) / 2, "y": (linha[0][1] + linha[1][1]) / 2})
            lugar = (tipo, round(float(m[2, 3]) * cm_por_unidade), *(round(c) for p in item.get("linha") or [[item["x"], item["y"]]] for c in p))
            if lugar in lugares:
                continue
            lugares.add(lugar)
            if item["modelo_id"] in tags:
                item["modelo_id"] = str(el.GlobalId)
            tags.add(item["modelo_id"])
            saida.append(item)
    return saida


def pontos_na_folha(pontos: list[dict], enc: dict, disciplina: str, largura: float, altura: float,
                    obra: str, pavimento: str) -> tuple[dict, list[dict]]:
    """Pontos do modelo na folha pelo encaixe. Devolve ({id: ponto do pacote}, fora da folha)."""
    from furos import transformar

    dentro: dict[str, dict] = {}
    fora = []
    def na_folha(x, y):
        return 0 <= x <= largura and 0 <= y <= altura

    for p in pontos:
        x, y = transformar(enc, p["x"], p["y"])
        linha = [list(transformar(enc, a, b)) for a, b in p["linha"]] if p.get("linha") else None
        # a linha entra se alguma ponta (ou o meio) cai na folha
        if not (na_folha(x, y) or (linha and any(na_folha(a, b) for a, b in linha))):
            fora.append({"modelo_id": p["modelo_id"], "tipo": p["tipo"], "nome": p["nome"]})
            continue
        reg = {"disciplina": disciplina, "tipo": p["tipo"], "ponto": [round(x, 2), round(y, 2)],
               "nome": p["nome"] or TIPOS_DE_PONTO[p["tipo"]], "modelo_id": p["modelo_id"]}
        if linha:
            reg["linha"] = [[round(a, 2), round(b, 2)] for a, b in linha]
        dentro[id_do_ponto(obra, pavimento, disciplina, p["modelo_id"])] = reg
    return dentro, fora


def folha_da_disciplina(forma: dict, disciplina: str, pontos: dict) -> dict:
    """A planta da disciplina: o fundo da folha de forma, sem peças, com os pontos (formato de folha_unica)."""
    return {
        "prancha": forma["prancha"],
        "revisao": forma["revisao"],
        "largura": forma["largura"],
        "altura": forma["altura"],
        "tile": forma["tile"],
        "niveis": forma["niveis"],
        "tiles": forma["tiles"],
        "pecas": [],
        "trecho": DISCIPLINAS[disciplina],
        "disciplina": disciplina,
        "pontos": pontos,
    }


def resumo(pontos: dict, fora: list[dict]) -> dict:
    por_tipo: dict[str, int] = {}
    for p in pontos.values():
        por_tipo[p["tipo"]] = por_tipo.get(p["tipo"], 0) + 1
    return {"pontos": len(pontos), "por_tipo": dict(sorted(por_tipo.items())), "fora_da_folha": fora}

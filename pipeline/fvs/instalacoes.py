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
    "preventivo": "Preventivo",
    "spda": "SPDA",
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
    "conector": "Conector de aterramento",
    "eletroduto": "Eletroduto",
    "hidrante": "Hidrante",
    "extintor": "Extintor",
    "sprinkler": "Sprinkler",
    "detector": "Detector",
    "iluminacao_emergencia": "Iluminação de emergência",
    "alarme": "Alarme",
    "sinalizacao": "Sinalização",
    # 5.1 a 5.3 da lista de conferências (23/11): tubo suspenso (linha), coluna/prumada (tubo vertical, ponto)
    # e caixa de tomada ou interruptor na parede
    "tubo": "Tubo",
    "coluna": "Coluna (prumada)",
    "caixa_parede": "Caixa de parede",
}
# Tipos que vão na planta como linha (com "linha" além de "ponto").
TIPOS_DE_LINHA = ("eletroduto", "tubo")
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
           "IfcFlowSegment", "IfcDiscreteAccessory", "IfcMember",
           # preventivo (23/11): detector, sirene e acionador vêm como IfcDistributionControlElement no IFC2x3
           "IfcDistributionControlElement", "IfcAlarm", "IfcSensor", "IfcFireSuppressionTerminal")
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
    if classe in CONEXOES and disciplina != "spda":
        return None
    if disciplina == "eletrico" and classe in SEGMENTOS:
        if re.search(r"ELETROCALHA|\bLEITO\b|PERFILADO|\bCABO\b", n):
            return None
        if re.search(r"ELETRODUTO|CONDUITE|CONDUIT", n) or classe == "IfcCableCarrierSegment":
            return "eletroduto"
        return None
    if disciplina in ("hidro", "sanitario") and classe in SEGMENTOS:
        # 5.1 (23/11): o tubo de água ou de esgoto. Em pé vira coluna (prumada, um ponto); deitado, linha (ler_ifc)
        return "tubo_segmento" if re.search(r"\bPIPE\b|\bTUBO|TUBULA|\bPVC\b|\bPPR\b|\bCPVC\b", n) else None
    if classe in SEGMENTOS and disciplina != "spda":
        return None
    if disciplina == "eletrico":
        if re.search(r"\bQUADRO\b|\bQGBT\b|\bQD[A-Z]*\d*\b|\bCD\b", n) or classe in (
                "IfcElectricDistributionBoard", "IfcElectricDistributionPoint"):
            return "quadro"
        if re.search(r"LUMINARIA|PONTO DE LUZ|OCTOGONAL", n) or classe == "IfcLightFixture":
            return "ponto_luz"
        # 25/11 (decisão do Professor, regra do Nicolas: a caixa de parede fica na ficha de parede): a "Caixa de
        # Passagem na Parede" do Revit é caixa de parede (alvenaria ou drywall), não caixa de passagem da laje
        if re.search(r"PASSAGEM NA PAREDE", n):
            return "caixa_parede"
        if re.search(r"\bC(AI)?XA?\b.*(PASSAGEM|4 ?X ?[24]|ELETRIC)|\bCAIXA DE PASSAGEM\b", n) or classe == "IfcJunctionBox":
            return "caixa_passagem"
        # Revit (21/11): a caixa 4x2/4x4 da tomada de teto ou de piso fica na laje
        if re.search(r"TOMADAS? DE (TETO|PISO)", n):
            return "caixa_passagem"
        # 24/11 (achado do 10): o "módulo ... não listável" é parte do conjunto, no mesmo lugar dele; sai, e
        # fica só o conjunto como a caixa (no 2º: de 2440 caixas, 509 grupos empilhados, para 1396 e nenhum)
        if re.search(r"N[AÃ]O LISTAV", n):
            return None
        # 5.3 (23/11): a caixa da tomada ou do interruptor na parede (alvenaria ou drywall)
        if re.search(r"\bTOMADA|INTERRUPTOR|PULSADOR|\bDIMMER\b", n):
            return "caixa_parede"
        return None
    if disciplina == "spda":
        if classe in CONEXOES:
            # IFC real (22/11): das conexões do SPDA, só o conector embutido no pilar (ATERRINSERT) e o da malha
            # (Minigar) são ponto; curvas, barras, terminais, clips e parafusos ficam fora
            return "conector" if re.search(r"ATERRINSERT|MINIGAR", n) else None
        if classe in SEGMENTOS and re.search(r"CONDUIT|ELETRODUTO|BARRA REDONDA", n) and "DESCIDA" not in n:
            return "descida_vertical"  # só o trecho vertical é descida (ler_ifc confere); o horizontal fica fora
        if re.search(r"CAPTOR|FRANKLIN|TERMINAL AEREO|MASTRO", n):
            return "captor"
        if re.search(r"C(AI)?XA?\.? ?(DE )?INSP|EQUALIZ|EQUIPOTENCIAL|\bBEP\d*\b", n):  # IFC real: "...Equipotencial - BEP1"
            return "caixa_inspecao"
        if re.search(r"\bHASTE\b|ATERRAMENTO", n):
            return "haste"
        if "DESCIDA" in n:
            return "descida"
        return None
    if disciplina == "preventivo":
        # IFC real do preventivo (23/11): o mesmo modelo traz o gás (medidor, aquecedor, cilindro, registro): fica fora.
        # Sem PES nem PVS: a planta é só para conferir no local. A tubulação fica fora por enquanto.
        if re.search(r"\bPLACA\b|SINALIZ|FOTOLUMINESCENTE", n):
            return "sinalizacao"
        # o nome vem junto do ObjectType: a mangueira é peça do abrigo do hidrante (o hidrante já conta)
        if n.startswith("PCI MANGUEIRA"):
            return None
        if "HIDRANTE" in n:  # "HIDRANTE TAMPA VIDRO - 30 m": antes da regra do vidro
            return "hidrante"
        if re.search(r"\bGAS\b|AQUECEDOR|CHAMINE|MEDIDOR|CILINDRO|INTERFONE|GRELHA|\bVIDRO\b", n):
            return None
        if "EXTINTOR" in n:
            return "extintor"
        if re.search(r"SPRINKLER|CHUVEIRO AUTOMATICO|BICO DE SPRINKLER", n):
            return "sprinkler"
        if "DETECTOR" in n:
            return "detector"
        if re.search(r"EMERGENCIA|AUTONOMAS? COM FAROIS|BLOCO AUTONOMO", n):
            return "iluminacao_emergencia"
        if re.search(r"SIRENE|ACIONADOR|ALARME|BOTOEIRA", n):
            return "alarme"
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


DESCIDA_MINIMA_CM = 50.0  # trecho com menos altura que isto não é descida
# 5.1 (23/11): a coluna (prumada) é o tubo em pé que, somando os trechos no mesmo lugar, tem pelo menos isto de
# altura no pavimento. O trecho curto em pé é a descida até o aparelho, na parede (5.2): fica fora.
COLUNA_MINIMA_CM = 250.0


def _vertical(el, m, cm_por_unidade: float, com_altura: bool = False) -> tuple | None:
    """(x, y) em cm do trecho que sobe (corpo extrudado com mais de DESCIDA_MINIMA_CM de altura e quase nada na
    planta); None se não sobe. com_altura: (x, y, z de baixo, z de cima)."""
    import numpy as np

    for r in (el.Representation.Representations if el.Representation else ()):
        for it in r.Items:
            if it.is_a("IfcExtrudedAreaSolid") and it.Depth:
                pos = _posicao(it.Position)
                d = np.array(list(it.ExtrudedDirection.DirectionRatios), dtype=float)
                d = d / (np.linalg.norm(d) or 1.0) * float(it.Depth)
                a = m @ pos @ np.array([0.0, 0.0, 0.0, 1.0])
                b = m @ pos @ np.array([*d, 1.0])
                dz = abs(float(b[2] - a[2])) * cm_por_unidade
                dh = float(np.hypot(b[0] - a[0], b[1] - a[1])) * cm_por_unidade
                if dz >= DESCIDA_MINIMA_CM and dh < LINHA_MINIMA_CM * 4:
                    xy = (float(a[0]) * cm_por_unidade, float(a[1]) * cm_por_unidade)
                    return (*xy, *sorted((float(a[2]) * cm_por_unidade, float(b[2]) * cm_por_unidade))) if com_altura else xy
                return None
    return None


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
    # SPDA (IFC real, 22/11): o objeto está no pavimento que o projetista escolheu, mas a altura dele não bate com
    # a do nível (a descida do 2º fica uns 6 m abaixo do 2º); vale só o nome do nível que o contém
    faixa = None if disciplina == "spda" else _faixa_de_altura(f, niveis, cm_por_unidade)
    vistos: set[str] = set()
    # o mesmo modelo vinculado mais de uma vez no mesmo lugar: o objeto igual na mesma posição entra uma vez;
    # o Tag repetido em outra posição (outra cópia) usa o GlobalId, para o id do ponto não se repetir
    lugares: set[tuple] = set()
    tags: set[str] = set()
    saida = []
    colunas: dict[tuple, dict] = {}  # lugar -> coluna (5.1): os trechos em pé somados
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
            if faixa and disciplina == "eletrico" and tipo != "caixa_parede":
                if not faixa[2] - LAJE_ABAIXO_CM <= float(m[2, 3]) * cm_por_unidade <= faixa[2] + LAJE_ACIMA_CM:
                    continue  # fora da laje deste pavimento
            elif faixa:
                # preventivo (IFC real, 23/11): o objeto vem uns 9 m acima do nível que o contém; vale a altura do nível.
                # A caixa de parede do elétrico também (IFC real: uns 15 m acima do andar)
                if disciplina != "preventivo" and tipo != "caixa_parede" and not faixa[0] <= float(m[2, 3]) * cm_por_unidade < faixa[1]:
                    continue  # de outro pavimento
                cont = ue.get_container(el)
                if cont is not None and cont.is_a("IfcBuildingStorey") and cont.ObjectPlacement and abs(
                        float(up.get_local_placement(cont.ObjectPlacement)[2, 3]) * cm_por_unidade - faixa[2]) > 50.0:
                    continue  # num nível de outra altura: é do andar de baixo ou de cima (forro, cópia vinculada)
            xy = (float(m[0, 3]) * cm_por_unidade, float(m[1, 3]) * cm_por_unidade)
            if tipo == "descida_vertical":
                xy = _vertical(el, m, cm_por_unidade)
                if not xy:
                    continue  # trecho horizontal ou inclinado: malha, não descida
                tipo = "descida"
            elif tipo == "tubo_segmento":
                # 5.1 (23/11): o tubo em pé é a coluna (prumada), um ponto; o deitado é linha, como o eletroduto
                v = _vertical(el, m, cm_por_unidade, com_altura=True)
                if v:
                    lugar = (round(v[0] / 10), round(v[1] / 10))
                    lo, hi = v[2], v[3]
                    c = colunas.setdefault(lugar, {"modelo_id": str(el.Tag or el.GlobalId), "tipo": "coluna", "nome": "Coluna",
                                                   "x": v[0], "y": v[1], "_z": [lo, hi], "_id": str(el.GlobalId)})
                    c["_z"] = [min(c["_z"][0], lo), max(c["_z"][1], hi)]
                    continue
                tipo = "tubo"
            nome = "Descida" if el.is_a() in SEGMENTOS and tipo == "descida" else "Coluna" if tipo == "coluna" else (el.Name or "").split(":")[0].strip()
            item = {"modelo_id": str(el.Tag or el.GlobalId), "tipo": tipo, "nome": nome,
                    "x": xy[0], "y": xy[1]}
            if tipo in TIPOS_DE_LINHA:
                linha = _linha_do_segmento(el, m, cm_por_unidade)
                if not linha:
                    continue
                item.update({"linha": linha, "x": (linha[0][0] + linha[1][0]) / 2, "y": (linha[0][1] + linha[1][1]) / 2})
            if tipo in ("descida", "coluna"):  # a descida e a coluna vem em trechos, um em cima do outro: um ponto por lugar na planta
                lugar = (tipo, round(item["x"] / 10), round(item["y"] / 10))
            else:
                lugar = (tipo, round(float(m[2, 3]) * cm_por_unidade), *(round(c) for p in item.get("linha") or [[item["x"], item["y"]]] for c in p))
            if lugar in lugares:
                continue
            lugares.add(lugar)
            if item["modelo_id"] in tags:
                item["modelo_id"] = str(el.GlobalId)
            tags.add(item["modelo_id"])
            saida.append(item)
    for c in colunas.values():
        if c["_z"][1] - c["_z"][0] < COLUNA_MINIMA_CM:
            continue  # descida curta até o aparelho
        if c["modelo_id"] in tags:
            c["modelo_id"] = c["_id"]
        tags.add(c["modelo_id"])
        saida.append({k: v for k, v in c.items() if not k.startswith("_")})
    return saida


AMBIENTE_PERTO_CM = 30.0  # o ponto na parede fica com o ambiente a menos disto


def ambiente_dos_pontos(pontos: list[dict], geometrias: dict, metros_por_cm: float = 0.01) -> dict:
    """Põe em cada ponto do modelo o ambiente onde ele cai ("ambiente": o nome do ambiente da planta de ambientes,
    "201-03"). geometrias: {nome: polígono shapely do ambiente, nas coordenadas do modelo de arquitetura, em
    metros}. Na obra piloto os modelos de instalações estão nas mesmas coordenadas da arquitetura (23/11: 415 de
    546 pontos de água e esgoto do 2º dentro de um ambiente; os outros na parede). O ponto na parede fica com o
    ambiente mais perto, até AMBIENTE_PERTO_CM. Devolve {com_ambiente, sem_ambiente}."""
    from shapely.geometry import Point
    from shapely.strtree import STRtree

    nomes = list(geometrias)
    geo = [geometrias[n] for n in nomes]
    arvore = STRtree(geo) if geo else None
    raio = AMBIENTE_PERTO_CM * metros_por_cm
    com = 0
    for p in pontos:
        if arvore is None:
            break
        q = Point(p["x"] * metros_por_cm, p["y"] * metros_por_cm)
        dentro = [i for i in arvore.query(q) if geo[i].contains(q)]
        if not dentro:
            perto = [(geo[i].distance(q), i) for i in arvore.query(q.buffer(raio))]
            perto = [d for d in perto if d[0] <= raio]
            dentro = [min(perto)[1]] if perto else []
        if dentro:
            p["ambiente"] = nomes[dentro[0]]
            com += 1
    return {"com_ambiente": com, "sem_ambiente": len(pontos) - com}


def prancha_para_modelo(t: dict):
    """Ponto da prancha -> metros do modelo, pelo casamento de ambientes.casar_com_a_prancha (o inverso do
    para_prancha de ambientes.base_da_planta)."""
    def conv(px: float, py: float) -> tuple[float, float]:
        return ((px - t["dx_pt"]) / t["pt_por_m"] + t["x0"], t["y1"] - (py - t["dy_pt"]) / t["pt_por_m"])
    return conv


def ambientes_do_pacote(manifest: dict, para_modelo) -> dict:
    """{nome: polígono shapely em metros do modelo} dos elementos A do pacote de uma planta de ambientes (25/11:
    pavimento sem IFC de arquitetura, salas tiradas do PDF). O nome é o do elemento ("AC-07"), o mesmo que o
    publicar_planta troca pelo id do ambiente no servidor."""
    from shapely.geometry import Polygon
    from shapely.ops import unary_union

    saida = {}
    for e in (manifest.get("elementos") or {}).values():
        if e.get("tipo") != "A" or not e.get("nome"):
            continue
        partes = [Polygon([para_modelo(x, y) for x, y in poly]).buffer(0) for poly in e.get("polys") or [] if len(poly) >= 3]
        partes = [p for p in partes if not p.is_empty]
        if partes:
            saida[e["nome"]] = unary_union(partes)
    if not saida:
        raise ErroInstalacoes("o pacote de ambientes não tem nenhum ambiente (elemento A)")
    return saida


# Nome do Revit em inglês -> nome para o encarregado (pedido do 10, 23/11)
NOMES_EM_INGLES = ((r"^CONDUIT\b", "Eletroduto"), (r"^PIPE\b|^FLEX PIPE\b", "Tubo"), (r"^CABLE TRAY\b", "Eletrocalha"))


def nome_para_a_pessoa(nome: str, tipo: str) -> str:
    """O nome que aparece no toque: sem o prefixo do Revit (HID_, SAN_, PCI_, SPDA_, "x.", "z_NAO_USAR_"), sem o
    número colado no fim ("Azul1") e em português quando o Revit deu o nome em inglês."""
    n = (nome or "").strip()
    n = re.sub(r"^(?:[xz][._](?:NAO_USAR_|Aninhada_|Aninhanda_)?)?(?:HID|SAN|PCI|SPDA|ELE|EL|AN)_+", "", n, flags=re.I)
    n = re.sub(r"(?<=[A-Za-z])\d+$", "", n.replace("_", " ")).strip()
    for padrao, pt in NOMES_EM_INGLES:
        if re.search(padrao, _sem_acento(n)):
            return pt
    return n or TIPOS_DE_PONTO[tipo]


# Água (pedido do 10, 23/11): pontos a menos disto, um do outro, viram um ponto só (registros e misturador do
# mesmo banheiro); o nome diz o que tem nele.
JUNTAR_AGUA_CM = 20.0
PRIORIDADE = ("ponto_agua", "hidrometro", "registro")


def juntar_proximos(dentro: dict, raio_cm: float, pt_por_cm: float) -> dict:
    """Junta os pontos (já na folha) a menos de raio_cm uns dos outros. O ponto que fica é o de menor id do grupo
    (estável entre gerações); o tipo é o mais importante do grupo; o nome conta os itens ("2 Válvula Esfera, ...")."""
    ids = sorted(dentro)
    lim = raio_cm * pt_por_cm
    pai = {i: i for i in ids}

    def raiz(i):
        while pai[i] != i:
            pai[i] = pai[pai[i]]
            i = pai[i]
        return i

    grade: dict[tuple, list[str]] = {}
    for i in ids:
        x, y = dentro[i]["ponto"]
        grade.setdefault((int(x // lim), int(y // lim)), []).append(i)
    for i in ids:
        x, y = dentro[i]["ponto"]
        gx, gy = int(x // lim), int(y // lim)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for j in grade.get((gx + dx, gy + dy), ()):
                    # só os pontos do banheiro (registro, misturador, hidrômetro); a coluna e o tubo ficam sozinhos
                    if j > i and dentro[i]["tipo"] in PRIORIDADE and dentro[j]["tipo"] in PRIORIDADE:
                        a, b = dentro[i]["ponto"], dentro[j]["ponto"]
                        if ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5 < lim:
                            pai[raiz(j)] = raiz(i)
    grupos: dict[str, list[str]] = {}
    for i in ids:
        grupos.setdefault(raiz(i), []).append(i)
    saida = {}
    for chefe, membros in grupos.items():
        if len(membros) == 1:
            saida[chefe] = dentro[chefe]
            continue
        regs = [dentro[m] for m in membros]
        tipo = min((r["tipo"] for r in regs), key=lambda t: PRIORIDADE.index(t) if t in PRIORIDADE else len(PRIORIDADE))
        contagem: dict[str, int] = {}
        for r in regs:
            contagem[r["nome"]] = contagem.get(r["nome"], 0) + 1
        nome = ", ".join(f"{q} {n}" if q > 1 else n for n, q in sorted(contagem.items(), key=lambda x: (-x[1], x[0])))
        xs = [r["ponto"][0] for r in regs]
        ys = [r["ponto"][1] for r in regs]
        saida[chefe] = {**dentro[chefe], "tipo": tipo, "nome": nome,
                        "ponto": [round(sum(xs) / len(xs), 2), round(sum(ys) / len(ys), 2)],
                        "modelo_id": ",".join(sorted(r["modelo_id"] for r in regs))}
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
               "nome": nome_para_a_pessoa(p["nome"], p["tipo"]), "modelo_id": p["modelo_id"]}
        if p.get("ambiente"):
            reg["ambiente"] = p["ambiente"]
        if linha:
            reg["linha"] = [[round(a, 2), round(b, 2)] for a, b in linha]
        dentro[id_do_ponto(obra, pavimento, disciplina, p["modelo_id"])] = reg
    if disciplina == "hidro":
        dentro = juntar_proximos(dentro, JUNTAR_AGUA_CM, PT_POR_CM)
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


# A descida do SPDA corre no pilar: a que fica mais longe que isto do contorno de um pilar vai para "a conferir"
# (encaixe errado, descida pela fachada ou pilar fora da forma).
DESCIDA_LONGE_CM = 30.0
FORA_DA_ESTRUTURA_CM = 200.0
PT_POR_CM = 72 / 2.54 / 50  # folha na escala 1:50


def a_conferir(pontos: dict, pecas: list[dict]) -> dict:
    """O que a pessoa confere na obra, além do toque: descidas longe de pilar. A descida ou o conector a mais de
    FORA_DA_ESTRUTURA_CM de qualquer pilar sai da planta (muda pontos): no 2º da obra piloto eram 11 numa
    diagonal em área vazia, fora das pranchas (achado do 10, 23/11). Fica na lista, para conferir."""
    caixas = []
    for p in pecas:
        if p.get("tipo") == "P":
            for poly in p.get("polys") or []:
                if len(poly) >= 3:
                    xs, ys = [q[0] for q in poly], [q[1] for q in poly]
                    caixas.append((min(xs), min(ys), max(xs), max(ys)))
    lim = DESCIDA_LONGE_CM * PT_POR_CM
    fora_lim = FORA_DA_ESTRUTURA_CM * PT_POR_CM
    longe, fora = [], []
    for pid, p in list(pontos.items()):
        if p["tipo"] not in ("descida", "conector") or not caixas:
            continue
        x, y = p["ponto"]
        d = min(((max(c[0] - x, 0, x - c[2]) ** 2 + max(c[1] - y, 0, y - c[3]) ** 2) ** 0.5) for c in caixas)
        item = {"id": pid, "tipo": p["tipo"], "modelo_id": p["modelo_id"], "distancia_cm": round(d / PT_POR_CM)}
        if d > fora_lim:
            fora.append(item)
            del pontos[pid]
        elif d > lim and p["tipo"] == "descida":
            longe.append(item)
    return {"descida_longe_de_pilar": longe, "fora_da_estrutura": fora}

"""Pontos de instalações (pipeline/fvs/instalacoes.py), o ponto no pacote e as plantas por disciplina no
publicador. Dados fictícios da obra EXE; o IFC de teste é montado aqui (só se houver ifcopenshell)."""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import tempfile
import unittest

import importlib.util as _iu

_FALTA = [m for m in ('shapely', 'numpy') if _iu.find_spec(m) is None]

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))

import instalacoes  # noqa: E402
import pacote  # noqa: E402
import publicar_fichas  # noqa: E402
import publicar_planta  # noqa: E402

try:
    import ifcopenshell  # noqa: F401

    TEM_IFC = True
except ImportError:  # no GitHub o pipeline roda sem ifcopenshell
    TEM_IFC = False

IDENT = {"rotacao": [[1, 0], [0, 1]], "fator": 1.0, "t": [0.0, 0.0]}


def forma(largura=1000.0, altura=800.0):
    return {"prancha": "EXE.ES.LO.100.FOR2PAVTIP-R00", "revisao": "R00", "largura": largura, "altura": altura, "tile": 256,
            "niveis": [0], "tiles": {}, "pecas": [], "trecho": "Planta inteira"}


HIDROSSANITARIO = (
    ("IfcWasteTerminal", "Ralo seco 100x100:RS:1", 1000.0, 2000.0, "2º PAVIMENTO", "11"),
    ("IfcBuildingElementProxy", "Caixa Sifonada 150x150x50:CS:2", 3000.0, 2000.0, "2º PAVIMENTO", "12"),
    ("IfcSanitaryTerminal", "Bacia sanitária:BS:3", 5000.0, 1000.0, "2º PAVIMENTO", "13"),
    ("IfcValve", "Registro de gaveta:RG:4", 2000.0, 500.0, "2º PAVIMENTO", "14"),
    ("IfcWasteTerminal", "Ralo do 3º:RS:5", 1000.0, 2000.0, "3º PAVIMENTO", "15"),
    ("IfcWall", "Parede:P:6", 0.0, 0.0, "2º PAVIMENTO", "16"),
)
# elétrico e SPDA da obra EXE (nomes usuais do Revit; suposição até ver os IFC reais)
ELETRICO_SPDA = (
    ("IfcJunctionBox", "Caixa de passagem 4x4:CP:1", 1000.0, 1000.0, "2º PAVIMENTO", "21"),
    ("IfcBuildingElementProxy", "Caixa octogonal 4x4 - Ponto de luz:PL:2", 2000.0, 1000.0, "2º PAVIMENTO", "22"),
    ("IfcElectricDistributionBoard", "QDL-02:QD:3", 3000.0, 500.0, "2º PAVIMENTO", "23"),
    ("IfcCableCarrierSegment", "Eletroduto corrugado 25:EL:4", 1500.0, 1000.0, "2º PAVIMENTO", "24"),
    ("IfcBuildingElementProxy", "Captor Franklin:CF:5", 500.0, 500.0, "2º PAVIMENTO", "25"),
    ("IfcCableSegment", "Descida SPDA cabo 35mm²:DS:6", 4000.0, 2000.0, "2º PAVIMENTO", "26"),
    ("IfcBuildingElementProxy", "Caixa de inspeção SPDA:CI:7", 4000.0, 2100.0, "2º PAVIMENTO", "27"),
)


def ifc_de_teste(caminho: str, objetos=HIDROSSANITARIO) -> None:
    """Um IFC4 em milímetros com 2º e 3º pavimento e os objetos pedidos (padrão: ralo, caixa sifonada, vaso,
    registro, ralo do 3º e uma parede)."""
    f = ifcopenshell.file(schema="IFC4")
    g = lambda: ifcopenshell.guid.new()  # noqa: E731
    origem = f.createIfcCartesianPoint((0.0, 0.0, 0.0))
    eixo = f.createIfcAxis2Placement3D(origem, None, None)
    ctx = f.createIfcGeometricRepresentationContext(None, "Model", 3, 1e-5, eixo, None)
    mm = f.createIfcSIUnit(None, "LENGTHUNIT", "MILLI", "METRE")
    proj = f.createIfcProject(g(), None, "EXE", None, None, None, None, [ctx], f.createIfcUnitAssignment([mm]))
    lp_raiz = f.createIfcLocalPlacement(None, eixo)
    predio = f.createIfcBuilding(g(), None, "Obra Exemplo", None, None, lp_raiz, None, None, None, None, None, None)
    f.createIfcRelAggregates(g(), None, None, None, proj, [predio])
    pavs = {}
    cota = {"2º PAVIMENTO": 0.0, "3º PAVIMENTO": 3000.0}
    for nome in ("2º PAVIMENTO", "3º PAVIMENTO"):
        no_nivel = f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((0.0, 0.0, cota[nome])), None, None)
        pavs[nome] = f.createIfcBuildingStorey(g(), None, nome, None, None, f.createIfcLocalPlacement(lp_raiz, no_nivel), None, None, None, None)
    f.createIfcRelAggregates(g(), None, None, None, predio, list(pavs.values()))

    def obj(classe, nome, x_mm, y_mm, pav, tag):
        lp = f.createIfcLocalPlacement(None, f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((x_mm, y_mm, cota[pav])), None, None))
        el = f.create_entity(classe, GlobalId=g(), Name=nome, ObjectPlacement=lp, Tag=tag)
        f.createIfcRelContainedInSpatialStructure(g(), None, None, None, [el], pavs[pav])
        return el

    for o in objetos:
        obj(*o)
    f.write(caminho)


class TestClassificar(unittest.TestCase):
    def test_sanitario(self):
        c = instalacoes.classificar
        self.assertEqual(c("sanitario", "IfcBuildingElementProxy", "Ralo seco 100x100"), "ralo")
        self.assertEqual(c("sanitario", "IfcWasteTerminal", "Grelha"), "ralo")
        self.assertEqual(c("sanitario", "IfcBuildingElementProxy", "Caixa Sifonada 150x150"), "caixa_sifonada")
        self.assertEqual(c("sanitario", "IfcBuildingElementProxy", "CX SIF 100"), "caixa_sifonada")
        self.assertEqual(c("sanitario", "IfcBuildingElementProxy", "Caixa de inspeção 60x60"), "caixa")
        self.assertEqual(c("sanitario", "IfcSanitaryTerminal", "Bacia sanitária"), "ponto_esgoto")
        self.assertIsNone(c("sanitario", "IfcWall", "Parede"))
        # nomes do Revit, com prefixo e sublinhado (21/11)
        self.assertEqual(c("sanitario", "IfcFlowTerminal", "HID_Caixa Sifonada Ø150"), "caixa_sifonada")
        self.assertEqual(c("sanitario", "IfcFlowTerminal", "SAN_Ralo Linear 70/90"), "ralo")
        self.assertIsNone(c("sanitario", "IfcFlowTerminal", "Prolongamento para Caixa Sifonada - Caixas e Ralos"))
        self.assertIsNone(c("sanitario", "IfcFlowTerminal", "HID_Nicho MLL"))
        self.assertIsNone(c("sanitario", "IfcFlowFitting", "SAN_Joelho 90 - Caixas e Ralos"))

    def test_hidro(self):
        c = instalacoes.classificar
        self.assertEqual(c("hidro", "IfcValve", "Válvula"), "registro")
        self.assertEqual(c("hidro", "IfcBuildingElementProxy", "REGISTRO DE PRESSÃO"), "registro")
        self.assertEqual(c("hidro", "IfcFlowMeter", "x"), "hidrometro")
        self.assertEqual(c("hidro", "IfcSanitaryTerminal", "Lavatório"), "ponto_agua")
        self.assertEqual(c("hidro", "IfcBuildingElementProxy", "Ponto de água fria"), "ponto_agua")
        self.assertIsNone(c("hidro", "IfcBuildingElementProxy", "Ralo seco"))
        # nomes do Revit (21/11)
        self.assertEqual(c("hidro", "IfcFlowController", "HID_Valvula Esfera Azul"), "registro")
        self.assertEqual(c("hidro", "IfcFlowController", "HID_Registro Gaveta1"), "registro")
        self.assertEqual(c("hidro", "IfcFlowController", "HID_Misturador Monocomando Chuveiro"), "ponto_agua")
        self.assertEqual(c("hidro", "IfcFlowController", "Ducha"), "ponto_agua")
        self.assertEqual(c("hidro", "IfcFlowController", "HID_Hidrometro Multijato AQ"), "hidrometro")
        for nome in ("PCI_FLANGE_SEXTAVA", "HID_Valvula ventosa", "HID_Filtro Y"):
            self.assertIsNone(c("hidro", "IfcFlowController", nome), nome)
        self.assertIsNone(c("hidro", "IfcFlowFitting", "HID_Joelho 90 - PPR"))

    def test_eletrico(self):
        c = instalacoes.classificar
        self.assertEqual(c("eletrico", "IfcJunctionBox", "Caixa"), "caixa_passagem")
        self.assertEqual(c("eletrico", "IfcBuildingElementProxy", "CAIXA DE PASSAGEM 30x30"), "caixa_passagem")
        self.assertEqual(c("eletrico", "IfcBuildingElementProxy", "Cx 4x2 elétrica"), "caixa_passagem")
        self.assertEqual(c("eletrico", "IfcBuildingElementProxy", "Caixa octogonal 4x4"), "ponto_luz")
        self.assertEqual(c("eletrico", "IfcLightFixture", "Plafon"), "ponto_luz")
        self.assertEqual(c("eletrico", "IfcElectricDistributionBoard", "x"), "quadro")
        self.assertEqual(c("eletrico", "IfcBuildingElementProxy", "QDL-02"), "quadro")
        self.assertEqual(c("eletrico", "IfcBuildingElementProxy", "Quadro de medição"), "quadro")
        # eletroduto entra como linha (21/11); eletrocalha, leito e cabo não
        self.assertEqual(c("eletrico", "IfcCableCarrierSegment", "Eletroduto corrugado 25"), "eletroduto")
        self.assertEqual(c("eletrico", "IfcFlowSegment", "ELETRODUTO PVC RIGIDO"), "eletroduto")
        self.assertEqual(c("eletrico", "IfcCableCarrierSegment", "Conduite 3/4"), "eletroduto")
        self.assertIsNone(c("eletrico", "IfcCableCarrierSegment", "Eletrocalha perfurada 100x50"))
        self.assertEqual(c("eletrico", "IfcBuildingElementProxy", "3.a_1 Tomada de Teto 2P+T_Conjunto 4x2"), "caixa_passagem")
        self.assertEqual(c("eletrico", "IfcBuildingElementProxy", "3.c_2 Tomadas de Piso 2P+T_Conjunto 4x4"), "caixa_passagem")
        # 23/11 (5.3): a tomada de parede é a caixa de parede (alvenaria ou drywall), não da laje
        self.assertEqual(c("eletrico", "IfcBuildingElementProxy", "1.a_1 Tomada 2P+T_Conjunto 4x2"), "caixa_parede")
        # 25/11: a caixa de passagem na parede vai para a ficha de parede; a caixa de passagem (condulete) segue da laje
        self.assertEqual(c("eletrico", "IfcBuildingElementProxy",
                           "Caixa de Passagem na Parede em caixa 4x2:a. Caixa de Passagem com placa cega:11124639"), "caixa_parede")
        self.assertEqual(c("eletrico", "IfcBuildingElementProxy", "ELT_CAIXA DE PASSAGEM 4X2 - CONDUTELE:Ponto de força:1"), "caixa_passagem")
        # 24/11: o módulo "não listável" é parte do conjunto, no mesmo lugar; não vira outro ponto
        self.assertIsNone(c("eletrico", "IfcBuildingElementProxy", "x.Módulo de Tomada não listavel 2"))
        self.assertIsNone(c("eletrico", "IfcBuildingElementProxy", "x.Módulo de Tecla Interrupor não listavel 2 teclas"))
        self.assertEqual(c("eletrico", "IfcFlowSegment", "Conduit without Fittings"), "eletroduto")
        self.assertIsNone(c("eletrico", "IfcFlowSegment", "Cable Tray with Fittings"))
        self.assertIsNone(c("eletrico", "IfcCableSegment", "Cabo 2,5mm²"))
        self.assertIsNone(c("eletrico", "IfcFlowSegment", "Tubo PVC"))
        self.assertIsNone(c("eletrico", "IfcBuildingElementProxy", "Ralo seco"))

    def test_spda(self):
        c = instalacoes.classificar
        self.assertEqual(c("spda", "IfcBuildingElementProxy", "Captor Franklin"), "captor")
        self.assertEqual(c("spda", "IfcBuildingElementProxy", "Mastro do captor"), "captor")
        self.assertEqual(c("spda", "IfcCableSegment", "Descida SPDA"), "descida")
        self.assertEqual(c("spda", "IfcBuildingElementProxy", "Caixa de inspeção"), "caixa_inspecao")
        self.assertEqual(c("spda", "IfcBuildingElementProxy", "CX INSP SPDA"), "caixa_inspecao")
        self.assertEqual(c("spda", "IfcBuildingElementProxy", "Haste de aterramento 5/8"), "haste")
        self.assertIsNone(c("spda", "IfcCableSegment", "Cabo de cobre nu"))

    def test_spda_nomes_do_ifc_real(self):
        """Nomes do IFC real (22/11): minicaptor, BEP (conta como caixa), conector embutido e eletroduto da descida."""
        c = instalacoes.classificar
        self.assertEqual(c("spda", "IfcBuildingElementProxy", "Minicaptor em barra chata de alumínio"), "captor")
        self.assertEqual(c("spda", "IfcBuildingElementProxy", "Caixa de Barramento Equipotencial - BEP1"), "caixa_inspecao")
        self.assertEqual(c("spda", "IfcFlowFitting", "SPDA_Conector ATERRINSERT"), "conector")
        self.assertEqual(c("spda", "IfcFlowFitting", "SPDA_Conector Minigar Estanhado"), "conector")
        self.assertEqual(c("spda", "IfcFlowSegment", "Conduit without Fittings"), "descida_vertical")
        for nome in ("SPDA_Barra Chata", "SPDA_Curva 90° de Barra Chata", "SPDA_Clips de aço Galvanizado",
                     "SPDA_Terminais Estanhados 1 Furo 1 Compressão", "x.SPDA_Curva Generica para barra redondal"):
            self.assertIsNone(c("spda", "IfcFlowFitting", nome), nome)
        # nas outras disciplinas a conexão continua fora
        self.assertIsNone(c("eletrico", "IfcFlowFitting", "SPDA_Conector ATERRINSERT"))

    def test_preventivo_nomes_do_ifc_real(self):
        """Nomes do IFC real do preventivo (23/11); o gás do mesmo modelo fica fora."""
        c = instalacoes.classificar
        casos = {("IfcFlowTerminal", "PCI_HIDRANTE:HIDRANTE TAMPA VIDRO - 30 m"): "hidrante",
                 ("IfcBuildingElementProxy", "PCI_VIDRO"): None,
                 ("IfcBuildingElementProxy", "PCI_EXTINTOR_DE_PAREDE"): "extintor",
                 ("IfcBuildingElementProxy", "PCI_PLACA_EXTINTOR"): "sinalizacao",
                 ("IfcBuildingElementProxy", "PCI_PLACA_HIDRANTE"): "sinalizacao",
                 ("IfcBuildingElementProxy", "PCI_PLACA_FOTOLUMINESCENTE_SAIDA"): "sinalizacao",
                 ("IfcFlowTerminal", "PCI_ILUMINACAO_DE_EMERGENCIA_EMBUTIDA"): "iluminacao_emergencia",
                 ("IfcFlowTerminal", "PCI_LUMINARIA_EMERGENCIA"): "iluminacao_emergencia",
                 ("IfcDistributionControlElement", "PCI_SIRENE_AUDIO_VISUAL"): "alarme",
                 ("IfcDistributionControlElement", "PCI_ACIONADOR_MANUAL_REARMAVEL"): "alarme",
                 ("IfcDistributionControlElement", "z_NAO_USAR_PCI_DETECTOR_FUMACA"): "detector",
                 ("IfcFlowTerminal", "PCI_MEDIDOR_DE_GAS_PRE_EQUIPADO"): None,
                 ("IfcBuildingElementProxy", "PCI_AQUECEDOR_DE_PASSAGEM"): None,
                 ("IfcFlowTerminal", "PCI_CILINDRO_DE_GAS"): None,
                 ("IfcBuildingElementProxy", "PCI_MANGUEIRA_HIDRANTE"): None,
                 ("IfcFlowSegment", "Pipe Types"): None,
                 ("IfcFlowFitting", "PCI_NPT_TE"): None}
        for (classe, nome), tipo in casos.items():
            self.assertEqual(c("preventivo", classe, nome), tipo, nome)

    def test_descida_longe_de_pilar(self):
        pt = instalacoes.PT_POR_CM
        pecas = [{"tipo": "P", "nome": "P1", "polys": [[[0, 0], [20 * pt, 0], [20 * pt, 20 * pt], [0, 20 * pt]]]}]
        pontos = {"a": {"tipo": "descida", "ponto": [10 * pt, 10 * pt], "modelo_id": "1"},
                  "b": {"tipo": "descida", "ponto": [120 * pt, 10 * pt], "modelo_id": "2"},
                  "c": {"tipo": "captor", "ponto": [500 * pt, 10 * pt], "modelo_id": "3"}}
        pontos["d"] = {"tipo": "conector", "ponto": [900 * pt, 10 * pt], "modelo_id": "4"}
        conf = instalacoes.a_conferir(pontos, pecas)
        self.assertEqual([(x["id"], x["distancia_cm"]) for x in conf["descida_longe_de_pilar"]], [("b", 100)])
        self.assertEqual([x["id"] for x in conf["fora_da_estrutura"]], ["d"])  # longe de tudo: sai da planta
        self.assertNotIn("d", pontos)
        self.assertIn("c", pontos)  # captor não sai (fica na laje, longe de pilar)

    def test_nome_para_a_pessoa(self):
        n = instalacoes.nome_para_a_pessoa
        self.assertEqual(n("HID_Valvula Esfera Azul1", "registro"), "Valvula Esfera Azul")
        self.assertEqual(n("SAN_Ralo Linear 70/90", "ralo"), "Ralo Linear 70/90")
        self.assertEqual(n("HID_Caixa Sifonada Ø150", "caixa_sifonada"), "Caixa Sifonada Ø150")
        self.assertEqual(n("Conduit without Fittings", "eletroduto"), "Eletroduto")
        self.assertEqual(n("z_NAO_USAR_PCI_DETECTOR_FUMACA", "detector"), "DETECTOR FUMACA")
        self.assertEqual(n("", "ralo"), "Ralo")

    def test_juntar_agua_proxima(self):
        pt = instalacoes.PT_POR_CM
        d = {"b": {"tipo": "registro", "ponto": [0, 0], "nome": "Valvula Esfera", "modelo_id": "2"},
             "a": {"tipo": "ponto_agua", "ponto": [10 * pt, 0], "nome": "Misturador", "modelo_id": "1"},
             "c": {"tipo": "registro", "ponto": [5 * pt, 5 * pt], "nome": "Valvula Esfera", "modelo_id": "3"},
             "z": {"tipo": "registro", "ponto": [500 * pt, 0], "nome": "Registro", "modelo_id": "9"}}
        j = instalacoes.juntar_proximos(d, 20, pt)
        self.assertEqual(sorted(j), ["a", "z"])
        self.assertEqual(j["a"]["tipo"], "ponto_agua")
        self.assertEqual(j["a"]["nome"], "2 Valvula Esfera, Misturador")
        self.assertEqual(j["a"]["modelo_id"], "1,2,3")

    def test_trecho_de_tubo_e_trecho(self):
        c = instalacoes.classificar
        # 23/11 (5.1): o tubo de água ou esgoto é trecho (coluna em pé ou linha deitada; ler_ifc decide)
        self.assertEqual(c("hidro", "IfcFlowSegment", "Saída tubo"), "tubo_segmento")
        self.assertEqual(c("sanitario", "IfcFlowSegment", "Pipe Types:Tubo Esgoto Serie Normal"), "tubo_segmento")
        self.assertIsNone(c("sanitario", "IfcFlowSegment", "Duct Types:Retangular"))
        self.assertIsNone(c("eletrico", "IfcFlowSegment", "Pipe Types:Tubo"))

    def test_coluna_nao_junta_com_registro(self):
        pt = instalacoes.PT_POR_CM
        d = {"a": {"tipo": "registro", "ponto": [0, 0], "nome": "Registro", "modelo_id": "1"},
             "b": {"tipo": "coluna", "ponto": [3 * pt, 0], "nome": "Coluna", "modelo_id": "2"},
             "c": {"tipo": "tubo", "ponto": [2 * pt, 0], "linha": [[0, 0], [4 * pt, 0]], "nome": "Tubo", "modelo_id": "3"}}
        self.assertEqual(sorted(instalacoes.juntar_proximos(d, 20, pt)), ["a", "b", "c"])

    def test_disciplina_desconhecida(self):
        with self.assertRaises(instalacoes.ErroInstalacoes):
            instalacoes.classificar("gas", "IfcValve", "x")


@unittest.skipUnless(TEM_IFC, "sem ifcopenshell")
class TestLerIfc(unittest.TestCase):
    def test_pontos_do_nivel_em_cm(self):
        with tempfile.TemporaryDirectory() as d:
            arq = str(pathlib.Path(d) / "EXE_sanitario.ifc")
            ifc_de_teste(arq)
            san = {p["modelo_id"]: p for p in instalacoes.ler_ifc(arq, ["2º Pavimento"], "sanitario")}
            self.assertEqual({k: v["tipo"] for k, v in san.items()}, {"11": "ralo", "12": "caixa_sifonada", "13": "ponto_esgoto"})
            self.assertAlmostEqual(san["11"]["x"], 100.0)  # 1000 mm = 100 cm
            self.assertAlmostEqual(san["11"]["y"], 200.0)
            self.assertEqual(san["11"]["nome"], "Ralo seco 100x100")
            hid = instalacoes.ler_ifc(arq, ["2º PAVIMENTO"], "hidro")
            self.assertEqual(sorted((p["modelo_id"], p["tipo"]) for p in hid), [("13", "ponto_agua"), ("14", "registro")])

    def test_eletrico_e_spda(self):
        with tempfile.TemporaryDirectory() as d:
            arq = str(pathlib.Path(d) / "EXE_eletrico.ifc")
            ifc_de_teste(arq, ELETRICO_SPDA)
            ele = sorted((p["modelo_id"], p["tipo"]) for p in instalacoes.ler_ifc(arq, ["2º PAVIMENTO"], "eletrico"))
            self.assertEqual(ele, [("21", "caixa_passagem"), ("22", "ponto_luz"), ("23", "quadro")])
            spda = sorted((p["modelo_id"], p["tipo"]) for p in instalacoes.ler_ifc(arq, ["2º PAVIMENTO"], "spda"))
            self.assertEqual(spda, [("25", "captor"), ("26", "descida"), ("27", "caixa_inspecao")])

    def test_modelo_vinculado_em_varios_pavimentos(self):
        """O tipo vinculado do 2º ao 3º vem com dois níveis "2º PAVIMENTO": fica só o de baixo (o 2º de verdade)."""
        with tempfile.TemporaryDirectory() as d:
            arq = str(pathlib.Path(d) / "EXE_hidro.ifc")
            ifc_de_teste(arq, (("IfcValve", "Registro de gaveta:HI:1", 1000.0, 1000.0, "2º PAVIMENTO", "1"),))
            f = ifcopenshell.open(arq)
            pav2 = [s for s in f.by_type("IfcBuildingStorey") if s.Name == "2º PAVIMENTO"][0]
            pav3 = [s for s in f.by_type("IfcBuildingStorey") if s.Name == "3º PAVIMENTO"][0]
            no_alto = f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((0.0, 0.0, 3240.0)), None, None)
            pav3.ObjectPlacement = f.createIfcLocalPlacement(pav2.ObjectPlacement.PlacementRelTo, no_alto)
            copia = f.createIfcBuildingStorey(ifcopenshell.guid.new(), None, "2º PAVIMENTO", None, None,
                                              f.createIfcLocalPlacement(pav2.ObjectPlacement.PlacementRelTo, no_alto), None, None, None, None)
            for tag, z in (("2", 3240.0 + 1500.0), ("3", 2900.0)):  # cópia no 3º; o 3 fica no forro do 2º
                lp = f.createIfcLocalPlacement(None, f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((1000.0, 1000.0, z)), None, None))
                el = f.create_entity("IfcValve", GlobalId=ifcopenshell.guid.new(), Name="Registro de gaveta", ObjectPlacement=lp, Tag=tag)
                f.createIfcRelContainedInSpatialStructure(ifcopenshell.guid.new(), None, None, None, [el], copia if tag == "2" else pav2)
            f.write(arq)
            self.assertEqual(sorted(p["modelo_id"] for p in instalacoes.ler_ifc(arq, ["2º PAVIMENTO"], "hidro")), ["1", "3"])
            # o 3º do tipo vinculado vem num nível chamado "2º PAVIMENTO": entra no 3º pela altura
            self.assertEqual([p["modelo_id"] for p in instalacoes.ler_ifc(arq, ["3º PAVIMENTO"], "hidro")], ["2"])

    def test_eletrico_pela_laje(self):
        """No elétrico entra o que está na laje do pavimento: a caixa do teto do 2º (no nível do 3º) é do 3º."""
        with tempfile.TemporaryDirectory() as d:
            arq = str(pathlib.Path(d) / "EXE_eletrico.ifc")
            ifc_de_teste(arq, (("IfcBuildingElementProxy", "Tomada de Teto 4x2:EL:1", 1000.0, 1000.0, "2º PAVIMENTO", "41"),
                               ("IfcBuildingElementProxy", "Tomada de Piso 4x2:EL:2", 2000.0, 1000.0, "2º PAVIMENTO", "42"),
                               # o mesmo objeto de outra cópia vinculada, no mesmo lugar: entra uma vez
                               ("IfcBuildingElementProxy", "Tomada de Piso 4x2:EL:2", 2000.0, 1000.0, "2º PAVIMENTO", "42")))
            f = ifcopenshell.open(arq)
            teto = [e for e in f.by_type("IfcBuildingElementProxy") if e.Tag == "41"][0]
            teto.ObjectPlacement.RelativePlacement.Location.Coordinates = (1000.0, 1000.0, 3000.0)  # no nível do 3º
            f.write(arq)
            self.assertEqual([p["modelo_id"] for p in instalacoes.ler_ifc(arq, ["2º PAVIMENTO"], "eletrico")], ["42"])
            self.assertEqual([p["modelo_id"] for p in instalacoes.ler_ifc(arq, ["3º PAVIMENTO"], "eletrico")], ["41"])

    def test_eletroduto_como_linha(self):
        """O eletroduto vem com a linha do corpo extrudado (ou do eixo); o vertical e o sem forma ficam fora."""
        with tempfile.TemporaryDirectory() as d:
            arq = str(pathlib.Path(d) / "EXE_eletrico.ifc")
            ifc_de_teste(arq, ELETRICO_SPDA + (
                ("IfcCableCarrierSegment", "Eletroduto PVC 25:EL:8", 1000.0, 1000.0, "2º PAVIMENTO", "28"),
                ("IfcCableCarrierSegment", "Eletroduto PVC 25:EL:9", 3000.0, 3000.0, "2º PAVIMENTO", "29"),
                ("IfcCableCarrierSegment", "Eletroduto PVC 25:EL:10", 500.0, 500.0, "2º PAVIMENTO", "30")))
            f = ifcopenshell.open(arq)
            ctx = f.by_type("IfcGeometricRepresentationContext")[0]
            por_tag = {e.Tag: e for e in f.by_type("IfcCableCarrierSegment")}

            def corpo(el, eixo_z, depth):
                # Revit: o tubo é extrudado no Z local da posição, que aponta para onde ele corre
                pos = f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((0.0, 0.0, 0.0)), f.createIfcDirection(eixo_z), None)
                perfil = f.createIfcCircleProfileDef("AREA", None, None, 12.5)
                sol = f.createIfcExtrudedAreaSolid(perfil, pos, f.createIfcDirection((0.0, 0.0, 1.0)), depth)
                el.Representation = f.createIfcProductDefinitionShape(None, None, [f.createIfcShapeRepresentation(ctx, "Body", "SweptSolid", [sol])])

            corpo(por_tag["28"], (1.0, 0.0, 0.0), 2000.0)  # 2 m para +x a partir de (1000, 1000) mm
            corpo(por_tag["30"], (0.0, 0.0, 1.0), 3000.0)  # vertical: fora
            eixo = f.createIfcPolyline([f.createIfcCartesianPoint((0.0, 0.0)), f.createIfcCartesianPoint((0.0, 1500.0))])
            por_tag["29"].Representation = f.createIfcProductDefinitionShape(None, None, [f.createIfcShapeRepresentation(ctx, "Axis", "Curve2D", [eixo])])
            f.write(arq)
            ele = {p["modelo_id"]: p for p in instalacoes.ler_ifc(arq, ["2º PAVIMENTO"], "eletrico")}
            self.assertEqual(sorted(k for k, v in ele.items() if v["tipo"] == "eletroduto"), ["28", "29"])
            l28 = ele["28"]["linha"]
            self.assertEqual([[round(a, 6) for a in p] for p in l28], [[100.0, 100.0], [300.0, 100.0]])
            self.assertAlmostEqual(ele["28"]["x"], 200.0)
            self.assertEqual([[round(a, 6) for a in p] for p in ele["29"]["linha"]], [[300.0, 300.0], [300.0, 450.0]])


class TestNaFolha(unittest.TestCase):
    def test_encaixe_ids_fixos_e_fora(self):
        pts = [{"modelo_id": "11", "tipo": "ralo", "nome": "Ralo seco", "x": 100.0, "y": 200.0},
               {"modelo_id": "99", "tipo": "caixa", "nome": "", "x": 5000.0, "y": 10.0}]
        enc = {"rotacao": [[1, 0], [0, -1]], "fator": 2.0, "t": [10.0, 700.0]}
        dentro, fora = instalacoes.pontos_na_folha(pts, enc, "sanitario", 1000.0, 800.0, "EXE", "2º Pavimento")
        pid = instalacoes.id_do_ponto("EXE", "2º Pavimento", "sanitario", "11")
        self.assertEqual(list(dentro), [pid])
        self.assertEqual(dentro[pid]["ponto"], [210.0, 300.0])
        self.assertEqual(fora, [{"modelo_id": "99", "tipo": "caixa", "nome": ""}])
        self.assertEqual(pid, instalacoes.id_do_ponto(" exe ", "2º Pavimento", "sanitario", "11"))
        self.assertNotEqual(pid, instalacoes.id_do_ponto("EXE", "2º Pavimento", "hidro", "11"))

    def test_mesmo_ifc_em_duas_plantas_nao_repete_id(self):
        """Revisor (21/11): o mesmo IFC usado em dois pavimentos ou em duas obras não pode dar o mesmo barra_id."""
        pts = [{"modelo_id": "11", "tipo": "ralo", "nome": "Ralo", "x": 1.0, "y": 1.0}]
        ids = {next(iter(instalacoes.pontos_na_folha(pts, IDENT, "sanitario", 10, 10, o, pav)[0]))
               for o, pav in (("EXE", "2º Pavimento"), ("EXE", "3º Pavimento"), ("EX2", "2º Pavimento"))}
        self.assertEqual(len(ids), 3)

    def test_linha_na_folha(self):
        """O eletroduto leva a linha para a folha; entra se uma ponta cai nela, mesmo com o meio fora."""
        pts = [{"modelo_id": "28", "tipo": "eletroduto", "nome": "Eletroduto PVC 25", "x": 15.0, "y": 5.0, "linha": [[5.0, 5.0], [25.0, 5.0]]},
               {"modelo_id": "29", "tipo": "eletroduto", "nome": "", "x": 60.0, "y": 5.0, "linha": [[8.0, 5.0], [112.0, 5.0]]},
               {"modelo_id": "30", "tipo": "eletroduto", "nome": "", "x": 200.0, "y": 5.0, "linha": [[150.0, 5.0], [250.0, 5.0]]}]
        dentro, fora = instalacoes.pontos_na_folha(pts, IDENT, "eletrico", 50, 50, "EXE", "2º Pavimento")
        reg = {p["modelo_id"]: p for p in dentro.values()}
        self.assertEqual(sorted(reg), ["28", "29"])
        self.assertEqual(reg["28"]["linha"], [[5.0, 5.0], [25.0, 5.0]])
        self.assertEqual(reg["28"]["ponto"], [15.0, 5.0])
        self.assertEqual(reg["29"]["nome"], "Eletroduto")
        self.assertEqual([f["modelo_id"] for f in fora], ["30"])

    def test_nome_padrao_e_resumo(self):
        dentro, fora = instalacoes.pontos_na_folha([{"modelo_id": "1", "tipo": "registro", "nome": "", "x": 1, "y": 1}], IDENT, "hidro", 10, 10, "EXE", "2º Pavimento")
        self.assertEqual(next(iter(dentro.values()))["nome"], "Registro")
        self.assertEqual(instalacoes.resumo(dentro, fora), {"pontos": 1, "por_tipo": {"registro": 1}, "fora_da_folha": []})


class TestPacote(unittest.TestCase):
    CAB = {"planta_id": "p", "obra": "EXE", "pavimento": "2º Pavimento", "trecho": "Esgoto e pluvial", "prancha": "X",
           "revisao": "R00", "largura": 100, "altura": 100, "tile": 256, "niveis": [0], "disciplina": "sanitario"}

    def test_pontos_no_manifest(self):
        pts = {"a": {"disciplina": "sanitario", "tipo": "ralo", "ponto": [1.234, 5], "nome": "Ralo", "modelo_id": 11}}
        man, _ = pacote.montar(self.CAB, {}, {}, {}, None, pts)
        m = json.loads(man)
        self.assertEqual(m["disciplina"], "sanitario")
        self.assertEqual(m["pontos"], {"a": {"disciplina": "sanitario", "tipo": "ralo", "ponto": [1.23, 5.0], "nome": "Ralo", "modelo_id": "11"}})

    def test_linha_do_eletroduto_no_manifest(self):
        pts = {"e": {"disciplina": "eletrico", "tipo": "eletroduto", "ponto": [2, 1], "nome": "Eletroduto", "linha": [[1, 1], [3.333, 1]]}}
        m = json.loads(pacote.montar(self.CAB, {}, {}, {}, None, pts)[0])
        self.assertEqual(m["pontos"]["e"]["linha"], [[1.0, 1.0], [3.33, 1.0]])
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(self.CAB, {}, {}, {}, None, {"e": {**pts["e"], "linha": [[1, 1]]}})

    def test_sem_pontos_nao_poe_a_chave(self):
        cab = {k: v for k, v in self.CAB.items() if k != "disciplina"}
        m = json.loads(pacote.montar(cab, {}, {}, {})[0])
        self.assertNotIn("pontos", m)
        self.assertNotIn("disciplina", m)

    def test_ponto_invalido(self):
        for p in ({"disciplina": "gas", "tipo": "ralo", "ponto": [1, 1]},
                  {"disciplina": "hidro", "tipo": "tomada", "ponto": [1, 1]},
                  {"disciplina": "hidro", "tipo": "registro", "ponto": [1]}):
            with self.assertRaises(pacote.ErroPacote):
                pacote.montar(self.CAB, {}, {}, {}, None, {"a": p})
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar({**self.CAB, "disciplina": "gas"}, {}, {}, {})


class TestPublicador(unittest.TestCase):
    PONTOS = [{"modelo_id": "11", "tipo": "ralo", "nome": "Ralo", "x": 100.0, "y": 200.0}]

    def cfg(self, **inst):
        return {"obra": "EXE", "pavimento": "2º Pavimento", "instalacoes": {"encaixe": None, "disciplinas": {"sanitario": {"ifc": ["x.ifc"], "nivel": ["2º"]}}, **inst}}

    def test_folha_por_disciplina_com_encaixe_dos_furos(self):
        formas = [forma()]
        rel = publicar_planta.por_instalacoes(self.cfg(), {"instalacoes": {"sanitario": self.PONTOS}}, formas, {"encaixe": dict(IDENT)})
        self.assertEqual(rel["sanitario"]["pontos"], 1)
        self.assertEqual(len(formas), 2)
        fl = formas[1]
        self.assertEqual(list(fl["pontos"]), [instalacoes.id_do_ponto("EXE", "2º Pavimento", "sanitario", self.PONTOS[0]["modelo_id"])])
        self.assertEqual((fl["disciplina"], fl["trecho"], fl["pecas"]), ("sanitario", "Esgoto e pluvial", []))
        self.assertEqual(publicar_planta.quantos_locais(fl), 1)
        man, _, r = publicar_planta.montar_trecho(fl, {}, {}, {"planta_id": "p", "obra": "EXE", "pavimento": "2º", "trecho": fl["trecho"]})
        m = json.loads(man)
        self.assertEqual((m["disciplina"], len(m["pontos"]), m["elementos"]), ("sanitario", 1, {}))
        self.assertEqual((r["elementos"], r["disciplina"]), (1, "sanitario"))
        self.assertEqual(publicar_planta.so_disciplina(formas, "sanitario"), [fl])
        with self.assertRaises(publicar_planta.ErroPublicacao):
            publicar_planta.so_disciplina(formas, "hidro")

    def test_sem_encaixe_ou_duvidoso(self):
        with self.assertRaises(publicar_planta.ErroPublicacao):
            publicar_planta.por_instalacoes(self.cfg(), {}, [forma()], None)
        with self.assertRaises(publicar_planta.ErroPublicacao):
            publicar_planta.por_instalacoes(self.cfg(), {}, [forma()], {"encaixe": {**IDENT, "duvidoso": True}})
        rel = publicar_planta.por_instalacoes(self.cfg(encaixe=dict(IDENT)), {}, [forma()], None)  # à mão vale
        self.assertEqual(rel["sanitario"]["pontos"], 0)

    def test_so_com_folha_unica(self):
        with self.assertRaises(publicar_planta.ErroPublicacao):
            publicar_planta.por_instalacoes(self.cfg(), {}, [forma(), forma()], {"encaixe": IDENT})

    def test_sem_instalacoes_nao_faz_nada(self):
        formas = [forma()]
        self.assertIsNone(publicar_planta.por_instalacoes({"instalacoes": None}, {}, formas, None))
        self.assertEqual(len(formas), 1)

    def test_config(self):
        with tempfile.TemporaryDirectory() as d:
            base = pathlib.Path(d)
            (base / "f.pdf").write_text("x")
            (base / "EXE_san.ifc").write_text("x")
            cfg = {"obra": "EXE", "pavimento": "2º Pavimento", "formas": [{"trecho": "T1", "pdf": "f.pdf"}], "folha_unica": True,
                   "instalacoes": {"sanitario": {"ifc": "EXE_san.ifc", "nivel": "2º PAVIMENTO"}}}
            (base / "pav.json").write_text(json.dumps(cfg), encoding="utf-8")
            lido = publicar_planta.ler_config(base / "pav.json")["instalacoes"]
            self.assertEqual(lido["disciplinas"]["sanitario"]["nivel"], ["2º PAVIMENTO"])
            self.assertEqual(pathlib.Path(lido["disciplinas"]["sanitario"]["ifc"][0]), base / "EXE_san.ifc")
            for ruim in ({"gas": {"ifc": "EXE_san.ifc", "nivel": "x"}}, {"hidro": {"ifc": "EXE_san.ifc"}}):
                (base / "pav.json").write_text(json.dumps({**cfg, "instalacoes": ruim}), encoding="utf-8")
                with self.assertRaises(publicar_planta.ErroPublicacao):
                    publicar_planta.ler_config(base / "pav.json")

    def test_opcoes_so(self):
        ns = argparse.Namespace(so_armadura=False, so_hidro=False, so_sanitario=True)
        self.assertTrue(getattr(ns, "so_sanitario"))


class TestFichaComPontos(unittest.TestCase):
    def ficha(self, aplica=("A",), **item):
        return [{"codigo": "EXE-PVS-105", "titulo": "Instalações sanitárias (Obra Exemplo)", "revisao": "0", "aplica_a": list(aplica),
                 "itens": [{"n": 1, "etapa": "EXECUÇÃO", "titulo": "Ralos no lugar do projeto", **item}]}]

    def test_aceita_no_ambiente(self):
        f = publicar_fichas.normalizar(self.ficha(pontos="sanitario"))
        self.assertEqual(f[0]["itens"][0]["pontos"], "sanitario")

    def test_recusa(self):
        for args in ((("A",), {"pontos": "gas"}), (("L",), {"pontos": "hidro"}), (("A",), {"pontos": "hidro", "esquadrias": True})):
            with self.assertRaises(publicar_fichas.ErroFichas):
                publicar_fichas.normalizar(self.ficha(args[0], **args[1]))

    def test_eletrico_e_spda(self):
        for disc in ("eletrico", "spda"):
            self.assertEqual(publicar_fichas.normalizar(self.ficha(pontos=disc))[0]["itens"][0]["pontos"], disc)


class TestSessaoPorServidor(unittest.TestCase):
    def test_servidor_de_testes_tem_arquivo_proprio(self):
        padrao = pathlib.Path("C:/x/SistemaObra/sessao_supabase.json")
        self.assertEqual(publicar_planta.arquivo_de_sessao(publicar_planta.URL_PADRAO, padrao), padrao)
        outro = publicar_planta.arquivo_de_sessao("https://abcdefgh.supabase.co", padrao)
        self.assertEqual(outro.name, "sessao_supabase_abcdefgh.json")
        self.assertEqual(outro.parent, padrao.parent)


class TestFichaComTiposDePonto(unittest.TestCase):
    """5.1 a 5.3 (23/11): o item pode valer para duas disciplinas e só para alguns tipos de ponto."""

    ficha = TestFichaComPontos.ficha

    def test_lista_e_tipos(self):
        f = publicar_fichas.normalizar(self.ficha(pontos=["hidro", "sanitario"], pontos_tipos=["ponto_agua", "registro", "ponto_esgoto"]))
        self.assertEqual(f[0]["itens"][0]["pontos_tipos"], ["ponto_agua", "registro", "ponto_esgoto"])

    def test_mesmo_tipo_em_dois_itens(self):
        def ficha(*itens):
            return [{"codigo": "EXE-1", "titulo": "T", "aplica_a": ["A"],
                     "itens": [{"n": n + 1, "titulo": f"I{n}", **it} for n, it in enumerate(itens)]}]
        publicar_fichas.normalizar(ficha({"pontos": "hidro", "pontos_tipos": ["tubo"]}, {"pontos": "sanitario", "pontos_tipos": ["tubo"]},
                                         {"pontos": "sanitario", "pontos_tipos": ["ralo"]}))
        for itens in (({"pontos": "hidro", "pontos_tipos": ["tubo"]}, {"pontos": ["hidro", "sanitario"], "pontos_tipos": ["tubo"]}),
                      ({"pontos": "hidro"}, {"pontos": "hidro", "pontos_tipos": ["registro"]}),
                      ({"pontos": "hidro", "pontos_tipos": ["registro"]}, {"pontos": "hidro"})):
            with self.assertRaises(publicar_fichas.ErroFichas, msg=itens):
                publicar_fichas.normalizar(ficha(*itens))

    def test_ambiente_vira_id(self):
        pts = {"p1": {"tipo": "ralo", "ambiente": "201-03"}, "p2": {"tipo": "ralo", "ambiente": "AC-09"}, "p3": {"tipo": "ralo"}}
        out = publicar_planta.ambiente_pelo_id(pts, {("A", "201-03"): "id-amb"})
        self.assertEqual([out[k].get("ambiente") for k in ("p1", "p2", "p3")], ["id-amb", None, None])
        self.assertNotIn("ambiente", out["p2"])
        self.assertEqual(pts["p1"]["ambiente"], "201-03")  # não mexe no original

    def test_recusa(self):
        for item in ({"pontos": []}, {"pontos": ["hidro", "gas"]}, {"pontos": "hidro", "pontos_tipos": ["torneira"]},
                     {"pontos": "hidro", "pontos_tipos": []}, {"pontos_tipos": ["tubo"]}):
            with self.assertRaises(publicar_fichas.ErroFichas, msg=item):
                publicar_fichas.normalizar(self.ficha(**item))


class _SrvFalso:
    def __init__(self, existentes):
        self.existentes = existentes
        self.patches = []
        srv = self

        class _Sb:
            def json(self, metodo, caminho, corpo, cab=None):
                srv.patches.append((metodo, caminho, corpo))

        self.sb = _Sb()

    def obter(self, tabela, filtros):
        return self.existentes


class TestTrocarItens(unittest.TestCase):
    def test_troca_so_o_que_mudou(self):
        velho = [{"n": 1, "titulo": "Altura dos pontos"}]
        novo = [{"n": 1, "titulo": "Altura dos pontos", "pontos": "hidro"}]
        srv = _SrvFalso([{"id": "f1", "codigo": "EXE-1", "revisao": "0", "itens": velho},
                         {"id": "f2", "codigo": "EXE-2", "revisao": "0", "itens": novo}])
        n = publicar_fichas.trocar_itens(srv, {"id": "o"}, [{"codigo": "EXE-1", "revisao": "0", "itens": novo},
                                                           {"codigo": "EXE-2", "revisao": "0", "itens": novo},
                                                           {"codigo": "EXE-3", "revisao": "0", "itens": novo}])
        self.assertEqual(n, 1)
        self.assertEqual(srv.patches, [("PATCH", "/rest/v1/fichas_modelo?id=eq.f1", {"itens": novo})])

    def test_numeros_diferentes_nao_troca(self):
        srv = _SrvFalso([{"id": "f1", "codigo": "EXE-1", "revisao": "0", "itens": [{"n": 1, "titulo": "A"}]}])
        with self.assertRaises(publicar_fichas.ErroFichas):
            publicar_fichas.trocar_itens(srv, {"id": "o"}, [{"codigo": "EXE-1", "revisao": "0", "itens": [{"n": 2, "titulo": "A"}]}])

    def test_nao_vale_no_servidor_da_obra(self):
        import contextlib
        import io

        with tempfile.TemporaryDirectory() as d:
            arq = pathlib.Path(d) / "f.json"
            arq.write_text(json.dumps(TestFichaComPontos().ficha(pontos="hidro")), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()) as saida:
                r = publicar_fichas.main(["EXE", str(arq), "--trocar-itens"])
        self.assertEqual(r, 1)
        self.assertIn("servidor da obra", saida.getvalue())


class TestContaDeTeste(unittest.TestCase):
    def env(self, d, linhas):
        e = pathlib.Path(d) / ".env"
        e.write_text("\n".join(linhas) + "\n", encoding="utf-8")
        return e

    def test_so_no_servidor_de_testes(self):
        with tempfile.TemporaryDirectory() as d:
            e = self.env(d, ["SUPABASE_TESTES_URL=https://testeexe.supabase.co", "SUPABASE_TESTES_USUARIO=teste@exemplo.com",
                             "SUPABASE_TESTES_SENHA='abc'"])
            self.assertEqual(publicar_planta.conta_de_teste("https://testeexe.supabase.co/", e), ("teste@exemplo.com", "abc"))
            self.assertIsNone(publicar_planta.conta_de_teste(publicar_planta.URL_PADRAO, e))
            self.assertIsNone(publicar_planta.conta_de_teste("https://outro.supabase.co", e))

    def test_nunca_no_da_obra_nem_sem_senha(self):
        with tempfile.TemporaryDirectory() as d:
            e = self.env(d, [f"SUPABASE_TESTES_URL={publicar_planta.URL_PADRAO}", "SUPABASE_TESTES_USUARIO=a", "SUPABASE_TESTES_SENHA=b"])
            self.assertIsNone(publicar_planta.conta_de_teste(publicar_planta.URL_PADRAO, e))
            e = self.env(d, ["SUPABASE_TESTES_URL=https://testeexe.supabase.co", "SUPABASE_TESTES_USUARIO=a"])
            self.assertIsNone(publicar_planta.conta_de_teste("https://testeexe.supabase.co", e))
            self.assertIsNone(publicar_planta.conta_de_teste("https://testeexe.supabase.co", pathlib.Path(d) / "nao_existe"))


@unittest.skipIf(_FALTA, "precisa de shapely, numpy, PIL ou pymupdf")
class TestAmbienteDosPontos(unittest.TestCase):
    def test_dentro_na_parede_e_longe(self):
        from shapely.geometry import box

        geo = {"201-01": box(0, 0, 3, 3), "201-02": box(3.2, 0, 6, 3)}  # metros
        pts = [{"x": 150, "y": 150}, {"x": 310, "y": 150}, {"x": 320.5, "y": 100}, {"x": 1000, "y": 1000}]  # cm
        r = instalacoes.ambiente_dos_pontos(pts, geo)
        self.assertEqual([p.get("ambiente") for p in pts], ["201-01", "201-01", "201-02", None])
        self.assertEqual(r, {"com_ambiente": 3, "sem_ambiente": 1})

    def test_vai_para_o_pacote(self):
        pts = [{"modelo_id": "1", "tipo": "ralo", "nome": "Ralo", "x": 10, "y": 10, "ambiente": "201-03"}]
        enc = {"rotacao": [[1, 0], [0, 1]], "fator": 1.0, "t": [0.0, 0.0]}
        dentro, _ = instalacoes.pontos_na_folha(pts, enc, "sanitario", 1000, 1000, "EXE", "2º Pavimento")
        self.assertEqual(next(iter(dentro.values()))["ambiente"], "201-03")


class TestListasIguais(unittest.TestCase):
    """As disciplinas e os tipos de ponto são os mesmos no instalacoes.py, no pacote e nas fichas."""

    def test_iguais(self):
        self.assertEqual(tuple(instalacoes.DISCIPLINAS), pacote.DISCIPLINAS_DE_PONTOS)
        self.assertEqual(tuple(instalacoes.DISCIPLINAS), publicar_fichas.DISCIPLINAS_DOS_PONTOS)
        self.assertEqual(tuple(instalacoes.TIPOS_DE_PONTO), pacote.TIPOS_DE_PONTO)

    def test_so_disciplina_no_cli(self):
        import contextlib
        import io

        saida = io.StringIO()
        with contextlib.redirect_stdout(saida), self.assertRaises(SystemExit):
            publicar_planta.main(["--help"])
        for disc in instalacoes.DISCIPLINAS:
            self.assertIn(f"--so-{disc}", saida.getvalue())
        self.assertIn("--so-instalacoes", saida.getvalue())


@unittest.skipIf(_FALTA, "precisa de shapely, numpy, PIL ou pymupdf")
class TestAmbientesDoPacote(unittest.TestCase):
    """25/11: pavimento sem IFC de arquitetura: as salas vêm do pacote da planta de ambientes do PDF."""

    T = {"pt_por_m": 10.0, "x0": -5.0, "y1": 20.0, "dx_pt": 100.0, "dy_pt": 50.0}

    def test_prancha_para_modelo_e_o_inverso_do_casamento(self):
        conv = instalacoes.prancha_para_modelo(self.T)
        # para_prancha de ambientes.base_da_planta: ((x - x0) * ppm + dx, (y1 - y) * ppm + dy)
        x, y = 3.0, 7.0
        px, py = (x - self.T["x0"]) * 10 + 100, (self.T["y1"] - y) * 10 + 50
        self.assertEqual(tuple(round(v, 6) for v in conv(px, py)), (x, y))

    def test_salas_do_pacote_e_ponto_dentro(self):
        conv = instalacoes.prancha_para_modelo(self.T)
        # sala AC-01 de 2 m x 2 m com o canto (0, 0) do modelo; na prancha, y para baixo
        canto = lambda x, y: [(x - self.T["x0"]) * 10 + 100, (self.T["y1"] - y) * 10 + 50]
        manifest = {"elementos": {
            "a": {"tipo": "A", "nome": "AC-01", "polys": [[canto(0, 0), canto(2, 0), canto(2, 2), canto(0, 2)]]},
            "p": {"tipo": "P", "nome": "P1", "polys": [[canto(5, 5), canto(6, 5), canto(6, 6)]]},
        }}
        geo = instalacoes.ambientes_do_pacote(manifest, conv)
        self.assertEqual(list(geo), ["AC-01"])
        self.assertAlmostEqual(geo["AC-01"].area, 4.0)
        pontos = [{"x": 100.0, "y": 100.0}, {"x": 400.0, "y": 400.0}]  # cm do modelo
        r = instalacoes.ambiente_dos_pontos(pontos, geo)
        self.assertEqual(r, {"com_ambiente": 1, "sem_ambiente": 1})
        self.assertEqual(pontos[0]["ambiente"], "AC-01")

    def test_pacote_sem_ambiente_e_erro(self):
        with self.assertRaises(instalacoes.ErroInstalacoes):
            instalacoes.ambientes_do_pacote({"elementos": {}}, lambda x, y: (x, y))


if __name__ == "__main__":
    unittest.main()

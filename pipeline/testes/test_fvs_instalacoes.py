"""Pontos de instalações (pipeline/fvs/instalacoes.py), o ponto no pacote e as plantas por disciplina no
publicador. Dados fictícios da obra EXE; o IFC de teste é montado aqui (só se houver ifcopenshell)."""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import tempfile
import unittest

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
    for nome in ("2º PAVIMENTO", "3º PAVIMENTO"):
        pavs[nome] = f.createIfcBuildingStorey(g(), None, nome, None, None, f.createIfcLocalPlacement(lp_raiz, eixo), None, None, None, None)
    f.createIfcRelAggregates(g(), None, None, None, predio, list(pavs.values()))

    def obj(classe, nome, x_mm, y_mm, pav, tag):
        lp = f.createIfcLocalPlacement(None, f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((x_mm, y_mm, 0.0)), None, None))
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

    def test_hidro(self):
        c = instalacoes.classificar
        self.assertEqual(c("hidro", "IfcValve", "Válvula"), "registro")
        self.assertEqual(c("hidro", "IfcBuildingElementProxy", "REGISTRO DE PRESSÃO"), "registro")
        self.assertEqual(c("hidro", "IfcFlowMeter", "x"), "hidrometro")
        self.assertEqual(c("hidro", "IfcSanitaryTerminal", "Lavatório"), "ponto_agua")
        self.assertEqual(c("hidro", "IfcBuildingElementProxy", "Ponto de água fria"), "ponto_agua")
        self.assertIsNone(c("hidro", "IfcBuildingElementProxy", "Ralo seco"))

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
        # eletroduto é linha: fica fora
        self.assertIsNone(c("eletrico", "IfcCableCarrierSegment", "Eletroduto caixa 4x4"))
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

    def test_trecho_de_tubo_nao_e_ponto(self):
        c = instalacoes.classificar
        self.assertIsNone(c("hidro", "IfcFlowSegment", "Saída tubo"))
        self.assertIsNone(c("sanitario", "IfcFlowSegment", "Ralo tubo"))

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


class TestNaFolha(unittest.TestCase):
    def test_encaixe_ids_fixos_e_fora(self):
        pts = [{"modelo_id": "11", "tipo": "ralo", "nome": "Ralo seco", "x": 100.0, "y": 200.0},
               {"modelo_id": "99", "tipo": "caixa", "nome": "", "x": 5000.0, "y": 10.0}]
        enc = {"rotacao": [[1, 0], [0, -1]], "fator": 2.0, "t": [10.0, 700.0]}
        dentro, fora = instalacoes.pontos_na_folha(pts, enc, "sanitario", 1000.0, 800.0)
        pid = instalacoes.id_do_ponto("sanitario", "11")
        self.assertEqual(list(dentro), [pid])
        self.assertEqual(dentro[pid]["ponto"], [210.0, 300.0])
        self.assertEqual(fora, [{"modelo_id": "99", "tipo": "caixa", "nome": ""}])
        self.assertEqual(pid, instalacoes.id_do_ponto("sanitario", "11"))
        self.assertNotEqual(pid, instalacoes.id_do_ponto("hidro", "11"))

    def test_nome_padrao_e_resumo(self):
        dentro, fora = instalacoes.pontos_na_folha([{"modelo_id": "1", "tipo": "registro", "nome": "", "x": 1, "y": 1}], IDENT, "hidro", 10, 10)
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
        return {"instalacoes": {"encaixe": None, "disciplinas": {"sanitario": {"ifc": ["x.ifc"], "nivel": ["2º"]}}, **inst}}

    def test_folha_por_disciplina_com_encaixe_dos_furos(self):
        formas = [forma()]
        rel = publicar_planta.por_instalacoes(self.cfg(), {"instalacoes": {"sanitario": self.PONTOS}}, formas, {"encaixe": dict(IDENT)})
        self.assertEqual(rel["sanitario"]["pontos"], 1)
        self.assertEqual(len(formas), 2)
        fl = formas[1]
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


if __name__ == "__main__":
    unittest.main()

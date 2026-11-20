"""Furos de viga (pipeline/fvs/furos.py) e o furo no pacote (publicar_planta e pacote).
Dados fictícios da obra EXE; sem IFC (as propriedades são montadas à mão, no formato do ifcopenshell)."""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))

import furos  # noqa: E402
import pacote  # noqa: E402
import publicar_planta  # noqa: E402

try:
    import numpy  # noqa: F401

    TEM_NUMPY = True
except ImportError:  # no GitHub os scripts rodam sem numpy
    TEM_NUMPY = False


def quad(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]


def viga(nome, x0, y0, x1, y1):
    return {"tipo": "V", "nome": nome, "secao": "19x60", "rotulo": [x0, y0 - 8, x1, y0 - 2], "polys": [quad(x0, y0, x1, y1)]}


def pilar(nome, x0, y0, x1, y1):
    return {"tipo": "P", "nome": nome, "secao": "19x60", "rotulo": [x0, y1 + 2, x1, y1 + 8], "polys": [quad(x0, y0, x1, y1)]}


def psets(diametro=None, largura=None, altura=None, topo=25.0, fundo=30.0, nivel="2º PAVIMENTO (NO)", disc=("p.FURO.HID",)):
    dim = {"DIST.TOPO.VIGA": topo, "DIST.FUNDO.VIGA": fundo, "LARGURA.VIGA": 19.0, "ALTURA.VIGA": 60.0}
    if diametro:
        dim["FURO.DIAMETRO"] = diametro
    if largura:
        dim["FURO.LARGURA"] = largura
        dim["FURO.ALTURA"] = altura
    caixas = {k: (k in disc) for k in ("p.FURO.CLI", "p.FURO.ELT/TEL", "p.FURO.GERAL", "p.FURO.HID", "p.FURO.PCI/GÁS", "p.FURO.SAN")}
    return {"Dimensions": dim, "Constraints": {"Level": nivel}, "Materials and Finishes": caixas}


def furo(ident, x, y, **kw):
    return furos.furo_das_propriedades("Furação circular viga:Furo Ø 100 mm", psets(diametro=10.0, **kw), x, y, ident)


IDENT = {"rotacao": [[1.0, 0.0], [0.0, 1.0]], "fator": 1.0, "t": [0.0, 0.0]}


class TestPropriedades(unittest.TestCase):
    def test_circular_de_viga(self):
        f = furos.furo_das_propriedades("Furação circular viga-R01:Furação viga Ø 100 mm:123", psets(diametro=10.0), 5, 6, "123")
        self.assertEqual(f["forma"], "circular")
        self.assertEqual(f["diametro"], 10.0)
        self.assertEqual((f["topo"], f["fundo"], f["largura_viga"]), (25.0, 30.0, 19.0))
        self.assertEqual(f["disciplinas"], ["Hidráulica"])
        self.assertEqual((f["x"], f["y"], f["id"]), (5.0, 6.0, "123"))
        self.assertEqual(furos.secao_do_furo(f), "Ø 10 cm · 25 cm do topo")

    def test_retangular_e_decimal(self):
        f = furos.furo_das_propriedades("Furação retangular viga:FURAÇÃO VIGA", psets(largura=175.0, altura=15.0, topo=62.0, disc=("p.FURO.PCI/GÁS", "p.FURO.SAN")), 0, 0)
        self.assertEqual(furos.secao_do_furo(f), "175×15 cm · 62 cm do topo")
        self.assertEqual(f["disciplinas"], ["Sanitário / drenagem", "Incêndio / gás"])
        g = furos.furo_das_propriedades("Furação circular viga", psets(diametro=7.5, topo=None), 0, 0)
        self.assertEqual(furos.secao_do_furo(g), "Ø 7,5 cm")

    def test_outro_objeto_fica_de_fora(self):
        self.assertIsNone(furos.furo_das_propriedades("Viga qualquer", psets(diametro=5.0), 0, 0))
        self.assertIsNone(furos.furo_das_propriedades("Laje qualquer", psets(diametro=5.0), 0, 0))

    def test_furo_de_laje(self):
        """Item 4 (19/11): o furo de laje entra, sem viga; diâmetro em Other ou Dimensions, espessura da laje."""
        ps = {"Dimensions": {"ALTURA.LAJE": 20.0}, "Other": {"FURO.DIAMETRO": 15.0}, "Constraints": {"Level": "2º PAVIMENTO (NO)"},
              "Materials and Finishes": {"p.FURO.SAN": True, "p.FURO.HID": False}}
        f = furos.furo_das_propriedades("FED_Furação circular laje-R01:Furação laje Ø 150mm:9", ps, 3, 4, "9")
        self.assertEqual((f["forma"], f["laje"], f["diametro"], f["espessura"]), ("circular", True, 15.0, 20.0))
        self.assertEqual(f["disciplinas"], ["Sanitário / drenagem"])
        self.assertNotIn("topo", f)
        self.assertEqual(furos.secao_do_furo(f), "Ø 15 cm")
        r = furos.furo_das_propriedades("FED_Furação retangular laje-R01:x", {"Dimensions": {"FURO.LARGURA": 40.0, "FURO.ALTURA": 20.0}}, 0, 0, "r")
        self.assertEqual((r["forma"], r["largura"], r["altura"], r["disciplinas"]), ("retangular", 40.0, 20.0, []))

    def test_nivel_sem_acento_e_com_letra_estragada(self):
        self.assertTrue(furos.mesmo_nivel("TÉRREO COMERCIAL (NO)", "Terreo comercial (NO)"))
        self.assertTrue(furos.mesmo_nivel("T�RREO COMERCIAL (NO)", "TÉRREO COMERCIAL (NO)"))
        self.assertTrue(furos.mesmo_nivel("2� PAVIMENTO (NO)", "2º PAVIMENTO (NO)"))
        self.assertFalse(furos.mesmo_nivel("3º PAVIMENTO (NO)", "2º PAVIMENTO (NO)"))
        self.assertFalse(furos.mesmo_nivel("", "2º PAVIMENTO (NO)"))


class TestGeometria(unittest.TestCase):
    def test_ponto_e_distancia(self):
        q = quad(0, 0, 10, 4)
        self.assertTrue(furos.ponto_dentro(5, 2, q))
        self.assertFalse(furos.ponto_dentro(5, 6, q))
        self.assertEqual(furos.dist_ao_poligono(5, 2, q), 0.0)
        self.assertAlmostEqual(furos.dist_ao_poligono(5, 7, q), 3.0)

    def test_transformar(self):
        enc = {"rotacao": [[1.0, 0.0], [0.0, -1.0]], "fator": 0.5, "t": [100.0, 200.0]}
        self.assertEqual(furos.transformar(enc, 10, 20), (105.0, 190.0))

    def test_as_8_orientacoes_sao_distintas(self):
        self.assertEqual(len({json.dumps(r) for r in furos.ROTACOES}), 8)


class TestDistribuir(unittest.TestCase):
    def setUp(self):
        self.pecas = [viga("V1", 0, 0, 200, 10), viga("V2", 300, 0, 310, 200), pilar("P1", 200, 0, 220, 20)]

    def test_nome_pela_ordem_ao_longo_da_viga(self):
        fs = [furo("a", 150, 5), furo("b", 20, 5), furo("c", 305, 100), furo("d", 500, 500)]
        locais, rel = furos.distribuir_furos(fs, self.pecas, IDENT)
        nomes = {(p["nome"], p["furo"]["modelo_id"]) for p in locais}
        self.assertEqual(nomes, {("V1-F1", "b"), ("V1-F2", "a"), ("V2-F1", "c")})
        self.assertEqual(rel["em_viga"], 3)
        self.assertEqual(rel["vigas_com_furo"], 2)
        self.assertEqual([s["id"] for s in rel["sem_viga"]], ["d"])
        p = next(p for p in locais if p["nome"] == "V1-F1")
        self.assertEqual(p["tipo"], "F")
        self.assertEqual(p["viga"], "V1")
        self.assertEqual(p["secao"], "Ø 10 cm · 25 cm do topo")
        self.assertEqual(len(p["polys"][0]), 8)
        self.assertTrue(furos.ponto_dentro(20, 5, p["polys"][0]))

    def test_furo_na_folga_da_viga_entra(self):
        locais, rel = furos.distribuir_furos([furo("a", 100, 12)], self.pecas, IDENT, folga_cm=3.0)
        self.assertEqual([p["nome"] for p in locais], ["V1-F1"])
        locais, rel = furos.distribuir_furos([furo("a", 100, 20)], self.pecas, IDENT, folga_cm=3.0)
        self.assertEqual(locais, [])
        self.assertEqual(len(rel["sem_viga"]), 1)

    def test_folga_padrao_de_10_cm_de_obra(self):
        """Na folha 1:50, a folga é de 10 cm de obra: 8 cm fora da viga entra, 12 cm fica fora."""
        fator = furos.PT_POR_CM_PAPEL / 50  # pontos da folha por cm de obra
        enc = {"rotacao": [[1.0, 0.0], [0.0, 1.0]], "fator": fator, "t": [0.0, 0.0]}
        self.assertEqual(furos.FOLGA_CM, 10.0)
        # V1 vai de y=0 a y=10 pontos; o furo está em cm de obra (x, y) e cai em (x, y) * fator na folha
        y_borda = 10 / fator  # a borda de cima da V1, em cm de obra
        locais, rel = furos.distribuir_furos([furo("a", 100 / fator, y_borda + 8)], self.pecas, enc)
        self.assertEqual([p["nome"] for p in locais], ["V1-F1"])
        locais, rel = furos.distribuir_furos([furo("a", 100 / fator, y_borda + 12)], self.pecas, enc)
        self.assertEqual(locais, [])
        self.assertEqual(len(rel["sem_viga"]), 1)

    def test_na_folga_de_duas_vigas_vale_a_mais_perto(self):
        pecas = [viga("V1", 0, 0, 100, 10), viga("V2", 0, 16, 100, 26)]
        locais, _ = furos.distribuir_furos([furo("a", 50, 14)], pecas, IDENT)
        self.assertEqual([p["viga"] for p in locais], ["V2"])
        locais, _ = furos.distribuir_furos([furo("a", 50, 12)], pecas, IDENT)
        self.assertEqual([p["viga"] for p in locais], ["V1"])

    def test_furos_de_laje_entram_sem_viga(self):
        forma = {"pecas": list(self.pecas)}
        laje = lambda i, x, y, d=("p.FURO.SAN",): {**furo(i, x, y, disc=d), "laje": True}
        rel = furos.juntar_furos(forma, [furo("a", 20, 5), laje("l2", 400, 300), laje("l1", 50, 300, ("p.FURO.ELT/TEL",)), laje("l3", 10, 900)], encaixe=IDENT)
        fl = [p for p in forma["pecas"] if p["tipo"] == "F" and p["nome"].startswith("FL")]
        # de cima para baixo, da esquerda para a direita
        self.assertEqual([(p["nome"], p["furo"]["modelo_id"]) for p in fl], [("FL1", "l1"), ("FL2", "l2"), ("FL3", "l3")])
        self.assertTrue(all(p["furo"]["laje"] is True and "viga" not in p for p in fl))
        self.assertEqual((rel["furos"], rel["em_viga"], rel["em_laje"]), (1, 1, 3))
        self.assertEqual(rel["laje_por_disciplina"], {"Sanitário / drenagem": 2, "Elétrica / telecom": 1})
        self.assertEqual(rel["sem_viga"], [])  # furo de laje não conta como fora de viga
        with self.assertRaises(furos.ErroFuros):  # só laje e sem encaixe: não dá para votar
            furos.juntar_furos({"pecas": list(self.pecas)}, [laje("l1", 1, 1)])

    def test_juntar_furos_troca_os_furos_antigos(self):
        forma = {"pecas": list(self.pecas)}
        furos.juntar_furos(forma, [furo("a", 20, 5)], encaixe=IDENT)
        furos.juntar_furos(forma, [furo("a", 20, 5), furo("b", 150, 5)], encaixe=IDENT)
        self.assertEqual(sorted(p["nome"] for p in forma["pecas"] if p["tipo"] == "F"), ["V1-F1", "V1-F2"])
        rel = furos.juntar_furos(forma, [], encaixe=IDENT)
        self.assertEqual(rel["furos"], 0)
        self.assertFalse(any(p["tipo"] == "F" for p in forma["pecas"]))


class TestItemDeFuracao(unittest.TestCase):
    """Decisão do Nicolas (18/11): sem ficha de furo; os furos marcam o item de furação da ficha de viga."""

    def test_exemplo_da_ficha_de_viga(self):
        import publicar_fichas
        dados = json.loads((RAIZ / "pipeline" / "fvs" / "fichas_viga.exemplo.json").read_text(encoding="utf-8"))
        f = publicar_fichas.normalizar(dados)[0]
        self.assertEqual(f["aplica_a"], ["V"])
        self.assertEqual([i["n"] for i in f["itens"] if i.get("furos")], [3])

    def test_legado_passa_a_marca(self):
        import publicar_fichas
        f = publicar_fichas.normalizar({"V": {"codigo": "EXE-2", "titulo": "Viga", "itens": [
            {"n": 1, "etapa": "EXECUÇÃO", "titulo": "Armação"}, {"n": 2, "etapa": "EXECUÇÃO", "titulo": "Passagens em vigas", "furos": True}]}})[0]
        self.assertNotIn("furos", f["itens"][0])
        self.assertIs(f["itens"][1]["furos"], True)

    def test_recusa_item_de_furacao_errado(self):
        import publicar_fichas

        def ficha(itens, aplica_a=("V",)):
            return [{"codigo": "EXE-2", "titulo": "t", "aplica_a": list(aplica_a), "itens": itens}]
        item = {"n": 1, "etapa": "EXECUÇÃO", "titulo": "Passagens", "furos": True}
        with self.assertRaises(publicar_fichas.ErroFichas):
            publicar_fichas.normalizar(ficha([item], ("P",)))
        with self.assertRaises(publicar_fichas.ErroFichas):
            publicar_fichas.normalizar(ficha([{**item, "furos": "sim"}]))
        with self.assertRaises(publicar_fichas.ErroFichas):
            publicar_fichas.normalizar(ficha([item, {**item, "n": 2}]))
        self.assertTrue(publicar_fichas.normalizar(ficha([item]))[0]["itens"][0]["furos"])


class TestDuvidoso(unittest.TestCase):
    def test_encaixe_duvidoso(self):
        self.assertFalse(furos.encaixe_duvidoso({"dentro": 159, "segundo": 106, "total": 175}))
        # outra orientação quase empatada (o térreo de teste: 13 contra 12)
        self.assertTrue(furos.encaixe_duvidoso({"dentro": 13, "segundo": 12, "total": 20}))
        # menos da metade dos furos em viga
        self.assertTrue(furos.encaixe_duvidoso({"dentro": 10, "segundo": 2, "total": 28}))
        # encaixe passado à mão: não há o que comparar
        self.assertFalse(furos.encaixe_duvidoso({"dentro": None}))


@unittest.skipUnless(TEM_NUMPY, "encaixe precisa de numpy")
class TestEncaixe(unittest.TestCase):
    def test_acha_giro_espelho_e_deslocamento(self):
        # planta: vigas numa grade irregular; os furos do "modelo" são os pontos da planta levados de volta
        pecas = [viga("V1", 0, 0, 400, 11), viga("V2", 0, 150, 260, 161), viga("V3", 120, 300, 400, 311),
                 viga("V4", 0, 0, 11, 311), viga("V5", 200, 0, 211, 161), viga("V6", 389, 100, 400, 311)]
        alvo = furos.ROTACOES[5]
        fator = furos.PT_POR_CM_PAPEL / 50
        t = (812.0, -95.0)
        na_planta = [(50, 5), (300, 5), (100, 155), (230, 155), (150, 305), (350, 305), (5, 80), (5, 250), (205, 60), (395, 200)]
        (a, b), (c, d) = alvo
        det = a * d - b * c
        inv = [[d / det, -b / det], [-c / det, a / det]]
        modelo = []
        for x, y in na_planta:
            u, v = (x - t[0]) / fator, (y - t[1]) / fator
            modelo.append((inv[0][0] * u + inv[0][1] * v, inv[1][0] * u + inv[1][1] * v))
        enc = furos.encaixar(modelo, [(p["nome"], p["polys"]) for p in pecas], 50.0, ajustes=(1.0,))
        self.assertEqual(enc["dentro"], len(na_planta))
        self.assertEqual(enc["total"], len(na_planta))
        self.assertLess(enc["segundo"], len(na_planta))
        for (x, y), (mx, my) in zip(na_planta, modelo):
            px, py = furos.transformar(enc, mx, my)
            self.assertLess(abs(px - x) + abs(py - y), 6)

    def test_sem_vigas_ou_sem_furos(self):
        self.assertIsNone(furos.encaixar([], [("V1", [quad(0, 0, 1, 1)])]))
        self.assertIsNone(furos.encaixar([(0, 0)], []))
        with self.assertRaises(furos.ErroFuros):
            furos.juntar_furos({"pecas": [pilar("P1", 0, 0, 1, 1)]}, [furo("a", 0, 0)])


class TestPacote(unittest.TestCase):
    CAB = {"planta_id": "p", "trecho": "T", "prancha": "EXE.FOR", "revisao": "R00", "largura": 10, "altura": 10, "tile": 512, "niveis": [0]}

    def forma(self):
        return {"prancha": "EXE.ES.LO.129.FOR-R03", "revisao": "R03", "largura": 500, "altura": 500, "tile": 512, "niveis": [0],
                "tiles": {"0/0/0": b"T"}, "trecho": "Planta inteira", "pecas": [viga("V1", 0, 0, 200, 10), pilar("P1", 200, 0, 220, 20)]}

    def test_montar_trecho_com_furos(self):
        fm = self.forma()
        rel_f = furos.juntar_furos(fm, [furo("m1", 20, 5), furo("m2", 900, 900)], encaixe=IDENT)
        self.assertEqual(rel_f["em_viga"], 1)
        detalhes = {"P": {"P1": {"chave": "P_P1", "titulo": "P1", "prancha": "EXE.PIL", "img": b"D", "aco": None, "situacao": "termina"}},
                    "V": {"V1": {"chave": "V_V1", "titulo": "V1", "prancha": "EXE.VIG", "img": b"E", "aco": None}}}
        ids = {("V", "V1"): "v1", ("P", "P1"): "p1", ("F", "V1-F1"): "f1"}
        man, binario, rel = publicar_planta.montar_trecho(fm, detalhes, ids, {"planta_id": "p", "trecho": "T"})
        m, _ = pacote.ler(man, binario)
        f = m["elementos"]["f1"]
        self.assertEqual((f["tipo"], f["nome"], f["viga"]), ("F", "V1-F1", "v1"))
        self.assertEqual(f["furo"]["diametro"], 10.0)
        self.assertEqual(f["furo"]["disciplinas"], ["Hidráulica"])
        self.assertNotIn("detalhe", f)
        self.assertEqual(rel["furos"], 1)
        self.assertEqual(rel["sem_detalhe"], [])  # furo não tem prancha de detalhe

    def test_pacote_recusa_furo_sem_viga(self):
        v = viga("V1", 0, 0, 1, 1)
        f = {"tipo": "F", "nome": "V1-F1", "secao": "", "rotulo": [0, 0, 1, 1], "polys": [], "viga": "v", "furo": {"forma": "circular"}}
        pacote.montar(self.CAB, {}, {"v": v, "f": f}, {})
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(self.CAB, {}, {"f": f}, {})
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(self.CAB, {}, {"v": v, "f": {**f, "furo": None}}, {})
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(self.CAB, {}, {"v": {**v, "viga": "x"}}, {})
        p = pilar("P1", 0, 0, 1, 1)
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(self.CAB, {}, {"p": p, "f": {**f, "viga": "p"}}, {})

    def test_pacote_com_furo_de_laje(self):
        fm = self.forma()
        furos.juntar_furos(fm, [furo("m1", 20, 5), {**furo("l1", 100, 300), "laje": True}], encaixe=IDENT)
        detalhes = {"P": {"P1": {"chave": "P_P1", "titulo": "P1", "prancha": "EXE.PIL", "img": b"D", "aco": None, "situacao": "termina"}},
                    "V": {"V1": {"chave": "V_V1", "titulo": "V1", "prancha": "EXE.VIG", "img": b"E", "aco": None}}}
        ids = {("V", "V1"): "v1", ("P", "P1"): "p1", ("F", "V1-F1"): "f1", ("F", "FL1"): "fl1"}
        man, binario, _ = publicar_planta.montar_trecho(fm, detalhes, ids, {"planta_id": "p", "trecho": "T"})
        m, _ = pacote.ler(man, binario)
        f = m["elementos"]["fl1"]
        self.assertEqual((f["tipo"], f["nome"]), ("F", "FL1"))
        self.assertNotIn("viga", f)
        self.assertEqual((f["furo"]["laje"], f["furo"]["disciplinas"]), (True, ["Hidráulica"]))
        # furo de laje com viga, ou laje que não é true: recusa / vira furo de viga comum
        v = viga("V1", 0, 0, 1, 1)
        fl = {"tipo": "F", "nome": "FL1", "secao": "", "rotulo": [0, 0, 1, 1], "polys": [], "furo": {"forma": "circular", "laje": True}}
        pacote.montar(self.CAB, {}, {"f": fl}, {})
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(self.CAB, {}, {"v": v, "f": {**fl, "viga": "v"}}, {})
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(self.CAB, {}, {"f": {**fl, "furo": {"forma": "circular", "laje": "sim"}}}, {})

    def test_campo_estranho_do_furo_nao_entra(self):
        v = viga("V1", 0, 0, 1, 1)
        f = {"tipo": "F", "nome": "V1-F1", "secao": "", "rotulo": [0, 0, 1, 1], "polys": [], "viga": "v",
             "furo": {"forma": "circular", "diametro": 10, "x": 1, "script": "<b>"}}
        m, _ = pacote.ler(*pacote.montar(self.CAB, {}, {"v": v, "f": f}, {}))
        self.assertEqual(m["elementos"]["f"]["furo"], {"forma": "circular", "diametro": 10})


class TestPublicarPlanta(unittest.TestCase):
    def test_config_dos_furos(self):
        with tempfile.TemporaryDirectory() as d:
            base = pathlib.Path(d)
            (base / "EXE_furacao.ifc").write_text("x")
            (base / "f.pdf").write_text("x")
            cfg = {"obra": "EXE", "pavimento": "2º Pavimento", "formas": [{"trecho": "T1", "pdf": "f.pdf"}], "folha_unica": True,
                   "furos": {"ifc": "EXE_furacao.ifc", "nivel": "2º PAVIMENTO (NO)"}}
            (base / "pav.json").write_text(json.dumps(cfg), encoding="utf-8")
            lido = publicar_planta.ler_config(base / "pav.json")
            self.assertEqual(lido["furos"]["nivel"], ["2º PAVIMENTO (NO)"])
            self.assertTrue(lido["furos"]["ifc"].endswith("EXE_furacao.ifc"))
            cfg["furos"] = {"ifc": "nao_tem_*.ifc", "nivel": "X"}
            (base / "pav.json").write_text(json.dumps(cfg), encoding="utf-8")
            with self.assertRaises(publicar_planta.ErroPublicacao):
                publicar_planta.ler_config(base / "pav.json")
            cfg["furos"] = {"ifc": "EXE_furacao.ifc"}
            (base / "pav.json").write_text(json.dumps(cfg), encoding="utf-8")
            with self.assertRaises(publicar_planta.ErroPublicacao):
                publicar_planta.ler_config(base / "pav.json")

    def test_por_furos_so_com_folha_unica(self):
        cfg = {"furos": {"ifc": "m.ifc", "nivel": ["X"], "encaixe": IDENT}}
        fm1 = TestPacote().forma()
        with self.assertRaises(publicar_planta.ErroPublicacao):
            publicar_planta.por_furos(cfg, {"furos": []}, [fm1, TestPacote().forma()])
        rel = publicar_planta.por_furos(cfg, {"furos": [furo("a", 20, 5)]}, [fm1])
        self.assertEqual(rel["em_viga"], 1)
        self.assertIsNone(publicar_planta.por_furos({"furos": None}, {}, [fm1]))

    def test_so_gerar_grava_os_furos_no_relatorio(self):
        fm = TestPacote().forma()
        cfg = {"obra": "EXE", "pavimento": "2º Pavimento", "det_pilares": [], "det_vigas": [], "manter_sem_detalhe": ["P", "V"],
               "furos": {"ifc": "m.ifc", "nivel": ["X"], "encaixe": IDENT}}
        detalhes = {"P": {}, "V": {}, "furos": [furo("a", 20, 5), furo("fora", 900, 900)]}
        with tempfile.TemporaryDirectory() as d:
            args = argparse.Namespace(so_gerar=d)
            publicar_planta.publicar_lidas(cfg, detalhes, [fm], args)
            rel = json.loads((pathlib.Path(d) / "relatorio.json").read_text(encoding="utf-8"))
            self.assertEqual(rel["furos"]["em_viga"], 1)
            self.assertEqual([s["id"] for s in rel["furos"]["sem_viga"]], ["fora"])
            self.assertEqual(rel["pecas_unicas"]["F"], 1)
            self.assertIn({"id": publicar_planta.id_local("EXE", "2º Pavimento", "F", "V1-F1"), "tipo": "F", "nome": "V1-F1",
                           "secao": "Ø 10 cm · 25 cm do topo"}, rel["pecas"])
            man = json.loads((pathlib.Path(d) / "Planta_inteira" / "manifest.json").read_text(encoding="utf-8"))
            f = man["elementos"][publicar_planta.id_local("EXE", "2º Pavimento", "F", "V1-F1")]
            self.assertEqual(f["viga"], publicar_planta.id_local("EXE", "2º Pavimento", "V", "V1"))


class TestParede(unittest.TestCase):
    """Furo "de viga" cuja peça, no modelo, tem 2 m ou mais de altura: parede ou cortina (Térreo comercial, 20/11)."""

    def test_furo_de_parede_fica_fora_da_viga_com_motivo(self):
        pecas = [viga("V1", 0, 0, 200, 10)]
        parede = furo("p", 50, 5)
        parede["altura_viga"] = 310.0
        locais, rel = furos.distribuir_furos([furo("a", 20, 5), parede], pecas, IDENT)
        self.assertEqual([p["furo"]["modelo_id"] for p in locais], ["a"])
        self.assertEqual(rel["em_parede"], 1)
        s = rel["sem_viga"][0]
        self.assertEqual((s["id"], s["viga_perto"], s["dist_cm"], s["altura_viga"]), ("p", "V1", 0, 310.0))
        self.assertIn("parede ou cortina", s["motivo"])
        self.assertNotIn("altura_viga", locais[0]["furo"])  # o pacote não muda

    def test_viga_alta_ainda_e_viga(self):
        f = furo("a", 20, 5)
        f["altura_viga"] = 170.0  # viga parede de 170 cm: continua viga
        locais, rel = furos.distribuir_furos([f], [viga("V1", 0, 0, 200, 10)], IDENT)
        self.assertEqual(len(locais), 1)
        self.assertEqual(rel["em_parede"], 0)

    def test_altura_lida_do_modelo(self):
        self.assertEqual(furo("a", 0, 0)["altura_viga"], 60.0)

    def test_fora_de_viga_diz_a_viga_mais_perto(self):
        fator = furos.PT_POR_CM_PAPEL / 50
        enc = {"rotacao": [[1.0, 0.0], [0.0, 1.0]], "fator": fator, "t": [0.0, 0.0]}
        _, rel = furos.distribuir_furos([furo("a", 100 / fator, (10 + 50 * fator) / fator)], [viga("V1", 0, 0, 200, 10)], enc)
        self.assertEqual((rel["sem_viga"][0]["viga_perto"], rel["sem_viga"][0]["dist_cm"]), ("V1", 50))
        self.assertNotIn("motivo", rel["sem_viga"][0])


class TestReferencia(unittest.TestCase):
    """Encaixe pelos pilares de outro pavimento do mesmo modelo (Térreo comercial, 20/11)."""

    PILARES = {"P1": (100.0, 100.0), "P2": (700.0, 120.0), "P3": (400.0, 500.0), "P4": (90.0, 800.0),
               "P5": (650.0, 760.0), "P6": (300.0, 300.0), "P7": (520.0, 260.0)}

    def setUp(self):
        self.enc_ref = {"rotacao": [[1.0, 0.0], [0.0, -1.0]], "fator": furos.PT_POR_CM_PAPEL / 50, "t": [812.0, 905.0]}

    def alvo(self, R, s, t, pilares=None):
        return {n: (s * (R[0][0] * x + R[0][1] * y) + t[0], s * (R[1][0] * x + R[1][1] * y) + t[1])
                for n, (x, y) in (pilares or self.PILARES).items()}

    def confere(self, enc, R, s, t):
        for mx, my in ((0.0, 0.0), (1234.0, -567.0), (-300.0, 2000.0)):
            rx, ry = furos.transformar(self.enc_ref, mx, my)
            ex = s * (R[0][0] * rx + R[0][1] * ry) + t[0]
            ey = s * (R[1][0] * rx + R[1][1] * ry) + t[1]
            px, py = furos.transformar(enc, mx, my)
            self.assertAlmostEqual(px, ex, places=6)
            self.assertAlmostEqual(py, ey, places=6)

    def test_so_deslocamento(self):
        R = [[1.0, 0.0], [0.0, 1.0]]
        enc = furos.encaixe_pela_referencia(self.enc_ref, self.PILARES, self.alvo(R, 1.0, (-32.7, -130.2)))
        self.confere(enc, R, 1.0, (-32.7, -130.2))
        self.assertEqual((enc["metodo"], enc["pilares"], enc["erro_cm"], enc["pilares_fora"]), ("pilares", 7, 0.0, []))
        self.assertFalse(furos.encaixe_duvidoso(enc))

    def test_giro_e_escala(self):
        R = furos.ROTACOES[1]  # 90 graus
        enc = furos.encaixe_pela_referencia(self.enc_ref, self.PILARES, self.alvo(R, 1.01, (5000.0, -20.0)))
        self.confere(enc, R, 1.01, (5000.0, -20.0))
        self.assertIn(enc["rotacao"], furos.ROTACOES)

    def test_pilar_que_nao_bate_sai_da_conta(self):
        R = [[1.0, 0.0], [0.0, 1.0]]
        alvo = self.alvo(R, 1.0, (10.0, 20.0))
        alvo["P3"] = (alvo["P3"][0] + 300, alvo["P3"][1])  # pilar trocado de lugar (ou de nome)
        alvo["P99"] = (0.0, 0.0)  # só no alvo: não conta
        enc = furos.encaixe_pela_referencia(self.enc_ref, self.PILARES, alvo)
        self.confere(enc, R, 1.0, (10.0, 20.0))
        self.assertEqual((enc["pilares"], enc["pilares_fora"]), (6, ["P3"]))

    def test_poucos_pilares_ou_que_nao_batem(self):
        R = [[1.0, 0.0], [0.0, 1.0]]
        poucos = {n: c for n, c in self.PILARES.items() if n in ("P1", "P2", "P3")}
        with self.assertRaises(furos.ErroFuros):
            furos.encaixe_pela_referencia(self.enc_ref, poucos, self.alvo(R, 1.0, (0, 0), poucos))
        baguncado = {n: (float(i * 997 % 800), float(i * 389 % 700)) for i, n in enumerate(self.PILARES, 1)}
        with self.assertRaises(furos.ErroFuros):
            furos.encaixe_pela_referencia(self.enc_ref, self.PILARES, baguncado)

    def test_pilares_da_planta(self):
        pecas = [pilar("P1", 0, 0, 20, 60), pilar("P2", 100, 0, 120, 60), pilar("P2", 300, 0, 320, 60), viga("V1", 0, 0, 1, 1)]
        self.assertEqual(furos.pilares_da_planta(pecas), {"P1": (10.0, 30.0)})  # P2 repetido fica de fora

    def test_publicar_com_referencia(self):
        """A pasta gerada de um pavimento serve de referência para o outro (pavimento.json "referencia")."""
        R = [[1.0, 0.0], [0.0, 1.0]]
        # referência: só os pilares (o manifest) e o encaixe (o relatorio.json)
        ref_pecas = [pilar(n, x - 10, y - 30, x + 10, y + 30) for n, (x, y) in self.PILARES.items()]
        man_ref = {"elementos": {f"id{k}": p for k, p in enumerate(ref_pecas)}}
        rel_ref = {"furos": {"encaixe": {**self.enc_ref, "duvidoso": False}}, "trechos": [{"pasta": "Planta_inteira"}]}
        # esta folha: os mesmos pilares deslocados e uma viga onde o furo cai
        alvo = self.alvo(R, 1.0, (40.0, -60.0))
        pecas = [pilar(n, x - 10, y - 30, x + 10, y + 30) for n, (x, y) in alvo.items()]
        rx, ry = furos.transformar(self.enc_ref, 300.0, -500.0)
        fx, fy = rx + 40.0, ry - 60.0
        pecas.append(viga("V9", fx - 50, fy - 5, fx + 50, fy + 5))
        with tempfile.TemporaryDirectory() as d:
            pasta = pathlib.Path(d) / "03_ref"
            (pasta / "Planta_inteira").mkdir(parents=True)
            (pasta / "relatorio.json").write_text(json.dumps(rel_ref), encoding="utf-8")
            (pasta / "Planta_inteira" / "manifest.json").write_text(json.dumps(man_ref), encoding="utf-8")
            cfg = {"furos": {"ifc": "m.ifc", "nivel": ["X"], "referencia": str(pasta)}}
            rel = publicar_planta.por_furos(cfg, {"furos": [furo("a", 300.0, -500.0)]}, [{**TestPacote().forma(), "pecas": list(pecas)}])
            self.assertEqual(rel["em_viga"], 1)
            self.assertEqual((rel["encaixe"]["metodo"], rel["encaixe"]["referencia"], rel["encaixe"]["pilares"]), ("pilares", "03_ref", 7))
            self.assertFalse(rel["encaixe"]["duvidoso"])
            # referência com encaixe duvidoso: recusa
            rel_ref["furos"]["encaixe"]["duvidoso"] = True
            (pasta / "relatorio.json").write_text(json.dumps(rel_ref), encoding="utf-8")
            with self.assertRaises(publicar_planta.ErroPublicacao):
                publicar_planta.por_furos(cfg, {"furos": [furo("a", 300.0, -500.0)]}, [{**TestPacote().forma(), "pecas": list(pecas)}])

    def test_config_da_referencia(self):
        with tempfile.TemporaryDirectory() as d:
            base = pathlib.Path(d)
            (base / "EXE_furacao.ifc").write_text("x")
            (base / "f.pdf").write_text("x")
            cfg = {"obra": "EXE", "pavimento": "Térreo", "formas": [{"trecho": "T1", "pdf": "f.pdf"}], "folha_unica": True,
                   "furos": {"ifc": "EXE_furacao.ifc", "nivel": "TÉRREO (NO)", "referencia": "pacotes/03_pilotis"}}
            (base / "pav.json").write_text(json.dumps(cfg), encoding="utf-8")
            with self.assertRaises(publicar_planta.ErroPublicacao):  # a pasta ainda não foi gerada
                publicar_planta.ler_config(base / "pav.json")
            (base / "pacotes" / "03_pilotis").mkdir(parents=True)
            (base / "pacotes" / "03_pilotis" / "relatorio.json").write_text("{}", encoding="utf-8")
            lido = publicar_planta.ler_config(base / "pav.json")
            self.assertEqual(pathlib.Path(lido["furos"]["referencia"]), base / "pacotes" / "03_pilotis")


class TestDeOutroPavimento(unittest.TestCase):
    """Furo do nível de outro pavimento que cai numa viga deste (a viga do subsolo desenhada no térreo, 20/11)."""

    def test_filtro(self):
        fs = [furo("ja", 0, 0), furo("nao", 0, 0), {**furo("laje", 0, 0), "laje": True}]
        vindos = furos.furos_de_outro_pavimento(fs, {"ja"}, "02_terreo")
        self.assertEqual([(f["id"], f["de"]) for f in vindos], [("nao", "02_terreo")])

    def test_so_entra_o_que_cai_em_viga_daqui(self):
        pecas = [viga("V1", 0, 0, 200, 10)]
        vindos = furos.furos_de_outro_pavimento([furo("dentro", 50, 5), furo("longe", 900, 900)], set(), "02_terreo")
        parede = {**furo("parede", 80, 5), "altura_viga": 310.0, "de": "02_terreo"}
        locais, rel = furos.distribuir_furos([furo("meu", 20, 5)] + vindos + [parede], pecas, IDENT)
        self.assertEqual([(p["nome"], p["furo"]["modelo_id"]) for p in locais], [("V1-F1", "meu"), ("V1-F2", "dentro")])
        self.assertEqual(rel["de_outro_pavimento"], [{"id": "dentro", "furo": "V1-F2", "de": "02_terreo"}])
        self.assertEqual(rel["sem_viga"], [])  # o que não caiu aqui segue só no relatório do outro pavimento
        self.assertEqual((rel["furos"], rel["em_viga"]), (2, 2))

    def test_sem_vindos_nao_poe_a_chave(self):
        _, rel = furos.distribuir_furos([furo("meu", 20, 5)], [viga("V1", 0, 0, 200, 10)], IDENT)
        self.assertNotIn("de_outro_pavimento", rel)

    def test_encaixe_votado_pelos_do_proprio_nivel(self):
        forma = {"pecas": [viga("V1", 0, 0, 200, 10)]}
        rel = furos.juntar_furos(forma, [{**furo("v", 50, 5), "de": "x"}], encaixe=IDENT)
        self.assertEqual(rel["em_viga"], 1)

    def test_config_e_leitura_da_pasta(self):
        with tempfile.TemporaryDirectory() as d:
            base = pathlib.Path(d)
            (base / "EXE_furacao.ifc").write_text("x")
            (base / "f.pdf").write_text("x")
            cfg = {"obra": "EXE", "pavimento": "Subsolo", "formas": [{"trecho": "T1", "pdf": "f.pdf"}], "folha_unica": True,
                   "furos": {"ifc": "EXE_furacao.ifc", "de_outro_pavimento": [{"nivel": "TÉRREO (NO)", "pasta": "pacotes/02_terreo"}]}}
            (base / "pav.json").write_text(json.dumps(cfg), encoding="utf-8")
            with self.assertRaises(publicar_planta.ErroPublicacao):  # a pasta do outro pavimento ainda não foi gerada
                publicar_planta.ler_config(base / "pav.json")
            pasta = base / "pacotes" / "02_terreo"
            (pasta / "Planta_inteira").mkdir(parents=True)
            (pasta / "relatorio.json").write_text(json.dumps({"trechos": [{"pasta": "Planta_inteira"}]}), encoding="utf-8")
            man = {"elementos": {"a": {"tipo": "F", "viga": "v", "furo": {"modelo_id": "123"}},
                                 "b": {"tipo": "F", "furo": {"modelo_id": "999", "laje": True}},
                                 "v": {"tipo": "V", "nome": "V1"}}}
            (pasta / "Planta_inteira" / "manifest.json").write_text(json.dumps(man), encoding="utf-8")
            lido = publicar_planta.ler_config(base / "pav.json")  # "nivel" pode ficar vazio
            self.assertEqual(lido["furos"]["nivel"], [])
            self.assertEqual(pathlib.Path(lido["furos"]["de_outro_pavimento"][0]["pasta"]), pasta)
            self.assertEqual(publicar_planta.ids_em_viga(str(pasta)), {"123"})
            cfg["furos"]["de_outro_pavimento"] = [{"nivel": "X"}]
            (base / "pav.json").write_text(json.dumps(cfg), encoding="utf-8")
            with self.assertRaises(publicar_planta.ErroPublicacao):
                publicar_planta.ler_config(base / "pav.json")


if __name__ == "__main__":
    unittest.main()

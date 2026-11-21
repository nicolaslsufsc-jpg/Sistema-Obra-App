"""Modulação de paredes (pipeline/fvs/vedacao.py, 20/11/2026): cada parede de alvenaria do pavimento é um local
"M" da planta de modulação. Geometria fictícia da obra EXE (um apartamento 101 de dois cômodos e o corredor)."""

from __future__ import annotations

import pathlib
import sys
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))
sys.path.insert(0, str(RAIZ / "pipeline" / "testes"))

try:
    from shapely.geometry import box  # noqa: E402

    import vedacao  # noqa: E402
except ImportError as e:  # o CI não instala o shapely (como o ifcopenshell nos outros testes de IFC)
    raise unittest.SkipTest(f"sem shapely: {e}")


def ambientes_exe():
    """101-01 (0 a 4 m) e 101-02 (4,14 a 8 m), de 0 a 3 m; o corredor AC-01 de 3,14 a 4,5 m. Em metros."""
    return [
        ("101-01", "Apto 101", box(0, 0, 4, 3)),
        ("101-02", "Apto 101", box(4.14, 0, 8, 3)),
        ("AC-01", "Área comum", box(0, 3.14, 8, 4.5)),
    ]


def paredes_exe():
    return [
        {"modelo_id": "w1", "geom": box(4, 0, 4.14, 3)},       # entre os dois cômodos: do 101
        {"modelo_id": "w2", "geom": box(0, 3, 8, 3.14)},       # entre o apartamento e o corredor: do 101 (mais encosto)
        {"modelo_id": "w3", "geom": box(0, 4.5, 8, 4.64)},     # fundo do corredor: área comum
        {"modelo_id": "w4", "geom": box(0, -0.14, 4, 0)},      # fachada do 101-01
        {"modelo_id": "w5", "geom": box(10, 10, 10.05, 10.05)},  # pedacinho de 5 cm: fica fora
    ]


class TestRegras(unittest.TestCase):
    def test_alvenaria_pelo_bloco(self):
        self.assertTrue(vedacao.e_de_alvenaria(["REBOCO", "BLOCO DE CONCRETO"]))
        self.assertTrue(vedacao.e_de_alvenaria(["Bloco cerâmico"]))
        self.assertFalse(vedacao.e_de_alvenaria(["GESSO DRYWALL ST", "ESTRUTURA STEEL FRAME"]))
        self.assertFalse(vedacao.e_de_alvenaria(["VIDRO"]))
        self.assertTrue(vedacao.e_de_alvenaria(["GESSO DRYWALL ST"], materiais=["drywall"]))

    def test_medidas_e_secao(self):
        comp, esp = vedacao.medidas(box(0, 0, 3.45, 0.14))
        self.assertAlmostEqual(comp, 3.45)
        self.assertAlmostEqual(esp, 0.14)
        self.assertEqual(vedacao.secao(comp, esp), "3,45 m · 14 cm")

    def test_unidade_pelo_encosto(self):
        amb = ambientes_exe()
        self.assertEqual(vedacao.unidade_da_parede(box(4, 0, 4.14, 3), amb), ("101", "Apto 101"))
        self.assertEqual(vedacao.unidade_da_parede(box(0, 3, 8, 3.14), amb), ("101", "Apto 101"))
        self.assertEqual(vedacao.unidade_da_parede(box(0, 4.5, 8, 4.64), amb), ("AC", "Área comum"))
        self.assertEqual(vedacao.unidade_da_parede(box(50, 50, 51, 51), amb), ("AC", "Área comum"))

    def test_nomes_por_apartamento_na_ordem_de_leitura(self):
        ps = [{"unidade": "AC", "centro": (0, 0)}, {"unidade": "101", "centro": (5, 0)}, {"unidade": "101", "centro": (1, 0)},
              {"unidade": "101", "centro": (9, 6)}, {"unidade": "1002", "centro": (0, 0)}]
        self.assertEqual([(p["unidade"], p["centro"], p["nome"]) for p in vedacao.nomear(ps)], [
            ("101", (9, 6), "101-M01"),   # de cima para baixo
            ("101", (1, 0), "101-M02"),   # e da esquerda para a direita
            ("101", (5, 0), "101-M03"),
            ("1002", (0, 0), "1002-M01"),
            ("AC", (0, 0), "AC-M01"),     # área comum no fim
        ])


class TestPecas(unittest.TestCase):
    def test_paredes_viram_locais_m(self):
        # folha em 1:50 (56,7 pt por metro), y para baixo
        def para_prancha(x, y):
            return [round(x * 56.7 + 100, 2), round((10 - y) * 56.7 + 100, 2)]

        pecas, resumo = vedacao.pecas_das_paredes(paredes_exe(), ambientes_exe(), para_prancha)
        nomes = {p["nome"]: p for p in pecas}
        self.assertEqual(sorted(nomes), ["101-M01", "101-M02", "101-M03", "AC-M01"])
        self.assertEqual({p["tipo"] for p in pecas}, {"M"})
        self.assertEqual(nomes["AC-M01"]["grupo"], "Área comum")
        self.assertEqual(nomes["101-M01"]["secao"], "8,00 m · 14 cm")  # a do corredor está mais em cima
        self.assertEqual(len(nomes["101-M01"]["polys"]), 1)
        self.assertEqual(len(nomes["101-M01"]["polys"][0]), 4)
        self.assertEqual(resumo["paredes"], 4)
        self.assertEqual(resumo["por_apartamento"], {"101": 3, "AC": 1})
        self.assertEqual(resumo["curtas_fora"], 1)
        r = nomes["101-M02"]["rotulo"]
        self.assertAlmostEqual(r[2] - r[0], 28)

    def test_escolha_de_quais_paredes(self):
        # dado da obra: na obra piloto só as de área comum (Nicolas, 20/11/2026)
        def para_prancha(x, y):
            return [x, y]

        so_ac, r_ac = vedacao.pecas_das_paredes(paredes_exe(), ambientes_exe(), para_prancha, "area_comum")
        self.assertEqual([p["nome"] for p in so_ac], ["AC-M01"])
        self.assertEqual((r_ac["paredes"], r_ac["quais"], r_ac["fora_pela_escolha"]), (1, "area_comum", 3))
        so_apto, r_apto = vedacao.pecas_das_paredes(paredes_exe(), ambientes_exe(), para_prancha, "apartamentos")
        self.assertEqual(sorted(p["nome"] for p in so_apto), ["101-M01", "101-M02", "101-M03"])
        self.assertEqual(r_apto["fora_pela_escolha"], 1)
        _, r_todas = vedacao.pecas_das_paredes(paredes_exe(), ambientes_exe(), para_prancha)
        self.assertEqual(r_todas["quais"], "todas")
        self.assertNotIn("fora_pela_escolha", r_todas)
        # o valor sai do "vedacao" do pavimento.json; true e sem "paredes" valem "todas"
        self.assertEqual(vedacao.quais_paredes(True), "todas")
        self.assertEqual(vedacao.quais_paredes({"prancha": "x.pdf"}), "todas")
        self.assertEqual(vedacao.quais_paredes({"paredes": "area_comum"}), "area_comum")
        with self.assertRaises(vedacao.ErroVedacao):
            vedacao.quais_paredes({"paredes": "fachada"})

    def test_pacote_aceita_a_parede(self):
        import pacote

        el = {"e1": {"tipo": "M", "nome": "101-M01", "secao": "3,45 m · 14 cm", "grupo": "Apto 101",
                     "rotulo": [0, 0, 28, 10], "polys": [[[0, 0], [10, 0], [10, 1], [0, 1]]]}}
        cab = {"planta_id": "p", "obra": "EXE", "pavimento": "2º Pavimento", "trecho": "Modulação", "prancha": "EXE-R00",
               "revisao": "R00", "largura": 100, "altura": 100, "tile": 256, "niveis": [0]}
        man, _ = pacote.montar(cab, {}, el, {})
        import json

        m = json.loads(man)
        self.assertEqual(m["elementos"]["e1"]["tipo"], "M")
        self.assertEqual(m["elementos"]["e1"]["grupo"], "Apto 101")


class TestPublicar(unittest.TestCase):
    def _formas(self):
        estrutura = {"trecho": "Planta inteira", "disciplina": "estrutura", "pecas": [{"tipo": "P", "nome": "P1", "secao": "19x60", "rotulo": [0, 0, 1, 1], "polys": []}]}
        modulacao = {"trecho": "Modulação", "disciplina": "vedacao", "prancha": "EXE.AR-R00", "revisao": "R00", "largura": 100, "altura": 100,
                     "tile": 256, "niveis": [0], "tiles": {},
                     "pecas": [{"tipo": "M", "nome": "101-M01", "secao": "3,45 m · 14 cm", "grupo": "Apto 101", "rotulo": [0, 0, 28, 10],
                                "polys": [[[0, 0], [10, 0], [10, 1], [0, 1]]]}]}
        return estrutura, modulacao

    def test_so_vedacao_fica_so_com_a_modulacao(self):
        import publicar_planta

        estrutura, modulacao = self._formas()
        self.assertEqual(publicar_planta.so_disciplina([estrutura, modulacao], "vedacao"), [modulacao])
        with self.assertRaises(publicar_planta.ErroPublicacao) as e:
            publicar_planta.so_disciplina([estrutura], "vedacao")
        self.assertIn("\"vedacao\" em \"ambientes\"", str(e.exception))

    def test_servidor_sem_a_migracao_recusa_a_parede(self):
        import publicar_planta
        from test_fvs_demo import ServidorFalso

        _, modulacao = self._formas()
        cfg = {"obra": "EXE", "pavimento": "2º Pavimento"}
        with self.assertRaises(publicar_planta.ErroPublicacao) as e:
            publicar_planta.publicar_no_servidor(ServidorFalso("EXE"), cfg, {"P": {}, "V": {}}, [modulacao])
        self.assertIn("--aceita-paredes", str(e.exception))
        srv = ServidorFalso("EXE")
        rels = publicar_planta.publicar_no_servidor(srv, cfg, {"P": {}, "V": {}}, [modulacao], aceita_paredes=True)
        self.assertEqual([s["trecho"] for s in srv.tabelas["setores"]], ["Modulação"])
        self.assertEqual(rels[0]["disciplina"], "vedacao")
        self.assertEqual([(e["tipo"], e["nome"]) for e in srv.tabelas["elementos"]], [("M", "101-M01")])
        self.assertEqual(rels[0]["paredes"], 1)

    def test_config_aceita_vedacao(self):
        import json
        import tempfile

        import publicar_planta

        with tempfile.TemporaryDirectory() as d:
            base = pathlib.Path(d)
            for n in ("modelo.ifc", "arq.pdf", "EXE.VD.EX.001-R00.pdf"):
                (base / n).write_bytes(b"x")
            cfg = {"obra": "exe", "pavimento": "2º Pavimento",
                   "ambientes": {"ifc": "modelo.ifc", "andar": "2", "prancha": "arq.pdf", "vedacao": {"prancha": "EXE.VD.*.pdf", "escala": 50}}}
            (base / "pav.json").write_text(json.dumps(cfg), encoding="utf-8")
            lido = publicar_planta.ler_config(base / "pav.json")
            self.assertEqual(pathlib.Path(lido["ambientes"]["vedacao"]["prancha"]).name, "EXE.VD.EX.001-R00.pdf")
            cfg["ambientes"]["vedacao"] = True
            (base / "pav.json").write_text(json.dumps(cfg), encoding="utf-8")
            self.assertIs(publicar_planta.ler_config(base / "pav.json")["ambientes"]["vedacao"], True)
            cfg["ambientes"]["vedacao"] = {"paredes": "area_comum"}
            (base / "pav.json").write_text(json.dumps(cfg), encoding="utf-8")
            self.assertEqual(publicar_planta.ler_config(base / "pav.json")["ambientes"]["vedacao"], {"paredes": "area_comum"})
            cfg["ambientes"]["vedacao"] = {"paredes": "corredor"}
            (base / "pav.json").write_text(json.dumps(cfg), encoding="utf-8")
            with self.assertRaises(publicar_planta.ErroPublicacao):
                publicar_planta.ler_config(base / "pav.json")


if __name__ == "__main__":
    unittest.main()

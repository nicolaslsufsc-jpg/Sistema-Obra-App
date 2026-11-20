"""Armadura de laje em plantas próprias (pipeline/fvs/armadura_laje.py, 20/11/2026): uma planta por direção,
com a prancha de armação colada na folha da forma pelo mesmo encaixe das barras. Prancha fictícia da obra EXE
(a mesma de test_fvs_barras_laje)."""

from __future__ import annotations

import pathlib
import sys
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))
sys.path.insert(0, str(RAIZ / "pipeline" / "legado"))
sys.path.insert(0, str(RAIZ / "pipeline" / "testes"))

import barras_laje as bl  # noqa: E402
from test_fvs_barras_laje import DESLOC, LE_PDF, forma_exe, prancha_exe  # noqa: E402


class TestNomes(unittest.TestCase):
    def test_setor_e_camada_do_pdf(self):
        import armadura_laje

        self.assertEqual(armadura_laje.nome_do_setor("transversal_superior"), "Armadura transversal superior")
        # conferido nas pranchas reais (20/11): a transversal é TRANS, não TRANSV
        self.assertEqual(bl.CAMADA_DO_PDF["transversal_inferior"], "ARR_TRANS_INF")
        self.assertEqual(bl.CAMADA_DO_PDF["transversal_superior"], "ARR_TRANS_SUP")


@LE_PDF
class TestPlantaDeArmadura(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.pdf = str(pathlib.Path(self.tmp.name) / "EXE.ES.LO.900.LAJ2PAVTIP-R00.pdf")
        prancha_exe(self.pdf)

    def tearDown(self):
        self.tmp.cleanup()

    def _forma(self, camadas_separadas=True):
        import publicar_planta

        cfg = {"obra": "EXE", "pavimento": "2º Pavimento", "camadas_separadas": camadas_separadas,
               "barras_laje": {"camadas": {"longitudinal_inferior": {"pdfs": [self.pdf]}}, "alinhamento": {}}}
        detalhes = {"P": {}, "V": {}, "barras": [bl.ler_prancha(self.pdf, "longitudinal_inferior")]}
        fm = {"pecas": forma_exe(), "prancha": "EXE.FOR-R00", "revisao": "R00", "largura": 2000, "altura": 1500,
              "tile": 512, "niveis": [-1, 0, 1], "tiles": {}, "trecho": "Planta inteira"}
        formas = [fm]
        rel = publicar_planta.por_barras(cfg, detalhes, formas)
        folhas = publicar_planta.por_armadura(cfg, detalhes, formas, rel)
        return fm, folhas, formas

    def test_uma_planta_por_direcao_com_a_prancha_no_fundo(self):
        fm, folhas, formas = self._forma()
        self.assertEqual(len(folhas), 1)
        self.assertIs(formas[-1], folhas[0])
        f = folhas[0]
        self.assertEqual((f["trecho"], f["disciplina"], f["camada"]), ("Armadura longitudinal inferior", "armadura", "longitudinal_inferior"))
        self.assertEqual((f["largura"], f["altura"], f["niveis"]), (2000, 1500, [-1, 0, 1]))
        self.assertEqual(f["pecas"], [])
        self.assertEqual(sorted(f["barras"]), sorted(fm["barras"]))  # todas as barras, mesmo id nas duas plantas
        self.assertTrue(fm["camadas_separadas"])
        # a barra N25 começa em (200, 400) na prancha e cai em (700, 600) na folha: 2 pixels por ponto no
        # nível 1, tile de 512 -> tile 1/2/2; e a imagem tem desenho lá
        self.assertIn("1/2/2", f["tiles"])
        self.assertTrue(any(k.startswith("-1/") for k in f["tiles"]))

    def test_pacotes_da_forma_e_da_armadura(self):
        import pacote
        import publicar_planta

        fm, folhas, _ = self._forma()
        ids = {(p["tipo"], p["nome"]): publicar_planta.id_local("EXE", "2º Pavimento", p["tipo"], p["nome"]) for p in fm["pecas"]}
        man, binario, r = publicar_planta.montar_trecho(fm, {"P": {}, "V": {}}, ids, {"planta_id": "f", "trecho": fm["trecho"]})
        m, _ = pacote.ler(man, binario)
        self.assertTrue(m["camadas_separadas"])
        self.assertEqual(len(m["barras"]), 4)  # a forma continua com as barras (item da área de laje)
        arm = folhas[0]
        man, binario, r = publicar_planta.montar_trecho(arm, {"P": {}, "V": {}}, ids, {"planta_id": "a", "trecho": arm["trecho"]})
        m, pedacos = pacote.ler(man, binario)
        self.assertEqual(m["trecho"], "Armadura longitudinal inferior")
        self.assertEqual(m["elementos"], {})
        self.assertEqual(len(m["barras"]), 4)
        self.assertNotIn("camadas_separadas", m)
        self.assertEqual(m["camada"], "longitudinal_inferior")
        self.assertEqual((r["elementos"], r["disciplina"]), (4, "armadura"))
        self.assertTrue(any(k.startswith("t:") for k in pedacos))

    def test_sem_camadas_separadas_fica_como_antes(self):
        fm, folhas, formas = self._forma(camadas_separadas=False)
        self.assertEqual(folhas, [])
        self.assertEqual(len(formas), 1)
        self.assertNotIn("camadas_separadas", fm)

    def test_so_armadura_nao_mexe_na_forma(self):
        """--so-armadura: no servidor entra só o setor e a planta da direção; nenhuma peça, nenhuma forma nova."""
        import publicar_planta
        from test_fvs_demo import ServidorFalso

        _, _, formas = self._forma()
        srv = ServidorFalso("EXE")
        rels = publicar_planta.publicar_no_servidor(srv, {"obra": "EXE", "pavimento": "2º Pavimento"}, {"P": {}, "V": {}}, publicar_planta.so_armadura(formas))
        self.assertEqual([r["trecho"] for r in rels], ["Armadura longitudinal inferior"])
        self.assertEqual([s["trecho"] for s in srv.tabelas["setores"]], ["Armadura longitudinal inferior"])
        self.assertEqual(len(srv.tabelas["plantas"]), 1)
        self.assertEqual(srv.tabelas["plantas"][0]["elementos"], 4)
        self.assertEqual(srv.tabelas["elementos"], [])
        self.assertNotIn(("inserir", "elementos"), srv.pedidos)
        with self.assertRaises(publicar_planta.ErroPublicacao):
            publicar_planta.so_armadura([f for f in formas if f.get("disciplina") != "armadura"])

    def test_prancha_girada_cai_no_mesmo_lugar(self):
        """A transformação inteira do alinhamento (com giro) vira a matriz do desenho: o ponto da prancha cai
        onde a barra caiu."""
        import armadura_laje
        import pymupdf

        T = {"matriz": [0.0, -1.0, 1.0, 0.0], "t": [900.0, 50.0]}
        M = armadura_laje.matriz_de_desenho(T, 2)
        p = pymupdf.Point(200, 400) * M
        x, y = bl.al.transformar(T, 200, 400)
        self.assertAlmostEqual(p.x, 2 * x, places=6)
        self.assertAlmostEqual(p.y, 2 * y, places=6)
        self.assertEqual(DESLOC, (500.0, 200.0))


if __name__ == "__main__":
    unittest.main()

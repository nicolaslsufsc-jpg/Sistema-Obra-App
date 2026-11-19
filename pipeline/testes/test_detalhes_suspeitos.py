"""Testes das partes puras de pipeline/fvs/detalhes_suspeitos.py (sem PDF): níveis e suspeitas."""

from __future__ import annotations

import pathlib
import sys
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))

import detalhes_suspeitos as ds  # noqa: E402


def manifest(elementos, detalhes):
    return {"trecho": "Planta inteira", "elementos": {str(i): e for i, e in enumerate(elementos)}, "detalhes": detalhes}


PAV = {"pavimento": "Térreo Comercial"}


class TestNiveis(unittest.TestCase):
    def test_nomes_de_nivel(self):
        self.assertEqual(ds.ordem_do_nivel("Fundação"), 0)
        self.assertEqual(ds.ordem_do_nivel("Subsolo"), 1)
        self.assertEqual(ds.ordem_do_nivel("Térreo Comercial"), 2)
        self.assertEqual(ds.ordem_do_nivel("4°Pavto Tipo"), 7)
        self.assertEqual(ds.ordem_do_nivel("Vista XX"), None)
        self.assertEqual(ds.ordem_do_nivel("Escala vertical   1:50"), None)


class TestSuspeitas(unittest.TestCase):
    def analisar(self, ocorr, titulo="P1", prancha="EXE.ES.LO.219.PILCOMERCI-R02"):
        m = manifest([{"tipo": "P", "nome": "P1", "secao": "19x50", "detalhe": "P_P1"}], {"P_P1": {"titulo": titulo, "prancha": prancha}})
        return ds.analisar(PAV, [m], {"P1": ocorr})

    def oc(self, prancha="EXE.ES.LO.219.PILCOMERCI-R02", niveis=(1, 2), quadro=True, pequeno=False, titulo="P1"):
        return {"prancha": prancha, "titulo": titulo, "niveis": list(niveis), "quadro": quadro, "quadro_pequeno": pequeno}

    def test_detalhe_certo_nao_sai(self):
        self.assertEqual(self.analisar([self.oc()]), [])

    def test_lance_que_passa_pelo_pavimento(self):
        # Subsolo > Pilotis passa pelo Térreo, mas não termina nele: o pilar do Térreo é o de baixo
        l = self.analisar([self.oc(prancha="EXE.ES.LO.222.PILPILOTIS-R01", niveis=(1, 3))], prancha="EXE.ES.LO.222.PILPILOTIS-R01")
        self.assertEqual(l[0]["suspeita"], "outro_pavimento lance_diferente")
        self.assertEqual(l[0]["lance_do_detalhe"], "Subsolo > Pilotis")

    def test_nome_em_duas_pranchas(self):
        l = self.analisar([self.oc(), self.oc(prancha="EXE.ES.LO.220.PILCOMERCI-R01")])
        self.assertIn("varias_pranchas", l[0]["suspeita"])

    def test_titulo_diferente(self):
        l = self.analisar([self.oc(titulo="P10")], titulo="P10")
        self.assertIn("titulo_diferente", l[0]["suspeita"])

    def test_titulo_com_igual_nao_e_diferente(self):
        self.assertEqual(self.analisar([self.oc(titulo="P1=P2")], titulo="P1=P2"), [])

    def test_quadro_pequeno_ignorado_pelo_gerador(self):
        l = self.analisar([self.oc(quadro=False), self.oc(quadro=False, pequeno=True)])
        self.assertEqual(l[0]["suspeita"], "quadro_pequeno")

    def test_sem_detalhe(self):
        m = manifest([{"tipo": "V", "nome": "V9", "secao": "14x50"}, {"tipo": "L", "nome": "L1"}], {})
        l = ds.analisar(PAV, [m], {})
        self.assertEqual([(x["nome"], x["suspeita"]) for x in l], [("V9", "sem_detalhe")])


if __name__ == "__main__":
    unittest.main()

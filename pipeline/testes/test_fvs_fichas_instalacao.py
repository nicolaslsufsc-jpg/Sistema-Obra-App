"""Gerador de fichas (pipeline/fvs/publicar_fichas.py): a marca "instalacao" dos itens de pontos na laje
(item 4, 19/11/2026) passa do arquivo para a ficha, e marca errada é recusada. Fichas da obra fictícia EXE."""

from __future__ import annotations

import pathlib
import sys
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))

import publicar_fichas as pf  # noqa: E402


def laje(*itens, aplica=("L",)):
    return [{"codigo": "EXE-LAJ", "titulo": "Laje maciça", "aplica_a": list(aplica), "itens": list(itens)}]


class TestInstalacao(unittest.TestCase):
    def test_passa_as_tres_marcas(self):
        f = pf.normalizar(laje({"n": 1, "titulo": "Fôrma"}, {"n": 12, "titulo": "Pontos de esgoto", "instalacao": "esgoto"},
                               {"n": 13, "titulo": "Pontos de AF/AQ", "instalacao": "agua"},
                               {"n": 14, "titulo": "Instalações elétricas", "instalacao": "eletrica"}))[0]
        self.assertEqual([i.get("instalacao") for i in f["itens"]], [None, "esgoto", "agua", "eletrica"])

    def test_recusa_marca_errada(self):
        for ruim in (laje({"n": 1, "instalacao": "gas"}),
                     laje({"n": 1, "instalacao": True}),
                     laje({"n": 1, "instalacao": "esgoto"}, aplica=("V",)),
                     laje({"n": 1, "instalacao": "esgoto"}, {"n": 2, "instalacao": "esgoto"}),
                     laje({"n": 1, "instalacao": "agua", "barras": True})):
            with self.subTest(ruim=ruim), self.assertRaises(pf.ErroFichas):
                pf.normalizar(ruim)


if __name__ == "__main__":
    unittest.main()

"""Roda os testes de cada galho de pipeline/integracoes/ (a pasta testes/ dentro dele).

Assim o `python -m unittest discover -s pipeline/testes` de sempre também testa os galhos, e um
galho apagado simplesmente não tem teste para rodar (docs/modulos/integracoes.md)."""

from __future__ import annotations

import pathlib
import unittest

INTEGRACOES = pathlib.Path(__file__).resolve().parents[1] / "integracoes"


def load_tests(loader: unittest.TestLoader, testes: unittest.TestSuite, padrao: str | None) -> unittest.TestSuite:
    for pasta in sorted(INTEGRACOES.glob("*/testes")):
        if pasta.is_dir():
            # um carregador novo: até o Python 3.12, o discover() dentro de load_tests troca a raiz do
            # carregador de fora, e os módulos seguintes de pipeline/testes quebram com
            # "Path must be within the project" (aconteceu no GitHub, Python 3.12)
            testes.addTests(unittest.TestLoader().discover(str(pasta), pattern=padrao or "test*.py", top_level_dir=str(pasta)))
    return testes


class TestCarregadorDeFora(unittest.TestCase):
    def test_load_tests_nao_troca_a_raiz_do_carregador_de_fora(self):
        de_fora = unittest.TestLoader()
        de_fora._top_level_dir = str(pathlib.Path(__file__).resolve().parent)
        load_tests(de_fora, unittest.TestSuite(), None)
        self.assertEqual(de_fora._top_level_dir, str(pathlib.Path(__file__).resolve().parent))

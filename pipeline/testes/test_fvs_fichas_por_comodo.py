"""Tabela ficha x tipo de cômodo (pipeline/fvs/ambientes.py: ler_fichas_por_comodo e companhia).
Obra fictícia EXE; o arquivo de verdade é o que a página de conferência gera, fora do repositório."""

from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))
sys.path.insert(0, str(RAIZ / "pipeline"))

import ambientes  # noqa: E402

EXEMPLO = RAIZ / "pipeline" / "fvs" / "fichas_por_comodo.exemplo.json"


class TestFichasPorComodo(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def gravar(self, dados) -> str:
        p = pathlib.Path(self.tmp.name) / "respostas.json"
        p.write_text(json.dumps(dados, ensure_ascii=False) if not isinstance(dados, str) else dados, encoding="utf-8")
        return str(p)

    def test_classe_do_comodo(self):
        self.assertEqual(ambientes.classe_do_comodo("Suíte 01"), "Suíte")
        self.assertEqual(ambientes.classe_do_comodo("Suíte 01 / Banho 02"), "Suíte / Banho")
        self.assertEqual(ambientes.classe_do_comodo("Living / Cozinha"), "Living / Cozinha")
        self.assertEqual(ambientes.classe_do_comodo("Dormitório de Serviço 1"), "Dormitório de Serviço")
        self.assertIsNone(ambientes.classe_do_comodo(""))
        self.assertIsNone(ambientes.classe_do_comodo(None))

    def test_exemplo_do_repositorio(self):
        t = ambientes.ler_fichas_por_comodo(str(EXEMPLO))
        self.assertEqual(t["classes"]["Suíte"], {"EXE-013", "EXE-015", "EXE-027"})
        self.assertEqual(t["talvez"], [])
        self.assertTrue(ambientes.ficha_vale_no_comodo("EXE-024", "Banho 02", t))
        self.assertFalse(ambientes.ficha_vale_no_comodo("EXE-024", "Suíte 01", t))  # piso cerâmico não vai no quarto
        self.assertFalse(ambientes.ficha_vale_no_comodo("EXE-027", "Sacada", t))

    def test_sem_regra_a_ficha_continua_aparecendo(self):
        t = ambientes.ler_fichas_por_comodo(str(EXEMPLO))
        self.assertTrue(ambientes.ficha_vale_no_comodo("EXE-999", "Suíte 01", t))  # ficha fora da tabela
        self.assertTrue(ambientes.ficha_vale_no_comodo("EXE-024", "Hall", t))      # tipo que a tabela não tem
        self.assertTrue(ambientes.ficha_vale_no_comodo("EXE-024", None, t))        # cômodo sem nome

    def test_talvez_da_erro_com_a_lista(self):
        p = self.gravar({"classes": {"Banho": {"EXE-1": "sim", "EXE-2": "talvez"}}})
        with self.assertRaisesRegex(ambientes.ErroAmbientes, r"faltam conferir 1 casas \(Banho > EXE-2\)"):
            ambientes.ler_fichas_por_comodo(p)
        t = ambientes.ler_fichas_por_comodo(p, aceita_talvez=True)  # talvez = continua aparecendo
        self.assertEqual(t["classes"]["Banho"], {"EXE-1", "EXE-2"})
        self.assertEqual(t["talvez"], [("Banho", "EXE-2")])

    def test_arquivo_da_pagina_antiga_sem_lista_de_fichas(self):
        # a 1ª versão da página exportava só "classes" (sem "fichas"): vale a união dos códigos
        p = self.gravar({"arquivo": "respostas_fichas_por_comodo", "classes": {"Banho": {"EXE-1": "sim"}, "Suíte": {"EXE-1": "nao", "EXE-2": "sim"}}})
        t = ambientes.ler_fichas_por_comodo(p)
        self.assertEqual(set(t["fichas"]), {"EXE-1", "EXE-2"})
        self.assertFalse(ambientes.ficha_vale_no_comodo("EXE-1", "Suíte 02", t))

    def test_erros_claros(self):
        casos = [
            ("{", "ilegível"),
            ({"fichas": {}}, "tem que ter \"classes\""),
            ({"classes": {"Banho": {"EXE-1": "s"}}}, "só vale"),
            ({"classes": {"Banho": ["EXE-1"]}}, "tem que ser"),
            ({"classes": {"Suíte 01": {"EXE-1": "sim"}}}, "sem número"),
            ({"fichas": {"EXE-1": "Pintura"}, "classes": {"Banho": {"EXE-2": "sim"}}}, "fora da lista"),
            ({"fichas": ["EXE-1"], "classes": {"Banho": {"EXE-1": "sim"}}}, "\"fichas\" tem que ser"),
        ]
        for dados, msg in casos:
            with self.subTest(msg=msg), self.assertRaisesRegex(ambientes.ErroAmbientes, msg):
                ambientes.ler_fichas_por_comodo(self.gravar(dados))
        with self.assertRaisesRegex(ambientes.ErroAmbientes, "ilegível"):
            ambientes.ler_fichas_por_comodo(str(pathlib.Path(self.tmp.name) / "nao_existe.json"))


if __name__ == "__main__":
    unittest.main()

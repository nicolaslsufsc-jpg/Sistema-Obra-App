"""Fichas modelo lidas do Construpoint (fichas.py deste galho), pelo publicar_fichas.py.
Tudo com dados inventados."""

from __future__ import annotations

import json
import pathlib
import sys
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))
sys.path.insert(0, str(RAIZ / "pipeline"))

import publicar_fichas  # noqa: E402
from integracoes.construpoint import fichas  # noqa: E402


class TestFichasDoConstrupoint(unittest.TestCase):
    def test_nome_do_construpoint(self):
        f = fichas.separar_nome_construpoint
        self.assertEqual(f("(CONDIÇÕES DE INÍCIO) Projeto: Projeto aprovado"), ("CONDIÇÕES DE INÍCIO", "Projeto", "Projeto aprovado"))
        self.assertEqual(f("(EXECUÇÃO) Argamassa - Verificar preparo"), ("EXECUÇÃO", "Argamassa", "Verificar preparo"))
        self.assertEqual(f("Sem etapa"), ("", "Sem etapa", ""))


    def test_construpoint(self):
        lista = [{"campos": {"Identificação": "EXE-PVS-002", "Título": "Supraestrutura - Vigas", "Revisão": "0",
                             "Tipos de Modelo": "ESTRUTURA"},
                  "itens": [{"n": "1", "nome": "(INÍCIO) Kickoff: Verificar", "disp": "Visual", "tol": "NA"}]}]
        fichas = publicar_fichas.normalizar(lista)
        self.assertEqual(fichas[0]["aplica_a"], ["V"])
        self.assertEqual(fichas[0]["itens"][0]["titulo"], "Kickoff")


    def test_construpoint_por_ambiente(self):
        lido = [{"campos": {"Identificação": "EXE-PVS-X", "Título": "Reboco Interno", "Revisão": "0", "Tipos de Modelo": "REVESTIMENTO"},
                 "itens": [{"n": "1", "nome": "(CHAPISCO) Cura: Verificar a cura do chapisco", "disp": "Visual", "tol": "3 dias"}]}]
        with self.assertRaises(publicar_fichas.ErroFichas):
            publicar_fichas.normalizar(json.loads(json.dumps(lido)))  # o título não diz a que se aplica
        f = publicar_fichas.normalizar(lido, ["A"])[0]
        self.assertEqual((f["aplica_a"], f["itens"][0]["etapa"], f["itens"][0]["titulo"]), (["A"], "CHAPISCO", "Cura"))


if __name__ == "__main__":
    unittest.main()

"""Gerador de fichas (pipeline/fvs/publicar_fichas.py): as marcas "rastreio_concreto" e "concretagem"
passam do arquivo para a ficha modelo, nos dois formatos, e marca errada é recusada. Fichas da obra
fictícia EXE."""

from __future__ import annotations

import pathlib
import sys
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))

import publicar_fichas as pf  # noqa: E402


def legado():
    """Fichas de pilar e viga da EXE no formato do HTML legado."""
    return {
        "P": {"codigo": "EXE-PVS-001", "titulo": "Pilares", "itens": [
            {"n": 1, "etapa": "INÍCIO", "titulo": "Locação"},
            {"n": 2, "etapa": "CONCRETAGEM", "titulo": "Lançamento", "concretagem": True},
            {"n": 3, "etapa": "CONCRETAGEM", "titulo": "Controle do concreto", "concretagem": True, "rastreio_concreto": True},
            {"n": 4, "etapa": "DESFORMA", "titulo": "Desforma", "concretagem": False},
        ]},
        "V": {"codigo": "EXE-PVS-002", "titulo": "Vigas", "itens": [
            {"n": 1, "etapa": "INÍCIO", "titulo": "Fôrma"},
            {"n": 2, "etapa": "CONCRETAGEM", "titulo": "Controle do concreto", "rastreio_concreto": True},
        ]},
    }


class TestMarcasDoConcreto(unittest.TestCase):
    def test_legado_guarda_as_marcas(self):
        p, v = pf.normalizar(legado())
        self.assertEqual([i["n"] for i in p["itens"] if i.get("rastreio_concreto")], [3])
        self.assertEqual([i.get("concretagem") for i in p["itens"]], [None, True, True, False])
        self.assertNotIn("concretagem", p["itens"][0])  # sem marca no arquivo, nada na ficha
        self.assertEqual([i["n"] for i in v["itens"] if i.get("rastreio_concreto")], [2])

    def test_formato_do_sistema_guarda_as_marcas(self):
        f = pf.normalizar([{"codigo": "EXE-V", "titulo": "Vigas", "aplica_a": ["V"], "itens": [
            {"n": 1, "titulo": "Fôrma"}, {"n": 2, "titulo": "Concreto", "concretagem": True, "rastreio_concreto": True}]}])[0]
        self.assertEqual(f["itens"][1]["rastreio_concreto"], True)

    def test_sem_marca_continua_igual(self):
        dados = legado()
        for t in dados.values():
            for i in t["itens"]:
                i.pop("rastreio_concreto", None)
                i.pop("concretagem", None)
        for f in pf.normalizar(dados):
            for i in f["itens"]:
                self.assertFalse({"rastreio_concreto", "concretagem"} & set(i))

    def test_recusa_marca_errada(self):
        def ficha(aplica, *itens):
            return [{"codigo": "EXE-X", "titulo": "X", "aplica_a": aplica, "itens": list(itens)}]

        for ruim in (ficha(["L"], {"n": 1, "rastreio_concreto": True}),
                     ficha(["A"], {"n": 1, "rastreio_concreto": True}),
                     ficha(["P"], {"n": 1, "rastreio_concreto": True}, {"n": 2, "rastreio_concreto": True}),
                     ficha(["P"], {"n": 1, "rastreio_concreto": "sim"}),
                     ficha(["V"], {"n": 1, "rastreio_concreto": True, "furos": True}),
                     ficha(["P"], {"n": 1, "rastreio_concreto": True, "parte": "consolo"}),
                     ficha(["P"], {"n": 1, "concretagem": "sim"})):
            with self.assertRaises(pf.ErroFichas, msg=str(ruim)):
                pf.normalizar(ruim)


if __name__ == "__main__":
    unittest.main()

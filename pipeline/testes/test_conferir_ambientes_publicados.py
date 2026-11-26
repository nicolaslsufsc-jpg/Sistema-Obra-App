"""Conferência do ambiente dos pontos publicados (25/11): certo, sem ambiente, id inexistente, outro cômodo."""

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "fvs"))

import conferir_ambientes_publicados as C  # noqa: E402


class TestComparar(unittest.TestCase):
    def test_conta_cada_caso(self):
        ambientes = {"srv-1": "AC-01", "srv-2": "AC-02"}
        nome_local = {"loc-1": "AC-01", "loc-2": "AC-02"}
        servidor = {
            "p1": {"ambiente": "srv-1"},   # certo
            "p2": {},                      # sem ambiente nos dois
            "p3": {"ambiente": "srv-9"},   # id que não existe (apagado ou de outro pavimento)
            "p4": {"ambiente": "srv-2"},   # o PC diz AC-01
            "p5": {},                      # o PC diz AC-02 e o servidor não tem
            "p6": {"ambiente": "srv-1"},   # não existe no pacote do PC
        }
        pc = {"p1": {"ambiente": "loc-1"}, "p2": {}, "p3": {"ambiente": "loc-1"}, "p4": {"ambiente": "loc-1"},
              "p5": {"ambiente": "loc-2"}}
        r = C.comparar(servidor, ambientes, pc, nome_local)
        self.assertEqual({k: v for k, v in r.items() if k != "exemplos"},
                         {"certo": 1, "sem_ambiente": 1, "id_inexistente": 1, "outro_comodo": 2, "sem_ponto_no_pc": 1})
        self.assertEqual(r["exemplos"]["id_inexistente"], ["p3"])


if __name__ == "__main__":
    unittest.main()

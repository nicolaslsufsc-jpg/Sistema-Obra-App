"""Testes da ficha de cópias em CSV gerada pelo script do PC (mesmo formato da exportação do app)."""
import pathlib
import sys
import unittest

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "projetos"))

import exportar_ficha  # noqa: E402


def dados():
    documentos = [{"id": "d1", "codigo": "XPT.ES.112.FORPILOTIS"}]
    revisoes = [{"id": "lo", "documento_id": "d1", "fase": "LO", "numero": "02"}, {"id": "ex", "documento_id": "d1", "fase": "EX", "numero": "05"}]
    empresas = [{"id": "A", "nome": "Alfa"}, {"id": "B", "nome": "Beta"}]
    eventos = [
        {"id": "e1", "tipo": "entrega", "empresa_id": "A", "colaborador": "João", "documento_id": "d1", "revisao_id": "ex", "entrega_id": None, "data_evento": "2026-10-05", "observacao": "=soma", "apagado": False},
        {"id": "e2", "tipo": "entrega", "empresa_id": "B", "colaborador": None, "documento_id": "d1", "revisao_id": "lo", "entrega_id": None, "data_evento": "2026-11-02", "observacao": "via; motoboy", "apagado": False},
        {"id": "e3", "tipo": "devolucao", "empresa_id": "B", "colaborador": None, "documento_id": "d1", "revisao_id": "lo", "entrega_id": "e2", "data_evento": "2026-11-03", "observacao": None, "apagado": False},
    ]
    situacoes = [{"empresa_id": "A", "documento_id": "d1", "situacao": "RECOLHER"}, {"empresa_id": "B", "documento_id": "d1", "situacao": "DEVOLVIDO"}]
    vigentes = [{"id": "lo", "documento_id": "d1", "fase": "LO", "numero": "02"}]
    return documentos, revisoes, empresas, eventos, situacoes, vigentes


class Ficha(unittest.TestCase):
    def test_formato_igual_ao_do_app(self):
        csv = exportar_ficha.montar_ficha(*dados())
        self.assertTrue(csv.startswith("﻿"))
        linhas = csv.replace("﻿", "").rstrip("\r\n").split("\r\n")
        self.assertEqual(linhas[0], ";".join(exportar_ficha.COLUNAS))
        self.assertEqual(linhas[1], "05/10/2026;Alfa;João;XPT.ES.112.FORPILOTIS;EX;R05;;RECOLHER;LO R02;'=soma")
        self.assertEqual(linhas[2], '02/11/2026;Beta;;XPT.ES.112.FORPILOTIS;LO;R02;03/11/2026;DEVOLVIDO;LO R02;"via; motoboy"')

    def test_sem_entregas(self):
        csv = exportar_ficha.montar_ficha([], [], [], [], [], [])
        self.assertEqual(csv.replace("﻿", "").rstrip("\r\n").split("\r\n"), [";".join(exportar_ficha.COLUNAS)])


if __name__ == "__main__":
    unittest.main()

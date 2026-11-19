"""Testes da parte pura do importador: o que muda entre a lista lida e o que o banco já tem."""
import datetime as dt
import pathlib
import sys
import unittest

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "projetos"))

import autodoc_csv  # noqa: E402
import importar_lista  # noqa: E402

EXEMPLO = AQUI / "exemplos" / "relatorio_autodoc_XPT.csv"
D1 = "XPT.ES.112.FORPILOTIS"


def lidas():
    return autodoc_csv.agrupar_revisoes(autodoc_csv.ler_lista(EXEMPLO).arquivos)


def doc(id_, codigo):
    return {"id": id_, "codigo": codigo, "titulo": "x", "apagado": False}


def rev(id_, documento_id, fase, numero, obsoleta=False, status="Aprovado", titulo="PLANTA DE FORMA DO PILOTIS - TRECHO 1"):
    return {"id": id_, "documento_id": documento_id, "fase": fase, "numero": numero, "obsoleta": obsoleta,
            "status_autodoc": status, "titulo": titulo, "data_obsoleta": None, "extensoes": "pdf",
            "cadastrada_em_autodoc": "2026-10-01T15:31:00-03:00", "apagado": False}


class CalcularDiferencas(unittest.TestCase):
    def test_banco_vazio_tudo_e_novo(self):
        d = importar_lista.calcular_diferencas(lidas(), [], [])
        self.assertEqual([x.chave for x in d.documentos_novos], ["XPT.AR.010.PLANTABAIX", D1, "XPT.HS.020.ESGOTOTERR"])
        self.assertEqual(len(d.revisoes_novas), 4)
        self.assertEqual(d.obsoletas_novas, [])
        self.assertEqual(d.atualizacoes, [])

    def test_revisao_nova_em_documento_existente(self):
        docs = [doc("d1", D1)]
        revs = [rev("r1", "d1", "EX", "05")]
        d = importar_lista.calcular_diferencas(lidas(), docs, revs)
        self.assertEqual([x.chave for x in d.documentos_novos], ["XPT.AR.010.PLANTABAIX", "XPT.HS.020.ESGOTOTERR"])
        novas = {(r.chave, r.fase, r.numero): documento_id for r, documento_id in d.revisoes_novas}
        self.assertEqual(novas[(D1, "LO", "02")], "d1")
        self.assertIsNone(novas[("XPT.AR.010.PLANTABAIX", "EX", "04")])
        self.assertNotIn((D1, "EX", "05"), novas)

    def test_revisao_que_virou_obsoleta(self):
        docs = [doc("d3", "XPT.HS.020.ESGOTOTERR")]
        revs = [rev("r5", "d3", "LO", "01", obsoleta=False, titulo="ESGOTO TÉRREO")]
        d = importar_lista.calcular_diferencas(lidas(), docs, revs)
        self.assertEqual([(e["id"], r.numero) for e, r in d.obsoletas_novas], [("r5", "01")])
        self.assertEqual([e["id"] for e, _ in d.atualizacoes], ["r5"])

    def test_mesma_lista_duas_vezes_nao_muda_nada(self):
        docs = [doc("d1", D1), doc("d2", "XPT.AR.010.PLANTABAIX"), doc("d3", "XPT.HS.020.ESGOTOTERR")]
        revs = [
            rev("r1", "d1", "EX", "05"),
            rev("r2", "d1", "LO", "02"),
            rev("r4", "d2", "EX", "04", status="Em análise", titulo="PLANTA BAIXA PAVIMENTO TIPO"),
            rev("r5", "d3", "LO", "01", obsoleta=True, titulo="ESGOTO TÉRREO"),
        ]
        revs[1]["extensoes"] = "dwg,pdf"
        # o banco guarda a data com o fuso do PC que importou
        revs[3]["data_obsoleta"] = dt.datetime(2026, 10, 1, 8, 0).astimezone().isoformat()
        d = importar_lista.calcular_diferencas(lidas(), docs, revs)
        self.assertEqual(d.documentos_novos, [])
        self.assertEqual(d.revisoes_novas, [])
        self.assertEqual(d.obsoletas_novas, [])
        self.assertEqual(d.atualizacoes, [])

    def test_mudanca_de_status_e_atualizacao(self):
        docs = [doc("d2", "XPT.AR.010.PLANTABAIX")]
        revs = [rev("r4", "d2", "EX", "04", status="Aprovado", titulo="PLANTA BAIXA PAVIMENTO TIPO")]
        d = importar_lista.calcular_diferencas(lidas(), docs, revs)
        self.assertEqual([e["id"] for e, _ in d.atualizacoes], ["r4"])
        self.assertEqual(d.obsoletas_novas, [])


class VigenteLocal(unittest.TestCase):
    def test_lo_vence_ex_e_maior_numero(self):
        revs = [rev("a", "d", "EX", "05"), rev("b", "d", "LO", "02"), rev("c", "d", "LO", "01")]
        self.assertEqual(importar_lista.vigente_local(revs)["id"], "b")

    def test_obsoleta_nao_concorre(self):
        revs = [rev("a", "d", "EX", "05"), rev("b", "d", "LO", "02", obsoleta=True)]
        self.assertEqual(importar_lista.vigente_local(revs)["id"], "a")

    def test_sem_vigente(self):
        self.assertIsNone(importar_lista.vigente_local([rev("b", "d", "LO", "02", obsoleta=True)]))
        self.assertIsNone(importar_lista.vigente_local([]))


class DataDaLista(unittest.TestCase):
    def test_do_nome_do_arquivo(self):
        self.assertEqual(importar_lista.data_da_lista("05_revisoes_vigentes_autodoc_2026-11-03.csv", None), dt.date(2026, 11, 3))

    def test_da_emissao_quando_o_nome_nao_tem(self):
        self.assertEqual(importar_lista.data_da_lista("RelatorioDocumentos_x.csv", dt.datetime(2026, 11, 3, 20, 17)), dt.date(2026, 11, 3))

    def test_sem_nada_e_hoje(self):
        self.assertEqual(importar_lista.data_da_lista("x.csv", None), dt.date.today())


if __name__ == "__main__":
    unittest.main()

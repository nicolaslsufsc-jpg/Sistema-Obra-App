"""Testes da lista de ações (Imprimir / Entregar / Recolher / Atualizar escritório / Conferir)."""
import datetime as dt
import pathlib
import sys
import unittest

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "projetos"))

import acoes  # noqa: E402

AGORA = dt.datetime(2026, 11, 3, 20, 17)
D1 = "XPT.ES.112.FORPILOTIS"
D2 = "XPT.AR.010.PLANTABAIX"


def nova_d1():
    return {
        "chave": D1, "titulo": "PLANTA DE FORMA DO PILOTIS - TRECHO 1", "disciplina": "Estrutura",
        "fase": "LO", "numero": "02", "anterior": "EX R05",
        "cadastrada_em": dt.datetime(2026, 8, 26, 9, 58), "cadastrada_por": "projetos@exemplo.test",
        "link_pasta": "https://plataforma.autodoc.com.br/x", "observacoes": "",
    }


class SemNada(unittest.TestCase):
    def test_uma_linha_com_data_e_hora(self):
        texto = acoes.montar_relatorio(AGORA, novas=[], situacoes=[], escritorio=[], invalidos=[])
        self.assertEqual(texto, "Sem revisão nova. Verificado em 03/11/2026 20:17.")


class RevisaoNova(unittest.TestCase):
    def test_lista_quem_recolher_e_entregar(self):
        situacoes = [
            {"chave": D1, "empresa": "Empreiteira A", "situacao": "RECOLHER",
             "revisao_em_campo": "EX R05", "revisao_vigente": "LO R02", "entregas_abertas": 1},
            {"chave": D1, "empresa": "Empreiteira B", "situacao": "OK",
             "revisao_em_campo": "LO R02", "revisao_vigente": "LO R02", "entregas_abertas": 1},
        ]
        escritorio = [{"chave": D1, "revisao_escritorio": "EX R05", "revisao_vigente": "LO R02", "atualizado": False}]
        texto = acoes.montar_relatorio(AGORA, novas=[nova_d1()], situacoes=situacoes, escritorio=escritorio, invalidos=[])
        self.assertIn("verificado em 03/11/2026 20:17", texto.lower())
        self.assertIn("REVISÕES NOVAS (1)", texto)
        self.assertIn("[Estrutura] XPT.ES.112.FORPILOTIS", texto)
        self.assertIn("EX R05 → LO R02", texto)
        self.assertIn("26/08/2026 09:58", texto)
        self.assertIn("projetos@exemplo.test", texto)
        self.assertIn("https://plataforma.autodoc.com.br/x", texto)
        self.assertIn("IMPRIMIR / ENTREGAR (1)", texto)
        self.assertIn("RECOLHER (1)", texto)
        self.assertIn("Empreiteira A", texto)
        self.assertIn("ATUALIZAR ESCRITÓRIO (1)", texto)
        self.assertIn("pasta tem EX R05", texto)
        self.assertNotIn("CONFERIR", texto)
        # quem já tem a vigente aparece como informação, não como ação
        self.assertIn("Já com a vigente: Empreiteira B", texto)

    def test_primeira_revisao_sem_anterior_e_com_descricao(self):
        nova = nova_d1()
        nova["anterior"] = None
        nova["observacoes"] = "Mudança no pilar P12"
        texto = acoes.montar_relatorio(AGORA, novas=[nova], situacoes=[], escritorio=[], invalidos=[])
        self.assertIn("primeira revisão → LO R02", texto)
        self.assertIn("Alteração: Mudança no pilar P12", texto)
        self.assertNotIn("IMPRIMIR", texto)


class Conferir(unittest.TestCase):
    def test_duas_entregas_abertas_e_arquivo_fora_do_padrao(self):
        situacoes = [{"chave": D2, "empresa": "Empreiteira B", "situacao": "CONFERIR",
                      "revisao_em_campo": "EX R04", "revisao_vigente": "EX R04", "entregas_abertas": 2}]
        texto = acoes.montar_relatorio(AGORA, novas=[], situacoes=situacoes, escritorio=[], invalidos=["Planta.pdf"])
        self.assertTrue(texto.startswith("Sem revisão nova. Verificado em 03/11/2026 20:17."))
        self.assertIn("CONFERIR (2)", texto)
        self.assertIn("Empreiteira B: XPT.AR.010.PLANTABAIX com 2 entregas abertas", texto)
        self.assertIn("Arquivo fora do padrão no Autodoc: Planta.pdf", texto)

    def test_documento_sem_vigente(self):
        situacoes = [{"chave": D2, "empresa": "Empreiteira B", "situacao": "CONFERIR",
                      "revisao_em_campo": "LO R01", "revisao_vigente": None, "entregas_abertas": 1}]
        texto = acoes.montar_relatorio(AGORA, novas=[], situacoes=situacoes, escritorio=[], invalidos=[])
        self.assertIn("sem revisão vigente no Autodoc", texto)


class PendenciasAntigas(unittest.TestCase):
    def test_recolher_continua_aparecendo_sem_revisao_nova(self):
        situacoes = [{"chave": D1, "empresa": "Empreiteira A", "situacao": "RECOLHER",
                      "revisao_em_campo": "EX R05", "revisao_vigente": "LO R02", "entregas_abertas": 1}]
        texto = acoes.montar_relatorio(AGORA, novas=[], situacoes=situacoes, escritorio=[], invalidos=[])
        self.assertTrue(texto.startswith("Sem revisão nova."))
        self.assertIn("RECOLHER (1)", texto)
        self.assertIn("Empreiteira A: XPT.ES.112.FORPILOTIS EX R05 (vigente LO R02)", texto)


if __name__ == "__main__":
    unittest.main()

"""Testes do leitor do CSV exportado pela página Relatórios do Autodoc.

Rodar: python -m unittest discover -s pipeline/testes -t .   (na raiz do repositório)
O CSV de exemplo é inventado (obra XPT): nenhum dado de obra real entra no repositório.
"""
import datetime as dt
import pathlib
import sys
import tempfile
import unittest

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "projetos"))

import autodoc_csv  # noqa: E402

EXEMPLO = AQUI / "exemplos" / "relatorio_autodoc_XPT.csv"


class QuebrarCodigo(unittest.TestCase):
    def test_nome_de_arquivo_valido(self):
        c = autodoc_csv.quebrar_codigo("XPT.ES.LO.112.FORPILOTIS-R02.pdf")
        self.assertEqual(c.obra, "XPT")
        self.assertEqual(c.disciplina, "ES")
        self.assertEqual(c.fase, "LO")
        self.assertEqual(c.numero, "112")
        self.assertEqual(c.nome, "FORPILOTIS")
        self.assertEqual(c.revisao, "02")
        self.assertEqual(c.extensao, "pdf")
        self.assertEqual(c.chave, "XPT.ES.112.FORPILOTIS")

    def test_codigo_curto_e_numero_longo(self):
        c = autodoc_csv.quebrar_codigo("EXE.FR.EX.0025.2PVTOXXXXA-R14.dwg")
        self.assertEqual((c.disciplina, c.fase, c.numero, c.nome, c.revisao, c.extensao), ("FR", "EX", "0025", "2PVTOXXXXA", "14", "dwg"))

    def test_fora_da_mascara(self):
        for nome in ("Planta.pdf", "XPT.ES.LO.112.FORPILOTIS.pdf", "xpt.es.lo.112.forpilotis-r02.pdf", "XPT.ES.LO.112.FORPILOTIS-R2.pdf", ""):
            self.assertIsNone(autodoc_csv.quebrar_codigo(nome), nome)


class LerLista(unittest.TestCase):
    def test_exemplo(self):
        lista = autodoc_csv.ler_lista(EXEMPLO)
        self.assertEqual(lista.emitida_em, dt.datetime(2026, 11, 3, 20, 17))
        self.assertEqual(len(lista.arquivos), 5)
        self.assertEqual(lista.invalidos, ["Planta.pdf"])
        a = lista.arquivos[0]
        self.assertEqual(a.codigo.chave, "XPT.ES.112.FORPILOTIS")
        self.assertEqual(a.titulo, "PLANTA DE FORMA DO PILOTIS - TRECHO 1")
        self.assertEqual(a.cadastrada_em, dt.datetime(2026, 8, 26, 10, 0))
        self.assertEqual(a.cadastrada_por, "projetos@exemplo.test")
        self.assertEqual(a.status, "Aprovado")
        self.assertFalse(a.obsoleta)
        self.assertIsNone(a.data_obsoleta)
        self.assertEqual(a.fase_nome, "Liberado Obra")
        self.assertEqual(a.disciplina_nome, "Estrutura")
        self.assertEqual(a.pasta, "129 - XPT (Obra Exemplo)/PROJETOS/Estrutura/Liberado Obra/Formas/")
        obsoleto = [x for x in lista.arquivos if x.codigo.disciplina == "HS"][0]
        self.assertTrue(obsoleto.obsoleta)
        self.assertEqual(obsoleto.data_obsoleta, dt.datetime(2026, 10, 1, 8, 0))

    def test_cabecalho_diferente_recusa_tudo(self):
        texto = EXEMPLO.read_text(encoding="utf-8-sig").replace('"Obsoleto"', '"Obsoleta"', 1)
        with tempfile.TemporaryDirectory() as pasta:
            caminho = pathlib.Path(pasta) / "lista.csv"
            caminho.write_text(texto, encoding="utf-8")
            with self.assertRaises(autodoc_csv.ErroLista) as ctx:
                autodoc_csv.ler_lista(caminho)
        self.assertIn("Obsoleto", str(ctx.exception))

    def test_sem_linha_de_colunas(self):
        with tempfile.TemporaryDirectory() as pasta:
            caminho = pathlib.Path(pasta) / "lista.csv"
            caminho.write_text("a,b,c\n1,2,3\n", encoding="utf-8")
            with self.assertRaises(autodoc_csv.ErroLista):
                autodoc_csv.ler_lista(caminho)

    def test_data_de_emissao_ausente(self):
        texto = EXEMPLO.read_text(encoding="utf-8-sig")
        linhas = texto.split("\n")
        del linhas[2]
        with tempfile.TemporaryDirectory() as pasta:
            caminho = pathlib.Path(pasta) / "lista.csv"
            caminho.write_text("\n".join(linhas), encoding="utf-8")
            lista = autodoc_csv.ler_lista(caminho)
        self.assertIsNone(lista.emitida_em)
        self.assertEqual(len(lista.arquivos), 5)


class AgruparRevisoes(unittest.TestCase):
    def test_junta_dwg_e_pdf(self):
        lista = autodoc_csv.ler_lista(EXEMPLO)
        revisoes = autodoc_csv.agrupar_revisoes(lista.arquivos)
        self.assertEqual(len(revisoes), 4)
        por_chave = {(r.chave, r.fase, r.numero): r for r in revisoes}
        lo = por_chave[("XPT.ES.112.FORPILOTIS", "LO", "02")]
        self.assertEqual(lo.extensoes, "dwg,pdf")
        self.assertEqual(lo.cadastrada_em, dt.datetime(2026, 8, 26, 9, 58))  # a mais antiga das duas
        self.assertEqual(lo.titulo, "PLANTA DE FORMA DO PILOTIS - TRECHO 1")
        self.assertEqual(lo.disciplina, "ES")
        self.assertEqual(lo.nome, "FORPILOTIS")
        ex = por_chave[("XPT.ES.112.FORPILOTIS", "EX", "05")]
        self.assertEqual(ex.extensoes, "pdf")
        hs = por_chave[("XPT.HS.020.ESGOTOTERR", "LO", "01")]
        self.assertTrue(hs.obsoleta)
        self.assertEqual(hs.data_obsoleta, dt.datetime(2026, 10, 1, 8, 0))

    def test_ordem_estavel_por_chave(self):
        lista = autodoc_csv.ler_lista(EXEMPLO)
        chaves = [(r.chave, r.fase, r.numero) for r in autodoc_csv.agrupar_revisoes(lista.arquivos)]
        self.assertEqual(chaves, sorted(chaves))


if __name__ == "__main__":
    unittest.main()

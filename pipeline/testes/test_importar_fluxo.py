"""Testa o fluxo inteiro do importador contra um Supabase de mentira (em memória).

Confere o que o script manda para o servidor (quais tabelas, quais campos) e o relatório que sai,
sem rede e sem login. O servidor de verdade é testado ao vivo com o Nicolas.
"""
import datetime as dt
import io
import pathlib
import shutil
import sys
import tempfile
import unittest
import urllib.parse
from contextlib import redirect_stdout

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "projetos"))

import importar_lista  # noqa: E402
import sessao_local  # noqa: E402

EXEMPLO = AQUI / "exemplos" / "relatorio_autodoc_XPT.csv"
OBRA_ID = "11111111-1111-1111-1111-111111111111"


class SupabaseDeMentira:
    """Guarda as tabelas em listas e responde ao que o importador usa (GET, POST, PATCH)."""

    def __init__(self, url, chave):
        self.url, self.chave = url, chave
        self.refresh_token = "r"
        self.tabelas = {"obras": [{"id": OBRA_ID, "codigo": "XPT", "nome": "Obra Exemplo"}],
                        "documentos": [], "revisoes": [], "empresas": [], "listas_autodoc": [],
                        "situacao_distribuicao": [], "documentos_escritorio": [], "revisoes_vigentes": []}
        self.pedidos = []
        self.proximo_id = 1

    def _filtrar(self, linhas, params):
        for chave, valor in params.items():
            if chave in ("select", "order", "limit", "offset") or not valor.startswith("eq."):
                continue
            esperado = valor[3:]
            linhas = [l for l in linhas if str(l.get(chave)).lower() == esperado.lower()]
        return linhas

    def json(self, metodo, caminho, corpo=None, cabecalhos=None):
        self.pedidos.append((metodo, caminho, corpo))
        tabela, _, consulta = caminho.replace("/rest/v1/", "").partition("?")
        params = dict(urllib.parse.parse_qsl(consulta))
        if metodo == "GET":
            return self._filtrar(self.tabelas[tabela], params)
        if metodo == "POST":
            linhas = corpo if isinstance(corpo, list) else [corpo]
            criadas = []
            for l in linhas:
                l = dict(l)
                l.setdefault("id", f"{tabela[:3]}-{self.proximo_id}")
                l.setdefault("apagado", False)
                self.proximo_id += 1
                self.tabelas[tabela].append(l)
                criadas.append(l)
            return criadas if (cabecalhos or {}).get("Prefer") == "return=representation" else None
        if metodo == "PATCH":
            for l in self._filtrar(self.tabelas[tabela], params):
                l.update(corpo)
            return None
        raise AssertionError(metodo)

    def linhas(self, tabela, filtros):
        return self.json("GET", f"/rest/v1/{tabela}?{urllib.parse.urlencode(filtros)}")


class Fluxo(unittest.TestCase):
    def setUp(self):
        self.pasta = pathlib.Path(tempfile.mkdtemp())
        self.csv = self.pasta / "05_revisoes_vigentes_autodoc_2026-11-03.csv"
        shutil.copy(EXEMPLO, self.csv)
        self.fake = None
        self.originais = (importar_lista.Supabase, importar_lista.entrar, sessao_local.dispositivo_id, sessao_local.guardar_sessao)

        def fabrica(url, chave):
            self.fake = SupabaseDeMentira(url, chave)
            return self.fake
        importar_lista.Supabase = fabrica
        importar_lista.entrar = lambda sb, args: "nicolas@teste.local"
        sessao_local.dispositivo_id = lambda: "dddddddd-dddd-dddd-dddd-dddddddddddd"
        sessao_local.guardar_sessao = lambda *a, **k: None

    def tearDown(self):
        importar_lista.Supabase, importar_lista.entrar, sessao_local.dispositivo_id, sessao_local.guardar_sessao = self.originais
        shutil.rmtree(self.pasta, ignore_errors=True)

    def rodar(self, *extras):
        saida = io.StringIO()
        with redirect_stdout(saida):
            codigo = importar_lista.main(["XPT", "--csv", str(self.csv), *extras])
        return codigo, saida.getvalue()

    def test_banco_vazio_grava_tudo_e_relata(self):
        codigo, saida = self.rodar()
        self.assertEqual(codigo, 0, saida)
        docs = self.fake.tabelas["documentos"]
        revs = self.fake.tabelas["revisoes"]
        self.assertEqual(sorted(d["codigo"] for d in docs), ["XPT.AR.010.PLANTABAIX", "XPT.ES.112.FORPILOTIS", "XPT.HS.020.ESGOTOTERR"])
        self.assertEqual(len(revs), 4)
        d1 = next(d for d in docs if d["codigo"] == "XPT.ES.112.FORPILOTIS")
        self.assertEqual((d1["disciplina_sigla"], d1["numero"], d1["nome_curto"], d1["disciplina"]), ("ES", "112", "FORPILOTIS", "Estrutura"))
        self.assertEqual(d1["obra_id"], OBRA_ID)
        self.assertEqual(d1["dispositivo_id"], "dddddddd-dddd-dddd-dddd-dddddddddddd")
        lo = next(r for r in revs if r["documento_id"] == d1["id"] and r["fase"] == "LO")
        self.assertEqual((lo["numero"], lo["extensoes"], lo["vista_em"], lo["obsoleta"]), ("02", "dwg,pdf", "2026-11-03", False))
        self.assertTrue(lo["cadastrada_em_autodoc"].startswith("2026-08-26T09:58"))
        hs = next(r for r in revs if r["fase"] == "LO" and r["numero"] == "01")
        self.assertTrue(hs["obsoleta"])
        lista = self.fake.tabelas["listas_autodoc"]
        self.assertEqual(len(lista), 1)
        self.assertEqual((lista[0]["linhas"], lista[0]["documentos_novos"], lista[0]["revisoes_novas"], lista[0]["conferir"]), (6, 3, 4, 1))
        self.assertEqual(lista[0]["arquivo"], self.csv.name)
        self.assertIn("REVISÕES NOVAS (3)", saida)          # a obsoleta não é novidade para a obra
        self.assertIn("primeira revisão → LO R02", saida)
        self.assertIn("Arquivo fora do padrão no Autodoc: Planta.pdf", saida)
        relatorio = self.pasta / "relatorio_2026-11-03.txt"
        self.assertTrue(relatorio.exists())
        self.assertIn("REVISÕES NOVAS (3)", relatorio.read_text(encoding="utf-8"))

    def test_segunda_vez_nao_grava_nada(self):
        self.rodar()
        fake = self.fake
        n_pedidos_escrita = sum(1 for m, _, _ in fake.pedidos if m in ("POST", "PATCH"))
        self.assertEqual(n_pedidos_escrita, 3)  # documentos, revisoes, listas_autodoc

        def mesma_fabrica(url, chave):
            return fake
        importar_lista.Supabase = mesma_fabrica
        codigo, saida = self.rodar()
        self.assertEqual(codigo, 0, saida)
        self.assertIn("já foi importada", saida)
        self.assertEqual(sum(1 for m, _, _ in fake.pedidos if m in ("POST", "PATCH")), 3)
        self.assertEqual(len(fake.tabelas["listas_autodoc"]), 1)

    def test_revisao_nova_em_documento_existente_mostra_anterior(self):
        self.rodar()
        fake = self.fake
        # apaga do banco a LO 02 do pilotis: a próxima importação a vê como nova, com EX 05 de anterior
        fake.tabelas["revisoes"] = [r for r in fake.tabelas["revisoes"] if not (r["fase"] == "LO" and r["numero"] == "02")]
        fake.tabelas["listas_autodoc"] = []
        importar_lista.Supabase = lambda url, chave: fake
        codigo, saida = self.rodar()
        self.assertEqual(codigo, 0, saida)
        self.assertIn("REVISÕES NOVAS (1)", saida)
        self.assertIn("EX R05 → LO R02", saida)

    def test_sem_gravar(self):
        codigo, saida = self.rodar("--sem-gravar")
        self.assertEqual(codigo, 0, saida)
        self.assertEqual(self.fake.tabelas["documentos"], [])
        self.assertIn("nada foi gravado", saida)
        self.assertIn("revisão nova: XPT.ES.112.FORPILOTIS LO R02", saida)

    def test_sem_lista_de_hoje_para_com_codigo_2(self):
        self.csv.rename(self.pasta / "05_revisoes_vigentes_autodoc_2020-01-01.csv")
        saida = io.StringIO()
        with redirect_stdout(saida):
            codigo = importar_lista.main(["XPT", "--pasta", str(self.pasta)])
        self.assertEqual(codigo, 2)
        self.assertIn("não há lista de hoje", saida.getvalue())

    def test_csv_inexistente_para_com_codigo_2(self):
        saida = io.StringIO()
        with redirect_stdout(saida):
            codigo = importar_lista.main(["XPT", "--csv", str(self.pasta / "nao_existe.csv")])
        self.assertEqual(codigo, 2)

    def test_cabecalho_diferente_e_erro_1(self):
        texto = self.csv.read_text(encoding="utf-8-sig").replace('"Obsoleto"', '"Obsoleta"', 1)
        self.csv.write_text(texto, encoding="utf-8")
        codigo, saida = self.rodar()
        self.assertEqual(codigo, 1)
        self.assertIn("Obsoleto", saida)
        self.assertIsNone(self.fake)  # nem chegou a falar com o servidor


if __name__ == "__main__":
    unittest.main()

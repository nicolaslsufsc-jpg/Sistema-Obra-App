"""Regras da FVS (config_fvs.json) no pacote da obra: conferência do formato e os dois scripts que fazem o .zip.

Sem o arquivo no .zip, quem abre a obra pelo pacote (app sem conta) nunca recebe os prazos nem as
ligações. Dados inventados (obra EXE).
"""

from __future__ import annotations

import io
import json
import pathlib
import sys
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))
sys.path.insert(0, str(RAIZ / "pipeline"))
sys.path.insert(0, str(RAIZ / "pipeline" / "testes"))

import compactar_pacote  # noqa: E402
import exportar_bancada  # noqa: E402
import regras_fvs  # noqa: E402
from test_fvs_compactar import pasta_de_teste  # noqa: E402
from test_fvs_entrega import pacotes_de_teste  # noqa: E402

NO_ZIP = "dados_obra/config_fvs.json"


def regras_de_teste() -> dict:
    return {
        "prazos": [
            {"id": "pilar-desforma", "ficha": "EXE-PVS-001", "item": 7, "dias": 3, "depois_de": {"tipo": "concretagem"}, "texto": "Desforma do pilar"},
            {"id": "viga-reescoramento", "ficha": "EXE-PVS-002", "item": 9, "dias": 0, "depois_de": {"tipo": "item", "ficha": "EXE-PVS-002", "item": 8}},
        ],
        "ligacoes": [{"id": "armadura-prumo", "de": {"ficha": "EXE-PVS-001", "item": 4}, "para": {"ficha": "EXE-PVS-001", "item": 5}}],
    }


class TestConferir(unittest.TestCase):
    def test_formato_certo_conta_prazos_e_ligacoes(self):
        self.assertEqual(regras_fvs.conferir(regras_de_teste()), {"prazos": 2, "ligacoes": 1})
        # as duas listas podem faltar, e campo a mais numa regra passa (como no banco)
        self.assertEqual(regras_fvs.conferir({}), {"prazos": 0, "ligacoes": 0})
        com_campo = regras_de_teste()
        com_campo["ligacoes"][0]["entre"] = "area"
        self.assertEqual(regras_fvs.conferir(com_campo)["ligacoes"], 1)

    def recusa(self, mudar, mensagem):
        r = regras_de_teste()
        mudar(r)
        with self.assertRaisesRegex(regras_fvs.ErroRegrasFvs, mensagem):
            regras_fvs.conferir(r)

    def test_recusa_o_que_o_banco_recusa(self):
        with self.assertRaisesRegex(regras_fvs.ErroRegrasFvs, "objeto"):
            regras_fvs.conferir([])
        self.recusa(lambda r: r.update(prazos={}), '"prazos" tem que ser uma lista')
        self.recusa(lambda r: r["prazos"][0].pop("id"), 'regra em "prazos" sem id')
        self.recusa(lambda r: r["prazos"][1].update(id="pilar-desforma"), "id repetido")
        # o caso que motivou a conferência: o arquivo com os dias ainda por definir
        self.recusa(lambda r: r["prazos"][0].update(dias=None), 'prazo "pilar-desforma" com dias fora de 0 a 365')
        self.recusa(lambda r: r["prazos"][0].update(dias=2.5), "dias fora")
        self.recusa(lambda r: r["prazos"][0].update(dias=True), "dias fora")
        self.recusa(lambda r: r["prazos"][0].update(dias=366), "dias fora")
        self.recusa(lambda r: r["prazos"][0].update(item=0), "número de item inválido")
        self.recusa(lambda r: r["prazos"][0].update(ficha=""), "sem ficha")
        self.recusa(lambda r: r["prazos"][0].update(depois_de={"tipo": "desforma"}), 'sem "depois_de"')
        self.recusa(lambda r: r["prazos"][1]["depois_de"].update(item="8"), '"depois_de" sem ficha')
        self.recusa(lambda r: r["prazos"][1]["depois_de"].update(item=9), "conta a partir do próprio item")
        self.recusa(lambda r: r["prazos"][0].update(texto="x" * 501), "texto do prazo")
        self.recusa(lambda r: r["ligacoes"][0].pop("para"), 'ligação "armadura-prumo" sem ficha')
        self.recusa(lambda r: r["ligacoes"][0]["para"].update(item=4), "liga o item a ele mesmo")

    def test_ler_diz_o_arquivo_e_aceita_a_marca_de_utf8(self):
        with tempfile.TemporaryDirectory() as t:
            arq = pathlib.Path(t) / "config_fvs.json"
            arq.write_text(json.dumps(regras_de_teste()), encoding="utf-8-sig")  # Bloco de Notas do Windows
            config, contagem = regras_fvs.ler(arq)
            self.assertEqual((config, contagem), (regras_de_teste(), {"prazos": 2, "ligacoes": 1}))
            arq.write_text("{prazos:", encoding="utf-8")
            with self.assertRaisesRegex(regras_fvs.ErroRegrasFvs, "não é JSON válido"):
                regras_fvs.ler(arq)
            arq.write_text('{"prazos": [{"id": "a"}]}', encoding="utf-8")
            with self.assertRaisesRegex(regras_fvs.ErroRegrasFvs, r'config_fvs\.json: prazo "a"'):
                regras_fvs.ler(arq)


class TestExportarBancada(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.base = pathlib.Path(self._t.name)
        self.addCleanup(self._t.cleanup)
        self.pacotes = pacotes_de_teste(self.base)
        self.saida = self.base / "z.zip"

    def config(self, onde: pathlib.Path, regras: dict | None = None) -> pathlib.Path:
        onde.parent.mkdir(parents=True, exist_ok=True)
        onde.write_text(json.dumps(regras or regras_de_teste(), ensure_ascii=False), encoding="utf-8")
        return onde

    def test_config_pedido_vai_no_zip_inteiro_e_antes_do_indice(self):
        arq = self.config(self.base / "regras" / "config_fvs.json")
        r = exportar_bancada.exportar(self.pacotes, [], None, self.saida, config_fvs=arq)
        self.assertEqual((r["prazos"], r["ligacoes"], r["regras"]), (2, 1, str(arq)))
        with zipfile.ZipFile(self.saida) as z:
            # o app grava o objeto da raiz inteiro em fvs_regras.regras (pacote_obra.ts)
            self.assertEqual(json.loads(z.read(NO_ZIP)), regras_de_teste())
            self.assertEqual(z.namelist()[-1], "dados_obra/indice.json")
            self.assertEqual(z.getinfo(NO_ZIP).compress_type, zipfile.ZIP_DEFLATED)

    def test_sem_a_opcao_vale_o_config_da_pasta_dos_pacotes(self):
        self.config(self.pacotes / "config_fvs.json")
        r = exportar_bancada.exportar(self.pacotes, [], None, self.saida)
        self.assertEqual((r["prazos"], r["ligacoes"]), (2, 1))
        with zipfile.ZipFile(self.saida) as z:
            self.assertEqual(json.loads(z.read(NO_ZIP)), regras_de_teste())

    def test_o_config_pedido_ganha_do_da_pasta(self):
        self.config(self.pacotes / "config_fvs.json")
        outro = self.config(self.base / "outro.json", {"prazos": [], "ligacoes": []})
        r = exportar_bancada.exportar(self.pacotes, [], None, self.saida, config_fvs=outro)
        self.assertEqual((r["prazos"], r["ligacoes"]), (0, 0))
        with zipfile.ZipFile(self.saida) as z:
            self.assertEqual(json.loads(z.read(NO_ZIP)), {"prazos": [], "ligacoes": []})

    def test_sem_config_o_zip_sai_como_antes(self):
        r = exportar_bancada.exportar(self.pacotes, [], None, self.saida)
        self.assertEqual((r["regras"], r["prazos"], r["ligacoes"]), (None, 0, 0))
        with zipfile.ZipFile(self.saida) as z:
            self.assertNotIn(NO_ZIP, z.namelist())

    def test_config_torto_ou_faltando_para_antes_de_gravar_o_zip(self):
        torto = regras_de_teste()
        torto["prazos"][0]["dias"] = None
        with self.assertRaisesRegex(exportar_bancada.ErroExportacaoBancada, r'config_fvs\.json: prazo "pilar-desforma" com dias fora'):
            exportar_bancada.exportar(self.pacotes, [], None, self.saida, config_fvs=self.config(self.base / "config_fvs.json", torto))
        with self.assertRaisesRegex(exportar_bancada.ErroExportacaoBancada, "falta .*nao_existe.json"):
            exportar_bancada.exportar(self.pacotes, [], None, self.saida, config_fvs=self.base / "nao_existe.json")
        self.assertFalse(self.saida.exists())
        self.assertFalse(self.saida.with_suffix(".tmp").exists())

    def test_linha_de_comando_diz_quantas_regras_foram(self):
        arq = self.config(self.base / "config_fvs.json")
        tela = io.StringIO()
        with redirect_stdout(tela):
            codigo = exportar_bancada.main([str(self.pacotes), "--saida", str(self.saida), "--config-fvs", str(arq)])
        self.assertEqual(codigo, 0)
        self.assertIn("Regras da FVS: 2 prazos e 1 ligações", tela.getvalue())
        with zipfile.ZipFile(self.saida) as z:
            self.assertIn(NO_ZIP, z.namelist())
        arq.unlink()
        tela = io.StringIO()
        with redirect_stdout(tela):
            exportar_bancada.main([str(self.pacotes), "--saida", str(self.saida)])
        self.assertIn("Regras da FVS: nenhuma", tela.getvalue())


class TestCompactarPacote(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.base = pathlib.Path(self._t.name)
        self.addCleanup(self._t.cleanup)
        self.pasta = pasta_de_teste(self.base)

    def test_config_da_pasta_vai_no_zip(self):
        (self.pasta / "config_fvs.json").write_text(json.dumps(regras_de_teste()), encoding="utf-8")
        compactar_pacote.compactar(self.pasta, self.base / "p.zip")
        with zipfile.ZipFile(self.base / "p.zip") as z:
            self.assertEqual(json.loads(z.read(NO_ZIP)), regras_de_teste())
            self.assertEqual(z.namelist()[-1], "dados_obra/indice.json")

    def test_config_torto_e_recusado(self):
        (self.pasta / "config_fvs.json").write_text('{"ligacoes": [{"id": "x"}]}', encoding="utf-8")
        with self.assertRaisesRegex(compactar_pacote.ErroCompactar, r'config_fvs\.json: ligação "x"'):
            compactar_pacote.compactar(self.pasta, self.base / "p.zip")
        self.assertFalse((self.base / "p.zip").exists())


if __name__ == "__main__":
    unittest.main()

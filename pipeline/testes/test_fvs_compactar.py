"""Pacote da obra em .zip para o tablet (pipeline/fvs/compactar_pacote.py). Dados inventados."""

from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import unittest
import zipfile

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))
sys.path.insert(0, str(RAIZ / "pipeline"))

import compactar_pacote as cp  # noqa: E402


def pasta_de_teste(base: pathlib.Path) -> pathlib.Path:
    pasta = base / "dados_obra"
    (pasta / "pav" / "planta").mkdir(parents=True)
    indice = {"obra": "TESTE", "pavimentos": [{"nome": "1º", "pecas": [], "plantas": [{"id": "p1", "pasta": "pav/planta/"}]}]}
    (pasta / "indice.json").write_text(json.dumps(indice), encoding="utf-8")
    (pasta / "fichas.json").write_text("[]", encoding="utf-8")
    (pasta / "pav" / "planta" / "manifest.json").write_text("{}", encoding="utf-8")
    (pasta / "pav" / "planta" / "pacote.bin").write_bytes(bytes(range(256)) * 40)
    return pasta


class TestCompactar(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.base = pathlib.Path(self._tmp.name)
        self.pasta = pasta_de_teste(self.base)

    def tearDown(self):
        self._tmp.cleanup()

    def test_json_comprimido_e_bin_sem_compressao_dentro_de_dados_obra(self):
        r = cp.compactar(self.pasta, self.base / "pacote.zip")
        self.assertEqual((r["obra"], r["arquivos"]), ("TESTE", 4))
        with zipfile.ZipFile(self.base / "pacote.zip") as z:
            tipos = {i.filename: i.compress_type for i in z.infolist()}
            self.assertEqual(tipos["dados_obra/pav/planta/pacote.bin"], zipfile.ZIP_STORED)
            self.assertEqual(tipos["dados_obra/indice.json"], zipfile.ZIP_DEFLATED)
            self.assertEqual(z.read("dados_obra/pav/planta/pacote.bin"), bytes(range(256)) * 40)
        self.assertFalse((self.base / "pacote.tmp").exists())

    def test_recusa_pasta_sem_indice_planta_faltando_e_saida_errada(self):
        with self.assertRaisesRegex(cp.ErroCompactar, "falta o indice.json"):
            cp.compactar(self.base, self.base / "x.zip")
        with self.assertRaisesRegex(cp.ErroCompactar, "terminar em .zip"):
            cp.compactar(self.pasta, self.base / "x.rar")
        with self.assertRaisesRegex(cp.ErroCompactar, "dentro da pasta"):
            cp.compactar(self.pasta, self.pasta / "x.zip")
        with self.assertRaisesRegex(cp.ErroCompactar, "repositório"):
            cp.compactar(self.pasta, RAIZ / "x.zip")
        (self.pasta / "pav" / "planta" / "pacote.bin").unlink()
        with self.assertRaisesRegex(cp.ErroCompactar, "faltam 1 arquivo"):
            cp.compactar(self.pasta, self.base / "x.zip")
        self.assertFalse((self.base / "x.zip").exists())


    def test_so_o_que_o_indice_cita_sem_atalho_nem_arquivo_solto(self):
        (self.pasta / "notas.txt").write_text("rascunho", encoding="utf-8")
        (self.pasta / "pav" / "velha").mkdir()
        (self.pasta / "pav" / "velha" / "pacote.bin").write_bytes(b"x")
        (self.pasta / "historico.json").write_text("{}", encoding="utf-8")
        fora = self.base / "segredo.txt"
        fora.write_text("fora da pasta", encoding="utf-8")
        try:
            (self.pasta / "atalho.json").symlink_to(fora)
        except OSError:
            pass  # Windows sem permissão de criar atalho: o resto do teste vale igual
        cp.compactar(self.pasta, self.base / "pacote.zip")
        with zipfile.ZipFile(self.base / "pacote.zip") as z:
            self.assertEqual(sorted(z.namelist()), [
                "dados_obra/fichas.json", "dados_obra/historico.json", "dados_obra/indice.json",
                "dados_obra/pav/planta/manifest.json", "dados_obra/pav/planta/pacote.bin",
            ])
            self.assertEqual(z.namelist()[-1], "dados_obra/indice.json")

    def test_planta_atalho_ou_fora_da_pasta_e_recusada(self):
        indice = json.loads((self.pasta / "indice.json").read_text(encoding="utf-8"))
        indice["pavimentos"][0]["plantas"][0]["pasta"] = "../"
        (self.pasta / "indice.json").write_text(json.dumps(indice), encoding="utf-8")
        (self.base / "manifest.json").write_text("{}", encoding="utf-8")
        (self.base / "pacote.bin").write_bytes(b"x")
        with self.assertRaisesRegex(cp.ErroCompactar, "faltam 2"):
            cp.compactar(self.pasta, self.base / "x.zip")

    def test_nome_da_obra_so_no_zip(self):
        cp.compactar(self.pasta, self.base / "com_nome.zip", nome="  Obra de Teste ")
        with zipfile.ZipFile(self.base / "com_nome.zip") as z:
            self.assertEqual(json.loads(z.read("dados_obra/indice.json"))["nome"], "Obra de Teste")
        self.assertNotIn("nome", json.loads((self.pasta / "indice.json").read_text(encoding="utf-8")))

    def test_data_do_indice_vai_no_zip(self):
        cp.compactar(self.pasta, self.base / "sem.zip")
        with zipfile.ZipFile(self.base / "sem.zip") as z:
            gerado = json.loads(z.read("dados_obra/indice.json"))["gerado_em"]
        self.assertRegex(gerado, r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$")
        # a pasta não é alterada: a data só vai no índice de dentro do .zip
        self.assertNotIn("gerado_em", json.loads((self.pasta / "indice.json").read_text(encoding="utf-8")))
        # sem data no índice: a do arquivo; com data: fica a do pipeline
        indice = json.loads((self.pasta / "indice.json").read_text(encoding="utf-8"))
        (self.pasta / "indice.json").write_text(json.dumps({**indice, "gerado_em": "2026-11-08T13:00:00+00:00"}), encoding="utf-8")
        cp.compactar(self.pasta, self.base / "com.zip")
        with zipfile.ZipFile(self.base / "com.zip") as z:
            self.assertEqual(json.loads(z.read("dados_obra/indice.json"))["gerado_em"], "2026-11-08T13:00:00+00:00")


if __name__ == "__main__":
    unittest.main()


class TestCompactarDocumentos(unittest.TestCase):
    """Documentos da empresa vão em dados_obra/documentos/, como no exportar_bancada.py (20/11/2026)."""

    PDF = b"%PDF-1.4 documento de teste"

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.base = pathlib.Path(self._tmp.name)
        self.pasta = pasta_de_teste(self.base)

    def tearDown(self):
        self._tmp.cleanup()

    def _indice_no_formato_do_app(self, **arquivo):
        import hashlib
        (self.pasta / "documentos" / "arquivos").mkdir(parents=True)
        (self.pasta / "documentos" / "arquivos" / "001.pdf").write_bytes(self.PDF)
        a = {"caminho": "arquivos/001.pdf", "nome": "manual.pdf", "tipo": "application/pdf", "tamanho": len(self.PDF), "sha256": hashlib.sha256(self.PDF).hexdigest()}
        a.update(arquivo)
        docs = {"documentos": [{"categoria": "sistema", "codigo": "EXE-MQ", "titulo": "Manual da Qualidade", "revisao": "03", "data_revisao": "2026-02-01",
                                "validade": None, "responsavel": "Qualidade", "situacao": "vigente", "observacao": None, "arquivo": a}]}
        (self.pasta / "documentos" / "indice.json").write_text(json.dumps(docs), encoding="utf-8")
        # arquivo solto que o índice não cita: não entra
        (self.pasta / "documentos" / "solto.pdf").write_bytes(self.PDF)

    def test_leva_documentos_da_pasta_so_o_que_o_indice_cita(self):
        self._indice_no_formato_do_app()
        r = cp.compactar(self.pasta, self.base / "pacote.zip")
        self.assertEqual(r["documentos"], 1)
        with zipfile.ZipFile(self.base / "pacote.zip") as z:
            nomes = set(z.namelist())
            self.assertIn("dados_obra/documentos/indice.json", nomes)
            self.assertEqual(z.read("dados_obra/documentos/arquivos/001.pdf"), self.PDF)
            self.assertNotIn("dados_obra/documentos/solto.pdf", nomes)
            self.assertEqual(json.loads(z.read("dados_obra/documentos/indice.json"))["documentos"][0]["codigo"], "EXE-MQ")

    def test_sem_documentos_o_zip_sai_como_antes(self):
        r = cp.compactar(self.pasta, self.base / "pacote.zip")
        self.assertEqual((r["arquivos"], r["documentos"]), (4, 0))
        with zipfile.ZipFile(self.base / "pacote.zip") as z:
            self.assertFalse(any(n.startswith("dados_obra/documentos/") for n in z.namelist()))

    def test_recusa_documento_adulterado_ou_fora_da_pasta(self):
        self._indice_no_formato_do_app(sha256="0" * 64)
        with self.assertRaisesRegex(cp.ErroCompactar, "SHA-256"):
            cp.compactar(self.pasta, self.base / "x.zip")
        for arquivo, erro in (({"caminho": "../indice.json"}, "não está em documentos"), ({"caminho": "arquivos/nao_existe.pdf"}, "não está em documentos")):
            import shutil
            shutil.rmtree(self.pasta / "documentos")
            self._indice_no_formato_do_app(**arquivo)
            with self.assertRaisesRegex(cp.ErroCompactar, erro):
                cp.compactar(self.pasta, self.base / "x.zip")
        self.assertFalse((self.base / "x.zip").exists())

    def test_opcao_documentos_usa_a_conferencia_do_exportar_bancada(self):
        origem = self.base / "docs_empresa"
        origem.mkdir()
        (origem / "manual.pdf").write_bytes(self.PDF)
        lista = [{"categoria": "sistema", "codigo": "exe-mq", "titulo": "Manual da Qualidade", "revisao": "03", "data_revisao": "2026-02-01",
                  "responsavel": "Qualidade", "arquivo": "manual.pdf"}]
        (origem / "documentos.json").write_text(json.dumps(lista), encoding="utf-8")
        r = cp.compactar(self.pasta, self.base / "pacote.zip", documentos=origem)
        self.assertEqual(r["documentos"], 1)
        with zipfile.ZipFile(self.base / "pacote.zip") as z:
            docs = json.loads(z.read("dados_obra/documentos/indice.json"))
            self.assertEqual(docs["documentos"][0]["codigo"], "EXE-MQ")
            self.assertEqual(z.read("dados_obra/documentos/" + docs["documentos"][0]["arquivo"]["caminho"]), self.PDF)
        lista[0]["categoria"] = "nao_existe"
        (origem / "documentos.json").write_text(json.dumps(lista), encoding="utf-8")
        with self.assertRaisesRegex(cp.ErroCompactar, "categoria"):
            cp.compactar(self.pasta, self.base / "y.zip", documentos=origem)

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

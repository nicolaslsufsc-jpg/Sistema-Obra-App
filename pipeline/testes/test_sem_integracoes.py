"""A varredura do site compilado da prova sem integrações (supabase/testes/sem_integracoes.py)."""

import importlib.util
import pathlib
import tempfile
import unittest

_ARQ = pathlib.Path(__file__).resolve().parents[2] / "supabase" / "testes" / "sem_integracoes.py"
_spec = importlib.util.spec_from_file_location("sem_integracoes", _ARQ)
si = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(si)


class TestVarrerSite(unittest.TestCase):
    def site(self, arquivos: dict[str, str]) -> pathlib.Path:
        d = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(lambda: __import__("shutil").rmtree(d, ignore_errors=True))
        for rel, texto in arquivos.items():
            (d / rel).parent.mkdir(parents=True, exist_ok=True)
            (d / rel).write_text(texto, encoding="utf-8")
        return d

    def test_site_limpo_passa(self):
        d = self.site({"index.html": "<title>App</title>", "assets/a.js": "const k='sb_publishable_abc123'"})
        self.assertEqual(si.varrer_site(d, ["sistemaexemplo"]), [])

    def test_acha_segredo(self):
        d = self.site({"assets/a.js": "const k='sb_secret_abcdefghijk'", "assets/b.js": "role:'service_role'",
                       "x.txt": "-----BEGIN PRIVATE KEY-----"})
        self.assertEqual(len(si.varrer_site(d, [])), 3)

    def test_acha_nome_e_endereco_do_galho_mas_nao_coluna_do_banco(self):
        d = self.site({"assets/a.js": "fetch('https://app.sistemaexemplo.test/api')"})
        achados = si.varrer_site(d, ["sistemaexemplo"])
        self.assertEqual(len(achados), 1)
        self.assertIn("assets/a.js", achados[0])
        # as colunas do banco com o nome de um galho instalado não contam (o nome vem do próprio galho)
        for nome in si.galhos():
            d = self.site({"assets/b.js": f"select('codigo_{nome}')"})
            if si.COLUNAS_DO_BANCO.search(f"codigo_{nome}"):
                self.assertEqual(si.varrer_site(d, [nome]), [])


if __name__ == "__main__":
    unittest.main()

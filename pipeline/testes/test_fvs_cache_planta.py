"""O arquivo da planta sobe com cache longo (custo de internet do servidor, 24/11/2026). Sem servidor: dublê."""

from __future__ import annotations

import pathlib
import sys
import unittest
from unittest import mock

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))
sys.path.insert(0, str(RAIZ / "pipeline"))

import publicar_planta  # noqa: E402


class SbFalso:
    url = "http://127.0.0.1:9"

    def _renovar_se_preciso(self):
        pass

    def _cabecalhos(self, extra):
        return {"Authorization": "Bearer x", **extra}


class RespostaFalsa:
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return b"{}"


class TestCacheDaPlanta(unittest.TestCase):
    def test_envio_pede_cache_longo_e_nao_sobrescreve(self):
        srv = object.__new__(publicar_planta.Servidor)
        srv.sb = SbFalso()
        srv.dispositivo = "d"
        srv.usuario = "u"
        srv.inserir = lambda tabela, linhas: [{"id": "arq-1"}]
        pedidos = []
        with mock.patch.object(publicar_planta.urllib.request, "urlopen", lambda req, timeout=0: pedidos.append(req) or RespostaFalsa()):
            self.assertEqual(srv.enviar_arquivo("obra", "obra/fvs/plantas/p1/pacote.bin", b"123", "application/octet-stream", "pacote.bin"), "arq-1")
        self.assertEqual(len(pedidos), 1)
        self.assertEqual(pedidos[0].get_header("Cache-control"), "public, max-age=31536000, immutable")
        self.assertEqual(pedidos[0].get_header("X-upsert"), "false")


if __name__ == "__main__":
    unittest.main()

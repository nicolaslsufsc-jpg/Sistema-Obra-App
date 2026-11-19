"""Planta e fichas de mentira da obra TESTE. Nada aqui acessa servidor nenhum: o servidor é um dublê."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import pathlib
import sys
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))
sys.path.insert(0, str(RAIZ / "pipeline"))

import pacote  # noqa: E402
import publicar_demo as demo  # noqa: E402
import publicar_fichas  # noqa: E402
import publicar_planta  # noqa: E402

TEM_PILLOW = importlib.util.find_spec("PIL") is not None


class DesenhoFalso:
    def tiles(self, pecas, prancha):
        return {"0/0/0": prancha.encode()}

    def detalhe(self, peca):
        return b"D" + peca["nome"].encode()

    def aco(self, peca):
        return b"A" + peca["nome"].encode()


class ServidorFalso:
    """O que a publicação pede do servidor, guardado em listas."""

    def __init__(self, codigo="TESTE"):
        self.codigo = codigo
        self.tabelas = {"fichas_modelo": [], "elementos": [], "plantas": [], "setores": [], "arquivos": []}
        self.enviados = {}
        self.pedidos = []

    def _base(self, obra_id):
        return {"obra_id": obra_id, "usuario_id": "u", "dispositivo_id": "d", "criado_em_dispositivo": "2026-11-05T12:00:00+00:00"}

    def obra(self, codigo):
        if codigo != self.codigo:
            raise publicar_planta.ErroPublicacao(f"obra {codigo} não encontrada")
        return {"id": "obra-1", "codigo": codigo}

    def pavimento(self, obra_id, nome):
        return {"id": f"pav-{nome}", "nome": nome, "ordem": 1}

    def obter(self, tabela, filtros):
        self.pedidos.append(("obter", tabela))
        return list(self.tabelas[tabela])

    def inserir(self, tabela, linhas):
        self.pedidos.append(("inserir", tabela))
        self.tabelas[tabela] += linhas
        return linhas

    def setor(self, obra_id, pavimento_id, trecho, disciplina):
        for s in self.tabelas["setores"]:
            if s["trecho"] == trecho:
                return s
        s = {"id": f"setor-{trecho}", "trecho": trecho}
        self.tabelas["setores"].append(s)
        return s

    def enviar_arquivo(self, obra_id, caminho, dados, tipo, nome):
        self.enviados[caminho] = dados
        self.pedidos.append(("enviar", caminho))
        return f"arq-{len(self.enviados)}"


def publicar(srv, revisao="R00", pavimento="Térreo"):
    with contextlib.redirect_stdout(io.StringIO()):
        return demo.publicar_tudo(srv, revisao, pavimento, DesenhoFalso())


class TestPecas(unittest.TestCase):
    def test_grade_dos_dois_trechos(self):
        t1, t2 = demo.pecas_do_trecho("Trecho 1"), demo.pecas_do_trecho("Trecho 2")
        for pecas in (t1, t2):
            self.assertEqual(sum(1 for p in pecas if p["tipo"] == "P"), 24)
            self.assertEqual(sum(1 for p in pecas if p["tipo"] == "V"), 38)
            nomes = [(p["tipo"], p["nome"]) for p in pecas]
            self.assertEqual(len(set(nomes)), len(nomes), "peça repetida no mesmo trecho")

    def test_a_coluna_da_divisa_e_a_mesma_peca_nos_dois_trechos(self):
        nomes = lambda pecas: {p["nome"] for p in pecas if p["tipo"] == "P"}  # noqa: E731
        comuns = nomes(demo.pecas_do_trecho("Trecho 1")) & nomes(demo.pecas_do_trecho("Trecho 2"))
        self.assertEqual(comuns, {"P6", "P17", "P28", "P39"})

    def test_viga_nao_repete_nome_na_obra(self):
        vigas = {}
        for trecho in demo.COLUNAS_DOS_TRECHOS:
            for p in demo.pecas_do_trecho(trecho):
                if p["tipo"] == "V":
                    vigas.setdefault(p["nome"], set()).add(tuple(map(tuple, p["polys"][0])))
        # a mesma viga aparece com um desenho só por trecho; nome igual só na coluna da divisa
        self.assertEqual(sum(len(v) > 1 for v in vigas.values()), 3)

    def test_tudo_dentro_da_folha(self):
        for trecho in demo.COLUNAS_DOS_TRECHOS:
            for p in demo.pecas_do_trecho(trecho):
                for x, y in p["polys"][0]:
                    self.assertTrue(0 <= x <= demo.LARGURA and 0 <= y <= demo.ALTURA, p["nome"])
                x0, y0, x1, y1 = p["rotulo"]
                self.assertTrue(0 <= x0 < x1 <= demo.LARGURA and 0 <= y0 < y1 <= demo.ALTURA, p["nome"])

    def test_fichas_passam_pela_regra_da_publicacao(self):
        fichas = publicar_fichas.normalizar(demo.FICHAS)
        self.assertEqual([f["aplica_a"] for f in fichas], [["P"], ["V"]])
        for f in fichas:
            self.assertTrue(f["codigo"].startswith("TESTE-"), "ficha de mentira tem que se identificar")


class TestPublicar(unittest.TestCase):
    def test_publica_fichas_pecas_e_plantas(self):
        srv = ServidorFalso()
        rels = publicar(srv)
        self.assertEqual(len(srv.tabelas["fichas_modelo"]), 2)
        self.assertEqual(len(srv.tabelas["plantas"]), 2)
        self.assertEqual([r["trecho"] for r in rels], ["Trecho 1", "Trecho 2"])
        # 44 pilares na obra; a coluna da divisa não duplica
        self.assertEqual(sum(1 for e in srv.tabelas["elementos"] if e["tipo"] == "P"), 44)
        for p in srv.tabelas["plantas"]:
            self.assertIsNone(p["substitui_id"])
            self.assertEqual(p["revisao"], "R00")
            self.assertEqual(p["elementos"], 62)
        # cada trecho envia os dois arquivos
        self.assertEqual(len(srv.enviados), 4)
        # as fichas entram antes das plantas: planta sem ficha não serve para nada
        ordem = [p[1] for p in srv.pedidos if p[0] == "inserir"]
        self.assertLess(ordem.index("fichas_modelo"), ordem.index("plantas"))

    def test_pacote_publicado_abre_e_as_pecas_tem_os_ids_do_servidor(self):
        srv = ServidorFalso()
        publicar(srv)
        planta = srv.tabelas["plantas"][0]
        base = f"obra-1/fvs/plantas/{planta['id']}"
        man, ped = pacote.ler(srv.enviados[f"{base}/manifest.json"], srv.enviados[f"{base}/pacote.bin"])
        self.assertEqual(man["planta_id"], planta["id"])
        self.assertEqual(man["obra"], "TESTE")
        ids = {e["id"] for e in srv.tabelas["elementos"]}
        self.assertTrue(set(man["elementos"]) <= ids)
        com_detalhe = [e for e in man["elementos"].values() if e.get("detalhe")]
        self.assertTrue(any(e["tipo"] == "V" for e in com_detalhe))
        self.assertTrue(any(e["tipo"] == "V" and "detalhe" not in e for e in man["elementos"].values()), "viga sem detalhe é um dos casos a ver")
        self.assertTrue(man["detalhes"]["P_P1"]["aco"])
        self.assertIn("a:P_P1", ped)

    def test_revisao_seguinte_substitui_a_anterior_e_reaproveita_as_pecas(self):
        srv = ServidorFalso()
        publicar(srv)
        antes = [p["id"] for p in srv.tabelas["plantas"]]
        pecas = len(srv.tabelas["elementos"])
        publicar(srv, "R01")
        novas = srv.tabelas["plantas"][2:]
        self.assertEqual([p["substitui_id"] for p in novas], antes)
        self.assertEqual({p["revisao"] for p in novas}, {"R01"})
        self.assertEqual({p["prancha"].split("-")[-1] for p in novas}, {"R01"})
        self.assertEqual(len(srv.tabelas["elementos"]), pecas)
        self.assertEqual(len(srv.tabelas["fichas_modelo"]), 2, "ficha não duplica")

    def test_nao_publica_noutra_obra(self):
        # o dublê só conhece a obra EXE: pedir TESTE dá erro em vez de cair nela
        with self.assertRaises(publicar_planta.ErroPublicacao):
            publicar(ServidorFalso("EXE"))
        cfg, _, _ = demo.montar_demo("R00", "Térreo", DesenhoFalso())
        self.assertEqual(cfg["obra"], "TESTE")


@unittest.skipUnless(TEM_PILLOW, "precisa do Pillow")
class TestDesenho(unittest.TestCase):
    def test_imagens_de_verdade(self):
        from PIL import Image

        d = demo.Desenho()
        pecas = demo.pecas_do_trecho("Trecho 1")
        tiles = d.tiles(pecas, "TESTE.ES.LO.001.FOR-R00")
        self.assertIn("-2/0/0", tiles)
        self.assertIn("1/0/0", tiles)
        im = Image.open(io.BytesIO(tiles["0/0/0"]))
        self.assertEqual(im.size, (512, 512))
        self.assertEqual(im.format, "WEBP")
        # no nível 1 a folha tem 4000 x 2600: 8 x 6 tiles no máximo
        for chave in tiles:
            z, x, y = (int(v) for v in chave.split("/"))
            self.assertLess(x * 512, demo.LARGURA * 2 ** z)
            self.assertLess(y * 512, demo.ALTURA * 2 ** z)
        self.assertEqual(Image.open(io.BytesIO(d.detalhe(pecas[0]))).format, "WEBP")
        self.assertEqual(Image.open(io.BytesIO(d.aco(pecas[0]))).format, "WEBP")


if __name__ == "__main__":
    unittest.main()

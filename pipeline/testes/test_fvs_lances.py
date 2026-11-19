"""Regra dos lances (pipeline/fvs/lances.py) e o que ela faz no pacote (publicar_planta): peça sem detalhe ou
de passagem sai da planta, arranque fica só com o detalhe, imagem nova ganha a data da correção."""

from __future__ import annotations

import pathlib
import sys
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))

import lances  # noqa: E402
import pacote  # noqa: E402
import publicar_planta  # noqa: E402

TERREO, PILOTIS = 2, 3


class TestSituacao(unittest.TestCase):
    def test_situacoes(self):
        self.assertEqual(lances.situacao([1, 2], TERREO), "termina")
        self.assertEqual(lances.situacao([0, 1, 2], TERREO), "termina")
        self.assertEqual(lances.situacao([2, 3], TERREO), "nasce")
        self.assertEqual(lances.situacao([1, 3], TERREO), "passa")
        self.assertEqual(lances.situacao([0, 1], TERREO), "fora")
        self.assertEqual(lances.situacao([0], TERREO), "sem_lance")
        self.assertEqual(lances.situacao([1, 2], None), "sem_lance")

    def test_lance_que_sai_da_fundacao_fica_no_primeiro_pavimento(self):
        # decisão do Nicolas (18/11): pilar com lance Fundação > Térreo, conferido no Subsolo, fica no Subsolo
        SUBSOLO = lances.ordem_do_pavimento("Subsolo")
        self.assertEqual(lances.situacao([0, 2], SUBSOLO), "sai_da_fundacao")
        self.assertEqual(lances.situacao([0], SUBSOLO), "sai_da_fundacao")  # só "Fundação" legível no quadro
        self.assertEqual(lances.situacao([0, 1], SUBSOLO), "termina")
        self.assertEqual(lances.situacao([0, 1, 2], SUBSOLO), "termina")
        # só no primeiro pavimento: no Térreo o mesmo lance termina, e no Pilotis é de outro lance
        self.assertEqual(lances.situacao([0, 2], TERREO), "termina")
        self.assertEqual(lances.situacao([0, 2], PILOTIS), "fora")
        # o detalhe que sai da fundação ganha de um lance de cima sem nível legível
        cands = [{"niveis": [0], "quadro": True, "x": "fundacao"}, {"niveis": [3], "quadro": True, "x": "pilotis"}]
        self.assertEqual(lances.escolher(cands, SUBSOLO)[0]["x"], "fundacao")
        # não sai da planta
        self.assertNotIn("sai_da_fundacao", publicar_planta.MOTIVO)

    def test_escolhe_o_lance_que_termina(self):
        cands = [{"titulo": "P1", "niveis": [2, 3], "quadro": True},
                 {"titulo": "P1", "niveis": [1, 2], "quadro": True},
                 {"titulo": "P1", "niveis": [], "quadro": False}]
        d, sit = lances.escolher(cands, TERREO)
        self.assertEqual((d["niveis"], sit), ([1, 2], "termina"))
        d, sit = lances.escolher(cands, PILOTIS)
        self.assertEqual((d["niveis"], sit), ([2, 3], "termina"))

    def test_quadro_ganha_do_recorte_pelo_desenho(self):
        d, sit = lances.escolher([{"niveis": [], "quadro": False, "x": 1}, {"niveis": [0, 1], "quadro": True, "x": 2}], TERREO)
        self.assertEqual((d["x"], sit), (2, "fora"))

    def test_passa_com_detalhe_na_prancha_do_pavimento_fica(self):
        # ajuste de 17/11: o que vale é ter detalhe no pavimento. Lance Pilotis > 2º desenhado na prancha do
        # Mezanino: conferido no Mezanino. O mesmo lance só nas pranchas de outro pavimento: sai.
        mez = lances.ordem_do_pavimento("Mezanino")
        no_mez = {"niveis": [3, 5], "quadro": True, "prancha": "EXE.ES.LO.268.PILMEZANIN-R00"}
        no_pil = {"niveis": [3, 5], "quadro": True, "prancha": "EXE.ES.LO.245.PILPILOTIS-R00"}
        self.assertEqual(lances.escolher([no_mez], mez, "Mezanino")[1], "passa_com_detalhe")
        self.assertEqual(lances.escolher([no_pil], mez, "Mezanino")[1], "passa")
        self.assertEqual(lances.escolher([no_pil, no_mez], mez, "Mezanino")[0], no_mez)
        self.assertEqual(lances.escolher([no_mez], mez)[1], "passa")  # sem o nome do pavimento, como antes
        self.assertEqual(lances.pavimento_da_prancha(r"C:\pasta\EXE.ES.LO.268.PILMEZANIN-R00.pdf"), "Mezanino")

    def test_nome_do_lance(self):
        self.assertEqual(lances.texto_do_lance([1, 3]), "Subsolo > Pilotis")
        self.assertEqual(lances.ordem_do_nivel("Fundação"), 0)
        self.assertEqual(lances.ordem_do_pavimento("Térreo Comercial"), TERREO)


def forma(*pecas):
    return {"prancha": "EXE.ES.LO.129.FOR-R03", "revisao": "R03", "largura": 100, "altura": 50, "tile": 512, "niveis": [0],
            "tiles": {"0/0/0": b"T"}, "trecho": "Planta inteira",
            "pecas": [{"tipo": t, "nome": n, "secao": "", "rotulo": [0, 0, 1, 1], "polys": [[[0, 0], [1, 0], [1, 1]]]} for t, n in pecas]}


def det(nome, situacao="termina", lance="", img=b"D"):
    return {"chave": f"P_{nome}", "titulo": nome, "prancha": "EXE.PIL", "img": img, "aco": None, "situacao": situacao, "lance": lance}


class TestSepararPecas(unittest.TestCase):
    def test_sem_detalhe_e_passagem_saem_da_planta(self):
        fm = forma(("P", "P1"), ("P", "P2"), ("P", "P3"), ("V", "V1"), ("L", "L1"))
        detalhes = {"P": {"P1": det("P1"), "P2": det("P2", "passa", "Subsolo > Pilotis"), "P3": det("P3", "nasce")}, "V": {}}
        fora = publicar_planta.separar_pecas([fm], detalhes)
        self.assertEqual([p["nome"] for p in fm["pecas"]], ["P1", "P3", "L1"])
        self.assertEqual([(f["nome"], f["motivo"]) for f in fora],
                         [("P2", "detalhe só passa pelo pavimento (Subsolo > Pilotis)"), ("V1", "sem detalhe nas pranchas lidas")])

    def test_passa_com_detalhe_fica_com_ficha(self):
        fm = forma(("P", "P1"))
        fora = publicar_planta.separar_pecas([fm], {"P": {"P1": det("P1", "passa_com_detalhe", "Pilotis > 2º Pavimento")}, "V": {}})
        self.assertEqual(([p["nome"] for p in fm["pecas"]], fora), (["P1"], []))

    def test_manter_sem_detalhe(self):
        fm = forma(("P", "P1"), ("V", "V1"))
        fora = publicar_planta.separar_pecas([fm], {"P": {}, "V": {}}, manter_sem_detalhe=("V",))
        self.assertEqual([p["nome"] for p in fm["pecas"]], ["V1"])
        self.assertEqual([f["nome"] for f in fora], ["P1"])


class TestPacoteComLance(unittest.TestCase):
    def test_arranque_fica_so_com_o_detalhe(self):
        fm = forma(("P", "P150"), ("P", "P150a"))
        detalhes = {"P": {"P150": det("P150"), "P150a": det("P150a", "nasce")}, "V": {}}
        man, binario, _ = publicar_planta.montar_trecho(fm, detalhes, {("P", "P150"): "a", ("P", "P150a"): "b"}, {"planta_id": "p", "trecho": "T"})
        m, _ = pacote.ler(man, binario)
        self.assertNotIn("so_detalhe", m["elementos"]["a"])
        self.assertTrue(m["elementos"]["b"]["so_detalhe"])

    def test_imagem_nova_ganha_data_e_a_data_fica(self):
        ids = {("P", "P1"): "a", ("P", "P2"): "b"}
        cab = {"planta_id": "p", "trecho": "T"}
        with tempfile.TemporaryDirectory() as d:
            pasta = pathlib.Path(d)
            man, binario, _ = publicar_planta.montar_trecho(forma(("P", "P1"), ("P", "P2")), {"P": {"P1": det("P1"), "P2": det("P2")}, "V": {}}, ids, cab)
            (pasta / "manifest.json").write_bytes(man)
            (pasta / "pacote.bin").write_bytes(binario)
            novos = {"P": {"P1": det("P1", img=b"NOVA"), "P2": det("P2")}, "V": {}}
            man, binario, rel = publicar_planta.montar_trecho(forma(("P", "P1"), ("P", "P2")), novos, ids, cab,
                                                               publicar_planta.detalhes_anteriores(pasta), "2026-11-17")
            m, _ = pacote.ler(man, binario)
            self.assertEqual(m["elementos"]["a"]["detalhe_corrigido_em"], "2026-11-17")
            self.assertNotIn("detalhe_corrigido_em", m["elementos"]["b"])
            self.assertEqual(rel["detalhe_corrigido"], ["P1"])
            # gerar de novo sem mudar a imagem mantém a data da correção
            (pasta / "manifest.json").write_bytes(man)
            (pasta / "pacote.bin").write_bytes(binario)
            man, binario, rel = publicar_planta.montar_trecho(forma(("P", "P1"), ("P", "P2")), novos, ids, cab,
                                                               publicar_planta.detalhes_anteriores(pasta), "2026-11-20")
            m, _ = pacote.ler(man, binario)
            self.assertEqual(m["elementos"]["a"]["detalhe_corrigido_em"], "2026-11-17")
            self.assertEqual(rel["detalhe_corrigido"], [])


if __name__ == "__main__":
    unittest.main()

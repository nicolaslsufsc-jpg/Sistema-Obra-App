"""Consolos e capitéis como partes do pilar (pipeline/fvs/partes.py) e no pacote (publicar_planta e pacote).
Dados fictícios da obra EXE; sem PDF."""

from __future__ import annotations

import json
import pathlib
import sys
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))

import pacote  # noqa: E402
import partes  # noqa: E402
import publicar_fichas  # noqa: E402
import publicar_planta  # noqa: E402


def quad(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]


def pilar(nome, x0, y0, x1, y1):
    return {"tipo": "P", "nome": nome, "secao": "", "rotulo": [x0, y1 + 2, x1, y1 + 8], "polys": [quad(x0, y0, x1, y1)]}


def det(nome, situacao="termina"):
    return {"chave": f"P_{nome}", "titulo": nome, "prancha": "EXE.PIL", "img": b"D", "aco": None, "situacao": situacao, "lance": ""}


def det_parte(chave):
    return {"chave": chave, "titulo": chave, "prancha": "EXE.ES.LO.518.CONPILOTIS-R00", "img": b"IMG-" + chave.encode(), "aco": None}


class TestNomes(unittest.TestCase):
    def test_consolo(self):
        self.assertEqual(partes.nomes_do_consolo("CONSOLO P81"), ["P81"])
        self.assertEqual(partes.nomes_do_consolo("CONSOLO P102=P103"), ["P102", "P103"])
        self.assertEqual(partes.nomes_do_consolo("2xCONSOLO P50=P70"), ["P50", "P70"])
        self.assertEqual(partes.nomes_do_consolo("CONSOLO P326 ESC 1:25"), ["P326"])
        self.assertEqual(partes.nomes_do_consolo("CONSOLO P219=P220= P246"), ["P219", "P220", "P246"])
        self.assertEqual(partes.nomes_do_consolo("DETALHAMENTO DOS CONSOLOS DO PILOTIS"), [])
        self.assertEqual(partes.nomes_do_consolo("P81"), [])

    def test_macico(self):
        self.assertEqual(partes.nomes_do_macico("ARMADURA DO MACIÇO NO PILAR (P65)"), ["P65"])
        self.assertEqual(partes.nomes_do_macico("ARMADURA DO MACIÇO NO PILAR (P78a/78aa)"), ["P78a", "P78aa"])
        self.assertEqual(partes.nomes_do_macico("ARMADURA DO MACIÇO NO PILAR (P67 - P102/102a - P123 -  P124)"), ["P67", "P102", "P102a", "P123", "P124"])
        # o PDF às vezes traz o Ç trocado por outro caractere
        self.assertEqual(partes.nomes_do_macico("ARMADURA DO MACI�O NO PILAR (P32 - P33 -P34)"), ["P32", "P33", "P34"])
        self.assertEqual(partes.nomes_do_macico("12xMACIÇO (P32)"), [])
        self.assertEqual(partes.nomes_do_macico("LAJE DO 2º PAVTO TIPO - MACIÇOS"), [])


class TestGeometria(unittest.TestCase):
    def test_anel_do_capitel(self):
        anel = partes.anel_do_capitel([quad(100, 100, 110, 140)], margem=20)
        self.assertEqual(anel, quad(80, 80, 130, 160))
        self.assertIsNone(partes.anel_do_capitel([]))

    def test_consolo_do_pilar_ignora_o_que_nao_encosta_e_o_grande(self):
        p = [quad(100, 100, 140, 110)]
        longe = quad(300, 300, 340, 320)
        grande = quad(0, 0, 500, 500)  # hachura de rebaixo na mesma camada
        certo = quad(100, 90, 140, 120)
        self.assertEqual(partes.consolo_do_pilar([longe, grande, certo], p), certo)
        self.assertIsNone(partes.consolo_do_pilar([longe, grande], p))


class TestDistribuir(unittest.TestCase):
    def test_consolo_do_arranque_vai_para_o_pilar_com_ficha(self):
        pecas = [pilar("P81", 100, 100, 140, 110), {**pilar("P81a", 110, 80, 130, 105), "so_detalhe": True}]
        rel = partes.distribuir_partes(pecas, {"P81a": quad(100, 80, 140, 110)}, set(), {"consolo": {"P81a": det_parte("C_P81a")}})
        self.assertEqual([pt["tipo"] for pt in pecas[0]["partes"]], ["consolo"])
        self.assertNotIn("partes", pecas[1])
        self.assertEqual(rel["consolos"], ["P81 (P81a)"])
        self.assertEqual(pecas[0]["partes"][0]["detalhe"]["chave"], "C_P81a")

    def test_capitel_uma_vez_por_pilar_e_lista_de_outro_pavimento_ignorada(self):
        pecas = [pilar("P78", 0, 0, 10, 40), {**pilar("P78a", 0, 0, 10, 40), "so_detalhe": True}, pilar("P65", 50, 0, 60, 40)]
        rel = partes.distribuir_partes(pecas, {}, {"P78a", "P78aa", "P65", "P999"}, {"capitel": {"P65": det_parte("K_P65")}})
        self.assertEqual([pt["tipo"] for pt in pecas[0]["partes"]], ["capitel"])
        self.assertEqual([pt["tipo"] for pt in pecas[2]["partes"]], ["capitel"])
        self.assertEqual(rel["capiteis"], ["P65", "P78 (P78a)"])
        self.assertEqual(rel["sem_detalhe"], ["capitel P78a"])
        self.assertEqual(rel["capitel_sem_pilar"], [])

    def test_consolo_sem_pilar_com_ficha(self):
        pecas = [{**pilar("P9a", 0, 0, 10, 10), "so_detalhe": True}]
        rel = partes.distribuir_partes(pecas, {"P9a": quad(0, 0, 10, 10)}, set())
        self.assertEqual(rel["consolo_sem_pilar"], ["P9a"])


class TestPacote(unittest.TestCase):
    CAB = {"planta_id": "p", "trecho": "T", "prancha": "EXE.ES.LO.1.FOR-R00", "revisao": "R00", "largura": 10, "altura": 10, "tile": 512, "niveis": [0]}

    def test_partes_no_manifest(self):
        dets = {"C_X": {"titulo": "CONSOLO P1", "prancha": "x", "img": b"I", "aco": None}}
        el = {"a": {**pilar("P1", 0, 0, 1, 1), "partes": [{"tipo": "consolo", "polys": [quad(0, 0, 2, 2)], "detalhe": "C_X"}, {"tipo": "capitel", "polys": [quad(-1, -1, 3, 3)]}]}}
        man, binario = pacote.montar(self.CAB, {}, el, dets)
        m, pedacos = pacote.ler(man, binario)
        self.assertEqual([pt["tipo"] for pt in m["elementos"]["a"]["partes"]], ["consolo", "capitel"])
        self.assertEqual(m["elementos"]["a"]["partes"][0]["detalhe"], "C_X")
        self.assertNotIn("detalhe", m["elementos"]["a"]["partes"][1])
        self.assertEqual(pedacos["d:C_X"], b"I")

    def test_recusa_parte_errada(self):
        for partes_ruins in ([{"tipo": "viga", "polys": [quad(0, 0, 1, 1)]}],
                             [{"tipo": "consolo", "polys": []}],
                             [{"tipo": "consolo", "polys": [quad(0, 0, 1, 1)], "detalhe": "NAO_HA"}],
                             [{"tipo": "consolo", "polys": [quad(0, 0, 1, 1)]}, {"tipo": "consolo", "polys": [quad(0, 0, 1, 1)]}]):
            with self.assertRaises(pacote.ErroPacote):
                pacote.montar(self.CAB, {}, {"a": {**pilar("P1", 0, 0, 1, 1), "partes": partes_ruins}}, {})
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(self.CAB, {}, {"a": {"tipo": "V", "nome": "V1", "rotulo": [0, 0, 1, 1], "polys": [], "partes": [{"tipo": "consolo", "polys": [quad(0, 0, 1, 1)]}]}}, {})

    def test_montar_trecho_com_consolo_e_capitel(self):
        p150 = pilar("P150", 100, 100, 140, 110)
        p150["consolo"] = quad(100, 90, 140, 120)
        fm = {"prancha": "EXE.ES.LO.129.FOR-R03", "revisao": "R03", "largura": 500, "altura": 500, "tile": 512, "niveis": [0],
              "tiles": {"0/0/0": b"T"}, "trecho": "Planta inteira", "pecas": [p150, pilar("P150a", 110, 95, 130, 115), pilar("P65", 300, 300, 310, 340)]}
        detalhes = {"P": {"P150": det("P150"), "P150a": det("P150a", "nasce"), "P65": det("P65")}, "V": {},
                    "partes": {"consolo": {"P150": det_parte("C_CONSOLO_P150")}, "capitel": {"P65": det_parte("K_P65")}, "com_capitel": {"P65", "P1"}}}
        ids = {("P", "P150"): "a", ("P", "P150a"): "b", ("P", "P65"): "c"}
        man, binario, rel = publicar_planta.montar_trecho(fm, detalhes, ids, {"planta_id": "p", "trecho": "T"})
        m, pedacos = pacote.ler(man, binario)
        self.assertEqual(m["elementos"]["a"]["partes"], [{"tipo": "consolo", "polys": [quad(100, 90, 140, 120)], "detalhe": "C_CONSOLO_P150"}])
        self.assertNotIn("partes", m["elementos"]["b"])
        self.assertEqual(m["elementos"]["c"]["partes"][0]["tipo"], "capitel")
        self.assertEqual(pedacos["d:K_P65"], b"IMG-K_P65")
        self.assertEqual(rel["partes"]["consolos"], ["P150"])
        self.assertEqual(rel["partes"]["capiteis"], ["P65"])
        # a forma não guarda o que foi decidido aqui (gerar de novo dá o mesmo)
        self.assertNotIn("so_detalhe", fm["pecas"][1])

    def test_sem_pranchas_de_partes_o_pacote_nao_muda(self):
        fm = {"prancha": "EXE.ES.LO.129.FOR-R03", "revisao": "R03", "largura": 500, "altura": 500, "tile": 512, "niveis": [0],
              "tiles": {"0/0/0": b"T"}, "trecho": "Planta inteira", "pecas": [pilar("P1", 0, 0, 10, 10)]}
        man, _, rel = publicar_planta.montar_trecho(fm, {"P": {"P1": det("P1")}, "V": {}}, {("P", "P1"): "a"}, {"planta_id": "p", "trecho": "T"})
        self.assertNotIn(b"partes", man)
        self.assertNotIn("partes", rel)


class TestFichas(unittest.TestCase):
    def test_exemplo_com_consolo_e_capitel(self):
        dados = json.loads((RAIZ / "pipeline" / "fvs" / "fichas_partes.exemplo.json").read_text(encoding="utf-8"))
        f = publicar_fichas.normalizar(dados)[0]
        self.assertEqual(sum(i.get("parte") == "consolo" for i in f["itens"]), 5)
        self.assertEqual(sum(i.get("parte") == "capitel" for i in f["itens"]), 5)

    def test_legado_passa_a_parte(self):
        f = publicar_fichas.normalizar({"P": {"codigo": "EXE-1", "titulo": "Pilar", "itens": [
            {"n": 1, "etapa": "A", "titulo": "x"}, {"n": 2, "etapa": "CONSOLO", "titulo": "y", "parte": "Consolo"}]}})[0]
        self.assertNotIn("parte", f["itens"][0])
        self.assertEqual(f["itens"][1]["parte"], "consolo")

    def test_recusa_parte_errada(self):
        def ficha(parte, aplica_a=("P",), etapa="CONSOLO - ARMADURA"):
            return [{"codigo": "EXE-1", "titulo": "t", "aplica_a": list(aplica_a), "itens": [{"n": 1, "etapa": etapa, "titulo": "x", "parte": parte}]}]
        for ruim in (ficha("viga"), ficha("consolo", ("V",)), ficha("consolo", etapa="CONSOLO E CONCRETAGEM")):
            with self.assertRaises(publicar_fichas.ErroFichas):
                publicar_fichas.normalizar(ruim)


if __name__ == "__main__":
    unittest.main()

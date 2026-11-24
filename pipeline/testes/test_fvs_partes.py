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
        # 24/11 (campo, P67 do 3º): dois títulos no mesmo bloco de texto; os dois entram
        self.assertEqual(partes.nomes_do_macico("ARMADURA DO MACIÇO NO PILAR (P69 - P122) ARMADURA DO MACIÇO NO PILAR (P67 - P123)"),
                         ["P69", "P122", "P67", "P123"])
        # o traço que falta entre dois nomes ("P200 P213") não derruba os dois
        self.assertEqual(partes.nomes_do_macico("ARMADURA DO MACIÇO NO PILAR (P186 - P200 P213 - P252)"), ["P186", "P200", "P213", "P252"])
        # o bloco da prancha do 3º com dois títulos, um por linha (LISTA DE CAMPO #3: o P85a e o P78aa se perdiam)
        self.assertEqual(partes.nomes_do_macico("ARMADURA DO MACIÇO NO PILAR (P85a)\nARMADURA DO MACIÇO NO PILAR (P78aa)\n"),
                         ["P85a", "P78aa"])


class TestMacicoNaForma(unittest.TestCase):
    """Pilar com cubetas longe nos quatro lados = maciço na forma; sem prancha, o relatório avisa."""
    M = partes.PONTOS_POR_METRO

    def cubetas_em_volta(self, cx, cy, folga_m):
        m, lado = self.M, 0.65 * self.M
        f = folga_m * m
        saida = []
        for i in range(-2, 3):  # uma fileira de cada lado, centrada no pilar
            d = i * (lado + 0.1 * m)
            saida += [(cx - 0.15 * m - f - lado, cy + d - lado / 2, cx - 0.15 * m - f, cy + d + lado / 2),
                      (cx + 0.15 * m + f, cy + d - lado / 2, cx + 0.15 * m + f + lado, cy + d + lado / 2),
                      (cx + d - lado / 2, cy - 0.15 * m - f - lado, cx + d + lado / 2, cy - 0.15 * m - f),
                      (cx + d - lado / 2, cy + 0.15 * m + f, cx + d + lado / 2, cy + 0.15 * m + f + lado)]
        return saida

    def pilar(self, nome, cx, cy):
        m = self.M
        return {"tipo": "P", "nome": nome, "polys": [quad(cx - 0.15 * m, cy - 0.15 * m, cx + 0.15 * m, cy + 0.15 * m)]}

    def test_folga_grande_e_macico_folga_pequena_nao(self):
        cub = self.cubetas_em_volta(1000, 1000, 1.2) + self.cubetas_em_volta(3000, 1000, 0.1)
        pecas = [self.pilar("P64b", 1000, 1000), self.pilar("P20", 3000, 1000)]
        self.assertEqual(partes.marcar_macico_na_forma(pecas, cub), ["P64b"])
        self.assertTrue(pecas[0].get("macico_na_forma"))
        self.assertNotIn("macico_na_forma", pecas[1])

    def test_sem_cubeta_de_um_lado_nao_e_macico(self):
        cub = [c for c in self.cubetas_em_volta(1000, 1000, 1.2) if c[0] < 1000 + 0.15 * self.M]  # tira a direita
        pecas = [self.pilar("P10", 1000, 1000)]
        self.assertEqual(partes.marcar_macico_na_forma(pecas, cub), [])

    def test_relatorio_avisa_so_quem_ficou_sem_capitel(self):
        pecas = [self.pilar("P64b", 1000, 1000), self.pilar("P67a", 3000, 1000), self.pilar("P5", 5000, 1000)]
        for p in pecas[:2]:
            p["macico_na_forma"] = True
        rel = partes.distribuir_partes(pecas, {}, {"P67"})  # a prancha diz "P67": cai no P67a pela base do nome
        self.assertEqual(rel["capiteis"], ["P67a (P67)"])
        self.assertEqual(rel["macico_sem_prancha"], ["P64b"])

    def test_cubetas_so_da_camada_da_nervurada(self):
        class R:
            def __init__(self, x0, y0, x1, y1):
                self.x0, self.y0, self.x1, self.y1 = x0, y0, x1, y1
        m = self.M
        desenhos = [{"layer": "LJ_NERV_RETI", "items": [("re", R(0, 0, 0.65 * m, 0.65 * m)), ("re", R(0, 0, 5 * m, 5 * m))]},
                    {"layer": "VIG_FACES", "items": [("re", R(0, 0, 0.65 * m, 0.65 * m))]}]
        self.assertEqual(len(partes.cubetas_dos_desenhos(desenhos)), 1)


class TestTamanhoDoMacico(unittest.TestCase):
    """Campo #1: o anel do capitel no tamanho real do maciço (P66 do 3º: 2,35 x 3,27 m)."""

    def test_medidas_pelas_cotas_do_desenho(self):
        palavras = [(True, "235"), (True, "15"), (True, "121"), (False, "327"), (False, "104"),
                    (True, "C=260"), (True, "109.4"), (False, "c/20"), (True, "N1")]
        self.assertEqual(partes.medidas_do_macico(palavras), (235, 327))
        self.assertIsNone(partes.medidas_do_macico([(True, "235"), (True, "15")]))  # falta a cota em pé

    def test_anel_no_tamanho_e_centrado(self):
        m = partes.PONTOS_POR_METRO
        pilar = [quad(1000, 1000, 1000 + 0.3 * m, 1000 + 0.7 * m)]
        anel = partes.anel_pelas_medidas(pilar, (235, 327))
        xs, ys = [x for x, _ in anel], [y for _, y in anel]
        self.assertAlmostEqual(max(xs) - min(xs), 2.35 * m, delta=0.05)
        self.assertAlmostEqual(max(ys) - min(ys), 3.27 * m, delta=0.05)
        self.assertAlmostEqual((max(xs) + min(xs)) / 2, 1000 + 0.15 * m, delta=0.05)
        self.assertIsNone(partes.anel_pelas_medidas(pilar, (20, 327)))  # menor que o pilar: leitura errada

    def test_distribuir_usa_a_medida_e_cai_no_meio_metro_sem_ela(self):
        m = partes.PONTOS_POR_METRO
        pecas = [{"tipo": "P", "nome": "P66", "polys": [quad(1000, 1000, 1000 + 0.3 * m, 1000 + 0.3 * m)]},
                 {"tipo": "P", "nome": "P9", "polys": [quad(3000, 1000, 3000 + 0.3 * m, 1000 + 0.3 * m)]}]
        dets = {"P66": {"chave": "K1", "medidas_cm": (235, 327)}, "P9": {"chave": "K2"}}
        rel = partes.distribuir_partes(pecas, {}, {"P66", "P9"}, {"capitel": dets})
        self.assertEqual(rel["capitel_pela_medida"], ["P66"])
        a66 = pecas[0]["partes"][0]["polys"][0]
        self.assertAlmostEqual(max(x for x, _ in a66) - min(x for x, _ in a66), 2.35 * m, delta=0.05)
        a9 = pecas[1]["partes"][0]["polys"][0]
        self.assertEqual(a9, partes.anel_do_capitel(pecas[1]["polys"]))


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


class TestRecorteDoMacico(unittest.TestCase):
    """24/11 (campo, P66 do 3º): o maciço tem 2 a 4 desenhos (um por sentido das barras) embaixo e à direita do
    título; o recorte junta todos, sem pegar os do título vizinho nem o selo. Prancha sintética da obra EXE."""

    def _prancha(self, caminho):
        import pymupdf

        doc = pymupdf.open()
        page = doc.new_page(width=1600, height=1000)
        page.insert_text((50, 60), "ARMADURA DO MACICO NO PILAR (P66)", fontsize=14)
        for x, y in ((50, 80), (330, 80), (50, 330), (330, 330)):  # 4 desenhos: N1, N2 e as camadas de baixo
            page.draw_rect(pymupdf.Rect(x, y, x + 250, y + 220))
        page.insert_text((700, 60), "ARMADURA DO MACICO NO PILAR (P65)", fontsize=14)
        for x, y in ((700, 80), (980, 80)):
            page.draw_rect(pymupdf.Rect(x, y, x + 250, y + 220))
        page.draw_rect(pymupdf.Rect(1300, 700, 1580, 980))  # o selo, embaixo à direita
        page.insert_text((1310, 720), "REVISOES:", fontsize=10)
        doc.save(caminho)

    def test_p66_com_os_quatro_desenhos(self):
        import base64
        import tempfile
        from unittest import mock

        import estrutura  # noqa: F401  (põe o gerador legado no caminho)
        import gerador_fvs

        clips = {}

        def render(page, clip, escala):
            clips[len(clips)] = clip
            return base64.b64encode(b"img").decode()

        with tempfile.TemporaryDirectory() as d:
            caminho = str(pathlib.Path(d) / "EXE.ES.LO.900.LAJ3PAVTIP-R00.pdf")
            self._prancha(caminho)
            with mock.patch.object(gerador_fvs, "render", side_effect=render):
                dets = partes.ler_detalhes_de_partes([caminho], "capitel")
        self.assertEqual(set(dets), {"P66", "P65"})
        p66, p65 = clips[0], clips[1]
        # o P66 vai do título até o 4º desenho (x 580, y 550); o P65 não entra nele, nem o selo no P65
        self.assertLessEqual(p66.x0, 50)
        self.assertGreaterEqual(p66.x1, 580)
        self.assertGreaterEqual(p66.y1, 550)
        self.assertLess(p66.x1, 700)
        self.assertGreaterEqual(p65.x1, 1230)
        self.assertLess(p65.y1, 700)

    def test_titulo_mais_perto_acima_e_a_esquerda(self):
        import pymupdf

        titulos = [("A", pymupdf.Rect(0, 0, 100, 10), ["P1"]), ("B", pymupdf.Rect(400, 0, 500, 10), ["P2"])]
        caixas = [pymupdf.Rect(0, 20, 200, 200), pymupdf.Rect(220, 20, 380, 200), pymupdf.Rect(400, 20, 600, 200),
                  pymupdf.Rect(-200, 20, -100, 200)]  # este fica à esquerda de todo título: de ninguém
        por = partes._desenhos_por_titulo(caixas, titulos, pymupdf.Matrix(1, 1))
        self.assertEqual(len(por[0]), 2)
        self.assertEqual(len(por[1]), 1)

"""Barras de laje (pipeline/fvs/barras_laje.py): etiqueta, ligação etiqueta-barra, leitura de uma prancha de
armação fictícia da obra EXE (montada no teste, com camadas e janela como as do AutoCAD) e o encaixe na folha
de forma, inclusive a prancha que não alinha e fica fora (conflito)."""

from __future__ import annotations

import pathlib
import sys
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))
sys.path.insert(0, str(RAIZ / "pipeline" / "legado"))

import barras_laje as bl  # noqa: E402


def _falta_para_ler_pdf():
    """No GitHub os scripts rodam sem numpy (e pode faltar o pymupdf): os testes que leem PDF pulam."""
    try:
        import pymupdf  # noqa: F401
        import estrutura  # noqa: F401
    except ImportError as e:
        return e.name or str(e)
    return None


FALTA = _falta_para_ler_pdf()
LE_PDF = unittest.skipIf(FALTA, f"ler a prancha precisa de {FALTA}")

PT = bl.PT_POR_CM
# pilares da prancha: (x, y, largura, altura) em pontos, espalhados
PILARES = [(100, 120, 11, 34), (420, 110, 11, 45), (800, 140, 34, 11), (1080, 160, 14, 34),
           (130, 760, 11, 57), (500, 700, 20, 20), (900, 780, 11, 34), (1100, 600, 34, 14)]
DESLOC = (500.0, 200.0)  # a prancha cai na folha de forma 500 pontos à direita e 200 abaixo


def forma_exe(desloc=DESLOC):
    """As peças da folha de forma: os mesmos pilares, no lugar da folha."""
    return [{"tipo": "P", "nome": f"P{i}", "secao": "", "rotulo": [x + desloc[0], y + desloc[1], x + desloc[0] + 1, y + desloc[1] + 1], "polys": [[[x - w / 2 + desloc[0], y - h / 2 + desloc[1]], [x + w / 2 + desloc[0], y - h / 2 + desloc[1]],
                                                       [x + w / 2 + desloc[0], y + h / 2 + desloc[1]], [x - w / 2 + desloc[0], y + h / 2 + desloc[1]]]]}
            for i, (x, y, w, h) in enumerate(PILARES, 1)]


CUBETA = 38  # pontos: a fôrma da nervurada, desenhada na mesma camada das vigas em algumas pranchas


def prancha_exe(caminho, camada_pilar="PILAR_CONCRETO", cubetas=False):
    """Prancha de armação de exemplo. camada_pilar="VIG_FACES" e cubetas=True: como as do 4º pavimento da
    obra piloto, sem o contorno do pilar na camada dele, e com as cubetas na mesma camada."""
    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page(width=1200, height=900)
    arm = doc.add_ocg("ARR_LONG_INF")
    pil = doc.add_ocg(camada_pilar)
    for x, y, w, h in PILARES:
        page.draw_rect(pymupdf.Rect(x - w / 2, y - h / 2, x + w / 2, y + h / 2), width=0.24, oc=pil)
    if cubetas:
        for i in range(6):
            for j in range(4):
                x, y = 250 + i * (CUBETA + 6), 230 + j * (CUBETA + 6)
                page.draw_rect(pymupdf.Rect(x, y, x + CUBETA, y + CUBETA), width=0.24, oc=pil)
    # nervura com duas barras (N25 C=850 e N15 C=710) e a etiqueta logo abaixo
    page.draw_line((200, 400), (200 + 850 * PT, 400), width=1.08, oc=arm)
    page.draw_line((200, 408), (200 + 710 * PT, 408), width=1.08, oc=arm)
    # barra com dobra (N2 C=130: 120 cm reto + 10 de dobra) e etiqueta corrida
    page.draw_polyline([(600, 500), (600 + 120 * PT, 500), (600 + 120 * PT, 500 + 10 * PT)], width=1.08, oc=arm)
    # barra sem etiqueta e barra da planta chave (fora da janela: não entra)
    page.draw_line((200, 600), (500, 600), width=1.08, oc=arm)
    page.draw_line((1170, 870), (1190, 870), width=1.08, oc=arm)
    for txt, r in (("N25-1%%c10 C=850+N15-1%%c8 C=710", pymupdf.Rect(300, 410, 450, 420)),
                   ("N2-%%c8c/10 C=130", pymupdf.Rect(605, 502, 660, 512))):
        a = page.add_freetext_annot(r, txt, fontsize=5)
        a.set_info(content=txt)
        a.update()
    # a janela do desenho (o recorte do AutoCAD): tudo o que está dentro dela
    page.clean_contents()
    xref = page.get_contents()[0]
    doc.update_stream(xref, b"q 40 40 1120 820 re W n\n" + doc.xref_stream(xref) + b"\nQ")
    doc.save(caminho)
    doc.close()


class TestEtiqueta(unittest.TestCase):
    def test_duas_posicoes_na_nervura(self):
        partes = bl.ler_etiqueta("N25-1%%c10 C=850+N15-1%%c8 C=710")
        self.assertEqual([p["posicao"] for p in partes], ["N25", "N15"])
        self.assertEqual(partes[0], {"posicao": "N25", "quantidade": 1, "bitola": 10.0, "comprimento": 850.0, "texto": "N25 1ø10 C=850"})

    def test_barra_corrida_e_bitola_quebrada(self):
        self.assertEqual(bl.ler_etiqueta("N2-%%c8c/10 C=130")[0]["texto"], "N2 ø8 c/10 C=130")
        self.assertEqual(bl.ler_etiqueta("N26-1%%c12.5 C=850")[0]["texto"], "N26 1ø12,5 C=850")
        self.assertEqual(bl.ler_etiqueta("250"), [])
        self.assertEqual(bl.ler_etiqueta("C=250 N3"), [])
        self.assertEqual(bl.ler_etiqueta("NOTA: ver detalhe"), [])

    def test_quantidade_antes_do_n(self):
        # pilotis, mezanino e térreo da obra piloto (21/11/2026)
        self.assertEqual(bl.ler_etiqueta("35N5-%%c6.3c/10 C=1200")[0]["texto"], "N5 35ø6,3 c/10 C=1200")
        partes = bl.ler_etiqueta("1N12-%%c20 C=600-615+1N13-%%c20 C=540")
        self.assertEqual([(p["posicao"], p["quantidade"], p["comprimento"]) for p in partes], [("N12", 1, 600.0), ("N13", 1, 540.0)])
        self.assertEqual(bl.ler_etiqueta("28N1-%%C8c/10 C=275")[0]["quantidade"], 28)

    def test_liga_pelo_comprimento(self):
        barras = [{"linha": [[0, 0], [710 * PT, 0]]}, {"linha": [[0, 8], [850 * PT, 8]]}, {"linha": [[0, 60], [850 * PT, 60]]}]
        n = bl.casar_etiquetas(barras, [("N25-1%%c10 C=850+N15-1%%c8 C=710", (100, 10, 250, 20))])
        self.assertEqual(n, 2)
        self.assertEqual([b.get("posicao") for b in barras], ["N15", "N25", None])  # a terceira está longe da etiqueta

    def test_etiqueta_em_pe_liga_barra_em_pe(self):
        barras = [{"linha": [[10, 0], [10, 130 * PT]]}, {"linha": [[0, 30], [130 * PT, 30]]}]
        bl.casar_etiquetas(barras, [("N2-%%c8c/10 C=130", (0, 10, 8, 60))])
        self.assertEqual([b.get("posicao") for b in barras], ["N2", None])


@LE_PDF
class TestPrancha(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.pdf = str(pathlib.Path(self.tmp.name) / "EXE.ES.LO.900.LAJ2PAVTIP-R00.pdf")
        prancha_exe(self.pdf)

    def tearDown(self):
        self.tmp.cleanup()

    def test_le_barras_etiquetas_e_pilares(self):
        pr = bl.ler_prancha(self.pdf, "longitudinal_inferior")
        self.assertEqual(pr["nome"], "EXE.ES.LO.900.LAJ2PAVTIP-R00")
        self.assertEqual(len(pr["barras"]), 4)  # a da planta chave ficou de fora
        self.assertEqual(sorted(b.get("posicao") or "-" for b in pr["barras"]), ["-", "N15", "N2", "N25"])
        dobra = next(b for b in pr["barras"] if b.get("posicao") == "N2")
        self.assertEqual(len(dobra["linha"]), 3)
        self.assertEqual(len(pr["pilares"]), len(PILARES))

    def test_encaixa_na_folha_e_leva_as_barras(self):
        pr = bl.ler_prancha(self.pdf, "longitudinal_inferior")
        barras, conflitos, resumo = bl.juntar_barras(forma_exe(), [pr])
        self.assertEqual(conflitos, [])
        self.assertTrue(resumo[0]["alinhamento"]["ok"])
        n25 = next(b for b in barras if b.get("posicao") == "N25")
        self.assertAlmostEqual(n25["linha"][0][0], 200 + DESLOC[0], delta=0.5)
        self.assertAlmostEqual(n25["linha"][0][1], 400 + DESLOC[1], delta=0.5)
        self.assertEqual(n25["prancha"], "EXE.ES.LO.900.LAJ2PAVTIP-R00")

    def test_prancha_que_nao_alinha_fica_fora(self):
        pr = bl.ler_prancha(self.pdf, "longitudinal_inferior")
        so_dois = forma_exe()[:2]  # a folha tem só dois desses pilares: não dá para confiar
        barras, conflitos, _ = bl.juntar_barras(so_dois, [pr])
        self.assertEqual(barras, [])
        self.assertEqual(conflitos[0]["prancha"], "EXE.ES.LO.900.LAJ2PAVTIP-R00")
        self.assertIn("poucos pontos", conflitos[0]["motivo"])

    def test_barra_da_emenda_de_duas_pranchas_conta_uma_vez(self):
        pr = bl.ler_prancha(self.pdf, "longitudinal_inferior")
        vizinha = dict(pr, nome="EXE.ES.LO.901.LAJ2PAVTIP-R00")  # as mesmas barras, na faixa que as duas cobrem
        barras, conflitos, resumo = bl.juntar_barras(forma_exe(), [pr, vizinha])
        self.assertEqual(conflitos, [])
        self.assertEqual(len(barras), 4)
        self.assertEqual(resumo[1]["repetidas"], 4)
        self.assertEqual({b["prancha"] for b in barras}, {"EXE.ES.LO.900.LAJ2PAVTIP-R00"})

    def test_encaixe_a_mao(self):
        pr = bl.ler_prancha(self.pdf, "longitudinal_inferior")
        T = {"matriz": [1, 0, 0, 1], "t": [10, 20]}
        barras, conflitos, resumo = bl.juntar_barras(forma_exe()[:2], [pr], {pr["nome"]: T})
        self.assertEqual(conflitos, [])
        self.assertTrue(resumo[0]["alinhamento"]["manual"])
        self.assertEqual(len(barras), 4)


@LE_PDF
class TestPilarSemContorno(unittest.TestCase):
    """Prancha sem o contorno do pilar na camada dele (4º pavimento da obra piloto, 20/11/2026): o pilar vem na
    camada das vigas, junto das cubetas, e entra no encaixe pelo tamanho."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.pdf = str(pathlib.Path(self.tmp.name) / "EXE.ES.LO.910.LAJ4PAVTIP-R00.pdf")
        prancha_exe(self.pdf, camada_pilar="VIG_FACES", cubetas=True)

    def tearDown(self):
        self.tmp.cleanup()

    def test_le_os_retangulos_da_camada_de_reserva(self):
        pr = bl.ler_prancha(self.pdf, "longitudinal_inferior")
        self.assertEqual(pr["pilares"], [])
        self.assertEqual(len(pr["retangulos"]), len(PILARES) + 24)

    def test_encaixa_pelos_retangulos_do_tamanho_do_pilar(self):
        pr = bl.ler_prancha(self.pdf, "longitudinal_inferior")
        barras, conflitos, resumo = bl.juntar_barras(forma_exe(), [pr])
        self.assertEqual(conflitos, [])
        a = resumo[0]["alinhamento"]
        self.assertTrue(a["ok"])
        self.assertEqual((a["pontos"], a["total"]), (len(PILARES), len(PILARES)))  # as cubetas ficaram de fora
        self.assertLess(a["residuo_max_cm"], 1.0)
        self.assertEqual(resumo[0]["pilares_por"], "retângulo do tamanho do pilar")
        n25 = next(b for b in barras if b.get("posicao") == "N25")
        self.assertAlmostEqual(n25["linha"][0][0], 200 + DESLOC[0], delta=0.5)
        self.assertAlmostEqual(n25["linha"][0][1], 400 + DESLOC[1], delta=0.5)

    def test_sem_pilar_do_mesmo_tamanho_na_folha_fica_fora(self):
        pr = bl.ler_prancha(self.pdf, "longitudinal_inferior")
        so_quadrados = [p for p in forma_exe() if p["nome"] == "P6"]  # só o pilar 20 x 20
        barras, conflitos, _ = bl.juntar_barras(so_quadrados, [pr])
        self.assertEqual(barras, [])
        self.assertIn("poucos pontos", conflitos[0]["motivo"])

    def test_contorno_do_pilar_vale_primeiro(self):
        pr = {"pilares": [bl.al.Ponto(i, i, w=11, h=34) for i in range(4)],
              "retangulos": [bl.al.Ponto(0, 0, w=11, h=34)]}
        origem, por = bl.pilares_da_prancha(pr, [])
        self.assertEqual((len(origem), por), (4, "contorno do pilar"))


class TestTamanhoDoPilar(unittest.TestCase):
    def test_deitado_ou_em_pe_ate_2_cm(self):
        folha = [bl.al.Ponto(0, 0, w=11, h=34), bl.al.Ponto(0, 0, w=17, h=40)]
        P = bl.al.Ponto
        self.assertTrue(bl.do_tamanho_de_um_pilar(P(9, 9, w=34, h=11), folha))  # deitado
        self.assertTrue(bl.do_tamanho_de_um_pilar(P(9, 9, w=11 + 1.0, h=34), folha))  # 1,8 cm a mais
        self.assertFalse(bl.do_tamanho_de_um_pilar(P(9, 9, w=11 + 1.5, h=34), folha))  # 2,6 cm a mais
        self.assertFalse(bl.do_tamanho_de_um_pilar(P(9, 9, w=19, h=38), folha))  # meia cubeta perto do 17 x 40
        self.assertFalse(bl.do_tamanho_de_um_pilar(P(9, 9, w=38, h=38), folha))  # cubeta
        self.assertFalse(bl.do_tamanho_de_um_pilar(P(9, 9), folha))


class TestMesmaBarra(unittest.TestCase):
    def test_mesma_barra(self):
        a = {"camada": "longitudinal_inferior", "texto": "N1 1ø8 C=100", "prancha": "A", "linha": [[0, 0], [100, 0]]}
        self.assertTrue(bl.mesma_barra(a, dict(a, prancha="B", linha=[[101, 1], [1, 1]])))  # ao contrário, 1 pt
        self.assertFalse(bl.mesma_barra(a, dict(a, prancha="B", linha=[[0, 5], [100, 5]])))  # 5 pt = 8,8 cm
        self.assertFalse(bl.mesma_barra(a, dict(a, prancha="B", texto="N2 1ø8 C=100")))
        self.assertFalse(bl.mesma_barra(a, dict(a)))  # da mesma prancha: duas barras de verdade


class TestPacoteComBarras(unittest.TestCase):
    CAB = {"planta_id": "p1", "obra": "EXE", "pavimento": "2º Pavimento", "trecho": "Planta inteira", "prancha": "EXE.FOR-R00",
           "revisao": "R00", "largura": 2000, "altura": 1500, "tile": 512, "niveis": [0]}

    def test_ida_e_volta(self):
        import pacote

        barras = {"b1": {"camada": "longitudinal_inferior", "linha": [[1.234, 2], [3, 4]], "posicao": "N25", "texto": "N25 1ø10 C=850",
                         "prancha": "EXE.ES.LO.900.LAJ2PAVTIP-R00", "lixo": 1}}
        man, binario = pacote.montar(self.CAB, {}, {}, {}, barras)
        m, _ = pacote.ler(man, binario)
        self.assertEqual(m["barras"]["b1"], {"camada": "longitudinal_inferior", "linha": [[1.23, 2.0], [3.0, 4.0]], "posicao": "N25",
                                             "texto": "N25 1ø10 C=850", "prancha": "EXE.ES.LO.900.LAJ2PAVTIP-R00"})
        man, _ = pacote.montar(self.CAB, {}, {}, {})
        self.assertNotIn("barras", pacote.ler(man, b"")[0])  # pacote sem barras fica como antes

    def test_recusa_camada_e_linha_ruins(self):
        import pacote

        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(self.CAB, {}, {}, {}, {"b": {"camada": "transversal", "linha": [[0, 0], [1, 1]]}})
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(self.CAB, {}, {}, {}, {"b": {"camada": "longitudinal_inferior", "linha": [[0, 0]]}})

    @LE_PDF
    def test_publicar_planta_poe_as_barras_no_pacote(self):
        import pacote
        import publicar_planta

        with tempfile.TemporaryDirectory() as d:
            pdf = str(pathlib.Path(d) / "EXE.ES.LO.900.LAJ2PAVTIP-R00.pdf")
            prancha_exe(pdf)
            cfg = {"obra": "EXE", "pavimento": "2º Pavimento",
                   "barras_laje": {"camadas": {"longitudinal_inferior": {"pdfs": [pdf]}}, "alinhamento": {}}}
            detalhes = {"P": {}, "V": {}, "barras": [bl.ler_prancha(pdf, "longitudinal_inferior")]}
            fm = {"pecas": forma_exe(), "prancha": "EXE.FOR-R00", "revisao": "R00", "largura": 2000, "altura": 1500,
                  "tile": 512, "niveis": [0], "tiles": {}, "trecho": "Planta inteira"}
            rel = publicar_planta.por_barras(cfg, detalhes, [fm])
            self.assertEqual((rel["barras"], rel["conflitos"]), (4, []))
            ids = {(p["tipo"], p["nome"]): publicar_planta.id_local("EXE", "2º Pavimento", p["tipo"], p["nome"]) for p in fm["pecas"]}
            man, binario, r = publicar_planta.montar_trecho(fm, {"P": {}, "V": {}}, ids, {"planta_id": "p", "trecho": "Planta inteira"})
            m, _ = pacote.ler(man, binario)
            self.assertEqual(r["barras"], 4)
            self.assertEqual(sorted(b.get("posicao", "-") for b in m["barras"].values()), ["-", "N15", "N2", "N25"])
            # o id da barra é fixo: gerar de novo dá o mesmo (as marcações continuam valendo)
            fm2 = dict(fm, pecas=forma_exe())
            publicar_planta.por_barras(cfg, {"barras": [bl.ler_prancha(pdf, "longitudinal_inferior")]}, [fm2])
            self.assertEqual(sorted(fm2["barras"]), sorted(fm["barras"]))


class TestFichaDeLaje(unittest.TestCase):
    def test_exemplo_tem_um_item_das_barras(self):
        import json

        import publicar_fichas

        dados = json.loads((RAIZ / "pipeline" / "fvs" / "fichas_laje.exemplo.json").read_text(encoding="utf-8"))
        f = publicar_fichas.normalizar(dados)[0]
        self.assertEqual([i["n"] for i in f["itens"] if i.get("barras")], [3])

    def test_recusa_barras_fora_da_laje_repetido_ou_misturado(self):
        import publicar_fichas

        def ficha(aplica, *itens):
            return [{"codigo": "EXE-X", "titulo": "X", "aplica_a": aplica, "itens": list(itens)}]

        for ruim in (ficha(["V"], {"n": 1, "barras": True}),
                     ficha(["L"], {"n": 1, "barras": True}, {"n": 2, "barras": True}),
                     ficha(["L"], {"n": 1, "barras": "sim"}),
                     ficha(["L"], {"n": 1, "barras": True, "furos": True})):
            with self.assertRaises(publicar_fichas.ErroFichas):
                publicar_fichas.normalizar(ruim)


if __name__ == "__main__":
    unittest.main()

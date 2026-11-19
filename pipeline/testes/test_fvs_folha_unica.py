"""Folha única: encaixe das pranchas, repetidos, janela, níveis e nome. Só as partes puras, sem PDF."""

from __future__ import annotations

import pathlib
import random
import sys
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))
sys.path.insert(0, str(RAIZ / "pipeline"))

import folha_unica as fu  # noqa: E402
import plotar_dwg as pd  # noqa: E402


def transforma(rotulos: dict, s: float, dx: float, dy: float) -> dict:
    return {n: [(s * x + dx, s * y + dy) for x, y in lista] for n, lista in rotulos.items()}


BASE = {f"P{i}": [(100.0 + 317.5 * i, 200.0 + (i % 3) * 300.0)] for i in range(12)}


class TestJanela(unittest.TestCase):
    def test_o_maior_recorte_que_nao_e_a_folha(self):
        recortes = [(0, 0, 6000, 2400), (900, 30, 5900, 2300), (100, 100, 800, 1900), (5, 5, 50, 20)]
        self.assertEqual(fu.janela_principal(recortes, 6000, 2400), (900, 30, 5900, 2300))

    def test_so_detalhes_pequenos_nao_e_janela(self):
        self.assertIsNone(fu.janela_principal([(5, 5, 50, 20), (0, 0, 6000, 2400)], 6000, 2400))


class TestEncaixeEntreDuas(unittest.TestCase):
    def test_deslocamento_simples(self):
        e = fu.encaixe_entre(BASE, transforma(BASE, 1, -4734.68, 101.16))
        self.assertEqual(e.escala, 1.0)
        self.assertAlmostEqual(e.dx, -4734.68, places=2)
        self.assertAlmostEqual(e.dy, 101.16, places=2)
        self.assertEqual(e.em_comum, 12)

    def test_prancha_plotada_em_outra_escala(self):
        # o Trecho 2 do 2º pavimento da obra piloto: 2,8% menor
        e = fu.encaixe_entre(BASE, transforma(BASE, 0.9725, -5000.0, 30.0))
        self.assertAlmostEqual(e.escala, 0.9725, places=4)
        self.assertAlmostEqual(e.dx, -5000.0, places=1)
        self.assertEqual(e.em_comum, 12)

    def test_pequena_diferenca_de_medida_nao_vira_escala(self):
        outra = {n: [(x + 50 + (0.2 if i % 2 else -0.2), y + 10) for x, y in lista] for i, (n, lista) in enumerate(BASE.items())}
        self.assertEqual(fu.encaixe_entre(BASE, outra).escala, 1.0)

    def test_nome_repetido_em_outro_lugar_nao_atrapalha(self):
        # no Mezanino, a laje do elevador repete o nome de quatro pilares em outro lugar da prancha
        b = transforma(BASE, 1, -375.8, -1561.4)
        for nome in ("P1", "P2", "P3"):
            b[nome] = [(b[nome][0][0] - 1.3, b[nome][0][1] + 529.8)]
        e = fu.encaixe_entre(BASE, b)
        self.assertAlmostEqual(e.dx, -375.8, places=1)
        self.assertAlmostEqual(e.dy, -1561.4, places=1)
        self.assertEqual(e.em_comum, 9)

    def test_sem_nada_em_comum(self):
        self.assertIsNone(fu.encaixe_entre({"P1": [(0, 0)]}, {"P2": [(0, 0)]}))


class TestEncaixesDaFolha(unittest.TestCase):
    def _cadeia(self):
        # três pranchas em fila, cada uma vendo só uma parte das peças
        a = {n: p for n, p in BASE.items() if int(n[1:]) <= 6}
        b = {n: p for n, p in BASE.items() if 4 <= int(n[1:]) <= 9}
        c = {n: p for n, p in BASE.items() if int(n[1:]) >= 7}
        return a, transforma(b, 1, -1000, 50), transforma(c, 1, -2500, -80)

    def test_todas_vao_para_o_mesmo_lugar(self):
        a, b, c = self._cadeia()
        es = fu.montar_encaixes([a, b, c])
        for rotulos, e in zip((a, b, c), es):
            for nome, lista in rotulos.items():
                x, y = e.ponto(*lista[0])
                self.assertAlmostEqual(x, BASE[nome][0][0], places=3)
                self.assertAlmostEqual(y, BASE[nome][0][1], places=3)

    def test_par_com_poucos_rotulos_nao_decide(self):
        a, b, c = self._cadeia()
        # um rótulo igual, em lugar errado, entre a primeira e a última não muda nada
        a = dict(a)
        c = dict(c)
        a["V9"] = [(10.0, 10.0)]
        c["V9"] = [(9000.0, 9000.0)]
        es = fu.montar_encaixes([a, b, c])
        x, _ = es[2].ponto(*c["P10"][0])
        self.assertAlmostEqual(x, BASE["P10"][0][0], places=3)

    def test_a_escala_da_folha_e_a_da_maioria(self):
        a, b, c = self._cadeia()
        b = transforma(b, 0.9725, 0, 0)
        es = fu.montar_encaixes([a, b, c])
        self.assertEqual(round(es[0].escala, 3), 1.0)
        self.assertAlmostEqual(es[1].escala, 1 / 0.9725, places=3)
        self.assertEqual(round(es[2].escala, 3), 1.0)
        # e a peça continua no mesmo lugar nas três
        xa, _ = es[0].ponto(*a["P5"][0])
        xb, _ = es[1].ponto(*b["P5"][0])
        self.assertAlmostEqual(xa, xb, places=2)

    def test_prancha_solta_e_erro_com_o_numero_dela(self):
        with self.assertRaisesRegex(fu.ErroFolhaUnica, r"\[2\]"):
            fu.montar_encaixes([BASE, {"V1": [(0.0, 0.0)]}])

    def test_uma_prancha_so(self):
        self.assertEqual(fu.montar_encaixes([BASE])[0].ponto(10, 20), (10.0, 20.0))


class TestRepetidos(unittest.TestCase):
    def test_mesmo_texto_no_mesmo_lugar_sai(self):
        an = [("P1", (0, 0, 10, 5)), ("P1", (0.5, 0.3, 10.5, 5.3)), ("P1", (100, 0, 110, 5)), ("P2", (0, 0, 10, 5))]
        self.assertEqual([t for t, _ in fu.sem_repetidos(an)], ["P1", "P1", "P2"])


class TestNiveis(unittest.TestCase):
    def test_prancha_comum_fica_nos_niveis_de_sempre(self):
        self.assertEqual(fu.niveis_da_folha(2384, 1684), [-2, -1, 0, 1])

    def test_folha_grande_ganha_niveis_para_abrir_inteira(self):
        self.assertEqual(fu.niveis_da_folha(8412, 7171), [-4, -3, -2, -1, 0, 1])


class TestNome(unittest.TestCase):
    def test_nome_com_as_folhas_de_primeira_a_ultima(self):
        nomes = [f"EXE.ES.LO.{n}.FOR3PAVTIP-R03" for n in range(129, 134)]
        self.assertEqual(fu.nome_da_folha(nomes), ("EXE.ES.LO.129-133.FOR3PAVTIP-R03", "R03"))

    def test_revisoes_diferentes_ficam_a_vista(self):
        nome, rev = fu.nome_da_folha(["EXE.ES.LO.1.FORX-R02", "EXE.ES.LO.2.FORX-R03"])
        self.assertEqual(rev, "R03")
        self.assertIn("R02 a R03", nome)

    def test_codigo_fora_do_padrao(self):
        self.assertEqual(fu.nome_da_folha(["forma A", "forma B"]), ("forma A + 1 pranchas", "R00"))

    def test_cabe_na_coluna_do_banco(self):
        self.assertLessEqual(len(fu.nome_da_folha(["x" * 300, "y"])[0]), 160)


class TestEncaixeContas(unittest.TestCase):
    def test_inverso_e_composicao(self):
        e = fu.Encaixe(1.03, 12.0, -7.0)
        x, y = e.ponto(5, 9)
        self.assertAlmostEqual(e.inverso().ponto(x, y)[0], 5)
        ida_e_volta = e.depois(e.inverso())
        self.assertAlmostEqual(ida_e_volta.escala, 1.0)
        self.assertAlmostEqual(ida_e_volta.dx, 0.0)


try:
    import pymupdf  # noqa: F401

    TEM_PDF = True
except ImportError:
    TEM_PDF = False


@unittest.skipUnless(TEM_PDF, "precisa de pymupdf")
class TestFolhaDePranchas(unittest.TestCase):
    """Duas pranchas inventadas, em PDF de verdade, com camadas, comentários e janela, como as do AutoCAD."""

    PILARES = {"P1": (200, 300), "P2": (900, 300), "P3": (1300, 300), "P4": (1700, 300), "P5": (2200, 300), "P6": (1300, 800), "P7": (1700, 800)}

    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.addCleanup(self._t.cleanup)
        self.base = pathlib.Path(self._t.name)

    def _prancha(self, nome: str, de: float, ate: float, dx: float, dy: float, s: float = 1.0) -> str:
        """Mostra o desenho de x = de até x = ate, dentro de uma janela, com um carimbo fora dela."""
        doc = pymupdf.open()
        page = doc.new_page(width=3000, height=1400)
        camada_p = doc.add_ocg("PILAR_CONCRETO")
        camada_v = doc.add_ocg("VIG_FACES")
        no_papel = lambda x, y: (s * x + dx, s * y + dy)  # noqa: E731
        janela = pymupdf.Rect(*no_papel(de, 100), *no_papel(ate, 1100))
        for nome_p, (x, y) in self.PILARES.items():
            if not de <= x <= ate:
                continue
            x0, y0 = no_papel(x - 10, y - 25)
            x1, y1 = no_papel(x + 10, y + 25)
            page.draw_rect(pymupdf.Rect(x0, y0, x1, y1), oc=camada_p)
            for texto, r in ((nome_p, (x + 14, y - 34, x + 50, y - 22)), ("(20x60)", (x + 14, y - 20, x + 50, y - 8))):
                a = page.add_rect_annot(pymupdf.Rect(*no_papel(r[0], r[1]), *no_papel(r[2], r[3])))
                a.set_info(content=texto)
                a.update()
        # uma viga que atravessa as duas pranchas: cada uma desenha o pedaço dela
        xa, xb = max(de, 300), min(ate, 2100)
        for y in (593, 607):
            page.draw_line(no_papel(xa, y), no_papel(xb, y), oc=camada_v)
        a = page.add_rect_annot(pymupdf.Rect(*no_papel(1150, 575), *no_papel(1200, 590)))
        a.set_info(content="V 12")
        a.update()
        # fora da janela, no carimbo: um nome que não é peça da planta
        a = page.add_rect_annot(pymupdf.Rect(2900, 1300, 2950, 1315))
        a.set_info(content="P999")
        a.update()
        b = page.add_rect_annot(pymupdf.Rect(2900, 1316, 2950, 1330))
        b.set_info(content="(20x60)")
        b.update()
        page.draw_rect(pymupdf.Rect(2890, 1290, 2960, 1340), oc=camada_p)
        # põe o desenho dentro de um recorte, como uma janela do AutoCAD
        doc.xref_stream(page.get_contents()[0])
        conteudo = b"".join(doc.xref_stream(x) for x in page.get_contents())
        h = page.rect.height
        recorte = f"q {janela.x0} {h - janela.y1} {janela.width} {janela.height} re W n\n".encode()
        doc.update_stream(page.get_contents()[0], recorte + conteudo + b"\nQ\n")
        caminho = str(self.base / f"{nome}.pdf")
        doc.save(caminho)
        doc.close()
        return caminho

    def test_junta_as_pranchas_e_le_as_pecas_como_uma_so(self):
        a = self._prancha("EXE.ES.LO.1.FORX-R02", 0, 1500, 100.0, 50.0)
        b = self._prancha("EXE.ES.LO.2.FORX-R02", 1100, 2500, -950.0, 80.0)
        f = fu.ler_folha_unica([{"trecho": "Trecho 1", "pdf": a}, {"trecho": "Trecho 2", "pdf": b}], imprimir=lambda *_: None)
        self.assertEqual(f["trecho"], "Planta inteira")
        self.assertEqual(f["prancha"], "EXE.ES.LO.1-2.FORX-R02")
        nomes = {p["nome"]: p for p in f["pecas"]}
        self.assertEqual(sorted(n for n in nomes if n.startswith("P")), sorted(self.PILARES), "P999 está fora da janela")
        # todos no lugar certo, em relação ao P1: nada ficou deslocado na emenda
        centro = lambda p: (sum(c[0] for c in p["polys"][0]) / 4, sum(c[1] for c in p["polys"][0]) / 4)  # noqa: E731
        x1, y1 = centro(nomes["P1"])
        for nome, (x, y) in self.PILARES.items():
            cx, cy = centro(nomes[nome])
            self.assertAlmostEqual(cx - x1, x - 200, delta=0.5, msg=nome)
            self.assertAlmostEqual(cy - y1, y - 300, delta=0.5, msg=nome)
        # a viga atravessa a emenda: sai inteira, de uma prancha à outra
        viga = nomes["V12"]["polys"][0]
        self.assertGreater(max(c[0] for c in viga) - min(c[0] for c in viga), 1500)
        # tudo com coordenada positiva, dentro da folha
        self.assertLess(max(c[0] for p in nomes.values() for poly in p["polys"] for c in poly), f["largura"])
        self.assertGreater(min(c[0] for p in nomes.values() for poly in p["polys"] for c in poly), 0)
        self.assertEqual(f["niveis"][-1], 1)
        self.assertTrue(any(k.startswith("1/") for k in f["tiles"]))
        self.assertTrue(any(k.startswith(f"{f['niveis'][0]}/") for k in f["tiles"]))

    def test_prancha_em_outra_escala_cai_no_lugar_certo(self):
        a = self._prancha("EXE.ES.LO.1.FORX-R02", 0, 1500, 100.0, 50.0)
        b = self._prancha("EXE.ES.LO.2.FORX-R02", 1100, 2500, -900.0, 60.0, s=0.97)
        f = fu.ler_folha_unica([{"trecho": "Trecho 1", "pdf": a}, {"trecho": "Trecho 2", "pdf": b}], imprimir=lambda *_: None)
        nomes = {p["nome"]: p for p in f["pecas"]}
        centro = lambda p: (sum(c[0] for c in p["polys"][0]) / 4, sum(c[1] for c in p["polys"][0]) / 4)  # noqa: E731
        x1, _ = centro(nomes["P1"])
        self.assertAlmostEqual(centro(nomes["P5"])[0] - x1, 2000, delta=1.5)
        self.assertAlmostEqual(f["origens"][1]["escala"], 1 / 0.97, places=2)

    def test_pdf_plotado_do_model_le_na_escala_da_prancha(self):
        pdf = self._prancha("forma_plotada", 0, 2500, 100.0, 50.0, s=0.5)
        f = fu.ler_plotada(pdf, escala=2.0, nome="EXE.ES.LO.1.FORX-R02", imprimir=lambda *_: None)
        nomes = {p["nome"]: p for p in f["pecas"]}
        self.assertEqual(f["revisao"], "R02")
        self.assertEqual(f["largura"], 6000.0)
        self.assertIn("P5", nomes)
        centro = lambda p: (sum(c[0] for c in p["polys"][0]) / 4, sum(c[1] for c in p["polys"][0]) / 4)  # noqa: E731
        self.assertAlmostEqual(centro(nomes["P5"])[0] - centro(nomes["P1"])[0], 2000, delta=0.5)


class TestIndiceDeSegmentos(unittest.TestCase):
    def test_acha_tudo_o_que_a_busca_completa_acharia(self):
        sorteio = random.Random(3)
        segs = [(round(sorteio.uniform(-50, 500), 1), sorteio.uniform(0, 100), sorteio.uniform(100, 200)) for _ in range(800)]
        indice = fu.IndiceDeSegmentos(segs)
        for _ in range(200):
            linha = round(sorteio.uniform(-60, 510), 1)
            esperado = sorted(s for s in segs if abs(s[0] - linha) <= 0.6)
            achado = sorted(s for s in indice.perto(linha, 0.6) if abs(s[0] - linha) <= 0.6)
            self.assertEqual(achado, esperado)

    def test_devolve_bem_menos_que_a_lista_toda(self):
        segs = [(float(i), 0.0, 1.0) for i in range(1000)]
        self.assertLessEqual(len(fu.IndiceDeSegmentos(segs).perto(500.0, 0.6)), 3)


class TestPlotarDwg(unittest.TestCase):
    def test_script_responde_na_ordem_do_plot(self):
        linhas = pd.script_de_plotagem(r"C:\saida\forma 3.pdf").splitlines()
        i = linhas.index("-PLOT")
        self.assertEqual(linhas[i + 1:i + 5], ["Y", "Model", "DWG To PDF.pc3", pd.PAPEL])
        self.assertEqual(linhas[i + 8], "E", "plota a extensão do Model, e não o que está na tela")
        self.assertIn('"C:/saida/forma 3.pdf"', linhas)
        self.assertIn("PDFSHX 1", linhas, "sem isso os nomes das peças não ficam legíveis no PDF")
        # sem sair, o accoreconsole fica rodando para sempre esperando a próxima ordem
        self.assertEqual(linhas[-2:], ["_.QUIT", "_Y"])

    def test_informacao_escolhe_a_janela_maior_e_ignora_a_do_papel(self):
        texto = (
            "extmin -40.0 -140.0\nextmax 331.7 115.8\n"
            "janela 1 2008.3 1036.8 1036.8\n"  # a número 1 é o próprio papel
            "janela 3 399.2 218.2 21.8\n"
            "janela 2 1661.6 562.1 56.2\n"
        )
        info = pd.ler_informacao(texto)
        self.assertEqual(info["extmin"], (-40.0, -140.0))
        self.assertEqual(len(info["janelas"]), 2)
        self.assertAlmostEqual(info["janelas"][0]["mm_por_unidade"], 10.0, places=1)

    def test_escala_entre_o_pdf_e_a_prancha(self):
        info = {"extmin": (0.0, 0.0), "extmax": (372.0, 256.0), "janelas": [{"mm_por_unidade": 10.0}]}
        # o desenho coube pela largura, em 4A0: 6741 pontos / 372 unidades = 18,12 pontos por unidade.
        # Na prancha, 10 mm por unidade = 28,35 pontos por unidade.
        self.assertAlmostEqual(pd.escala_da_plotagem(info), 28.3465 / (pd.PAPEL_PONTOS[0] / 372.0), places=3)

    def test_desenho_alto_cabe_pela_altura(self):
        info = {"extmin": (0.0, 0.0), "extmax": (100.0, 1000.0), "janelas": [{"mm_por_unidade": 10.0}]}
        self.assertAlmostEqual(pd.escala_da_plotagem(info), 28.3465 / (pd.PAPEL_PONTOS[1] / 1000.0), places=3)

    def test_sem_layout_nao_inventa_escala(self):
        with self.assertRaisesRegex(pd.ErroPlotagem, "--escala"):
            pd.escala_da_plotagem({"extmin": (0, 0), "extmax": (1, 1), "janelas": []})

    def test_autocad_que_nao_existe(self):
        with self.assertRaisesRegex(pd.ErroPlotagem, "não achei"):
            pd.achar_accoreconsole(r"C:\nao\existe\accoreconsole.exe")


if __name__ == "__main__":
    unittest.main()

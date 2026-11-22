"""Planta de furação com a prancha de furação no fundo (pipeline/fvs/furacao_fundo.py)."""

import json
import pathlib
import sys
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "fvs"))
sys.path.insert(0, str(RAIZ))

import furacao_fundo  # noqa: E402
import pacote  # noqa: E402

# pilares da forma (1:50): espalhados, tamanhos variados para o encaixe não ter dúvida
PILARES = [("P1", 100, 100, 10.8, 34.0), ("P2", 600, 120, 17.0, 39.7), ("P3", 140, 700, 28.3, 10.8),
           ("P4", 650, 650, 10.8, 34.0), ("P5", 380, 400, 14.2, 45.4), ("P6", 900, 300, 10.8, 22.7)]


def ret(x, y, w, h):
    return [[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2]]


def pecas_da_forma():
    pecas = [{"tipo": "P", "nome": n, "secao": "", "rotulo": [x, y, x, y], "polys": [ret(x, y, w, h)]} for n, x, y, w, h in PILARES]
    pecas.append({"tipo": "V", "nome": "V1", "secao": "19x60", "rotulo": [100, 95, 600, 105], "polys": [ret(350, 100, 500, 10)]})
    pecas.append({"tipo": "F", "nome": "V1-F1", "secao": "Ø10", "rotulo": [295, 95, 305, 105], "polys": [ret(300, 100, 10, 10)],
                  "viga": "V1", "furo": {"diametro": 10, "disciplinas": ["Hidráulica"]}})
    pecas.append({"tipo": "F", "nome": "FL1", "secao": "Ø10", "rotulo": [375, 395, 385, 405], "polys": [ret(380, 400, 10, 10)],
                  "furo": {"diametro": 10, "laje": True}})  # dentro do P5
    pecas.append({"tipo": "F", "nome": "FL2", "secao": "Ø10", "rotulo": [495, 495, 505, 505], "polys": [ret(500, 500, 10, 10)],
                  "furo": {"diametro": 10, "laje": True}})  # na laje
    return pecas


class TestPilaresDaPrancha(unittest.TestCase):
    def test_so_retangulo_cinza_medio(self):
        self.assertTrue(furacao_fundo.eh_retangulo_de_pilar({"fill": (0.5, 0.5, 0.5), "items": [("re",)]}))
        self.assertFalse(furacao_fundo.eh_retangulo_de_pilar({"fill": (0.96, 0.96, 0.96), "items": [("re",)]}))
        self.assertFalse(furacao_fundo.eh_retangulo_de_pilar({"fill": (0.5, 0.5, 0.5), "items": [("l",)]}))
        self.assertFalse(furacao_fundo.eh_retangulo_de_pilar({"fill": None, "items": [("re",)]}))

    def test_janela_com_margem_e_sem_a_legenda(self):
        from alinhamento import alinhar as al

        pts = [al.Ponto(1000, 1000, w=10, h=10), al.Ponto(2000, 1500, w=10, h=10)]
        m = 400 * 72 / 2.54 / 75
        x0, y0, x1, y1 = furacao_fundo.janela_dos_pilares(pts, 3370, 2384, 75)
        self.assertAlmostEqual(x0, 995 - m, places=1)
        self.assertAlmostEqual(y1, 1505 + m, places=1)
        self.assertEqual(furacao_fundo.janela_dos_pilares(pts, 3370, 2384, 75, limite_x=2050)[2], 2050)
        with self.assertRaises(furacao_fundo.ErroFuracao):
            furacao_fundo.janela_dos_pilares([], 100, 100, 75)

    def test_le_prancha_em_pdf(self):
        try:
            import pymupdf
        except ImportError:
            self.skipTest("precisa de pymupdf")

        with tempfile.TemporaryDirectory() as d:
            arq = str(pathlib.Path(d) / "EXE.FR.EX.011.PILOTISXXA-R00.pdf")
            doc = pymupdf.open()
            pg = doc.new_page(width=1200, height=900)
            for _, x, y, w, h in PILARES:  # a prancha 1:75: 2/3 do tamanho da forma
                k = 50 / 75
                pg.draw_rect(pymupdf.Rect(x * k - w * k / 2, y * k - h * k / 2, x * k + w * k / 2, y * k + h * k / 2),
                             color=None, fill=(0.5, 0.5, 0.5))
            pg.draw_rect(pymupdf.Rect(800, 100, 830, 130), color=None, fill=(0.96, 0.96, 0.96))  # capitel claro: fora
            doc.save(arq)
            lida = furacao_fundo.ler_prancha(arq)
        self.assertEqual(lida["nome"], "EXE.FR.EX.011.PILOTISXXA-R00")
        self.assertEqual(len(lida["pilares"]), len(PILARES))
        ok, resumo = furacao_fundo.alinhar_pranchas(pecas_da_forma(), [lida])
        self.assertEqual(len(ok), 1, resumo)
        a, _, _, d_ = ok[0]["transformacao"]["matriz"]
        self.assertAlmostEqual(abs(a), 1.5, places=2)
        self.assertAlmostEqual(abs(d_), 1.5, places=2)


    def test_pilar_em_outro_cinza_tambem_encaixa(self):
        """Prancha que desenha o pilar em cinza claro (sem o cinza médio): vale o tom que encaixar."""
        try:
            import pymupdf
        except ImportError:
            self.skipTest("precisa de pymupdf")

        with tempfile.TemporaryDirectory() as d:
            arq = str(pathlib.Path(d) / "EXE.FR.EX.026.MEZANINOXA-R00.pdf")
            doc = pymupdf.open()
            pg = doc.new_page(width=1200, height=900)
            k = 50 / 75
            for _, x, y, w, h in PILARES:
                pg.draw_rect(pymupdf.Rect(x * k - w * k / 2, y * k - h * k / 2, x * k + w * k / 2, y * k + h * k / 2),
                             color=None, fill=(0.75, 0.75, 0.75))
            for i in range(4):  # ruído de outro tom, longe da malha
                pg.draw_rect(pymupdf.Rect(900 + 40 * i, 700, 920 + 40 * i, 720), color=None, fill=(0.9, 0.9, 0.9))
            doc.save(arq)
            lida = furacao_fundo.ler_prancha(arq)
        self.assertEqual(lida["pilares"], [])
        self.assertIsNone(lida["janela"])
        ok, resumo = furacao_fundo.alinhar_pranchas(pecas_da_forma(), [lida])
        self.assertEqual(len(ok), 1, resumo)
        self.assertEqual(resumo[0]["alinhamento"]["tom_do_pilar"], 0.75)
        self.assertIsNotNone(ok[0]["janela"])


class TestDesempate(unittest.TestCase):
    def test_orientacao_sem_a_escala(self):
        self.assertEqual(furacao_fundo.orientacao({"matriz": [1.5, 0, 0, 1.5], "t": [0, 0]}), ((1.0, 0.0), (0.0, 1.0)))
        self.assertEqual(furacao_fundo.orientacao({"matriz": [0, -1.5, -1.5, 0], "t": [0, 0]}), ((0.0, -1.0), (-1.0, 0.0)))

    def test_sobreposicao(self):
        r = (0, 0, 10, 10)
        self.assertEqual(furacao_fundo._sobreposicao(r, []), 0)
        self.assertAlmostEqual(furacao_fundo._sobreposicao(r, [(5, 0, 20, 10)]), 0.5)
        self.assertAlmostEqual(furacao_fundo._sobreposicao(r, [(20, 20, 30, 30)]), 0)

    def test_contorno_na_folha(self):
        pr = {"janela": (0, 0, 100, 50)}
        self.assertEqual(furacao_fundo.contorno_na_folha(pr, {"matriz": [1.5, 0, 0, 1.5], "t": [10, 20]}), (10, 20, 160, 95))

    def test_malha_repetida_fica_na_parte_livre(self):
        """Duas torres iguais: a prancha da segunda encaixa nas duas; a primeira já está encaixada."""
        from alinhamento import alinhar as al

        torre = [(0, 0, 10.8, 34.0), (300, 20, 17.0, 39.7), (40, 400, 28.3, 10.8), (320, 380, 14.2, 45.4), (150, 200, 10.8, 22.7)]
        destino = [al.Ponto(x + dx, y, w=w, h=h) for dx in (0, 1000) for x, y, w, h in torre]
        k = 50 / 75
        pr = {"nome": "B", "pilares": [al.Ponto(x * k, y * k, w=w * k, h=h * k) for x, y, w, h in torre], "janela": (-20, -20, 380 * k, 420 * k)}
        ja = {"nome": "A", "pilares": pr["pilares"], "janela": pr["janela"], "transformacao": {"matriz": [1.5, 0, 0, 1.5], "t": [0, 0]}}
        tol = al.TOLERANCIA_CM * al.PT_POR_CM_1_50
        T = furacao_fundo.desempatar(pr, [ja], destino, 1.5, [((1.0, 0.0), (0.0, 1.0))], tol)
        self.assertIsNotNone(T)
        self.assertAlmostEqual(T["transformacao"]["t"][0], 1000, delta=1)


class TestAConferir(unittest.TestCase):
    def test_fora_do_contorno_pilhas_e_filas(self):
        pecas = [{"tipo": "P", "nome": "P1", "polys": [ret(0, 0, 10, 10)]}, {"tipo": "P", "nome": "P2", "polys": [ret(1000, 1000, 10, 10)]},
                 {"tipo": "V", "nome": "V1", "polys": [ret(500, 0, 1000, 10)]}, {"tipo": "V", "nome": "V2", "polys": [ret(500, 1000, 1000, 10)]},
                 {"tipo": "V", "nome": "V3", "polys": [ret(0, 500, 10, 1000)]}, {"tipo": "V", "nome": "V4", "polys": [ret(1000, 500, 10, 1000)]}]

        def furo(nome, x, y):
            return {"tipo": "F", "nome": nome, "rotulo": [x - 1, y - 1, x + 1, y + 1], "polys": []}

        pecas += [furo("dentro", 500, 500), furo("fora", 500, -300),
                  furo("a", 200, 200), furo("b", 200.5, 200.5)]
        pecas += [furo(f"c{i}", 800, 300 + i * 10) for i in range(6)]  # 6 em fila, de 10 em 10 pontos
        c = furacao_fundo.a_conferir(pecas, 72 / 2.54 / 50)
        self.assertEqual([f["furo"] for f in c["fora_do_contorno"]], ["fora"])
        self.assertIn("acima", c["fora_do_contorno"][0]["sem_estrutura"])
        self.assertIn(["a", "b"], c["mesmo_ponto"])
        self.assertEqual([x["furos"] for x in c["em_fila"]], [[f"c{i}" for i in range(6)]])


class TestFurosComPeca(unittest.TestCase):
    def test_furo_de_laje_no_pilar_ganha_o_pilar(self):
        pecas = pecas_da_forma()
        furacao_fundo.marcar_pilares(pecas)
        por_nome = {p["nome"]: p for p in pecas}
        self.assertEqual(por_nome["FL1"].get("pilar"), "P5")
        self.assertNotIn("pilar", por_nome["FL2"])
        self.assertNotIn("pilar", por_nome["V1-F1"])  # furo de viga fica na viga

    def test_folha_leva_so_os_furos_e_marca_a_forma(self):
        forma = {"largura": 1000, "altura": 800, "tile": 512, "niveis": [0], "pecas": pecas_da_forma()}
        self.assertIsNone(furacao_fundo.folha_de_furacao(forma, []))
        import armadura_laje

        orig = armadura_laje.tiles_da_camada
        armadura_laje.tiles_da_camada = lambda pranchas, niveis: {}
        try:
            folha = furacao_fundo.folha_de_furacao(forma, [{"nome": "EXE.FR.EX.011.PILOTISXXA-R00", "transformacao": {"matriz": [1.5, 0, 0, 1.5], "t": [0, 0]}}],
                                                   imprimir=lambda *_: None)
        finally:
            armadura_laje.tiles_da_camada = orig
        self.assertEqual(folha["disciplina"], "furacao")
        self.assertEqual(sorted(p["nome"] for p in folha["pecas"]), ["FL1", "FL2", "V1-F1"])
        self.assertTrue(forma["furos_separados"])
        self.assertEqual(next(p for p in forma["pecas"] if p["nome"] == "FL1")["pilar"], "P5")


class TestPacoteDaFuracao(unittest.TestCase):
    def cab(self, **extra):
        return {"planta_id": "p", "trecho": "Furação", "prancha": "X", "revisao": "R00", "largura": 10, "altura": 10,
                "tile": 512, "niveis": [0], **extra}

    def furo(self, **extra):
        return {"tipo": "F", "nome": "F", "secao": "", "rotulo": [0, 0, 1, 1], "polys": [], "furo": {"diametro": 10}, **extra}

    def test_planta_de_furacao_aceita_viga_e_pilar_de_fora(self):
        els = {"f1": self.furo(viga="v-de-fora"), "f2": self.furo(pilar="p-de-fora", furo={"diametro": 10, "laje": True})}
        man, _ = pacote.montar(self.cab(disciplina="furacao"), {}, els, {})
        m = json.loads(man)
        self.assertEqual(m["disciplina"], "furacao")
        self.assertEqual(m["elementos"]["f1"]["viga"], "v-de-fora")
        self.assertEqual(m["elementos"]["f2"]["pilar"], "p-de-fora")

    def test_forma_continua_exigindo_a_peca_no_pacote(self):
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(self.cab(), {}, {"f1": self.furo(viga="v-de-fora")}, {})
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(self.cab(), {}, {"f2": self.furo(pilar="p-de-fora", furo={"diametro": 10, "laje": True})}, {})

    def test_forma_marcada_com_furos_separados(self):
        man, _ = pacote.montar(self.cab(furos_separados=True), {}, {}, {})
        self.assertTrue(json.loads(man)["furos_separados"])


if __name__ == "__main__":
    unittest.main()

"""Projetos nos ambientes (pipeline/fvs/modulacao.py): qual prancha (1ª fiada, paginação de piso,
impermeabilização) mostra cada apartamento, onde recortar e o recorte do ambiente no pacote.
Dados fictícios da obra EXE, sem PDF; a nota por pedaço usa numpy, shapely e pillow quando há."""

from __future__ import annotations

import pathlib
import sys
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))

import modulacao  # noqa: E402
import pacote  # noqa: E402
import publicar_planta  # noqa: E402

# Duas pranchas de setor, 1000 x 700 pontos, 10 pontos por metro (só para o teste).
FOLHAS = {"EXE.VD.EX.024.TIPA-R00.pdf": (1000.0, 700.0), "EXE.VD.EX.025.TIPB-R00.pdf": (1000.0, 700.0)}
A, B = sorted(FOLHAS)
PT = {A: 10.0, B: 10.0}


def amb(nome, grupo, **caixas):
    return {"nome": nome, "grupo": grupo, "caixas": {FOLHA[k]: v for k, v in caixas.items()}}


FOLHA = {"a": A, "b": B}


class TestCaixas(unittest.TestCase):
    def test_caixa_junta_e_folga(self):
        self.assertEqual(modulacao.caixa_dos_pontos([[3, 4], [1, 9], [5, 2]]), (1, 2, 5, 9))
        self.assertEqual(modulacao.juntar_caixas([(0, 0, 1, 1), (5, -2, 6, 3)]), (0, -2, 6, 3))
        self.assertEqual(modulacao.folga_na_folha((10, 20, 900, 650), 1000, 700), 10)
        self.assertLess(modulacao.folga_na_folha((-5, 20, 100, 100), 1000, 700), 0)
        with self.assertRaises(modulacao.ErroModulacao):
            modulacao.caixa_dos_pontos([])

    def test_escolhe_a_prancha_em_que_cabe_mais_longe_da_borda(self):
        caixas = {A: (900, 100, 990, 200), B: (100, 100, 190, 200)}  # na A, quase na borda; na B, folgado
        self.assertEqual(modulacao.escolher_prancha(caixas, FOLHAS), B)
        # saindo da folha não vale
        self.assertEqual(modulacao.escolher_prancha({A: (950, 100, 1050, 200)}, FOLHAS), None)
        # prancha que não casou (sem folha) não vale
        self.assertEqual(modulacao.escolher_prancha({"outra.pdf": (10, 10, 20, 20)}, FOLHAS), None)

    def test_recorte_com_folga_sem_sair_da_folha(self):
        self.assertEqual(modulacao.recorte((10, 100, 200, 300), 1000, 700, 3.0), (7, 97, 203, 303))
        self.assertEqual(modulacao.recorte((1, 1, 999, 699), 1000, 700, 3.0), (0, 0, 1000, 700))

    def test_chave_segura(self):
        self.assertEqual(modulacao.chave_da_modulacao("Apto 303"), "M_Apto_303")
        self.assertEqual(modulacao.chave_da_modulacao("AC-01"), "M_AC-01")
        self.assertRegex(modulacao.chave_da_modulacao("Área comum/x"), pacote.CHAVE_SEGURA.pattern)


class TestPlano(unittest.TestCase):
    def test_um_recorte_por_apartamento(self):
        ambs = [
            amb("101-01", "Apto 101", a=(100, 100, 200, 200), b=(-500, 100, -400, 200)),
            amb("101-02", "Apto 101", a=(200, 100, 300, 250)),
            amb("102-01", "Apto 102", b=(600, 300, 700, 400)),
        ]
        recortes, de_cada, rel = modulacao.plano_da_modulacao(ambs, FOLHAS, PT, margem_m=0.3)
        self.assertEqual(de_cada, {"101-01": "M_Apto_101", "101-02": "M_Apto_101", "102-01": "M_Apto_102"})
        r = recortes["M_Apto_101"]
        # o apartamento inteiro (caixas juntas) mais 0,3 m (3 pontos) de folga
        self.assertEqual((r["prancha"], r["clip"], r["ambientes"]), (A, (97, 97, 303, 253), ["101-01", "101-02"]))
        self.assertEqual(recortes["M_Apto_102"]["prancha"], B)
        self.assertEqual(rel["recortes"], 2)
        self.assertEqual(rel["com_recorte"], 3)
        self.assertEqual(rel["sem_recorte"], [])
        self.assertNotIn("paredes_nao_bateram", rel)  # sem nota, nada a dizer
        self.assertEqual(rel["por_prancha"], {A: 1, B: 1})

    def test_apartamento_entre_dois_setores_vai_por_comodo(self):
        ambs = [
            amb("103-01", "Apto 103", a=(900, 100, 990, 200), b=(-90, 100, 0, 200)),
            amb("103-02", "Apto 103", a=(990, 100, 1080, 200), b=(5, 100, 80, 200)),
        ]
        recortes, de_cada, _ = modulacao.plano_da_modulacao(ambs, FOLHAS, PT)
        self.assertEqual(de_cada, {"103-01": "M_103-01", "103-02": "M_103-02"})
        self.assertEqual((recortes["M_103-01"]["prancha"], recortes["M_103-02"]["prancha"]), (A, B))

    def test_area_comum_e_sem_prancha(self):
        ambs = [
            amb("AC-01", "Área comum", a=(400, 400, 500, 500)),
            amb("AC-02", "Área comum", a=(510, 400, 560, 500)),
            amb("104-01", "Apto 104"),  # não casou em prancha nenhuma
        ]
        recortes, de_cada, rel = modulacao.plano_da_modulacao(ambs, FOLHAS, PT)
        self.assertEqual(de_cada, {"AC-01": "M_AC-01", "AC-02": "M_AC-02"})  # área comum: um recorte cada
        self.assertEqual(rel["sem_recorte"], ["104-01"])

    def test_detalhes_no_formato_do_montar_trecho(self):
        ambs = [amb("101-01", "Apto 101", a=(100, 100, 200, 200)), amb("101-02", "Apto 101", a=(200, 100, 300, 200))]
        recortes, de_cada, _ = modulacao.plano_da_modulacao(ambs, FOLHAS, PT)
        dets = modulacao.detalhes_dos_ambientes(recortes, de_cada, {"M_Apto_101": b"IMG"}, lambda p: p[:-4])
        self.assertEqual(dets["101-01"], {"chave": "M_Apto_101", "titulo": "Modulação · Apto 101", "prancha": A[:-4], "img": b"IMG", "aco": None})
        self.assertIs(dets["101-01"]["img"], dets["101-02"]["img"])
        # recorte sem imagem (falhou ao desenhar) não entra
        self.assertEqual(modulacao.detalhes_dos_ambientes(recortes, de_cada, {}), {})

    def test_montar_trecho_ambientes_do_apto_dividem_uma_imagem(self):
        def a(nome, x0):
            return {"tipo": "A", "nome": nome, "secao": "9,0 m²", "grupo": "Apto 101", "rotulo": [x0, 0, x0 + 1, 1],
                    "polys": [[[x0, 0], [x0 + 5, 0], [x0 + 5, 5], [x0, 5]]]}

        fm = {"prancha": "EXE.AR.EX.003-R00", "revisao": "R00", "largura": 100, "altura": 100, "tile": 512, "niveis": [0],
              "tiles": {"0/0/0": b"T"}, "trecho": "Ambientes", "disciplina": "arquitetura", "pecas": [a("101-01", 0), a("101-02", 10)]}
        ambs = [amb("101-01", "Apto 101", a=(100, 100, 200, 200)), amb("101-02", "Apto 101", a=(200, 100, 300, 200))]
        recortes, de_cada, _ = modulacao.plano_da_modulacao(ambs, FOLHAS, PT)
        detalhes = {"A": modulacao.detalhes_dos_ambientes(recortes, de_cada, {"M_Apto_101": b"IMG"})}
        ids = {(p["tipo"], p["nome"]): f"id-{p['nome']}" for p in fm["pecas"]}
        man, binario, rel = publicar_planta.montar_trecho(fm, detalhes, ids, {"planta_id": "p", "trecho": "Ambientes"})
        m, pedacos = pacote.ler(man, binario)
        self.assertEqual({m["elementos"][i]["detalhe"] for i in ("id-101-01", "id-101-02")}, {"M_Apto_101"})
        self.assertEqual(list(m["detalhes"]), ["M_Apto_101"])  # uma imagem só no pacote
        self.assertEqual(m["detalhes"]["M_Apto_101"]["titulo"], "Modulação · Apto 101")
        self.assertEqual(pedacos["d:M_Apto_101"], b"IMG")
        self.assertEqual(rel["sem_detalhe"], [])


class TestNotaPorApartamento(unittest.TestCase):
    """Prancha de setor com parte desenhada fora de posição: cada apartamento só fica com a prancha em que as
    paredes dele batem (a nota vem de modulacao.nota_local; aqui, inventada)."""

    def test_escolhe_pela_nota_e_recusa_abaixo_da_minima(self):
        caixas = {A: (100, 100, 200, 200), B: (400, 100, 500, 200)}
        self.assertEqual(modulacao.escolher_prancha(caixas, FOLHAS, {A: 0.9, B: 0.6}, 0.5), A)
        # a folga desempata nota igual
        self.assertEqual(modulacao.escolher_prancha({A: (900, 100, 990, 200), B: (400, 100, 500, 200)}, FOLHAS, {A: 0.7, B: 0.7}, 0.5), B)
        # ninguém passa da mínima
        self.assertIsNone(modulacao.escolher_prancha(caixas, FOLHAS, {A: 0.3, B: 0.1}, 0.5))
        # caber na folha continua obrigatório
        self.assertIsNone(modulacao.escolher_prancha({A: (950, 100, 1050, 200)}, FOLHAS, {A: 1.0}, 0.5))

    def test_apartamento_cujas_paredes_nao_batem_fica_sem_recorte(self):
        ambs = [
            amb("101-01", "Apto 101", a=(100, 100, 200, 200), b=(100, 100, 200, 200)),
            amb("102-01", "Apto 102", a=(300, 100, 400, 200)),
        ]
        notas = {(A, ("101-01",)): 0.4, (B, ("101-01",)): 0.8, (A, ("102-01",)): 0.2}
        vistos = []

        def nota(prancha, nomes):
            vistos.append((prancha, tuple(nomes)))
            return notas.get((prancha, tuple(nomes)), 0.0)

        recortes, de_cada, rel = modulacao.plano_da_modulacao(ambs, FOLHAS, PT, sigla="PP", nota=nota, nota_minima=0.5)
        self.assertEqual(de_cada, {"101-01": "PP_Apto_101"})
        self.assertEqual((recortes["PP_Apto_101"]["prancha"], recortes["PP_Apto_101"]["nota"]), (B, 0.8))
        self.assertEqual(rel["sem_recorte"], ["102-01"])
        self.assertEqual(rel["paredes_nao_bateram"], ["102-01"])
        self.assertIn((A, ("101-01",)), vistos)

    def test_sigla_do_titulo(self):
        self.assertEqual(modulacao.sigla_do_titulo("Paginação de piso"), "PP")
        self.assertEqual(modulacao.sigla_do_titulo("Impermeabilização"), "I")
        self.assertEqual(modulacao.sigla_do_titulo("de"), "D")
        self.assertEqual(modulacao.chave_da_modulacao("Apto 101", "PP"), "PP_Apto_101")

    def test_detalhe_do_projeto_leva_titulo_e_fichas(self):
        ambs = [amb("101-01", "Apto 101", a=(100, 100, 200, 200))]
        recortes, de_cada, _ = modulacao.plano_da_modulacao(ambs, FOLHAS, PT, sigla="I")
        dets = modulacao.detalhes_dos_ambientes(recortes, de_cada, {"I_Apto_101": b"IMG"}, titulo="Impermeabilização",
                                                fichas=["EXE-PVS-024", "EXE-PVS-015"])
        self.assertEqual(dets["101-01"]["titulo"], "Impermeabilização · Apto 101")
        self.assertEqual(dets["101-01"]["fichas"], ["EXE-PVS-024", "EXE-PVS-015"])

    def test_montar_trecho_com_modulacao_e_projetos(self):
        def a(nome, x0, grupo="Apto 101"):
            return {"tipo": "A", "nome": nome, "secao": "9,0 m²", "grupo": grupo, "rotulo": [x0, 0, x0 + 1, 1],
                    "polys": [[[x0, 0], [x0 + 5, 0], [x0 + 5, 5], [x0, 5]]]}

        fm = {"prancha": "EXE.AR.EX.003-R00", "revisao": "R00", "largura": 100, "altura": 100, "tile": 512, "niveis": [0],
              "tiles": {"0/0/0": b"T"}, "trecho": "Ambientes", "disciplina": "arquitetura",
              "pecas": [a("101-01", 0), a("101-02", 10), a("AC-01", 20, "Área comum")]}
        ambs = [amb("101-01", "Apto 101", a=(100, 100, 200, 200)), amb("101-02", "Apto 101", a=(200, 100, 300, 200))]
        rm, dm, _ = modulacao.plano_da_modulacao(ambs, FOLHAS, PT)
        rp, dp, _ = modulacao.plano_da_modulacao(ambs, FOLHAS, PT, sigla="PP")
        ri, di, _ = modulacao.plano_da_modulacao(ambs, FOLHAS, PT, sigla="I")
        pag = modulacao.detalhes_dos_ambientes(rp, dp, {"PP_Apto_101": b"PISO"}, titulo="Paginação de piso", fichas=["EXE-PVS-024"])
        imp = modulacao.detalhes_dos_ambientes(ri, di, {"I_Apto_101": b"IMP"}, titulo="Impermeabilização")
        detalhes = {"A": modulacao.detalhes_dos_ambientes(rm, dm, {"M_Apto_101": b"MOD"}),
                    "A_projetos": {n: [pag[n], imp[n]] for n in pag}}
        ids = {(p["tipo"], p["nome"]): f"id-{p['nome']}" for p in fm["pecas"]}
        man, binario, rel = publicar_planta.montar_trecho(fm, detalhes, ids, {"planta_id": "p", "trecho": "Ambientes"})
        m, pedacos = pacote.ler(man, binario)
        e = m["elementos"]["id-101-02"]
        self.assertEqual((e["detalhe"], e["projetos"]), ("M_Apto_101", ["PP_Apto_101", "I_Apto_101"]))
        self.assertNotIn("projetos", m["elementos"]["id-AC-01"])  # sem recorte, sem a chave
        self.assertEqual(m["detalhes"]["PP_Apto_101"], {"titulo": "Paginação de piso · Apto 101", "prancha": A, "aco": False,
                                                        "fichas": ["EXE-PVS-024"]})
        self.assertNotIn("fichas", m["detalhes"]["I_Apto_101"])  # sem lista: aparece em todas as fichas
        self.assertNotIn("fichas", m["detalhes"]["M_Apto_101"])
        self.assertEqual((pedacos["d:PP_Apto_101"], pedacos["d:I_Apto_101"]), (b"PISO", b"IMP"))
        self.assertEqual(sorted(m["detalhes"]), ["I_Apto_101", "M_Apto_101", "PP_Apto_101"])  # um de cada, não um por cômodo
        self.assertEqual(rel["sem_detalhe"], [])

    def test_pacote_confere_os_projetos(self):
        cab = {"planta_id": "p", "trecho": "T", "prancha": "X-R00", "revisao": "R00", "largura": 10, "altura": 10, "tile": 512, "niveis": [0]}
        el = {"tipo": "A", "nome": "101-01", "secao": "", "rotulo": [0, 0, 1, 1], "polys": [], "projetos": ["PP_1"]}
        det = {"PP_1": {"titulo": "Paginação", "prancha": "X", "img": b"I", "aco": None, "fichas": ["EXE-PVS-024"]}}
        man, binario = pacote.montar(cab, {}, {"e1": el}, det)
        self.assertEqual(pacote.ler(man, binario)[0]["elementos"]["e1"]["projetos"], ["PP_1"])
        with self.assertRaises(pacote.ErroPacote):  # projeto que não está no pacote
            pacote.montar(cab, {}, {"e1": dict(el, projetos=["PP_2"])}, det)
        with self.assertRaises(pacote.ErroPacote):  # só ambiente
            pacote.montar(cab, {}, {"e1": dict(el, tipo="P")}, det)
        with self.assertRaises(pacote.ErroPacote):  # repetido
            pacote.montar(cab, {}, {"e1": dict(el, projetos=["PP_1", "PP_1"])}, det)
        with self.assertRaises(pacote.ErroPacote):  # fichas tem que ser lista de códigos
            pacote.montar(cab, {}, {"e1": el}, {"PP_1": dict(det["PP_1"], fichas="EXE-PVS-024")})


class TestNotaLocal(unittest.TestCase):
    def setUp(self):
        try:
            import numpy  # noqa: F401
            import PIL  # noqa: F401
            import shapely  # noqa: F401
        except ImportError:
            self.skipTest("sem numpy, pillow ou shapely")

    def test_parte_das_paredes_em_cima_da_hachura(self):
        import numpy as np
        from shapely.geometry import box

        # prancha de 100 x 100 pixels (k = 1 pixel por ponto, 10 pontos por metro); hachura só na metade esquerda
        img = np.zeros((100, 100), dtype=np.float32)
        img[:, :50] = 1
        t = {"pt_por_m": 10.0, "x0": 0.0, "y1": 10.0, "dx_pt": 0.0, "dy_pt": 0.0}
        self.assertAlmostEqual(modulacao.nota_local(img, 1.0, t, box(1, 1, 3, 9)), 1.0, places=1)  # parede à esquerda
        self.assertAlmostEqual(modulacao.nota_local(img, 1.0, t, box(7, 1, 9, 9)), 0.0, places=1)  # à direita
        meio = modulacao.nota_local(img, 1.0, t, box(3, 1, 7, 9))
        self.assertTrue(0.4 < meio < 0.6, meio)
        # fora da folha conta como sem hachura
        self.assertAlmostEqual(modulacao.nota_local(img, 1.0, t, box(-4, 1, -2, 9)), 0.0, places=1)
        self.assertIsNone(modulacao.nota_local(img, 1.0, t, box(1, 1, 3, 9).intersection(box(5, 5, 6, 6))))

    def test_com_para_pt_girado(self):
        import numpy as np
        from shapely.geometry import box

        # o mesmo, com o modelo girado 90° na prancha: o eixo x do modelo vira o y da folha
        img = np.zeros((100, 100), dtype=np.float32)
        img[:50, :] = 1  # desenho só na metade de cima
        para_pt = lambda x, y: (y * 10.0, x * 10.0)  # noqa: E731
        self.assertAlmostEqual(modulacao.nota_local(img, 1.0, None, box(1, 1, 3, 9), para_pt=para_pt), 1.0, places=1)
        self.assertAlmostEqual(modulacao.nota_local(img, 1.0, None, box(7, 1, 9, 9), para_pt=para_pt), 0.0, places=1)


class TestAptosPorPrancha(unittest.TestCase):
    def test_unidade(self):
        self.assertEqual(modulacao._unidade("Apto 602"), "602")
        self.assertEqual(modulacao._unidade("602"), "602")
        self.assertEqual(modulacao._unidade(" apto 1203 "), "1203")
        self.assertEqual(modulacao._unidade("AC-03"), "AC-03")

    def test_formato_conferido(self):
        self.assertEqual(modulacao.aptos_por_prancha({}), {})
        ok = {".053.": ["602", "603"]}
        self.assertEqual(modulacao.aptos_por_prancha({"aptos_por_prancha": ok}), ok)
        for errado in (["602"], {".053.": []}, {".053.": "602"}, {".053.": [""]}, {"": ["602"]}):
            with self.assertRaises(modulacao.ErroModulacao):
                modulacao.aptos_por_prancha({"aptos_por_prancha": errado})


class TestGiro(unittest.TestCase):
    def test_de_volta_do_giro_igual_ao_rot90(self):
        try:
            import numpy as np
        except ImportError:
            self.skipTest("sem numpy")
        orig = np.arange(12).reshape(3, 4)  # 3 linhas, 4 colunas
        for giro in (0, 90, 180, 270):
            girada = np.rot90(orig, giro // 90)
            for yr in range(girada.shape[0]):
                for xr in range(girada.shape[1]):
                    # centro do pixel girado -> centro do pixel original
                    x, y = modulacao._de_volta_do_giro(xr + 0.5, yr + 0.5, giro, 4.0, 3.0)
                    self.assertEqual(girada[yr, xr], orig[int(y), int(x)], (giro, xr, yr))


class TestEncaixeEntrePranchas(unittest.TestCase):
    """Planta "de arquitetura" em 1:200 e a "paginação" em 1:50, girada de 90°, desenhadas com pymupdf."""

    def setUp(self):
        try:
            import numpy  # noqa: F401
            import pymupdf  # noqa: F401
        except ImportError:
            self.skipTest("sem numpy ou pymupdf")

    def test_acha_escala_giro_e_lugar(self):
        import random

        import pymupdf as fitz

        rnd = random.Random(7)
        retangulos = []
        for _ in range(40):
            x, y = rnd.uniform(60, 500), rnd.uniform(60, 300)
            retangulos.append((x, y, x + rnd.uniform(6, 40), y + rnd.uniform(6, 40)))
        doc = fitz.open()
        base = doc.new_page(width=600, height=400)
        for r in retangulos:
            base.draw_rect(fitz.Rect(*r), color=(0, 0, 0), fill=(0, 0, 0))

        # na outra: 4 vezes maior, girada (x' = 4y + 100, y' = 2400 - 4x + 50) e com um carimbo à parte
        def outra_pt(x, y):
            return 4 * y + 100, 2400 - 4 * x + 50

        outra = doc.new_page(width=1900, height=2600)
        for x0, y0, x1, y1 in retangulos:
            a, b = outra_pt(x0, y0), outra_pt(x1, y1)
            outra.draw_rect(fitz.Rect(min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])),
                            color=(0, 0, 0), fill=(0, 0, 0))
        outra.draw_rect(fitz.Rect(1500, 2200, 1850, 2550), color=(0, 0, 0), width=6)
        enc = modulacao.encaixe_entre_pranchas(doc[0], 200, doc[1], 50, giros=(0, 90, 180, 270))
        self.assertGreater(enc["destaque"], modulacao.DESTAQUE_MINIMO)
        for x, y in ((100, 100), (450, 300), (300, 80)):
            ex, ey = outra_pt(x, y)
            gx, gy = enc["para_outra"](x, y)
            self.assertLess(abs(gx - ex), 24, (x, y, gx, ex))  # 24 pt na 1:50 = 0,4 m
            self.assertLess(abs(gy - ey), 24, (x, y, gy, ey))


if __name__ == "__main__":
    unittest.main()

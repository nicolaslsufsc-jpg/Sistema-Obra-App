"""Testes do leitor de formas (pipeline/fvs/estrutura.py) com geometria montada à mão, sem PDF.
Precisam de pymupdf, numpy, pillow e scipy (os mesmos do leitor); sem eles, são pulados."""

from __future__ import annotations

import math
import pathlib
import sys
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))

try:
    import pymupdf as fitz
    import estrutura
except ImportError:  # no GitHub os testes do PC rodam só com a biblioteca padrão
    estrutura = None


def R(x0, y0, x1, y1):
    return fitz.Rect(x0, y0, x1, y1)


@unittest.skipUnless(estrutura, "sem pymupdf/numpy/scipy")
class TestLeitorDeFormas(unittest.TestCase):
    def test_painel_de_laje_nao_e_viga(self):
        anns = [
            ("V40", R(100, 100, 120, 110)), ("h=12+5", R(100, 111, 125, 118)),   # painel: h= encostado embaixo
            ("V 4", R(300, 100, 315, 108)), ("a: 70/50", R(320, 100, 350, 108)),  # viga: seção ao lado
            ("L7", R(500, 100, 512, 110)), ("h=20", R(500, 111, 520, 118)),      # laje comum: não é viga
            ("V 9", R(540, 100, 555, 108)),                                       # viga perto do h= da laje
        ]
        self.assertEqual(estrutura.rotulos_de_painel(anns), {0})

    def test_viga_larga_so_entra_com_o_limite_maior(self):
        # faces horizontais em y=100 e y=140 (40 pontos = viga de 70 cm em 1:50), de x=0 a x=300
        hs = [(100.0, 0, 300), (140.0, 0, 300)]
        nome = R(140, 86, 160, 96)
        self.assertIsNone(estrutura.faixa_reta(nome, True, hs, [], estrutura.LARGURA_NORMAL))
        fx = estrutura.faixa_reta(nome, True, hs, [], estrutura.LARGURA_LARGA)
        self.assertEqual((fx.x0, fx.y0, fx.x1, fx.y1), (0, 100, 300, 140))

    def test_viga_reta_normal_igual_ao_leitor_da_obra(self):
        hs = [(100.0, 0, 300), (112.0, 0, 300)]
        nome = R(140, 86, 160, 96)
        fx = estrutura.faixa_reta(nome, True, hs, [])
        antigo = estrutura.legado.faixa_da_viga(nome, True, hs, [])
        self.assertEqual(tuple(fx), tuple(antigo))

    def test_viga_inclinada(self):
        # viga de 12 pontos de largura e 200 de comprimento, a 30 graus, passando perto de (500, 500)
        th = math.radians(30)
        c, s = math.cos(th), math.sin(th)
        def ponto(x, y):  # do eixo da viga para a folha
            return (500 + x * c - y * s, 500 + x * s + y * c)
        segs = [(*ponto(-100, 4), *ponto(100, 4)), (*ponto(-100, 16), *ponto(100, 16))]
        nome = R(492, 494, 508, 506)  # o nome fica logo acima da viga
        p = estrutura.faixa_inclinada(nome, segs)
        self.assertIsNotNone(p)
        lados = sorted(math.dist(p[i], p[(i + 1) % 4]) for i in range(4))
        self.assertAlmostEqual(lados[0], 12, delta=0.3)
        self.assertAlmostEqual(lados[3], 200, delta=0.6)
        ang = math.degrees(math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0])) % 180
        self.assertAlmostEqual(ang, 30, delta=0.5)

    def test_sem_face_por_perto_nao_inventa_contorno(self):
        segs = [(0, 0, 100, 60), (0, 12, 100, 72)]
        self.assertIsNone(estrutura.faixa_inclinada(R(900, 900, 920, 910), segs))


if __name__ == "__main__":
    unittest.main()

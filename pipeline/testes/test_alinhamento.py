"""Módulo de alinhamento (pipeline/alinhamento): a prancha de armação de uma obra fictícia EXE encaixada na
folha de forma pelos pilares, e os casos que têm de virar conflito (nada de encaixe silencioso)."""

from __future__ import annotations

import json
import pathlib
import random
import sys
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline"))

from alinhamento import alinhar as al  # noqa: E402
from alinhamento import relatorio  # noqa: E402

TAMANHOS = [(10.8, 34.0), (10.8, 45.4), (14.2, 34.0), (11.3, 56.7), (34.0, 10.8), (19.8, 19.8)]


def folha_exe(n=60, semente=3):
    """Pilares da folha de forma da obra EXE: lugar e tamanho sorteados, em pontos de uma folha 1:50."""
    r = random.Random(semente)
    return [al.Ponto(r.uniform(50, 1950), r.uniform(50, 1350), w=w, h=h) for w, h in (r.choice(TAMANHOS) for _ in range(n))]


def prancha_de(folha, janela, s=1.0, dx=0.0, dy=0.0, girar=False, ruido=0.0, semente=5):
    """A prancha de armação mostra os pilares de uma janela da folha, noutra escala e noutro lugar.
    Devolve os pontos na prancha (o inverso do encaixe que o teste espera achar)."""
    r = random.Random(semente)
    x0, y0, x1, y1 = janela
    saida = []
    for p in folha:
        if not (x0 <= p.x <= x1 and y0 <= p.y <= y1):
            continue
        x, y = (p.x - dx) / s, (p.y - dy) / s
        w, h = p.w / s, p.h / s
        if girar:  # a prancha girada 90 graus: x da folha = -y da prancha
            x, y, w, h = y, -x, h, w
        saida.append(al.Ponto(x + r.uniform(-ruido, ruido), y + r.uniform(-ruido, ruido), w=w, h=h))
    return saida


def erro_do_encaixe(res, folha, prancha_pts, janela):
    """Maior distância entre onde o encaixe põe cada pilar da prancha e o pilar da folha."""
    dentro = [p for p in folha if janela[0] <= p.x <= janela[2] and janela[1] <= p.y <= janela[3]]
    pior = 0.0
    for o, d in zip(prancha_pts, dentro):
        x, y = al.transformar(res.transformacao, o.x, o.y)
        pior = max(pior, abs(x - d.x), abs(y - d.y))
    return pior


class TestEncaixe(unittest.TestCase):
    def test_prancha_em_outra_escala_e_noutro_lugar(self):
        folha = folha_exe()
        janela = (40, 40, 1100, 1360)
        pts = prancha_de(folha, janela, s=0.972, dx=-310.0, dy=125.0, ruido=0.6)
        res = al.alinhar(pts, folha)
        self.assertTrue(res.ok, res.motivo)
        self.assertEqual(res.pontos, len(pts))
        self.assertAlmostEqual(res.escala, 0.972, places=3)
        self.assertLess(erro_do_encaixe(res, folha, pts, janela), 1.5)
        self.assertLessEqual(res.como_dict()["residuo_max_cm"], al.TOLERANCIA_CM)

    def test_prancha_girada(self):
        folha = folha_exe()
        janela = (900, 40, 1960, 1360)
        pts = prancha_de(folha, janela, dx=400, dy=-80, girar=True)
        res = al.alinhar(pts, folha)
        self.assertTrue(res.ok, res.motivo)
        self.assertEqual([abs(v) for v in res.transformacao["matriz"]], [0, 1, 1, 0])
        self.assertLess(erro_do_encaixe(res, folha, pts, janela), 1.0)

    def test_pilar_a_mais_na_prancha_vai_para_nao_bateram(self):
        folha = folha_exe()
        janela = (40, 40, 1100, 1360)
        pts = prancha_de(folha, janela, dx=-50, dy=30) + [al.Ponto(-500, -500, w=10.8, h=34.0)]
        res = al.alinhar(pts, folha)
        self.assertTrue(res.ok, res.motivo)
        self.assertEqual(res.nao_bateram, ["(-500, -500)"])

    def test_com_nome_so_junta_o_mesmo_nome(self):
        folha = [al.Ponto(100 * i + 7 * (i % 3), 50 * (i % 4) + 3 * i, nome=f"P{i}") for i in range(1, 9)]
        pts = [al.Ponto(p.x - 20, p.y + 10, nome=p.nome) for p in folha]
        res = al.alinhar(pts, folha)
        self.assertTrue(res.ok, res.motivo)
        self.assertEqual(res.transformacao["t"], [20.0, -10.0])


class TestConflitos(unittest.TestCase):
    def test_poucos_pilares(self):
        folha = folha_exe()
        pts = prancha_de(folha, (40, 40, 1100, 1360))[:3]
        res = al.alinhar(pts, folha)
        self.assertFalse(res.ok)
        self.assertIn("poucos pontos", res.motivo)

    def test_pilares_concentrados(self):
        folha = folha_exe(n=300, semente=8)
        pts = prancha_de(folha, (40, 40, 1100, 1360))
        perto = [p for p in pts if p.x < 200 and p.y < 300]
        longe = [p for p in pts if p.x > 950 and p.y > 1200][:1]  # a prancha é grande, mas só um canto bate
        self.assertGreaterEqual(len(perto), 4)
        res = al.alinhar(perto + [al.Ponto(q.x + 3000, q.y, w=q.w, h=q.h) for q in longe], folha)
        self.assertFalse(res.ok)
        self.assertIn("concentrados", res.motivo)

    def test_grade_repetida_tem_duas_solucoes(self):
        # pilares iguais numa grade regular: a prancha cabe em vários lugares; não escolhe sozinho
        folha = [al.Ponto(100 * i, 100 * j, w=11, h=34) for i in range(8) for j in range(6)]
        pts = [al.Ponto(100 * i + 3, 100 * j + 5, w=11, h=34) for i in range(3) for j in range(3)]
        res = al.alinhar(pts, folha)
        self.assertFalse(res.ok)
        self.assertIn("duas soluções parecidas", res.motivo)
        self.assertIsNotNone(res.transformacao)  # o encaixe sugerido vai para o relatório

    def test_escala_errada(self):
        folha = folha_exe()
        pts = prancha_de(folha, (40, 40, 1100, 1360), s=1.06, dx=10, dy=10)
        res = al.alinhar(pts, folha)
        self.assertFalse(res.ok)

    def test_prancha_de_outro_pavimento(self):
        res = al.alinhar(prancha_de(folha_exe(semente=99), (40, 40, 1100, 1360)), folha_exe())
        self.assertFalse(res.ok)


class TestManualERelatorio(unittest.TestCase):
    def test_encaixe_a_mao_vale_e_mede_o_erro(self):
        folha = folha_exe()
        janela = (40, 40, 1100, 1360)
        pts = prancha_de(folha, janela, dx=-50, dy=30)
        res = al.manual({"matriz": [1, 0, 0, 1], "t": [-50, 30]}, pts, folha)
        self.assertTrue(res.ok and res.manual)
        self.assertEqual(res.pontos, len(pts))
        self.assertLess(res.residuo_max, 0.01)

    def test_relatorio_json_e_csv(self):
        res = al.alinhar([al.Ponto(1, 1)], folha_exe())
        linha = relatorio.linha("EXE.ES.LO.466.LAJ2PAVTOX-R00", "longitudinal_inferior", res.como_dict())
        with tempfile.TemporaryDirectory() as d:
            j, c = relatorio.gravar(pathlib.Path(d), [linha])
            lido = json.loads(j.read_text(encoding="utf-8"))
            self.assertEqual(lido[0]["camada"], "longitudinal_inferior")
            texto = c.read_text(encoding="utf-8-sig").splitlines()
        self.assertTrue(texto[0].startswith("prancha;camada;motivo"))
        self.assertIn("poucos pontos", texto[1])


if __name__ == "__main__":
    unittest.main()

"""Leitor de planta de forma em PDF (pipeline/demo/forma_pdf.py) com uma prancha fictícia desenhada na hora."""

from __future__ import annotations

import pathlib
import sys
import tempfile
import unittest

import importlib.util as _iu

_FALTA = [m for m in ('pymupdf',) if _iu.find_spec(m) is None]
if _FALTA:  # no GitHub os scripts rodam sem essas bibliotecas
    raise unittest.SkipTest("precisa de " + ", ".join(_FALTA))

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "demo"))

import pymupdf  # noqa: E402

import forma_pdf  # noqa: E402


def prancha(destino: pathlib.Path, giro: int = 0) -> None:
    """Folha 600x400: pilar P1 (camada FO-Pilares) com "20x40" embaixo, viga V1 de duas faces a 5 pt, P2 que nasce."""
    doc = pymupdf.open()
    pg = doc.new_page(width=600, height=400)
    pil = doc.add_ocg("FO-Pilares")
    pg.draw_rect(pymupdf.Rect(100, 100, 110, 120), oc=pil)
    pg.draw_rect(pymupdf.Rect(400, 100, 410, 120), oc=pil)
    pg.insert_text((90, 95), "P1", fontsize=6)
    pg.insert_text((88, 103), "20x40", fontsize=5)
    pg.insert_text((390, 95), "P2(NASCE)", fontsize=6)
    pg.draw_line((110, 105), (400, 105))
    pg.draw_line((110, 110), (400, 110))
    pg.insert_text((200, 102), "V1 14x40", fontsize=5)
    if giro:
        pg.set_rotation(giro)
    doc.save(str(destino))


class TestFormaPdf(unittest.TestCase):
    def ler(self, giro: int = 0, tirar: tuple = ()) -> dict:
        with tempfile.TemporaryDirectory() as d:
            pdf = pathlib.Path(d) / "forma.pdf"
            prancha(pdf, giro)
            return forma_pdf.ler_forma(pdf, tirar=tirar)

    def test_pilar_e_viga(self):
        r = self.ler()
        pecas = {p["nome"]: p for p in r["pecas"]}
        self.assertEqual(set(pecas), {"P1", "P2", "V1"})
        self.assertEqual(pecas["P1"]["secao"], "20x40")
        self.assertEqual(pecas["V1"]["secao"], "14x40")
        xs = [x for x, _ in pecas["P1"]["polys"][0]]
        ys = [y for _, y in pecas["P1"]["polys"][0]]
        self.assertAlmostEqual(min(xs), 100, delta=1)
        self.assertAlmostEqual(max(ys), 120, delta=1)
        vx = [x for x, _ in pecas["V1"]["polys"][0]]
        vy = [y for _, y in pecas["V1"]["polys"][0]]
        self.assertLess(min(vx), 130)
        self.assertGreater(max(vx), 380)
        self.assertAlmostEqual(min(vy), 105, delta=1)
        self.assertAlmostEqual(max(vy), 110, delta=1)
        self.assertEqual((r["largura"], r["altura"]), (600, 400))

    def test_pilar_que_nasce_fica_de_fora(self):
        nomes = {p["nome"] for p in self.ler(tirar=("NASCE",))["pecas"]}
        self.assertNotIn("P2", nomes)
        self.assertIn("P1", nomes)

    def test_pagina_girada_sai_como_aparece(self):
        r = self.ler(giro=90)
        self.assertEqual((r["largura"], r["altura"]), (400, 600))
        p1 = next(p for p in r["pecas"] if p["nome"] == "P1")
        # giro de 90°: (x, y) da folha vira (altura - y, x)
        xs = sorted(x for x, _ in p1["polys"][0])
        ys = sorted(y for _, y in p1["polys"][0])
        self.assertAlmostEqual(xs[0], 400 - 120, delta=1)
        self.assertAlmostEqual(ys[0], 100, delta=1)

    def test_imagem_inteira(self):
        with tempfile.TemporaryDirectory() as d:
            pdf, png = pathlib.Path(d) / "f.pdf", pathlib.Path(d) / "f.png"
            prancha(pdf, 90)
            forma_pdf.imagem(pdf, png, zoom=2)
            from PIL import Image
            with Image.open(png) as im:
                self.assertEqual(im.size, (800, 1200))

    def test_nomes_no_texto(self):
        with tempfile.TemporaryDirectory() as d:
            pdf = pathlib.Path(d) / "f.pdf"
            prancha(pdf)
            self.assertEqual(forma_pdf.nomes_no_texto(pdf, r"P\d+"), ["P1"])


if __name__ == "__main__":
    unittest.main()

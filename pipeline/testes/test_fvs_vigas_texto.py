"""Leitor de detalhes de viga (pipeline/legado/gerador_fvs.detalhes_vigas) com título em texto comum do PDF.
Em algumas pranchas parte dos detalhes não tem o comentário SHX ("V 145", "Escala vigas 1:50"), só o texto.
Prancha fictícia da obra EXE, montada no teste."""

from __future__ import annotations

import pathlib
import sys
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "legado"))

try:
    import gerador_fvs as g  # noqa: E402
except ImportError as e:  # no GitHub os scripts rodam sem numpy
    raise unittest.SkipTest(f"leitor de vigas precisa de {e.name}")

fitz = g.fitz


def detalhe(page, x, y):
    """Contorno de uma viga de 250 x 60, com uma barra dentro."""
    page.draw_rect(fitz.Rect(x, y, x + 250, y + 60), width=0.8)
    page.draw_line(fitz.Point(x + 5, y + 50), fitz.Point(x + 245, y + 50), width=0.8)


def prancha(caminho):
    doc = fitz.open()
    page = doc.new_page(width=900, height=500)
    # V7: título só em texto comum, como os detalhes "apagados" de algumas pranchas da obra piloto
    page.insert_text((50, 78), "V 7", fontsize=8)
    page.insert_text((52, 90), "Escala vigas 1:50", fontsize=8)
    detalhe(page, 50, 110)
    # V8: título como comentário (o caso de sempre)
    for txt, r in (("V 8", fitz.Rect(450, 70, 470, 79)), ("Escala vigas 1:50", fitz.Rect(452, 82, 520, 91))):
        a = page.add_freetext_annot(r, txt, fontsize=6)
        a.set_info(content=txt)
        a.update()
    detalhe(page, 450, 110)
    doc.save(caminho)


class TestVigaComTituloEmTexto(unittest.TestCase):
    def test_acha_os_dois_titulos(self):
        with tempfile.TemporaryDirectory() as d:
            p = str(pathlib.Path(d) / "EXE.ES.LO.900.VIG2PAVTIP-R00.pdf")
            prancha(p)
            det = g.detalhes_vigas([p])
            self.assertEqual(sorted(det), ["V7", "V8"])

    def test_texto_coberto_por_comentario_nao_duplica(self):
        with tempfile.TemporaryDirectory() as d:
            p = str(pathlib.Path(d) / "EXE.ES.LO.901.VIG2PAVTIP-R00.pdf")
            doc = fitz.open()
            page = doc.new_page(width=300, height=200)
            page.insert_text((50, 78), "V 9", fontsize=8)
            a = page.add_freetext_annot(fitz.Rect(48, 68, 70, 80), "V 9", fontsize=6)
            a.set_info(content="V 9")
            a.update()
            page.insert_text((50, 150), "V 10", fontsize=8)
            doc.save(p)
            doc.close()
            with fitz.open(p) as lido:
                page = lido[0]
                soltos = g.textos_soltos(page, g.anotacoes(page))
            self.assertEqual([t for t, _ in soltos], ["V 10"])


if __name__ == "__main__":
    unittest.main()

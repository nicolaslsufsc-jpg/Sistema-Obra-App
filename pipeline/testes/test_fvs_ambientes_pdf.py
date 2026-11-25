"""Ambientes tirados só da prancha PDF (pipeline/fvs/ambientes_pdf.py), para pavimento sem IFC."""

from __future__ import annotations

import pathlib
import sys
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))
sys.path.insert(0, str(RAIZ / "pipeline"))

import ambientes  # noqa: E402
import ambientes_pdf as ap  # noqa: E402

try:
    import pymupdf as fitz
    import scipy  # noqa: F401
    from shapely import wkt
except ImportError:  # sem as bibliotecas da prancha só a parte de texto roda
    fitz = None


class TestTexto(unittest.TestCase):
    def test_area_do_rotulo(self):
        self.assertEqual(ap.area_do_rotulo("A: 18,02m2"), 18.02)
        self.assertEqual(ap.area_do_rotulo("A=131,59 m²"), 131.59)
        self.assertIsNone(ap.area_do_rotulo("12,98 JARDIM"))
        self.assertIsNone(ap.area_do_rotulo("257"))

    def test_nome_do_comodo(self):
        self.assertEqual(ap.nome_do_comodo(["DEPÓSITO", "CONDOMINIAL"]), "Depósito Condominial")
        self.assertEqual(ap.nome_do_comodo(["257", "VESTIÁRIO MASC."]), "Vestiário Masc.")
        self.assertEqual(ap.nome_do_comodo(["SALA DE ESTAR"]), "Sala de Estar")
        self.assertIsNone(ap.nome_do_comodo(["15", "1,25"]))

    def test_rotulos_de_area_pegam_o_nome_de_cima_e_largam_a_cota(self):
        linhas = [
            {"texto": "COPA", "bbox": (100, 90, 120, 98), "tamanho": 7},
            {"texto": "A: 24,44m2", "bbox": (95, 97, 125, 103), "tamanho": 5.8},  # encosta no nome
            {"texto": "615", "bbox": (104, 80, 112, 85), "tamanho": 4.8},  # cota: letra menor
            {"texto": "VESTIÁRIO", "bbox": (300, 80, 330, 88), "tamanho": 7},
            {"texto": "FEM.", "bbox": (305, 89, 320, 97), "tamanho": 7},
            {"texto": "A: 25,69m2", "bbox": (298, 98, 328, 104), "tamanho": 5.8},
        ]
        r = ap.rotulos_de_area(linhas)
        self.assertEqual([(x["nome"], x["area"]) for x in r], [("Copa", 24.44), ("Vestiário Fem.", 25.69)])


def prancha_de_teste(caminho: str, com_tracos: bool = False, traco_no_meio: bool = False,
                     parede_escondida: bool = False, rotulo_fora: bool = False) -> None:
    """Duas salas de 4 × 3 m lado a lado, parede de 15 cm com porta de 90 cm, na escala 1:200, mais uma
    área externa sem rótulo. com_tracos: paredes em duas linhas pretas (sem hachura)."""
    ppm = ap.pt_por_m(200)
    doc = fitz.open()
    page = doc.new_page(width=400, height=300)
    o, e = 40.0, 0.15 * ppm  # origem e espessura

    def m(v):
        return o + v * ppm

    paredes = [  # (x0, y0, x1, y1) em metros
        (0, 0, 8.15, 0.15), (0, 3.15, 8.15, 3.30), (0, 0, 0.15, 3.30), (8.0, 0, 8.15, 3.30),
        (4.0, 0.15, 4.15, 1.0), (4.0, 1.9, 4.15, 3.15),  # parede do meio com a porta (1,0 a 1,9 m)
    ]
    for x0, y0, x1, y1 in paredes:
        r = fitz.Rect(m(x0), m(y0), m(x1), m(y1))
        if com_tracos:
            page.draw_rect(r, color=(0, 0, 0), width=0.5)
        else:
            page.draw_rect(r, color=None, fill=(0.5, 0.5, 0.5), width=0)
    if parede_escondida:  # parede de outro pavimento atravessando a sala, coberta por um branco opaco
        page.draw_rect(fitz.Rect(m(0.15), m(2.2), m(4.0), m(2.5)), color=None, fill=(0.5, 0.5, 0.5), width=0)
        page.draw_rect(fitz.Rect(m(0.15), m(2.0), m(4.0), m(2.7)), color=None, fill=(1, 1, 1), width=0)
    if rotulo_fora:  # rótulo na calçada, fora do prédio: o espaço dele é a folha inteira
        page.insert_text((m(2.0), m(4.5)), "A: 5,00m2", fontsize=5.8)
    if traco_no_meio:  # linha de desnível atravessando a sala (traço fino, não parede)
        page.draw_line(fitz.Point(m(0.15), m(2.3)), fitz.Point(m(4.0), m(2.3)), color=(0, 0, 0), width=0.28)
    page.insert_text((m(1.5), m(1.0)), "SALA", fontsize=7)
    page.insert_text((m(1.3), m(1.6)), "A: 11,48m2", fontsize=5.8)
    page.insert_text((m(5.3), m(0.8)), "COPA DE", fontsize=7)
    page.insert_text((m(5.3), m(1.4)), "APOIO", fontsize=7)
    page.insert_text((m(5.3), m(2.0)), "A: 11,48m2", fontsize=5.8)
    page.insert_text((m(5.3), m(2.7)), "385", fontsize=4.8)  # cota solta dentro da sala
    doc.save(caminho)


@unittest.skipIf(fitz is None, "sem pymupdf, scipy ou shapely")
class TestPrancha(unittest.TestCase):
    def ler(self, com_tracos=False, traco_no_meio=False, **extra):
        with tempfile.TemporaryDirectory() as tmp:
            pdf = str(pathlib.Path(tmp) / "x.pdf")
            prancha_de_teste(pdf, com_tracos, traco_no_meio, **extra)
            return ap.extrair_do_pdf(fitz.open(pdf)[0], 200)

    def test_porta_fechada_separa_as_duas_salas_com_nome_e_area(self):
        d = self.ler()
        self.assertEqual(d["comodos"], ["Sala", "Copa de Apoio"])
        for a in d["ambientes"]:
            self.assertAlmostEqual(wkt.loads(a).area, 3.85 * 3.0, delta=0.8)
        self.assertEqual(d["areas_da_prancha"], [11.48, 11.48])
        self.assertEqual(d["avisos"], [])
        self.assertEqual(d["portas"], [])

    def test_parede_em_duas_linhas_sem_hachura(self):
        d = self.ler(com_tracos=True)
        self.assertEqual(d["comodos"], ["Sala", "Copa de Apoio"])
        for a in d["ambientes"]:
            self.assertAlmostEqual(wkt.loads(a).area, 11.5, delta=1.2)

    def test_sala_partida_por_traco_fino_volta_inteira(self):
        d = self.ler(traco_no_meio=True)
        self.assertEqual(d["comodos"], ["Sala", "Copa de Apoio"])
        self.assertAlmostEqual(wkt.loads(d["ambientes"][0]).area, 11.5, delta=0.8)
        self.assertTrue(any(a.startswith("Sala: juntei") for a in d["avisos"]))

    def test_vao_largo_vira_parede_virtual(self):
        guarda = ap.FECHA_VAO_M
        ap.FECHA_VAO_M = 0.3  # fecha só vão de 60 cm: a porta de 90 cm fica aberta, como uma vitrine
        try:
            d = self.ler()
        finally:
            ap.FECHA_VAO_M = guarda
        self.assertEqual(d["comodos"], ["Sala", "Copa de Apoio"])
        for a in d["ambientes"]:
            self.assertAlmostEqual(wkt.loads(a).area, 11.5, delta=1.2)
        self.assertTrue(any("parede virtual" in a for a in d["avisos"]))

    def test_sem_parede_virtual_junta_e_avisa(self):
        guarda = ap.FECHA_VAO_M, ap.RAIOS_VIRTUAIS_M
        ap.FECHA_VAO_M, ap.RAIOS_VIRTUAIS_M = 0.3, ()
        try:
            d = self.ler()
        finally:
            ap.FECHA_VAO_M, ap.RAIOS_VIRTUAIS_M = guarda
        self.assertEqual(d["comodos"], ["Sala + Copa de Apoio"])
        self.assertTrue(any("2 rótulos no mesmo espaço" in a for a in d["avisos"]))

    def test_parede_escondida_por_branco_opaco_nao_parte_a_sala(self):
        d = self.ler(parede_escondida=True)
        self.assertEqual(d["comodos"], ["Sala", "Copa de Apoio"])
        for a in d["ambientes"]:
            self.assertAlmostEqual(wkt.loads(a).area, 11.5, delta=1.2)
        self.assertTrue(any("parede escondida" in a for a in d["avisos"]))

    def test_sem_a_segunda_passada_a_parede_escondida_parte_a_sala(self):
        guarda = ap.USAR_OUTRAS
        ap.USAR_OUTRAS = False
        try:
            d = self.ler(parede_escondida=True)
        finally:
            ap.USAR_OUTRAS = guarda
        self.assertLess(wkt.loads(d["ambientes"][0]).area, 10.0)

    def test_rotulo_fora_do_predio_nao_vira_ambiente(self):
        d = self.ler(rotulo_fora=True)
        self.assertEqual(d["comodos"], ["Sala", "Copa de Apoio"])
        self.assertTrue(any("vaza para fora da planta" in a for a in d["avisos"]))

    def test_base_da_planta_com_fonte_pdf(self):
        with tempfile.TemporaryDirectory() as tmp:
            pdf = str(pathlib.Path(tmp) / "x.pdf")
            prancha_de_teste(pdf)
            b = ambientes.base_da_planta({"fonte": "pdf", "prancha": pdf, "escala": 200})
            b["page"].parent.close()  # no Windows a pasta temporária não sai com o PDF aberto
        self.assertEqual([a["nome"] for a in b["nomeados"]], ["AC-01", "AC-02"])
        self.assertEqual(sorted(b["comodos_do_pdf"].values()), ["Copa de Apoio", "Sala"])
        # a conversão volta exatamente para a prancha
        g = b["ambientes"][0]
        x, y = g.representative_point().coords[0]
        px, py = b["para_prancha"](x, y)
        self.assertTrue(0 < px < 400 and 0 < py < 300)
        vx, vy = b["para_modelo"](px, py)
        self.assertAlmostEqual(vx, x, delta=0.01)
        self.assertAlmostEqual(vy, y, delta=0.01)

    def test_prancha_sem_rotulo_de_area(self):
        with tempfile.TemporaryDirectory() as tmp:
            pdf = str(pathlib.Path(tmp) / "x.pdf")
            doc = fitz.open()
            p = doc.new_page(width=200, height=200)
            p.draw_rect(fitz.Rect(10, 10, 100, 12), color=None, fill=(0, 0, 0))
            doc.save(pdf)
            with self.assertRaises(ap.ErroAmbientesPdf):
                ap.extrair_do_pdf(fitz.open(pdf)[0], 200)


if __name__ == "__main__":
    unittest.main()

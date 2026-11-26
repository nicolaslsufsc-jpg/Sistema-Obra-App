"""Leitor de planta de forma em DXF (pipeline/demo/forma_dxf.py) com uma forma fictícia desenhada na hora."""

from __future__ import annotations

import importlib.util as _iu
import pathlib
import sys
import tempfile
import unittest

_FALTA = [m for m in ("ezdxf", "pymupdf") if _iu.find_spec(m) is None]

if not _FALTA:
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "demo"))
    import ezdxf  # noqa: E402

    import forma_dxf  # noqa: E402

CM = forma_dxf.CM_POR_PONTO_1_50 if not _FALTA else 1.0


def forma(destino: pathlib.Path, unidades: int = 5, giro: float = 0.0) -> None:
    """Forma fictícia em cm: pilares P1 e P2 (hachura), viga V1 horizontal 20x45 entre eles, viga V2 vertical,
    laje L1 com h=12, uma cota que deve ser ignorada. Desenho com y para cima, como no CAD."""
    k = {5: 1.0, 4: 10.0, 6: 0.01}[unidades]
    doc = ezdxf.new("R2013")
    doc.header["$INSUNITS"] = unidades
    msp = doc.modelspace()
    c = forma_dxf.CAMADAS_PADRAO

    def hachura(x0, y0, x1, y1):
        h = msp.add_hatch(dxfattribs={"layer": c["pilar_contorno"]})
        h.paths.add_polyline_path([(x0 * k, y0 * k), (x1 * k, y0 * k), (x1 * k, y1 * k), (x0 * k, y1 * k)], is_closed=True)

    def texto(s, x, y, camada, rot=0):
        msp.add_text(s, height=10 * k, rotation=rot, dxfattribs={"layer": camada}).set_placement((x * k, y * k))

    def linha(a, b, camada="S-_STRL----_A"):
        msp.add_line((a[0] * k, a[1] * k), (b[0] * k, b[1] * k), dxfattribs={"layer": camada})

    hachura(100, 100, 120, 140)
    texto("P1", 85, 150, c["pilar_rotulo"])
    texto("20/40", 85, 162, c["pilar_rotulo"])
    hachura(600, 110, 620, 130)
    texto("P2", 625, 135, c["pilar_rotulo"])
    texto("20/20", 625, 147, c["pilar_rotulo"])
    linha((120, 110), (600, 110))
    linha((120, 130), (600, 130))
    texto("V1", 300, 133, c["viga_rotulo"])
    texto("20/45", 330, 133, c["viga_rotulo"])
    linha((600, 130), (600, 500))
    linha((620, 130), (620, 500))
    texto("V2", 597, 300, c["viga_rotulo"], rot=90)
    linha((120, 130), (120, 500), "A-_FLOR----_E")  # bordas da laje L1 (as outras são V1 e V2)
    linha((120, 500), (600, 500), "A-_FLOR----_E")
    texto("L1", 300, 300, c["laje_rotulo"])
    texto("h=12", 300, 286, c["laje_rotulo"])
    hl = msp.add_hatch(dxfattribs={"layer": "A-_FLOR----_E"})  # L2: laje desenhada como hachura (Revit)
    hl.paths.add_polyline_path([(900 * k, 100 * k), (1100 * k, 100 * k), (1100 * k, 400 * k), (900 * k, 400 * k)], is_closed=True)
    texto("L2", 1000, 250, c["laje_rotulo"])
    texto("h=10", 1000, 236, c["laje_rotulo"])
    linha((100, 600), (500, 600))  # VP1: viga protendida de 100 cm, mais larga que a busca normal
    linha((100, 700), (500, 700))
    texto("VP1", 250, 645, c["viga_rotulo"])
    texto("100/60", 290, 645, c["viga_rotulo"])
    blk = doc.blocks.new("PILAR CIRCULAR 70")  # PD1: pilar circular desenhado como bloco
    blk.add_circle((0, 0), 35 * k)
    msp.add_blockref("PILAR CIRCULAR 70", (300 * k, 900 * k), dxfattribs={"layer": c["pilar_contorno"]})
    texto("PD1", 250, 945, c["pilar_rotulo"])
    texto("Ø70", 250, 933, c["pilar_rotulo"])
    for a, b in (((700, 900), (730, 900)), ((730, 900), (730, 960)), ((730, 960), (700, 960)), ((700, 960), (700, 900))):
        linha(a, b, c["pilar_contorno"])  # P3: pilar só com quatro linhas, sem hachura
    texto("P3", 690, 970, c["pilar_rotulo"])
    texto("30/60", 690, 982, c["pilar_rotulo"])
    msp.add_lwpolyline([(800 * k, 900 * k), (820 * k, 900 * k), (820 * k, 950 * k), (800 * k, 950 * k)], close=True,
                       dxfattribs={"layer": c["pilar_contorno"]})  # P4: polilinha fechada
    texto("P4", 790, 960, c["pilar_rotulo"])
    linha((0, 50), (700, 50), c["ignorar"][0])  # cota: não é face de viga
    if giro:  # prédio girado no desenho (comum em projeto exportado do Revit)
        import math
        for e in msp:
            e.rotate_z(math.radians(giro))
    doc.saveas(str(destino))


@unittest.skipIf(bool(_FALTA), "precisa de " + ", ".join(_FALTA))
class TestFormaDxf(unittest.TestCase):
    def ler(self, unidades: int = 5) -> dict:
        with tempfile.TemporaryDirectory() as d:
            arq = pathlib.Path(d) / "forma.dxf"
            forma(arq, unidades)
            return forma_dxf.ler_forma(arq)

    def pecas(self, r: dict) -> dict:
        return {p["nome"]: p for p in r["pecas"]}

    def test_pilares_com_contorno_e_secao(self):
        r = self.ler()
        p = self.pecas(r)
        self.assertEqual(p["P1"]["secao"], "20x40")
        self.assertEqual(p["P2"]["secao"], "20x20")
        x0, y0, x1, y1 = r["extensao"]
        xs = [x for x, _ in p["P1"]["polys"][0]]
        ys = [y for _, y in p["P1"]["polys"][0]]
        # página: origem em cima à esquerda, y para baixo, em pontos da escala 1:50
        self.assertAlmostEqual(min(xs), (100 - x0) / CM, delta=0.5)
        self.assertAlmostEqual(max(xs) - min(xs), 20 / CM, delta=0.5)
        self.assertAlmostEqual(min(ys), (y1 - 140) / CM, delta=0.5)

    def test_vigas_horizontal_e_vertical(self):
        r = self.ler()
        p = self.pecas(r)
        self.assertEqual(p["V1"]["secao"], "20x45")
        xs = [x for x, _ in p["V1"]["polys"][0]]
        ys = [y for _, y in p["V1"]["polys"][0]]
        self.assertAlmostEqual(max(ys) - min(ys), 20 / CM, delta=0.5)
        self.assertGreater(max(xs) - min(xs), 400 / CM)
        xs2 = [x for x, _ in p["V2"]["polys"][0]]
        ys2 = [y for _, y in p["V2"]["polys"][0]]
        self.assertAlmostEqual(max(xs2) - min(xs2), 20 / CM, delta=0.5)
        self.assertGreater(max(ys2) - min(ys2), 300 / CM)
        self.assertEqual(r["sem_contorno"], [])

    def test_pilar_circular_em_bloco(self):
        p = self.pecas(self.ler())["PD1"]
        self.assertEqual(p["secao"], "D70")
        xs = [x for x, _ in p["polys"][0]]
        self.assertAlmostEqual(max(xs) - min(xs), 70 / CM, delta=0.5)
        self.assertGreaterEqual(len(p["polys"][0]), 12)

    def test_pilar_sem_hachura(self):
        p = self.pecas(self.ler())
        self.assertEqual(p["P3"]["secao"], "30x60")
        xs = [x for x, _ in p["P3"]["polys"][0]]
        ys = [y for _, y in p["P3"]["polys"][0]]
        self.assertAlmostEqual(max(xs) - min(xs), 30 / CM, delta=0.5)
        self.assertAlmostEqual(max(ys) - min(ys), 60 / CM, delta=0.5)
        self.assertEqual(len(p["P4"]["polys"][0]), 4)

    def test_lacos(self):
        quadrado = [((0, 0), (1, 0)), ((1, 0), (1, 1)), ((1, 1), (0, 1)), ((0, 1), (0, 0)), ((5, 5), (6, 6))]
        self.assertEqual([len(l) for l in forma_dxf._lacos(quadrado)], [4])

    def test_viga_larga_pela_secao_do_rotulo(self):
        p = self.pecas(self.ler())["VP1"]
        self.assertEqual(p["secao"], "100x60")
        ys = [y for _, y in p["polys"][0]]
        self.assertAlmostEqual(max(ys) - min(ys), 100 / CM, delta=0.5)

    def test_largura_da_busca(self):
        self.assertEqual(forma_dxf.largura_da_busca(""), forma_dxf.estrutura.LARGURA_NORMAL)
        self.assertEqual(forma_dxf.largura_da_busca("20x45"), forma_dxf.estrutura.LARGURA_NORMAL)
        self.assertGreater(forma_dxf.largura_da_busca("120x60"), 120 / CM)
        self.assertEqual(forma_dxf.largura_da_busca("900x20"), forma_dxf.largura_da_busca("150x20"))

    def test_laje_rotulo_e_espessura(self):
        r = self.ler()
        self.assertEqual([(l["nome"], l["secao"]) for l in r["lajes"]], [("L1", "h12"), ("L2", "h10")])
        self.assertNotIn("L1", self.pecas(r))

    @unittest.skipIf(_iu.find_spec("shapely") is None, "precisa de shapely")
    def test_contorno_da_laje(self):
        laje = self.ler()["lajes"][0]
        xs = [x for x, _ in laje["polys"][0]]
        ys = [y for _, y in laje["polys"][0]]
        # entre as bordas (x 120, y 500), a face de dentro da V1 (y 130) e a da V2 (x 600)
        self.assertAlmostEqual(max(xs) - min(xs), 480 / CM, delta=0.6)
        self.assertAlmostEqual(max(ys) - min(ys), 370 / CM, delta=0.6)

    @unittest.skipIf(_iu.find_spec("shapely") is None, "precisa de shapely")
    def test_contorno_da_laje_em_hachura(self):
        laje = self.ler()["lajes"][1]
        xs = [x for x, _ in laje["polys"][0]]
        ys = [y for _, y in laje["polys"][0]]
        self.assertEqual(laje["nome"], "L2")
        self.assertAlmostEqual(max(xs) - min(xs), 200 / CM, delta=0.5)
        self.assertAlmostEqual(max(ys) - min(ys), 300 / CM, delta=0.5)

    def test_unidades_mm_e_m_dao_o_mesmo(self):
        cm = self.ler(5)
        for u in (4, 6):
            r = self.ler(u)
            self.assertEqual((r["largura"], r["altura"]), (cm["largura"], cm["altura"]))
            self.assertEqual(sorted(self.pecas(r)), sorted(self.pecas(cm)))

    def test_desenho_girado(self):
        with tempfile.TemporaryDirectory() as d:
            arq = pathlib.Path(d) / "forma.dxf"
            forma(arq, giro=21)
            r = forma_dxf.ler_forma(arq)
        p = self.pecas(r)
        self.assertEqual({"P1", "P2", "P3", "P4", "PD1", "V1", "V2", "VP1"}, set(p))
        import math
        (a, b, c_, _d) = p["V1"]["polys"][0]
        largura = math.hypot(c_[0] - b[0], c_[1] - b[1])
        comprimento = math.hypot(b[0] - a[0], b[1] - a[1])
        self.assertAlmostEqual(min(largura, comprimento), 20 / CM, delta=0.6)
        self.assertGreater(max(largura, comprimento), 400 / CM)

    def test_na_folha_plotada(self):
        r = self.ler()
        x0, y0, x1, y1 = r["extensao"]
        # folha 2x mais larga que o desenho: o desenho fica centrado na largura, ocupando a altura toda
        alt = 1000.0
        larg = 2 * alt * (x1 - x0) / (y1 - y0)
        f = forma_dxf.na_folha(r, (x0, y0, x1, y1), larg, alt)
        self.assertEqual((f["largura"], f["altura"]), (round(larg), round(alt)))
        s = alt / (y1 - y0)
        p1 = self.pecas(f)["P1"]["polys"][0]
        self.assertAlmostEqual(min(x for x, _ in p1), larg / 4 + s * (100 - x0), delta=0.5)
        self.assertAlmostEqual(min(y for _, y in p1), s * (y1 - 140), delta=0.5)
        self.assertEqual(f["lajes"][0]["nome"], "L1")
        if "polys" in f["lajes"][1]:  # com shapely, o contorno da laje também vai para a folha
            self.assertAlmostEqual(min(x for x, _ in f["lajes"][1]["polys"][0]), larg / 4 + s * (900 - x0), delta=0.5)
        self.assertEqual(r["pecas"][0]["polys"], self.ler()["pecas"][0]["polys"])  # o original não muda

    def test_camada_trocada_pelo_pacote(self):
        with tempfile.TemporaryDirectory() as d:
            arq = pathlib.Path(d) / "forma.dxf"
            forma(arq)
            r = forma_dxf.ler_forma(arq, {"pilar_contorno": "OUTRA"})
        self.assertEqual({p["nome"] for p in r["pecas"]}, {"V1", "V2", "VP1"})
        self.assertIn("P1", r["sem_contorno"])


if __name__ == "__main__":
    unittest.main()

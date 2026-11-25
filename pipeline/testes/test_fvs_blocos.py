"""Planta de blocos de fundação (pipeline/fvs/blocos.py, 23/11/2026): cada bloco da locação é um local "K" com o
nome do pilar que carrega. Geometria fictícia da obra EXE (pontos do PDF, 1:50)."""

from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))

import blocos  # noqa: E402

# a forma de referência: P1 a P6 numa grade de 300 pontos, P6 maior
FORMA = [("P1", 100.0, 100.0, 14.2, 39.7), ("P2", 400.0, 100.0, 14.2, 39.7), ("P3", 700.0, 100.0, 14.2, 39.7),
         ("P4", 100.0, 400.0, 14.2, 39.7), ("P5", 400.0, 400.0, 14.2, 39.7), ("P6", 700.0, 400.0, 22.7, 22.7)]


def locacao(dx: float, dy: float, ruido: float = 0.0):
    """Os pilares da forma como a locação os desenha: deslocados de (-dx, -dy), com um pouco de erro."""
    return [(x - dx + ruido * (i % 2), y - dy - ruido * (i % 3 == 0), w, h) for i, (_, x, y, w, h) in enumerate(FORMA)]


class TestEncaixe(unittest.TestCase):
    def test_acha_o_deslocamento_pelos_pilares(self):
        dx, dy, n = blocos.encaixe_por_pilares(locacao(-335.2, 147.8), FORMA)
        self.assertAlmostEqual(dx, -335.2, places=1)
        self.assertAlmostEqual(dy, 147.8, places=1)
        self.assertEqual(n, 6)

    def test_erro_pequeno_entra_na_media(self):
        dx, dy, n = blocos.encaixe_por_pilares(locacao(50, 60, ruido=0.6), FORMA)
        self.assertEqual(n, 6)
        self.assertLess(abs(dx - 50), 0.6)
        self.assertLess(abs(dy - 60), 0.6)

    def test_pilar_que_so_esta_na_locacao_nao_atrapalha(self):
        extras = [(5000.0, 5000.0, 14.2, 39.7), (5300.0, 5000.0, 14.2, 39.7)]
        dx, dy, n = blocos.encaixe_por_pilares(locacao(10, 20) + extras, FORMA)
        self.assertEqual((round(dx), round(dy), n), (10, 20, 6))

    def test_sem_pilar_do_mesmo_tamanho_nao_encaixa(self):
        self.assertIsNone(blocos.encaixe_por_pilares([(0.0, 0.0, 80.0, 80.0)], FORMA))


class TestNome(unittest.TestCase):
    def test_nome_do_pilar_por_cima(self):
        self.assertEqual(blocos.nome_do_pilar(110, 120, FORMA, -10, -20), "P1")
        self.assertEqual(blocos.nome_do_pilar(712, 422, FORMA, -10, -20), "P6")
        # longe de qualquer pilar da forma: sem nome
        self.assertIsNone(blocos.nome_do_pilar(260, 260, FORMA, -10, -20))
        self.assertIsNone(blocos.nome_do_pilar(0, 0, [], 0, 0))

    def test_nome_do_bloco_como_no_concreto(self):
        self.assertEqual(blocos.nome_do_bloco(["P65"]), "BL-P65")
        self.assertEqual(blocos.nome_do_bloco(["P100", "P9", "P9"]), "BL-P9-P100")
        with self.assertRaises(blocos.ErroBlocos):
            blocos.nome_do_bloco([])


class TestRepetidos(unittest.TestCase):
    def test_o_mesmo_bloco_em_duas_pranchas_entra_uma_vez(self):
        lidos = [{"nome": "BL-P10", "centro": (100.0, 100.0), "prancha": "EXE.FU.LO.001"},
                 {"nome": "BL-P2", "centro": (300.0, 100.0), "prancha": "EXE.FU.LO.001"},
                 {"nome": "BL-P10", "centro": (101.5, 99.0), "prancha": "EXE.FU.LO.002"}]
        ficam, conflitos = blocos.juntar_repetidos(lidos)
        self.assertEqual([b["nome"] for b in ficam], ["BL-P2", "BL-P10"])
        self.assertEqual(ficam[1]["prancha"], "EXE.FU.LO.001")
        self.assertEqual(conflitos, [])

    def test_mesmo_nome_longe_vira_conflito(self):
        lidos = [{"nome": "BL-P10", "centro": (100.0, 100.0), "prancha": "A"},
                 {"nome": "BL-P10", "centro": (900.0, 100.0), "prancha": "B"}]
        ficam, conflitos = blocos.juntar_repetidos(lidos)
        self.assertEqual(len(ficam), 1)
        self.assertEqual([(c["nome"], c["prancha"], c["ja_em"]) for c in conflitos], [("BL-P10", "B", "A")])


class TestReferencia(unittest.TestCase):
    def test_pilares_da_pasta_gerada(self):
        with tempfile.TemporaryDirectory() as d:
            pasta = pathlib.Path(d)
            (pasta / "Planta_inteira").mkdir()
            (pasta / "Modulacao").mkdir()
            (pasta / "relatorio.json").write_text(json.dumps({"trechos": [
                {"pasta": "Planta_inteira", "disciplina": "estrutura"}, {"pasta": "Modulacao", "disciplina": "vedacao"}]}), encoding="utf-8")
            (pasta / "Planta_inteira" / "manifest.json").write_text(json.dumps({"elementos": {
                "a": {"tipo": "P", "nome": "P1", "polys": [[[90, 80], [110, 80], [110, 120], [90, 120]]]},
                "b": {"tipo": "P", "nome": "P1a", "so_detalhe": True, "polys": [[[0, 0], [1, 0], [1, 1]]]},
                "c": {"tipo": "V", "nome": "V1", "polys": [[[0, 0], [100, 0], [100, 10]]]},
                "d": {"tipo": "P", "nome": "P2", "polys": []},
            }}), encoding="utf-8")
            (pasta / "Modulacao" / "manifest.json").write_text(json.dumps({"elementos": {
                "x": {"tipo": "P", "nome": "P99", "polys": [[[0, 0], [1, 0], [1, 1]]]}}}), encoding="utf-8")
            self.assertEqual(blocos.pilares_da_referencia(pasta), [("P1", 100.0, 100.0, 20, 40)])

    def test_pasta_sem_relatorio(self):
        with tempfile.TemporaryDirectory() as d, self.assertRaises(blocos.ErroBlocos):
            blocos.pilares_da_referencia(d)

    def test_vigas_baldrames_da_pasta_gerada(self):
        # etapa 2 (24/11/2026): as vigas da forma da primeira referência viram "VB-" + nome, na ordem natural
        with tempfile.TemporaryDirectory() as d:
            pasta = pathlib.Path(d)
            (pasta / "Planta_inteira").mkdir()
            (pasta / "relatorio.json").write_text(json.dumps({"trechos": [{"pasta": "Planta_inteira", "disciplina": "estrutura"}]}), encoding="utf-8")
            (pasta / "Planta_inteira" / "manifest.json").write_text(json.dumps({"elementos": {
                "a": {"tipo": "V", "nome": "V10", "secao": "20/92", "rotulo": [1, 2, 3, 4], "polys": [[[0, 0], [100, 0], [100, 10], [0, 10]]]},
                "b": {"tipo": "V", "nome": "V2", "secao": "20/60", "polys": [[[0, 50], [10, 50], [10, 150], [0, 150]]]},
                "c": {"tipo": "V", "nome": "V3", "so_detalhe": True, "polys": [[[0, 0], [1, 0], [1, 1]]]},
                "d": {"tipo": "V", "nome": "V4", "polys": []},
                "e": {"tipo": "P", "nome": "P1", "polys": [[[90, 80], [110, 80], [110, 120], [90, 120]]]},
            }}), encoding="utf-8")
            vs = blocos.baldrames_da_referencia(pasta)
            self.assertEqual([v["nome"] for v in vs], ["VB-V2", "VB-V10"])
            self.assertEqual(vs[1]["secao"], "20/92")
            self.assertEqual(vs[1]["rotulo"], (1, 2, 3, 4))
            self.assertEqual(vs[0]["polys"], [[(0, 50), (10, 50), (10, 150), (0, 150)]])

    def test_lista_de_baldrames_escolhe_as_vigas(self):
        # 25/11/2026: "baldrames": true continua todas; com a lista, só essas (com ou sem o "VB-")
        vigas = [{"nome": f"VB-V{n}"} for n in (1, 2, 10)]
        self.assertEqual(blocos.escolher_baldrames(vigas, True), vigas)
        self.assertEqual([v["nome"] for v in blocos.escolher_baldrames(vigas, ["V10", "VB-V1"])], ["VB-V1", "VB-V10"])
        self.assertEqual(blocos.escolher_baldrames(vigas, []), [])
        with self.assertRaises(blocos.ErroBlocos):
            blocos.escolher_baldrames(vigas, ["V10", "V99"])  # viga que não está na forma
        with self.assertRaises(blocos.ErroBlocos):
            blocos.escolher_baldrames(vigas, "V10")


if __name__ == "__main__":
    unittest.main()


class TestEstacas(unittest.TestCase):
    """Estacas da locação dentro dos blocos (item 2.1, 24/11/2026)."""

    def test_uma_estaca_leva_o_nome_do_pilar(self):
        self.assertEqual(blocos.nomes_das_estacas("BL-P65", [(10.0, 10.0)]), ["E-P65"])

    def test_varias_estacas_de_cima_para_baixo_e_da_esquerda_para_a_direita(self):
        centros = [(60.0, 50.0), (10.0, 10.0), (60.0, 11.0), (10.0, 50.0)]
        self.assertEqual(blocos.nomes_das_estacas("BL-P1-P2", centros), ["E-P1-P2.4", "E-P1-P2.1", "E-P1-P2.2", "E-P1-P2.3"])

    def test_secao_pelo_diametro_em_1_50(self):
        self.assertEqual(blocos.secao_da_estaca(28.4), "D50")
        self.assertEqual(blocos.secao_da_estaca(34.0), "D60")
        self.assertEqual(blocos.secao_da_estaca(22.7), "D40")

    def test_circulo_vira_poligono_fechado_em_volta_do_centro(self):
        poly = blocos.poligono_do_circulo(100.0, 200.0, 10.0)
        self.assertEqual(len(poly), 16)
        for x, y in poly:
            self.assertAlmostEqual(((x - 100) ** 2 + (y - 200) ** 2) ** 0.5, 10.0)


class TestGradeDeEscavacao(unittest.TestCase):
    """Escavação a cada 30 m² (item 1.2, 24/11/2026): quadrados sobre a planta de fundação."""

    def test_cobre_a_caixa_com_quadrados_de_cerca_de_30_m2(self):
        ppm = blocos.PONTOS_POR_METRO
        grade = blocos.grade_de_escavacao((0.0, 0.0, 22 * ppm, 11 * ppm))  # 22 x 11 m
        self.assertEqual(len(grade), 8)  # 4 colunas x 2 linhas de 5,5 m
        self.assertEqual([g["nome"] for g in grade[:5]], ["ESC-A1", "ESC-A2", "ESC-A3", "ESC-A4", "ESC-B1"])
        self.assertTrue(all(abs(g["area_m2"] - 30.25) < 0.1 for g in grade))

    def test_caixa_pequena_vira_um_quadrado(self):
        grade = blocos.grade_de_escavacao((0.0, 0.0, 50.0, 50.0))
        self.assertEqual([g["nome"] for g in grade], ["ESC-A1"])

    def test_mais_de_26_linhas_continua_com_duas_letras(self):
        ppm = blocos.PONTOS_POR_METRO
        grade = blocos.grade_de_escavacao((0.0, 0.0, 5.477 * ppm, 28 * 5.477 * ppm))
        self.assertEqual(grade[-1]["nome"], "ESC-AB1")

    def test_so_ficam_os_quadrados_perto_dos_blocos(self):
        ppm = blocos.PONTOS_POR_METRO
        grade = blocos.grade_de_escavacao((0.0, 0.0, 22 * ppm, 5.5 * ppm))  # 4 quadrados numa linha
        ficam = blocos.so_perto_dos_blocos(grade, [(2.75 * ppm, 2.75 * ppm)], 6 * ppm)
        self.assertEqual([q["nome"] for q in ficam], ["ESC-A1", "ESC-A2"])
        self.assertEqual(blocos.so_perto_dos_blocos(grade, [], 6 * ppm), [])

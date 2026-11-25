"""Índice de apoios (pipeline/fvs/indice_apoios.py): quem apoia cada viga e laje, dos manifests do PC.

Teste cruzado com o app: os manifests de pipeline/testes/exemplos/apoios_exe/ e o apoios_esperado.json são
lidos também por app/src/pc/apoios_pipeline.test.ts, que roda a conta do app (a do botão "Baixar índice de
apoios"). Os dois têm que dar o mesmo arquivo. Dados inventados (obra EXE).
"""

from __future__ import annotations

import io
import json
import pathlib
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))
sys.path.insert(0, str(RAIZ / "pipeline"))

import indice_apoios  # noqa: E402

EXEMPLO = RAIZ / "pipeline" / "testes" / "exemplos" / "apoios_exe"


def ret(x0, y0, x1, y1):
    return [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]


class Geometria(unittest.TestCase):
    def test_contornos_se_tocam(self):
        a = ret(0, 0, 10, 10)
        self.assertTrue(indice_apoios.contornos_se_tocam(a, ret(10, 0, 20, 10), 0.5), "bordas encostadas")
        self.assertTrue(indice_apoios.contornos_se_tocam(a, ret(13, 0, 20, 10), 5), "a 3 de distância, folga 5")
        self.assertFalse(indice_apoios.contornos_se_tocam(a, ret(18, 0, 30, 10), 5), "a 8 de distância, folga 5")
        self.assertTrue(indice_apoios.contornos_se_tocam(a, ret(2, 2, 4, 4), 0.5), "um dentro do outro")
        self.assertTrue(indice_apoios.contornos_se_tocam(ret(-5, 4, 15, 6), ret(4, -5, 6, 15), 0.1), "em cruz")
        self.assertFalse(indice_apoios.contornos_se_tocam(a, [[]], 5), "contorno vazio")

    def test_viga_pelos_que_toca_e_laje_pelos_centros(self):
        elementos = {
            "p1": {"tipo": "P", "nome": "P1", "polys": ret(0, 0, 20, 40), "rotulo": [0, 0, 1, 1]},
            "p2": {"tipo": "P", "nome": "P2", "polys": ret(300, 0, 320, 40), "rotulo": [0, 0, 1, 1]},
            "pd": {"tipo": "P", "nome": "P3", "polys": ret(600, 0, 620, 40), "rotulo": [0, 0, 1, 1], "so_detalhe": True},
            "v1": {"tipo": "V", "nome": "V1", "polys": ret(20, 12, 300, 28), "rotulo": [0, 0, 1, 1]},
            "v2": {"tipo": "V", "nome": "V2", "polys": ret(320, 12, 600, 28), "rotulo": [0, 0, 1, 1]},
            "l1": {"tipo": "L", "nome": "L1", "polys": ret(-10, -10, 200, 100), "rotulo": [0, 0, 1, 1]},
        }
        a = indice_apoios.apoios_do_manifest(elementos)
        self.assertEqual(a["v1"], (["p1", "p2"], []))
        # a V2 toca o P2; o P3 é só detalhe e não conta
        self.assertEqual(a["v2"], (["p2"], []))
        # dentro da laje: o centro do P1 (10, 20) e o da V1 (160, 20); o do P2 (310, 20) fica fora
        self.assertEqual(a["l1"], (["p1"], ["v1"]))

    def test_ordem_dos_nomes_como_no_app(self):
        nomes = ["V10", "V2", "V1A", "v1", "P12", "P2", "Laje 10", "Laje 2", "Viga é", "Viga e 2"]
        self.assertEqual(sorted(nomes, key=indice_apoios._ordem_natural), ["Laje 2", "Laje 10", "P2", "P12", "v1", "V1A", "V2", "V10", "Viga é", "Viga e 2"])


class Indice(unittest.TestCase):
    def test_obra_exe_igual_ao_esperado_que_o_app_tambem_confere(self):
        esperado = json.loads((EXEMPLO / "apoios_esperado.json").read_text(encoding="utf-8"))
        apoios = indice_apoios.gerar([EXEMPLO])
        self.assertEqual(apoios["pavimentos"], esperado["pavimentos"])
        self.assertEqual(apoios["centros"], esperado["centros"])
        self.assertRegex(apoios["gerado_em"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$")
        self.assertEqual(indice_apoios.conferir(apoios), {"pavimentos": 2, "vigas": 5, "lajes": 2, "centros": 14})

    def test_por_pavimento_vale_a_planta_com_mais_pilares_e_vigas(self):
        escolhidas = indice_apoios.plantas_escolhidas(indice_apoios.ler_manifests([EXEMPLO]))
        self.assertEqual({pv: m["trecho"] for pv, m in escolhidas.items()}, {"1º Pavimento": "Planta inteira", "2º Pavimento": "Planta inteira"})

    def test_quem_fica_de_fora(self):
        pecas = indice_apoios.gerar([EXEMPLO])["pavimentos"]["1º Pavimento"]
        self.assertNotIn("V:V3", pecas, "viga que para longe do pilar não tem apoio")
        self.assertNotIn("V:V5", pecas, "viga que só toca pilar de detalhe não tem apoio")
        self.assertNotIn("L:L2", pecas, "laje com desenho de 2 pontos não entra")
        self.assertNotIn("P20", pecas["L:L1"][0], "pilar sem desenho não apoia")
        self.assertEqual(pecas["V:V2"], [["P2", "P3"], []], "a viga que para 3 antes da face entra pela folga")
        self.assertEqual(pecas["V:V1A"], [[], ["V1", "V10"]], "viga que só apoia em viga")

    def test_centros_da_planta_escolhida_sem_o_detalhe(self):
        centros = indice_apoios.gerar([EXEMPLO])["centros"]
        primeiro = centros["1º Pavimento"]
        self.assertEqual(primeiro["planta"], "a2000000-0000-4000-8000-000000000001", "a forma, não a de armadura nem a de ambientes")
        self.assertEqual(primeiro["pecas"]["P:P1"], [100, 100])
        self.assertEqual(primeiro["pecas"]["V:V1A"], [250, 300], "o meio da caixa do desenho")
        self.assertNotIn("P:P9", primeiro["pecas"], "pilar só de detalhe fica de fora")
        self.assertNotIn("P:P20", primeiro["pecas"], "pilar sem desenho fica de fora")

    def test_arredonda_como_o_app(self):
        self.assertEqual([indice_apoios._inteiro(v) for v in (2.5, 3.5, -2.5, 2.49)], [3, 4, -2, 2])

    def test_nome_repetido_leva_os_dois_centros(self):
        m = {"planta_id": "x", "pavimento": "A", "elementos": {
            "a": {"tipo": "V", "nome": "V1", "polys": ret(0, 0, 10, 10), "rotulo": [0, 0, 1, 1]},
            "b": {"tipo": "V", "nome": "V1 ", "polys": ret(100, 0, 110, 10), "rotulo": [0, 0, 1, 1]},
        }}
        self.assertEqual(indice_apoios.centros_dos_manifests([m])["A"]["pecas"], {"V:V1": [5, 5, 105, 5]})

    def test_lajes_desenhadas_no_app_pelos_centros_que_o_app_tambem_confere(self):
        # o mesmo arquivo de áreas e o mesmo esperado são lidos por app/src/pc/apoios_pipeline.test.ts
        areas = json.loads((EXEMPLO / "areas_exe.json").read_text(encoding="utf-8"))["areas"]
        esperado = json.loads((EXEMPLO / "areas_esperado.json").read_text(encoding="utf-8"))
        centros = indice_apoios.gerar([EXEMPLO])["centros"]
        self.assertEqual(indice_apoios.apoios_das_areas(centros, areas), esperado)
        self.assertNotIn("a5", esperado, "pavimento sem centros no índice")
        self.assertNotIn("a6", esperado, "contorno de 2 pontos")
        self.assertEqual(esperado["a3"], [["P1", "P2", "P10"], ["V1"]], "laje em L: o centro da V1A cai no vão, fora")

    def test_conferir_recusa_formato_torto(self):
        for torto in [None, {}, {"pavimentos": []}, {"pavimentos": {"A": []}}, {"pavimentos": {"A": {"P:P1": [[], []]}}}, {"pavimentos": {"A": {"V:V1": [["P1"]]}}}, {"pavimentos": {"A": {"V:V1": [["P1"], [3]]}}}, {"pavimentos": {}, "centros": []}, {"pavimentos": {}, "centros": {"A": {"pecas": {}}}}, {"pavimentos": {}, "centros": {"A": {"planta": "x", "pecas": {"L:L1": [1, 2]}}}}, {"pavimentos": {}, "centros": {"A": {"planta": "x", "pecas": {"P:P1": [1, 2, 3]}}}}, {"pavimentos": {}, "centros": {"A": {"planta": "x", "pecas": {"P:P1": [True, 2]}}}}]:
            with self.assertRaises(indice_apoios.ErroIndice, msg=repr(torto)):
                indice_apoios.conferir(torto)


class Comando(unittest.TestCase):
    def rodar(self, *args: str) -> tuple[int, str, str]:
        fora, erro = io.StringIO(), io.StringIO()
        with redirect_stdout(fora), redirect_stderr(erro):
            codigo = indice_apoios.main([str(a) for a in args])
        return codigo, fora.getvalue(), erro.getvalue()

    def test_grava_no_formato_do_botao_do_app(self):
        with tempfile.TemporaryDirectory() as tmp:
            saida = pathlib.Path(tmp) / "apoios.json"
            codigo, fora, _ = self.rodar(EXEMPLO, "--saida", saida)
            self.assertEqual(codigo, 0)
            gravado = json.loads(saida.read_text(encoding="utf-8"))
            self.assertEqual(list(gravado), ["apoios"])
            self.assertEqual(sorted(gravado["apoios"]), ["centros", "gerado_em", "pavimentos"])
            self.assertIn("5 vigas e 2 lajes em 2 pavimentos; centros de 14 pilares e vigas", fora)
            self.assertRegex(fora, r"1º Pavimento: 4 vigas, 1 lajes, 11 centros, \d+ bytes")
            self.assertIn("Não foi publicado", fora)

    def test_junta_nas_regras_sem_mexer_no_resto(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = pathlib.Path(tmp) / "config_fvs.json"
            regras = {"prazos": [], "ligacoes": [], "residenciais": [{"nome": "Residencial A", "pilares": ["P1", "P2"]}], "apoios": {"pavimentos": {"velho": {}}}}
            config.write_text(json.dumps(regras), encoding="utf-8")
            saida = pathlib.Path(tmp) / "novo" / "config_fvs.json"
            codigo, _, _ = self.rodar(EXEMPLO, "--saida", saida, "--juntar-em", config)
            self.assertEqual(codigo, 0)
            gravado = json.loads(saida.read_text(encoding="utf-8"))
            self.assertEqual({k: v for k, v in gravado.items() if k != "apoios"}, {k: v for k, v in regras.items() if k != "apoios"})
            self.assertIn("1º Pavimento", gravado["apoios"]["pavimentos"])
            self.assertNotIn("velho", gravado["apoios"]["pavimentos"])

    def test_recusa_saida_dentro_do_repositorio_e_pasta_sem_planta(self):
        codigo, _, erro = self.rodar(EXEMPLO, "--saida", RAIZ / "pipeline" / "testes" / "nao_gravar_apoios.json")
        self.assertEqual(codigo, 1)
        self.assertIn("dentro de um repositório", erro)
        self.assertFalse((RAIZ / "pipeline" / "testes" / "nao_gravar_apoios.json").exists())
        with tempfile.TemporaryDirectory() as tmp:
            vazia = pathlib.Path(tmp) / "vazia"
            vazia.mkdir()
            codigo, _, erro = self.rodar(vazia, "--saida", pathlib.Path(tmp) / "a.json")
            self.assertEqual(codigo, 1)
            self.assertIn("nenhum manifest.json", erro)
            codigo, _, erro = self.rodar(pathlib.Path(tmp) / "nao_existe", "--saida", pathlib.Path(tmp) / "a.json")
            self.assertEqual(codigo, 1)
            self.assertIn("pasta não encontrada", erro)


if __name__ == "__main__":
    unittest.main()

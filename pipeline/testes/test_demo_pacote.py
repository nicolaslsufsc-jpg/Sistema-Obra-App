"""Carga de uma obra lida de pacote (pipeline/demo/carga_pacote.py). Sem rede: leitura, travas, montagem e SQL.

O pacote de teste é fictício (obra TST, "Construtora Exemplo") e é montado numa pasta temporária."""

from __future__ import annotations

import datetime as dt
import json
import pathlib
import sys
import tempfile
import unittest

import importlib.util as _iu

_FALTA = [m for m in ('PIL', 'pymupdf', 'numpy') if _iu.find_spec(m) is None]
if _FALTA:  # no GitHub os scripts rodam sem essas bibliotecas
    raise unittest.SkipTest("precisa de " + ", ".join(_FALTA))

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "demo"))

import carga_exe  # noqa: E402
import carga_pacote as cp  # noqa: E402

USUARIO = "00000000-0000-0000-0000-0000000000a1"
HOJE = dt.date(2026, 11, 24)


def pacote_de_teste() -> dict:
    return {
        "versao": 1,
        "obra": {"codigo": "TST", "nome": "Obra de teste do pacote", "empresa": "Construtora Exemplo", "credito": "Exemplo"},
        "pavimentos": [{"nome": "Fundação", "ordem": 1}, {"nome": "Térreo", "ordem": 2}],
        "fichas": "exemplo",
        "plantas": [{"pavimento": "Térreo", "trecho": "Planta inteira", "prancha": "TST-ES-01", "revisao": "R03",
                     "imagem": "plantas/terreo.png", "largura": 400, "altura": 300,
                     "pecas": [{"tipo": "P", "nome": "P1", "secao": "20x40", "polys": [[[20, 20], [40, 20], [40, 60], [20, 60]]]},
                               {"tipo": "P", "nome": "P2", "secao": "20x40", "polys": [[[200, 20], [220, 20], [220, 60], [200, 60]]]},
                               {"tipo": "V", "nome": "V1", "secao": "15x40", "polys": [[[40, 30], [200, 30], [200, 45], [40, 45]]]}]}],
        "elementos": [{"pavimento": "Fundação", "tipo": "S", "nome": "E1", "secao": "D30"},
                      {"pavimento": "Fundação", "tipo": "K", "nome": "B1", "secao": "BL-1"}],
        "concretagens": [
            {"chave": "fund", "pavimento": "Fundação", "dias_antes": 40, "local": "Fundação", "fck": 25,
             "caminhoes": [{"volume_m3": 6, "pecas": [["S", "E1"], ["K", "B1"]], "cps": {"7": [18.0, 19.1], "28": [26.0, 27.2]}}]},
            {"chave": "pil", "pavimento": "Térreo", "planta": "Planta inteira", "dias_antes": 10, "local": "Térreo · pilares",
             "fck": 30, "caminhoes": [{"volume_m3": 4, "pecas": [["P", "P1"], ["P", "P2"]], "cps": {"7": [22.0, 22.5], "28": [30, 31]}}]}],
        "projetos": [{"sigla": "ES", "disciplina": "Estrutura", "numero": "001", "nome_curto": "FORMAS", "titulo": "FORMAS DO TÉRREO",
                      "revisoes": [{"fase": "EX", "numero": "02", "dias_antes": 50}, {"fase": "EX", "numero": "03", "dias_antes": 20}]}],
        "documentos": [{"codigo": "TST-MEM", "titulo": "Memorial descritivo", "revisao": "R03", "responsavel": "Projetista",
                        "pdf": "docs/memorial.pdf", "dias_antes": 30}],
        "diario": True,
    }


class Pasta:
    def __init__(self, pacote: dict | None = None):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = pathlib.Path(self.tmp.name)
        from PIL import Image, ImageDraw
        (self.dir / "plantas").mkdir()
        im = Image.new("RGB", (800, 600), "white")
        ImageDraw.Draw(im).rectangle([40, 40, 80, 120], fill="black")
        im.save(self.dir / "plantas" / "terreo.png")
        (self.dir / "docs").mkdir()
        (self.dir / "docs" / "memorial.pdf").write_bytes(carga_exe.pdf_de_exemplo(["TESTE"]))
        (self.dir / "obra.json").write_text(json.dumps(pacote or pacote_de_teste(), ensure_ascii=False), encoding="utf-8")

    def __enter__(self) -> pathlib.Path:
        return self.dir

    def __exit__(self, *a) -> None:
        self.tmp.cleanup()


def montar(pacote: dict | None = None):
    with Pasta(pacote) as d:
        return cp.montar(cp.ler_pacote(d), d, USUARIO, HOJE)


class TestLeitura(unittest.TestCase):
    def recusa(self, mudar) -> None:
        p = pacote_de_teste()
        mudar(p)
        with Pasta(p) as d, self.assertRaises(cp.ErroCarga):
            cp.ler_pacote(d)

    def test_codigo_exe_recusado(self):
        self.recusa(lambda p: p["obra"].update(codigo="EXE"))

    def test_codigo_invalido(self):
        self.recusa(lambda p: p["obra"].update(codigo="obra pública"))

    def test_versao_errada(self):
        self.recusa(lambda p: p.update(versao=2))

    def test_peca_inexistente_na_concretagem(self):
        self.recusa(lambda p: p["concretagens"][0]["caminhoes"][0]["pecas"].append(["S", "E9"]))

    def test_estaca_na_planta_recusada(self):
        self.recusa(lambda p: p["plantas"][0]["pecas"].append({"tipo": "S", "nome": "E5", "polys": [[[1, 1], [2, 1], [2, 2]]]}))

    def test_falta_imagem(self):
        self.recusa(lambda p: p["plantas"][0].update(imagem="plantas/nao_existe.png"))

    def test_numero_de_projeto_curto(self):
        self.recusa(lambda p: p["projetos"][0].update(numero="01"))

    def test_revisao_fora_do_formato(self):
        self.recusa(lambda p: p["projetos"][0]["revisoes"].append({"fase": "R", "numero": "3", "dias_antes": 1}))

    def test_laje_com_contorno_na_planta(self):
        p = pacote_de_teste()
        p["plantas"][0]["pecas"].append({"tipo": "L", "nome": "L1", "secao": "h12", "polys": [[[40, 45], [200, 45], [200, 200], [40, 200]]]})
        with Pasta(p) as d:
            self.assertIn("L1", [pc["nome"] for pc in cp.ler_pacote(d)["plantas"][0]["pecas"]])

    def test_nome_de_peca_com_espaco(self):
        self.recusa(lambda p: p["plantas"][0]["pecas"][0].update(nome="V 1"))
        self.recusa(lambda p: p["elementos"].append({"pavimento": p["elementos"][0]["pavimento"], "tipo": "S", "nome": "E 9"}))

    def test_pavimento_inexistente(self):
        self.recusa(lambda p: p["elementos"].append({"pavimento": "Cobertura", "tipo": "S", "nome": "E2"}))


class TestMontagem(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.c = montar()

    def test_ids_da_obra_nao_sao_da_exe(self):
        self.assertNotEqual(self.c.obra_id, carga_exe.OBRA_ID)
        self.assertEqual(self.c.obra_id, carga_exe.uid("obra", "TST"))

    def test_determinismo(self):
        self.assertEqual(carga_exe.gerar_sql(self.c), carga_exe.gerar_sql(montar()))

    def test_toda_linha_e_arquivo_da_obra(self):
        for t, linhas in self.c.linhas.items():
            for ln in linhas:
                self.assertEqual(ln["id"] if t == "obras" else ln["obra_id"], self.c.obra_id, t)
        self.assertTrue(all(k.startswith(self.c.obra_id + "/") for k in self.c.arquivos))

    def test_contagens(self):
        n = {t: len(v) for t, v in self.c.linhas.items()}
        self.assertEqual(n["pavimentos"], 2)
        self.assertEqual(n["elementos"], 5)
        self.assertEqual(n["plantas"], 1)
        self.assertEqual(n["concretagens"], 2)
        self.assertEqual(n["cp_resultados"], 6)  # fundação (40 dias): 7 e 28; pilares (10 dias): só os de 7
        self.assertEqual(n["revisoes"], 2)
        self.assertEqual(n["doc_documentos"], 1)
        self.assertEqual(len(self.c.arquivos), 3)  # manifest, pacote e o PDF

    def test_planta_ref_e_area_so_onde_tem_desenho(self):
        setor = self.c.linhas["setores"][0]["id"]
        areas = self.c.linhas["caminhao_areas"]
        self.assertEqual(len(areas), 1)
        self.assertEqual(areas[0]["planta_ref"], f"{setor}@R03")
        origens = {(e["origem"], e["fracao"]) for e in self.c.linhas["caminhao_elementos"]}
        self.assertEqual(origens, {("manual", None), ("desenho", 1)})

    def test_rotulo_e_caixa_no_manifest(self):
        """O app enquadra pela caixa [x0, y0, x1, y1]; um ponto só deixava a planta em branco (NaN no Leaflet)."""
        man = next(json.loads(v) for k, v in self.c.arquivos.items() if k.endswith("manifest.json"))
        self.assertTrue(man["elementos"])
        for e in man["elementos"].values():
            self.assertEqual(len(e["rotulo"]), 4, e["nome"])

    def test_caixa_do_rotulo(self):
        poly = [[[10, 20], [50, 20], [50, 80], [10, 80]]]
        self.assertEqual(cp.caixa_do_rotulo({"polys": poly, "rotulo": [100, 50]}), [86, 45, 114, 55])
        self.assertEqual(cp.caixa_do_rotulo({"polys": poly, "rotulo": [1, 2, 3, 4]}), [1, 2, 3, 4])
        self.assertEqual(cp.caixa_do_rotulo({"polys": poly}), [10, 20, 50, 80])

    def test_revisao_antiga_obsoleta(self):
        revs = sorted(self.c.linhas["revisoes"], key=lambda r: r["numero"])
        self.assertTrue(revs[0]["obsoleta"])
        self.assertFalse(revs[1]["obsoleta"])

    def test_credito_aumenta_a_altura(self):
        self.assertEqual(self.c.linhas["plantas"][0]["altura"], 300 + 28)

    def test_sql_tem_a_trava_da_obra(self):
        sql = carga_exe.gerar_sql(self.c)
        self.assertIn(f"id = '{self.c.obra_id}' and codigo <> 'TST'", sql)
        self.assertNotIn(carga_exe.OBRA_ID, sql)

    def test_gravar_diz_de_que_obra_e(self):
        with tempfile.TemporaryDirectory() as d:
            carga_exe.gravar(self.c, pathlib.Path(d))
            resumo = json.loads((pathlib.Path(d) / "resumo.json").read_text(encoding="utf-8"))
            self.assertEqual((resumo["obra_id"], resumo["codigo"]), (self.c.obra_id, "TST"))
            # o envio confere os caminhos pela obra da pasta (para antes de qualquer rede: url errada)
            with self.assertRaises(carga_exe.ErroCarga):
                carga_exe.enviar(pathlib.Path(d), "x", "https://exemplo.invalid")


if __name__ == "__main__":
    unittest.main()

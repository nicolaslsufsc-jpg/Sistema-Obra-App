"""Testes das partes puras da FVS no PC: pacote de planta, publicação e fichas (sem PDF, sem servidor)."""

from __future__ import annotations

import base64
import json
import pathlib
import sys
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))
sys.path.insert(0, str(RAIZ / "pipeline"))

import montar_pavimentos  # noqa: E402
import pacote  # noqa: E402
import publicar_fichas  # noqa: E402
import publicar_planta  # noqa: E402

CAB = {"planta_id": "p1", "obra": "TESTE", "pavimento": "3º", "trecho": "Trecho 1", "prancha": "X.ES.LO.1.FOR-R00",
       "revisao": "R00", "largura": 1000, "altura": 800, "tile": 512, "niveis": [-1, 0]}


class TestPacote(unittest.TestCase):
    def test_ida_e_volta(self):
        tiles = {"0/0/0": b"AAA", "0/1/0": b"BB", "-1/0/0": b"C"}
        elementos = {"e1": {"tipo": "P", "nome": "P1", "secao": "20x60", "rotulo": [1, 2, 3, 4],
                            "polys": [[[0, 0], [10, 0], [10, 10]]], "detalhe": "P_P1"},
                     "e2": {"tipo": "V", "nome": "V1", "secao": "", "rotulo": [5, 6, 7, 8], "polys": []}}
        detalhes = {"P_P1": {"titulo": "P1", "prancha": "X.ES.LO.2.PIL-R00", "img": b"DET", "aco": b"ACO"}}
        man, binario = pacote.montar(CAB, tiles, elementos, detalhes)
        m, pedacos = pacote.ler(man, binario)
        self.assertEqual(m["formato"], 1)
        self.assertEqual(pedacos["t:0/1/0"], b"BB")
        self.assertEqual(pedacos["t:-1/0/0"], b"C")
        self.assertEqual(pedacos["d:P_P1"], b"DET")
        self.assertEqual(pedacos["a:P_P1"], b"ACO")
        self.assertEqual(m["elementos"]["e1"]["detalhe"], "P_P1")
        self.assertNotIn("detalhe", m["elementos"]["e2"])
        self.assertTrue(m["detalhes"]["P_P1"]["aco"])
        self.assertEqual(len(binario), 3 + 2 + 1 + 3 + 3)

    def test_detalhe_sem_tabela_de_aco(self):
        man, binario = pacote.montar(CAB, {}, {}, {"V_V1": {"titulo": "V1", "prancha": "x", "img": b"I", "aco": None}})
        m, pedacos = pacote.ler(man, binario)
        self.assertFalse(m["detalhes"]["V_V1"]["aco"])
        self.assertNotIn("a:V_V1", pedacos)

    def test_recusa_peca_com_detalhe_que_nao_existe(self):
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(CAB, {}, {"e": {"tipo": "P", "nome": "P1", "rotulo": [0, 0, 1, 1], "polys": [], "detalhe": "P_P9"}}, {})

    def test_ambiente_com_fichas_que_nao_valem(self):
        amb = {"tipo": "A", "nome": "301-01", "secao": "12,1 m²", "comodo": "Suíte 01", "rotulo": [0, 0, 1, 1], "polys": [],
               "sem_fichas": ["EXE-024", "EXE-013", "EXE-024"]}
        man, binario = pacote.montar(CAB, {}, {"a1": amb}, {})
        m, _ = pacote.ler(man, binario)
        self.assertEqual(m["elementos"]["a1"]["sem_fichas"], ["EXE-013", "EXE-024"])
        with self.assertRaises(pacote.ErroPacote):  # só ambiente
            pacote.montar(CAB, {}, {"p": {"tipo": "P", "nome": "P1", "rotulo": [0, 0, 1, 1], "polys": [], "sem_fichas": ["EXE-024"]}}, {})
        with self.assertRaises(pacote.ErroPacote):  # lista de códigos
            pacote.montar(CAB, {}, {"a1": {**amb, "sem_fichas": "EXE-024"}}, {})

    def test_quadrado_da_escavacao_e_fichas_da_grade(self):
        # grade de escavação (blocos.py, 24/11/2026): o quadrado leva "grade" e o pacote "fichas_da_grade"
        esc = {"tipo": "A", "nome": "ESC-A1", "secao": "30,0 m²", "rotulo": [0, 0, 1, 1], "polys": [], "grade": "escavacao"}
        man, _ = pacote.montar({**CAB, "fichas_da_grade": ["EXE-PVS-ESC"]}, {}, {"q1": esc}, {})
        m = json.loads(man)
        self.assertEqual(m["elementos"]["q1"]["grade"], "escavacao")
        self.assertEqual(m["fichas_da_grade"], ["EXE-PVS-ESC"])
        self.assertNotIn("fichas_da_grade", json.loads(pacote.montar(CAB, {}, {}, {})[0]))
        # viga baldrame: bloco com "grade": "baldrame" (etapa 2, 24/11/2026)
        vb = {"tipo": "K", "nome": "VB-V1", "secao": "20/92", "rotulo": [0, 0, 1, 1], "polys": [], "grade": "baldrame"}
        self.assertEqual(json.loads(pacote.montar(CAB, {}, {"vb": vb}, {})[0])["elementos"]["vb"]["grade"], "baldrame")
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(CAB, {}, {"q": {**esc, "grade": "baldrame"}}, {})
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(CAB, {}, {"k": {"tipo": "K", "nome": "BL-P1", "rotulo": [0, 0, 1, 1], "polys": [], "grade": "escavacao"}}, {})
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar({**CAB, "fichas_da_grade": "EXE-PVS-ESC"}, {}, {}, {})

    def test_recusa_tile_e_tipo_invalidos(self):
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(CAB, {"../x": b"1"}, {}, {})
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(CAB, {}, {"e": {"tipo": "X", "nome": "X1", "rotulo": [0, 0, 1, 1], "polys": []}}, {})

    def test_recusa_pedaco_fora_do_pacote(self):
        man, binario = pacote.montar(CAB, {"0/0/0": b"AAAA"}, {}, {})
        with self.assertRaises(pacote.ErroPacote):
            pacote.ler(man, binario[:2])

    def test_chave_de_detalhe_segura(self):
        self.assertEqual(pacote.chave_de_detalhe("P", "P39=P40"), "P_P39_P40")
        self.assertRegex(pacote.chave_de_detalhe("V", "V 1/2 ç"), r"^[A-Za-z0-9_-]+$")


class TestPublicarPlanta(unittest.TestCase):
    def test_pecas_a_criar(self):
        existentes = [{"tipo": "P", "nome": "P1"}, {"tipo": "V", "nome": "V9", "apagado": True}]
        lidas = [("P", "P1", "20x60"), ("P", "P2", "19x60"), ("P", "P2", "19x60"), ("V", "V9", "")]
        self.assertEqual(publicar_planta.pecas_a_criar(existentes, lidas), [("P", "P2", "19x60"), ("V", "V9", "")])

    def test_planta_vigente(self):
        plantas = [
            {"id": "a", "setor_id": "s1", "criado_em_servidor": "2026-11-01"},
            {"id": "b", "setor_id": "s1", "substitui_id": "a", "criado_em_servidor": "2026-11-02"},
            {"id": "c", "setor_id": "s2", "criado_em_servidor": "2026-11-02"},
            {"id": "d", "setor_id": "s3", "apagado": True},
        ]
        self.assertEqual(publicar_planta.planta_vigente(plantas, "s1"), "b")
        self.assertEqual(publicar_planta.planta_vigente(plantas, "s2"), "c")
        self.assertIsNone(publicar_planta.planta_vigente(plantas, "s3"))
        self.assertIsNone(publicar_planta.planta_vigente(plantas, "s9"))

    def test_montar_trecho(self):
        forma = {"prancha": "X.ES.LO.129.FOR-R03", "revisao": "R03", "largura": 100, "altura": 50, "tile": 512, "niveis": [0],
                 "tiles": {"0/0/0": b"T"},
                 "pecas": [{"tipo": "P", "nome": "P1", "secao": "20x60", "rotulo": [0, 0, 1, 1], "polys": [[[0, 0], [1, 0], [1, 1]]]},
                           {"tipo": "V", "nome": "V1", "secao": "", "rotulo": [2, 2, 3, 3], "polys": []}]}
        detalhes = {"P": {"P1": {"chave": "P_P1", "titulo": "P1", "prancha": "X.PIL", "img": b"D", "aco": None}}, "V": {}}
        ids = {("P", "P1"): "id-p1", ("V", "V1"): "id-v1"}
        man, binario, rel = publicar_planta.montar_trecho(forma, detalhes, ids, {"planta_id": "p", "trecho": "Trecho 1"})
        m, _ = pacote.ler(man, binario)
        self.assertEqual(set(m["elementos"]), {"id-p1", "id-v1"})
        self.assertEqual(m["revisao"], "R03")
        self.assertEqual(rel["sem_detalhe"], ["V1"])
        self.assertEqual(rel["sem_contorno"], ["V1"])
        self.assertEqual((rel["pilares"], rel["vigas"]), (1, 1))

    def test_ler_config(self):
        with tempfile.TemporaryDirectory() as d:
            base = pathlib.Path(d)
            (base / "pil").mkdir()
            for n in ("285", "286"):
                (base / "pil" / f"{n}.pdf").write_bytes(b"x")
            (base / "f1.pdf").write_bytes(b"x")
            cfg = {"obra": "exe", "pavimento": " 3º Pavimento ", "formas": [{"trecho": "Trecho 1", "pdf": "f1.pdf"}],
                   "det_pilares": "pil/*.pdf", "det_vigas": []}
            (base / "pav.json").write_text(json.dumps(cfg), encoding="utf-8")
            lido = publicar_planta.ler_config(base / "pav.json")
            self.assertEqual(lido["obra"], "EXE")
            self.assertEqual(lido["pavimento"], "3º Pavimento")
            self.assertEqual(len(lido["det_pilares"]), 2)
            cfg["formas"].append({"trecho": "Trecho 1", "pdf": "f1.pdf"})
            (base / "pav.json").write_text(json.dumps(cfg), encoding="utf-8")
            with self.assertRaises(publicar_planta.ErroPublicacao):
                publicar_planta.ler_config(base / "pav.json")

    def test_id_local_e_fixo_e_separa_pavimentos(self):
        a = publicar_planta.id_local("EXE", "3º Pavimento", "P", "P39")
        self.assertEqual(a, publicar_planta.id_local("EXE", "3º Pavimento", "P", "P39"))
        self.assertNotEqual(a, publicar_planta.id_local("EXE", "4º Pavimento", "P", "P39"))
        self.assertNotEqual(a, publicar_planta.id_local("EXE", "3º Pavimento", "V", "P39"))
        self.assertRegex(a, r"^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$")

    def test_usuario_do_token(self):
        meio = base64.urlsafe_b64encode(json.dumps({"sub": "00000000-0000-0000-0000-0000000000b1"}).encode()).decode().rstrip("=")
        self.assertEqual(publicar_planta.usuario_do_token(f"x.{meio}.y"), "00000000-0000-0000-0000-0000000000b1")
        with self.assertRaises(publicar_planta.ErroPublicacao):
            publicar_planta.usuario_do_token("nada")


class TestMontarPavimentos(unittest.TestCase):
    def test_vigente_lo_vale_mais_que_ex_e_maior_revisao(self):
        v = montar_pavimentos.vigentes([
            "EXE.ES.EX.134.FOR4PAVTIP-R02", "EXE.ES.LO.134.FOR4PAVTIP-R01",
            "EXE.ES.LO.135.FOR4PAVTIP-R00", "EXE.ES.LO.135.FOR4PAVTIP-R01",
            "nao-e-codigo",
        ])
        self.assertEqual([c["codigo"] for c in v], ["EXE.ES.LO.134.FOR4PAVTIP-R01", "EXE.ES.LO.135.FOR4PAVTIP-R01"])

    def test_pavimento_pelo_nome_do_documento(self):
        f = montar_pavimentos.pavimento_do_nome
        self.assertEqual(f("FORTERREOX"), "Térreo Comercial")
        self.assertEqual(f("PILCOMERCI"), "Térreo Comercial")
        self.assertEqual(f("VIG3PAVTIP"), "3º Pavimento")
        self.assertEqual(f("FORMEZANIN"), "Mezanino")
        self.assertIsNone(f("LISTAMESTR"))

    def test_montar(self):
        formas = ["EXE.ES.LO.130.FOR3PAVTIP-R03", "EXE.ES.LO.129.FOR3PAVTIP-R03", "EXE.ES.LO.100.FORSUBSOLO-R14"]
        titulos = {"EXE.ES.LO.129.FOR3PAVTIP-R03": "FORMA DO 3 PAVTO TIPO - TRECHO 1",
                   "EXE.ES.LO.130.FOR3PAVTIP-R03": "FORMA DO 3 PAVTO TIPO - TRECHO 2",
                   "EXE.ES.LO.100.FORSUBSOLO-R14": "FORMA DO SUBSOLO - TRECHO 1"}
        pil = ["EXE.ES.LO.285.PIL3PAVTIP-R00", "EXE.ES.EX.285.PIL3PAVTIP-R05", "EXE.ES.EX.2127.PIL6PAVTIP-R00"]
        vig = ["EXE.ES.LO.3122.VIG3PAVTIP-R02"]
        p = montar_pavimentos.montar(formas, titulos, pil, vig, "EXE")
        self.assertEqual(list(p), ["Subsolo", "3º Pavimento"])
        d = p["3º Pavimento"]
        self.assertEqual([f["trecho"] for f in d["formas"]], ["Trecho 1", "Trecho 2"])
        self.assertEqual(d["det_pilares"], ["Pilares/EXE.ES.LO.285.PIL3PAVTIP-R00.pdf"])  # LO vence EX de revisão maior
        self.assertEqual(d["det_vigas"], ["Vigas/EXE.ES.LO.3122.VIG3PAVTIP-R02.pdf"])
        self.assertEqual(p["Subsolo"]["det_pilares"], [])  # pavimento sem forma fica de fora (6º)
        self.assertEqual(montar_pavimentos.nome_de_arquivo("Térreo Comercial"), "02_terreo_comercial.json")

    def test_pavimento_do_carimbo(self):
        for texto, esperado in (("Planta: Térreo Comercial", "Térreo Comercial"), ("Planta: 4°Pavto Tipo", "4º Pavimento"), ("planta: 3º Pavto Tipo", "3º Pavimento"),
                                ("Planta: Pilotis", "Pilotis"), ("Planta: Mezanino", "Mezanino"), ("Planta: Subsolo", "Subsolo"),
                                ("Planta: Algo que não existe", None), ("Pilares", None), ("", None)):
            self.assertEqual(montar_pavimentos.pavimento_do_carimbo(texto), esperado, texto)

    def test_detalhe_entra_tambem_no_pavimento_do_carimbo(self):
        forma = lambda folha, nome: f"EXE.ES.LO.{folha}.FOR{nome}-R00"
        formas = [forma(1, "TERREOX"), forma(2, "PILOTIS")]
        titulos = {c: "FORMA - TRECHO 1" for c in formas}
        doTerreo, soPilotis = "EXE.ES.LO.200.PILPILOTIS-R00", "EXE.ES.LO.201.PILPILOTIS-R00"
        pavs = montar_pavimentos.montar(formas, titulos, [doTerreo, soPilotis], [], "EXE", {doTerreo: "Térreo Comercial", soPilotis: "Pilotis"})
        self.assertEqual(pavs["Térreo Comercial"]["det_pilares"], [f"Pilares/{doTerreo}.pdf"])
        # o lance passa pelos dois pavimentos: continua no do nome, sem repetir
        self.assertEqual(pavs["Pilotis"]["det_pilares"], [f"Pilares/{doTerreo}.pdf", f"Pilares/{soPilotis}.pdf"])
        # carimbo de um pavimento sem forma não cria pavimento, e sem carimbos vale só o nome
        self.assertNotIn("Mezanino", montar_pavimentos.montar(formas, titulos, [doTerreo], [], "EXE", {doTerreo: "Mezanino"}))
        self.assertEqual(montar_pavimentos.montar(formas, titulos, [doTerreo], [], "EXE")["Térreo Comercial"]["det_pilares"], [])

    def test_forma_sem_trecho_no_titulo_e_recusada(self):
        with self.assertRaises(montar_pavimentos.ErroPavimentos):
            montar_pavimentos.montar(["EXE.ES.LO.100.FORSUBSOLO-R14"], {"EXE.ES.LO.100.FORSUBSOLO-R14": "FORMA DO SUBSOLO"}, [], [], "EXE")


class TestPublicarFichas(unittest.TestCase):
    def test_legado_usa_codigo_do_arquivo(self):
        dados = json.loads((RAIZ / "pipeline" / "legado" / "itens_fvs.exemplo.json").read_text(encoding="utf-8"))
        fichas = publicar_fichas.normalizar(dados)
        por_codigo = {f["codigo"]: f for f in fichas}
        self.assertEqual(por_codigo["EXE-PVS-001"]["aplica_a"], ["P"])
        self.assertEqual(por_codigo["EXE-PVS-001"]["titulo"], "Exemplo - Pilares")
        self.assertEqual(len(por_codigo["EXE-PVS-001"]["itens"]), 4)
        self.assertEqual(len(por_codigo["EXE-PVS-002"]["itens"]), 3)
        with self.assertRaises(publicar_fichas.ErroFichas):
            publicar_fichas.normalizar({"P": {"nome": "sem código", "itens": dados["P"]["itens"]}})
        it = por_codigo["EXE-PVS-001"]["itens"][0]
        self.assertEqual(set(it), {"n", "etapa", "titulo", "descricao", "dispositivo", "tolerancia"})

    def test_recusa_ficha_sem_tipo_e_item_repetido(self):
        with self.assertRaises(publicar_fichas.ErroFichas):
            publicar_fichas.normalizar([{"codigo": "X", "titulo": "Reboco", "aplica_a": [], "itens": [{"n": 1, "titulo": "a"}]}])
        with self.assertRaises(publicar_fichas.ErroFichas):
            publicar_fichas.normalizar([{"codigo": "X", "titulo": "t", "aplica_a": ["P"], "itens": [{"n": 1}, {"n": 1}]}])

    def test_novas(self):
        fichas = [{"codigo": "A", "revisao": "0"}, {"codigo": "A", "revisao": "1"}]
        self.assertEqual(publicar_fichas.novas(fichas, [{"codigo": "A", "revisao": "0"}]), [{"codigo": "A", "revisao": "1"}])


if __name__ == "__main__":
    unittest.main()

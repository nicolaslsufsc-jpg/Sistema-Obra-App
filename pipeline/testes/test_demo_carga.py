"""Carga da obra fictícia EXE (pipeline/demo/carga_exe.py). Sem rede: só a montagem, o SQL e as travas."""

from __future__ import annotations

import datetime as dt
import json
import pathlib
import re
import sys
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "demo"))
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))
sys.path.insert(0, str(RAIZ / "pipeline"))

import carga_exe as carga  # noqa: E402

USUARIO = "00000000-0000-0000-0000-0000000000a1"
HOJE = dt.date(2026, 11, 23)


class DesenhoFalso:
    def tiles(self, pecas, prancha):
        return {"0/0/0": prancha.encode()}

    def detalhe(self, peca):
        return b"D" + peca["nome"].encode()

    def aco(self, peca):
        return b"A" + peca["nome"].encode()


def montar(**kw):
    return carga.montar(USUARIO, HOJE, DesenhoFalso(), **kw)


class Travas(unittest.TestCase):
    def test_so_o_servidor_de_testes(self):
        self.assertEqual(carga.conferir_url("https://tbscnqazrveiaoqgpgxs.supabase.co/"), carga.URL_TESTES)
        for url in ("https://zktsuwxgvvyufuihkndj.supabase.co", "https://outro.supabase.co",
                    "https://tbscnqazrveiaoqgpgxs.supabase.co.exemplo.invalid", "http://127.0.0.1:54321"):
            with self.assertRaises(carga.ErroCarga, msg=url):
                carga.conferir_url(url)

    def test_sql_recusa_id_ou_codigo_de_outra_obra(self):
        sql = carga.gerar_sql(montar())
        self.assertIn(f"id = '{carga.OBRA_ID}' and codigo <> 'EXE'", sql)
        self.assertIn(f"codigo = 'EXE' and id <> '{carga.OBRA_ID}'", sql)
        self.assertNotIn("codigo !~", sql)  # outra obra no servidor não barra mais

    def test_toda_linha_e_da_obra_exe(self):
        c = montar()
        c.linhas["pavimentos"][0] = dict(c.linhas["pavimentos"][0], obra_id="00000000-0000-0000-0000-000000000001")
        with self.assertRaises(carga.ErroCarga):
            carga.gerar_sql(c)

    def test_enviar_recusa_url_errada_antes_de_ler_arquivos(self):
        with tempfile.TemporaryDirectory() as d, self.assertRaises(carga.ErroCarga):
            carga.enviar(pathlib.Path(d), "chave", "https://zktsuwxgvvyufuihkndj.supabase.co")

    def test_chave_so_do_env(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(carga.ErroCarga):
                carga.chave_do_env(pathlib.Path(d))
            (pathlib.Path(d) / ".env").write_text("OUTRA=1\nSUPABASE_TESTES_SECRET='abc'\n", encoding="utf-8")
            self.assertEqual(carga.chave_do_env(pathlib.Path(d)), "abc")


class Montagem(unittest.TestCase):
    def test_ids_fixos_rodar_de_novo_da_o_mesmo(self):
        self.assertEqual(carga.gerar_sql(montar()), carga.gerar_sql(montar()))

    def test_ids_unicos_e_tudo_na_obra_exe(self):
        c = montar()
        ids = [ln["id"] for t, lns in c.linhas.items() for ln in lns]
        self.assertEqual(len(ids), len(set(ids)))
        for t, lns in c.linhas.items():
            for ln in lns:
                self.assertEqual(ln.get("obra_id", ln["id"]), carga.OBRA_ID, t)
                if t != "obras":
                    self.assertEqual(ln["usuario_id"], USUARIO)
        self.assertTrue(all(k.startswith(carga.OBRA_ID + "/") for k in c.arquivos))

    def test_todos_os_modulos_tem_dados(self):
        c = montar()
        for t in ("pavimentos", "elementos", "plantas", "fichas_modelo", "fvs_eventos", "concretagens", "caminhoes",
                  "caminhao_areas", "cp_resultados", "documentos", "revisoes", "doc_documentos", "diario_clima", "relatorios"):
            self.assertTrue(c.linhas.get(t), t)
        self.assertEqual(set(c.linhas) - set(carga.ORDEM), set())

    def test_referencias_apontam_para_linhas_da_carga(self):
        c = montar()
        ids = {ln["id"] for lns in c.linhas.values() for ln in lns}
        for t, lns in c.linhas.items():
            for ln in lns:
                for k, v in ln.items():
                    if k.endswith("_id") and k not in ("id", "obra_id", "usuario_id", "dispositivo_id") and v:
                        self.assertIn(v, ids, f"{t}.{k}")

    def test_arquivos_batem_com_o_conteudo(self):
        c = montar()
        for a in c.linhas["arquivos"]:
            dados = c.arquivos[a["caminho"]]
            self.assertEqual(a["tamanho"], len(dados))
            self.assertEqual(a["hash"], carga.pacote.sha256(dados))

    def test_area_do_caminhao_na_planta_do_setor(self):
        c = montar()
        setores = {s["id"] for s in c.linhas["setores"]}
        for a in c.linhas["caminhao_areas"]:
            setor, _, rev = a["planta_ref"].partition("@")
            self.assertIn(setor, setores)
            self.assertEqual(rev, carga.REVISAO)

    def test_laje_com_o_id_que_o_app_daria(self):
        c = montar()
        lajes = [e for e in c.linhas["elementos"] if e["tipo"] == "L"]
        self.assertEqual(len(lajes), 4)
        for e in lajes:
            self.assertTrue(re.fullmatch(r"Laje_Trecho_\d", e["nome"]))
            self.assertEqual(e["id"], carga.id_da_laje(e["pavimento_id"], e["nome"][5:].replace("_", " ")))

    def test_cp_so_depois_da_idade(self):
        c = montar()
        datas = {k["id"]: k["concretagem_id"] for k in c.linhas["caminhoes"]}
        conc = {x["id"]: dt.date.fromisoformat(x["data"]) for x in c.linhas["concretagens"]}
        for cp in c.linhas["cp_resultados"]:
            ensaio = dt.date.fromisoformat(cp["data_ensaio"])
            self.assertLessEqual(ensaio, HOJE)
            self.assertEqual((ensaio - conc[datas[cp["caminhao_id"]]]).days, cp["idade_dias"])

    def test_nada_no_futuro(self):
        c = montar()
        for t, lns in c.linhas.items():
            for ln in lns:
                if "criado_em_dispositivo" in ln:
                    self.assertLessEqual(ln["criado_em_dispositivo"][:10], HOJE.isoformat(), t)

    def test_fundacoes_no_caminhao_a_mao(self):
        c = montar()
        fund = {e["id"]: e for e in c.linhas["elementos"] if e["tipo"] in ("S", "K")}
        self.assertEqual(sorted(e["nome"] for e in fund.values()), ["BL-P1", "BL-P2", "E-P1.A", "E-P1.B", "E-P2.A", "E-P2.B"])
        ligados = [x for x in c.linhas["caminhao_elementos"] if x["elemento_id"] in fund]
        self.assertEqual(len(ligados), 6)
        self.assertTrue(all(x["origem"] == "manual" and x["fracao"] is None and x["incluido"] for x in ligados))
        cams = {fund[x["elemento_id"]]["tipo"]: set() for x in ligados}
        for x in ligados:
            cams[fund[x["elemento_id"]]["tipo"]].add(x["caminhao_id"])
        self.assertEqual(len(cams["S"]), 1)
        self.assertEqual(len(cams["K"]), 1)
        self.assertNotEqual(cams["S"], cams["K"])
        conc = [k for k in c.linhas["concretagens"] if "Fundações" in k["local_descricao"]]
        self.assertEqual(len(conc), 1)
        self.assertLess(conc[0]["data"], HOJE.isoformat())
        vol = [k["volume_m3"] for k in c.linhas["caminhoes"] if k["concretagem_id"] == conc[0]["id"]]
        self.assertEqual(vol, [8.5, 8.5])
        self.assertFalse([e for e in montar(fundacoes=False).linhas["elementos"] if e["tipo"] in ("S", "K")])

    def test_convite_so_com_email_dado(self):
        self.assertNotIn("convites", carga.gerar_sql(montar()))
        sql = carga.gerar_sql(montar(convidar=" Pessoa@Exemplo.invalid "))
        self.assertIn('"email":"pessoa@exemplo.invalid"', sql)

    def test_gravar_pasta(self):
        c = montar()
        with tempfile.TemporaryDirectory() as d:
            carga.gravar(c, pathlib.Path(d))
            resumo = json.loads((pathlib.Path(d) / "resumo.json").read_text(encoding="utf-8"))
            self.assertEqual(resumo["obra_id"], carga.OBRA_ID)
            self.assertEqual(len(list((pathlib.Path(d) / "storage").rglob("*.*"))), len(c.arquivos))


if __name__ == "__main__":
    unittest.main()

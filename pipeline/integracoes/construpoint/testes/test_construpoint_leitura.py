"""Leitura completa do Construpoint -> linhas do servidor (leitura.py e publicar_leitura.py deste galho).
Tudo com dados inventados: registro de obra não entra no repositório."""

from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(RAIZ / "pipeline" / "integracoes" / "construpoint"))
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))
sys.path.insert(0, str(RAIZ / "pipeline" / "projetos"))
sys.path.insert(0, str(RAIZ / "pipeline"))

import importar_construpoint as ic  # noqa: E402
import leitura  # noqa: E402
import publicar_leitura as pl  # noqa: E402

PILAR, LAJE = "EXE-PVS-001", "EXE-PVS-009"
FICHAS = [
    {"id": "f-pilar", "codigo": PILAR, "revisao": "0", "itens": [
        {"n": 1, "etapa": "INÍCIO", "titulo": "Limpeza", "descricao": "Local limpo"},
        {"n": 3, "etapa": "EXECUÇÃO", "titulo": "Prumo", "descricao": "Verificar o prumo"}]},
    {"id": "f-laje", "codigo": LAJE, "revisao": "0", "itens": [{"n": 1, "etapa": "INÍCIO", "titulo": "Fôrma", "descricao": "Conferir"}]},
]
PAVIMENTOS = [{"id": "pav-pil", "nome": "Pilotis"}]
ELEMENTOS = [{"id": "el-p27", "pavimento_id": "pav-pil", "tipo": "P", "nome": "P27"},
             {"id": "el-a1", "pavimento_id": "pav-pil", "tipo": "A", "nome": "Sala"}]
LOCAIS = [
    {"Id": 10, "ParentId": None, "Name": "Pilotis", "FullName": "Pilotis", "Level": 0, "DeleteDate": None},
    {"Id": 11, "ParentId": 10, "Name": "Trecho 1", "FullName": "Pilotis \\ Trecho 1", "Level": 0, "DeleteDate": None},
    {"Id": 12, "ParentId": 11, "Name": "P27", "FullName": "Pilotis \\ Trecho 1 \\ Pilares \\ P27", "Level": 0, "DeleteDate": None},
    {"Id": 13, "ParentId": 11, "Name": " ", "FullName": "", "Level": 0, "DeleteDate": "2026-09-01T00:00:00"},
]


def inspecao(i, local, modelo="Pilares"):
    return {"Id": i, "Code": f"FVS-{i}", "Model": modelo, "Location": local, "Status": "Em Andamento", "Inspector": "Pessoa Um",
            "ProviderFantasyName": "Parceiro", "ScheduleDate": "26/08/2026", "ReinspectionDate": "02/10/2026",
            "UpdateDate": "21/10/2026 08:20:48", "MedicaoTitle": ""}


def verif(ficha, chkl, texto, status="Aprovado", quando="30/09/2026 08:15:51"):
    return {"Id": ficha, "InspectionChklId": chkl, "Verificacoes": texto, "VerificationStatus": status,
            "DateVerification": quando, "VerificadoPor": "Pessoa Dois", "Problem": [], "Solution": []}


def dados():
    return {
        "cp_locais.json": LOCAIS,
        "cp_mapa_fvs.json": {"inspection": [{"Id": 1, "LocalId": 12, "Identification": PILAR},
                                            {"Id": 2, "LocalId": 11, "Identification": LAJE}]},
        "cp_fvs_inspecoes.json": {"data": [inspecao(1, "Pilotis \\ Trecho 1 \\ Pilares \\ P27"), inspecao(2, "Pilotis \\ Trecho 1", "Laje")]},
        "cp_fvs_verificacoes.json": {"data": [
            verif(1, 100, "(INÍCIO) Limpeza: Local limpo"),
            verif(1, 101, "(EXECUCAO) prumo :  verificar o PRUMO", "Reprovado"),
            verif(1, 102, "(EXECUÇÃO) Prumo: Verificar o prumo", quando="01/10/2026 09:00:00"),
            verif(1, 103, "(FIM) Item que saiu da ficha: texto"),
            verif(2, 200, "(INÍCIO) Fôrma: Conferir"),
        ]},
        "lido_em": "2026-11-21T12:00:00Z",
    }


def montar():
    return leitura.montar_leitura("EXE", dados(), {f["codigo"]: f for f in FICHAS}, PAVIMENTOS, ELEMENTOS, {PILAR, "EXE-PVS-002"})


class TestLeitura(unittest.TestCase):
    def test_locais_com_id_fixo_nivel_e_sem_nome(self):
        h = montar()
        por_origem = {l["origem_id"]: l for l in h["locais"]}
        self.assertEqual(len(h["locais"]), 4)
        self.assertEqual(por_origem["12"]["id"], ic.novo_id("EXE", "local", 12))
        self.assertEqual(por_origem["12"]["origem_pai_id"], "11")
        self.assertEqual(por_origem["12"]["nivel"], 3)
        self.assertEqual(por_origem["12"]["elemento_id"], "el-p27")  # local que é peça da planta
        self.assertIsNone(por_origem["10"]["origem_pai_id"])
        self.assertEqual(por_origem["13"]["nome"], "(sem nome)")
        self.assertTrue(por_origem["13"]["apagado_no_sistema"])
        self.assertTrue(all(l["sistema"] == "construpoint" for l in h["locais"]))

    def test_ficha_ganha_local_e_datas(self):
        fichas = {f["construpoint_id"]: f for f in montar()["fichas_campo"]}
        self.assertEqual(fichas[1]["elemento_id"], "el-p27")
        self.assertEqual(fichas[1]["local_id"], ic.novo_id("EXE", "local", 12))
        self.assertEqual(fichas[1]["reinspecao_em"], "2026-10-02T03:00:00.000Z")
        self.assertIsNone(fichas[1]["medicao"])
        self.assertIsNone(fichas[2]["elemento_id"])  # laje: só o local
        self.assertEqual(fichas[2]["local_id"], ic.novo_id("EXE", "local", 11))

    def test_item_ligado_pelo_texto_ao_n_da_ficha_do_servidor(self):
        h = montar()
        eventos = sorted(h["eventos"], key=lambda e: e["origem_id"])
        self.assertEqual([(e["origem_id"], e["item"], e["resultado"], e["rodada"]) for e in eventos],
                         [("100", 1, "C", 1), ("101", 3, "NC", 1), ("102", 3, "C", 2)])
        self.assertEqual(h["resumo"]["verificacoes_sem_item"], {PILAR: 1})
        self.assertEqual(h["resumo"]["descartados"], {"item que não está na ficha": 1})

    def test_verificacao_so_com_local_nao_vira_registro(self):
        h = montar()
        self.assertFalse([e for e in h["eventos"] if e["ficha_campo_id"] == ic.novo_id("EXE", "ficha_campo", 2)])
        laje = [f for f in h["fichas_campo"] if f["construpoint_id"] == 2][0]
        self.assertEqual((laje["qtd_a"], laje["qtd_r"]), (1, 0))  # entra só nas contagens

    def test_linhas_para_enviar_leva_as_colunas_novas(self):
        h = montar()
        r = pl.linhas_para_enviar(h, FICHAS, PAVIMENTOS, ELEMENTOS)
        f = {x["construpoint_id"]: x for x in r["fichas"]}
        self.assertEqual(f[1]["ficha_id"], "f-pilar")
        self.assertEqual(f[2]["local_id"], ic.novo_id("EXE", "local", 11))
        self.assertIn("agendada_em", f[2])
        self.assertEqual(len(r["eventos"]), 3)
        self.assertTrue(all(e["elemento_id"] == "el-p27" for e in r["eventos"]))

    def test_com_locais_a_verificacao_da_laje_vira_registro_no_local(self):
        h = leitura.montar_leitura("EXE", dados(), {f["codigo"]: f for f in FICHAS}, PAVIMENTOS, ELEMENTOS, {PILAR}, com_locais=True)
        laje = [e for e in h["eventos"] if e["ficha_campo_id"] == ic.novo_id("EXE", "ficha_campo", 2)]
        self.assertEqual([(e["origem_id"], e["item"], e["resultado"], e["elemento_id"]) for e in laje], [("200", 1, "C", None)])
        self.assertEqual(laje[0]["local_id"], ic.novo_id("EXE", "local", 11))
        r = pl.linhas_para_enviar(h, FICHAS, PAVIMENTOS, ELEMENTOS)
        f = {x["construpoint_id"]: x for x in r["fichas"]}
        self.assertEqual(f[2]["ficha_id"], "f-laje")  # a tela do local mostra os itens da ficha modelo
        self.assertIsNone(f[2]["elemento_id"])
        no_local = [e for e in r["eventos"] if e.get("local_id")]
        self.assertEqual(len(no_local), 1)
        self.assertEqual((no_local[0]["ficha_id"], no_local[0]["item"]), ("f-laje", 1))
        self.assertNotIn("elemento_id", no_local[0])  # um só entre elemento, área, barra e local
        self.assertEqual(len(r["eventos"]), 4)

    def test_com_locais_ficha_modelo_fora_do_servidor_fica_de_fora(self):
        h = leitura.montar_leitura("EXE", dados(), {PILAR: FICHAS[0]}, PAVIMENTOS, ELEMENTOS, {PILAR}, com_locais=True)
        r = pl.linhas_para_enviar(h, FICHAS[:1], PAVIMENTOS, ELEMENTOS)
        self.assertFalse([e for e in r["eventos"] if e.get("local_id")])
        self.assertIsNone({x["construpoint_id"]: x for x in r["fichas"]}[2]["ficha_id"])

    def test_com_locais_recusa_o_servidor_da_obra(self):
        self.assertTrue(pl.servidor_da_obra("https://abc.supabase.co/", "https://abc.supabase.co"))
        self.assertFalse(pl.servidor_da_obra("https://teste.supabase.co", "https://abc.supabase.co"))
        self.assertEqual(pl.main(["pasta-que-nao-existe", "--obra", "EXE", "--com-locais", "--empresa-autorizou"]), 1)

    def test_importacao_tem_id_fixo(self):
        a = pl.linha_importacao("EXE", "2026-11-21T12:00:00Z", {"locais": 4})
        b = pl.linha_importacao("EXE", "2026-11-21T12:00:00Z", {"locais": 4})
        self.assertEqual(a["id"], b["id"])
        self.assertEqual(a["sistema"], "construpoint")

    def test_ler_pasta_tira_o_envelope(self):
        with tempfile.TemporaryDirectory() as tmp:
            pasta = pathlib.Path(tmp)
            for nome in leitura.ARQUIVOS:
                (pasta / nome).write_text(json.dumps({"arquivo": nome, "lido_em": "2026-11-21T12:00:00Z", "dados": dados()[nome]}), encoding="utf-8")
            d = leitura.ler_pasta(pasta)
            self.assertEqual(d["lido_em"], "2026-11-21T12:00:00Z")
            self.assertEqual(len(d["cp_locais.json"]), 4)

    def test_obra_real_sem_autorizacao_recusa(self):
        self.assertEqual(pl.main(["pasta-que-nao-existe", "--obra", "EXE"]), 1)


if __name__ == "__main__":
    unittest.main()

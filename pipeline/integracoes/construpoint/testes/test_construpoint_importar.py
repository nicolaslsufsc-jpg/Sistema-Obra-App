"""Histórico do Construpoint: montagem do arquivo a partir dos relatórios (importar_construpoint.py deste galho).
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
sys.path.insert(0, str(RAIZ / "pipeline"))

import importar_construpoint as ic  # noqa: E402

PILAR, VIGA = "EXE-PVS-001", "EXE-PVS-002"
ITENS = {PILAR: ["(INÍCIO) Limpeza: Local limpo", "(EXECUÇÃO) Prumo:\tVerificar o prumo"], VIGA: ["(INÍCIO) Fundo: Conferir o fundo"]}
PECAS = {"Pilotis": {"P": {"P27": "id-p27", "P90": "id-p90", "P216": "id-p216"}, "V": {"V14": "id-v14"}},
         "2º Pavimento": {"P": {"P100": "id-2p100"}}}
FICHAS_DO_APP = {PILAR, VIGA}


def ficha(i, local, status="Em Andamento", codigo=PILAR, **extra):
    return {"Id": i, "Code": f"FVS-{i}", "Location": local, "Status": status, "Inspector": "Pessoa Um", "Model": "Modelo",
            "ProviderFantasyName": "Parceiro", "ScheduleDate": "26/08/2026", "UpdateDate": "21/10/2026 08:20:48", "_ficha_codigo": codigo, **extra}


def verif(ficha_id, chkl, texto, status, quando, quem="Pessoa Um", problema=None, solucao=None):
    return {"Id": ficha_id, "InspectionChklId": chkl, "Verificacoes": texto, "VerificationStatus": status, "DateVerification": quando,
            "VerificadoPor": quem, "Problem": [{"Descricao": problema}] if problema else [], "Solution": [{"Descricao": solucao}] if solucao else []}


def montar(inspecoes, verificacoes=()):
    return ic.montar("EXE", list(verificacoes), inspecoes, ITENS, PECAS, FICHAS_DO_APP)


class TestPartes(unittest.TestCase):
    def test_data_de_brasilia_vira_utc_como_o_app_grava(self):
        self.assertEqual(ic.data_utc("30/09/2026 08:15:51"), "2026-09-30T11:15:51.000Z")
        self.assertEqual(ic.data_utc("26/08/2026"), "2026-08-26T03:00:00.000Z")
        self.assertEqual(ic.data_utc("31/12/2026 22:00:00"), "2027-01-01T01:00:00.000Z")
        self.assertIsNone(ic.data_utc(None))
        with self.assertRaises(ic.ErroImportacao):
            ic.data_utc("ontem")

    def test_peca_do_local(self):
        self.assertEqual(ic.peca_do_local("Pilotis \\ Trecho 1 \\ Pilares \\ P27"), ("Pilotis", "P", "P27"))
        self.assertEqual(ic.peca_do_local("Torre \\ 2° Pavimento \\ Residencial D - Vigas \\ V144"), ("2º Pavimento", "V", "V144"))
        self.assertEqual(ic.peca_do_local("Mezanino \\ Trecho 4 \\ Pilares \\ p216"), ("Mezanino", "P", "P216"))
        self.assertEqual(ic.peca_do_local("Mezanino \\ Trecho 6 \\ Pilares \\ p326a"), ("Mezanino", "P", "P326A"))
        self.assertEqual(ic.peca_do_local("Torre \\ 2° Pavimento \\ Pilares \\ P102aa"), ("2º Pavimento", "P", "P102AA"))
        self.assertEqual(ic.peca_do_local("Mezanino \\ Trecho 1 \\ Pilares \\ P9O"), ("Mezanino", "P", "P90"))  # letra O no lugar de zero
        for sem_peca in ("Térreo Comercial", "Pilotis \\ Trecho 1", "Infra estrutura \\ Residencial 1 \\ BL129", "Pilotis \\ Trecho 1 \\ ETE \\ PAREDE 1",
                         "Infra estrutura \\ Residencial 1 \\ Bloco P81"):
            self.assertIsNone(ic.peca_do_local(sem_peca), sem_peca)

    def test_observacao_junta_problema_e_solucao(self):
        self.assertEqual(ic.observacao_de([{"Descricao": "Segregação "}], []), "Segregação")
        self.assertEqual(ic.observacao_de([{"Descricao": "Falha"}], [{"Descricao": "Tratar"}]), "Falha. Solução: Tratar")
        self.assertEqual(ic.observacao_de([], [{"Descricao": "Tratar"}]), "Solução: Tratar")
        self.assertIsNone(ic.observacao_de([], None))

    def test_relatorio_nos_dois_formatos(self):
        self.assertEqual([r["_ficha_codigo"] for r in ic.linhas_de({"A": {"data": [{"Id": 1}]}, "B": [{"Id": 2}]})], ["A", "B"])


class TestMontar(unittest.TestCase):
    def test_registro_com_a_data_original_e_quem_marcou(self):
        h = montar([ficha(1, "Pilotis \\ Trecho 1 \\ Pilares \\ P27")],
                   [verif(1, 500, ITENS[PILAR][0], "Aprovado", "08/10/2026 09:33:51", quem="Pessoa Dois")])
        e = h["eventos"][0]
        self.assertEqual((e["item"], e["resultado"], e["rodada"]), (1, "C", 1))
        self.assertEqual(e["criado_em"], "2026-10-08T12:33:51.000Z")
        self.assertEqual(e["verificado_por"], "Pessoa Dois")
        self.assertEqual((e["elemento_id"], e["origem_id"]), ("id-p27", "500"))
        self.assertEqual(h["fichas_campo"][0]["qtd_a"], 1)

    def test_texto_com_tab_acha_o_item(self):
        h = montar([ficha(1, "Pilotis \\ Trecho 1 \\ Pilares \\ P27")],
                   [verif(1, 500, "(EXECUÇÃO) Prumo: Verificar  o prumo", "N/A", "08/10/2026 09:33:51")])
        self.assertEqual((h["eventos"][0]["item"], h["eventos"][0]["resultado"]), (2, "NA"))

    def test_reinspecao_vai_para_a_rodada_seguinte_na_ordem_das_datas(self):
        t = ITENS[PILAR][0]
        h = montar([ficha(1, "Pilotis \\ Trecho 1 \\ Pilares \\ P27")], [
            # fora de ordem de propósito: quem manda é a data
            verif(1, 503, t, "Aprovado", "03/10/2026 08:00:00"),
            verif(1, 501, t, "Reprovado", "01/10/2026 08:00:00", problema="Falha", solucao="Tratar"),
            verif(1, 502, t, "Reprovado", "02/10/2026 08:00:00", problema="Falha de novo"),
        ])
        self.assertEqual([(e["resultado"], e["rodada"], e["observacao"]) for e in h["eventos"]],
                         [("NC", 1, "Falha. Solução: Tratar"), ("NC", 2, "Falha de novo"), ("C", 3, None)])

    def test_mesmo_segundo_mantem_a_ordem(self):
        t = ITENS[PILAR][0]
        h = montar([ficha(1, "Pilotis \\ Trecho 1 \\ Pilares \\ P27")],
                   [verif(1, 601, t, "Reprovado", "01/10/2026 08:00:00", problema="x"), verif(1, 602, t, "Aprovado", "01/10/2026 08:00:00")])
        self.assertEqual([e["criado_em"] for e in h["eventos"]], ["2026-10-01T11:00:00.000Z", "2026-10-01T11:00:00.001Z"])
        self.assertEqual(h["eventos"][1]["rodada"], 2)

    def test_ficha_duplicada_mantem_as_duas_situacoes(self):
        t = ITENS[PILAR][0]
        h = montar([ficha(1, "Pilotis \\ Trecho 1 \\ Pilares \\ P27", "Aceito"), ficha(2, "Pilotis \\ Trecho 2 \\ Pilares \\ P27", "Pendente Reinspeção")], [
            verif(1, 701, t, "Aprovado", "01/10/2026 08:00:00"),
            verif(2, 702, t, "Reprovado", "02/10/2026 08:00:00", problema="Falha"),
        ])
        self.assertEqual(h["resumo"]["pecas_com_ficha_duplicada"], 1)
        por_ficha = {f["codigo"]: f for f in h["fichas_campo"]}
        self.assertEqual(por_ficha["FVS-1"]["elemento_id"], por_ficha["FVS-2"]["elemento_id"])
        self.assertEqual({e["ficha_campo_id"]: (e["resultado"], e["rodada"]) for e in h["eventos"]},
                         {por_ficha["FVS-1"]["id"]: ("C", 1), por_ficha["FVS-2"]["id"]: ("NC", 1)})
        self.assertIn("ficha duplicada (as duas entraram)", h["resumo"]["pendencias"])

    def test_ficha_agendada_entra_mesmo_sem_registro(self):
        h = montar([ficha(1, "Pilotis \\ Trecho 1 \\ Pilares \\ P27", "Agendado")])
        self.assertEqual((h["fichas_campo"][0]["status"], h["eventos"]), ("Agendado", []))

    def test_local_sem_peca_fica_na_lista_com_as_contagens(self):
        h = montar([ficha(1, "Infra estrutura \\ Setor 1", codigo="EXE-PVS-000"), ficha(2, "Pilotis \\ Trecho 1 \\ Pilares \\ P999"), ficha(3, "Pilotis \\ Briquedoteca")],
                   [verif(2, 800, ITENS[PILAR][0], "Aprovado", "01/10/2026 08:00:00")])
        self.assertEqual(h["eventos"], [])
        self.assertEqual([f["elemento_id"] for f in h["fichas_campo"]], [None, None, None])
        self.assertEqual(h["fichas_campo"][1]["qtd_a"], 1)
        self.assertEqual(sum(h["resumo"]["pendencias"].values()), 3)

    def test_ficha_de_pilar_em_viga_entra_na_viga_e_e_avisada(self):
        h = montar([ficha(1, "Pilotis \\ Trecho 2 \\ Vigas \\ V14")], [verif(1, 900, ITENS[PILAR][0], "Aprovado", "01/10/2026 08:00:00")])
        self.assertEqual((h["eventos"][0]["elemento_id"], h["eventos"][0]["ficha_codigo"]), ("id-v14", PILAR))
        self.assertIn("ficha de outro tipo de peça (entrou como está)", h["resumo"]["pendencias"])

    def test_nao_inventa_nem_duplica(self):
        t = ITENS[PILAR][0]
        h = montar([ficha(1, "Pilotis \\ Trecho 1 \\ Pilares \\ P27")], [
            verif(1, 901, t, "Aprovado", "01/10/2026 08:00:00"),
            verif(1, 901, t, "Aprovado", "01/10/2026 08:00:00"),      # mesma verificação repetida no relatório
            verif(1, 902, t, "Talvez", "01/10/2026 08:00:01"),        # resultado que não conhecemos
            verif(1, 903, "(X) Outro item", "Aprovado", "01/10/2026 08:00:02"),
            verif(9, 904, t, "Aprovado", "01/10/2026 08:00:03"),      # ficha fora do relatório
        ])
        self.assertEqual(len(h["eventos"]), 1)
        self.assertEqual(set(h["resumo"]["descartados"]), {"repetido no relatório", "resultado desconhecido: Talvez", "item que não está na ficha",
                                                           "ficha fora do relatório de inspeções"})

    def test_importar_de_novo_da_os_mesmos_ids(self):
        ent = ([ficha(1, "Pilotis \\ Trecho 1 \\ Pilares \\ P27")], [verif(1, 500, ITENS[PILAR][0], "Aprovado", "08/10/2026 09:33:51")])
        self.assertEqual(montar(*ent)["eventos"], montar(*ent)["eventos"])


class TestArquivos(unittest.TestCase):
    def test_nao_grava_dentro_do_repositorio(self):
        self.assertEqual(ic.main(["x", "--obra", "EXE", "--pacotes", "y", "--saida", str(RAIZ / "historico.json")]), 1)

    def test_ponta_a_ponta(self):
        with tempfile.TemporaryDirectory() as d:
            base = pathlib.Path(d)
            (base / "cp").mkdir()
            (base / "pac" / "pil").mkdir(parents=True)
            (base / "pac" / "pil" / "relatorio.json").write_text(json.dumps(
                {"pavimento": "Pilotis", "pecas": [{"id": "id-p27", "tipo": "P", "nome": "P27"}]}), encoding="utf-8")
            (base / "cp" / "cp_fichas.json").write_text(json.dumps(
                [{"codigo": PILAR, "itens": [{"texto": t} for t in ITENS[PILAR]]}]), encoding="utf-8")
            (base / "cp" / "cp_inspecoes.json").write_text(json.dumps({PILAR: {"data": [ficha(1, "Pilotis \\ T \\ Pilares \\ P27")]}}), encoding="utf-8")
            (base / "cp" / "cp_verificacoes.json").write_text(json.dumps(
                {PILAR: {"data": [verif(1, 500, ITENS[PILAR][0], "Aprovado", "08/10/2026 09:33:51")]}}), encoding="utf-8")
            saida = base / "h.json"
            ret = ic.main([str(base / "cp"), "--obra", "EXE", "--pacotes", str(base / "pac"), "--saida", str(saida)])
            self.assertEqual(ret, 0)
            h = json.loads(saida.read_text(encoding="utf-8"))
            self.assertEqual(h["resumo"]["eventos_na_planta"], 1)
            self.assertNotIn("pendencias", h)
            self.assertTrue((base / "pendencias_importacao.csv").exists())


if __name__ == "__main__":
    unittest.main()


class TestPilarComLetra(unittest.TestCase):
    """Achado 4 da lista de campo (24/11): "P184" no Construpoint é o "P184a" no app. Pares do 2º (P102a e
    P102aa): fica o que não é só de detalhe no pacote; sem pacote, o nome mais curto, com aviso."""

    PECAS_2 = {"2º Pavimento": {"P": {"P184A": "id-p184a", "P102A": "id-p102a", "P102AA": "id-p102aa", "P50": "id-p50",
                                      "P505": "id-p505"}}}
    LOCAL = "Torre \\ 2° Pavimento \\ Pilares \\ {}"

    def montar(self, nome, so_detalhe=None):
        return ic.montar("EXE", [], [ficha(1, self.LOCAL.format(nome))], ITENS, self.PECAS_2, FICHAS_DO_APP, so_detalhe=so_detalhe)

    def test_pilar_sem_letra_liga_no_unico_com_letra(self):
        h = self.montar("P184", so_detalhe={"2º Pavimento": set()})
        f = h["fichas_campo"][0]
        self.assertEqual((f["elemento_id"], f["nome"]), ("id-p184a", "P184A"))
        self.assertEqual(h["resumo"]["pilares_ligados_pelo_numero"], 1)
        self.assertEqual(h["pendencias"], [])

    def test_par_do_2o_fica_o_que_nao_e_so_detalhe(self):
        h = self.montar("P102", so_detalhe={"2º Pavimento": {"P102A"}})
        self.assertEqual(h["fichas_campo"][0]["elemento_id"], "id-p102aa")
        self.assertEqual(h["pendencias"], [])
        h = self.montar("P102", so_detalhe={"2º Pavimento": {"P102AA"}})
        self.assertEqual(h["fichas_campo"][0]["elemento_id"], "id-p102a")

    def test_par_sem_pacote_fica_o_mais_curto_e_avisa(self):
        h = self.montar("P102")
        self.assertEqual(h["fichas_campo"][0]["elemento_id"], "id-p102a")
        (p,) = h["pendencias"]
        self.assertIn("pilar ligado pelo número", p["motivo"])
        self.assertIn("P102A, P102AA", p["local"])

    def test_nome_exato_ganha_e_numero_diferente_nao_liga(self):
        h = self.montar("P102AA")
        self.assertEqual(h["fichas_campo"][0]["elemento_id"], "id-p102aa")
        self.assertEqual(h["resumo"]["pilares_ligados_pelo_numero"], 0)
        h = self.montar("P5")  # P50 e P505 têm outro número: não liga
        self.assertIsNone(h["fichas_campo"][0]["elemento_id"])
        self.assertEqual(h["pendencias"][0]["motivo"], "peça não está na planta do pavimento")

    def test_ler_pecas_traz_os_so_detalhe_do_pacote(self):
        with tempfile.TemporaryDirectory() as tmp:
            sub = pathlib.Path(tmp) / "EXE_2"
            sub.mkdir()
            (sub / "relatorio.json").write_text(json.dumps({"pavimento": "2º Pavimento", "so_detalhe": ["P102a"],
                "pecas": [{"tipo": "P", "nome": "P102a", "id": "a"}, {"tipo": "P", "nome": "P102aa", "id": "aa"}]}), encoding="utf-8")
            so = {}
            pecas = ic.ler_pecas(pathlib.Path(tmp), so)
        self.assertEqual(so, {"2º Pavimento": {"P102A"}})
        self.assertEqual(pecas["2º Pavimento"]["P"], {"P102A": "a", "P102AA": "aa"})

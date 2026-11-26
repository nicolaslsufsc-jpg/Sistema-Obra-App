"""Histórico do sistema oficial no formato genérico (historico.json): o que o publicar_historico.py sobe
e a conferência do servidor. O arquivo de exemplo (historico_exemplo.json) é inventado e tem o
formato que qualquer galho de pipeline/integracoes/ gera (docs/modulos/integracoes.md)."""

from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))
sys.path.insert(0, str(RAIZ / "pipeline"))

import conferir_servidor as cs  # noqa: E402
import publicar_historico as ph  # noqa: E402

PILAR, VIGA = "EXE-PVS-001", "EXE-PVS-002"
HISTORICO = pathlib.Path(__file__).resolve().parent / "historico_exemplo.json"


class TestPublicarHistorico(unittest.TestCase):
    """O que sobe para o servidor. Nada aqui acessa servidor nenhum: o "sb" é um dublê."""

    FICHAS = [{"id": "f-p-0", "codigo": PILAR, "revisao": "0", "itens": [{"n": 1}, {"n": 2}]},
              {"id": "f-p-antiga", "codigo": PILAR, "revisao": "R", "itens": [{"n": 1}]},
              {"id": "f-v", "codigo": VIGA, "revisao": "1", "itens": [{"n": 1}]}]
    PAVS = [{"id": "pav-pil", "nome": "Pilotis"}]
    ELEMENTOS = [{"id": "srv-p27", "pavimento_id": "pav-pil", "tipo": "P", "nome": "P27"},
                 {"id": "srv-p90", "pavimento_id": "pav-pil", "tipo": "P", "nome": "P90", "apagado": True}]

    def historico(self):
        return json.loads(HISTORICO.read_text(encoding="utf-8"))

    def test_pilar_com_letra_liga_pelo_numero(self):
        """Achado 4 (24/11): "P184" de fora é o "P184a" do servidor; par do 2º sem saber o só de detalhe: o mais curto, com aviso."""
        pavs = [{"id": "pav-2", "nome": "2º Pavimento"}]
        elementos = [{"id": "s184a", "pavimento_id": "pav-2", "tipo": "P", "nome": "P184a"},
                     {"id": "s102a", "pavimento_id": "pav-2", "tipo": "P", "nome": "P102a"},
                     {"id": "s102aa", "pavimento_id": "pav-2", "tipo": "P", "nome": "P102aa"}]
        ficha = lambda i, nome: {"id": i, "codigo": i, "ficha_codigo": PILAR, "pavimento": "2º Pavimento", "tipo": "P", "nome": nome}
        h = {"fichas_campo": [ficha("a", "P184"), ficha("b", "P102"), ficha("c", "P102aa"), ficha("d", "P18")], "eventos": []}
        r = ph.resolver(h, self.FICHAS, pavs, elementos)
        self.assertEqual([f["elemento_id"] for f in r["fichas"]], ["s184a", "s102a", "s102aa", None])
        self.assertEqual(len(r["avisos"]), 1)
        self.assertIn("P102A, P102AA", r["avisos"][0])
        self.assertEqual(r["fora"], {"ficha com peça que não está no servidor (publique a planta)": 1})

    def test_troca_nomes_pelos_ids_do_servidor_e_mantem_data_e_nome(self):
        r = ph.resolver(self.historico(), self.FICHAS, self.PAVS, self.ELEMENTOS)
        por_codigo = {f["codigo"]: f for f in r["fichas"]}
        self.assertEqual((por_codigo["FVS-1"]["elemento_id"], por_codigo["FVS-1"]["ficha_id"]), ("srv-p27", "f-p-0"))
        e = r["eventos"][0]
        self.assertEqual(len(r["eventos"]), 1)
        self.assertEqual((e["elemento_id"], e["ficha_id"], e["item"], e["resultado"]), ("srv-p27", "f-p-0", 2, "NC"))
        self.assertEqual((e["criado_em_dispositivo"], e["verificado_por"], e["observacao"]), ("2026-10-08T12:33:51.000Z", "Pessoa Dois", "Falha"))
        self.assertEqual(e["ficha_campo_id"], por_codigo["FVS-1"]["id"])

    def test_peca_sem_planta_publicada_nao_perde_a_ficha_e_avisa(self):
        r = ph.resolver(self.historico(), self.FICHAS, self.PAVS, self.ELEMENTOS)
        por_codigo = {f["codigo"]: f for f in r["fichas"]}
        self.assertIsNone(por_codigo["FVS-2"]["elemento_id"])  # P90 está apagado no servidor
        self.assertIsNone(por_codigo["FVS-3"]["elemento_id"])
        self.assertEqual(r["fora"]["ficha com peça que não está no servidor (publique a planta)"], 1)
        self.assertEqual(r["fora"]["registro de ficha fora da planta"], 1)

    def test_todas_as_linhas_de_um_lote_tem_as_mesmas_colunas(self):
        # o servidor recusa lote com colunas diferentes entre as linhas
        r = ph.resolver(self.historico(), self.FICHAS, self.PAVS, self.ELEMENTOS)
        self.assertEqual(len({tuple(sorted(f)) for f in r["fichas"]}), 1)
        self.assertEqual(len({tuple(sorted(e)) for e in r["eventos"]}), 1)

    def test_item_que_nao_esta_na_ficha_do_servidor_nao_derruba_o_lote(self):
        fichas = [{"id": "f-p-0", "codigo": PILAR, "revisao": "0", "itens": [{"n": 1}]}]
        r = ph.resolver(self.historico(), fichas, self.PAVS, self.ELEMENTOS)
        self.assertEqual(r["eventos"], [])
        self.assertEqual(r["fora"]["registro de item que não está na ficha do servidor"], 1)

    def test_maior_revisao_e_apagada_fora(self):
        vig = ph.fichas_vigentes([{"id": "a", "codigo": "X", "revisao": "2"}, {"id": "b", "codigo": "X", "revisao": "10"}, {"id": "c", "codigo": "X", "revisao": "11", "apagado": True}])
        self.assertEqual(vig["X"]["id"], "b")

    def test_grava_em_lotes_sem_duplicar_ao_rodar_de_novo(self):
        class Sb:
            pedidos: list = []

            def json(self, metodo, caminho, corpo, cabecalhos):
                self.pedidos.append((metodo, caminho, corpo, cabecalhos))

        sb = Sb()
        ph.enviar(sb, {"obra_id": "o"}, "fvs_eventos", [{"id": i} for i in range(ph.LOTE + 1)], avisar=lambda _: None)
        self.assertEqual([len(p[2]) for p in sb.pedidos], [ph.LOTE, 1])
        metodo, caminho, corpo, cab = sb.pedidos[0]
        self.assertEqual((metodo, caminho), ("POST", "/rest/v1/fvs_eventos?on_conflict=id"))
        self.assertIn("resolution=ignore-duplicates", cab["Prefer"])
        self.assertEqual(corpo[0]["obra_id"], "o")

    def test_recusa_sem_o_ok_da_empresa_e_obra_trocada_antes_de_conectar(self):
        with tempfile.TemporaryDirectory() as d:
            arq = pathlib.Path(d) / "h.json"
            arq.write_text(json.dumps({"obra": "EXE", "fichas_campo": [], "eventos": []}), encoding="utf-8")
            with mock.patch("builtins.print") as saida:
                self.assertEqual(ph.main([str(arq), "--obra", "EXE"]), 1)
                self.assertIn("ok por escrito da empresa", str(saida.call_args))
                self.assertEqual(ph.main([str(arq), "--obra", "TESTE"]), 1)
                self.assertIn("é da obra EXE", str(saida.call_args))


class TestConferirServidor(unittest.TestCase):
    def test_entende_as_respostas_do_servidor(self):
        negado = json.dumps({"code": "42501", "message": "permission denied"}).encode()
        self.assertIs(cs.existe(401, negado), True)
        self.assertIs(cs.existe(200, b"[]"), True)
        self.assertIs(cs.existe(404, json.dumps({"code": "PGRST205"}).encode()), False)
        self.assertIs(cs.existe(400, json.dumps({"code": "42703"}).encode()), False)
        self.assertIsNone(cs.existe(500, b"fora do ar"))
        self.assertIsNone(cs.existe(503, json.dumps({"code": "PGRST001"}).encode()))

    def test_diz_o_que_falta_sem_repetir(self):
        todas = [c for c, _ in cs.CONFERIR]
        self.assertEqual(cs.faltando({c: True for c in todas}), ([], []))
        so_nova = {c: "fvs_fichas_campo" not in c and "ficha_campo_id" not in c for c in todas}
        self.assertEqual(cs.faltando(so_nova), (["20261105120000_fvs_fichas_campo.sql"], []))
        sem_areas = {c: "fvs_areas" not in c and "area_id" not in c for c in todas}
        self.assertEqual(cs.faltando(sem_areas), (["20261106130000_fvs_areas.sql"], []))
        self.assertEqual(cs.faltando({c: None for c in todas}), ([], ["20261104100000_fvs.sql", "20261105120000_fvs_fichas_campo.sql", "20261106130000_fvs_areas.sql"]))


if __name__ == "__main__":
    unittest.main()

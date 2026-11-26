"""Testes do restaurar_backup.py (ensaio de restauração no PC), sem servidor nenhum.

O servidor local do --abrir traduz os pedidos do app (PostgREST) para SQL: aqui, os filtros que o
app manda. A restauração inteira com conferência e o servidor local rodam com a obra fictícia EXE
no Postgres portátil (só no PC Windows dos testes do banco; senão são pulados).
"""

from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import unittest
import urllib.error
import urllib.request
import zipfile

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
sys.path.insert(0, str(AQUI))

import restaurar_backup as rb  # noqa: E402
from test_backup_semanal import OBRA, PESSOA, pasta_exportada, tem_postgres_portatil  # noqa: E402


class TestFiltros(unittest.TestCase):
    def test_select_com_filtros_ordem_e_limite(self):
        params: list = []
        sql = rb.montar_select("obras", [("select", "id,codigo,nome"), ("apagado", "eq.false"), ("order", "codigo.asc"), ("limit", "20")], params)
        self.assertEqual(sql, "select id, codigo, nome from public.obras where apagado = %s order by codigo asc limit 20")
        self.assertEqual(params, ["false"])

    def test_pagina_da_sincronizacao(self):
        params: list = []
        h = '"2026-11-21T10:00:00+00:00"'
        consulta = [("select", "*"), ("obra_id", f"eq.{OBRA}"), ("or", f"(atualizado_em.gt.{h},and(atualizado_em.eq.{h},id.gt.\"abc\"))")]
        sql = rb.montar_filtros(consulta, params)
        self.assertEqual(sql, " where obra_id = %s and (atualizado_em > %s or (atualizado_em = %s and id > %s))")
        self.assertEqual(params, [OBRA, "2026-11-21T10:00:00+00:00", "2026-11-21T10:00:00+00:00", "abc"])

    def test_in_is_e_not(self):
        params: list = []
        sql = rb.montar_filtros([("id", 'in.("a","b")'), ("apagado", "is.false"), ("papel", "not.eq.admin")], params)
        self.assertEqual(sql, " where id::text = any(%s) and apagado is false and not (papel = %s)")
        self.assertEqual(params, [["a", "b"], "admin"])

    def test_nome_estranho_e_recusado(self):
        for pedido in ([("select", "id;drop table obras")], [("x) or (1", "eq.1")], [("id", "zz.1")], [("apagado", "is.talvez")]):
            with self.assertRaises(rb.PedidoInvalido):
                rb.montar_select("obras", pedido, [])

    def test_token_falso_volta_com_a_pessoa(self):
        carga = rb.carga_do_token("Bearer " + rb.token_falso(PESSOA, "a@local.test"))
        self.assertEqual((carga["sub"], carga["role"]), (PESSOA, "authenticated"))
        self.assertIsNone(rb.carga_do_token("chave-local-de-restauracao"))


@unittest.skipUnless(tem_postgres_portatil(), "sem o Postgres portátil dos testes do banco (só no PC Windows)")
class TestRestauracaoInteira(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        base = pathlib.Path(self.t.name)
        trabalho = base / "export"
        pasta = pasta_exportada(trabalho, linhas_diario=3)
        self.zip = base / "backups" / "backup_2026-11-21_1230.zip"
        self.zip.parent.mkdir()
        with zipfile.ZipFile(self.zip, "w") as z:
            for arq in pasta.rglob("*"):
                z.write(arq, arq.relative_to(trabalho).as_posix())
        self.trabalho = base / "restauracao"
        self.trabalho.mkdir()
        self.banco = None

    def tearDown(self):
        if self.banco:
            self.banco.parar()
        self.t.cleanup()

    def _restaurar(self):
        pasta_zip = rb.extrair(rb.backup_mais_novo(self.zip.parent), self.trabalho)
        self.banco = rb.Banco(self.trabalho)
        self.banco.subir_novo()
        rb.restaurar(self.banco, pasta_zip)
        return pasta_zip

    def test_restaura_confere_e_aponta_o_que_falta(self):
        pasta_zip = self._restaurar()
        linhas, problemas = rb.conferir(self.banco, pasta_zip, self.zip)
        texto = "\n".join(linhas)
        self.assertEqual(problemas, [], texto)
        self.assertIn("=== Obra EXE ===", texto)
        self.assertIn("Todas as tabelas batem", texto)
        self.assertIn("1 conta(s) SEM e-mail", texto)  # a obra fictícia vem sem e-mail (como um backup antigo)
        # um arquivo registrado que não veio no zip é apontado
        conn = self.banco.conectar()
        try:
            conn.execute("""insert into public.arquivos (id, obra_id, caminho, nome_original, hash, tamanho, tipo, usuario_id, dispositivo_id, criado_em_dispositivo)
                            values (gen_random_uuid(), %s, %s, 'f.jpg', %s, 3, 'image/jpeg', %s, %s, now())""",
                         [OBRA, f"{OBRA}/fvs/sumiu.jpg", "a" * 64, PESSOA, "00000000-0000-0000-0000-000000000000"])
        finally:
            conn.close()
        linhas, problemas = rb.conferir(self.banco, pasta_zip, self.zip)
        self.assertIn(f"  FALTA no backup: {OBRA}/fvs/sumiu.jpg", linhas)
        self.assertEqual(problemas, ["EXE: 1 arquivo(s) faltando e 0 diferente(s)"])

    def test_conta_volta_com_o_email_e_os_pedidos_do_projetos_entram(self):
        pasta = next(self.zip.parent.parent.glob("export/*/"))
        obra = {"id": OBRA, "codigo": "EXE", "nome": "Obra Exemplo", "empresa": None, "criado_por": None,
                "criado_em_servidor": "2026-11-21T09:00:00+00:00", "atualizado_em": "2026-11-21T09:00:00+00:00", "apagado": False}
        perfis = [{"id": PESSOA, "nome": "Pessoa", "papel": "admin", "criado_em": "2026-11-21T09:00:00+00:00",
                   "atualizado_em": "2026-11-21T09:00:00+00:00", "email": "Pessoa@Exemplo.test"}]
        pedido = {"id": "d0000000-0000-0000-0000-000000000001", "obra_id": OBRA, "pedido_por": PESSOA,
                  "criado_em": "2026-11-21T10:00:00+00:00", "estado": "pronto", "iniciado_em": "2026-11-21T10:01:00+00:00",
                  "concluido_em": "2026-11-21T10:05:00+00:00", "resumo": {"baixadas": 2}, "erro": None}
        (pasta / "restaurar.sql").write_text(rb.exp.montar_sql(obra, [("public.projetos_pedidos_atualizacao", [pedido])], [], perfis, [PESSOA]), encoding="utf-8")
        (pasta / "dados" / "perfis.json").write_text(json.dumps(perfis), encoding="utf-8")
        (pasta / "dados" / "projetos_pedidos_atualizacao.json").write_text(json.dumps([pedido]), encoding="utf-8")
        (pasta / "manifesto.json").write_text(json.dumps({"obra": {"id": OBRA, "codigo": "EXE", "nome": "Obra Exemplo"},
                                                          "linhas": {"public.obras": 1, "public.projetos_pedidos_atualizacao": 1, "public.perfis": 1}}), encoding="utf-8")
        with zipfile.ZipFile(self.zip, "w") as z:
            for arq in pasta.rglob("*"):
                z.write(arq, arq.relative_to(pasta.parent).as_posix())
        pasta_zip = self._restaurar()
        linhas, problemas = rb.conferir(self.banco, pasta_zip, self.zip)
        self.assertEqual(problemas, [], "\n".join(linhas))
        self.assertIn("1 conta(s) voltaram (1 administrador(es), 0 acesso(s) a obra), 1 com o e-mail de login.", linhas)
        conn = self.banco.conectar()
        try:
            self.assertEqual(conn.execute("select email::text from auth.users where id = %s", [PESSOA]).fetchone()[0], "pessoa@exemplo.test")
            # o gatilho do pedido (que troca pedido_por pela pessoa logada) fica desligado na carga
            self.assertEqual(str(conn.execute("select pedido_por from public.projetos_pedidos_atualizacao").fetchone()[0]), PESSOA)
        finally:
            conn.close()
        self.assertFalse(any("projetos_pedidos_atualizacao" in l for l in linhas if l.startswith("  - ")))

    def test_servidor_local_responde_como_o_supabase(self):
        pasta_zip = self._restaurar()
        conn = self.banco.conectar()
        try:  # a obra fictícia vem com uma pessoa comum; o app local entra como administrador
            conn.execute("update public.perfis set papel = 'admin' where id = %s", [PESSOA])
        finally:
            conn.close()
        app = self.trabalho / "app"
        app.mkdir()
        (app / "index.html").write_text("<!doctype html><title>app</title>", encoding="utf-8")
        srv = rb.ServidorLocal(self.banco, pasta_zip, app, rb.bk.porta_livre())
        http_ = srv.iniciar()
        base = f"http://127.0.0.1:{srv.porta}"
        try:
            def pedir(caminho, token=None, metodo="GET", corpo=None, cab=None):
                req = urllib.request.Request(base + caminho, method=metodo, data=None if corpo is None else json.dumps(corpo).encode(),
                                             headers={**({"authorization": f"Bearer {token}"} if token else {}), "content-type": "application/json", **(cab or {})})
                with urllib.request.urlopen(req) as r:
                    return r.status, r.read()

            _, bruto = pedir("/auth/v1/verify", metodo="POST", corpo={"email": "x@y.z", "token": "000000"})
            token = json.loads(bruto)["access_token"]
            # sem login: o banco recusa (as obras não são abertas ao papel anon)
            with self.assertRaises(urllib.error.HTTPError) as erro:
                pedir("/rest/v1/obras?select=id,codigo")
            self.assertEqual(erro.exception.code, 403)
            _, bruto = pedir("/rest/v1/obras?select=id,codigo&apagado=eq.false&order=codigo.asc", token)
            self.assertEqual(json.loads(bruto), [{"id": OBRA, "codigo": "EXE"}])
            _, bruto = pedir(f"/rest/v1/diario_efetivo?select=*&obra_id=eq.{OBRA}&order=atualizado_em.asc,id.asc&limit=500", token)
            self.assertEqual(len(json.loads(bruto)), 3)
            # gravar volta como o app espera (e fica só na base local)
            linha = dict(json.loads(bruto)[0], id="e0000000-0000-0000-0000-0000000000f9", quantidade=9)
            status, _ = pedir("/rest/v1/diario_efetivo?on_conflict=id", token, "POST", [linha], {"prefer": "resolution=ignore-duplicates,return=minimal"})
            self.assertEqual(status, 201)
            _, bruto = pedir(f"/rest/v1/diario_efetivo?select=quantidade&id=eq.{linha['id']}", token, cab={"accept": "application/vnd.pgrst.object+json"})
            self.assertEqual(json.loads(bruto), {"quantidade": 9})
            # o app compilado sai pela mesma porta; telas do app caem no index.html
            self.assertIn(b"<title>app</title>", pedir("/fvs/qualquer")[1])
        finally:
            http_.shutdown()


if __name__ == "__main__":
    unittest.main()

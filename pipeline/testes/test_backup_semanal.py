"""Testes do backup semanal (pipeline/backup_semanal.py), sem servidor.

A exportação contra o PostgREST de verdade já tem teste próprio (app/testes/exportacao.test.ts, no CI).
Aqui: login guardado, rotação dos .zip, o backup inteiro com o servidor de mentira e a conferência
num Postgres local (só no Windows com o Postgres portátil dos testes do banco; senão é pulada).
"""

from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import unittest
import zipfile
from unittest import mock

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))

import backup_semanal as bk  # noqa: E402
import exportar_obra as exp  # noqa: E402

OBRA = "33333333-3333-3333-3333-333333333333"
PESSOA = "00000000-0000-0000-0000-0000000000f1"
NIL = "00000000-0000-0000-0000-000000000000"
CONVITE = {"id": "c0000000-0000-0000-0000-0000000000c1", "obra_id": OBRA, "nome": "Pessoa Convidada", "email": None,
           "papel": "campo", "usuario_id": None, "aceito_em": None, "criado_por": "00000000-0000-0000-0000-00000000dead",
           "criado_em": "2026-11-21T09:00:00+00:00", "apagado": False}
OUTRA_OBRA = "44444444-4444-4444-4444-444444444444"


def tem_postgres_portatil() -> bool:
    try:
        bk.postgres_portatil()
        return True
    except bk.ErroBackup:
        return False


def pasta_exportada(base: pathlib.Path, linhas_diario: int = 2) -> pathlib.Path:
    """Uma exportação da obra fictícia EXE como o exportar_obra.py grava (manifesto + restaurar.sql)."""
    pasta = base / "2026-11-21_export-EXE_v01"
    (pasta / "dados").mkdir(parents=True)
    obra = {"id": OBRA, "codigo": "EXE", "nome": "Obra Exemplo", "empresa": None, "criado_por": None,
            "criado_em_servidor": "2026-11-21T09:00:00+00:00", "atualizado_em": "2026-11-21T09:00:00+00:00", "apagado": False}

    def linha(n: int, sub: str | None) -> dict:
        return {"id": f"e0000000-0000-0000-0000-0000000000e{n}", "obra_id": OBRA, "data": "2026-11-21", "empresa": None,
                "funcao": "Pedreiro", "quantidade": n, "observacao": None, "substitui_id": sub, "cancelado": False,
                "usuario_id": PESSOA, "dispositivo_id": NIL, "criado_em_dispositivo": "2026-11-21T10:00:00+00:00",
                "criado_em_servidor": "2026-11-21T10:00:01+00:00", "atualizado_em": "2026-11-21T10:00:01+00:00", "apagado": False}

    diario = [linha(1, None)] + [linha(n, "e0000000-0000-0000-0000-0000000000e1") for n in range(2, linhas_diario + 1)]
    perfis = [{"id": PESSOA, "nome": "Pessoa", "papel": "usuario", "criado_em": "2026-11-21T09:00:00+00:00", "atualizado_em": "2026-11-21T09:00:00+00:00"}]
    (pasta / "restaurar.sql").write_text(exp.montar_sql(obra, [("public.diario_efetivo", diario)], [], perfis, [PESSOA]), encoding="utf-8")
    (pasta / "dados" / "perfis.json").write_text(json.dumps(perfis), encoding="utf-8")
    # como o exportar_obra.py conta: perfis (pessoas, sem obra_id) entram no manifesto também
    manifesto = {"obra": {"id": OBRA, "codigo": "EXE", "nome": "Obra Exemplo"},
                 "linhas": {"public.obras": 1, "public.diario_efetivo": len(diario), "public.acessos": 0, "public.perfis": len(perfis)}}
    (pasta / "manifesto.json").write_text(json.dumps(manifesto), encoding="utf-8")
    return pasta


class TestRotacao(unittest.TestCase):
    def test_mantem_os_mais_novos_e_nao_toca_em_outros_arquivos(self):
        with tempfile.TemporaryDirectory() as t:
            d = pathlib.Path(t)
            nomes = [f"backup_2026-{m:02d}-01_1230.zip" for m in range(1, 11)]
            for n in nomes:
                (d / n).write_bytes(b"x")
            (d / "ULTIMO_BACKUP.txt").write_text("ok", encoding="utf-8")
            (d / "backup_meu_manual.zip").write_bytes(b"x")  # nome fora do padrão: fica
            apagados = bk.apagar_antigos(d, 8)
            self.assertEqual(apagados, nomes[:2])
            self.assertEqual([p.name for p in bk.backups_na_pasta(d)], nomes[2:])
            self.assertTrue((d / "ULTIMO_BACKUP.txt").exists())
            self.assertTrue((d / "backup_meu_manual.zip").exists())

    def test_manter_zero_e_recusado(self):
        with tempfile.TemporaryDirectory() as t:
            with self.assertRaises(bk.ErroBackup):
                bk.apagar_antigos(pathlib.Path(t), 0)


class TestLoginGuardado(unittest.TestCase):
    def test_renova_e_guarda_o_token_novo_na_hora(self):
        sb = mock.Mock(spec=exp.Supabase)

        def renovar():
            sb.refresh_token = "novo"

        sb.renovar.side_effect = renovar
        sb.json.return_value = {"id": PESSOA, "email": "admin@exemplo.test"}
        with mock.patch.object(bk.sessao_local, "carregar_sessao", return_value={"refresh_token": "velho", "email": "admin@exemplo.test"}), \
                mock.patch.object(bk.sessao_local, "guardar_sessao") as guardar:
            usuario = bk.entrar_com_login_guardado(sb)
        self.assertEqual(usuario["id"], PESSOA)
        guardar.assert_called_once_with("novo", "admin@exemplo.test")

    def test_sem_login_guardado_ou_vencido_diz_como_resolver(self):
        sb = mock.Mock(spec=exp.Supabase)
        with mock.patch.object(bk.sessao_local, "carregar_sessao", return_value=None):
            with self.assertRaisesRegex(bk.ErroBackup, "--entrar"):
                bk.entrar_com_login_guardado(sb)
        sb.renovar.side_effect = exp.ErroExportacao("HTTP 400")
        with mock.patch.object(bk.sessao_local, "carregar_sessao", return_value={"refresh_token": "velho"}), \
                mock.patch.object(bk.sessao_local, "guardar_sessao") as guardar:
            with self.assertRaisesRegex(bk.ErroBackup, "venceu.*--entrar"):
                bk.entrar_com_login_guardado(sb)
        guardar.assert_not_called()


class ServidorDeMentira:
    """Faz o papel do exp.Supabase: login já renovado e a lista de obras."""

    convites = None  # None = o servidor ainda não tem a tabela (404)

    def __init__(self, url, chave):
        self.url, self.refresh_token, self.renovacoes = url, "velho", 0

    def pedir(self, metodo, caminho, *a, **k):
        assert caminho.startswith("/rest/v1/convites"), caminho
        return (404, b'{"code":"PGRST205"}') if self.convites is None else (200, b"[]")

    def linhas(self, tabela, filtros):
        assert tabela == "public.convites"
        return list(self.convites)

    def renovar(self):
        self.refresh_token = "novo"

    def json(self, metodo, caminho, *a, **k):
        if caminho.startswith("/auth/v1/user"):
            return {"id": PESSOA, "email": "admin@exemplo.test"}
        if caminho.startswith("/rest/v1/obras"):
            return [{"codigo": "EXE", "apagado": False}, {"codigo": "VELHA", "apagado": True}]
        raise AssertionError(caminho)


class TestBackupInteiro(unittest.TestCase):
    def test_exporta_as_obras_zipa_registra_e_gira(self):
        with tempfile.TemporaryDirectory() as t:
            destino = pathlib.Path(t) / "Backup Sistema Obra"
            destino.mkdir()
            for m in range(1, 9):
                (destino / f"backup_2026-{m:02d}-01_1230.zip").write_bytes(b"x")
            exportadas = []

            def exportar(args, situacao, sb=None, usuario=None):
                exportadas.append((args.obra, usuario["email"]))
                situacao["final"] = pasta_exportada(pathlib.Path(args.saida))
                return 0

            copia = pathlib.Path(t) / "Meu Drive" / "Backup Sistema Obra"
            argv = ["--destino", str(destino), "--copia", str(copia), "--sem-conferir"]
            with mock.patch.object(bk.exp, "Supabase", ServidorDeMentira), mock.patch.object(bk.exp, "exportar", exportar), \
                    mock.patch.object(bk.sessao_local, "carregar_sessao", return_value={"refresh_token": "velho"}), \
                    mock.patch.object(bk.sessao_local, "guardar_sessao"):
                codigo = bk.main(argv)
            self.assertEqual(codigo, 2)  # conferência pulada conta como aviso
            self.assertEqual(exportadas, [("EXE", "admin@exemplo.test")])  # a obra apagada fica de fora
            zips = bk.backups_na_pasta(destino)
            self.assertEqual(len(zips), 8)  # 8 antigos + 1 novo - 1 apagado
            self.assertEqual(zips[0].name, "backup_2026-02-01_1230.zip")
            with zipfile.ZipFile(zips[-1]) as z:
                self.assertIn("2026-11-21_export-EXE_v01/restaurar.sql", z.namelist())
            status = (destino / "ULTIMO_BACKUP.txt").read_text(encoding="utf-8")
            self.assertTrue(status.startswith("FEITO COM AVISO"), status)
            self.assertIn("backup_2026-01-01_1230.zip", status)
            self.assertEqual([p.name for p in destino.iterdir() if p.is_dir()], [])  # a pasta de trabalho sai
            # a cópia (Drive) recebe o mesmo zip e o resultado
            self.assertEqual([p.name for p in bk.backups_na_pasta(copia)], [zips[-1].name])
            self.assertTrue((copia / "ULTIMO_BACKUP.txt").read_text(encoding="utf-8").startswith("FEITO COM AVISO"))
            self.assertFalse((copia / "backup.log").exists())
            self.assertIn(f"Cópia em {copia.resolve()}.", status)
            with zipfile.ZipFile(zips[-1]) as z:
                self.assertFalse(any(n.startswith("convites/") for n in z.namelist()))  # servidor sem a tabela

    def test_convites_das_obras_do_backup_entram_no_zip(self):
        with tempfile.TemporaryDirectory() as t:
            destino = pathlib.Path(t) / "Backup"

            def exportar(args, situacao, sb=None, usuario=None):
                situacao["final"] = pasta_exportada(pathlib.Path(args.saida))
                return 0

            class ComConvites(ServidorDeMentira):
                convites = [CONVITE, dict(CONVITE, id="c0000000-0000-0000-0000-0000000000c2", obra_id=OUTRA_OBRA)]

            with mock.patch.object(bk.exp, "Supabase", ComConvites), mock.patch.object(bk.exp, "exportar", exportar), \
                    mock.patch.object(bk.sessao_local, "carregar_sessao", return_value={"refresh_token": "velho"}), \
                    mock.patch.object(bk.sessao_local, "guardar_sessao"):
                bk.main(["--destino", str(destino), "--sem-conferir"])
            with zipfile.ZipFile(bk.backups_na_pasta(destino)[-1]) as z:
                convites = json.loads(z.read("convites/convites.json"))
                self.assertIn("convites/restaurar_convites.sql", z.namelist())
            self.assertEqual([c["id"] for c in convites], [CONVITE["id"]])  # só os das obras do backup

    def test_copia_que_falha_vira_aviso_e_o_backup_do_pc_fica(self):
        with tempfile.TemporaryDirectory() as t:
            final = pathlib.Path(t) / "backup_2026-11-21_1230.zip"
            final.write_bytes(b"x")
            ocupado = pathlib.Path(t) / "arquivo"
            ocupado.write_text("não é pasta", encoding="utf-8")
            with self.assertRaisesRegex(bk.ErroBackup, "não consegui copiar"):
                bk.copiar_para(final, ocupado / "Backup", 8)
            self.assertTrue(final.exists())

    def test_sem_login_nao_faz_e_deixa_o_motivo(self):
        with tempfile.TemporaryDirectory() as t:
            destino = pathlib.Path(t)
            with mock.patch.object(bk.sessao_local, "carregar_sessao", return_value=None):
                self.assertEqual(bk.main(["--destino", str(destino)]), 1)
            status = (destino / "ULTIMO_BACKUP.txt").read_text(encoding="utf-8")
            self.assertTrue(status.startswith("NÃO FEITO"), status)
            self.assertIn("--entrar", status)
            self.assertEqual(bk.backups_na_pasta(destino), [])

    def test_destino_dentro_do_repositorio_e_recusado(self):
        with self.assertRaisesRegex(bk.ErroBackup, "repositório"):
            bk.fazer_backup(mock.Mock(destino=str(AQUI)))


@unittest.skipUnless(tem_postgres_portatil(), "sem o Postgres portátil dos testes do banco (só no PC Windows)")
class TestConferencia(unittest.TestCase):
    def _zip(self, t: pathlib.Path, linhas_no_manifesto: int | None = None) -> pathlib.Path:
        trabalho = t / "trabalho"
        pasta = pasta_exportada(trabalho)
        if linhas_no_manifesto is not None:
            m = json.loads((pasta / "manifesto.json").read_text(encoding="utf-8"))
            m["linhas"]["public.diario_efetivo"] = linhas_no_manifesto
            (pasta / "manifesto.json").write_text(json.dumps(m), encoding="utf-8")
        final = t / "backup_2026-11-21_1230.zip"
        bk.zipar([pasta], trabalho, final)
        return final

    def test_backup_restaura_num_postgres_novo_com_todas_as_linhas(self):
        with tempfile.TemporaryDirectory() as t:
            feito = bk.conferir_zip(self._zip(pathlib.Path(t)))
            self.assertEqual(feito, ["EXE: 4 linha(s) restaurada(s) e conferida(s)"])

    def test_convites_restauram_depois_das_obras(self):
        with tempfile.TemporaryDirectory() as t:
            t = pathlib.Path(t)
            zipado = self._zip(t)
            pasta = t / "convites"
            pasta.mkdir()
            (pasta / "convites.json").write_text(json.dumps([CONVITE]), encoding="utf-8")
            (pasta / "restaurar_convites.sql").write_text(bk.sql_dos_convites([CONVITE]), encoding="utf-8")
            with zipfile.ZipFile(zipado, "a") as z:
                for arq in pasta.iterdir():
                    z.write(arq, f"convites/{arq.name}")
            feito = bk.conferir_zip(zipado)
            tem_migracao = any("convites" in m.name for m in (bk.REPO / "supabase" / "migrations").glob("*.sql"))
            esperado = "convites: 1 restaurado(s) e conferido(s)" if tem_migracao else \
                "convites: 1 no zip, não conferidos (a migração dos convites não está neste repositório)"
            self.assertEqual(feito, ["EXE: 4 linha(s) restaurada(s) e conferida(s)", esperado])

    def test_confere_mesmo_com_os_testes_do_banco_ocupando_a_porta_deles(self):
        import socket  # noqa: PLC0415

        with tempfile.TemporaryDirectory() as t, socket.socket() as ocupada:
            ocupada.bind(("127.0.0.1", bk.postgres_portatil().PORTA))
            ocupada.listen()
            feito = bk.conferir_zip(self._zip(pathlib.Path(t)))
            self.assertEqual(feito, ["EXE: 4 linha(s) restaurada(s) e conferida(s)"])

    def test_linha_faltando_no_restaurar_e_apontada(self):
        with tempfile.TemporaryDirectory() as t:
            with self.assertRaisesRegex(bk.ErroBackup, "diario_efetivo: 2 de 3"):
                bk.conferir_zip(self._zip(pathlib.Path(t), linhas_no_manifesto=3))


if __name__ == "__main__":
    unittest.main()

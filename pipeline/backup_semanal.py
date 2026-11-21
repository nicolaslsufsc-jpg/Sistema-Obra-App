"""Backup do Sistema Obra no PC: todas as obras num .zip com data, conferido num Postgres local.

Feito para o Agendador de Tarefas do Windows (uma vez por semana, sem ninguém na frente do PC).
Guia completo: docs/modulos/0_nucleo_backup.md.

Uso (no PC, com internet, na raiz do repositório):
    py pipeline/backup_semanal.py --entrar
        Primeira vez (e quando o login vencer): pede o e-mail e o código, como o app, e guarda o
        login neste PC (%LOCALAPPDATA%\\SistemaObra\\sessao_supabase.json, fora do repositório).
    py pipeline/backup_semanal.py --destino "C:\\Users\\nicol\\Nicolas\\09_ESTAGIO\\Backup Sistema Obra"
        Faz o backup sem perguntar nada: usa o login guardado.

O que faz, nesta ordem:
  1. Entra com o login guardado (renova sozinho; guarda o novo na hora, porque o antigo deixa de valer).
  2. Exporta cada obra que o login vê com pipeline/exportar_obra.py: dados (JSON e CSV), arquivos do
     armazenamento conferidos pelo SHA-256 e o restaurar.sql.
  3. Junta tudo em backup_AAAA-MM-DD_HHMM.zip na pasta de destino.
  4. Confere o .zip: cria um Postgres descartável (o portátil dos testes do banco), aplica as
     migrações do repositório, roda cada restaurar.sql e compara as linhas com o manifesto.
  5. Mantém só os últimos --manter backups (padrão 8). Só apaga arquivos com o nome backup_*.zip.
  6. Com --copia PASTA (ex.: a pasta do Google Drive no PC): copia o .zip para lá e mantém os
     mesmos --manter backups lá também. Falha na cópia vira aviso; o backup do PC fica.
  7. Escreve ULTIMO_BACKUP.txt na pasta de destino (e na cópia) e acrescenta uma linha em backup.log.

Os convites (pessoas convidadas que ainda não entraram, só o admin vê) entram no zip na pasta
convites/, com um restaurar_convites.sql. Se o servidor ainda não tem a tabela, essa parte é pulada.

Não usa chave secreta (service_role): vê o que o login guardado vê. Para o backup ser completo, o login
guardado tem de ser do administrador. O login guardado dá acesso ao que esse login vê: trate a pasta
%LOCALAPPDATA%\\SistemaObra como você trata a sua senha.

Saída: 0 = backup feito e conferido; 2 = feito, mas com aviso (arquivo que não baixou ou conferência
pulada); 1 = não feito (o motivo fica no ULTIMO_BACKUP.txt).
"""

from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
import pathlib
import re
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import types
import zipfile

AQUI = pathlib.Path(__file__).resolve().parent
REPO = AQUI.parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI / "projetos"))

import exportar_obra as exp  # noqa: E402
import sessao_local  # noqa: E402

MANTER_PADRAO = 8
PADRAO_ZIP = re.compile(r"^backup_\d{4}-\d{2}-\d{2}_\d{4}\.zip$")
ARQUIVO_STATUS = "ULTIMO_BACKUP.txt"
ARQUIVO_LOG = "backup.log"
PASTA_CONVITES = "convites"


class ErroBackup(Exception):
    pass


# ---------------------------------------------------------------------------
# Login guardado
# ---------------------------------------------------------------------------


def entrar_com_login_guardado(sb: exp.Supabase) -> dict:
    """Usa o refresh token guardado neste PC. Devolve o usuário. Guarda o token novo na hora."""
    sessao = sessao_local.carregar_sessao()
    if not sessao:
        raise ErroBackup("Não há login guardado neste PC. Rode uma vez: py pipeline/backup_semanal.py --entrar")
    sb.refresh_token = sessao["refresh_token"]
    try:
        sb.renovar()
    except exp.ErroExportacao as e:
        raise ErroBackup(f"O login guardado venceu ({e}). Rode de novo: py pipeline/backup_semanal.py --entrar") from e
    # o token antigo deixou de valer: se não guardar o novo agora, o próximo backup não entra
    sessao_local.guardar_sessao(sb.refresh_token, sessao.get("email"))
    return sb.json("GET", "/auth/v1/user")


def entrar_perguntando(sb: exp.Supabase, email: str | None) -> dict:
    email = (email or input("Seu e-mail (o do administrador): ")).strip().lower()
    print(f"Mandando código para {email}...")
    usuario = sb.entrar(email, lambda: input("Código que chegou por e-mail (olhe também a caixa de spam): "))
    sessao_local.guardar_sessao(sb.refresh_token, email)
    print(f"Login guardado neste PC ({sessao_local.ARQUIVO_SESSAO}).")
    return usuario


# ---------------------------------------------------------------------------
# Rotação e zip
# ---------------------------------------------------------------------------


def nome_do_zip(agora: dt.datetime) -> str:
    return f"backup_{agora:%Y-%m-%d_%H%M}.zip"


def backups_na_pasta(destino: pathlib.Path) -> list[pathlib.Path]:
    """Só os .zip deste script, do mais antigo para o mais novo (o nome tem a data)."""
    return sorted(p for p in destino.iterdir() if p.is_file() and PADRAO_ZIP.match(p.name))


def apagar_antigos(destino: pathlib.Path, manter: int) -> list[str]:
    """Apaga os backups além dos `manter` mais novos. Nunca toca em outro arquivo da pasta."""
    if manter < 1:
        raise ErroBackup("--manter tem de ser pelo menos 1")
    todos = backups_na_pasta(destino)
    sobra = todos[: max(0, len(todos) - manter)]
    for p in sobra:
        p.unlink()
    return [p.name for p in sobra]


def zipar(pastas: list[pathlib.Path], raiz: pathlib.Path, destino_zip: pathlib.Path) -> None:
    """Zip das pastas exportadas. Grava em .incompleto e só renomeia no fim (queda no meio não deixa zip pela metade)."""
    parcial = destino_zip.with_name(destino_zip.name + ".incompleto")
    with zipfile.ZipFile(parcial, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as z:
        for pasta in pastas:
            for arq in sorted(pasta.rglob("*")):
                if arq.is_file():
                    z.write(arq, arq.relative_to(raiz).as_posix())
    os.replace(parcial, destino_zip)


# ---------------------------------------------------------------------------
# Conferência: restaurar num Postgres descartável
# ---------------------------------------------------------------------------


def postgres_portatil():
    """O Postgres portátil e o executor de SQL dos testes do banco (supabase/testes/rodar_testes_windows.py)."""
    sys.path.insert(0, str(REPO / "supabase" / "testes"))
    try:
        import rodar_testes_windows as r  # noqa: PLC0415
    except ImportError as e:  # sem psycopg
        raise ErroBackup(f"sem o necessário para conferir ({e}); pip install psycopg[binary]") from e
    if not os.path.exists(os.path.join(r.BIN, "initdb.exe")):
        raise ErroBackup(f"Postgres portátil não encontrado em {r.BIN} (veja supabase/testes/rodar_testes_windows.py)")
    return r


def conferir_zip(caminho_zip: pathlib.Path, repo: pathlib.Path = REPO) -> list[str]:
    """Restaura o backup num Postgres novo e compara as linhas com o manifesto de cada obra.

    Devolve a lista do que foi conferido (uma linha por obra). Erro = ErroBackup.
    """
    r = postgres_portatil()
    import psycopg  # noqa: PLC0415

    with zipfile.ZipFile(caminho_zip) as z:
        ruim = z.testzip()
        if ruim:
            raise ErroBackup(f"o zip tem um arquivo estragado: {ruim}")
        tmp = pathlib.Path(tempfile.mkdtemp(prefix="conferir_backup_"))
        try:
            z.extractall(tmp / "zip")
            return _restaurar_e_contar(r, psycopg, tmp, repo)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


def porta_livre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _restaurar_e_contar(r, psycopg, tmp: pathlib.Path, repo: pathlib.Path) -> list[str]:
    manifestos = sorted((tmp / "zip").glob("*/manifesto.json"))
    if not manifestos:
        raise ErroBackup("o zip não tem nenhuma obra (manifesto.json)")
    dados = tmp / "pg"
    porta = porta_livre()  # nunca a dos testes do banco: com eles rodando, o backup cairia no Postgres deles
    subprocess.run([os.path.join(r.BIN, "initdb.exe"), "-D", str(dados), "-U", "postgres", "-A", "trust", "-E", "UTF8", "--no-locale"],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.Popen([os.path.join(r.BIN, "pg_ctl.exe"), "-D", str(dados), "-l", str(tmp / "pg.log"),
                      "-o", f"-p {porta} -c listen_addresses=127.0.0.1", "start"],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
    conn = None
    for _ in range(60):
        try:
            conn = psycopg.connect(f"host=127.0.0.1 port={porta} user=postgres dbname=postgres", autocommit=True)
            break
        except Exception:  # noqa: BLE001 — o Postgres ainda está subindo
            time.sleep(0.5)
    if conn is None:
        raise ErroBackup(f"o Postgres local não subiu para conferir (porta {porta}; veja {tmp / 'pg.log'})")
    feito: list[str] = []
    try:
        try:
            r.rodar_arquivo(conn, str(repo / "supabase" / "testes" / "stub_supabase.sql"), {})
            for m in sorted(glob.glob(str(repo / "supabase" / "migrations" / "*.sql"))):
                r.rodar_arquivo(conn, m, {})
        except SystemExit as e:
            raise ErroBackup("as migrações do repositório não rodaram no Postgres local (erro acima)") from e
        for man in manifestos:
            m = json.loads(man.read_text(encoding="utf-8"))
            obra = m["obra"]
            try:
                r.rodar_arquivo(conn, str(man.parent / "restaurar.sql"), {})
            except SystemExit as e:
                raise ErroBackup(f"o restaurar.sql da obra {obra['codigo']} falhou no Postgres local (erro acima)") from e
            diferencas = []
            for tabela, esperado in m["linhas"].items():
                try:
                    achado = _contar_restauradas(conn, tabela, obra["id"], man.parent / "dados")
                except psycopg.Error as e:
                    raise ErroBackup(f"obra {obra['codigo']}: não consegui contar {tabela} no Postgres local ({e})") from e
                if achado != esperado:
                    diferencas.append(f"{tabela}: {achado} de {esperado}")
            if diferencas:
                raise ErroBackup(f"obra {obra['codigo']}: restaurou com linhas faltando ({'; '.join(diferencas)})")
            feito.append(f"{obra['codigo']}: {sum(m['linhas'].values())} linha(s) restaurada(s) e conferida(s)")
        feito += _conferir_convites(r, conn, tmp / "zip" / PASTA_CONVITES)
    finally:
        conn.close()
        subprocess.run([os.path.join(r.BIN, "pg_ctl.exe"), "-D", str(dados), "-m", "immediate", "stop"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
        time.sleep(1)
    return feito


def _conferir_convites(r, conn, pasta: pathlib.Path) -> list[str]:
    """Restaura os convites (depois das obras e das pessoas) e confere quantos voltaram."""
    sql = pasta / "restaurar_convites.sql"
    if not sql.exists():
        return []
    convites = json.loads((pasta / "convites.json").read_text(encoding="utf-8"))
    existe = conn.execute("select to_regclass('public.convites') is not null").fetchone()[0]
    if not existe:
        return [f"convites: {len(convites)} no zip, não conferidos (a migração dos convites não está neste repositório)"]
    try:
        r.rodar_arquivo(conn, str(sql), {})
    except SystemExit as e:
        raise ErroBackup("o restaurar_convites.sql falhou no Postgres local (erro acima)") from e
    ids = [c["id"] for c in convites]
    achados = conn.execute("select count(*) from public.convites where id = any(%s::uuid[])", [ids]).fetchone()[0]
    if achados != len(convites):
        raise ErroBackup(f"convites: restaurou {achados} de {len(convites)}")
    return [f"convites: {len(convites)} restaurado(s) e conferido(s)"]


def _contar_restauradas(conn, tabela: str, obra_id: str, pasta_dados: pathlib.Path) -> int:
    """Quantas linhas da obra a tabela tem depois de restaurar.

    Tabela da obra (coluna obra_id): pelas linhas da obra. Tabela de pessoas (perfis, sem obra_id): pelos
    ids que a exportação gravou em dados/<tabela>.json.
    """
    if tabela == "public.obras":
        return conn.execute("select count(*) from public.obras where id = %s", [obra_id]).fetchone()[0]
    esquema, nome = tabela.split(".", 1)
    tem_obra = conn.execute(
        "select exists (select 1 from information_schema.columns where table_schema = %s and table_name = %s and column_name = 'obra_id')",
        [esquema, nome],
    ).fetchone()[0]
    if tem_obra:
        return conn.execute(f"select count(*) from {tabela} where obra_id = %s", [obra_id]).fetchone()[0]
    arquivo = pasta_dados / f"{nome}.json"
    ids = [l["id"] for l in json.loads(arquivo.read_text(encoding="utf-8"))] if arquivo.exists() else []
    return conn.execute(f"select count(*) from {tabela} where id = any(%s::uuid[])", [ids]).fetchone()[0]


# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------


def exportar_obras(sb: exp.Supabase, usuario: dict, codigos: list[str], trabalho: pathlib.Path, url: str, chave: str) -> tuple[list[pathlib.Path], list[str]]:
    pastas: list[pathlib.Path] = []
    avisos: list[str] = []
    for codigo in codigos:
        args = types.SimpleNamespace(obra=codigo, saida=str(trabalho), email=None, zip=False, url=url, chave=chave, permitir_repositorio=False)
        situacao: dict = {"pasta": None}
        try:
            resultado = exp.exportar(args, situacao, sb=sb, usuario=usuario)
        finally:
            # o exportar pode ter renovado o login no meio: guarda o token que vale agora
            if sb.refresh_token:
                sessao_local.guardar_sessao(sb.refresh_token, usuario.get("email"))
        if resultado == 2:
            avisos.append(f"{codigo}: algum arquivo não baixou (ver o manifesto.json da obra no zip)")
        pastas.append(pathlib.Path(situacao["final"]))
    return pastas, avisos


def exportar_convites(sb: exp.Supabase, pastas: list[pathlib.Path], trabalho: pathlib.Path) -> pathlib.Path | None:
    """Convites das obras do backup em trabalho/convites/. None se o servidor ainda não tem a tabela."""
    status, bruto = sb.pedir("GET", "/rest/v1/convites?select=id&limit=1")
    if status == 404:  # PostgREST: tabela que não existe (a migração dos convites ainda não foi aplicada)
        return None
    if status >= 400:
        raise exp.ErroExportacao(f"GET /rest/v1/convites -> HTTP {status}: {bruto[:300].decode('utf-8', 'replace')}")
    obras = {json.loads((p / "manifesto.json").read_text(encoding="utf-8"))["obra"]["id"] for p in pastas}
    convites = [c for c in sb.linhas("public.convites", {}) if c.get("obra_id") in obras]
    pasta = trabalho / PASTA_CONVITES
    pasta.mkdir()
    (pasta / "convites.json").write_text(json.dumps(convites, ensure_ascii=False, indent=1), encoding="utf-8")
    (pasta / "restaurar_convites.sql").write_text(sql_dos_convites(convites), encoding="utf-8")
    return pasta


def sql_dos_convites(convites: list[dict]) -> str:
    """Recria os convites depois dos restaurar.sql das obras. Quem não voltou como pessoa fica em branco."""
    marca = f"$so_{secrets.token_hex(6)}$"
    return "\n".join([
        "-- Convites do Sistema Obra (pessoas convidadas). Rode DEPOIS dos restaurar.sql das obras.",
        "begin;",
        "create temp table so_convites on commit drop as",
        f"  select * from jsonb_populate_recordset(null::public.convites, {exp.literal_json(convites, marca)}::jsonb);",
        "insert into public.convites (id, obra_id, nome, email, papel, usuario_id, aceito_em, criado_por, criado_em, apagado)",
        "select c.id, c.obra_id, c.nome, c.email, c.papel,",
        "  (select p.id from public.perfis p where p.id = c.usuario_id), c.aceito_em,",
        "  (select p.id from public.perfis p where p.id = c.criado_por), c.criado_em, c.apagado",
        "from so_convites c",
        "where exists (select 1 from public.obras o where o.id = c.obra_id)",
        "on conflict (id) do nothing;",
        "commit;",
        "",
    ])


def copiar_para(final: pathlib.Path, copia: pathlib.Path, manter: int) -> list[str]:
    """Copia o .zip para a outra pasta (o Google Drive) e gira lá também. Erro = ErroBackup."""
    if exp.dentro_de_repositorio(copia):
        raise ErroBackup(f"a pasta da cópia {copia} fica dentro de um repositório git")
    try:
        copia.mkdir(parents=True, exist_ok=True)
        parcial = copia / (final.name + ".incompleto")
        shutil.copyfile(final, parcial)
        os.replace(parcial, copia / final.name)
        apagados = apagar_antigos(copia, manter)
    except OSError as e:
        raise ErroBackup(f"não consegui copiar para {copia}: {exp.descrever(e)}") from e
    linhas = [f"Cópia em {copia}."]
    if apagados:
        linhas.append(f"Apagados da cópia por serem antigos: {', '.join(apagados)}.")
    return linhas


def codigos_das_obras(sb: exp.Supabase, pedidas: str | None) -> list[str]:
    obras = sb.json("GET", "/rest/v1/obras?select=codigo,apagado&order=codigo.asc")
    vistas = [o["codigo"] for o in obras if not o.get("apagado")]
    if not pedidas:
        if not vistas:
            raise ErroBackup("o login guardado não vê nenhuma obra")
        return vistas
    quero = [c.strip().upper() for c in pedidas.split(",") if c.strip()]
    faltam = [c for c in quero if c not in vistas]
    if faltam:
        raise ErroBackup(f"obra(s) que o login não vê: {', '.join(faltam)}")
    return quero


def pasta_da_opcao(texto: str) -> pathlib.Path:
    return pathlib.Path(texto.strip().rstrip('"')).expanduser().resolve()


def fazer_backup(args) -> tuple[int, list[str]]:
    destino = pathlib.Path(args.destino.strip().rstrip('"')).expanduser().resolve()
    if exp.dentro_de_repositorio(destino):
        raise ErroBackup(f"A pasta {destino} fica dentro de um repositório git. Dados de obra não entram no repositório.")
    destino.mkdir(parents=True, exist_ok=True)
    sb = exp.Supabase(args.url, args.chave)
    usuario = entrar_com_login_guardado(sb)
    codigos = codigos_das_obras(sb, args.obras)
    agora = dt.datetime.now()
    final = destino / nome_do_zip(agora)
    if final.exists():
        raise ErroBackup(f"já existe {final.name} (dois backups no mesmo minuto)")
    linhas = [f"Backup de {agora:%d/%m/%Y %H:%M} por {usuario.get('email')}: obras {', '.join(codigos)}."]
    trabalho = pathlib.Path(tempfile.mkdtemp(prefix="backup_trabalho_", dir=destino))
    try:
        pastas, avisos = exportar_obras(sb, usuario, codigos, trabalho, args.url, args.chave)
        convites = exportar_convites(sb, pastas, trabalho)
        zipar(pastas + ([convites] if convites else []), trabalho, final)
    finally:
        shutil.rmtree(trabalho, ignore_errors=True)
    linhas.append(f"Arquivo: {final.name} ({final.stat().st_size / 1024 / 1024:.1f} MB).")
    if args.sem_conferir:
        avisos.append("conferência pulada (--sem-conferir)")
    else:
        try:
            linhas += conferir_zip(final)
        except ErroBackup as e:
            avisos.append(f"conferência no Postgres local não foi feita ou falhou: {e}")
    apagados = apagar_antigos(destino, args.manter)
    if apagados:
        linhas.append(f"Apagados por serem antigos (mantém {args.manter}): {', '.join(apagados)}.")
    if getattr(args, "copia", None):
        try:
            linhas += copiar_para(final, pasta_da_opcao(args.copia), args.manter)
        except ErroBackup as e:
            avisos.append(f"o backup ficou só no PC: {e}")
    linhas += [f"AVISO: {a}" for a in avisos]
    return (2 if avisos else 0), linhas


def registrar(destino: str, codigo: int, linhas: list[str], log: bool = True) -> None:
    """ULTIMO_BACKUP.txt (só o último) e backup.log (uma linha por vez). Falhar aqui não derruba o resto."""
    try:
        pasta = pathlib.Path(destino.strip().rstrip('"')).expanduser()
        pasta.mkdir(parents=True, exist_ok=True)
        situacao = {0: "DEU CERTO", 2: "FEITO COM AVISO", 1: "NÃO FEITO"}[codigo]
        texto = f"{situacao} ({dt.datetime.now():%d/%m/%Y %H:%M})\n" + "\n".join(linhas) + "\n"
        (pasta / ARQUIVO_STATUS).write_text(texto, encoding="utf-8")
        if not log:
            return
        with open(pasta / ARQUIVO_LOG, "a", encoding="utf-8") as arq:
            arq.write(f"{dt.datetime.now():%Y-%m-%d %H:%M} {situacao}: " + " | ".join(linhas) + "\n")
    except OSError as e:
        print(f"(não consegui escrever o {ARQUIVO_STATUS}: {e})", file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass
    p = argparse.ArgumentParser(description="Backup semanal do Sistema Obra (todas as obras num .zip conferido).")
    p.add_argument("--destino", help="pasta dos backups, fora do repositório")
    p.add_argument("--copia", help="outra pasta que recebe uma cópia de cada backup (ex.: a do Google Drive no PC)")
    p.add_argument("--manter", type=int, default=MANTER_PADRAO, help=f"quantos backups manter (padrão {MANTER_PADRAO})")
    p.add_argument("--obras", help="só estas obras, separadas por vírgula (padrão: todas que o login vê)")
    p.add_argument("--entrar", action="store_true", help="pede e-mail e código e guarda o login neste PC")
    p.add_argument("--email", help="com --entrar: o e-mail (se faltar, pergunta)")
    p.add_argument("--conferir", metavar="ZIP", help="só confere um backup já feito, num Postgres local")
    p.add_argument("--sem-conferir", action="store_true", help=argparse.SUPPRESS)
    p.add_argument("--url", default=os.environ.get("SISTEMA_OBRA_URL", exp.URL_PADRAO), help=argparse.SUPPRESS)
    p.add_argument("--chave", default=os.environ.get("SISTEMA_OBRA_CHAVE", exp.CHAVE_PADRAO), help=argparse.SUPPRESS)
    args = p.parse_args(argv)

    if args.entrar:
        try:
            entrar_perguntando(exp.Supabase(args.url, args.chave), args.email)
            return 0
        except (exp.ErroExportacao, KeyboardInterrupt, EOFError) as e:
            print(f"ERRO: {e}", file=sys.stderr)
            return 1
    if args.conferir:
        try:
            for linha in conferir_zip(pathlib.Path(args.conferir)):
                print(linha)
            print("Conferido: o backup restaura num Postgres novo com todas as linhas.")
            return 0
        except (ErroBackup, OSError, zipfile.BadZipFile) as e:
            print(f"ERRO: {e}", file=sys.stderr)
            return 1
    if not args.destino:
        p.error("falta --destino (a pasta dos backups)")

    try:
        codigo, linhas = fazer_backup(args)
    except (ErroBackup, exp.ErroExportacao) as e:
        codigo, linhas = 1, [f"ERRO: {e}"]
    except OSError as e:
        codigo, linhas = 1, [f"ERRO: problema ao gravar no PC: {exp.descrever(e)}"]
    except Exception as e:  # noqa: BLE001 — sem ninguém olhando, o motivo tem de ficar no ULTIMO_BACKUP.txt
        codigo, linhas = 1, [f"ERRO inesperado: {type(e).__name__}: {e}"]
    registrar(args.destino, codigo, linhas)
    if args.copia:
        registrar(args.copia, codigo, linhas, log=False)  # para ver o resultado pelo Drive, no celular
    for linha in linhas:
        print(linha, file=sys.stderr if codigo == 1 else sys.stdout)
    return codigo


if __name__ == "__main__":
    sys.exit(main())

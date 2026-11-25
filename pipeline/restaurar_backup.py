"""Restaura um backup do Sistema Obra num Postgres local, confere e abre o app em cima dele.

Tudo acontece neste PC: não lê nem escreve em servidor nenhum. Serve para saber se o backup
presta (ensaio de restauração) e para olhar os dados de um backup antigo.
Guia: docs/modulos/0_nucleo_backup.md, seção "Como restaurar".

Uso (na raiz do repositório):
    py pipeline/restaurar_backup.py --backups "C:\\...\\Backup Sistema Obra"
        Pega o backup_*.zip mais novo da pasta, restaura numa base nova, confere e escreve
        RELATORIO_RESTAURACAO.txt na pasta de trabalho (padrão: <backups>\\restauracao).
    py pipeline/restaurar_backup.py --backups "C:\\...\\Backup Sistema Obra" --abrir
        Depois de conferir, compila o app apontado para este PC e abre no navegador
        (http://127.0.0.1:54360). Na tela de entrada vale qualquer e-mail e qualquer código.
        Ctrl+C encerra e desliga o banco.
    Outras opções: --zip ARQUIVO (um backup específico), --pasta PASTA (pasta de trabalho),
    --porta N, --sem-compilar (usa o app já compilado na pasta de trabalho).

O que confere (e escreve no relatório):
  - linhas por tabela: manifesto x dados/*.json x o que voltou no banco;
  - registros da FVS e do Concreto e a data do último de cada tabela;
  - arquivos (fotos, plantas, anexos): cada linha de "arquivos" tem o arquivo no backup, com o
    tamanho e o SHA-256 registrados; fotos e anexos que apontam para arquivo que não veio;
  - tabelas do banco que guardam dado de obra e não entram no backup;
  - contas: quem voltou e o que não volta (e-mail de login).

O "servidor" local do --abrir imita só o que o app usa do Supabase (leitura e gravação de
tabelas, funções, login falso e arquivos), com as mesmas regras de acesso do banco (RLS).
O que for gravado ali fica só nesta base local e some na próxima restauração.

Saída: 0 = restaurou e conferiu sem diferença; 2 = restaurou com diferença ou aviso; 1 = não restaurou.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import glob
import hashlib
import http.server
import json
import mimetypes
import os
import pathlib
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
import uuid
import webbrowser
import zipfile

AQUI = pathlib.Path(__file__).resolve().parent
REPO = AQUI.parent
sys.path.insert(0, str(AQUI))

import backup_semanal as bk  # noqa: E402
import exportar_obra as exp  # noqa: E402

PORTA_APP = 54360
RELATORIO = "RELATORIO_RESTAURACAO.txt"
IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")
TABELAS_FVS = ["fvs_eventos", "fvs_fichas_campo", "fvs_fotos", "fvs_areas", "fvs_regras", "fichas_modelo"]
TABELAS_CONCRETO = ["concretagens", "caminhoes", "caminhao_elementos", "caminhao_areas", "cp_resultados"]


class ErroRestauracao(Exception):
    pass


# ---------------------------------------------------------------------------
# Restaurar
# ---------------------------------------------------------------------------


def backup_mais_novo(pasta: pathlib.Path) -> pathlib.Path:
    if not pasta.is_dir():
        raise ErroRestauracao(f"a pasta dos backups não existe: {pasta}")
    todos = bk.backups_na_pasta(pasta)
    if not todos:
        raise ErroRestauracao(f"não há nenhum backup_AAAA-MM-DD_HHMM.zip em {pasta}")
    return todos[-1]


def extrair(caminho_zip: pathlib.Path, trabalho: pathlib.Path) -> pathlib.Path:
    destino = trabalho / "zip"
    if destino.exists():
        shutil.rmtree(destino)
    with zipfile.ZipFile(caminho_zip) as z:
        ruim = z.testzip()
        if ruim:
            raise ErroRestauracao(f"o zip tem um arquivo estragado: {ruim}")
        z.extractall(destino)
    if not list(destino.glob("*/manifesto.json")):
        raise ErroRestauracao("o zip não tem nenhuma obra (manifesto.json)")
    return destino


class Banco:
    """O Postgres portátil numa pasta própria (base nova a cada restauração)."""

    def __init__(self, trabalho: pathlib.Path):
        self.r = bk.postgres_portatil()
        import psycopg  # noqa: PLC0415

        self.psycopg = psycopg
        self.dados = trabalho / "pg"
        self.log = trabalho / "pg.log"
        self.porta = bk.porta_livre()
        self.dsn = f"host=127.0.0.1 port={self.porta} user=postgres dbname=postgres"

    def _pg(self, programa: str) -> str:
        return os.path.join(self.r.BIN, programa)

    def subir_novo(self) -> None:
        self.parar()
        if self.dados.exists():
            shutil.rmtree(self.dados)
        subprocess.run([self._pg("initdb.exe"), "-D", str(self.dados), "-U", "postgres", "-A", "trust", "-E", "UTF8", "--no-locale"],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.Popen([self._pg("pg_ctl.exe"), "-D", str(self.dados), "-l", str(self.log),
                          "-o", f"-p {self.porta} -c listen_addresses=127.0.0.1", "start"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
        for _ in range(80):
            try:
                self.conectar().close()
                return
            except Exception:  # noqa: BLE001 — ainda subindo
                time.sleep(0.5)
        raise ErroRestauracao(f"o Postgres local não subiu (veja {self.log})")

    def conectar(self, autocommit: bool = True):
        return self.psycopg.connect(self.dsn, autocommit=autocommit)

    def parar(self) -> None:
        if (self.dados / "postmaster.pid").exists():
            subprocess.run([self._pg("pg_ctl.exe"), "-D", str(self.dados), "-m", "fast", "stop"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
            time.sleep(1)


def restaurar(banco: Banco, pasta_zip: pathlib.Path, repo: pathlib.Path = REPO) -> None:
    conn = banco.conectar()
    try:
        try:
            banco.r.rodar_arquivo(conn, str(repo / "supabase" / "testes" / "stub_supabase.sql"), {})
            for m in sorted(glob.glob(str(repo / "supabase" / "migrations" / "*.sql"))):
                banco.r.rodar_arquivo(conn, m, {})
        except SystemExit as e:
            raise ErroRestauracao("as migrações do repositório não rodaram no Postgres local (erro acima)") from e
        for man in sorted(pasta_zip.glob("*/manifesto.json")):
            codigo = json.loads(man.read_text(encoding="utf-8"))["obra"]["codigo"]
            try:
                banco.r.rodar_arquivo(conn, str(man.parent / "restaurar.sql"), {})
            except SystemExit as e:
                raise ErroRestauracao(f"o restaurar.sql da obra {codigo} falhou (erro acima)") from e
        convites = pasta_zip / bk.PASTA_CONVITES / "restaurar_convites.sql"
        if convites.exists() and conn.execute("select to_regclass('public.convites') is not null").fetchone()[0]:
            try:
                banco.r.rodar_arquivo(conn, str(convites), {})
            except SystemExit as e:
                raise ErroRestauracao("o restaurar_convites.sql falhou (erro acima)") from e
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Conferir
# ---------------------------------------------------------------------------


def sha256_do_arquivo(caminho: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def _colunas(conn, tabela: str) -> set[str]:
    return {r[0] for r in conn.execute(
        "select column_name from information_schema.columns where table_schema = 'public' and table_name = %s", [tabela])}


def _hora(valor) -> str:
    if valor is None:
        return "sem data"
    return valor.astimezone().strftime("%d/%m/%Y %H:%M")


def conferir(banco: Banco, pasta_zip: pathlib.Path, caminho_zip: pathlib.Path) -> tuple[list[str], list[str]]:
    """Devolve (linhas do relatório, problemas). Problema = algo que não voltou igual."""
    conn = banco.conectar()
    linhas: list[str] = []
    problemas: list[str] = []
    try:
        idade = dt.datetime.now() - dt.datetime.fromtimestamp(caminho_zip.stat().st_mtime)
        linhas += [f"Backup: {caminho_zip.name} ({caminho_zip.stat().st_size / 1024 / 1024:.1f} MB), feito há {idade.days} dia(s).", ""]
        no_backup: set[str] = set()
        for man in sorted(pasta_zip.glob("*/manifesto.json")):
            m = json.loads(man.read_text(encoding="utf-8"))
            obra, codigo = m["obra"]["id"], m["obra"]["codigo"]
            linhas.append(f"=== Obra {codigo} ===")
            # 1. linhas por tabela
            total = 0
            diferentes = []
            for tabela, esperado in m["linhas"].items():
                no_backup.add(tabela)
                nome = tabela.split(".", 1)[1]
                arq = man.parent / "dados" / f"{nome}.json"
                no_json = len(json.loads(arq.read_text(encoding="utf-8"))) if arq.exists() else None
                achado = bk._contar_restauradas(conn, tabela, obra, man.parent / "dados")  # noqa: SLF001
                total += achado
                if achado != esperado or (no_json is not None and no_json != esperado and tabela != "public.obras"):
                    diferentes.append(f"{nome}: manifesto {esperado}, json {no_json}, banco {achado}")
            com_dado = sum(1 for v in m["linhas"].values() if v)
            linhas.append(f"Linhas: {total} restauradas em {len(m['linhas'])} tabelas ({com_dado} com dado).")
            if diferentes:
                problemas += [f"{codigo}: {d}" for d in diferentes]
                linhas += [f"  DIFERENTE: {d}" for d in diferentes]
            else:
                linhas.append("  Todas as tabelas batem: manifesto = arquivo de dados = banco restaurado.")
            # 2. FVS e Concreto, com a data do último registro
            for titulo, tabelas in (("FVS", TABELAS_FVS), ("Concreto", TABELAS_CONCRETO)):
                partes = []
                for t in tabelas:
                    if "obra_id" not in _colunas(conn, t):
                        continue
                    n, ultimo = conn.execute(f"select count(*), max(criado_em_servidor) from public.{t} where obra_id = %s", [obra]).fetchone()
                    if n:
                        partes.append(f"{t} {n} (último {_hora(ultimo)})")
                linhas.append(f"{titulo}: " + ("; ".join(partes) if partes else "nenhum registro."))
            # 3. datas: o último registro da obra
            ultimos = []
            for tabela in m["linhas"]:
                nome = tabela.split(".", 1)[1]
                cols = _colunas(conn, nome)
                if "obra_id" in cols and "criado_em_servidor" in cols:
                    u = conn.execute(f"select max(criado_em_servidor) from public.{nome} where obra_id = %s", [obra]).fetchone()[0]
                    if u:
                        ultimos.append((u, nome))
            if ultimos:
                u, nome = max(ultimos)
                inicio = f" O backup começou em {_hora(dt.datetime.fromisoformat(m['inicio']))}." if m.get("inicio") else ""
                linhas.append(f"Último registro da obra: {_hora(u)} (tabela {nome}).{inicio}")
            # 4. arquivos
            linhas += _conferir_arquivos(conn, man.parent, obra, codigo, problemas)
            for aviso in m.get("avisos") or []:
                problemas.append(f"{codigo}: aviso da exportação: {aviso}")
                linhas.append(f"  AVISO da exportação: {aviso}")
            linhas.append("")
        linhas += _fora_do_backup(conn, no_backup, pasta_zip)
        linhas += _contas(conn)
    finally:
        conn.close()
    return linhas, problemas


def _conferir_arquivos(conn, pasta_obra: pathlib.Path, obra: str, codigo: str, problemas: list[str]) -> list[str]:
    registros = conn.execute("select id, caminho, hash, tamanho, apagado from public.arquivos where obra_id = %s", [obra]).fetchall()
    faltam, errados, ok, tamanho = [], [], 0, 0
    presentes: set[str] = set()
    for id_, caminho, hash_, tam, _apagado in registros:
        local = pasta_obra / "arquivos" / caminho.split("/", 1)[1] if "/" in caminho else pasta_obra / "arquivos" / caminho
        if not local.is_file():
            faltam.append(caminho)
            continue
        presentes.add(str(id_))
        if (tam is not None and local.stat().st_size != tam) or (hash_ and sha256_do_arquivo(local) != hash_):
            errados.append(caminho)
            continue
        ok += 1
        tamanho += local.stat().st_size
    saida = [f"Arquivos: {len(registros)} registrados; {ok} presentes com tamanho e SHA-256 certos ({tamanho / 1024 / 1024:.1f} MB); "
             f"{len(faltam)} faltando; {len(errados)} diferentes."]
    for c in faltam[:10]:
        saida.append(f"  FALTA no backup: {c}")
    for c in errados[:10]:
        saida.append(f"  DIFERENTE do registrado: {c}")
    if faltam or errados:
        problemas.append(f"{codigo}: {len(faltam)} arquivo(s) faltando e {len(errados)} diferente(s)")
    # quem aponta para arquivo (fotos, laudos, documentos, plantas). Não há chave estrangeira (a fila
    # dos aparelhos manda as tabelas em qualquer ordem): vale o nome da coluna, uuid terminado em _id.
    apontam = conn.execute("""
        select table_name, column_name from information_schema.columns
        where table_schema = 'public' and data_type = 'uuid'
          and (column_name like '%%arquivo_id' or (table_name = 'plantas' and column_name in ('manifest_id', 'pacote_id')))
        order by 1, 2""").fetchall()
    for nome, coluna in apontam:
        if "obra_id" not in _colunas(conn, nome):
            continue
        ids = [str(r[0]) for r in conn.execute(f"select {coluna} from public.{nome} where obra_id = %s and {coluna} is not null", [obra])]
        if not ids:
            continue
        sem = sum(1 for i in ids if i not in presentes)
        saida.append(f"  {nome}.{coluna}: {len(ids)} apontam para arquivo; {sem} sem o arquivo no backup.")
        if sem:
            problemas.append(f"{codigo}: {nome}.{coluna} tem {sem} registro(s) sem o arquivo")
    sobra = pasta_obra / "arquivos" / "_sem_registro"
    if sobra.exists():
        saida.append(f"  Há {sum(1 for p in sobra.rglob('*') if p.is_file())} arquivo(s) do servidor sem linha na tabela arquivos (pasta _sem_registro).")
    return saida


def _fora_do_backup(conn, no_backup: set[str], pasta_zip: pathlib.Path) -> list[str]:
    """Tabelas do banco com dado de obra (coluna obra_id) que a exportação não traz."""
    com_obra = [r[0] for r in conn.execute("""
        select c.table_name from information_schema.columns c
        join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
        where c.table_schema = 'public' and c.column_name = 'obra_id' order by 1""")]
    tratadas = {"acessos"} | ({"convites"} if (pasta_zip / bk.PASTA_CONVITES).exists() else set())
    fora = [t for t in com_obra if f"public.{t}" not in no_backup and t not in tratadas]
    saida = ["=== O que o backup não traz ==="]
    if fora:
        saida.append("Tabelas com dado de obra que NÃO entram no backup (no servidor podem ter linhas):")
        saida += [f"  - {t}" for t in fora]
    else:
        saida.append("Todas as tabelas com dado de obra entram no backup.")
    convites = pasta_zip / bk.PASTA_CONVITES / "convites.json"
    if convites.exists():
        n = len(json.loads(convites.read_text(encoding="utf-8")))
        tem = conn.execute("select to_regclass('public.convites') is not null").fetchone()[0]
        v = conn.execute("select count(*) from public.convites").fetchone()[0] if tem else 0
        saida.append(f"Convites: {n} no backup, {v} restaurados.")
    saida.append("")
    return saida


def _contas(conn) -> list[str]:
    total, sem_email = conn.execute("select count(*), count(*) filter (where email is null) from auth.users").fetchone()
    admins = conn.execute("select count(*) from public.perfis where papel = 'admin'").fetchone()[0]
    acessos = conn.execute("select count(*) from public.acessos").fetchone()[0]
    return [
        "=== Contas ===",
        f"{total} conta(s) voltaram ({admins} administrador(es), {acessos} acesso(s) a obra), {sem_email} sem e-mail.",
        "O e-mail de login NÃO vem no backup (fica na parte de contas do Supabase, que a exportação não lê).",
        "Num servidor novo, cada pessoa precisa ter o e-mail religado à conta restaurada antes de entrar;",
        "se entrar antes disso, nasce uma conta nova, sem papel e sem acesso (ver o guia, 'Restaurar de verdade').",
        "",
    ]


# ---------------------------------------------------------------------------
# Servidor local: o que o app usa do Supabase, em cima do banco restaurado
# ---------------------------------------------------------------------------

OPERADORES = {"eq": "=", "neq": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<=", "like": "like", "ilike": "ilike"}


class PedidoInvalido(Exception):
    pass


def _ident(nome: str) -> str:
    if not IDENT.match(nome):
        raise PedidoInvalido(f"nome não aceito: {nome}")
    return nome


def _sem_aspas(v: str) -> str:
    return v[1:-1].replace('\\"', '"') if len(v) >= 2 and v[0] == '"' and v[-1] == '"' else v


def _partir(texto: str) -> list[str]:
    """Separa por vírgula fora de parênteses e de aspas."""
    partes, atual, nivel, aspas = [], "", 0, False
    for ch in texto:
        if ch == '"':
            aspas = not aspas
        if not aspas and ch == "(":
            nivel += 1
        if not aspas and ch == ")":
            nivel -= 1
        if ch == "," and nivel == 0 and not aspas:
            partes.append(atual)
            atual = ""
        else:
            atual += ch
    if atual:
        partes.append(atual)
    return partes


def _condicao(coluna: str, resto: str, params: list) -> str:
    """'eq.valor' -> SQL com parâmetro."""
    nega = resto.startswith("not.")
    if nega:
        resto = resto[4:]
    op, _, valor = resto.partition(".")
    col = _ident(coluna)
    if op == "is":
        if valor not in ("null", "true", "false"):
            raise PedidoInvalido(f"is.{valor}")
        sql = f"{col} is {valor}"
    elif op == "in":
        itens = [_sem_aspas(v) for v in _partir(valor.strip()[1:-1])]
        params.append(itens)
        sql = f"{col}::text = any(%s)"
    elif op in OPERADORES:
        v = _sem_aspas(valor)
        params.append(v.replace("*", "%") if op in ("like", "ilike") else v)
        sql = f"{col} {OPERADORES[op]} %s"
    else:
        raise PedidoInvalido(f"filtro não aceito: {coluna}={resto}")
    return f"not ({sql})" if nega else sql


def _logica(texto: str, junta: str, params: list) -> str:
    """'(a.eq.1,and(b.gt.2,c.eq.3))' -> SQL."""
    texto = texto.strip()
    if not (texto.startswith("(") and texto.endswith(")")):
        raise PedidoInvalido(texto)
    pedacos = []
    for parte in _partir(texto[1:-1]):
        if parte.startswith("and("):
            pedacos.append(_logica(parte[3:], " and ", params))
        elif parte.startswith("or("):
            pedacos.append(_logica(parte[2:], " or ", params))
        else:
            coluna, _, resto = parte.partition(".")
            pedacos.append(_condicao(coluna, resto, params))
    return "(" + junta.join(pedacos) + ")"


RESERVADOS = {"select", "order", "limit", "offset", "on_conflict", "columns"}


def montar_filtros(consulta: list[tuple[str, str]], params: list) -> str:
    conds = []
    for chave, valor in consulta:
        if chave in RESERVADOS:
            continue
        if chave in ("or", "and"):
            conds.append(_logica(valor, f" {chave} ", params))
        else:
            conds.append(_condicao(chave, valor, params))
    return (" where " + " and ".join(conds)) if conds else ""


def montar_select(tabela: str, consulta: list[tuple[str, str]], params: list) -> str:
    q = dict(consulta)
    campos = q.get("select", "*").replace(" ", "")
    colunas = "*" if campos in ("*", "") else ", ".join(_ident(c) for c in campos.split(","))
    sql = f"select {colunas} from public.{_ident(tabela)}" + montar_filtros(consulta, params)
    if q.get("order"):
        ordens = []
        for o in q["order"].split(","):
            p = o.split(".")
            ordens.append(_ident(p[0]) + (" desc" if "desc" in p[1:] else " asc") + (" nulls first" if "nullsfirst" in p[1:] else " nulls last" if "nullslast" in p[1:] else ""))
        sql += " order by " + ", ".join(ordens)
    if q.get("limit"):
        sql += f" limit {int(q['limit'])}"
    if q.get("offset"):
        sql += f" offset {int(q['offset'])}"
    return sql


def _b64(dados: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(dados).encode()).rstrip(b"=").decode()


def token_falso(usuario_id: str, email: str, validade_s: int = 3600) -> str:
    carga = {"sub": usuario_id, "email": email, "role": "authenticated", "aud": "authenticated", "exp": int(time.time()) + validade_s}
    return f"{_b64({'alg': 'HS256', 'typ': 'JWT'})}.{_b64(carga)}.local"


def carga_do_token(autorizacao: str | None) -> dict | None:
    token = (autorizacao or "").removeprefix("Bearer ").strip()
    partes = token.split(".")
    if len(partes) != 3:
        return None
    try:
        return json.loads(base64.urlsafe_b64decode(partes[1] + "=" * (-len(partes[1]) % 4)))
    except (ValueError, json.JSONDecodeError):
        return None


class ServidorLocal:
    def __init__(self, banco: Banco, pasta_zip: pathlib.Path, pasta_app: pathlib.Path, porta: int):
        self.banco, self.pasta_zip, self.pasta_app, self.porta = banco, pasta_zip, pasta_app, porta
        self.enviados = pasta_zip.parent / "enviados_no_teste"
        self.pastas_das_obras = {
            json.loads(m.read_text(encoding="utf-8"))["obra"]["id"]: m.parent / "arquivos" for m in pasta_zip.glob("*/manifesto.json")
        }
        conn = banco.conectar()
        try:
            achado = conn.execute("select id from public.perfis where papel = 'admin' order by criado_em limit 1").fetchone()
        finally:
            conn.close()
        if not achado:
            raise ErroRestauracao("o backup não trouxe nenhum administrador para entrar no app")
        self.admin = str(achado[0])
        self.email = "restauracao@local.test"

    # --- banco, como a pessoa do token (RLS de verdade) ---
    def no_banco(self, carga: dict | None, sql: str, params: list):
        with self.banco.conectar(autocommit=False) as conn:
            if carga and carga.get("sub"):
                conn.execute("select set_config('request.jwt.claims', %s, true)", [json.dumps(carga)])
                conn.execute("set local role authenticated")
            else:
                conn.execute("set local role anon")
            return conn.execute(sql, params).fetchone()

    def arquivo_local(self, nome: str) -> pathlib.Path | None:
        obra, _, resto = nome.partition("/")
        for base in (self.pastas_das_obras.get(obra), self.enviados / obra):
            if base is None:
                continue
            alvo = (base / resto).resolve()
            if base.resolve() in alvo.parents and alvo.is_file():
                return alvo
        return None

    def sessao(self) -> dict:
        usuario = self.usuario()
        return {"access_token": token_falso(self.admin, self.email), "token_type": "bearer", "expires_in": 3600,
                "expires_at": int(time.time()) + 3600, "refresh_token": uuid.uuid4().hex, "user": usuario}

    def usuario(self) -> dict:
        return {"id": self.admin, "aud": "authenticated", "role": "authenticated", "email": self.email,
                "app_metadata": {"provider": "email", "providers": ["email"]}, "user_metadata": {}, "created_at": "2026-01-01T00:00:00Z"}

    def iniciar(self) -> http.server.ThreadingHTTPServer:
        servidor = self

        class Tratador(http.server.BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *a):  # silêncio
                pass

            def responder(self, status: int, corpo=None, tipo: str = "application/json", extra: dict | None = None):
                bruto = b"" if corpo is None else corpo if isinstance(corpo, bytes) else (corpo if isinstance(corpo, str) else json.dumps(corpo)).encode("utf-8")
                self.send_response(status)
                self.send_header("access-control-allow-origin", "*")
                self.send_header("access-control-allow-headers", "*")
                self.send_header("access-control-allow-methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD")
                self.send_header("cache-control", "no-store")
                for k, v in (extra or {}).items():
                    self.send_header(k, v)
                if status != 204:
                    self.send_header("content-type", tipo)
                self.send_header("content-length", str(len(bruto)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(bruto)

            def corpo(self) -> bytes:
                return self.rfile.read(int(self.headers.get("content-length") or 0))

            def tratar(self):
                try:
                    self.rota()
                except PedidoInvalido as e:
                    self.responder(400, {"code": "LOCAL400", "message": f"pedido que o servidor local não entende: {e}"})
                except servidor.banco.psycopg.Error as e:
                    codigo = getattr(e, "sqlstate", None) or "XX000"
                    status = 403 if codigo == "42501" else 409 if codigo.startswith("23") else 404 if codigo == "42P01" else 400
                    self.responder(status, {"code": codigo, "message": str(e).splitlines()[0], "details": None, "hint": None})
                except (BrokenPipeError, ConnectionError):
                    pass

            do_GET = do_POST = do_PATCH = do_DELETE = do_PUT = do_HEAD = tratar

            def do_OPTIONS(self):
                self.responder(204)

            def rota(self):
                url = urllib.parse.urlsplit(self.path)
                caminho = urllib.parse.unquote(url.path)
                consulta = urllib.parse.parse_qsl(url.query, keep_blank_values=True)
                if caminho.startswith("/rest/v1/rpc/"):
                    return self.funcao(caminho[len("/rest/v1/rpc/"):])
                if caminho.startswith("/rest/v1/"):
                    return self.tabela(caminho[len("/rest/v1/"):], consulta)
                if caminho.startswith("/auth/v1/"):
                    return self.entrada(caminho[len("/auth/v1/"):])
                if caminho.startswith("/storage/v1/object/"):
                    return self.armazenamento(caminho[len("/storage/v1/object/"):])
                return self.estatico(caminho)

            # --- tabelas ---
            def tabela(self, nome: str, consulta: list[tuple[str, str]]):
                carga = carga_do_token(self.headers.get("authorization"))
                prefer = self.headers.get("prefer", "")
                um_so = "vnd.pgrst.object" in self.headers.get("accept", "")
                params: list = []
                if self.command in ("GET", "HEAD"):
                    interno = montar_select(nome, consulta, params)
                elif self.command == "POST":
                    dados = json.loads(self.corpo() or b"[]")
                    linhas = dados if isinstance(dados, list) else [dados]
                    if not linhas:
                        return self.responder(201, [] if "return=representation" in prefer else None)
                    colunas = sorted({_ident(k) for l in linhas for k in l})
                    params.append(json.dumps(linhas))
                    lista = ", ".join(colunas)
                    interno = f"insert into public.{_ident(nome)} ({lista}) select {lista} from json_populate_recordset(null::public.{nome}, %s::json)"
                    alvo = dict(consulta).get("on_conflict")
                    if "resolution=ignore-duplicates" in prefer:
                        interno += f" on conflict ({', '.join(_ident(c) for c in alvo.split(','))}) do nothing" if alvo else " on conflict do nothing"
                    elif "resolution=merge-duplicates" in prefer:
                        chaves = [_ident(c) for c in (alvo or "id").split(",")]
                        troca = ", ".join(f"{c} = excluded.{c}" for c in colunas if c not in chaves)
                        interno += f" on conflict ({', '.join(chaves)}) do update set {troca}"
                    interno += " returning *"
                elif self.command == "PATCH":
                    dados = json.loads(self.corpo() or b"{}")
                    params.append(json.dumps(dados))
                    troca = ", ".join(f"{_ident(k)} = n.{k}" for k in dados)
                    interno = f"update public.{_ident(nome)} t set {troca} from json_populate_record(null::public.{nome}, %s::json) n"
                    filtros = montar_filtros(consulta, params)
                    if not filtros:
                        raise PedidoInvalido("alteração sem filtro")
                    interno += re.sub(r"(?<![\w.%])([a-z_][a-z0-9_]*)(?= (=|<>|>|>=|<|<=|is|like|ilike) |::text)", r"t.\1", filtros) + " returning t.*"
                elif self.command == "DELETE":
                    filtros = montar_filtros(consulta, params)
                    if not filtros:
                        raise PedidoInvalido("apagar sem filtro")
                    interno = f"delete from public.{_ident(nome)}" + filtros + " returning *"
                else:
                    return self.responder(405, {"message": "método não aceito"})
                sql = f"with r as ({interno}) select coalesce(json_agg(r), '[]'::json)::text, count(*) from r"
                texto, n = servidor.no_banco(carga, sql, params)
                status = 201 if self.command == "POST" else 200
                if self.command in ("GET", "HEAD") or "return=representation" in prefer:
                    if um_so:
                        if n != 1:
                            return self.responder(406, {"code": "PGRST116", "details": f"The result contains {n} rows",
                                                        "hint": None, "message": "JSON object requested, multiple (or no) rows returned"})
                        return self.responder(status, json.dumps(json.loads(texto)[0]))
                    return self.responder(status, texto, extra={"content-range": f"0-{max(n - 1, 0)}/*"})
                return self.responder(204 if self.command != "POST" else 201)

            def funcao(self, nome: str):
                carga = carga_do_token(self.headers.get("authorization"))
                args = json.loads(self.corpo() or b"{}") if self.command == "POST" else {}
                with servidor.banco.conectar() as conn:
                    info = conn.execute("""select p.proretset, t.typtype, t.typname from pg_proc p join pg_type t on t.oid = p.prorettype
                                           where p.pronamespace = 'public'::regnamespace and p.proname = %s limit 1""", [_ident(nome)]).fetchone()
                if not info:
                    return self.responder(404, {"code": "PGRST202", "message": f"função {nome} não encontrada"})
                conjunto, tipo, nome_tipo = info
                params = [json.dumps(v) if isinstance(v, (dict, list)) else v for v in args.values()]
                chamada = f"public.{nome}(" + ", ".join(f"{_ident(k)} := %s" for k in args) + ")"
                if conjunto:
                    sql = f"select coalesce(json_agg(f), '[]'::json)::text from {chamada} f"
                elif nome_tipo == "void":
                    servidor.no_banco(carga, f"select {chamada}", params)
                    return self.responder(204)
                elif tipo == "c":
                    sql = f"select row_to_json(f)::text from {chamada} f"
                else:
                    sql = f"select to_json({chamada})::text"
                self.responder(200, servidor.no_banco(carga, sql, params)[0] or "null")

            # --- login falso ---
            def entrada(self, rota: str):
                self.corpo()
                if rota == "otp":
                    return self.responder(200, {})
                if rota in ("verify", "token"):
                    return self.responder(200, servidor.sessao())
                if rota == "user":
                    return self.responder(200, servidor.usuario())
                if rota == "logout":
                    return self.responder(204)
                self.responder(404, {"msg": f"rota de login que o servidor local não tem: {rota}"})

            # --- arquivos ---
            def armazenamento(self, resto: str):
                if resto.startswith("sign/") or resto.startswith("list/"):
                    self.corpo()
                    # sem endereço assinado: o app cai na leitura direta, que funciona
                    return self.responder(400, {"statusCode": "400", "error": "local", "message": "o servidor local não assina endereço"})
                resto = resto.removeprefix("authenticated/")
                _balde, _, nome = resto.partition("/")
                if self.command in ("POST", "PUT"):
                    bruto = self.corpo()
                    obra, _, dentro = nome.partition("/")
                    alvo = (servidor.enviados / obra / dentro).resolve()
                    if servidor.enviados.resolve() not in alvo.parents or not re.fullmatch(r"[0-9a-f-]{36}", obra):
                        raise PedidoInvalido("caminho de arquivo não aceito")
                    if alvo.exists() or servidor.arquivo_local(nome):
                        return self.responder(400, {"statusCode": "409", "error": "Duplicate", "message": "The resource already exists"})
                    alvo.parent.mkdir(parents=True, exist_ok=True)
                    alvo.write_bytes(bruto)
                    return self.responder(200, {"Key": resto, "Id": str(uuid.uuid4())})
                local = servidor.arquivo_local(nome)
                if not local:
                    return self.responder(400, {"statusCode": "404", "error": "not_found", "message": "Object not found"})
                self.responder(200, local.read_bytes(), mimetypes.guess_type(local.name)[0] or "application/octet-stream")

            # --- o app compilado ---
            def estatico(self, caminho: str):
                base = servidor.pasta_app.resolve()
                alvo = (base / caminho.lstrip("/")).resolve()
                if alvo.is_dir():
                    alvo = alvo / "index.html"
                if base not in alvo.parents or not alvo.is_file():
                    alvo = base / "index.html"  # o app cuida das próprias telas
                tipo = mimetypes.guess_type(alvo.name)[0] or "application/octet-stream"
                if alvo.suffix in (".js", ".mjs"):
                    tipo = "text/javascript"
                self.responder(200, alvo.read_bytes(), tipo)

        http_ = http.server.ThreadingHTTPServer(("127.0.0.1", self.porta), Tratador)
        http_.daemon_threads = True
        threading.Thread(target=http_.serve_forever, daemon=True).start()
        return http_


def compilar_app(saida: pathlib.Path, porta: int, repo: pathlib.Path = REPO) -> None:
    """O app compilado com o endereço deste PC no lugar do servidor (não muda o repositório)."""
    app = repo / "app"
    if not (app / "node_modules").exists():
        raise ErroRestauracao(f"falta instalar o app uma vez: abra o PowerShell em {app} e rode: npm install")
    ambiente = dict(os.environ, VITE_SUPABASE_URL=f"http://127.0.0.1:{porta}", VITE_SUPABASE_PUBLISHABLE_KEY="chave-local-de-restauracao")
    r = subprocess.run(["npx", "vite", "build", "--outDir", str(saida), "--emptyOutDir", "--logLevel", "error"],
                       cwd=app, env=ambiente, shell=(os.name == "nt"), capture_output=True, text=True, errors="replace")
    if r.returncode != 0 or not (saida / "index.html").exists():
        raise ErroRestauracao("o app não compilou:\n" + (r.stderr or r.stdout)[-1500:])


# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass
    p = argparse.ArgumentParser(description="Restaura um backup do Sistema Obra neste PC, confere e (com --abrir) abre o app nele.")
    p.add_argument("--backups", help="pasta dos backups (pega o backup_*.zip mais novo)")
    p.add_argument("--zip", help="um backup específico, no lugar do mais novo")
    p.add_argument("--pasta", help="pasta de trabalho, fora do repositório (padrão: <backups>\\restauracao)")
    p.add_argument("--abrir", action="store_true", help="abre o app em cima da base restaurada e fica no ar até Ctrl+C")
    p.add_argument("--porta", type=int, default=PORTA_APP, help=f"porta do app local (padrão {PORTA_APP})")
    p.add_argument("--sem-compilar", action="store_true", help="com --abrir: usa o app já compilado na pasta de trabalho")
    args = p.parse_args(argv)
    if not args.backups and not args.zip:
        p.error("diga --backups PASTA (ou --zip ARQUIVO)")

    banco = None
    try:
        caminho_zip = pathlib.Path(args.zip).expanduser().resolve() if args.zip else backup_mais_novo(bk.pasta_da_opcao(args.backups))
        if not caminho_zip.is_file():
            raise ErroRestauracao(f"backup não encontrado: {caminho_zip}")
        trabalho = bk.pasta_da_opcao(args.pasta) if args.pasta else caminho_zip.parent / "restauracao"
        if exp.dentro_de_repositorio(trabalho):
            raise ErroRestauracao(f"a pasta {trabalho} fica dentro de um repositório git. Dados de obra não entram no repositório.")
        trabalho.mkdir(parents=True, exist_ok=True)
        print(f"Backup: {caminho_zip}")
        print(f"Pasta de trabalho: {trabalho}")
        print("1/3 Abrindo o zip...")
        pasta_zip = extrair(caminho_zip, trabalho)
        print("2/3 Criando a base nova e restaurando (alguns minutos)...")
        banco = Banco(trabalho)
        banco.subir_novo()
        restaurar(banco, pasta_zip)
        print("3/3 Conferindo...")
        linhas, problemas = conferir(banco, pasta_zip, caminho_zip)
        situacao = "RESTAUROU COM DIFERENÇA" if problemas else "RESTAUROU E CONFERIU"
        texto = [f"{situacao} ({dt.datetime.now():%d/%m/%Y %H:%M})", ""] + linhas
        if problemas:
            texto += ["=== Diferenças ==="] + [f"- {x}" for x in problemas]
        (trabalho / RELATORIO).write_text("\n".join(texto) + "\n", encoding="utf-8")
        print()
        print("\n".join(texto))
        print(f"Relatório: {trabalho / RELATORIO}")
        if args.abrir:
            pasta_app = trabalho / "app"
            if not args.sem_compilar or not (pasta_app / "index.html").exists():
                print("Compilando o app para este PC (um minuto)...")
                compilar_app(pasta_app, args.porta)
            ServidorLocal(banco, pasta_zip, pasta_app, args.porta).iniciar()
            endereco = f"http://127.0.0.1:{args.porta}/"
            print(f"\nApp no ar em {endereco}")
            print("Na entrada, digite qualquer e-mail e qualquer código de 6 números. Você entra como administrador.")
            print("É uma cópia local do backup: nada aqui vai para o servidor. Ctrl+C encerra.")
            webbrowser.open(endereco)
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                print("\nEncerrando.")
        return 2 if problemas else 0
    except (ErroRestauracao, bk.ErroBackup, OSError, zipfile.BadZipFile, subprocess.CalledProcessError) as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 1
    finally:
        if banco is not None:
            banco.parar()


if __name__ == "__main__":
    sys.exit(main())

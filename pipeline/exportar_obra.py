"""Exporta uma obra inteira do Sistema Obra: dados, arquivos e SQL para restaurar.

Uso (no PC, com internet):
    py pipeline/exportar_obra.py EXE
    py pipeline/exportar_obra.py EXE --saida "G:\\Meu Drive\\Obras\\EXE" --zip

Pede o seu e-mail e o código que chega por e-mail (o mesmo login do app). Não usa chave secreta:
vê o que o seu login vê. Para a exportação ser completa, entre como admin ou gestor da obra.

Resultado: uma pasta AAAA-MM-DD_export-CODIGO_vNN com
    LEIAME.txt        o que tem dentro e como restaurar
    manifesto.json    contagens, conferência dos arquivos, quem exportou e quando
    dados/*.json      todas as linhas de cada tabela da obra, como estão no servidor
    dados/*.csv       as mesmas linhas para abrir no Excel (separador ";", vírgula decimal,
                      horas no horário deste PC)
    arquivos/...      todos os arquivos da obra, conferidos pelo SHA-256
    restaurar.sql     carrega os dados num Postgres com as migrações do núcleo

Enquanto roda, a pasta se chama ..._vNN.incompleta; só ganha o nome final no fim.

Só usa a biblioteca padrão do Python (3.9 ou mais novo).
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import http.client
import json
import os
import pathlib
import re
import secrets
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

URL_PADRAO = "https://zktsuwxgvvyufuihkndj.supabase.co"  # projeto em São Paulo (04/11/2026)
# Chave pública (publishable): o acesso é controlado pelas regras do banco. Não é segredo.
CHAVE_PADRAO = "sb_publishable_UkMxFtS6lcprzAlWCpxwHQ_KKLLJ0op"
BUCKET = "obras"
FORMATO = 2
# Linhas por página nas consultas. SISTEMA_OBRA_PAGINA só existe para os testes (páginas pequenas).
PAGINA = int(os.environ.get("SISTEMA_OBRA_PAGINA", "1000"))
# Renova o login quando faltar menos que isto para vencer.
MARGEM_RENOVACAO_S = 60
TENTATIVAS_DE_REDE = 3
ESPERA_ENTRE_TENTATIVAS_S = 2
PROGRESSO_A_CADA = 50

# Erros de conexão que o urllib não embrulha em URLError (queda no meio do corpo, timeout...).
ERROS_DE_REDE = (urllib.error.URLError, http.client.HTTPException, OSError)


class ErroExportacao(Exception):
    pass


def descrever(e: BaseException) -> str:
    if isinstance(e, urllib.error.URLError) and not isinstance(e, urllib.error.HTTPError):
        return str(e.reason)
    return f"{type(e).__name__}: {e}" if str(e) else type(e).__name__


# ---------------------------------------------------------------------------
# Comunicação com o Supabase (REST, login, armazenamento)
# ---------------------------------------------------------------------------


class Supabase:
    def __init__(self, url: str, chave: str):
        self.url = url.rstrip("/")
        self.chave = chave
        self.token: str | None = None
        self.refresh_token: str | None = None
        self.expira_em: float = 0.0
        self.renovacoes = 0

    def _cabecalhos(self, extra: dict | None = None) -> dict:
        c = {"apikey": self.chave, "Authorization": f"Bearer {self.token or self.chave}"}
        if extra:
            c.update(extra)
        return c

    # --- login ---------------------------------------------------------------
    def _guardar_sessao(self, sessao: dict) -> None:
        self.token = sessao["access_token"]
        self.refresh_token = sessao.get("refresh_token") or self.refresh_token
        expira = sessao.get("expires_at")
        if not expira:
            expira = time.time() + float(sessao.get("expires_in") or 3600)
        self.expira_em = float(expira)

    def _renovar_se_preciso(self) -> None:
        if self.refresh_token and self.expira_em - time.time() < MARGEM_RENOVACAO_S:
            self.renovar()

    def renovar(self) -> None:
        """Troca o refresh_token por um login novo (o token vence em 1 h)."""
        if not self.refresh_token:
            raise ErroExportacao("O login venceu. Rode de novo.")
        status, bruto = self.pedir(
            "POST", "/auth/v1/token?grant_type=refresh_token", {"refresh_token": self.refresh_token}, autenticar=False
        )
        if status >= 400:
            raise ErroExportacao(f"O login venceu e não foi possível renovar (HTTP {status}). Rode de novo.")
        self._guardar_sessao(json.loads(bruto))
        self.renovacoes += 1

    @staticmethod
    def _login_recusado(status: int, bruto: bytes) -> bool:
        if status == 401:
            return True
        return status in (400, 403) and re.search(rb"jwt|expired|exp claim", bruto, re.I) is not None

    def entrar(self, email: str, ler_codigo, tentativas: int = 3) -> dict:
        status, bruto = self.pedir("POST", "/auth/v1/otp", {"email": email, "create_user": False}, autenticar=False)
        if status >= 400:
            raise ErroExportacao(traduzir_erro_login(status, bruto))
        for tentativa in range(1, tentativas + 1):
            codigo = "".join(ch for ch in ler_codigo() if ch.isdigit())
            if len(codigo) >= 6:
                status, bruto = self.pedir(
                    "POST", "/auth/v1/verify", {"email": email, "token": codigo, "type": "email"}, autenticar=False
                )
                if status < 400:
                    sessao = json.loads(bruto)
                    self._guardar_sessao(sessao)
                    return sessao["user"]
                if status == 429:
                    raise ErroExportacao(traduzir_erro_login(status, bruto))
            restantes = tentativas - tentativa
            if restantes == 0:
                raise ErroExportacao("Código errado ou vencido 3 vezes. Rode de novo para receber outro código.")
            print(f"Código errado ou vencido. Tente de novo ({restantes} tentativa(s) restante(s)).")
        raise ErroExportacao("Código errado ou vencido.")

    def entrar_com_senha(self, email: str, senha: str) -> dict:
        """Login por senha (a conta de teste do servidor de TESTES, 24/11/2026). A senha não é guardada nem impressa."""
        status, bruto = self.pedir("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": senha},
                                   autenticar=False)
        if status >= 400:
            raise ErroExportacao(traduzir_erro_login(status, bruto))
        sessao = json.loads(bruto)
        self._guardar_sessao(sessao)
        return sessao["user"]

    # --- pedidos ---------------------------------------------------------------
    def pedir(self, metodo: str, caminho: str, corpo=None, cabecalhos: dict | None = None, autenticar: bool = True):
        """Devolve (status, bytes). Queda de rede: tenta de novo. Login vencido: renova e repete."""
        dados = None
        extra = dict(cabecalhos or {})
        if corpo is not None:
            dados = json.dumps(corpo).encode("utf-8")
            extra.setdefault("Content-Type", "application/json")
        renovado = False
        tentativa = 0
        while True:
            tentativa += 1
            if autenticar:
                self._renovar_se_preciso()
            req = urllib.request.Request(self.url + caminho, data=dados, method=metodo, headers=self._cabecalhos(extra))
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    status, bruto = r.status, r.read()
            except urllib.error.HTTPError as e:
                status = e.code
                try:
                    bruto = e.read()
                except ERROS_DE_REDE:
                    bruto = b""
            except ERROS_DE_REDE as e:
                if tentativa >= TENTATIVAS_DE_REDE:
                    raise ErroExportacao(f"Sem conexão com o servidor ({descrever(e)}).") from e
                time.sleep(ESPERA_ENTRE_TENTATIVAS_S)
                continue
            if autenticar and not renovado and self._login_recusado(status, bruto):
                renovado = True
                self.renovar()
                continue
            return status, bruto

    def json(self, metodo: str, caminho: str, corpo=None, cabecalhos: dict | None = None):
        status, bruto = self.pedir(metodo, caminho, corpo, cabecalhos)
        texto = bruto.decode("utf-8", "replace") if bruto else ""
        if status >= 400:
            raise ErroExportacao(f"{metodo} {caminho.split('?')[0]} -> HTTP {status}: {texto[:300]}")
        return json.loads(texto) if texto else None

    # --- dados --------------------------------------------------------------
    def linhas(self, tabela: str, filtros: dict[str, str]) -> list[dict]:
        """Todas as linhas que passam nos filtros, em páginas ordenadas por id."""
        nome = tabela.split(".")[-1]
        todas: list[dict] = []
        ultimo: str | None = None
        while True:
            params = dict(filtros)
            params.update({"select": "*", "order": "id.asc", "limit": str(PAGINA)})
            if ultimo:
                params["id"] = f"gt.{ultimo}"
            pagina = self.json("GET", f"/rest/v1/{nome}?{urllib.parse.urlencode(params)}")
            todas.extend(pagina)
            if len(pagina) == 0:
                break
            ultimo = pagina[-1]["id"]
        return todas

    def tabelas_para_exportar(self) -> list[dict]:
        status, bruto = self.pedir("POST", "/rest/v1/rpc/tabelas_para_exportar", {})
        if status == 404 and b"PGRST202" in bruto:
            raise ErroExportacao(
                "O servidor ainda não tem a função de exportação. Aplique "
                "supabase/migrations/20261103200000_nucleo_exportacao.sql no editor SQL do Supabase "
                "(supabase/README.md, passo 6) e rode de novo."
            )
        if status >= 400:
            raise ErroExportacao(f"tabelas_para_exportar -> HTTP {status}: {bruto[:300].decode('utf-8', 'replace')}")
        return json.loads(bruto)

    # --- armazenamento --------------------------------------------------------
    def baixar(self, caminho: str, destino: pathlib.Path) -> tuple[int, str]:
        """Grava o arquivo em destino e devolve (tamanho, sha256). Nunca sobrescreve nem apaga
        um arquivo que não criou: grava em destino.parcial e renomeia no fim."""
        url = f"{self.url}/storage/v1/object/authenticated/{BUCKET}/{urllib.parse.quote(caminho)}"
        parcial = destino.with_name(destino.name + ".parcial")
        destino.parent.mkdir(parents=True, exist_ok=True)
        if destino.exists():
            raise ErroExportacao("já existe um arquivo com esse nome na pasta de saída")
        renovado = False
        tentativa = 0
        while True:
            tentativa += 1
            self._renovar_se_preciso()
            req = urllib.request.Request(url, headers=self._cabecalhos())
            resumo = hashlib.sha256()
            tamanho = 0
            try:
                with urllib.request.urlopen(req, timeout=300) as r, open(parcial, "xb") as f:
                    esperado = r.headers.get("Content-Length")
                    while True:
                        bloco = r.read(1024 * 1024)
                        if not bloco:
                            break
                        f.write(bloco)
                        resumo.update(bloco)
                        tamanho += len(bloco)
                if esperado is not None and int(esperado) != tamanho:
                    raise http.client.IncompleteRead(b"", int(esperado) - tamanho)
            except urllib.error.HTTPError as e:
                parcial.unlink(missing_ok=True)
                try:
                    corpo = e.read()
                except ERROS_DE_REDE:
                    corpo = b""
                if not renovado and self._login_recusado(e.code, corpo):
                    renovado = True
                    self.renovar()
                    continue
                raise ErroExportacao(f"HTTP {e.code}") from e
            except FileExistsError as e:
                raise ErroExportacao("sobrou um arquivo .parcial de uma exportação anterior na pasta de saída") from e
            except ERROS_DE_REDE as e:
                parcial.unlink(missing_ok=True)
                if tentativa >= TENTATIVAS_DE_REDE:
                    raise ErroExportacao(f"a conexão caiu ({descrever(e)})") from e
                time.sleep(ESPERA_ENTRE_TENTATIVAS_S)
                continue
            os.replace(parcial, destino)
            return tamanho, resumo.hexdigest()

    def listar(self, pasta: str) -> list[dict]:
        """Arquivos dentro da pasta (percorre as subpastas): [{caminho, tamanho ou None}]."""
        encontrados: list[dict] = []
        pendentes = [pasta.rstrip("/")]
        while pendentes:
            atual = pendentes.pop()
            deslocamento = 0
            while True:
                itens = self.json(
                    "POST",
                    f"/storage/v1/object/list/{BUCKET}",
                    {"prefix": atual, "limit": PAGINA, "offset": deslocamento, "sortBy": {"column": "name", "order": "asc"}},
                )
                for item in itens:
                    caminho = f"{atual}/{item['name']}"
                    if item.get("id") is None:  # pasta
                        pendentes.append(caminho)
                    else:
                        tamanho = (item.get("metadata") or {}).get("size")
                        encontrados.append({"caminho": caminho, "tamanho": tamanho})
                if len(itens) < PAGINA:
                    break
                deslocamento += PAGINA
        return sorted(encontrados, key=lambda x: x["caminho"])


def traduzir_erro_login(status: int, bruto: bytes) -> str:
    try:
        corpo = json.loads(bruto)
    except ValueError:
        corpo = {}
    codigo = str(corpo.get("error_code") or corpo.get("code") or "")
    msg = str(corpo.get("msg") or corpo.get("message") or corpo.get("error_description") or "")
    texto = f"{codigo} {msg}".lower()
    if status == 429 or "rate_limit" in texto or "rate limit" in texto:
        return "Muitos pedidos de código seguidos. Espere 1 minuto e rode de novo."
    if "signup" in texto or status == 422:
        return "Este e-mail não tem conta no Sistema Obra. Entre uma vez pelo app com esse e-mail e tente de novo."
    if "invalid" in texto and "email" in texto:
        return "E-mail inválido. Confira o endereço."
    return f"Não foi possível entrar (HTTP {status}): {msg or codigo or 'erro desconhecido'}"


# ---------------------------------------------------------------------------
# Caminhos seguros e pasta de saída
# ---------------------------------------------------------------------------

PROIBIDOS_NO_NOME = set('\\:*?"<>|') | {chr(c) for c in range(32)}


def partes_seguras(relativo: str) -> list[str] | None:
    """Trechos do caminho que podem virar pasta e arquivo no PC, ou None se o caminho
    tentar sair da pasta de saída ou tiver caractere que o Windows não aceita."""
    if not relativo:
        return None
    partes = relativo.split("/")
    for p in partes:
        if p in ("", ".", "..") or any(ch in PROIBIDOS_NO_NOME for ch in p) or p.rstrip(" .") != p:
            return None
    return partes


def destino_seguro(pasta_arquivos: pathlib.Path, relativo: str) -> pathlib.Path | None:
    partes = partes_seguras(relativo)
    if partes is None:
        return None
    destino = pasta_arquivos.joinpath(*partes)
    try:
        destino.resolve().relative_to(pasta_arquivos.resolve())
    except ValueError:
        return None
    return destino


def dentro_de_repositorio(pasta: pathlib.Path) -> bool:
    for p in [pasta, *pasta.parents]:
        if (p / ".git").exists():
            return True
    return False


def pasta_de_saida(base: pathlib.Path, codigo: str, hoje: dt.date) -> pathlib.Path:
    """Nome final AAAA-MM-DD_export-CODIGO_vNN; pula um NN se já houver pasta, zip ou incompleta."""
    for n in range(1, 100):
        nome = f"{hoje.isoformat()}_export-{codigo}_v{n:02d}"
        if not any((base / x).exists() for x in (nome, nome + ".zip", nome + ".incompleta")):
            return base / nome
    raise ErroExportacao("Já existem 99 exportações desta obra hoje nesta pasta.")


def conferir_pasta_base(base: pathlib.Path) -> None:
    try:
        base.mkdir(parents=True, exist_ok=True)
        prova = base / f".sistema-obra-prova-{secrets.token_hex(4)}"
        prova.write_text("ok", encoding="utf-8")
        prova.unlink()
    except OSError as e:
        raise ErroExportacao(
            f"Não consegui gravar em {base}: {descrever(e)}. Confira se o Google Drive está aberto e se o "
            'caminho existe (sem "\\" no fim).'
        ) from e


# ---------------------------------------------------------------------------
# Gravação: JSON, CSV, SQL
# ---------------------------------------------------------------------------


def gravar_json(caminho: pathlib.Path, dados) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1)


ISO_HORA = re.compile(r"^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:?\d{2})$")
ISO_DATA = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def hora_local(m: re.Match) -> str:
    data, hora, fracao, fuso = m.groups()
    fuso = "+00:00" if fuso == "Z" else (fuso if ":" in fuso else f"{fuso[:3]}:{fuso[3:]}")
    micro = ((fracao or "") + "000000")[:6]
    quando = dt.datetime.fromisoformat(f"{data}T{hora}.{micro}{fuso}")
    return quando.astimezone().strftime("%d/%m/%Y %H:%M:%S")


def valor_csv(v) -> str:
    """Valor como o Excel em português entende; o valor original fica no JSON."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "sim" if v else "não"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return repr(v).replace(".", ",")
    if isinstance(v, (dict, list)):
        v = json.dumps(v, ensure_ascii=False)
    s = str(v)
    m = ISO_HORA.match(s)
    if m:
        try:
            return hora_local(m)
        except ValueError:
            pass
    if ISO_DATA.match(s):
        return f"{s[8:10]}/{s[5:7]}/{s[0:4]}"
    if s[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + s  # não vira fórmula no Excel
    return s


def gravar_csv(caminho: pathlib.Path, linhas: list[dict]) -> None:
    """CSV para o Excel em português: separador ";" e UTF-8 com BOM (acentos certos)."""
    colunas: list[str] = []
    for linha in linhas:
        for c in linha:
            if c not in colunas:
                colunas.append(c)
    with open(caminho, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(colunas)
        for linha in linhas:
            w.writerow([valor_csv(linha.get(c)) for c in colunas])


def literal_json(dados, marca: str) -> str:
    texto = json.dumps(dados, ensure_ascii=False)
    if marca in texto:
        raise ErroExportacao("Marca de texto do SQL apareceu nos dados; rode de novo.")
    return f"{marca}{texto}{marca}"


# Tabelas da obra que não vão para os aparelhos (fora de nucleo.tabelas_sincronizadas), mas entram no backup.
TABELAS_FORA_DA_SINCRONIZACAO = [
    "public.projetos_pedidos_atualizacao",
    # Tabelas novas que ainda não estão no registro do núcleo; a ordem segue as chaves (pais antes).
    "public.fvs_redesenhos",
    "public.fvs_tratativas",
    "public.projetos_formularios",
    "public.recebimento_usos",
]
# Colunas que apontam para uma pessoa (perfis): a conta tem de voltar junto.
COLUNAS_DE_PESSOA = ("usuario_id", "pedido_por")


def montar_sql(
    obra: dict,
    tabelas: list[tuple[str, list[dict]]],
    acessos: list[dict],
    perfis: list[dict],
    pessoas: list[str],
) -> str:
    """SQL que recria a obra num Postgres com as migrações do núcleo aplicadas.

    Usa jsonb_populate_recordset: o próprio Postgres converte cada campo para o tipo da coluna.
    Os gatilhos ficam desligados durante a carga para manter as horas originais do servidor.
    Contas que já existiam no destino não mudam de papel; recebem só o acesso que tinham nesta obra
    (o mesmo do backup, nada além: a obra é nova no destino).
    """
    marca = f"$so_{secrets.token_hex(6)}$"
    email_de = {p["id"]: (p.get("email") or "").strip().lower() or None for p in perfis}
    contas = [{"id": i, "email": email_de.get(i)} for i in pessoas]
    partes = [
        "-- Restauração da obra " + obra["codigo"] + " (Sistema Obra, formato " + str(FORMATO) + ")",
        "-- Aplicar com psql num banco que já tenha as migrações de supabase/migrations/.",
        "-- Falha (e não grava nada) se a obra já existir no banco de destino.",
        "-- Contas que já existiam no destino mantêm o papel; recebem só o acesso que tinham nesta obra.",
        "set client_encoding = 'UTF8';",
        "",
        "begin;",
        "",
        "-- Pessoas citadas nos registros. Num banco novo, cria a conta com o e-mail de login (quando a",
        "-- exportação foi feita pelo admin) para a pessoa entrar de novo na mesma conta; e-mail que já",
        "-- é de outra conta no destino fica de fora. Nome e papel vêm do perfil exportado. Quem não veio",
        "-- na exportação fica como 'pessoa não exportada'. Só contas criadas aqui recebem papel.",
        "create temp table so_novas (id uuid primary key) on commit drop;",
        "create temp table so_contas on commit drop as",
        f"  select * from jsonb_to_recordset({literal_json(contas, marca)}::jsonb) as c(id uuid, email text);",
        "with novas as (",
        "  insert into auth.users (id, email)",
        "  select c.id, case when not exists (select 1 from auth.users u where lower(u.email::text) = lower(c.email)) then c.email end",
        "  from so_contas c",
        "  on conflict (id) do nothing",
        "  returning id",
        ")",
        "insert into so_novas select id from novas;",
        "-- Conta que já existia no destino sem e-mail (restaurada antes, sem ele): religa.",
        "update auth.users u set email = c.email from so_contas c",
        "where u.id = c.id and u.email is null and c.email is not null",
        "  and not exists (select 1 from auth.users o where lower(o.email::text) = lower(c.email));",
        "-- No Supabase de verdade, a conta criada à mão precisa destes campos para o login por código achar.",
        "do $so_auth$ begin",
        "  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'instance_id') then",
        "    update auth.users set instance_id = '00000000-0000-0000-0000-000000000000', aud = 'authenticated', role = 'authenticated'",
        "    where id in (select id from so_novas) and instance_id is null;",
        "  end if;",
        "end $so_auth$;",
        "insert into public.perfis (id, nome)",
        f"select p::uuid, 'pessoa não exportada' from jsonb_array_elements_text({literal_json(pessoas, marca)}::jsonb) p",
        "on conflict (id) do update set nome = excluded.nome",
        "  where public.perfis.nome = '' and public.perfis.id in (select id from so_novas);",
        "insert into public.perfis",
        f"select * from jsonb_populate_recordset(null::public.perfis, {literal_json(perfis, marca)}::jsonb)",
        "on conflict (id) do update set nome = excluded.nome, papel = excluded.papel",
        "  where public.perfis.id in (select id from so_novas);",
        "",
        "alter table public.obras disable trigger user;",
        f"insert into public.obras select * from jsonb_populate_recordset(null::public.obras, {literal_json([obra], marca)}::jsonb);",
        "alter table public.obras enable trigger user;",
        "",
    ]
    # Gatilhos desligados em todas as tabelas antes da carga e religados só no fim. Várias tabelas
    # (Diário, Concreto, plantas da FVS) têm chave estrangeira conferida só no fim da transação
    # (deferrable): a carga deixa essa conferência pendente, e o Postgres não aceita ALTER TABLE
    # (religar o gatilho) em tabela com conferência pendente ("pending trigger events"). Por isso:
    # desliga tudo, carrega tudo, confere as chaves agora (set constraints all immediate) e religa.
    partes += [f"alter table {tabela} disable trigger user;" for tabela, _ in tabelas]
    partes.append("")
    for tabela, linhas in tabelas:
        partes += [
            f"-- {tabela}: {len(linhas)} linha(s)",
            f"insert into {tabela} select * from jsonb_populate_recordset(null::{tabela}, {literal_json(linhas, marca)}::jsonb);",
            "",
        ]
    partes += ["set constraints all immediate;"]
    partes += [f"alter table {tabela} enable trigger user;" for tabela, _ in tabelas]
    partes.append("")
    partes += [
        "-- Os acessos desta obra, como estavam no backup, para todas as pessoas, inclusive conta que já",
        "-- existia (por exemplo, criada pela obra restaurada antes, do mesmo backup). Só desta obra.",
        "insert into public.acessos",
        f"select * from jsonb_populate_recordset(null::public.acessos, {literal_json(acessos, marca)}::jsonb) a",
        f"where a.obra_id = '{uuid.UUID(str(obra['id']))}'::uuid",
        "on conflict (usuario_id, obra_id) do nothing;",
        "",
        "commit;",
        "",
    ]
    return "\n".join(partes)


LEIAME = """Exportação da obra {codigo} ({nome}) - Sistema Obra
Gerada em {quando} por {email}.

O que tem aqui
- dados/*.csv: uma planilha por tabela (abre no Excel; separador ";"). Números com vírgula,
  horas no horário deste PC, "sim"/"não". Texto que começa com = + - @ ganha um ' na frente
  para o Excel não tratar como fórmula.
- dados/*.json: as mesmas linhas como estão no servidor (horas em UTC, valores originais).
- arquivos/: todos os arquivos da obra (fotos, pranchas, pacotes de planta), na mesma
  estrutura de pastas do servidor. Cada um foi conferido pelo SHA-256 registrado no banco.
  arquivos/_sem_registro/ (se existir): arquivos do servidor sem linha na tabela "arquivos".
- manifesto.json: quantas linhas por tabela, conferência dos arquivos, quem exportou e quando.
- restaurar.sql: recria a obra num banco Postgres que tenha as migrações do núcleo
  (pasta supabase/migrations do repositório Sistema Obra, aplicadas com PGCLIENTENCODING=UTF8).
  Comando:
      psql "URL_DO_BANCO" -v ON_ERROR_STOP=1 -f restaurar.sql
  Falha inteiro se a obra já existir no destino. Contas que já existiam no destino não mudam
  de papel; recebem só o acesso que tinham nesta obra (o do backup).
  Os arquivos voltam para o armazenamento no mesmo caminho: {{obra_id}}/... (arquivos/ = {obra_id}/).

Conferência
- Linhas exportadas: {linhas}
- Arquivos: {arquivos_ok} conferidos de {arquivos_total}{problemas}
"""


# ---------------------------------------------------------------------------
# Exportação
# ---------------------------------------------------------------------------


def exportar(args, situacao: dict, sb: "Supabase | None" = None, usuario: dict | None = None) -> int:
    """Exporta a obra args.obra. `sb` + `usuario`: login já feito (backup_semanal.py, sem perguntar nada)."""
    codigo_obra = args.obra.strip().upper()
    base = pathlib.Path(args.saida.strip().rstrip('"')).expanduser()
    if dentro_de_repositorio(base.resolve()) and not args.permitir_repositorio:
        raise ErroExportacao(
            f"A pasta {base} fica dentro de um repositório git. Dados de obra não entram no repositório: "
            "use --saida com uma pasta fora dele (ex.: a pasta da obra no Drive)."
        )
    conferir_pasta_base(base)
    base = base.resolve()
    inicio = dt.datetime.now(dt.timezone.utc)

    if sb is None or usuario is None:
        sb = Supabase(args.url, args.chave)
        email = (args.email or input("Seu e-mail: ")).strip().lower()
        print(f"Mandando código para {email}...")
        usuario = sb.entrar(email, lambda: input("Código que chegou por e-mail (olhe também a caixa de spam): "))
    else:
        email = (usuario.get("email") or "").strip().lower()

    obras = sb.json("GET", f"/rest/v1/obras?select=*&codigo=eq.{urllib.parse.quote(codigo_obra)}")
    if not obras:
        raise ErroExportacao(f"Obra {codigo_obra} não encontrada, ou seu login não tem acesso a ela.")
    obra = obras[0]
    obra_id = obra["id"]
    perfil = sb.json("GET", f"/rest/v1/perfis?select=papel&id=eq.{usuario['id']}")
    acesso = sb.json("GET", f"/rest/v1/acessos?select=papel&usuario_id=eq.{usuario['id']}&obra_id=eq.{obra_id}")
    papel = "admin" if perfil and perfil[0]["papel"] == "admin" else (acesso[0]["papel"] if acesso else "?")
    avisos: list[str] = []
    if papel not in ("admin", "gestor"):
        avisos.append(f"Exportado com papel '{papel}': a lista de acessos sai só com o seu próprio acesso.")
    ordem = sb.tabelas_para_exportar()  # antes de criar a pasta: se faltar a migração, nada fica no Drive
    for extra in TABELAS_FORA_DA_SINCRONIZACAO:
        status, _ = sb.pedir("GET", f"/rest/v1/{extra.split('.')[-1]}?select=id&limit=1")
        if status != 404 and all(i["tabela"] != extra for i in ordem):  # 404 = o servidor ainda não tem a tabela
            ordem.append({"tabela": extra})

    final = pasta_de_saida(base, obra["codigo"], dt.date.today())
    saida = final.with_name(final.name + ".incompleta")
    (saida / "dados").mkdir(parents=True)
    situacao["pasta"] = saida
    print(f"Exportando {obra['codigo']} para {final}")

    # Dados. Lidos dos filhos para os pais: se alguém criar pai e filho durante a exportação,
    # o filho pode ficar de fora, mas nunca entra um filho sem o pai (nada é apagado de fato).
    por_tabela: dict[str, list[dict]] = {}
    contagem: dict[str, int] = {"public.obras": 1}
    for item in reversed(ordem):
        tabela = item["tabela"]
        linhas = sb.linhas(tabela, {"obra_id": f"eq.{obra_id}"})
        por_tabela[tabela] = linhas
        contagem[tabela] = len(linhas)
        print(f"  {tabela}: {len(linhas)} linha(s)")
    tabelas = [(item["tabela"], por_tabela[item["tabela"]]) for item in ordem]
    acessos = sb.json("GET", f"/rest/v1/acessos?select=*&obra_id=eq.{obra_id}")
    contagem["public.acessos"] = len(acessos)

    pessoas = {obra.get("criado_por")} | {a["usuario_id"] for a in acessos}
    for _, linhas in tabelas:
        pessoas |= {l.get(c) for l in linhas for c in COLUNAS_DE_PESSOA}
    pessoas.discard(None)
    lista = sorted(pessoas)
    perfis: list[dict] = []
    for i in range(0, len(lista), 100):
        perfis += sb.json("GET", f"/rest/v1/perfis?select=*&id=in.({','.join(lista[i:i + 100])})")
    contagem["public.perfis"] = len(perfis)
    if papel == "admin":
        emails: dict[str, str] = {}
        for funcao in ("pessoas_da_obra", "contas_sem_acesso"):
            for p in sb.json("POST", f"/rest/v1/rpc/{funcao}", {"p_obra_id": obra_id}) or []:
                if p.get("email"):
                    emails[p["usuario_id"]] = p["email"]
        for p in perfis:
            p["email"] = emails.get(p["id"])
        sem = sum(1 for p in perfis if not p["email"])
        if sem:
            avisos.append(f"{sem} pessoa(s) sem e-mail na exportação: num servidor novo, entram como conta nova.")
    else:
        avisos.append("Exportado sem ser admin: as contas voltam sem e-mail de login.")
    if len(perfis) < len(pessoas):
        avisos.append(f"{len(pessoas) - len(perfis)} pessoa(s) citada(s) sem perfil visível para o seu login.")

    for tabela, linhas in [("public.obras", [obra]), *tabelas, ("public.acessos", acessos), ("public.perfis", perfis)]:
        nome = tabela.split(".")[-1]
        gravar_json(saida / "dados" / f"{nome}.json", linhas)
        gravar_csv(saida / "dados" / f"{nome}.csv", linhas)
    # O SQL não depende dos arquivos: gravado já, antes da parte demorada.
    (saida / "restaurar.sql").write_text(montar_sql(obra, tabelas, acessos, perfis, lista), encoding="utf-8")

    # Arquivos registrados na tabela "arquivos"
    pasta_arquivos = saida / "arquivos"
    registrados = por_tabela.get("public.arquivos", [])
    conferidos, problemas = 0, []
    prefixo = f"{obra_id}/"
    for n, a in enumerate(registrados, 1):
        relativo = a["caminho"][len(prefixo):] if a["caminho"].startswith(prefixo) else a["caminho"]
        destino = destino_seguro(pasta_arquivos, relativo)
        if destino is None:
            problemas.append({"caminho": a["caminho"], "problema": "caminho inseguro (não baixado)"})
            continue
        try:
            tamanho, resumo = sb.baixar(a["caminho"], destino)
        except ErroExportacao as e:
            problemas.append({"caminho": a["caminho"], "problema": f"não baixou: {e}"})
            continue
        if resumo != a["hash"] or tamanho != int(a["tamanho"]):
            problemas.append({"caminho": a["caminho"], "problema": "conteúdo diferente do registrado (hash ou tamanho)"})
        else:
            conferidos += 1
        if n % PROGRESSO_A_CADA == 0:
            print(f"  arquivos: {n} de {len(registrados)}")
    print(f"  arquivos: {conferidos} de {len(registrados)} conferidos")

    # Arquivos no armazenamento sem linha em "arquivos" (não deveria haver)
    sem_registro: list[str] = []
    try:
        no_servidor = sb.listar(obra_id)
        conhecidos = {a["caminho"] for a in registrados}
        for item in no_servidor:
            caminho = item["caminho"]
            if caminho in conhecidos:
                continue
            sem_registro.append(caminho)
            destino = destino_seguro(pasta_arquivos / "_sem_registro", caminho[len(prefixo):])
            if destino is None:
                problemas.append({"caminho": caminho, "problema": "caminho inseguro (não baixado)"})
                continue
            try:
                tamanho, _ = sb.baixar(caminho, destino)
                if item["tamanho"] is not None and int(item["tamanho"]) != tamanho:
                    problemas.append({"caminho": caminho, "problema": "tamanho diferente do que o servidor lista"})
            except ErroExportacao as e:
                problemas.append({"caminho": caminho, "problema": f"não baixou: {e}"})
    except ErroExportacao as e:
        avisos.append(f"Não foi possível listar o armazenamento para achar arquivos sem registro: {e}")
    if sem_registro:
        avisos.append(f"{len(sem_registro)} arquivo(s) no servidor sem registro na tabela arquivos (em arquivos/_sem_registro).")

    # Manifesto e leia-me
    fim = dt.datetime.now(dt.timezone.utc)
    manifesto = {
        "formato": FORMATO,
        "ferramenta": "pipeline/exportar_obra.py",
        "obra": {"id": obra_id, "codigo": obra["codigo"], "nome": obra["nome"]},
        "servidor": sb.url,
        "exportado_por": {"email": email, "id": usuario["id"], "papel": papel},
        "inicio": inicio.isoformat(),
        "fim": fim.isoformat(),
        "linhas": contagem,
        "arquivos": {
            "registrados": len(registrados),
            "conferidos": conferidos,
            "sem_registro": sem_registro,
            "problemas": problemas,
            "bytes": sum(int(a["tamanho"]) for a in registrados),
        },
        "avisos": avisos,
        "renovacoes_de_login": sb.renovacoes,
    }
    gravar_json(saida / "manifesto.json", manifesto)
    texto_problemas = "".join(f"\n  PROBLEMA: {p['caminho']}: {p['problema']}" for p in problemas)
    texto_problemas += "".join(f"\n  AVISO: {a}" for a in avisos)
    (saida / "LEIAME.txt").write_text(
        LEIAME.format(
            codigo=obra["codigo"],
            nome=obra["nome"],
            quando=fim.astimezone().strftime("%d/%m/%Y %H:%M"),
            email=email,
            linhas=sum(contagem.values()),
            arquivos_ok=conferidos,
            arquivos_total=len(registrados),
            problemas=texto_problemas,
            obra_id=obra_id,
        ),
        encoding="utf-8",
    )
    os.replace(saida, final)
    situacao["pasta"] = None
    situacao["final"] = final

    if args.zip:
        shutil.make_archive(str(final), "zip", root_dir=final.parent, base_dir=final.name)
        print(f"Zip: {final}.zip")

    print(f"Pronto: {sum(contagem.values())} linha(s), {conferidos}/{len(registrados)} arquivo(s) conferido(s).")
    for a in avisos:
        print(f"AVISO: {a}")
    for p in problemas:
        print(f"PROBLEMA: {p['caminho']}: {p['problema']}")
    return 2 if problemas else 0


def main(argv: list[str] | None = None) -> int:
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(errors="replace")  # console do Windows sem UTF-8 não derruba o programa
        except (AttributeError, ValueError):
            pass
    p = argparse.ArgumentParser(description="Exporta uma obra inteira do Sistema Obra (dados, arquivos e SQL).")
    p.add_argument("obra", help="código da obra, ex.: EXE")
    p.add_argument("--saida", default=".", help="pasta onde criar a exportação (fora do repositório)")
    p.add_argument("--email", help="seu e-mail de login (se faltar, pergunta)")
    p.add_argument("--zip", action="store_true", help="gera também um .zip da pasta")
    p.add_argument("--url", default=os.environ.get("SISTEMA_OBRA_URL", URL_PADRAO), help=argparse.SUPPRESS)
    p.add_argument("--chave", default=os.environ.get("SISTEMA_OBRA_CHAVE", CHAVE_PADRAO), help=argparse.SUPPRESS)
    p.add_argument("--permitir-repositorio", action="store_true", help=argparse.SUPPRESS)
    args = p.parse_args(argv)
    situacao: dict = {"pasta": None}
    try:
        return exportar(args, situacao)
    except ErroExportacao as e:
        print(f"ERRO: {e}", file=sys.stderr)
    except OSError as e:
        print(f"ERRO: problema ao gravar no PC: {descrever(e)}", file=sys.stderr)
    except (KeyboardInterrupt, EOFError):
        print("Interrompido.", file=sys.stderr)
    if situacao["pasta"]:
        print(f"A pasta {situacao['pasta']} ficou pela metade. Pode apagar e rodar de novo.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())

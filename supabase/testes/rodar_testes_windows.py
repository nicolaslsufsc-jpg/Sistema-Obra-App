r"""Roda os testes do banco no Windows, sem psql nem Docker (faz o mesmo que rodar_testes.sh).

Uso (na raiz do repositório):  python supabase/testes/rodar_testes_windows.py

Precisa de:
- Python com psycopg:  python -m pip install "psycopg[binary]"
- Postgres portátil (uma vez só, fora do repositório):
    mkdir %USERPROFILE%\.cache\sistema-obra\embedded-postgres
    cd %USERPROFILE%\.cache\sistema-obra\embedded-postgres
    npm i @embedded-postgres/windows-x64@17.11.0-beta.19
  Ou aponte PGBIN para uma pasta com initdb.exe, pg_ctl.exe e postgres.exe.

Imita só os meta-comandos do psql que os testes usam: \echo, \ir, \set, \gset e :'var'.
Sobe um Postgres descartável em 127.0.0.1:54329 e apaga tudo no fim. Não toca no Supabase.
Saída 0 = tudo passou; qualquer erro mostra o comando que falhou e sai com 1.
"""
import glob, os, re, shutil, subprocess, sys, tempfile, time
import psycopg

BIN = os.environ.get('PGBIN') or os.path.join(
    os.path.expanduser('~'), '.cache', 'sistema-obra', 'embedded-postgres',
    'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin')
PORTA = 54329


def dividir(sql):
    """Divide em comandos SQL e meta-comandos (linhas com barra), como o psql."""
    itens, i, n = [], 0, len(sql)
    buf = ''
    while i < n:
        c = sql[i]
        if c == '-' and sql.startswith('--', i):
            j = sql.find('\n', i); j = n if j < 0 else j
            buf += sql[i:j]; i = j; continue
        if c == '/' and sql.startswith('/*', i):
            j = sql.find('*/', i + 2); j = n if j < 0 else j + 2
            buf += sql[i:j]; i = j; continue
        if c == "'" or c == '"':
            j = i + 1
            while j < n:
                if sql[j] == c:
                    if j + 1 < n and sql[j + 1] == c: j += 2; continue
                    break
                j += 1
            buf += sql[i:j + 1]; i = j + 1; continue
        if c == '$':
            m = re.match(r'\$([A-Za-z_][A-Za-z_0-9]*)?\$', sql[i:])
            if m:
                tag = m.group(0)
                j = sql.find(tag, i + len(tag)); j = n if j < 0 else j + len(tag)
                buf += sql[i:j]; i = j; continue
        if c == '\\':
            # meta-comando: até o fim da linha
            j = sql.find('\n', i); j = n if j < 0 else j
            meta = sql[i:j].strip()
            if meta.startswith('\\gset'):
                itens.append(('gset', buf)); buf = ''
            else:
                if buf.strip(): itens.append(('sql', buf)); buf = ''
                itens.append(('meta', meta))
            i = j; continue
        if c == ';':
            itens.append(('sql', buf + ';')); buf = ''; i += 1; continue
        buf += c; i += 1
    if buf.strip() and not re.fullmatch(r'(\s|--[^\n]*)*', buf): itens.append(('sql', buf))
    return itens


def subst(sql, vars_):
    def r(m):
        nome = m.group(1)
        return "'" + vars_[nome].replace("'", "''") + "'"
    return re.sub(r":'([A-Za-z_][A-Za-z_0-9]*)'", r, sql)


def rodar_arquivo(conn, caminho, vars_):
    with open(caminho, encoding='utf-8') as f:
        texto = f.read()
    for tipo, conteudo in dividir(texto):
        if tipo == 'meta':
            partes = conteudo.split(None, 1)
            cmd, arg = partes[0], (partes[1] if len(partes) > 1 else '')
            if cmd == '\\echo':
                print(arg.strip("'"))
            elif cmd in ('\\ir', '\\i'):
                rodar_arquivo(conn, os.path.normpath(os.path.join(os.path.dirname(caminho), arg.strip())), vars_)
            elif cmd == '\\set':
                p = arg.split(None, 1)
                vars_[p[0]] = p[1] if len(p) > 1 else ''
            else:
                raise RuntimeError(f'meta-comando não suportado: {conteudo} em {caminho}')
            continue
        sql = subst(conteudo, vars_)
        if not re.sub(r'--[^\n]*', '', sql).strip(' \n\r\t;'):
            continue
        try:
            cur = conn.execute(sql)
        except Exception as e:
            print(f'\nERRO em {os.path.basename(caminho)}:\n{e}\n--- comando ---\n{sql.strip()[:1500]}')
            raise SystemExit(1)
        if tipo == 'gset':
            linha = cur.fetchone()
            for col, val in zip([d.name for d in cur.description], linha):
                vars_[col] = '' if val is None else str(val)


def main():
    if not os.path.exists(os.path.join(BIN, 'initdb.exe')):
        sys.exit(f'Postgres portátil não encontrado em {BIN}. Veja as instruções no início deste arquivo.')
    base = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    tmp = tempfile.mkdtemp(prefix='pgteste_')
    dados = os.path.join(tmp, 'dados')
    subprocess.run([os.path.join(BIN, 'initdb.exe'), '-D', dados, '-U', 'postgres', '-A', 'trust',
                    '-E', 'UTF8', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
    subprocess.Popen([os.path.join(BIN, 'pg_ctl.exe'), '-D', dados, '-l', os.path.join(tmp, 'log'),
                      '-o', f'-p {PORTA} -c listen_addresses=127.0.0.1', 'start'],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
    conn = None
    for _ in range(60):
        try:
            conn = psycopg.connect(f'host=127.0.0.1 port={PORTA} user=postgres dbname=postgres', autocommit=True)
            break
        except Exception:
            time.sleep(0.5)
    if conn is None:
        print(open(os.path.join(tmp, 'log'), encoding='utf-8', errors='replace').read()); sys.exit(1)
    oks = [0]
    def notice(d):
        msg = d.message_primary
        if msg.startswith('ok'): oks[0] += 1
        else: print('  NOTICE:', msg)
    conn.add_notice_handler(notice)
    codigo = 0
    try:
        print('== imitação do Supabase')
        rodar_arquivo(conn, os.path.join(base, 'testes', 'stub_supabase.sql'), {})
        for m in sorted(glob.glob(os.path.join(base, 'migrations', '*.sql'))):
            print('== migração', os.path.basename(m))
            rodar_arquivo(conn, m, {})
        print('== testes')
        for t in sorted(glob.glob(os.path.join(base, 'testes', 'testes_*.sql'))):
            rodar_arquivo(conn, t, {})
        print(f'checagens ok: {oks[0]}')
    except SystemExit as e:
        codigo = e.code or 1
    finally:
        conn.close()
        subprocess.run([os.path.join(BIN, 'pg_ctl.exe'), '-D', dados, '-m', 'immediate', 'stop'],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
        time.sleep(1)
        shutil.rmtree(tmp, ignore_errors=True)
    sys.exit(codigo)


if __name__ == '__main__':
    main()

// Teste da exportação de obra (pipeline/exportar_obra.py) contra o PostgREST de verdade e o
// servidor de teste, e da restauração do restaurar.sql num banco novo.
// Rodar com: bash supabase/testes/rodar_integracao.sh

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BancoLocal } from '../src/nucleo/banco_local'
import { Sincronizador } from '../src/nucleo/sincronizacao'
import { TABELAS_NUCLEO } from '../src/config'
import { iniciarServidorTeste, tokenDe, type ServidorTeste } from './servidor_teste'
import { CODIGO_TESTE, OBRA1, USUARIOS } from './dados'

const PGRST = process.env.SO_PGRST_URL
const SEGREDO = process.env.SO_JWT_SEGREDO ?? ''
const suite = PGRST ? describe : describe.skip
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT = path.join(REPO, 'pipeline', 'exportar_obra.py')
const TABELAS_COM_OBRA = ['pavimentos', 'setores', 'elementos', 'arquivos', 'teste_eventos']
const NIL = '00000000-0000-0000-0000-000000000000'
const DIARIO_ORIGINAL = 'e0000000-0000-0000-0000-0000000000e1'
const DIARIO_CORRECAO = 'e0000000-0000-0000-0000-0000000000e2'
const { admin, campo } = USUARIOS

let servidor: ServidorTeste
let sql: pg.Client
const pastas: string[] = []
let bancosCriados = 0

function novaPasta() {
  const p = mkdtempSync(path.join(os.tmpdir(), 'sistema-obra-export-'))
  pastas.push(p)
  return p
}

interface Saida {
  status: number | null
  stdout: string
  stderr: string
}

// Assíncrono de propósito: o servidor de teste roda neste mesmo processo e precisa
// continuar respondendo enquanto o Python faz os pedidos.
function rodar(args: string[], entrada: string, env: Record<string, string> = {}): Promise<Saida> {
  return new Promise((ok) => {
    const filho = spawn('python3', ['-I', SCRIPT, ...args], {
      env: { ...process.env, SISTEMA_OBRA_PAGINA: '2', TZ: 'America/Sao_Paulo', ...env }, // páginas de 2: testa a paginação
    })
    let stdout = ''
    let stderr = ''
    filho.stdout.on('data', (d) => (stdout += d))
    filho.stderr.on('data', (d) => (stderr += d))
    const limite = setTimeout(() => filho.kill(), 120_000)
    filho.on('close', (status) => {
      clearTimeout(limite)
      ok({ status, stdout, stderr })
    })
    filho.stdin.end(entrada)
  })
}

function exportar(saida: string, codigo = CODIGO_TESTE, email: string = admin.email, extras: string[] = []): Promise<Saida> {
  return rodar(
    ['OBRA1', '--saida', saida, '--email', email, '--url', servidor.url, '--chave', 'chave-publica-de-teste', ...extras],
    `${codigo}\n`,
  )
}

function python(codigo: string, env: Record<string, string> = {}): string {
  const prefixo = `import sys; sys.path.insert(0, ${JSON.stringify(path.dirname(SCRIPT))}); import exportar_obra as e\n`
  return execFileSync('python3', ['-I', '-c', prefixo + codigo], {
    encoding: 'utf8',
    env: { ...process.env, TZ: 'America/Sao_Paulo', ...env },
  })
}

function psql(banco: string, arquivo: string, env: Record<string, string> = {}) {
  execFileSync(
    'psql',
    ['-h', process.env.SO_PG_HOST!, '-p', process.env.SO_PG_PORT!, '-U', 'postgres', '-d', banco, '-v', 'ON_ERROR_STOP=1', '-q', '-X', '-o', '/dev/null', '-f', arquivo],
    { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ...env } },
  )
}

/** Banco novo com as migrações. Devolve o nome e um cliente conectado. */
async function bancoNovo(antesDeRestaurar: string[] = []): Promise<{ nome: string; cliente: pg.Client }> {
  const nome = `restauracao_${++bancosCriados}`
  await sql.query(`drop database if exists ${nome}`)
  await sql.query(`create database ${nome}`)
  const testes = path.join(REPO, 'supabase', 'testes')
  psql(nome, path.join(testes, 'stub_supabase.sql'))
  for (const m of readdirSync(path.join(REPO, 'supabase', 'migrations')).sort()) {
    psql(nome, path.join(REPO, 'supabase', 'migrations', m))
  }
  psql(nome, path.join(testes, 'tabela_teste_eventos.sql'))
  const cliente = new pg.Client({ host: process.env.SO_PG_HOST, port: Number(process.env.SO_PG_PORT), user: 'postgres', database: nome })
  await cliente.connect()
  for (const q of antesDeRestaurar) await cliente.query(q)
  return { nome, cliente }
}

function pastaExportada(saida: string): string {
  const nomes = readdirSync(saida).filter((n) => !n.endsWith('.zip'))
  expect(nomes).toHaveLength(1)
  return path.join(saida, nomes[0])
}

suite('exportação de obra', () => {
  let pasta = ''
  let manifesto: {
    linhas: Record<string, number>
    arquivos: { registrados: number; conferidos: number; sem_registro: string[]; problemas: unknown[] }
    avisos: string[]
    renovacoes_de_login: number
  }

  beforeAll(async () => {
    servidor = await iniciarServidorTeste({ pgrstUrl: PGRST!, segredoJwt: SEGREDO, usuarios: Object.values(USUARIOS) })
    sql = new pg.Client({ host: process.env.SO_PG_HOST, port: Number(process.env.SO_PG_PORT), user: 'postgres', database: 'postgres' })
    await sql.connect()

    // Elementos ligados a um pavimento: a restauração tem que pôr pavimentos antes.
    await sql.query(
      `insert into public.elementos (obra_id, pavimento_id, tipo, nome, usuario_id, dispositivo_id, criado_em_dispositivo)
       select $1, (select id from public.pavimentos where obra_id = $1 and nome = 'Térreo'), 'P', 'PX' || g, $2, $3, now()
       from generate_series(1, 3) g`,
      [OBRA1, admin.id, NIL],
    )
    // Diário com uma correção (substitui_id): chave estrangeira conferida só no fim da transação.
    // A restauração religava os gatilhos com essa conferência pendente e o Postgres recusava
    // ("pending trigger events"): só aparecia quando outro teste tinha gravado no Diário (CI do #89).
    await sql.query(
      `insert into public.diario_efetivo (id, obra_id, data, funcao, quantidade, substitui_id, usuario_id, dispositivo_id, criado_em_dispositivo)
       values ($1, $3, current_date, 'Pedreiro (exportação)', 2, null, $4, $5, now()),
              ($2, $3, current_date, 'Pedreiro (exportação)', 3, $1, $4, $5, now())`,
      [DIARIO_ORIGINAL, DIARIO_CORRECAO, OBRA1, campo.id, NIL],
    )
    // Dados de campo: 2 fotos e 3 eventos enviados pelo app.
    const token = tokenDe(campo, SEGREDO)
    const cliente = createClient(servidor.url, 'chave-publica-de-teste', { accessToken: async () => token })
    const s = new Sincronizador({ banco: new BancoLocal('export-1'), cliente, tabelas: [...TABELAS_NUCLEO, 'teste_eventos'] })
    for (const [i, nome] of ['NC P1.jpg', 'NC V2.png'].entries()) {
      await s.registrarArquivo(OBRA1, campo.id, 'fvs', new Blob([new Uint8Array([i, 1, 2, 3, 200])], { type: 'image/jpeg' }), nome)
    }
    for (const r of ['C', 'NC', 'NA']) await s.registrar('teste_eventos', OBRA1, campo.id, { elemento: 'P1', resultado: r })
    expect(await s.enviar(campo.id)).toEqual({ enviados: 5, comErro: 0 })
    // Arquivo no armazenamento sem linha em "arquivos" (não deveria acontecer; a exportação acha).
    const solto = await cliente.storage.from('obras').upload(`${OBRA1}/fvs/solto.bin`, new Uint8Array([9, 9]))
    expect(solto.error).toBeNull()
  }, 60_000)

  afterEach(() => {
    servidor.antesDoPedido = undefined
  })

  afterAll(async () => {
    await sql?.end()
    await servidor?.fechar()
    for (const p of pastas) rmSync(p, { recursive: true, force: true })
  })

  it('exporta dados e arquivos conferidos, só da obra pedida', async () => {
    const saida = novaPasta()
    const r = await exportar(saida, CODIGO_TESTE, admin.email, ['--zip'])
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0)

    pasta = pastaExportada(saida)
    expect(path.basename(pasta)).toMatch(/^\d{4}-\d{2}-\d{2}_export-OBRA1_v01$/)
    expect(existsSync(`${pasta}.zip`)).toBe(true)
    manifesto = JSON.parse(readFileSync(path.join(pasta, 'manifesto.json'), 'utf8'))

    for (const t of TABELAS_COM_OBRA) {
      const { rows } = await sql.query(`select count(*)::int as n from public.${t} where obra_id = $1`, [OBRA1])
      expect(manifesto.linhas[`public.${t}`], t).toBe(rows[0].n)
      const linhas = JSON.parse(readFileSync(path.join(pasta, 'dados', `${t}.json`), 'utf8')) as { obra_id: string }[]
      expect(linhas.every((l) => l.obra_id === OBRA1), `${t} só da OBRA1`).toBe(true)
    }
    const { rows: acessos } = await sql.query('select count(*)::int as n from public.acessos where obra_id = $1', [OBRA1])
    expect(manifesto.linhas['public.acessos']).toBe(acessos[0].n)

    expect(manifesto.arquivos.problemas).toEqual([])
    expect(manifesto.arquivos.conferidos).toBe(manifesto.arquivos.registrados)
    expect(manifesto.arquivos.registrados).toBe(manifesto.linhas['public.arquivos'])
    expect(manifesto.arquivos.sem_registro).toEqual([`${OBRA1}/fvs/solto.bin`])
    expect(manifesto.renovacoes_de_login).toBe(0)

    const arquivos = JSON.parse(readFileSync(path.join(pasta, 'dados', 'arquivos.json'), 'utf8')) as { caminho: string; hash: string }[]
    for (const a of arquivos) {
      const bytes = readFileSync(path.join(pasta, 'arquivos', a.caminho.slice(OBRA1.length + 1)))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(a.hash)
      expect(bytes.equals(servidor.arquivos.get(`obras/${a.caminho}`)!)).toBe(true)
    }
    expect(existsSync(path.join(pasta, 'arquivos', '_sem_registro', 'fvs', 'solto.bin'))).toBe(true)
    expect(readdirSync(path.join(pasta, 'arquivos', 'fvs')).some((n) => n.endsWith('.parcial'))).toBe(false)

    const csv = readFileSync(path.join(pasta, 'dados', 'pavimentos.csv'), 'utf8')
    expect(csv.charCodeAt(0)).toBe(0xfeff) // BOM: acentos certos no Excel
    expect(csv.split('\n')[0]).toMatch(/^\uFEFFid;obra_id;nome;ordem;/)
    expect(csv).toContain('Térreo')
    expect(csv).toMatch(/;\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2};/) // hora no formato do Excel
    expect(csv).toContain(';não') // apagado = false
    expect(readFileSync(path.join(pasta, 'LEIAME.txt'), 'utf8')).toContain('Exportação da obra OBRA1')
  })

  it('restaurar.sql recria a obra num banco novo (psql em WIN1252), sem mexer em contas que já existiam', async () => {
    expect(pasta).not.toBe('')
    // No destino, o gestor já existe como usuário comum e sem acesso: a restauração não muda isso.
    const { nome, cliente: novo } = await bancoNovo([
      `insert into auth.users (id, email) values ('${USUARIOS.gestor.id}', 'gestor@outra.local')`,
    ])
    try {
      // Como no PowerShell em português: o psql fala WIN1252 e o restaurar.sql tem que impor UTF-8.
      psql(nome, path.join(pasta, 'restaurar.sql'), { PGCLIENTENCODING: 'WIN1252' })

      for (const t of TABELAS_COM_OBRA) {
        const { rows } = await novo.query(`select count(*)::int as n from public.${t} where obra_id = $1`, [OBRA1])
        expect(rows[0].n, t).toBe(manifesto.linhas[`public.${t}`])
      }
      // Acentos preservados mesmo com o psql em WIN1252 (outros testes podem ter acrescentado pavimentos).
      const consultaNomes = 'select nome from public.pavimentos where obra_id = $1 order by ordem, nome'
      const nomes = (await novo.query(consultaNomes, [OBRA1])).rows.map((n) => n.nome)
      expect(nomes).toEqual((await sql.query(consultaNomes, [OBRA1])).rows.map((n) => n.nome))
      expect(nomes).toEqual(expect.arrayContaining(['Térreo', '2º Pavimento', 'Cobertura']))
      // Diário com a correção apontando para o original (chave conferida no fim da carga)
      const { rows: diario } = await novo.query('select id, substitui_id, quantidade from public.diario_efetivo where id in ($1, $2) order by id', [
        DIARIO_ORIGINAL,
        DIARIO_CORRECAO,
      ])
      expect(diario).toEqual([
        { id: DIARIO_ORIGINAL, substitui_id: null, quantidade: 2 },
        { id: DIARIO_CORRECAO, substitui_id: DIARIO_ORIGINAL, quantidade: 3 },
      ])
      // Horas do servidor preservadas (os gatilhos ficam desligados na carga).
      const consulta = `select id, criado_em_servidor, atualizado_em, usuario_id from public.teste_eventos where obra_id = $1 order by id`
      expect((await novo.query(consulta, [OBRA1])).rows).toEqual((await sql.query(consulta, [OBRA1])).rows)
      // Contas novas: perfil, papel e acessos como na exportação.
      const { rows: perfil } = await novo.query('select nome, papel from public.perfis where id = $1', [admin.id])
      expect(perfil[0]).toEqual({ nome: 'Admin', papel: 'admin' })
      const { rows: acessoCampo } = await novo.query('select papel from public.acessos where usuario_id = $1 and obra_id = $2', [campo.id, OBRA1])
      expect(acessoCampo[0].papel).toBe('campo')
      // Conta que já existia: continua usuário comum e sem acesso.
      const { rows: gestor } = await novo.query('select papel from public.perfis where id = $1', [USUARIOS.gestor.id])
      expect(gestor[0].papel).toBe('usuario')
      const { rows: acessoGestor } = await novo.query('select count(*)::int as n from public.acessos where usuario_id = $1', [USUARIOS.gestor.id])
      expect(acessoGestor[0].n).toBe(0)
      // Sem a chave secreta, a exportação não vê e-mails: as contas novas voltam sem e-mail.
      const { rows: contas } = await novo.query('select count(*)::int as n from auth.users where email is not null')
      expect(contas[0].n).toBe(1)
      // Rodar de novo no mesmo banco falha inteiro (obra já existe) e não mistura dados.
      expect(() => psql(nome, path.join(pasta, 'restaurar.sql'))).toThrow()
    } finally {
      await novo.end()
    }
  })

  it('login que vence durante a exportação é renovado sozinho (antes de vencer e depois de recusado)', async () => {
    // Faltam 50 s para vencer: renova antes do primeiro pedido.
    servidor.proximaSessao({ exp: 50 })
    const antes = servidor.pedidos.get('POST /auth/v1/token') ?? 0
    let r = await exportar(novaPasta())
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0)
    expect((servidor.pedidos.get('POST /auth/v1/token') ?? 0) - antes).toBeGreaterThanOrEqual(1)
    expect(r.stdout).toMatch(/arquivos: (\d+) de \1 conferidos/) // todos conferidos

    // O servidor diz que vale 1 h, mas o token já está vencido: o primeiro pedido é recusado,
    // o script renova e repete.
    servidor.proximaSessao({ exp: -3600, informada: 3600 })
    const antes2 = servidor.pedidos.get('POST /auth/v1/token') ?? 0
    r = await exportar(novaPasta())
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0)
    expect((servidor.pedidos.get('POST /auth/v1/token') ?? 0) - antes2).toBe(1)
    expect(r.stdout).toMatch(/arquivos: (\d+) de \1 conferidos/) // todos conferidos
  })

  it('queda de conexão no meio de um arquivo: tenta de novo e termina inteiro', async () => {
    let derrubadas = 0
    servidor.antesDoPedido = async (metodo, caminho) => {
      if (metodo === 'GET' && caminho.includes('/storage/v1/object/') && derrubadas === 0) {
        derrubadas++
        return 'derrubar'
      }
    }
    const r = await exportar(novaPasta())
    expect(derrubadas).toBe(1)
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0)
    expect(r.stdout).toMatch(/arquivos: (\d+) de \1 conferidos/) // todos conferidos
  }, 60_000)

  it('obra que muda durante a exportação: o restaurar.sql continua válido', async () => {
    // Enquanto o script lê, alguém cria um pavimento novo e um elemento ligado a ele.
    let criado = false
    servidor.antesDoPedido = async (_metodo, caminho) => {
      if (caminho.startsWith('/rest/v1/elementos') && !criado) {
        criado = true
        await sql.query(
          `with p as (
             insert into public.pavimentos (obra_id, nome, ordem, usuario_id, dispositivo_id, criado_em_dispositivo)
             values ($1, 'Mezanino novo', 50, $2, $3, now()) returning id)
           insert into public.elementos (obra_id, pavimento_id, tipo, nome, usuario_id, dispositivo_id, criado_em_dispositivo)
           select $1, p.id, 'V', 'VNOVA', $2, $3, now() from p`,
          [OBRA1, admin.id, NIL],
        )
      }
    }
    const saida = novaPasta()
    const r = await exportar(saida)
    expect(criado).toBe(true)
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0)
    const p = pastaExportada(saida)
    const { nome, cliente: novo } = await bancoNovo()
    try {
      psql(nome, path.join(p, 'restaurar.sql'))
      const { rows } = await novo.query("select count(*)::int as n from public.elementos where nome = 'VNOVA'")
      expect(rows[0].n).toBe(1)
    } finally {
      await novo.end()
    }
  })

  it('arquivo no servidor diferente do registrado é apontado como problema', async () => {
    const { rows } = await sql.query("select caminho from public.arquivos where obra_id = $1 and nome_original = 'NC P1.jpg'", [OBRA1])
    const chave = `obras/${rows[0].caminho}`
    const original = servidor.arquivos.get(chave)!
    servidor.arquivos.set(chave, Buffer.from([0, 0, 0]))
    try {
      const r = await exportar(novaPasta())
      expect(r.status, r.stdout).toBe(2)
      expect(r.stdout).toContain(`PROBLEMA: ${rows[0].caminho}: conteúdo diferente do registrado`)
    } finally {
      servidor.arquivos.set(chave, original)
    }
  })

  it('exportado por gestor com pessoa que saiu da obra: restaura com perfil provisório', async () => {
    // A pessoa "fora" registrou um evento e depois perdeu o acesso: o gestor não vê o perfil dela.
    await sql.query(
      `insert into public.teste_eventos (id, obra_id, elemento, resultado, usuario_id, dispositivo_id, criado_em_dispositivo)
       values (gen_random_uuid(), $1, 'P99', 'C', $2, $3, now())`,
      [OBRA1, USUARIOS.fora.id, NIL],
    )
    const saida = novaPasta()
    const r = await exportar(saida, CODIGO_TESTE, USUARIOS.gestor.email)
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0)
    expect(r.stdout).toMatch(/sem perfil visível/)
    const { nome, cliente: novo } = await bancoNovo()
    try {
      psql(nome, path.join(pastaExportada(saida), 'restaurar.sql'))
      const { rows } = await novo.query('select nome from public.perfis where id = $1', [USUARIOS.fora.id])
      expect(rows[0].nome).toBe('pessoa não exportada')
      const { rows: ev } = await novo.query("select count(*)::int as n from public.teste_eventos where elemento = 'P99'")
      expect(ev[0].n).toBe(1)
    } finally {
      await novo.end()
    }
  })

  it('caminho de arquivo nunca sai da pasta de saída (defesa no script, além do banco)', () => {
    const base = path.join(os.tmpdir(), 'so-base')
    const saida = python(`
import pathlib
base = pathlib.Path(${JSON.stringify(base)})
casos = ['../../vizinho.txt', '/tmp/x', 'fvs//x.jpg', 'fvs/./x', 'fvs/C:/x.bat', 'fvs/a\\\\b', 'fvs/x?.jpg', 'fvs/nome. ', 'fvs/\\x01.jpg', '']
print([e.destino_seguro(base, c) for c in casos])
print(e.destino_seguro(base, 'fvs/plantas/3PAV-trecho_2.v01.png'))
`)
    const [ruins, bom] = saida.trim().split('\n')
    expect(ruins).toBe('[None, None, None, None, None, None, None, None, None, None]')
    expect(bom).toBe(path.join(base, 'fvs', 'plantas', '3PAV-trecho_2.v01.png'))
  })

  it('CSV para o Excel em português: vírgula decimal, sim/não, hora local, sem fórmula', () => {
    const saida = python(`
print(e.valor_csv(8.125), e.valor_csv(7.5), e.valor_csv(10), e.valor_csv(True), e.valor_csv(False), e.valor_csv(None), sep='|')
print(e.valor_csv('2026-11-03T18:26:53.29113+00:00'), e.valor_csv('2026-11-03T15:26:53-03:00'), e.valor_csv('2026-11-03'), sep='|')
print(e.valor_csv('=1+1'), e.valor_csv('+2 cm'), e.valor_csv('- ver prancha'), e.valor_csv('@x'), e.valor_csv('texto normal'), e.valor_csv({'a': 1}), sep='|')
`)
    expect(saida.trim().split('\n')).toEqual([
      '8,125|7,5|10|sim|não|',
      '03/11/2026 15:26:53|03/11/2026 15:26:53|03/11/2026',
      "'=1+1|'+2 cm|'- ver prancha|'@x|texto normal|{\"a\": 1}",
    ])
  })

  it('não salva dentro do repositório', async () => {
    const r = await exportar(REPO)
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/repositório/)
  })

  it('pasta de saída inválida é recusada antes de gastar um e-mail', async () => {
    const antes = servidor.codigosPedidos.length
    const r = await exportar('/proc/naoexiste/EXE')
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/Não consegui gravar em/)
    expect(r.stderr).not.toMatch(/Traceback/)
    expect(servidor.codigosPedidos.length).toBe(antes)
  })

  it('código errado: até 3 tentativas sem gastar outro e-mail; 3 erros param sem criar nada', async () => {
    const saida = novaPasta()
    const antes = servidor.codigosPedidos.length
    let r = await rodar(
      ['obra1', '--saida', saida, '--email', admin.email, '--url', servidor.url, '--chave', 'chave-publica-de-teste'],
      `000000\n12\n${CODIGO_TESTE}\n`,
    )
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0) // "obra1" vira OBRA1; 3º código certo
    expect(r.stdout.match(/Tente de novo/g)).toHaveLength(2)
    expect(servidor.codigosPedidos.length - antes).toBe(1)

    const saida2 = novaPasta()
    r = await exportar(saida2, '000000\n000000\n000000')
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/3 vezes/)
    expect(readdirSync(saida2)).toEqual([])
  })

  it('--zip: apagar a pasta e deixar o zip não faz a próxima exportação sobrescrever o zip', async () => {
    const saida = novaPasta()
    let r = await exportar(saida, CODIGO_TESTE, admin.email, ['--zip'])
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0)
    const primeira = pastaExportada(saida)
    rmSync(primeira, { recursive: true })
    const zipAntes = readFileSync(`${primeira}.zip`)
    r = await exportar(saida, CODIGO_TESTE, admin.email, ['--zip'])
    expect(r.status).toBe(0)
    expect(path.basename(pastaExportada(saida))).toMatch(/_v02$/)
    expect(readFileSync(`${primeira}.zip`).equals(zipAntes)).toBe(true)
  })
})

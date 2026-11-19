// Pessoas da obra (admin dá, muda e tira acesso) contra o PostgREST de verdade.
// Rodar com: bash supabase/testes/rodar_integracao.sh

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'
import { BancoLocal } from '../src/nucleo/banco_local'
import { Conta } from '../src/nucleo/conta'
import { Pessoas, textoDoErro } from '../src/nucleo/pessoas'
import { iniciarServidorTeste, type ServidorTeste, type UsuarioTeste } from './servidor_teste'
import { CODIGO_TESTE, OBRA1, OBRA2, USUARIOS } from './dados'

const PGRST = process.env.SO_PGRST_URL
const suite = PGRST ? describe : describe.skip
const { admin, campo, fora, gestor } = USUARIOS

let servidor: ServidorTeste
let sql: pg.Client
let contador = 0

async function clienteDe(u: UsuarioTeste): Promise<SupabaseClient> {
  const cliente = createClient(servidor.url, 'chave-publica-de-teste', {
    auth: { persistSession: true, autoRefreshToken: false, storageKey: `pessoas-${++contador}` },
  })
  const conta = new Conta(cliente, new BancoLocal(`pessoas-${contador}`))
  expect(await conta.pedirCodigo(u.email)).toBeNull()
  expect(await conta.confirmarCodigo(u.email, CODIGO_TESTE)).toEqual({ id: u.id, email: u.email })
  return cliente
}

suite('pessoas da obra', () => {
  beforeAll(async () => {
    servidor = await iniciarServidorTeste({
      pgrstUrl: PGRST!,
      segredoJwt: process.env.SO_JWT_SEGREDO!,
      usuarios: Object.values(USUARIOS),
    })
    sql = new pg.Client({ host: process.env.SO_PG_HOST, port: Number(process.env.SO_PG_PORT), user: 'postgres', database: 'postgres' })
    await sql.connect()
  })

  afterAll(async () => {
    // Deixa "fora" sem acesso, como os outros testes esperam.
    await sql?.query('delete from public.acessos where usuario_id = $1', [fora.id])
    await sql?.end()
    await servidor?.fechar()
  })

  it('admin vê quem tem acesso (ele incluso) e quem entrou sem acesso; dá, muda e tira acesso', async () => {
    const p = new Pessoas(await clienteDe(admin))
    const antes = await p.daObra(OBRA1)
    expect(Array.isArray(antes) && antes.map((x) => [x.email, x.papel])).toEqual([
      ['admin@teste.local', 'admin'],
      ['campo@teste.local', 'campo'],
      ['gestor@teste.local', 'gestor'],
      ['leitura@teste.local', 'leitura'],
    ])
    const sem = await p.semAcesso(OBRA1)
    expect(typeof sem !== 'string' && sem.contas.map((x) => [x.email, x.em_outra_obra])).toEqual([['fora@teste.local', false]])
    expect(typeof sem !== 'string' && sem.total).toBe(1)
    // Na obra 2, quem só está na obra 1 aparece marcado como "em outra obra".
    const sem2 = await p.semAcesso(OBRA2)
    expect(typeof sem2 !== 'string' && sem2.contas.map((x) => [x.email, x.em_outra_obra]).sort()).toEqual([
      ['campo@teste.local', true],
      ['fora@teste.local', false],
      ['leitura@teste.local', true],
    ])

    expect(await p.darAcesso(' Fora@Teste.local', OBRA1, 'campo')).toBeNull()
    const depois = await p.daObra(OBRA1)
    expect(Array.isArray(depois) && depois.find((x) => x.email === fora.email)?.papel).toBe('campo')
    expect(await p.semAcesso(OBRA1)).toEqual({ contas: [], total: 0 })

    expect(await p.mudarPapel(fora.id, OBRA1, 'leitura')).toBeNull()
    const { rows } = await sql.query('select papel from public.acessos where usuario_id = $1 and obra_id = $2', [fora.id, OBRA1])
    expect(rows[0].papel).toBe('leitura')

    expect(await p.tirarAcesso(fora.id, OBRA1)).toBeNull()
    const sem3 = await p.semAcesso(OBRA1)
    expect(typeof sem3 !== 'string' && sem3.contas.map((x) => x.email)).toEqual(['fora@teste.local'])

    // Acesso já tirado (por outro aparelho): mudar ou tirar de novo avisa em vez de dizer "deu certo".
    expect(await p.mudarPapel(fora.id, OBRA1, 'gestor')).toMatch(/já não tinha acesso/)
    expect(await p.tirarAcesso(fora.id, OBRA1)).toMatch(/já não tinha acesso/)
  })

  it('e-mail sem conta e admin: mensagens dizem o que fazer', async () => {
    const p = new Pessoas(await clienteDe(admin))
    expect(await p.darAcesso('ninguem@teste.local', OBRA1, 'campo')).toMatch(/nenhuma conta com o e-mail ninguem@teste.local.*entrar uma vez/)
    expect(await p.darAcesso(admin.email, OBRA1, 'campo')).toMatch(/é administrador e já vê todas as obras/)
  })

  it('quem não é admin não vê e-mails, não dá acesso e não muda nada em silêncio', async () => {
    const p = new Pessoas(await clienteDe(gestor))
    expect(await p.daObra(OBRA1)).toMatch(/só o administrador/)
    expect(await p.darAcesso(fora.email, OBRA1, 'gestor')).toMatch(/só o administrador/)
    // A RLS filtra sem erro (0 linhas): a biblioteca avisa em vez de devolver "deu certo".
    expect(await p.mudarPapel(campo.id, OBRA1, 'gestor')).toMatch(/Nada mudou/)
    expect(await p.tirarAcesso(campo.id, OBRA1)).toMatch(/Nada mudou/)
    const { rows } = await sql.query('select papel from public.acessos where usuario_id = $1 and obra_id = $2', [campo.id, OBRA1])
    expect(rows[0].papel).toBe('campo')
  })

  it('erros técnicos viram texto que diz o que fazer', () => {
    expect(textoDoErro({ gravidade: 'permanente', mensagem: 'permission denied for function pessoas_da_obra', codigo: '42501', status: 401 })).toMatch(
      /login venceu/,
    )
    expect(textoDoErro({ gravidade: 'permanente', mensagem: 'Could not find the function', codigo: 'PGRST202', status: 404 })).toMatch(/migração/)
    expect(textoDoErro({ gravidade: 'transitorio', mensagem: 'TypeError: fetch failed', status: 0 })).toBe('sem conexão com o servidor')
  })
})

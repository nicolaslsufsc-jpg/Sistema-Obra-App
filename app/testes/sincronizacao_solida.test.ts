// Sincronização sólida (prioridade 1 do Nicolas, 18/11/2026): um teste por risco do plano em
// docs/modulos/0_nucleo_sincronizacao.md. Biblioteca do núcleo contra PostgREST de verdade, como
// em sincronizacao.test.ts. Rodar com: bash supabase/testes/rodar_integracao.sh (sem as variáveis
// SO_* estes testes são pulados).
//
// it.fails = DEFEITO CONHECIDO, ainda sem correção. O teste descreve o comportamento certo; enquanto
// o defeito existe ele falha, e o it.fails faz isso contar como "passou". Quando a correção entrar,
// o vitest acusa "esperava falhar e passou": aí troque it.fails por it.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'
import { BancoLocal, type Linha } from '../src/nucleo/banco_local'
import { Sincronizador, type OpcoesSincronizador } from '../src/nucleo/sincronizacao'
import { Conta } from '../src/nucleo/conta'
import { entrarSemConta } from '../src/nucleo/local'
import { maisNovo, type EventoFvs } from '../src/fvs/situacao'
import { TABELAS_NUCLEO } from '../src/config'
import { iniciarServidorTeste, tokenDe, type ServidorTeste, type UsuarioTeste } from './servidor_teste'
import { CODIGO_TESTE, OBRA1, USUARIOS } from './dados'

const PGRST = process.env.SO_PGRST_URL
const SEGREDO = process.env.SO_JWT_SEGREDO ?? ''
const suite = PGRST ? describe : describe.skip
const TABELAS = [...TABELAS_NUCLEO, 'teste_eventos']
const { campo, gestor, leitura } = USUARIOS
const HORA = 60 * 60 * 1000

let servidor: ServidorTeste
let sql: pg.Client
let contador = 0

function clienteComToken(u: UsuarioTeste): SupabaseClient {
  const token = tokenDe(u, SEGREDO, 3600)
  return createClient(servidor.url, 'chave-publica-de-teste', { accessToken: async () => token })
}

function clienteComLogin(): SupabaseClient {
  return createClient(servidor.url, 'chave-publica-de-teste', {
    auth: { persistSession: true, autoRefreshToken: false, storageKey: `sessao-solida-${++contador}` },
  })
}

const nomeDeBanco = () => `solida-${++contador}`

function aparelho(u: UsuarioTeste, extra: Partial<OpcoesSincronizador> & Record<string, unknown> = {}) {
  const banco = new BancoLocal(nomeDeBanco())
  // `extra` pode trazer opções que só existem depois da correção (ex.: prazoMs, C2)
  const s = new Sincronizador({ banco, cliente: clienteComToken(u), tabelas: TABELAS, ...extra } as OpcoesSincronizador)
  return { banco, s }
}

async function entrar(conta: Conta, u: UsuarioTeste) {
  expect(await conta.pedirCodigo(u.email)).toBeNull()
  expect(await conta.confirmarCodigo(u.email, CODIGO_TESTE)).toEqual({ id: u.id, email: u.email })
}

async function contar(tabela: string, where: string, params: unknown[]): Promise<number> {
  const { rows } = await sql.query(`select count(*)::int as n from public.${tabela} where ${where}`, params)
  return rows[0].n
}

/** O registro que vale para um elemento, pela mesma regra da FVS (maisNovo). */
function ultimo(linhas: readonly Linha[], elemento: string): Linha | undefined {
  return linhas
    .filter((l) => l.elemento === elemento)
    .reduce<Linha | undefined>((a, l) => (!a || maisNovo(l as unknown as EventoFvs, a as unknown as EventoFvs) ? l : a), undefined)
}

const espera = (ms: number) => new Promise<'preso'>((ok) => setTimeout(() => ok('preso'), ms))

suite('sincronização sólida (riscos do plano de 18/11)', () => {
  beforeAll(async () => {
    servidor = await iniciarServidorTeste({ pgrstUrl: PGRST!, segredoJwt: SEGREDO, usuarios: Object.values(USUARIOS) })
    sql = new pg.Client({ host: process.env.SO_PG_HOST, port: Number(process.env.SO_PG_PORT), user: 'postgres', database: 'postgres' })
    await sql.connect()
  })

  afterAll(async () => {
    await sql?.end()
    await servidor?.fechar()
  })

  beforeEach(() => {
    servidor.derrubarRede(false)
    servidor.validadeToken(3600)
    servidor.antesDoPedido = undefined
  })

  // ---------------------------------------------------------------------------------------------
  // R1: o que foi marcado no modo sem conta (.zip) e a passagem para o login
  // ---------------------------------------------------------------------------------------------

  it('R1: entrar com e-mail não apaga o que foi marcado sem conta (passa para quem entrou, C1)', async () => {
    const banco = new BancoLocal(nomeDeBanco())
    const cliente = clienteComLogin()
    const s = new Sincronizador({ banco, cliente, tabelas: TABELAS })
    const local = await entrarSemConta(banco)
    await s.registrar('teste_eventos', OBRA1, local.id, { elemento: 'S1', resultado: 'C' })

    await entrar(new Conta(cliente, banco), campo)
    expect(await s.contarFila(local.id)).toEqual({ pendentes: 0, comErro: 0 })
    expect(await s.contarFila(campo.id)).toEqual({ pendentes: 1, comErro: 0 })
    expect((await s.linhas('teste_eventos', OBRA1)).map((l) => l.elemento)).toContain('S1')
  })

  it('R1: o que foi marcado sem conta sobe quando a pessoa entra com e-mail (correção C1)', async () => {
    const banco = new BancoLocal(nomeDeBanco())
    const cliente = clienteComLogin()
    const s = new Sincronizador({ banco, cliente, tabelas: TABELAS })
    const local = await entrarSemConta(banco)
    const linha = await s.registrar('teste_eventos', OBRA1, local.id, { elemento: 'S2', resultado: 'NC' })

    await entrar(new Conta(cliente, banco), campo)
    await s.sincronizar(OBRA1, campo.id)
    // Esperado: chegou ao servidor em nome de quem entrou, uma vez só, e a fila local zerou.
    expect(await contar('teste_eventos', 'id = $1 and usuario_id = $2', [linha.id, campo.id])).toBe(1)
    expect(await s.contarFila(local.id)).toEqual({ pendentes: 0, comErro: 0 })
  })

  // ---------------------------------------------------------------------------------------------
  // R2: pedido pendurado (internet fraca: a conexão fica aberta sem resposta)
  // ---------------------------------------------------------------------------------------------

  it('R2: envio pendurado não prende a sincronização (correção C2: prazo)', { timeout: 30_000 }, async () => {
    let soltar: () => void = () => {}
    const preso = new Promise<void>((ok) => (soltar = ok))
    servidor.antesDoPedido = async (metodo, caminho) => {
      if (metodo === 'POST' && caminho.startsWith('/rest/v1/teste_eventos')) {
        await preso
        return 'derrubar'
      }
    }
    try {
      const { s } = aparelho(campo, { prazoMs: 2_000 })
      await s.registrar('teste_eventos', OBRA1, campo.id, { elemento: 'S3', resultado: 'C' })
      const r = await Promise.race([s.sincronizar(OBRA1, campo.id).then(() => 'terminou' as const), espera(10_000)])
      // Esperado: a rodada desiste dentro do prazo (erro transitório), o item continua na fila.
      expect(r).toBe('terminou')
      expect(await s.contarFila(campo.id)).toEqual({ pendentes: 1, comErro: 0 })
    } finally {
      servidor.antesDoPedido = undefined
      soltar()
    }
  })

  // ---------------------------------------------------------------------------------------------
  // R3: dois aparelhos marcando o mesmo item; relógio errado
  // ---------------------------------------------------------------------------------------------

  it('R3: dois aparelhos marcam o mesmo item; depois de sincronizar, os dois mostram o mesmo', async () => {
    const a = aparelho(campo)
    const b = aparelho(gestor)
    await a.s.registrar('teste_eventos', OBRA1, campo.id, { elemento: 'S4', resultado: 'NC' })
    await b.s.registrar('teste_eventos', OBRA1, gestor.id, { elemento: 'S4', resultado: 'C' })
    await a.s.sincronizar(OBRA1, campo.id)
    await b.s.sincronizar(OBRA1, gestor.id)
    await a.s.sincronizar(OBRA1, campo.id)

    const naA = await a.s.linhas('teste_eventos', OBRA1)
    const naB = await b.s.linhas('teste_eventos', OBRA1)
    expect(naA.filter((l) => l.elemento === 'S4')).toHaveLength(2)
    expect(naB.filter((l) => l.elemento === 'S4')).toHaveLength(2)
    expect(ultimo(naA, 'S4')?.id).toBe(ultimo(naB, 'S4')?.id)
    expect(ultimo(naA, 'S4')?.resultado).toBe('C') // o mais recente
  })

  it('R3: aparelho com relógio 1 h adiantado não vence uma marcação feita depois (correção C3)', async () => {
    const adiantado = aparelho(gestor)
    const certo = aparelho(campo)
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + HORA)
      await adiantado.s.registrar('teste_eventos', OBRA1, gestor.id, { elemento: 'S5', resultado: 'NC' })
    } finally {
      vi.useRealTimers()
    }
    await adiantado.s.sincronizar(OBRA1, gestor.id)
    // marcado DEPOIS, num aparelho com a hora certa
    await certo.s.registrar('teste_eventos', OBRA1, campo.id, { elemento: 'S5', resultado: 'C' })
    await certo.s.sincronizar(OBRA1, campo.id)

    // O servidor troca a hora do futuro pela de chegada (migração 20261118120000): o C, feito depois, vale.
    expect(ultimo(await certo.s.linhas('teste_eventos', OBRA1), 'S5')?.resultado).toBe('C')
  })

  // ---------------------------------------------------------------------------------------------
  // R5: fila de outra pessoa no mesmo aparelho
  // ---------------------------------------------------------------------------------------------

  it('R5: A marca sem internet, B entra no aparelho, A volta: a fila de A sobe inteira', async () => {
    const banco = new BancoLocal(nomeDeBanco())
    const clienteA = clienteComLogin()
    await entrar(new Conta(clienteA, banco), campo)
    const sA = new Sincronizador({ banco, cliente: clienteA, tabelas: TABELAS })
    servidor.derrubarRede(true)
    const ids = []
    for (let i = 0; i < 5; i++) ids.push((await sA.registrar('teste_eventos', OBRA1, campo.id, { elemento: `S6-${i}`, resultado: 'C' })).id)
    servidor.derrubarRede(false)

    const clienteB = clienteComLogin()
    await entrar(new Conta(clienteB, banco), leitura)
    const sB = new Sincronizador({ banco, cliente: clienteB, tabelas: TABELAS })
    await sB.sincronizar(OBRA1, leitura.id)
    // C5: a tela de B mostra que há itens de outra pessoa esperando
    expect(await sB.contarDeOutros(leitura.id)).toBe(5)

    const clienteA2 = clienteComLogin()
    await entrar(new Conta(clienteA2, banco), campo)
    const r = await new Sincronizador({ banco, cliente: clienteA2, tabelas: TABELAS }).sincronizar(OBRA1, campo.id)
    expect(r.envio).toEqual({ enviados: 5, comErro: 0 })
    expect(await contar('teste_eventos', 'id = any($1::uuid[])', [ids])).toBe(5)
    expect(await sB.contarDeOutros(leitura.id)).toBe(0)
  })

  // ---------------------------------------------------------------------------------------------
  // R7: foto grande sem internet, app fechado e aberto de novo
  // ---------------------------------------------------------------------------------------------

  it('R7: foto de 5 MB sem internet, app fechado e reaberto, internet volta: sobe uma vez e sai do aparelho', { timeout: 60_000 }, async () => {
    const nome = nomeDeBanco()
    let banco = new BancoLocal(nome)
    let s = new Sincronizador({ banco, cliente: clienteComToken(campo), tabelas: TABELAS })
    servidor.derrubarRede(true)
    const bytes = new Uint8Array(5 * 1024 * 1024).map((_, i) => i % 251)
    const foto = await s.registrarArquivo(OBRA1, campo.id, 'fvs', new Blob([bytes], { type: 'image/jpeg' }), 'nc.jpg')
    expect((await s.enviar(campo.id)).parouPor?.gravidade).toBe('transitorio')

    // "fecha o app": fecha o banco e abre outro com o mesmo nome
    banco.close()
    banco = new BancoLocal(nome)
    s = new Sincronizador({ banco, cliente: clienteComToken(campo), tabelas: TABELAS })
    expect(await s.contarFila(campo.id)).toEqual({ pendentes: 1, comErro: 0 })

    servidor.derrubarRede(false)
    expect(await s.enviar(campo.id)).toEqual({ enviados: 1, comErro: 0 })
    expect(servidor.arquivos.get(`obras/${foto.caminho}`)?.length).toBe(bytes.length)
    expect(await contar('arquivos', 'id = $1', [foto.id])).toBe(1)
    expect(await banco.conteudos.count()).toBe(0)
  })

  // ---------------------------------------------------------------------------------------------
  // Muitos registros sem internet, reenvio no meio
  // ---------------------------------------------------------------------------------------------

  it('200 marcações sem internet; a rede cai no meio do envio; no fim, cada uma no servidor uma vez só', { timeout: 60_000 }, async () => {
    const { s } = aparelho(campo, { tamanhoLote: 20 })
    servidor.derrubarRede(true)
    const ids: string[] = []
    for (let i = 0; i < 200; i++) ids.push((await s.registrar('teste_eventos', OBRA1, campo.id, { elemento: `S8-${i}`, resultado: 'C' })).id)
    servidor.derrubarRede(false)

    // derruba o 4º lote: os 3 primeiros entram, a fila para
    let lotes = 0
    servidor.antesDoPedido = async (metodo, caminho) => {
      if (metodo === 'POST' && caminho.startsWith('/rest/v1/teste_eventos') && ++lotes === 4) return 'derrubar'
    }
    const primeira = await s.enviar(campo.id)
    expect(primeira.enviados).toBe(60)
    expect(primeira.parouPor?.gravidade).toBe('transitorio')
    servidor.antesDoPedido = undefined

    expect(await s.enviar(campo.id)).toEqual({ enviados: 140, comErro: 0 })
    expect(await contar('teste_eventos', 'id = any($1::uuid[])', [ids])).toBe(200)
  })
})

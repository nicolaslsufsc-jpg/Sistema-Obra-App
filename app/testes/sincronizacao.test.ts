// Testes de integração: biblioteca do núcleo contra PostgREST de verdade + banco local com a
// migração do núcleo (RLS de verdade). Rodar com: bash supabase/testes/rodar_integracao.sh
// Sem as variáveis SO_* (ex.: "npm test" sozinho) estes testes são pulados.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'
import { createHash } from 'node:crypto'
import { BancoLocal, type ItemFila } from '../src/nucleo/banco_local'
import { Sincronizador } from '../src/nucleo/sincronizacao'
import { Conta } from '../src/nucleo/conta'
import { paraMicros } from '../src/nucleo/tempo'
import { CHAVE_SESSAO, TABELAS_NUCLEO } from '../src/config'
import { iniciarServidorTeste, tokenDe, type ServidorTeste, type UsuarioTeste } from './servidor_teste'
import { CODIGO_TESTE, OBRA1, OBRA2, USUARIOS } from './dados'

const PGRST = process.env.SO_PGRST_URL
const SEGREDO = process.env.SO_JWT_SEGREDO ?? ''
const suite = PGRST ? describe : describe.skip
const TABELAS = [...TABELAS_NUCLEO, 'teste_eventos']
const NIL = '00000000-0000-0000-0000-000000000000'
const { admin, campo, leitura } = USUARIOS

let servidor: ServidorTeste
let sql: pg.Client
let contador = 0

function clienteComToken(u: UsuarioTeste, validadeS = 3600): SupabaseClient {
  const token = tokenDe(u, SEGREDO, validadeS)
  return createClient(servidor.url, 'chave-publica-de-teste', { accessToken: async () => token })
}

function clienteComLogin(): SupabaseClient {
  return createClient(servidor.url, 'chave-publica-de-teste', {
    auth: { persistSession: true, autoRefreshToken: false, storageKey: `sessao-teste-${++contador}` },
  })
}

function novoBanco() {
  return new BancoLocal(`teste-${++contador}`)
}

function sincronizadorDe(u: UsuarioTeste, opcoes: { tamanhoLote?: number; tamanhoPagina?: number } = {}) {
  const banco = novoBanco()
  return { banco, s: new Sincronizador({ banco, cliente: clienteComToken(u), tabelas: TABELAS, ...opcoes }) }
}

async function contar(tabela: string, where: string, params: unknown[]): Promise<number> {
  const { rows } = await sql.query(`select count(*)::int as n from public.${tabela} where ${where}`, params)
  return rows[0].n
}

async function entrar(conta: Conta, u: UsuarioTeste) {
  expect(await conta.pedirCodigo(u.email)).toBeNull()
  const r = await conta.confirmarCodigo(u.email, CODIGO_TESTE)
  expect(r).toEqual({ id: u.id, email: u.email })
}

suite('núcleo contra PostgREST real', () => {
  beforeAll(async () => {
    servidor = await iniciarServidorTeste({ pgrstUrl: PGRST!, segredoJwt: SEGREDO, usuarios: Object.values(USUARIOS) })
    sql = new pg.Client({
      host: process.env.SO_PG_HOST,
      port: Number(process.env.SO_PG_PORT),
      user: 'postgres',
      database: 'postgres',
    })
    await sql.connect()
  })

  afterAll(async () => {
    await sql?.end()
    await servidor?.fechar()
  })

  beforeEach(() => {
    servidor.derrubarRede(false)
    servidor.validadeToken(3600)
  })

  // -------------------------------------------------------------------
  describe('envio', () => {
    it('registra sem internet e envia quando a rede volta, com a hora do aparelho', async () => {
      const { banco, s } = sincronizadorDe(campo)
      servidor.derrubarRede(true)
      const linha = await s.registrar('teste_eventos', OBRA1, campo.id, { elemento: 'P1', resultado: 'C' })
      expect((await s.linhas('teste_eventos', OBRA1)).map((l) => l.id)).toEqual([linha.id])

      const semRede = await s.enviar(campo.id)
      expect(semRede.enviados).toBe(0)
      expect(semRede.parouPor?.gravidade).toBe('transitorio')
      expect(await s.contarFila(campo.id)).toEqual({ pendentes: 1, comErro: 0 })

      servidor.derrubarRede(false)
      expect(await s.enviar(campo.id)).toEqual({ enviados: 1, comErro: 0 })
      expect(await s.contarFila(campo.id)).toEqual({ pendentes: 0, comErro: 0 })

      const { rows } = await sql.query(
        'select usuario_id, dispositivo_id, criado_em_dispositivo, criado_em_servidor from public.teste_eventos where id = $1',
        [linha.id],
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].usuario_id).toBe(campo.id)
      expect(rows[0].dispositivo_id).toBe(await banco.dispositivoId())
      expect((rows[0].criado_em_dispositivo as Date).toISOString()).toBe(linha.criado_em_dispositivo)
      expect((rows[0].criado_em_servidor as Date).getTime()).toBeGreaterThanOrEqual(
        (rows[0].criado_em_dispositivo as Date).getTime(),
      )
    })

    it('reenviar o mesmo item (app fechou antes de limpar a fila) não duplica', async () => {
      const { banco, s } = sincronizadorDe(campo)
      const linha = await s.registrar('teste_eventos', OBRA1, campo.id, { elemento: 'P2', resultado: 'NC' })
      const [item] = await banco.fila.toArray()
      expect((await s.enviar(campo.id)).enviados).toBe(1)

      const { seq: _seq, ...copia } = item
      await banco.fila.add(copia as ItemFila)
      expect((await s.enviar(campo.id)).enviados).toBe(1)
      expect(await contar('teste_eventos', 'id = $1', [linha.id])).toBe(1)
    })

    it('item recusado fica marcado com erro e o resto da fila segue', async () => {
      const { s } = sincronizadorDe(campo)
      const semAcesso = await s.registrar('teste_eventos', OBRA2, campo.id, { elemento: 'P3', resultado: 'C' })
      const valorInvalido = await s.registrar('teste_eventos', OBRA1, campo.id, { elemento: 'P4', resultado: 'X' })
      const boa = await s.registrar('teste_eventos', OBRA1, campo.id, { elemento: 'P5', resultado: 'C' })

      expect(await s.enviar(campo.id)).toEqual({ enviados: 1, comErro: 2 })
      expect(await contar('teste_eventos', 'id = $1', [boa.id])).toBe(1)

      const erros = await s.itensComErro(campo.id)
      expect(erros.map((e) => e.id)).toEqual([semAcesso.id, valorInvalido.id])
      expect(erros[0].erro).toMatch(/42501/)
      expect(erros[1].erro).toMatch(/23514/)

      // não tenta de novo sozinho; só com tentarDeNovo()
      expect(await s.enviar(campo.id)).toEqual({ enviados: 0, comErro: 0 })
      expect(await s.tentarDeNovo(campo.id)).toBe(2)
      expect(await s.enviar(campo.id)).toEqual({ enviados: 0, comErro: 2 })
    })

    it('fila grande vai em lotes', async () => {
      const { s } = sincronizadorDe(campo, { tamanhoLote: 100 })
      const prefixo = `L${Date.now()}-`
      for (let i = 0; i < 250; i++) {
        await s.registrar('teste_eventos', OBRA1, campo.id, { elemento: `${prefixo}${i}`, resultado: 'C' })
      }
      const antes = servidor.pedidos.get('POST /rest/v1/teste_eventos') ?? 0
      expect(await s.enviar(campo.id)).toEqual({ enviados: 250, comErro: 0 })
      expect(await contar('teste_eventos', 'elemento like $1', [`${prefixo}%`])).toBe(250)
      expect((servidor.pedidos.get('POST /rest/v1/teste_eventos') ?? 0) - antes).toBe(3) // 100 + 100 + 50
    })

    it('token vencido para a fila sem marcar erro', async () => {
      const banco = novoBanco()
      const s = new Sincronizador({ banco, cliente: clienteComToken(campo, -60), tabelas: TABELAS })
      await s.registrar('teste_eventos', OBRA1, campo.id, { elemento: 'P6', resultado: 'C' })
      const r = await s.enviar(campo.id)
      expect(r.enviados).toBe(0)
      expect(r.parouPor?.gravidade).toBe('transitorio')
      expect(await s.contarFila(campo.id)).toEqual({ pendentes: 1, comErro: 0 })
    })

    it('registrar recusa tabela fora da lista e colunas do núcleo', async () => {
      const { s } = sincronizadorDe(campo)
      await expect(s.registrar('obras', OBRA1, campo.id, {})).rejects.toThrow(/lista de tabelas/)
      await expect(s.registrar('teste_eventos', OBRA1, campo.id, { usuario_id: admin.id })).rejects.toThrow(
        /preenchida pelo núcleo/,
      )
    })
  })

  // -------------------------------------------------------------------
  describe('arquivos', () => {
    it('foto vai para o armazenamento e o registro para a tabela; reenvio não duplica', async () => {
      const { banco, s } = sincronizadorDe(campo)
      const bytes = new Uint8Array([1, 2, 3, 4, 5, 250])
      const linha = await s.registrarArquivo(OBRA1, campo.id, 'fvs', new Blob([bytes], { type: 'image/jpeg' }), 'NC P12.JPG')
      expect(linha.caminho).toBe(`${OBRA1}/fvs/${linha.id}.jpg`)
      const [item] = await banco.fila.toArray()
      const conteudo = await banco.conteudos.get(linha.id)

      expect(await s.enviar(campo.id)).toEqual({ enviados: 1, comErro: 0 })
      expect(servidor.arquivos.get(`obras/${linha.caminho}`)).toEqual(Buffer.from(bytes))
      const { rows } = await sql.query('select hash, tamanho, tipo, nome_original from public.arquivos where id = $1', [
        linha.id,
      ])
      expect(rows[0]).toEqual({
        hash: createHash('sha256').update(bytes).digest('hex'),
        tamanho: '6',
        tipo: 'image/jpeg',
        nome_original: 'NC P12.JPG',
      })

      // Simula: enviou arquivo e linha, mas o app fechou antes de limpar a fila e o conteúdo.
      const { seq: _seq, ...copia } = item
      await banco.fila.add(copia as ItemFila)
      await banco.conteudos.put(conteudo!)
      expect(await s.enviar(campo.id)).toEqual({ enviados: 1, comErro: 0 })
      expect(await contar('arquivos', 'id = $1', [linha.id])).toBe(1)
      expect(await banco.conteudos.count()).toBe(0)
    })

    it('arquivo em obra sem acesso fica com erro e não é guardado', async () => {
      const { s } = sincronizadorDe(campo)
      const linha = await s.registrarArquivo(OBRA2, campo.id, 'fvs', new Blob([new Uint8Array([9])]), 'x.jpg')
      expect(await s.enviar(campo.id)).toEqual({ enviados: 0, comErro: 1 })
      expect(servidor.arquivos.has(`obras/${linha.caminho}`)).toBe(false)
      expect(await contar('arquivos', 'id = $1', [linha.id])).toBe(0)
    })

    it('contar a fila não lê as fotos; o conteúdo sai do aparelho depois do envio', async () => {
      const { banco, s } = sincronizadorDe(campo)
      await s.registrarArquivo(OBRA1, campo.id, 'fvs', new Blob([new Uint8Array(1000)], { type: 'image/jpeg' }), 'a.jpg')
      await s.registrarArquivo(OBRA1, campo.id, 'fvs', new Blob([new Uint8Array(2000)], { type: 'image/jpeg' }), 'b.jpg')
      expect(await s.contarFila(campo.id)).toEqual({ pendentes: 2, comErro: 0 })
      expect(await banco.conteudos.count()).toBe(2)
      const itens = await banco.fila.toArray()
      expect(itens.every((i) => i.arquivo && !('conteudo' in i.arquivo) && !('bytes' in i.arquivo))).toBe(true)

      expect(await s.enviar(campo.id)).toEqual({ enviados: 2, comErro: 0 })
      expect(await banco.conteudos.count()).toBe(0)
    })

    it('login vencido na hora de enviar foto: para sem marcar erro (caminho real, com sessão)', { timeout: 60_000 }, async () => {
      const banco = novoBanco()
      const cliente = clienteComLogin()
      const conta = new Conta(cliente, banco)
      servidor.validadeToken(-60) // sessão já vencida
      await entrar(conta, campo)
      servidor.validadeToken(3600)
      const s = new Sincronizador({ banco, cliente, tabelas: TABELAS, sessaoValida: (u) => conta.sessaoDoUsuario(u) })
      await s.registrarArquivo(OBRA1, campo.id, 'fvs', new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' }), 'c.jpg')
      await s.registrar('teste_eventos', OBRA1, campo.id, { elemento: 'P9', resultado: 'NC' })

      // Sem internet a renovação falha e o supabase-js guarda a falha por 60 s.
      servidor.derrubarRede(true)
      expect(await conta.estadoSessao()).toBe('offline')
      servidor.derrubarRede(false)

      // Rede de volta, mas ainda sem login válido: sem a conferência, a foto iria como visitante e
      // viraria "recusada" para sempre.
      const r = await s.enviar(campo.id)
      expect(r.enviados).toBe(0)
      expect(r.parouPor?.gravidade).toBe('transitorio')
      expect(await s.contarFila(campo.id)).toEqual({ pendentes: 2, comErro: 0 })

      vi.useFakeTimers({ toFake: ['Date'] })
      try {
        vi.setSystemTime(Date.now() + 61_000)
        expect(await s.enviar(campo.id)).toEqual({ enviados: 2, comErro: 0 })
      } finally {
        vi.useRealTimers()
      }
    })

    it('sem internet no envio do arquivo: tenta de novo depois', async () => {
      const { s } = sincronizadorDe(campo)
      await s.registrarArquivo(OBRA1, campo.id, 'fvs', new Blob([new Uint8Array([7])]), 'y.png')
      servidor.derrubarRede(true)
      expect((await s.enviar(campo.id)).parouPor?.gravidade).toBe('transitorio')
      servidor.derrubarRede(false)
      expect(await s.enviar(campo.id)).toEqual({ enviados: 1, comErro: 0 })
    })
  })

  // -------------------------------------------------------------------
  describe('baixa', () => {
    it('baixa em páginas mesmo com muitas linhas na mesma hora (mesma transação)', async () => {
      const prefixo = `E${Date.now() % 100000}x`
      await sql.query(
        `insert into public.elementos (obra_id, pavimento_id, tipo, nome, usuario_id, dispositivo_id, criado_em_dispositivo)
         select $1, (select id from public.pavimentos where obra_id = $1 and nome = 'Térreo'), 'P', $4 || g, $2, $3, now()
         from generate_series(1, 7) g`,
        [OBRA1, admin.id, NIL, prefixo],
      )
      const { banco, s } = sincronizadorDe(leitura, { tamanhoPagina: 3 })
      const r = await s.baixar(OBRA1)
      expect(r.erro).toBeUndefined()

      const noServidor = await contar('elementos', 'obra_id = $1', [OBRA1])
      expect((await s.linhas('elementos', OBRA1, { incluirApagadas: true })).length).toBe(noServidor)
      expect((await s.linhas('elementos', OBRA1)).filter((l) => String(l.nome).startsWith(prefixo))).toHaveLength(7)

      const { rows } = await sql.query(
        'select to_json(max(atualizado_em)) #>> \'{}\' as maior from public.elementos where obra_id = $1',
        [OBRA1],
      )
      const cursor = await banco.cursores.get([OBRA1, 'elementos'])
      expect(paraMicros(cursor!.valor)).toBe(paraMicros(rows[0].maior))
    })

    it('baixa os módulos ao mesmo tempo: tabela que falta num bloco não impede os outros', async () => {
      const banco = novoBanco()
      const s = new Sincronizador({
        banco,
        cliente: clienteComToken(leitura),
        tabelas: [...TABELAS_NUCLEO, 'tabela_que_nao_existe', 'teste_eventos'],
        blocos: [TABELAS_NUCLEO, ['tabela_que_nao_existe'], ['teste_eventos']],
      })
      const r = await s.baixar(OBRA1)
      expect(r.erro).toBeDefined()
      expect(r.porTabela.pavimentos).toBeGreaterThan(0)
      expect(r.porTabela).toHaveProperty('teste_eventos')
      expect(await banco.cursores.get([OBRA1, 'pavimentos'])).toBeDefined()
    })

    it('só vê a própria obra', async () => {
      const { s } = sincronizadorDe(leitura)
      const r = await s.baixar(OBRA2)
      expect(r.erro).toBeUndefined()
      expect(r.recebidos).toBe(0)
    })

    it('baixa seguinte traz o que mudou, inclusive commit atrasado dentro da margem', async () => {
      const { banco, s } = sincronizadorDe(leitura)
      await s.baixar(OBRA1)
      const cursor = (await banco.cursores.get([OBRA1, 'pavimentos']))!.valor

      const sufixo = Date.now() % 100000
      const nova = await sql.query(
        `insert into public.pavimentos (obra_id, nome, ordem, usuario_id, dispositivo_id, criado_em_dispositivo)
         values ($1, $2, 10, $3, $4, now()) returning id`,
        [OBRA1, `Novo ${sufixo}`, admin.id, NIL],
      )
      // Simula transação que começou antes e terminou depois da baixa anterior:
      // atualizado_em 2 min antes do cursor (dentro da margem de 5 min) e 10 min antes (fora).
      await sql.query('begin')
      await sql.query('set local session_replication_role = replica') // desliga o gatilho que carimba a hora
      const atrasada = await sql.query(
        `insert into public.pavimentos (obra_id, nome, ordem, usuario_id, dispositivo_id, criado_em_dispositivo,
                                        criado_em_servidor, atualizado_em)
         values ($1, $2, 11, $3, $4, now(), $5::timestamptz - interval '2 minutes', $5::timestamptz - interval '2 minutes')
         returning id`,
        [OBRA1, `Atrasado ${sufixo}`, admin.id, NIL, cursor],
      )
      const muitoAtrasada = await sql.query(
        `insert into public.pavimentos (obra_id, nome, ordem, usuario_id, dispositivo_id, criado_em_dispositivo,
                                        criado_em_servidor, atualizado_em)
         values ($1, $2, 12, $3, $4, now(), $5::timestamptz - interval '10 minutes', $5::timestamptz - interval '10 minutes')
         returning id`,
        [OBRA1, `Muito atrasado ${sufixo}`, admin.id, NIL, cursor],
      )
      await sql.query('commit')

      await s.baixar(OBRA1)
      const ids = (await s.linhas('pavimentos', OBRA1)).map((l) => l.id)
      expect(ids).toContain(nova.rows[0].id)
      expect(ids).toContain(atrasada.rows[0].id)
      // Limite conhecido e documentado: fora da margem não vem.
      expect(ids).not.toContain(muitoAtrasada.rows[0].id)
    })

    it('registro apagado no servidor some da lista do aparelho', async () => {
      const { s } = sincronizadorDe(leitura)
      const p = await sql.query(
        `insert into public.pavimentos (obra_id, nome, ordem, usuario_id, dispositivo_id, criado_em_dispositivo)
         values ($1, $2, 20, $3, $4, now()) returning id`,
        [OBRA1, `Apagar ${Date.now() % 100000}`, admin.id, NIL],
      )
      await s.baixar(OBRA1)
      expect((await s.linhas('pavimentos', OBRA1)).map((l) => l.id)).toContain(p.rows[0].id)

      await sql.query('update public.pavimentos set apagado = true where id = $1', [p.rows[0].id])
      await s.baixar(OBRA1)
      expect((await s.linhas('pavimentos', OBRA1)).map((l) => l.id)).not.toContain(p.rows[0].id)
      const comApagadas = await s.linhas('pavimentos', OBRA1, { incluirApagadas: true })
      expect(comApagadas.find((l) => l.id === p.rows[0].id)?.apagado).toBe(true)
    })

    it('sem internet a baixa devolve erro transitório e não mexe no cursor', async () => {
      const { banco, s } = sincronizadorDe(leitura)
      await s.baixar(OBRA1)
      const antes = await banco.cursores.toArray()
      servidor.derrubarRede(true)
      const r = await s.baixar(OBRA1)
      expect(r.erro?.gravidade).toBe('transitorio')
      expect(await banco.cursores.toArray()).toEqual(antes)
    })

    it('sair no meio da baixa: nada da pessoa anterior fica no aparelho, e a baixa seguinte traz tudo', async () => {
      const banco = novoBanco()
      const token = tokenDe(leitura, SEGREDO)
      let paginasPavimentos = 0
      const cliente = createClient(servidor.url, 'chave-publica-de-teste', {
        accessToken: async () => token,
        global: {
          fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
            // A limpeza acontece enquanto a 2ª página de pavimentos está a caminho.
            if (String(url).includes('/rest/v1/pavimentos') && ++paginasPavimentos === 2) {
              await banco.esquecerTudoBaixado()
            }
            return fetch(url, init)
          },
        },
      })
      const s = new Sincronizador({ banco, cliente, tabelas: TABELAS, tamanhoPagina: 2 })
      const r = await s.baixar(OBRA1)
      expect(r.erro?.mensagem).toMatch(/cancelada/)
      expect(await banco.registros.count()).toBe(0)
      expect(await banco.cursores.count()).toBe(0)

      const r2 = await s.baixar(OBRA1)
      expect(r2.erro).toBeUndefined()
      expect((await s.linhas('pavimentos', OBRA1, { incluirApagadas: true })).length).toBe(
        await contar('pavimentos', 'obra_id = $1', [OBRA1]),
      )
    })

    it('sincronizar outra obra espera a atual terminar e baixa a obra certa', async () => {
      const { s } = sincronizadorDe(USUARIOS.gestor) // gestor da obra 1, leitura na obra 2
      const a = s.sincronizar(OBRA1, USUARIOS.gestor.id)
      const b = s.sincronizar(OBRA2, USUARIOS.gestor.id)
      expect(b).not.toBe(a)
      const [, rb] = await Promise.all([a, b])
      expect(rb.baixa.erro).toBeUndefined()
      expect((await s.linhas('pavimentos', OBRA2)).length).toBe(
        await contar('pavimentos', 'obra_id = $1 and not apagado', [OBRA2]),
      )
      expect((await s.linhas('pavimentos', OBRA2)).length).toBeGreaterThan(0)
    })

    it('sincronizar ao mesmo tempo duas vezes roda uma vez só', async () => {
      const { s } = sincronizadorDe(leitura)
      const a = s.sincronizar(OBRA1, leitura.id)
      const b = s.sincronizar(OBRA1, leitura.id)
      expect(b).toBe(a)
      await a
    })
  })

  // -------------------------------------------------------------------
  describe('conta e obras', () => {
    it('login por código guarda o usuário e lista só as obras com acesso, com o papel', async () => {
      const banco = novoBanco()
      const conta = new Conta(clienteComLogin(), banco)
      expect(await conta.pedirCodigo('  Campo@Teste.local ')).toBeNull()
      expect(servidor.codigosPedidos).toContain('campo@teste.local')
      expect(await conta.confirmarCodigo('campo@teste.local', '000000')).toMatch(/Código errado/)
      await entrar(conta, campo)
      expect(await conta.usuarioLocal()).toEqual({ id: campo.id, email: campo.email })
      expect(await conta.estadoSessao()).toBe('ok')
      expect(await conta.atualizarObras(campo.id)).toEqual([
        { id: OBRA1, codigo: 'OBRA1', nome: 'Obra 1', empresa: null, papel: 'campo' },
      ])
    })

    it('admin vê todas as obras como admin', async () => {
      const conta = new Conta(clienteComLogin(), novoBanco())
      await entrar(conta, admin)
      const obras = await conta.atualizarObras(admin.id)
      expect(Array.isArray(obras) && obras.map((o) => [o.codigo, o.papel])).toEqual([
        ['OBRA1', 'admin'],
        ['OBRA2', 'admin'],
      ])
    })

    it('sincronizador funciona com a sessão do login', async () => {
      const banco = novoBanco()
      const cliente = clienteComLogin()
      await entrar(new Conta(cliente, banco), campo)
      const s = new Sincronizador({ banco, cliente, tabelas: TABELAS })
      await s.registrar('teste_eventos', OBRA1, campo.id, { elemento: 'P7', resultado: 'NA' })
      const r = await s.sincronizar(OBRA1, campo.id)
      expect(r.envio).toEqual({ enviados: 1, comErro: 0 })
      expect(r.baixa.erro).toBeUndefined()
      expect((await s.linhas('pavimentos', OBRA1)).length).toBeGreaterThan(0)
    })

    it('acesso revogado apaga a obra do aparelho', async () => {
      const banco = novoBanco()
      const cliente = clienteComLogin()
      const conta = new Conta(cliente, banco)
      await entrar(conta, leitura)
      const s = new Sincronizador({ banco, cliente, tabelas: TABELAS })
      await conta.atualizarObras(leitura.id)
      await conta.escolherObra(OBRA1)
      await s.baixar(OBRA1)
      expect((await s.linhas('pavimentos', OBRA1)).length).toBeGreaterThan(0)

      await sql.query('delete from public.acessos where usuario_id = $1 and obra_id = $2', [leitura.id, OBRA1])
      try {
        expect(await conta.atualizarObras(leitura.id)).toEqual([])
        expect(await s.linhas('pavimentos', OBRA1)).toHaveLength(0)
        expect(await conta.obraAtual()).toBeUndefined()
      } finally {
        await sql.query("insert into public.acessos (usuario_id, obra_id, papel) values ($1, $2, 'leitura')", [
          leitura.id,
          OBRA1,
        ])
      }
    })

    it('sem internet não apaga nada da lista de obras', async () => {
      const banco = novoBanco()
      const conta = new Conta(clienteComLogin(), banco)
      await entrar(conta, campo)
      await conta.atualizarObras(campo.id)
      servidor.derrubarRede(true)
      const r = await conta.atualizarObras(campo.id)
      expect(Array.isArray(r)).toBe(false)
      expect(await conta.obrasLocais()).toHaveLength(1)
    })

    it('outra pessoa entra no mesmo aparelho: apaga o que foi baixado, mantém a fila', async () => {
      const banco = novoBanco()
      const clienteCampo = clienteComLogin()
      await entrar(new Conta(clienteCampo, banco), campo)
      const s = new Sincronizador({ banco, cliente: clienteCampo, tabelas: TABELAS })
      await s.baixar(OBRA1)
      servidor.derrubarRede(true)
      const pendente = await s.registrar('teste_eventos', OBRA1, campo.id, { elemento: 'P8', resultado: 'C' })
      servidor.derrubarRede(false)

      const clienteLeitura = clienteComLogin()
      await entrar(new Conta(clienteLeitura, banco), leitura)
      expect(await s.linhas('pavimentos', OBRA1)).toHaveLength(0)
      expect((await s.linhas('teste_eventos', OBRA1)).map((l) => l.id)).toEqual([pendente.id])
      expect(await s.contarFila(campo.id)).toEqual({ pendentes: 1, comErro: 0 })

      // A sincronização da segunda pessoa não mexe na fila da primeira.
      const sLeitura = new Sincronizador({ banco, cliente: clienteLeitura, tabelas: TABELAS })
      expect(await sLeitura.enviar(leitura.id)).toEqual({ enviados: 0, comErro: 0 })
      expect(await s.contarFila(campo.id)).toEqual({ pendentes: 1, comErro: 0 })
      expect(await contar('teste_eventos', 'id = $1', [pendente.id])).toBe(0)
    })

    it('sem internet com token vencido: estado "offline"; quando volta, renova sozinho', { timeout: 60_000 }, async () => {
      const conta = new Conta(clienteComLogin(), novoBanco())
      servidor.validadeToken(-60) // a sessão já nasce vencida
      await entrar(conta, campo)
      servidor.validadeToken(3600)
      servidor.derrubarRede(true)
      expect(await conta.estadoSessao()).toBe('offline')
      expect(await conta.usuarioLocal()).toEqual({ id: campo.id, email: campo.email })

      servidor.derrubarRede(false)
      // O supabase-js espera 60 s antes de tentar renovar de novo depois de uma falha.
      vi.useFakeTimers({ toFake: ['Date'] })
      try {
        vi.setSystemTime(Date.now() + 61_000)
        expect(await conta.estadoSessao()).toBe('ok')
      } finally {
        vi.useRealTimers()
      }
    })

    it('outra conta no mesmo navegador (outra aba): nada é enviado com a sessão errada', async () => {
      const banco = novoBanco()
      const cliente = clienteComLogin()
      const conta = new Conta(cliente, banco)
      await entrar(conta, campo)
      const s = new Sincronizador({ banco, cliente, tabelas: TABELAS, sessaoValida: (u) => conta.sessaoDoUsuario(u) })
      await s.registrar('teste_eventos', OBRA1, campo.id, { elemento: 'P10', resultado: 'C' })

      await entrar(conta, leitura) // a outra aba entrou com outra pessoa
      expect(await conta.estadoSessao(campo.id)).toBe('outro')
      const r = await s.enviar(campo.id)
      expect(r.enviados).toBe(0)
      expect(r.parouPor?.gravidade).toBe('transitorio')
      expect(await s.contarFila(campo.id)).toEqual({ pendentes: 1, comErro: 0 })
    })

    it('sair sem internet com login vencido termina rápido e apaga a sessão guardada', { timeout: 60_000 }, async () => {
      const guardado = new Map<string, string>()
      const armazenamento: Storage = {
        get length() {
          return guardado.size
        },
        key: (i) => [...guardado.keys()][i] ?? null,
        getItem: (k) => guardado.get(k) ?? null,
        setItem: (k, v) => void guardado.set(k, String(v)),
        removeItem: (k) => void guardado.delete(k),
        clear: () => guardado.clear(),
      }
      vi.stubGlobal('localStorage', armazenamento)
      vi.stubGlobal('navigator', { onLine: false })
      try {
        const cliente = createClient(servidor.url, 'chave-publica-de-teste', {
          auth: { persistSession: true, autoRefreshToken: false, storageKey: CHAVE_SESSAO, storage: armazenamento },
        })
        const conta = new Conta(cliente, novoBanco())
        servidor.validadeToken(-60)
        await entrar(conta, campo)
        servidor.validadeToken(3600)
        expect([...guardado.keys()].some((k) => k.startsWith(CHAVE_SESSAO))).toBe(true)

        servidor.derrubarRede(true)
        const inicio = Date.now()
        await conta.sair()
        expect(Date.now() - inicio).toBeLessThan(3000)
        expect([...guardado.keys()].some((k) => k.startsWith(CHAVE_SESSAO))).toBe(false)
        expect(await conta.usuarioLocal()).toBeUndefined()

        servidor.derrubarRede(false)
        expect(await conta.estadoSessao()).toBe('entrar')
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('sair sem internet e entrar de novo quando a internet volta: o login novo não é derrubado', { timeout: 90_000 }, async () => {
      const guardado = new Map<string, string>()
      const armazenamento: Storage = {
        get length() {
          return guardado.size
        },
        key: (i) => [...guardado.keys()][i] ?? null,
        getItem: (k) => guardado.get(k) ?? null,
        setItem: (k, v) => void guardado.set(k, String(v)),
        removeItem: (k) => void guardado.delete(k),
        clear: () => guardado.clear(),
      }
      vi.stubGlobal('localStorage', armazenamento)
      vi.stubGlobal('navigator', { onLine: false })
      try {
        const cliente = createClient(servidor.url, 'chave-publica-de-teste', {
          auth: { persistSession: true, autoRefreshToken: false, storageKey: CHAVE_SESSAO, storage: armazenamento },
        })
        const conta = new Conta(cliente, novoBanco())
        servidor.validadeToken(-60)
        await entrar(conta, campo)
        servidor.validadeToken(3600)

        servidor.derrubarRede(true)
        await conta.sair()
        // A internet volta e a pessoa entra de novo logo em seguida.
        vi.stubGlobal('navigator', { onLine: true })
        servidor.derrubarRede(false)
        await entrar(conta, campo)

        // Se "sair" tivesse deixado um pedido ao servidor pendurado, ele renovaria a sessão
        // antiga e apagaria a nova nos ~25 s seguintes.
        await new Promise((ok) => setTimeout(ok, 30_000))
        expect(await conta.estadoSessao(campo.id)).toBe('ok')
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('código pedido fica guardado para a tela voltar sozinha; some ao entrar', async () => {
      const conta = new Conta(clienteComLogin(), novoBanco())
      expect(await conta.pedirCodigo(campo.email)).toBeNull()
      expect((await conta.loginPendente())?.email).toBe(campo.email)
      await conta.confirmarCodigo(campo.email, CODIGO_TESTE)
      expect(await conta.loginPendente()).toBeUndefined()
    })

    it('sair apaga a sessão e o que foi baixado, mesmo sem internet', async () => {
      const banco = novoBanco()
      const cliente = clienteComLogin()
      const conta = new Conta(cliente, banco)
      await entrar(conta, campo)
      await conta.atualizarObras(campo.id)
      servidor.derrubarRede(true)
      await conta.sair()
      expect(await conta.usuarioLocal()).toBeUndefined()
      expect(await conta.obrasLocais()).toEqual([])
      servidor.derrubarRede(false)
      expect(await conta.estadoSessao()).toBe('entrar')
    })
  })
})

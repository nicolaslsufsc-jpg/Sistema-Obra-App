// Correção C2 (docs/modulos/0_nucleo_sincronizacao.md, risco R2): pedido sem resposta não prende a
// sincronização. Servidor falso que aceita o pedido e nunca responde.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BancoLocal } from './banco_local'
import { Sincronizador } from './sincronizacao'

const OBRA = '11111111-1111-1111-1111-111111111111'
const USUARIO = '00000000-0000-0000-0000-0000000000c1'

/** Cliente que responde nada, nunca. Guarda se o pedido foi cancelado. */
function clientePendurado() {
  const cancelados: string[] = []
  const nunca = (nome: string) => {
    let sinal: AbortSignal | undefined
    const pedido = {
      abortSignal(s: AbortSignal) {
        sinal = s
        s.addEventListener('abort', () => cancelados.push(nome))
        return pedido
      },
      then(ok: (v: unknown) => unknown, falha: (e: unknown) => unknown) {
        return new Promise(() => {}).then(ok, falha).finally(() => void sinal)
      },
    }
    return pedido
  }
  const consulta: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'or', 'order']) consulta[m] = () => consulta
  consulta.limit = () => nunca('baixa')
  const cliente = {
    from: () => ({ upsert: () => nunca('envio'), ...consulta }),
    storage: { from: () => ({ upload: () => new Promise(() => {}) }) },
  }
  return { cliente: cliente as unknown as SupabaseClient, cancelados }
}

describe('prazo dos pedidos (C2)', () => {
  it('envio sem resposta: para dentro do prazo, cancela o pedido e o item fica na fila', async () => {
    const { cliente, cancelados } = clientePendurado()
    const banco = new BancoLocal(`prazo-${crypto.randomUUID()}`)
    const s = new Sincronizador({ banco, cliente, tabelas: ['teste_eventos'], prazoMs: 200 })
    await s.registrar('teste_eventos', OBRA, USUARIO, { elemento: 'P1', resultado: 'C' })

    const r = await s.enviar(USUARIO)
    expect(r.enviados).toBe(0)
    expect(r.parouPor).toMatchObject({ gravidade: 'transitorio', mensagem: 'o servidor não respondeu a tempo' })
    expect(cancelados).toEqual(['envio'])
    expect(await s.contarFila(USUARIO)).toEqual({ pendentes: 1, comErro: 0 })
  })

  it('baixa sem resposta: devolve erro transitório e não mexe no cursor', async () => {
    const { cliente } = clientePendurado()
    const banco = new BancoLocal(`prazo-${crypto.randomUUID()}`)
    const s = new Sincronizador({ banco, cliente, tabelas: ['teste_eventos'], prazoMs: 200 })
    const r = await s.baixar(OBRA)
    expect(r.erro?.gravidade).toBe('transitorio')
    expect(await banco.cursores.count()).toBe(0)
  })

  it('foto sem resposta: para no prazo (que cresce com o tamanho) sem marcar erro', async () => {
    const { cliente } = clientePendurado()
    const banco = new BancoLocal(`prazo-${crypto.randomUUID()}`)
    const s = new Sincronizador({ banco, cliente, tabelas: ['arquivos'], prazoMs: 200 })
    await s.registrarArquivo(OBRA, USUARIO, 'fvs', new Blob([new Uint8Array(1024)]), 'nc.jpg')
    const r = await s.enviar(USUARIO)
    expect(r.parouPor?.gravidade).toBe('transitorio')
    expect(await s.contarFila(USUARIO)).toEqual({ pendentes: 1, comErro: 0 })
  })

  it('duas rodadas seguidas: a segunda não fica esperando a primeira para sempre', async () => {
    const { cliente } = clientePendurado()
    const banco = new BancoLocal(`prazo-${crypto.randomUUID()}`)
    const s = new Sincronizador({ banco, cliente, tabelas: ['teste_eventos'], prazoMs: 200 })
    await s.registrar('teste_eventos', OBRA, USUARIO, { elemento: 'P2', resultado: 'NC' })
    const inicio = Date.now()
    await s.sincronizar(OBRA, USUARIO)
    await s.sincronizar(OBRA, USUARIO)
    expect(Date.now() - inicio).toBeLessThan(3_000)
  })
})

// Correção C5 (docs/modulos/0_nucleo_sincronizacao.md, risco R5): o menu mostra quantos itens da fila são
// de outra pessoa que usou o aparelho (só sobem quando ela entrar aqui de novo).
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BancoLocal } from './banco_local'
import { Sincronizador } from './sincronizacao'

const OBRA = '11111111-1111-1111-1111-111111111111'
const A = '00000000-0000-0000-0000-0000000000c1'
const B = '00000000-0000-0000-0000-0000000000c2'

describe('fila de outra pessoa no aparelho (C5)', () => {
  it('conta os itens dos outros, pendentes, com erro e fotos, sem contar os de quem está usando', async () => {
    const banco = new BancoLocal('c5-1')
    const s = new Sincronizador({ banco, cliente: {} as SupabaseClient, tabelas: ['teste_eventos'] })
    expect(await s.contarDeOutros(B)).toBe(0)
    await s.registrar('teste_eventos', OBRA, A, { elemento: 'P1', resultado: 'C' })
    await s.registrar('teste_eventos', OBRA, A, { elemento: 'P2', resultado: 'NC' })
    await s.registrarArquivo(OBRA, A, 'fvs', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), 'f.jpg')
    await s.registrar('teste_eventos', OBRA, B, { elemento: 'P3', resultado: 'C' })
    // um item de A recusado pelo servidor também está parado esperando A
    const primeiro = (await banco.fila.toArray()).find((i) => i.usuario_id === A)!
    await banco.fila.update(primeiro.seq!, { estado: 'erro', erro: 'recusado' })

    expect(await s.contarDeOutros(B)).toBe(3)
    expect(await s.contarDeOutros(A)).toBe(1)
    expect(await s.contarFila(B)).toEqual({ pendentes: 1, comErro: 0 })
  })
})

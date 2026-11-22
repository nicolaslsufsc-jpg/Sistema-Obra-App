// Sair (bug de 22/11/2026, S23 com ~65 mil registros: o OK parecia não fazer nada).
// Sem servidor: o login é um cliente falso.
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BancoLocal } from './banco_local'
import { Sincronizador } from './sincronizacao'
import { Conta } from './conta'

const OBRA = '11111111-1111-1111-1111-111111111111'
const EU = { id: '00000000-0000-0000-0000-0000000000c1', email: 'campo@teste.local' }
let n = 0

const cliente = { auth: { signOut: async () => ({ error: null }) } } as unknown as SupabaseClient

async function bancoComObra(baixados: number) {
  const banco = new BancoLocal(`sair-${++n}`)
  await banco.gravarMeta('usuario', EU)
  await banco.gravarMeta('obras', [{ id: OBRA }])
  await banco.gravarMeta('obra_atual', OBRA)
  await banco.registros.bulkPut(
    Array.from({ length: baixados }, (_, i) => ({
      tabela: 'fvs_fichas',
      id: `b${i}`,
      obra_id: OBRA,
      linha: { id: `b${i}`, obra_id: OBRA } as never,
      pendente: 0 as const,
    })),
  )
  await banco.cursores.put({ obra_id: OBRA, tabela: 'fvs_fichas', valor: '2026-11-22' })
  const s = new Sincronizador({ banco, cliente, tabelas: ['teste_eventos'] })
  await s.registrar('teste_eventos', OBRA, EU.id, { elemento: 'P1', resultado: 'C' })
  await s.registrar('teste_eventos', OBRA, EU.id, { elemento: 'P2', resultado: 'NC' })
  return { banco, s }
}

describe('sair da conta', () => {
  it('apaga o que foi baixado e guarda o que não foi enviado (fila e registros pendentes)', async () => {
    const { banco, s } = await bancoComObra(2000)
    const geracao = await banco.geracao()
    expect(await new Conta(cliente, banco).sair()).toBe(true)

    expect(await banco.registros.count()).toBe(2)
    expect((await banco.registros.toArray()).every((r) => r.pendente === 1)).toBe(true)
    expect(await s.contarFila(EU.id)).toEqual({ pendentes: 2, comErro: 0 })
    expect(await banco.cursores.count()).toBe(0)
    expect(await banco.geracao()).toBe(geracao + 1)
    for (const chave of ['usuario', 'obras', 'obra_atual']) expect(await banco.lerMeta(chave)).toBeUndefined()
  })

  it('se a limpeza falhar, a pessoa sai mesmo assim (sem usuário guardado) e a fila fica', async () => {
    const { banco, s } = await bancoComObra(10)
    vi.spyOn(banco, 'esquecerTudoBaixado').mockRejectedValue(new Error('disco cheio'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await new Conta(cliente, banco).sair()).toBe(false)
    expect(await banco.lerMeta('usuario')).toBeUndefined()
    expect(await s.contarFila(EU.id)).toEqual({ pendentes: 2, comErro: 0 })
  })

  it('o que sobrou de uma saída interrompida é apagado no próximo login', async () => {
    const { banco } = await bancoComObra(10)
    await banco.apagarMeta('usuario') // a saída parou logo depois do primeiro passo
    const entra = {
      auth: { verifyOtp: async () => ({ data: { user: EU, session: {} }, error: null }) },
    } as unknown as SupabaseClient
    await new Conta(entra, banco).confirmarCodigo(EU.email, '12345678')
    expect(await banco.registros.count()).toBe(2)
  })
})

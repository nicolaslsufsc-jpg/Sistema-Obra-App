import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BancoLocal } from './banco_local'
import { Conta } from './conta'
import { EMAIL_SEM_CONTA, ehModoLocal, entrarSemConta } from './local'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
let n = 0
const novoBanco = () => new BancoLocal(`teste-local-${++n}`)

describe('modo sem conta', () => {
  it('entrar sem conta cria um usuário local uma vez só', async () => {
    const banco = novoBanco()
    expect(await ehModoLocal(banco)).toBe(false)
    const u1 = await entrarSemConta(banco)
    const u2 = await entrarSemConta(banco)
    expect(u1.id).toMatch(UUID)
    expect(u2.id).toBe(u1.id)
    expect(u1.email).toBe(EMAIL_SEM_CONTA)
    expect(await ehModoLocal(banco)).toBe(true)
    expect(await banco.lerMeta('usuario')).toEqual(u1)
  })

  it('no modo sem conta a sessão é "local" e nada vai ao servidor', async () => {
    const banco = novoBanco()
    // Cliente vazio: qualquer chamada ao Supabase estouraria. É a prova de que não houve chamada.
    const conta = new Conta({} as SupabaseClient, banco)
    const u = await entrarSemConta(banco)
    expect(await conta.estadoSessao()).toBe('local')
    expect(await conta.estadoSessao(u.id)).toBe('local')
    expect(await conta.sessaoDoUsuario(u.id)).toBe(false)
  })

  it('entrar com e-mail desliga o modo sem conta', async () => {
    const banco = novoBanco()
    await entrarSemConta(banco)
    const cliente = {
      auth: { verifyOtp: async () => ({ data: { user: { id: '00000000-0000-0000-0000-0000000000e1', email: 'n@teste' } }, error: null }) },
    } as unknown as SupabaseClient
    const conta = new Conta(cliente, banco)
    const u = await conta.confirmarCodigo('n@teste', '12345678')
    expect(typeof u).toBe('object')
    expect(await ehModoLocal(banco)).toBe(false)
  })
})

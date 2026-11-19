// Correção C1 (docs/modulos/0_nucleo_sincronizacao.md, risco R1): o que foi feito no modo sem conta
// sobe em nome de quem entra com e-mail. Sem servidor: o login é um cliente falso.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BancoLocal } from './banco_local'
import { Sincronizador } from './sincronizacao'
import { Conta } from './conta'
import { entrarSemConta } from './local'

const OBRA = '11111111-1111-1111-1111-111111111111'
const CAMPO = { id: '00000000-0000-0000-0000-0000000000c1', email: 'campo@teste.local' }
const OUTRA = '00000000-0000-0000-0000-0000000000b1'
let n = 0

function clienteQueAceita(u: { id: string; email: string }): SupabaseClient {
  return { auth: { verifyOtp: async () => ({ data: { user: u, session: {} }, error: null }) } } as unknown as SupabaseClient
}

describe('fila do modo sem conta ao entrar com e-mail (C1)', () => {
  it('passa os itens e os registros pendentes para quem entrou; nada some', async () => {
    const banco = new BancoLocal(`c1-${++n}`)
    const s = new Sincronizador({ banco, cliente: {} as SupabaseClient, tabelas: ['teste_eventos'] })
    const local = await entrarSemConta(banco)
    await s.registrar('teste_eventos', OBRA, local.id, { elemento: 'P1', resultado: 'C' })
    await s.registrar('teste_eventos', OBRA, local.id, { elemento: 'P2', resultado: 'NC' })
    await s.registrarArquivo(OBRA, local.id, 'fvs', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), 'f.jpg')
    // item de outra pessoa que usou o aparelho: não muda de dono
    await s.registrar('teste_eventos', OBRA, OUTRA, { elemento: 'P3', resultado: 'C' })

    expect(await new Conta(clienteQueAceita(CAMPO), banco).confirmarCodigo(CAMPO.email, '12345678')).toEqual(CAMPO)

    expect(await s.contarFila(local.id)).toEqual({ pendentes: 0, comErro: 0 })
    expect(await s.contarFila(CAMPO.id)).toEqual({ pendentes: 3, comErro: 0 })
    expect(await s.contarFila(OUTRA)).toEqual({ pendentes: 1, comErro: 0 })
    const itens = await banco.fila.toArray()
    expect(itens.filter((i) => i.usuario_id === CAMPO.id).every((i) => i.linha.usuario_id === CAMPO.id)).toBe(true)
    // os registros continuam na tela, agora assinados por quem entrou
    const linhas = await s.linhas('teste_eventos', OBRA)
    expect(linhas.map((l) => [l.elemento, l.usuario_id]).sort()).toEqual([
      ['P1', CAMPO.id],
      ['P2', CAMPO.id],
      ['P3', OUTRA],
    ])
    // o arquivo (bytes) continua guardado para subir
    expect(await banco.conteudos.count()).toBe(1)
  })

  it('aparelho que nunca usou o modo sem conta: entrar não mexe na fila', async () => {
    const banco = new BancoLocal(`c1-${++n}`)
    const s = new Sincronizador({ banco, cliente: {} as SupabaseClient, tabelas: ['teste_eventos'] })
    await s.registrar('teste_eventos', OBRA, OUTRA, { elemento: 'P4', resultado: 'C' })
    await new Conta(clienteQueAceita(CAMPO), banco).confirmarCodigo(CAMPO.email, '12345678')
    expect(await s.contarFila(OUTRA)).toEqual({ pendentes: 1, comErro: 0 })
    expect(await s.contarFila(CAMPO.id)).toEqual({ pendentes: 0, comErro: 0 })
  })
})

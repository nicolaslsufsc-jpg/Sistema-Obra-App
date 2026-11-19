import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BancoLocal } from './banco_local'
import type { ObraLocal, UsuarioLocal } from './conta'
import { Sincronizador } from './sincronizacao'
import { desempacotar } from './salvamento'
import { ligarSalvamentoAutomatico, nomeNaPasta } from './pasta_salvamento'

const usuario: UsuarioLocal = { id: '00000000-0000-0000-0000-0000000000a1', email: 'a@teste' }
const obra: ObraLocal = { id: 'b0000000-0000-0000-0000-0000000000bb', codigo: 'EXE', nome: 'Obra Exemplo', empresa: null, papel: 'admin' }
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms))

describe('salvamento automático', () => {
  it('depois de registrar, grava uma vez os dois arquivos na pasta', async () => {
    const banco = new BancoLocal('teste-pasta-1')
    const s = new Sincronizador({ banco, cliente: {} as SupabaseClient, tabelas: ['pavimentos'] })
    const gravados: { nome: string; blob: Blob }[] = []
    const gravar = async (nome: string, blob: Blob) => {
      gravados.push({ nome, blob })
      return true
    }
    const desligar = ligarSalvamentoAutomatico(banco, () => ({ usuario, obra }), gravar, 20)

    await s.registrar('pavimentos', obra.id, usuario.id, { nome: 'Térreo', ordem: 1 })
    await s.registrar('pavimentos', obra.id, usuario.id, { nome: '1º', ordem: 2 })
    expect(gravados).toHaveLength(0)
    await espera(80)
    // o nome leva o dia do aparelho (o app usa diaLocal); em UTC, depois das 21 h no Brasil o dia já é o seguinte
    expect(gravados.map((g) => g.nome)).toEqual(['salvo-EXE.obra', nomeNaPasta(obra, new Date())])
    expect((await desempacotar(gravados[0].blob)).itens).toHaveLength(2)
    expect(await banco.lerMeta(`ultimo_salvamento:${obra.id}`)).toBeTypeOf('string')

    desligar()
    await s.registrar('pavimentos', obra.id, usuario.id, { nome: '2º', ordem: 3 })
    await espera(80)
    expect(gravados).toHaveLength(2)
  })

  it('sem pasta (gravar devolve false) não marca salvamento', async () => {
    const banco = new BancoLocal('teste-pasta-2')
    const s = new Sincronizador({ banco, cliente: {} as SupabaseClient, tabelas: ['pavimentos'] })
    const desligar = ligarSalvamentoAutomatico(banco, () => ({ usuario, obra }), async () => false, 20)
    await s.registrar('pavimentos', obra.id, usuario.id, { nome: 'Térreo', ordem: 1 })
    await espera(80)
    expect(await banco.lerMeta(`ultimo_salvamento:${obra.id}`)).toBeUndefined()
    desligar()
  })
})

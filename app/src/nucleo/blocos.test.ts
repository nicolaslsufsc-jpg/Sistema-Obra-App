import { describe, expect, it } from 'vitest'
import { Sincronizador, type OpcoesSincronizador } from './sincronizacao'
import { BLOCOS_SINCRONIZADOS, TABELAS_SINCRONIZADAS } from './tabelas'

const base = { banco: {}, cliente: {} } as unknown as Pick<OpcoesSincronizador, 'banco' | 'cliente'>

describe('blocos de sincronização', () => {
  it('os blocos do app têm exatamente as tabelas sincronizadas, núcleo primeiro', () => {
    expect([...BLOCOS_SINCRONIZADOS.flat()].sort()).toEqual([...TABELAS_SINCRONIZADAS].sort())
    expect(BLOCOS_SINCRONIZADOS[0]).toContain('elementos')
    expect(() => new Sincronizador({ ...base, tabelas: TABELAS_SINCRONIZADAS, blocos: BLOCOS_SINCRONIZADOS })).not.toThrow()
  })

  it('recusa blocos que esquecem ou inventam tabela', () => {
    expect(() => new Sincronizador({ ...base, tabelas: ['a', 'b'], blocos: [['a']] })).toThrow()
    expect(() => new Sincronizador({ ...base, tabelas: ['a'], blocos: [['a'], ['c']] })).toThrow()
  })
})

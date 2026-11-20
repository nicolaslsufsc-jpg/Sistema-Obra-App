import { describe, expect, it } from 'vitest'
import { esquadriasPorUnidade, unidadeDoAmbiente, zoomDasEsquadrias } from './esquadrias_longe'
import { textoDoNumeroDaArea } from './furos_laje'
import type { ElementoPacote } from './pacote'

const el = (tipo: string, nome: string, rotulo: [number, number, number, number], ambiente?: string): ElementoPacote =>
  ({ tipo, nome, secao: '', rotulo, polys: [], ambiente }) as unknown as ElementoPacote

describe('esquadrias com a planta longe', () => {
  it('zoom em que 1 m da folha tem 24 px', () => {
    // 1:50: 56,7 pt por metro
    expect(2 ** zoomDasEsquadrias(50) * ((1000 / 50) * 72) / 25.4).toBeCloseTo(24, 5)
    expect(zoomDasEsquadrias(100)).toBeCloseTo(zoomDasEsquadrias(50) + 1, 5)
  })

  it('apartamento é o começo do nome do ambiente; sem traço, o nome inteiro', () => {
    expect(unidadeDoAmbiente('602-03')).toBe('602')
    expect(unidadeDoAmbiente('HALL')).toBe('HALL')
  })

  it('um grupo por apartamento, pelo ambiente da esquadria, na ordem do número', () => {
    const elementos: Record<string, ElementoPacote> = {
      a1: el('A', '1002-01', [0, 0, 10, 10]),
      a2: el('A', '201-02', [0, 0, 10, 10]),
      e1: el('E', '1002-01-PM80', [0, 0, 2, 2], 'a1'),
      e2: el('E', '1002-01-JA120', [10, 0, 12, 2], 'a1'),
      e3: el('E', '201-02-PM70', [100, 100, 102, 102], 'a2'),
    }
    const g = esquadriasPorUnidade(elementos)
    expect(g.map((x) => [x.chave, x.ids])).toEqual([
      ['q:esq:201', ['e3']],
      ['q:esq:1002', ['e1', 'e2']],
    ])
    expect(g[1].centro).toEqual([6, 1])
    expect(g[1].caixa).toEqual([1, 1, 11, 1])
    expect(textoDoNumeroDaArea(['liberado', 'nada'], 'esquadria', 'esquadrias')).toBe('1 de 2 esquadrias OK')
  })
})

import { describe, expect, it } from 'vitest'
import { esquadriasPorUnidade, pontosPorMetroDasEsquadrias, posicoesDasEsquadrias, unidadeDoAmbiente, zoomDasEsquadrias } from './esquadrias_longe'
import { textoDoNumeroDaArea } from './furos_laje'
import type { ElementoPacote } from './pacote'

const el = (tipo: string, nome: string, rotulo: [number, number, number, number], ambiente?: string): ElementoPacote =>
  ({ tipo, nome, secao: '', rotulo, polys: [], ambiente }) as unknown as ElementoPacote

describe('esquadrias com a planta longe', () => {
  it('zoom em que 1 m da folha tem 32 px', () => {
    // 1:50: 56,7 pt por metro
    expect(2 ** zoomDasEsquadrias(56.7) * 56.7).toBeCloseTo(32, 5)
    expect(zoomDasEsquadrias(28.35)).toBeCloseTo(zoomDasEsquadrias(56.7) + 1, 5)
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

  it('esquadrias que caem juntas se afastam: a porta entre dois cômodos vai para o lado de cada um', () => {
    const m = ((1000 / 50) * 72) / 25.4 // pontos por metro em 1:50
    const elementos: Record<string, ElementoPacote> = {
      esq: el('A', '101-01', [0, 0, 100, 100]),
      dir: el('A', '101-02', [200, 0, 300, 100]),
      p1: el('E', '101-01-PM80', [148, 40, 152, 60], 'esq'),
      p2: el('E', '101-02-PM80', [149, 40, 153, 60], 'dir'),
      longe: el('E', '101-01-JA120', [10, 98, 30, 102], 'esq'),
    }
    const pos = posicoesDasEsquadrias(elementos, m)
    expect(pos.get('longe')![0]).toBeCloseTo(20, 5)
    expect(pos.get('longe')![1]).toBeCloseTo(100, 5)
    const [a, b] = [pos.get('p1')!, pos.get('p2')!]
    expect(a[0]).toBeLessThan(150) // para o 101-01, à esquerda
    expect(b[0]).toBeGreaterThan(151) // para o 101-02, à direita
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThanOrEqual(0.6 * m - 1e-6)
  })

  it('três juntas no mesmo cômodo: em círculo, cada par com espaço para o dedo', () => {
    const m = ((1000 / 50) * 72) / 25.4
    const elementos: Record<string, ElementoPacote> = {
      a: el('A', '101-01', [0, 0, 100, 100]),
      e1: el('E', '101-01-A', [50, 50, 50, 50], 'a'),
      e2: el('E', '101-01-B', [52, 50, 52, 50], 'a'),
      e3: el('E', '101-01-C', [54, 51, 54, 51], 'a'),
    }
    const pos = [...posicoesDasEsquadrias(elementos, m).values()]
    expect(pos).toHaveLength(3)
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1])).toBeGreaterThanOrEqual(0.6 * m - 1e-6)
  })

  it('pontos por metro medidos pelo código das esquadrias; sem esquadrias medíveis, pela escala', () => {
    const porta = (i: number, codigo: string, larg: number): [string, ElementoPacote] => [
      `e${i}`,
      { ...el('E', `101-01-${codigo}`, [0, 0, larg, 4]), esquadria: { codigo, classe: 'porta' } } as unknown as ElementoPacote,
    ]
    // folha a 20 pt por metro: PM80 com 16 pt, JA120B com 24 pt
    const els = Object.fromEntries([porta(1, 'PM80', 16), porta(2, 'PM80', 16), porta(3, 'JA120B', 24), porta(4, 'PM70', 14), porta(5, 'PA260', 52), porta(6, 'XX', 99)])
    expect(pontosPorMetroDasEsquadrias(els, 50)).toBeCloseTo(20, 5)
    expect(pontosPorMetroDasEsquadrias({}, 50)).toBeCloseTo(((1000 / 50) * 72) / 25.4, 5)
  })
})

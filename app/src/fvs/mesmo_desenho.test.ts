import { describe, expect, it } from 'vitest'
import { pecasDoMesmoDesenho } from './mesmo_desenho'

const quadrado: Array<[number, number]> = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
]
const outro: Array<[number, number]> = [
  [20, 0],
  [30, 0],
  [30, 10],
  [20, 10],
]

describe('peças com o mesmo desenho', () => {
  it('agrupa quem tem o mesmo tipo e o mesmo contorno, em ordem de nome', () => {
    const r = pecasDoMesmoDesenho([
      ['a', { tipo: 'P', nome: 'P101a', polys: [quadrado] }],
      ['b', { tipo: 'P', nome: 'P101', polys: [quadrado] }],
      ['c', { tipo: 'P', nome: 'P102', polys: [outro] }],
    ])
    expect(r.get('a')).toEqual(['b', 'a'])
    expect(r.get('b')).toEqual(['b', 'a'])
    expect(r.has('c')).toBe(false)
  })

  it('não junta tipos diferentes nem peças sem contorno', () => {
    const r = pecasDoMesmoDesenho([
      ['p', { tipo: 'P', nome: 'P1', polys: [quadrado] }],
      ['v', { tipo: 'V', nome: 'V1', polys: [quadrado] }],
      ['x', { tipo: 'P', nome: 'P2', polys: [] }],
      ['y', { tipo: 'P', nome: 'P3', polys: [] }],
    ])
    expect(r.size).toBe(0)
  })

  it('três peças no mesmo desenho e ordem natural (P9 antes de P10)', () => {
    const r = pecasDoMesmoDesenho([
      ['1', { tipo: 'P', nome: 'P10', polys: [quadrado] }],
      ['2', { tipo: 'P', nome: 'P9', polys: [quadrado] }],
      ['3', { tipo: 'P', nome: 'P9a', polys: [quadrado] }],
    ])
    expect(r.get('1')).toEqual(['2', '3', '1'])
  })
})

import { describe, expect, it } from 'vitest'
import { pecaDaLinha, pecaDoPonto, vigasComContorno } from './instalacao_no_elemento'
import type { ElementoPacote } from './pacote'

function viga(x0: number, y0: number, x1: number, y1: number, extra: Partial<ElementoPacote> = {}): ElementoPacote {
  return {
    tipo: 'V', nome: 'V1', secao: '19x60', rotulo: [x0, y0, x1, y1],
    polys: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]], ...extra,
  }
}

const elementos: Record<string, ElementoPacote> = {
  v1: viga(0, 0, 100, 10),
  v2: viga(50, 0, 60, 100),
  pilar: { tipo: 'P', nome: 'P1', secao: '20x20', rotulo: [200, 200, 220, 220], polys: [[[200, 200], [220, 200], [220, 220], [200, 220]]] },
  arranque: viga(300, 300, 400, 310, { so_detalhe: true }),
}
const vigas = vigasComContorno(elementos)

describe('pecaDoPonto', () => {
  it('em cima da viga conta na viga', () => {
    expect(pecaDoPonto([20, 5], vigas)).toEqual({ tipo: 'V', id: 'v1' })
    expect(pecaDoPonto([55, 50], vigas)).toEqual({ tipo: 'V', id: 'v2' })
  })
  it('dentro do pilar conta no pilar', () => {
    expect(pecaDoPonto([210, 210], vigas)).toEqual({ tipo: 'P', id: 'pilar' })
  })
  it('no encontro do pilar com a viga, vale o pilar', () => {
    const els = { v: viga(0, 0, 100, 10), p: { tipo: 'P' as const, nome: 'P2', secao: '', rotulo: [0, 0, 10, 10] as [number, number, number, number], polys: [[[0, 0], [10, 0], [10, 10], [0, 10]] as Array<[number, number]>] } }
    expect(pecaDoPonto([5, 5], vigasComContorno(els))).toEqual({ tipo: 'P', id: 'p' })
  })
  it('fora de pilar e de viga fica na laje (viga só de detalhe não conta)', () => {
    expect(pecaDoPonto([20, 50], vigas)).toEqual({ tipo: 'L' })
    expect(pecaDoPonto([350, 305], vigas)).toEqual({ tipo: 'L' })
  })
  it('furo que já veio com o pilar fica nele', () => {
    expect(pecaDoPonto([20, 50], vigas, { pilar: 'pilar' })).toEqual({ tipo: 'P', id: 'pilar' })
  })
  it('no cruzamento, a primeira viga do manifest', () => {
    expect(pecaDoPonto([55, 5], vigas)).toEqual({ tipo: 'V', id: 'v1' })
  })
  it('furo que já veio com a viga fica nela', () => {
    expect(pecaDoPonto([20, 50], vigas, { viga: 'v2' })).toEqual({ tipo: 'V', id: 'v2' })
  })
  it('sem vigas, tudo na laje', () => {
    expect(pecaDoPonto([20, 5], vigasComContorno({}))).toEqual({ tipo: 'L' })
  })
})

describe('pecaDaLinha', () => {
  it('eletroduto inteiro dentro da viga conta na viga', () => {
    expect(pecaDaLinha([[10, 5], [40, 5]], vigas)).toEqual({ tipo: 'V', id: 'v1' })
  })
  it('eletroduto que atravessa a viga fica na laje', () => {
    expect(pecaDaLinha([[20, -30], [20, 40]], vigas)).toEqual({ tipo: 'L' })
  })
  it('linha vazia fica na laje', () => {
    expect(pecaDaLinha([], vigas)).toEqual({ tipo: 'L' })
  })
})

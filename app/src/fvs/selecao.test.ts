import { describe, expect, it } from 'vitest'
import { pecasNoRetangulo, retanguloEntre } from './selecao'

// Planta fictícia da obra EXE: três vigas numa linha, uma embaixo, um pilar e um arranque.
const elementos: Array<[string, { tipo: string; rotulo: number[]; so_detalhe?: boolean }]> = [
  ['v3', { tipo: 'V', rotulo: [300, 100, 340, 110] }],
  ['v1', { tipo: 'V', rotulo: [100, 102, 140, 112] }],
  ['v2', { tipo: 'V', rotulo: [200, 98, 240, 108] }],
  ['v4', { tipo: 'V', rotulo: [100, 300, 140, 310] }],
  ['p1', { tipo: 'P', rotulo: [150, 150, 160, 160] }],
  ['p2', { tipo: 'P', rotulo: [170, 150, 180, 160], so_detalhe: true }],
]

describe('seleção de várias peças arrastando (21/11)', () => {
  it('o retângulo vale em qualquer sentido do arraste', () => {
    expect(retanguloEntre([400, 500], [100, 50])).toEqual([100, 50, 400, 500])
  })

  it('entram as peças do tipo com o nome dentro, em ordem de leitura', () => {
    expect(pecasNoRetangulo(elementos, [0, 0, 1000, 1000], 'V')).toEqual(['v1', 'v2', 'v3', 'v4'])
    expect(pecasNoRetangulo(elementos, [90, 90, 260, 120], 'V')).toEqual(['v1', 'v2'])
  })

  it('nome só pela metade dentro não entra; arranque só de detalhe também não', () => {
    expect(pecasNoRetangulo(elementos, [125, 90, 1000, 120], 'V')).toEqual(['v2', 'v3'])
    expect(pecasNoRetangulo(elementos, [0, 0, 1000, 1000], 'P')).toEqual(['p1'])
  })
})

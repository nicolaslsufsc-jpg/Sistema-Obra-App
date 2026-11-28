// Legenda do relatório de peças (26/11): só explica o que aparece.
import { describe, expect, it } from 'vitest'
import { LAJE_DESENHADA, legendaDoRelatorio, type ItemPeca, type LinhaPorCaminhao } from './relatorio'

const cam = (sequencia: number, pecas: ItemPeca[]): LinhaPorCaminhao => ({ caminhao: { raiz: `k${sequencia}`, sequencia, nota_fiscal: '1', volume_m3: 8 } as never, pecas })
const peca = (nome: string, extra: Partial<ItemPeca> = {}): ItemPeca => ({ peca: { id: nome, nome, tipo: 'P' }, fracao: 1, parcial: false, origem: 'desenho', ...extra })

describe('legenda do relatório', () => {
  it('tudo inteiro e desenhado: sem legenda', () => {
    expect(legendaDoRelatorio([cam(1, [peca('P1'), peca('P2')])])).toEqual([])
  })

  it('uma frase para cada coisa que aparece: parcial, laje desenhada, toque e caminhão sem peça', () => {
    const l = legendaDoRelatorio([
      cam(1, [peca('P1', { fracao: 0.45, parcial: true })]),
      cam(2, [{ peca: LAJE_DESENHADA, fracao: null, parcial: false, origem: 'desenho' }]),
      cam(3, [peca('P3', { fracao: 0, origem: 'manual' })]),
      cam(4, []),
    ])
    expect(l).toHaveLength(4)
    expect(l[0]).toContain('Percentual')
    expect(l[1]).toContain('Laje (área desenhada)')
    expect(l[2]).toContain('no toque')
    expect(l[3]).toContain('Sem peça desenhada')
  })
})

import { describe, expect, it } from 'vitest'
import { textoDaFaixa } from './faixa_local'

const agora = new Date(2026, 10, 8, 15, 0)
const as = (h: number, m: number, d = 8) => new Date(2026, 10, d, h, m).toISOString()

describe('faixa do modo sem conta', () => {
  it('sem registro: sem faixa', () => {
    expect(textoDaFaixa({ registros: 0 }, agora)).toEqual({ texto: '', salvo: true })
  })
  it('nunca salvo: só neste aparelho, ainda sem arquivo', () => {
    expect(textoDaFaixa({ registros: 1, maisNovo: as(14, 0) }, agora)).toEqual({
      texto: '1 registro só neste aparelho · ainda sem arquivo',
      salvo: false,
    })
  })
  it('registro depois do último arquivo: não salvo, com a hora do arquivo', () => {
    expect(textoDaFaixa({ registros: 3, maisNovo: as(14, 30), ultimo: as(14, 5) }, agora)).toEqual({
      texto: '3 registros só neste aparelho · último arquivo às 14:05',
      salvo: false,
    })
  })
  it('arquivo depois do último registro: salvo (verde)', () => {
    expect(textoDaFaixa({ registros: 3, maisNovo: as(14, 30), ultimo: as(14, 31) }, agora)).toEqual({
      texto: 'Salvo às 14:31: 3 registros no arquivo.',
      salvo: true,
    })
  })
  it('arquivo de outro dia leva a data', () => {
    expect(textoDaFaixa({ registros: 2, maisNovo: as(9, 0), ultimo: as(18, 0, 7) }, agora).texto).toBe(
      '2 registros só neste aparelho · último arquivo em 07/11/2026 às 18:00',
    )
  })
})

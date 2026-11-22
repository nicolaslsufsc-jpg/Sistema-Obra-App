import { describe, expect, it } from 'vitest'
import { textoDaCelulaTabela, textoDoResumo } from './tabela_formato'

describe('célula da tabela comum', () => {
  it('sem dado vira "–"', () => {
    expect(textoDaCelulaTabela(null)).toBe('–')
    expect(textoDaCelulaTabela(undefined)).toBe('–')
    expect(textoDaCelulaTabela('')).toBe('–')
    expect(textoDaCelulaTabela(NaN)).toBe('–')
  })
  it('volume com uma casa e vírgula', () => {
    expect(textoDaCelulaTabela(25.5, 1)).toBe('25,5')
    expect(textoDaCelulaTabela(25, 1)).toBe('25,0')
  })
  it('contagem sem casas', () => {
    expect(textoDaCelulaTabela(3)).toBe('3')
    expect(textoDaCelulaTabela(0)).toBe('0')
  })
  it('texto passa igual', () => {
    expect(textoDaCelulaTabela('Em andamento')).toBe('Em andamento')
  })
})

describe('linha de resumo', () => {
  it('junta com barra e tira as vazias', () => {
    expect(textoDoResumo(['9 vigentes', '', null, false, '1 atrasado'])).toBe('9 vigentes | 1 atrasado')
  })
})

import { describe, expect, it } from 'vitest'
import { dataCurta } from './pacote'

describe('data da correção do detalhe', () => {
  it('mostra dia e mês', () => {
    expect(dataCurta('2026-11-17')).toBe('17/11')
  })
  it('vazio ou fora do formato não mostra nada', () => {
    expect(dataCurta(undefined)).toBe('')
    expect(dataCurta('')).toBe('')
    expect(dataCurta('17/11/2026')).toBe('')
  })
})

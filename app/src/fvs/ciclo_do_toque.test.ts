import { describe, expect, it } from 'vitest'
import { passoDoToque } from './ciclo_do_toque'

describe('ciclo do toque (21/11: 1 verde, 2 vermelho, 3 tira)', () => {
  it('sem conferir, OK, errada e de volta', () => {
    expect(passoDoToque('nada', false)).toBe('ok')
    expect(passoDoToque('liberado', false)).toBe('abrir_nc')
    expect(passoDoToque('reprovado', false)).toBe('tirar')
  })
  it('3º toque com a caixa do NC aberta tira a verificação', () => {
    expect(passoDoToque('liberado', true)).toBe('tirar')
  })
})

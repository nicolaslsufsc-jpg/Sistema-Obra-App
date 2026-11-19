import { describe, expect, it } from 'vitest'
import { horaAgora } from './telas/Formularios'
import { horaParaCampo, juntarDataHora } from './telas/comum'

describe('botão "Agora" nas horas do caminhão', () => {
  it('dá a hora do relógio no formato do campo de hora', () => {
    expect(horaAgora(new Date(2026, 10, 8, 7, 5, 59))).toBe('07:05')
    expect(horaAgora(new Date(2026, 10, 8, 0, 0))).toBe('00:00')
    expect(horaAgora(new Date(2026, 10, 8, 23, 59))).toBe('23:59')
  })

  it('a hora do "Agora" grava e volta igual ao campo', () => {
    const h = horaAgora(new Date(2026, 10, 8, 14, 32))
    expect(horaParaCampo(juntarDataHora('2026-11-08', h))).toBe('14:32')
  })
})

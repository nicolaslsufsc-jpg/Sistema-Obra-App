import { describe, expect, it } from 'vitest'
import { compararHoras, deMicros, horaMenos, paraMicros } from './tempo'

describe('tempo', () => {
  it('lê microssegundos e fusos diferentes como a mesma hora', () => {
    const utc = paraMicros('2026-11-03T18:26:53.123456+00:00')
    expect(paraMicros('2026-11-03T15:26:53.123456-03:00')).toBe(utc)
    expect(paraMicros('2026-11-03 15:26:53.123456-03')).toBe(utc)
    expect(paraMicros('2026-11-03T18:26:53.123456Z')).toBe(utc)
    expect(paraMicros('2026-11-03T23:56:53.123456+05:30')).toBe(utc)
  })

  it('não perde o microssegundo que o Date do JavaScript perderia', () => {
    expect(compararHoras('2026-11-03T18:26:53.123457+00:00', '2026-11-03T18:26:53.123456+00:00')).toBe(1)
    expect(compararHoras('2026-11-03T18:26:53.1+00:00', '2026-11-03T18:26:53.100000Z')).toBe(0)
  })

  it('volta para texto ISO com 6 casas', () => {
    expect(deMicros(paraMicros('2026-11-03T15:26:53.000001-03:00'))).toBe('2026-11-03T18:26:53.000001Z')
  })

  it('subtrai a margem da baixa', () => {
    expect(horaMenos('2026-11-03T18:26:53.123456+00:00', 5 * 60 * 1000)).toBe('2026-11-03T18:21:53.123456Z')
  })

  it('recusa texto que não é hora', () => {
    expect(() => paraMicros('ontem')).toThrow()
  })
})

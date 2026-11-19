import { describe, expect, it } from 'vitest'
import { codigoParaLer } from './formato'

describe('código da ficha para ler', () => {
  it('parêntese aberto sem fechar vira separador (como veio do sistema oficial na demonstração)', () => {
    expect(codigoParaLer('EXE-FVS-1(EXE-0001-2026')).toBe('EXE-FVS-1 · EXE-0001-2026')
  })
  it('código normal ou com parênteses fechados fica igual', () => {
    expect(codigoParaLer('EXE-PVS-001')).toBe('EXE-PVS-001')
    expect(codigoParaLer('FVS-1 (rev. 2)')).toBe('FVS-1 (rev. 2)')
  })
})

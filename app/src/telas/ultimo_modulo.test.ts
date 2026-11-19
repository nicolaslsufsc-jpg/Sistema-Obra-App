// Reabrir o app volta ao módulo que estava aberto (bug do teste no celular, 18/11).
import { describe, expect, it } from 'vitest'
import { esquecerModulo, lembrarModulo, moduloGuardado } from './ultimo_modulo'

function armazenamentoDeTeste(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  }
}

describe('último módulo aberto', () => {
  it('volta ao módulo só na mesma obra', () => {
    const s = armazenamentoDeTeste()
    expect(moduloGuardado('obra-a', s)).toBeUndefined()
    lembrarModulo('obra-a', 'fvs', s)
    expect(moduloGuardado('obra-a', s)).toBe('fvs')
    expect(moduloGuardado('obra-b', s)).toBeUndefined()
  })
  it('esquecer (menu, Sair, trocar de obra ou de pacote) abre no menu', () => {
    const s = armazenamentoDeTeste()
    lembrarModulo('obra-a', 'fvs', s)
    esquecerModulo(s)
    expect(moduloGuardado('obra-a', s)).toBeUndefined()
  })
  it('valor estragado ou sem localStorage não quebra', () => {
    const s = armazenamentoDeTeste()
    s.setItem('casca_ultimo_modulo', '{quebrado')
    expect(moduloGuardado('obra-a', s)).toBeUndefined()
    expect(moduloGuardado('obra-a', null)).toBeUndefined()
    expect(() => lembrarModulo('obra-a', 'fvs', null)).not.toThrow()
  })
})

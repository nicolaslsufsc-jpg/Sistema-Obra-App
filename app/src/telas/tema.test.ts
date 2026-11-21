import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aplicarTema, CHAVE_TEMA, definirTema, lerTema } from './tema'

// os testes de unidade rodam sem navegador: armazenamento e <html> de mentira
let guardado: Record<string, string>
let raiz: HTMLElement
beforeEach(() => {
  guardado = {}
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => guardado[k] ?? null,
    setItem: (k: string, v: string) => void (guardado[k] = v),
  })
  raiz = { dataset: {} } as HTMLElement
})
afterEach(() => vi.unstubAllGlobals())

describe('tema', () => {
  it('sem escolha: claro (padrão desde 21/11/2026)', () => {
    expect(lerTema()).toBe('claro')
  })
  it('"claro" guardado antes de 21/11 continua claro', () => {
    guardado[CHAVE_TEMA] = 'claro'
    expect(lerTema()).toBe('claro')
  })
  it('tema escuro fica guardado no aparelho e marca o html', () => {
    definirTema('escuro', raiz)
    expect(guardado[CHAVE_TEMA]).toBe('escuro')
    expect(lerTema()).toBe('escuro')
    expect(raiz.dataset.tema).toBe('escuro')
  })
  it('voltar ao claro tira a marca', () => {
    definirTema('escuro', raiz)
    definirTema('claro', raiz)
    expect(lerTema()).toBe('claro')
    expect(raiz.dataset.tema).toBeUndefined()
  })
  it('aplicar não grava nada', () => {
    aplicarTema('escuro', raiz)
    expect(guardado[CHAVE_TEMA]).toBeUndefined()
  })
  it('sem armazenamento (aba anônima): claro, sem quebrar', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
    })
    expect(lerTema()).toBe('claro')
    definirTema('escuro', raiz)
    expect(raiz.dataset.tema).toBe('escuro')
  })
})

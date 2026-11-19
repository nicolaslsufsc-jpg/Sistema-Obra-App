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
  it('sem escolha: escuro', () => {
    expect(lerTema()).toBe('escuro')
  })
  it('modo sol fica guardado no aparelho e marca o html', () => {
    definirTema('claro', raiz)
    expect(guardado[CHAVE_TEMA]).toBe('claro')
    expect(lerTema()).toBe('claro')
    expect(raiz.dataset.tema).toBe('claro')
  })
  it('voltar ao escuro tira a marca', () => {
    definirTema('claro', raiz)
    definirTema('escuro', raiz)
    expect(lerTema()).toBe('escuro')
    expect(raiz.dataset.tema).toBeUndefined()
  })
  it('aplicar não grava nada', () => {
    aplicarTema('claro', raiz)
    expect(guardado[CHAVE_TEMA]).toBeUndefined()
  })
  it('sem armazenamento (aba anônima): escuro, sem quebrar', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
    })
    expect(lerTema()).toBe('escuro')
    definirTema('claro', raiz)
    expect(raiz.dataset.tema).toBe('claro')
  })
})

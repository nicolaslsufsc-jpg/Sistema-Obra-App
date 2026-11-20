import { describe, expect, it } from 'vitest'
import { CADA_30_MIN, checarAtualizacao } from './checar_atualizacao'

function montar(visivel = true, online = true) {
  const ouvintes: Record<string, (() => void)[]> = {}
  const relogios: { f: () => void; ms: number; parado?: boolean }[] = []
  let atualizacoes = 0
  const estado = { visivel, online }
  const alvo = {
    addEventListener: (t: string, f: () => void) => (ouvintes[t] ??= []).push(f),
    removeEventListener: (t: string, f: () => void) => (ouvintes[t] = (ouvintes[t] ?? []).filter((g) => g !== f)),
  }
  const amb = {
    document: { ...alvo, get visibilityState() { return estado.visivel ? 'visible' : 'hidden' } },
    window: {
      ...alvo,
      setInterval: (f: () => void, ms: number) => relogios.push({ f, ms }) - 1,
      clearInterval: (i: number) => (relogios[i].parado = true),
    },
    online: () => estado.online,
  } as unknown as Parameters<typeof checarAtualizacao>[1]
  const registro = { update: async () => { atualizacoes++ } }
  const desligar = checarAtualizacao(registro, amb)
  const disparar = (t: string) => (ouvintes[t] ?? []).forEach((f) => f())
  return { estado, disparar, relogios, desligar, ouvintes, atualizacoes: () => atualizacoes }
}

describe('checarAtualizacao', () => {
  it('confere ao abrir e ao voltar para a aba', () => {
    const t = montar()
    expect(t.atualizacoes()).toBe(1)
    t.estado.visivel = false
    t.disparar('visibilitychange')
    expect(t.atualizacoes()).toBe(1)
    t.estado.visivel = true
    t.disparar('visibilitychange')
    expect(t.atualizacoes()).toBe(2)
  })

  it('sem internet não confere; quando a internet volta, confere', () => {
    const t = montar(true, false)
    expect(t.atualizacoes()).toBe(0)
    t.estado.online = true
    t.disparar('online')
    expect(t.atualizacoes()).toBe(1)
  })

  it('confere a cada 30 min com a aba aberta e para ao desligar', () => {
    const t = montar()
    expect(t.relogios).toHaveLength(1)
    expect(t.relogios[0].ms).toBe(CADA_30_MIN)
    t.relogios[0].f()
    expect(t.atualizacoes()).toBe(2)
    t.desligar()
    expect(t.relogios[0].parado).toBe(true)
    expect(t.ouvintes.visibilitychange).toEqual([])
    expect(t.ouvintes.online).toEqual([])
  })

  it('erro na conferência (sem rede, já conferindo) não quebra o app', async () => {
    const amb = {
      document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
      window: { addEventListener() {}, removeEventListener() {}, setInterval: () => 0, clearInterval() {} },
      online: () => true,
    } as unknown as Parameters<typeof checarAtualizacao>[1]
    expect(() => checarAtualizacao({ update: () => Promise.reject(new Error('rede')) }, amb)).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
  })
})

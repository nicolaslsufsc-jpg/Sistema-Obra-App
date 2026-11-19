import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Linha } from '../nucleo/banco_local'
import { anotarToque, esquecerToque, refazerToques, toquesAnotados, type Toque } from './toques'

// localStorage de mentira (os testes rodam em node)
const guardado = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => guardado.get(k) ?? null,
  setItem: (k: string, v: string) => void guardado.set(k, v),
  removeItem: (k: string) => void guardado.delete(k),
})

const OBRA = 'o1'
const base = { obraId: OBRA, usuarioId: 'u1', plantaId: 'pl1', fichaCampoId: null }
const item = (id: string, n = 1): Toque => ({ ...base, tipo: 'item', id, pecaId: 'p1', fichaId: 'f1', item: n, resultado: 'C' })
const lote = (id: string): Toque => ({ ...base, tipo: 'lote', id, pecas: [{ id: 'p1', fichaId: 'f1', fichaCampoId: null }], etapa: 'MONTAGEM', resultado: 'C' })
const linha = (id: string) => ({ id }) as unknown as Linha

describe('diário de toques', () => {
  beforeEach(() => guardado.clear())

  it('anota na hora e esquece quando o banco confirma', () => {
    anotarToque(item('a'))
    anotarToque(item('b', 2))
    expect(toquesAnotados(OBRA).map((t) => t.id)).toEqual(['a', 'b'])
    esquecerToque(OBRA, 'a')
    expect(toquesAnotados(OBRA).map((t) => t.id)).toEqual(['b'])
    esquecerToque(OBRA, 'b')
    expect(guardado.size).toBe(0)
    // outra obra não vê
    anotarToque({ ...item('c'), obraId: 'o2' })
    expect(toquesAnotados(OBRA)).toEqual([])
  })

  it('ao abrir, refaz na ordem só o que não chegou ao banco, e não duplica', async () => {
    anotarToque(item('gravado'))
    anotarToque(item('perdido', 2))
    anotarToque(lote('lote1'))
    const refeitos: string[] = []
    const n = await refazerToques(
      OBRA,
      async (id) => id === 'gravado',
      async (t) => {
        refeitos.push(t.id)
        return t.tipo === 'lote' ? [linha('x'), linha('y')] : linha(t.id)
      },
    )
    expect(refeitos).toEqual(['perdido', 'lote1'])
    expect(n).toBe(2)
    expect(toquesAnotados(OBRA)).toEqual([])
    // abrir de novo não refaz nada
    expect(await refazerToques(OBRA, async () => false, async () => linha('z'))).toBe(0)
  })

  it('lote que já tinha entrado inteiro não conta como refeito; erro não trava os outros', async () => {
    anotarToque(lote('completo'))
    anotarToque(item('falha'))
    anotarToque(item('ok', 3))
    const n = await refazerToques(
      OBRA,
      async () => false,
      async (t) => {
        if (t.id === 'falha') throw new Error('ficha saiu do aparelho')
        return t.tipo === 'lote' ? [] : linha(t.id)
      },
    )
    expect(n).toBe(1)
    expect(toquesAnotados(OBRA)).toEqual([])
  })

  it('sem localStorage (modo privado), o toque segue sem a rede de segurança', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('negado')
      },
      setItem: () => {
        throw new Error('negado')
      },
      removeItem: () => {},
    })
    expect(() => anotarToque(item('a'))).not.toThrow()
    expect(toquesAnotados(OBRA)).toEqual([])
    expect(() => esquecerToque(OBRA, 'a')).not.toThrow()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => guardado.get(k) ?? null,
      setItem: (k: string, v: string) => void guardado.set(k, v),
      removeItem: (k: string) => void guardado.delete(k),
    })
  })
})

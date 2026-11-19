// Onde a pessoa estava na FVS, para voltar depois de fechar o Chrome (bug do teste no celular, 18/11).
import { describe, expect, it } from 'vitest'
import { lembrarPainel, lembrarTela, telaGuardada } from './onde_estava'

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

describe('onde a pessoa estava na FVS', () => {
  it('a planta com a peça do painel aberta por último', () => {
    const s = armazenamentoDeTeste()
    lembrarTela('o', { nome: 'planta', plantaId: 'pl1' }, s)
    expect(telaGuardada('o', s)).toEqual({ nome: 'planta', plantaId: 'pl1' })
    lembrarPainel('o', 'p4', s)
    expect(telaGuardada('o', s)).toEqual({ nome: 'planta', plantaId: 'pl1', pecaId: 'p4' })
    lembrarPainel('o', null, s)
    expect(telaGuardada('o', s)).toEqual({ nome: 'planta', plantaId: 'pl1' })
    expect(telaGuardada('outra-obra', s)).toBeUndefined()
  })
  it('entrar pela busca abre a peça; tocar em outra troca; ficha e item só valem para a peça da entrada', () => {
    const s = armazenamentoDeTeste()
    lembrarTela('o', { nome: 'planta', plantaId: 'pl1', pecaId: 'p2', fichaCampoId: 'fc', item: 3 }, s)
    expect(telaGuardada('o', s)).toEqual({ nome: 'planta', plantaId: 'pl1', pecaId: 'p2', fichaCampoId: 'fc', item: 3 })
    lembrarPainel('o', 'p7', s)
    expect(telaGuardada('o', s)).toEqual({ nome: 'planta', plantaId: 'pl1', pecaId: 'p7' })
  })
  it('voltar ao início ou ir a outra lista esquece o painel', () => {
    const s = armazenamentoDeTeste()
    lembrarTela('o', { nome: 'planta', plantaId: 'pl1' }, s)
    lembrarPainel('o', 'p4', s)
    lembrarTela('o', { nome: 'inicio' }, s)
    lembrarPainel('o', 'p9', s) // painel fora da planta não conta
    expect(telaGuardada('o', s)).toEqual({ nome: 'inicio' })
    lembrarTela('o', { nome: 'planta', plantaId: 'pl2' }, s)
    expect(telaGuardada('o', s)).toEqual({ nome: 'planta', plantaId: 'pl2' })
  })
})

// Pontos de instalações (frente INSTALAÇÕES, 20/11/2026). Ficha e pontos fictícios da obra EXE.
import { describe, expect, it } from 'vitest'
import { distanciaAoPonto, fichaDosPontos, itemDosPontos, nomeDoFiltroDePontos, nomeDoPonto, opcoesDoFiltroDePontos, pontosNoFiltro, pontoTocado, resumoDosPontos, textoDoAvancoDosPontos, type PontoPacote } from './pontos'
import type { Ficha } from './situacao'

const AMB: Ficha = {
  id: 'f-exe-amb',
  codigo: 'EXE-PVS-105',
  titulo: 'Instalações sanitárias (Obra Exemplo)',
  revisao: '0',
  aplica_a: ['A'],
  itens: [
    { n: 1, etapa: 'INÍCIO', titulo: 'Projeto na mão' },
    { n: 2, etapa: 'EXECUÇÃO', titulo: 'Ralos e caixas no lugar do projeto', pontos: 'sanitario' },
  ],
}

const p = (x: number, y: number, tipo: PontoPacote['tipo'] = 'ralo', nome = ''): PontoPacote => ({ disciplina: 'sanitario', tipo, ponto: [x, y], nome })

describe('eletroduto como linha (21/11)', () => {
  const e: PontoPacote = { disciplina: 'eletrico', tipo: 'eletroduto', ponto: [50, 10], nome: 'Eletroduto', linha: [[0, 10], [100, 10]] }
  it('o toque perto de qualquer parte da linha pega o eletroduto', () => {
    expect(distanciaAoPonto([5, 13], e)).toBeCloseTo(3)
    expect(pontoTocado([95, 12], { e }, 5, 1)).toEqual({ id: 'e' })
    expect(pontoTocado([120, 10], { e }, 5, 1)).toBeNull()
  })
  it('caixa no meio do eletroduto: a mais perto ganha', () => {
    const cx: PontoPacote = { disciplina: 'eletrico', tipo: 'caixa_passagem', ponto: [50, 14], nome: '' }
    expect(pontoTocado([50, 14], { e, cx }, 5, 1)).toEqual({ id: 'cx' })
    expect(pontoTocado([20, 10], { e, cx }, 5, 1)).toEqual({ id: 'e' })
  })
  it('caixa na ponta do eletroduto: o toque na caixa é da caixa, não ambíguo', () => {
    const cx: PontoPacote = { disciplina: 'eletrico', tipo: 'caixa_passagem', ponto: [100, 10], nome: '' }
    expect(pontoTocado([100, 10], { e, cx }, 5, 1)).toEqual({ id: 'cx' })
    expect(pontoTocado([90, 10], { e, cx }, 5, 1)).toEqual({ id: 'e' })
  })
})

describe('pontoTocado', () => {
  const pontos = { a: p(10, 10), b: p(30, 10), c: p(31, 10) }
  it('o mais perto dentro do raio', () => {
    expect(pontoTocado([12, 11], pontos, 5, 1)).toEqual({ id: 'a' })
  })
  it('nada perto', () => {
    expect(pontoTocado([100, 100], pontos, 5, 1)).toBeNull()
  })
  it('dois juntos: ambíguo', () => {
    expect(pontoTocado([30.5, 10], pontos, 5, 1)).toEqual({ ambiguo: true })
  })
})

describe('ficha dos pontos', () => {
  it('o item marcado com a disciplina', () => {
    expect(itemDosPontos(AMB, 'sanitario')?.n).toBe(2)
    expect(itemDosPontos(AMB, 'hidro')).toBeUndefined()
    expect(fichaDosPontos([AMB], 'sanitario')).toEqual({ ficha: AMB, item: 2 })
    expect(fichaDosPontos([AMB], 'hidro')).toBeUndefined()
    // sem ficha de ambiente com "pontos": o item da instalação na ficha de laje (21/11)
    const LAJE = { ...AMB, codigo: 'LAJE', aplica_a: ['L'], itens: [
      { n: 12, etapa: 'INSTALAÇÕES', titulo: 'Pontos de esgoto', instalacao: 'esgoto' as const },
      { n: 13, etapa: 'INSTALAÇÕES', titulo: 'Pontos de AF/AQ', instalacao: 'agua' as const },
    ] }
    expect(fichaDosPontos([], 'hidro', [LAJE])).toEqual({ ficha: LAJE, item: 13 })
    expect(fichaDosPontos([AMB], 'sanitario', [LAJE])).toEqual({ ficha: AMB, item: 2 })
    expect(fichaDosPontos([], 'spda', [LAJE])).toBeUndefined()
  })
})

describe('nomes', () => {
  it('nome do modelo com o tipo, ou só o tipo', () => {
    expect(nomeDoPonto(p(0, 0, 'ralo', 'Ralo seco 100x100'))).toBe('Ralo seco 100x100 (ralo)')
    expect(nomeDoPonto(p(0, 0, 'caixa_sifonada', ''))).toBe('Caixa sifonada')
    expect(nomeDoPonto(p(0, 0, 'ralo', 'Ralo'))).toBe('Ralo')
    expect(nomeDoPonto({ disciplina: 'spda', tipo: 'caixa_inspecao', ponto: [0, 0], nome: '' })).toBe('Caixa de inspeção')
    expect(nomeDoPonto({ disciplina: 'eletrico', tipo: 'quadro', ponto: [0, 0], nome: 'QDL-02' })).toBe('QDL-02 (quadro)')
  })
  it('resumo por tipo', () => {
    expect(resumoDosPontos({ a: p(0, 0), b: p(1, 1), c: p(2, 2, 'caixa') })).toEqual([
      ['caixa', 1],
      ['ralo', 2],
    ])
  })
})

describe('filtro por tipo de ponto (SPDA igual aos furos, 22/11)', () => {
  const spda: Record<string, PontoPacote> = {
    a: { disciplina: 'spda', tipo: 'haste', ponto: [0, 0], nome: 'H1' },
    b: { disciplina: 'spda', tipo: 'captor', ponto: [1, 0], nome: 'C1' },
    c: { disciplina: 'spda', tipo: 'captor', ponto: [2, 0], nome: 'C2' },
    d: { disciplina: 'spda', tipo: 'conector', ponto: [3, 0], nome: 'X1' },
  }
  it('Todos primeiro, depois os tipos na ordem dos nomes, com a contagem', () => {
    expect(opcoesDoFiltroDePontos(spda)).toEqual([
      { filtro: 'todos', n: 4 },
      { filtro: 'captor', n: 2 },
      { filtro: 'haste', n: 1 },
      { filtro: 'conector', n: 1 },
    ])
    expect(opcoesDoFiltroDePontos(undefined)).toEqual([{ filtro: 'todos', n: 0 }])
  })
  it('nomes e pontos do filtro', () => {
    expect(nomeDoFiltroDePontos('todos')).toBe('Todos')
    expect(nomeDoFiltroDePontos('conector')).toBe('Conector de aterramento')
    expect(Object.keys(pontosNoFiltro(spda, 'captor'))).toEqual(['b', 'c'])
    expect(pontosNoFiltro(spda, 'todos')).toBe(spda)
  })
  it('texto do avanço no menu', () => {
    expect(textoDoAvancoDosPontos({ ok: 0, errados: 0, total: 1 })).toBe('0 de 1 ponto OK')
    expect(textoDoAvancoDosPontos({ ok: 3, errados: 2, total: 12 })).toBe('3 de 12 pontos OK · 2 errados')
  })
})

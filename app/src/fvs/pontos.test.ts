// Pontos de instalações (frente INSTALAÇÕES, 20/11/2026). Ficha e pontos fictícios da obra EXE.
import { describe, expect, it } from 'vitest'
import { fichaDosPontos, itemDosPontos, nomeDoPonto, pontoTocado, resumoDosPontos, type PontoPacote } from './pontos'
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

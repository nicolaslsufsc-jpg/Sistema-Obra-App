import { describe, expect, it } from 'vitest'
import { distanciaAoContorno, escolherNoToque, MARGEM_PADRAO, MARGEM_VIGA, opcoesDeToque, type Candidato, type Ponto } from './toque'

const ret = (x0: number, y0: number, x1: number, y1: number): Ponto[][] => [
  [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ],
]

// em px de tela, como no celular: a V10 com 5 px de altura chegando no P32 (achado do Testador, 09/11)
const V10 = ret(0, 0, 100, 5)
const P32 = ret(100, -6, 116, 11)
const LAJE = ret(-50, -50, 200, 200)

/** Os candidatos na ordem do desenho (laje embaixo, viga, pilar por cima), meia linha de 1 px. */
function quem(p: Ponto): string | undefined {
  const camadas: Array<[string, Ponto[][], string]> = [
    ['L1', LAJE, 'L'],
    ['V10', V10, 'V'],
    ['P32', P32, 'P'],
  ]
  const cands: Candidato<string>[] = camadas.map(([nome, aneis, tipo]) => {
    const o = opcoesDeToque(tipo)
    const d = distanciaAoContorno(p, aneis)
    return { camada: nome, d: d === 0 ? 0 : Math.max(0, d - 1), margem: o.margemToque ?? MARGEM_PADRAO, fundo: !!o.toqueDeFundo }
  })
  return escolherNoToque(cands)
}

describe('toque na planta', () => {
  it('distância ao contorno: 0 dentro, até a borda mais perto fora', () => {
    expect(distanciaAoContorno({ x: 50, y: 2 }, V10)).toBe(0)
    expect(distanciaAoContorno({ x: 50, y: 15 }, V10)).toBe(10)
    expect(distanciaAoContorno({ x: 103, y: 4 }, V10)).toBe(3)
  })

  it('toque em cima da viga, perto da borda do pilar: abre a viga (antes abria o P32)', () => {
    expect(quem({ x: 96, y: 2 })).toBe('V10')
  })

  it('toque a 8 a 11 px da viga, longe do pilar: ainda abre a viga (margem maior)', () => {
    for (const y of [13, 16]) expect(quem({ x: 50, y })).toBe('V10')
    // longe de tudo: cai na laje, que é o fundo
    expect(quem({ x: 50, y: 5 + MARGEM_VIGA + 4 })).toBe('L1')
  })

  it('perto dos dois: o contorno mais perto ganha', () => {
    expect(quem({ x: 98, y: 9 })).toBe('P32') // 4 px da viga, 2 px do pilar
    expect(quem({ x: 92, y: 9 })).toBe('V10') // 4 px da viga, 8 px do pilar
  })

  it('dentro do pilar, mesmo junto da viga: abre o pilar', () => {
    expect(quem({ x: 101, y: 8 })).toBe('P32')
    expect(quem({ x: 110, y: 2 })).toBe('P32')
  })

  it('laje e ambiente são fundo: estar dentro deles não tira o toque da viga', () => {
    expect(quem({ x: 50, y: 10 })).toBe('V10')
    expect(quem({ x: 150, y: 150 })).toBe('L1')
  })

  it('empate fica com o último desenhado (o de cima), como antes', () => {
    const c = (camada: string): Candidato<string> => ({ camada, d: 0, margem: 7, fundo: false })
    expect(escolherNoToque([c('nome'), c('desenho')])).toBe('desenho')
    expect(escolherNoToque([{ camada: 'longe', d: 9, margem: 7, fundo: false }])).toBeUndefined()
  })
})

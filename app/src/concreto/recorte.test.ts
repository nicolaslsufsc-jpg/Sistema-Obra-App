// Borracha de trecho (26/11): a área menos o traço da borracha.
import { describe, expect, it } from 'vitest'
import { areaDe, pontoNoPoligono, type Ponto } from './geometria'
import { recortar } from './recorte'

const ret = (x0: number, y0: number, x1: number, y1: number): Ponto[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]
const area = ret(0, 0, 100, 100)

describe('recorte de área', () => {
  it('tira um canto: sobra um "L" com a área certa', () => {
    const r = recortar(area, ret(60, 60, 150, 150))
    expect(r.tipo).toBe('sobra')
    if (r.tipo !== 'sobra') return
    expect(r.contornos).toHaveLength(1)
    expect(areaDe(r.contornos[0])).toBeCloseTo(10000 - 1600, 3)
    expect(r.contornos[0]).toHaveLength(6)
    // o canto tirado ficou fora; o resto continua dentro
    expect(pontoNoPoligono(80, 80, r.contornos[0])).toBe(false)
    expect(pontoNoPoligono(20, 80, r.contornos[0])).toBe(true)
  })

  it('tira uma faixa do meio: a área parte em duas', () => {
    const r = recortar(area, ret(40, -20, 60, 120))
    expect(r.tipo).toBe('sobra')
    if (r.tipo !== 'sobra') return
    expect(r.contornos.map((c) => Math.round(areaDe(c))).sort()).toEqual([4000, 4000])
  })

  it('tira uma mordida na borda: um contorno só, com reentrância', () => {
    const r = recortar(area, ret(30, -10, 70, 40))
    expect(r.tipo).toBe('sobra')
    if (r.tipo !== 'sobra') return
    expect(r.contornos).toHaveLength(1)
    expect(areaDe(r.contornos[0])).toBeCloseTo(10000 - 40 * 40, 3)
  })

  it('traço que cobre tudo: a área some; traço longe: intacta; traço no meio sem cruzar a borda: furo', () => {
    expect(recortar(area, ret(-10, -10, 110, 110)).tipo).toBe('some')
    expect(recortar(area, ret(200, 200, 300, 300)).tipo).toBe('intacta')
    expect(recortar(area, ret(40, 40, 60, 60)).tipo).toBe('furo')
  })

  it('traço à mão (torto) cruzando a área: sobra fecha e não perde nem inventa área', () => {
    const traco: Ponto[] = Array.from({ length: 60 }, (_, i) => {
      const a = (i / 60) * Math.PI * 2
      const r = 45 + Math.sin(i * 2.3) * 4
      return [100 + Math.cos(a) * r, 50 + Math.sin(a) * r] as Ponto
    })
    const r = recortar(area, traco)
    expect(r.tipo).toBe('sobra')
    if (r.tipo !== 'sobra') return
    expect(r.contornos).toHaveLength(1)
    const sobra = areaDe(r.contornos[0])
    expect(sobra).toBeGreaterThan(10000 - areaDe(traco))
    expect(sobra).toBeLessThan(10000 - areaDe(traco) * 0.4)
  })

  it('sobra miúda é jogada fora', () => {
    // sobra uma lasca de 0,5 de largura
    expect(recortar(area, ret(0.5, -10, 150, 150), 100).tipo).toBe('some')
  })

  it('traço que se cruza (um "8"): não emenda com segurança e nada muda', () => {
    const oito: Ponto[] = [[50, -20], [120, 60], [50, 60], [120, -20]]
    expect(['falhou', 'sobra']).toContain(recortar(area, oito).tipo)
  })

  it('área ou traço com o primeiro ponto repetido no fim (como a caneta grava): recorta igual', () => {
    const fechada: Ponto[] = [...area, area[0]]
    const tracoFechado: Ponto[] = [...ret(60, 60, 150, 150), [60, 60]]
    const r = recortar(fechada, tracoFechado)
    expect(r.tipo).toBe('sobra')
    if (r.tipo !== 'sobra') return
    expect(areaDe(r.contornos[0])).toBeCloseTo(10000 - 1600, 3)
  })
})
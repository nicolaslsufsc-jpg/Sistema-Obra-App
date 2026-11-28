// Áreas do mesmo caminhão como um desenho só (26/11): grupos e contorno de fora da união.
import { describe, expect, it } from 'vitest'
import type { Ponto } from './geometria'
import { pontoNoPoligono } from './geometria'
import { areasSeTocam, bordaDaUniao, gruposQueSeTocam, noSentidoPositivo, pontoDeRotulo, unirAreas } from './uniao'

const quadrado = (x: number, y: number, l: number): Ponto[] => [
  [x, y],
  [x + l, y],
  [x + l, y + l],
  [x, y + l],
]
const comprimentoDe = (linhas: Ponto[][]) =>
  linhas.reduce((s, l) => s + l.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - l[i][0], p[1] - l[i][1]), 0), 0)

describe('união das áreas', () => {
  it('sobrepostas, uma dentro da outra ou separadas', () => {
    expect(areasSeTocam(quadrado(0, 0, 10), quadrado(5, 5, 10))).toBe(true)
    expect(areasSeTocam(quadrado(0, 0, 10), quadrado(2, 2, 3))).toBe(true)
    expect(areasSeTocam(quadrado(0, 0, 10), quadrado(20, 0, 10))).toBe(false)
    // encostadas lado a lado (mesma linha): também é um desenho só
    expect(areasSeTocam(quadrado(0, 0, 10), quadrado(10, 0, 10))).toBe(true)
  })

  it('agrupa em cadeia: A toca B, B toca C, D fica sozinha', () => {
    const a = quadrado(0, 0, 10)
    const b = quadrado(8, 0, 10)
    const c = quadrado(16, 0, 10)
    const d = quadrado(100, 100, 5)
    expect(gruposQueSeTocam([a, d, c, b])).toEqual([[0, 2, 3], [1]])
  })

  it('duas sobrepostas viram um contorno só, sem o risco de dentro', () => {
    const linhas = bordaDaUniao([quadrado(0, 0, 10), quadrado(5, 5, 10)])
    // perímetro da união em "L duplo": 2 quadrados de 40 menos os 4 pedaços de 5 de dentro
    expect(comprimentoDe(linhas)).toBeCloseTo(60, 6)
    // nenhum ponto da borda fica dentro da sobreposição (5..10, 5..10)
    for (const l of linhas) for (const [x, y] of l) expect(x > 5 && x < 10 && y > 5 && y < 10).toBe(false)
  })

  it('uma área dentro da outra some no contorno; uma sozinha fica inteira e fechada', () => {
    expect(comprimentoDe(bordaDaUniao([quadrado(0, 0, 10), quadrado(2, 2, 3)]))).toBeCloseTo(40, 6)
    const so = bordaDaUniao([quadrado(0, 0, 10)])
    expect(so).toHaveLength(1)
    expect(so[0][0]).toEqual(so[0][so[0].length - 1])
  })

  it('encostadas lado a lado: o lado comum sai do contorno', () => {
    expect(comprimentoDe(bordaDaUniao([quadrado(0, 0, 10), quadrado(10, 0, 10)]))).toBeCloseTo(60, 6)
  })

  it('o sentido de todos os anéis fica igual (a pintura não abre buraco na sobreposição)', () => {
    const horario = quadrado(0, 0, 10)
    const anti = [...horario].reverse()
    expect(noSentidoPositivo(anti)).toEqual(noSentidoPositivo(horario))
  })

  it('o número do caminhão fica dentro do desenho, mesmo em área em "U"', () => {
    expect(pontoDeRotulo([quadrado(0, 0, 10), quadrado(100, 100, 40)])).toEqual([120, 120])
    // "U": o centro da caixa cai no vão
    const u: Ponto[] = [[0, 0], [10, 0], [10, 30], [30, 30], [30, 0], [40, 0], [40, 40], [0, 40]]
    const p = pontoDeRotulo([u])
    expect(pontoNoPoligono(p[0], p[1], u)).toBe(true)
    const grupos = unirAreas([
      { id: 'a', contorno: quadrado(0, 0, 10), alvo: 'pilares' },
      { id: 'b', contorno: quadrado(5, 5, 10), alvo: 'laje' },
      { id: 'c', contorno: quadrado(100, 0, 10), alvo: 'vigas' },
    ])
    expect(grupos.map((g) => [g.aneis.length, g.laje])).toEqual([[2, true], [1, false]])
    expect(grupos[1].rotulo).toEqual([105, 5])
  })

  it('desempenho: 12 áreas de traço livre (400 pontos cada), em cadeia, saem em bem menos de um segundo', () => {
    const roda = (cx: number, cy: number, r: number): Ponto[] =>
      Array.from({ length: 400 }, (_, i) => {
        const a = (i / 400) * Math.PI * 2
        // traço de mão: o raio treme um pouco
        const rr = r + Math.sin(i * 1.7) * 3
        return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as Ponto
      })
    const areas = Array.from({ length: 12 }, (_, i) => ({ id: `desempenho-${i}`, contorno: roda(200 + i * 150, 300 + (i % 2) * 60, 100), alvo: 'vigas_laje' }))
    const t0 = performance.now()
    const grupos = unirAreas(areas)
    const ms = performance.now() - t0
    expect(grupos).toHaveLength(1)
    expect(grupos[0].aneis).toHaveLength(12)
    // no PC leva dezenas de ms; o limite largo é para o tablet e para o CI
    expect(ms).toBeLessThan(1500)
  })
})
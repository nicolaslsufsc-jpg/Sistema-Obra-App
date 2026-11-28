// Desenho dos caminhões no PDF do relatório (26/11): recorte, fundo e áreas unidas por caminhão.
import { describe, expect, it } from 'vitest'
import type { Ponto } from './geometria'
import { caminhoFechado, figuraDoDesenho, nivelDoFundo } from './pdf_desenho'
import type { PlantaPavimento } from './planta'

const ret = (x0: number, y0: number, x1: number, y1: number): Ponto[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]
const planta = (extra: Partial<PlantaPavimento> = {}): PlantaPavimento => ({
  id: 'pl',
  revisao: 'R01',
  ref: 'pl@R01',
  trecho: 'Trecho 1',
  titulo: 'Trecho 1',
  largura: 4000,
  altura: 3000,
  elementos: [
    { id: 'p1', tipo: 'P', nome: 'P1', rotulo: [100, 100, 140, 140], polys: [ret(100, 100, 140, 140)] },
    { id: 'p9', tipo: 'P', nome: 'P9', rotulo: [3500, 2500, 3540, 2540], polys: [ret(3500, 2500, 3540, 2540)] },
  ],
  ...extra,
})

describe('desenho do PDF', () => {
  it('sem área nesta planta: sem figura', () => {
    expect(figuraDoDesenho(planta(), [{ sequencia: 1, cor: '#00f', areas: [] }])).toBeNull()
  })

  it('recorta em volta das áreas, une as do mesmo caminhão e traz só as peças do recorte', () => {
    const f = figuraDoDesenho(planta(), [
      { sequencia: 1, cor: '#00f', areas: [{ id: 'a', contorno: ret(80, 80, 300, 300), alvo: 'pilares' }, { id: 'b', contorno: ret(250, 250, 600, 500), alvo: 'laje' }] },
      { sequencia: 2, cor: '#f00', areas: [{ id: 'c', contorno: ret(700, 100, 900, 300), alvo: 'vigas' }] },
      { sequencia: 3, cor: '#0f0', areas: [] },
    ])!
    const [x, y, w, h] = f.recorte
    // dentro da planta, com folga em volta de 80..900 x 80..500
    expect(x).toBe(0)
    expect(y).toBe(0)
    expect(x + w).toBeGreaterThan(900)
    expect(x + w).toBeLessThan(1200)
    expect(y + h).toBeGreaterThan(500)
    expect(f.caminhoes.map((c) => [c.sequencia, c.grupos.length])).toEqual([[1, 1], [2, 1]])
    expect(f.caminhoes[0].grupos[0].aneis).toHaveLength(2)
    expect(f.pecas.map((p) => p.nome)).toEqual(['P1'])
    expect(f.ladrilhos).toEqual([])
  })

  it('planta com fundo: ladrilhos do nível mais detalhado que cabe, só os do recorte, e sem redesenhar as peças', () => {
    const pedidos: string[] = []
    const fundo = { tile: 256, niveis: [-3, -2, -1, 0], url: (z: number, tx: number, ty: number) => (pedidos.push(`${z}/${tx}/${ty}`), `blob:${z}/${tx}/${ty}`) }
    const f = figuraDoDesenho(planta({ fundo }), [{ sequencia: 1, cor: '#00f', areas: [{ id: 'a', contorno: ret(1000, 1000, 2000, 1800) }] }])!
    expect(f.pecas).toEqual([])
    expect(f.ladrilhos.length).toBeGreaterThan(0)
    expect(f.ladrilhos.length).toBeLessThanOrEqual(48)
    const [x, y, w, h] = f.recorte
    for (const l of f.ladrilhos) expect(l.x < x + w && l.x + l.lado > x && l.y < y + h && l.y + l.lado > y).toBe(true)
    // um nível só
    expect(new Set(pedidos.map((s) => s.split('/')[0])).size).toBe(1)
  })

  it('nível do fundo: o de mais detalhe dentro do limite; recorte enorme cai no mais grosso', () => {
    expect(nivelDoFundo([-3, -2, -1, 0], 256, 500, 400)).toBe(0)
    expect(nivelDoFundo([-3, -2, -1, 0], 256, 4000, 3000)).toBe(-2)
    expect(nivelDoFundo([-1, 0], 256, 40000, 30000)).toBe(-1)
  })

  it('caminho SVG fechado', () => {
    expect(caminhoFechado(ret(0, 0, 10, 5))).toBe('M0 0L10 0L10 5L0 5Z')
  })
})

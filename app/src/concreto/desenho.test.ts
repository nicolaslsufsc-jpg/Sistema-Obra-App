// Funções do desenho (26/11): borracha e mover canto.
import { describe, expect, it } from 'vitest'
import { areaNoPonto, cantoPerto, ladosSeCruzam, moverCanto, problemaDoCanto, temCantosEditaveis } from './desenho'
import type { Ponto } from './geometria'

const quadrado = (x: number, y: number, l: number): Ponto[] => [
  [x, y],
  [x + l, y],
  [x + l, y + l],
  [x, y + l],
]

describe('funções do desenho', () => {
  it('borracha: pega a área tocada; uma dentro da outra, a menor; fora de todas, nenhuma', () => {
    const grande = { id: 'g', contorno: quadrado(0, 0, 100) }
    const pequena = { id: 'p', contorno: quadrado(10, 10, 20) }
    const longe = { id: 'l', contorno: quadrado(500, 500, 50) }
    expect(areaNoPonto([grande, pequena, longe], 15, 15)?.id).toBe('p')
    expect(areaNoPonto([grande, pequena, longe], 80, 80)?.id).toBe('g')
    expect(areaNoPonto([grande, pequena, longe], 520, 520)?.id).toBe('l')
    expect(areaNoPonto([grande, pequena, longe], 300, 300)).toBeNull()
  })

  it('canto perto: o mais próximo dentro do alcance', () => {
    const q = quadrado(0, 0, 100)
    expect(cantoPerto(q, 3, 4, 10)).toBe(0)
    expect(cantoPerto(q, 96, 99, 10)).toBe(2)
    expect(cantoPerto(q, 50, 50, 10)).toBe(-1)
  })

  it('mover canto: só aquele canto muda e o original fica como estava', () => {
    const q = quadrado(0, 0, 100)
    const novo = moverCanto(q, 2, [150, 120])
    expect(novo).toEqual([[0, 0], [100, 0], [150, 120], [0, 100]])
    expect(q[2]).toEqual([100, 100])
  })

  it('mover canto (rodada 12): recusa área cruzada, pequena ou achatada numa lasca; aceita a mudança normal', () => {
    const q = quadrado(0, 0, 100)
    // canto de baixo à direita puxado para perto do canto oposto: lasca (4 pontos quase em linha)
    const grande = quadrado(0, 0, 1000)
    expect(problemaDoCanto(grande, moverCanto(grande, 2, [3, 3]), 1)).toBe('fina')
    // canto passado para o outro lado: os lados se cruzam (gravata)
    expect(problemaDoCanto(q, moverCanto(q, 2, [-50, 100]), 1)).toBe('cruza')
    expect(problemaDoCanto(q, moverCanto(q, 1, [0, 150]), 1)).toBe('cruza')
    // canto em cima de outro: área pequena / sem tamanho
    expect(problemaDoCanto(quadrado(0, 0, 10), moverCanto(quadrado(0, 0, 10), 2, [10, 0.5]), 1)).toBe('pequena')
    // mudança normal: aceita
    expect(problemaDoCanto(q, moverCanto(q, 2, [150, 120]), 1)).toBeNull()
    expect(problemaDoCanto(q, moverCanto(q, 2, [60, 60]), 1)).toBeNull()
    // a lasca depende do zoom: a mesma área, vista 4x maior, já tem largura
    const fina = moverCanto(q, 2, [8, 8])
    expect(problemaDoCanto(q, fina, 1)).toBe('fina')
    expect(problemaDoCanto(q, fina, 4)).toBeNull()
    // área que já vinha cruzada (à mão, antiga): mover canto não é recusado por isso
    const gravata: Ponto[] = [[0, 0], [100, 100], [100, 0], [0, 200]]
    expect(problemaDoCanto(gravata, moverCanto(gravata, 0, [-10, 0]), 1)).toBeNull()
  })

  it('lados que se cruzam: fechado e aberto', () => {
    expect(ladosSeCruzam(quadrado(0, 0, 10))).toBe(false)
    expect(ladosSeCruzam([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(true)
    // linha aberta em Z não se cruza; fechando, o último lado cruza
    const z: Ponto[] = [[0, 0], [10, 0], [0, 10], [10, 10]]
    expect(ladosSeCruzam(z, false)).toBe(false)
    expect(ladosSeCruzam(z, true)).toBe(true)
    // linha aberta que volta por cima de si mesma
    expect(ladosSeCruzam([[0, 0], [10, 0], [10, 10], [5, -5]], false)).toBe(true)
    // canto encostado num lado que não é vizinho conta como cruzar
    expect(ladosSeCruzam([[0, 0], [10, 0], [10, 10], [5, 0], [0, 10]])).toBe(true)
  })

  it('cantos editáveis: área de linhas retas sim, traço livre (muitos pontos) não', () => {
    expect(temCantosEditaveis(quadrado(0, 0, 10))).toBe(true)
    expect(temCantosEditaveis(Array.from({ length: 200 }, (_, i) => [i, i * i] as Ponto))).toBe(false)
  })
})

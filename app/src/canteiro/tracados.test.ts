// Mapa do canteiro: caminho com seta, área colorida, duplicar e ordem (frente / trás).
import { describe, expect, it } from 'vitest'
import {
  ALTURA_EM_BRANCO,
  CORES,
  LARGURA,
  aplicar,
  apagar,
  colorir,
  dentroDaArea,
  desfazer,
  distanciaAoCaminho,
  duplicar,
  escalar,
  girar,
  itemNoPonto,
  limparItens,
  mover,
  moverPonto,
  novoHistorico,
  ordemDeDesenho,
  paraFrente,
  paraTras,
  posicionar,
  renomear,
  tracar,
  type Ponto,
} from './logica'

const folha = { largura: LARGURA, altura: ALTURA_EM_BRANCO }
const L: Ponto[] = [[100, 100], [300, 100], [300, 400]]
const TRIANGULO: Ponto[] = [[500, 500], [700, 500], [600, 650]]

describe('traçar caminho e área', () => {
  it('o caminho guarda os pontos tocados, a cor e o centro da caixa dos pontos', () => {
    const [c] = tracar([], 'caminho', L, folha, 'c', 'azul')
    expect(c).toEqual({ id: 'c', tipo: 'caminho', x: 200, y: 250, giro: 0, tamanho: 0, nome: 'Caminho', pontos: L, cor: 'azul' })
  })

  it('caminho precisa de 2 pontos e área de 3; com menos, não cria nada', () => {
    expect(tracar([], 'caminho', [[1, 1]], folha, 'c')).toEqual([])
    expect(tracar([], 'caminho', [[1, 1], [2, 2]], folha, 'c')).toHaveLength(1)
    expect(tracar([], 'area', [[1, 1], [2, 2]], folha, 'a')).toEqual([])
    expect(tracar([], 'area', TRIANGULO, folha, 'a')[0]).toMatchObject({ tipo: 'area', nome: 'Área', cor: CORES[0].id })
  })

  it('ponto fora da folha é trazido para a borda; cor desconhecida vira a primeira', () => {
    const [c] = tracar([], 'caminho', [[-50, 10], [2000, 9999]], folha, 'c', 'rosa-choque')
    expect(c.pontos).toEqual([[0, 10], [LARGURA, ALTURA_EM_BRANCO]])
    expect(c.cor).toBe(CORES[0].id)
  })

  it('arrastar o traçado leva todos os pontos junto', () => {
    const itens = mover(tracar([], 'caminho', L, folha, 'c'), 'c', 250, 300, folha)
    expect(itens[0]).toMatchObject({ x: 250, y: 300, pontos: [[150, 150], [350, 150], [350, 450]] })
  })

  it('arrastar um ponto muda só ele e refaz o centro', () => {
    const itens = moverPonto(tracar([], 'caminho', L, folha, 'c'), 'c', 2, 500, 400, folha)
    expect(itens[0].pontos).toEqual([[100, 100], [300, 100], [500, 400]])
    expect([itens[0].x, itens[0].y]).toEqual([300, 250])
    // índice que não existe: nada muda
    expect(moverPonto(itens, 'c', 9, 1, 1, folha)).toEqual(itens)
  })

  it('muda a cor só de traçado, e só para cor que existe', () => {
    const itens = posicionar(tracar([], 'area', TRIANGULO, folha, 'a'), 'grua', 10, 10, folha, 'g')
    expect(colorir(itens, 'a', 'verde')[0].cor).toBe('verde')
    expect(colorir(itens, 'a', 'rosa-choque')[0].cor).toBe(CORES[0].id)
    expect(colorir(itens, 'g', 'verde')[1].cor).toBeUndefined()
  })

  it('girar e mudar o tamanho não mexem em traçado; renomear e apagar funcionam', () => {
    const itens = tracar([], 'caminho', L, folha, 'c')
    expect(girar(itens, 'c', 45)).toEqual(itens)
    expect(escalar(itens, 'c', 2)).toEqual(itens)
    expect(renomear(itens, 'c', ' Rota do  caminhão ')[0].nome).toBe('Rota do caminhão')
    expect(apagar(itens, 'c')).toEqual([])
  })

  it('desfazer volta o traçado inteiro de uma vez', () => {
    let h = novoHistorico()
    h = aplicar(h, tracar(h.atual, 'area', TRIANGULO, folha, 'a'))
    h = aplicar(h, moverPonto(h.atual, 'a', 0, 400, 400, folha))
    expect(desfazer(h).atual[0].pontos).toEqual(TRIANGULO)
    expect(desfazer(desfazer(h)).atual).toEqual([])
  })
})

describe('toque nos traçados', () => {
  it('distância à linha e ponto dentro da área', () => {
    expect(distanciaAoCaminho(L, 200, 110)).toBeCloseTo(10)
    expect(distanciaAoCaminho(L, 320, 250)).toBeCloseTo(20)
    expect(distanciaAoCaminho(L, 50, 100)).toBeCloseTo(50)
    expect(dentroDaArea(TRIANGULO, 600, 550)).toBe(true)
    expect(dentroDaArea(TRIANGULO, 510, 640)).toBe(false)
  })

  it('o caminho é pego pela linha, com a folga do dedo', () => {
    const itens = tracar([], 'caminho', L, folha, 'c')
    expect(itemNoPonto(itens, 200, 102)?.id).toBe('c')
    expect(itemNoPonto(itens, 200, 120)).toBeUndefined()
    expect(itemNoPonto(itens, 200, 120, 20)?.id).toBe('c')
    // o vão do "L" não é o caminho
    expect(itemNoPonto(itens, 150, 300, 20)).toBeUndefined()
  })

  it('a área é pega por dentro; figura e caminho em cima dela ganham', () => {
    let itens = tracar([], 'area', TRIANGULO, folha, 'a')
    expect(itemNoPonto(itens, 600, 550)?.id).toBe('a')
    expect(itemNoPonto(itens, 400, 550, 20)).toBeUndefined()
    itens = posicionar(itens, 'extintor', 600, 550, folha, 'e')
    expect(itemNoPonto(itens, 600, 550)?.id).toBe('e')
    itens = tracar(apagar(itens, 'e'), 'caminho', [[520, 520], [680, 520]], folha, 'c')
    expect(itemNoPonto(itens, 600, 522, 10)?.id).toBe('c')
    expect(itemNoPonto(itens, 600, 600, 10)?.id).toBe('a')
  })

  it('figura debaixo do dedo ganha do caminho que passa por ela; pela folga, ganha o caminho', () => {
    let itens = tracar([], 'caminho', [[100, 300], [900, 300]], folha, 'c')
    itens = posicionar(itens, 'caminhao_betoneira', 500, 300, folha, 't')
    expect(itemNoPonto(itens, 500, 300, 20)?.id).toBe('t')
    // logo fora da caixa do caminhão (120 de largura): está na linha do caminho
    expect(itemNoPonto(itens, 570, 300, 20)?.id).toBe('c')
  })
})

describe('duplicar e ordem', () => {
  it('a cópia nasce ao lado, igual à original, por cima das outras', () => {
    let itens = posicionar([], 'baia_areia', 300, 200, folha, 'a')
    itens = renomear(girar(itens, 'a', 90), 'a', 'Areia média')
    const dois = duplicar(itens, 'a', 'b', folha)
    expect(dois).toHaveLength(2)
    expect(dois[1]).toEqual({ ...itens[0], id: 'b', x: 330, y: 230 })
    expect(dois[0]).toEqual(itens[0])
    expect(duplicar(itens, 'nao-existe', 'b', folha)).toEqual(itens)
  })

  it('perto da borda a cópia vai para o outro lado e não sai da folha', () => {
    const itens = posicionar([], 'grua', LARGURA - 5, ALTURA_EM_BRANCO - 5, folha, 'a')
    expect(duplicar(itens, 'a', 'b', folha)[1]).toMatchObject({ x: LARGURA - 35, y: ALTURA_EM_BRANCO - 35 })
  })

  it('duplicar um traçado copia os pontos (mexer na cópia não mexe no original)', () => {
    const itens = tracar([], 'caminho', L, folha, 'c', 'verde')
    const dois = duplicar(itens, 'c', 'd', folha)
    expect(dois[1]).toMatchObject({ id: 'd', cor: 'verde', pontos: [[130, 130], [330, 130], [330, 430]] })
    expect(moverPonto(dois, 'd', 0, 0, 0, folha)[0].pontos).toEqual(L)
  })

  it('trazer para a frente e mandar para trás mudam quem é desenhado por cima e quem o toque pega', () => {
    let itens = posicionar([], 'almoxarifado', 500, 300, folha, 'a')
    itens = posicionar(itens, 'deposito_cimento', 500, 300, folha, 'b')
    itens = posicionar(itens, 'refeitorio', 500, 300, folha, 'c')
    expect(ordemDeDesenho(itens).map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(ordemDeDesenho(paraFrente(itens, 'a')).map((i) => i.id)).toEqual(['b', 'c', 'a'])
    expect(ordemDeDesenho(paraTras(itens, 'c')).map((i) => i.id)).toEqual(['c', 'a', 'b'])
    // três do mesmo tamanho empilhadas: o toque pega a de cima
    expect(itemNoPonto(itens, 500, 300)?.id).toBe('c')
    expect(itemNoPonto(paraFrente(itens, 'a'), 500, 300)?.id).toBe('a')
    expect(paraFrente(itens, 'nao-existe')).toEqual(itens)
  })

  it('a ordem vale dentro do grupo: área e setor embaixo, caminho no meio, figura em cima', () => {
    let itens = posicionar([], 'grua', 500, 300, folha, 'g')
    itens = tracar(itens, 'caminho', L, folha, 'c')
    itens = tracar(itens, 'area', TRIANGULO, folha, 'a')
    itens = posicionar(itens, 'setor', 200, 200, folha, 's')
    expect(ordemDeDesenho(itens).map((i) => i.id)).toEqual(['a', 's', 'c', 'g'])
    // "trazer a área para a frente" passa a área na frente do setor, mas nunca da grua
    expect(ordemDeDesenho(paraFrente(itens, 'a')).map((i) => i.id)).toEqual(['s', 'a', 'c', 'g'])
    expect(ordemDeDesenho(paraTras(itens, 'g')).map((i) => i.id)).toEqual(['a', 's', 'c', 'g'])
  })
})

describe('leitura segura dos traçados', () => {
  it('conserta cor e centro; descarta traçado com ponto de menos ou estragado', () => {
    const bruto = [
      { id: 'c', tipo: 'caminho', x: 0, y: 0, giro: 30, tamanho: 9, nome: 'Rota', pontos: L, cor: 'cor-que-saiu' },
      { id: 'd', tipo: 'caminho', nome: '', pontos: [[1, 1]] },
      { id: 'e', tipo: 'area', nome: '', pontos: [[1, 1], [2, 'x'], [3, 3], null] },
      { id: 'f', tipo: 'area', nome: 'Estoque', pontos: [...TRIANGULO, [1, 2, 3]], cor: 'verde' },
    ]
    expect(limparItens(bruto)).toEqual([
      { id: 'c', tipo: 'caminho', x: 200, y: 250, giro: 0, tamanho: 0, nome: 'Rota', pontos: L, cor: CORES[0].id },
      { id: 'f', tipo: 'area', x: 600, y: 575, giro: 0, tamanho: 0, nome: 'Estoque', pontos: TRIANGULO, cor: 'verde' },
    ])
  })
})

// Mapa do canteiro: posicionar, mover, girar, tamanho, renomear, apagar, desfazer, toque e vista.
import { describe, expect, it } from 'vitest'
import { FIGURAS, figuraPorId } from './figuras'
import {
  ALTURA_EM_BRANCO,
  LARGURA,
  PASSOS_MAX,
  TAMANHO_MAX,
  TAMANHO_MIN,
  ajustarVista,
  alturaDoItem,
  apagar,
  aplicar,
  arrastarVista,
  desfazer,
  doItem,
  escalar,
  folhaDe,
  girar,
  girarPara,
  giroParaOPonto,
  itemNoPonto,
  limparItens,
  mover,
  noItem,
  novoHistorico,
  ordemDeDesenho,
  podeDesfazer,
  posicionar,
  redimensionar,
  renomear,
  tamanhoParaOPonto,
  telaParaFolha,
  zoomNoPonto,
} from './logica'

const folha = { largura: LARGURA, altura: ALTURA_EM_BRANCO }

describe('posicionar e mover', () => {
  it('a figura entra no ponto tocado, com o nome e o tamanho dela, sem giro', () => {
    const itens = posicionar([], 'grua', 300, 200, folha, 'a')
    expect(itens).toEqual([{ id: 'a', tipo: 'grua', x: 300, y: 200, giro: 0, tamanho: figuraPorId('grua')!.tamanho, nome: 'Grua' }])
  })

  it('não mexe na lista anterior (é o que o desfazer guarda)', () => {
    const antes = posicionar([], 'grua', 300, 200, folha, 'a')
    const depois = mover(antes, 'a', 500, 400, folha)
    expect(antes[0].x).toBe(300)
    expect(depois[0]).toMatchObject({ x: 500, y: 400 })
  })

  it('o centro nunca sai da folha', () => {
    const itens = posicionar([], 'tapume', -50, 9999, folha, 'a')
    expect(itens[0]).toMatchObject({ x: 0, y: ALTURA_EM_BRANCO })
    expect(mover(itens, 'a', 5000, -3, folha)[0]).toMatchObject({ x: LARGURA, y: 0 })
  })

  it('figura que não existe não entra; item que não existe não muda nada', () => {
    expect(posicionar([], 'disco_voador', 10, 10, folha, 'a')).toEqual([])
    const itens = posicionar([], 'grua', 10, 10, folha, 'a')
    expect(mover(itens, 'outro', 99, 99, folha)).toEqual(itens)
  })
})

describe('girar, tamanho, renomear e apagar', () => {
  const base = posicionar([], 'caminhao_betoneira', 100, 100, folha, 'a')

  it('gira somando graus e dá a volta em 360', () => {
    expect(girar(base, 'a', 15)[0].giro).toBe(15)
    expect(girar(base, 'a', -15)[0].giro).toBe(345)
    expect(girar(girarPara(base, 'a', 350), 'a', 15)[0].giro).toBe(5)
    expect(girarPara(base, 'a', 720)[0].giro).toBe(0)
  })

  it('o tamanho fica entre o mínimo e o máximo', () => {
    expect(redimensionar(base, 'a', 200)[0].tamanho).toBe(200)
    expect(redimensionar(base, 'a', 1)[0].tamanho).toBe(TAMANHO_MIN)
    expect(redimensionar(base, 'a', 99999)[0].tamanho).toBe(TAMANHO_MAX)
    expect(redimensionar(base, 'a', NaN)[0].tamanho).toBe(base[0].tamanho)
    expect(escalar(base, 'a', 1.2)[0].tamanho).toBe(Math.round(base[0].tamanho * 1.2))
  })

  it('a altura segue a proporção da figura', () => {
    const f = figuraPorId('caminhao_betoneira')!
    expect(alturaDoItem(base[0])).toBeCloseTo((base[0].tamanho * f.vb[1]) / f.vb[0])
  })

  it('renomeia tirando espaço sobrando e cortando em 40 letras', () => {
    expect(renomear(base, 'a', '  Setor   A  ')[0].nome).toBe('Setor A')
    expect(renomear(base, 'a', 'x'.repeat(90))[0].nome).toHaveLength(40)
    expect(renomear(base, 'a', '')[0].nome).toBe('')
  })

  it('apaga só o item pedido', () => {
    const dois = posicionar(base, 'grua', 200, 200, folha, 'b')
    expect(apagar(dois, 'a').map((i) => i.id)).toEqual(['b'])
  })
})

describe('desfazer', () => {
  it('volta um passo de cada vez até a folha vazia', () => {
    let h = novoHistorico()
    expect(podeDesfazer(h)).toBe(false)
    h = aplicar(h, posicionar(h.atual, 'grua', 100, 100, folha, 'a'))
    h = aplicar(h, girar(h.atual, 'a', 90))
    h = aplicar(h, mover(h.atual, 'a', 400, 300, folha))
    expect(h.atual[0]).toMatchObject({ x: 400, y: 300, giro: 90 })
    h = desfazer(h)
    expect(h.atual[0]).toMatchObject({ x: 100, y: 100, giro: 90 })
    h = desfazer(h)
    expect(h.atual[0].giro).toBe(0)
    h = desfazer(h)
    expect(h.atual).toEqual([])
    expect(podeDesfazer(h)).toBe(false)
    expect(desfazer(h)).toBe(h)
  })

  it('desfazer um apagar traz a figura de volta', () => {
    let h = novoHistorico(posicionar([], 'betoneira', 50, 50, folha, 'a'))
    h = aplicar(h, apagar(h.atual, 'a'))
    expect(h.atual).toEqual([])
    expect(desfazer(h).atual.map((i) => i.id)).toEqual(['a'])
  })

  it('passo que não muda nada não entra no histórico', () => {
    const h = novoHistorico(posicionar([], 'grua', 100, 100, folha, 'a'))
    expect(aplicar(h, mover(h.atual, 'a', 100, 100, folha))).toBe(h)
  })

  it('guarda no máximo PASSOS_MAX passos', () => {
    let h = novoHistorico(posicionar([], 'grua', 0, 0, folha, 'a'))
    for (let n = 1; n <= PASSOS_MAX + 20; n++) h = aplicar(h, mover(h.atual, 'a', n, 0, folha))
    expect(h.passado).toHaveLength(PASSOS_MAX)
    expect(h.atual[0].x).toBe(PASSOS_MAX + 20)
  })
})

describe('toque', () => {
  const tapume = { id: 't', tipo: 'tapume', x: 500, y: 300, giro: 90, tamanho: 200, nome: '' }

  it('ida e volta entre a folha e a caixa do item girado', () => {
    const [lx, ly] = noItem(tapume, 500, 380)
    expect(lx).toBeCloseTo(80)
    expect(ly).toBeCloseTo(0)
    const [x, y] = doItem(tapume, 80, 0)
    expect(x).toBeCloseTo(500)
    expect(y).toBeCloseTo(380)
  })

  it('acha o item pelo toque respeitando o giro', () => {
    // tapume de 200 x 68 girado 90°: ocupa 68 de largura e 200 de altura
    expect(itemNoPonto([tapume], 500, 390)?.id).toBe('t')
    expect(itemNoPonto([tapume], 590, 300)).toBeUndefined()
    // com folga, o dedo pega perto da borda
    expect(itemNoPonto([tapume], 540, 300, 10)?.id).toBe('t')
  })

  it('o de cima ganha, e o setor fica por baixo de tudo', () => {
    const setor = { id: 's', tipo: 'setor', x: 500, y: 300, giro: 0, tamanho: 400, nome: 'Setor A' }
    const grua = { id: 'g', tipo: 'grua', x: 500, y: 300, giro: 0, tamanho: 100, nome: 'Grua' }
    // mesmo com o setor colocado depois, a grua é desenhada por cima e é ela que o toque pega
    expect(ordemDeDesenho([grua, setor]).map((i) => i.id)).toEqual(['s', 'g'])
    expect(itemNoPonto([grua, setor], 500, 300)?.id).toBe('g')
    expect(itemNoPonto([grua, setor], 330, 300)?.id).toBe('s')
  })

  it('figuras pequenas juntas: o toque pega a que está debaixo do dedo, não a vizinha de cima', () => {
    // achado no uso de 26/11: extintor, ponto de água e quadro de energia lado a lado; o quadro, colocado
    // por último, cobria com a folga o centro do extintor e era ele que o toque pegava
    const extintor = { id: 'e', tipo: 'extintor', x: 250, y: 200, giro: 0, tamanho: 40, nome: '' }
    const quadro = { id: 'q', tipo: 'quadro_energia', x: 270, y: 230, giro: 0, tamanho: 45, nome: '' }
    const setor = { id: 's', tipo: 'setor', x: 250, y: 180, giro: 0, tamanho: 220, nome: '' }
    const todos = [setor, extintor, quadro]
    expect(itemNoPonto(todos, 250, 200, 37)?.id).toBe('e')
    expect(itemNoPonto(todos, 270, 230, 37)?.id).toBe('q')
    // dentro das duas caixas: ganha a menor
    const grua = { id: 'g', tipo: 'grua', x: 250, y: 200, giro: 0, tamanho: 150, nome: '' }
    expect(itemNoPonto([extintor, grua], 250, 200)?.id).toBe('e')
    // só pela folga: a de centro mais perto
    expect(itemNoPonto([extintor, quadro], 300, 200, 37)?.id).toBe('q')
    expect(itemNoPonto([extintor, quadro], 222, 200, 37)?.id).toBe('e')
    // o setor só quando nenhuma figura foi pega
    expect(itemNoPonto(todos, 160, 150, 10)?.id).toBe('s')
  })

  it('alça de girar: aponta o topo para o dedo e encaixa de 15 em 15 graus', () => {
    const i = { ...tapume, giro: 0 }
    expect(giroParaOPonto(i, 500, 100)).toBe(0) // dedo em cima
    expect(giroParaOPonto(i, 700, 300)).toBe(90) // dedo à direita
    expect(giroParaOPonto(i, 500, 600)).toBe(180)
    expect(giroParaOPonto(i, 300, 300)).toBe(270)
    expect(giroParaOPonto(i, 700, 290)).toBe(90) // 87° encaixa em 90
    expect(giroParaOPonto(i, 700, 150)).toBe(53) // longe de múltiplo de 15: fica como está
  })

  it('alça de tamanho: o canto acompanha o dedo', () => {
    const i = { id: 's', tipo: 'setor', x: 500, y: 300, giro: 0, tamanho: 100, nome: '' }
    // canto atual em (550, 330); dedo no dobro da distância = dobro do tamanho
    expect(tamanhoParaOPonto(i, 600, 360)).toBe(200)
    expect(tamanhoParaOPonto(i, 500, 300)).toBe(TAMANHO_MIN)
  })
})

describe('vista', () => {
  it('a folha inteira cabe na tela, centralizada', () => {
    const v = ajustarVista(folha, 375, 400, 0)
    expect(v.k).toBeCloseTo(0.375)
    expect(v.x).toBeCloseTo(0)
    // sobra altura: a folha fica no meio
    expect(telaParaFolha(v, 0, 200)[1]).toBeCloseTo(ALTURA_EM_BRANCO / 2)
  })

  it('o zoom mantém parado o ponto debaixo do dedo e respeita os limites', () => {
    const v = ajustarVista(folha, 768, 600)
    const antes = telaParaFolha(v, 200, 150)
    const z = zoomNoPonto(v, 2, 200, 150, 0.1, 10)
    expect(z.k).toBeCloseTo(v.k * 2)
    const depois = telaParaFolha(z, 200, 150)
    expect(depois[0]).toBeCloseTo(antes[0])
    expect(depois[1]).toBeCloseTo(antes[1])
    expect(zoomNoPonto(v, 1000, 0, 0, 0.1, 10).k).toBe(10)
    expect(zoomNoPonto(v, 0.0001, 0, 0, 0.1, 10).k).toBe(0.1)
  })

  it('arrastar leva a folha junto com o dedo', () => {
    const v = { x: 100, y: 100, k: 2 }
    expect(arrastarVista(v, 20, -10)).toEqual({ x: 90, y: 105, k: 2 })
  })

  it('a folha segue a proporção da planta, sempre com 1000 de largura', () => {
    expect(folhaDe(2048, 1280)).toEqual({ largura: 1000, altura: 625 })
    expect(folhaDe(0, 0)).toEqual({ largura: 1000, altura: ALTURA_EM_BRANCO })
  })
})

describe('leitura segura', () => {
  it('descarta o que não é item válido e conserta o resto', () => {
    const bruto = [
      { id: 'a', tipo: 'grua', x: 1, y: 2, giro: 450, tamanho: 5, nome: 'Grua 1' },
      { id: 'a', tipo: 'grua', x: 1, y: 2, giro: 0, tamanho: 50, nome: 'repetido' },
      { id: 'b', tipo: 'figura_antiga', x: 1, y: 2, giro: 0, tamanho: 50, nome: '' },
      { id: 'c', tipo: 'grua', x: 'x', y: 2, giro: 0, tamanho: 50, nome: '' },
      null,
      'texto',
    ]
    expect(limparItens(bruto)).toEqual([{ id: 'a', tipo: 'grua', x: 1, y: 2, giro: 90, tamanho: TAMANHO_MIN, nome: 'Grua 1' }])
    expect(limparItens(undefined)).toEqual([])
    expect(limparItens({})).toEqual([])
  })
})

describe('figuras', () => {
  it('tem todas as figuras pedidas, com id único, nome e desenho', () => {
    const pedidas = [
      'caminhao_betoneira', 'bomba_concreto', 'cacamba_entulho', 'grua', 'guincho', 'betoneira', 'andaime', 'baia_areia',
      'baia_brita', 'deposito_cimento', 'almoxarifado', 'container_escritorio', 'vestiario', 'refeitorio', 'portao', 'tapume',
      'extintor', 'ponto_agua', 'quadro_energia', 'central_aco', 'central_formas', 'area_descarga', 'setor',
    ]
    expect(FIGURAS.map((f) => f.id).sort()).toEqual([...pedidas].sort())
    for (const f of FIGURAS) {
      expect(f.nome.length, f.id).toBeGreaterThan(2)
      expect(f.svg, f.id).toMatch(/^<(path|rect|ellipse|circle)/)
      expect(f.vb[0] > 0 && f.vb[1] > 0 && f.tamanho >= TAMANHO_MIN, f.id).toBe(true)
      // desenho próprio, fechado em si: nada de imagem, endereço de fora ou script
      expect(f.svg, f.id).not.toMatch(/<image|href|<script|url\(|http/i)
    }
  })
})

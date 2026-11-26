// Barras de aço da laje (plano A do Nicolas, 18/11/2026). Ficha e barras fictícias da obra EXE.
import { describe, expect, it } from 'vitest'
import {
  camadaDoTrecho,
  barraNaArea,
  barrasDaArea,
  barraTocada,
  camadasDoPacote,
  corremJuntas,
  gruposDeBarras,
  JUNTAS_CM,
  pontosDeCm,
  itemDasBarras,
  observacaoDaBarra,
  observacaoDasErradas,
  resultadoPelasBarras,
  resumoDasBarras,
  situacaoDaBarra,
  type BarraPacote,
} from './barras'
import type { EventoFvs, Ficha, Resultado } from './situacao'

const LAJE: Ficha = {
  id: 'f-exe-laj',
  codigo: 'EXE-PVS-010',
  titulo: 'Laje (Obra Exemplo)',
  revisao: '0',
  aplica_a: ['L'],
  itens: [
    { n: 1, etapa: 'INÍCIO', titulo: 'Projeto na mão' },
    { n: 3, etapa: 'EXECUÇÃO', titulo: 'Armadura da laje', barras: true },
  ],
}

let seq = 0
function ev(resultado: Resultado | null, observacao: string | null = null): EventoFvs {
  seq++
  return {
    id: `e${String(seq).padStart(4, '0')}`,
    elemento_id: 'b1',
    ficha_id: LAJE.id,
    item: 3,
    resultado,
    rodada: 1,
    observacao,
    lote_id: null,
    planta_id: null,
    usuario_id: 'u',
    criado_em_dispositivo: `2026-11-18T10:00:${String(seq % 60).padStart(2, '0')}.${String(seq).padStart(3, '0')}Z`,
  }
}

// Duas lajes lado a lado: A de x 0 a 100, B de x 100 a 200 (y de 0 a 100).
const A: Array<[number, number]> = [[0, 0], [100, 0], [100, 100], [0, 100]]
const B: Array<[number, number]> = [[100, 0], [200, 0], [200, 100], [100, 100]]

const BARRAS: Record<string, BarraPacote> = {
  dentroA: { camada: 'longitudinal_inferior', linha: [[10, 20], [90, 20]], posicao: 'N1' },
  cruzaAB: { camada: 'longitudinal_inferior', linha: [[50, 50], [150, 50]], posicao: 'N2' },
  atravessaA: { camada: 'transversal_superior', linha: [[50, -20], [50, 120]], posicao: 'N3' },
  fora: { camada: 'longitudinal_inferior', linha: [[10, 300], [90, 300]] },
}

describe('barras na área de laje', () => {
  it('conta a barra com ponto dentro e a que só cruza a borda', () => {
    expect(barraNaArea(BARRAS.dentroA.linha, A)).toBe(true)
    expect(barraNaArea(BARRAS.atravessaA.linha, A)).toBe(true)
    expect(barraNaArea(BARRAS.fora.linha, A)).toBe(false)
  })

  it('barra que cruza duas lajes conta nas duas', () => {
    expect(barrasDaArea(BARRAS, A).sort()).toEqual(['atravessaA', 'cruzaAB', 'dentroA'])
    expect(barrasDaArea(BARRAS, B)).toEqual(['cruzaAB'])
  })

  it('filtra por camada', () => {
    expect(barrasDaArea(BARRAS, A, 'transversal_superior')).toEqual(['atravessaA'])
  })

  it('as camadas do pacote saem na ordem das pranchas', () => {
    expect(camadasDoPacote(BARRAS)).toEqual(['transversal_superior', 'longitudinal_inferior'])
    expect(camadasDoPacote(undefined)).toEqual([])
  })
})

describe('toque na barra', () => {
  const paralelas: Record<string, BarraPacote> = {
    b1: { camada: 'longitudinal_inferior', linha: [[0, 0], [100, 0]] },
    b2: { camada: 'longitudinal_inferior', linha: [[0, 10], [100, 10]] },
    outra: { camada: 'transversal_inferior', linha: [[0, 1], [100, 1]] },
  }

  it('pega a mais perto dentro da margem, só da camada ativa', () => {
    expect(barraTocada([50, 2], paralelas, 'longitudinal_inferior', 6, 1)).toEqual({ id: 'b1', grupo: ['b1'] })
    expect(barraTocada([50, 8], paralelas, 'longitudinal_inferior', 6, 1)).toEqual({ id: 'b2', grupo: ['b2'] })
    expect(barraTocada([50, 1], paralelas, 'transversal_inferior', 6, 1)).toEqual({ id: 'outra', grupo: ['outra'] })
  })

  it('longe de tudo não pega nada', () => {
    expect(barraTocada([50, 40], paralelas, 'longitudinal_inferior', 6, 1)).toBeNull()
  })

  it('no meio de duas barras não escolhe: pede zoom', () => {
    expect(barraTocada([50, 5], paralelas, 'longitudinal_inferior', 6, 1)).toEqual({ ambiguo: true })
  })
})

// Achado #5 da lista de campo (24/11), o Nicolas: "se tem duas barras muito próximas, elas são juntas. Então a
// pessoa dá um clique e já confira as duas. Se o negócio ficar dando zoom, tá só perdendo tempo."
describe('barras juntas', () => {
  // 1:50: 7 cm de obra = 3,97 pontos da folha
  const tol = pontosDeCm(JUNTAS_CM, 50)
  const L = 'longitudinal_inferior' as const

  it('7 cm de obra em pontos da folha, pela escala da prancha', () => {
    expect(tol).toBeCloseTo(3.97, 2)
    expect(pontosDeCm(7, 25)).toBeCloseTo(2 * tol, 6)
  })

  it('correm juntas: perto em pelo menos 60% do comprimento da mais curta', () => {
    expect(corremJuntas([[0, 0], [100, 0]], [[0, 3], [100, 3]], tol)).toBe(true)
    // longe demais (8 cm)
    expect(corremJuntas([[0, 0], [100, 0]], [[0, 4.6], [100, 4.6]], tol)).toBe(false)
    // a curta inteira ao lado da longa (emenda por traspasse): juntas
    expect(corremJuntas([[40, 2], [70, 2]], [[0, 0], [200, 0]], tol)).toBe(true)
    // só se cruzam numa ponta (40% do comprimento): não
    expect(corremJuntas([[0, 2], [100, 2]], [[60, 0], [300, 0]], tol)).toBe(false)
    // em cruz: não
    expect(corremJuntas([[0, 50], [100, 50]], [[50, 0], [50, 100]], tol)).toBe(false)
  })

  it('grupos por camada, transitivos; barra sozinha fica de fora', () => {
    const barras: Record<string, BarraPacote> = {
      a: { camada: L, linha: [[0, 0], [100, 0]] },
      b: { camada: L, linha: [[0, 3], [100, 3]] },
      c: { camada: L, linha: [[0, 6], [100, 6]] },
      longe: { camada: L, linha: [[0, 30], [100, 30]] },
      outra_camada: { camada: 'transversal_inferior', linha: [[0, 1], [100, 1]] },
    }
    const g = gruposDeBarras(barras, tol)
    expect(g.get('a')).toEqual(['a', 'b', 'c'])
    expect(g.get('c')).toBe(g.get('a'))
    expect(g.has('longe')).toBe(false)
    expect(g.has('outra_camada')).toBe(false)
  })

  it('o toque pega o grupo inteiro, sem pedir zoom; outra barra perto, fora do grupo, ainda pede', () => {
    const barras: Record<string, BarraPacote> = {
      b1: { camada: L, linha: [[0, 0], [100, 0]] },
      b2: { camada: L, linha: [[0, 3], [100, 3]] },
      solta: { camada: L, linha: [[0, 11], [30, 11]] },
    }
    const g = gruposDeBarras(barras, tol)
    expect(barraTocada([50, 1.5], barras, L, 6, 1, g)).toEqual({ id: 'b1', grupo: ['b1', 'b2'] })
    // sem os grupos, o mesmo toque pedia zoom (como antes)
    expect(barraTocada([50, 1.5], barras, L, 6, 1)).toEqual({ ambiguo: true })
    // entre o grupo e uma barra solta, a 7 de cada uma: pede zoom
    expect(barraTocada([20, 7], barras, L, 6, 1, g)).toEqual({ ambiguo: true })
  })

  it('muitas barras: a varredura não compara todas com todas e acha os pares', () => {
    const barras: Record<string, BarraPacote> = {}
    for (let i = 0; i < 2000; i++) {
      const y = Math.floor(i / 2) * 20 + (i % 2) * 2 // pares a 2 pontos, 20 entre os pares
      barras[`b${String(i).padStart(4, '0')}`] = { camada: L, linha: [[0, y], [400, y]] }
    }
    const t0 = performance.now()
    const g = gruposDeBarras(barras, tol)
    expect(performance.now() - t0).toBeLessThan(2000)
    expect(new Set(g.values()).size).toBe(1000)
  })
})

describe('item de armadura da laje', () => {
  it('é achado pela marca no dado da ficha', () => {
    expect(itemDasBarras(LAJE)?.n).toBe(3)
    expect(itemDasBarras({ ...LAJE, itens: [LAJE.itens[0]] })).toBeUndefined()
  })

  it('situação da barra: o registro mais novo', () => {
    expect(situacaoDaBarra([])).toBe('nada')
    expect(situacaoDaBarra([ev('C')])).toBe('liberado')
    expect(situacaoDaBarra([ev('C'), ev('NC', 'faltou')])).toBe('reprovado')
    expect(situacaoDaBarra([ev('NC'), ev(null)])).toBe('nada')
    expect(observacaoDaBarra([ev('C'), ev('NC', 'bitola trocada')])).toBe('bitola trocada')
    expect(observacaoDaBarra([ev('NC', 'x'), ev('C')])).toBeNull()
  })

  it('todas OK dá C; alguma errada NC; alguma sem conferir pendente', () => {
    expect(resultadoPelasBarras([])).toBeNull()
    expect(resultadoPelasBarras(['liberado', 'liberado'])).toBe('C')
    expect(resultadoPelasBarras(['liberado', 'nada'])).toBeNull()
    expect(resultadoPelasBarras(['nada', 'reprovado'])).toBe('NC')
  })

  it('resumo e observação para a pessoa', () => {
    expect(resumoDasBarras(['liberado', 'nada', 'reprovado']).texto).toBe('Barras: 1 de 3 OK, 1 errada')
    expect(resumoDasBarras(['liberado']).texto).toBe('Barras: 1 de 1 OK')
    expect(observacaoDasErradas([{ barra: BARRAS.dentroA, obs: 'faltou uma' }])).toBe('Barra errada: N1 (long. inf.): faltou uma')
    expect(observacaoDasErradas([{ barra: BARRAS.fora, obs: null }, { barra: BARRAS.atravessaA, obs: null }])).toBe(
      'Barras erradas: barra sem posição (long. inf.); N3 (transv. sup.)',
    )
    expect(observacaoDasErradas([])).toBeNull()
  })
})

describe('planta de armadura (20/11)', () => {
  it('acha a direção pelo nome do setor', () => {
    expect(camadaDoTrecho('Armadura longitudinal inferior')).toBe('longitudinal_inferior')
    expect(camadaDoTrecho('Armadura transversal superior')).toBe('transversal_superior')
    expect(camadaDoTrecho('Trecho 1')).toBeUndefined()
  })
})

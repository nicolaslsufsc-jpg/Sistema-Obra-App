// Barras de aço da laje (plano A do Nicolas, 18/11/2026). Ficha e barras fictícias da obra EXE.
import { describe, expect, it } from 'vitest'
import {
  camadaDoTrecho,
  barraNaArea,
  barrasDaArea,
  barraTocada,
  camadasDoPacote,
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
    expect(barraTocada([50, 2], paralelas, 'longitudinal_inferior', 6, 1)).toEqual({ id: 'b1' })
    expect(barraTocada([50, 8], paralelas, 'longitudinal_inferior', 6, 1)).toEqual({ id: 'b2' })
    expect(barraTocada([50, 1], paralelas, 'transversal_inferior', 6, 1)).toEqual({ id: 'outra' })
  })

  it('longe de tudo não pega nada', () => {
    expect(barraTocada([50, 40], paralelas, 'longitudinal_inferior', 6, 1)).toBeNull()
  })

  it('no meio de duas barras não escolhe: pede zoom', () => {
    expect(barraTocada([50, 5], paralelas, 'longitudinal_inferior', 6, 1)).toEqual({ ambiguo: true })
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

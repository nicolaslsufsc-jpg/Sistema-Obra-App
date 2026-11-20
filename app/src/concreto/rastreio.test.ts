// Rastreio do concreto para a FVS (rastreio.ts): que caminhões levaram cada peça e a regra do item.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { Linha } from '../nucleo/banco_local'
import { banco, sincronizador } from '../nucleo/servicos'
import { registrarPecas } from './dados'
import {
  caminhoesDasLajes,
  caminhoesDasPecas,
  montarRastreio,
  montarRastreioDasLajes,
  situacaoDoRastreio,
  type AreaDeLajeFvs,
  type CaminhaoDaPeca,
  type LinhasDoRastreio,
  type LinhasDoRastreioDaLaje,
} from './rastreio'

const OBRA = 'b0000000-0000-0000-0000-0000000000f1'
let relogio = 0
function linha(campos: Record<string, unknown>): Linha {
  relogio++
  return {
    id: `id-${relogio}`,
    obra_id: OBRA,
    usuario_id: 'u',
    dispositivo_id: 'd',
    criado_em_dispositivo: new Date(Date.UTC(2026, 10, 19, 10, 0, relogio)).toISOString(),
    apagado: false,
    ...campos,
  }
}
const conc = (id: string, data: string, extra: Record<string, unknown> = {}) => linha({ id, data, substitui_id: null, cancelado: false, ...extra })
const cam = (id: string, concretagem_id: string, sequencia: number, nota_fiscal: string | null, extra: Record<string, unknown> = {}) =>
  linha({ id, concretagem_id, sequencia, nota_fiscal, substitui_id: null, cancelado: false, ...extra })
const peca = (caminhao_id: string, elemento_id: string, origem: 'desenho' | 'manual', fracao: number | null, incluido = true) =>
  linha({ caminhao_id, elemento_id, origem, fracao, incluido })
const elem = (id: string, tipo: string) => linha({ id, tipo, nome: id.toUpperCase() })

const ELEMENTOS = [elem('p1', 'P'), elem('p2', 'P'), elem('v1', 'V'), elem('l1', 'L')]
const base = (parcial: Partial<LinhasDoRastreio>): LinhasDoRastreio => ({
  concretagens: [],
  caminhoes: [],
  caminhao_elementos: [],
  elementos: ELEMENTOS,
  exemplos: new Set(),
  ...parcial,
})

describe('rastreio do concreto (FVS)', () => {
  it('peça com 1 caminhão dá C, com sequência, NF e data; NF vazia vem como null', () => {
    const r = montarRastreio(
      base({
        concretagens: [conc('c1', '2026-11-17')],
        caminhoes: [cam('k1', 'c1', 2, '184202'), cam('k2', 'c1', 3, '  ')],
        caminhao_elementos: [peca('k1', 'p1', 'desenho', 1), peca('k2', 'v1', 'desenho', 1)],
      }),
    )
    expect(r.get('p1')).toEqual([
      { caminhao_raiz: 'k1', concretagem_raiz: 'c1', sequencia: 2, nota_fiscal: '184202', data: '2026-11-17', fracao: 1, parcial: false },
    ])
    expect(situacaoDoRastreio(r.get('p1')!)).toEqual({ resultado: 'C', parcial: false })
    expect(r.get('v1')![0].nota_fiscal).toBeNull()
    expect(situacaoDoRastreio(r.get('v1')!).resultado).toBe('C')
  })

  it('peça sem caminhão fica pendente (null), nunca NC', () => {
    const r = montarRastreio(base({ concretagens: [conc('c1', '2026-11-17')], caminhoes: [cam('k1', 'c1', 1, '1')] }))
    expect(r.has('p2')).toBe(false)
    expect(situacaoDoRastreio(r.get('p2') ?? [])).toEqual({ resultado: null, parcial: false })
  })

  it('peça tirada do caminhão à mão volta a pendente', () => {
    const r = montarRastreio(
      base({
        concretagens: [conc('c1', '2026-11-17')],
        caminhoes: [cam('k1', 'c1', 1, '1')],
        caminhao_elementos: [peca('k1', 'p1', 'desenho', 1), peca('k1', 'p1', 'manual', null, false)],
      }),
    )
    expect(r.has('p1')).toBe(false)
  })

  it('caminhão cancelado não conta', () => {
    const k1 = cam('k1', 'c1', 1, '1')
    const r = montarRastreio(
      base({
        concretagens: [conc('c1', '2026-11-17')],
        caminhoes: [k1, cam('k1b', 'c1', 1, '1', { substitui_id: 'k1', cancelado: true })],
        caminhao_elementos: [peca('k1', 'p1', 'desenho', 1)],
      }),
    )
    expect(r.size).toBe(0)
  })

  it('concretagem cancelada não conta, mesmo com o caminhão vigente', () => {
    const r = montarRastreio(
      base({
        concretagens: [conc('c1', '2026-11-17'), conc('c1b', '2026-11-17', { substitui_id: 'c1', cancelado: true })],
        caminhoes: [cam('k1', 'c1', 1, '1')],
        caminhao_elementos: [peca('k1', 'p1', 'desenho', 1)],
      }),
    )
    expect(r.size).toBe(0)
  })

  it('concretagem de EXEMPLO não conta', () => {
    const r = montarRastreio(
      base({
        concretagens: [conc('cx', '2026-11-17')],
        caminhoes: [cam('k1', 'cx', 1, '1')],
        caminhao_elementos: [peca('k1', 'p1', 'desenho', 1)],
        exemplos: new Set(['cx']),
      }),
    )
    expect(r.size).toBe(0)
  })

  it('parcial: 0,5 num caminhão avisa; 0,5 + 0,5 em dois caminhões fecha a peça; à mão vale inteira', () => {
    const r = montarRastreio(
      base({
        concretagens: [conc('c1', '2026-11-17')],
        caminhoes: [cam('k1', 'c1', 1, '1'), cam('k2', 'c1', 2, '2')],
        caminhao_elementos: [
          peca('k1', 'p1', 'desenho', 0.5),
          peca('k1', 'v1', 'desenho', 0.5),
          peca('k2', 'v1', 'desenho', 0.5),
          peca('k1', 'p2', 'desenho', 0.4),
          peca('k1', 'p2', 'manual', null, true),
        ],
      }),
    )
    expect(r.get('p1')![0].parcial).toBe(true)
    expect(situacaoDoRastreio(r.get('p1')!)).toEqual({ resultado: 'C', parcial: true })
    expect(r.get('v1')!.map((c) => c.parcial)).toEqual([true, true])
    expect(situacaoDoRastreio(r.get('v1')!)).toEqual({ resultado: 'C', parcial: false })
    expect(r.get('p2')![0]).toMatchObject({ fracao: null, parcial: false })
    expect(situacaoDoRastreio(r.get('p2')!)).toEqual({ resultado: 'C', parcial: false })
  })

  it('ordem por data e depois por sequência; NF corrigida mostra a versão vigente', () => {
    const r = montarRastreio(
      base({
        concretagens: [conc('c2', '2026-11-18'), conc('c1', '2026-11-17')],
        caminhoes: [
          cam('k3', 'c2', 1, '30'),
          cam('k2', 'c1', 2, '20'),
          cam('k1', 'c1', 1, '10'),
          cam('k1b', 'c1', 1, '11', { substitui_id: 'k1' }),
        ],
        caminhao_elementos: [peca('k3', 'v1', 'desenho', 1), peca('k2', 'v1', 'desenho', 1), peca('k1', 'v1', 'desenho', 1)],
      }),
    )
    const lista = r.get('v1')!
    expect(lista.map((c) => [c.data, c.sequencia, c.nota_fiscal])).toEqual([
      ['2026-11-17', 1, '11'],
      ['2026-11-17', 2, '20'],
      ['2026-11-18', 1, '30'],
    ])
    expect(lista[0].caminhao_raiz).toBe('k1')
  })

  it('só pilar e viga: a laje fica de fora por enquanto', () => {
    const r = montarRastreio(
      base({
        concretagens: [conc('c1', '2026-11-17')],
        caminhoes: [cam('k1', 'c1', 1, '1')],
        caminhao_elementos: [peca('k1', 'l1', 'manual', null), peca('k1', 'p1', 'desenho', 1), peca('k1', 'v1', 'desenho', 1)],
      }),
    )
    expect([...r.keys()].sort()).toEqual(['p1', 'v1'])
  })

  it('obra sem nada do Concreto no aparelho: Map vazio, sem erro', async () => {
    const vazio: Map<string, CaminhaoDaPeca[]> = await caminhoesDasPecas('b0000000-0000-0000-0000-0000000000f9')
    expect(vazio.size).toBe(0)
  })

  it('a chave é o id da peça em "elementos" (o mesmo da planta da FVS) e lê o banco a cada chamada', async () => {
    const OBRA_B = 'b0000000-0000-0000-0000-0000000000f2'
    const USUARIO = '00000000-0000-0000-0000-0000000000f2'
    const PILAR = 'e0000000-0000-0000-0000-0000000000f2' // a chave do pilar no manifest da planta
    await banco.registros.put({
      tabela: 'elementos',
      id: PILAR,
      obra_id: OBRA_B,
      linha: { id: PILAR, obra_id: OBRA_B, pavimento_id: 'a', tipo: 'P', nome: 'P1', secao: null, usuario_id: USUARIO, dispositivo_id: 'd', criado_em_dispositivo: '2026-11-19T10:00:00.000Z', apagado: false } as never,
      pendente: 0,
    })
    expect((await caminhoesDasPecas(OBRA_B)).size).toBe(0)

    const c = await sincronizador.registrar('concretagens', OBRA_B, USUARIO, { data: '2026-11-19', substitui_id: null, cancelado: false })
    const k = await sincronizador.registrar('caminhoes', OBRA_B, USUARIO, { concretagem_id: c.id, sequencia: 1, nota_fiscal: '123', substitui_id: null, cancelado: false })
    await registrarPecas(OBRA_B, USUARIO, k.id, [{ elemento_id: PILAR, incluido: true, fracao: 1 }], 'desenho')

    // sem cache: a segunda chamada já vê o caminhão novo
    const r = await caminhoesDasPecas(OBRA_B)
    expect([...r.keys()]).toEqual([PILAR])
    expect(r.get(PILAR)![0]).toMatchObject({ sequencia: 1, nota_fiscal: '123', data: '2026-11-19', parcial: false })
  })
})

// Laje: na obra a laje é a área desenhada na FVS (fvs_areas), não peça. O caminhão conta pela
// sobreposição com as áreas dele desenhadas na mesma planta (trecho).
describe('rastreio do concreto na laje (área da FVS)', () => {
  const T1 = 'setor-trecho-1'
  const T2 = 'setor-trecho-2'
  // retângulo [x0, y0] a [x1, y1]
  const ret = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]
  const LAJE: AreaDeLajeFvs = { id: 'laje-a', setor_id: T1, contorno: ret(0, 0, 100, 100) }
  const area = (caminhao_id: string, planta_ref: string, contorno: [number, number][], extra: Record<string, unknown> = {}) =>
    linha({ caminhao_id, planta_ref, contorno, alvo: 'vigas_laje', substitui_id: null, cancelado: false, ...extra })
  const baseLaje = (parcial: Partial<LinhasDoRastreioDaLaje>): LinhasDoRastreioDaLaje => ({
    concretagens: [conc('c1', '2026-11-20')],
    caminhoes: [cam('k1', 'c1', 1, '501'), cam('k2', 'c1', 2, null)],
    caminhao_areas: [],
    exemplos: new Set(),
    ...parcial,
  })
  const ref1 = T1 + '@R02'

  it('área do caminhão cobrindo a laje inteira na mesma planta dá C, sem aviso; NF vazia vem null', () => {
    const r = montarRastreioDasLajes(baseLaje({ caminhao_areas: [area('k2', ref1, ret(-10, -10, 110, 110))] }), [LAJE])
    const laje = r.get('laje-a')!
    expect(laje.caminhoes).toHaveLength(1)
    expect(laje.caminhoes[0]).toMatchObject({ caminhao_raiz: 'k2', sequencia: 2, nota_fiscal: null, data: '2026-11-20', parcial: false })
    expect(laje.cobertura).toBe(1)
    expect(situacaoDoRastreio(laje.caminhoes, laje.cobertura)).toEqual({ resultado: 'C', parcial: false })
  })

  it('laje sem caminhão fica pendente; outra planta (trecho) e caneta "pilares" não contam', () => {
    const r = montarRastreioDasLajes(
      baseLaje({
        caminhao_areas: [area('k1', T2 + '@R01', ret(0, 0, 100, 100)), area('k2', T1 + '@R01', ret(0, 0, 100, 100), { alvo: 'pilares' })],
      }),
      [LAJE],
    )
    expect(r.has('laje-a')).toBe(false)
    expect(situacaoDoRastreio(r.get('laje-a')?.caminhoes ?? [])).toEqual({ resultado: null, parcial: false })
  })

  it('área antiga sem alvo (antes das duas canetas) conta; ref antiga sem "@" também', () => {
    const r = montarRastreioDasLajes(baseLaje({ caminhao_areas: [area('k1', T1, ret(0, 0, 100, 100), { alvo: null })] }), [LAJE])
    expect(r.get('laje-a')!.caminhoes.map((c) => c.caminhao_raiz)).toEqual(['k1'])
  })

  it('parcial: metade da laje avisa; duas metades em caminhões diferentes fecham; dois em cima do mesmo pedaço não somam', () => {
    const metade = montarRastreioDasLajes(baseLaje({ caminhao_areas: [area('k1', ref1, ret(-5, -5, 50, 105))] }), [LAJE]).get('laje-a')!
    expect(metade.caminhoes[0].parcial).toBe(true)
    expect(situacaoDoRastreio(metade.caminhoes, metade.cobertura)).toEqual({ resultado: 'C', parcial: true })

    const duas = montarRastreioDasLajes(
      baseLaje({ caminhao_areas: [area('k1', ref1, ret(-5, -5, 50, 105)), area('k2', ref1, ret(50, -5, 105, 105))] }),
      [LAJE],
    ).get('laje-a')!
    expect(duas.caminhoes.map((c) => c.sequencia)).toEqual([1, 2])
    expect(situacaoDoRastreio(duas.caminhoes, duas.cobertura)).toEqual({ resultado: 'C', parcial: false })

    const mesmoPedaco = montarRastreioDasLajes(
      baseLaje({ caminhao_areas: [area('k1', ref1, ret(-5, -5, 50, 105)), area('k2', ref1, ret(-5, -5, 50, 105))] }),
      [LAJE],
    ).get('laje-a')!
    expect(mesmoPedaco.cobertura).toBeLessThan(0.6)
    expect(situacaoDoRastreio(mesmoPedaco.caminhoes, mesmoPedaco.cobertura).parcial).toBe(true)
  })

  it('raspão abaixo de 10% da laje não conta', () => {
    const r = montarRastreioDasLajes(baseLaje({ caminhao_areas: [area('k1', ref1, ret(95, -5, 120, 105))] }), [LAJE])
    expect(r.has('laje-a')).toBe(false)
  })

  it('área do caminhão apagada, caminhão cancelado, concretagem cancelada e EXEMPLO não contam', () => {
    const cobre = (caminhao: string) => area(caminhao, ref1, ret(0, 0, 100, 100))
    const a1 = cobre('k1')
    const apagada = montarRastreioDasLajes(baseLaje({ caminhao_areas: [a1, area('k1', ref1, ret(0, 0, 100, 100), { substitui_id: a1.id, cancelado: true })] }), [LAJE])
    expect(apagada.size).toBe(0)

    const camCancelado = montarRastreioDasLajes(
      baseLaje({ caminhoes: [cam('k1', 'c1', 1, '1'), cam('k1b', 'c1', 1, '1', { substitui_id: 'k1', cancelado: true })], caminhao_areas: [cobre('k1')] }),
      [LAJE],
    )
    expect(camCancelado.size).toBe(0)

    const concCancelada = montarRastreioDasLajes(
      baseLaje({ concretagens: [conc('c1', '2026-11-20'), conc('c1b', '2026-11-20', { substitui_id: 'c1', cancelado: true })], caminhao_areas: [cobre('k1')] }),
      [LAJE],
    )
    expect(concCancelada.size).toBe(0)

    const exemplo = montarRastreioDasLajes(baseLaje({ caminhao_areas: [cobre('k1')], exemplos: new Set(['c1']) }), [LAJE])
    expect(exemplo.size).toBe(0)
  })

  it('cada área da FVS tem o seu resultado; ordem por data e sequência', () => {
    const LAJE_B: AreaDeLajeFvs = { id: 'laje-b', setor_id: T1, contorno: ret(200, 0, 300, 100) }
    const r = montarRastreioDasLajes(
      baseLaje({
        concretagens: [conc('c1', '2026-11-20'), conc('c0', '2026-11-18')],
        caminhoes: [cam('k1', 'c1', 1, '1'), cam('k9', 'c0', 3, '9')],
        caminhao_areas: [area('k1', ref1, ret(0, 0, 300, 100)), area('k9', ref1, ret(0, 0, 100, 100))],
      }),
      [LAJE, LAJE_B],
    )
    expect(r.get('laje-a')!.caminhoes.map((c) => [c.data, c.sequencia])).toEqual([
      ['2026-11-18', 3],
      ['2026-11-20', 1],
    ])
    expect(r.get('laje-b')!.caminhoes.map((c) => c.caminhao_raiz)).toEqual(['k1'])
  })

  it('pelo banco do aparelho: sem nada dá Map vazio; o caminhão desenhado aparece na chamada seguinte', async () => {
    const OBRA_L = 'b0000000-0000-0000-0000-0000000000f3'
    const USUARIO = '00000000-0000-0000-0000-0000000000f3'
    const laje = { id: 'e0000000-0000-0000-0000-0000000000f3', setor_id: 'a1000000-0000-0000-0000-0000000000f3', contorno: ret(0, 0, 100, 100) }
    expect((await caminhoesDasLajes(OBRA_L, [laje])).size).toBe(0)
    expect((await caminhoesDasLajes(OBRA_L, [])).size).toBe(0)

    const c = await sincronizador.registrar('concretagens', OBRA_L, USUARIO, { data: '2026-11-20', substitui_id: null, cancelado: false })
    const k = await sincronizador.registrar('caminhoes', OBRA_L, USUARIO, { concretagem_id: c.id, sequencia: 1, nota_fiscal: '77', substitui_id: null, cancelado: false })
    await sincronizador.registrar('caminhao_areas', OBRA_L, USUARIO, {
      caminhao_id: k.id,
      planta_ref: laje.setor_id + '@R01',
      contorno: ret(-1, -1, 101, 101),
      alvo: 'vigas_laje',
      substitui_id: null,
      cancelado: false,
    })
    const r = await caminhoesDasLajes(OBRA_L, [laje])
    expect(r.get(laje.id)!.caminhoes[0]).toMatchObject({ sequencia: 1, nota_fiscal: '77', data: '2026-11-20', parcial: false })
  })
})

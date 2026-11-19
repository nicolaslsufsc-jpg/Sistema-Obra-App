// Rastreio do concreto para a FVS (rastreio.ts): que caminhões levaram cada peça e a regra do item.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { Linha } from '../nucleo/banco_local'
import { banco, sincronizador } from '../nucleo/servicos'
import { registrarPecas } from './dados'
import { caminhoesDasPecas, montarRastreio, situacaoDoRastreio, type CaminhaoDaPeca, type LinhasDoRastreio } from './rastreio'

const OBRA = 'b0000000-0000-0000-0000-0000000000f1'
let relogio = 0
function linha(campos: Record<string, unknown>): Linha {
  relogio++
  return {
    id: `id-${relogio}`,
    obra_id: OBRA,
    usuario_id: 'u',
    dispositivo_id: 'd',
    criado_em_dispositivo: `2026-11-19T10:00:${String(relogio).padStart(2, '0')}.000Z`,
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

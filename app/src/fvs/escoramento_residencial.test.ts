import { describe, expect, it } from 'vitest'
import type { DadosFvs } from './dados'
import { apoiosDaObra, apoiosDoManifest, avisosPorResidencial, contornosSeTocam, residenciaisDoPilar, situacaoDoAviso, textoDoQueFalta, type AvisoDoResidencial } from './escoramento_residencial'
import type { ElementoPacote } from './pacote'
import { lerRegras, type RegrasFvs } from './regras'
import type { EventoFvs, Ficha } from './situacao'

// Obra fictícia EXE: dois residenciais, A (P1, P2) e B (P3, P4), em linha: P1 P2 | P3 P4, com 100 pontos
// entre pilares. V1 liga P1-P2 (A), V2 liga P2-P3 (divisa, A e B), V3 liga P3-P4 (B), V4 apoia só na V3.
const ficha = (id: string, codigo: string, tipo: string): Ficha => ({
  id,
  codigo,
  titulo: codigo,
  revisao: '0',
  aplica_a: [tipo],
  itens: [
    { n: 1, etapa: 'CONCRETAGEM', titulo: 'Concretagem' },
    { n: 2, etapa: 'DESFORMA', titulo: 'Retirada' },
  ],
})
const PILAR = ficha('fp', 'EXE-PVS-PILAR', 'P')
const VIGA = ficha('fv', 'EXE-PVS-VIGA', 'V')
const LAJE = ficha('fl', 'EXE-PVS-LAJE', 'L')

const quadrado = (x: number, y: number, l = 20): Array<[number, number]> => [
  [x, y],
  [x + l, y],
  [x + l, y + l],
  [x, y + l],
]
const el = (tipo: ElementoPacote['tipo'], nome: string, poly: Array<[number, number]>): ElementoPacote => ({ tipo, nome, secao: '', rotulo: [0, 0, 0, 0], polys: [poly] })
// pilares 20x20 em x = 0, 100, 200, 300; vigas de 15 de altura, do meio de um pilar ao meio do outro
const elementos: Record<string, ElementoPacote> = {
  p1: el('P', 'P1', quadrado(0, 0)),
  p2: el('P', 'P2', quadrado(100, 0)),
  p3: el('P', 'P3', quadrado(200, 0)),
  p4: el('P', 'P4', quadrado(300, 0)),
  v1: el('V', 'V1', [[20, 3], [100, 3], [100, 18], [20, 18]]),
  v2: el('V', 'V2', [[120, 3], [200, 3], [200, 18], [120, 18]]),
  v3: el('V', 'V3', [[220, 3], [300, 3], [300, 18], [220, 18]]),
  // V4 nasce no meio da V3, para baixo
  v4: el('V', 'V4', [[255, 18], [265, 18], [265, 80], [255, 80]]),
}
const laje = { id: 'a1', versao: 'a1', pavimento_id: 'pv2', setor_id: 's', planta_id: 'forma', nome: 'Laje 1', ficha_id: LAJE.id, codigo_ficha: null, contorno: [[-10, -10], [130, -10], [130, 60], [-10, 60]] as Array<[number, number]>, usuario_id: 'u', criado_em_dispositivo: '', criada_em: '' }

const regras: RegrasFvs = lerRegras({
  prazos: [
    { id: 'pilar', ficha: 'EXE-PVS-PILAR', item: 2, dias: 7, depois_de: { tipo: 'concretagem' } },
    { id: 'viga', ficha: 'EXE-PVS-VIGA', item: 2, dias: 28, depois_de: { tipo: 'concretagem' } },
    { id: 'laje', ficha: 'EXE-PVS-LAJE', item: 2, dias: 28, depois_de: { tipo: 'concretagem' } },
  ],
  residenciais: [
    { nome: 'Residencial A', pilares: ['P1', 'P2'] },
    { nome: 'Residencial B', pilares: ['P3', 'P4'] },
  ],
})

let n = 0
const concretada = (peca: string, f: Ficha, quando: string, item = 1): EventoFvs => ({
  id: `e${++n}`,
  elemento_id: peca,
  ficha_id: f.id,
  item,
  resultado: 'C',
  rodada: 1,
  observacao: null,
  lote_id: null,
  planta_id: null,
  usuario_id: 'u',
  criado_em_dispositivo: quando,
})

function dados(eventos: Record<string, EventoFvs[]>, r = regras): DadosFvs {
  const pecas = Object.entries(elementos).map(([id, e]) => ({ id, pavimento_id: 'pv2', tipo: e.tipo, nome: e.nome, secao: null }))
  return {
    pavimentos: [{ id: 'pv2', nome: '2º Pavimento', ordem: 2 }],
    pecaPorId: new Map(pecas.map((p) => [p.id, p])),
    eventosDe: new Map(Object.entries(eventos)),
    fichaPorId: new Map([PILAR, VIGA, LAJE].map((f) => [f.id, f])),
    fichas: [PILAR, VIGA, LAJE],
    areaPorId: new Map([[laje.id, laje]]),
    regras: r,
  } as unknown as DadosFvs
}

const apoios = apoiosDoManifest(elementos, [laje])
const resumo = (l: AvisoDoResidencial[], agora: Date) => l.map((a) => [a.residencial, a.grupo, situacaoDoAviso(a, agora), textoDoQueFalta(a)])

describe('quem apoia cada viga e laje (pela planta)', () => {
  it('a viga, pelos pilares que toca; a que só apoia em viga, pela viga', () => {
    expect(apoios.get('v1')).toEqual({ pilares: ['p1', 'p2'], vigas: [] })
    expect(apoios.get('v2')?.pilares).toEqual(['p2', 'p3'])
    expect(apoios.get('v4')).toEqual({ pilares: [], vigas: ['v3'] })
  })

  it('a laje, pelos pilares de dentro dela', () => {
    expect(apoios.get('a1')?.pilares).toEqual(['p1', 'p2'])
  })

  it('contornos longe não se tocam; encostados, sim', () => {
    expect(contornosSeTocam([quadrado(0, 0)], [quadrado(50, 0)], 2)).toBe(false)
    expect(contornosSeTocam([quadrado(0, 0)], [quadrado(21, 0)], 2)).toBe(true)
  })

  it('a obra: por pavimento, a planta com mais pilares e vigas (a forma)', () => {
    const armadura = { planta_id: 'armadura', elementos: { p1: elementos.p1 } }
    const ap = apoiosDaObra([armadura, { planta_id: 'forma', elementos }], dados({}).pecaPorId, [laje])
    expect(ap.get('v2')?.pilares).toEqual(['p2', 'p3'])
    expect(ap.get('a1')?.pilares).toEqual(['p1', 'p2'])
  })
})

describe('residencial do pilar (dado da obra)', () => {
  it('pelo nome, sem diferença de maiúscula; a lista do pavimento passa na frente da geral', () => {
    const r = [
      { nome: 'A', pilares: ['P1'] },
      { nome: 'B', pilares: ['P1', 'P2'], pavimento: 'Subsolo' },
    ]
    expect(residenciaisDoPilar(r, '2º Pavimento', 'p1')).toEqual(['A'])
    expect(residenciaisDoPilar(r, 'subsolo', 'P1')).toEqual(['B'])
    expect(residenciaisDoPilar(r, '2º Pavimento', 'P9')).toEqual([])
  })

  it('as regras leem os residenciais e deixam de fora o que vier torto', () => {
    const r = lerRegras({ residenciais: [{ nome: 'A', pilares: ['P1', ' P1 ', 2] }, { nome: '', pilares: ['P3'] }, { nome: 'C', pilares: [] }] })
    expect(r.residenciais).toEqual([{ nome: 'A', pilares: ['P1'] }])
    expect(r.fora).toBe(2)
  })
})

describe('avisos por residencial (3.8, 23/11)', () => {
  const agora = new Date(2026, 10, 23, 10)

  it('pode desformar e desescorar quando todas as peças do residencial passaram do prazo', () => {
    const evs = {
      p1: [concretada('p1', PILAR, '2026-11-01T10:00:00')],
      p2: [concretada('p2', PILAR, '2026-11-02T10:00:00')],
      v1: [concretada('v1', VIGA, '2026-10-20T10:00:00')],
      v2: [concretada('v2', VIGA, '2026-10-21T10:00:00')],
      a1: [concretada('a1', LAJE, '2026-10-22T10:00:00')],
    }
    const l = avisosPorResidencial(dados(evs), apoios, agora)
    expect(resumo(l, agora)).toEqual([
      ['Residencial A', 'pilares', 'pode desformar desde 09/11', ''],
      ['Residencial A', 'vigas_lajes', 'pode desescorar desde 19/11', ''],
      // B: a V2 da divisa já concretou, mas P3, P4, V3 e V4 ainda não
      ['Residencial B', 'vigas_lajes', 'esperando concretagem', 'falta concretar V3, V4'],
    ])
  })

  it('peça na divisa segura os dois residenciais; mostra o que falta, com a data', () => {
    const evs = {
      v1: [concretada('v1', VIGA, '2026-10-20T10:00:00')],
      v2: [concretada('v2', VIGA, '2026-11-10T10:00:00')],
      a1: [concretada('a1', LAJE, '2026-10-22T10:00:00')],
    }
    const [a] = avisosPorResidencial(dados(evs), apoios, agora).filter((x) => x.residencial === 'Residencial A' && x.grupo === 'vigas_lajes')
    expect(a.pode).toBe(false)
    expect(situacaoDoAviso(a, agora)).toBe('libera em 08/12 (faltam 15 dias)')
    expect(textoDoQueFalta(a)).toBe('falta V2 (libera 08/12)')
  })

  it('peça não concretada segura o aviso; a retirada já marcada conta como feita', () => {
    const evs = {
      v1: [concretada('v1', VIGA, '2026-10-20T10:00:00'), concretada('v1', VIGA, '2026-11-18T10:00:00', 2)],
      v2: [concretada('v2', VIGA, '2026-10-20T10:00:00')],
    }
    const [a] = avisosPorResidencial(dados(evs), apoios, agora).filter((x) => x.residencial === 'Residencial A' && x.grupo === 'vigas_lajes')
    expect(a.pode).toBe(false)
    expect(a.liberaEm).toBeNull()
    expect(textoDoQueFalta(a)).toBe('falta concretar Laje 1')
  })

  it('o mais urgente primeiro; residencial que não começou ou que terminou fica fora', () => {
    const evs = {
      // A pilares: tudo retirado → fora
      p1: [concretada('p1', PILAR, '2026-11-01T10:00:00'), concretada('p1', PILAR, '2026-11-09T10:00:00', 2)],
      p2: [concretada('p2', PILAR, '2026-11-01T10:00:00'), concretada('p2', PILAR, '2026-11-09T10:00:00', 2)],
      // B pilares: um aguardando, um pode → libera em 27/11
      p3: [concretada('p3', PILAR, '2026-11-20T10:00:00')],
      p4: [concretada('p4', PILAR, '2026-11-10T10:00:00')],
    }
    const l = avisosPorResidencial(dados(evs), apoios, agora)
    expect(resumo(l, agora)).toEqual([['Residencial B', 'pilares', 'libera em 27/11 (faltam 4 dias)', 'falta P3 (libera 27/11)']])
  })

  it('sem residenciais nas regras, nenhum aviso', () => {
    expect(avisosPorResidencial(dados({ p1: [concretada('p1', PILAR, '2026-11-01T10:00:00')] }, { ...regras, residenciais: undefined }), apoios, agora)).toEqual([])
  })

  it('o que falta: até 6 nomes e "e mais N", as que aguardam juntas pela data', () => {
    const faltam = Array.from({ length: 8 }, (_, i) => ({ pecaId: `x${i}`, nome: `V${i + 1}`, tipo: 'V', liberaEm: null }))
    const a = { faltam } as unknown as AvisoDoResidencial
    expect(textoDoQueFalta(a)).toBe('falta concretar V1, V2, V3, V4, V5, V6 e mais 2')
    const datas = [20, 20, 21, 22, 23].map((d, i) => ({ pecaId: `y${i}`, nome: `L${i + 1}`, tipo: 'L', liberaEm: new Date(2026, 10, d) }))
    expect(textoDoQueFalta({ faltam: [...datas, faltam[0]] } as unknown as AvisoDoResidencial)).toBe(
      'falta L1, L2 (libera 20/11); falta L3 (libera 21/11); falta L4 (libera 22/11); mais 1 libera depois; falta concretar V1',
    )
  })
})

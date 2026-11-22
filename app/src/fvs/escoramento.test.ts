import { describe, expect, it } from 'vitest'
import { contagemDoEscoramento, listaDoEscoramento, textoDaLinha } from './escoramento'
import type { DadosFvs } from './dados'
import type { RegrasFvs } from './regras'
import type { EventoFvs, Ficha } from './situacao'

// Obra fictícia EXE: ficha de viga com o item 2 de concretagem e o item 3 de retirada do escoramento.
const VIGA: Ficha = {
  id: 'fv',
  codigo: 'EXE-PVS-VIGA',
  titulo: 'Viga',
  revisao: '0',
  aplica_a: ['V'],
  itens: [
    { n: 1, etapa: 'MONTAGEM', titulo: 'Fôrma' },
    { n: 2, etapa: 'CONCRETAGEM', titulo: 'Concretagem' },
    { n: 3, etapa: 'DESFORMA', titulo: 'Retirada do escoramento' },
  ],
}
const PILAR: Ficha = { ...VIGA, id: 'fp', codigo: 'EXE-PVS-PILAR', aplica_a: ['P'] }
const regras: RegrasFvs = {
  prazos: [
    { id: 'viga-retirada', ficha: 'EXE-PVS-VIGA', item: 3, dias: 28, depois_de: { tipo: 'concretagem' }, texto: 'Retirada do escoramento da viga' },
    { id: 'pilar-desforma', ficha: 'EXE-PVS-PILAR', item: 3, dias: 7, depois_de: { tipo: 'concretagem' } },
  ],
  ligacoes: [],
}
let n = 0
const ev = (peca: string, ficha: Ficha, item: number, resultado: 'C' | 'NA', quando: string): EventoFvs => ({
  id: `e${++n}`,
  elemento_id: peca,
  ficha_id: ficha.id,
  item,
  resultado,
  rodada: 1,
  observacao: null,
  lote_id: null,
  planta_id: null,
  usuario_id: 'u',
  criado_em_dispositivo: quando,
})

function dados(): DadosFvs {
  const pecas = [
    { id: 'v1', pavimento_id: 'pv2', tipo: 'V', nome: 'V10', secao: null },
    { id: 'v2', pavimento_id: 'pv2', tipo: 'V', nome: 'V2', secao: null },
    { id: 'v3', pavimento_id: 'pv2', tipo: 'V', nome: 'V3', secao: null },
    { id: 'v4', pavimento_id: 'pv2', tipo: 'V', nome: 'V4', secao: null },
    { id: 'p1', pavimento_id: 'pv1', tipo: 'P', nome: 'P1', secao: null },
  ]
  const eventosDe = new Map<string, EventoFvs[]>([
    // concretada em 01/11: 28 dias → libera em 29/11
    ['v1', [ev('v1', VIGA, 2, 'C', '2026-11-01T10:00:00')]],
    // concretada em 20/10: já liberou em 17/11
    ['v2', [ev('v2', VIGA, 2, 'C', '2026-10-20T10:00:00')]],
    // retirada já marcada: sai da lista
    ['v3', [ev('v3', VIGA, 2, 'C', '2026-10-01T10:00:00'), ev('v3', VIGA, 3, 'C', '2026-10-30T10:00:00')]],
    // v4 sem concretagem: conta como "sem início"
    ['p1', [ev('p1', PILAR, 2, 'C', '2026-11-18T08:00:00')]],
  ])
  return {
    pavimentos: [
      { id: 'pv1', nome: 'Térreo', ordem: 1 },
      { id: 'pv2', nome: '2º pavimento', ordem: 2 },
      { id: 'pv3', nome: '3º pavimento', ordem: 3 },
    ],
    pecaPorId: new Map(pecas.map((p) => [p.id, p])),
    eventosDe,
    fichaPorId: new Map([VIGA, PILAR].map((f) => [f.id, f])),
    fichas: [VIGA, PILAR],
    areaPorId: new Map(),
    regras,
  } as unknown as DadosFvs
}

describe('lista de escoramento por pavimento (3.6, 21/11)', () => {
  it('por pavimento e por prazo: quem já pode primeiro, depois quem aguarda; o item marcado sai', () => {
    const lista = listaDoEscoramento(dados(), new Date(2026, 10, 21, 15, 0))
    expect(lista.map((pv) => pv.nome)).toEqual(['Térreo', '2º pavimento'])
    const [terreo, segundo] = lista
    expect(terreo.grupos.map((g) => [g.titulo, g.linhas.map((l) => [l.nome, textoDaLinha(l)])])).toEqual([
      // sem texto na regra: o título do item
      ['Retirada do escoramento', [['P1', 'aguardando (faltam 4 dias, libera em 25/11)']]],
    ])
    expect(segundo.grupos).toHaveLength(1)
    const g = segundo.grupos[0]
    expect(g.titulo).toBe('Retirada do escoramento da viga')
    expect(g.linhas.map((l) => [l.nome, textoDaLinha(l)])).toEqual([
      ['V2', 'pode retirar desde 17/11'],
      ['V10', 'aguardando (faltam 8 dias, libera em 29/11)'],
    ])
    expect(g.semInicio).toBe(1)
    expect(contagemDoEscoramento(lista)).toEqual({ podem: 1, aguardam: 2 })
  })

  it('sem prazos nas regras, nada', () => {
    const d = dados()
    expect(listaDoEscoramento({ ...d, regras: { prazos: [], ligacoes: [] } })).toEqual([])
  })

  it('no dia em que libera já pode; com 1 dia, "falta 1 dia"', () => {
    const d = dados()
    const noDia = listaDoEscoramento(d, new Date(2026, 10, 29, 0, 0))[1].grupos[0].linhas.find((l) => l.nome === 'V10')!
    expect(textoDaLinha(noDia)).toBe('pode retirar desde 29/11')
    const vespera = listaDoEscoramento(d, new Date(2026, 10, 28, 23, 0))[1].grupos[0].linhas.find((l) => l.nome === 'V10')!
    expect(textoDaLinha(vespera)).toBe('aguardando (falta 1 dia, libera em 29/11)')
  })
})

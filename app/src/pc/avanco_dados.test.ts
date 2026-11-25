// O Avanço segue a regra do verde da planta (fvs/concretada.ts, decisão do Nicolas de 24/11): pilar, viga e
// laje ficam "prontos" só numa concretagem cadastrada no Concreto (90%). Ficha toda marcada sem concretagem
// conta como "liberada para concretar". Obra EXE inventada, sem banco.
import { describe, expect, it } from 'vitest'
import type { DadosFvs } from '../fvs/dados'
import type { EventoFvs, Ficha } from '../fvs/situacao'
import { avancoPorPavimento } from './avanco'
import { pecasDoAvanco } from './avanco_dados'

const ficha = (id: string, tipo: string): Ficha => ({
  id,
  codigo: `PVS-${tipo}`,
  titulo: tipo,
  revisao: '0',
  aplica_a: [tipo],
  itens: [
    { n: 1, etapa: 'CONDIÇÕES DE INÍCIO', titulo: 'a' },
    { n: 2, etapa: 'MONTAGEM - FORMA E ARMADURA', titulo: 'conferir armadura' },
    { n: 3, etapa: 'CONCRETAGEM', titulo: 'c' },
  ],
})

let seq = 0
const ev = (elemento: string, fichaId: string, item: number): EventoFvs =>
  ({
    id: `e${++seq}`,
    elemento_id: elemento,
    ficha_id: fichaId,
    item,
    resultado: 'C',
    rodada: 1,
    observacao: null,
    lote_id: null,
    planta_id: null,
    usuario_id: '',
    criado_em_dispositivo: `2026-11-20T10:00:${String(seq).padStart(2, '0')}.000Z`,
  }) as EventoFvs

function dados(concretadas: ReadonlySet<string>): DadosFvs {
  const fichas = [ficha('fp', 'P'), ficha('fv', 'V')]
  const pecas = [
    { id: 'p1', pavimento_id: 'pav1', tipo: 'P', nome: 'P1', secao: null },
    { id: 'p2', pavimento_id: 'pav1', tipo: 'P', nome: 'P2', secao: null },
    { id: 'p3', pavimento_id: 'pav1', tipo: 'P', nome: 'P3', secao: null },
    { id: 'v1', pavimento_id: 'pav1', tipo: 'V', nome: 'V1', secao: null },
  ]
  const eventos = new Map<string, EventoFvs[]>([
    // P1 e P2: ficha toda marcada; P3: só o começo; V1: tudo antes da concretagem
    ['p1', [ev('p1', 'fp', 1), ev('p1', 'fp', 2), ev('p1', 'fp', 3)]],
    ['p2', [ev('p2', 'fp', 1), ev('p2', 'fp', 2), ev('p2', 'fp', 3)]],
    ['p3', [ev('p3', 'fp', 1)]],
    ['v1', [ev('v1', 'fv', 1), ev('v1', 'fv', 2)]],
  ])
  return {
    fichas,
    fichaPorId: new Map(fichas.map((f) => [f.id, f])),
    pecaPorId: new Map(pecas.map((p) => [p.id, p])),
    areaPorId: new Map(),
    pavimentos: [{ id: 'pav1', nome: '1º Pavimento' }],
    eventosDe: eventos,
    fichasCampoDe: new Map(),
    regras: { residenciais: [] },
    concretadas,
  } as unknown as DadosFvs
}

describe('avanço com a regra do verde da planta (concretada, 24/11)', () => {
  it('ficha toda marcada sem concretagem: liberada para concretar, não pronta', () => {
    const pecas = pecasDoAvanco(dados(new Set()), [], new Map())
    const estado = Object.fromEntries(pecas.map((p) => [p.nome, p.estado]))
    expect(estado).toEqual({ P1: 'concretar', P2: 'concretar', P3: 'andamento', V1: 'concretar' })
    expect(pecas.every((p) => !p.concretada)).toBe(true)
  })

  it('com 90% numa concretagem do Concreto: pronta e concretada; a armação não muda', () => {
    const pecas = pecasDoAvanco(dados(new Set(['p1', 'v1'])), [], new Map())
    const por = Object.fromEntries(pecas.map((p) => [p.nome, p]))
    expect(por.P1.estado).toBe('pronto')
    expect(por.P1.concretada).toBe(true)
    expect(por.V1.estado).toBe('pronto')
    expect(por.P2.estado).toBe('concretar')
    expect(por.P2.concretada).toBe(false)
    expect(por.P1.armadura).toBe('ok')
    expect(por.P3.armadura).toBe('falta')
    const { total } = avancoPorPavimento(pecas, [{ id: 'pav1', nome: '1º Pavimento' }])
    expect(total.pilares).toMatchObject({ pronto: 1, concretar: 1, andamento: 1, total: 3 })
    expect(total.concreto.pecas).toBe(2)
  })

  it('caminhão com a peça mas abaixo de 90% (fora do conjunto da FVS): não conta como concretada', () => {
    const caminhao = { id: 'k1', concretagemId: 'c1', pavimentoId: 'pav1', data: '2026-11-20', volume: 8, pecas: ['p2'] }
    const pecas = pecasDoAvanco(dados(new Set()), [caminhao], new Map())
    const p2 = pecas.find((p) => p.nome === 'P2')!
    expect(p2.concretada).toBe(false)
    expect(p2.parcial).toBe(true)
    expect(p2.estado).toBe('concretar')
  })
})

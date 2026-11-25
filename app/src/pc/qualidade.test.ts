// Indicadores da qualidade (ideia 6): contas puras, obra EXE inventada, sem banco.
import { describe, expect, it } from 'vitest'
import type { Caminhao, Concretagem, DadosConcreto, Resultado } from '../concreto/dados'
import type { EventoFvs, Ficha } from '../fvs/situacao'
import { situacaoDaPeca } from '../fvs/situacao'
import {
  andamentoDosApartamentos,
  conformidadePor,
  diasEntre,
  faixasDasNcs,
  inspecoesDaPeca,
  laudosDasConcretagens,
  liberacaoDaFicha,
  mediana,
  ncsAbertas,
  porSemana,
  segundaDaSemana,
  totalDaConformidade,
} from './qualidade'

const fichaP: Ficha = {
  id: 'fp',
  codigo: 'EXE-PVS-P',
  titulo: 'Pilar',
  revisao: '0',
  aplica_a: ['P'],
  itens: [
    { n: 1, etapa: 'CONDIÇÕES DE INÍCIO', titulo: 'a' },
    { n: 2, etapa: 'MONTAGEM', titulo: 'b' },
    { n: 3, etapa: 'CONCRETAGEM', titulo: 'c' },
  ],
}
const fichaV: Ficha = { ...fichaP, id: 'fv', codigo: 'EXE-PVS-V', titulo: 'Viga', aplica_a: ['V'] }
const fichaPorId = (id: string) => ({ fp: fichaP, fv: fichaV })[id as 'fp' | 'fv']

let seq = 0
const ev = (o: Partial<EventoFvs> & Pick<EventoFvs, 'item' | 'resultado' | 'criado_em_dispositivo'>): EventoFvs => ({
  id: `e${String(++seq).padStart(3, '0')}`,
  elemento_id: 'p1',
  ficha_id: 'fp',
  rodada: 1,
  observacao: null,
  lote_id: null,
  planta_id: null,
  usuario_id: 'u',
  ...o,
})

describe('inspeções e % conforme', () => {
  it('a correção conta uma vez; a reinspeção (outra rodada) conta; NA, desfeita e o automático do Concreto não', () => {
    const eventos = [
      ev({ item: 1, resultado: 'NC', criado_em_dispositivo: '2026-11-02T10:00:00.000Z' }),
      ev({ item: 1, resultado: 'C', criado_em_dispositivo: '2026-11-02T10:05:00.000Z' }), // corrigiu: vale só o C
      ev({ item: 2, resultado: 'NC', criado_em_dispositivo: '2026-11-03T10:00:00.000Z' }),
      ev({ item: 2, resultado: 'C', rodada: 2, criado_em_dispositivo: '2026-11-05T10:00:00.000Z' }), // reinspeção
      ev({ item: 3, resultado: 'NA', criado_em_dispositivo: '2026-11-05T11:00:00.000Z' }),
      ev({ item: 3, resultado: 'C', rodada: 3, origem_id: 'auto', criado_em_dispositivo: '2026-11-06T11:00:00.000Z' }),
    ]
    const insp = inspecoesDaPeca({ id: 'p1', pavimentoId: 'pav1' }, eventos, fichaPorId, (e) => e.origem_id === 'auto')
    expect(insp.map((i) => i.resultado).sort()).toEqual(['C', 'C', 'NC'])
    expect(totalDaConformidade(insp)).toEqual({ c: 2, nc: 1, pct: 67 })
  })

  it('marcação desfeita (resultado vazio) some; ficha que não existe mais é ignorada', () => {
    const eventos = [
      ev({ item: 1, resultado: 'C', criado_em_dispositivo: '2026-11-02T10:00:00.000Z' }),
      ev({ item: 1, resultado: null, criado_em_dispositivo: '2026-11-02T10:01:00.000Z' }),
      ev({ item: 1, resultado: 'C', ficha_id: 'sumiu', criado_em_dispositivo: '2026-11-02T10:02:00.000Z' }),
    ]
    expect(inspecoesDaPeca({ id: 'p1', pavimentoId: 'pav1' }, eventos, fichaPorId)).toEqual([])
  })

  it('por ficha: o pior % primeiro; sem inspeção, total vazio', () => {
    const i = (fichaCodigo: string, resultado: 'C' | 'NC') => ({ pecaId: 'x', pavimentoId: 'pav1', fichaCodigo, fichaTitulo: fichaCodigo, resultado, quando: '2026-11-02T10:00:00.000Z' })
    const lista = [i('A', 'C'), i('A', 'C'), i('B', 'NC'), i('B', 'C'), i('C', 'C')]
    const linhas = conformidadePor(lista, (x) => x.fichaCodigo, (x) => x.fichaCodigo)
    expect(linhas.map((l) => [l.nome, l.pct])).toEqual([['B', 50], ['A', 100], ['C', 100]])
    expect(totalDaConformidade([])).toEqual({ c: 0, nc: 0, pct: null })
  })

  it('por pavimento na ordem dada', () => {
    const i = (pavimentoId: string) => ({ pecaId: 'x', pavimentoId, fichaCodigo: 'A', fichaTitulo: 'A', resultado: 'C' as const, quando: '2026-11-02T10:00:00.000Z' })
    const ordem = ['t', '1', '2']
    const linhas = conformidadePor([i('2'), i('t'), i('1')], (x) => x.pavimentoId, (x) => x.pavimentoId, (a, b) => ordem.indexOf(a) - ordem.indexOf(b))
    expect(linhas.map((l) => l.chave)).toEqual(['t', '1', '2'])
  })
})

describe('NC abertas', () => {
  it('só as abertas, da mais antiga para a mais nova, com os dias', () => {
    const agora = new Date('2026-11-25T12:00:00.000Z')
    const rs = [
      { id: 'a', aberta: true, quando: '2026-11-24T13:00:00.000Z' },
      { id: 'b', aberta: false, quando: '2026-10-01T10:00:00.000Z' },
      { id: 'c', aberta: true, quando: '2026-10-20T10:00:00.000Z' },
      { id: 'd', aberta: true, quando: '2026-11-10T10:00:00.000Z' },
    ]
    const abertas = ncsAbertas(rs, agora)
    expect(abertas.map((x) => [x.r.id, x.dias])).toEqual([['c', 36], ['d', 15], ['a', 0]])
    expect(faixasDasNcs(abertas.map((x) => x.dias))).toEqual({ ate7: 1, ate30: 1, mais30: 1 })
  })

  it('dias inteiros: 23 h ainda é 0', () => {
    expect(diasEntre('2026-11-24T13:00:00.000Z', '2026-11-25T12:00:00.000Z')).toBe(0)
    expect(diasEntre('2026-11-24T12:00:00.000Z', '2026-11-25T12:00:00.000Z')).toBe(1)
  })
})

describe('tempo até liberar', () => {
  it('da primeira marcação até a última de antes da concretagem; só peça liberada', () => {
    const eventos = [
      ev({ item: 1, resultado: 'C', criado_em_dispositivo: '2026-11-01T10:00:00.000Z' }),
      ev({ item: 2, resultado: 'NC', criado_em_dispositivo: '2026-11-02T10:00:00.000Z' }),
      ev({ item: 2, resultado: 'C', rodada: 2, criado_em_dispositivo: '2026-11-04T22:00:00.000Z' }),
    ]
    const sit = situacaoDaPeca(fichaP, eventos, undefined, false)
    expect(sit).toBe('concretagem')
    const l = liberacaoDaFicha(fichaP, eventos, sit)
    expect(l).toEqual({ inicio: '2026-11-01T10:00:00.000Z', fim: '2026-11-04T22:00:00.000Z', dias: 3.5 })
    // o item da concretagem marcado depois não muda a data da liberação
    const depois = [...eventos, ev({ item: 3, resultado: 'C', criado_em_dispositivo: '2026-11-09T10:00:00.000Z' })]
    expect(liberacaoDaFicha(fichaP, depois, situacaoDaPeca(fichaP, depois, undefined, true))?.fim).toBe('2026-11-04T22:00:00.000Z')
  })

  it('em andamento ou com NC: sem liberação', () => {
    const eventos = [ev({ item: 1, resultado: 'C', criado_em_dispositivo: '2026-11-01T10:00:00.000Z' })]
    expect(liberacaoDaFicha(fichaP, eventos, situacaoDaPeca(fichaP, eventos, undefined, false))).toBeNull()
    expect(liberacaoDaFicha(fichaP, eventos, 'reprovado')).toBeNull()
  })

  it('ficha sem etapa de concretagem: a última marcação da ficha', () => {
    const f: Ficha = { ...fichaP, id: 'fa', itens: [{ n: 1, etapa: 'EXECUÇÃO', titulo: 'a' }, { n: 2, etapa: 'EXECUÇÃO', titulo: 'b' }] }
    const eventos = [
      ev({ ficha_id: 'fa', item: 1, resultado: 'C', criado_em_dispositivo: '2026-11-01T10:00:00.000Z' }),
      ev({ ficha_id: 'fa', item: 2, resultado: 'C', criado_em_dispositivo: '2026-11-03T10:00:00.000Z' }),
    ]
    expect(liberacaoDaFicha(f, eventos, situacaoDaPeca(f, eventos))?.dias).toBe(2)
  })

  it('mediana', () => {
    expect(mediana([])).toBeNull()
    expect(mediana([5, 1, 3])).toBe(3)
    expect(mediana([1, 2, 3, 10])).toBe(2.5)
  })
})

describe('por semana', () => {
  it('semanas de segunda a domingo, com as vazias no meio e sem o começo vazio', () => {
    expect(segundaDaSemana('2026-11-25T15:00:00')).toBe('2026-11-23')
    expect(segundaDaSemana('2026-11-23T08:00:00')).toBe('2026-11-23')
    expect(segundaDaSemana('2026-11-22T08:00:00')).toBe('2026-11-16')
    const s = porSemana(['2026-11-03T10:00:00', '2026-11-04T10:00:00', '2026-11-24T10:00:00'], new Date('2026-11-25T15:00:00'), 12)
    expect(s).toEqual([
      { semana: '2026-11-02', n: 2 },
      { semana: '2026-11-09', n: 0 },
      { semana: '2026-11-16', n: 0 },
      { semana: '2026-11-23', n: 1 },
    ])
    expect(porSemana([], new Date('2026-11-25T15:00:00'))).toEqual([])
  })
})

describe('laudos das concretagens', () => {
  const conc = (raiz: string, data: string, exemplo = false) => ({ raiz, id: raiz, pavimento_id: 'pav1', data, fck_mpa: 30, idades_dias: [7, 28], cps_por_idade: 2, exemplo }) as unknown as Concretagem
  const cam = (raiz: string, concretagem: string) => ({ raiz, id: raiz, concretagem_id: concretagem }) as unknown as Caminhao
  const res = (caminhao: string, idade: number, mpa: number) => ({ caminhao_id: caminhao, idade_dias: idade, numero_cp: 1, resistencia_mpa: mpa }) as unknown as Resultado

  it('com laudo, abaixo do fck, atrasado, aguardando, ainda não rompeu e sem caminhão; exemplo fora', () => {
    const concretagens = [
      conc('ok', '2026-10-01'),
      conc('baixo', '2026-10-02'),
      conc('atraso', '2026-10-03'),
      conc('aguarda', '2026-10-27'),
      conc('novo', '2026-11-20'),
      conc('vazia', '2026-11-21'),
      conc('demo', '2026-10-01', true),
    ]
    const caminhoes = [cam('k1', 'ok'), cam('k2', 'ok'), cam('k3', 'baixo'), cam('k4', 'baixo'), cam('k5', 'atraso'), cam('k6', 'aguarda'), cam('k7', 'novo'), cam('k8', 'demo')]
    const resultados = [res('k1', 28, 33.4), res('k2', 28, 31.2), res('k3', 28, 32), res('k4', 28, 27.5), res('k5', 7, 22)]
    const d = {
      concretagens,
      caminhoesDe: new Map(concretagens.map((c) => [c.raiz, caminhoes.filter((k) => k.concretagem_id === c.raiz)])),
      resultadosDe: new Map(caminhoes.map((k) => [k.raiz, resultados.filter((r) => r.caminhao_id === k.raiz)])),
    } as unknown as DadosConcreto
    const laudos = laudosDasConcretagens(d, '2026-11-25')
    expect(laudos.map((l) => [l.concretagem.raiz, l.situacao, l.caminhoes, l.menorExemplar])).toEqual([
      ['vazia', 'sem_caminhao', 0, null],
      ['novo', 'no_prazo', 1, null],
      ['aguarda', 'aguardando', 1, null], // 28 dias em 24/11: um dia depois, na margem
      ['atraso', 'atrasado', 1, null],
      ['baixo', 'abaixo_fck', 2, 27.5],
      ['ok', 'com_laudo', 2, 31.2],
    ])
  })
})

describe('andamento por apartamento', () => {
  it('soma por pavimento e apartamento; apartamento sem ficha começada fica fora; "Apto" antes do resto', () => {
    const comodos = [
      { id: 'a1', pavimentoId: 'pav2', apartamento: 'Apto 201' },
      { id: 'a2', pavimentoId: 'pav2', apartamento: 'Apto 201' },
      { id: 'a3', pavimentoId: 'pav2', apartamento: 'Apto 202' },
      { id: 'a4', pavimentoId: 'pav1', apartamento: 'Apto 101' },
      { id: 'a5', pavimentoId: 'pav1', apartamento: 'Sem apartamento' },
      { id: 'a6', pavimentoId: 'pav1', apartamento: 'Apto 102' },
    ]
    const fichas: Record<string, Array<{ situacao: 'nada' | 'andamento' | 'liberado' | 'reprovado' }>> = {
      a1: [{ situacao: 'liberado' }, { situacao: 'andamento' }],
      a2: [{ situacao: 'reprovado' }, { situacao: 'nada' }],
      a3: [{ situacao: 'nada' }],
      a4: [{ situacao: 'liberado' }],
      a5: [{ situacao: 'andamento' }],
    }
    const insp = (r: 'C' | 'NC') => ({ pecaId: 'x', pavimentoId: 'p', fichaCodigo: 'A', fichaTitulo: 'A', resultado: r, quando: '' })
    const inspecoes: Record<string, ReturnType<typeof insp>[]> = { a1: [insp('C'), insp('C')], a2: [insp('NC')], a4: [insp('C')] }
    const linhas = andamentoDosApartamentos(comodos, (id) => fichas[id] ?? [], (id) => inspecoes[id] ?? [], (id) => (id === 'pav1' ? 1 : 2))
    expect(linhas.map((l) => [l.apartamento, l.comodos, l.fichas, l.liberadas, l.comNc, l.c, l.nc])).toEqual([
      ['Apto 101', 1, 1, 1, 0, 1, 0],
      ['Sem apartamento', 1, 1, 0, 0, 0, 0],
      ['Apto 201', 2, 3, 1, 1, 2, 1],
    ])
  })
})

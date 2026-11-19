import { describe, expect, it } from 'vitest'
import { agruparPorFicha, listarParaLancar, passosDoItem, planilhaDeLancamento, type EntradaDeLancamento, type LinhaDeLancamento } from './lancamento'
import type { EventoFvs, Ficha, FichaCampo } from './situacao'

/** Nome de sistema oficial só para os testes (os galhos de verdade ficam em src/integracoes/). */
const SISTEMA = 'Sistema Exemplo'

const ficha: Ficha = {
  id: 'f1',
  codigo: 'TESTE-PVS-1',
  titulo: 'Pilares',
  revisao: '0',
  aplica_a: ['P'],
  itens: [
    { n: 1, etapa: 'INÍCIO', titulo: 'Local limpo' },
    { n: 2, etapa: 'EXECUÇÃO', titulo: 'Prumo' },
  ],
}

let seq = 0
function ev(resultado: EventoFvs['resultado'], rodada = 1, extra: Partial<EventoFvs> = {}): EventoFvs {
  seq++
  return {
    id: `e${String(seq).padStart(4, '0')}`,
    elemento_id: 'p1',
    ficha_id: 'f1',
    item: 1,
    resultado,
    rodada,
    observacao: null,
    lote_id: null,
    planta_id: null,
    usuario_id: 'u1',
    criado_em_dispositivo: `2026-11-06T10:${String(Math.floor(seq / 60) % 60).padStart(2, '0')}:${String(seq % 60).padStart(2, '0')}.000Z`,
    ...extra,
  }
}
const doSistema = (r: EventoFvs['resultado'], rodada = 1, extra: Partial<EventoFvs> = {}) => ev(r, rodada, { origem_id: String(seq + 1), verificado_por: 'Pessoa', ...extra })

function entrada(eventos: EventoFvs[], extra: Partial<EntradaDeLancamento> = {}): EntradaDeLancamento {
  const ids = [...new Set(eventos.map((e) => e.elemento_id))]
  const eventosDe = new Map<string, EventoFvs[]>()
  for (const e of eventos) eventosDe.set(e.elemento_id, [...(eventosDe.get(e.elemento_id) ?? []), e])
  return {
    pecas: ids.map((id) => ({ id, tipo: 'P', nome: id.toUpperCase(), pavimento_id: 'pav1' })),
    pavimentos: [{ id: 'pav0', nome: 'Subsolo' }, { id: 'pav1', nome: 'Pilotis' }],
    eventosDe,
    fichaPorId: new Map([['f1', ficha]]),
    fichasCampoDe: new Map(),
    quem: (e) => e.verificado_por ?? 'Pessoa do app',
    ...extra,
  }
}
const passos = (eventos: EventoFvs[]) => passosDoItem(eventos).map((e) => [e.resultado, e.rodada, e.observacao])

describe('passos que faltam lançar em um item', () => {
  it('o que veio do sistema oficial já está lá: não entra', () => {
    expect(passos([doSistema('C')])).toEqual([])
    expect(listarParaLancar(entrada([doSistema('C')]))).toEqual([])
  })

  it('marcado no app depois do sistema oficial: entra só o do app', () => {
    expect(passos([doSistema('NC'), ev('C', 2)])).toEqual([['C', 2, null]])
  })

  it('trocar o resultado na mesma rodada é um passo só, com o último', () => {
    expect(passos([ev('C'), ev('NA')])).toEqual([['NA', 1, null]])
  })

  it('R e reinspeção são dois passos, na ordem', () => {
    expect(passos([ev('NC', 1, { observacao: 'Falha' }), ev('C', 2)])).toEqual([['NC', 1, 'Falha'], ['C', 2, null]])
  })

  it('o "O que fazer?" fica no passo do R, mesmo que venha em registro seguinte', () => {
    expect(passos([ev('NC'), ev('NC', 1, { observacao: 'Falha' })])).toEqual([['NC', 1, 'Falha']])
    expect(passos([ev('NC', 1, { observacao: 'Falha' }), ev('NC')])).toEqual([['NC', 1, 'Falha']])
    expect(passos([ev('NC', 1, { observacao: 'Antes' }), ev('NC', 1, { observacao: 'Depois' })])).toEqual([['NC', 1, 'Depois']])
  })

  it('marcado e desmarcado no app, sem nada no sistema oficial: não há o que lançar', () => {
    expect(passos([ev('C'), ev(null)])).toEqual([])
    expect(passos([ev('NC'), ev(null)])).toEqual([])
    expect(passos([ev(null)])).toEqual([])
  })

  it('desmarcou no app o que veio do sistema oficial: lá continua marcado, então avisa', () => {
    expect(passos([doSistema('C'), ev(null)])).toEqual([[null, 1, null]])
  })

  it('desmarcou e marcou de novo: vale o novo', () => {
    expect(passos([doSistema('C'), ev(null), ev('NA')])).toEqual([['NA', 1, null]])
    expect(passos([ev('C'), ev(null), ev('NC')])).toEqual([['NC', 1, null]])
  })

  it('a ordem é a das datas, não a de chegada', () => {
    const r = ev('NC')
    const a = ev('C', 2)
    expect(passos([a, r])).toEqual([['NC', 1, null], ['C', 2, null]])
  })
})

describe('lista para lançar', () => {
  it('leva o que a pessoa precisa para achar a ficha e marcar o item', () => {
    const fc: FichaCampo = {
      id: 'fc1',
      elemento_id: 'p1',
      ficha_id: 'f1',
      codigo: 'FVS-0910',
      local: 'x',
      ficha_codigo: 'TESTE-PVS-1',
      ficha_titulo: 'Pilares',
      status: 'Em Andamento',
      inspetor: null,
      atualizada_em: null,
      qtd_a: 0,
      qtd_r: 0,
      qtd_na: 0,
    }
    const [l, ...resto] = listarParaLancar(entrada([ev('NC', 1, { item: 2, ficha_campo_id: 'fc1', observacao: 'Falha' })], { fichasCampoDe: new Map([['p1', [fc]]]) }))
    expect(resto).toEqual([])
    expect([l.pavimentoNome, l.pecaNome, l.fichaCodigo, l.fichaCampoCodigo, l.item, l.etapa, l.itemTitulo, l.resultado, l.rodada, l.quem, l.observacao]).toEqual(
      ['Pilotis', 'P1', 'TESTE-PVS-1', 'FVS-0910', 2, 'EXECUÇÃO', 'Prumo', 'NC', 1, 'Pessoa do app', 'Falha'],
    )
  })

  it('peça sem ficha no sistema oficial fica sem código', () => {
    expect(listarParaLancar(entrada([ev('C')]))[0].fichaCampoCodigo).toBeNull()
  })

  it('o que já foi lançado sai da lista, sem depender da data', () => {
    const a = ev('C', 1, { criado_em_dispositivo: '2026-11-07T10:00:00.000Z' })
    // celular sem internet: chega depois, com data anterior à do que já foi lançado
    const atrasado = ev('C', 1, { item: 2, criado_em_dispositivo: '2026-11-06T10:00:00.000Z' })
    expect(listarParaLancar(entrada([a, atrasado]), new Set([a.id])).map((l) => l.item)).toEqual([2])
    expect(listarParaLancar(entrada([a, atrasado]), null).length).toBe(2)
  })

  it('passo que muda depois de lançado volta para a lista', () => {
    const a = ev('C')
    const trocou = ev('NA')
    const l = listarParaLancar(entrada([a, trocou]), new Set([a.id]))
    expect(l.map((x) => [x.resultado, x.eventoId])).toEqual([['NA', trocou.id]])
    expect(listarParaLancar(entrada([a, trocou]), new Set([trocou.id]))).toEqual([])
  })

  it('em ordem: pavimento, peça em ordem de número, item e rodada', () => {
    const l = listarParaLancar(
      entrada([ev('C', 1, { elemento_id: 'p10' }), ev('C', 1, { elemento_id: 'p2', item: 2 }), ev('NC', 1, { elemento_id: 'p2' }), ev('C', 2, { elemento_id: 'p2' })]),
    )
    expect(l.map((x) => [x.pecaNome, x.item, x.rodada])).toEqual([['P2', 1, 1], ['P2', 1, 2], ['P2', 2, 1], ['P10', 1, 1]])
  })

  it('agrupa por peça e ficha, que é a tela aberta no sistema oficial', () => {
    const l = listarParaLancar(entrada([ev('C'), ev('C', 1, { item: 2 }), ev('C', 1, { elemento_id: 'p2' })]))
    expect(agruparPorFicha(l).map((g) => [g.pecaNome, g.linhas.length])).toEqual([['P1', 2], ['P2', 1]])
  })

  it('ficha fora do cadastro não quebra', () => {
    expect(listarParaLancar(entrada([ev('C', 1, { ficha_id: 'outra' })]))).toEqual([])
  })
})

describe('planilha', () => {
  const linha = (extra: Partial<LinhaDeLancamento> = {}): LinhaDeLancamento => ({ ...listarParaLancar(entrada([ev('NC', 1, { observacao: 'Falha' })]))[0], ...extra })

  it('abre certo no Excel: marca de UTF-8, ponto e vírgula, uma linha por passo', () => {
    const t = planilhaDeLancamento([linha()], SISTEMA)
    expect(t.charCodeAt(0)).toBe(0xfeff)
    const [cab, corpo, fim] = t.slice(1).split('\r\n')
    expect(cab.split(';')[0]).toBe('Pavimento')
    expect(cab.split(';').length).toBe(corpo.split(';').length)
    expect(corpo).toContain('Pilotis;P1;TESTE-PVS-1;Pilares;abrir ficha nova;1;INÍCIO;Local limpo;NC;V01;')
    expect(corpo).toContain(';Pessoa do app;Falha')
    expect(fim).toBe('')
  })

  it('não deixa texto de campo virar fórmula nem quebrar colunas', () => {
    const f = planilhaDeLancamento([linha({ observacao: '=HYPERLINK("http://x")' })], SISTEMA).split('\r\n')[1]
    expect(f.endsWith(`"'=HYPERLINK(""http://x"")"`)).toBe(true)
    expect(planilhaDeLancamento([linha({ observacao: '-1+1' })], SISTEMA)).toContain(";'-1+1")
    expect(planilhaDeLancamento([linha({ observacao: 'a;b' })], SISTEMA)).toContain('"a;b"')
    expect(planilhaDeLancamento([linha({ observacao: 'duas\nlinhas' })], SISTEMA)).toContain('duas linhas')
  })

  it('desmarcar aparece escrito', () => {
    expect(planilhaDeLancamento([linha({ resultado: null })], SISTEMA)).toContain(';desmarcar;')
  })
})

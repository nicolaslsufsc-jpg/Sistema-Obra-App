import { describe, expect, it } from 'vitest'
import {
  destinoDaPeca,
  filtrarReprovacoes,
  listarReprovacoes,
  plantaPreferida,
  rotuloDaReprovacao,
  SEM_FILTRO,
  textoDaLista,
  trechoDoLocal,
  type EntradaDaLista,
  type PlantaDaLista,
  type Reprovacao,
} from './reprovacoes'
import type { EventoFvs, Ficha, FichaCampo } from './situacao'
import { agruparTratativas } from './tratativas'

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
function ev(peca: string, item: number, resultado: EventoFvs['resultado'], rodada = 1, extra: Partial<EventoFvs> = {}): EventoFvs {
  seq++
  return {
    id: `e${String(seq).padStart(4, '0')}`,
    elemento_id: peca,
    ficha_id: 'f1',
    item,
    resultado,
    rodada,
    observacao: null,
    lote_id: null,
    planta_id: null,
    usuario_id: 'u1',
    criado_em_dispositivo: `2026-10-${String(1 + Math.floor(seq / 60)).padStart(2, '0')}T10:${String(seq % 60).padStart(2, '0')}:00.000Z`,
    ...extra,
  }
}

function lista(eventos: EventoFvs[], extra: Partial<EntradaDaLista> = {}): Reprovacao[] {
  const pecas = [...new Set(eventos.map((e) => e.elemento_id))].map((id) => ({ id, tipo: 'P', nome: id.toUpperCase(), pavimento_id: 'pav1' }))
  const eventosDe = new Map<string, EventoFvs[]>()
  for (const e of eventos) eventosDe.set(e.elemento_id, [...(eventosDe.get(e.elemento_id) ?? []), e])
  return listarReprovacoes({
    pecas,
    eventosDe,
    fichaPorId: new Map([['f1', ficha]]),
    fichasCampoDe: new Map(),
    fotosDe: new Map(),
    quem: (e) => e.verificado_por ?? e.usuario_id,
    ...extra,
  })
}

describe('lista de reprovações', () => {
  it('tratativa (25/11): vale a da rodada; aceito sob concessão sai dos abertos sem reinspeção', () => {
    const r1 = ev('p1', 2, 'NC', 1)
    const r2 = ev('p1', 2, 'NC', 1, { observacao: 'Fora de prumo' })
    const tratativasDe = agruparTratativas([
      { id: 't1', evento_nc_id: r1.id, responsavel: 'Empreiteiro Exemplo', prazo: '2026-12-01', criado_em_dispositivo: '2026-10-02T10:00:00Z' },
    ])
    const [aberta] = lista([r1, r2], { tratativasDe })
    expect(aberta.aberta).toBe(true)
    expect(aberta.tratativa?.responsavel).toBe('Empreiteiro Exemplo')
    expect(aberta.eventosNc).toEqual([r1.id, r2.id])
    expect(textoDaLista([aberta], 'NC', () => '3º')).toContain('Quem resolve: Empreiteiro Exemplo')

    const comConcessao = agruparTratativas([
      { id: 't1', evento_nc_id: r1.id, responsavel: 'A', criado_em_dispositivo: '2026-10-02T10:00:00Z' },
      { id: 't2', evento_nc_id: r2.id, responsavel: 'A', concessao: true, concessao_por: 'Engenheiro', criado_em_dispositivo: '2026-10-02T11:00:00Z' },
    ])
    const [fechada] = lista([r1, r2], { tratativasDe: comConcessao })
    expect([fechada.aberta, fechada.concessao, fechada.reinspecao]).toEqual([false, true, null])
    expect(rotuloDaReprovacao(fechada)).toBe('NC V01 · concessão')
    expect(filtrarReprovacoes([fechada], SEM_FILTRO, () => null)).toEqual([])
  })

  it('item com NC no último registro está aberto, com o texto, quem marcou e quando', () => {
    const r = ev('p1', 2, 'NC', 1, { observacao: 'Fora de prumo', verificado_por: 'Pessoa Um' })
    const [linha, ...resto] = lista([ev('p1', 1, 'C'), r])
    expect(resto).toEqual([])
    expect(linha.aberta).toBe(true)
    expect(linha.reinspecao).toBeNull()
    expect([linha.pecaNome, linha.item, linha.itemTitulo, linha.etapa]).toEqual(['P1', 2, 'Prumo', 'EXECUÇÃO'])
    expect([linha.observacao, linha.quem, linha.quando]).toEqual(['Fora de prumo', 'Pessoa Um', r.criado_em_dispositivo])
    expect(rotuloDaReprovacao(linha)).toBe('NC V01')
  })

  it('R reinspecionado com A ou NA sai dos abertos e guarda o R e a reinspeção', () => {
    const r = ev('p1', 2, 'NC', 1, { observacao: 'Falha', verificado_por: 'Pessoa Um' })
    const a = ev('p1', 2, 'NA', 2, { verificado_por: 'Pessoa Dois' })
    const [linha] = lista([r, a])
    expect(linha.aberta).toBe(false)
    expect(linha.quem).toBe('Pessoa Um')
    expect(linha.observacao).toBe('Falha')
    expect(linha.reinspecao).toEqual({ resultado: 'NA', rodada: 2, quando: a.criado_em_dispositivo, quem: 'Pessoa Dois' })
    expect(rotuloDaReprovacao(linha)).toBe('NA V02')
  })

  it('R de novo na reinspeção continua aberto, na rodada nova', () => {
    const [linha] = lista([ev('p1', 2, 'NC', 1, { observacao: 'Antes' }), ev('p1', 2, 'NC', 2, { observacao: 'Depois' })])
    expect([linha.aberta, linha.rodada, linha.observacao]).toEqual([true, 2, 'Depois'])
    expect(rotuloDaReprovacao(linha)).toBe('NC V02')
  })

  it('R desmarcado por engano não é reprovação', () => {
    expect(lista([ev('p1', 2, 'NC'), ev('p1', 2, null)])).toEqual([])
  })

  it('item sem R não entra', () => {
    expect(lista([ev('p1', 1, 'C'), ev('p1', 2, 'NA')])).toEqual([])
  })

  it('o texto do "O que fazer?" vale mesmo se o último registro da rodada não tiver texto', () => {
    const [linha] = lista([ev('p1', 2, 'NC', 1, { observacao: 'Falha' }), ev('p1', 2, 'NC', 1, { observacao: null })])
    expect(linha.observacao).toBe('Falha')
  })

  it('não mistura a observação de uma rodada anterior', () => {
    const [linha] = lista([ev('p1', 2, 'NC', 1, { observacao: 'Antes' }), ev('p1', 2, 'NC', 2)])
    expect(linha.observacao).toBeNull()
  })

  it('ficha duplicada: cada ficha aberta tem a sua linha', () => {
    const aberta = (id: string): FichaCampo => ({
      id,
      elemento_id: 'p1',
      ficha_id: 'f1',
      codigo: `FVS-${id}`,
      local: 'Mezanino \\ Trecho 2 \\ Pilares \\ P1',
      ficha_codigo: 'TESTE-PVS-1',
      ficha_titulo: 'Pilares',
      status: 'Em Andamento',
      inspetor: null,
      atualizada_em: null,
      qtd_a: 0,
      qtd_r: 0,
      qtd_na: 0,
    })
    const l = lista([ev('p1', 2, 'NC', 1, { ficha_campo_id: 'a' }), ev('p1', 2, 'C', 2, { ficha_campo_id: 'a' }), ev('p1', 2, 'NC', 1, { ficha_campo_id: 'b' })], {
      fichasCampoDe: new Map([['p1', [aberta('a'), aberta('b')]]]),
    })
    expect(l.map((r) => [r.fichaCampoId, r.fichaCampoCodigo, r.aberta, r.fichasNaPeca]).sort()).toEqual([
      ['a', 'FVS-a', false, 2],
      ['b', 'FVS-b', true, 2],
    ])
    expect(l[0].local).toContain('Trecho 2')
  })

  it('fotos de todos os registros R da rodada, e só dela', () => {
    const r1 = ev('p1', 2, 'NC', 1)
    const r2 = ev('p1', 2, 'NC', 2)
    const r3 = ev('p1', 2, 'NC', 2, { observacao: 'Texto' })
    const [linha] = lista([r1, r2, r3], { fotosDe: new Map([[r1.id, ['antiga']], [r2.id, ['foto']], [r3.id, ['outra']]]) })
    expect(linha.fotos).toEqual(['foto', 'outra'])
  })

  it('da mais recente para a mais antiga', () => {
    const l = lista([ev('p1', 1, 'NC'), ev('p2', 1, 'NC'), ev('p3', 1, 'NC')])
    expect(l.map((r) => r.pecaId)).toEqual(['p3', 'p2', 'p1'])
  })

  it('ficha que não está no cadastro não quebra a lista', () => {
    expect(lista([ev('p1', 1, 'NC', 1, { ficha_id: 'outra' })])).toEqual([])
  })

  it('item que saiu da ficha aparece pelo número', () => {
    expect(lista([ev('p1', 9, 'NC')])[0].itemTitulo).toBe('Item 9')
  })

  it('500 reprovações saem rápido (critério: abrir em menos de 1 s)', () => {
    const eventos: EventoFvs[] = []
    for (let p = 0; p < 500; p++) {
      for (let i = 0; i < 20; i++) eventos.push(ev(`p${p}`, 1 + (i % 2), i === 0 ? 'NC' : 'C', 1, i === 0 ? {} : { item: 2 }))
    }
    const t = performance.now()
    const l = lista(eventos)
    expect(l.length).toBe(500)
    expect(performance.now() - t).toBeLessThan(500)
  })
})

describe('lista em texto, para mandar à equipe', () => {
  it('traz a peça, onde está, o item, o que fazer e quem marcou', () => {
    const l = lista([ev('p1', 1, 'NC', 1, { observacao: 'Trocar a fôrma', verificado_por: 'Pessoa Um' }), ev('p2', 2, 'NC', 1, { verificado_por: 'Pessoa Dois' })])
    const texto = textoDaLista(l, 'Reprovações abertas · TESTE', (r) => (r.pecaNome === 'P1' ? '3º · Trecho 1' : '3º · Trecho 2'))
    const [titulo, ...blocos] = texto.split('\n\n')
    expect(titulo).toBe('Reprovações abertas · TESTE')
    expect(blocos.length).toBe(2)
    const doP1 = blocos.find((b) => b.includes('P1'))!
    expect(doP1.split('\n')).toEqual(['*P1* · 3º · Trecho 1', '1. Local limpo', 'O que fazer: Trocar a fôrma', 'NC V01 · Pessoa Um'])
    // sem texto, a linha do "o que fazer" não aparece vazia
    const doP2 = blocos.find((b) => b.includes('P2'))!
    expect(doP2).not.toContain('O que fazer')
  })

  it('reinspecionada mostra o resultado novo e quem reinspecionou', () => {
    const l = lista([ev('p1', 1, 'NC', 1, { verificado_por: 'Pessoa Um' }), ev('p1', 1, 'C', 2, { verificado_por: 'Pessoa Dois' })])
    expect(textoDaLista(l, 'T', () => '3º')).toContain('C V02 · Pessoa Dois')
  })
})

describe('filtros da lista', () => {
  const r1 = ev('p1', 1, 'NC', 1, { verificado_por: 'Pessoa Um', ficha_campo_id: null })
  const r2 = ev('p2', 1, 'NC', 1, { verificado_por: 'Pessoa Dois' })
  const r2a = ev('p2', 1, 'C', 2, { verificado_por: 'Pessoa Tres' })
  const base = lista([r1, r2, r2a])
  const nomes = (f: Partial<typeof SEM_FILTRO>, trecho: (r: Reprovacao) => string | null = () => null) =>
    filtrarReprovacoes(base, { ...SEM_FILTRO, ...f }, trecho).map((r) => r.pecaId)

  it('por padrão, só as abertas', () => {
    expect(nomes({})).toEqual(['p1'])
    expect(nomes({ situacao: 'reinspecionadas' })).toEqual(['p2'])
    expect(nomes({ situacao: 'todas' }).sort()).toEqual(['p1', 'p2'])
  })

  it('por quem marcou o R ou quem reinspecionou', () => {
    expect(nomes({ situacao: 'todas', quem: 'Pessoa Dois' })).toEqual(['p2'])
    expect(nomes({ situacao: 'todas', quem: 'Pessoa Tres' })).toEqual(['p2'])
    expect(nomes({ situacao: 'todas', quem: 'Ninguém' })).toEqual([])
  })

  it('por pavimento e trecho', () => {
    expect(nomes({ situacao: 'todas', pavimentoId: 'outro' })).toEqual([])
    expect(nomes({ situacao: 'todas', trecho: 'Trecho 1' }, (r) => (r.pecaId === 'p2' ? 'Trecho 1' : null))).toEqual(['p2'])
  })
})

describe('caminho até a peça', () => {
  const pl = (id: string, trecho: string, disciplina = 'estrutura'): PlantaDaLista => ({ id, trecho, disciplina })
  const plantas = [pl('t1', 'Trecho 1'), pl('t2', 'Trecho 2'), pl('amb', 'Ambientes', 'arquitetura')]
  const linha = (extra: Partial<Reprovacao> = {}): Reprovacao => ({ ...lista([ev('p1', 1, 'NC')])[0], ...extra })
  const aparelho = (ids: string[], pecas: Record<string, string[]> = {}) => [new Map(Object.entries(pecas)), new Set(ids)] as const

  it('trecho escrito no local do sistema oficial', () => {
    expect(trechoDoLocal('Mezanino \\ Trecho 2 \\ Pilares \\ P100')).toBe('Trecho 2')
    expect(trechoDoLocal('Torre \\ 2° Pavimento \\ Residencial D - Pilares \\ P100')).toBeNull()
    expect(trechoDoLocal(null)).toBeNull()
  })

  it('a planta em que foi marcada vale mais que o local', () => {
    expect(plantaPreferida(linha({ plantaMarcada: 't1', local: 'X \\ Trecho 2 \\ P1' }), plantas)?.id).toBe('t1')
    expect(plantaPreferida(linha({ plantaMarcada: 'antiga', local: 'X \\ Trecho 2 \\ P1' }), plantas)?.id).toBe('t2')
    expect(plantaPreferida(linha(), plantas)).toBeUndefined()
  })

  it('peça em planta do aparelho: abre, preferindo o trecho certo', () => {
    const [pecas, ids] = aparelho(['t1', 't2'], { p1: ['t1', 't2'] })
    expect(destinoDaPeca(linha({ local: 'X \\ Trecho 2 \\ P1' }), plantas, pecas, ids)).toEqual({ tipo: 'abrir', plantaId: 't2' })
    expect(destinoDaPeca(linha(), plantas, pecas, ids)).toEqual({ tipo: 'abrir', plantaId: 't1' })
  })

  it('o local diz um trecho, mas a peça está noutro do aparelho: abre onde ela está', () => {
    const [pecas, ids] = aparelho(['t1', 't2'], { p1: ['t1'] })
    expect(destinoDaPeca(linha({ local: 'X \\ Trecho 2 \\ P1' }), plantas, pecas, ids)).toEqual({ tipo: 'abrir', plantaId: 't1' })
  })

  it('trecho conhecido fora do aparelho: oferece baixar só ele', () => {
    const [pecas, ids] = aparelho(['t1'])
    const d = destinoDaPeca(linha({ local: 'X \\ Trecho 2 \\ P1' }), plantas, pecas, ids)
    expect(d).toEqual({ tipo: 'baixar', plantas: [plantas[1]] })
  })

  it('sem pista do trecho: oferece os trechos que faltam, sem a planta de ambientes', () => {
    const [pecas, ids] = aparelho(['t1'])
    expect(destinoDaPeca(linha(), plantas, pecas, ids)).toEqual({ tipo: 'baixar', plantas: [plantas[1]] })
    const [p2, i2] = aparelho([])
    expect(destinoDaPeca(linha(), plantas, p2, i2)).toEqual({ tipo: 'baixar', plantas: [plantas[0], plantas[1]] })
  })

  it('tudo no aparelho e a peça em nenhuma planta: avisa', () => {
    const [pecas, ids] = aparelho(['t1', 't2'])
    expect(destinoDaPeca(linha(), plantas, pecas, ids)).toEqual({ tipo: 'sem_planta' })
    expect(destinoDaPeca(linha(), [], pecas, ids)).toEqual({ tipo: 'sem_planta' })
  })

  it('ambiente vai para a planta de ambientes', () => {
    const [pecas, ids] = aparelho(['t1', 't2'])
    expect(destinoDaPeca(linha({ tipo: 'A' }), plantas, pecas, ids)).toEqual({ tipo: 'baixar', plantas: [plantas[2]] })
  })
})

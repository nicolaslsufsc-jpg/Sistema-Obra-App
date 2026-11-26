import { describe, expect, it } from 'vitest'
import { lerRegras } from './regras'
import { avisoDaUnidadeAnterior, ehDeGrupo, itensCDoLocal, observacoesDoLocal, outrosDoGrupo, unidadeDeGrupo, type LocalDoGrupo } from './unidade'
import type { EventoFvs } from './situacao'

const regras = lerRegras({
  unidades: [
    { id: 'u1', ficha: 'EXE-PVS-01', unidade: 'pavimento', desde: '2026-11-01' },
    { id: 'u2', ficha: 'EXE-PVS-02', unidade: 'ambiente', desde: '2026-11-01' },
    { id: 'u3', ficha: 'EXE-PVS-02', unidade: 'trecho', desde: '2026-11-25' },
    { id: 'u4', ficha: 'EXE-PVS-03', unidade: 'peca', desde: '2026-11-01' },
  ],
})

describe('unidade de conferência nas telas (ideia 14)', () => {
  it('só trecho, área e pavimento são de grupo', () => {
    expect(ehDeGrupo('trecho') && ehDeGrupo('area') && ehDeGrupo('pavimento')).toBe(true)
    expect(ehDeGrupo('peca') || ehDeGrupo('parede') || ehDeGrupo('ambiente') || ehDeGrupo(null)).toBe(false)
  })

  it('obra sem unidades (como a de hoje) não tem grupo em ficha nenhuma', () => {
    const sem = lerRegras({ prazos: [], ligacoes: [] })
    expect(unidadeDeGrupo(sem, 'EXE-PVS-01', '2026-11-26')).toBeNull()
    expect(avisoDaUnidadeAnterior(sem, 'EXE-PVS-01', ['2026-11-10T10:00:00Z'], '2026-11-26')).toBeNull()
  })

  it('a unidade de grupo vale a partir do "desde"; peça, parede e ambiente seguem como sempre', () => {
    expect(unidadeDeGrupo(regras, 'EXE-PVS-01', '2026-11-26')).toBe('pavimento')
    expect(unidadeDeGrupo(regras, 'EXE-PVS-02', '2026-11-24')).toBeNull() // ainda por ambiente
    expect(unidadeDeGrupo(regras, 'EXE-PVS-02', '2026-11-25')).toBe('trecho')
    expect(unidadeDeGrupo(regras, 'EXE-PVS-03', '2026-11-26')).toBeNull()
    expect(unidadeDeGrupo(regras, undefined, '2026-11-26')).toBeNull()
  })

  const locais: LocalDoGrupo[] = [
    { id: 'a1', tipo: 'A', naPlanta: true, pavimentoId: 'pv1' },
    { id: 'a2', tipo: 'A', naPlanta: true, pavimentoId: 'pv1' },
    { id: 'a3', tipo: 'A', naPlanta: false, pavimentoId: 'pv1' }, // outro trecho do mesmo pavimento
    { id: 'a4', tipo: 'A', naPlanta: false, pavimentoId: 'pv2' },
    { id: 'p1', tipo: 'P', naPlanta: true, pavimentoId: 'pv1' },
  ]

  it('trecho: os outros do mesmo tipo na planta aberta', () => {
    expect(outrosDoGrupo('trecho', locais[0], locais)).toEqual(['a2'])
  })

  it('pavimento: os outros do mesmo tipo no pavimento, de qualquer trecho', () => {
    expect(outrosDoGrupo('pavimento', locais[0], locais)).toEqual(['a2', 'a3'])
  })

  it('área: os do mesmo tipo dentro da área desenhada que contém o local; fora de área, ninguém', () => {
    const areas = new Map([['ar1', ['a1', 'a2', 'p1']], ['ar2', ['a3']]])
    expect(outrosDoGrupo('area', locais[0], locais, areas)).toEqual(['a2'])
    expect(outrosDoGrupo('area', locais[3], locais, areas)).toEqual([])
  })

  it('local com registro de antes da troca ganha "Conferido por ambiente até 25/11"', () => {
    expect(avisoDaUnidadeAnterior(regras, 'EXE-PVS-02', ['2026-11-20T13:00:00Z', '2026-11-26T09:00:00Z'], '2026-11-26')).toBe('Conferido por ambiente até 25/11')
  })

  it('sem registro de antes da troca, ou sem troca, não há aviso', () => {
    expect(avisoDaUnidadeAnterior(regras, 'EXE-PVS-02', ['2026-11-26T09:00:00Z'], '2026-11-26')).toBeNull()
    expect(avisoDaUnidadeAnterior(regras, 'EXE-PVS-02', [], '2026-11-26')).toBeNull()
    expect(avisoDaUnidadeAnterior(regras, 'EXE-PVS-01', ['2026-11-10T10:00:00Z'], '2026-11-26')).toBeNull()
    // antes de a troca valer, a tela ainda é a antiga: sem aviso
    expect(avisoDaUnidadeAnterior(regras, 'EXE-PVS-02', ['2026-11-20T13:00:00Z'], '2026-11-24')).toBeNull()
  })

  // revisão de 25/11 (QUAL-3): o pincel mandava ao grupo todos os itens da ficha
  const ev = (item: number, resultado: string | null, criado: string, ficha = 'f1') =>
    ({ id: `${ficha}-${item}-${criado}`, ficha_id: ficha, item, resultado, rodada: 1, criado_em_dispositivo: criado }) as unknown as EventoFvs

  it('ao grupo vão só os itens que ficaram C no local tocado: NC e NA do local não viram C nos outros', () => {
    const antes = [ev(1, 'C', '2026-11-20T10:00:00Z'), ev(2, 'NC', '2026-11-20T10:00:00Z'), ev(3, 'NA', '2026-11-20T10:00:00Z'), ev(9, 'C', '2026-11-20T10:00:00Z', 'f2')]
    const doToque = [ev(4, 'C', '2026-11-25T21:00:00Z')]
    // pedidos 1 a 5: 1 já era C, 4 virou C agora; 2 (NC), 3 (NA) e 5 (vazio, ficou de fora do toque) não vão
    expect(itensCDoLocal('f1', [...antes, ...doToque], [1, 2, 3, 4, 5])).toEqual([1, 4])
    // o item 2 reinspecionado para C conta; outra ficha não conta
    expect(itensCDoLocal('f1', [...antes, ev(2, 'C', '2026-11-25T22:00:00Z')], [2, 9])).toEqual([2])
  })

  it('"Marcado antes do prazo" aceito no local vai, item por item, ao grupo', () => {
    const prazo = new Map([['a1#2', 'Marcado antes do prazo (escoramento)'], ['a1#3', 'Marcado antes do prazo (reescoramento)'], ['a10#2', 'outro local']])
    expect([...observacoesDoLocal('a1', prazo)]).toEqual([[2, 'Marcado antes do prazo (escoramento)'], [3, 'Marcado antes do prazo (reescoramento)']])
    expect(observacoesDoLocal('a2', prazo).size).toBe(0)
  })
})

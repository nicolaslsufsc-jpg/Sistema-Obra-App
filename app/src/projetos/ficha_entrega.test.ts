// Ficha de entrega no formato do formulário da obra (23/11/2026). Obra fictícia EXE.
import { describe, expect, it } from 'vitest'
import type { Linha } from '../nucleo/banco_local'
import { disciplinasDaFicha, lerModelo, linhasDaFicha, modeloDasLinhas, paginasDaFicha } from './ficha_entrega'

const MODELO = {
  titulo: ['LISTA DE PROJETOS', 'CONTROLE DE DISTRIBUIÇÃO'],
  referencia: 'EXE-FOR-001',
  emissao: '01/01/2026',
  revisao: '01/01/2026',
  versao: '00',
  tipo: 'FORMULÁRIO',
  setores: 'ENGENHARIA',
  empresa: 'Construtora Exemplo',
  disciplinas: [
    { nome: 'Arquitetônico', siglas: ['ar'] },
    { nome: 'Estrutural', siglas: ['ES'] },
    { nome: 'Outros', siglas: [], outros: true },
  ],
}

describe('ficha de entrega: modelo da obra', () => {
  it('lê o modelo e confere o formato; sem título ou disciplinas = sem modelo', () => {
    const m = lerModelo(MODELO)!
    expect(m.referencia).toBe('EXE-FOR-001')
    expect(m.disciplinas[0].siglas).toEqual(['AR'])
    expect(m.disciplinas[2].outros).toBe(true)
    expect(m.linhas_por_pagina).toBe(15)
    expect(m.logo).toBeUndefined()
    expect(lerModelo({ ...MODELO, logo: 'javascript:alert(1)' })!.logo).toBeUndefined()
    expect(lerModelo({ ...MODELO, logo: 'data:image/png;base64,AAAA' })!.logo).toBe('data:image/png;base64,AAAA')
    expect(lerModelo({ ...MODELO, titulo: [] })).toBeNull()
    expect(lerModelo({ ...MODELO, disciplinas: [] })).toBeNull()
    expect(lerModelo(null)).toBeNull()
    expect(lerModelo('texto')).toBeNull()
  })
  it('vale a linha mais nova de tipo entrega; apagada não conta', () => {
    const l = (id: string, quando: string, extra: Record<string, unknown> = {}) =>
      ({ id, tipo: 'entrega', criado_em_servidor: quando, modelo: { ...MODELO, referencia: id }, ...extra }) as unknown as Linha
    expect(modeloDasLinhas([l('A', '2026-11-01'), l('B', '2026-11-20'), l('C', '2026-11-25', { apagado: true })])!.referencia).toBe('B')
    expect(modeloDasLinhas([l('A', '2026-11-01'), l('B', '2026-11-20', { modelo: { quebrado: true } })])!.referencia).toBe('A')
    expect(modeloDasLinhas([l('A', '2026-11-01', { tipo: 'outra' })])).toBeNull()
    expect(modeloDasLinhas([])).toBeNull()
  })
})

describe('ficha de entrega: linhas, disciplinas e páginas', () => {
  const d = {
    documentoPorId: new Map([
      ['d1', { id: 'd1', codigo: 'EXE.ES.100.FORPILOTIS', titulo: 'FORMA DO PILOTIS', disciplina_sigla: 'ES', disciplina: 'Estrutura' }],
      ['d2', { id: 'd2', codigo: 'EXE.AR.010.PAVTIPO', titulo: 'PLANTA TIPO', disciplina_sigla: 'AR', disciplina: 'Arquitetura' }],
    ]) as never,
    revisaoPorId: new Map([
      ['r1', { id: 'r1', fase: 'LO', numero: '02' }],
      ['r2', { id: 'r2', fase: 'EX', numero: '04' }],
    ]) as never,
    empresaPorId: new Map([['e1', { id: 'e1', nome: 'Empreiteira Alfa' }]]) as never,
  }
  const ev = (doc: string, rev: string) => ({ id: Math.random().toString(), documento_id: doc, revisao_id: rev, empresa_id: 'e1', colaborador: 'João', data_evento: '2026-11-23' }) as unknown as Linha

  it('uma linha por prancha: as cópias da mesma prancha somam no "Nº de cópias"', () => {
    const l = linhasDaFicha(d, [ev('d1', 'r1'), ev('d1', 'r1'), ev('d2', 'r2')])
    expect(l).toEqual([
      { codigo: 'EXE.ES.100.FORPILOTIS', descricao: 'FORMA DO PILOTIS', versao: 'LO R02', copias: 2, data: '23/11/2026', empreiteira: 'Empreiteira Alfa', nome: 'João' },
      { codigo: 'EXE.AR.010.PAVTIPO', descricao: 'PLANTA TIPO', versao: 'EX R04', copias: 1, data: '23/11/2026', empreiteira: 'Empreiteira Alfa', nome: 'João' },
    ])
  })
  it('marca a caixa pela sigla; o que não tem caixa vai para "Outros" com o nome escrito', () => {
    const m = lerModelo(MODELO)!
    const r = disciplinasDaFicha(m, [
      { disciplina_sigla: 'ES', disciplina: 'Estrutura' },
      { disciplina_sigla: 'FU', disciplina: 'Furação' },
      { disciplina_sigla: 'FU', disciplina: 'Furação' },
    ])
    expect([...r.marcadas]).toEqual(['Estrutural', 'Outros'])
    expect(r.outros).toEqual(['Furação'])
    const sem = disciplinasDaFicha({ disciplinas: [{ nome: 'Estrutural', siglas: ['ES'] }] }, [{ disciplina_sigla: 'FU', disciplina: 'Furação' }])
    expect(sem.marcadas.size).toBe(0)
  })
  it('páginas: completa a última com linhas em branco; nenhuma linha = uma folha em branco', () => {
    expect(paginasDaFicha([1, 2, 3], 2)).toEqual([[1, 2], [3, null]])
    expect(paginasDaFicha([], 3)).toEqual([[null, null, null]])
    expect(paginasDaFicha([1, 2], 2)).toEqual([[1, 2]])
  })
})

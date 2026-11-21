import { describe, expect, it } from 'vitest'
import type { Linha } from '../nucleo/banco_local'
import type { DadosProjetos, Documento } from './dados'
import { ordemPavimento, painelObra, pavimentoDe } from './obra'
import { escritorioPorDocumento, vigentePorDocumento } from './regras'

// obra fictícia EXE
function doc(id: string, disciplina: string, nome_curto: string, titulo: string): Documento {
  return { id, codigo: `EXE.${disciplina.slice(0, 2).toUpperCase()}.${id}.${nome_curto}`, disciplina_sigla: '', disciplina, numero: id, nome_curto, titulo, pasta_autodoc: null, link_pasta: null, busca: '' }
}
function rev(id: string, documento_id: string, fase: string, numero: string, vista_em: string, obsoleta = false): Linha {
  return { id, documento_id, fase, numero, vista_em, obsoleta, apagado: false, criado_em_dispositivo: '2026-11-01T10:00:00Z' } as unknown as Linha
}
function esc(id: string, documento_id: string, revisao_id: string): Linha {
  return { id, documento_id, revisao_id, apagado: false, criado_em_dispositivo: '2026-11-10T10:00:00Z' } as unknown as Linha
}
function montar(docs: Documento[], revs: Linha[], escr: Linha[] = []): DadosProjetos {
  return {
    hoje: '2026-11-21',
    documentos: docs,
    documentoPorId: new Map(docs.map((d) => [d.id, d])),
    revisoesDe: new Map(),
    revisaoPorId: new Map(revs.map((r) => [r.id, r])),
    vigentes: vigentePorDocumento(revs),
    novas: [],
    empresas: [],
    empresaPorId: new Map(),
    eventos: [],
    situacoes: [],
    situacoesDe: new Map(),
    escritorio: escritorioPorDocumento(escr),
  }
}

describe('pavimentoDe', () => {
  it('lê o pavimento do nome curto e do título', () => {
    expect(pavimentoDe({ nome_curto: 'FOR4PAVTIP', titulo: 'PLANTA DE FORMA' })).toBe('4º pavimento')
    expect(pavimentoDe({ nome_curto: 'LAJ12PAVTIP', titulo: '' })).toBe('12º pavimento')
    expect(pavimentoDe({ nome_curto: 'XPTO', titulo: 'PISO DO 3º PAVIMENTO - SETOR A' })).toBe('3º pavimento')
    expect(pavimentoDe({ nome_curto: 'FORPILOTIS', titulo: '' })).toBe('Pilotis')
    expect(pavimentoDe({ nome_curto: 'ESGOTOTERR', titulo: 'ESGOTO DO TÉRREO' })).toBe('Térreo')
    expect(pavimentoDe({ nome_curto: 'LOCBLOCOS', titulo: 'LOCAÇÃO DE BLOCOS' })).toBe('Fundação')
    expect(pavimentoDe({ nome_curto: 'CORTESXXXX', titulo: 'CORTES AA E BB' })).toBe('Geral')
  })
  it('ordena como a obra sobe', () => {
    const p = ['Geral', '10º pavimento', 'Cobertura', '2º pavimento', 'Térreo', 'Fundação']
    expect([...p].sort((a, b) => ordemPavimento(a) - ordemPavimento(b))).toEqual(['Fundação', 'Térreo', '2º pavimento', '10º pavimento', 'Cobertura', 'Geral'])
  })
})

describe('painelObra', () => {
  const docs = [
    doc('1', 'Estrutura', 'FOR4PAVTIP', 'FORMA 4º PAV'),
    doc('2', 'Estrutura', 'FOR5PAVTIP', 'FORMA 5º PAV'),
    doc('3', 'Estrutura', 'FORPILOTIS', 'FORMA PILOTIS'),
    doc('4', 'Hidrossanitário', 'AGUATERREO', 'ÁGUA FRIA TÉRREO'),
    doc('5', 'Hidrossanitário', 'SEMVIGENTE', 'SÓ OBSOLETA'),
  ]
  const revs = [
    rev('r1a', '1', 'EX', '03', '2026-11-03'),
    rev('r1b', '1', 'LO', '01', '2026-11-21'), // nova na última leitura
    rev('r2', '2', 'LO', '00', '2026-11-14'), // veio na leitura anterior: não é nova
    rev('r3', '3', 'LO', '02', '2026-11-21'), // nova
    rev('r4', '4', 'EX', '01', '2026-11-10'),
    rev('r5', '5', 'EX', '01', '2026-11-01', true),
  ]
  const escr = [esc('e1', '1', 'r1a'), esc('e2', '2', 'r2')] // 1 vencida, 2 em dia, 3 e 4 sem registro

  it('conta por disciplina e pavimento, com novas desde a leitura anterior', () => {
    const p = painelObra(montar(docs, revs, escr), { ultima: '2026-11-21', anterior: '2026-11-14' })
    expect(p.criterio).toBe('leitura')
    expect(p.totais).toEqual({ vigentes: 4, novas: 2, escritorioEmDia: 1, escritorioVencida: 1, escritorioSem: 2 })
    expect(p.disciplinas.map((d) => d.disciplina)).toEqual(['Estrutura', 'Hidrossanitário'])
    expect(p.disciplinas[0].pavimentos.map((x) => [x.pavimento, x.vigentes, x.novas])).toEqual([
      ['Pilotis', 1, 1],
      ['4º pavimento', 1, 1],
      ['5º pavimento', 1, 0],
    ])
    expect(p.novas.map((n) => n.documento.id).sort()).toEqual(['1', '3'])
  })

  it('primeira leitura: nada conta como novo', () => {
    const p = painelObra(montar(docs, revs, escr), { ultima: '2026-11-21', anterior: null })
    expect(p.criterio).toBe('primeira')
    expect(p.totais.novas).toBe(0)
  })

  it('sem saber das leituras: últimos 7 dias', () => {
    const p = painelObra(montar(docs, revs, escr), null)
    expect(p.criterio).toBe('7dias')
    expect(p.totais.novas).toBe(3) // 21/11, 21/11 e 14/11
  })

  it('obra sem pranchas', () => {
    const p = painelObra(montar([], []), null)
    expect(p.disciplinas).toEqual([])
    expect(p.totais.vigentes).toBe(0)
  })
})

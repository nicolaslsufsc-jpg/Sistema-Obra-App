// Listas do "Entregar cópia" (22/11/2026). Obra fictícia EXE.
import { describe, expect, it } from 'vitest'
import type { Linha } from '../nucleo/banco_local'
import type { Documento } from './dados'
import { disciplinasParaEntregar, lerCopias, pessoasDaEmpresa, pranchasDaDisciplina } from './entregar'

const doc = (id: string, codigo: string, disciplina: string, titulo: string): Documento => {
  const [, sigla, numero, nome] = codigo.split('.')
  return { id, codigo, disciplina_sigla: sigla, disciplina, numero, nome_curto: nome, titulo, pasta_autodoc: null, link_pasta: null, busca: `${codigo} ${titulo}`.toLowerCase() }
}
const documentos = [
  doc('d1', 'EXE.ES.100.FORPILOTIS', 'Estrutura', 'PLANTA DE FORMA DO PILOTIS'),
  doc('d2', 'EXE.ES.020.PILSUBSOLO', 'Estrutura', 'PILARES DO SUBSOLO'),
  doc('d3', 'EXE.ES.300.SEMVIGENTE', 'Estrutura', 'FOLHA FORA DE USO'),
  doc('d4', 'EXE.AR.010.PAVTIPOXXX', 'Arquitetura', 'PLANTA BAIXA DO PAVIMENTO TIPO'),
  doc('d5', 'EXE.HI.004.AGUAFRIAXX', 'Hidrossanitário', 'ÁGUA FRIA'),
]
const rev = (id: string) => ({ id, fase: 'LO', numero: '01' }) as unknown as Linha
const vigentes = new Map([['d1', rev('r1')], ['d2', rev('r2')], ['d4', rev('r4')]])
const d = { documentos, vigentes }

describe('entregar cópia: listas', () => {
  it('disciplinas: só as que têm prancha com revisão vigente, em ordem', () => {
    expect(disciplinasParaEntregar(d)).toEqual([
      { nome: 'Arquitetura', pranchas: 1 },
      { nome: 'Estrutura', pranchas: 2 },
    ])
  })
  it('pranchas da disciplina: só com vigente, pelo número; a busca ignora acento e caixa', () => {
    expect(pranchasDaDisciplina(d, 'Estrutura').map((x) => x.id)).toEqual(['d2', 'd1'])
    expect(pranchasDaDisciplina(d, 'Estrutura', 'PILOTIS').map((x) => x.id)).toEqual(['d1'])
    expect(pranchasDaDisciplina(d, 'Estrutura', '020').map((x) => x.id)).toEqual(['d2'])
    expect(pranchasDaDisciplina(d, 'Estrutura', 'nada disso')).toEqual([])
    expect(pranchasDaDisciplina(d, 'Hidrossanitário')).toEqual([])
  })
  it('pessoas da empresa: quem já recebeu, do mais frequente; grafias iguais contam juntas', () => {
    const ev = (empresa_id: string, colaborador: string | null, extra: Record<string, unknown> = {}) => ({ id: Math.random().toString(), tipo: 'entrega', empresa_id, colaborador, ...extra }) as unknown as Linha
    const eventos = [
      ev('e1', 'João'), ev('e1', 'Ana'), ev('e1', 'joão '), ev('e1', null), ev('e1', 'Rui', { apagado: true }),
      ev('e1', 'Pedro', { tipo: 'devolucao' }), ev('e2', 'Maria'),
    ]
    expect(pessoasDaEmpresa({ eventos }, 'e1')).toEqual(['João', 'Ana'])
    expect(pessoasDaEmpresa({ eventos }, 'e2')).toEqual(['Maria'])
    expect(pessoasDaEmpresa({ eventos }, 'e3')).toEqual([])
  })
  it('quantas cópias: inteiro de 1 a 20', () => {
    expect([lerCopias('1'), lerCopias(' 3 '), lerCopias('20')]).toEqual([1, 3, 20])
    expect([lerCopias(''), lerCopias('0'), lerCopias('21'), lerCopias('2,5'), lerCopias('duas')]).toEqual([null, null, null, null, null])
  })
})

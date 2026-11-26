import { describe, expect, it } from 'vitest'
import { dataHoraBR, nomeDoArquivoPdf, textoDaCelula, textoDeQuem } from './folha_pdf'
import { EMAIL_SEM_CONTA } from '../nucleo/local'
import { folhaDaFvs } from '../fvs/pdf'
import type { LinhaDaSituacao } from '../fvs/planilha'
import type { Reprovacao } from '../fvs/reprovacoes'

describe('folha do Exportar PDF', () => {
  it('quem gerou: nome do perfil, e-mail, ou o aparelho sem conta', () => {
    expect(textoDeQuem({ id: 'u1', email: 'ana@exemplo.com' }, { u1: 'Ana Souza' })).toBe('Ana Souza')
    expect(textoDeQuem({ id: 'u1', email: 'ana@exemplo.com' }, { u2: 'Outra' })).toBe('ana@exemplo.com')
    expect(textoDeQuem({ id: 'u1', email: 'ana@exemplo.com' }, { u1: '  ' })).toBe('ana@exemplo.com')
    expect(textoDeQuem({ id: 'x', email: EMAIL_SEM_CONTA }, null)).toBe('este aparelho (sem conta)')
  })

  it('data e hora do aparelho e nome do arquivo sem acento', () => {
    const d = new Date(2026, 10, 21, 8, 5)
    expect(dataHoraBR(d)).toBe('21/11/2026 08:05')
    expect(nomeDoArquivoPdf({ modulo: 'FVS', titulo: 'Térreo · Ático' }, 'EXE', d)).toBe('FVS_EXE_Terreo-Atico_2026-11-21')
  })

  it('célula vazia vira travessão e número sai com vírgula', () => {
    expect(textoDaCelula(null)).toBe('—')
    expect(textoDaCelula('')).toBe('—')
    expect(textoDaCelula(0)).toBe('0')
    expect(textoDaCelula(2.5)).toBe('2,5')
    expect(textoDaCelula('P1')).toBe('P1')
  })
})

describe('folha da FVS', () => {
  const linha = (peca: string, situacao: string, extra: Partial<LinhaDaSituacao> = {}): LinhaDaSituacao => ({
    pavimento: 'Térreo',
    tipo: 'Pilar',
    peca,
    secao: '',
    ficha: 'FVS.01',
    situacao,
    a: 3,
    r: 0,
    na: 1,
    vazios: 2,
    conforme: 75,
    ultima: null,
    quem: '',
    fichaNoSistema: '',
    status: '',
    duplicada: false,
    ...extra,
  })
  const rep = (aberta: boolean): Reprovacao =>
    ({
      chave: 'k',
      pecaId: 'p',
      pecaNome: 'P2',
      tipo: 'P',
      pavimentoId: 'pv1',
      fichaId: 'f',
      fichaCodigo: 'FVS.01',
      fichaTitulo: 'Fôrma',
      fichaCampoId: null,
      fichaCampoCodigo: null,
      fichasNaPeca: 1,
      local: null,
      item: 4,
      itemTitulo: 'Prumo',
      etapa: 'Antes',
      rodada: 1,
      observacao: 'Corrigir o prumo',
      quem: 'Ana',
      quando: '2026-11-20T13:00:00Z',
      aberta,
      reinspecao: aberta ? null : { resultado: 'C', rodada: 2, quando: '2026-11-21T13:00:00Z', quem: 'Bia' },
      fotos: [],
    }) as unknown as Reprovacao

  it('resumo por situação, fichas por peça e NCs', () => {
    const f = folhaDaFvs({ titulo: 'Térreo', linhas: [linha('P1', 'Liberado'), linha('P2', 'Reprovado', { r: 1, secao: '20x40' }), linha('P3', 'Liberado')], reprovacoes: [rep(true), rep(false)] })
    expect(f.modulo).toBe('FVS')
    expect(f.resumo).toEqual(['3 fichas', '2 liberado', '1 reprovado', '1 NC aberta'])
    const [fichas, ncs] = f.tabelas
    expect(fichas.colunas[0]).toBe('Tipo')
    expect(fichas.linhas[1].slice(0, 6)).toEqual(['Pilar', 'P2 (20x40)', 'FVS.01', 'Reprovado', 3, 1])
    expect(fichas.linhas[0][8]).toBe('75%')
    // tratativa (25/11): coluna depois do "O que fazer", vazia sem tratativa
    expect(ncs.linhas[0]).toEqual(['Pilar P2', 'FVS.01', '4. Prumo', 'Corrigir o prumo', '', 'V01', expect.stringMatching(/^20\/11\/2026 /), 'Ana', 'Aberta'])
    expect(ncs.linhas[1][8]).toMatch(/^Reinspecionada \(C\) em 21\/11\/2026 .* por Bia$/)
  })

  it('obra inteira: coluna do pavimento nas duas tabelas', () => {
    const f = folhaDaFvs({ titulo: 'Obra inteira', linhas: [linha('P1', 'Liberado')], reprovacoes: [rep(true)], comPavimento: true, nomeDoPavimento: () => 'Térreo' })
    expect(f.tabelas[0].colunas[0]).toBe('Pavimento')
    expect(f.tabelas[0].linhas[0][0]).toBe('Térreo')
    expect(f.tabelas[1].linhas[0][0]).toBe('Térreo')
    expect(f.tabelas[0].curtas).toContain(0)
  })
})

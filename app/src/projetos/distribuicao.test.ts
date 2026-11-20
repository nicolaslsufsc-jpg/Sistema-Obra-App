// Lista de distribuição e "a entregar" (proposta de 20/11/2026). Obra fictícia EXE.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import {
  aEntregar,
  gravarDestinatarios,
  historicoDaRegra,
  lerDestinatarios,
  lerListaDestinatarios,
  mesclarLista,
  regrasAtuais,
  regrasDaFolha,
  type DadosDestinatario,
  type Destinatario,
} from './distribuicao'
import { DISTRIBUICAO_EXE, VIGENTES_EXE } from './exemplo_exe'
import { cruzar, ErroDeArquivo, lerDistribuicao, lerVigentes } from './painel'

const HOJE = '2026-11-14'
const OBRA = 'b0000000-0000-0000-0000-0000000000d1'
const vigentes = lerVigentes(VIGENTES_EXE)
const cruzadas = cruzar(lerDistribuicao(DISTRIBUICAO_EXE), vigentes, HOJE)

let n = 0
const regra = (d: Partial<DadosDestinatario>): Destinatario => ({
  disciplina: 'ESTRUTURAL',
  pasta: '',
  empresa: 'Empreiteira Alfa',
  colaborador: 'João',
  copias: 1,
  ativo: true,
  desde: '2026-01-01',
  ...d,
  id: `r${++n}`,
  substitui_id: null,
  em: '2026-11-14T10:00:00Z',
  usuario: 'eu',
})

describe('qual regra vale para a folha', () => {
  const disc = regra({})
  const pilares = regra({ pasta: 'LO/Pilares', empresa: 'Formas Delta', colaborador: 'Ana' })
  const inativa = regra({ pasta: 'LO/Formas', ativo: false })
  it('a regra da pasta vale mais que a da disciplina inteira', () => {
    expect(regrasDaFolha([disc, pilares], { disciplina: 'ESTRUTURAL', pasta: 'LO/Pilares' })).toEqual([pilares])
    expect(regrasDaFolha([disc, pilares], { disciplina: 'ESTRUTURAL', pasta: 'LO/Formas' })).toEqual([disc])
  })
  it('regra desativada não conta (e não esconde a da disciplina)', () => {
    expect(regrasDaFolha([disc, inativa], { disciplina: 'ESTRUTURAL', pasta: 'LO/Formas' })).toEqual([disc])
  })
  it('pasta com acento ou espaço diferente é a mesma', () => {
    const r = regra({ disciplina: 'ESTRUTURAL', pasta: 'LO/Bacias de contenção' })
    expect(regrasDaFolha([r], { disciplina: 'ESTRUTURAL', pasta: 'LO/Bacias  de contencao' })).toEqual([r])
  })
})

describe('a entregar', () => {
  const regras = [
    regra({}), // ESTRUTURAL inteira → João (Alfa)
    regra({ pasta: 'LO/Pilares', empresa: 'Formas Delta', colaborador: 'Ana' }), // Pilares → só Ana
    regra({ disciplina: 'HIDRO', empresa: 'Hidráulica Beta', colaborador: '', desde: '2026-12-01' }), // a empresa toda
    regra({ disciplina: 'FUNDACAO', empresa: 'Elétrica Gama', colaborador: 'Rui', desde: '2026-12-01' }),
    regra({ disciplina: 'ARQUITETONICO', colaborador: 'Paulo', ativo: false }),
  ]
  const grupos = aEntregar(vigentes, cruzadas, regras)
  const de = (empresa: string) => grupos.find((g) => g.empresa === empresa)

  it('cópia antiga em campo: trocar, com a linha a devolver', () => {
    const joao = de('Empreiteira Alfa')!
    expect(joao.colaborador).toBe('João')
    expect(joao.pendencias).toHaveLength(1) // Formas; Pilares tem regra própria (só Ana)
    expect(joao.pendencias[0].motivo).toBe('trocar')
    expect(joao.pendencias[0].vigente.codigo).toBe('EXE.ES.LO.100.FORPILOTIS')
    expect(joao.pendencias[0].devolver.map((x) => x.copia.linha)).toEqual([1])
  })
  it('regra só da empresa: qualquer pessoa dela conta; a antiga vale mesmo antes do "desde"', () => {
    const beta = de('Hidráulica Beta')!
    expect(beta.pendencias.map((p) => p.motivo)).toEqual(['trocar'])
    expect(beta.pendencias[0].devolver.map((x) => x.copia.linha)).toEqual([5]) // a 6 é provavelmente recolhida
  })
  it('quem já tem a vigente não aparece; revisão anterior à regra não gera "nova"; regra desativada não conta', () => {
    expect(de('Formas Delta')).toBeUndefined()
    expect(de('Elétrica Gama')).toBeUndefined()
    expect(grupos.flatMap((g) => g.pendencias).some((p) => p.vigente.disciplina === 'ARQUITETONICO')).toBe(false)
  })
  it('revisão que saiu depois da regra e a pessoa não tem: nova', () => {
    const r = [regra({ pasta: 'LO/Pilares', empresa: 'Formas Delta', colaborador: 'Ana' }), regra({ pasta: 'LO/Pilares', colaborador: 'Carlos', desde: '2026-10-01' })]
    const g = aEntregar(vigentes, cruzadas, r)
    expect(g).toHaveLength(1)
    expect(g[0].colaborador).toBe('Carlos')
    expect(g[0].pendencias[0].motivo).toBe('nova')
    expect(g[0].pendencias[0].devolver).toEqual([])
  })
})

describe('lista importada e gravada', () => {
  const CSV = [
    'disciplina;pasta;empresa;colaborador;copias;ativo;entregas_no_periodo',
    'ESTRUTURAL;LO/Vigas;Empreiteira Alfa;João;2;sim;10',
    'Estrutural;LO/Vigas;EMPREITEIRA ALFA;joão;1;sim;3', // repetida (mesma pessoa e pasta): fica a primeira
    'HIDRO;;Hidráulica Beta;;1;não;1',
    ';;;;;;', // vazia
  ].join('\n')

  it('lê o arquivo sugerido pelo conversor', () => {
    const l = lerListaDestinatarios(CSV, HOJE)
    expect(l).toEqual([
      { disciplina: 'ESTRUTURAL', pasta: 'LO/Vigas', empresa: 'Empreiteira Alfa', colaborador: 'João', copias: 2, ativo: true, desde: HOJE },
      { disciplina: 'HIDRO', pasta: '', empresa: 'Hidráulica Beta', colaborador: '', copias: 1, ativo: false, desde: HOJE },
    ])
  })
  it('arquivo sem as colunas: erro claro', () => {
    expect(() => lerListaDestinatarios('a;b\n1;2', HOJE)).toThrow(ErroDeArquivo)
  })
  it('gravar, desativar e reimportar: nada se apaga, vale a última versão', async () => {
    const lidas = lerListaDestinatarios(CSV, HOJE)
    let todas = await gravarDestinatarios(OBRA, mesclarLista([], lidas), 'eu')
    expect(regrasAtuais(todas)).toHaveLength(2)
    const vigas = regrasAtuais(todas).find((r) => r.pasta === 'LO/Vigas')!
    todas = await gravarDestinatarios(OBRA, [{ ...vigas, ativo: false, substitui_id: vigas.id }], 'eu')
    expect(todas).toHaveLength(3)
    const atual = regrasAtuais(todas).find((r) => r.pasta === 'LO/Vigas')!
    expect(atual.ativo).toBe(false)
    expect(historicoDaRegra(todas, atual.id).map((r) => r.ativo)).toEqual([false, true])
    // reimportar a mesma lista: a regra desativada volta a valer (versão nova), a outra não muda
    const mescla = mesclarLista(regrasAtuais(todas), lidas)
    expect(mescla).toHaveLength(1)
    expect(mescla[0].substitui_id).toBe(atual.id)
    expect(mescla[0].desde).toBe(atual.desde)
    expect(await lerDestinatarios(OBRA)).toHaveLength(3)
  })
})

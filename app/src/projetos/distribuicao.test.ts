// Lista de distribuição e "a entregar" (proposta de 20/11/2026). Obra fictícia EXE.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import {
  aEntregar,
  chaveAntiga,
  chaveRegra,
  pavimentoDaFolha,
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
import { banco, sincronizador } from '../nucleo/servicos'
import { TABELA_DESTINATARIOS } from './tabelas'
import { TABELAS_SINCRONIZADAS } from '../nucleo/tabelas'

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

describe('regra por pavimento (21/11)', () => {
  const pilotis = { disciplina: 'ESTRUTURAL', pasta: 'LO/Formas', codigo: 'EXE.ES.LO.100.FORPILOTIS', titulo: 'Forma do pilotis' }
  const terceiro = { disciplina: 'ESTRUTURAL', pasta: 'LO/Formas', codigo: 'EXE.ES.LO.103.FOR3PAV', titulo: 'Forma do 3º pavimento' }
  it('o pavimento sai do código e do título da folha', () => {
    expect(pavimentoDaFolha(pilotis)).toBe('Pilotis')
    expect(pavimentoDaFolha(terceiro)).toBe('3º pavimento')
  })
  it('regra de um pavimento só vale para as folhas dele; sem pavimento vale para todas', () => {
    const so3 = regra({ pasta: 'LO/Formas', pavimento: '3º pavimento' })
    const todas = regra({ pasta: 'LO/Formas', empresa: 'Formas Delta', colaborador: 'Ana' })
    expect(regrasDaFolha([so3, todas], terceiro)).toEqual([so3, todas])
    expect(regrasDaFolha([so3, todas], pilotis)).toEqual([todas])
  })
  it('sem regra da pasta para o pavimento, vale a da disciplina inteira', () => {
    const so3 = regra({ pasta: 'LO/Formas', pavimento: '3º pavimento' })
    const disc = regra({ empresa: 'Empreiteira Alfa', colaborador: 'Rui' })
    expect(regrasDaFolha([so3, disc], pilotis)).toEqual([disc])
  })
  it('a mesma pessoa em dois pavimentos são duas regras (lista importada)', () => {
    const csv = ['disciplina;pasta;pavimento;empresa;colaborador;copias', 'ESTRUTURAL;LO/Formas;Térreo;Alfa;João;1', 'ESTRUTURAL;LO/Formas;3º pavimento;Alfa;João;2', 'ESTRUTURAL;LO/Formas;Térreo;Alfa;João;1'].join(String.fromCharCode(10))
    const lidas = lerListaDestinatarios(csv, HOJE)
    expect(lidas.map((l) => l.pavimento)).toEqual(['Térreo', '3º pavimento'])
    const atual = regra({ pasta: 'LO/Formas', pavimento: 'Térreo', empresa: 'Alfa' })
    const m = mesclarLista([atual], lidas)
    expect(m).toHaveLength(1)
    expect(m[0].pavimento).toBe('3º pavimento')
    expect(chaveRegra(atual)).not.toBe(chaveRegra({ ...atual, pavimento: '' }))
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
      { disciplina: 'ESTRUTURAL', pasta: 'LO/Vigas', pavimento: '', empresa: 'Empreiteira Alfa', colaborador: 'João', copias: 2, ativo: true, desde: HOJE },
      { disciplina: 'HIDRO', pasta: '', pavimento: '', empresa: 'Hidráulica Beta', colaborador: '', copias: 1, ativo: false, desde: HOJE },
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

describe('lista de distribuição sincronizada (núcleo, 20/11)', () => {
  const USUARIO = '00000000-0000-0000-0000-0000000000a1'
  const regra = (pasta: string, ativo = true): DadosDestinatario => ({ disciplina: 'ESTRUTURAL', pasta, empresa: 'Empreiteira Alfa', colaborador: '', copias: 1, ativo, desde: HOJE })
  const naFila = async (obra: string) => (await banco.fila.toArray()).filter((f) => f.obra_id === obra && f.tabela === TABELA_DESTINATARIOS)

  it('a tabela está entre as sincronizadas (baixa com a obra; sobe pela fila)', () => {
    expect(TABELAS_SINCRONIZADAS).toContain(TABELA_DESTINATARIOS)
  })

  it('gravar vai para a tabela e para a fila de envio, a regra antes da versão que a substitui', async () => {
    const OBRA2 = 'b0000000-0000-0000-0000-0000000000d2'
    let todas = await gravarDestinatarios(OBRA2, [regra('LO/Vigas')], USUARIO, (id) => (id === USUARIO ? 'eu' : 'outro'))
    const vigas = todas[0]
    todas = await gravarDestinatarios(OBRA2, [{ ...vigas, ativo: false, substitui_id: vigas.id }], USUARIO)
    // a ordem da leitura: a regra antes da versão que a substitui (mesmo com a hora empatada)
    expect((await lerDestinatarios(OBRA2)).map((l) => [l.pasta, l.ativo, l.substitui_id])).toEqual([
      ['LO/Vigas', true, null],
      ['LO/Vigas', false, vigas.id],
    ])
    expect((await sincronizador.linhas(TABELA_DESTINATARIOS, OBRA2)).every((l) => l.usuario_id === USUARIO)).toBe(true)
    const fila = await naFila(OBRA2)
    expect(fila.map((f) => f.id)).toEqual([vigas.id, todas.find((d) => d.substitui_id === vigas.id)!.id])
    expect(regrasAtuais(todas).map((r) => r.ativo)).toEqual([false])
    // quem gravou, pelo nome que o app dá
    expect((await lerDestinatarios(OBRA2, USUARIO, (id) => (id === USUARIO ? 'eu' : 'outro')))[0].usuario).toBe('eu')
    expect((await lerDestinatarios(OBRA2, '', () => 'outra pessoa da obra'))[0].usuario).toBe('outra pessoa da obra')
  })

  it('a lista antiga do navegador passa para a tabela uma vez, com os mesmos ids, e sai do navegador', async () => {
    const OBRA3 = 'b0000000-0000-0000-0000-0000000000d3'
    const a = { ...regra('LO/Pilares'), id: 'c0000000-0000-0000-0000-000000000001', substitui_id: null, em: '2026-11-19T10:00:00.000Z', usuario: 'neste aparelho' }
    const b = { ...regra('LO/Pilares', false), id: 'c0000000-0000-0000-0000-000000000002', substitui_id: a.id, em: '2026-11-19T11:00:00.000Z', usuario: 'neste aparelho' }
    await banco.gravarMeta(chaveAntiga(OBRA3), [a, b])
    // duas leituras ao mesmo tempo (as telas abrem juntas): passa uma vez só
    const [l1, l2] = await Promise.all([lerDestinatarios(OBRA3, USUARIO), lerDestinatarios(OBRA3, USUARIO)])
    expect(l1.map((d) => d.id).sort()).toEqual([a.id, b.id])
    expect(l2).toHaveLength(2)
    expect((await naFila(OBRA3)).map((f) => f.id)).toEqual([a.id, b.id])
    expect(await banco.lerMeta(chaveAntiga(OBRA3))).toBeUndefined()
    expect(regrasAtuais(l1).map((r) => [r.id, r.ativo])).toEqual([[b.id, false]])
    // ler de novo não grava nada
    await lerDestinatarios(OBRA3, USUARIO)
    expect(await naFila(OBRA3)).toHaveLength(2)
  })
})

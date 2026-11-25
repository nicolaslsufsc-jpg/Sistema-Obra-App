import { describe, expect, it } from 'vitest'
import { BancoLocal } from '../nucleo/banco_local'
import { abrirPacoteZip, prepararObraLocal } from '../nucleo/pacote_obra'
import { itensAntesDaConcretagem, type Ficha } from '../fvs/situacao'
import { abrirZip } from '../nucleo/zip'
import { FICHAS_PARA_COLAR } from '../../testes/obra_exemplo2'
import { montarZip } from '../../testes/montar_zip'
import {
  avisos,
  fichaDoPacote,
  fichaVazia,
  itensColados,
  lerTabela,
  normalizarCodigo,
  pacoteDoRascunho,
  pavimentosPadrao,
  problemas,
  zipDoRascunho,
  type FichaRascunho,
  type RascunhoObra,
} from './modelo'

let n = 0
const novoBanco = () => new BancoLocal(`teste-nova-obra-${++n}`)
const AGORA = new Date('2026-11-09T15:00:00Z')

function fichaExemplo(concretagem: FichaRascunho['concretagem'] = { modo: 'pelo_nome' }): FichaRascunho {
  return { ...fichaVazia(), codigo: 'EX2-PVS-01', titulo: 'Pilares', aplica_a: ['P'], itens: itensColados(FICHAS_PARA_COLAR).itens, concretagem }
}

const RASCUNHO: RascunhoObra = {
  codigo: 'EX2',
  nome: 'Obra Exemplo 2',
  empresa: 'Construtora Exemplo',
  pavimentos: ['Térreo', 'Tipo 1'],
  fichas: [fichaExemplo({ modo: 'etapa', etapa: 'Lançamento' })],
  plantas: [],
}

/** A ficha como o app de campo vê (dados.ts). */
const comoNoApp = (f: ReturnType<typeof fichaDoPacote>): Ficha => ({ id: 'x', codigo: f.codigo, titulo: f.titulo, revisao: f.revisao ?? '0', aplica_a: f.aplica_a, itens: f.itens })

describe('Nova obra: cadastro pela tela', () => {
  it('avisos do salvar: peças sem ficha e sem contorno (achados do Testador de 09/11)', () => {
    const pc = (tipo: 'P' | 'V' | 'L', nome: string, comContorno: boolean) => ({
      tipo,
      nome,
      secao: '',
      rotulo: [0, 0, 1, 1] as [number, number, number, number],
      polys: comContorno ? [[[0, 0], [1, 0], [1, 1]] as Array<[number, number]>] : [],
    })
    const planta = { id: 'p1', pavimento: 'Térreo', trecho: 'Planta inteira', prancha: 'EX2-01', revisao: 'R00', arquivo: 'x.pdf', pagina: { largura: 10, altura: 10 }, janela: [0, 0, 10, 10] as [number, number, number, number], escala: 75, semTexto: false, gerada: null }
    const r: RascunhoObra = {
      ...RASCUNHO,
      plantas: [{ ...planta, pecas: [pc('P', 'P1', true), pc('V', 'V1', false), pc('V', 'V2', false), pc('L', 'L1', false)] }],
    }
    // a ficha vale só para pilar: 2 vigas e 1 laje sem ficha; 2 vigas sem contorno (laje não conta)
    expect(avisos(r)).toEqual([
      '2 vigas sem ficha: nenhuma ficha vale para viga, e na FVS elas ficam com 0 itens. Em Fichas, marque Viga no "Vale para" de uma ficha.',
      '1 laje sem ficha: nenhuma ficha vale para laje, e na FVS ela fica com 0 itens. Em Fichas, marque Laje no "Vale para" de uma ficha.',
      '2 peças sem contorno: na FVS aparecem só como o retângulo do nome. Em Plantas, use "Ler as peças sozinho" ou abra a peça e "Desenhar contorno".',
    ])
    // ficha para tudo e contornos: sem aviso; sem planta também
    const tudo = { ...r, fichas: [{ ...r.fichas[0], aplica_a: ['P', 'V', 'L'] }], plantas: [{ ...planta, pecas: [pc('P', 'P1', true), pc('V', 'V1', true), pc('L', 'L1', false)] }] }
    expect(avisos(tudo)).toEqual([])
    expect(avisos(RASCUNHO)).toEqual([])
  })

  it('código da obra no formato do banco', () => {
    expect(normalizarCodigo('Edifício Ex 2')).toBe('EDIFICIO-EX-2')
    expect(normalizarCodigo('ex_2')).toBe('EX_2')
  })

  it('pavimentos comuns, de baixo para cima', () => {
    expect(pavimentosPadrao(1, 3, true)).toEqual(['Subsolo', 'Térreo', '1º Pavimento', '2º Pavimento', '3º Pavimento', 'Cobertura'])
    expect(pavimentosPadrao(2, 0, false)).toEqual(['Subsolo 2', 'Subsolo 1', 'Térreo'])
  })

  it('colar do Excel com cabeçalho: colunas pelo nome, acentos e tolerância', () => {
    const { itens, ignoradas } = itensColados(FICHAS_PARA_COLAR)
    expect(ignoradas).toBe(0)
    expect(itens).toHaveLength(5)
    expect(itens[1]).toEqual({ etapa: 'Fôrma', titulo: 'Prumo', descricao: 'Conferir o prumo da fôrma nas duas direções.', dispositivo: 'Prumo', tolerancia: '5 mm' })
  })

  it('colar do Excel sem cabeçalho, com célula mesclada (etapa vazia repete a de cima) e quebra de linha na célula', () => {
    const t = 'Montagem\tPrumo\tPrumo da fôrma\r\n\tNível\t"Nível da\nfôrma"\r\n\t\t\r\nConcretagem\tAdensamento\t\r\n'
    expect(lerTabela(t)).toHaveLength(3)
    const { itens } = itensColados(t)
    expect(itens.map((i) => [i.etapa, i.titulo, i.descricao])).toEqual([
      ['Montagem', 'Prumo', 'Prumo da fôrma'],
      ['Montagem', 'Nível', 'Nível da\nfôrma'],
      ['Concretagem', 'Adensamento', ''],
    ])
  })

  it('colunas em outra ordem e linha sem título ignorada', () => {
    const { itens, ignoradas } = itensColados('Tolerância\tVerificação\tFase\n5 mm\tPrumo\tMontagem\n1 cm\t\tMontagem')
    expect(itens).toEqual([{ etapa: 'Montagem', titulo: 'Prumo', descricao: '', dispositivo: '', tolerancia: '5 mm' }])
    expect(ignoradas).toBe(1)
  })

  it('problemas: as mesmas regras do banco', () => {
    expect(problemas(RASCUNHO)).toEqual([])
    const ruim: RascunhoObra = {
      codigo: 'x',
      nome: '',
      empresa: '',
      pavimentos: ['Térreo', 'terreo'],
      plantas: [],
      fichas: [{ ...fichaExemplo({ modo: 'etapa', etapa: 'Não existe' }), itens: [{ etapa: 'A', titulo: '', descricao: '', dispositivo: '', tolerancia: '' }] }, { ...fichaVazia(), codigo: 'ex2-pvs-01', aplica_a: [] }],
    }
    const p = problemas(ruim).join('\n')
    expect(p).toMatch(/Código da obra/)
    expect(p).toMatch(/Falta o nome/)
    expect(p).toMatch(/Pavimento repetido: terreo/)
    expect(p).toMatch(/item 1: falta o título/)
    expect(p).toMatch(/etapa da concretagem escolhida não existe/)
    expect(p).toMatch(/código repetido/)
    expect(p).toMatch(/escolha a que se aplica/)
    expect(p).toMatch(/pelo menos um item/)
  })

  it('etapa da concretagem marcada à mão: "Lançamento" vale como concretagem (o nome não diria)', () => {
    const f = fichaDoPacote(RASCUNHO.fichas[0])
    expect(f.itens.map((i) => i.concretagem)).toEqual([false, false, false, true, false])
    expect(itensAntesDaConcretagem(comoNoApp(f)).map((i) => i.n)).toEqual([1, 2, 3])
    // pelo nome, como antes: nenhuma etapa tem "CONCRET", então a ficha nunca fica azul
    const pelo = fichaDoPacote(fichaExemplo())
    expect(pelo.itens.some((i) => 'concretagem' in i)).toBe(false)
    expect(itensAntesDaConcretagem(comoNoApp(pelo))).toEqual([])
    // "nenhuma": mesmo com etapa chamada CONCRETAGEM, nunca azul
    const nenhuma = fichaDoPacote({ ...fichaExemplo({ modo: 'nenhuma' }), itens: [{ etapa: 'Montagem', titulo: 'a', descricao: '', dispositivo: '', tolerancia: '' }, { etapa: 'Concretagem', titulo: 'b', descricao: '', dispositivo: '', tolerancia: '' }] })
    expect(itensAntesDaConcretagem(comoNoApp(nenhuma))).toEqual([])
  })

  it('ficha antiga (sem a marca) continua adivinhando pelo nome da etapa', () => {
    const antiga: Ficha = { id: 'y', codigo: 'EXE-PVS-001', titulo: 'P', revisao: '0', aplica_a: ['P'], itens: [{ n: 1, etapa: 'MONTAGEM', titulo: 'a' }, { n: 2, etapa: 'CONCRETAGEM', titulo: 'b' }] }
    expect(itensAntesDaConcretagem(antiga).map((i) => i.n)).toEqual([1])
  })

  it('pacote sem planta: índice com os pavimentos na ordem e fichas no formato do pipeline', async () => {
    const { indice, fichas } = await pacoteDoRascunho(RASCUNHO, AGORA)
    expect(indice).toEqual({
      obra: 'EX2',
      nome: 'Obra Exemplo 2',
      empresa: 'Construtora Exemplo',
      gerado_em: '2026-11-09T15:00:00.000Z',
      origem: 'nova_obra',
      pavimentos: [
        { nome: 'Térreo', pecas: [], plantas: [] },
        { nome: 'Tipo 1', pecas: [], plantas: [] },
      ],
    })
    expect(fichas[0]).toMatchObject({ codigo: 'EX2-PVS-01', revisao: '0', aplica_a: ['P'] })
    expect(fichas[0].itens[0]).toEqual({ n: 1, etapa: 'Início', titulo: 'Projeto na mão', descricao: 'Conferir se a prancha usada é a revisão vigente.', dispositivo: 'Visual', tolerancia: '-', concretagem: false })
  })

  it('o .zip abre pelo "Abrir pacote da obra (.zip)" e vira a obra no aparelho', async () => {
    const zip = await zipDoRascunho(RASCUNHO, AGORA)
    const lido = await abrirZip(zip)
    expect([...lido.itens.keys()]).toEqual(['fichas.json', 'config_fvs.json', 'indice.json'])
    const pacote = await abrirPacoteZip(zip, 'obra_EX2.zip')
    const banco = novoBanco()
    const r = await prepararObraLocal(banco, pacote)
    expect(r.obra).toMatchObject({ codigo: 'EX2', nome: 'Obra Exemplo 2' })
    expect(r.plantasGuardadas).toBe(0)
    const linhas = (t: string) => banco.registros.where('[tabela+obra_id]').equals([t, r.obra.id]).toArray()
    const pavs = await linhas('pavimentos')
    expect(pavs.map((p) => [p.linha.nome, p.linha.ordem]).sort((a, b) => Number(a[1]) - Number(b[1]))).toEqual([
      ['Térreo', 1],
      ['Tipo 1', 2],
    ])
    const [ficha] = await linhas('fichas_modelo')
    expect((ficha.linha.itens as Array<{ concretagem?: boolean }>).map((i) => i.concretagem)).toEqual([false, false, false, true, false])
    // a unidade de conferência (ideia 14) entra como fvs_regras no aparelho
    const [regras] = await linhas('fvs_regras')
    expect((regras.linha.regras as { unidades: Array<{ unidade: string }> }).unidades.map((u) => u.unidade)).toEqual(['peca'])
  })

  it('pacote antigo (sem gerado_em, sem a marca de concretagem) continua abrindo igual', async () => {
    const indice = { obra: 'EXE', pavimentos: [{ nome: '3º Pavimento', pecas: [{ id: 'e0000000-0000-0000-0000-000000000001', tipo: 'P', nome: 'P1', secao: '19x50' }], plantas: [] }] }
    const fichas = [{ codigo: 'EXE-PVS-001', titulo: 'Pilares', revisao: '0', aplica_a: ['P'], itens: [{ n: 1, etapa: 'MONTAGEM', titulo: 'Prumo' }, { n: 2, etapa: 'CONCRETAGEM', titulo: 'Vibrar' }] }]
    const banco = novoBanco()
    const r = await prepararObraLocal(banco, await abrirPacoteZip(new Blob([montarZip({ 'pacote/indice.json': JSON.stringify(indice), 'pacote/fichas.json': JSON.stringify(fichas) })])))
    expect(r.obra.codigo).toBe('EXE')
    const [f] = await banco.registros.where('[tabela+obra_id]').equals(['fichas_modelo', r.obra.id]).toArray()
    const ficha = { id: f.id, codigo: 'EXE-PVS-001', titulo: 'Pilares', revisao: '0', aplica_a: ['P'], itens: f.linha.itens } as Ficha
    expect(itensAntesDaConcretagem(ficha).map((i) => i.n)).toEqual([1])
  })
})

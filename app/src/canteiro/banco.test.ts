// Mapa do canteiro guardado no aparelho: por obra, por folha e por mapa, num banco próprio (sem o núcleo).
import { beforeEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import {
  FOLHA_GERAL,
  FUNDO_GRADE,
  MAPA_PRINCIPAL,
  NOME_DO_PRINCIPAL,
  apagarBancoDoCanteiro,
  apagarMapa,
  figurasPorFolha,
  guardarMapa,
  lerMapa,
  mapasDaFolha,
  renomearMapa,
} from './banco'
import { ALTURA_EM_BRANCO, LARGURA, girar, posicionar, tracar } from './logica'

const folha = { largura: LARGURA, altura: ALTURA_EM_BRANCO }
const OBRA = 'b0000000-0000-0000-0000-0000000000ce'
const OUTRA = 'b0000000-0000-0000-0000-0000000000cf'
const PAV = 'a0000000-0000-0000-0000-0000000000c1'
const P = MAPA_PRINCIPAL

beforeEach(async () => {
  await apagarBancoDoCanteiro()
})

describe('guardar e ler', () => {
  it('folha nunca usada: vazia e sem fundo escolhido', async () => {
    expect(await lerMapa(OBRA, FOLHA_GERAL)).toEqual({ fundo: null, itens: [] })
  })

  it('lê de volta o que guardou, com posição, giro, tamanho, nome, caminho e área', async () => {
    let itens = posicionar([], 'caminhao_betoneira', 320, 410, folha, 'a')
    itens = girar(itens, 'a', 45)
    itens = posicionar(itens, 'setor', 700, 200, folha, 'b')
    itens = tracar(itens, 'caminho', [[10, 10], [200, 10], [200, 300]], folha, 'c', 'azul')
    itens = tracar(itens, 'area', [[500, 500], [700, 500], [600, 650]], folha, 'd', 'vermelho')
    await guardarMapa(OBRA, FOLHA_GERAL, P, { fundo: FUNDO_GRADE, itens })
    expect(await lerMapa(OBRA, FOLHA_GERAL)).toEqual({ fundo: FUNDO_GRADE, itens })
  })

  it('guardar de novo substitui o mapa', async () => {
    await guardarMapa(OBRA, PAV, P, { fundo: 'planta-1', itens: posicionar([], 'grua', 10, 10, folha, 'a') })
    await guardarMapa(OBRA, PAV, P, { fundo: 'planta-1', itens: [] })
    expect(await lerMapa(OBRA, PAV)).toEqual({ fundo: 'planta-1', itens: [] })
  })

  it('cada obra e cada pavimento tem o seu mapa', async () => {
    await guardarMapa(OBRA, FOLHA_GERAL, P, { fundo: FUNDO_GRADE, itens: posicionar([], 'grua', 10, 10, folha, 'a') })
    await guardarMapa(OBRA, PAV, P, { fundo: 'planta-1', itens: posicionar(posicionar([], 'tapume', 20, 20, folha, 'b'), 'portao', 30, 30, folha, 'c') })
    await guardarMapa(OUTRA, FOLHA_GERAL, P, { fundo: FUNDO_GRADE, itens: posicionar([], 'extintor', 40, 40, folha, 'd') })
    expect((await lerMapa(OBRA, FOLHA_GERAL)).itens.map((i) => i.tipo)).toEqual(['grua'])
    expect((await lerMapa(OBRA, PAV)).itens.map((i) => i.tipo)).toEqual(['tapume', 'portao'])
    expect((await lerMapa(OUTRA, FOLHA_GERAL)).itens.map((i) => i.tipo)).toEqual(['extintor'])
    expect(await figurasPorFolha(OBRA)).toEqual(
      new Map([
        [FOLHA_GERAL, 1],
        [PAV, 2],
      ]),
    )
  })

  it('mexer na lista depois de guardar não muda o que está guardado', async () => {
    const itens = posicionar([], 'grua', 10, 10, folha, 'a')
    await guardarMapa(OBRA, FOLHA_GERAL, P, { fundo: FUNDO_GRADE, itens })
    itens[0].x = 999
    expect((await lerMapa(OBRA, FOLHA_GERAL)).itens[0].x).toBe(10)
  })

  it('item estragado no banco é descartado na leitura, sem erro', async () => {
    await guardarMapa(OBRA, FOLHA_GERAL, P, {
      fundo: FUNDO_GRADE,
      itens: [
        { id: 'a', tipo: 'grua', x: 1, y: 2, giro: 0, tamanho: 100, nome: 'Grua' },
        { id: 'b', tipo: 'figura_que_saiu', x: 1, y: 2, giro: 0, tamanho: 100, nome: '' },
      ],
    })
    expect((await lerMapa(OBRA, FOLHA_GERAL)).itens.map((i) => i.id)).toEqual(['a'])
  })

  it('usa um banco próprio, separado do banco do núcleo', async () => {
    await guardarMapa(OBRA, FOLHA_GERAL, P, { fundo: FUNDO_GRADE, itens: [] })
    expect(await Dexie.getDatabaseNames()).toContain('sistema-obra-canteiro')
  })
})

describe('mais de um mapa por folha', () => {
  const grua = posicionar([], 'grua', 10, 10, folha, 'a')
  const doisItens = posicionar(grua, 'andaime', 50, 50, folha, 'b')

  it('toda folha tem o mapa principal, mesmo sem nada guardado', async () => {
    expect(await mapasDaFolha(OBRA, PAV)).toEqual([{ id: P, nome: NOME_DO_PRINCIPAL, figuras: 0 }])
  })

  it('cada mapa da folha guarda as suas figuras; o principal vem primeiro e os outros pelo nome', async () => {
    await guardarMapa(OBRA, PAV, 'm2', { nome: 'Fase 2 acabamento', fundo: 'planta-1', itens: grua })
    await guardarMapa(OBRA, PAV, 'm1', { nome: 'Fase 1 estrutura', fundo: 'planta-1', itens: doisItens })
    await guardarMapa(OBRA, PAV, P, { fundo: FUNDO_GRADE, itens: [] })
    expect(await mapasDaFolha(OBRA, PAV)).toEqual([
      { id: P, nome: NOME_DO_PRINCIPAL, figuras: 0 },
      { id: 'm1', nome: 'Fase 1 estrutura', figuras: 2 },
      { id: 'm2', nome: 'Fase 2 acabamento', figuras: 1 },
    ])
    expect((await lerMapa(OBRA, PAV, 'm1')).itens).toEqual(doisItens)
    expect((await lerMapa(OBRA, PAV, 'm2')).itens).toEqual(grua)
    expect((await lerMapa(OBRA, PAV)).itens).toEqual([])
    // mapa de uma folha não aparece na outra
    expect(await mapasDaFolha(OBRA, FOLHA_GERAL)).toEqual([{ id: P, nome: NOME_DO_PRINCIPAL, figuras: 0 }])
    expect(await figurasPorFolha(OBRA)).toEqual(new Map([[PAV, 3]]))
  })

  it('guardar as figuras não apaga o nome do mapa', async () => {
    await guardarMapa(OBRA, PAV, 'm1', { nome: 'Fase 1 estrutura', fundo: FUNDO_GRADE, itens: [] })
    await guardarMapa(OBRA, PAV, 'm1', { fundo: FUNDO_GRADE, itens: grua })
    expect(await mapasDaFolha(OBRA, PAV)).toContainEqual({ id: 'm1', nome: 'Fase 1 estrutura', figuras: 1 })
  })

  it('renomear mantém as figuras e o fundo; nome vazio não muda nada', async () => {
    await guardarMapa(OBRA, PAV, 'm1', { nome: 'Mapa 2', fundo: 'planta-1', itens: grua })
    await renomearMapa(OBRA, PAV, 'm1', '  Fase   estrutura  ')
    await renomearMapa(OBRA, PAV, 'm1', '   ')
    expect(await mapasDaFolha(OBRA, PAV)).toContainEqual({ id: 'm1', nome: 'Fase estrutura', figuras: 1 })
    expect(await lerMapa(OBRA, PAV, 'm1')).toEqual({ fundo: 'planta-1', itens: grua })
    // o principal também aceita nome
    await renomearMapa(OBRA, PAV, P, 'Implantação')
    expect((await mapasDaFolha(OBRA, PAV))[0]).toEqual({ id: P, nome: 'Implantação', figuras: 0 })
  })

  it('apagar um mapa não mexe nos outros; o principal apagado volta vazio', async () => {
    await guardarMapa(OBRA, PAV, P, { fundo: FUNDO_GRADE, itens: grua })
    await guardarMapa(OBRA, PAV, 'm1', { nome: 'Fase 1', fundo: FUNDO_GRADE, itens: doisItens })
    await apagarMapa(OBRA, PAV, 'm1')
    expect(await mapasDaFolha(OBRA, PAV)).toEqual([{ id: P, nome: NOME_DO_PRINCIPAL, figuras: 1 }])
    await apagarMapa(OBRA, PAV, P)
    expect(await mapasDaFolha(OBRA, PAV)).toEqual([{ id: P, nome: NOME_DO_PRINCIPAL, figuras: 0 }])
  })

  it('o mapa guardado pela primeira versão do módulo (sem id nem nome) é o principal', async () => {
    // a primeira versão gravava { chave: "<obra>|<folha>", obraId, folhaId, fundo, itens }
    const antigo = new Dexie('sistema-obra-canteiro')
    antigo.version(1).stores({ mapas: 'chave, obraId' })
    await antigo.table('mapas').put({ chave: `${OBRA}|${PAV}`, obraId: OBRA, folhaId: PAV, fundo: 'planta-1', itens: grua, atualizadoEm: '2026-11-26T22:00:00.000Z' })
    antigo.close()
    expect(await lerMapa(OBRA, PAV)).toEqual({ fundo: 'planta-1', itens: grua })
    expect(await mapasDaFolha(OBRA, PAV)).toEqual([{ id: P, nome: NOME_DO_PRINCIPAL, figuras: 1 }])
  })
})

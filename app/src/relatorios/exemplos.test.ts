import { describe, expect, it } from 'vitest'
import { BancoLocal } from '../nucleo/banco_local'
import type { ObraLocal } from '../nucleo/conta'
import { USUARIO_DO_PACOTE } from '../nucleo/pacote_obra'
import { semearExemplos as semearDocumentos } from '../documentos/exemplos'
import { semearExemplos, tirarExemplos, caixaNaPlanta, cadeiaDeVizinhos } from './exemplos'
import { diaDeExemplo, diasImpraticaveisNoMes, montarDados, numeroAoFechar, quantosExemplos, resumoDoDia, entradasDoMapa, semExemplos, USUARIO_DOS_EXEMPLOS, type LinhasPorTabela } from './regras'
import { TABELAS_RELATORIOS } from './tabelas'

const OBRA: ObraLocal = { id: 'b0000000-0000-0000-0000-0000000000ee', codigo: 'EX', nome: 'Exemplo', empresa: null, papel: 'admin' }
const base = { obra_id: OBRA.id, usuario_id: 'u', dispositivo_id: 'd', criado_em_dispositivo: '2026-11-01T10:00:00.000Z', apagado: false }

async function obraComPecas(banco: BancoLocal) {
  const linhas = [
    { tabela: 'pavimentos', linha: { ...base, id: 'pav-1', nome: 'Subsolo', ordem: 1 } },
    { tabela: 'pavimentos', linha: { ...base, id: 'pav-2', nome: 'Pilotis', ordem: 2 } },
    { tabela: 'setores', linha: { ...base, id: 'set-2', pavimento_id: 'pav-2', nome_projeto: 'Planta inteira', disciplina: 'estrutura' } },
    { tabela: 'plantas', linha: { ...base, id: 'pl-2', pavimento_id: 'pav-2', setor_id: 'set-2', revisao: 'R02', prancha: 'X' } },
    ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ tabela: 'elementos', linha: { ...base, id: `p-${n}`, pavimento_id: 'pav-2', tipo: 'P', nome: `P${n}`, secao: '19x50' } })),
    ...[1, 2, 3, 4].map((n) => ({ tabela: 'elementos', linha: { ...base, id: `v-${n}`, pavimento_id: 'pav-2', tipo: 'V', nome: `V${n}`, secao: '14x50' } })),
  ]
  await banco.registros.bulkPut(linhas.map((l) => ({ tabela: l.tabela, id: l.linha.id, obra_id: OBRA.id, linha: l.linha as never, pendente: 0 as const })))
}

async function lerTudo(banco: BancoLocal): Promise<LinhasPorTabela> {
  const t: LinhasPorTabela = {}
  for (const n of ['pavimentos', 'elementos', 'arquivos', ...TABELAS_RELATORIOS, 'concretagens', 'caminhoes', 'caminhao_areas', 'caminhao_elementos']) {
    t[n] = (await banco.registros.where('[tabela+obra_id]').equals([n, OBRA.id]).toArray()).map((r) => r.linha)
  }
  return t
}

describe('exemplos do diário e dos relatórios', () => {
  it('semeia três dias no pavimento com peças, como registros baixados, uma vez só', async () => {
    const banco = new BancoLocal('teste-exemplos-1')
    await obraComPecas(banco)
    const n = await semearExemplos(banco, OBRA, '2026-11-07')
    expect(n).toBeGreaterThan(40)
    expect(await semearExemplos(banco, OBRA, '2026-11-07')).toBe(0)
    expect(await banco.fila.count()).toBe(0)

    const d = montarDados(await lerTudo(banco))
    expect(d.dias).toEqual(['2026-11-06', '2026-11-05', '2026-11-04'])
    const ontem = resumoDoDia(d, '2026-11-06')
    expect(ontem.pessoas).toBe(24)
    expect(ontem.servicos).toBe(3)
    expect(ontem.fechado).toBe(false)
    expect(resumoDoDia(d, '2026-11-04')).toMatchObject({ fechado: true, numero: 1 })
    expect(resumoDoDia(d, '2026-11-05')).toMatchObject({ fechado: true, numero: 2, impraticavel: true })
    // o relato do dia não conta como ocorrência
    expect(resumoDoDia(d, '2026-11-05').ocorrencias).toBe(2)
    expect(d.relatorios.map((r) => r.tipo).sort()).toEqual(['limpeza', 'problema', 'seguranca'])
    // serviços marcados nas peças do Pilotis (e não do Subsolo)
    const marcadas = [...d.marcas.values()].flat()
    expect(marcadas.length).toBeGreaterThan(10)
    expect(marcadas.every((m) => m.pavimento_id === 'pav-2')).toBe(true)
    expect(marcadas.filter((m) => m.forma === 'peca').every((m) => m.planta_ref === 'set-2@R02')).toBe(true)
    // fotos do dia e dos serviços do dia (a do relatório conta no relatório); sem pacote, sem ponto, mas existem
    expect(ontem.fotos).toBe(3)
    expect([...d.fotosDoAlvo.values()].flat().length + [...d.fotosDoDia.values()].flat().length).toBe(7)
    expect(entradasDoMapa(d, '', '').length).toBeGreaterThan(5)
  })

  it('obra sem pavimento com peças: nada entra', async () => {
    const banco = new BancoLocal('teste-exemplos-2')
    expect(await semearExemplos(banco, OBRA, '2026-11-07')).toBe(0)
  })

  it('exemplos marcados: fora da impressão, das contagens e do número do RDO', async () => {
    expect(USUARIO_DOS_EXEMPLOS).toBe(USUARIO_DO_PACOTE)
    const banco = new BancoLocal('teste-exemplos-3')
    await obraComPecas(banco)
    await semearExemplos(banco, OBRA, '2026-11-07')
    const t = await lerTudo(banco)
    expect(t.diario_servicos.every((l) => (l as { exemplo?: boolean }).exemplo === true)).toBe(true)
    const d = montarDados(t)
    expect(quantosExemplos(d)).toBeGreaterThan(40)
    const s = semExemplos(d)
    expect(s.dias).toEqual([])
    expect(s.relatorios).toEqual([])
    expect(diaDeExemplo(d, s, '2026-11-05')).toBe(true)
    // o primeiro RDO de verdade é o nº 1, mesmo com os exemplos nº 1 e nº 2
    expect(numeroAoFechar(d, '2026-11-07')).toBe(1)
    expect(numeroAoFechar(d, '2026-11-06')).toBe(1)
    expect(diasImpraticaveisNoMes(d, '2026-11-07')).toBe(0)
    // um registro de verdade no dia de exemplo: só ele fica
    const real = { ...base, id: 'real-1', data: '2026-11-06', descricao: 'Serviço de verdade', situacao: 'iniciado', cancelado: false, substitui_id: null }
    const d2 = montarDados({ ...t, diario_servicos: [...t.diario_servicos, real as never] })
    const s2 = semExemplos(d2)
    expect(s2.dias).toEqual(['2026-11-06'])
    expect(s2.servicos.get('2026-11-06')?.map((l) => l.id)).toEqual(['real-1'])
    expect(diaDeExemplo(d2, s2, '2026-11-06')).toBe(false)
  })

  it('obra que já tem registro de verdade não recebe exemplo', async () => {
    const banco = new BancoLocal('teste-exemplos-4')
    await obraComPecas(banco)
    await banco.registros.put({ tabela: 'concretagens', id: 'c-real', obra_id: OBRA.id, linha: { ...base, id: 'c-real', data: '2026-11-01' } as never, pendente: 0 })
    expect(await semearExemplos(banco, OBRA, '2026-11-07')).toBe(0)
    expect(await semearExemplos(banco, OBRA, '2026-11-07')).toBe(0)
    expect(await banco.registros.where('[tabela+obra_id]').equals(['diario_servicos', OBRA.id]).count()).toBe(0)
  })

  it('"Tirar os exemplos" apaga tudo (e o que foi feito em cima), deixa o de verdade e não semeia de novo', async () => {
    const banco = new BancoLocal('teste-exemplos-5')
    await obraComPecas(banco)
    // a laje entra só com planta e pacote: aqui, ponho uma laje assinada como o exemplo
    await banco.registros.put({ tabela: 'elementos', id: 'laje-pacote', obra_id: OBRA.id, linha: { ...base, id: 'laje-pacote', usuario_id: USUARIO_DO_PACOTE, pavimento_id: 'pav-2', tipo: 'L', nome: 'Trecho 2' } as never, pendente: 0 })
    await banco.registros.put({ tabela: 'elementos', id: 'laje-ex', obra_id: OBRA.id, linha: { ...base, id: 'laje-ex', usuario_id: USUARIO_DO_PACOTE, criado_em_dispositivo: '2026-11-06T14:00:00.000Z', pavimento_id: 'pav-2', tipo: 'L', nome: 'Trecho 1' } as never, pendente: 0 })
    await semearExemplos(banco, OBRA, '2026-11-07')
    await semearDocumentos(banco, OBRA, '2026-11-07')
    const t = await lerTudo(banco)
    const rel = t.relatorios[0]
    // andamento feito aqui num relatório de exemplo (na fila) e um serviço de verdade
    const and = { ...base, id: 'and-real', relatorio_id: rel.id, situacao: 'resolvido', comentario: 'ok', cancelado: false, substitui_id: null }
    const real = { ...base, id: 'serv-real', data: '2026-11-06', descricao: 'De verdade', situacao: 'iniciado', cancelado: false, substitui_id: null }
    await banco.registros.bulkPut([
      { tabela: 'relatorio_andamentos', id: and.id, obra_id: OBRA.id, linha: and as never, pendente: 1 },
      { tabela: 'diario_servicos', id: real.id, obra_id: OBRA.id, linha: real as never, pendente: 1 },
    ])
    await banco.fila.bulkAdd([and, real].map((l, i) => ({ usuario_id: 'u', obra_id: OBRA.id, tabela: i === 0 ? 'relatorio_andamentos' : 'diario_servicos', id: l.id, linha: l as never, estado: 'pendente' as const, tentativas: 0, criado_em: l.criado_em_dispositivo })))
    expect(await banco.registros.where('[tabela+obra_id]').equals(['doc_documentos', OBRA.id]).count()).toBeGreaterThan(0)

    const n = await tirarExemplos(banco, OBRA.id)
    expect(n).toBeGreaterThan(40)
    const depois = await lerTudo(banco)
    expect(depois.diario_servicos.map((l) => l.id)).toEqual(['serv-real'])
    for (const tab of ['relatorios', 'relatorio_andamentos', 'rel_marcas', 'rel_fotos', 'diario_clima', 'diario_fechamentos']) expect(depois[tab]).toEqual([])
    expect(depois.arquivos).toEqual([])
    expect(depois.elementos.find((e) => e.id === 'laje-ex')).toBeUndefined()
    // a laje que veio no pacote (mesma assinatura, mesma hora do pavimento) fica
    expect(depois.elementos.find((e) => e.id === 'laje-pacote')).toBeDefined()
    expect(depois.elementos.filter((e) => e.tipo === 'P').length).toBe(7)
    expect(await banco.registros.where('[tabela+obra_id]').equals(['doc_documentos', OBRA.id]).count()).toBe(0)
    expect((await banco.fila.toArray()).map((f) => f.id)).toEqual(['serv-real'])
    expect(await semearExemplos(banco, OBRA, '2026-11-07')).toBe(0)
  })

  it('a laje do exemplo fica se uma concretagem de verdade usa ela', async () => {
    const banco = new BancoLocal('teste-exemplos-6')
    await obraComPecas(banco)
    await banco.registros.put({ tabela: 'elementos', id: 'laje-ex', obra_id: OBRA.id, linha: { ...base, id: 'laje-ex', usuario_id: USUARIO_DO_PACOTE, criado_em_dispositivo: '2026-11-06T14:00:00.000Z', pavimento_id: 'pav-2', tipo: 'L', nome: 'Trecho 1' } as never, pendente: 0 })
    await banco.registros.put({ tabela: 'caminhao_elementos', id: 'ce-real', obra_id: OBRA.id, linha: { ...base, id: 'ce-real', caminhao_id: 'cam-real', elemento_id: 'laje-ex' } as never, pendente: 1 })
    await tirarExemplos(banco, OBRA.id)
    expect(await banco.registros.get(['elementos', 'laje-ex'])).toBeDefined()
    expect(await banco.registros.get(['caminhao_elementos', 'ce-real'])).toBeDefined()
  })

  it('área do caminhão: pilares vizinhos, folga proporcional e dentro da planta (obra de demonstração)', () => {
    // P1 num canto e P2 no outro: antes a caixa pegava os dois e atravessava o prédio
    const pecas = [
      { id: 'p1', centro: [10, 10] as [number, number] },
      { id: 'p2', centro: [900, 700] as [number, number] },
      { id: 'p3', centro: [40, 12] as [number, number] },
      { id: 'p4', centro: [12, 50] as [number, number] },
      { id: 'sem', centro: undefined },
    ]
    expect(cadeiaDeVizinhos(pecas, 3).map((p) => p.id)).toEqual(['p1', 'p3', 'p4'])
    expect(cadeiaDeVizinhos(pecas, 5).map((p) => p.id)).toEqual(['p1', 'p3', 'p4', 'p2', 'sem'])
    expect(cadeiaDeVizinhos<{ id: string; centro?: [number, number] }>([{ id: 'a' }, { id: 'b' }], 1).map((p) => p.id)).toEqual(['a'])
    // folga de 30% do lado maior (60 px → 18), presa em 0
    expect(caixaNaPlanta([[5, 5], [65, 25]], 0.3, 1000, 800)).toEqual([[0, 0], [83, 0], [83, 43], [0, 43]])
    // perto da borda de baixo e da direita: não passa da folha
    const c = caixaNaPlanta([[950, 780], [990, 795]], 0.3, 1000, 800)!
    for (const [x, y] of c) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1000)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(800)
    }
    // peça pequena: folga mínima de 4 px; fora da folha inteira: nada
    expect(caixaNaPlanta([[100, 100], [102, 101]], 0.3, 1000, 800)).toEqual([[96, 96], [106, 96], [106, 105], [96, 105]])
    expect(caixaNaPlanta([[1200, 900], [1300, 950]], 0.3, 1000, 800)).toBeNull()
    expect(caixaNaPlanta([], 0.3, 1000, 800)).toBeNull()
  })

  it('obra montada pela Nova obra (origem no pacote) não recebe exemplos; a obra comum continua recebendo', async () => {
    const demo = new BancoLocal('teste-exemplos-origem-1')
    await obraComPecas(demo)
    await demo.gravarMeta(`pacote_obra:${OBRA.id}`, { assinatura: 'x', raiz: 'zip:obra.zip', quando: '2026-11-14T10:00:00Z', gerado_em: null, origem: 'nova_obra' })
    expect(await semearExemplos(demo, OBRA, '2026-11-07')).toBe(0)
    expect(await demo.registros.where('[tabela+obra_id]').equals(['diario_servicos', OBRA.id]).count()).toBe(0)
    expect(await demo.registros.where('[tabela+obra_id]').equals(['concretagens', OBRA.id]).count()).toBe(0)

    const comum = new BancoLocal('teste-exemplos-origem-2')
    await obraComPecas(comum)
    await comum.gravarMeta(`pacote_obra:${OBRA.id}`, { assinatura: 'x', raiz: 'http://pc/', quando: '2026-11-14T10:00:00Z', gerado_em: null, origem: null })
    expect(await semearExemplos(comum, OBRA, '2026-11-07')).toBeGreaterThan(40)
  })
})

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import {
  areaComoElemento,
  areaDoContorno,
  areasVigentes,
  centroDoContorno,
  ESCALA_PADRAO,
  escalaDaPlanta,
  fichaInicialDaCaixa,
  fichasDaCaixa,
  metrosQuadrados,
  problemaDoContorno,
  proximoNomeDeArea,
  resumoDasAreas,
  textoDaMetragem,
  type AreaDeLaje,
  type LinhaDeArea,
  type Ponto,
} from './areas'
import { comRegistros, criarArea, escalaDaArea, marcarLote, mudarArea, tocarItem, type Contexto, type DadosFvs } from './dados'
import { escalaGuardada, guardarPacote } from './pacote'
import { linhasDaSituacao } from './planilha'
import { listarReprovacoes } from './reprovacoes'
import type { EventoFvs, Ficha } from './situacao'
import { sincronizador } from '../nucleo/servicos'
import { TABELAS_SINCRONIZADAS } from '../nucleo/tabelas'

const QUADRADO: Ponto[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
]

function linha(id: string, areaId: string, quando: string, extra: Partial<LinhaDeArea> = {}): LinhaDeArea {
  return {
    id,
    area_id: areaId,
    pavimento_id: 'pav',
    setor_id: 'setor',
    planta_id: 'planta',
    nome: 'Laje 1',
    ficha_id: 'f1',
    codigo_ficha: null,
    contorno: QUADRADO,
    cancelada: false,
    usuario_id: 'u1',
    criado_em_dispositivo: quando,
    ...extra,
  }
}

const fichaLaje: Ficha = {
  id: 'f1',
  codigo: 'PVS-LAJE',
  titulo: 'Laje',
  revisao: '0',
  aplica_a: ['L'],
  itens: [
    { n: 1, etapa: 'MONTAGEM', titulo: 'a' },
    { n: 2, etapa: 'CONCRETAGEM', titulo: 'b' },
  ],
}

function area(id: string, extra: Partial<AreaDeLaje> = {}): AreaDeLaje {
  return {
    id,
    versao: id,
    pavimento_id: 'pav',
    setor_id: 'setor',
    planta_id: null,
    nome: id,
    ficha_id: 'f1',
    codigo_ficha: null,
    contorno: QUADRADO,
    usuario_id: 'u1',
    criado_em_dispositivo: '2026-11-06T10:00:00.000Z',
    criada_em: '2026-11-06T10:00:00.000Z',
    ...extra,
  }
}

function ev(id: string, item: number, resultado: EventoFvs['resultado']): EventoFvs {
  return { id, elemento_id: 'a1', ficha_id: 'f1', item, resultado, rodada: 1, observacao: null, lote_id: null, planta_id: null, usuario_id: 'u1', criado_em_dispositivo: `2026-11-06T10:00:0${id}.000Z` }
}

describe('áreas que valem', () => {
  it('vale a linha mais nova de cada área; a ordem de chegada não importa', () => {
    const novo: Ponto[] = [
      [0, 0],
      [50, 0],
      [50, 50],
    ]
    const linhas = [linha('b', 'a1', '2026-11-06T11:00:00.000Z', { contorno: novo }), linha('a1', 'a1', '2026-11-06T10:00:00.000Z')]
    const [a] = areasVigentes(linhas)
    expect(a.id).toBe('a1')
    expect(a.versao).toBe('b')
    expect(a.contorno).toEqual(novo)
    expect(a.criada_em).toBe('2026-11-06T10:00:00.000Z')
  })

  it('área apagada sai da planta', () => {
    expect(areasVigentes([linha('a1', 'a1', '2026-11-06T10:00:00.000Z'), linha('b', 'a1', '2026-11-06T11:00:00.000Z', { cancelada: true })])).toEqual([])
  })

  it('em ordem de nome, com número natural', () => {
    const nomes = areasVigentes([
      linha('1', '1', '2026-11-06T10:00:00.000Z', { nome: 'Laje 10' }),
      linha('2', '2', '2026-11-06T10:00:00.000Z', { nome: 'Laje 2' }),
    ]).map((a) => a.nome)
    expect(nomes).toEqual(['Laje 2', 'Laje 10'])
  })
})

describe('contorno', () => {
  it('área do polígono em pontos², nos dois sentidos de desenho', () => {
    expect(areaDoContorno(QUADRADO)).toBe(10000)
    expect(areaDoContorno([...QUADRADO].reverse())).toBe(10000)
  })

  it('metros quadrados na escala 1:50: 1 m na obra são 2 cm no papel', () => {
    const umMetroEmPontos = (0.02 / 0.0254) * 72 // 56,7 pontos
    const lado: Ponto[] = [
      [0, 0],
      [umMetroEmPontos, 0],
      [umMetroEmPontos, umMetroEmPontos],
      [0, umMetroEmPontos],
    ]
    expect(metrosQuadrados(lado)).toBeCloseTo(1, 5)
  })

  it('planta 1:75 (escala do manifest): 1 m na obra são 1,33 cm no papel; sem escala, continua 1:50', () => {
    const umMetroEm75 = (0.01 / 0.75 / 0.0254) * 72 // 37,8 pontos
    const lado: Ponto[] = [
      [0, 0],
      [umMetroEm75 * 10, 0],
      [umMetroEm75 * 10, umMetroEm75 * 4],
      [0, umMetroEm75 * 4],
    ]
    expect(metrosQuadrados(lado, 75)).toBeCloseTo(40, 5)
    expect(textoDaMetragem(lado, 75)).toBe('≈ 40 m²')
    // o mesmo desenho lido como 1:50 (pacote antigo, sem o campo) dá (50/75)² do tamanho: o m² de antes
    expect(metrosQuadrados(lado)).toBeCloseTo(40 * (50 / 75) ** 2, 5)
    expect(metrosQuadrados(lado, undefined)).toBe(metrosQuadrados(lado, 50))
    // escala estragada no manifest não vira m² absurdo: fica 1:50
    for (const ruim of [0, -75, NaN, Infinity, '75', null]) expect(metrosQuadrados(lado, ruim)).toBe(metrosQuadrados(lado))
    expect(escalaDaPlanta(75)).toBe(75)
    expect(escalaDaPlanta(undefined)).toBe(ESCALA_PADRAO)
  })

  it('centro do polígono', () => {
    expect(centroDoContorno(QUADRADO)).toEqual([50, 50])
  })

  it('cantos em linha reta não têm centro de área: usa a média', () => {
    expect(
      centroDoContorno([
        [0, 0],
        [10, 0],
        [20, 0],
      ]),
    ).toEqual([10, 0])
  })

  it('recusa desenho que não forma uma área', () => {
    expect(problemaDoContorno(QUADRADO.slice(0, 2))).toMatch(/3 cantos/)
    expect(
      problemaDoContorno([
        [0, 0],
        [10, 0],
        [20, 0],
      ]),
    ).toMatch(/em linha/)
  })

  it('recusa linhas que se cruzam (o desenho em oito), e aceita polígono em L', () => {
    expect(
      problemaDoContorno([
        [0, 0],
        [100, 100],
        [100, 0],
        [0, 100],
      ]),
    ).toMatch(/se cruzam/)
    expect(
      problemaDoContorno([
        [0, 0],
        [100, 0],
        [100, 50],
        [50, 50],
        [50, 100],
        [0, 100],
      ]),
    ).toBe('')
  })

  it('a área vira um local da planta, com a metragem no lugar da seção', () => {
    const e = areaComoElemento(area('a1'))
    expect(e.tipo).toBe('L')
    expect(e.rotulo).toEqual([0, 0, 100, 100])
    expect(e.polys).toEqual([QUADRADO])
    expect(e.secao).toMatch(/m²/)
    // QUADRADO = 100 x 100 pontos: 1,76 m de lado em 1:50, 2,65 m em 1:75
    expect(areaComoElemento(area('a1')).secao).toBe('≈ 3 m²')
    expect(areaComoElemento(area('a1'), 75).secao).toBe('≈ 7 m²')
  })
})

describe('caixa da ficha', () => {
  const pilar: Ficha = { ...fichaLaje, id: 'p', codigo: 'PVS-P', aplica_a: ['P'] }
  const ambiente: Ficha = { ...fichaLaje, id: 'am', codigo: 'PVS-A', aplica_a: ['A'] }
  const lajeNova: Ficha = { ...fichaLaje, id: 'f2', revisao: '1' }

  it('primeiro as de laje, depois as outras de estrutura; ambiente não entra; só a revisão vigente', () => {
    expect(fichasDaCaixa([pilar, ambiente, fichaLaje, lajeNova]).map((f) => f.id)).toEqual(['f2', 'p'])
  })

  it('já vem com a ficha da área criada por último na obra', () => {
    const outra: Ficha = { ...fichaLaje, id: 'n', codigo: 'PVS-NERV' }
    const opcoes = [fichaLaje, outra]
    const porId = (id: string) => opcoes.find((f) => f.id === id)
    expect(fichaInicialDaCaixa(opcoes, [], porId)?.id).toBe('f1')
    const areas = [area('a', { ficha_id: 'f1', criada_em: '2026-11-06T09:00:00.000Z' }), area('b', { ficha_id: 'n', criada_em: '2026-11-06T10:00:00.000Z' })]
    expect(fichaInicialDaCaixa(opcoes, areas, porId)?.id).toBe('n')
  })

  it('revisão nova da ficha: a caixa oferece a nova, mesmo se a última área usou a antiga', () => {
    const porId = (id: string) => [fichaLaje, lajeNova].find((f) => f.id === id)
    expect(fichaInicialDaCaixa([lajeNova], [area('a', { ficha_id: 'f1' })], porId)?.id).toBe('f2')
  })

  it('o próximo nome pula o que já existe', () => {
    expect(proximoNomeDeArea([])).toBe('Laje 1')
    expect(proximoNomeDeArea([area('a', { nome: 'Laje 2' })])).toBe('Laje 3')
    expect(proximoNomeDeArea([area('a', { nome: 'Laje 2' }), area('b', { nome: 'Laje A' })])).toBe('Laje 3')
  })
})

describe('resumo do pavimento', () => {
  it('conta o quanto da laje está liberado, pelo tamanho de cada área', () => {
    const areas = [area('a1'), area('a2'), area('a3')]
    const eventos: Record<string, EventoFvs[]> = { a1: [ev('1', 1, 'C')], a3: [ev('2', 1, 'NC')] }
    const r = resumoDasAreas(areas, () => fichaLaje, (id) => eventos[id] ?? [])
    expect(r).toMatchObject({ total: 3, paraConcretar: 1, liberadas: 0, comR: 1 })
    expect(r.m2Liberados).toBeCloseTo(r.m2 / 3, 5)
  })

  it('cada área no m² da escala da própria planta', () => {
    const areas = [area('a1', { planta_id: 'p50' }), area('a2', { planta_id: 'p75' })]
    const r = resumoDasAreas(areas, () => fichaLaje, () => [], (planta) => (planta === 'p75' ? 75 : undefined))
    expect(r.m2).toBeCloseTo(metrosQuadrados(QUADRADO) + metrosQuadrados(QUADRADO, 75), 5)
    expect(resumoDasAreas(areas, () => fichaLaje, () => []).m2).toBeCloseTo(2 * metrosQuadrados(QUADRADO), 5)
  })

  it('ficha que não está no aparelho conta como pendente', () => {
    expect(resumoDasAreas([area('a1')], () => undefined, () => [])).toMatchObject({ total: 1, paraConcretar: 0 })
  })
})

describe('gravar área e marcar nela', () => {
  const OBRA = 'b0000000-0000-0000-0000-00000000abcd'
  const c: Contexto = { obraId: OBRA, usuarioId: '00000000-0000-0000-0000-0000000000a1', plantaId: 'planta', areas: { has: (id) => id === 'area-x' } }
  // hora explícita: no Windows o relógio repete o mesmo milissegundo, e duas linhas seguidas empatariam
  const depois = <T extends { criado_em_dispositivo: string }>(l: T): T => ({ ...l, criado_em_dispositivo: new Date(Date.parse(l.criado_em_dispositivo) + 1000).toISOString() })

  it('a tabela está na lista de sincronização, depois de quem ela referencia', () => {
    expect(TABELAS_SINCRONIZADAS.indexOf('fvs_areas')).toBeGreaterThan(TABELAS_SINCRONIZADAS.indexOf('fichas_modelo'))
    expect(TABELAS_SINCRONIZADAS.indexOf('fvs_areas')).toBeGreaterThan(TABELAS_SINCRONIZADAS.indexOf('plantas'))
  })

  it('a primeira linha aponta para si mesma; apagar é linha nova com o mesmo area_id', async () => {
    const l = await criarArea(c, { pavimentoId: 'pav', setorId: 'setor', nome: ' Laje 1 ', fichaId: 'f1', codigoFicha: '  ', contorno: QUADRADO })
    expect(l.area_id).toBe(l.id)
    expect(l.nome).toBe('Laje 1')
    expect(l.codigo_ficha).toBeNull()
    const [a] = areasVigentes([l as unknown as LinhaDeArea])
    const m = await mudarArea(c, a, { cancelada: true })
    expect(m.area_id).toBe(l.id)
    expect(m.id).not.toBe(l.id)
    expect(m.contorno).toEqual(QUADRADO)
    expect(areasVigentes([l, depois(m)] as unknown as LinhaDeArea[])).toEqual([])
  })

  it('redesenhar mantém o area_id: as marcações continuam valendo', async () => {
    const l = await criarArea(c, { pavimentoId: 'pav', setorId: 'setor', nome: 'Laje 2', fichaId: 'f1', codigoFicha: 'FVS-9', contorno: QUADRADO })
    const [a] = areasVigentes([l as unknown as LinhaDeArea])
    const novo: Ponto[] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ]
    const m = await mudarArea(c, a, { contorno: novo })
    const [vigente] = areasVigentes([l, depois(m)] as unknown as LinhaDeArea[])
    expect(vigente.id).toBe(l.id)
    expect(vigente.contorno).toEqual(novo)
    expect(vigente.codigo_ficha).toBe('FVS-9')
  })

  it('marcação na área vai em area_id, sem elemento_id, e a tela acha pelo id da área', async () => {
    const l = await tocarItem(c, 'area-x', fichaLaje, 1, 'C', [])
    expect(l.area_id).toBe('area-x')
    expect(l.elemento_id).toBeUndefined()
    const lote = await marcarLote(c, [{ id: 'area-x', ficha: fichaLaje, eventos: [] }], null, 'NA')
    expect(lote.every((x) => x.area_id === 'area-x' && x.elemento_id === undefined)).toBe(true)
    const d = comRegistros({ eventosDe: new Map() } as unknown as DadosFvs, [l, ...lote])
    expect(d.eventosDe.get('area-x')?.length).toBe(3)
  })

  it('marcação na peça continua em elemento_id', async () => {
    const l = await tocarItem(c, 'peca-y', fichaLaje, 1, 'C', [])
    expect(l.elemento_id).toBe('peca-y')
    expect(l.area_id).toBeUndefined()
  })

  it('tudo fica na fila de envio do aparelho', async () => {
    const linhas = await sincronizador.linhas('fvs_areas', OBRA)
    expect(linhas.length).toBeGreaterThan(0)
  })
})

describe('áreas nas listas', () => {
  const pavimentos = [{ id: 'pav', nome: '3º Pavimento' }]
  const pecas = [{ id: 'a1', tipo: 'L', nome: 'Laje 1', secao: null, pavimento_id: 'pav' }]

  it('a planilha usa a ficha e o código da área, e a metragem no lugar da seção', () => {
    const [l] = linhasDaSituacao({
      pecas,
      pavimentos,
      fichas: [],
      fichaPorId: new Map([['f1', fichaLaje]]),
      fichasCampoDe: new Map(),
      eventosDe: new Map([['a1', [ev('1', 1, 'C')]]]),
      quem: () => 'alguém',
      areaDe: () => ({ ficha_id: 'f1', codigo_ficha: 'FVS-12', contorno: QUADRADO }),
    })
    expect(l).toMatchObject({ tipo: 'Laje', peca: 'Laje 1', ficha: 'PVS-LAJE', situacao: 'Liberado p/ concretar', fichaNoSistema: 'FVS-12', a: 1, vazios: 1 })
    expect(l.secao).toMatch(/m²/)
  })

  it('a planilha conta o m² na escala da planta em que a área foi desenhada (manifest guardado)', async () => {
    const manifest = (id: string, escala?: number) =>
      JSON.stringify({ formato: 1, planta_id: id, trecho: 'T', prancha: 'F', revisao: 'R00', largura: 10, altura: 10, tile: 256, niveis: [0], elementos: {}, detalhes: {}, pedacos: {}, ...(escala ? { escala } : {}) })
    await guardarPacote(manifest('planta-75', 75), new Blob([]))
    await guardarPacote(manifest('planta-antiga'), new Blob([]))
    expect(escalaGuardada('planta-75')).toBe(75)
    expect(escalaGuardada('planta-antiga')).toBeUndefined() // pacote sem o campo: 1:50 na conta
    // a revisão em que a área foi desenhada já saiu do aparelho: vale a vigente do mesmo trecho
    expect(escalaDaArea({ vigenteDe: new Map([['rev-velha', 'planta-75']]) }, 'rev-velha')).toBe(75)
    const linha = (plantaId: string) =>
      linhasDaSituacao({
        pecas,
        pavimentos,
        fichas: [],
        fichaPorId: new Map([['f1', fichaLaje]]),
        fichasCampoDe: new Map(),
        eventosDe: new Map(),
        quem: () => 'alguém',
        areaDe: () => ({ ficha_id: 'f1', codigo_ficha: null, contorno: QUADRADO, planta_id: plantaId }),
        escalaDe: (id) => escalaDaArea({ vigenteDe: new Map() }, id),
      })[0].secao
    expect(linha('planta-75')).toBe('≈ 7 m²')
    expect(linha('planta-antiga')).toBe('≈ 3 m²')
  })

  it('reprovação numa área aparece na lista como a de uma peça', () => {
    const [r] = listarReprovacoes({
      pecas,
      eventosDe: new Map([['a1', [ev('1', 1, 'NC')]]]),
      fichaPorId: new Map([['f1', fichaLaje]]),
      fichasCampoDe: new Map(),
      fotosDe: new Map(),
      quem: () => 'alguém',
    })
    expect(r).toMatchObject({ pecaNome: 'Laje 1', tipo: 'L', aberta: true })
  })
})

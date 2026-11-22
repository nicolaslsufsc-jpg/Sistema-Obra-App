// Furos de laje (item 4, decisões do Nicolas de 19/11/2026). Ficha e áreas fictícias da obra EXE.
import { describe, expect, it } from 'vitest'
import type { AreaDeLaje, Ponto } from './areas'
import {
  areaDoFuro,
  avancoDosFuros,
  avisoDoCEletrico,
  camadaDoFuro,
  ehFuroDeLaje,
  fichaDoFuroSemArea,
  furoConferivel,
  furoDeLajeEscondido,
  furoDeOutraPlanta,
  furosConferiveisPorArea,
  furosDeLajeNasAreas,
  furosNoToque,
  ladoDoQuadradoEmPontos,
  instalacaoDaDisciplina,
  instalacoesDoFuro,
  itemDaInstalacao,
  itemDoFuroDeLaje,
  juntarNumerosPerto,
  multiploDoQuadrado,
  observacaoDosFuros,
  pecaDosFurosDeLaje,
  resultadoDaInstalacao,
  situacaoDoFuroDeLajeNaObra,
  situacaoDoFuroPeloUltimo,
  situacaoDoNumeroDaArea,
  textoDoAvancoDosFuros,
  textoDoNumeroDaArea,
} from './furos_laje'
import type { ElementoPacote } from './pacote'
import type { EventoFvs, Ficha } from './situacao'

const LAJE: Ficha = {
  id: 'f-exe-laj',
  codigo: 'EXE-LAJ',
  titulo: 'Laje maciça (Obra Exemplo)',
  revisao: '0',
  aplica_a: ['L'],
  itens: [
    { n: 1, etapa: 'FÔRMA', titulo: 'Escoramento' },
    { n: 12, etapa: 'INSTALAÇÕES', titulo: 'Pontos de esgoto', instalacao: 'esgoto' },
    { n: 13, etapa: 'INSTALAÇÕES', titulo: 'Pontos de AF/AQ', instalacao: 'agua' },
    { n: 14, etapa: 'INSTALAÇÕES', titulo: 'Instalações elétricas', instalacao: 'eletrica' },
  ],
}

const quad = (x0: number, y0: number, x1: number, y1: number): Ponto[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]

function area(id: string, contorno: Ponto[]): AreaDeLaje {
  return { id, versao: id, pavimento_id: 'pav', setor_id: 's', planta_id: null, nome: id, ficha_id: LAJE.id, codigo_ficha: null, contorno, usuario_id: 'u', criado_em_dispositivo: '2026-11-19T10:00:00.000Z', criada_em: '2026-11-19T10:00:00.000Z' }
}

function furo(nome: string, x: number, y: number, disciplinas: string[], laje = true): ElementoPacote {
  return { tipo: 'F', nome, secao: 'Ø 15 cm', rotulo: [x - 2, y - 2, x + 2, y + 2], polys: [], furo: { forma: 'circular', diametro: 15, disciplinas, laje } }
}

describe('disciplina do furo e instalação', () => {
  it('SAN = esgoto, HID = água, ELT/TEL = elétrica; o resto só aparece na planta', () => {
    expect(instalacaoDaDisciplina('Sanitário / drenagem')).toBe('esgoto')
    expect(instalacaoDaDisciplina('SAN')).toBe('esgoto')
    expect(instalacaoDaDisciplina('Hidráulica')).toBe('agua')
    expect(instalacaoDaDisciplina('Elétrica / telecom')).toBe('eletrica')
    expect(instalacaoDaDisciplina('ELT')).toBe('eletrica')
    expect(instalacaoDaDisciplina('Incêndio / gás')).toBeUndefined()
    expect(instalacaoDaDisciplina('Climatização')).toBeUndefined()
    expect(instalacaoDaDisciplina('Geral')).toBeUndefined()
  })
  it('furo com duas disciplinas tem as duas instalações, sem repetir', () => {
    expect(instalacoesDoFuro(furo('FL1', 0, 0, ['Sanitário / drenagem', 'Hidráulica', 'SAN']))).toEqual(['esgoto', 'agua'])
    expect(instalacoesDoFuro(furo('FL2', 0, 0, ['Geral']))).toEqual([])
  })
  it('furo de laje é o F sem viga com laje: true', () => {
    expect(ehFuroDeLaje(furo('FL1', 0, 0, []))).toBe(true)
    expect(ehFuroDeLaje(furo('V1-F1', 0, 0, [], false))).toBe(false)
    expect(ehFuroDeLaje({ ...furo('V1-F1', 0, 0, []), viga: 'v1' })).toBe(false)
    expect(ehFuroDeLaje(undefined)).toBe(false)
  })
})

describe('ligação furo → área de laje', () => {
  const grande = area('L1', quad(0, 0, 100, 100))
  const pequena = area('L2', quad(40, 40, 60, 60))
  const vizinha = area('L3', quad(100, 0, 200, 100))
  it('ponto dentro do polígono; fora de todas: undefined', () => {
    expect(areaDoFuro([10, 10], [grande, vizinha])?.id).toBe('L1')
    expect(areaDoFuro([150, 50], [grande, vizinha])?.id).toBe('L3')
    expect(areaDoFuro([500, 500], [grande, vizinha])).toBeUndefined()
    expect(areaDoFuro([10, 10], [])).toBeUndefined()
  })
  it('duas áreas com o furo: vale a menor', () => {
    expect(areaDoFuro([50, 50], [grande, pequena])?.id).toBe('L2')
    expect(areaDoFuro([50, 50], [pequena, grande])?.id).toBe('L2')
  })
  it('área mudada ou apagada: a ligação é refeita na leitura', () => {
    const elementos = { a: furo('FL1', 50, 50, ['SAN']), b: furo('FL2', 150, 50, ['HID']), v: { ...furo('V1-F1', 10, 10, ['SAN'], false), viga: 'v1' } }
    const antes = furosDeLajeNasAreas(elementos, [grande, pequena, vizinha])
    expect([...antes.keys()]).toEqual(['a', 'b']) // furo de viga fica de fora
    expect(antes.get('a')?.id).toBe('L2')
    expect(antes.get('b')?.id).toBe('L3')
    const depois = furosDeLajeNasAreas(elementos, [grande])
    expect(depois.get('a')?.id).toBe('L1')
    expect(depois.get('b')).toBeUndefined()
  })
})

describe('item da instalação na ficha da área', () => {
  it('é achado pela marca no dado da ficha', () => {
    expect(itemDaInstalacao(LAJE, 'esgoto')?.n).toBe(12)
    expect(itemDaInstalacao(LAJE, 'eletrica')?.n).toBe(14)
    expect(itemDaInstalacao(undefined, 'agua')).toBeUndefined()
  })
  it('o registro do furo fica no item da primeira instalação dele que a ficha tem', () => {
    expect(itemDoFuroDeLaje(furo('FL1', 0, 0, ['Hidráulica', 'Sanitário / drenagem']), LAJE)).toEqual({ item: 13, instalacao: 'agua' })
    const semAgua = { ...LAJE, itens: LAJE.itens.filter((i) => i.instalacao !== 'agua') }
    expect(itemDoFuroDeLaje(furo('FL1', 0, 0, ['Hidráulica', 'Sanitário / drenagem']), semAgua)).toEqual({ item: 12, instalacao: 'esgoto' })
    expect(itemDoFuroDeLaje(furo('FL1', 0, 0, ['Geral']), LAJE)).toBeUndefined()
  })
})

describe('resultado dos furos no item da área', () => {
  it('esgoto e água: todos OK C, algum errado NC, algum sem conferir pendente', () => {
    expect(resultadoDaInstalacao('esgoto', ['liberado', 'liberado'])).toBe('C')
    expect(resultadoDaInstalacao('agua', ['liberado', 'reprovado'])).toBe('NC')
    expect(resultadoDaInstalacao('esgoto', ['liberado', 'nada'])).toBeNull()
  })
  it('sem furo do tema: não mexe (o item fica à mão)', () => {
    expect(resultadoDaInstalacao('esgoto', [])).toBeUndefined()
    expect(resultadoDaInstalacao('eletrica', [])).toBeUndefined()
  })
  it('elétrica: furo errado dá NC sozinho; o C nunca é dos furos', () => {
    expect(resultadoDaInstalacao('eletrica', ['liberado', 'reprovado'])).toBe('NC')
    expect(resultadoDaInstalacao('eletrica', ['liberado', 'liberado'])).toBeUndefined()
    expect(resultadoDaInstalacao('eletrica', ['liberado', 'liberado'], { resultado: 'C', observacao: null })).toBeUndefined()
  })
  it('elétrica: o NC dos furos volta a pendente quando o furo é corrigido; o NC da pessoa fica', () => {
    expect(resultadoDaInstalacao('eletrica', ['liberado'], { resultado: 'NC', observacao: observacaoDosFuros(['FL3']) })).toBeNull()
    expect(resultadoDaInstalacao('eletrica', ['liberado'], { resultado: 'NC', observacao: 'Caixa fora do lugar' })).toBeUndefined()
  })
  it('observação diz quais furos estão errados', () => {
    expect(observacaoDosFuros(['FL3', 'FL7'])).toBe('Furo errado: FL3, FL7')
    expect(observacaoDosFuros([])).toBeNull()
  })
})

describe('aviso do C à mão na elétrica', () => {
  it('pergunta quando há passagem errada ou sem conferir; tudo OK não pergunta', () => {
    expect(avisoDoCEletrico(['liberado', 'nada', 'nada'])).toBe('2 passagens elétricas ainda sem conferir. Marcar C mesmo assim?')
    expect(avisoDoCEletrico(['reprovado', 'nada'])).toBe('1 passagem elétrica errada e 1 passagem elétrica ainda sem conferir. Marcar C mesmo assim?')
    expect(avisoDoCEletrico(['liberado', 'liberado'])).toBeNull()
  })
})

describe('furo de laje fora de área (21/11): grava na ficha de laje e conta depois na área', () => {
  const TRELICADA: Ficha = { ...LAJE, id: 'f-exe-tre', codigo: 'EXE-TRE', itens: [{ n: 9, etapa: 'INSTALAÇÕES', titulo: 'Esgoto', instalacao: 'esgoto' }] }
  const SEM: Ficha = { ...LAJE, id: 'f-exe-sem', codigo: 'EXE-SEM', itens: [{ n: 1, etapa: 'FÔRMA', titulo: 'Escoramento' }] }
  it('a ficha: a preferida se tiver o item; senão a primeira que tem; nenhuma: undefined', () => {
    const esgoto = furo('FL1', 0, 0, ['Sanitário / drenagem'])
    const agua = furo('FL2', 0, 0, ['Hidráulica'])
    expect(fichaDoFuroSemArea(esgoto, [LAJE, TRELICADA], TRELICADA)).toEqual({ ficha: TRELICADA, item: 9 })
    expect(fichaDoFuroSemArea(esgoto, [SEM, LAJE])).toEqual({ ficha: LAJE, item: 12 })
    expect(fichaDoFuroSemArea(agua, [TRELICADA], SEM)).toBeUndefined()
  })
  it('a situação pelo registro mais novo, em qualquer ficha (marcado sem área e contado na área de outra ficha)', () => {
    const e = (ficha: string, item: number, r: EventoFvs['resultado'], s: string): EventoFvs => ({ id: s, elemento_id: 'fl1', ficha_id: ficha, item, resultado: r, rodada: 1, observacao: null, lote_id: null, planta_id: null, usuario_id: 'u', criado_em_dispositivo: `2026-11-21T10:00:0${s}.000Z` })
    expect(situacaoDoFuroPeloUltimo([])).toBe('nada')
    expect(situacaoDoFuroPeloUltimo([e(LAJE.id, 12, 'C', '1')])).toBe('liberado')
    expect(situacaoDoFuroPeloUltimo([e(LAJE.id, 12, 'C', '1'), e(TRELICADA.id, 9, 'NC', '2')])).toBe('reprovado')
    expect(situacaoDoFuroPeloUltimo([e(LAJE.id, 12, 'C', '1'), e(LAJE.id, 12, null, '2')])).toBe('nada')
  })
  it('avanço da planta para o menu: OK e errados pelo registro mais novo; fora o Geral, o só detalhe e o de outra planta', () => {
    const ev = (el: string, r: EventoFvs['resultado'], s: string): EventoFvs => ({ id: el + s, elemento_id: el, ficha_id: LAJE.id, item: 12, resultado: r, rodada: 1, observacao: null, lote_id: null, planta_id: null, usuario_id: 'u', criado_em_dispositivo: `2026-11-21T10:00:0${s}.000Z` })
    const elementos: Record<string, ElementoPacote> = {
      a: furo('FL1', 0, 0, ['Sanitário / drenagem']),
      b: furo('FL2', 0, 0, ['Sanitário / drenagem']),
      c: furo('FL3', 0, 0, ['Sanitário / drenagem']),
      g: furo('FL4', 0, 0, ['Geral']),
      d: { ...furo('FL5', 0, 0, ['Sanitário / drenagem']), so_detalhe: true },
      h: furo('FL6', 0, 0, ['Hidráulica']),
      v: { ...furo('V1-F1', 0, 0, ['Hidráulica'], false), viga: 'v1' },
    }
    const eventos: Record<string, EventoFvs[]> = { a: [ev('a', 'C', '1')], b: [ev('b', 'C', '1'), ev('b', 'NC', '2')], v: [ev('v', 'C', '1')] }
    const de = (id: string) => eventos[id] ?? []
    // a planta de esgoto: só os de esgoto dela (FL6 é de água: outra planta) e o furo de viga
    const esgoto = avancoDosFuros({ elementos, furos_laje: 'esgoto' }, de)
    expect(esgoto).toEqual({ ok: 2, errados: 1, total: 4 })
    expect(textoDoAvancoDosFuros(esgoto)).toBe('2 de 4 furos OK · 1 errado')
    // a forma com plantas de furação separadas: só o de viga
    expect(avancoDosFuros({ elementos, furos_laje_separados: true }, de)).toEqual({ ok: 1, errados: 0, total: 1 })
    expect(textoDoAvancoDosFuros({ ok: 0, errados: 0, total: 1 })).toBe('0 de 1 furo OK')
  })
})

describe('furo de laje na busca da obra', () => {
  it('a situação vem do item da instalação, na ficha da área (e não do item de furação da viga)', () => {
    const e = (r: EventoFvs['resultado'], s: string): EventoFvs => ({ id: s, elemento_id: 'fl1', ficha_id: LAJE.id, item: 12, resultado: r, rodada: 1, observacao: null, lote_id: null, planta_id: null, usuario_id: 'u', criado_em_dispositivo: `2026-11-19T10:00:0${s}.000Z` })
    const porId = (id: string) => (id === LAJE.id ? LAJE : undefined)
    expect(situacaoDoFuroDeLajeNaObra([e('C', '1')], porId)).toBe('liberado')
    expect(situacaoDoFuroDeLajeNaObra([e('C', '1'), e('NC', '2')], porId)).toBe('reprovado')
    expect(situacaoDoFuroDeLajeNaObra([], porId)).toBe('nada')
    // registro numa ficha que não é de laje não conta
    expect(situacaoDoFuroDeLajeNaObra([e('C', '1')], () => ({ ...LAJE, aplica_a: ['V'] }))).toBe('nada')
  })
})

describe('densidade na planta (20/11): escondidos, conferíveis, número por área e "Qual furo?"', () => {
  const l1 = area('L1', quad(0, 0, 100, 100))
  const l2 = area('L2', quad(200, 0, 300, 100))
  const els: Record<string, ElementoPacote> = {
    a: furo('FL1', 10, 10, ['Sanitário / drenagem']),
    b: furo('FL2', 30, 50, ['Hidráulica']),
    c: furo('FL3', 20, 20, ['Geral']),
    d: furo('FL4', 250, 50, ['Elétrica / telecom']),
    e: furo('FL5', 500, 500, ['Sanitário / drenagem']),
    v: { ...furo('V1-F1', 150, 50, ['Geral'], false), viga: 'v1' },
  }
  const nasAreas = furosDeLajeNasAreas(els, [l1, l2])
  it('Geral, Climatização e Incêndio ficam escondidos só no furo de laje', () => {
    expect(furoDeLajeEscondido(els.c)).toBe(true)
    expect(furoDeLajeEscondido(furo('FL9', 0, 0, ['Climatização']))).toBe(true)
    expect(furoDeLajeEscondido(furo('FL9', 0, 0, ['Incêndio / gás']))).toBe(true)
    expect(furoDeLajeEscondido(els.a)).toBe(false)
    expect(furoDeLajeEscondido(els.v)).toBe(false)
    expect(furoDeLajeEscondido(undefined)).toBe(false)
  })
  it('conferível: furo de viga sempre; de laje se for de esgoto, água ou elétrica, dentro ou fora de área (21/11)', () => {
    expect(furoConferivel(els.v, undefined)).toBe(true)
    expect(furoConferivel(els.a, nasAreas.get('a'))).toBe(true)
    expect(furoConferivel(els.c, nasAreas.get('c'))).toBe(false)
    expect(nasAreas.get('e')).toBeUndefined()
    expect(furoConferivel(els.e, nasAreas.get('e'))).toBe(true)
  })
  it('um grupo por área, só com os conferíveis, com o centro e a caixa deles', () => {
    const grupos = furosConferiveisPorArea(els, nasAreas, [l1, l2])
    expect(grupos.map((g) => [g.chave, g.ids])).toEqual([
      ['L1', ['a', 'b']],
      ['L2', ['d']],
      ['q:0:0', ['v']], // furo de viga fora de área: quadrado de 6 m
      ['q:1:1', ['e']], // furo de laje fora de área (21/11): também no quadrado
    ])
    expect(grupos[0].centro).toEqual([20, 30])
    expect(grupos[0].caixa).toEqual([10, 10, 30, 50])
    expect(grupos[0].perto).toEqual([10, 10]) // centro (20, 30): FL1 e FL2 a 22,4 pontos; o empate fica com o primeiro
  })
  it('furo de viga longe (20/11): dentro de área entra no número dela; fora, um número por quadrado de 6 m', () => {
    const lado = ladoDoQuadradoEmPontos(50)
    expect(lado).toBeCloseTo(340.2, 1) // 6 m na 1:50 = 120 mm de papel = 340 pontos
    expect(ladoDoQuadradoEmPontos(100)).toBeCloseTo(170.1, 1)
    const viga = (nome: string, x: number, y: number): ElementoPacote => ({ ...furo(nome, x, y, ['Hidráulica'], false), viga: 'v' })
    const todos: Record<string, ElementoPacote> = {
      a: els.a,
      v1: viga('V1-F1', 60, 60), // dentro de L1
      v2: viga('V2-F1', 400, 50), // fora: quadrado (1, 0)
      v3: viga('V2-F2', 600, 300), // fora: mesmo quadrado (1, 0)
      v4: viga('V3-F1', 400, 400), // fora: quadrado (1, 1)
      g: viga('V4-F1', 410, 410), // Geral em viga também conta (furo de viga é sempre conferível)
    }
    todos.g = { ...todos.g, furo: { ...todos.g.furo!, disciplinas: ['Geral'] } }
    const grupos = furosConferiveisPorArea(todos, furosDeLajeNasAreas(todos, [l1, l2]), [l1, l2])
    expect(grupos.map((g) => [g.chave, g.ids])).toEqual([
      ['L1', ['a', 'v1']],
      ['q:1:0', ['v2', 'v3']],
      ['q:1:1', ['v4', 'g']],
    ])
    expect(grupos[1].caixa).toEqual([400, 50, 600, 300])
    // sem áreas desenhadas: todos em quadrados (o de laje, FL1, cai no q:0:0 com o V1-F1; 21/11)
    expect(furosConferiveisPorArea(todos, furosDeLajeNasAreas(todos, []), []).map((g) => g.chave)).toEqual(['q:0:0', 'q:1:0', 'q:1:1'])
  })
  it('longe, o quadrado cresce em dobros de 6 m até dar 200 px na tela; números que se tocam viram um', () => {
    expect(multiploDoQuadrado(0)).toBe(1) // 6 m = 340 px
    expect(multiploDoQuadrado(-1)).toBe(2) // 170 px: 12 m
    expect(multiploDoQuadrado(-4.5)).toBe(16) // abertura do celular: 15 px, 96 m
    const viga = (nome: string, x: number, y: number): ElementoPacote => ({ ...furo(nome, x, y, ['Hidráulica'], false), viga: 'v' })
    const vs: Record<string, ElementoPacote> = { p: viga('V1-F1', 330, 10), q: viga('V2-F1', 350, 10), r: viga('V3-F1', 900, 10) }
    const g1 = furosConferiveisPorArea(vs, new Map(), [], 50, 1)
    expect(g1.map((g) => g.ids)).toEqual([['p'], ['q'], ['r']]) // p e q na divisa x = 340
    expect(furosConferiveisPorArea(vs, new Map(), [], 50, 2).map((g) => g.ids)).toEqual([['p', 'q'], ['r']])
    const juntos = juntarNumerosPerto(g1, 104, 48)
    expect(juntos.map((g) => g.ids)).toEqual([['p', 'q'], ['r']])
    expect(juntos[0].centro).toEqual([340, 10])
    expect(juntos[0].caixa).toEqual([330, 10, 350, 10])
    expect(g1[0].ids).toEqual(['p']) // não mexe nos grupos de entrada
    // número de área não se junta com quadrado
    const comArea = [{ chave: 'L1', ids: ['a'], centro: [340, 10] as [number, number], caixa: [0, 0, 1, 1] as [number, number, number, number], perto: [0, 0] as [number, number] }, ...g1]
    expect(juntarNumerosPerto(comArea, 104, 48).map((g) => g.ids)).toEqual([['a'], ['p', 'q'], ['r']])
    expect(juntarNumerosPerto(comArea, 104, 48)[1].centro).toEqual([340, 58]) // desceu uma altura, saiu de baixo da área
  })
  it('texto e cor do número da área', () => {
    expect(textoDoNumeroDaArea(['nada', 'nada'])).toBe('2 furos')
    expect(textoDoNumeroDaArea(['nada'])).toBe('1 furo')
    expect(textoDoNumeroDaArea(['liberado', 'nada', 'nada'])).toBe('1 de 3 furos OK')
    expect(situacaoDoNumeroDaArea(['nada', 'nada'])).toBe('nada')
    expect(situacaoDoNumeroDaArea(['liberado', 'nada'])).toBe('andamento')
    expect(situacaoDoNumeroDaArea(['liberado', 'liberado'])).toBe('liberado')
    expect(situacaoDoNumeroDaArea(['liberado', 'reprovado'])).toBe('reprovado')
  })
  it('"Qual furo?": os alvos que contêm o toque, do mais perto ao mais longe', () => {
    const pts = [
      { id: 'x', x: 100, y: 100 },
      { id: 'y', x: 110, y: 100 },
      { id: 'z', x: 160, y: 100 },
    ]
    expect(furosNoToque(pts, 108, 100, 22)).toEqual(['y', 'x'])
    expect(furosNoToque(pts, 160, 100, 22)).toEqual(['z'])
    expect(furosNoToque(pts, 400, 400, 22)).toEqual([])
  })
})

describe('furos de laje em plantas próprias, uma por camada (21/11)', () => {
  const san = furo('FL1', 10, 10, ['Sanitário / drenagem'])
  const sanHid = furo('FL2', 20, 10, ['Sanitário / drenagem', 'Hidráulica'])
  const hid = furo('FL3', 30, 10, ['Hidráulica'])
  const elt = furo('FL4', 40, 10, ['Elétrica / telecom'])
  const geral = furo('FL5', 50, 10, ['Geral'])
  const deViga = { ...furo('V1-F1', 0, 0, ['Sanitário / drenagem'], false), viga: 'v1' }

  it('a camada é a primeira instalação do furo (a mesma regra do pipeline)', () => {
    expect([san, sanHid, hid, elt, geral].map(camadaDoFuro)).toEqual(['esgoto', 'esgoto', 'agua', 'eletrica', undefined])
  })

  it('na planta de uma camada, os furos de laje das outras ficam escondidos; o de viga nunca', () => {
    const m = { furos_laje: 'agua' as const }
    expect([san, sanHid, hid, elt, geral, deViga].map((e) => furoDeOutraPlanta(e, m))).toEqual([true, true, false, true, true, false])
  })

  it('na forma com os furos de laje separados, todos os de laje ficam escondidos; sem separar, nenhum', () => {
    expect([san, hid, elt, deViga].map((e) => furoDeOutraPlanta(e, { furos_laje_separados: true }))).toEqual([true, true, true, false])
    expect([san, hid, elt, deViga].map((e) => furoDeOutraPlanta(e, {}))).toEqual([false, false, false, false])
    expect(furoDeOutraPlanta(san, undefined)).toBe(false)
  })
})

describe('furação igual à armadura (21/11): a peça do furo e a forma com os furos separados', () => {
  const peca = (tipo: 'P' | 'V', nome: string, poly: Array<[number, number]>): ElementoPacote => ({ tipo, nome, secao: '', rotulo: [0, 0, 0, 0], polys: [poly] })
  it('furo de laje com o centro em pilar ou viga passa a ser da peça (o pilar primeiro); o resto fica de laje', () => {
    const m = {
      elementos: {
        p1: peca('P', 'P1', [[0, 0], [20, 0], [20, 20], [0, 20]]),
        v1: peca('V', 'V1', [[0, 5], [200, 5], [200, 15], [0, 15]]),
        a: furo('FL1', 10, 10, ['Sanitário / drenagem']), // no pilar (e na viga): pilar
        b: furo('FL2', 100, 10, ['Hidráulica']), // na viga
        c: furo('FL3', 100, 100, ['Hidráulica']), // na laje
      } as Record<string, ElementoPacote>,
    }
    const n = pecaDosFurosDeLaje(m)
    expect(n.elementos.a.pilar).toBe('p1')
    expect(n.elementos.b.viga).toBe('v1')
    expect(n.elementos.c.viga ?? n.elementos.c.pilar).toBeUndefined()
    expect(ehFuroDeLaje(n.elementos.a)).toBe(false)
    expect(ehFuroDeLaje(n.elementos.c)).toBe(true)
    expect(m.elementos.a.pilar).toBeUndefined() // não mexe no original
    const so = { elementos: { c: m.elementos.c } }
    expect(pecaDosFurosDeLaje(so)).toBe(so) // nada muda: o mesmo manifest
  })
  it('forma com furos_separados esconde todos os furos, de viga e pilar também', () => {
    const v = { ...furo('V1-F1', 0, 0, ['Hidráulica'], false), viga: 'v1' }
    expect(furoDeOutraPlanta(v, { furos_separados: true })).toBe(true)
    expect(furoDeOutraPlanta(v, { furos_laje_separados: true })).toBe(false)
    expect(furoDeOutraPlanta(v, {})).toBe(false)
  })
})

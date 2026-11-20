// Furos de laje (item 4, decisões do Nicolas de 19/11/2026). Ficha e áreas fictícias da obra EXE.
import { describe, expect, it } from 'vitest'
import type { AreaDeLaje, Ponto } from './areas'
import {
  areaDoFuro,
  avisoDoCEletrico,
  ehFuroDeLaje,
  furosDeLajeNasAreas,
  instalacaoDaDisciplina,
  instalacoesDoFuro,
  itemDaInstalacao,
  itemDoFuroDeLaje,
  observacaoDosFuros,
  resultadoDaInstalacao,
  situacaoDoFuroDeLajeNaObra,
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

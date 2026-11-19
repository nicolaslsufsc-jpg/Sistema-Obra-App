// Furação de viga (fatia 1 da conferência por elemento, 18/11). Ficha fictícia da obra EXE.
// Decisão do Nicolas (18/11): sem ficha própria; os furos marcam o item de furação da ficha de viga.
import { describe, expect, it } from 'vitest'
import { furosDoManifest, type ElementoPacote } from './pacote'
import { itemDosFuros, resultadoPelosFuros, resumoDaEstrutura, resumoDosFuros, situacaoDoFuro, situacaoDoFuroNaObra, type EventoFvs, type Ficha, type Resultado } from './situacao'

const VIGA: Ficha = {
  id: 'f-exe-vig',
  codigo: 'EXE-VIG',
  titulo: 'Viga (Obra Exemplo)',
  revisao: '0',
  aplica_a: ['V'],
  itens: [
    { n: 1, etapa: 'FORMAS', titulo: 'Fundo e laterais' },
    { n: 2, etapa: 'EXECUÇÃO', titulo: 'Passagens em vigas', furos: true },
    { n: 3, etapa: 'ARMADURA', titulo: 'Cobrimento' },
  ],
}

let seq = 0
function ev(elemento: string, item: number, resultado: Resultado | null, ficha = VIGA): EventoFvs {
  seq++
  return {
    id: `e${String(seq).padStart(4, '0')}`,
    elemento_id: elemento,
    ficha_id: ficha.id,
    item,
    resultado,
    rodada: 1,
    observacao: null,
    lote_id: null,
    planta_id: null,
    usuario_id: 'u',
    criado_em_dispositivo: `2026-11-18T10:00:${String(seq % 60).padStart(2, '0')}.${String(seq).padStart(3, '0')}Z`,
  }
}

describe('item de furação da ficha de viga', () => {
  it('é achado pela marca no dado da ficha, não pelo texto', () => {
    expect(itemDosFuros(VIGA)?.n).toBe(2)
    expect(itemDosFuros({ ...VIGA, itens: VIGA.itens.map((i) => ({ ...i, furos: undefined })) })).toBeUndefined()
    expect(itemDosFuros(undefined)).toBeUndefined()
  })
  it('situação do furo: o último registro dele no item (C/NA OK, NC errado, vazio pendente)', () => {
    expect(situacaoDoFuro(VIGA.id, 2, [])).toBe('nada')
    expect(situacaoDoFuro(VIGA.id, 2, [ev('f1', 2, 'C')])).toBe('liberado')
    expect(situacaoDoFuro(VIGA.id, 2, [ev('f1', 2, 'C'), ev('f1', 2, 'NC')])).toBe('reprovado')
    expect(situacaoDoFuro(VIGA.id, 2, [ev('f1', 2, 'NC'), ev('f1', 2, null)])).toBe('nada')
    expect(situacaoDoFuro(VIGA.id, 2, [ev('f1', 2, 'NA')])).toBe('liberado')
    // registro de outro item ou de outra ficha não conta
    expect(situacaoDoFuro(VIGA.id, 2, [ev('f1', 1, 'C')])).toBe('nada')
  })
  it('busca da obra: o furo marcado C aparece liberado, como no painel (bug do celular, 18/11)', () => {
    const porId = (id: string) => (id === VIGA.id ? VIGA : undefined)
    expect(situacaoDoFuroNaObra(VIGA, [ev('f1', 2, 'C')], porId)).toBe('liberado')
    expect(situacaoDoFuroNaObra(VIGA, [ev('f1', 2, 'NC')], porId)).toBe('reprovado')
    expect(situacaoDoFuroNaObra(VIGA, [], porId)).toBe('nada')
    // ficha de viga sem item de furação: o furo fica só para ver
    const semFuros = { ...VIGA, itens: VIGA.itens.map((i) => ({ ...i, furos: undefined })) }
    expect(situacaoDoFuroNaObra(semFuros, [ev('f1', 2, 'C')], () => semFuros)).toBe('nada')
    expect(situacaoDoFuroNaObra(undefined, [ev('f1', 2, 'C')], porId)).toBe('nada')
  })
  it('o item da viga: algum errado NC; todos OK C; algum pendente fica pendente', () => {
    expect(resultadoPelosFuros(['liberado', 'liberado'])).toBe('C')
    expect(resultadoPelosFuros(['liberado', 'reprovado', 'nada'])).toBe('NC')
    expect(resultadoPelosFuros(['liberado', 'nada'])).toBe(null)
    expect(resultadoPelosFuros([])).toBe(null)
  })
  it('resumo do painel da viga: "Furos: X de Y OK, Z errado"', () => {
    expect(resumoDosFuros(['liberado', 'nada', 'nada']).texto).toBe('Furos: 1 de 3 OK')
    expect(resumoDosFuros(['liberado', 'reprovado']).texto).toBe('Furos: 1 de 2 OK, 1 errado')
    expect(resumoDosFuros(['reprovado', 'reprovado', 'liberado'])).toMatchObject({ total: 3, ok: 1, errados: 2, texto: 'Furos: 1 de 3 OK, 2 errados' })
  })
})

describe('resumo do pavimento com furos', () => {
  it('o furo não conta como peça; a viga conta pela ficha dela, com o item de furação', () => {
    const locais = [
      { id: 'v1', tipo: 'V' },
      { id: 'v1-f1', tipo: 'F' },
    ]
    const eventos = new Map<string, EventoFvs[]>([['v1', [ev('v1', 1, 'C'), ev('v1', 3, 'C')]], ['v1-f1', [ev('v1-f1', 2, 'C')]]])
    expect(resumoDaEstrutura(locais, [VIGA], (id) => eventos.get(id) ?? [])).toMatchObject({ total: 1, liberadas: 0 })
    eventos.get('v1')!.push(ev('v1', 2, 'C'))
    expect(resumoDaEstrutura(locais, [VIGA], (id) => eventos.get(id) ?? [])).toMatchObject({ total: 1, liberadas: 1 })
  })
})

describe('furos no pacote', () => {
  const base = { secao: '', rotulo: [0, 0, 1, 1] as [number, number, number, number], polys: [] }
  const elementos: Record<string, ElementoPacote> = {
    v1: { ...base, tipo: 'V', nome: 'V1' },
    v2: { ...base, tipo: 'V', nome: 'V2' },
    a: { ...base, tipo: 'F', nome: 'V1-F10', viga: 'v1', furo: { forma: 'circular', diametro: 10 } },
    b: { ...base, tipo: 'F', nome: 'V1-F2', viga: 'v1', furo: { forma: 'circular', diametro: 10 } },
    c: { ...base, tipo: 'F', nome: 'V2-F1', viga: 'v2', furo: { forma: 'retangular', largura: 20, altura: 10 } },
    d: { ...base, tipo: 'F', nome: 'solto' },
  }
  it('agrupa os furos por viga, na ordem do nome (F2 antes de F10); furo sem viga fica de fora', () => {
    const m = furosDoManifest({ elementos })
    expect(m.get('v1')).toEqual(['b', 'a'])
    expect(m.get('v2')).toEqual(['c'])
    expect([...m.keys()].sort()).toEqual(['v1', 'v2'])
  })
})

// Ligação entre peças (20/11/2026): o C num item da ficha da área de laje marca C num item da ficha
// de cada pilar e viga de dentro dela. Decisões do Nicolas ("Aceito as duas"): só no sentido área →
// peças; vale o centro da peça (com duas áreas, a menor). Fichas fictícias da obra EXE.
import { describe, expect, it } from 'vitest'
import type { AreaDeLaje, Ponto } from './areas'
import { alvosDaLigacao, alvosEntrePecas, centroDaPeca, ehDaLigacao, observacaoEntrePecas, pecasNasAreas, temLigacaoEntrePecas, textoDasLigacoes, type PecaDaArea } from './ligacoes'
import type { ElementoPacote } from './pacote'
import { lerRegras, type RegrasFvs } from './regras'
import { regrasNaTela } from './regras_tela'
import type { EventoFvs, Ficha, Resultado } from './situacao'

const LAJE: Ficha = {
  id: 'f-exe-laj',
  codigo: 'EXE-LAJ',
  titulo: 'Laje (Obra Exemplo)',
  revisao: '0',
  aplica_a: ['L'],
  itens: [
    { n: 1, etapa: 'FORMAS', titulo: 'Escoramento' },
    { n: 2, etapa: 'CONCRETAGEM', titulo: 'Concretagem' },
    { n: 3, etapa: 'DESFORMA', titulo: 'Reescoramento' },
  ],
}
const VIGA: Ficha = {
  id: 'f-exe-vig',
  codigo: 'EXE-VIG',
  titulo: 'Viga (Obra Exemplo)',
  revisao: '0',
  aplica_a: ['V'],
  itens: [
    { n: 1, etapa: 'FORMAS', titulo: 'Fundo e escoramento' },
    { n: 4, etapa: 'CONCRETAGEM', titulo: 'Concretagem' },
    { n: 5, etapa: 'CONCRETAGEM', titulo: 'Adensamento' },
    { n: 6, etapa: 'DESFORMA', titulo: 'Reescoramento' },
  ],
}
const PILAR: Ficha = { ...VIGA, id: 'f-exe-pil', codigo: 'EXE-PIL', titulo: 'Pilar (Obra Exemplo)', aplica_a: ['P'] }

type Ref = [string, number]
const lig = (id: string, de: Ref, para: Ref, entre?: 'area') => ({ id, de: { ficha: de[0], item: de[1] }, para: { ficha: para[0], item: para[1] }, ...(entre ? { entre } : {}) })
const regras = (...ligacoes: ReturnType<typeof lig>[]): RegrasFvs => ({ prazos: [], ligacoes })

let seq = 0
function ev(peca: string, ficha: Ficha, item: number, resultado: Resultado | null): EventoFvs {
  seq++
  return {
    id: `e${String(seq).padStart(4, '0')}`,
    elemento_id: peca,
    ficha_id: ficha.id,
    item,
    resultado,
    rodada: 1,
    observacao: null,
    lote_id: null,
    planta_id: null,
    usuario_id: 'u',
    criado_em_dispositivo: `2026-11-20T10:00:${String(seq % 60).padStart(2, '0')}.000Z`,
  }
}
const peca = (id: string, ficha: Ficha, eventos: EventoFvs[] = []): PecaDaArea => ({ id, nome: id.toUpperCase(), fichas: [ficha], eventos })

describe('quais peças são de cada área de laje', () => {
  const quadrado = (x0: number, y0: number, x1: number, y1: number): Ponto[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
  const area = (id: string, contorno: Ponto[]): AreaDeLaje => ({
    id,
    versao: id,
    pavimento_id: 'pav',
    setor_id: 'setor',
    planta_id: null,
    nome: id,
    ficha_id: LAJE.id,
    codigo_ficha: null,
    contorno,
    usuario_id: 'u',
    criado_em_dispositivo: '2026-11-20T10:00:00.000Z',
    criada_em: '2026-11-20T10:00:00.000Z',
  })
  const el = (tipo: ElementoPacote['tipo'], nome: string, poly: Ponto[], extra: Partial<ElementoPacote> = {}): ElementoPacote => ({
    tipo,
    nome,
    secao: '',
    rotulo: [poly[0][0], poly[0][1], poly[0][0] + 10, poly[0][1] + 10],
    polys: [poly],
    ...extra,
  })

  it('o centro é o meio da caixa do desenho; sem desenho, o meio do nome', () => {
    expect(centroDaPeca({ polys: [quadrado(100, 40, 400, 60)], rotulo: [0, 0, 10, 10] })).toEqual([250, 50])
    // viga em L (dois retângulos): a caixa dos dois juntos
    expect(centroDaPeca({ polys: [quadrado(0, 0, 100, 10), quadrado(90, 0, 100, 200)], rotulo: [0, 0, 10, 10] })).toEqual([50, 100])
    expect(centroDaPeca({ polys: [], rotulo: [20, 30, 40, 50] })).toEqual([30, 40])
  })

  it('pilar e viga com o centro dentro; na divisa vale o centro; fora de área e outros tipos não entram', () => {
    const elementos: Record<string, ElementoPacote> = {
      p1: el('P', 'P1', quadrado(140, 140, 160, 160)), // centro (150,150): dentro da A
      v2: el('V', 'V2', quadrado(100, 290, 400, 310)), // viga na divisa A|B em y=300: centro (250,300) na beirada
      v1: el('V', 'V1', quadrado(160, 195, 290, 205)), // centro (225,200): dentro da A
      v10: el('V', 'V10', quadrado(260, 350, 560, 360)), // atravessa a divisa em x=400; centro (410,355): fora da A, na B
      v3: el('V', 'V3', quadrado(900, 900, 990, 910)), // fora de tudo
      f1: el('F', 'FL1', quadrado(148, 148, 152, 152), { furo: { laje: true } as never }),
      a1: el('A', '101-01', quadrado(110, 110, 190, 190)),
      p9: el('P', 'P9', quadrado(190, 190, 210, 210), { so_detalhe: true }),
    }
    const A = area('A', quadrado(100, 100, 400, 300))
    const B = area('B', quadrado(400, 300, 700, 500))
    const m = pecasNasAreas(elementos, [A, B])
    // pilares antes das vigas, na ordem do nome
    expect(m.get('A')?.filter((id) => id !== 'v2')).toEqual(['p1', 'v1'])
    expect(m.get('B')?.filter((id) => id !== 'v2')).toEqual(['v10'])
    // a viga da divisa (centro em cima da linha) fica com uma área só, ou com nenhuma: nunca com as duas
    const daV2 = [...m.values()].filter((l) => l.includes('v2')).length
    expect(daV2).toBeLessThanOrEqual(1)
    expect(pecasNasAreas(elementos, [])).toEqual(new Map())
    expect(pecasNasAreas(undefined, [A])).toEqual(new Map())
  })

  it('duas áreas, uma dentro da outra: vale a menor', () => {
    const elementos = { p1: el('P', 'P1', quadrado(140, 140, 160, 160)), p2: el('P', 'P2', quadrado(340, 240, 360, 260)) }
    const m = pecasNasAreas(elementos, [area('grande', quadrado(100, 100, 400, 300)), area('pequena', quadrado(120, 120, 200, 200))])
    expect(m.get('pequena')).toEqual(['p1'])
    expect(m.get('grande')).toEqual(['p2'])
  })
})

describe('o que o C no item da área marca nas peças de dentro dela', () => {
  const R = regras(lig('laje-viga', ['EXE-LAJ', 2], ['EXE-VIG', 4], 'area'), lig('laje-pilar', ['EXE-LAJ', 2], ['EXE-PIL', 4], 'area'))

  it('marca o item ligado de cada peça que usa a ficha, na ordem das peças', () => {
    const alvos = alvosEntrePecas(R, { ficha: LAJE, item: 2 }, [peca('p1', PILAR), peca('v1', VIGA), peca('v2', VIGA)])
    expect(alvos.map((a) => `${a.peca.id}:${a.ficha.codigo}#${a.item}`)).toEqual(['p1:EXE-PIL#4', 'v1:EXE-VIG#4', 'v2:EXE-VIG#4'])
    expect(alvos.every((a) => a.daArea && a.origem.item === 2 && a.origem.ficha === LAJE)).toBe(true)
  })

  it('item já marcado (C, NC ou NA) não é mexido; desmarcado conta como vazio', () => {
    const pecas = [
      peca('v1', VIGA, [ev('v1', VIGA, 4, 'NA')]),
      peca('v2', VIGA, [ev('v2', VIGA, 4, 'NC')]),
      peca('v3', VIGA, [ev('v3', VIGA, 4, 'C')]),
      peca('v4', VIGA, [ev('v4', VIGA, 4, 'C'), ev('v4', VIGA, 4, null)]),
      peca('v5', VIGA, [ev('v5', VIGA, 1, 'C')]),
    ]
    expect(alvosEntrePecas(R, { ficha: LAJE, item: 2 }, pecas).map((a) => a.peca.id)).toEqual(['v4', 'v5'])
  })

  it('só o item e a ficha da regra: outro item da área, área sem peça, peça de outra ficha ou sem o item não marcam nada', () => {
    expect(alvosEntrePecas(R, { ficha: LAJE, item: 1 }, [peca('v1', VIGA)])).toEqual([])
    expect(alvosEntrePecas(R, { ficha: LAJE, item: 2 }, [])).toEqual([])
    const OUTRA: Ficha = { ...VIGA, id: 'f-outra', codigo: 'EXE-OUTRA' }
    const SEM_O_ITEM: Ficha = { ...VIGA, itens: VIGA.itens.filter((i) => i.n !== 4) }
    expect(alvosEntrePecas(R, { ficha: LAJE, item: 2 }, [peca('v1', OUTRA), peca('v2', SEM_O_ITEM)])).toEqual([])
    // regra sem "entre" não passa de uma peça para outra
    const mesma = regras(lig('a', ['EXE-LAJ', 2], ['EXE-VIG', 4]))
    expect(temLigacaoEntrePecas(mesma)).toBe(false)
    expect(alvosEntrePecas(mesma, { ficha: LAJE, item: 2 }, [peca('v1', VIGA)])).toEqual([])
  })

  it('a regra entre peças não vale dentro da peça, nem volta da peça para a área', () => {
    // a mesma ficha dos dois lados: dentro da própria área, a regra "entre" não marca nada
    const r = regras(lig('a', ['EXE-LAJ', 2], ['EXE-LAJ', 3], 'area'), lig('b', ['EXE-VIG', 4], ['EXE-LAJ', 3], 'area'))
    expect(alvosDaLigacao(r, { ficha: LAJE, item: 2 }, [LAJE], [])).toEqual([])
    // o sentido é só área → peças: o C na viga não marca a área
    expect(alvosDaLigacao(r, { ficha: VIGA, item: 4 }, [VIGA, LAJE], [])).toEqual([])
  })

  it('na peça, o item ligado segue a corrente das ligações dela (o passo da área conta como o primeiro dos 5)', () => {
    const r = regras(lig('laje-viga', ['EXE-LAJ', 2], ['EXE-VIG', 4], 'area'), lig('conc-adens', ['EXE-VIG', 4], ['EXE-VIG', 5]), lig('volta', ['EXE-VIG', 5], ['EXE-VIG', 4]))
    const alvos = alvosEntrePecas(r, { ficha: LAJE, item: 2 }, [peca('v1', VIGA), peca('v2', VIGA, [ev('v2', VIGA, 5, 'NA')])])
    expect(alvos.map((a) => `${a.peca.id}#${a.item}:${a.daArea ? 'área' : 'peça'}`)).toEqual(['v1#4:área', 'v1#5:peça', 'v2#4:área'])
    // corrente comprida: 1 passo da área + 4 na peça
    const FICHA: Ficha = { ...VIGA, itens: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ n, etapa: 'X', titulo: `Item ${n}` })) }
    const longa = regras(lig('l0', ['EXE-LAJ', 2], ['EXE-VIG', 1], 'area'), ...[1, 2, 3, 4, 5, 6].map((n) => lig(`l${n}`, ['EXE-VIG', n], ['EXE-VIG', n + 1])))
    expect(alvosEntrePecas(longa, { ficha: LAJE, item: 2 }, [peca('v1', FICHA)]).map((a) => a.item)).toEqual([1, 2, 3, 4, 5])
  })

  it('duas regras para o mesmo item da peça marcam uma vez só', () => {
    const r = regras(lig('a', ['EXE-LAJ', 2], ['EXE-VIG', 4], 'area'), lig('b', ['EXE-LAJ', 2], ['EXE-VIG', 4], 'area'))
    expect(alvosEntrePecas(r, { ficha: LAJE, item: 2 }, [peca('v1', VIGA)]).length).toBe(1)
  })

  it('a observação diz a área e o item de origem; a da corrente, o item da própria peça', () => {
    const r = regras(lig('laje-viga', ['EXE-LAJ', 2], ['EXE-VIG', 4], 'area'), lig('conc-adens', ['EXE-VIG', 4], ['EXE-VIG', 5]))
    const [daArea, daPeca] = alvosEntrePecas(r, { ficha: LAJE, item: 2 }, [peca('v1', VIGA)])
    expect(observacaoEntrePecas('Laje 3', daArea)).toBe('Pela ligação: Laje 3 · item 2 (Concretagem)')
    expect(observacaoEntrePecas('Laje 3', daPeca)).toBe('Pela ligação: item 4 (Concretagem)')
    // o painel reconhece as duas como "pela ligação" (no lugar de "em lote")
    expect(ehDaLigacao({ observacao: observacaoEntrePecas('Laje 3', daArea) })).toBe(true)
  })
})

describe('o aviso depois do C', () => {
  const nomes: Record<string, string> = { p1: 'P1', v1: 'V1', v2: 'V2', v3: 'V3', v4: 'V4', v5: 'V5' }
  const nomeDe = (id: string) => nomes[id]
  const naPeca = (id: string, item = 4) => ({ elemento_id: id, item })

  it('diz quantas peças e quais; muitas, as primeiras e "mais N"', () => {
    expect(textoDasLigacoes('Laje 3', LAJE, 'a1', [naPeca('v1')], nomeDe)).toBe('Laje 3: C pela ligação em 1 peça: V1')
    expect(textoDasLigacoes('Laje 3', LAJE, 'a1', [naPeca('p1'), naPeca('v1')], nomeDe)).toBe('Laje 3: C pela ligação em 2 peças: P1 e V1')
    expect(textoDasLigacoes('Laje 3', LAJE, 'a1', ['p1', 'v1', 'v2', 'v3', 'v4', 'v5'].map((id) => naPeca(id)), nomeDe)).toBe('Laje 3: C pela ligação em 6 peças: P1, V1, V2, V3 e mais 2')
    // dois itens na mesma peça (a corrente): a peça conta uma vez
    expect(textoDasLigacoes('Laje 3', LAJE, 'a1', [naPeca('v1', 4), naPeca('v1', 5)], nomeDe)).toBe('Laje 3: C pela ligação em 1 peça: V1')
  })

  it('com item ligado na própria área e nas peças: os dois', () => {
    const ligados = [{ area_id: 'a1', item: 3 }, naPeca('v1')]
    expect(textoDasLigacoes('Laje 3', LAJE, 'a1', ligados, nomeDe)).toBe('Laje 3: também C pela ligação: Reescoramento · C pela ligação em 1 peça: V1')
    // só na própria peça: o texto de sempre
    expect(textoDasLigacoes('V1', VIGA, 'v1', [naPeca('v1', 5)], nomeDe)).toBe('V1: também C pela ligação: Adensamento')
  })
})

describe('regras: o campo "entre"', () => {
  const base = { id: 'x', de: { ficha: 'EXE-LAJ', item: 2 }, para: { ficha: 'EXE-VIG', item: 4 } }

  it('"area" é lido; sem o campo, é a ligação da mesma peça; valor que o app não conhece deixa a regra de fora', () => {
    expect(lerRegras({ ligacoes: [{ ...base, entre: 'area' }] }).ligacoes).toEqual([{ ...base, entre: 'area' }])
    expect(lerRegras({ ligacoes: [base] }).ligacoes).toEqual([base])
    expect(lerRegras({ ligacoes: [{ ...base, entre: null }] }).ligacoes).toEqual([base])
    const torta = lerRegras({ ligacoes: [{ ...base, entre: 'pavimento' }, { ...base, id: 'y', entre: 'area' }] })
    expect(torta.ligacoes.map((l) => l.id)).toEqual(['y'])
    expect(torta.fora).toBe(1)
  })

  it('a tela das regras marca a ligação entre peças', () => {
    const r = regrasNaTela(lerRegras({ ligacoes: [{ ...base, entre: 'area' }, { ...base, id: 'y', de: { ficha: 'EXE-VIG', item: 4 }, para: { ficha: 'EXE-VIG', item: 5 } }] }), [LAJE, VIGA])
    expect(r.ligacoes.map((l) => [l.id, l.entrePecas, l.de.titulo, l.para.titulo])).toEqual([
      ['x', true, 'Concretagem', 'Concretagem'],
      ['y', false, 'Concretagem', 'Adensamento'],
    ])
    expect(r.semFicha).toBe(0)
  })
})

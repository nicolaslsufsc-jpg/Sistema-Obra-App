// Consolo e capitel como partes do pilar (item 2 do pedido de 17/11). Ficha fictícia da obra EXE.
import { describe, expect, it } from 'vitest'
import { travasDaArea, type ParteNaPlanta, type Ponto } from './areas'
import { linhasDaSituacao } from './planilha'
import { partesDoManifest, tiposDasPartes, type ElementoPacote } from './pacote'
import {
  fichaNaPeca,
  itensAntesDaConcretagem,
  partesDaFicha,
  situacaoDaParte,
  situacaoDaParteNoLocal,
  situacaoDaPeca,
  situacaoDoLocal,
  type EventoFvs,
  type Ficha,
  type Resultado,
} from './situacao'
import { escolherNoToque, opcoesDeToque, type Candidato } from './toque'

const FICHA: Ficha = {
  id: 'f-exe-pil',
  codigo: 'EXE-PIL',
  titulo: 'Pilar (Obra Exemplo)',
  revisao: '0',
  aplica_a: ['P'],
  itens: [
    { n: 1, etapa: 'FORMAS', titulo: 'Prumo' },
    { n: 2, etapa: 'ARMADURA', titulo: 'Bitolas' },
    { n: 3, etapa: 'CONSOLO - ARMADURA', titulo: 'Barras principais (tirante)', parte: 'consolo' },
    { n: 4, etapa: 'CONSOLO - ARMADURA', titulo: 'Estribos e costura', parte: 'consolo' },
    { n: 5, etapa: 'CAPITEL - ARMADURA', titulo: 'Armadura do maciço', parte: 'capitel' },
    { n: 6, etapa: 'CONCRETAGEM', titulo: 'Lançamento' },
  ],
}

let seq = 0
function ev(item: number, resultado: Resultado | null, elemento = 'p1'): EventoFvs {
  seq++
  return {
    id: `e${String(seq).padStart(4, '0')}`,
    elemento_id: elemento,
    ficha_id: FICHA.id,
    item,
    resultado,
    rodada: 1,
    observacao: null,
    lote_id: null,
    planta_id: null,
    usuario_id: 'u',
    criado_em_dispositivo: `2026-11-17T10:00:${String(seq % 60).padStart(2, '0')}.${String(seq).padStart(3, '0')}Z`,
  }
}
const todos = (...ns: number[]) => ns.map((n) => ev(n, 'C'))

describe('ficha na peça', () => {
  it('pilar sem consolo fica verde sem os itens do consolo', () => {
    expect(situacaoDaPeca(FICHA, todos(1, 2, 6))).toBe('liberado')
  })
  it('pilar com consolo só fica verde com os itens do consolo marcados', () => {
    const f = fichaNaPeca(FICHA, ['consolo'])
    expect(situacaoDaPeca(f, todos(1, 2, 6))).toBe('concretagem') // azul, não verde
    expect(situacaoDaPeca(f, todos(1, 2, 3, 4, 6))).toBe('liberado')
    // o capitel ele não tem: não segura
    expect(f.partesDaPeca).toEqual(['consolo'])
  })
  it('item de parte marcado conta mesmo sem a parte na planta (NC sempre pesa)', () => {
    expect(situacaoDaPeca(FICHA, [...todos(1, 2, 6), ev(3, 'NC')])).toBe('reprovado')
    expect(situacaoDaPeca(FICHA, [...todos(1, 2, 6), ev(3, 'C')])).toBe('liberado')
  })
  it('mesma peça recebe o mesmo objeto; sem parte válida, a própria ficha', () => {
    expect(fichaNaPeca(FICHA, ['consolo'])).toBe(fichaNaPeca(FICHA, ['consolo']))
    expect(fichaNaPeca(fichaNaPeca(FICHA, ['consolo']), ['capitel', 'consolo'])).toBe(fichaNaPeca(FICHA, ['consolo', 'capitel']))
    expect(fichaNaPeca(FICHA, [])).toBe(FICHA)
    expect(fichaNaPeca(FICHA, ['viga'])).toBe(FICHA)
    expect(fichaNaPeca(undefined, ['consolo'])).toBeUndefined()
    expect(fichaNaPeca(FICHA, ['consolo']).id).toBe(FICHA.id)
  })
  it('item da parte não segura o azul (liberado p/ concretar) do pilar', () => {
    expect(itensAntesDaConcretagem(FICHA).map((i) => i.n)).toEqual([1, 2])
    expect(situacaoDaPeca(fichaNaPeca(FICHA, ['consolo']), todos(1, 2))).toBe('concretagem')
  })
  it('situação do local leva as partes', () => {
    expect(situacaoDoLocal(FICHA, [], () => FICHA, todos(1, 2, 6))).toBe('liberado')
    expect(situacaoDoLocal(FICHA, [], () => FICHA, todos(1, 2, 6), undefined, ['capitel'])).toBe('concretagem')
  })
  it('partes da ficha na ordem', () => {
    expect(partesDaFicha(FICHA)).toEqual(['consolo', 'capitel'])
  })
})

describe('situação da parte', () => {
  it('só pelos itens dela', () => {
    expect(situacaoDaParte(FICHA, [], 'consolo')).toBe('nada')
    expect(situacaoDaParte(FICHA, todos(3), 'consolo')).toBe('andamento')
    expect(situacaoDaParte(FICHA, [ev(3, 'C'), ev(4, 'NA')], 'consolo')).toBe('liberado')
    expect(situacaoDaParte(FICHA, [ev(4, 'NC')], 'consolo')).toBe('reprovado')
    expect(situacaoDaParte(FICHA, todos(1, 2), 'viga')).toBeUndefined()
    expect(situacaoDaParteNoLocal(FICHA, [], () => FICHA, todos(5), 'capitel')).toBe('liberado')
  })
})

const quad = (x0: number, y0: number, x1: number, y1: number): Ponto[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]

describe('área de laje travada', () => {
  const partes: ParteNaPlanta[] = [
    { elementoId: 'p1', nome: 'P1', tipo: 'consolo', polys: [quad(100, 100, 120, 110)] },
    { elementoId: 'p2', nome: 'P2', tipo: 'capitel', polys: [quad(500, 500, 540, 540)] },
  ]
  it('parte dentro da área e pendente trava; liberada ou fora não', () => {
    const area = quad(0, 0, 300, 300)
    expect(travasDaArea(area, partes, () => 'nada').map((t) => `${t.nome} ${t.tipo}`)).toEqual(['P1 consolo'])
    expect(travasDaArea(area, partes, () => 'reprovado')[0].situacao).toBe('reprovado')
    expect(travasDaArea(area, partes, () => 'liberado')).toEqual([])
    // ficha sem itens da parte: nada a conferir
    expect(travasDaArea(area, partes, () => undefined)).toEqual([])
  })
  it('área pequena dentro do capitel também trava', () => {
    expect(travasDaArea(quad(510, 510, 520, 520), partes, () => 'andamento').map((t) => t.nome)).toEqual(['P2'])
  })
})

describe('pacote com partes', () => {
  const p1: ElementoPacote = {
    tipo: 'P',
    nome: 'P1',
    secao: '',
    rotulo: [0, 0, 1, 1],
    polys: [],
    partes: [
      { tipo: 'consolo', polys: [quad(0, 0, 2, 2)], detalhe: 'C_P1' },
      { tipo: 'capitel', polys: [quad(-1, -1, 3, 3)] },
    ],
  }
  it('lista as partes', () => {
    expect(tiposDasPartes(p1)).toEqual(['consolo', 'capitel'])
    expect(tiposDasPartes(undefined)).toEqual([])
    expect(partesDoManifest({ elementos: { a: p1 } }).map((pt) => `${pt.elementoId} ${pt.tipo}`)).toEqual(['a consolo', 'a capitel'])
  })
})

describe('toque', () => {
  const c = (camada: string, d: number, parte = false): Candidato<string> => ({ camada, d, margem: 7, fundo: false, parte })
  it('dentro do pilar e do consolo, ganha o pilar, mesmo com o consolo por cima', () => {
    expect(escolherNoToque([c('pilar', 0), c('consolo', 0, true)])).toBe('pilar')
    expect(escolherNoToque([c('consolo', 0, true), c('pilar', 0)])).toBe('pilar')
  })
  it('na faixa só do consolo, abre o consolo', () => {
    expect(escolherNoToque([c('pilar', 3), c('consolo', 0, true)])).toBe('consolo')
  })
  it('opções da parte', () => {
    expect(opcoesDeToque('consolo')).toEqual({ toqueDeParte: true })
    expect(opcoesDeToque('capitel')).toEqual({ toqueDeParte: true })
  })
})

describe('planilha', () => {
  const base = {
    pavimentos: [{ id: 'pv', nome: '2º' }],
    fichas: [FICHA],
    fichaPorId: new Map([[FICHA.id, FICHA]]),
    fichasCampoDe: new Map(),
    quem: () => 'Fulano',
  }
  it('item de consolo só falta no pilar com consolo', () => {
    const eventosDe = new Map([
      ['p1', todos(1, 2, 6)],
      ['p2', todos(1, 2, 6)],
    ])
    const linhas = linhasDaSituacao({
      ...base,
      eventosDe,
      pecas: [
        { id: 'p1', tipo: 'P', nome: 'P1', pavimento_id: 'pv' },
        { id: 'p2', tipo: 'P', nome: 'P2', pavimento_id: 'pv' },
      ],
      partesDe: (id) => (id === 'p1' ? ['consolo'] : []),
    })
    expect(linhas.map((l) => [l.peca, l.situacao, l.vazios])).toEqual([
      ['P1', 'Liberado p/ concretar', 2],
      ['P2', 'Liberado', 0],
    ])
  })
})

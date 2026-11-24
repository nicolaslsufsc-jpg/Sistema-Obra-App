// Pontos de instalações (frente INSTALAÇÕES, 20/11/2026). Ficha e pontos fictícios da obra EXE.
import { describe, expect, it } from 'vitest'
import { chaveDaEscolhaDoPonto, distanciaAoPonto, fichaDosPontos, fichasDoPonto, itemDosPontos, itemMarcaOPonto, nomeDoFiltroDePontos, nomeDoPonto, opcoesDoFiltroDePontos, pontosNoFiltro, pontosPorQuadrado, zoomDosPontos, PONTOS_PARA_JUNTAR, pontoTocado, resumoDosPontos, textoDoAvancoDosPontos, type PontoPacote } from './pontos'
import type { Ficha } from './situacao'

const AMB: Ficha = {
  id: 'f-exe-amb',
  codigo: 'EXE-PVS-105',
  titulo: 'Instalações sanitárias (Obra Exemplo)',
  revisao: '0',
  aplica_a: ['A'],
  itens: [
    { n: 1, etapa: 'INÍCIO', titulo: 'Projeto na mão' },
    { n: 2, etapa: 'EXECUÇÃO', titulo: 'Ralos e caixas no lugar do projeto', pontos: 'sanitario' },
  ],
}

const p = (x: number, y: number, tipo: PontoPacote['tipo'] = 'ralo', nome = ''): PontoPacote => ({ disciplina: 'sanitario', tipo, ponto: [x, y], nome })

describe('eletroduto como linha (21/11)', () => {
  const e: PontoPacote = { disciplina: 'eletrico', tipo: 'eletroduto', ponto: [50, 10], nome: 'Eletroduto', linha: [[0, 10], [100, 10]] }
  it('o toque perto de qualquer parte da linha pega o eletroduto', () => {
    expect(distanciaAoPonto([5, 13], e)).toBeCloseTo(3)
    expect(pontoTocado([95, 12], { e }, 5, 1)).toEqual({ id: 'e' })
    expect(pontoTocado([120, 10], { e }, 5, 1)).toBeNull()
  })
  it('caixa no meio do eletroduto: a mais perto ganha', () => {
    const cx: PontoPacote = { disciplina: 'eletrico', tipo: 'caixa_passagem', ponto: [50, 14], nome: '' }
    expect(pontoTocado([50, 14], { e, cx }, 5, 1)).toEqual({ id: 'cx' })
    expect(pontoTocado([20, 10], { e, cx }, 5, 1)).toEqual({ id: 'e' })
  })
  it('caixa na ponta do eletroduto: o toque na caixa é da caixa, não ambíguo', () => {
    const cx: PontoPacote = { disciplina: 'eletrico', tipo: 'caixa_passagem', ponto: [100, 10], nome: '' }
    expect(pontoTocado([100, 10], { e, cx }, 5, 1)).toEqual({ id: 'cx' })
    expect(pontoTocado([90, 10], { e, cx }, 5, 1)).toEqual({ id: 'e' })
  })
})

describe('pontoTocado', () => {
  const pontos = { a: p(10, 10), b: p(30, 10), c: p(31, 10) }
  it('o mais perto dentro do raio', () => {
    expect(pontoTocado([12, 11], pontos, 5, 1)).toEqual({ id: 'a' })
  })
  it('nada perto', () => {
    expect(pontoTocado([100, 100], pontos, 5, 1)).toBeNull()
  })
  it('dois juntos: ambíguo', () => {
    expect(pontoTocado([30.5, 10], pontos, 5, 1)).toEqual({ ambiguo: true })
  })
})

describe('ficha dos pontos', () => {
  it('o item marcado com a disciplina', () => {
    expect(itemDosPontos(AMB, 'sanitario')?.n).toBe(2)
    expect(itemDosPontos(AMB, 'hidro')).toBeUndefined()
    expect(fichaDosPontos([AMB], 'sanitario')).toEqual({ ficha: AMB, item: 2 })
    expect(fichaDosPontos([AMB], 'hidro')).toBeUndefined()
    // sem ficha de ambiente com "pontos": o item da instalação na ficha de laje (21/11)
    const LAJE = { ...AMB, codigo: 'LAJE', aplica_a: ['L'], itens: [
      { n: 12, etapa: 'INSTALAÇÕES', titulo: 'Pontos de esgoto', instalacao: 'esgoto' as const },
      { n: 13, etapa: 'INSTALAÇÕES', titulo: 'Pontos de AF/AQ', instalacao: 'agua' as const },
    ] }
    expect(fichaDosPontos([], 'hidro', [LAJE])).toEqual({ ficha: LAJE, item: 13 })
    expect(fichaDosPontos([AMB], 'sanitario', [LAJE])).toEqual({ ficha: AMB, item: 2 })
    expect(fichaDosPontos([], 'spda', [LAJE])).toBeUndefined()
  })
})

describe('5.1 a 5.3: o item pelo tipo do ponto e pelo ambiente (23/11)', () => {
  const ficha = (codigo: string, itens: Ficha['itens']): Ficha => ({ id: `f-${codigo}`, codigo, titulo: codigo, revisao: '0', aplica_a: ['A'], itens })
  // redes suspensas: trajeto de água (tubo e coluna) e de esgoto; ralos no item 19
  const REDES = ficha('EXE-PVS-104', [
    { n: 10, etapa: 'EXECUÇÃO', titulo: 'Trajeto de água', pontos: 'hidro', pontos_tipos: ['tubo', 'coluna'] },
    { n: 17, etapa: 'EXECUÇÃO', titulo: 'Trajeto de esgoto', pontos: 'sanitario', pontos_tipos: ['tubo', 'coluna'] },
    { n: 19, etapa: 'EXECUÇÃO', titulo: 'Pontos na laje', pontos: 'sanitario', pontos_tipos: ['ralo', 'caixa_sifonada', 'caixa', 'ponto_esgoto'] },
  ])
  // hidrossanitárias na parede: só a água (o ponto de esgoto fica só no item 19 da de redes, decisão de 23/11)
  const PAREDE = ficha('EXE-PVS-105', [{ n: 6, etapa: 'EXECUÇÃO', titulo: 'Altura dos pontos', pontos: ['hidro', 'sanitario'], pontos_tipos: ['ponto_agua', 'registro', 'hidrometro'] }])
  const ALV = ficha('EXE-PVS-96', [{ n: 4, etapa: 'EXECUÇÃO', titulo: 'Caixas', pontos: 'eletrico', pontos_tipos: ['caixa_parede'] }])
  const DRY = ficha('EXE-PVS-97', [{ n: 5, etapa: 'EXECUÇÃO', titulo: 'Caixas', pontos: 'eletrico', pontos_tipos: ['caixa_parede'] }])
  const todas = [REDES, PAREDE, ALV, DRY]
  const pt = (disciplina: PontoPacote['disciplina'], tipo: PontoPacote['tipo']) => ({ disciplina, tipo })
  it('o tipo escolhe o item; a lista de disciplinas vale para as duas', () => {
    expect(fichasDoPonto(todas, pt('hidro', 'tubo'))).toEqual([{ ficha: REDES, item: 10 }])
    expect(fichasDoPonto(todas, pt('sanitario', 'coluna'))).toEqual([{ ficha: REDES, item: 17 }])
    expect(fichasDoPonto(todas, pt('sanitario', 'ralo'))).toEqual([{ ficha: REDES, item: 19 }])
    expect(fichasDoPonto(todas, pt('hidro', 'registro'))).toEqual([{ ficha: PAREDE, item: 6 }])
    // ponto de esgoto só no item 19 da de redes (decisão de 23/11): uma ficha, sem pergunta
    expect(fichasDoPonto(todas, pt('sanitario', 'ponto_esgoto'))).toEqual([{ ficha: REDES, item: 19 }])
    expect(itemMarcaOPonto(PAREDE.itens[0], pt('sanitario', 'ponto_esgoto'))).toBe(false)
    // a lista de disciplinas vale para as duas: o item 6 marca um registro de água, não um de esgoto fora da lista
    expect(itemMarcaOPonto(PAREDE.itens[0], pt('hidro', 'registro'))).toBe(true)
    expect(itemDosPontos(PAREDE, 'sanitario')?.n).toBe(6)
  })
  it('tipo que nenhum item marca: só consulta (nem cai na ficha de laje)', () => {
    const LAJE = ficha('LAJE', [{ n: 13, etapa: 'INSTALAÇÕES', titulo: 'AF/AQ', instalacao: 'agua' }])
    expect(fichasDoPonto(todas, pt('eletrico', 'eletroduto'), [LAJE])).toEqual([])
    expect(fichasDoPonto(todas, pt('hidro', 'hidrante'), [LAJE])).toEqual([])
    // sem ficha de ambiente da disciplina: a de laje, como antes (21/11)
    expect(fichasDoPonto([ALV], pt('hidro', 'ponto_agua'), [LAJE])).toEqual([{ ficha: LAJE, item: 13 }])
  })
  it('sem "pontos_tipos": qualquer tipo da disciplina (as fichas de antes seguem valendo)', () => {
    expect(fichasDoPonto([AMB], pt('sanitario', 'tubo'))).toEqual([{ ficha: AMB, item: 2 }])
  })
  it('alvenaria e drywall: as duas, menos a que não vale no ambiente', () => {
    expect(fichasDoPonto(todas, pt('eletrico', 'caixa_parede')).map((f) => f.ficha.codigo)).toEqual(['EXE-PVS-96', 'EXE-PVS-97'])
    expect(fichasDoPonto(todas, pt('eletrico', 'caixa_parede'), [], ['EXE-PVS-97'])).toEqual([{ ficha: ALV, item: 4 }])
  })
  it('a escolha vale para o ambiente e para o par de fichas', () => {
    const fs = [{ ficha: DRY }, { ficha: ALV }]
    expect(chaveDaEscolhaDoPonto({ ambiente: '201-03' }, fs)).toBe('201-03|EXE-PVS-96,EXE-PVS-97')
    expect(chaveDaEscolhaDoPonto({}, fs)).toBe('|EXE-PVS-96,EXE-PVS-97')
  })
})

describe('nomes', () => {
  it('nome do modelo com o tipo, ou só o tipo', () => {
    expect(nomeDoPonto(p(0, 0, 'ralo', 'Ralo seco 100x100'))).toBe('Ralo seco 100x100 (ralo)')
    expect(nomeDoPonto(p(0, 0, 'caixa_sifonada', ''))).toBe('Caixa sifonada')
    expect(nomeDoPonto(p(0, 0, 'ralo', 'Ralo'))).toBe('Ralo')
    expect(nomeDoPonto({ disciplina: 'spda', tipo: 'caixa_inspecao', ponto: [0, 0], nome: '' })).toBe('Caixa de inspeção')
    expect(nomeDoPonto({ disciplina: 'eletrico', tipo: 'quadro', ponto: [0, 0], nome: 'QDL-02' })).toBe('QDL-02 (quadro)')
  })
  it('resumo por tipo', () => {
    expect(resumoDosPontos({ a: p(0, 0), b: p(1, 1), c: p(2, 2, 'caixa') })).toEqual([
      ['caixa', 1],
      ['ralo', 2],
    ])
  })
})

describe('filtro por tipo de ponto (SPDA igual aos furos, 22/11)', () => {
  const spda: Record<string, PontoPacote> = {
    a: { disciplina: 'spda', tipo: 'haste', ponto: [0, 0], nome: 'H1' },
    b: { disciplina: 'spda', tipo: 'captor', ponto: [1, 0], nome: 'C1' },
    c: { disciplina: 'spda', tipo: 'captor', ponto: [2, 0], nome: 'C2' },
    d: { disciplina: 'spda', tipo: 'conector', ponto: [3, 0], nome: 'X1' },
  }
  it('Todos primeiro, depois os tipos na ordem dos nomes, com a contagem', () => {
    expect(opcoesDoFiltroDePontos(spda)).toEqual([
      { filtro: 'todos', n: 4 },
      { filtro: 'captor', n: 2 },
      { filtro: 'haste', n: 1 },
      { filtro: 'conector', n: 1 },
    ])
    expect(opcoesDoFiltroDePontos(undefined)).toEqual([{ filtro: 'todos', n: 0 }])
  })
  it('nomes e pontos do filtro', () => {
    expect(nomeDoFiltroDePontos('todos')).toBe('Todos')
    expect(nomeDoFiltroDePontos('conector')).toBe('Conector de aterramento')
    expect(Object.keys(pontosNoFiltro(spda, 'captor'))).toEqual(['b', 'c'])
    expect(pontosNoFiltro(spda, 'todos')).toBe(spda)
  })
  it('texto do avanço no menu', () => {
    expect(textoDoAvancoDosPontos({ ok: 0, errados: 0, total: 1 })).toBe('0 de 1 ponto OK')
    expect(textoDoAvancoDosPontos({ ok: 3, errados: 2, total: 12 })).toBe('3 de 12 pontos OK · 2 errados')
  })
})

describe('planta com muitos pontos (23/11)', () => {
  const ponto = (x: number, y: number): PontoPacote => ({ disciplina: 'eletrico', tipo: 'ponto_luz', ponto: [x, y], nome: 'L' })
  it('agrupa por quadrado de 6 m (1:50 = 340 pt), de cima para baixo', () => {
    const ps = { a: ponto(10, 10), b: ponto(20, 30), c: ponto(400, 10), d: ponto(10, 400) }
    const g = pontosPorQuadrado(ps, 50, 1)
    expect(g.map((x) => x.ids)).toEqual([['a', 'b'], ['c'], ['d']])
    expect(g[0].centro).toEqual([15, 20])
    expect(g[0].caixa).toEqual([10, 10, 20, 30])
    // quadrado 4 vezes maior: tudo junto
    expect(pontosPorQuadrado(ps, 50, 4).map((x) => x.ids.length)).toEqual([4])
  })
  it('zoom em que aparecem: 24 px entre vizinhos, de -2 ao zoom dos furos', () => {
    // vizinhos a 12 pt (a mediana): precisa de 2x (zoom 1)
    const perto = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`p${i}`, ponto(i * 12, 0)]))
    expect(zoomDosPontos(perto)).toBe(1)
    // a 200 pt: já cabe bem de longe
    const longe = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`p${i}`, ponto(i * 200, 0)]))
    expect(zoomDosPontos(longe)).toBe(-2)
    // colados (1 pt): para no zoom dos furos
    const colados = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`p${i}`, ponto(i, 0)]))
    expect(zoomDosPontos(colados)).toBe(1.5)
    expect(PONTOS_PARA_JUNTAR).toBe(60)
  })
  it('zoomDosPontos pela varredura dá o mesmo que comparar todos com todos (5.000 pontos do andar-tipo)', () => {
    let semente = 7
    const sorteio = () => ((semente = (semente * 16807) % 2147483647) / 2147483647) * 8000
    const pontos: Record<string, PontoPacote> = {}
    for (let i = 0; i < 400; i++) pontos[`p${i}`] = { disciplina: 'eletrico', tipo: 'ponto_luz', ponto: [sorteio(), sorteio()], nome: '' }
    pontos.dup = { ...pontos.p0 }
    const ds = Object.values(pontos).map((a) => Math.min(...Object.values(pontos).map((b) => Math.hypot(a.ponto[0] - b.ponto[0], a.ponto[1] - b.ponto[1])).filter((d) => d > 0)))
    ds.sort((x, y) => x - y)
    const z = Math.min(Math.max(Math.ceil(Math.log2(24 / ds[Math.floor(ds.length / 2)]) * 2) / 2, -2), 1.5)
    expect(zoomDosPontos(pontos)).toBe(z)
    const muitos: Record<string, PontoPacote> = {}
    for (let i = 0; i < 5000; i++) muitos[`m${i}`] = { disciplina: 'eletrico', tipo: 'ponto_luz', ponto: [sorteio(), sorteio()], nome: '' }
    const t0 = performance.now()
    zoomDosPontos(muitos)
    expect(performance.now() - t0).toBeLessThan(200)
  })
})

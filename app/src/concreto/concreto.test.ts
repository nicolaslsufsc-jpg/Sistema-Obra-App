import { describe, expect, it } from 'vitest'
import type { Linha } from '../nucleo/banco_local'
import { camposDeCorrecao, vigentes, ultimoPorChave } from './vigentes'
import { piorSituacao, situacaoDasIdades, somarDias, textoPrazo } from './cps'
import { areaDe, fracaoDentro, pontoNoPoligono, prepararArea, simplificar, simplificarParaGravar, type Ponto } from './geometria'
import { estadoDasPecas, mudancasDoDesenho, mudancasDoDesenhoPorPlanta, pecaNoPonto, prepararPecas } from './pecas'
import { carregarPlantas, idDaRef, plantaEsquematica, registrarFonteDePlantas, revisaoDaRef, type PlantaPavimento } from './planta'
import { csvPorCaminhao, relatorioPorCaminhao, relatorioPorPeca } from './relatorio'

let n = 0
function linha(campos: Record<string, unknown>): Linha {
  n++
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    obra_id: 'o',
    usuario_id: 'u',
    dispositivo_id: 'd',
    criado_em_dispositivo: `2026-11-03T10:00:${String(n % 60).padStart(2, '0')}.000Z`,
    apagado: false,
    ...campos,
  }
}

describe('vigentes (correções em tabela de evento)', () => {
  it('a correção vale no lugar da linha antiga e mantém a raiz', () => {
    const a = linha({ nota_fiscal: '1' })
    const b = linha({ nota_fiscal: '2', substitui_id: a.id })
    const c = linha({ nota_fiscal: '3', substitui_id: b.id })
    const v = vigentes([c, a, b])
    expect(v).toHaveLength(1)
    expect(v[0].nota_fiscal).toBe('3')
    expect(v[0].raiz).toBe(a.id)
  })

  it('cancelado tira o registro', () => {
    const a = linha({})
    const b = linha({ substitui_id: a.id, cancelado: true })
    expect(vigentes([a, b])).toHaveLength(0)
  })

  it('duas correções da mesma linha (dois aparelhos): vale a mais recente', () => {
    const a = linha({ v: 'original' })
    const b = linha({ v: 'aparelho 1', substitui_id: a.id, criado_em_dispositivo: '2026-11-03T12:00:00.000Z' })
    const c = linha({ v: 'aparelho 2', substitui_id: a.id, criado_em_dispositivo: '2026-11-03T11:00:00.000Z' })
    const v = vigentes([a, c, b])
    expect(v).toHaveLength(1)
    expect(v[0].v).toBe('aparelho 1')
    expect(v[0].raiz).toBe(a.id)
  })

  it('correção que chegou antes da original: raiz é o id da original', () => {
    const b = linha({ substitui_id: 'id-que-ainda-nao-chegou' })
    expect(vigentes([b])[0].raiz).toBe('id-que-ainda-nao-chegou')
  })

  it('camposDeCorrecao copia as colunas do módulo e aponta para a versão atual', () => {
    const a = linha({ sequencia: 1, nota_fiscal: '1', volume_m3: 8 })
    const [v] = vigentes([a])
    expect(camposDeCorrecao(v, ['sequencia', 'nota_fiscal', 'volume_m3'], { nota_fiscal: '9' })).toEqual({
      sequencia: 1,
      nota_fiscal: '9',
      volume_m3: 8,
      substitui_id: a.id,
    })
  })

  it('ultimoPorChave pega o mais recente pela hora do aparelho', () => {
    const a = linha({ k: 'x', criado_em_dispositivo: '2026-11-03T12:00:00.000Z' })
    const b = linha({ k: 'x', criado_em_dispositivo: '2026-11-03T09:00:00.000Z' })
    expect(ultimoPorChave([a, b], (l) => String(l.k)).get('x')).toBe(a)
  })
})

describe('corpos de prova', () => {
  const base = { dataMoldagem: '2026-10-29', idades: [7, 28], fck: 40 }

  it('datas de rompimento = moldagem + idade', () => {
    const r = situacaoDasIdades({ ...base, resultados: [], hoje: '2026-10-30' })
    expect(r.map((i) => i.dataPrevista)).toEqual(['2026-11-05', '2026-11-26'])
    expect(r.map((i) => i.situacao)).toEqual(['previsto', 'previsto'])
    expect(somarDias('2026-12-30', 3)).toBe('2027-01-02')
  })

  it('rompe hoje, aguardando laudo (até 3 dias) e atrasado (depois)', () => {
    const sit = (hoje: string) => situacaoDasIdades({ ...base, resultados: [], hoje })[0].situacao
    expect(sit('2026-11-05')).toBe('rompe_hoje')
    expect(sit('2026-11-08')).toBe('aguardando')
    expect(sit('2026-11-09')).toBe('atrasado')
  })

  it('exemplar é o maior CP da idade; só a maior idade é comparada com o fck', () => {
    const r = situacaoDasIdades({
      ...base,
      hoje: '2026-12-01',
      resultados: [
        { idade_dias: 7, numero_cp: 1, resistencia_mpa: 20 },
        { idade_dias: 7, numero_cp: 2, resistencia_mpa: 25 },
        { idade_dias: 28, numero_cp: 1, resistencia_mpa: 38 },
        { idade_dias: 28, numero_cp: 2, resistencia_mpa: 41.5 },
      ],
    })
    expect(r[0]).toMatchObject({ situacao: 'informado', exemplar: 25, controle: false })
    expect(r[1]).toMatchObject({ situacao: 'conforme', exemplar: 41.5, controle: true })
    const baixo = situacaoDasIdades({ ...base, hoje: '2026-12-01', resultados: [{ idade_dias: 28, numero_cp: 1, resistencia_mpa: 39.9 }] })
    expect(baixo[1].situacao).toBe('abaixo_fck')
  })

  it('pior situação e textos', () => {
    expect(piorSituacao(['conforme', 'aguardando', 'atrasado'])).toBe('atrasado')
    expect(piorSituacao([])).toBeNull()
    const [i7] = situacaoDasIdades({ ...base, resultados: [], hoje: '2026-11-12' })
    expect(textoPrazo(i7)).toBe('rompeu há 7 dias, sem laudo')
  })
})

describe('geometria', () => {
  const quadrado: Ponto[] = [[0, 0], [10, 0], [10, 10], [0, 10]]

  it('ponto no polígono e área', () => {
    expect(pontoNoPoligono(5, 5, quadrado)).toBe(true)
    expect(pontoNoPoligono(15, 5, quadrado)).toBe(false)
    expect(areaDe(quadrado)).toBe(100)
  })

  it('simplificar tira pontos alinhados e mantém as quinas', () => {
    const tracado: Ponto[] = []
    for (let x = 0; x <= 100; x++) tracado.push([x, 0])
    for (let y = 1; y <= 100; y++) tracado.push([100, y])
    const s = simplificar(tracado, 1)
    expect(s).toEqual([[0, 0], [100, 0], [100, 100]])
  })

  it('fração da peça dentro da área', () => {
    const [peca] = prepararPecas([{ id: 'p', tipo: 'P', nome: 'P1', rotulo: [0, 0, 1, 1], polys: [quadrado] }])
    expect(fracaoDentro(peca.amostras, [prepararArea([[-5, -5], [20, -5], [20, 20], [-5, 20]])])).toBe(1)
    const metade = fracaoDentro(peca.amostras, [prepararArea([[-5, -5], [5, -5], [5, 20], [-5, 20]])])
    expect(metade).toBeGreaterThan(0.35)
    expect(metade).toBeLessThan(0.65)
    expect(fracaoDentro(peca.amostras, [prepararArea([[50, 50], [60, 50], [60, 60]])])).toBe(0)
  })
})

describe('peças do caminhão', () => {
  const planta = plantaEsquematica('teste', 'Teste', [
    { id: 'p1', tipo: 'P', nome: 'P1' },
    { id: 'p2', tipo: 'P', nome: 'P2' },
    { id: 'p10', tipo: 'P', nome: 'P10' },
    { id: 'v1', tipo: 'V', nome: 'V1' },
  ])
  const pecas = prepararPecas(planta.elementos)
  const poligonoDe = (id: string) => planta.elementos.find((e) => e.id === id)!.polys[0]

  it('planta esquemática põe todas as peças, em ordem natural (P2 antes de P10)', () => {
    expect(planta.elementos.map((e) => e.id).sort()).toEqual(['p1', 'p10', 'p2', 'v1'])
    const x = (id: string) => poligonoDe(id)[0][0]
    expect(x('p2')).toBeLessThan(x('p10'))
  })

  it('desenho em volta de um pilar inclui só ele; desenho novo sem ele tira', () => {
    const [cx, cy] = poligonoDe('p1')[0]
    // passa 6 px além do pilar: encosta de raspão na viga (abaixo de 10%), que não entra
    const area = prepararArea([[cx - 30, cy - 30], [cx + 50, cy - 30], [cx + 50, cy + 50], [cx - 30, cy + 50]])
    const m1 = mudancasDoDesenho(pecas, [area], [])
    expect(m1).toEqual([{ elemento_id: 'p1', incluido: true, fracao: 1 }])

    const registros = m1.map((m) => linha({ caminhao_id: 'c', origem: 'desenho', ...m }))
    expect(mudancasDoDesenho(pecas, [area], registros)).toEqual([]) // nada mudou, nada a gravar
    expect(mudancasDoDesenho(pecas, [], registros)).toEqual([{ elemento_id: 'p1', incluido: false, fracao: 0 }])
  })

  it('viga comprida: encostar 7% do comprimento não inclui; metade é parcial', () => {
    const viga: Ponto[] = [[0, 0], [276, 0], [276, 20], [0, 20]]
    const [v] = prepararPecas([{ id: 'v', tipo: 'V', nome: 'V1', rotulo: [0, 0, 1, 1], polys: [viga] }])
    const encosta = mudancasDoDesenho([v], [prepararArea([[-40, -40], [20, -40], [20, 60], [-40, 60]])], [])
    expect(encosta).toEqual([])
    const [metade] = mudancasDoDesenho([v], [prepararArea([[-40, -40], [138, -40], [138, 60], [-40, 60]])], [])
    expect(metade.fracao).toBeGreaterThan(0.45)
    expect(metade.fracao).toBeLessThan(0.55)
  })

  it('toque manual vale mais que o desenho; parcial abaixo de 90%', () => {
    const regs = [
      linha({ caminhao_id: 'c', elemento_id: 'v1', origem: 'desenho', fracao: '0.5', incluido: true }),
      linha({ caminhao_id: 'c', elemento_id: 'p1', origem: 'desenho', fracao: 1, incluido: true }),
      linha({ caminhao_id: 'c', elemento_id: 'p1', origem: 'manual', fracao: null, incluido: false }),
    ]
    const e = estadoDasPecas(regs)
    expect(e.get('v1')).toMatchObject({ incluido: true, parcial: true, fracao: 0.5 })
    expect(e.get('p1')).toMatchObject({ incluido: false, origem: 'manual' })
  })
})

describe('relatório', () => {
  it('por caminhão, por peça e CSV para o Excel', () => {
    const caminhoes = [
      { raiz: 'c2', sequencia: 2, nota_fiscal: '\t900002', volume_m3: 8.5 },
      { raiz: 'c1', sequencia: 1, nota_fiscal: '=900001', volume_m3: 8.5 },
    ]
    const estados = new Map([
      ['c1', estadoDasPecas([linha({ elemento_id: 'v1', origem: 'desenho', fracao: 0.5, incluido: true }), linha({ elemento_id: 'p1', origem: 'desenho', fracao: 1, incluido: true })])],
      ['c2', estadoDasPecas([linha({ elemento_id: 'v1', origem: 'desenho', fracao: 0.45, incluido: true })])],
    ])
    const pecas = new Map([
      ['p1', { id: 'p1', nome: 'P1', tipo: 'P' }],
      ['v1', { id: 'v1', nome: 'V1', tipo: 'V' }],
    ])
    const r = relatorioPorCaminhao(caminhoes, estados, pecas)
    expect(r.map((l) => l.caminhao.sequencia)).toEqual([1, 2])
    expect(r[0].pecas.map((i) => i.peca.nome)).toEqual(['P1', 'V1'])
    const porPeca = relatorioPorPeca(r)
    expect(porPeca.find((p) => p.peca.id === 'v1')!.caminhoes.map((c) => c.caminhao.sequencia)).toEqual([1, 2])

    const csv = csvPorCaminhao({ data: '2026-10-29', local_descricao: 'Pilotis; Trecho 1', codigo_construpoint: null }, r, 'Sistema Exemplo')
    const linhas = csv.replace('﻿', '').trim().split('\r\n')
    expect(csv.startsWith('﻿')).toBe(true)
    expect(linhas[0]).toBe('Data;Local;Nº da ficha;Caminhão;NF;Volume (m³);Peça;Tipo;Dentro da área;Parcial;Origem')
    expect(linhas[1]).toBe(`29/10/2026;"Pilotis; Trecho 1";;1;'=900001;8,5;P1;P;100%;não;desenho`)
    expect(linhas[2]).toContain(';V1;V;50%;sim;desenho')
    // tabulação no começo também vira fórmula no Excel: sai com o apóstrofo
    expect(linhas.find((l) => l.includes('900002'))).toContain(";'\t900002;")

    // obra sem sistema oficial: o CSV não tem a coluna da ficha de lá
    const sem = csvPorCaminhao({ data: '2026-10-29', local_descricao: 'Pilotis; Trecho 1', codigo_construpoint: null }, r).replace('﻿', '').trim().split('\r\n')
    expect(sem[0]).toBe('Data;Local;Caminhão;NF;Volume (m³);Peça;Tipo;Dentro da área;Parcial;Origem')
    expect(sem[1]).toBe(`29/10/2026;"Pilotis; Trecho 1";1;'=900001;8,5;P1;P;100%;não;desenho`)
  })
})

describe('várias plantas por pavimento (um trecho por prancha)', () => {
  const quadrado = (x: number, y: number, l = 40): Ponto[] => [[x, y], [x + l, y], [x + l, y + l], [x, y + l]]
  const planta = (id: string, trecho: string, elementos: PlantaPavimento['elementos']): PlantaPavimento => ({
    id,
    revisao: 'R02',
    ref: `${id}@R02`,
    trecho,
    titulo: trecho,
    largura: 1000,
    altura: 1000,
    elementos,
  })

  it('planta_ref guarda planta e revisão; ref antiga sem "@" é o próprio id', () => {
    expect(idDaRef('EXE.ES.LO.124@R02')).toBe('EXE.ES.LO.124')
    expect(revisaoDaRef('EXE.ES.LO.124@R02')).toBe('R02')
    expect(idDaRef('teste-esquematica:abc')).toBe('teste-esquematica:abc')
    expect(revisaoDaRef('teste-esquematica:abc')).toBe('')
    expect(plantaEsquematica('x', 'X', [{ id: 'p', tipo: 'P', nome: 'P1' }]).ref).toBe('x@0')
  })

  it('cada área só conta na planta dela; pilar da emenda fica com a maior fração', () => {
    // trecho 1 e trecho 2 têm coordenadas próprias: a mesma posição é outra peça
    const t1 = prepararPecas([
      { id: 'P1', tipo: 'P', nome: 'P1', rotulo: [0, 0, 1, 1], polys: [quadrado(100, 100)] },
      { id: 'P9', tipo: 'P', nome: 'P9', rotulo: [0, 0, 1, 1], polys: [quadrado(800, 100)] }, // emenda
    ])
    const t2 = prepararPecas([
      { id: 'P20', tipo: 'P', nome: 'P20', rotulo: [0, 0, 1, 1], polys: [quadrado(100, 100)] },
      { id: 'P9', tipo: 'P', nome: 'P9', rotulo: [0, 0, 1, 1], polys: [quadrado(20, 500)] }, // emenda
    ])
    const areaNoT1 = prepararArea([[50, 50], [900, 50], [900, 200], [50, 200]]) // P1 e P9 do trecho 1
    const mud = mudancasDoDesenhoPorPlanta(
      [
        { pecas: t1, areas: [areaNoT1] },
        { pecas: t2, areas: [] },
      ],
      [],
    )
    // P20 está nas mesmas coordenadas do P1, mas no trecho 2: não entra
    expect(mud.map((m) => m.elemento_id).sort()).toEqual(['P1', 'P9'])
    expect(mud.find((m) => m.elemento_id === 'P9')!.fracao).toBe(1)
  })

  it('fonte de plantas: a de verdade vence a de teste, em ordem de trecho; fonte com erro é pulada', async () => {
    const pedido = { obraId: 'o', obraCodigo: 'TESTE', pavimento: { id: 'pav', nome: 'Térreo' }, pecas: [{ id: 'p', tipo: 'P', nome: 'P1' }] }
    const soTeste = await carregarPlantas(pedido)
    expect(soTeste).toHaveLength(1)
    expect(soTeste[0].teste).toBe(true)

    const tirarErro = registrarFonteDePlantas(() => {
      throw new Error('pacote corrompido')
    })
    const tirar = registrarFonteDePlantas(async () => [planta('b', 'Trecho 10', []), planta('a', 'Trecho 2', [])])
    try {
      const reais = await carregarPlantas(pedido)
      expect(reais.map((p) => p.trecho)).toEqual(['Trecho 2', 'Trecho 10'])
      expect(reais.some((p) => p.teste)).toBe(false)
    } finally {
      tirar()
      tirarErro()
    }
    expect(await carregarPlantas({ ...pedido, obraCodigo: 'EXE' })).toEqual([])
  })
})

describe('toque na peça e traço para gravar', () => {
  const viga = { id: 'v', tipo: 'V' as const, nome: 'V1', rotulo: [100, 60, 160, 80] as const, polys: [[[0, 100], [300, 100], [300, 110], [0, 110]]] as Ponto[][] }
  const pilar = { id: 'p', tipo: 'P' as const, nome: 'P1', rotulo: [320, 60, 360, 80] as const, polys: [[[290, 90], [330, 90], [330, 130], [290, 130]]] as Ponto[][] }
  const cortado = { id: 'c', tipo: 'P' as const, nome: 'P2', rotulo: [500, 60, 540, 80] as const, polys: [] as Ponto[][] }
  const elementos = [viga, pilar, cortado]

  it('acha a peça com folga, a menor quando há duas e pelo nome quando não há contorno', () => {
    expect(pecaNoPonto(elementos, 150, 105)?.id).toBe('v')
    // 6 acima da viga: sem folga não pega, com folga pega
    expect(pecaNoPonto(elementos, 150, 94)).toBeUndefined()
    expect(pecaNoPonto(elementos, 150, 94, 8)?.id).toBe('v')
    // no cruzamento viga x pilar fica a de menor área (viga: 3000; pilar: 1600)
    expect(pecaNoPonto(elementos, 295, 105)?.id).toBe('p')
    // pilar cortado na emenda só tem rótulo
    expect(pecaNoPonto(elementos, 520, 70)?.id).toBe('c')
    expect(pecaNoPonto(elementos, 900, 900, 8)).toBeUndefined()
  })

  it('contorno vale mais que rótulo vizinho', () => {
    const rotuloPorCima = { ...cortado, id: 'r', rotulo: [140, 100, 180, 110] as const }
    expect(pecaNoPonto([viga, rotuloPorCima], 150, 105)?.id).toBe('v')
  })

  it('traço enorme cabe no limite do banco e mantém o formato', () => {
    const tracado: Ponto[] = []
    for (let i = 0; i < 30000; i++) tracado.push([i, i % 2 === 0 ? 0 : 3])
    const t0 = performance.now()
    const s = simplificarParaGravar(tracado, 1)
    expect(performance.now() - t0).toBeLessThan(1500) // sem o limite levava dezenas de segundos
    expect(s.length).toBeLessThanOrEqual(4000)
    expect(s[0]).toEqual([0, 0])
    expect(s[s.length - 1]).toEqual(tracado[tracado.length - 1])
    // traço normal não muda
    const normal: Ponto[] = [[0, 0], [100, 0], [100, 100]]
    expect(simplificarParaGravar(normal, 1)).toEqual(normal)
    // caneta parada no lugar: pontos colados saem
    const parada: Ponto[] = [[0, 0], [0.1, 0], [0.2, 0], [50, 0], [50, 50]]
    expect(simplificarParaGravar(parada, 1)).toEqual([[0, 0], [50, 0], [50, 50]])
  })
})

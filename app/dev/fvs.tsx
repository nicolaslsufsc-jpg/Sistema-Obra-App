// Bancada do módulo FVS (ver fvs.html). Põe no banco do navegador, como se tivessem sido
// baixados do servidor, um pavimento com duas plantas de teste desenhadas aqui (a de forma, com
// 24 pilares e 38 vigas numa grade, e a de ambientes, com 6 apartamentos e a área comum), as
// fichas de teste de cada tipo e as plantas já "baixadas" para o aparelho.
// Com ?pacote=URL&fichas=URL usa um pacote e fichas de verdade servidos por um servidor local
// (só no PC, fora do repositório). Sem login: a sincronização falha e o módulo trabalha só
// com o aparelho (como sem internet).
import { render } from 'preact'
import '../src/style.css'
import { banco } from '../src/nucleo/servicos'
import { ModuloFvs } from '../src/fvs/telas/ModuloFvs'
import { guardarPacote, lerComProgresso, type Manifest } from '../src/fvs/pacote'
import { usarFonteDeArquivos } from '../src/fvs/dados'
import type { ItemFicha } from '../src/fvs/situacao'
import { camadasDoPacote, NOME_DA_CAMADA, type CamadaDeBarras } from '../src/fvs/barras'
import { camadaDoFuro, ehFuroDeLaje, pecaDosFurosDeLaje } from '../src/fvs/furos_laje'
import { DISCIPLINAS_DE_PONTOS, NOME_DA_DISCIPLINA as NOME_DOS_PONTOS, type DisciplinaDePontos, type PontoPacote, type TipoDePonto } from '../src/fvs/pontos'
import type { ObraLocal, UsuarioLocal } from '../src/nucleo/conta'
import { sistemasInstalados } from '../src/integracoes/sistema_oficial'

const OBRA = 'b0000000-0000-0000-0000-0000000000bb'
const usuario: UsuarioLocal = { id: '00000000-0000-0000-0000-0000000000a1', email: 'bancada@teste.local' }
// Obra separada para os pacotes de verdade servidos pelo PC (?pasta=...): não mistura com a planta de teste.
const OBRA_PASTA = 'b0000000-0000-0000-0000-0000000000cc'
const USUARIO_HISTORICO = '00000000-0000-0000-0000-0000000000c0'
const params0 = new URLSearchParams(location.search)
// Sistema oficial da bancada: ?sistema=ID, ?sistema= (vazio) para nenhum; sem o parâmetro, o primeiro galho instalado.
const sistemaDaBancada = params0.has('sistema') ? params0.get('sistema') || null : (sistemasInstalados()[0]?.id ?? null)
const obra: ObraLocal = params0.get('pasta')
  ? { id: OBRA_PASTA, codigo: 'BANCADA', nome: 'Bancada da FVS (pacotes do PC)', empresa: null, papel: 'admin', sistema_oficial: sistemaDaBancada }
  : { id: OBRA, codigo: 'TESTE', nome: 'Bancada da FVS', empresa: null, papel: 'admin', sistema_oficial: sistemaDaBancada }
const PAV = 'a0000000-0000-0000-0000-0000000000f1'
const SETOR = 'a1000000-0000-0000-0000-0000000000f1'
const PLANTA = 'a2000000-0000-0000-0000-0000000000f1'
const SETOR_AMB = 'a1000000-0000-0000-0000-0000000000f2'
const PLANTA_AMB = 'a2000000-0000-0000-0000-0000000000f2'
const PLANTA_R01 = 'a2000000-0000-0000-0000-0000000000f3'
const SETOR_VED = 'a1000000-0000-0000-0000-0000000000f4'
const PLANTA_VED = 'a2000000-0000-0000-0000-0000000000f4'
const params = new URLSearchParams(location.search)

const FICHAS_TESTE: Record<'P' | 'V', ItemFicha[]> = {
  P: [
    { n: 1, etapa: 'CONDIÇÕES DE INÍCIO', titulo: 'Local limpo e desimpedido', descricao: 'Item de teste.', dispositivo: 'Visual', tolerancia: 'Visual' },
    { n: 2, etapa: 'CONDIÇÕES DE INÍCIO', titulo: 'Projeto liberado na revisão vigente', dispositivo: 'Visual', tolerancia: 'Visual' },
    { n: 3, etapa: 'MONTAGEM', titulo: 'Locação conferida', descricao: 'Eixos e gastalho.', dispositivo: 'Trena', tolerancia: '3 mm' },
    { n: 4, etapa: 'MONTAGEM', titulo: 'Armadura e espaçadores', dispositivo: 'Visual', tolerancia: 'Conforme projeto' },
    { n: 5, etapa: 'MONTAGEM', titulo: 'Prumo da fôrma', dispositivo: 'Prumo', tolerancia: '2 mm' },
    { n: 6, etapa: 'CONCRETAGEM', titulo: 'Rastreabilidade do concreto', dispositivo: 'Visual', tolerancia: 'Conforme projeto', ...(params.get('rastreio') ? { rastreio_concreto: true } : {}) },
    { n: 7, etapa: 'DESFORMA', titulo: 'Sem falhas de concretagem', dispositivo: 'Visual', tolerancia: 'Visual' },
  ],
  V: [
    { n: 1, etapa: 'CONDIÇÕES DE INÍCIO', titulo: 'Escoramento conferido', dispositivo: 'Visual', tolerancia: 'Visual' },
    { n: 2, etapa: 'EXECUÇÃO', titulo: 'Fundo e laterais da fôrma', dispositivo: 'Trena', tolerancia: '3 mm' },
    { n: 3, etapa: 'EXECUÇÃO', titulo: 'Armadura e cobrimento', dispositivo: 'Visual', tolerancia: 'Conforme projeto' },
    { n: 4, etapa: 'CONCRETAGEM', titulo: 'Adensamento', dispositivo: 'Visual', tolerancia: 'Visual' },
  ],
}

// ?partes=1: consolo no P8 e capitel (maciço) no P9, com os itens deles na ficha de pilar (item 2, 17/11)
const ITENS_DAS_PARTES: ItemFicha[] = [
  { n: 8, etapa: 'CONSOLO - ARMADURA', titulo: 'Barras principais (tirante)', dispositivo: 'Trena', tolerancia: 'Conforme projeto', parte: 'consolo' },
  { n: 9, etapa: 'CONSOLO - ARMADURA', titulo: 'Posição e cobrimento', dispositivo: 'Trena', tolerancia: '3,0 cm', parte: 'consolo' },
  { n: 10, etapa: 'CAPITEL - ARMADURA', titulo: 'Armadura do maciço', dispositivo: 'Trena', tolerancia: 'Conforme projeto', parte: 'capitel' },
]

// ?furos=1: três furos na V1; a ficha de viga ganha o item de furação, que os furos marcam (18/11)
const ITEM_DOS_FUROS: ItemFicha = { n: 5, etapa: 'EXECUÇÃO', titulo: 'Passagens em vigas', descricao: 'Posição, dimensões dos passantes e reforços.', dispositivo: 'Trena', tolerancia: 'Conforme projeto', furos: true }

// Ficha de laje, de teste, para as áreas desenhadas na planta (texto genérico).
const FICHA_LAJE_TESTE: ItemFicha[] = [
  { n: 1, etapa: 'CONDIÇÕES DE INÍCIO', titulo: 'Escoramento conferido', dispositivo: 'Visual', tolerancia: 'Visual' },
  { n: 2, etapa: 'MONTAGEM - FORMA E ARMADURA', titulo: 'Fôrma e cubetas', dispositivo: 'Trena', tolerancia: '3 mm' },
  // ?barras=1: o item de armadura é marcado pelas barras da laje (plano A, 18/11)
  { n: 3, etapa: 'MONTAGEM - FORMA E ARMADURA', titulo: 'Armadura e espaçadores', dispositivo: 'Visual', tolerancia: 'Conforme projeto', ...(params.get('barras') ? { barras: true } : {}) },
  { n: 4, etapa: 'CONCRETAGEM', titulo: 'Rastreabilidade do concreto', dispositivo: 'Visual', tolerancia: 'Conforme projeto' },
  { n: 5, etapa: 'CURA', titulo: 'Cura conferida', dispositivo: 'Visual', tolerancia: '7 dias' },
  // ?furoslaje=1: os pontos de instalação na laje (item 4, 19/11): esgoto e água pelos furos, elétrica à mão
  ...(params.get('furoslaje')
    ? ([
        { n: 6, etapa: 'INSTALAÇÕES', titulo: 'Pontos de esgoto', dispositivo: 'Visual', tolerancia: 'Conforme projeto', instalacao: 'esgoto' },
        { n: 7, etapa: 'INSTALAÇÕES', titulo: 'Pontos de água fria e quente', dispositivo: 'Visual', tolerancia: 'Conforme projeto', instalacao: 'agua' },
        { n: 8, etapa: 'INSTALAÇÕES', titulo: 'Instalações elétricas na laje', dispositivo: 'Visual', tolerancia: 'Conforme projeto', instalacao: 'eletrica' },
      ] satisfies ItemFicha[])
    : []),
]

// Fichas por ambiente, de teste (textos genéricos, não são as PVS da empresa).
const FICHAS_AMBIENTE_TESTE: Array<{ codigo: string; titulo: string; itens: ItemFicha[] }> = [
  {
    codigo: 'TESTE-PVS-ALV',
    titulo: 'Alvenaria (ficha de teste)',
    itens: [
      { n: 1, etapa: 'CONDIÇÕES DE INÍCIO', titulo: 'Local limpo e desimpedido', dispositivo: 'Visual', tolerancia: 'Visual' },
      { n: 2, etapa: 'CONDIÇÕES DE INÍCIO', titulo: 'Projeto na revisão vigente', dispositivo: 'Visual', tolerancia: 'Visual' },
      { n: 3, etapa: 'MARCAÇÃO', titulo: 'Primeira fiada conferida', descricao: 'Eixos e vãos conforme o projeto.', dispositivo: 'Trena', tolerancia: '3 mm' },
      { n: 4, etapa: 'ELEVAÇÃO', titulo: 'Prumo e planeza', dispositivo: 'Prumo e régua', tolerancia: '3 mm' },
      { n: 5, etapa: 'ELEVAÇÃO', titulo: 'Amarração e telas', dispositivo: 'Visual', tolerancia: 'Conforme projeto' },
      { n: 6, etapa: 'TERMINALIDADE', titulo: 'Limpeza do local', dispositivo: 'Visual', tolerancia: 'Visual' },
    ],
  },
  {
    codigo: 'TESTE-PVS-REB',
    titulo: 'Reboco (ficha de teste)',
    itens: [
      { n: 1, etapa: 'CONDIÇÕES DE INÍCIO', titulo: 'Alvenaria liberada', dispositivo: 'Visual', tolerancia: 'Ficha aprovada' },
      { n: 2, etapa: 'EXECUÇÃO', titulo: 'Chapisco curado', dispositivo: 'Visual', tolerancia: '3 dias' },
      { n: 3, etapa: 'EXECUÇÃO', titulo: 'Taliscas e mestras', dispositivo: 'Prumo', tolerancia: '3 mm' },
      { n: 4, etapa: 'TERMINALIDADE', titulo: 'Planeza e esquadro', dispositivo: 'Régua', tolerancia: '3 mm' },
    ],
  },
]

function uuid(prefixo: string, n: number) {
  return `${prefixo}-0000-0000-0000-${String(n).padStart(12, '0')}`
}

async function blobDaTela(tela: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok) => tela.toBlob((b) => ok(b!), 'image/webp', 0.9))
}

/** Planta de teste: grade de pilares e vigas desenhada no navegador, no formato do pacote. */
async function pacoteDeTeste(): Promise<{ manifest: Manifest; bin: Blob }> {
  const L = 2000
  const A = 1300
  const elementos: Manifest['elementos'] = {}
  const linhas = 4
  const colunas = 6
  const vao = 300
  const m0 = 150
  let np = 0
  let nv = 0
  const pilares: Array<[number, number]> = []
  for (let l = 0; l < linhas; l++)
    for (let c = 0; c < colunas; c++) {
      const x = m0 + c * vao
      const y = m0 + l * vao
      pilares.push([x, y])
      np++
      elementos[uuid('e0000000', np)] = {
        tipo: 'P',
        nome: `P${np}`,
        secao: np % 3 ? '20x60' : '25x50',
        rotulo: [x + 14, y - 34, x + 60, y - 14],
        polys: [[[x - 10, y - 25], [x + 10, y - 25], [x + 10, y + 25], [x - 10, y + 25]]],
        detalhe: `P_P${np}`,
      }
    }
  if (params.get('gemeo')) {
    // P6a: pilar com o mesmo desenho do P6 (há obras com dezenas de pares assim), nome logo abaixo
    const p6 = elementos[uuid('e0000000', 6)]
    const [x, y] = pilares[5]
    elementos[uuid('e0000000', 99)] = { ...p6, nome: 'P6a', rotulo: [x + 14, y + 30, x + 60, y + 50], detalhe: 'P_P6' }
  }
  if (params.get('arranque')) {
    // P7a: arranque do pilar de cima, na planta só para ver o detalhe (so_detalhe, sem ficha neste pavimento)
    const [x, y] = pilares[6]
    elementos[uuid('e0000000', 98)] = {
      tipo: 'P',
      nome: 'P7a',
      secao: '20x60',
      rotulo: [x + 14, y + 30, x + 60, y + 50],
      polys: [[[x + 20, y - 25], [x + 40, y - 25], [x + 40, y + 25], [x + 20, y + 25]]],
      detalhe: 'P_P7',
      so_detalhe: true,
    }
  }
  for (let l = 0; l < linhas; l++)
    for (let c = 0; c + 1 < colunas; c++) {
      const [x, y] = pilares[l * colunas + c]
      nv++
      elementos[uuid('e1000000', nv)] = {
        tipo: 'V',
        nome: `V${nv}`,
        secao: '14x50',
        rotulo: [x + 120, y - 30, x + 180, y - 12],
        polys: [[[x + 10, y - 7], [x + vao - 10, y - 7], [x + vao - 10, y + 7], [x + 10, y + 7]]],
      }
    }
  for (let c = 0; c < colunas; c++)
    for (let l = 0; l + 1 < linhas; l++) {
      const [x, y] = pilares[l * colunas + c]
      nv++
      elementos[uuid('e1000000', nv)] = {
        tipo: 'V',
        nome: `V${nv}`,
        secao: '14x50',
        rotulo: [x + 12, y + 140, x + 60, y + 158],
        polys: [[[x - 7, y + 25], [x + 7, y + 25], [x + 7, y + vao - 25], [x - 7, y + vao - 25]]],
      }
    }
  if (params.get('partes')) {
    const [x8, y8] = pilares[7]
    elementos[uuid('e0000000', 8)].partes = [{ tipo: 'consolo', polys: [[[x8 + 10, y8 - 14], [x8 + 50, y8 - 14], [x8 + 50, y8 + 24], [x8 + 10, y8 + 24]]], detalhe: 'C_P8' }]
    const [x9, y9] = pilares[8]
    elementos[uuid('e0000000', 9)].partes = [{ tipo: 'capitel', polys: [[[x9 - 55, y9 - 55], [x9 + 55, y9 - 55], [x9 + 55, y9 + 55], [x9 - 55, y9 + 55]]] }]
  }
  if (params.get('furos')) {
    // V1 vai de P1 a P2 (y = 150): três furos ao longo dela, numerados como o pipeline faz
    const v1 = uuid('e1000000', 1)
    ;[220, 300, 380].forEach((x, i) => {
      const y = m0
      const r = 3
      elementos[uuid('e3000000', i + 1)] = {
        tipo: 'F',
        nome: `V1-F${i + 1}`,
        secao: i === 1 ? '20×10 cm · 15 cm do topo' : 'Ø 10 cm · 20 cm do topo',
        rotulo: [x - r, y - r, x + r, y + r],
        polys: [[[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]]],
        viga: v1,
        furo: i === 1 ? { forma: 'retangular', largura: 20, altura: 10, topo: 15, fundo: 25, disciplinas: ['ELT'] } : { forma: 'circular', diametro: 10, topo: 20, fundo: 20, disciplinas: ['SAN'] },
      }
    })
  }
  if (params.get('furoslaje')) {
    // furos de laje (sem viga): três no vão de P8, P9, P14 e P15 (x e y de 450 a 750) e um fora dele;
    // FL5, colado no FL4 (8 pontos: no zoom 2, os alvos de 44 px se cruzam), para o "Qual furo?"; FL6,
    // de Geral, dentro do vão: fica escondido e fora da conta (20/11)
    const furosDeLaje: Array<[number, number, string]> = [
      [520, 520, 'Sanitário / drenagem'],
      [600, 640, 'Hidráulica'],
      [680, 560, 'Elétrica / telecom'],
      [600, 400, 'Sanitário / drenagem'],
      [608, 400, 'Sanitário / drenagem'],
      [560, 680, 'Geral'],
    ]
    furosDeLaje.forEach(([x, y, d], i) => {
      const r = 3
      elementos[uuid('e5000000', i + 1)] = {
        tipo: 'F',
        nome: `FL${i + 1}`,
        secao: 'Ø 15 cm',
        rotulo: [x - r, y - r, x + r, y + r],
        polys: [[[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]]],
        furo: { forma: 'circular', diametro: 15, espessura: 12, disciplinas: [d], laje: true },
      }
    })
  }
  if (params.get('furacaototal')) {
    // 21/11 ("igual à armadura"): uma caixinha no P1 (o pipeline manda "pilar") e um furo de laje de esgoto com
    // o centro em cima da V1 (pacote antigo: vira furo da V1 ao abrir, pecaDosFurosDeLaje)
    const [px, py] = pilares[0]
    const r = 3
    elementos[uuid('e6000000', 1)] = {
      tipo: 'F',
      nome: 'P1-F1',
      secao: 'Caixa 10×10 cm',
      rotulo: [px - r, py - r, px + r, py + r],
      polys: [[[px - r, py - r], [px + r, py - r], [px + r, py + r], [px - r, py + r]]],
      pilar: uuid('e0000000', 1),
      furo: { forma: 'retangular', largura: 10, altura: 10, disciplinas: ['ELT'] },
    }
    const [vx, vy] = [260, m0]
    elementos[uuid('e6000000', 2)] = {
      tipo: 'F',
      nome: 'FL7',
      secao: 'Ø 10 cm',
      rotulo: [vx - r, vy - r, vx + r, vy + r],
      polys: [[[vx - r, vy - r], [vx + r, vy - r], [vx + r, vy + r], [vx - r, vy + r]]],
      furo: { forma: 'circular', diametro: 10, espessura: 12, disciplinas: ['Sanitário / drenagem'], laje: true },
    }
  }
  // desenho da "prancha": peças hachuradas e nomes, em tiles de 512 nos níveis -2..1
  const base = document.createElement('canvas')
  const escala = 2
  base.width = L * escala
  base.height = A * escala
  const g = base.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, base.width, base.height)
  g.scale(escala, escala)
  g.strokeStyle = '#999'
  g.setLineDash([12, 6])
  for (let c = 0; c < colunas; c++) g.strokeRect(m0 + c * vao, 40, 0.1, A - 80)
  g.setLineDash([])
  g.font = '14px sans-serif'
  for (const e of Object.values(elementos)) {
    const p = e.polys[0]
    g.fillStyle = e.tipo === 'P' ? '#555' : '#ccc'
    g.strokeStyle = '#222'
    g.beginPath()
    p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.closePath()
    g.fill()
    g.stroke()
    g.fillStyle = '#111'
    g.fillText(e.nome, e.rotulo[0], e.rotulo[3] - 3)
  }
  for (const e of Object.values(elementos))
    for (const pt of e.partes ?? []) {
      g.strokeStyle = '#444'
      g.setLineDash([4, 3])
      g.beginPath()
      pt.polys[0].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
      g.closePath()
      g.stroke()
      g.setLineDash([])
    }
  g.font = 'bold 28px sans-serif'
  g.fillText('PLANTA DE TESTE (bancada da FVS)', 40, A - 40)
  const { pedacos, guardar, fechar } = novoBinario()
  await cortarTiles(base, escala, guardar)
  const detalhes: Manifest['detalhes'] = {}
  for (const e of Object.values(elementos)) {
    if (!e.detalhe) continue
    const t = document.createElement('canvas')
    t.width = 600
    t.height = 360
    const tg = t.getContext('2d')!
    tg.fillStyle = '#fff'
    tg.fillRect(0, 0, 600, 360)
    tg.strokeStyle = '#333'
    tg.strokeRect(40, 40, 140, 280)
    tg.fillStyle = '#111'
    tg.font = 'bold 26px sans-serif'
    tg.fillText(`${e.nome} (${e.secao})`, 220, 80)
    tg.font = '18px sans-serif'
    tg.fillText('Detalhe de teste', 220, 120)
    guardar(`d:${e.detalhe}`, await blobDaTela(t))
    detalhes[e.detalhe] = { titulo: e.nome, prancha: 'TESTE.ES.LO.002.PIL-R00', aco: false }
  }
  if (params.get('partes')) {
    const t = document.createElement('canvas')
    t.width = 600
    t.height = 300
    const tg = t.getContext('2d')!
    tg.fillStyle = '#fff'
    tg.fillRect(0, 0, 600, 300)
    tg.fillStyle = '#111'
    tg.font = 'bold 26px sans-serif'
    tg.fillText('CONSOLO P8 (detalhe de teste)', 40, 80)
    guardar('d:C_P8', await blobDaTela(t))
    detalhes['C_P8'] = { titulo: 'CONSOLO P8', prancha: 'TESTE.ES.LO.003.CON-R00', aco: false }
  }
  const manifest: Manifest = {
    formato: 1,
    planta_id: PLANTA,
    obra: 'TESTE',
    pavimento: 'Pavimento de teste',
    trecho: 'Trecho 1',
    prancha: 'TESTE.ES.LO.001.FOR-R00',
    revisao: 'R00',
    largura: L,
    altura: A,
    tile: 512,
    niveis: NIVEIS,
    elementos,
    detalhes,
    pedacos,
    ...(params.get('barras') ? { barras: barrasDeTeste() } : {}),
    // ?armadura=1: a armadura de laje vai para plantas próprias, uma por direção (20/11)
    ...(params.get('barras') && params.get('armadura') ? { camadas_separadas: true } : {}),
    // ?furoslaje=1&furacao=1: os furos de laje vão para plantas próprias, uma por camada (21/11)
    ...(params.get('furoslaje') && params.get('furacao') ? { furos_laje_separados: true } : {}),
    // ?furacaototal=1: todos os furos (laje, viga e pilar) numa planta de furação só, igual à armadura (21/11)
    ...(params.get('furacaototal') ? { furos_separados: true } : {}),
  }
  return { manifest, bin: fechar() }
}

/**
 * ?barras=1: barras de laje no vão entre P8, P9, P14 e P15 (x 450 a 750, y 450 a 750), em duas camadas;
 * a N4 passa para o vão vizinho (conta nas duas lajes). A ficha de laje ganha o item de armadura (18/11).
 */
function barrasDeTeste(): NonNullable<Manifest['barras']> {
  const b = (n: number, camada: CamadaDeBarras, linha: Array<[number, number]>, posicao: string) => [uuid('e4000000', n), { camada, linha, posicao, texto: `${posicao} 1ø8 C=400` }] as const
  return Object.fromEntries([
    b(1, 'longitudinal_inferior', [[500, 520], [700, 520]], 'N1'),
    b(2, 'longitudinal_inferior', [[500, 580], [700, 580]], 'N2'),
    b(3, 'longitudinal_inferior', [[500, 640], [700, 640]], 'N3'),
    b(4, 'longitudinal_inferior', [[600, 700], [1000, 700]], 'N4'),
    b(5, 'transversal_superior', [[600, 490], [600, 710]], 'N5'),
  ])
}

const NIVEIS = [-2, -1, 0, 1]

function novoBinario() {
  const pedacos: Manifest['pedacos'] = {}
  const partes: Blob[] = []
  let pos = 0
  return {
    pedacos,
    guardar(nome: string, b: Blob) {
      pedacos[nome] = [pos, b.size]
      partes.push(b)
      pos += b.size
    },
    fechar: () => new Blob(partes),
  }
}

/** Corta o desenho da "prancha" em tiles de 512 nos níveis do pacote. */
async function cortarTiles(base: HTMLCanvasElement, escala: number, guardar: (nome: string, b: Blob) => void) {
  for (const z of NIVEIS) {
    const f = 2 ** z / escala
    const w = Math.round(base.width * f)
    const h = Math.round(base.height * f)
    for (let ty = 0; ty * 512 < h; ty++)
      for (let tx = 0; tx * 512 < w; tx++) {
        const t = document.createElement('canvas')
        t.width = 512
        t.height = 512
        const tg = t.getContext('2d')!
        tg.fillStyle = '#fff'
        tg.fillRect(0, 0, 512, 512)
        tg.drawImage(base, (tx * 512) / f, (ty * 512) / f, 512 / f, 512 / f, 0, 0, 512, 512)
        guardar(`t:${z}/${tx}/${ty}`, await blobDaTela(t))
      }
  }
}

/**
 * Planta de ambientes de teste: 4 apartamentos acima do corredor e 2 abaixo, cada um com dois
 * quartos e uma sala, mais o corredor e a escada (área comum). Como na planta de verdade, o nome
 * do ambiente ("101-01") não está desenhado: só o rótulo do apartamento ("101(TIPO A)").
 * Medidas em pontos; 50 pontos = 1 m (só para a área de teste).
 */
async function pacoteDeAmbientesDeTeste(): Promise<{ manifest: Manifest; bin: Blob }> {
  const L = 2000
  const A = 1300
  const elementos: Manifest['elementos'] = {}
  const rotulosApto: Array<[string, number, number]> = []
  let n = 0
  const ambiente = (nome: string, grupo: string, x: number, y: number, w: number, h: number, comodo?: string) => {
    n++
    const cx = x + w / 2
    const cy = y + h / 2
    elementos[uuid('e2000000', n)] = {
      tipo: 'A',
      nome,
      grupo,
      ...(comodo ? { comodo } : {}),
      // ?comodos=1: tabela ficha × tipo de cômodo (pipeline/fvs/ambientes.py): o reboco de teste não vale nas suítes
      ...(params.get('comodos') && comodo?.startsWith('Suíte') ? { sem_fichas: ['TESTE-PVS-REB'] } : {}),
      secao: `${((w * h) / 2500).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m²`,
      rotulo: [cx - 22, cy - 7, cx + 22, cy + 7],
      polys: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]],
    }
  }
  const apto = (numero: number, x0: number, acima: boolean) => {
    const g = `Apto ${numero}`
    // 103 e 104 com nome de cômodo (tabela por apartamento-tipo); os outros, só com o número
    const nomes = numero === 103 || numero === 104 ? ['Suíte 01', 'Suíte 02', 'Living / Cozinha'] : []
    const [yQuartos, ySala] = acima ? [100, 300] : [970, 710]
    // ordem de leitura: de cima para baixo, da esquerda para a direita
    const quartos = () => {
      ambiente(`${numero}-${acima ? '01' : '02'}`, g, x0, yQuartos, 215, 190, nomes[0])
      ambiente(`${numero}-${acima ? '02' : '03'}`, g, x0 + 225, yQuartos, 215, 190, nomes[1])
    }
    const sala = () => ambiente(`${numero}-${acima ? '03' : '01'}`, g, x0, ySala, 440, 250, nomes[2])
    if (acima) quartos(), sala()
    else sala(), quartos()
    rotulosApto.push([`${numero}(TIPO ${acima ? 'A' : 'B'})`, x0 + 220, ySala + (acima ? 60 : 190)])
  }
  for (let i = 0; i < 4; i++) apto(101 + i, 100 + i * 450, true)
  for (let i = 0; i < 2; i++) apto(105 + i, 100 + i * 450, false)
  ambiente('AC-01', 'Área comum', 100, 560, 1790, 140)
  ambiente('AC-02', 'Área comum', 1450, 710, 440, 250)
  if (params.get('esquadrias')) {
    // ?esquadrias=1: portas e janelas do apto 101, como o pipeline faz (pipeline/fvs/esquadrias.py): a porta
    // entre dois cômodos fica nos dois, um ponto de cada lado da parede; a janela, só do lado de dentro
    const idDe = (nome: string) => Object.entries(elementos).find(([, e]) => e.nome === nome)![0]
    let k = 0
    const esq = (amb: string, codigo: string, x: number, y: number, outro?: string, classe: 'porta' | 'janela' = 'porta') => {
      k++
      const r = 3
      elementos[uuid('e4000000', k)] = {
        tipo: 'E',
        nome: `${amb}-${codigo}`,
        secao: codigo,
        rotulo: [x - 20, y - r, x + 20, y + r],
        polys: [[[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]]],
        ambiente: idDe(amb),
        esquadria: { codigo, classe, ...(outro ? { outro_lado: outro } : {}) },
      }
    }
    esq('101-01', 'PM80', 305, 170, '101-02')
    esq('101-02', 'PM80', 335, 170, '101-01')
    esq('101-01', 'JA120B', 180, 112, undefined, 'janela')
    esq('101-01', 'PM70', 220, 280, '101-03')
    esq('101-03', 'PM70', 220, 312, '101-01')
    esq('101-03', 'PM90', 420, 538, 'AC-01')
    esq('AC-01', 'PM90', 420, 572, '101-03')
  }

  const base = document.createElement('canvas')
  const escala = 2
  base.width = L * escala
  base.height = A * escala
  const g = base.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, base.width, base.height)
  g.scale(escala, escala)
  g.strokeStyle = '#333'
  g.lineWidth = 7
  for (const e of Object.values(elementos)) {
    if (e.tipo !== 'A') continue
    const [[x0, y0], , [x1, y1]] = e.polys[0]
    g.strokeRect(x0, y0, x1 - x0, y1 - y0)
  }
  g.fillStyle = '#111'
  g.textAlign = 'center'
  g.font = '22px sans-serif'
  for (const [texto, x, y] of rotulosApto) g.fillText(texto, x, y)
  g.font = '16px sans-serif'
  g.fillText('CIRCULAÇÃO', 1000, 600)
  g.fillText('ESCADA', 1670, 800)
  g.textAlign = 'left'
  g.font = 'bold 28px sans-serif'
  g.fillText('PLANTA DE AMBIENTES DE TESTE (bancada da FVS)', 40, A - 40)

  const { pedacos, guardar, fechar } = novoBinario()
  await cortarTiles(base, escala, guardar)
  const detalhes: Manifest['detalhes'] = {}
  if (params.get('modulacao')) {
    // ?modulacao=1: o recorte da 1ª fiada do apto 101, como o pipeline faz (pipeline/fvs/modulacao.py):
    // uma imagem só, apontada pelos três cômodos do apartamento
    const t = document.createElement('canvas')
    t.width = 640
    t.height = 520
    const tg = t.getContext('2d')!
    tg.fillStyle = '#fff'
    tg.fillRect(0, 0, 640, 520)
    tg.strokeStyle = '#333'
    tg.lineWidth = 6
    tg.strokeRect(40, 60, 270, 220)
    tg.strokeRect(330, 60, 270, 220)
    tg.strokeRect(40, 300, 560, 180)
    tg.lineWidth = 1
    for (let x = 40; x < 600; x += 20) tg.strokeRect(x, 54, 20, 6)
    tg.fillStyle = '#111'
    tg.font = 'bold 24px sans-serif'
    tg.fillText('MODULAÇÃO 1ª FIADA · APTO 101 (teste)', 40, 36)
    guardar('d:M_Apto_101', await blobDaTela(t))
    detalhes['M_Apto_101'] = { titulo: 'Modulação · Apto 101', prancha: 'TESTE.VD.EX.024.TIPA-R00', aco: false }
    for (const e of Object.values(elementos)) if (e.tipo === 'A' && e.grupo === 'Apto 101') e.detalhe = 'M_Apto_101'
  }
  if (params.get('projetos')) {
    // ?projetos=1: outros projetos do apto 101 (pipeline/fvs/modulacao.py, ler_projeto): a paginação de piso só na
    // ficha de reboco de teste e a impermeabilização em todas (sem lista de fichas), coloridos como no pipeline
    const desenhar = async (chave: string, texto: string, cor: string) => {
      const t = document.createElement('canvas')
      t.width = 600
      t.height = 420
      const tg = t.getContext('2d')!
      tg.fillStyle = '#fff'
      tg.fillRect(0, 0, 600, 420)
      tg.fillStyle = cor
      tg.fillRect(60, 80, 220, 160)
      tg.strokeStyle = '#333'
      tg.lineWidth = 6
      tg.strokeRect(40, 60, 520, 320)
      tg.fillStyle = '#111'
      tg.font = 'bold 22px sans-serif'
      tg.fillText(texto, 40, 36)
      guardar(`d:${chave}`, await blobDaTela(t))
    }
    await desenhar('PP_Apto_101', 'PAGINAÇÃO DE PISO · APTO 101 (teste)', '#f3c98b')
    await desenhar('IM_Apto_101', 'IMPERMEABILIZAÇÃO · APTO 101 (teste)', '#a6e3a6')
    detalhes['PP_Apto_101'] = { titulo: 'Paginação de piso · Apto 101', prancha: 'TESTE.AR.DE.053.PISO-R00', aco: false, fichas: ['TESTE-PVS-REB'] }
    detalhes['IM_Apto_101'] = { titulo: 'Impermeabilização · Apto 101', prancha: 'TESTE.IM.EX.006.PAV-R01', aco: false }
    for (const e of Object.values(elementos)) if (e.tipo === 'A' && e.grupo === 'Apto 101') e.projetos = ['PP_Apto_101', 'IM_Apto_101']
  }
  const manifest: Manifest = {
    formato: 1,
    planta_id: PLANTA_AMB,
    obra: 'TESTE',
    pavimento: 'Pavimento de teste',
    trecho: 'Ambientes',
    prancha: 'TESTE.AR.EX.003.PAV-R00',
    revisao: 'R00',
    largura: L,
    altura: A,
    tile: 512,
    niveis: NIVEIS,
    elementos,
    detalhes,
    pedacos,
  }
  return { manifest, bin: fechar() }
}

/** Fichas no formato do HTML legado ({"P": {nome, itens}, "V": ...}) → itens do sistema. */
function itensDoLegado(lista: Array<Record<string, unknown>>): ItemFicha[] {
  return lista.map((i) => ({
    n: Number(i.n),
    etapa: String(i.etapa ?? ''),
    titulo: String(i.titulo ?? ''),
    descricao: String(i.desc ?? ''),
    dispositivo: String(i.disp ?? ''),
    tolerancia: String(i.tol ?? ''),
    // item de furação da viga: os furos marcam (18/11)
    ...(i.furos === true ? { furos: true } : {}),
  }))
}

type LinhaDeCadastro = { tabela: string; linha: Record<string, unknown> & { id: string } }

/** Cadastro de uma planta de teste: setor, arquivos, planta e os locais (peças ou ambientes). */
function cadastroDaPlanta(base: Record<string, unknown>, manifest: Manifest, bin: Blob, setorId: string, disciplina: string, n: number): LinhaDeCadastro[] {
  const id = manifest.planta_id
  const linhas: LinhaDeCadastro[] = [
    { tabela: 'setores', linha: { ...base, id: setorId, pavimento_id: PAV, nome_projeto: manifest.trecho, disciplina } },
    { tabela: 'arquivos', linha: { ...base, id: uuid('f1000000', n), caminho: `${OBRA}/fvs/plantas/${id}/manifest.json`, hash: '0'.repeat(64), tamanho: 1, tipo: 'application/json' } },
    { tabela: 'arquivos', linha: { ...base, id: uuid('f1000000', n + 1), caminho: `${OBRA}/fvs/plantas/${id}/pacote.bin`, hash: '0'.repeat(64), tamanho: bin.size, tipo: 'application/octet-stream' } },
    {
      tabela: 'plantas',
      linha: {
        ...base,
        id,
        pavimento_id: PAV,
        setor_id: setorId,
        prancha: manifest.prancha,
        revisao: manifest.revisao,
        largura: manifest.largura,
        altura: manifest.altura,
        manifest_id: uuid('f1000000', n),
        pacote_id: uuid('f1000000', n + 1),
        elementos: Object.keys(manifest.elementos).length,
      },
    },
  ]
  for (const [eid, e] of Object.entries(manifest.elementos)) {
    linhas.push({ tabela: 'elementos', linha: { ...base, id: eid, pavimento_id: PAV, tipo: e.tipo, nome: e.nome, secao: e.secao || null } })
  }
  return linhas
}

const gravarCadastro = (linhas: LinhaDeCadastro[]) =>
  banco.registros.bulkPut(linhas.map((l) => ({ tabela: l.tabela, id: l.linha.id, obra_id: OBRA, linha: l.linha as never, pendente: 0 as const })))

/**
 * Histórico de teste, como o que vem do sistema oficial: P1 com uma ficha aprovada por outra pessoa em
 * data antiga; P2 com ficha duplicada (uma aceita, outra com R); P3 com ficha agendada, sem marcação.
 * A ficha da laje não tem peça na planta. Nomes inventados: nada de obra de verdade.
 */
async function semearHistoricoDeTeste(base: Record<string, unknown>) {
  const fichaP = uuid('f0000000', 1)
  const fc = (n: number, peca: number | null, status: string, inspetor: string | null, extra: Record<string, unknown> = {}) => ({
    tabela: 'fvs_fichas_campo',
    linha: {
      ...base,
      id: uuid('f8000000', n),
      elemento_id: peca === null ? null : uuid('e0000000', peca),
      ficha_id: peca === null ? null : fichaP,
      codigo: `FVS-TESTE-${String(n).padStart(4, '0')}`,
      local_construpoint: peca === null ? 'Infra estrutura \\ Setor 1' : `Pavimento de teste \\ Trecho 1 \\ Pilares \\ P${peca}`,
      ficha_codigo: peca === null ? 'TESTE-PVS-LAJE' : 'TESTE-PVS-P',
      ficha_titulo: peca === null ? 'Laje (ficha de teste)' : 'Pilares (ficha de teste)',
      status,
      inspetor,
      atualizada_em: '2026-09-30T11:15:51.000Z',
      qtd_a: 0,
      qtd_r: 0,
      qtd_na: 0,
      ...extra,
    },
  })
  const ev = (n: number, ficha: number, peca: number, item: number, resultado: string, rodada: number, quando: string, quem: string, observacao: string | null = null) => ({
    tabela: 'fvs_eventos',
    linha: {
      ...base,
      id: uuid('f9000000', n),
      elemento_id: uuid('e0000000', peca),
      ficha_id: fichaP,
      ficha_campo_id: uuid('f8000000', ficha),
      item,
      resultado,
      rodada,
      observacao,
      verificado_por: quem,
      origem_id: String(n),
      usuario_id: USUARIO_HISTORICO,
      criado_em_dispositivo: quando,
    },
  })
  const tudoA = (ficha: number, peca: number, inicio: number, quem: string, quando: string) =>
    [1, 2, 3, 4, 5, 6, 7].map((item, i) => ev(inicio + i, ficha, peca, item, 'A', 1, quando, quem))
  const linhas = [
    fc(1, 1, 'Aceito', 'Pessoa Um', { qtd_a: 7 }),
    fc(2, 2, 'Aceito', 'Pessoa Um', { qtd_a: 7 }),
    fc(3, 2, 'Pendente Reinspeção', 'Pessoa Dois', { qtd_a: 1, qtd_r: 1 }),
    fc(4, 3, 'Agendado', 'Pessoa Dois'),
    fc(5, null, 'Em Andamento', 'Pessoa Um', { qtd_a: 4 }),
    ...tudoA(1, 1, 100, 'Pessoa Um', '2026-08-10T12:30:00.000Z'),
    ...tudoA(2, 2, 200, 'Pessoa Um', '2026-08-11T12:30:00.000Z'),
    ev(300, 3, 2, 1, 'A', 1, '2026-09-30T11:10:00.000Z', 'Pessoa Dois'),
    ev(301, 3, 2, 2, 'R', 1, '2026-09-30T11:15:51.000Z', 'Pessoa Dois', 'Falta espaçador'),
  ]
  await gravarCadastro(linhas)
}

/**
 * ?esquadrias=1: os itens de vão das fichas de teste passam a ser marcados pelas esquadrias (a alvenaria
 * com dois, como a ficha de verdade: eixos e vãos, vergas e contravergas; o reboco com os requadros).
 */
function itensComEsquadrias(codigo: string, itens: ItemFicha[]): ItemFicha[] {
  if (!params.get('esquadrias')) return itens
  if (codigo === 'TESTE-PVS-ALV')
    return [
      ...itens.map((i) => (i.n === 3 ? { ...i, esquadrias: true } : i)),
      { n: 7, etapa: 'ELEVAÇÃO', titulo: 'Vergas e contravergas', dispositivo: 'Trena', tolerancia: 'Conforme projeto', esquadrias: true },
    ]
  if (codigo === 'TESTE-PVS-REB') return [...itens, { n: 5, etapa: 'TERMINALIDADE', titulo: 'Requadros dos vãos', dispositivo: 'Esquadro', tolerancia: '3 mm', esquadrias: true }]
  return itens
}

/**
 * ?vedacao=1: planta de modulação de teste (20/11), como o pipeline faz (pipeline/fvs/vedacao.py): o mesmo fundo da
 * planta de ambientes, e cada parede dos aptos 101 e 102 e uma do corredor como local "M" ("101-M01"...). A ficha
 * de alvenaria de teste passa a valer por ambiente e por parede.
 */
async function semearVedacao(base: Record<string, unknown>) {
  const { manifest: amb, bin } = await pacoteDeAmbientesDeTeste()
  const elementos: Manifest['elementos'] = {}
  const meia = 3.5 // a linha das paredes no fundo tem 7 pontos
  const porUnidade = new Map<string, number>()
  const parede = (unidade: string, grupo: string, x0: number, y0: number, x1: number, y1: number) => {
    const k = (porUnidade.get(unidade) ?? 0) + 1
    porUnidade.set(unidade, k)
    const [a, b, c, d] = y0 === y1 ? [x0, y0 - meia, x1, y0 + meia] : [x0 - meia, y0, x0 + meia, y1]
    const cx = (a + c) / 2
    const cy = (b + d) / 2
    const m = Math.hypot(x1 - x0, y1 - y0) / 50 // 50 pontos por metro na planta de teste
    elementos[uuid('e5000000', Object.keys(elementos).length + 1)] = {
      tipo: 'M',
      nome: `${unidade}-M${String(k).padStart(2, '0')}`,
      secao: `${m.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m · 14 cm`,
      grupo,
      rotulo: [cx - 14, cy - 5, cx + 14, cy + 5],
      polys: [[[a, b], [c, b], [c, d], [a, d]]],
    }
  }
  // de cima para baixo, da esquerda para a direita, como o pipeline numera
  for (const [numero, x0] of [[101, 100], [102, 550]] as const) {
    const g = `Apto ${numero}`
    parede(String(numero), g, x0, 100, x0 + 440, 100) // fachada
    parede(String(numero), g, x0 + 220, 100, x0 + 220, 290) // entre as suítes
    parede(String(numero), g, x0, 300, x0 + 440, 300) // suítes x sala
    parede(String(numero), g, x0, 550, x0 + 440, 550) // sala x corredor
  }
  parede('AC', 'Área comum', 100, 700, 1890, 700) // fundo do corredor
  const manifest: Manifest = { ...amb, planta_id: PLANTA_VED, trecho: 'Modulação', prancha: 'TESTE.VD.EX.001.PAV-R00', elementos, detalhes: {} }
  await guardarPacote(JSON.stringify(manifest), bin)
  await gravarCadastro(cadastroDaPlanta(base, manifest, bin, SETOR_VED, 'vedacao', 40))
}

/** Planta de ambientes e fichas por ambiente de teste (entra também em bancada já usada antes). */
async function semearAmbientes(base: Record<string, unknown>) {
  const { manifest, bin } = await pacoteDeAmbientesDeTeste()
  await guardarPacote(JSON.stringify(manifest), bin)
  const linhas = cadastroDaPlanta(base, manifest, bin, SETOR_AMB, 'arquitetura', 3)
  FICHAS_AMBIENTE_TESTE.forEach((f, i) => {
    linhas.push({ tabela: 'fichas_modelo', linha: { ...base, id: uuid('f0000000', 3 + i), codigo: f.codigo, titulo: f.titulo, revisao: '0', aplica_a: params.get('vedacao') && f.codigo === 'TESTE-PVS-ALV' ? ['A', 'M'] : ['A'], itens: itensComEsquadrias(f.codigo, f.itens) } })
  })
  await gravarCadastro(linhas)
}

/**
 * ?regras=1: regras da obra de teste (como viriam do config_fvs.json): a desforma do pilar (item 7)
 * espera 3 dias da concretagem (item 6), e o item 4 (armadura) marca C no item 5 (prumo) pela ligação.
 * ?regras=pecas: mais as ligações entre peças (20/11): o item 4 da ficha de laje (concretagem) marca C
 * no item 4 da viga e no item 6 do pilar, em cada peça de dentro da área de laje.
 */
/**
 * ?rastreio=1: o item 6 do pilar (rastreabilidade) é o do rastreio do concreto, e o P6 tem um caminhão
 * (caminhão 2, NF 4321) numa concretagem de hoje. O P7 fica sem caminhão.
 */
async function semearRastreio() {
  const p6 = (await banco.registros.where('[tabela+obra_id]').equals(['elementos', OBRA]).toArray()).find((r) => r.linha.nome === 'P6')
  if (!p6) return
  const hoje = new Date()
  const data = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
  const base = { obra_id: OBRA, usuario_id: usuario.id, dispositivo_id: '00000000-0000-0000-0000-000000000000', criado_em_dispositivo: new Date().toISOString(), apagado: false }
  const linhas = [
    { tabela: 'concretagens', linha: { ...base, id: 'c1000000-0000-0000-0000-0000000000c1', data, substitui_id: null, cancelado: false } },
    { tabela: 'caminhoes', linha: { ...base, id: 'c2000000-0000-0000-0000-0000000000c1', concretagem_id: 'c1000000-0000-0000-0000-0000000000c1', sequencia: 2, nota_fiscal: '4321', substitui_id: null, cancelado: false } },
    { tabela: 'caminhao_elementos', linha: { ...base, id: 'c3000000-0000-0000-0000-0000000000c1', caminhao_id: 'c2000000-0000-0000-0000-0000000000c1', elemento_id: p6.id, origem: 'desenho', fracao: 1, incluido: true } },
  ]
  await banco.registros.bulkPut(linhas.map((l) => ({ tabela: l.tabela, id: l.linha.id, obra_id: OBRA, linha: l.linha as never, pendente: 0 as const })))
}

async function semearRegras() {
  const regras = {
    prazos: [{ id: 'desforma', ficha: 'TESTE-PVS-P', item: 7, dias: 3, depois_de: { tipo: 'concretagem' }, texto: 'Desforma' }],
    ligacoes: [
      { id: 'armadura-prumo', de: { ficha: 'TESTE-PVS-P', item: 4 }, para: { ficha: 'TESTE-PVS-P', item: 5 } },
      ...(params.get('regras') === 'pecas'
        ? [
            { id: 'laje-viga', entre: 'area', de: { ficha: 'TESTE-PVS-LAJE', item: 4 }, para: { ficha: 'TESTE-PVS-V', item: 4 } },
            { id: 'laje-pilar', entre: 'area', de: { ficha: 'TESTE-PVS-LAJE', item: 4 }, para: { ficha: 'TESTE-PVS-P', item: 6 } },
          ]
        : []),
    ],
  }
  const linha = { id: 'c0000000-0000-0000-0000-0000000000a1', obra_id: OBRA, usuario_id: usuario.id, dispositivo_id: '00000000-0000-0000-0000-000000000000', criado_em_dispositivo: '2026-11-19T00:00:00.000Z', apagado: false, regras }
  await banco.registros.put({ tabela: 'fvs_regras', id: linha.id, obra_id: OBRA, linha: linha as never, pendente: 0 as const })
}

async function semear() {
  const agora = new Date().toISOString()
  const base = { obra_id: OBRA, usuario_id: usuario.id, dispositivo_id: '00000000-0000-0000-0000-000000000000', criado_em_dispositivo: agora, apagado: false }
  const ja = new Set((await banco.registros.where('[tabela+obra_id]').equals(['plantas', OBRA]).toArray()).map((r) => r.id))
  // com ?pacote=... a bancada mostra só o pacote de verdade pedido
  if (!ja.has(PLANTA_AMB) && !params.get('pacote')) await semearAmbientes(base)
  if (!ja.has(PLANTA_VED) && params.get('vedacao') && !params.get('pacote')) await semearVedacao(base)
  if (ja.has(PLANTA)) return
  if (!params.get('pacote')) await semearHistoricoDeTeste(base)

  let manifest: Manifest
  let bin: Blob
  let itens = params.get('partes') ? { ...FICHAS_TESTE, P: [...FICHAS_TESTE.P, ...ITENS_DAS_PARTES] } : FICHAS_TESTE
  // o item de furação entra antes da concretagem (depois do item 3, da execução)
  if (params.get('furos')) itens = { ...itens, V: [...itens.V.slice(0, 3), ITEM_DOS_FUROS, ...itens.V.slice(3)] }
  // ?furacaototal=1: o furo no pilar marca o item de furos da ficha do pilar (21/11)
  if (params.get('furacaototal')) itens = { ...itens, P: [...itens.P, { ...ITEM_DOS_FUROS, n: 8, titulo: 'Passagens no pilar' }] }
  const urlPacote = params.get('pacote')
  if (urlPacote) {
    const raiz = urlPacote.endsWith('/') ? urlPacote : urlPacote + '/'
    const [m, b] = await Promise.all([fetch(raiz + 'manifest.json').then((r) => r.text()), fetch(raiz + 'pacote.bin').then((r) => r.blob())])
    manifest = { ...JSON.parse(m), planta_id: PLANTA }
    bin = b
    const urlFichas = params.get('fichas')
    if (urlFichas) {
      const leg = await fetch(urlFichas).then((r) => r.json())
      itens = { P: itensDoLegado(leg.P.itens), V: itensDoLegado(leg.V.itens) }
    }
  } else {
    ;({ manifest, bin } = await pacoteDeTeste())
  }
  await guardarPacote(JSON.stringify(manifest), bin)

  const linhas: LinhaDeCadastro[] = [
    { tabela: 'pavimentos', linha: { ...base, id: PAV, nome: manifest.pavimento ?? 'Pavimento de teste', ordem: 3 } },
    ...cadastroDaPlanta(base, manifest, bin, SETOR, 'estrutura', 1),
    {
      tabela: 'fichas_modelo',
      linha: { ...base, id: uuid('f0000000', 1), codigo: 'TESTE-PVS-P', titulo: urlPacote ? 'Supraestrutura - Pilares' : 'Pilares (ficha de teste)', revisao: '0', aplica_a: ['P'], itens: itens.P },
    },
    {
      tabela: 'fichas_modelo',
      linha: { ...base, id: uuid('f0000000', 2), codigo: 'TESTE-PVS-V', titulo: urlPacote ? 'Supraestrutura - Vigas' : 'Vigas (ficha de teste)', revisao: '0', aplica_a: ['V'], itens: itens.V },
    },
    {
      tabela: 'fichas_modelo',
      linha: { ...base, id: uuid('f0000000', 9), codigo: 'TESTE-PVS-LAJE', titulo: 'Laje (ficha de teste)', revisao: '0', aplica_a: ['L'], itens: FICHA_LAJE_TESTE },
    },
  ]
  await gravarCadastro(linhas)
  if (manifest.camadas_separadas) await semearArmadura(base, manifest, bin)
  if (manifest.furos_laje_separados) await semearFuracao(base, manifest, bin)
  if (manifest.furos_separados) await semearFuracaoTotal(base, manifest, bin)
  if (params.get('instalacoes')) await semearInstalacoes(base, manifest, bin)
}

/** Planta de teste de cada disciplina de instalações: id da planta e do setor. */
const PLANTA_DE_INSTALACOES = (i: number) => uuid('a2000000', 0xd0 + i)

/**
 * ?instalacoes=1: uma planta de pontos por disciplina de instalações (hidro, esgoto, elétrico, preventivo, SPDA;
 * 21/11/2026), como o pipeline/fvs/instalacoes.py publica: setor com a disciplina, pacote com "disciplina" e
 * "pontos" e o fundo da forma. Cada disciplina tem 4 pontos numa linha (y = 200 + 150 * i, x = 300, 600, 900,
 * 1200); o elétrico e o preventivo têm também uma linha (eletroduto, tubulação). A ficha de ambiente de teste
 * "Instalações" tem um item por disciplina, marcado com "pontos", menos o preventivo (planta de consulta).
 */
async function semearInstalacoes(base: Record<string, unknown>, forma: Manifest, bin: Blob) {
  const TIPOS: Record<DisciplinaDePontos, TipoDePonto[]> = {
    hidro: ['ponto_agua', 'registro', 'ponto_agua', 'hidrometro'],
    sanitario: ['ralo', 'caixa_sifonada', 'ralo', 'ponto_esgoto'],
    eletrico: ['caixa_passagem', 'ponto_luz', 'ponto_luz', 'quadro'],
    preventivo: ['hidrante', 'extintor', 'sprinkler', 'detector'],
    spda: ['captor', 'descida', 'caixa_inspecao', 'haste'],
  }
  const linhas: LinhaDeCadastro[] = []
  for (const [i, d] of DISCIPLINAS_DE_PONTOS.entries()) {
    const y = 200 + 150 * i
    const pontos: Record<string, PontoPacote> = {}
    TIPOS[d].forEach((tipo, k) => {
      pontos[`pt-${d}-${k + 1}`] = { disciplina: d, tipo, ponto: [300 + 300 * k, y], nome: `${tipo.toUpperCase()} ${k + 1}`, modelo_id: `${d}-${k + 1}` }
    })
    if (d === 'eletrico' || d === 'preventivo') {
      const tipo: TipoDePonto = d === 'eletrico' ? 'eletroduto' : 'tubo_incendio'
      pontos[`pt-${d}-linha`] = { disciplina: d, tipo, ponto: [750, y + 60], linha: [[450, y + 60], [1050, y + 60]], nome: d === 'eletrico' ? 'Eletroduto 25 mm' : 'Tubo de incêndio 65 mm' }
    }
    const manifest: Manifest = { ...forma, planta_id: PLANTA_DE_INSTALACOES(i), trecho: NOME_DOS_PONTOS[d], elementos: {}, detalhes: {}, barras: undefined, disciplina: d, pontos, camadas_separadas: undefined, furos_laje_separados: undefined }
    await guardarPacote(JSON.stringify(manifest), bin)
    const cad = cadastroDaPlanta(base, manifest, bin, uuid('a1000000', 0xd0 + i), d, 80 + 2 * i)
    for (const l of cad) if (l.tabela === 'plantas') l.linha.elementos = Object.keys(pontos).length
    linhas.push(...cad)
  }
  // o preventivo fica sem item: planta de consulta (decisão do Nicolas, 21/11/2026: "não vai para ficha")
  const itens: ItemFicha[] = DISCIPLINAS_DE_PONTOS.filter((d) => d !== 'preventivo').map((d, k) => ({ n: k + 1, etapa: 'INSTALAÇÕES', titulo: `Pontos: ${NOME_DOS_PONTOS[d].toLowerCase()}`, dispositivo: 'Visual', tolerancia: 'Conforme projeto', pontos: d }))
  linhas.push({ tabela: 'fichas_modelo', linha: { ...base, id: uuid('f0000000', 20), codigo: 'TESTE-PVS-INST', titulo: 'Instalações (ficha de teste)', revisao: '0', aplica_a: ['A'], itens } })
  await gravarCadastro(linhas)
}

/**
 * ?furoslaje=1&furacao=1: uma planta de furos de laje por camada (esgoto, água, elétrica; setor "Furos de ...",
 * disciplina "furacao"), com todos os furos de laje e o fundo da forma, como o pipeline/fvs/furos.py faz.
 */
async function semearFuracao(base: Record<string, unknown>, forma: Manifest, bin: Blob) {
  const deLaje = Object.fromEntries(Object.entries(forma.elementos).filter(([, e]) => ehFuroDeLaje(e)))
  const linhas: LinhaDeCadastro[] = []
  const camadas = [['esgoto', 'Furos de esgoto'], ['agua', 'Furos de água'], ['eletrica', 'Furos de elétrica']] as const
  for (const [i, [camada, trecho]] of camadas.entries()) {
    const manifest: Manifest = { ...forma, planta_id: uuid('a2000000', 0xc0 + i), trecho, elementos: deLaje, detalhes: {}, furos_laje: camada, furos_laje_separados: undefined }
    await guardarPacote(JSON.stringify(manifest), bin)
    const cad = cadastroDaPlanta(base, manifest, bin, uuid('a1000000', 0xc0 + i), 'furacao', 60 + 2 * i)
    for (const l of cad) if (l.tabela === 'plantas') l.linha.elementos = Object.values(deLaje).filter((e) => camadaDoFuro(e) === camada).length
    linhas.push(...cad)
  }
  await gravarCadastro(linhas)
}

/**
 * ?furacaototal=1: uma planta de furação só (setor "Furação", disciplina "furacao") com todos os furos da forma,
 * cada um com a peça dele (viga, pilar ou laje), os mesmos ids e o fundo da forma, como o pipeline do 20 faz.
 */
async function semearFuracaoTotal(base: Record<string, unknown>, forma: Manifest, bin: Blob) {
  const furos = Object.fromEntries(Object.entries(pecaDosFurosDeLaje(forma).elementos).filter(([, e]) => e.tipo === 'F'))
  const manifest: Manifest = { ...forma, planta_id: uuid('a2000000', 0xe0), trecho: 'Furação', disciplina: 'furacao', elementos: furos, detalhes: {}, furos_separados: undefined, furos_laje_separados: undefined }
  await guardarPacote(JSON.stringify(manifest), bin)
  await gravarCadastro(cadastroDaPlanta(base, manifest, bin, uuid('a1000000', 0xe0), 'furacao', 70))
}

/**
 * ?barras=1&armadura=1: uma planta de armadura por direção que as barras de teste têm (setor "Armadura ...",
 * disciplina "armadura"), com todas as barras e o fundo da própria forma (na obra, o fundo é a prancha de armação).
 */
async function semearArmadura(base: Record<string, unknown>, forma: Manifest, bin: Blob) {
  const linhas: LinhaDeCadastro[] = []
  for (const [i, camada] of camadasDoPacote(forma.barras).entries()) {
    const manifest: Manifest = { ...forma, planta_id: uuid('a2000000', 0xa0 + i), trecho: `Armadura ${NOME_DA_CAMADA[camada].toLowerCase()}`, elementos: {}, detalhes: {}, camada, camadas_separadas: undefined }
    await guardarPacote(JSON.stringify(manifest), bin)
    const cad = cadastroDaPlanta(base, manifest, bin, uuid('a1000000', 0xa0 + i), 'armadura', 20 + 2 * i)
    for (const l of cad) if (l.tabela === 'plantas') l.linha.elementos = Object.values(forma.barras ?? {}).filter((b) => b.camada === camada).length
    linhas.push(...cad)
  }
  await gravarCadastro(linhas)
}

interface IndicePasta {
  obra: string
  pavimentos: Array<{
    nome: string
    pecas: Array<{ id: string; tipo: string; nome: string; secao: string }>
    plantas: Array<{
      id: string
      trecho: string
      pasta: string
      prancha: string
      revisao: string
      largura: number
      altura: number
      elementos: number
      disciplina?: string
      manifest: { sha256: string; tamanho: number }
      pacote: { sha256: string; tamanho: number }
    }>
  }>
}

/**
 * Obra inteira a partir dos pacotes servidos pelo PC (py pipeline/fvs/bancada.py PASTA).
 * Cadastra pavimentos, trechos, peças, fichas e plantas como se tivessem vindo do servidor; cada
 * planta é baixada pelo botão "Baixar" do módulo, do servidor local. As marcações ficam.
 */
async function semearDaPasta(pasta: string) {
  const raiz = pasta.endsWith('/') ? pasta : pasta + '/'
  const [indice, fichas] = (await Promise.all([fetch(raiz + 'indice.json').then((r) => r.json()), fetch(raiz + 'fichas.json').then((r) => r.json())])) as [
    IndicePasta,
    Array<{ codigo: string; titulo: string; revisao?: string; tipo_modelo?: string; aplica_a: string[]; itens: ItemFicha[] }>,
  ]
  const agora = new Date().toISOString()
  const base = { obra_id: OBRA_PASTA, usuario_id: usuario.id, dispositivo_id: '00000000-0000-0000-0000-000000000000', criado_em_dispositivo: agora, apagado: false }
  const linhas: Array<{ tabela: string; linha: Record<string, unknown> & { id: string } }> = []
  const pastaDaPlanta = new Map<string, string>()
  const chave = (t: string) => t.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toLowerCase()
  indice.pavimentos.forEach((pv, i) => {
    const pavId = `pav-${chave(pv.nome)}`
    linhas.push({ tabela: 'pavimentos', linha: { ...base, id: pavId, nome: pv.nome, ordem: i + 1 } })
    for (const pc of pv.pecas) linhas.push({ tabela: 'elementos', linha: { ...base, id: pc.id, pavimento_id: pavId, tipo: pc.tipo, nome: pc.nome, secao: pc.secao || null } })
    for (const pl of pv.plantas) {
      const setorId = `setor-${chave(pv.nome)}-${chave(pl.trecho)}`
      pastaDaPlanta.set(pl.id, raiz + pl.pasta)
      linhas.push({ tabela: 'setores', linha: { ...base, id: setorId, pavimento_id: pavId, nome_projeto: pl.trecho, disciplina: pl.disciplina ?? 'estrutura' } })
      for (const [nome, arq, tipo] of [['manifest.json', pl.manifest, 'application/json'], ['pacote.bin', pl.pacote, 'application/octet-stream']] as const) {
        linhas.push({
          tabela: 'arquivos',
          linha: { ...base, id: `${pl.id}-${nome}`, caminho: `${OBRA_PASTA}/fvs/plantas/${pl.id}/${nome}`, hash: arq.sha256, tamanho: arq.tamanho, tipo },
        })
      }
      linhas.push({
        tabela: 'plantas',
        linha: {
          ...base,
          id: pl.id,
          pavimento_id: pavId,
          setor_id: setorId,
          prancha: pl.prancha,
          revisao: pl.revisao,
          largura: pl.largura,
          altura: pl.altura,
          manifest_id: `${pl.id}-manifest.json`,
          pacote_id: `${pl.id}-pacote.bin`,
          elementos: pl.elementos,
        },
      })
    }
  })
  fichas.forEach((f) => {
    linhas.push({
      tabela: 'fichas_modelo',
      linha: { ...base, id: `ficha-${chave(f.codigo)}-${f.revisao ?? '0'}`, codigo: f.codigo, titulo: f.titulo, revisao: f.revisao ?? '0', tipo_modelo: f.tipo_modelo ?? null, aplica_a: f.aplica_a, itens: f.itens },
    })
  })
  await semearHistorico(raiz, base, linhas, fichas, indice)
  // o cadastro é refeito a cada abertura (pacote gerado de novo muda a lista); as marcações ficam
  const cadastro = ['pavimentos', 'setores', 'elementos', 'arquivos', 'plantas', 'fichas_modelo', 'fvs_fichas_campo']
  await banco.transaction('rw', banco.registros, async () => {
    for (const t of cadastro) await banco.registros.where('[tabela+obra_id]').equals([t, OBRA_PASTA]).delete()
    await banco.registros.bulkPut(linhas.map((l) => ({ tabela: l.tabela, id: l.linha.id, obra_id: OBRA_PASTA, linha: l.linha as never, pendente: 0 as const })))
  })
  usarFonteDeArquivos(async (caminho, aoBytes) => {
    const [, , , plantaId, nome] = caminho.split('/')
    const r = await fetch((pastaDaPlanta.get(plantaId) ?? raiz) + nome)
    if (!r.ok) throw new Error('O servidor da bancada não respondeu. Rode py pipeline/fvs/bancada.py de novo.')
    return lerComProgresso(r, aoBytes)
  })
}

/**
 * Histórico do sistema oficial (py pipeline/fvs/bancada.py ... --historico ARQ). Entra como se tivesse
 * vindo do servidor, cada registro com a data e a hora originais. Os ids não mudam de uma importação
 * para outra, então abrir de novo não duplica nada.
 */
async function semearHistorico(
  raiz: string,
  base: Record<string, unknown>,
  linhas: Array<{ tabela: string; linha: Record<string, unknown> & { id: string } }>,
  fichas: Array<{ codigo: string; revisao?: string }>,
  indice: IndicePasta,
) {
  const r = await fetch(raiz + 'historico.json')
  const h = (r.ok ? await r.json() : null) as null | {
    fichas_campo: Array<Record<string, unknown> & { id: string; ficha_codigo: string | null; elemento_id: string | null; atualizada_em: string | null }>
    eventos: Array<Record<string, unknown> & { id: string; ficha_codigo: string; criado_em: string }>
  }
  if (!h) return
  const chave = (t: string) => t.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toLowerCase()
  const idDaFicha = new Map(fichas.map((f) => [f.codigo, `ficha-${chave(f.codigo)}-${f.revisao ?? '0'}`]))
  const pecas = new Set(indice.pavimentos.flatMap((p) => p.pecas.map((x) => x.id)))
  for (const f of h.fichas_campo) {
    // só fica ligada a uma peça que está na planta e a uma ficha que está no cadastro
    const noApp = f.elemento_id && pecas.has(f.elemento_id) && f.ficha_codigo && idDaFicha.has(f.ficha_codigo)
    linhas.push({
      tabela: 'fvs_fichas_campo',
      linha: { ...base, ...f, elemento_id: noApp ? f.elemento_id : null, ficha_id: noApp ? idDaFicha.get(f.ficha_codigo!) : null },
    })
  }
  const novos = h.eventos.map((e) => ({
    tabela: 'fvs_eventos',
    id: e.id,
    obra_id: OBRA_PASTA,
    linha: { ...base, ...e, ficha_id: idDaFicha.get(e.ficha_codigo), criado_em_dispositivo: e.criado_em, usuario_id: USUARIO_HISTORICO } as never,
    pendente: 0 as const,
  }))
  await banco.registros.bulkPut(novos)
}

/**
 * ?revisao=1: como se a R01 do Trecho 1 tivesse acabado de ser publicada. O cadastro já está no
 * aparelho e o pacote ainda não; o download vem daqui mesmo, sem servidor.
 */
async function semearRevisaoNova() {
  const { manifest, bin } = await pacoteDeTeste()
  const texto = JSON.stringify({ ...manifest, planta_id: PLANTA_R01, revisao: 'R01', prancha: 'TESTE.ES.LO.001.FOR-R01' })
  const sha256 = async (b: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('')
  const bytesManifest = new TextEncoder().encode(texto)
  const base = { obra_id: OBRA, usuario_id: usuario.id, dispositivo_id: '00000000-0000-0000-0000-000000000000', criado_em_dispositivo: new Date().toISOString(), apagado: false }
  const arquivo = (n: number, nome: string, hash: string, tamanho: number, tipo: string): LinhaDeCadastro => ({
    tabela: 'arquivos',
    linha: { ...base, id: uuid('f1000000', n), caminho: `${OBRA}/fvs/plantas/${PLANTA_R01}/${nome}`, hash, tamanho, tipo },
  })
  await gravarCadastro([
    arquivo(7, 'manifest.json', await sha256(bytesManifest.buffer as ArrayBuffer), bytesManifest.length, 'application/json'),
    arquivo(8, 'pacote.bin', await sha256(await bin.arrayBuffer()), bin.size, 'application/octet-stream'),
    {
      tabela: 'plantas',
      linha: {
        ...base,
        id: PLANTA_R01,
        pavimento_id: PAV,
        setor_id: SETOR,
        prancha: 'TESTE.ES.LO.001.FOR-R01',
        revisao: 'R01',
        largura: manifest.largura,
        altura: manifest.altura,
        manifest_id: uuid('f1000000', 7),
        pacote_id: uuid('f1000000', 8),
        elementos: Object.keys(manifest.elementos).length,
        substitui_id: PLANTA,
      },
    },
  ])
  usarFonteDeArquivos((caminho, aoBytes) => lerComProgresso(new Response(caminho.endsWith('manifest.json') ? texto : bin), aoBytes))
}

const pasta = params.get('pasta')
if (pasta) {
  semearDaPasta(pasta)
    .then(() => {
      history.replaceState({ tela: 'fvs' }, '')
      render(<ModuloFvs usuario={usuario} obra={obra} aoSair={() => location.reload()} aoPerderObra={() => {}} />, document.getElementById('app')!)
    })
    .catch((e) => {
      document.getElementById('app')!.textContent = `Bancada: não consegui ler ${pasta} (${e}). Rode: py pipeline/fvs/bancada.py PASTA`
    })
} else
  semear().then(async () => {
  if (params.get('revisao')) await semearRevisaoNova()
  if (params.get('regras')) await semearRegras()
  if (params.get('rastreio')) await semearRastreio()
  const abrir = params.get('abrir')
  const plantaId = abrir === 'ambientes' ? PLANTA_AMB : PLANTA
  // ?servico=CÓDIGO&aba=esquadrias: a planta de ambientes como o menu do pavimento abre (opcoes_ambientes.ts)
  const servico = params.get('servico') ?? undefined
  const aba = params.get('aba') === 'esquadrias' ? 'esquadrias' : params.get('aba') === 'ambientes' ? 'ambientes' : undefined
  history.replaceState(abrir === '0' ? { tela: 'fvs' } : { tela: 'fvs', fvs: { nome: 'planta', plantaId, servico, aba } }, '')
  render(<ModuloFvs usuario={usuario} obra={obra} aoSair={() => location.reload()} aoPerderObra={() => {}} />, document.getElementById('app')!)
})

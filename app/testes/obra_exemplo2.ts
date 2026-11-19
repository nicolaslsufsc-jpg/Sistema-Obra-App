// Obra Exemplo 2: uma obra inventada, de uma "projetista B" também inventada, que desenha diferente
// da obra piloto. Serve para testar a Nova obra (docs/modulos/nova_obra.md) com um jeito de desenhar
// que o leitor atual (pipeline/legado/gerador_fvs.py) não conhece. Nada aqui é de obra ou empresa real.
//
// O que muda em relação à obra piloto (de propósito):
// - camadas `PILARES`, `VIGAS`, `TEXTO-PILARES`, `TEXTO-VIGAS`, `CARIMBO`, `FOLHA` (a piloto usa
//   PILAR_CONCRETO e VIG_FACES);
// - nomes com hífen e zero: `P-01`, `VT-03` (a piloto: P12, V 132);
// - seção ao lado do nome, sem parênteses: `P-01  20x50`, `VT-03  15x40`;
// - textos normais do PDF (a piloto: nomes SHX como comentários);
// - escala 1:75 (a piloto: 1:50);
// - o pavimento "Tipo 1" em duas pranchas com uma fila de pilares repetida, a segunda deslocada na folha.
// Variantes: o mesmo Térreo sem camadas e "escaneado" (só uma imagem, sem texto).
//
// Gera os PDFs na memória (sem biblioteca) e o gabarito: cada peça com nome, seção e retângulo, em
// pontos do PDF com y para baixo (as coordenadas do app). Para gravar no disco e abrir num leitor de
// PDF: OBRA2_SAIDA=<pasta> npx vitest run testes/obra_exemplo2.test.ts

/** 1 m na obra, em pontos do PDF, na escala 1:75 (1 pt = 1/72 pol.). */
export const PONTOS_POR_METRO = (1000 / 75 / 25.4) * 72
const LARGURA_FOLHA = 2384 // A1 deitada
const ALTURA_FOLHA = 1684

export interface PecaGabarito {
  tipo: 'P' | 'V'
  nome: string
  secao: string
  /** [x0, y0, x1, y1] em pontos, y para baixo */
  retangulo: [number, number, number, number]
}

export interface PranchaExemplo2 {
  arquivo: string
  pavimento: string
  trecho: string
  /** com camadas (o normal), sem camadas (tudo no mesmo nível) ou escaneada (só imagem) */
  variante: 'camadas' | 'sem_camadas' | 'escaneada'
  pecas: PecaGabarito[]
  pdf: Uint8Array
}

export const CAMADAS = ['FOLHA', 'CARIMBO', 'PILARES', 'VIGAS', 'TEXTO-PILARES', 'TEXTO-VIGAS'] as const
type Camada = (typeof CAMADAS)[number]

const fmt = (n: number) => (Math.round(n * 100) / 100).toString()

/** Texto do PDF em WinAnsi, com acento por código octal. */
function textoPdf(t: string): string {
  let s = ''
  for (const ch of t) {
    const c = ch.charCodeAt(0)
    if (ch === '(' || ch === ')' || ch === '\\') s += '\\' + ch
    else if (c < 128) s += ch
    else if (c < 256) s += '\\' + c.toString(8).padStart(3, '0')
    else s += '?'
  }
  return s
}

interface Desenho {
  camada: Camada
  /** operadores do PDF em coordenadas com y para cima */
  ops: string
}

/** Uma prancha de forma: a grade de pilares e vigas, deslocada de (dx, dy) metros na folha. */
function desenharForma(opts: {
  titulo: string
  colunas: number[] // índices de coluna da grade que esta prancha mostra
  linhas: number
  dx: number
  dy: number
  numeroDoPilar: (col: number, lin: number) => number
  numeroDaViga: (col: number, lin: number) => number
}): { desenhos: Desenho[]; pecas: PecaGabarito[]; retangulos: Array<[number, number, number, number]> } {
  const m = PONTOS_POR_METRO
  const vao = 5 // metros entre pilares
  const ox = 200 + opts.dx * m
  const oy = 250 + opts.dy * m
  const desenhos: Desenho[] = []
  const pecas: PecaGabarito[] = []
  const retangulos: Array<[number, number, number, number]> = []
  const yPdf = (yBaixo: number) => ALTURA_FOLHA - yBaixo // y para baixo -> y para cima

  // folha e carimbo
  desenhos.push({ camada: 'FOLHA', ops: `1 w 20 20 ${LARGURA_FOLHA - 40} ${ALTURA_FOLHA - 40} re S` })
  const cx = LARGURA_FOLHA - 520
  const carimbo = [
    'OBRA EXEMPLO 2',
    'CONSTRUTORA EXEMPLO',
    'PROJETISTA B (FICTÍCIA)',
    opts.titulo,
    'ESCALA 1:75',
    'REV. 00',
  ]
  desenhos.push({
    camada: 'CARIMBO',
    ops:
      `1 w ${cx} 40 480 200 re S ` +
      carimbo.map((t, i) => `BT /F1 ${i === 0 ? 18 : 12} Tf ${cx + 16} ${210 - i * 28} Td (${textoPdf(t)}) Tj ET`).join(' '),
  })

  const larguraP = 0.2 * m
  const alturaP = 0.5 * m
  const larguraV = 0.15 * m
  let pilares = ''
  let textosP = ''
  let vigas = ''
  let textosV = ''
  const cols = opts.colunas
  for (let lin = 0; lin < opts.linhas; lin++) {
    for (const col of cols) {
      const x = ox + (col - cols[0]) * vao * m
      const y = oy + lin * vao * m // y para baixo
      const nome = `P-${String(opts.numeroDoPilar(col, lin)).padStart(2, '0')}`
      const r: [number, number, number, number] = [x - larguraP / 2, y - alturaP / 2, x + larguraP / 2, y + alturaP / 2]
      pecas.push({ tipo: 'P', nome, secao: '20x50', retangulo: r })
      retangulos.push(r)
      pilares += `${fmt(r[0])} ${fmt(yPdf(r[3]))} ${fmt(larguraP)} ${fmt(alturaP)} re `
      textosP += `BT /F1 9 Tf ${fmt(r[2] + 4)} ${fmt(yPdf(y) - 3)} Td (${nome}  20x50) Tj ET `
    }
    // vigas horizontais entre pilares vizinhos desta prancha
    for (let k = 0; k + 1 < cols.length; k++) {
      const x0 = ox + k * vao * m + larguraP / 2
      const x1 = ox + (k + 1) * vao * m - larguraP / 2
      const y = oy + lin * vao * m
      const nome = `VT-${String(opts.numeroDaViga(cols[k], lin)).padStart(2, '0')}`
      const r: [number, number, number, number] = [x0, y - larguraV / 2, x1, y + larguraV / 2]
      pecas.push({ tipo: 'V', nome, secao: '15x40', retangulo: r })
      retangulos.push(r)
      // duas faces, como a projetista desenha
      vigas += `${fmt(x0)} ${fmt(yPdf(r[1]))} m ${fmt(x1)} ${fmt(yPdf(r[1]))} l S ${fmt(x0)} ${fmt(yPdf(r[3]))} m ${fmt(x1)} ${fmt(yPdf(r[3]))} l S `
      textosV += `BT /F1 9 Tf ${fmt((x0 + x1) / 2 - 30)} ${fmt(yPdf(r[1]) + 6)} Td (${nome}  15x40) Tj ET `
    }
  }
  desenhos.push({ camada: 'PILARES', ops: `0.8 w ${pilares}S` })
  desenhos.push({ camada: 'VIGAS', ops: `0.5 w ${vigas}` })
  desenhos.push({ camada: 'TEXTO-PILARES', ops: textosP })
  desenhos.push({ camada: 'TEXTO-VIGAS', ops: textosV })
  return { desenhos, pecas, retangulos }
}

/** Monta o arquivo PDF a partir dos objetos (o 1 é o catálogo). */
function montarPdf(objetos: Array<string | Uint8Array>): Uint8Array {
  const enc = new TextEncoder()
  const partes: Uint8Array[] = [enc.encode('%PDF-1.6\n%\xe2\xe3\xcf\xd3\n')]
  let pos = partes[0].length
  const offsets: number[] = []
  objetos.forEach((o, i) => {
    offsets.push(pos)
    const cab = enc.encode(`${i + 1} 0 obj\n`)
    const corpo = typeof o === 'string' ? enc.encode(o) : o
    const fim = enc.encode('\nendobj\n')
    partes.push(cab, corpo, fim)
    pos += cab.length + corpo.length + fim.length
  })
  const xref =
    `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`
  partes.push(enc.encode(xref))
  const total = partes.reduce((s, p) => s + p.length, 0)
  const saida = new Uint8Array(total)
  let i = 0
  for (const p of partes) {
    saida.set(p, i)
    i += p.length
  }
  return saida
}

function stream(dicionario: string, dados: string | Uint8Array): Uint8Array {
  const enc = new TextEncoder()
  const corpo = typeof dados === 'string' ? enc.encode(dados) : dados
  const cab = enc.encode(`<< ${dicionario} /Length ${corpo.length} >>\nstream\n`)
  const fim = enc.encode('\nendstream')
  const s = new Uint8Array(cab.length + corpo.length + fim.length)
  s.set(cab, 0)
  s.set(corpo, cab.length)
  s.set(fim, cab.length + corpo.length)
  return s
}

/** PDF vetorial de uma página; com camadas, cada desenho fica dentro da sua (Optional Content). */
function pdfVetorial(desenhos: Desenho[], comCamadas: boolean): Uint8Array {
  // objetos: 1 catálogo, 2 páginas, 3 página, 4 conteúdo, 5 fonte, 6.. camadas
  const ocg = CAMADAS.map((_, i) => 6 + i)
  const conteudo = desenhos
    .map((d) => (comCamadas ? `/OC /${d.camada.replace(/-/g, '_')} BDC ${d.ops} EMC` : d.ops))
    .join('\n')
  const propriedades = comCamadas ? `/Properties << ${CAMADAS.map((c, i) => `/${c.replace(/-/g, '_')} ${ocg[i]} 0 R`).join(' ')} >>` : ''
  const ocp = comCamadas ? `/OCProperties << /OCGs [${ocg.map((o) => `${o} 0 R`).join(' ')}] /D << /Order [${ocg.map((o) => `${o} 0 R`).join(' ')}] /ON [${ocg.map((o) => `${o} 0 R`).join(' ')}] >> >>` : ''
  return montarPdf([
    `<< /Type /Catalog /Pages 2 0 R ${ocp} >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGURA_FOLHA} ${ALTURA_FOLHA}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> ${propriedades} >> >>`,
    stream('', conteudo),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    ...(comCamadas ? CAMADAS.map((c) => `<< /Type /OCG /Name (${c}) >>`) : []),
  ])
}

/** "Escaneada": só uma imagem em tons de cinza, sem texto nem traço. Os retângulos das peças viram manchas pretas. */
function pdfEscaneado(retangulos: Array<[number, number, number, number]>): Uint8Array {
  const escala = 0.25 // pixels por ponto (uns 18 dpi: imagem pequena para o teste)
  const w = Math.round(LARGURA_FOLHA * escala)
  const h = Math.round(ALTURA_FOLHA * escala)
  const px = new Uint8Array(w * h).fill(255)
  for (const [x0, y0, x1, y1] of retangulos) {
    for (let y = Math.floor(y0 * escala); y <= Math.ceil(y1 * escala); y++)
      for (let x = Math.floor(x0 * escala); x <= Math.ceil(x1 * escala); x++) if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = 0
  }
  return montarPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGURA_FOLHA} ${ALTURA_FOLHA}] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>`,
    stream('', `q ${LARGURA_FOLHA} 0 0 ${ALTURA_FOLHA} 0 0 cm /Im1 Do Q`),
    stream(`/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceGray /BitsPerComponent 8`, px),
  ])
}

/** As pranchas da Obra Exemplo 2, com o gabarito de cada uma. */
export function gerarObraExemplo2(): PranchaExemplo2[] {
  const saida: PranchaExemplo2[] = []
  // Térreo: grade 4 x 3, uma prancha
  const terreo = desenharForma({
    titulo: 'FORMA DO TÉRREO',
    colunas: [0, 1, 2, 3],
    linhas: 3,
    dx: 0,
    dy: 0,
    numeroDoPilar: (c, l) => l * 4 + c + 1,
    numeroDaViga: (c, l) => l * 3 + c + 1,
  })
  saida.push({ arquivo: 'EX2-FORMA-TERREO-R00.pdf', pavimento: 'Térreo', trecho: 'Planta inteira', variante: 'camadas', pecas: terreo.pecas, pdf: pdfVetorial(terreo.desenhos, true) })
  saida.push({ arquivo: 'EX2-FORMA-TERREO-SEM-CAMADAS-R00.pdf', pavimento: 'Térreo', trecho: 'Planta inteira', variante: 'sem_camadas', pecas: terreo.pecas, pdf: pdfVetorial(terreo.desenhos, false) })
  saida.push({ arquivo: 'EX2-FORMA-TERREO-ESCANEADA-R00.pdf', pavimento: 'Térreo', trecho: 'Planta inteira', variante: 'escaneada', pecas: terreo.pecas, pdf: pdfEscaneado(terreo.retangulos) })

  // Tipo 1: grade 5 x 3 em duas pranchas; a coluna 2 aparece nas duas, e a segunda prancha está deslocada na folha
  const numP = (c: number, l: number) => 100 + l * 5 + c + 1
  const numV = (c: number, l: number) => 100 + l * 4 + c + 1
  const a = desenharForma({ titulo: 'FORMA DO TIPO 1 - TRECHO A', colunas: [0, 1, 2], linhas: 3, dx: 0, dy: 0, numeroDoPilar: numP, numeroDaViga: numV })
  const b = desenharForma({ titulo: 'FORMA DO TIPO 1 - TRECHO B', colunas: [2, 3, 4], linhas: 3, dx: 3, dy: 1.5, numeroDoPilar: numP, numeroDaViga: numV })
  saida.push({ arquivo: 'EX2-FORMA-TIPO1-A-R00.pdf', pavimento: 'Tipo 1', trecho: 'Trecho A', variante: 'camadas', pecas: a.pecas, pdf: pdfVetorial(a.desenhos, true) })
  saida.push({ arquivo: 'EX2-FORMA-TIPO1-B-R00.pdf', pavimento: 'Tipo 1', trecho: 'Trecho B', variante: 'camadas', pecas: b.pecas, pdf: pdfVetorial(b.desenhos, true) })
  return saida
}

/** As peças distintas de cada pavimento (a fila repetida entre os trechos conta uma vez). */
export function pecasPorPavimento(pranchas: readonly PranchaExemplo2[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>()
  for (const p of pranchas) {
    if (p.variante !== 'camadas') continue
    const s = m.get(p.pavimento) ?? new Set<string>()
    for (const pc of p.pecas) s.add(`${pc.tipo}:${pc.nome}`)
    m.set(p.pavimento, s)
  }
  return m
}

/**
 * Fichas da Obra Exemplo 2 como viriam de uma planilha (copiar as colunas no Excel e colar): separadas
 * por tabulação, com cabeçalho. Texto genérico, de nenhuma empresa.
 */
export const FICHAS_PARA_COLAR = [
  'Etapa\tItem\tTítulo\tDescrição\tDispositivo\tTolerância',
  'Início\t1\tProjeto na mão\tConferir se a prancha usada é a revisão vigente.\tVisual\t-',
  'Fôrma\t2\tPrumo\tConferir o prumo da fôrma nas duas direções.\tPrumo\t5 mm',
  'Armação\t3\tCobrimento\tConferir os espaçadores da armadura.\tTrena\tconforme projeto',
  'Lançamento\t4\tAdensamento\tConferir o vibrador em toda a peça.\tVisual\t-',
  'Desforma\t5\tAcabamento\tConferir se não há ninhos de concretagem.\tVisual\t-',
].join('\n')

/**
 * Prancha A1 "pesada", só para medir tempo e memória ao desenhar os tiles: 1.500 pilares, 2.900 vigas
 * com duas faces, 4.400 textos e 24.000 traços de hachura e cota, perto do que tem uma forma de
 * verdade com muitos trechos. Com camadas, na escala 1:75.
 */
export function pranchaPesadaA1(): Uint8Array {
  const cols = 50
  const linhas = 30
  const passo = 42
  const ox = 120
  const oy = 120
  const y = (v: number) => ALTURA_FOLHA - v
  let pil = ''
  let vig = ''
  let txtP = ''
  let txtV = ''
  let hach = ''
  let n = 0
  for (let l = 0; l < linhas; l++) {
    for (let c = 0; c < cols; c++) {
      const x0 = ox + c * passo
      const y0 = oy + l * passo
      n++
      pil += `${x0} ${fmt(y(y0 + 8))} 4 8 re `
      txtP += `BT /F1 4 Tf ${x0 + 5} ${fmt(y(y0 + 4))} Td (P-${n}  20x50) Tj ET `
      if (c + 1 < cols) {
        vig += `${x0 + 4} ${fmt(y(y0 + 3))} m ${x0 + passo} ${fmt(y(y0 + 3))} l S ${x0 + 4} ${fmt(y(y0 + 5))} m ${x0 + passo} ${fmt(y(y0 + 5))} l S `
        txtV += `BT /F1 3 Tf ${x0 + 14} ${fmt(y(y0 + 1))} Td (VT-${n}) Tj ET `
      }
      if (l + 1 < linhas) {
        vig += `${x0 + 1} ${fmt(y(y0 + 8))} m ${x0 + 1} ${fmt(y(y0 + passo))} l S ${x0 + 3} ${fmt(y(y0 + 8))} m ${x0 + 3} ${fmt(y(y0 + passo))} l S `
        // hachura da laje: 16 traços inclinados por painel
        for (let k = 0; k < 16; k++) hach += `${x0 + 6 + k * 2} ${fmt(y(y0 + 10))} m ${x0 + 10 + k * 2} ${fmt(y(y0 + 38))} l `
      }
    }
  }
  const desenhos: Desenho[] = [
    { camada: 'FOLHA', ops: `1 w 20 20 ${LARGURA_FOLHA - 40} ${ALTURA_FOLHA - 40} re S` },
    { camada: 'PILARES', ops: `0.6 w ${pil}S` },
    { camada: 'VIGAS', ops: `0.3 w ${vig}` },
    { camada: 'VIGAS', ops: `0.1 w ${hach}S` },
    { camada: 'TEXTO-PILARES', ops: txtP },
    { camada: 'TEXTO-VIGAS', ops: txtV },
  ]
  return pdfVetorial(desenhos, true)
}

/**
 * Uma forma inventada "no jeito da projetista da obra piloto", para testar o perfil pronto do leitor
 * (src/nova_obra/leitor.ts, PERFIL_PILOTO) sem usar nada da obra de verdade: escala 1:50, camadas
 * PILAR_CONCRETO e VIG_FACES, nomes como comentários do PDF ("P1", "V 5"), seção "(20x50)" embaixo do
 * nome do pilar e "a: 15/40" ao lado da viga, viga que atravessa vários vãos com um nome só. Tem viga em pé (nome girado), viga larga (60 cm),
 * viga inclinada, um painel de laje "V40" com "h=12+5" (não é viga) e um "P9" solto numa tabela, sem
 * seção (não é pilar desenhado). O gabarito segue o leitor do PC: viga larga e inclinada sem seção.
 */
export function pranchaEstiloPiloto(): { pdf: Uint8Array; pecas: PecaGabarito[]; paineis: string[] } {
  const m = (1000 / 50 / 25.4) * 72
  const vao = 5 * m
  const ox = 200
  const oy = 300
  const H = ALTURA_FOLHA
  const lp = 0.2 * m
  const ap = 0.5 * m
  const lv = 0.15 * m
  const pecas: PecaGabarito[] = []
  const anotacoes: Array<{ texto: string; r: [number, number, number, number] }> = []
  let pil = ''
  let vig = ''
  const linha = (x0: number, y0: number, x1: number, y1: number) => `${fmt(x0)} ${fmt(H - y0)} m ${fmt(x1)} ${fmt(H - y1)} l S `
  // pilares 3 x 2
  let n = 0
  for (let l = 0; l < 2; l++) {
    for (let c = 0; c < 3; c++) {
      n++
      const x = ox + c * vao
      const y = oy + l * vao
      const r: [number, number, number, number] = [x - lp / 2, y - ap / 2, x + lp / 2, y + ap / 2]
      pil += `${fmt(r[0])} ${fmt(H - r[3])} ${fmt(lp)} ${fmt(ap)} re `
      pecas.push({ tipo: 'P', nome: `P${n}`, secao: '20x50', retangulo: r })
      anotacoes.push({ texto: `P${n}`, r: [x + 10, y - 20, x + 22, y - 12] })
      anotacoes.push({ texto: '(20x50)', r: [x + 4, y - 11, x + 30, y - 3] })
    }
  }
  // vigas deitadas: V1 e V2, cada uma atravessa os dois vãos da fila (como a projetista da piloto
  // desenha: um nome só, as faces interrompidas no pilar do meio)
  n = 0
  for (let l = 0; l < 2; l++) {
    n++
    const y = oy + l * vao
    const ini = ox + lp / 2
    const fim = ox + 2 * vao - lp / 2
    for (let c = 0; c < 2; c++) {
      const x0 = ox + c * vao + lp / 2
      const x1 = ox + (c + 1) * vao - lp / 2
      vig += linha(x0, y - lv / 2, x1, y - lv / 2) + linha(x0, y + lv / 2, x1, y + lv / 2)
    }
    const mid = ox + vao / 2
    pecas.push({ tipo: 'V', nome: `V${n}`, secao: '15/40', retangulo: [ini, y - lv / 2, fim, y + lv / 2] })
    anotacoes.push({ texto: `V ${n}`, r: [mid - 10, y - lv / 2 - 9, mid + 10, y - lv / 2 - 1] })
    anotacoes.push({ texto: 'a: 15/40', r: [mid - 16, y + lv / 2 + 1, mid + 16, y + lv / 2 + 8] })
  }
  // vigas em pé: V3..V5 (nome girado: retângulo mais alto que largo)
  for (let c = 0; c < 3; c++) {
    n++
    const x = ox + c * vao
    const y0 = oy + ap / 2
    const y1 = oy + vao - ap / 2
    const mid = (y0 + y1) / 2
    vig += linha(x - lv / 2, y0, x - lv / 2, y1) + linha(x + lv / 2, y0, x + lv / 2, y1)
    pecas.push({ tipo: 'V', nome: `V${n}`, secao: '15/40', retangulo: [x - lv / 2, y0, x + lv / 2, y1] })
    anotacoes.push({ texto: `V ${n}`, r: [x - lv / 2 - 9, mid - 10, x - lv / 2 - 1, mid + 10] })
    anotacoes.push({ texto: 'a: 15/40', r: [x + lv / 2 + 1, mid - 16, x + lv / 2 + 8, mid + 16] })
  }
  // viga larga (60 cm): o leitor do PC só acha na segunda tentativa, e sem seção
  {
    const y = oy + vao + 140
    const w = 0.6 * m
    const x0 = ox
    const x1 = ox + 2 * vao
    vig += linha(x0, y - w / 2, x1, y - w / 2) + linha(x0, y + w / 2, x1, y + w / 2)
    pecas.push({ tipo: 'V', nome: 'V20', secao: '', retangulo: [x0, y - w / 2, x1, y + w / 2] })
    anotacoes.push({ texto: 'V 20', r: [(x0 + x1) / 2 - 10, y - w / 2 - 9, (x0 + x1) / 2 + 10, y - w / 2 - 1] })
  }
  // viga inclinada (rampa), de (ax, ay) a (bx, by)
  {
    const ax = ox + 2 * vao + 80
    const ay = oy
    const bx = ax + 160
    const by = ay + 160
    const comp = Math.hypot(bx - ax, by - ay)
    const nx = -(by - ay) / comp
    const ny = (bx - ax) / comp
    const h = lv / 2
    vig += linha(ax + nx * h, ay + ny * h, bx + nx * h, by + ny * h) + linha(ax - nx * h, ay - ny * h, bx - nx * h, by - ny * h)
    const xs = [ax + nx * h, bx + nx * h, ax - nx * h, bx - nx * h]
    const ys = [ay + ny * h, by + ny * h, ay - ny * h, by - ny * h]
    pecas.push({ tipo: 'V', nome: 'V21', secao: '', retangulo: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] })
    const cx = (ax + bx) / 2 - nx * (h + 8)
    const cy = (ay + by) / 2 - ny * (h + 8)
    anotacoes.push({ texto: 'V 21', r: [cx - 8, cy - 8, cx + 8, cy + 8] })
  }
  // painel de laje "V40" com a altura encostada embaixo, no meio do primeiro vão
  anotacoes.push({ texto: 'V40', r: [ox + 120, oy + 120, ox + 140, oy + 128] })
  anotacoes.push({ texto: 'h=12+5', r: [ox + 118, oy + 129, ox + 145, oy + 136] })
  // tabela de pilares no canto: nome sem seção embaixo
  anotacoes.push({ texto: 'P9', r: [1700, 900, 1712, 908] })

  const conteudo = [
    `/OC /PILAR_CONCRETO BDC 0.8 w ${pil}S EMC`,
    `/OC /VIG_FACES BDC 0.5 w ${vig} EMC`,
    `1 w 20 20 ${LARGURA_FOLHA - 40} ${H - 40} re S`,
  ].join('\n')
  const nAnot = anotacoes.length
  const primeiraAnot = 7
  return {
    pecas,
    paineis: ['V40'],
    pdf: montarPdf([
      '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [5 0 R 6 0 R] /D << /Order [5 0 R 6 0 R] /ON [5 0 R 6 0 R] >> >> >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGURA_FOLHA} ${H}] /Contents 4 0 R /Resources << /Properties << /PILAR_CONCRETO 5 0 R /VIG_FACES 6 0 R >> >> /Annots [${Array.from({ length: nAnot }, (_, i) => `${primeiraAnot + i} 0 R`).join(' ')}] >>`,
      stream('', conteudo),
      '<< /Type /OCG /Name (PILAR_CONCRETO) >>',
      '<< /Type /OCG /Name (VIG_FACES) >>',
      ...anotacoes.map((a) => `<< /Type /Annot /Subtype /FreeText /Rect [${fmt(a.r[0])} ${fmt(H - a.r[3])} ${fmt(a.r[2])} ${fmt(H - a.r[1])}] /Contents (${textoPdf(a.texto)}) /DA (/Helv 6 Tf 0 g) >>`),
    ]),
  }
}

/** Para os limites (limites.ts): PDF com uma imagem de 10.000 x 10.000 pixels (o dado é curto: o pdf.js recusa pelo tamanho declarado). */
export function pdfComImagemGigante(): Uint8Array {
  return montarPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>',
    stream('', 'q 595 0 0 842 0 0 cm /Im1 Do Q'),
    stream('/Type /XObject /Subtype /Image /Width 10000 /Height 10000 /ColorSpace /DeviceGray /BitsPerComponent 8', new Uint8Array(16).fill(255)),
  ])
}

/** Para os limites: página de 14.000 x 14.000 pontos (4,9 m de lado), com um texto só. */
export function pdfPaginaGigante(): Uint8Array {
  return montarPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 14000 14000] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    stream('', 'BT /F1 40 Tf 100 100 Td (P1) Tj ET'),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ])
}

/** Para os limites: PDF com n páginas A4 em branco (o app aceita até 20). */
export function pdfMuitasPaginas(n: number): Uint8Array {
  const paginas = Array.from({ length: n }, (_, i) => 3 + i)
  return montarPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${paginas.map((o) => `${o} 0 R`).join(' ')}] /Count ${n} >>`,
    ...paginas.map(() => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>'),
  ])
}

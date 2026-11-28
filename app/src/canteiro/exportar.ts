// Desenho do mapa em SVG (texto), a imagem PNG e o PDF A4 deitado, para imprimir ou colar em relatório.
// O mesmo `svgDosItens` desenha as figuras na tela e na imagem: o que sai é o que se vê.

import { figuraPorId } from './figuras'
import { pedacosDoFundo, svgDaGrade, svgDasPecas, type PlantaDeFundo } from './fundo'
import {
  alturaDoItem,
  hexDaCor,
  legendaDe,
  letraDoItem,
  MEIA_LINHA,
  meiaAlturaGirada,
  ordemDeDesenho,
  type Folha,
  type ItemCanteiro,
  type LinhaDaLegenda,
  type Ponto,
} from './logica'

const FONTE = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'

/** Texto seguro dentro do SVG (o nome é digitado pela pessoa). */
export function escaparXml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const n = (v: number) => Math.round(v * 100) / 100

/** Nome com contorno branco (lê-se em cima da planta e das outras figuras). */
function rotulo(x: number, y: number, letra: number, nome: string, cor = '#111111'): string {
  return `<text x="${n(x)}" y="${n(y)}" text-anchor="middle" font-family="${FONTE}" font-size="${n(letra)}" font-weight="600" fill="${cor}" stroke="#ffffff" stroke-width="${n(letra * 0.28)}" stroke-linejoin="round" paint-order="stroke">${escaparXml(nome)}</text>`
}

/** Ponta de seta no fim do caminho, apontando no sentido do último trecho. */
function pontaDeSeta(pontos: readonly Ponto[], tamanho: number): string {
  const b = pontos[pontos.length - 1]
  // o último trecho com comprimento (dois toques no mesmo lugar não tiram a direção da seta)
  let a = pontos[pontos.length - 2]
  for (let k = pontos.length - 2; k >= 0; k--) {
    a = pontos[k]
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.5) break
  }
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
  const p = (d: number, lado: number) => `${n(b[0] - d * Math.cos(ang) + lado * Math.sin(ang))} ${n(b[1] - d * Math.sin(ang) - lado * Math.cos(ang))}`
  // a ponta passa um pouco do último ponto, para a seta "chegar" nele
  const frente = `${n(b[0] + tamanho * 0.35 * Math.cos(ang))} ${n(b[1] + tamanho * 0.35 * Math.sin(ang))}`
  return `M${frente}L${p(tamanho * 0.65, tamanho * 0.55)}L${p(tamanho * 0.65, -tamanho * 0.55)}Z`
}

/** Ponto no meio do comprimento do caminho (onde vai o nome). */
export function meioDoCaminho(pontos: readonly Ponto[]): Ponto {
  const trechos = pontos.slice(1).map((p, k) => Math.hypot(p[0] - pontos[k][0], p[1] - pontos[k][1]))
  let falta = trechos.reduce((s, t) => s + t, 0) / 2
  for (let k = 0; k < trechos.length; k++) {
    if (falta <= trechos[k] && trechos[k] > 0) {
      const t = falta / trechos[k]
      return [pontos[k][0] + (pontos[k + 1][0] - pontos[k][0]) * t, pontos[k][1] + (pontos[k + 1][1] - pontos[k][1]) * t]
    }
    falta -= trechos[k]
  }
  return pontos[0]
}

function svgDoTracado(i: ItemCanteiro, letraMin: number): string {
  const pontos = i.pontos ?? []
  if (pontos.length < 2) return ''
  const cor = hexDaCor(i.cor)
  const letra = Math.max(letraDoItem(i), letraMin)
  const lista = pontos.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')
  if (i.tipo === 'area') {
    return (
      `<path d="M${lista}Z" fill="${cor}" fill-opacity="0.2" stroke="${cor}" stroke-width="2.5" stroke-linejoin="round"/>` +
      // o nome fica no alto da área, por dentro: no centro ele sumia atrás da figura colocada ali
      (i.nome ? rotulo(i.x, Math.min(...pontos.map((p) => p[1])) + letra * 1.35, letra, i.nome, cor) : '')
    )
  }
  const largura = MEIA_LINHA * 2
  const [mx, my] = meioDoCaminho(pontos)
  return (
    // contorno branco por baixo: a linha aparece em cima da planta
    `<path d="M${lista}" fill="none" stroke="#ffffff" stroke-width="${largura + 3}" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<path d="M${lista}" fill="none" stroke="${cor}" stroke-width="${largura}" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="${largura * 2.5} ${largura * 1.6}"/>` +
    `<path d="${pontaDeSeta(pontos, largura * 3.4)}" fill="${cor}" stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round"/>` +
    (i.nome ? rotulo(mx, my - largura * 1.6, letra, i.nome, cor) : '')
  )
}

/**
 * `letraMin`: tamanho mínimo da letra do nome, na medida da folha. A tela passa o equivalente a 11 px
 * (com a folha inteira no celular o nome ficava com 5 px, ilegível); a imagem exportada não passa nada.
 */
export function svgDoItem(i: ItemCanteiro, letraMin = 0): string {
  if (i.pontos) return svgDoTracado(i, letraMin)
  const f = figuraPorId(i.tipo)
  if (!f) return ''
  const h = alturaDoItem(i)
  const desenho = `<g transform="translate(${n(i.x)} ${n(i.y)}) rotate(${i.giro}) translate(${n(-i.tamanho / 2)} ${n(-h / 2)}) scale(${n(i.tamanho / f.vb[0])})">${f.svg}</g>`
  if (!i.nome) return desenho
  // setor: o nome vai dentro da área, gira com ela e a letra encolhe até caber na largura
  if (i.tipo === 'setor') {
    const letra = n(Math.min(letraDoItem(i), (i.tamanho * 0.9) / (Math.max(1, i.nome.length) * 0.6)))
    return (
      desenho +
      `<text transform="translate(${n(i.x)} ${n(i.y)}) rotate(${i.giro})" text-anchor="middle" dominant-baseline="central" font-family="${FONTE}" font-size="${letra}" font-weight="700" fill="#14406b">${escaparXml(i.nome)}</text>`
    )
  }
  // nas outras figuras, embaixo e sempre na horizontal
  const letra = Math.max(letraDoItem(i), letraMin)
  return desenho + rotulo(i.x, i.y + meiaAlturaGirada(i) + letra * 1.05, letra, i.nome)
}

export function svgDosItens(itens: readonly ItemCanteiro[], letraMin = 0): string {
  return ordemDeDesenho(itens)
    .map((i) => svgDoItem(i, letraMin))
    .join('')
}

// ---------------------------------------------------------------------
// Legenda
// ---------------------------------------------------------------------

/** O símbolo de uma linha da legenda, dentro de uma caixa de `w` x `h` com o canto em (x, y). */
function simboloDaLegenda(l: LinhaDaLegenda, x: number, y: number, w: number, h: number): string {
  const f = figuraPorId(l.tipo)
  if (f) {
    const esc = Math.min(w / f.vb[0], h / f.vb[1])
    return `<g transform="translate(${n(x + (w - f.vb[0] * esc) / 2)} ${n(y + (h - f.vb[1] * esc) / 2)}) scale(${n(esc)})">${f.svg}</g>`
  }
  const cor = hexDaCor(l.cor)
  if (l.tipo === 'area') return `<rect x="${n(x + 2)}" y="${n(y + 2)}" width="${n(w - 4)}" height="${n(h - 4)}" fill="${cor}" fill-opacity="0.2" stroke="${cor}" stroke-width="2"/>`
  const meio = y + h / 2
  return (
    `<path d="M${n(x + 2)} ${n(meio)}H${n(x + w - 8)}" stroke="${cor}" stroke-width="4" stroke-linecap="round" stroke-dasharray="7 4"/>` +
    `<path d="M${n(x + w)} ${n(meio)}L${n(x + w - 9)} ${n(meio - 6)}L${n(x + w - 9)} ${n(meio + 6)}Z" fill="${cor}"/>`
  )
}

/**
 * Legenda em colunas, a partir de (x, y). Devolve o desenho e a altura usada. `linhasMax`: quantas
 * linhas cabem (o que passar vira "e mais N").
 */
export function svgDaLegenda(legenda: readonly LinhaDaLegenda[], x: number, y: number, largura: number, colunas: number, linhasMax = Infinity): { svg: string; altura: number } {
  if (legenda.length === 0) return { svg: '', altura: 0 }
  const PASSO = 28
  const cabem = Math.max(1, Math.floor(linhasMax)) * colunas
  const mostrar = legenda.length > cabem ? legenda.slice(0, cabem - 1) : legenda
  const sobra = legenda.length - mostrar.length
  const larguraDaColuna = largura / colunas
  let svg = `<text x="${n(x)}" y="${n(y + 13)}" font-family="${FONTE}" font-size="12" font-weight="700" fill="#111111">Legenda</text>`
  const topo = y + 22
  mostrar.forEach((l, k) => {
    const cx = x + (k % colunas) * larguraDaColuna
    const cy = topo + Math.floor(k / colunas) * PASSO
    const texto = l.quantidade > 1 ? `${l.nome} (${l.quantidade})` : l.nome
    svg += simboloDaLegenda(l, cx, cy, 34, 22) + `<text x="${n(cx + 42)}" y="${n(cy + 15)}" font-family="${FONTE}" font-size="11.5" fill="#111111">${escaparXml(texto)}</text>`
  })
  let linhas = Math.ceil(mostrar.length / colunas)
  if (sobra > 0) {
    const k = mostrar.length
    svg += `<text x="${n(x + (k % colunas) * larguraDaColuna + 42)}" y="${n(topo + Math.floor(k / colunas) * PASSO + 15)}" font-family="${FONTE}" font-size="11.5" fill="#4a4a4a">e mais ${sobra}</text>`
    linhas = Math.ceil((k + 1) / colunas)
  }
  return { svg, altura: 22 + linhas * PASSO + 6 }
}

// ---------------------------------------------------------------------
// Prancha: título, mapa e legenda numa folha só (imagem ou A4 deitado)
// ---------------------------------------------------------------------

/** Altura da faixa de título no topo da imagem exportada (na medida da folha). */
export const FAIXA_TITULO = 44
/** A4 deitado, em pontos de 1/96 de polegada (297 x 210 mm). */
export const A4_DEITADO = { largura: 1123, altura: 794 } as const
/** A4 deitado em pontos do PDF (1/72 de polegada). */
export const A4_PDF = { largura: 841.89, altura: 595.28 } as const

export type Formato = 'imagem' | 'a4'

export interface PedidoDeImagem {
  folha: Folha
  itens: readonly ItemCanteiro[]
  /** sem planta: folha em branco com grade */
  planta?: PlantaDeFundo
  titulo: string
  subtitulo?: string
}

export interface Prancha {
  largura: number
  altura: number
  /** onde o mapa fica na prancha: canto e escala (medida da folha → medida da prancha) */
  mapa: { x: number; y: number; esc: number }
  /** o SVG inteiro, com `larguraPx` de largura. As imagens da planta não entram: quem pinta é `telaDaPrancha`. */
  svg: (larguraPx?: number) => string
}

/**
 * Monta a prancha:
 * - 'imagem': na largura da folha; título em cima, mapa, legenda embaixo em 4 colunas;
 * - 'a4': A4 deitado; título em cima, mapa à esquerda (o maior que couber), legenda à direita.
 */
export function pranchaDoMapa(p: PedidoDeImagem, formato: Formato = 'imagem'): Prancha {
  const { folha } = p
  const legenda = legendaDe(p.itens)
  const comImagem = !!p.planta?.fundo
  const fundo = p.planta ? (comImagem ? '' : svgDasPecas(p.planta)) : svgDaGrade(folha)
  const desenhoDoMapa = (x: number, y: number, esc: number) =>
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(esc)})">` +
    (comImagem ? '' : `<rect x="0" y="0" width="${folha.largura}" height="${folha.altura}" fill="#ffffff"/>`) +
    fundo +
    svgDosItens(p.itens) +
    `<rect x="0.5" y="0.5" width="${folha.largura - 1}" height="${folha.altura - 1}" fill="none" stroke="#8a8a8a" stroke-width="1"/>` +
    `</g>`

  let largura: number
  let altura: number
  let mapa: Prancha['mapa']
  let corpo: string
  if (formato === 'a4') {
    const M = 28
    const TITULO = 50
    largura = A4_DEITADO.largura
    altura = A4_DEITADO.altura
    const colunaDaLegenda = legenda.length > 0 ? 220 : 0
    const caixa = { x: M, y: M + TITULO, w: largura - 2 * M - (colunaDaLegenda ? colunaDaLegenda + 14 : 0), h: altura - 2 * M - TITULO }
    const esc = Math.min(caixa.w / folha.largura, caixa.h / folha.altura)
    mapa = { x: caixa.x + (caixa.w - folha.largura * esc) / 2, y: caixa.y, esc }
    const leg = svgDaLegenda(legenda, largura - M - colunaDaLegenda, caixa.y, colunaDaLegenda, 1, (caixa.h - 30) / 28)
    corpo =
      `<text x="${M}" y="${M + 18}" font-family="${FONTE}" font-size="20" font-weight="700" fill="#111111">${escaparXml(p.titulo)}</text>` +
      (p.subtitulo ? `<text x="${M}" y="${M + 38}" font-family="${FONTE}" font-size="13" fill="#4a4a4a">${escaparXml(p.subtitulo)}</text>` : '') +
      desenhoDoMapa(mapa.x, mapa.y, esc) +
      leg.svg
  } else {
    largura = folha.largura
    mapa = { x: 0, y: FAIXA_TITULO, esc: 1 }
    const leg = svgDaLegenda(legenda, 12, FAIXA_TITULO + folha.altura + 8, largura - 24, 4)
    altura = FAIXA_TITULO + folha.altura + (leg.altura ? leg.altura + 12 : 0)
    corpo =
      `<text x="12" y="20" font-family="${FONTE}" font-size="16" font-weight="700" fill="#111111">${escaparXml(p.titulo)}</text>` +
      (p.subtitulo ? `<text x="12" y="37" font-family="${FONTE}" font-size="12" fill="#4a4a4a">${escaparXml(p.subtitulo)}</text>` : '') +
      desenhoDoMapa(0, FAIXA_TITULO, 1) +
      leg.svg
  }
  return {
    largura,
    altura,
    mapa,
    svg: (larguraPx = largura) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(larguraPx)}" height="${Math.round((larguraPx * altura) / largura)}" viewBox="0 0 ${largura} ${n(altura)}">${corpo}</svg>`,
  }
}

/** Nome do arquivo: só letras sem acento, números, hífen e sublinhado. */
export function nomeDoArquivo(obraCodigo: string, folhaNome: string, dia = new Date(), extensao: 'png' | 'pdf' = 'png'): string {
  const limpo = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
  const p = (v: number) => String(v).padStart(2, '0')
  const data = `${dia.getFullYear()}-${p(dia.getMonth() + 1)}-${p(dia.getDate())}`
  return ['mapa_canteiro', limpo(obraCodigo), limpo(folhaNome), data].filter(Boolean).join('_') + '.' + extensao
}

function carregarImagem(src: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = () => ok(null)
    img.src = src
  })
}

const SEM_IMAGEM = 'Este aparelho não conseguiu montar a imagem.'

/** Pinta a prancha numa tela de desenho (só no navegador): a planta por baixo, o SVG por cima. */
async function telaDaPrancha(p: PedidoDeImagem, formato: Formato, larguraPx: number): Promise<HTMLCanvasElement> {
  const prancha = pranchaDoMapa(p, formato)
  const esc = larguraPx / prancha.largura
  const tela = document.createElement('canvas')
  tela.width = Math.round(larguraPx)
  tela.height = Math.round(prancha.altura * esc)
  const c = tela.getContext('2d')
  if (!c) throw new Error(SEM_IMAGEM)
  c.fillStyle = '#ffffff'
  c.fillRect(0, 0, tela.width, tela.height)

  // planta por baixo, cortada no limite da folha (o pedaço da borda passa um pouco)
  if (p.planta?.fundo) {
    const m = prancha.mapa
    const u = m.esc * esc // medida da folha → pixels da imagem
    c.save()
    c.beginPath()
    c.rect(m.x * esc, m.y * esc, p.folha.largura * u, p.folha.altura * u)
    c.clip()
    for (const q of pedacosDoFundo(p.planta, p.folha.largura * u)) {
      const img = await carregarImagem(q.href)
      if (img) c.drawImage(img, m.x * esc + q.x * u, m.y * esc + q.y * u, q.lado * u, q.lado * u)
    }
    c.restore()
  }

  const url = URL.createObjectURL(new Blob([prancha.svg(larguraPx)], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const desenho = await carregarImagem(url)
    if (!desenho) throw new Error(SEM_IMAGEM)
    c.drawImage(desenho, 0, 0, tela.width, tela.height)
  } finally {
    URL.revokeObjectURL(url)
  }
  return tela
}

function blobDaTela(tela: HTMLCanvasElement, tipo: string, qualidade?: number): Promise<Blob> {
  return new Promise((ok, erro) => tela.toBlob((b) => (b ? ok(b) : erro(new Error(SEM_IMAGEM))), tipo, qualidade))
}

/** O mapa numa imagem PNG (só no navegador). `larguraPx`: largura da imagem. */
export async function pngDoMapa(p: PedidoDeImagem, larguraPx = 2400): Promise<Blob> {
  return blobDaTela(await telaDaPrancha(p, 'imagem', larguraPx), 'image/png')
}

/** O mapa num PDF A4 deitado, de uma página (só no navegador). */
export async function pdfDoMapa(p: PedidoDeImagem, larguraPx = 2480): Promise<Blob> {
  const tela = await telaDaPrancha(p, 'a4', larguraPx)
  const jpeg = new Uint8Array(await (await blobDaTela(tela, 'image/jpeg', 0.92)).arrayBuffer())
  return new Blob([pdfDeJpeg(jpeg, tela.width, tela.height, A4_PDF.largura, A4_PDF.altura, p.titulo)], { type: 'application/pdf' })
}

/**
 * PDF de uma página com uma imagem JPEG ocupando a página inteira. Escrito aqui, sem biblioteca: o PDF
 * aceita o JPEG como ele é (filtro DCTDecode), então são só o cabeçalho, cinco objetos e o índice.
 * O texto vai dentro da imagem (não dá para selecionar no leitor de PDF).
 */
export function pdfDeJpeg(jpeg: Uint8Array, larguraPx: number, alturaPx: number, larguraPt: number, alturaPt: number, titulo = ''): Uint8Array<ArrayBuffer> {
  const texto = new TextEncoder()
  const partes: Uint8Array[] = []
  const posicoes: number[] = []
  let tamanho = 0
  const por = (b: Uint8Array | string) => {
    const bytes = typeof b === 'string' ? texto.encode(b) : b
    partes.push(bytes)
    tamanho += bytes.length
  }
  const objeto = (num: number, corpo: string) => {
    posicoes[num] = tamanho
    por(`${num} 0 obj\n${corpo}\nendobj\n`)
  }
  // título em UTF-16 escrito em hexadecimal: aceita acento sem depender da codificação do leitor
  const hex = 'FEFF' + Array.from({ length: titulo.length }, (_, k) => titulo.charCodeAt(k).toString(16).toUpperCase().padStart(4, '0')).join('')
  const pt = (v: number) => String(Math.round(v * 100) / 100)
  const desenho = `q ${pt(larguraPt)} 0 0 ${pt(alturaPt)} 0 0 cm /Im0 Do Q`

  por('%PDF-1.4\n')
  por(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])) // linha de bytes altos: avisa que o arquivo é binário
  objeto(1, '<< /Type /Catalog /Pages 2 0 R >>')
  objeto(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  objeto(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(larguraPt)} ${pt(alturaPt)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  posicoes[4] = tamanho
  por(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${larguraPx} /Height ${alturaPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`)
  por(jpeg)
  por('\nendstream\nendobj\n')
  objeto(5, `<< /Length ${desenho.length} >>\nstream\n${desenho}\nendstream`)
  objeto(6, `<< /Title <${hex}> /Producer (Sistema Obra) >>`)
  const indice = tamanho
  por(`xref\n0 7\n0000000000 65535 f \n` + [1, 2, 3, 4, 5, 6].map((k) => `${String(posicoes[k]).padStart(10, '0')} 00000 n \n`).join(''))
  por(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${indice}\n%%EOF\n`)

  const saida = new Uint8Array(tamanho)
  let pos = 0
  for (const b of partes) {
    saida.set(b, pos)
    pos += b.length
  }
  return saida
}

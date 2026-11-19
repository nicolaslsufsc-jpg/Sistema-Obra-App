// Nova obra, etapa 3: o que o leitor de peças precisa de uma página do PDF, tirado com o pdf.js:
// os textos (normais e comentários), os traços com a camada de cada um e os nomes das camadas.
// É o que o PyMuPDF dá ao leitor do PC (pipeline/legado/gerador_fvs.py): page.get_drawings() com
// "layer", page.annots() e os textos. Tudo em pontos do PDF, y para baixo (as coordenadas da folha).
//
// Este arquivo não carrega o pdf.js: recebe a página já aberta. Assim roda no navegador (pdf.ts) e
// nos testes do Node (com o build "legacy" do pdf.js).
import type { PDFPageProxy } from 'pdfjs-dist'

/** [x0, y0, x1, y1] em pontos do PDF, y para baixo. */
export type Retangulo = [number, number, number, number]

export interface TextoDaPagina {
  texto: string
  ret: Retangulo
  /** texto normal do PDF ou comentário (os nomes SHX do AutoCAD vêm como comentário) */
  origem?: 'texto' | 'comentario'
}

/** Um caminho desenhado: pontos x0, y0, x1, y1, ... na folha; fechado quando volta ao começo. */
export interface Traco {
  camada: string | null
  pts: number[]
  fechado: boolean
}

export interface DesenhoDaPagina {
  largura: number
  altura: number
  textos: TextoDaPagina[]
  tracos: Traco[]
  /** nomes das camadas do PDF (vazio: PDF sem camadas) */
  camadas: string[]
}

// Códigos do pdf.js 6 (OPS e DrawOPS em pdfjs-dist/build/pdf.mjs). A versão é fixa no package.json, e
// o teste desenho.test.ts confere estes números com os do pdf.js.
export const OP = {
  save: 10,
  restore: 11,
  transform: 12,
  endPath: 28,
  beginMarkedContent: 69,
  beginMarkedContentProps: 70,
  endMarkedContent: 71,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  constructPath: 91,
} as const
export const DRAW = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 } as const

type Matriz = [number, number, number, number, number, number]

/** m1 aplicada depois de m2 (convenção do PDF: ponto · m1 · m2). */
function vezes(m1: Matriz, m2: Matriz): Matriz {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ]
}

const arred = (n: number) => Math.round(n * 100) / 100

/** Retângulo que cobre o texto, girado ou não. */
function retDoTexto(transform: number[], largura: number, altura: number, folha: Matriz): Retangulo {
  const [a, b, c, d, e, f] = transform
  const nu = Math.hypot(a, b) || 1
  const nv = Math.hypot(c, d) || 1
  const ux = a / nu
  const uy = b / nu
  const vx = c / nv
  const vy = d / nv
  const cantos = [
    [e, f],
    [e + ux * largura, f + uy * largura],
    [e + vx * altura, f + vy * altura],
    [e + ux * largura + vx * altura, f + uy * largura + vy * altura],
  ].map(([x, y]) => [x * folha[0] + y * folha[2] + folha[4], x * folha[1] + y * folha[3] + folha[5]])
  const xs = cantos.map((p) => p[0])
  const ys = cantos.map((p) => p[1])
  return [arred(Math.min(...xs)), arred(Math.min(...ys)), arred(Math.max(...xs)), arred(Math.max(...ys))]
}

/** Os textos da página com o retângulo de cada um (texto girado também). PDF escaneado: lista vazia. */
export async function textosDaPagina(pagina: PDFPageProxy, comComentarios = false): Promise<TextoDaPagina[]> {
  const folha = pagina.getViewport({ scale: 1 }).transform as Matriz
  const conteudo = await pagina.getTextContent()
  const saida: TextoDaPagina[] = []
  for (const it of conteudo.items) {
    if (!('str' in it) || !it.str.trim()) continue
    const t = it.transform as number[]
    const altura = it.height || Math.hypot(t[2], t[3]) || 8
    saida.push({ texto: it.str.trim(), ret: retDoTexto(t, it.width, altura, folha), origem: 'texto' })
  }
  if (comComentarios) {
    for (const a of await pagina.getAnnotations()) {
      const texto = String(a.contentsObj?.str ?? a.contents ?? '').trim()
      if (!texto || !Array.isArray(a.rect)) continue
      const [x0, y0, x1, y1] = a.rect as number[]
      const p = [
        [x0, y0],
        [x1, y1],
      ].map(([x, y]) => [x * folha[0] + y * folha[2] + folha[4], x * folha[1] + y * folha[3] + folha[5]])
      saida.push({
        texto,
        ret: [arred(Math.min(p[0][0], p[1][0])), arred(Math.min(p[0][1], p[1][1])), arred(Math.max(p[0][0], p[1][0])), arred(Math.max(p[0][1], p[1][1]))],
        origem: 'comentario',
      })
    }
  }
  return saida
}

/** Os traços da página, com a camada de cada um (a lista de operações do pdf.js). */
export async function tracosDaPagina(pagina: PDFPageProxy, nomeDaCamada: (id: string) => string | null): Promise<Traco[]> {
  const folha = pagina.getViewport({ scale: 1 }).transform as Matriz
  const lista = await pagina.getOperatorList()
  const tracos: Traco[] = []
  let ctm: Matriz = [1, 0, 0, 1, 0, 0]
  const pilha: Matriz[] = []
  const camadas: Array<string | null> = []
  let camada: string | null = null
  for (let i = 0; i < lista.fnArray.length; i++) {
    const fn = lista.fnArray[i]
    const args = lista.argsArray[i] as unknown[]
    switch (fn) {
      case OP.save:
        pilha.push(ctm)
        break
      case OP.restore:
        ctm = pilha.pop() ?? ctm
        break
      case OP.transform:
        ctm = vezes(args as unknown as Matriz, ctm)
        break
      case OP.paintFormXObjectBegin: {
        pilha.push(ctm)
        const m = args?.[0] as Matriz | null
        if (m && m.length === 6) ctm = vezes(m, ctm)
        break
      }
      case OP.paintFormXObjectEnd:
        ctm = pilha.pop() ?? ctm
        break
      case OP.beginMarkedContent:
        camadas.push(camada)
        break
      case OP.beginMarkedContentProps: {
        camadas.push(camada)
        const [tag, props] = args as [string, { type?: string; id?: string; ids?: string[] } | null]
        if (tag === 'OC' && props) {
          const id = props.id ?? props.ids?.[0]
          const nome = id ? nomeDaCamada(id) : null
          if (nome) camada = nome
        }
        break
      }
      case OP.endMarkedContent:
        camada = camadas.pop() ?? null
        break
      case OP.constructPath: {
        const [pintura, dados] = args as [number, Array<ArrayLike<number> | null>]
        if (pintura === OP.endPath) break // só recorte, não aparece
        const d = dados?.[0]
        if (!d || !('length' in d)) break
        const m = vezes(ctm, folha)
        const ponto = (x: number, y: number) => [arred(x * m[0] + y * m[2] + m[4]), arred(x * m[1] + y * m[3] + m[5])]
        let atual: number[] = []
        let fechado = false
        const fecha = () => {
          if (atual.length >= 4) {
            const n = atual.length
            const volta = Math.abs(atual[0] - atual[n - 2]) < 0.01 && Math.abs(atual[1] - atual[n - 1]) < 0.01
            if (volta && n > 4) atual = atual.slice(0, n - 2)
            tracos.push({ camada, pts: atual, fechado: fechado || volta })
          }
          atual = []
          fechado = false
        }
        for (let k = 0; k < d.length; ) {
          const op = d[k++]
          if (op === DRAW.moveTo) {
            fecha()
            atual.push(...ponto(d[k++], d[k++]))
          } else if (op === DRAW.lineTo) {
            atual.push(...ponto(d[k++], d[k++]))
          } else if (op === DRAW.curveTo) {
            k += 4
            atual.push(...ponto(d[k++], d[k++]))
          } else if (op === DRAW.quadraticCurveTo) {
            k += 2
            atual.push(...ponto(d[k++], d[k++]))
          } else if (op === DRAW.closePath) {
            fechado = true
            const x = atual[0]
            const y = atual[1]
            fecha()
            if (x !== undefined) atual.push(x, y) // o próximo trecho começa onde este fechou
          } else break
        }
        fecha()
        break
      }
    }
  }
  return tracos
}

/** Tudo o que o leitor precisa de uma página. */
export async function desenhoDaPagina(pagina: PDFPageProxy, nomeDaCamada: (id: string) => string | null, camadas: string[]): Promise<DesenhoDaPagina> {
  const v = pagina.getViewport({ scale: 1 })
  const [textos, tracos] = await Promise.all([textosDaPagina(pagina, true), tracosDaPagina(pagina, nomeDaCamada)])
  return { largura: v.width, altura: v.height, textos, tracos, camadas }
}

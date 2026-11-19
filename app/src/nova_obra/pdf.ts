// Nova obra, etapa 2: abrir o PDF da prancha no navegador (pdf.js, licença Apache, versão fixa no
// package.json e servida pelo próprio app, sem CDN), ler os textos com posição e desenhar os tiles da
// planta no formato do pipeline (pipeline/fvs/pacote.py): no nível z, 2^z pixels por ponto do PDF,
// tiles de 512 px, WebP; tile todo em branco não entra.
//
// Memória: a página é desenhada em blocos de no máximo 4096 x 2048 pixels (32 MB), e não inteira:
// uma A1 no nível 1 (2 px por ponto) teria 4768 x 3368 pixels (64 MB) de uma vez.
//
// Build "legacy" do pdf.js: o normal pede um Chrome muito novo (usa Uint8Array.toHex, do Chrome 140) e
// quebraria em tablet com o Chrome desatualizado. O legacy roda em navegador mais antigo e no Node.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import enderecoDoTrabalhador from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { desenhoDaPagina, type DesenhoDaPagina, type Retangulo, type TextoDaPagina } from './desenho'
import { conferirPagina, conferirPaginas, OPCOES_PDF } from './limites'

export { textosDaPagina, type Retangulo, type TextoDaPagina, type DesenhoDaPagina } from './desenho'

pdfjs.GlobalWorkerOptions.workerSrc = enderecoDoTrabalhador

export const TILE = 512
const BLOCO_LARGURA = 4096
const BLOCO_ALTURA = 2048

export type PdfAberto = PDFDocumentProxy & { fechar: () => Promise<void> }

export async function abrirPdf(dados: ArrayBuffer): Promise<PdfAberto> {
  // cópia: o pdf.js toma posse do buffer (manda para o worker)
  // limites de imagem e sem eval: limites.ts
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(dados.slice(0)), ...OPCOES_PDF, isOffscreenCanvasSupported: true })
  const doc = await tarefa.promise
  const paginas = conferirPaginas(doc.numPages)
  if (paginas) {
    await tarefa.destroy()
    throw new Error(paginas)
  }
  return Object.assign(doc, { fechar: () => tarefa.destroy() })
}

export function tamanhoDaPagina(pagina: PDFPageProxy): { largura: number; altura: number } {
  const v = pagina.getViewport({ scale: 1 })
  return { largura: v.width, altura: v.height }
}

/** Textos, comentários, traços e camadas da página: o que o leitor de peças usa (leitor.ts). */
export async function lerDesenho(doc: PDFDocumentProxy, pagina: PDFPageProxy): Promise<DesenhoDaPagina> {
  const oc = await doc.getOptionalContentConfig()
  const camadas: string[] = []
  for (const [, g] of oc as unknown as Iterable<[string, { name?: string }]>) if (g?.name) camadas.push(g.name)
  return desenhoDaPagina(pagina, (id) => (oc.getGroup(id) as { name?: string } | null)?.name ?? null, camadas)
}

/** Escala que o carimbo diz ("ESCALA 1:75", "Esc. 1/50"); null se não achar uma só. */
export function escalaDosTextos(textos: readonly TextoDaPagina[]): number | null {
  const achadas = new Set<number>()
  for (const t of textos) {
    for (const m of t.texto.matchAll(/(?:^|[^\d.,])1\s*[:/]\s*(\d{1,4})(?![\d.,])/g)) {
      const n = Number(m[1])
      if (n >= 10 && n <= 1000) achadas.add(n)
    }
  }
  return achadas.size === 1 ? [...achadas][0] : null
}

/**
 * Trecho que o título da prancha diz ("FORMA DO TIPO 1 - TRECHO B" → "Trecho B"); null se não achar um só.
 * Achado do Testador: o app dava "Trecho 2" para a prancha do trecho B.
 */
export function trechoDosTextos(textos: readonly TextoDaPagina[]): string | null {
  const achados = new Set<string>()
  for (const t of textos) for (const m of t.texto.matchAll(/\bTRECHO(?:\s*[:-]\s*|\s+)([A-Z]|\d{1,2})\b/gi)) achados.add(m[1].toUpperCase())
  return achados.size === 1 ? `Trecho ${[...achados][0]}` : null
}

/** Níveis de imagem: de 1 (2 pixels por ponto) até a planta inteira caber em 1024 pixels (folha_unica.py). */
export function niveisDaPlanta(largura: number, altura: number, ladoMenor = 1024): number[] {
  let z = -2
  while (Math.max(largura, altura) * 2 ** z > ladoMenor) z--
  const l: number[] = []
  for (let i = z; i <= 1; i++) l.push(i)
  return l
}

export interface ProgressoDosTiles {
  nivel: number
  niveis: number
  tiles: number
}

function novoCanvas(l: number, a: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(l, a)
  const c = document.createElement('canvas')
  c.width = l
  c.height = a
  return c
}

function emWebp(c: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type: 'image/webp', quality: 0.85 })
  return new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('O navegador não gerou a imagem da planta.'))), 'image/webp', 0.85))
}

/** Tile em branco (ou quase): todos os pixels claros. Olha só o canal verde, de 4 em 4 pixels. */
function emBranco(px: Uint8ClampedArray): boolean {
  for (let i = 1; i < px.length; i += 16) if (px[i] < 245) return false
  return true
}

/**
 * Desenha a janela da página em tiles. Devolve {"z/x/y": WebP}. As coordenadas da planta começam no
 * canto da janela: um ponto (x, y) da página fica em (x - janela[0], y - janela[1]) na planta.
 */
export async function gerarTiles(
  pagina: PDFPageProxy,
  janela: Retangulo,
  aoProgresso?: (p: ProgressoDosTiles) => void,
  cancelado?: () => boolean,
): Promise<{ tiles: Map<string, Blob>; niveis: number[]; largura: number; altura: number }> {
  const largura = janela[2] - janela[0]
  const altura = janela[3] - janela[1]
  const grande = conferirPagina(largura, altura)
  if (grande) throw new Error(grande)
  const niveis = niveisDaPlanta(largura, altura)
  const tiles = new Map<string, Blob>()
  const tile = novoCanvas(TILE, TILE)
  const ctxTile = tile.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  let feitos = 0
  for (const [i, z] of [...niveis].reverse().entries()) {
    const s = 2 ** z
    const W = Math.ceil(largura * s)
    const H = Math.ceil(altura * s)
    const viewport = pagina.getViewport({ scale: s })
    // blocos com largura e altura múltiplas do tile
    for (let by = 0; by < H; by += BLOCO_ALTURA) {
      for (let bx = 0; bx < W; bx += BLOCO_LARGURA) {
        if (cancelado?.()) throw new Error('cancelado')
        const bw = Math.min(BLOCO_LARGURA, Math.ceil((W - bx) / TILE) * TILE)
        const bh = Math.min(BLOCO_ALTURA, Math.ceil((H - by) / TILE) * TILE)
        const bloco = novoCanvas(bw, bh)
        const ctx = bloco.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, bw, bh)
        await pagina.render({
          canvas: bloco as HTMLCanvasElement,
          canvasContext: ctx,
          viewport,
          transform: [1, 0, 0, 1, -(janela[0] * s + bx), -(janela[1] * s + by)],
          background: '#ffffff',
          annotationMode: pdfjs.AnnotationMode.DISABLE,
        }).promise
        for (let ty = 0; ty < bh; ty += TILE) {
          for (let tx = 0; tx < bw; tx += TILE) {
            const px = ctx.getImageData(tx, ty, TILE, TILE)
            if (emBranco(px.data)) continue
            ctxTile.putImageData(px, 0, 0)
            // fora da janela fica branco, como no pipeline
            ctxTile.fillStyle = '#fff'
            const sobraX = W - (bx + tx)
            const sobraY = H - (by + ty)
            if (sobraX < TILE) ctxTile.fillRect(sobraX, 0, TILE - sobraX, TILE)
            if (sobraY < TILE) ctxTile.fillRect(0, sobraY, TILE, TILE - sobraY)
            tiles.set(`${z}/${(bx + tx) / TILE}/${(by + ty) / TILE}`, await emWebp(tile))
            feitos++
          }
        }
        // solta a memória do bloco já
        bloco.width = 0
        bloco.height = 0
        aoProgresso?.({ nivel: i + 1, niveis: niveis.length, tiles: feitos })
      }
    }
  }
  return { tiles, niveis, largura, altura }
}

/** Imagem da página inteira para escolher a janela (largura em pixels). */
export async function imagemDaPagina(pagina: PDFPageProxy, larguraPx: number): Promise<HTMLCanvasElement> {
  const v1 = pagina.getViewport({ scale: 1 })
  // folha muito comprida: limita também a altura (4096 px)
  const viewport = pagina.getViewport({ scale: Math.min(larguraPx / v1.width, 4096 / v1.height) })
  const c = document.createElement('canvas')
  c.width = Math.ceil(viewport.width)
  c.height = Math.ceil(viewport.height)
  await pagina.render({ canvas: c, viewport, background: '#ffffff', annotationMode: pdfjs.AnnotationMode.DISABLE }).promise
  return c
}

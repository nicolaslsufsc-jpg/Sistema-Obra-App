// Abrir e montar um .xlsx sem biblioteca nova. Um .xlsx é um .zip de arquivos XML.
// Ler: diretório central do .zip + "deflate" pelo DecompressionStream do navegador (Chrome 80+,
// Android, Node 18+). Montar: o .zip "store" de reportes/zip.ts (o Excel abre sem compressão).
// Só o que a planilha de controle do concreto precisa (planilha_controle.ts).

import { montarZip } from '../reportes/zip'

export type ArquivosXlsx = Map<string, Uint8Array>

async function inflar(dados: Uint8Array): Promise<Uint8Array> {
  const fluxo = new Blob([dados as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(fluxo).arrayBuffer())
}

/** Lê todos os arquivos de dentro do .xlsx. Recusa o que não é .zip. */
export async function abrirXlsx(bytes: Uint8Array): Promise<ArquivosXlsx> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // fim do diretório central: assinatura 0x06054b50, nos últimos 64 KB + 22 bytes
  let fim = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fim = i
      break
    }
  }
  if (fim < 0) throw new Error('O arquivo não é um .xlsx (não é um .zip).')
  const total = v.getUint16(fim + 10, true)
  let p = v.getUint32(fim + 16, true)
  const dec = new TextDecoder()
  const arquivos: ArquivosXlsx = new Map()
  for (let n = 0; n < total; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('O .xlsx está corrompido (diretório central).')
    const metodo = v.getUint16(p + 10, true)
    const tamanhoComp = v.getUint32(p + 20, true)
    const tamNome = v.getUint16(p + 28, true)
    const tamExtra = v.getUint16(p + 30, true)
    const tamComent = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const nome = dec.decode(bytes.subarray(p + 46, p + 46 + tamNome))
    p += 46 + tamNome + tamExtra + tamComent
    if (nome.endsWith('/')) continue
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const comp = bytes.subarray(inicio, inicio + tamanhoComp)
    if (metodo === 0) arquivos.set(nome, comp.slice())
    else if (metodo === 8) arquivos.set(nome, await inflar(comp))
    else throw new Error(`O .xlsx usa uma compressão que o app não lê (${metodo}).`)
  }
  return arquivos
}

/** Monta o .xlsx de volta. "[Content_Types].xml" vai primeiro, como o Excel grava. */
export function montarXlsx(arquivos: ArquivosXlsx): Uint8Array<ArrayBuffer> {
  const nomes = [...arquivos.keys()].sort((a, b) => Number(b === '[Content_Types].xml') - Number(a === '[Content_Types].xml'))
  return montarZip(nomes.map((nome) => ({ nome, dados: arquivos.get(nome)! })))
}

const cod = new TextEncoder()
const dec = new TextDecoder()
export const texto = (a: ArquivosXlsx, nome: string): string | null => {
  const b = a.get(nome)
  return b ? dec.decode(b) : null
}
export const gravarTexto = (a: ArquivosXlsx, nome: string, t: string) => a.set(nome, cod.encode(t))

// ---------------------------------------------------------------------
// Endereços de célula
// ---------------------------------------------------------------------

export function numeroDaColuna(letras: string): number {
  let n = 0
  for (const ch of letras.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

export function letrasDaColuna(n: number): string {
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export function separarCelula(ref: string): { col: number; linha: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.replace(/\$/g, ''))
  if (!m) throw new Error(`Célula inválida: ${ref}`)
  return { col: numeroDaColuna(m[1]), linha: Number(m[2]) }
}

export function escaparXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function desescaparXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
}

/** Data "AAAA-MM-DD" como número de série do Excel (dias desde 30/12/1899). */
export function serialDoExcel(data: string): number {
  const [a, m, d] = data.split('-').map(Number)
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000)
}

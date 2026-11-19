// Leitor de .zip que não carrega o arquivo inteiro na memória: lê só o índice do fim do arquivo e,
// depois, cada item quando é pedido, por fatias do próprio arquivo (Blob.slice). Item guardado sem
// compressão (o pacote.bin das plantas) sai como fatia, sem cópia; item comprimido (os .json) é
// descompactado pelo navegador (DecompressionStream 'deflate-raw'). Sem dependência nova.
// Não aceita zip64 (mais de 4 GB ou 65 mil itens), nem senha: o pacote da obra não precisa.

export interface ItemDoZip {
  nome: string
  metodo: number
  comprimido: number
  tamanho: number
  /** onde começa o cabeçalho local do item */
  inicio: number
}

export interface Zip {
  itens: ReadonlyMap<string, ItemDoZip>
  /** O item como Blob (null se não existe). */
  blob(nome: string): Promise<Blob | null>
  /** O item como texto UTF-8 (null se não existe). */
  texto(nome: string): Promise<string | null>
}

export const ERRO_ZIP = 'Este arquivo não é um .zip que o app consiga ler'

/**
 * Teto de um item comprimido depois de descompactado. No pacote da obra só os .json vão comprimidos
 * (o maior de uma obra grande tem poucos MB); passar disso é .zip estragado ou feito para travar o aparelho.
 */
export const TETO_DESCOMPACTADO = 50 * 1024 * 1024

const FIM_DO_INDICE = 0x06054b50
const ITEM_DO_INDICE = 0x02014b50
const CABECALHO_LOCAL = 0x04034b50

async function bytes(arquivo: Blob, de: number, ate: number): Promise<DataView> {
  return new DataView(await arquivo.slice(de, ate).arrayBuffer())
}

export async function abrirZip(arquivo: Blob): Promise<Zip> {
  // o registro do fim do índice tem 22 bytes mais um comentário de até 65535
  const de = Math.max(0, arquivo.size - 22 - 0xffff)
  const fim = await bytes(arquivo, de, arquivo.size)
  let pos = -1
  for (let i = fim.byteLength - 22; i >= 0; i--) {
    if (fim.getUint32(i, true) === FIM_DO_INDICE) {
      pos = i
      break
    }
  }
  if (pos < 0) throw new Error(ERRO_ZIP)
  const quantos = fim.getUint16(pos + 10, true)
  const tamanhoDoIndice = fim.getUint32(pos + 12, true)
  const inicioDoIndice = fim.getUint32(pos + 16, true)
  if (quantos === 0xffff || inicioDoIndice === 0xffffffff || inicioDoIndice + tamanhoDoIndice > arquivo.size) throw new Error(ERRO_ZIP)

  const indice = await bytes(arquivo, inicioDoIndice, inicioDoIndice + tamanhoDoIndice)
  const nomes = new TextDecoder()
  const itens = new Map<string, ItemDoZip>()
  let p = 0
  for (let n = 0; n < quantos; n++) {
    if (p + 46 > indice.byteLength || indice.getUint32(p, true) !== ITEM_DO_INDICE) throw new Error(ERRO_ZIP)
    const sinais = indice.getUint16(p + 8, true)
    const metodo = indice.getUint16(p + 10, true)
    const comprimido = indice.getUint32(p + 20, true)
    const tamanho = indice.getUint32(p + 24, true)
    const lNome = indice.getUint16(p + 28, true)
    const lExtra = indice.getUint16(p + 30, true)
    const lComentario = indice.getUint16(p + 32, true)
    const inicio = indice.getUint32(p + 42, true)
    if (p + 46 + lNome > indice.byteLength) throw new Error(ERRO_ZIP)
    const nome = nomes.decode(new Uint8Array(indice.buffer, indice.byteOffset + p + 46, lNome)).replace(/\\/g, '/')
    if (sinais & 1) throw new Error('O .zip tem senha. Gere o pacote de novo, sem senha.')
    if (!nome.endsWith('/')) itens.set(nome, { nome, metodo, comprimido, tamanho, inicio })
    p += 46 + lNome + lExtra + lComentario
  }

  async function blob(nome: string): Promise<Blob | null> {
    const item = itens.get(nome)
    if (!item) return null
    const local = await bytes(arquivo, item.inicio, item.inicio + 30)
    if (local.getUint32(0, true) !== CABECALHO_LOCAL) throw new Error(ERRO_ZIP)
    const dados = item.inicio + 30 + local.getUint16(26, true) + local.getUint16(28, true)
    const incompleto = new Error(`O .zip está incompleto (${nome}). Copie o arquivo de novo.`)
    if (dados + item.comprimido > arquivo.size) throw incompleto
    const fatia = arquivo.slice(dados, dados + item.comprimido)
    if (item.metodo === 0) {
      if (item.comprimido !== item.tamanho) throw incompleto
      return fatia
    }
    if (item.metodo !== 8) throw new Error(`${ERRO_ZIP} (compressão ${item.metodo} em ${nome})`)
    if (item.tamanho > TETO_DESCOMPACTADO) throw new Error(`${ERRO_ZIP} (${nome} grande demais)`)
    if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador não sabe abrir .zip. Atualize o Chrome.')
    return descompactar(fatia, item.tamanho, incompleto)
  }

  return {
    itens,
    blob,
    async texto(nome) {
      const b = await blob(nome)
      return b ? b.text() : null
    },
  }
}

/**
 * Descompacta contando os bytes: para assim que passar do tamanho declarado no .zip (bomba de
 * descompressão), sem juntar na memória mais do que isso.
 */
async function descompactar(fatia: Blob, tamanho: number, incompleto: Error): Promise<Blob> {
  const leitor = fatia.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const partes: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await leitor.read()
      if (done) break
      total += value.byteLength
      if (total > tamanho) throw incompleto
      partes.push(value)
    }
  } catch (e) {
    await leitor.cancel().catch(() => {})
    throw e === incompleto ? e : incompleto
  }
  if (total !== tamanho) throw incompleto
  return new Blob(partes as BlobPart[])
}

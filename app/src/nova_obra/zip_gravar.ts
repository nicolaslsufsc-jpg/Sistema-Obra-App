// Grava um .zip simples, sem compressão (o pacote sem planta tem poucos KB), com CRC-32 certo para o
// Explorador do Windows e qualquer descompactador abrirem. Lido pelo app com app/src/nucleo/zip.ts.

let tabela: Uint32Array | null = null
function crc32(dados: Uint8Array): number {
  if (!tabela) {
    tabela = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      tabela[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (const b of dados) c = tabela[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Data e hora no formato do DOS (o do .zip), na hora local. */
function dataDos(d: Date): [number, number] {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const dia = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return [hora, dia]
}

export function gravarZip(arquivos: ReadonlyArray<readonly [string, string | Uint8Array]>, quando = new Date()): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder()
  const [hora, dia] = dataDos(quando)
  const partes: Uint8Array[] = []
  const central: Uint8Array[] = []
  let pos = 0
  for (const [nome, conteudo] of arquivos) {
    const dados = typeof conteudo === 'string' ? enc.encode(conteudo) : conteudo
    const n = enc.encode(nome)
    const crc = crc32(dados)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // nome em UTF-8
    local.setUint16(8, 0, true) // sem compressão
    local.setUint16(10, hora, true)
    local.setUint16(12, dia, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, dados.length, true)
    local.setUint32(22, dados.length, true)
    local.setUint16(26, n.length, true)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, 20, true)
    c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true)
    c.setUint16(10, 0, true)
    c.setUint16(12, hora, true)
    c.setUint16(14, dia, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, dados.length, true)
    c.setUint32(24, dados.length, true)
    c.setUint16(28, n.length, true)
    c.setUint32(42, pos, true)
    partes.push(new Uint8Array(local.buffer), n, dados)
    central.push(new Uint8Array(c.buffer), n)
    pos += 30 + n.length + dados.length
  }
  const tamanhoCentral = central.reduce((s, p) => s + p.length, 0)
  const fim = new DataView(new ArrayBuffer(22))
  fim.setUint32(0, 0x06054b50, true)
  fim.setUint16(8, arquivos.length, true)
  fim.setUint16(10, arquivos.length, true)
  fim.setUint32(12, tamanhoCentral, true)
  fim.setUint32(16, pos, true)
  const todas = [...partes, ...central, new Uint8Array(fim.buffer)]
  const saida = new Uint8Array(todas.reduce((s, p) => s + p.length, 0))
  let i = 0
  for (const p of todas) {
    saida.set(p, i)
    i += p.length
  }
  return saida
}

/**
 * O mesmo .zip, mas com arquivos grandes (os pacote.bin das plantas) como Blob: lê um de cada vez para
 * o CRC-32 e monta o resultado como Blob, sem juntar tudo num pedaço só de memória.
 */
export async function gravarZipBlob(arquivos: ReadonlyArray<readonly [string, string | Blob]>, quando = new Date()): Promise<Blob> {
  const enc = new TextEncoder()
  const [hora, dia] = dataDos(quando)
  const partes: BlobPart[] = []
  const central: Uint8Array<ArrayBuffer>[] = []
  let pos = 0
  for (const [nome, conteudo] of arquivos) {
    const bytes = typeof conteudo === 'string' ? enc.encode(conteudo) : new Uint8Array(await conteudo.arrayBuffer())
    if (pos + bytes.length > 0xfffffff0) throw new Error('O pacote da obra passou de 4 GB: divida em mais de um .zip.')
    const n = enc.encode(nome)
    const crc = crc32(bytes)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true)
    local.setUint16(10, hora, true)
    local.setUint16(12, dia, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, bytes.length, true)
    local.setUint32(22, bytes.length, true)
    local.setUint16(26, n.length, true)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, 20, true)
    c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true)
    c.setUint16(12, hora, true)
    c.setUint16(14, dia, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, bytes.length, true)
    c.setUint32(24, bytes.length, true)
    c.setUint16(28, n.length, true)
    c.setUint32(42, pos, true)
    partes.push(local.buffer, n, typeof conteudo === 'string' ? bytes : conteudo)
    central.push(new Uint8Array(c.buffer), n)
    pos += 30 + n.length + bytes.length
  }
  const tamanhoCentral = central.reduce((s, p) => s + p.length, 0)
  const fim = new DataView(new ArrayBuffer(22))
  fim.setUint32(0, 0x06054b50, true)
  fim.setUint16(8, arquivos.length, true)
  fim.setUint16(10, arquivos.length, true)
  fim.setUint32(12, tamanhoCentral, true)
  fim.setUint32(16, pos, true)
  return new Blob([...partes, ...central, fim.buffer], { type: 'application/zip' })
}

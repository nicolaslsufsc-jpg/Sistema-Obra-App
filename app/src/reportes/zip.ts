// .zip mínimo (sem compressão, "store"): o JPEG já vem comprimido e o texto é pequeno. Evita
// dependência nova. Formato: PKWARE APPNOTE, cabeçalho local + diretório central + fim.

const TABELA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(dados: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ArquivoDoZip {
  nome: string
  dados: Uint8Array
}

/** Data e hora no formato do DOS (o .zip guarda assim). */
function dataDos(d: Date): [number, number] {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const dia = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return [hora, dia]
}

export function montarZip(arquivos: readonly ArquivoDoZip[], quando = new Date()): Uint8Array<ArrayBuffer> {
  const cod = new TextEncoder()
  const [hora, dia] = dataDos(quando)
  const locais: Uint8Array[] = []
  const centrais: Uint8Array[] = []
  let deslocamento = 0
  for (const a of arquivos) {
    const nome = cod.encode(a.nome)
    const crc = crc32(a.dados)
    const local = new Uint8Array(30 + nome.length)
    const v = new DataView(local.buffer)
    v.setUint32(0, 0x04034b50, true)
    v.setUint16(4, 20, true) // versão necessária
    v.setUint16(6, 0x0800, true) // nome em UTF-8
    v.setUint16(8, 0, true) // sem compressão
    v.setUint16(10, hora, true)
    v.setUint16(12, dia, true)
    v.setUint32(14, crc, true)
    v.setUint32(18, a.dados.length, true)
    v.setUint32(22, a.dados.length, true)
    v.setUint16(26, nome.length, true)
    local.set(nome, 30)
    locais.push(local, a.dados)

    const central = new Uint8Array(46 + nome.length)
    const w = new DataView(central.buffer)
    w.setUint32(0, 0x02014b50, true)
    w.setUint16(4, 20, true)
    w.setUint16(6, 20, true)
    w.setUint16(8, 0x0800, true)
    w.setUint16(10, 0, true)
    w.setUint16(12, hora, true)
    w.setUint16(14, dia, true)
    w.setUint32(16, crc, true)
    w.setUint32(20, a.dados.length, true)
    w.setUint32(24, a.dados.length, true)
    w.setUint16(28, nome.length, true)
    w.setUint32(42, deslocamento, true)
    central.set(nome, 46)
    centrais.push(central)
    deslocamento += local.length + a.dados.length
  }
  const tamCentral = centrais.reduce((s, c) => s + c.length, 0)
  const fim = new Uint8Array(22)
  const f = new DataView(fim.buffer)
  f.setUint32(0, 0x06054b50, true)
  f.setUint16(8, arquivos.length, true)
  f.setUint16(10, arquivos.length, true)
  f.setUint32(12, tamCentral, true)
  f.setUint32(16, deslocamento, true)
  const partes = [...locais, ...centrais, fim]
  const saida = new Uint8Array(partes.reduce((s, p) => s + p.length, 0))
  let i = 0
  for (const p of partes) {
    saida.set(p, i)
    i += p.length
  }
  return saida
}

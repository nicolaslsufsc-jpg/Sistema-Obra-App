// Monta um .zip nos testes (como o zipfile do Python grava): .json comprimido, o resto sem compressão.
// O leitor do app não confere o CRC, então ele vai zerado.
import { deflateRawSync } from 'node:zlib'

export function montarZip(arquivos: Record<string, string | Uint8Array>, comprimir = (nome: string) => nome.endsWith('.json')): Uint8Array<ArrayBuffer> {
  const partes: Uint8Array[] = []
  const indice: Uint8Array[] = []
  let pos = 0
  const nomes = new TextEncoder()
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const dados = typeof conteudo === 'string' ? nomes.encode(conteudo) : conteudo
    const metodo = comprimir(nome) ? 8 : 0
    const gravado = metodo === 8 ? new Uint8Array(deflateRawSync(dados)) : dados
    const n = nomes.encode(nome)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(8, metodo, true)
    local.setUint32(18, gravado.length, true)
    local.setUint32(22, dados.length, true)
    local.setUint16(26, n.length, true)
    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, 20, true)
    central.setUint16(6, 20, true)
    central.setUint16(10, metodo, true)
    central.setUint32(20, gravado.length, true)
    central.setUint32(24, dados.length, true)
    central.setUint16(28, n.length, true)
    central.setUint32(42, pos, true)
    partes.push(new Uint8Array(local.buffer), n, gravado)
    indice.push(new Uint8Array(central.buffer), n)
    pos += 30 + n.length + gravado.length
  }
  const tamanhoDoIndice = indice.reduce((s, p) => s + p.length, 0)
  const fim = new DataView(new ArrayBuffer(22))
  fim.setUint32(0, 0x06054b50, true)
  fim.setUint16(8, Object.keys(arquivos).length, true)
  fim.setUint16(10, Object.keys(arquivos).length, true)
  fim.setUint32(12, tamanhoDoIndice, true)
  fim.setUint32(16, pos, true)
  const todas = [...partes, ...indice, new Uint8Array(fim.buffer)]
  const saida = new Uint8Array(todas.reduce((s, p) => s + p.length, 0))
  let i = 0
  for (const p of todas) {
    saida.set(p, i)
    i += p.length
  }
  return saida
}

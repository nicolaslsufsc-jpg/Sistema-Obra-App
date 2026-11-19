import { describe, expect, it } from 'vitest'
import { abrirZip, ERRO_ZIP, TETO_DESCOMPACTADO } from './zip'
import { abrirPacoteZip } from './pacote_obra'
import { montarZip } from '../../testes/montar_zip'

const BIN = new Uint8Array(5000).map((_, i) => (i * 7) % 256)
const INDICE = JSON.stringify({ obra: 'TESTE', pavimentos: [{ nome: '1º', pecas: [], plantas: [] }] })

describe('leitor de .zip', () => {
  it('lê item comprimido e item guardado sem compressão, pelo nome', async () => {
    const zip = await abrirZip(new Blob([montarZip({ 'a/indice.json': INDICE, 'a/pav/pacote.bin': BIN })]))
    expect([...zip.itens.keys()]).toEqual(['a/indice.json', 'a/pav/pacote.bin'])
    expect(await zip.texto('a/indice.json')).toBe(INDICE)
    expect(new Uint8Array(await (await zip.blob('a/pav/pacote.bin'))!.arrayBuffer())).toEqual(BIN)
    expect(await zip.blob('nao/existe')).toBeNull()
  })

  it('recusa arquivo que não é .zip e .zip cortado', async () => {
    await expect(abrirZip(new Blob(['não sou zip']))).rejects.toThrow(ERRO_ZIP)
    const inteiro = montarZip({ 'indice.json': INDICE })
    await expect(abrirZip(new Blob([inteiro.slice(0, inteiro.length - 30)]))).rejects.toThrow(ERRO_ZIP)
  })
})

/** Muda um campo do primeiro item do índice central (zip de um item só): como um .zip estragado ou malicioso. */
function mexerNoIndice(zip: Uint8Array<ArrayBuffer>, deslocamento: number, valor: number, bytes: 2 | 4): Uint8Array<ArrayBuffer> {
  const v = new DataView(zip.buffer)
  for (let i = zip.length - 22; i >= 0; i--) {
    if (v.getUint32(i, true) !== 0x02014b50) continue
    if (bytes === 2) v.setUint16(i + deslocamento, valor, true)
    else v.setUint32(i + deslocamento, valor, true)
    return zip
  }
  throw new Error('sem índice')
}

describe('.zip estragado ou malicioso (ressalvas do Revisor, 08/11)', () => {
  const ZEROS = new Uint8Array(2 * 1024 * 1024)

  it('bomba de descompressão: para ao passar do tamanho declarado', async () => {
    const zip = await abrirZip(new Blob([mexerNoIndice(montarZip({ 'a.json': ZEROS }), 24, 1000, 4)]))
    await expect(zip.blob('a.json')).rejects.toThrow(/incompleto \(a\.json\)/)
  })

  it('item comprimido que se diz maior que o teto é recusado sem descompactar', async () => {
    const zip = await abrirZip(new Blob([mexerNoIndice(montarZip({ 'a.json': ZEROS }), 24, TETO_DESCOMPACTADO + 1, 4)]))
    await expect(zip.blob('a.json')).rejects.toThrow(/grande demais/)
  })

  it('descompactado menor que o declarado também é recusado', async () => {
    const zip = await abrirZip(new Blob([mexerNoIndice(montarZip({ 'a.json': ZEROS }), 24, ZEROS.length + 10, 4)]))
    await expect(zip.blob('a.json')).rejects.toThrow(/incompleto/)
  })

  it('item sem compressão com tamanhos diferentes, ou que passa do fim do arquivo, é recusado', async () => {
    const tamanhos = await abrirZip(new Blob([mexerNoIndice(montarZip({ 'p.bin': BIN }), 24, BIN.length + 1, 4)]))
    await expect(tamanhos.blob('p.bin')).rejects.toThrow(/incompleto/)
    const alem = await abrirZip(new Blob([mexerNoIndice(mexerNoIndice(montarZip({ 'p.bin': BIN }), 20, 1e8, 4), 24, 1e8, 4)]))
    await expect(alem.blob('p.bin')).rejects.toThrow(/incompleto/)
  })

  it('nome maior que o arquivo dá a mensagem normal de .zip ilegível', async () => {
    await expect(abrirZip(new Blob([mexerNoIndice(montarZip({ 'a.json': INDICE }), 28, 60000, 2)]))).rejects.toThrow(ERRO_ZIP)
  })
})

describe('pacote da obra em .zip', () => {
  it('acha o indice.json na raiz ou dentro de dados_obra/, e lê as plantas pelo caminho do pacote', async () => {
    for (const prefixo of ['', 'dados_obra/']) {
      const p = await abrirPacoteZip(new Blob([montarZip({ [`${prefixo}indice.json`]: INDICE, [`${prefixo}pav/planta/pacote.bin`]: BIN })]), 'EXE.zip')
      expect(p.raiz).toBe('zip:EXE.zip')
      expect(p.indice.obra).toBe('TESTE')
      expect((await p.fonte.ler('pav/planta/pacote.bin'))?.size).toBe(BIN.length)
      expect(await p.fonte.ler('fichas.json')).toBeNull()
    }
  })

  it('zip sem indice.json, ou com índice sem obra, não é o pacote', async () => {
    await expect(abrirPacoteZip(new Blob([montarZip({ 'fotos/a.jpg': BIN })]))).rejects.toThrow(/não é o pacote da obra/)
    await expect(abrirPacoteZip(new Blob([montarZip({ 'indice.json': '{"pavimentos":[]}' })]))).rejects.toThrow(/não é o pacote da obra/)
    await expect(abrirPacoteZip(new Blob(['texto']))).rejects.toThrow(/não é um \.zip/)
  })
})

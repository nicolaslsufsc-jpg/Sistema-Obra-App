// Documentos para usar sem internet: opcional, por documento ou por pasta (Nicolas, 21/11/2026).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sha256Hex } from '../fvs/pacote'
import { baixados, baixarDocumentos, apagarDocumentosDoAparelho, paraBaixar, trocarBaixador, urlDoArquivo, type ArquivoDoc } from './dados'
import { pdfDeExemplo } from './exemplos'
import { apagarDoAparelho, baixarParaOffline, listarOffline, textoDoResultado, trocarGuardaOffline, type GuardaOffline } from './offline'

function guardaDeTeste(): GuardaOffline & { m: Map<string, ArrayBuffer> } {
  const m = new Map<string, ArrayBuffer>()
  return {
    m,
    ler: async (id) => m.get(id) ?? null,
    gravar: async (id, b) => void m.set(id, b),
    apagar: async (id) => void m.delete(id),
    listar: async () => new Map([...m].map(([id, b]) => [id, b.byteLength])),
  }
}

const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer

async function arquivo(id: string, texto: string, onde: ArquivoDoc['onde'] = 'servidor'): Promise<ArquivoDoc & { bytes: ArrayBuffer }> {
  const bytes = buf(pdfDeExemplo([texto]))
  return { id, caminho: `obra/documentos/${id}.pdf`, nome_original: `${id}.pdf`, tipo: 'application/pdf', tamanho: bytes.byteLength, hash: await sha256Hex(bytes), onde, bytes }
}

describe('Documentos: baixar para usar offline', () => {
  let g: ReturnType<typeof guardaDeTeste>
  beforeEach(() => {
    g = guardaDeTeste()
    trocarGuardaOffline(g)
    vi.stubGlobal('navigator', { ...globalThis.navigator, onLine: true })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('nada baixa sozinho: abrir sem pedir não vai ao servidor nem guarda', async () => {
    const a = await arquivo('d1', 'um')
    const pedidos: string[] = []
    trocarBaixador(async (c) => (pedidos.push(c), a.bytes))
    expect(await urlDoArquivo(a)).toBeNull()
    // o "Baixar do servidor" de um toque abre, mas não guarda no aparelho
    expect(await urlDoArquivo(a, true)).toMatchObject({ abrir: true })
    expect(pedidos).toEqual([a.caminho])
    expect(g.m.size).toBe(0)
  })

  it('baixar a pasta: um de cada vez, confere SHA-256, pula o que já está, um erro não para os outros', async () => {
    const a = await arquivo('d1', 'um')
    const b = await arquivo('d2', 'dois')
    const c = await arquivo('d3', 'tres')
    const errado = await arquivo('d4', 'quatro')
    const bytesDe = new Map([
      [a.caminho, a.bytes],
      [b.caminho, b.bytes],
      [errado.caminho, c.bytes], // veio outro arquivo: não confere
    ])
    const andou: string[] = []
    const r = await baixarParaOffline([a, b, c, errado], async (cam) => bytesDe.get(cam) ?? null, (f, t) => andou.push(`${f}/${t}`))
    expect(r).toEqual({ baixados: 2, pulados: 0, falharam: 2, naoConferiram: 1 })
    expect([...g.m.keys()].sort()).toEqual(['d1', 'd2'])
    expect(andou).toEqual(['1/4', '2/4', '3/4', '4/4'])
    expect(textoDoResultado(r)).toBe('2 arquivos baixados · 2 não baixaram (1 não conferiu com o registro: avise o gestor).')
    // de novo: os dois guardados são pulados
    const r2 = await baixarParaOffline([a, b], async () => null)
    expect(r2).toMatchObject({ baixados: 0, pulados: 2 })
  })

  it('o baixado abre sem internet; apagar do aparelho tira só o guardado', async () => {
    const a = await arquivo('d1', 'um')
    trocarBaixador(async () => a.bytes)
    expect((await baixarDocumentos([a])).baixados).toBe(1)
    vi.stubGlobal('navigator', { ...globalThis.navigator, onLine: false })
    trocarBaixador(async () => {
      throw new Error('sem internet')
    })
    expect(await urlDoArquivo(a)).toMatchObject({ abrir: true, tipo: 'application/pdf' })
    expect(await apagarDocumentosDoAparelho([{ ...a, onde: 'offline' }])).toBe(1)
    expect(await apagarDoAparelho(['d1', 'outro'])).toBe(0)
    expect((await listarOffline()).size).toBe(0)
    expect(await urlDoArquivo(a)).toBeNull()
  })

  it('só oferece baixar o que está só no servidor; apagar, só o baixado', async () => {
    const lista = [await arquivo('s', 's', 'servidor'), await arquivo('o', 'o', 'offline'), await arquivo('a', 'a', 'aparelho'), undefined, { ...(await arquivo('x', 'x')), caminho: '' }]
    expect(paraBaixar(lista).map((a) => a.id)).toEqual(['s'])
    expect(baixados(lista).map((a) => a.id)).toEqual(['o'])
  })
})

// Modelos convertidos guardados no próprio aparelho (área privada do navegador, OPFS).
// Reabrir um modelo guardado é muito mais rápido que ler o IFC de novo, e funciona sem internet.
// Nada aqui sai do aparelho.
import { lerMetaDoPacote, lerPacote, pacoteParaBlob } from './pacote'
import type { MetaModelo, ModeloIfc } from './tipos'

const PASTA = 'modelos-ifc'

export interface ModeloGuardado {
  id: string
  nome: string
  tamanho: number
  elementos: number
  guardadoEm: number
}

async function pasta(): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (!navigator.storage?.getDirectory) return null
    const raiz = await navigator.storage.getDirectory()
    return await raiz.getDirectoryHandle(PASTA, { create: true })
  } catch {
    return null // navegador sem suporte, ou página sem https
  }
}

export async function podeGuardar(): Promise<boolean> {
  return (await pasta()) !== null
}

/** Identificador do arquivo: mesmo nome, tamanho e data = mesmo modelo. Não precisa ler o conteúdo. */
export function idDoArquivo(a: { name: string; size: number; lastModified: number }): string {
  let h = 0x811c9dc5
  const t = `${a.name}|${a.size}|${a.lastModified}`
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `m${(h >>> 0).toString(16).padStart(8, '0')}_${a.size.toString(36)}`
}

export async function listarGuardados(): Promise<ModeloGuardado[]> {
  const p = await pasta()
  if (!p) return []
  const lista: ModeloGuardado[] = []
  for await (const [nome, h] of p.entries() as AsyncIterable<[string, FileSystemFileHandle]>) {
    if (!nome.endsWith('.obra3d')) continue
    try {
      const f = await h.getFile()
      const meta: MetaModelo = await lerMetaDoPacote(f)
      lista.push({ id: meta.id, nome: meta.nome, tamanho: f.size, elementos: meta.nomes.length, guardadoEm: f.lastModified })
    } catch {
      // gravação interrompida no meio: arquivo inútil, a lista só não mostra
    }
  }
  return lista.sort((a, b) => b.guardadoEm - a.guardadoEm)
}

export async function guardar(m: ModeloIfc): Promise<boolean> {
  const p = await pasta()
  if (!p) return false
  try {
    const h = await p.getFileHandle(`${m.meta.id}.obra3d`, { create: true })
    const w = await h.createWritable()
    await w.write(pacoteParaBlob(m))
    await w.close()
    // Pede ao navegador para não limpar os modelos quando o aparelho ficar sem espaço.
    void navigator.storage.persist?.().catch(() => {})
    return true
  } catch {
    // sem espaço no aparelho, por exemplo: o modelo continua aberto, só não fica guardado
    return false
  }
}

export async function abrirGuardado(id: string): Promise<ModeloIfc | null> {
  const f = await arquivoGuardado(id)
  if (!f) return null
  return lerPacote(await f.arrayBuffer(), true)
}

export async function arquivoGuardado(id: string): Promise<File | null> {
  const p = await pasta()
  if (!p) return null
  try {
    return await (await p.getFileHandle(`${id}.obra3d`)).getFile()
  } catch {
    return null
  }
}

export async function apagarGuardado(id: string): Promise<void> {
  const p = await pasta()
  if (!p) return
  await p.removeEntry(`${id}.obra3d`).catch(() => {})
}

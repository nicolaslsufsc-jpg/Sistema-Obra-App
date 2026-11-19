// Nova obra: o que é grande demais para o rascunho (localStorage) fica num banco do navegador só da
// Nova obra: o PDF de cada planta e os tiles já desenhados. Não é o banco do app nem o da FVS.
import Dexie, { type Table } from 'dexie'
import type { Retangulo } from './pdf'

export interface PdfGuardado {
  id: string
  pdf: Blob
}

export interface TilesGuardados {
  id: string
  janela: Retangulo
  niveis: number[]
  largura: number
  altura: number
  tiles: Array<[string, Blob]>
}

class BancoNovaObra extends Dexie {
  pdfs!: Table<PdfGuardado, string>
  tiles!: Table<TilesGuardados, string>
  constructor() {
    super('sistema-obra-nova-obra')
    this.version(1).stores({ pdfs: 'id', tiles: 'id' })
  }
}

let banco: BancoNovaObra | null = null
const db = () => (banco ??= new BancoNovaObra())

export const guardarPdf = (id: string, pdf: Blob) => db().pdfs.put({ id, pdf })
export const lerPdf = async (id: string) => (await db().pdfs.get(id))?.pdf ?? null
export const guardarTiles = (t: TilesGuardados) => db().tiles.put(t)
export const lerTiles = async (id: string) => (await db().tiles.get(id)) ?? null

/** Tira do navegador o que é da planta (ao apagar a planta). */
export async function apagarPlanta(id: string) {
  await db().pdfs.delete(id)
  await db().tiles.delete(id)
}

/** Começar outra obra: limpa tudo. */
export async function apagarTudo() {
  await db().pdfs.clear()
  await db().tiles.clear()
}

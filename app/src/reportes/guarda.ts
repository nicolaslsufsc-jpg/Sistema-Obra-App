// Reportes guardados no aparelho, num banco PRÓPRIO do navegador (não é o banco do núcleo nem tabela
// do servidor): sem migração, sem fila de envio. Saem num .zip que a pessoa manda. Quando o envio
// pelo servidor existir (proposta), estes viram itens da fila do núcleo.
import Dexie, { type Table } from 'dexie'
import { MAX_IMAGENS, nomeDoReporte, textoDoReporte, type Reporte } from './coleta'
import { montarZip, type ArquivoDoZip } from './zip'

/** Mais que isso, o mais antigo sai (o aparelho do campo tem pouco espaço). */
export const MAX_REPORTES = 30

class BancoDeReportes extends Dexie {
  reportes!: Table<Reporte, string>
  constructor() {
    super('sistema-obra-reportes')
    this.version(1).stores({ reportes: 'id, criado_em' })
  }
}

let banco: BancoDeReportes | null = null
const db = () => (banco ??= new BancoDeReportes())

export async function guardarReporte(r: Reporte): Promise<void> {
  if (r.imagens.length > MAX_IMAGENS) throw new Error(`No máximo ${MAX_IMAGENS} imagens por reporte.`)
  await db().transaction('rw', db().reportes, async () => {
    await db().reportes.put(r)
    const total = await db().reportes.count()
    if (total > MAX_REPORTES) {
      const sobra = await db().reportes.orderBy('criado_em').limit(total - MAX_REPORTES).primaryKeys()
      await db().reportes.bulkDelete(sobra)
    }
  })
}

/** Mais novo primeiro. */
export async function listarReportes(): Promise<Reporte[]> {
  return (await db().reportes.orderBy('criado_em').reverse().toArray()) as Reporte[]
}

export async function apagarReporte(id: string): Promise<void> {
  await db().reportes.delete(id)
}

/** Os arquivos de um reporte dentro do .zip: pasta própria, texto, dados em JSON e as imagens. */
export async function arquivosDoReporte(r: Reporte): Promise<ArquivoDoZip[]> {
  const pasta = nomeDoReporte(r)
  const cod = new TextEncoder()
  const json = { id: r.id, criado_em: r.criado_em, gravidade: r.gravidade, comentario: r.comentario, contexto: r.contexto, imagens: r.imagens.length }
  const arquivos: ArquivoDoZip[] = [
    { nome: `${pasta}/reporte.txt`, dados: cod.encode(textoDoReporte(r)) },
    { nome: `${pasta}/reporte.json`, dados: cod.encode(JSON.stringify(json, null, 2)) },
  ]
  for (const [i, img] of r.imagens.entries()) {
    arquivos.push({ nome: `${pasta}/imagem-${i + 1}.jpg`, dados: new Uint8Array(await img.arrayBuffer()) })
  }
  return arquivos
}

/** Um .zip com os reportes escolhidos (um ou todos). */
export async function zipDosReportes(rs: readonly Reporte[]): Promise<Blob> {
  const arquivos = (await Promise.all(rs.map(arquivosDoReporte))).flat()
  return new Blob([montarZip(arquivos)], { type: 'application/zip' })
}

/** Só para os testes: fecha e apaga o banco. */
export async function _limparBancoDeReportes() {
  await db().delete()
  banco = null
}

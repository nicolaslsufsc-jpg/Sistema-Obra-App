// Base do painel de Projetos: a lista vigente e a distribuição de cópias que a pessoa importa no app.
// Fica no banco do navegador (tabela meta), fora da fila e do .obra: é dado da obra que se reimporta
// quando muda (o "atalho" aprovado pelo Nicolas em 14/11/2026, sem mexer no núcleo).
import { banco } from '../nucleo/servicos'
import { distribuicaoDeLinhas, ErroDeArquivo, lerDistribuicao, lerVigentes, type Copia, type Vigente } from './painel'
import { linhasDaFichaXlsx } from './planilha_xlsx'
import { lerIndiceEscritorio } from './canteiro'
import type { RegistroEscritorio } from './edicoes'
import { dataLocal } from './regras'

export interface BaseProjetos {
  vigentes: Vigente[]
  copias: Copia[]
  vigentesArquivo?: string
  vigentesImportadaEm?: string
  copiasArquivo?: string
  copiasImportadaEm?: string
  /** a revisão de cada folha na pasta do escritório, pelo índice de pranchas do PC (chave = chaveFolha) */
  escritorioIndice?: Record<string, RegistroEscritorio>
  escritorioArquivo?: string
  escritorioImportadoEm?: string
}

const chave = (obraId: string) => `projetos_base:${obraId}`

export async function lerBase(obraId: string): Promise<BaseProjetos | null> {
  return (await banco.lerMeta<BaseProjetos>(chave(obraId))) ?? null
}

/** Importa um ou os dois arquivos. O que não veio continua como estava. Erro de formato: nada muda. */
export async function importarBase(
  obraId: string,
  arquivos: { vigentes?: File | null; distribuicao?: File | null; escritorio?: File | null },
  agora = new Date(),
): Promise<BaseProjetos> {
  const atual = (await lerBase(obraId)) ?? { vigentes: [], copias: [] }
  const nova: BaseProjetos = { ...atual }
  if (arquivos.vigentes) {
    nova.vigentes = lerVigentes(await textoDe(arquivos.vigentes))
    nova.vigentesArquivo = arquivos.vigentes.name
    nova.vigentesImportadaEm = agora.toISOString()
  }
  if (arquivos.distribuicao) {
    nova.copias = await lerArquivoDistribuicao(arquivos.distribuicao)
    nova.copiasArquivo = arquivos.distribuicao.name
    nova.copiasImportadaEm = agora.toISOString()
  }
  if (arquivos.escritorio) {
    let indice: Map<string, RegistroEscritorio>
    try {
      indice = lerIndiceEscritorio(await textoDe(arquivos.escritorio), dataLocal(agora))
    } catch (e) {
      throw new ErroDeArquivo((e as Error).message)
    }
    if (indice.size === 0) throw new ErroDeArquivo('O índice do escritório não tem nenhuma prancha com código do Autodoc (OBRA.DISC.FASE.NUM.NOME-RNN).')
    nova.escritorioIndice = Object.fromEntries(indice)
    nova.escritorioArquivo = arquivos.escritorio.name
    nova.escritorioImportadoEm = agora.toISOString()
  }
  await banco.gravarMeta(chave(obraId), nova)
  return nova
}

/**
 * Base que vem junto com o pacote da obra (pasta `projetos/` dentro de dados_obra): quem abre o app
 * pela primeira vez já vê o painel, sem procurar arquivo. Só entra quando o aparelho ainda não tem base
 * desta obra: depois disso vale o que a pessoa importar. Dado da obra, nunca código.
 *   dados_obra/projetos/vigentes.csv       a lista vigente
 *   dados_obra/projetos/distribuicao.csv   a distribuição de cópias
 */
export async function baseDoPacote(obraId: string, buscar: typeof fetch = fetch, agora = new Date()): Promise<BaseProjetos | null> {
  // o endereço da pasta do pacote desta obra (gravado pelo núcleo ao abrir a obra pelo pacote)
  const pacote = await banco.lerMeta<{ raiz?: unknown }>(`pacote_obra:${obraId}`)
  const raiz = typeof pacote?.raiz === 'string' && /^https?:\/\//.test(pacote.raiz) ? pacote.raiz : null
  if (!raiz) return null
  const ler = async (nome: string) => {
    try {
      const r = await buscar(new URL('projetos/' + nome, raiz.endsWith('/') ? raiz : raiz + '/').href, { cache: 'no-store' })
      return r.ok ? await textoDe(await r.blob()) : null
    } catch {
      return null
    }
  }
  const [tv, td] = await Promise.all([ler('vigentes.csv'), ler('distribuicao.csv')])
  if (!tv || !td) return null
  try {
    const nova: BaseProjetos = {
      vigentes: lerVigentes(tv),
      copias: lerDistribuicao(td),
      vigentesArquivo: 'pacote da obra',
      vigentesImportadaEm: agora.toISOString(),
      copiasArquivo: 'pacote da obra',
      copiasImportadaEm: agora.toISOString(),
    }
    await banco.gravarMeta(chave(obraId), nova)
    return nova
  } catch {
    return null
  }
}

/** A base guardada; se ainda não há, a que veio com o pacote da obra (se veio). */
export async function lerBaseOuDoPacote(obraId: string): Promise<BaseProjetos | null> {
  return (await lerBase(obraId)) ?? (await baseDoPacote(obraId))
}

/** A ficha de distribuição em CSV ou em .xlsx (a ficha do Excel como está, primeira aba). */
export async function lerArquivoDistribuicao(f: Blob & { name?: string }): Promise<Copia[]> {
  const bytes = new Uint8Array(await f.arrayBuffer())
  const ehZip = bytes[0] === 0x50 && bytes[1] === 0x4b // "PK": .xlsx é um .zip
  if (ehZip || /\.xlsx$/i.test(f.name ?? '')) {
    try {
      return distribuicaoDeLinhas(await linhasDaFichaXlsx(bytes))
    } catch (e) {
      if (e instanceof ErroDeArquivo) throw e
      throw new ErroDeArquivo(`Não consegui ler a ficha .xlsx: ${(e as Error).message}`)
    }
  }
  return lerDistribuicao(await textoDe(f))
}

/** UTF-8 (com ou sem BOM); se vier estragado, tenta o Windows-1252 do Excel. */
async function textoDe(f: Blob): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer())
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

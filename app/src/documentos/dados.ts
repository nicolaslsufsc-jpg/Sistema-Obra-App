// Leitura e registro do módulo Documentos no aparelho.
//
// Desde 20/11/2026 a tabela `doc_documentos` existe no servidor (20261120150000_documentos.sql) e está
// na lista sincronizada do núcleo: o módulo grava pelo `sincronizador.registrar`, nos dois modos.
// - Sem conta: a linha fica na fila do aparelho; o "Salvar arquivo" (.obra) leva e o "Restaurar" traz.
// - Com conta: a linha sobe ao servidor e desce para os outros aparelhos da obra.
// O arquivo (PDF ou foto) vai pelo próprio núcleo (`registrarArquivo`), como as fotos do Diário: antes
// do documento na fila, então chega ao servidor antes da linha que aponta para ele.
import type { Linha } from '../nucleo/banco_local'
import type { PapelNaObra } from '../nucleo/conta'
import { banco, cliente, sincronizador } from '../nucleo/servicos'
import { BUCKET_OBRAS } from '../config'
import { reduzirFoto } from '../fvs/dados'
import { sha256Hex } from '../fvs/pacote'
import { montarLigacoes, TABELAS_LIDAS, type Ligacoes, type LinhasLidas } from './ligacoes'
import { idDaConcretagemDeExemplo } from '../concreto/exemplo'
import { idsDosExemplos } from './exemplos'
import { apagarDoAparelho, baixarParaOffline, listarOffline, lerOffline, type ResultadoDoBaixar } from './offline'
import { comoAbrir, montarDocumentos, TABELA_DOCUMENTOS, type ComoAbrir, type Documento, type LinhaDocumento, nomeLimpo, recusaDoArquivo, tipoDoArquivo } from './regras'

export interface ArquivoDoc {
  id: string
  /** Onde o arquivo está no servidor (bucket `obras`), para baixar quando já saiu do aparelho. */
  caminho: string
  nome_original: string
  tipo: string
  tamanho: number
  /** SHA-256 gravado pelo núcleo no envio: o arquivo baixado do servidor tem que bater com ele. */
  hash: string
  /**
   * Onde os bytes estão: `aparelho` (ainda não enviado, ou sem conta), `offline` (baixado para usar sem
   * internet, offline.ts) ou `servidor` (só lá: abre com um toque e internet).
   */
  onde: 'aparelho' | 'offline' | 'servidor'
}

export interface DadosDocumentos {
  documentos: Documento[]
  arquivos: Map<string, ArquivoDoc>
  /** Soma dos arquivos guardados pelo núcleo no aparelho (bytes): os que vão no "Salvar arquivo" (.obra). */
  totalArquivos: number
  /** Só os baixados para usar offline (bytes). */
  totalOffline: number
  /** Registros da FVS, do Concreto e dos Relatórios (só leitura). */
  ligacoes: Ligacoes
}

/** Cadastrar e revisar: gestor e admin (como o "dados da obra" do Diário). */
export function podeCadastrar(papel: PapelNaObra): boolean {
  return papel === 'admin' || papel === 'gestor'
}

export async function carregar(obraId: string): Promise<DadosDocumentos> {
  const [linhas, arquivos, lidas, idDoExemplo, exemplos] = await Promise.all([
    sincronizador.linhas(TABELA_DOCUMENTOS, obraId),
    sincronizador.linhas('arquivos', obraId),
    Promise.all(TABELAS_LIDAS.map((t) => sincronizador.linhas(t, obraId))),
    idDaConcretagemDeExemplo(obraId),
    idsDosExemplos(obraId),
  ])
  const t: LinhasLidas = {}
  TABELAS_LIDAS.forEach((nome, i) => {
    t[nome] = lidas[i]
  })
  const documentos = montarDocumentos(linhas as LinhaDocumento[], exemplos)
  const usados = new Set(linhas.map((l) => l.arquivo_id).filter((x): x is string => typeof x === 'string'))
  const mapa = new Map<string, ArquivoDoc>()
  const offline = await listarOffline()
  let totalArquivos = 0
  let totalOffline = 0
  for (const a of arquivos) {
    if (!usados.has(a.id)) continue
    const local = (await banco.conteudos.where('id').equals(a.id).count()) > 0
    const onde: ArquivoDoc['onde'] = local ? 'aparelho' : offline.has(a.id) ? 'offline' : 'servidor'
    mapa.set(a.id, { id: a.id, caminho: String(a.caminho ?? ''), nome_original: nomeLimpo(String(a.nome_original ?? '')), tipo: String(a.tipo ?? ''), tamanho: Number(a.tamanho ?? 0), hash: String(a.hash ?? ''), onde })
    if (onde === 'aparelho') totalArquivos += Number(a.tamanho ?? 0)
    if (onde === 'offline') totalOffline += Number(a.tamanho ?? 0)
  }
  return { documentos, arquivos: mapa, totalArquivos, totalOffline, ligacoes: montarLigacoes(t, idDoExemplo) }
}

/** Foto é reduzida (como no Diário); PDF entra como está. Devolve o id da linha em `arquivos`. */
export async function guardarArquivo(obraId: string, usuarioId: string, arquivo: File): Promise<string> {
  // a tela já recusa, mas quem grava confere de novo: tipo da lista fechada e até 10 MB
  const recusa = recusaDoArquivo(arquivo.size, tipoDoArquivo(arquivo))
  if (recusa) throw new Error(recusa)
  const ehFoto = arquivo.type.startsWith('image/')
  const conteudo = ehFoto ? await reduzirFoto(arquivo) : arquivo
  const base = nomeLimpo(arquivo.name)
  const nome = ehFoto ? base.replace(/\.[^.]+$/, '') + '.jpg' : base
  const linha = await sincronizador.registrarArquivo(obraId, usuarioId, 'documentos', conteudo, nome)
  return linha.id
}

export function registrarDocumento(obraId: string, usuarioId: string, campos: Record<string, unknown>): Promise<Linha> {
  return sincronizador.registrar(TABELA_DOCUMENTOS, obraId, usuarioId, campos)
}

/** Baixa do servidor o arquivo que já saiu do aparelho (troca nos testes). */
type Baixador = (caminho: string) => Promise<ArrayBuffer | null>
let baixar: Baixador = async (caminho) => {
  const { data, error } = await cliente.storage.from(BUCKET_OBRAS).download(caminho)
  return error || !data ? null : data.arrayBuffer()
}
export function trocarBaixador(b: Baixador): void {
  baixar = b
}

/** O arquivo baixado do servidor não tem o tamanho ou o SHA-256 registrados: não abre (revisor, 20/11). */
export class ArquivoNaoConfere extends Error {
  constructor() {
    super('O arquivo baixado do servidor não é o que foi registrado (tamanho ou conferência diferentes). Não abri.')
    this.name = 'ArquivoNaoConfere'
  }
}

/**
 * Endereço do arquivo (blob:) e se ele pode abrir no navegador. O tipo do blob sai dos bytes
 * (comoAbrir), nunca do tipo gravado no registro. Quem chama devolve com URL.revokeObjectURL.
 * Ainda não enviado (ou sem conta): vem do aparelho. Já enviado: o núcleo tira os bytes do aparelho
 * depois do envio, então só vem do servidor com `doServidor` (a tela pede com um toque, para não gastar
 * internet com todas as revisões) e com internet. Sem o arquivo: null.
 * O que vem do servidor só abre se o tamanho e o SHA-256 baterem com a linha de `arquivos`
 * (gravados pelo núcleo no envio); se não baterem, lança ArquivoNaoConfere.
 */
export async function urlDoArquivo(
  arquivo: Pick<ArquivoDoc, 'id'> & Partial<Pick<ArquivoDoc, 'caminho' | 'tamanho' | 'hash'>>,
  doServidor = false,
): Promise<({ url: string } & ComoAbrir) | null> {
  const local = await banco.conteudos.get(arquivo.id)
  // ainda não enviado (ou sem conta) vem do aparelho; depois, o baixado para usar offline
  let bytes: ArrayBuffer | null = local?.bytes ?? (await lerOffline(arquivo.id))
  if (!bytes && doServidor && arquivo.caminho && navigator.onLine) {
    bytes = await baixar(arquivo.caminho).catch(() => null)
    if (bytes && (bytes.byteLength !== arquivo.tamanho || (await sha256Hex(bytes)) !== arquivo.hash)) throw new ArquivoNaoConfere()
  }
  if (!bytes) return null
  const como = comoAbrir(new Uint8Array(bytes.slice(0, 16)))
  return { url: URL.createObjectURL(new Blob([bytes], { type: como.tipo })), ...como }
}

/** Só os que estão só no servidor: os que dá para baixar para usar offline. */
export function paraBaixar(arquivos: readonly (ArquivoDoc | undefined)[]): ArquivoDoc[] {
  return arquivos.filter((a): a is ArquivoDoc => !!a && a.onde === 'servidor' && !!a.caminho)
}

/** Os baixados para usar offline (os que dá para apagar do aparelho). */
export function baixados(arquivos: readonly (ArquivoDoc | undefined)[]): ArquivoDoc[] {
  return arquivos.filter((a): a is ArquivoDoc => !!a && a.onde === 'offline')
}

/** "Baixar para usar offline": um documento ou a pasta inteira. Precisa de internet. */
export function baixarDocumentos(arquivos: readonly ArquivoDoc[], aoAndar?: (feitos: number, total: number) => void): Promise<ResultadoDoBaixar> {
  return baixarParaOffline(arquivos, (c) => baixar(c), aoAndar)
}

/** "Apagar do aparelho": o arquivo continua no servidor. */
export function apagarDocumentosDoAparelho(arquivos: readonly ArquivoDoc[]): Promise<number> {
  return apagarDoAparelho(arquivos.map((a) => a.id))
}

// Leitura e registro do módulo Documentos no aparelho.
//
// Primeira versão (09/11/2026): só no modo sem conta. A tabela `doc_documentos` ainda não existe
// no servidor (a migração é pendência do Nicolas), então ela não está na lista de tabelas
// sincronizadas do núcleo e o módulo grava a linha do jeito do núcleo (registro local + fila de
// pendentes), para o "Salvar arquivo" (.obra) levar e o "Restaurar" trazer de volta.
// O arquivo (PDF ou foto) vai pelo próprio núcleo (`registrarArquivo`), como as fotos do Diário.
// Quando a migração existir: pôr `doc_documentos` em nucleo/tabelas.ts e trocar `gravarLinha`
// por `sincronizador.registrar`.
import type { BancoLocal, Linha } from '../nucleo/banco_local'
import type { PapelNaObra } from '../nucleo/conta'
import { ehModoLocal } from '../nucleo/local'
import { banco, sincronizador } from '../nucleo/servicos'
import { reduzirFoto } from '../fvs/dados'
import { gravarLinha } from './gravar'
import { montarLigacoes, TABELAS_LIDAS, type Ligacoes, type LinhasLidas } from './ligacoes'
import { idDaConcretagemDeExemplo } from '../concreto/exemplo'
import { idsDosExemplos } from './exemplos'
import { comoAbrir, montarDocumentos, TABELA_DOCUMENTOS, type ComoAbrir, type Documento, type LinhaDocumento, nomeLimpo, recusaDoArquivo, tipoDoArquivo } from './regras'

export interface ArquivoDoc {
  id: string
  nome_original: string
  tipo: string
  tamanho: number
}

export interface DadosDocumentos {
  documentos: Documento[]
  arquivos: Map<string, ArquivoDoc>
  /** Soma dos arquivos dos documentos no aparelho (bytes). */
  totalArquivos: number
  /** Registros da FVS, do Concreto e dos Relatórios (só leitura). */
  ligacoes: Ligacoes
}

/** Cadastrar e revisar: gestor e admin (como o "dados da obra" do Diário). */
export function podeCadastrar(papel: PapelNaObra): boolean {
  return papel === 'admin' || papel === 'gestor'
}

export function moduloDisponivel(b: BancoLocal = banco): Promise<boolean> {
  return ehModoLocal(b)
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
  let totalArquivos = 0
  for (const a of arquivos) {
    if (!usados.has(a.id)) continue
    mapa.set(a.id, { id: a.id, nome_original: nomeLimpo(String(a.nome_original ?? '')), tipo: String(a.tipo ?? ''), tamanho: Number(a.tamanho ?? 0) })
    totalArquivos += Number(a.tamanho ?? 0)
  }
  return { documentos, arquivos: mapa, totalArquivos, ligacoes: montarLigacoes(t, idDoExemplo) }
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
  return gravarLinha(banco, obraId, usuarioId, campos)
}

/**
 * Endereço do arquivo no aparelho (blob:) e se ele pode abrir no navegador. O tipo do blob sai dos
 * bytes (comoAbrir), nunca do tipo gravado no registro. Quem chama devolve com URL.revokeObjectURL.
 */
export async function urlDoArquivo(arquivo: Pick<ArquivoDoc, 'id'>): Promise<({ url: string } & ComoAbrir) | null> {
  const local = await banco.conteudos.get(arquivo.id)
  if (!local) return null
  const como = comoAbrir(new Uint8Array(local.bytes.slice(0, 16)))
  return { url: URL.createObjectURL(new Blob([local.bytes], { type: como.tipo })), ...como }
}

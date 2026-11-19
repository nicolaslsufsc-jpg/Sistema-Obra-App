// Regras do módulo Documentos (sem tela e sem banco, para testar sozinhas).
//
// Cada linha de `doc_documentos` é uma revisão de um documento. Só inclusão:
// - revisão nova = linha nova com o mesmo código (e escopo); a anterior vira obsoleta sozinha;
// - corrigir, marcar "em revisão" ou cancelar = linha nova com substitui_id (vale a que ninguém substituiu).
import { vigentes, type Corrigivel, type Vigente } from '../concreto/vigentes'
import { ordemDaCategoria, type Escopo } from './categorias'

export const TABELA_DOCUMENTOS = 'doc_documentos'
/** Maior arquivo aceito (PDF ou foto). */
export const LIMITE_ARQUIVO = 10 * 1024 * 1024
/** Acima disto, o módulo avisa que os arquivos estão pesando no aparelho e no salvamento. */
export const AVISO_TOTAL = 150 * 1024 * 1024
/** "Vence em X dias" aparece a partir de quantos dias antes. */
export const DIAS_DE_AVISO = 30

export type Situacao = 'vigente' | 'em_revisao'
export type Status = Situacao | 'obsoleto'

export interface LinhaDocumento extends Corrigivel {
  escopo: Escopo
  categoria: string
  codigo: string
  titulo: string
  revisao: string
  data_revisao: string
  validade: string | null
  responsavel: string
  situacao: Situacao
  arquivo_id: string | null
  observacao: string | null
}

export type Revisao = Vigente<LinhaDocumento>

export interface Documento {
  chave: string
  escopo: Escopo
  categoria: string
  codigo: string
  /** A revisão que vale (a mais nova). */
  atual: Revisao
  /** As revisões anteriores, da mais nova para a mais antiga: todas obsoletas. */
  anteriores: Revisao[]
  /** Documento de exemplo da demonstração (exemplos.ts): marcado na tela, fora da impressão e dos avisos. */
  exemplo: boolean
}

export const COLUNAS_DOCUMENTO = ['escopo', 'categoria', 'codigo', 'titulo', 'revisao', 'data_revisao', 'validade', 'responsavel', 'situacao', 'arquivo_id', 'observacao', 'substitui_id', 'cancelado'] as const

export const chaveDoDocumento = (escopo: string, codigo: string) => `${escopo}:${codigo.trim().toUpperCase()}`

const ordemTexto = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

/** A mais nova primeiro: pela data da revisão, depois pela hora em que foi registrada. */
function maisNovaPrimeiro(a: Revisao, b: Revisao): number {
  if (a.data_revisao !== b.data_revisao) return a.data_revisao > b.data_revisao ? -1 : 1
  if (a.criado_em_dispositivo !== b.criado_em_dispositivo) return a.criado_em_dispositivo > b.criado_em_dispositivo ? -1 : 1
  return a.id > b.id ? -1 : 1
}

/** Os documentos (cada um com as revisões), em ordem de categoria e código. */
export function montarDocumentos(linhas: readonly LinhaDocumento[], idsDeExemplo: ReadonlySet<string> = new Set()): Documento[] {
  const grupos = new Map<string, Revisao[]>()
  for (const r of vigentes(linhas)) {
    const chave = chaveDoDocumento(r.escopo, r.codigo)
    const g = grupos.get(chave)
    if (g) g.push(r)
    else grupos.set(chave, [r])
  }
  const docs: Documento[] = []
  for (const [chave, revs] of grupos) {
    revs.sort(maisNovaPrimeiro)
    const [atual, ...anteriores] = revs
    // vale a revisão que está valendo: revisão nova feita aqui sobre um exemplo já é documento de verdade
    const exemplo = (atual as { exemplo?: unknown }).exemplo === true || idsDeExemplo.has(atual.raiz)
    docs.push({ chave, escopo: atual.escopo, categoria: atual.categoria, codigo: atual.codigo, atual, anteriores, exemplo })
  }
  return docs.sort((a, b) => ordemDaCategoria(a.categoria) - ordemDaCategoria(b.categoria) || ordemTexto.compare(a.codigo, b.codigo))
}

export function statusDaRevisao(doc: Documento, rev: Revisao): Status {
  if (rev.raiz !== doc.atual.raiz) return 'obsoleto'
  return rev.situacao === 'em_revisao' ? 'em_revisao' : 'vigente'
}

export const NOME_DO_STATUS: Record<Status, string> = { vigente: 'Vigente', em_revisao: 'Em revisão', obsoleto: 'Obsoleto' }

/** Dias de `de` até `ate` (datas AAAA-MM-DD). */
export function diasEntre(de: string, ate: string): number {
  const d = (s: string) => {
    const [a, m, dia] = s.slice(0, 10).split('-').map(Number)
    return Date.UTC(a, m - 1, dia)
  }
  return Math.round((d(ate) - d(de)) / 86_400_000)
}

export type Validade = { tipo: 'sem' } | { tipo: 'ok' } | { tipo: 'vence'; dias: number } | { tipo: 'vencido'; dias: number }

/** Situação da validade do documento hoje. Obsoleto não avisa. */
export function validadeDe(doc: Documento, hoje: string, aviso = DIAS_DE_AVISO): Validade {
  const v = doc.atual.validade
  if (!v) return { tipo: 'sem' }
  const dias = diasEntre(hoje, v)
  if (dias < 0) return { tipo: 'vencido', dias: -dias }
  if (dias <= aviso) return { tipo: 'vence', dias }
  return { tipo: 'ok' }
}

export type FiltroStatus = 'todos' | 'vencidos' | 'em_revisao'

export interface Filtro {
  escopo: Escopo
  categoria: string | null
  status: FiltroStatus
  busca?: string
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function filtrar(docs: readonly Documento[], f: Filtro, hoje: string): Documento[] {
  const busca = semAcento(f.busca?.trim() ?? '')
  return docs.filter((d) => {
    if (d.escopo !== f.escopo) return false
    if (f.categoria && d.categoria !== f.categoria) return false
    if (f.status === 'vencidos' && validadeDe(d, hoje).tipo !== 'vencido') return false
    if (f.status === 'em_revisao' && d.atual.situacao !== 'em_revisao') return false
    if (busca && !semAcento(`${d.codigo} ${d.atual.titulo} ${d.atual.responsavel}`).includes(busca)) return false
    return true
  })
}

export function contarVencidos(docs: readonly Documento[], hoje: string): { vencidos: number; vencendo: number } {
  let vencidos = 0
  let vencendo = 0
  for (const d of docs) {
    if (d.exemplo) continue
    const v = validadeDe(d, hoje)
    if (v.tipo === 'vencido') vencidos++
    else if (v.tipo === 'vence') vencendo++
  }
  return { vencidos, vencendo }
}

export interface Rascunho {
  escopo: string
  categoria: string
  codigo: string
  titulo: string
  revisao: string
  data_revisao: string
  validade: string
  responsavel: string
  situacao: string
  observacao: string
}

/** Confere o formulário. `outros` = os documentos que já existem (código repetido não pode, salvo na revisão nova). */
export function conferirRascunho(r: Rascunho, outros: readonly Documento[], chaveDaRevisao?: string): Record<string, string> {
  const erros: Record<string, string> = {}
  if (r.escopo !== 'empresa' && r.escopo !== 'obra') erros.escopo = 'Escolha Empresa ou Obra.'
  if (!r.categoria) erros.categoria = 'Escolha a categoria.'
  if (!r.codigo.trim()) erros.codigo = 'Informe o código.'
  else if (r.codigo.trim().length > 40) erros.codigo = 'Código com até 40 letras.'
  if (!r.titulo.trim()) erros.titulo = 'Informe o título.'
  if (!r.revisao.trim()) erros.revisao = 'Informe a revisão (ex.: 00).'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.data_revisao)) erros.data_revisao = 'Informe a data da revisão.'
  if (r.validade && !/^\d{4}-\d{2}-\d{2}$/.test(r.validade)) erros.validade = 'Data inválida.'
  else if (r.validade && r.data_revisao && r.validade < r.data_revisao) erros.validade = 'A validade é antes da data da revisão.'
  if (!r.responsavel.trim()) erros.responsavel = 'Informe o responsável.'
  const chave = chaveDoDocumento(r.escopo, r.codigo)
  if (!erros.codigo && chave !== chaveDaRevisao && outros.some((d) => d.chave === chave)) {
    erros.codigo = 'Já existe um documento com este código. Para mudar, abra ele e use "Revisão nova".'
  }
  if (chaveDaRevisao) {
    const doc = outros.find((d) => d.chave === chaveDaRevisao)
    if (doc && !erros.revisao && doc.atual.revisao.trim().toUpperCase() === r.revisao.trim().toUpperCase()) erros.revisao = `A revisão ${doc.atual.revisao} já existe.`
  }
  return erros
}

/** Os campos que vão para o banco (sem as colunas do núcleo). */
export function camposDoRascunho(r: Rascunho, arquivoId: string | null): Omit<LinhaDocumento, 'id' | 'obra_id' | 'usuario_id' | 'dispositivo_id' | 'criado_em_dispositivo' | 'apagado'> {
  return {
    escopo: r.escopo as Escopo,
    categoria: r.categoria,
    codigo: r.codigo.trim(),
    titulo: r.titulo.trim(),
    revisao: r.revisao.trim(),
    data_revisao: r.data_revisao,
    validade: r.validade || null,
    responsavel: r.responsavel.trim(),
    situacao: r.situacao === 'em_revisao' ? 'em_revisao' : 'vigente',
    arquivo_id: arquivoId,
    observacao: r.observacao.trim() || null,
    substitui_id: null,
    cancelado: false,
  }
}

export function tamanhoEmTexto(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

/**
 * Tipos aceitos. Lista fechada: `image/*` deixava passar SVG, que pode levar script (Revisor, 09/11/2026).
 * Mudou aqui, mude TIPOS_DOC do pipeline/fvs/exportar_bancada.py.
 */
export const TIPOS_ACEITOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const
/** O `accept` do seletor de arquivo (o .heic às vezes chega sem tipo). */
export const ACEITAR_NO_SELETOR = [...TIPOS_ACEITOS, '.heic'].join(',')

/** Tipo do arquivo escolhido; HEIC vindo sem tipo (alguns Androids) é reconhecido pelo nome. */
export function tipoDoArquivo(f: { type: string; name: string }): string {
  if (f.type) return f.type
  return /\.heic$/i.test(f.name) ? 'image/heic' : 'application/octet-stream'
}

/** O arquivo pode entrar? Devolve a mensagem de recusa ou null. Vale para PDF e para foto (antes de reduzir). */
export function recusaDoArquivo(tamanho: number, tipo: string): string | null {
  if (!(TIPOS_ACEITOS as readonly string[]).includes(tipo)) return 'Só PDF ou foto (JPG, PNG, WEBP ou HEIC).'
  if (tamanho > LIMITE_ARQUIVO) return `Arquivo de ${tamanhoEmTexto(tamanho)}: o limite é ${tamanhoEmTexto(LIMITE_ARQUIVO)}.`
  return null
}

export type ComoAbrir =
  | { abrir: true; tipo: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic'; foto: boolean }
  | { abrir: false; tipo: 'application/octet-stream'; foto: false }

const comeca = (b: Uint8Array, sinal: readonly number[], de = 0) => b.length >= de + sinal.length && sinal.every((x, i) => b[de + i] === x)
const ascii = (t: string) => [...t].map((c) => c.charCodeAt(0))

/**
 * Como abrir um arquivo guardado, pelo que ele É (os primeiros bytes), e não pelo tipo gravado: um .obra
 * restaurado pode trazer um registro dizendo "PDF" com HTML ou SVG dentro. PDF só com %PDF; foto só com
 * a assinatura de JPEG, PNG, WEBP ou HEIC. O resto nunca abre no navegador: só é baixado.
 */
export function comoAbrir(inicio: Uint8Array): ComoAbrir {
  if (comeca(inicio, ascii('%PDF'))) return { abrir: true, tipo: 'application/pdf', foto: false }
  if (comeca(inicio, [0xff, 0xd8, 0xff])) return { abrir: true, tipo: 'image/jpeg', foto: true }
  if (comeca(inicio, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { abrir: true, tipo: 'image/png', foto: true }
  if (comeca(inicio, ascii('RIFF')) && comeca(inicio, ascii('WEBP'), 8)) return { abrir: true, tipo: 'image/webp', foto: true }
  if (comeca(inicio, ascii('ftyp'), 4) && ['heic', 'heix', 'heim', 'heis', 'mif1', 'msf1'].some((m) => comeca(inicio, ascii(m), 8))) {
    return { abrir: true, tipo: 'image/heic', foto: true }
  }
  return { abrir: false, tipo: 'application/octet-stream', foto: false }
}

/**
 * Nome de arquivo para guardar e mostrar: sem pasta, sem caractere de controle nem de inverter o
 * texto (U+202E faz "fdp.exe" parecer "exe.pdf"), sem os proibidos no Windows, até 120 caracteres
 * com a extensão. Vale para o que vem do seletor, do pacote da obra e do .obra restaurado.
 */
export function nomeLimpo(nome: string): string {
  const semPasta = String(nome ?? '').split(/[\\/]/).pop() ?? ''
  const limpo = semPasta
    .replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '')
  if (!limpo) return 'arquivo'
  if (limpo.length <= 120) return limpo
  const ext = /\.[a-z0-9]{1,8}$/i.exec(limpo)?.[0] ?? ''
  return limpo.slice(0, 120 - ext.length) + ext
}

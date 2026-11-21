// IFCs da obra: o gestor envia pelo app, cada aparelho baixa para usar sem internet.
//
// Sem tabela nova e sem mudar o núcleo (proposta aprovada pelo Professor em 20/11/2026):
// - O IFC sobe comprimido (gzip) e cortado em partes de até 40 MB (o plano gratuito do Supabase
//   aceita no máximo 50 MB por arquivo). Cada parte é um arquivo do núcleo (`registrarArquivo`,
//   módulo `ifc`): caminho `{obra}/ifc/{id}`, uma linha em `arquivos`.
// - O `nome_original` diz de qual envio e qual parte é: "Torre.ifc (parte 1 de 2, envio 3f2a9c1e)".
//   As partes do mesmo envio se juntam pela lista de `arquivos`, que já desce para todos os aparelhos.
// - Baixar: cada parte é conferida pelo tamanho e pelo SHA-256 da linha, as partes se juntam, o gzip
//   abre e o IFC passa pelo leitor de sempre, que guarda o modelo convertido no aparelho (OPFS).
//   O aparelho lembra qual envio virou qual modelo guardado (só neste aparelho).
// - Arquivo do núcleo é imutável: envio novo não apaga o velho; a lista mostra só o mais novo de
//   cada nome. Limpeza do servidor, pelo painel do Supabase.
import { sha256Hex } from '../fvs/pacote'
import { idDoArquivo } from './motor/guardados'
import type { Sessao } from './sessao'

/** Tamanho máximo de cada parte no servidor (o limite do plano gratuito é 50 MB por arquivo). */
export const PARTE_MAX = 40 * 1024 * 1024
/** Até 10 partes (400 MB comprimidos): o armazenamento gratuito inteiro é 1 GB. */
export const MAX_PARTES = 10

/** Linha de `arquivos` como chega do banco local. */
export interface LinhaArquivo {
  id: string
  caminho?: unknown
  nome_original?: unknown
  hash?: unknown
  tamanho?: unknown
  criado_em_servidor?: unknown
  criado_em_dispositivo?: unknown
}

export interface ParteIfc {
  id: string
  caminho: string
  hash: string
  tamanho: number
  numero: number
}

export interface IfcDaObra {
  /** Código do envio (8 letras): junta as partes. */
  envio: string
  nome: string
  partes: ParteIfc[]
  /** Quantas partes o envio tem; menos que isso na lista = ainda subindo. */
  total: number
  completo: boolean
  /** Bytes a baixar (comprimidos). */
  tamanho: number
  criado: string
}

/** De onde vêm e para onde vão as partes. O app usa o servidor; a bancada e os testes, uma de mentira. */
export interface FonteIfcs {
  listar(): Promise<LinhaArquivo[]>
  bytesDaParte(p: ParteIfc, aoBytes: (recebidos: number) => void): Promise<Blob>
  enviarParte(conteudo: Blob, nomeOriginal: string): Promise<void>
}

const RE_PARTE = /^(.+) \(parte (\d{1,3}) de (\d{1,3}), envio ([0-9a-f]{8})\)$/

export function nomeDaParte(nome: string, numero: number, total: number, envio: string): string {
  return `${nome} (parte ${numero} de ${total}, envio ${envio})`
}

export function lerNomeDaParte(s: string): { nome: string; numero: number; total: number; envio: string } | null {
  const m = RE_PARTE.exec(s)
  if (!m) return null
  const numero = Number(m[2])
  const total = Number(m[3])
  if (numero < 1 || total < 1 || numero > total || total > MAX_PARTES) return null
  return { nome: m[1], numero, total, envio: m[4] }
}

/**
 * Junta as linhas de `arquivos` da obra em IFCs: só as do módulo ifc com nome de parte válido,
 * sem parte repetida. De cada nome, fica o envio completo mais novo (o incompleto mais novo também
 * aparece, se for mais novo que o completo: é o que está subindo).
 */
export function montarLista(linhas: readonly LinhaArquivo[], obraId: string): IfcDaObra[] {
  const prefixo = `${obraId}/ifc/`
  const envios = new Map<string, IfcDaObra>()
  for (const l of linhas) {
    const caminho = String(l.caminho ?? '')
    if (!caminho.startsWith(prefixo)) continue
    const p = lerNomeDaParte(String(l.nome_original ?? ''))
    if (!p) continue
    const criado = String(l.criado_em_servidor ?? l.criado_em_dispositivo ?? '')
    let e = envios.get(p.envio)
    if (!e) {
      e = { envio: p.envio, nome: p.nome, partes: [], total: p.total, completo: false, tamanho: 0, criado }
      envios.set(p.envio, e)
    }
    if (e.nome !== p.nome || e.total !== p.total) continue
    if (e.partes.some((x) => x.numero === p.numero)) continue
    const tamanho = Number(l.tamanho ?? 0)
    e.partes.push({ id: l.id, caminho, hash: String(l.hash ?? ''), tamanho, numero: p.numero })
    e.tamanho += tamanho
    if (criado > e.criado) e.criado = criado
  }
  const porNome = new Map<string, IfcDaObra[]>()
  for (const e of envios.values()) {
    e.partes.sort((a, b) => a.numero - b.numero)
    e.completo = e.partes.length === e.total
    porNome.set(e.nome, [...(porNome.get(e.nome) ?? []), e])
  }
  const r: IfcDaObra[] = []
  for (const lista of porNome.values()) {
    lista.sort((a, b) => (a.criado < b.criado ? 1 : -1))
    const completo = lista.find((e) => e.completo)
    if (lista[0] !== completo) r.push(lista[0])
    if (completo) r.push(completo)
  }
  return r.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || (a.criado < b.criado ? 1 : -1))
}

/** Comprime e corta em partes. Recusa o que não couber em MAX_PARTES. */
export async function partirIfc(arquivo: Blob): Promise<Blob[]> {
  const comprimido = await new Response(arquivo.stream().pipeThrough(new CompressionStream('gzip'))).blob()
  const n = Math.max(1, Math.ceil(comprimido.size / PARTE_MAX))
  if (n > MAX_PARTES) throw new Error(`Arquivo grande demais para o servidor (${Math.round(comprimido.size / 1e6)} MB comprimido; o máximo é ${Math.round((MAX_PARTES * PARTE_MAX) / 1e6)} MB). Envie por pavimento.`)
  const partes: Blob[] = []
  for (let i = 0; i < n; i++) partes.push(comprimido.slice(i * PARTE_MAX, (i + 1) * PARTE_MAX, 'application/gzip'))
  return partes
}

/** Junta as partes e abre o gzip: o IFC de volta. */
export async function juntarIfc(partes: readonly Blob[]): Promise<Blob> {
  return new Response(new Blob([...partes]).stream().pipeThrough(new DecompressionStream('gzip'))).blob()
}

export class ParteNaoConfere extends Error {
  constructor(numero: number) {
    super(`A parte ${numero} baixada não é a que foi enviada (tamanho ou conferência diferentes). Tente baixar de novo.`)
    this.name = 'ParteNaoConfere'
  }
}

export interface Baixando {
  fase: string
  /** 0 a 1. */
  fracao: number
}

const chaveBaixados = (obraId: string) => `ifc.baixados.${obraId}`

function lerBaixados(obraId: string): Record<string, string> {
  try {
    const t = localStorage.getItem(chaveBaixados(obraId))
    const v = t ? (JSON.parse(t) as unknown) : null
    return v && typeof v === 'object' ? (v as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function gravarBaixados(obraId: string, v: Record<string, string>): void {
  try {
    localStorage.setItem(chaveBaixados(obraId), JSON.stringify(v))
  } catch {
    // modo privado: o modelo continua guardado; só a ligação com o envio se perde
  }
}

/** Estado da lista "IFCs da obra". A tela só lê daqui e chama estes métodos. */
export class IfcsDaObra {
  itens: IfcDaObra[] = []
  baixando = new Map<string, Baixando>()
  /** Envio → id do modelo guardado neste aparelho. */
  baixados: Record<string, string>
  enviando: Baixando | null = null
  carregou = false
  private ouvintes = new Set<() => void>()

  constructor(
    private fonte: FonteIfcs,
    private obraId: string,
    private sessao: Sessao,
  ) {
    this.baixados = lerBaixados(obraId)
  }

  assinar(f: () => void): () => void {
    this.ouvintes.add(f)
    return () => this.ouvintes.delete(f)
  }

  private avisar(): void {
    for (const f of this.ouvintes) f()
  }

  async atualizar(): Promise<void> {
    try {
      this.itens = montarLista(await this.fonte.listar(), this.obraId)
    } catch (e) {
      this.sessao.avisarUsuario(`Não consegui ler a lista de IFCs da obra: ${e instanceof Error ? e.message : String(e)}`)
    }
    this.carregou = true
    this.avisar()
  }

  /** Id do modelo guardado deste envio, se ainda estiver no aparelho. */
  guardadoDe(item: IfcDaObra): string | null {
    const id = this.baixados[item.envio]
    return id && this.sessao.guardados.some((g) => g.id === id) ? id : null
  }

  async baixar(item: IfcDaObra): Promise<void> {
    if (this.baixando.has(item.envio) || !item.completo) return
    const marcar = (fase: string, fracao: number) => {
      this.baixando.set(item.envio, { fase, fracao })
      this.avisar()
    }
    marcar('Baixando', 0)
    try {
      const blobs: Blob[] = []
      let antes = 0
      for (const p of item.partes) {
        const blob = await this.fonte.bytesDaParte(p, (n) => marcar('Baixando', (0.9 * (antes + n)) / item.tamanho))
        if (blob.size !== p.tamanho || (await sha256Hex(await blob.arrayBuffer())) !== p.hash) throw new ParteNaoConfere(p.numero)
        blobs.push(blob)
        antes += p.tamanho
      }
      marcar('Abrindo o arquivo', 0.92)
      const ifc = await juntarIfc(blobs)
      const quando = Date.parse(item.criado)
      const arquivo = new File([ifc], item.nome, { lastModified: Number.isFinite(quando) ? quando : 0 })
      const id = idDoArquivo(arquivo)
      marcar('Convertendo', 0.95)
      await this.sessao.abrirArquivos([arquivo])
      if (this.sessao.guardados.some((g) => g.id === id)) {
        this.baixados = { ...this.baixados, [item.envio]: id }
        gravarBaixados(this.obraId, this.baixados)
      } else {
        this.sessao.avisarUsuario(`"${item.nome}" abriu, mas não coube no armazenamento deste aparelho: sem internet ele não vai abrir. Libere espaço e baixe de novo.`)
      }
    } catch (e) {
      this.sessao.avisarUsuario(`Não consegui baixar "${item.nome}": ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      this.baixando.delete(item.envio)
      this.avisar()
    }
  }

  async abrir(item: IfcDaObra): Promise<void> {
    const id = this.guardadoDe(item)
    if (id) await this.sessao.abrirDoAparelho(id)
  }

  async apagar(item: IfcDaObra): Promise<void> {
    const id = this.baixados[item.envio]
    if (id) {
      const aberto = this.sessao.modelos.find((m) => m.id === id)
      if (aberto) this.sessao.fechar(aberto.chave)
      await this.sessao.apagarDoAparelho(id)
    }
    const { [item.envio]: _, ...resto } = this.baixados
    this.baixados = resto
    gravarBaixados(this.obraId, resto)
    this.avisar()
  }

  /** Gestor e admin: comprime, corta e põe as partes na fila do núcleo (sobem na próxima sincronização). */
  async enviar(arquivo: File): Promise<boolean> {
    if (this.enviando) return false
    if (!arquivo.name.toLowerCase().endsWith('.ifc')) {
      this.sessao.avisarUsuario(`"${arquivo.name}" não é um IFC.`)
      this.avisar()
      return false
    }
    this.enviando = { fase: 'Comprimindo', fracao: 0.05 }
    this.avisar()
    try {
      const partes = await partirIfc(arquivo)
      const envio = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
      for (let i = 0; i < partes.length; i++) {
        this.enviando = { fase: `Preparando a parte ${i + 1} de ${partes.length}`, fracao: 0.1 + (0.9 * i) / partes.length }
        this.avisar()
        await this.fonte.enviarParte(partes[i], nomeDaParte(arquivo.name, i + 1, partes.length, envio))
      }
      await this.atualizar()
      return true
    } catch (e) {
      this.sessao.avisarUsuario(`Não consegui enviar "${arquivo.name}": ${e instanceof Error ? e.message : String(e)}`)
      return false
    } finally {
      this.enviando = null
      this.avisar()
    }
  }
}

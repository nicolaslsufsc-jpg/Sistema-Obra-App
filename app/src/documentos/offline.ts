// Documentos para usar sem internet: baixar é opcional, por documento ou por pasta (categoria).
//
// Pedido do Nicolas (21/11/2026): "quero q seja opcional baixar projetos e ifcs docs e tals". Com conta,
// o núcleo tira os bytes do aparelho depois de enviar; o arquivo fica no servidor e abre com um toque e
// internet. Quem quer o arquivo na obra sem internet toca "Baixar para usar offline"; "Apagar do
// aparelho" devolve o espaço (o arquivo continua no servidor). Nada baixa sozinho.
//
// Onde fica: no Cache Storage do navegador, num cache só deste módulo (não é o banco do núcleo nem o
// cache do service worker). Cada arquivo baixado é conferido pelo tamanho e pelo SHA-256 da linha de
// `arquivos` antes de ser guardado, como no IFC (PR #53) e no "Baixar do servidor" de antes.
import { sha256Hex } from '../fvs/pacote'

/** Onde os bytes ficam. O app usa o Cache Storage; os testes, um Map. */
export interface GuardaOffline {
  ler(id: string): Promise<ArrayBuffer | null>
  gravar(id: string, bytes: ArrayBuffer): Promise<void>
  apagar(id: string): Promise<void>
  /** ids guardados e o tamanho de cada um */
  listar(): Promise<Map<string, number>>
}

const NOME_DO_CACHE = 'sistema-obra-documentos-offline'
/** Endereço de mentira só para a chave do cache: nunca é buscado na rede. */
const chave = (id: string) => `/__documentos_offline__/${encodeURIComponent(id)}`

const cacheStorage: GuardaOffline = {
  async ler(id) {
    const r = await (await caches.open(NOME_DO_CACHE)).match(chave(id))
    return r ? r.arrayBuffer() : null
  },
  async gravar(id, bytes) {
    await (await caches.open(NOME_DO_CACHE)).put(chave(id), new Response(bytes, { headers: { 'content-length': String(bytes.byteLength) } }))
  },
  async apagar(id) {
    await (await caches.open(NOME_DO_CACHE)).delete(chave(id))
  },
  async listar() {
    const c = await caches.open(NOME_DO_CACHE)
    const m = new Map<string, number>()
    for (const req of await c.keys()) {
      const id = decodeURIComponent(new URL(req.url).pathname.replace('/__documentos_offline__/', ''))
      const r = await c.match(req)
      m.set(id, Number(r?.headers.get('content-length') ?? 0))
    }
    return m
  },
}

/** Sem Cache Storage (navegador antigo, página sem https): não guarda nada e não quebra a tela. */
const nenhuma: GuardaOffline = {
  ler: async () => null,
  gravar: async () => {
    throw new Error('Este navegador não deixa guardar arquivos para usar sem internet.')
  },
  apagar: async () => {},
  listar: async () => new Map(),
}

let guarda: GuardaOffline = typeof caches === 'undefined' ? nenhuma : cacheStorage

/** Troca onde os bytes ficam (testes). */
export function trocarGuardaOffline(g: GuardaOffline): void {
  guarda = g
}

export interface ArquivoParaBaixar {
  id: string
  caminho: string
  tamanho: number
  hash: string
}

/** O arquivo baixado não é o registrado: não guarda (o mesmo aviso do "Baixar do servidor"). */
export class BaixadoNaoConfere extends Error {
  constructor(public readonly id: string) {
    super('O arquivo baixado do servidor não é o que foi registrado (tamanho ou conferência diferentes). Não guardei.')
    this.name = 'BaixadoNaoConfere'
  }
}

/** Confere tamanho e SHA-256 com a linha de `arquivos`. */
export async function confere(bytes: ArrayBuffer, a: Pick<ArquivoParaBaixar, 'tamanho' | 'hash'>): Promise<boolean> {
  return bytes.byteLength === a.tamanho && (await sha256Hex(bytes)) === a.hash
}

export function lerOffline(id: string): Promise<ArrayBuffer | null> {
  return guarda.ler(id).catch(() => null)
}

export function listarOffline(): Promise<Map<string, number>> {
  return guarda.listar().catch(() => new Map())
}

/** Guarda bytes já conferidos (o "Baixar do servidor" de um toque usa para não baixar duas vezes). */
export async function guardarConferido(a: ArquivoParaBaixar, bytes: ArrayBuffer): Promise<void> {
  if (!(await confere(bytes, a))) throw new BaixadoNaoConfere(a.id)
  await guarda.gravar(a.id, bytes)
}

export interface ResultadoDoBaixar {
  baixados: number
  /** já estavam no aparelho */
  pulados: number
  /** sem internet, erro do servidor ou não conferiu */
  falharam: number
  naoConferiram: number
}

/**
 * Baixa e guarda vários arquivos, um de cada vez (celular com pouca memória). O que já está guardado
 * é pulado. Um que falha não para os outros. `aoAndar` recebe quantos já foram, para a barra.
 */
export async function baixarParaOffline(
  arquivos: readonly ArquivoParaBaixar[],
  baixar: (caminho: string) => Promise<ArrayBuffer | null>,
  aoAndar?: (feitos: number, total: number) => void,
): Promise<ResultadoDoBaixar> {
  const ja = await listarOffline()
  const r: ResultadoDoBaixar = { baixados: 0, pulados: 0, falharam: 0, naoConferiram: 0 }
  let feitos = 0
  for (const a of arquivos) {
    if (ja.has(a.id)) r.pulados++
    else {
      const bytes = a.caminho ? await baixar(a.caminho).catch(() => null) : null
      if (!bytes) r.falharam++
      else if (!(await confere(bytes, a))) {
        r.falharam++
        r.naoConferiram++
      } else {
        try {
          await guarda.gravar(a.id, bytes)
          r.baixados++
        } catch {
          r.falharam++
        }
      }
    }
    aoAndar?.(++feitos, arquivos.length)
  }
  return r
}

/** Tira do aparelho (o arquivo continua no servidor). Devolve quantos saíram. */
export async function apagarDoAparelho(ids: readonly string[]): Promise<number> {
  const ja = await listarOffline()
  let n = 0
  for (const id of ids) {
    if (!ja.has(id)) continue
    await guarda.apagar(id)
    n++
  }
  return n
}

/** Texto do resultado, para a tela. */
export function textoDoResultado(r: ResultadoDoBaixar): string {
  const p: string[] = []
  if (r.baixados) p.push(`${r.baixados} ${r.baixados === 1 ? 'arquivo baixado' : 'arquivos baixados'}`)
  if (r.pulados) p.push(`${r.pulados} já ${r.pulados === 1 ? 'estava' : 'estavam'} no aparelho`)
  if (r.falharam) {
    p.push(
      r.naoConferiram
        ? `${r.falharam} não ${r.falharam === 1 ? 'baixou' : 'baixaram'} (${r.naoConferiram} não ${r.naoConferiram === 1 ? 'conferiu' : 'conferiram'} com o registro: avise o gestor)`
        : `${r.falharam} não ${r.falharam === 1 ? 'baixou' : 'baixaram'}: confira a internet e tente de novo`,
    )
  }
  return (p.join(' · ') || 'Nada para baixar') + '.'
}

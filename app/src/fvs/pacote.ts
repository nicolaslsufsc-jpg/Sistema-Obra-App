// Pacote de planta (pipeline/fvs/pacote.py): manifest.json + pacote.bin de um trecho.
// Fica guardado no aparelho num banco só da FVS, para a planta abrir sem internet.
// O banco do núcleo não é usado para isto (são megabytes de imagem, não registros).

import { lembrarComodo } from './comodos'
import { pecaDosFurosDeLaje } from './furos_laje'
import Dexie, { type Table } from 'dexie'
import type { BarraPacote, CamadaDeBarras } from './barras'
import type { DisciplinaDePontos, PontoPacote } from './pontos'

/** Tipos de parte do pilar que o pacote pode trazer (pipeline/fvs/pacote.py, TIPOS_DE_PARTE). */
export type TipoDeParte = 'consolo' | 'capitel'

export const NOME_DA_PARTE: Record<string, string> = { consolo: 'Consolo', capitel: 'Capitel' }

/** Consolo ou capitel (maciço) de um pilar: contorno na planta e, se houver, o detalhe dele. */
export interface ParteDoPilar {
  tipo: TipoDeParte
  polys: Array<Array<[number, number]>>
  /** chave em `detalhes` (imagem "d:CHAVE") */
  detalhe?: string
}

/** Furo de viga para as instalações (pipeline/fvs/furos.py), em cm como no modelo. */
export interface DadosDoFuro {
  forma: 'circular' | 'retangular'
  diametro?: number
  largura?: number
  altura?: number
  /** distância do topo da viga ao topo do furo e do fundo da viga ao fundo do furo */
  topo?: number
  fundo?: number
  /** SAN, HID, ELT, PCI, CLI, GERAL */
  disciplinas?: string[]
  modelo_id?: string
  /** furo de laje (sem viga): a área de laje dele é achada no app (furos_laje.ts) */
  laje?: boolean
  /** só furo de laje: espessura da laje, cm */
  espessura?: number
}

/** Porta ou janela de um ambiente (pipeline/fvs/esquadrias.py). O código já diz o tamanho. */
export interface DadosDaEsquadria {
  /** "PM80", "JA120B" */
  codigo: string
  classe: 'porta' | 'janela'
  /** o nome inteiro no modelo, quando é mais que o código ("JA120B VVP") */
  modelo?: string
  /** porta entre dois cômodos: o nome do ambiente do outro lado (ele tem a sua esquadria) */
  outro_lado?: string
}

export interface ElementoPacote {
  /** P pilar, V viga, L laje, A ambiente (planta de arquitetura), F furo (de viga, ou de laje sem viga), E esquadria do ambiente, M parede de alvenaria (planta de modulação) */
  tipo: 'P' | 'V' | 'L' | 'A' | 'F' | 'E' | 'M'
  nome: string
  /** seção da peça ("19x60") ou área do ambiente ("12,1 m²") */
  secao: string
  /** só ambiente: a que apartamento pertence ("Apto 303", "Área comum") */
  grupo?: string
  /** só ambiente: nome do cômodo ("Living", "Suíte 01"), da tabela por apartamento-tipo. O `nome` continua o número */
  comodo?: string
  /** só ambiente: códigos das fichas que não valem neste cômodo (tabela ficha × tipo de cômodo da obra,
   *  pipeline/fvs/ambientes.py). Sem o campo, todas valem */
  sem_fichas?: string[]
  /** [x0, y0, x1, y1], pontos do PDF, y para baixo */
  rotulo: [number, number, number, number]
  polys: Array<Array<[number, number]>>
  detalhe?: string
  /** arranque do pilar de cima: fica na planta só para ver o detalhe, sem ficha e fora da contagem */
  so_detalhe?: boolean
  /** "AAAA-MM-DD" em que a imagem do detalhe foi trocada por uma corrigida (as marcações continuam) */
  detalhe_corrigido_em?: string
  /** só pilar: consolo e capitel que ele tem nesta planta */
  partes?: ParteDoPilar[]
  /** só furo: id (no manifest) da viga em que ele fica */
  viga?: string
  /** só furo (21/11/2026): id (no manifest) do pilar em que ele (ou a caixinha) fica; marca o item de furos
   *  (`"furos": true`) da ficha do pilar, como o de viga marca o da viga */
  pilar?: string
  /** só furo: posição, tamanho e disciplinas do modelo */
  furo?: DadosDoFuro
  /** só ambiente: recortes de outros projetos (paginação de piso, impermeabilização...), chaves em `detalhes`;
   * a modulação continua em `detalhe` (projetos_ambiente.ts) */
  projetos?: string[]
  /** só esquadria: id (no manifest) do ambiente em que ela fica */
  ambiente?: string
  /** só esquadria: código e classe */
  esquadria?: DadosDaEsquadria
}

/** Tipos que são filhos de outro local (contam dentro dele, por um item da ficha dele). */
export const TIPOS_FILHOS = ['F', 'E'] as const

/** O local pai de um filho: a viga do furo, o ambiente da esquadria. */
export function paiDe(e: ElementoPacote | undefined): string | undefined {
  return e?.tipo === 'F' ? (e.viga ?? e.pilar) : e?.tipo === 'E' ? e.ambiente : undefined
}

/** Nomes das disciplinas do furo (pipeline/fvs/furos.py, DISCIPLINAS). */
export const NOME_DA_DISCIPLINA: Record<string, string> = {
  SAN: 'Sanitário',
  HID: 'Hidráulica',
  ELT: 'Elétrica/telefonia',
  PCI: 'Incêndio/gás',
  CLI: 'Climatização',
  GERAL: 'Geral',
}

/**
 * Filhos de cada local do manifest: id do pai → ids dos filhos, na ordem do nome. Furos da viga
 * (V12-F1, V12-F2...) e esquadrias do ambiente (303-05-PM80, 303-05-JA120B...).
 */
export function filhosDoManifest(m: Pick<Manifest, 'elementos'>): Map<string, string[]> {
  const saida = new Map<string, string[]>()
  const ordem = new Intl.Collator('pt-BR', { numeric: true })
  const lista = Object.entries(m.elementos ?? {}).filter(([, e]) => paiDe(e))
  lista.sort(([, a], [, b]) => ordem.compare(a.nome, b.nome))
  for (const [id, e] of lista) {
    const pai = paiDe(e)!
    const l = saida.get(pai) ?? []
    l.push(id)
    saida.set(pai, l)
  }
  return saida
}

/** Furos de cada viga do manifest: id da viga → ids dos furos, na ordem do nome (V12-F1, V12-F2...). */
export function furosDoManifest(m: Pick<Manifest, 'elementos'>): Map<string, string[]> {
  const saida = new Map<string, string[]>()
  for (const [pai, ids] of filhosDoManifest(m)) if (m.elementos[pai]?.tipo === 'V') saida.set(pai, ids)
  return saida
}

/** O que se lê no botão da esquadria dentro do ambiente: o nome sem o do ambiente ("PM80", "PM70-2"). */
export function rotuloDoFilho(nome: string, nomeDoPai: string | undefined): string {
  if (nomeDoPai && nome.startsWith(`${nomeDoPai}-`)) return nome.slice(nomeDoPai.length + 1)
  return nome.slice(nome.lastIndexOf('-') + 1)
}

/** Os tipos de parte (sem repetir) de um elemento do pacote. */
export function tiposDasPartes(e: ElementoPacote | undefined): TipoDeParte[] {
  return [...new Set((e?.partes ?? []).map((pt) => pt.tipo))]
}

/** "2026-11-17" -> "17/11"; vazio ou fora do formato -> "" */
export function dataCurta(iso?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  return m ? `${m[3]}/${m[2]}` : ''
}

export interface DetalhePacote {
  titulo: string
  prancha: string
  aco: boolean
  /** só recorte de projeto do ambiente: códigos das fichas em que ele aparece (sem a lista, em todas) */
  fichas?: string[]
}

export interface Manifest {
  formato: 1
  planta_id: string
  obra?: string
  pavimento?: string
  trecho: string
  prancha: string
  revisao: string
  largura: number
  altura: number
  tile: number
  niveis: number[]
  /** escala da prancha (o N de 1:N), para o m² das áreas de laje; pacote antigo não tem e vale 1:50 */
  escala?: number
  /** chave = elementos.id */
  elementos: Record<string, ElementoPacote>
  detalhes: Record<string, DetalhePacote>
  /** barras de laje das pranchas de armação, já alinhadas na folha (pipeline/fvs/barras_laje.py); chave = id da barra */
  barras?: Record<string, BarraPacote>
  /** forma cuja armadura de laje foi para plantas próprias (uma por direção): sem a aba Barras aqui */
  camadas_separadas?: boolean
  /** planta de armadura de uma direção: leva todas as barras do pavimento (o item da laje conta as quatro),
   *  mas só esta camada aparece e se toca */
  camada?: CamadaDeBarras
  /** planta de furos de laje de uma camada (21/11/2026, pipeline/fvs/furos.py): leva todos os furos de laje
   *  do pavimento (o item da área conta todos), mas só os desta camada aparecem e se tocam */
  furos_laje?: 'esgoto' | 'agua' | 'eletrica'
  /** forma com os furos de laje em plantas próprias: eles ficam no pacote, escondidos */
  furos_laje_separados?: boolean
  /** forma com TODOS os furos (laje, viga e pilar) na planta de furação própria (21/11/2026, "igual à
   *  armadura"): eles ficam no pacote, para o item da viga e do pilar contar, mas não aparecem aqui */
  furos_separados?: boolean
  /** planta de instalações (pipeline/fvs/instalacoes.py): a disciplina dos pontos dela */
  disciplina?: DisciplinaDePontos | 'furacao' | 'armadura'
  /** pontos de instalações do modelo, já na folha (aba Pontos); chave = id do ponto (registro em barra_id) */
  pontos?: Record<string, PontoPacote>
  /** nome do pedaço → [início, tamanho] dentro do pacote.bin */
  pedacos: Record<string, [number, number]>
}

/** De quem é o pacote guardado: a limpeza só mexe nos pacotes da mesma obra ou de outra pessoa. */
export interface DonoDoPacote {
  obraId: string
  usuarioId: string
}

export interface PacoteGuardado {
  planta_id: string
  manifest: Manifest
  bin: Blob
  tamanho: number
  baixado_em: string
  obra_id?: string
  usuario_id?: string
}

class BancoPacotes extends Dexie {
  pacotes!: Table<PacoteGuardado, string>
  constructor() {
    super('sistema-obra-fvs')
    this.version(1).stores({ pacotes: 'planta_id' })
  }
}

let banco: BancoPacotes | null = null
const db = () => (banco ??= new BancoPacotes())

/** Confere o manifest (formato e pedaços dentro do pacote). Lança erro com texto para a tela. */
export function conferirManifest(m: unknown, tamanhoBin: number): Manifest {
  const x = m as Manifest
  if (!x || x.formato !== 1) throw new Error('Pacote de planta num formato que este app não conhece. Atualize o app.')
  if (!x.planta_id || !x.elementos || !x.pedacos || !(x.largura > 0) || !(x.altura > 0)) {
    throw new Error('Pacote de planta incompleto.')
  }
  for (const [nome, [ini, tam]] of Object.entries(x.pedacos)) {
    if (!(ini >= 0) || !(tam >= 0) || ini + tam > tamanhoBin) throw new Error(`Pacote de planta corrompido (${nome}).`)
  }
  return x
}

export class PacoteAberto {
  private urls = new Map<string, string>()
  constructor(
    readonly manifest: Manifest,
    private readonly bin: Blob,
  ) {}

  /** Blob de um pedaço ("t:z/x/y", "d:CHAVE", "a:CHAVE") ou undefined. */
  pedaco(nome: string): Blob | undefined {
    const p = this.manifest.pedacos[nome]
    if (!p) return undefined
    return this.bin.slice(p[0], p[0] + p[1], 'image/webp')
  }

  /** URL de objeto do pedaço (fica guardada até fechar()). */
  url(nome: string): string | undefined {
    const ja = this.urls.get(nome)
    if (ja) return ja
    const b = this.pedaco(nome)
    if (!b) return undefined
    const u = URL.createObjectURL(b)
    this.urls.set(nome, u)
    return u
  }

  tile(z: number, x: number, y: number): string | undefined {
    return this.url(`t:${z}/${x}/${y}`)
  }

  fechar() {
    for (const u of this.urls.values()) URL.revokeObjectURL(u)
    this.urls.clear()
  }
}

/**
 * Escala (o N de 1:N) de cada planta cujo manifest já passou por aqui. Serve às contas de m² que não
 * podem esperar o banco (a planilha é montada no toque do botão). O início lê todos os pacotes ao abrir
 * (`pacotesNoAparelho`), então a lista fica completa antes de alguém pedir a planilha.
 */
const escalas = new Map<string, number>()

/** Partes de cada pilar (id do elemento → consolo, capitel) pelos manifests que já passaram por aqui. */
const partesPorElemento = new Map<string, TipoDeParte[]>()
/** Peças que estão na planta só para ver o detalhe (arranque do pilar de cima, `so_detalhe`): sem ficha aqui. */
const soDetalhe = new Set<string>()

function lembrarEscala(m: Manifest): void {
  if (typeof m.escala === 'number') escalas.set(m.planta_id, m.escala)
  else escalas.delete(m.planta_id)
  for (const [id, e] of Object.entries(m.elementos ?? {})) {
    const tipos = tiposDasPartes(e)
    if (tipos.length) partesPorElemento.set(id, tipos)
    else partesPorElemento.delete(id)
    if (e.so_detalhe) soDetalhe.add(id)
    else soDetalhe.delete(id)
  }
  for (const [id, e] of Object.entries(m.elementos ?? {})) if (e.tipo === 'A') lembrarComodo(id, e.comodo)
}


const SEM_PARTES: readonly TipoDeParte[] = []

/** Consolo e capitel do pilar pelo pacote guardado no aparelho (vazio se não tem ou o pacote não passou). */
export function partesGuardadas(elementoId: string): readonly TipoDeParte[] {
  return partesPorElemento.get(elementoId) ?? SEM_PARTES
}

/**
 * A peça está na planta só para ver o detalhe (arranque do pilar de cima), pelo pacote guardado no aparelho.
 * Não entra nas abas nem nas contagens: a ficha dela é do pavimento de cima (regra de 17/11, item 4).
 */
export function soDetalheGuardado(elementoId: string): boolean {
  return soDetalhe.has(elementoId)
}

/** Escala da planta pelo manifest guardado no aparelho; undefined se o pacote não passou por aqui ou não diz. */
export function escalaGuardada(plantaId: string | null | undefined): number | undefined {
  return plantaId ? escalas.get(plantaId) : undefined
}

export async function guardarPacote(manifestBytes: ArrayBuffer | string, bin: Blob, dono?: DonoDoPacote): Promise<PacoteGuardado> {
  const texto = typeof manifestBytes === 'string' ? manifestBytes : new TextDecoder().decode(manifestBytes)
  const manifest = conferirManifest(JSON.parse(texto), bin.size)
  const reg: PacoteGuardado = {
    planta_id: manifest.planta_id,
    manifest,
    bin,
    tamanho: bin.size + texto.length,
    baixado_em: new Date().toISOString(),
    obra_id: dono?.obraId,
    usuario_id: dono?.usuarioId,
  }
  await db().pacotes.put(reg)
  lembrarEscala(manifest)
  mudouNoAparelho()
  lidos?.set(reg.planta_id, metaDe(reg))
  return reg
}

export async function abrirPacote(plantaId: string): Promise<PacoteAberto | null> {
  const p = await db().pacotes.get(plantaId)
  if (p) lembrarEscala(p.manifest)
  // furo de laje em cima de viga ou pilar vai para a ficha da peça (regra de 21/11/2026, pacote antigo)
  return p ? new PacoteAberto(pecaDosFurosDeLaje(p.manifest), p.bin) : null
}

/** Abre o pacote da planta ou, se ele ainda não foi baixado, o da revisão anterior mais nova. */
export async function abrirPacoteOuAnterior(plantaId: string, anteriores: readonly string[]): Promise<PacoteAberto | null> {
  for (const id of [plantaId, ...anteriores]) {
    const p = await abrirPacote(id)
    if (p) return p
  }
  return null
}

interface MetaDoPacote {
  tamanho: number
  baixado_em: string
  obra_id?: string
  usuario_id?: string
}
const metaDe = (p: PacoteGuardado): MetaDoPacote => ({ tamanho: p.tamanho, baixado_em: p.baixado_em, obra_id: p.obra_id, usuario_id: p.usuario_id })

/**
 * O que há no aparelho, lido uma vez por página. Ler os pacotes traz o manifest de cada planta inteiro:
 * com a obra inteira baixada, a tela inicial da FVS relia todos duas vezes a cada abertura (pedido do
 * Nicolas, 21/11: "FVS demora 5s para abrir"). Quem grava ou apaga pacote atualiza esta lista.
 */
let lidos: Map<string, MetaDoPacote> | null = null
let lendo: Promise<Map<string, MetaDoPacote>> | null = null
let versaoDoAparelho = 0
function mudouNoAparelho(): void {
  versaoDoAparelho++
}

function pacotesLidos(): Promise<Map<string, MetaDoPacote>> {
  if (lidos) return Promise.resolve(lidos)
  lendo ??= (async () => {
    try {
      for (;;) {
        const v = versaoDoAparelho
        const m = new Map<string, MetaDoPacote>()
        await db().pacotes.each((p) => {
          m.set(p.planta_id, metaDe(p))
          lembrarEscala(p.manifest)
        })
        // gravou ou apagou pacote durante a leitura: lê de novo
        if (v === versaoDoAparelho) return (lidos = m)
      }
    } finally {
      lendo = null
    }
  })()
  return lendo
}

/** Esquece a lista lida (testes que trocam o banco de pacotes por baixo do app). */
export function esquecerPacotesLidos(): void {
  lidos = null
  mudouNoAparelho()
}

/** As plantas do aparelho se a lista já foi lida nesta página (null = ainda não): a tela começa com ela. */
export function pacotesJaLidos(): Map<string, { tamanho: number; baixado_em: string }> | null {
  if (!lidos) return null
  const m = new Map<string, { tamanho: number; baixado_em: string }>()
  for (const [id, p] of lidos) m.set(id, { tamanho: p.tamanho, baixado_em: p.baixado_em })
  return m
}

/** Quais plantas já estão no aparelho (sem carregar as imagens; os manifests só na primeira vez). */
export async function pacotesNoAparelho(): Promise<Map<string, { tamanho: number; baixado_em: string }>> {
  const m = new Map<string, { tamanho: number; baixado_em: string }>()
  for (const [id, p] of await pacotesLidos()) m.set(id, { tamanho: p.tamanho, baixado_em: p.baixado_em })
  return m
}

/** Peça -> plantas do aparelho em que ela aparece (lê os manifests, não as imagens). */
export async function pecasNoAparelho(): Promise<Map<string, string[]>> {
  const m = new Map<string, string[]>()
  await db().pacotes.each((p) => {
    for (const id of Object.keys(p.manifest.elementos)) {
      const l = m.get(id)
      if (l) l.push(p.planta_id)
      else m.set(id, [p.planta_id])
    }
  })
  return m
}

/** A pessoa pediu para tirar plantas do aparelho (falta de espaço). As marcações não ficam aqui. */
export async function removerPacotes(ids: readonly string[]): Promise<void> {
  await db().pacotes.bulkDelete([...ids])
  mudouNoAparelho()
  for (const id of ids) lidos?.delete(id)
}

/**
 * Limpeza ao abrir o módulo numa obra. Saem do aparelho:
 * - pacotes baixados por outra pessoa (o núcleo também apaga o que a pessoa anterior baixou);
 * - pacotes desta obra que não estão em `manter` (planta apagada ou revisão anterior, depois que a
 *   nova chegou: ver revisoes.ts).
 * Pacotes de outras obras da mesma pessoa ficam: ela pode trabalhar em duas obras sem internet.
 */
export async function limparPacotes(dono: DonoDoPacote, manter: ReadonlySet<string>): Promise<number> {
  const sair: string[] = []
  for (const [id, p] of await pacotesLidos()) {
    const deOutraPessoa = p.usuario_id !== undefined && p.usuario_id !== dono.usuarioId
    const destaObra = p.obra_id === undefined || p.obra_id === dono.obraId
    if (deOutraPessoa || (destaObra && !manter.has(id))) sair.push(id)
  }
  if (sair.length) await removerPacotes(sair)
  return sair.length
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface ArquivoServidor {
  id: string
  caminho: string
  hash: string
  tamanho: number
}

/** Como buscar um arquivo. aoBytes (opcional) recebe quantos bytes já chegaram deste arquivo. */
export type Baixador = (caminho: string, aoBytes?: (recebidos: number) => void) => Promise<Blob>

/**
 * Internet ruim: a conexão pode parar sem dar erro nenhum, e o navegador fica esperando por minutos.
 * Sem chegar nada por este tempo, o download é dado como parado. Na tela, os botões de baixar ficariam
 * travados até lá.
 */
export const LIMITE_SEM_DADOS_MS = 45_000

export class DownloadParado extends Error {
  constructor() {
    super('A conexão parou no meio do download. Confira a internet e tente de novo; o que já baixou continua aqui.')
    this.name = 'DownloadParado'
  }
}

/** A promessa, ou DownloadParado se ela não responder a tempo. */
export function comPrazo<T>(p: Promise<T>, ms: number, aoEstourar?: () => void): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined
  const prazo = new Promise<never>((_, recusar) => {
    relogio = setTimeout(() => {
      // nesta ordem: cancelar a leitura faz ela responder "acabou", e o arquivo cortado passaria por inteiro
      recusar(new DownloadParado())
      aoEstourar?.()
    }, ms)
  })
  return Promise.race([p, prazo]).finally(() => clearTimeout(relogio))
}

/** Lê a resposta de um download contando os bytes. Sem como contar, lê de uma vez. */
export async function lerComProgresso(resposta: Response, aoBytes?: (recebidos: number) => void, limiteMs = LIMITE_SEM_DADOS_MS): Promise<Blob> {
  // getReader trava a resposta: só pede o leitor quando vai mesmo contar
  const leitor = aoBytes ? resposta.body?.getReader() : undefined
  if (!leitor || !aoBytes) return resposta.blob()
  const partes: Uint8Array[] = []
  let recebidos = 0
  for (;;) {
    const { done, value } = await comPrazo(leitor.read(), limiteMs, () => void leitor.cancel().catch(() => {}))
    if (done) break
    partes.push(value)
    recebidos += value.length
    aoBytes(recebidos)
  }
  return new Blob(partes as BlobPart[])
}

/** Texto para a tela quando o download ou a gravação falham. */
export function textoDoErroDeDownload(e: unknown): string {
  const erro = e as { name?: string; message?: string; inner?: { name?: string } }
  if (erro?.name === 'QuotaExceededError' || erro?.inner?.name === 'QuotaExceededError') {
    return 'O aparelho está sem espaço para esta planta. Libere espaço e tente de novo; o que já baixou continua aqui.'
  }
  // erro de rede vem em inglês, do navegador ("Failed to fetch"): não serve para a tela
  if (!erro?.message || e instanceof TypeError) return 'Não consegui baixar a planta. Confira a internet e tente de novo; o que já baixou continua aqui.'
  return erro.message
}

/**
 * Baixa manifest e pacote de uma planta (precisa de internet e login) e guarda no aparelho.
 * Confere o SHA-256 de cada arquivo com o registrado em "arquivos".
 * aoProgresso recebe de 0 a 1, pelo tamanho registrado dos dois arquivos.
 */
export async function baixarPacote(
  baixar: Baixador,
  manifest: ArquivoServidor,
  pacote: ArquivoServidor,
  dono?: DonoDoPacote,
  aoProgresso?: (fracao: number) => void,
): Promise<PacoteGuardado> {
  const total = Math.max(1, manifest.tamanho + pacote.tamanho)
  const chegou = { m: 0, p: 0 }
  const avisar = () => aoProgresso?.(Math.min(1, (chegou.m + chegou.p) / total))
  // conta mesmo sem ninguém olhando o progresso: é contando que se percebe a conexão parada
  const conta = (chave: 'm' | 'p') => (n: number) => {
    chegou[chave] = n
    avisar()
  }
  const [m, p] = await Promise.all([baixar(manifest.caminho, conta('m')), baixar(pacote.caminho, conta('p'))])
  const [mb, pb] = await Promise.all([m.arrayBuffer(), p.arrayBuffer()])
  for (const [bytes, arq, nome] of [[mb, manifest, 'manifest'], [pb, pacote, 'pacote']] as const) {
    if ((await sha256Hex(bytes)) !== arq.hash) throw new Error(`O ${nome} da planta chegou diferente do registrado. Tente de novo.`)
  }
  return guardarPacote(mb, new Blob([pb]), dono)
}

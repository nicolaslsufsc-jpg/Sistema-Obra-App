// Regras da obra entre itens das fichas (prazos e ligações), tabela fvs_regras (migração do núcleo
// 20261119120000_fvs_regras.sql). Parte pura, sem banco e sem tela (regras.test.ts).
//
// Cada linha da tabela é a configuração inteira da obra numa versão: vale a mais nova. Sem conta, a
// linha vem do config_fvs.json do pacote da obra. Sem linha nenhuma, a FVS funciona como antes.
// O banco confere o formato; aqui a leitura é de novo cuidadosa, porque o pacote local não passa
// pelo banco: entrada torta é deixada de lado, e o resto vale.

/** Um item de uma ficha, pelo código da ficha (sobrevive à revisão nova dela) e pelo número do item. */
export interface RefItem {
  ficha: string
  item: number
}

export interface Prazo extends RefItem {
  id: string
  /** dias corridos, contados a partir do início (`depois_de`) */
  dias: number
  depois_de: { tipo: 'concretagem' } | ({ tipo: 'item' } & RefItem)
  texto?: string
}

/**
 * O item `de`, ao ficar C, marca C no item `para` (se ele ainda estiver vazio). Sem `entre`, na mesma
 * peça. Com `entre: 'area'` (20/11/2026), entre peças: `de` é um item da ficha de uma área de laje, e
 * `para` é marcado em cada pilar ou viga dentro dela (ligacoes.ts).
 */
export interface Ligacao {
  id: string
  de: RefItem
  para: RefItem
  entre?: 'area'
}

/**
 * Um trecho da obra para os avisos de escoramento (23/11/2026, item 3.8): os pilares dele, pelo nome. Viga e
 * laje entram pelos pilares que as apoiam (escoramento_residencial.ts). Com `pavimento` (o nome dele), a
 * lista vale só ali e passa na frente da lista sem pavimento.
 */
export interface Residencial {
  nome: string
  pilares: string[]
  pavimento?: string
}

/**
 * Unidade de conferência de uma ficha (ideia 14, 25/11/2026), escolhida na montagem da obra (Nova obra).
 * peca / parede / ambiente: um toque marca um local. trecho / area / pavimento: um toque marca todos os
 * locais do grupo, num lote (marcarLote). O registro fica sempre no local: trocar a unidade no meio da obra
 * (outra entrada da mesma ficha com `desde` mais novo) não apaga nem muda o que já foi registrado.
 */
export type Unidade = 'peca' | 'parede' | 'ambiente' | 'trecho' | 'area' | 'pavimento'
export interface UnidadeDaFicha {
  id: string
  /** código da ficha (sobrevive à revisão nova dela) */
  ficha: string
  unidade: Unidade
  /** a partir de quando vale (AAAA-MM-DD) */
  desde: string
}
const UNIDADES: readonly Unidade[] = ['peca', 'parede', 'ambiente', 'trecho', 'area', 'pavimento']

export interface RegrasFvs {
  prazos: Prazo[]
  ligacoes: Ligacao[]
  /** como cada ficha é conferida (vazio: como sempre, um local por toque) */
  unidades?: UnidadeDaFicha[]
  /** trechos da obra para o aviso "tal residencial de tal pavimento pode desescorar" (vazio: sem o aviso) */
  residenciais?: Residencial[]
  /** entradas do arquivo deixadas de fora por formato errado (a tela das regras mostra) */
  fora?: number
}

export const SEM_REGRAS: RegrasFvs = Object.freeze({ prazos: [], ligacoes: [] }) as RegrasFvs

const inteiro = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const texto = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

function refItem(v: unknown): RefItem | null {
  const r = v as Partial<RefItem> | null
  if (!r || typeof r !== 'object' || !texto(r.ficha) || !inteiro(r.item, 1, 999)) return null
  return { ficha: r.ficha, item: r.item }
}

function lerPrazo(v: unknown): Prazo | null {
  const p = v as Record<string, unknown> | null
  if (!p || typeof p !== 'object' || !texto(p.id) || !inteiro(p.dias, 0, 365)) return null
  const alvo = refItem(p)
  if (!alvo) return null
  const d = p.depois_de as Record<string, unknown> | null
  let depois_de: Prazo['depois_de']
  if (d?.tipo === 'concretagem') depois_de = { tipo: 'concretagem' }
  else if (d?.tipo === 'item') {
    const ref = refItem(d)
    if (!ref || (ref.ficha === alvo.ficha && ref.item === alvo.item)) return null
    depois_de = { tipo: 'item', ...ref }
  } else return null
  return { id: p.id, ...alvo, dias: p.dias, depois_de, ...(texto(p.texto) ? { texto: p.texto.trim() } : {}) }
}

function lerLigacao(v: unknown): Ligacao | null {
  const l = v as Record<string, unknown> | null
  if (!l || typeof l !== 'object' || !texto(l.id)) return null
  const de = refItem(l.de)
  const para = refItem(l.para)
  if (!de || !para || (de.ficha === para.ficha && de.item === para.item)) return null
  // "entre" que este app não conhece: a regra fica de fora (não vira ligação da mesma peça por engano)
  if (l.entre !== undefined && l.entre !== null && l.entre !== 'area') return null
  return { id: l.id, de, para, ...(l.entre === 'area' ? { entre: 'area' as const } : {}) }
}

function lerResidencial(v: unknown): Residencial | null {
  const r = v as Record<string, unknown> | null
  if (!r || typeof r !== 'object' || !texto(r.nome) || !Array.isArray(r.pilares) || r.pilares.length > 5000) return null
  const pilares = [...new Set(r.pilares.filter(texto).map((n) => n.trim()))]
  if (!pilares.length) return null
  return { nome: r.nome.trim(), pilares, ...(texto(r.pavimento) ? { pavimento: r.pavimento.trim() } : {}) }
}

function lerUnidade(v: unknown): UnidadeDaFicha | null {
  const u = v as Record<string, unknown> | null
  if (!u || typeof u !== 'object' || !texto(u.id) || !texto(u.ficha) || !UNIDADES.includes(u.unidade as Unidade)) return null
  if (typeof u.desde !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(u.desde)) return null
  return { id: u.id, ficha: u.ficha.trim(), unidade: u.unidade as Unidade, desde: u.desde }
}

/**
 * A unidade de conferência da ficha num dia (AAAA-MM-DD; padrão: hoje): a entrada mais nova com `desde` até
 * esse dia. Sem entrada: null (a tela segue como sempre). As entradas anteriores dizem como os registros
 * antigos foram feitos (historicoDeUnidades).
 */
export function unidadeDe(regras: RegrasFvs, ficha: string, dia = new Date().toISOString().slice(0, 10)): Unidade | null {
  return historicoDeUnidades(regras, ficha).filter((u) => u.desde <= dia).at(-1)?.unidade ?? null
}

/** As unidades que a ficha já teve, da mais antiga para a mais nova (para o aviso "conferido por ambiente até DD/MM"). */
export function historicoDeUnidades(regras: RegrasFvs, ficha: string): UnidadeDaFicha[] {
  return (regras.unidades ?? []).filter((u) => u.ficha === ficha.trim()).sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0))
}

/** As regras de um objeto `regras` (o jsonb da tabela ou o config_fvs.json). Entrada torta fica de fora. */
export function lerRegras(regras: unknown): RegrasFvs {
  const r = regras as { prazos?: unknown; ligacoes?: unknown; residenciais?: unknown; unidades?: unknown } | null
  if (!r || typeof r !== 'object') return SEM_REGRAS
  const unicos = <T extends { id: string }>(l: T[]) => {
    const vistos = new Set<string>()
    return l.filter((x) => !vistos.has(x.id) && vistos.add(x.id))
  }
  const prazos = Array.isArray(r.prazos) ? unicos(r.prazos.map(lerPrazo).filter((p): p is Prazo => !!p)) : []
  const ligacoes = Array.isArray(r.ligacoes) ? unicos(r.ligacoes.map(lerLigacao).filter((l): l is Ligacao => !!l)) : []
  const residenciais = Array.isArray(r.residenciais) ? r.residenciais.map(lerResidencial).filter((x): x is Residencial => !!x) : []
  const unidades = Array.isArray(r.unidades) ? unicos(r.unidades.slice(0, 5000).map(lerUnidade).filter((x): x is UnidadeDaFicha => !!x)) : []
  const total =
    (Array.isArray(r.prazos) ? r.prazos.length : 0) +
    (Array.isArray(r.ligacoes) ? r.ligacoes.length : 0) +
    (Array.isArray(r.residenciais) ? r.residenciais.length : 0) +
    (Array.isArray(r.unidades) ? r.unidades.length : 0)
  const fora = total - prazos.length - ligacoes.length - residenciais.length - unidades.length
  if (!prazos.length && !ligacoes.length && !residenciais.length && !unidades.length && !fora) return SEM_REGRAS
  return { prazos, ligacoes, ...(residenciais.length ? { residenciais } : {}), ...(unidades.length ? { unidades } : {}), ...(fora ? { fora } : {}) }
}

interface LinhaDeRegras {
  id: string
  regras?: unknown
  apagado?: unknown
  criado_em_servidor?: unknown
  criado_em_dispositivo?: unknown
}

/** A configuração que vale: a linha mais nova da obra (hora do servidor; sem ela, a do aparelho; depois o id). */
export function regrasVigentes(linhas: readonly LinhaDeRegras[]): RegrasFvs {
  const quando = (l: LinhaDeRegras) => String(l.criado_em_servidor ?? l.criado_em_dispositivo ?? '')
  let atual: LinhaDeRegras | undefined
  for (const l of linhas) {
    if (l.apagado === true) continue
    if (!atual || quando(l) > quando(atual) || (quando(l) === quando(atual) && l.id > atual.id)) atual = l
  }
  return atual ? lerRegras(atual.regras) : SEM_REGRAS
}

export const chaveDoItem = (ficha: string, item: number) => `${ficha}#${item}`

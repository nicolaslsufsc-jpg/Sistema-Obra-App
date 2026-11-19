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

/** O item `de`, ao ficar C, marca C no item `para` da mesma peça (se ele ainda estiver vazio). */
export interface Ligacao {
  id: string
  de: RefItem
  para: RefItem
}

export interface RegrasFvs {
  prazos: Prazo[]
  ligacoes: Ligacao[]
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
  return { id: l.id, de, para }
}

/** As regras de um objeto `regras` (o jsonb da tabela ou o config_fvs.json). Entrada torta fica de fora. */
export function lerRegras(regras: unknown): RegrasFvs {
  const r = regras as { prazos?: unknown; ligacoes?: unknown } | null
  if (!r || typeof r !== 'object') return SEM_REGRAS
  const unicos = <T extends { id: string }>(l: T[]) => {
    const vistos = new Set<string>()
    return l.filter((x) => !vistos.has(x.id) && vistos.add(x.id))
  }
  const prazos = Array.isArray(r.prazos) ? unicos(r.prazos.map(lerPrazo).filter((p): p is Prazo => !!p)) : []
  const ligacoes = Array.isArray(r.ligacoes) ? unicos(r.ligacoes.map(lerLigacao).filter((l): l is Ligacao => !!l)) : []
  return prazos.length || ligacoes.length ? { prazos, ligacoes } : SEM_REGRAS
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

// Locais do sistema oficial que não são peça da planta (bloco de fundação, trecho de cortina, parede de
// concreto aparente...): tabela locais_sistema, migração 20261121130000_sistema_oficial_leitura.sql.
// As fichas abertas (fvs_fichas_campo.local_id) e as verificações (fvs_eventos.local_id) desses locais
// aparecem numa lista própria da FVS, agrupada pelo local pai, e cada local abre como uma peça sem planta.
import type { Linha } from '../nucleo/banco_local'
import { situacaoDoLocal, type EventoFvs, type Ficha, type FichaCampo, type Situacao } from './situacao'

/** B2 antes de B10, como em dados.ts. */
const ordemNatural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

export interface LocalSistema {
  id: string
  sistema: string
  origem_id: string
  origem_pai_id: string | null
  nome: string
  /** caminho inteiro no sistema oficial ("Obra / Fundação / Bloco B12") */
  nome_completo: string
  nivel: number
  /** apagado lá, mas ainda com fichas: fica para não perder o histórico */
  apagado_no_sistema: boolean
  /** o mesmo local na planta, quando é peça (então as fichas dele aparecem na peça) */
  elemento_id: string | null
}

export function paraLocal(l: Linha): LocalSistema {
  return {
    id: l.id,
    sistema: String(l.sistema ?? ''),
    origem_id: String(l.origem_id ?? ''),
    origem_pai_id: (l.origem_pai_id as string | null) ?? null,
    nome: String(l.nome ?? ''),
    nome_completo: String(l.nome_completo ?? l.nome ?? ''),
    nivel: Number(l.nivel ?? 0),
    apagado_no_sistema: l.apagado_no_sistema === true,
    elemento_id: (l.elemento_id as string | null) ?? null,
  }
}

/** O que a lista e a tela do local precisam dos dados da FVS. */
export interface DadosDosLocais {
  localPorId: ReadonlyMap<string, LocalSistema>
  fichasCampoDoLocal: ReadonlyMap<string, readonly FichaCampo[]>
  eventosDe: ReadonlyMap<string, readonly EventoFvs[]>
  fichaPorId: ReadonlyMap<string, Ficha>
}

export interface LocalNaLista {
  local: LocalSistema
  /** fichas abertas no sistema oficial */
  fichas: number
  /** marcações (do sistema oficial e do app) */
  registros: number
  situacao: Situacao
}

export interface GrupoDeLocais {
  /** caminho do local pai; vazio = locais na raiz do sistema */
  titulo: string
  locais: LocalNaLista[]
}

/** Situação do local: a das fichas abertas e a das marcações feitas só no app, juntas. */
export function situacaoDoLocalDoSistema(d: DadosDosLocais, localId: string): Situacao {
  const abertas = d.fichasCampoDoLocal.get(localId) ?? []
  const eventos = d.eventosDe.get(localId) ?? []
  const soNoApp = eventos.filter((e) => !e.ficha_campo_id)
  // sem ficha aberta, as marcações do app valem pela ficha em que foram feitas
  const padrao = soNoApp.length ? d.fichaPorId.get(soNoApp[0].ficha_id) : undefined
  return situacaoDoLocal(padrao, abertas, (id) => d.fichaPorId.get(id), eventos)
}

/**
 * Os locais do sistema com ficha aberta ou marcação, agrupados pelo local pai (o caminho dele) e na
 * ordem natural dos nomes. Local que também é peça da planta (`elemento_id`) fica de fora: as fichas
 * dele aparecem na peça.
 */
export function gruposDeLocais(d: DadosDosLocais): GrupoDeLocais[] {
  const porOrigem = new Map<string, LocalSistema>()
  for (const l of d.localPorId.values()) porOrigem.set(`${l.sistema}|${l.origem_id}`, l)
  const grupos = new Map<string, LocalNaLista[]>()
  for (const local of d.localPorId.values()) {
    if (local.elemento_id) continue
    const fichas = d.fichasCampoDoLocal.get(local.id)?.length ?? 0
    const registros = d.eventosDe.get(local.id)?.length ?? 0
    if (!fichas && !registros) continue
    const pai = local.origem_pai_id ? porOrigem.get(`${local.sistema}|${local.origem_pai_id}`) : undefined
    const titulo = pai?.nome_completo ?? ''
    grupos.set(titulo, [...(grupos.get(titulo) ?? []), { local, fichas, registros, situacao: situacaoDoLocalDoSistema(d, local.id) }])
  }
  return [...grupos.entries()]
    .map(([titulo, locais]) => ({ titulo, locais: locais.sort((a, b) => ordemNatural.compare(a.local.nome, b.local.nome)) }))
    .sort((a, b) => ordemNatural.compare(a.titulo, b.titulo))
}

/** Quantos locais a lista mostra: na obra piloto são dezenas, não milhares (só os com ficha ou marcação). */
export function quantosLocais(d: DadosDosLocais): number {
  return gruposDeLocais(d).reduce((n, g) => n + g.locais.length, 0)
}

/** Busca pelo nome ou pelo caminho, sem acento e sem diferença de maiúscula. */
export function filtrarGrupos(grupos: readonly GrupoDeLocais[], busca: string): GrupoDeLocais[] {
  const q = semAcento(busca.trim())
  if (!q) return [...grupos]
  return grupos
    .map((g) => ({ ...g, locais: g.locais.filter((l) => semAcento(`${l.local.nome_completo} ${l.local.nome}`).includes(q)) }))
    .filter((g) => g.locais.length > 0)
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

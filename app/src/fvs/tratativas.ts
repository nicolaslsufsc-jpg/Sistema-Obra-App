// Tratativa de não conformidade (ideia 1, aprovada pelo Nicolas em 25/11/2026; PBQP-H, SiAC nível A).
// Tabela fvs_tratativas (migração 20261125150000_fvs_tratativas.sql), só inclusão: mudar um campo é uma
// linha nova com todos os campos. Vale a mais nova de cada NC. Parte pura, sem banco e sem tela.
//
// Regras (docs/modulos/1_fvs.md, "Tratativa do NC"):
// - A tratativa é da rodada do NC (V01, V02...). Ela aponta para um registro NC da rodada (o primeiro
//   que este aparelho conhecia); vale para a rodada inteira, venha de que registro vier.
// - O prazo só avisa (regra de 18/11): atrasado fica vermelho, nada é bloqueado.
// - Concessão (aceito como está) fecha o NC sem reinspeção, sempre com quem decidiu.
// - A reinspeção continua sendo o C na rodada seguinte; depois dela, a pergunta da eficácia.
// - O mesmo item com NC 3 vezes (no mesmo local ou na mesma ficha da obra): aviso de ação corretiva. Só avisa.

import type { EventoFvs } from './situacao'

export type Causa = 'mao_de_obra' | 'material' | 'projeto' | 'outro'
export type Eficacia = 'eficaz' | 'nao_eficaz'

export const CAUSAS: ReadonlyArray<{ valor: Causa; rotulo: string }> = [
  { valor: 'mao_de_obra', rotulo: 'Mão de obra' },
  { valor: 'material', rotulo: 'Material' },
  { valor: 'projeto', rotulo: 'Projeto' },
  { valor: 'outro', rotulo: 'Outro' },
]

export const rotuloDaCausa = (c: Causa | null): string => CAUSAS.find((x) => x.valor === c)?.rotulo ?? ''

/** O que a pessoa preenche. */
export interface CamposDaTratativa {
  responsavel: string | null
  /** AAAA-MM-DD */
  prazo: string | null
  causa: Causa | null
  causa_obs: string | null
  casos_parecidos: string | null
  concessao: boolean
  concessao_por: string | null
  eficacia: Eficacia | null
  eficacia_obs: string | null
}

export interface Tratativa extends CamposDaTratativa {
  id: string
  evento_nc_id: string
  usuario_id: string
  criado_em_dispositivo: string
}

export const TRATATIVA_VAZIA: CamposDaTratativa = {
  responsavel: null,
  prazo: null,
  causa: null,
  causa_obs: null,
  casos_parecidos: null,
  concessao: false,
  concessao_por: null,
  eficacia: null,
  eficacia_obs: null,
}

/** Tamanhos máximos (os mesmos do banco). */
const LIMITE: Record<string, number> = { responsavel: 120, concessao_por: 120, causa_obs: 500, casos_parecidos: 500, eficacia_obs: 500 }

const texto = (v: unknown, max: number): string | null => {
  const t = typeof v === 'string' ? v.trim().slice(0, max) : ''
  return t || null
}

const CAUSAS_VALIDAS = new Set(CAUSAS.map((c) => c.valor))
const DATA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Os campos como vão para o banco: texto aparado e no tamanho, causa e eficácia só da lista, data só AAAA-MM-DD.
 * Concessão sem quem decidiu não vale (o banco recusaria e o registro ficaria preso na fila): fica sem concessão
 * até o nome ser escrito.
 */
export function camposLimpos(c: Partial<CamposDaTratativa>): CamposDaTratativa {
  const concessao_por = texto(c.concessao_por, LIMITE.concessao_por)
  return {
    responsavel: texto(c.responsavel, LIMITE.responsavel),
    prazo: typeof c.prazo === 'string' && DATA.test(c.prazo) ? c.prazo : null,
    causa: c.causa && CAUSAS_VALIDAS.has(c.causa) ? c.causa : null,
    causa_obs: texto(c.causa_obs, LIMITE.causa_obs),
    casos_parecidos: texto(c.casos_parecidos, LIMITE.casos_parecidos),
    concessao: !!c.concessao && !!concessao_por,
    concessao_por,
    eficacia: c.eficacia === 'eficaz' || c.eficacia === 'nao_eficaz' ? c.eficacia : null,
    eficacia_obs: texto(c.eficacia_obs, LIMITE.eficacia_obs),
  }
}

const CAMPOS = Object.keys(TRATATIVA_VAZIA) as (keyof CamposDaTratativa)[]

/** Mudou alguma coisa em relação à tratativa que vale (sem tratativa: mudou se tem algo preenchido)? */
export function tratativaMudou(atual: CamposDaTratativa | null, nova: CamposDaTratativa): boolean {
  const base = atual ?? TRATATIVA_VAZIA
  return CAMPOS.some((k) => (base[k] ?? null) !== (nova[k] ?? null))
}

/** Tem algo preenchido? */
export const temTratativa = (t: CamposDaTratativa | null | undefined): boolean => !!t && tratativaMudou(null, camposLimpos(t))

/** Linha do banco (fvs_tratativas) para a tela. */
export function paraTratativa(l: Record<string, unknown> & { id: string }): Tratativa {
  return {
    ...camposLimpos(l as Partial<CamposDaTratativa>),
    // a concessão gravada é a do banco (que já exige quem decidiu)
    concessao: l.concessao === true,
    id: l.id,
    evento_nc_id: String(l.evento_nc_id),
    usuario_id: String(l.usuario_id ?? ''),
    criado_em_dispositivo: String(l.criado_em_dispositivo ?? ''),
  }
}

/** Mais nova primeiro: hora do aparelho, depois id (como os registros da FVS). */
const maisNovaPrimeiro = (a: Tratativa, b: Tratativa) =>
  a.criado_em_dispositivo === b.criado_em_dispositivo ? (a.id < b.id ? 1 : -1) : a.criado_em_dispositivo < b.criado_em_dispositivo ? 1 : -1

/** Tratativas por registro NC (evento_nc_id). Linha apagada não entra. */
export function agruparTratativas(linhas: ReadonlyArray<Record<string, unknown> & { id: string }>): Map<string, Tratativa[]> {
  const m = new Map<string, Tratativa[]>()
  for (const l of linhas) {
    if (l.apagado === true) continue
    const t = paraTratativa(l)
    const lista = m.get(t.evento_nc_id)
    if (lista) lista.push(t)
    else m.set(t.evento_nc_id, [t])
  }
  return m
}

/** Acrescenta tratativas recém-gravadas (sem reler o aparelho). */
export function comTratativas(atual: ReadonlyMap<string, Tratativa[]> | undefined, novas: readonly Tratativa[]): Map<string, Tratativa[]> {
  const m = new Map(atual ?? [])
  for (const t of novas) {
    const lista = m.get(t.evento_nc_id) ?? []
    if (!lista.some((x) => x.id === t.id)) m.set(t.evento_nc_id, [...lista, t])
  }
  return m
}

/**
 * A tratativa que vale para uma rodada de NC: a mais nova entre as que apontam para qualquer registro NC
 * da rodada (dois aparelhos podem ter aberto a tratativa por registros diferentes da mesma rodada).
 */
export function tratativaDaRodada(tratativasDe: ReadonlyMap<string, readonly Tratativa[]> | undefined, eventosNc: readonly Pick<EventoFvs, 'id'>[]): Tratativa | null {
  if (!tratativasDe?.size) return null
  const todas = eventosNc.flatMap((e) => tratativasDe.get(e.id) ?? [])
  return todas.length ? [...todas].sort(maisNovaPrimeiro)[0] : null
}

/** O registro NC a que a tratativa nova aponta: o da tratativa que vale, ou o primeiro NC da rodada. */
export function eventoDaTratativa(eventosNc: readonly EventoFvs[], atual: Tratativa | null): string | null {
  if (atual) return atual.evento_nc_id
  const ordem = [...eventosNc].sort((a, b) => (a.criado_em_dispositivo === b.criado_em_dispositivo ? (a.id < b.id ? -1 : 1) : a.criado_em_dispositivo < b.criado_em_dispositivo ? -1 : 1))
  return ordem[0]?.id ?? null
}

export type SituacaoDoPrazo = 'atrasado' | 'hoje' | 'no_prazo'

/** Data de hoje no aparelho, AAAA-MM-DD (hora local, não UTC: à noite o UTC já é amanhã). */
export function hojeLocal(agora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`
}

/** Só avisa: NC fechado (reinspecionado ou por concessão) ou sem prazo não tem situação. */
export function situacaoDoPrazo(prazo: string | null, aberta: boolean, hoje = hojeLocal()): SituacaoDoPrazo | null {
  if (!prazo || !aberta) return null
  return prazo < hoje ? 'atrasado' : prazo === hoje ? 'hoje' : 'no_prazo'
}

/** "01/12/2026" */
export function dataDoPrazo(prazo: string): string {
  const [a, m, d] = prazo.split('-')
  return `${d}/${m}/${a}`
}

/** "até 01/12/2026 · atrasado" */
export function rotuloDoPrazo(prazo: string, s: SituacaoDoPrazo | null): string {
  const sufixo = s === 'atrasado' ? ' · atrasado' : s === 'hoje' ? ' · vence hoje' : ''
  return `até ${dataDoPrazo(prazo)}${sufixo}`
}

/** Uma linha só, para a lista, o texto da equipe e o PDF. Vazio se não há tratativa. */
export function resumoDaTratativa(t: CamposDaTratativa | null, aberta = true, hoje = hojeLocal()): string {
  if (!t) return ''
  const partes: string[] = []
  if (t.responsavel) partes.push(`Quem resolve: ${t.responsavel}`)
  if (t.prazo) partes.push(rotuloDoPrazo(t.prazo, situacaoDoPrazo(t.prazo, aberta && !t.concessao, hoje)))
  if (t.causa) partes.push(`Causa: ${rotuloDaCausa(t.causa)}${t.causa_obs ? ` (${t.causa_obs})` : ''}`)
  if (t.concessao) partes.push(`Aceito sob concessão por ${t.concessao_por}`)
  if (t.eficacia) partes.push(t.eficacia === 'eficaz' ? 'Correção eficaz' : 'Correção não eficaz')
  return partes.join(' · ')
}

/** Quantas vezes o NC se repete para pedir a ação corretiva (ideia 1: "repetiu 3 vezes"). Só avisa. */
export const REPETICOES_PARA_ACAO = 3

export const AVISO_ACAO_CORRETIVA = 'NC repetido: vale abrir uma ação corretiva (causa e o que muda no serviço).'

/** Este item já teve NC em pelo menos 3 rodadas no mesmo local? */
export const repetiuNoLocal = (rodadasComNc: number): boolean => rodadasComNc >= REPETICOES_PARA_ACAO

/**
 * Itens de ficha (ficha + item) com NC em 3 locais ou mais na lista: chave `fichaId|item`, quantos.
 * Para o aviso de ação corretiva na lista de reprovações.
 */
export function repetidosNaObra(lista: ReadonlyArray<{ fichaId: string; item: number; pecaId: string }>): Map<string, number> {
  const locais = new Map<string, Set<string>>()
  for (const r of lista) {
    const k = `${r.fichaId}|${r.item}`
    const s = locais.get(k) ?? new Set<string>()
    s.add(r.pecaId)
    locais.set(k, s)
  }
  const m = new Map<string, number>()
  for (const [k, s] of locais) if (s.size >= REPETICOES_PARA_ACAO) m.set(k, s.size)
  return m
}

/** Quem já resolveu NC na obra (para sugerir no campo), do mais usado para o menos. */
export function responsaveisDaObra(tratativasDe: ReadonlyMap<string, readonly Tratativa[]> | undefined): string[] {
  const conta = new Map<string, number>()
  for (const lista of tratativasDe?.values() ?? []) for (const t of lista) if (t.responsavel) conta.set(t.responsavel, (conta.get(t.responsavel) ?? 0) + 1)
  return [...conta].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).map(([n]) => n).slice(0, 30)
}

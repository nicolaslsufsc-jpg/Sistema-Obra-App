// Prazos entre itens das fichas (escoramento, reescoramento), das regras da obra (regras.ts).
// Parte pura, sem banco e sem tela (prazos.test.ts). Decisões do Nicolas (18 e 19/11/2026):
// - dias corridos, contados da concretagem da peça ou do C de outro item da mesma peça;
// - só C inicia um prazo (NA não);
// - antes do prazo o app SÓ AVISA: pede confirmação e grava "Marcado antes do prazo" no registro.
// A concretagem da peça: a data do caminhão do Concreto, quando houver; senão, o C mais novo num item
// da etapa de concretagem da própria ficha.

import type { Prazo, RegrasFvs } from './regras'
import { itensDaConcretagem, ultimosPorItem, type EventoFvs, type Ficha } from './situacao'

const DIA_MS = 24 * 60 * 60 * 1000

/** Meia-noite (hora do aparelho) do dia de `d`. */
function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function somarDias(d: Date, dias: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias)
}

/** Data de um registro ou de um caminhão: ISO com hora, ou só a data ("2026-11-19", lida como dia local). */
function lerData(s: string): Date | null {
  const so = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  const d = so ? new Date(Number(so[1]), Number(so[2]) - 1, Number(so[3])) : new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Os prazos que valem para um item desta ficha. */
export function prazosDoItem(regras: RegrasFvs, ficha: Pick<Ficha, 'codigo'>, item: number): Prazo[] {
  return regras.prazos.filter((p) => p.ficha === ficha.codigo && p.item === item)
}

export interface ContextoDoPrazo {
  /** registros da peça (todas as fichas dela) */
  eventos: readonly EventoFvs[]
  /** a ficha de cada registro, pelo id (para achar o item de outra ficha pelo código) */
  fichaPorId: (id: string) => Pick<Ficha, 'id' | 'codigo' | 'itens'> | undefined
  /** a ficha do item com prazo */
  ficha: Ficha
  /** datas dos caminhões do Concreto lançados na peça (vazio sem Concreto) */
  datasDoConcreto?: readonly string[]
}

function maisNova(datas: Iterable<Date | null>): Date | null {
  let m: Date | null = null
  for (const d of datas) if (d && (!m || d > m)) m = d
  return m
}

/** Quando o prazo começa a contar, ou null se o início ainda não aconteceu. */
export function inicioDoPrazo(prazo: Prazo, cx: ContextoDoPrazo): Date | null {
  if (prazo.depois_de.tipo === 'concretagem') {
    const doConcreto = maisNova((cx.datasDoConcreto ?? []).map(lerData))
    if (doConcreto) return doConcreto
    const concretagem = new Set(itensDaConcretagem(cx.ficha).map((i) => i.n))
    const ult = ultimosPorItem(cx.eventos.filter((e) => e.ficha_id === cx.ficha.id))
    return maisNova([...ult.values()].filter((e) => concretagem.has(e.item) && e.resultado === 'C').map((e) => lerData(e.criado_em_dispositivo)))
  }
  const ref = prazo.depois_de
  // o item de referência, em qualquer revisão da ficha com aquele código; vale o último registro
  const doCodigo = cx.eventos.filter((e) => cx.fichaPorId(e.ficha_id)?.codigo === ref.ficha && e.item === ref.item)
  let ultimo: EventoFvs | undefined
  for (const e of doCodigo) if (!ultimo || e.criado_em_dispositivo > ultimo.criado_em_dispositivo || (e.criado_em_dispositivo === ultimo.criado_em_dispositivo && e.id > ultimo.id)) ultimo = e
  return ultimo?.resultado === 'C' ? lerData(ultimo.criado_em_dispositivo) : null
}

export type EstadoDoPrazo =
  | { estado: 'cumprido'; liberaEm: Date }
  | { estado: 'aguardando'; liberaEm: Date; faltam: number }
  | { estado: 'sem_inicio' }

/** Como está o prazo hoje. Libera à meia-noite do dia `início + dias`. */
export function estadoDoPrazo(prazo: Prazo, inicio: Date | null, agora: Date): EstadoDoPrazo {
  if (!inicio) return { estado: 'sem_inicio' }
  const liberaEm = somarDias(inicioDoDia(inicio), prazo.dias)
  const hoje = inicioDoDia(agora)
  if (hoje >= liberaEm) return { estado: 'cumprido', liberaEm }
  return { estado: 'aguardando', liberaEm, faltam: Math.round((liberaEm.getTime() - hoje.getTime()) / DIA_MS) }
}

export interface PrazoDoItem {
  prazo: Prazo
  situacao: EstadoDoPrazo
}

/**
 * O prazo que segura o item, se algum: o que libera mais tarde; sem início conta como o que mais segura.
 * Todos cumpridos (ou nenhum prazo): null.
 */
export function prazoPendente(regras: RegrasFvs, cx: ContextoDoPrazo, item: number, agora: Date): PrazoDoItem | null {
  let pior: PrazoDoItem | null = null
  for (const prazo of prazosDoItem(regras, cx.ficha, item)) {
    const situacao = estadoDoPrazo(prazo, inicioDoPrazo(prazo, cx), agora)
    if (situacao.estado === 'cumprido') continue
    if (situacao.estado === 'sem_inicio') return { prazo, situacao }
    if (!pior || (pior.situacao.estado === 'aguardando' && situacao.liberaEm > pior.situacao.liberaEm)) pior = { prazo, situacao }
  }
  return pior
}

const ddmm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

function deOnde(p: Prazo): string {
  return p.depois_de.tipo === 'concretagem' ? 'da concretagem' : `do item ${p.depois_de.item}`
}

/** Texto curto para o selo do item: "faltam 3 dias (libera em 22/11)". */
export function seloDoPrazo(p: PrazoDoItem): string {
  if (p.situacao.estado === 'sem_inicio') return `prazo de ${p.prazo.dias} dias ${deOnde(p.prazo)}, ainda sem data`
  if (p.situacao.estado === 'aguardando') {
    const n = p.situacao.faltam
    return `${n === 1 ? 'falta 1 dia' : `faltam ${n} dias`} (libera em ${ddmm(p.situacao.liberaEm)})`
  }
  return ''
}

/** A pergunta antes de marcar C dentro do prazo. */
export function perguntaDoPrazo(p: PrazoDoItem, nome: string): string {
  const qual = p.prazo.texto ? `${p.prazo.texto}: ` : ''
  if (p.situacao.estado === 'sem_inicio') {
    return `${nome} · ${qual}o prazo de ${p.prazo.dias} dias conta ${deOnde(p.prazo)}, que ainda não foi marcada.\n\nMarcar C mesmo assim?`
  }
  const lib = p.situacao.estado === 'aguardando' ? ddmm(p.situacao.liberaEm) : ''
  return `${nome} · ${qual}o prazo de ${p.prazo.dias} dias ainda não venceu (libera em ${lib}).\n\nMarcar C mesmo assim?`
}

/** A observação gravada no registro marcado antes do prazo. */
export function observacaoDoPrazo(p: PrazoDoItem): string {
  if (p.situacao.estado === 'aguardando') return `Marcado antes do prazo (libera em ${ddmm(p.situacao.liberaEm)})`
  return `Marcado antes do prazo (sem data de início)`
}

/** A pergunta única do lote (Etapa C, pincel) quando alguns itens ainda estão dentro do prazo. */
export function perguntaDoLote(n: number): string {
  return `${n === 1 ? '1 item ainda está' : `${n} itens ainda estão`} dentro do prazo das regras da obra (escoramento ou reescoramento).\n\n` +
    `OK: marca ${n === 1 ? 'esse também' : 'esses também'}, com "Marcado antes do prazo".\nCancelar: marca só os outros.`
}

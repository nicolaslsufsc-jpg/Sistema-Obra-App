// Regras do módulo Projetos calculadas no aparelho, iguais às views do banco
// (revisoes_vigentes, documentos_escritorio, situacao_distribuicao em
// supabase/migrations/20261103234000_projetos.sql). Funções puras, sem rede nem banco.

import type { Linha } from '../nucleo/banco_local'

export type NomeSituacao = 'OK' | 'RECOLHER' | 'DEVOLVIDO' | 'CONFERIR'

export interface Situacao {
  empresa_id: string
  documento_id: string
  situacao: NomeSituacao
  /** Revisão da entrega aberta mais recente (null se nenhuma aberta). */
  revisao_em_campo_id: string | null
  revisao_vigente_id: string | null
  /** Entregas sem devolução, da mais recente para a mais antiga. */
  entregas_abertas: Linha[]
  /** Maior data_evento entre entregas abertas e devoluções (AAAA-MM-DD). */
  ultimo_evento: string | null
}

export const ROTULO_SITUACAO: Record<NomeSituacao, string> = {
  OK: 'Com a vigente',
  RECOLHER: 'Recolher',
  DEVOLVIDO: 'Devolvida',
  CONFERIR: 'Conferir',
}

export function rotulo(r: Record<string, unknown>): string {
  return `${String(r.fase)} R${String(r.numero)}`
}

function pesoFase(fase: unknown): number {
  return fase === 'LO' ? 2 : fase === 'EX' ? 1 : 0
}

/** Ordem de vigência: quem vem primeiro é a vigente. */
export function compararVigencia(a: Linha, b: Linha): number {
  return (
    pesoFase(b.fase) - pesoFase(a.fase) ||
    String(b.numero).localeCompare(String(a.numero)) ||
    String(b.cadastrada_em_autodoc ?? '').localeCompare(String(a.cadastrada_em_autodoc ?? '')) ||
    a.id.localeCompare(b.id)
  )
}

/** Revisão vigente de cada documento: LO > EX > outras fases; maior número; obsoleta e apagada não concorrem. */
export function vigentePorDocumento(revisoes: readonly Linha[]): Map<string, Linha> {
  const m = new Map<string, Linha>()
  for (const r of revisoes) {
    if (r.apagado || r.obsoleta) continue
    const doc = String(r.documento_id)
    const atual = m.get(doc)
    if (!atual || compararVigencia(r, atual) < 0) m.set(doc, r)
  }
  return m
}

/** Último evento de escritório de cada documento (pela hora do aparelho, depois pelo id). */
export function escritorioPorDocumento(eventos: readonly Linha[]): Map<string, Linha> {
  const m = new Map<string, Linha>()
  for (const e of eventos) {
    if (e.apagado) continue
    const doc = String(e.documento_id)
    const atual = m.get(doc)
    if (!atual || e.criado_em_dispositivo > atual.criado_em_dispositivo || (e.criado_em_dispositivo === atual.criado_em_dispositivo && e.id > atual.id)) {
      m.set(doc, e)
    }
  }
  return m
}

function chave(e: Linha): string {
  return `${String(e.empresa_id)}|${String(e.documento_id)}`
}

function maisRecentePrimeiro(a: Linha, b: Linha): number {
  return String(b.data_evento).localeCompare(String(a.data_evento)) || b.criado_em_dispositivo.localeCompare(a.criado_em_dispositivo) || b.id.localeCompare(a.id)
}

/** Situação de cada empresa em cada documento, a partir das entregas e devoluções. */
export function situacoes(eventos: readonly Linha[], vigentes: ReadonlyMap<string, Linha>): Situacao[] {
  const vivos = eventos.filter((e) => !e.apagado)
  const devolvidas = new Set(vivos.filter((e) => e.tipo === 'devolucao').map((e) => String(e.entrega_id)))
  const pares = new Map<string, { empresa_id: string; documento_id: string; abertas: Linha[]; ultimo: string | null }>()
  const par = (e: Linha) => {
    const k = chave(e)
    let p = pares.get(k)
    if (!p) {
      p = { empresa_id: String(e.empresa_id), documento_id: String(e.documento_id), abertas: [], ultimo: null }
      pares.set(k, p)
    }
    return p
  }
  for (const e of vivos) {
    if (e.tipo === 'entrega') {
      if (devolvidas.has(e.id)) continue
      const p = par(e)
      p.abertas.push(e)
      p.ultimo = maior(p.ultimo, String(e.data_evento))
    } else if (e.tipo === 'devolucao') {
      const p = par(e)
      p.ultimo = maior(p.ultimo, String(e.data_evento))
    }
  }
  const saida: Situacao[] = []
  for (const p of pares.values()) {
    p.abertas.sort(maisRecentePrimeiro)
    const vigente = vigentes.get(p.documento_id) ?? null
    const emCampo = p.abertas[0] ? String(p.abertas[0].revisao_id) : null
    let situacao: NomeSituacao
    if (p.abertas.length >= 2) situacao = 'CONFERIR'
    else if (p.abertas.length === 1 && !vigente) situacao = 'CONFERIR'
    else if (p.abertas.length === 1 && emCampo === vigente!.id) situacao = 'OK'
    else if (p.abertas.length === 1) situacao = 'RECOLHER'
    else situacao = 'DEVOLVIDO'
    saida.push({
      empresa_id: p.empresa_id,
      documento_id: p.documento_id,
      situacao,
      revisao_em_campo_id: emCampo,
      revisao_vigente_id: vigente?.id ?? null,
      entregas_abertas: p.abertas,
      ultimo_evento: p.ultimo,
    })
  }
  return saida
}

function maior(a: string | null, b: string): string {
  return a === null || b > a ? b : a
}

/** AAAA-MM-DD no fuso do aparelho. */
export function dataLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split('-').map(Number)
  return dataLocal(new Date(a, m - 1, d + dias))
}

/**
 * Revisão "nova": apareceu na lista do Autodoc nos últimos `dias` dias e não está obsoleta. `carga` = o dia da
 * carga inicial da obra (ver cargaInicial): o que já veio nela não é novidade (testador, 23/11/2026).
 */
export function revisaoNova(r: Linha, hoje: string, dias = 7, carga?: string | null): boolean {
  const vista = String(r.vista_em)
  if (carga && vista <= carga) return false
  return !r.apagado && !r.obsoleta && vista >= somarDias(hoje, -dias)
}

/** O dia da carga inicial da obra: o primeiro dia em que alguma revisão foi vista. Sem revisão, null. */
export function cargaInicial(revs: readonly Linha[]): string | null {
  let primeira: string | null = null
  for (const r of revs) {
    if (r.apagado || !r.vista_em) continue
    const v = String(r.vista_em).slice(0, 10)
    if (primeira === null || v < primeira) primeira = v
  }
  return primeira
}

/** Para busca: minúsculas e sem acentos. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

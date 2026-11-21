// Correções feitas no app por cima da base importada (protótipo aprovado em 14/11/2026, tela de edição).
// Nada se apaga: cada correção é uma linha nova que aponta para a anterior (`substitui_id`, como o Concreto).
// Vale a última linha de cada alvo; as outras ficam no histórico da prancha.
// Ficam no banco do navegador (tabela meta, chave `projetos_edicoes:<obra>`), como a base: o mesmo
// "atalho" aprovado pelo Nicolas, sem mexer no núcleo. Por isso também não entram no "Salvar arquivo".
import { banco } from '../nucleo/servicos'
import type { BaseProjetos } from './base'
import { chaveNumero, diasEntre, melhor, normalizar, type Copia, type Fase, type Vigente } from './painel'

/** O que a pessoa corrige numa cópia (a linha da distribuição). */
export interface CorrecaoCopia {
  empresa: string
  colaborador: string
  fase: Fase
  revisao: number | null
  entrega: string | null // AAAA-MM-DD
  devolucao: string | null // AAAA-MM-DD; vazio = ainda em campo
}

/** O que a pessoa corrige na prancha (a linha da lista vigente). */
export interface CorrecaoVigente {
  titulo: string
  fase: Fase
  revisao: number
  data: string // "vigente desde"
}

/** Qual revisão está na pasta do escritório e desde quando. */
export interface RegistroEscritorio {
  fase: Fase
  revisao: number
  data: string // dia em que a pasta foi atualizada
}

interface EdicaoBase {
  id: string
  /** a linha que esta corrige (null = primeira correção daquele alvo) */
  substitui_id: string | null
  em: string // ISO
  usuario: string
}
export type Edicao =
  | (EdicaoBase & { tipo: 'copia'; alvo: number; codigo: string; dados: CorrecaoCopia })
  | (EdicaoBase & { tipo: 'vigente'; alvo: string; dados: CorrecaoVigente })
  | (EdicaoBase & { tipo: 'escritorio'; alvo: string; dados: RegistroEscritorio })

export type NovaEdicao =
  | { tipo: 'copia'; alvo: number; codigo: string; dados: CorrecaoCopia }
  | { tipo: 'vigente'; alvo: string; dados: CorrecaoVigente }
  | { tipo: 'escritorio'; alvo: string; dados: RegistroEscritorio }

const chave = (obraId: string) => `projetos_edicoes:${obraId}`

export async function lerEdicoes(obraId: string): Promise<Edicao[]> {
  return (await banco.lerMeta<Edicao[]>(chave(obraId))) ?? []
}

/** Grava uma correção nova. Ela aponta para a última do mesmo alvo; nada é apagado. */
export async function gravarEdicao(obraId: string, nova: NovaEdicao, usuario: string, agora = new Date()): Promise<Edicao[]> {
  const todas = await lerEdicoes(obraId)
  const anterior = ultimaDe(todas, nova.tipo, nova.alvo)
  const linha = { ...nova, id: crypto.randomUUID(), substitui_id: anterior?.id ?? null, em: agora.toISOString(), usuario } as Edicao
  const lista = [...todas, linha]
  await banco.gravarMeta(chave(obraId), lista)
  return lista
}

function ultimaDe(todas: readonly Edicao[], tipo: Edicao['tipo'], alvo: string | number): Edicao | undefined {
  const doAlvo = todas.filter((e) => e.tipo === tipo && e.alvo === alvo)
  const substituidas = new Set(doAlvo.map((e) => e.substitui_id))
  // a que vale é a que nenhuma outra substitui; empate (não deveria haver): a mais recente
  return doAlvo.filter((e) => !substituidas.has(e.id)).sort((a, b) => b.em.localeCompare(a.em))[0]
}

/** Chave da folha: o código sem o pedaço da fase ("EXE.HI.LO.001.X" → "EXE.HI.001.X"), para a pasta do
 *  escritório e as correções da prancha valerem igual quando a folha passa de EX para LO. */
export function chaveFolha(v: Pick<Vigente, 'codigo'>): string {
  const p = v.codigo.trim().toUpperCase().split('.')
  return p.length >= 4 ? [...p.slice(0, 2), ...p.slice(3)].join('.') : p.join('.')
}

export interface BaseCorrigida {
  vigentes: Vigente[]
  copias: Copia[]
  escritorio: Map<string, RegistroEscritorio>
  /** correções de cópia que não acharam a linha (a base foi reimportada e a linha mudou) */
  orfas: Edicao[]
}

/** A base com as correções por cima. A base importada não muda. */
export function aplicarEdicoes(base: Pick<BaseProjetos, 'vigentes' | 'copias'>, edicoes: readonly Edicao[]): BaseCorrigida {
  const orfas: Edicao[] = []
  const vigentes = base.vigentes.map((v) => {
    const e = ultimaDe(edicoes, 'vigente', chaveFolha(v))
    return e && e.tipo === 'vigente' ? { ...v, ...e.dados } : v
  })
  const porLinha = new Map(base.copias.map((c) => [c.linha, c]))
  const corrigidas = new Map<number, Copia>()
  const alvosCopia = new Set(edicoes.filter((e) => e.tipo === 'copia').map((e) => e.alvo as number))
  for (const alvo of alvosCopia) {
    const e = ultimaDe(edicoes, 'copia', alvo)
    if (!e || e.tipo !== 'copia') continue
    const c = porLinha.get(alvo)
    // reimportou e a linha agora é outra prancha: a correção não vale mais (fica no histórico)
    if (!c || chaveNumero(c.codigo) !== chaveNumero(e.codigo)) {
      orfas.push(e)
      continue
    }
    const d = e.dados
    corrigidas.set(alvo, {
      ...c,
      empresa: d.empresa,
      colaborador: d.colaborador,
      fase: d.fase,
      revisao: d.revisao,
      revisaoTexto: d.revisao === null ? c.revisaoTexto : `R${String(d.revisao).padStart(2, '0')}${d.fase === 'EX' ? '' : ` ${d.fase}`}`,
      entrega: d.entrega,
      entregaTexto: d.entrega ?? c.entregaTexto,
      devolucao: d.devolucao,
    })
  }
  const copias = base.copias.map((c) => corrigidas.get(c.linha) ?? c)
  const escritorio = new Map<string, RegistroEscritorio>()
  for (const alvo of new Set(edicoes.filter((e) => e.tipo === 'escritorio').map((e) => e.alvo as string))) {
    const e = ultimaDe(edicoes, 'escritorio', alvo)
    if (e && e.tipo === 'escritorio') escritorio.set(alvo, e.dados)
  }
  return { vigentes, copias, escritorio, orfas }
}

/** As correções que tocam uma prancha (a folha e as cópias dela), mais novas primeiro. */
export function historicoDaPrancha(edicoes: readonly Edicao[], folha: string | undefined, linhas: readonly number[]): Edicao[] {
  const ls = new Set(linhas)
  return edicoes
    .filter((e) => (e.tipo === 'copia' ? ls.has(e.alvo) : folha !== undefined && e.alvo === folha))
    .sort((a, b) => b.em.localeCompare(a.em))
}

// ---------------------------------------------------------------------------------------------
// Escritório: a pasta de cópias do escritório está com a vigente?
// ---------------------------------------------------------------------------------------------

export interface EscritorioAtrasado {
  vigente: Vigente
  registro: RegistroEscritorio
  dias: number
}

export interface ResumoEscritorio {
  desatualizados: EscritorioAtrasado[]
  emDia: number
  semRegistro: number
}

const PESO_FASE: Record<string, number> = { LO: 2, EX: 1 }

/**
 * A pasta do escritório × a vigente, com a regra estrita (21/11/2026): no escritório a fase do arquivo é
 * conhecida, então EX R03 na pasta com a LO R03 vigente é desatualizado. Mesma regra no cartão do painel,
 * na lista de pranchas, na prancha e na exportação (ficha v2), para não haver dois números.
 */
export function compararEscritorio(r: Pick<RegistroEscritorio, 'fase' | 'revisao'>, v: Pick<Vigente, 'fase' | 'revisao'>): 'em dia' | 'desatualizado' | 'à frente' {
  const dif = (PESO_FASE[r.fase] ?? 0) - (PESO_FASE[v.fase] ?? 0) || r.revisao - v.revisao
  return dif < 0 ? 'desatualizado' : dif > 0 ? 'à frente' : 'em dia'
}

/** Folhas do escritório desatualizadas (regra estrita), com os dias desde a data da vigente. */
export function resumirEscritorio(vigentes: readonly Vigente[], escritorio: ReadonlyMap<string, RegistroEscritorio>, hoje: string): ResumoEscritorio {
  const desatualizados: EscritorioAtrasado[] = []
  let emDia = 0
  let semRegistro = 0
  // uma folha por chave: a mesma folha listada nas duas fases conta uma vez, pela vigente que vale
  const porFolha = new Map<string, Vigente[]>()
  for (const v of vigentes) porFolha.set(chaveFolha(v), [...(porFolha.get(chaveFolha(v)) ?? []), v])
  for (const [k, vs] of porFolha) {
    const v = melhor(vs)
    const r = escritorio.get(k)
    if (!r) {
      semRegistro++
      continue
    }
    if (compararEscritorio(r, v) === 'desatualizado') desatualizados.push({ vigente: v, registro: r, dias: v.data ? Math.max(0, diasEntre(v.data, hoje)) : 0 })
    else emDia++
  }
  desatualizados.sort((a, b) => b.dias - a.dias || normalizar(a.vigente.codigo).localeCompare(normalizar(b.vigente.codigo)))
  return { desatualizados, emDia, semRegistro }
}

// Indicadores da qualidade (versão PC, ideia 6, aprovada pelo Nicolas em 25/11/2026): só com o que o app já
// tem, sem tabela nova. Serve como "objetivos e indicadores" da qualidade (SiAC). Aqui só as contas, sem banco e
// sem tela (qualidade.test.ts); quem liga aos dados da FVS e do Concreto é a PaginaQualidade.tsx.
//
// - Conformidade: cada inspeção de item conta uma vez. Inspeção = a última marcação de um item, numa peça, numa
//   ficha (e ficha aberta) e numa rodada: corrigir a marcação não conta duas vezes; a reinspeção depois de um NC
//   é outra rodada e conta. NA e marcação desfeita não entram. O item que o Concreto marca sozinho também não
//   (não é inspeção de ninguém).
// - NC abertas: as reprovações da FVS cujo último registro do item ainda é NC (a mesma lista da tela de
//   reprovações), com os dias desde o NC.
// - Tempo até liberar: da primeira marcação da ficha na peça até a última marcação que a liberou (os itens de antes
//   da concretagem, ou a ficha inteira quando ela não tem etapa de concretagem).
// - Laudos: por concretagem, a idade de controle (a maior, em geral 28 dias) de cada caminhão.
import type { Concretagem, DadosConcreto } from '../concreto/dados'
import { idadesDoCaminhao } from '../concreto/dados'
import type { EventoFvs, Ficha, Situacao } from '../fvs/situacao'
import { itensAntesDaConcretagem, ultimosPorItem } from '../fvs/situacao'

const DIA_MS = 86_400_000
const natural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

/** Uma inspeção de item com resultado C ou NC. */
export interface Inspecao {
  pecaId: string
  pavimentoId: string
  fichaCodigo: string
  fichaTitulo: string
  resultado: 'C' | 'NC'
  /** ISO da marcação */
  quando: string
}

/**
 * As inspeções de uma peça: a última marcação de cada item, por ficha, ficha aberta e rodada. Só C e NC; fora o
 * que o Concreto marca sozinho (`ehAutomatico`).
 */
export function inspecoesDaPeca(
  peca: { id: string; pavimentoId: string },
  eventos: readonly EventoFvs[],
  fichaPorId: (id: string) => Pick<Ficha, 'codigo' | 'titulo'> | undefined,
  ehAutomatico: (e: EventoFvs) => boolean = () => false,
): Inspecao[] {
  const ultimo = new Map<string, EventoFvs>()
  for (const e of eventos) {
    if (ehAutomatico(e)) continue
    const k = `${e.ficha_id}|${e.ficha_campo_id ?? ''}|${e.item}|${e.rodada}`
    const atual = ultimo.get(k)
    if (!atual || e.criado_em_dispositivo > atual.criado_em_dispositivo || (e.criado_em_dispositivo === atual.criado_em_dispositivo && e.id > atual.id)) ultimo.set(k, e)
  }
  const saida: Inspecao[] = []
  for (const e of ultimo.values()) {
    if (e.resultado !== 'C' && e.resultado !== 'NC') continue
    const ficha = fichaPorId(e.ficha_id)
    if (!ficha) continue
    saida.push({ pecaId: peca.id, pavimentoId: peca.pavimentoId, fichaCodigo: ficha.codigo, fichaTitulo: ficha.titulo, resultado: e.resultado, quando: e.criado_em_dispositivo })
  }
  return saida
}

export interface LinhaDeConformidade {
  chave: string
  nome: string
  c: number
  nc: number
  /** inteiro de 0 a 100; sem inspeção, null */
  pct: number | null
}

/** Quantos por cento, inteiro; sem total, null. */
export function porcento(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 100) : null
}

/**
 * Conformidade agrupada (por ficha, pavimento...). `ordem`: 'pior' põe o menor % primeiro (a barra ordenada que
 * mostra onde agir); 'dada' segue a ordem de `ordemDe` (pavimentos de baixo para cima, por exemplo).
 */
export function conformidadePor(
  inspecoes: readonly Inspecao[],
  chave: (i: Inspecao) => string,
  nome: (i: Inspecao) => string,
  ordem: 'pior' | ((a: string, b: string) => number) = 'pior',
): LinhaDeConformidade[] {
  const por = new Map<string, LinhaDeConformidade>()
  for (const i of inspecoes) {
    const k = chave(i)
    let l = por.get(k)
    if (!l) por.set(k, (l = { chave: k, nome: nome(i), c: 0, nc: 0, pct: null }))
    if (i.resultado === 'C') l.c++
    else l.nc++
  }
  const linhas = [...por.values()].map((l) => ({ ...l, pct: porcento(l.c, l.c + l.nc) }))
  if (ordem === 'pior') return linhas.sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || b.nc - a.nc || natural.compare(a.nome, b.nome))
  return linhas.sort((a, b) => ordem(a.chave, b.chave))
}

/** Total: C, NC e o % conforme. */
export function totalDaConformidade(inspecoes: readonly Inspecao[]): { c: number; nc: number; pct: number | null } {
  const c = inspecoes.filter((i) => i.resultado === 'C').length
  const nc = inspecoes.length - c
  return { c, nc, pct: porcento(c, c + nc) }
}

/** Dias inteiros entre duas datas ISO (a hora conta: 23 h ainda é 0 dia). */
export function diasEntre(antes: string, depois: string): number {
  return Math.max(0, Math.floor((Date.parse(depois) - Date.parse(antes)) / DIA_MS))
}

/** NC aberta com os dias desde o NC. */
export interface NcAberta<R> {
  r: R
  dias: number
}

/** As NC ainda abertas, da mais antiga para a mais nova. */
export function ncsAbertas<R extends { aberta: boolean; quando: string }>(reprovacoes: readonly R[], agora: Date): NcAberta<R>[] {
  const hoje = agora.toISOString()
  return reprovacoes
    .filter((r) => r.aberta)
    .map((r) => ({ r, dias: diasEntre(r.quando, hoje) }))
    .sort((a, b) => b.dias - a.dias || natural.compare(a.r.quando, b.r.quando))
}

/** Quantas NC abertas até 7 dias, de 8 a 30 e há mais de 30. */
export function faixasDasNcs(dias: readonly number[]): { ate7: number; ate30: number; mais30: number } {
  return { ate7: dias.filter((d) => d <= 7).length, ate30: dias.filter((d) => d > 7 && d <= 30).length, mais30: dias.filter((d) => d > 30).length }
}

/** Quando a ficha foi começada e quando ficou liberada na peça. */
export interface Liberacao {
  inicio: string
  fim: string
  /** dias, com uma casa */
  dias: number
}

/**
 * Da primeira marcação da ficha até a marcação que a liberou. `situacao` é a da peça nessa ficha (situacaoDaPeca):
 * só 'liberado' e 'concretagem' (liberado para concretar) contam. A que liberou: a mais nova entre os itens de
 * antes da concretagem (ou, sem essa etapa, entre todos os marcados).
 */
export function liberacaoDaFicha(ficha: Ficha, eventos: readonly EventoFvs[], situacao: Situacao, ehAutomatico: (e: EventoFvs) => boolean = () => false): Liberacao | null {
  if (situacao !== 'liberado' && situacao !== 'concretagem') return null
  const daFicha = eventos.filter((e) => e.ficha_id === ficha.id && !ehAutomatico(e))
  if (!daFicha.length) return null
  const ult = ultimosPorItem(daFicha)
  const antes = itensAntesDaConcretagem(ficha)
  const decisivos = (antes.length ? antes.map((i) => ult.get(i.n)) : [...ult.values()]).filter((e): e is EventoFvs => !!e && !!e.resultado)
  if (!decisivos.length) return null
  const fim = decisivos.reduce((m, e) => (e.criado_em_dispositivo > m ? e.criado_em_dispositivo : m), '')
  const inicio = daFicha.reduce((m, e) => (e.criado_em_dispositivo < m ? e.criado_em_dispositivo : m), fim)
  return { inicio, fim, dias: Math.round(((Date.parse(fim) - Date.parse(inicio)) / DIA_MS) * 10) / 10 }
}

/** Mediana (média dos dois do meio quando a lista é par); lista vazia, null. */
export function mediana(nums: readonly number[]): number | null {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10
}

/** Segunda-feira (AAAA-MM-DD, hora local) da semana de uma data ISO. */
export function segundaDaSemana(iso: string): string {
  const d = new Date(iso)
  const dia = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dia)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Quantas por semana, da mais antiga para a mais nova, com as semanas sem nada no meio (até `semanas`). */
export function porSemana(datas: readonly string[], agora: Date, semanas = 12): Array<{ semana: string; n: number }> {
  const conta = new Map<string, number>()
  for (const d of datas) {
    const s = segundaDaSemana(d)
    conta.set(s, (conta.get(s) ?? 0) + 1)
  }
  const saida: Array<{ semana: string; n: number }> = []
  const ref = new Date(segundaDaSemana(agora.toISOString()) + 'T12:00:00')
  for (let i = semanas - 1; i >= 0; i--) {
    const d = new Date(ref)
    d.setDate(d.getDate() - 7 * i)
    const s = segundaDaSemana(d.toISOString())
    saida.push({ semana: s, n: conta.get(s) ?? 0 })
  }
  // sem nada nas semanas antes da primeira com dado: corta o começo vazio
  const primeira = saida.findIndex((x) => x.n > 0)
  return primeira < 0 ? [] : saida.slice(primeira)
}

/** Situação do laudo da concretagem, pela idade de controle de cada caminhão. */
export type SituacaoDoLaudo = 'abaixo_fck' | 'atrasado' | 'com_laudo' | 'aguardando' | 'no_prazo' | 'sem_caminhao'

export const NOME_DO_LAUDO: Record<SituacaoDoLaudo, string> = {
  abaixo_fck: 'Abaixo do fck',
  atrasado: 'Laudo atrasado',
  com_laudo: 'Com laudo',
  aguardando: 'Aguardando laudo',
  no_prazo: 'Ainda não rompeu',
  sem_caminhao: 'Sem caminhão',
}

export interface LaudoDaConcretagem {
  concretagem: Concretagem
  caminhoes: number
  situacao: SituacaoDoLaudo
  /** o menor exemplar da idade de controle entre os caminhões com resultado (MPa) */
  menorExemplar: number | null
}

/**
 * Por concretagem (fora a de exemplo): com laudo = todos os caminhões com o resultado da idade de controle; abaixo
 * do fck e laudo atrasado passam na frente; aguardando = já passou a data e está na margem; no prazo = ainda não
 * chegou a data de romper.
 */
export function laudosDasConcretagens(d: DadosConcreto, hoje: string): LaudoDaConcretagem[] {
  const saida: LaudoDaConcretagem[] = []
  for (const conc of d.concretagens) {
    if (conc.exemplo) continue
    const cams = d.caminhoesDe.get(conc.raiz) ?? []
    let menor: number | null = null
    const sits = cams.map((c) => {
      const controle = idadesDoCaminhao(d, c, conc, hoje).find((i) => i.controle)
      if (controle?.exemplar !== undefined) menor = menor === null ? controle.exemplar : Math.min(menor, controle.exemplar)
      return controle?.situacao
    })
    let situacao: SituacaoDoLaudo
    if (!cams.length) situacao = 'sem_caminhao'
    else if (sits.includes('abaixo_fck')) situacao = 'abaixo_fck'
    else if (sits.includes('atrasado')) situacao = 'atrasado'
    else if (sits.every((s) => s === 'conforme')) situacao = 'com_laudo'
    else if (sits.some((s) => s === 'aguardando' || s === 'rompe_hoje')) situacao = 'aguardando'
    else situacao = 'no_prazo'
    saida.push({ concretagem: conc, caminhoes: cams.length, situacao, menorExemplar: menor })
  }
  return saida.sort((a, b) => (a.concretagem.data === b.concretagem.data ? natural.compare(a.concretagem.raiz, b.concretagem.raiz) : a.concretagem.data < b.concretagem.data ? 1 : -1))
}

/** Andamento de um apartamento: cômodos, fichas começadas e liberadas, NC e conformidade. */
export interface LinhaDoApartamento {
  pavimentoId: string
  apartamento: string
  comodos: number
  /** pares cômodo × ficha com alguma marcação */
  fichas: number
  liberadas: number
  comNc: number
  c: number
  nc: number
}

/** Agrupa por pavimento e apartamento (ordem: pavimento, depois o número do apartamento). */
export function andamentoDosApartamentos(
  comodos: ReadonlyArray<{ id: string; pavimentoId: string; apartamento: string }>,
  fichasDe: (comodoId: string) => ReadonlyArray<{ situacao: Situacao }>,
  inspecoesDe: (comodoId: string) => readonly Inspecao[],
  ordemDoPavimento: (id: string) => number,
): LinhaDoApartamento[] {
  const por = new Map<string, LinhaDoApartamento>()
  for (const cm of comodos) {
    const k = `${cm.pavimentoId}|${cm.apartamento}`
    let l = por.get(k)
    if (!l) por.set(k, (l = { pavimentoId: cm.pavimentoId, apartamento: cm.apartamento, comodos: 0, fichas: 0, liberadas: 0, comNc: 0, c: 0, nc: 0 }))
    l.comodos++
    for (const f of fichasDe(cm.id)) {
      if (f.situacao === 'nada') continue
      l.fichas++
      if (f.situacao === 'liberado') l.liberadas++
      if (f.situacao === 'reprovado') l.comNc++
    }
    for (const i of inspecoesDe(cm.id)) i.resultado === 'C' ? l.c++ : l.nc++
  }
  const apto = (g: string) => /^apto\b/i.test(g)
  return [...por.values()]
    .filter((l) => l.fichas > 0)
    .sort((a, b) => ordemDoPavimento(a.pavimentoId) - ordemDoPavimento(b.pavimentoId) || Number(apto(b.apartamento)) - Number(apto(a.apartamento)) || natural.compare(a.apartamento, b.apartamento))
}

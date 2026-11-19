// Corpos de prova: data de rompimento de cada idade e situação do laudo.
// Regras (provisórias, docs/modulos/3_concreto.md):
//  - data prevista = dia da moldagem + idade (dias corridos)
//  - sem resultado: previsto (antes), rompe hoje, aguardando (até MARGEM dias depois), atrasado
//  - com resultado: exemplar = maior valor da idade (NBR 5738 / NBR 12655)
//      * a maior idade (controle, em geral 28 dias) é comparada com o fck
//      * as outras idades (7 dias) são informativas

export const MARGEM_LAUDO_DIAS = 3

export type SituacaoCP = 'previsto' | 'rompe_hoje' | 'aguardando' | 'atrasado' | 'conforme' | 'abaixo_fck' | 'informado'

export const ROTULO_SITUACAO: Record<SituacaoCP, string> = {
  previsto: 'Previsto',
  rompe_hoje: 'Rompe hoje',
  aguardando: 'Aguardando laudo',
  atrasado: 'Laudo atrasado',
  conforme: 'OK',
  abaixo_fck: 'Abaixo do fck',
  informado: 'Resultado',
}

/** Quanto pior, menor o número (para ordenar: atrasados primeiro). */
export const GRAVIDADE: Record<SituacaoCP, number> = {
  atrasado: 0,
  abaixo_fck: 1,
  aguardando: 2,
  rompe_hoje: 3,
  previsto: 4,
  informado: 5,
  conforme: 6,
}

export interface ResultadoCP {
  idade_dias: number
  numero_cp: number
  resistencia_mpa: number
}

export interface IdadeCP {
  idade: number
  /** AAAA-MM-DD */
  dataPrevista: string
  situacao: SituacaoCP
  /** Idade comparada com o fck (a maior). */
  controle: boolean
  resultados: ResultadoCP[]
  exemplar?: number
  /** Dias desde a data prevista (positivo = passou). */
  dias: number
}

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/

function diaUTC(data: string): number {
  const m = DATA.exec(data)
  if (!m) throw new Error(`Data inválida: ${data}`)
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000
}

export function somarDias(data: string, dias: number): string {
  return new Date((diaUTC(data) + dias) * 86_400_000).toISOString().slice(0, 10)
}

export function diferencaDias(depois: string, antes: string): number {
  return diaUTC(depois) - diaUTC(antes)
}

/** Data local (AAAA-MM-DD) de uma hora ISO, no fuso do aparelho. */
export function dataLocal(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function situacaoDasIdades(o: {
  dataMoldagem: string
  idades: readonly number[]
  fck: number
  resultados: readonly ResultadoCP[]
  hoje: string
  margemDias?: number
}): IdadeCP[] {
  const margem = o.margemDias ?? MARGEM_LAUDO_DIAS
  const idades = [...new Set(o.idades)].sort((a, b) => a - b)
  const controle = idades[idades.length - 1]
  return idades.map((idade) => {
    const dataPrevista = somarDias(o.dataMoldagem, idade)
    const dias = diferencaDias(o.hoje, dataPrevista)
    const resultados = o.resultados
      .filter((r) => r.idade_dias === idade)
      .sort((a, b) => a.numero_cp - b.numero_cp)
    let situacao: SituacaoCP
    let exemplar: number | undefined
    if (resultados.length > 0) {
      exemplar = Math.max(...resultados.map((r) => r.resistencia_mpa))
      situacao = idade === controle ? (exemplar >= o.fck ? 'conforme' : 'abaixo_fck') : 'informado'
    } else if (dias < 0) situacao = 'previsto'
    else if (dias === 0) situacao = 'rompe_hoje'
    else if (dias <= margem) situacao = 'aguardando'
    else situacao = 'atrasado'
    return { idade, dataPrevista, situacao, controle: idade === controle, resultados, exemplar, dias }
  })
}

/** Pior situação de uma lista (para o resumo do caminhão e da concretagem). */
export function piorSituacao(lista: readonly SituacaoCP[]): SituacaoCP | null {
  let pior: SituacaoCP | null = null
  for (const s of lista) if (pior === null || GRAVIDADE[s] < GRAVIDADE[pior]) pior = s
  return pior
}

/** Texto curto: "rompe em 3 dias", "atrasado há 5 dias"… */
export function textoPrazo(i: IdadeCP): string {
  const n = Math.abs(i.dias)
  const dias = n === 1 ? '1 dia' : `${n} dias`
  switch (i.situacao) {
    case 'previsto':
      return `rompe em ${dias}`
    case 'rompe_hoje':
      return 'rompe hoje'
    case 'aguardando':
      return `rompeu há ${dias}`
    case 'atrasado':
      return `rompeu há ${dias}, sem laudo`
    default:
      return ''
  }
}

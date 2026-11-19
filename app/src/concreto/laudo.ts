// Laudo do laboratório: os resultados de uma idade (7 ou 28 dias) de todos os
// caminhões da concretagem, lançados de uma vez. Aqui fica só a conta do que gravar; a tela
// é telas/TelaLaudo.tsx.
//
// Cada caixa da tela é um CP de um caminhão (CP1, CP2…). Regras:
// - caixa vazia não grava nada (e não apaga o que já existe);
// - CP sem resultado ganha um registro novo;
// - CP com resultado diferente vira correção (o valor antigo fica no histórico);
// - CP lançado duas vezes (pela tela do caminhão): vale o valor da caixa, os outros saem.
import { dataLocal, somarDias } from './cps'

const br = (d: string) => d.split('-').reverse().join('/')

/**
 * Data do ensaio impossível (teste da obra de demonstração, 13/11: aceitou ensaio em 20/11).
 * Não pode ser antes da moldagem nem depois de hoje; um dia de folga para o relógio do aparelho
 * (fuso, aparelho atrasado). Vale para o laudo e para o resultado avulso na tela do caminhão.
 */
export function erroDaDataDeEnsaio(data: string | null, dataMoldagem: string, hoje = dataLocal(new Date())): string | null {
  if (!data) return null
  if (data < dataMoldagem) return `A data do ensaio (${br(data)}) é antes da moldagem (${br(dataMoldagem)}).`
  if (data > somarDias(hoje, 1)) return `A data do ensaio (${br(data)}) está no futuro. Hoje é ${br(hoje)}.`
  return null
}

/** Maior data de ensaio aceita (para o max do campo de data). */
export function ultimaDataDeEnsaio(hoje = dataLocal(new Date())): string {
  return somarDias(hoje, 1)
}

/** O que a conta precisa de um resultado já gravado (vigente). */
export interface ResultadoDoLaudo {
  id: string
  caminhao_id: string
  idade_dias: number
  numero_cp: number
  resistencia_mpa: number
  data_ensaio: string | null
  criado_em_dispositivo: string
  /** Arquivo do laudo (PDF ou foto) ligado a este resultado. */
  laudo_arquivo_id?: string | null
}

export interface CaixaDoLaudo {
  caminhao_id: string
  numero_cp: number
  /** Número digitado; null = caixa vazia; NaN = digitado errado. */
  valor: number | null
}

export type GravacaoDoLaudo<R extends ResultadoDoLaudo> =
  | {
      tipo: 'novo'
      campos: {
        caminhao_id: string
        idade_dias: number
        numero_cp: number
        resistencia_mpa: number
        data_ensaio: string | null
        origem: 'manual'
        laudo_arquivo_id?: string
      }
    }
  | { tipo: 'corrigir'; atual: R; mudancas: { resistencia_mpa?: number; data_ensaio?: string | null; origem?: 'manual'; laudo_arquivo_id?: string } }
  | { tipo: 'cancelar'; atual: R }

/** O banco guarda uma casa depois da vírgula (numeric(5,1)). */
export const umaCasa = (v: number) => Math.round(v * 10) / 10

export const MAX_CPS = 24

/** Quantas caixas por caminhão: os CPs por idade da concretagem, ou mais se já tem CP de número maior. */
export function colunasDoLaudo(cpsPorIdade: number, existentes: readonly ResultadoDoLaudo[], idade: number): number {
  let n = cpsPorIdade
  for (const r of existentes) if (r.idade_dias === idade && r.numero_cp > n) n = r.numero_cp
  return Math.min(Math.max(n, 1), MAX_CPS)
}

const chave = (caminhaoId: string, numeroCp: number) => `${caminhaoId}|${numeroCp}`

/** Resultados de uma idade por caixa (caminhão + nº do CP), o mais recente primeiro. */
export function resultadosPorCaixa<R extends ResultadoDoLaudo>(existentes: readonly R[], idade: number): Map<string, R[]> {
  const m = new Map<string, R[]>()
  for (const r of existentes) {
    if (r.idade_dias !== idade) continue
    const k = chave(r.caminhao_id, r.numero_cp)
    const l = m.get(k)
    if (l) l.push(r)
    else m.set(k, [r])
  }
  for (const l of m.values()) {
    l.sort((a, b) => (a.criado_em_dispositivo === b.criado_em_dispositivo ? (a.id < b.id ? 1 : -1) : a.criado_em_dispositivo < b.criado_em_dispositivo ? 1 : -1))
  }
  return m
}

/** Valor que a caixa mostra quando a tela abre (o resultado mais recente daquele CP). */
export function valorAtual(porCaixa: ReadonlyMap<string, readonly ResultadoDoLaudo[]>, caminhaoId: string, numeroCp: number): number | null {
  return porCaixa.get(chave(caminhaoId, numeroCp))?.[0]?.resistencia_mpa ?? null
}

/**
 * Data do ensaio que a tela sugere: a que já está nos resultados desta idade (o laudo é um só),
 * senão a data prevista do rompimento — mas nunca depois de hoje (laudo lançado antes da data
 * prevista não pode nascer com data no futuro).
 */
export function dataSugerida(existentes: readonly ResultadoDoLaudo[], idade: number, dataPrevista: string, hoje = dataLocal(new Date())): string {
  const datas = existentes.filter((r) => r.idade_dias === idade && r.data_ensaio).map((r) => r.data_ensaio as string)
  const d = datas.sort().at(-1) ?? dataPrevista
  return d > hoje ? hoje : d
}

export function planejarLaudo<R extends ResultadoDoLaudo>(o: {
  idade: number
  /** AAAA-MM-DD ou null (sem data). */
  dataEnsaio: string | null
  /** AAAA-MM-DD: o ensaio não pode ser antes disso. */
  dataMoldagem: string
  caixas: readonly CaixaDoLaudo[]
  /** Resultados vigentes dos caminhões da concretagem (qualquer idade). */
  existentes: readonly R[]
  /** Nome do caminhão nas mensagens de erro ("Caminhão 2"). */
  nomeDoCaminhao: (caminhaoId: string) => string
  /** AAAA-MM-DD; padrão: hoje no relógio do aparelho. */
  hoje?: string
  /**
   * Arquivo do laudo escolhido agora (id em `arquivos`). Vai nos resultados novos e nos já lançados
   * desta idade que estão nas caixas, mesmo sem valor mudado (anexar o PDF depois de digitar).
   */
  laudoArquivoId?: string | null
}): { gravacoes: GravacaoDoLaudo<R>[]; erros: string[] } {
  const erros: string[] = []
  const erroData = erroDaDataDeEnsaio(o.dataEnsaio, o.dataMoldagem, o.hoje)
  if (erroData) erros.push(erroData)
  const porCaixa = resultadosPorCaixa(o.existentes, o.idade)
  const gravacoes: GravacaoDoLaudo<R>[] = []
  for (const c of o.caixas) {
    if (c.valor === null) continue
    if (Number.isNaN(c.valor) || c.valor < 0 || c.valor > 200) {
      erros.push(`${o.nomeDoCaminhao(c.caminhao_id)}, CP${c.numero_cp}: resistência em MPa, de 0 a 200.`)
      continue
    }
    const mpa = umaCasa(c.valor)
    const [atual, ...repetidos] = porCaixa.get(chave(c.caminhao_id, c.numero_cp)) ?? []
    if (!atual) {
      gravacoes.push({
        tipo: 'novo',
        campos: {
          caminhao_id: c.caminhao_id,
          idade_dias: o.idade,
          numero_cp: c.numero_cp,
          resistencia_mpa: mpa,
          data_ensaio: o.dataEnsaio,
          origem: 'manual',
          ...(o.laudoArquivoId ? { laudo_arquivo_id: o.laudoArquivoId } : {}),
        },
      })
      continue
    }
    const anexo = o.laudoArquivoId && atual.laudo_arquivo_id !== o.laudoArquivoId ? { laudo_arquivo_id: o.laudoArquivoId } : {}
    if (umaCasa(atual.resistencia_mpa) !== mpa) {
      gravacoes.push({ tipo: 'corrigir', atual, mudancas: { resistencia_mpa: mpa, data_ensaio: o.dataEnsaio, origem: 'manual', ...anexo } })
    } else if (o.laudoArquivoId && atual.laudo_arquivo_id !== o.laudoArquivoId) {
      // só o anexo: o valor e a data do ensaio continuam como estão
      gravacoes.push({ tipo: 'corrigir', atual, mudancas: anexo })
    }
    for (const r of repetidos) gravacoes.push({ tipo: 'cancelar', atual: r })
  }
  return { gravacoes: erros.length > 0 ? [] : gravacoes, erros }
}

/** O laudo que já está ligado a esta idade: o do resultado mais recente que tem arquivo. */
export function laudoDaIdade(
  existentes: readonly { idade_dias: number; laudo_arquivo_id?: string | null; criado_em_dispositivo: string }[],
  idade: number,
): string | null {
  const comArquivo = existentes.filter((r) => r.idade_dias === idade && r.laudo_arquivo_id)
  comArquivo.sort((a, b) => a.criado_em_dispositivo.localeCompare(b.criado_em_dispositivo))
  return comArquivo.at(-1)?.laudo_arquivo_id ?? null
}

// Painel da obra em Projetos (21/11/2026, pedido do Nicolas: "ao entrar na obra, ver o resumo").
// Por disciplina e pavimento: quantas pranchas vigentes, quantas com revisão nova desde a última leitura do
// Autodoc e como está a pasta do escritório (o que está no PC) em relação ao Autodoc. Funções puras, sem
// rede nem banco; a tela é telas/TelaObra.tsx.
import type { Linha } from '../nucleo/banco_local'
import { escritorioAtualizado, type DadosProjetos, type Documento } from './dados'
import { normalizar, revisaoNova } from './regras'

/** Pavimento a partir do nome curto e do título da prancha ("FOR4PAVTIP", "LAJE DO 4º PAVTO TIPO"...). */
export function pavimentoDe(d: Pick<Documento, 'nome_curto' | 'titulo'>): string {
  const t = normalizar(`${d.nome_curto} ${d.titulo}`).toUpperCase()
  const n = t.match(/(\d{1,2})\s*[ºO°]?\s*(?:PAVTO|PAVIMENTO|PAV|PVTO)/)
  if (n) return `${Number(n[1])}º pavimento`
  if (/SUBSOLO|\bSUB\b/.test(t)) return 'Subsolo'
  if (/TERREO|TERR\b|\bTER\b/.test(t)) return 'Térreo'
  if (/PILOTIS/.test(t)) return 'Pilotis'
  if (/MEZANIN/.test(t)) return 'Mezanino'
  if (/TIPO|PAVTIP/.test(t)) return 'Pavimento tipo'
  if (/ATICO/.test(t)) return 'Ático'
  if (/COBERT|\bCOB\b|BARRILETE|RESERVAT/.test(t)) return 'Cobertura'
  if (/FUNDA|ESTACA|BLOCO|SAPATA|RADIER/.test(t)) return 'Fundação'
  return 'Geral'
}

const ORDEM_FIXA = ['Fundação', 'Subsolo', 'Térreo', 'Pilotis', 'Mezanino']
const ORDEM_FIM = ['Pavimento tipo', 'Ático', 'Cobertura', 'Geral']
/** Ordem de obra: fundação, subsolo, térreo, pilotis, mezanino, 1º, 2º..., tipo, ático, cobertura, geral. */
export function ordemPavimento(p: string): number {
  const i = ORDEM_FIXA.indexOf(p)
  if (i >= 0) return i
  const n = p.match(/^(\d+)º/)
  if (n) return 10 + Number(n[1])
  const f = ORDEM_FIM.indexOf(p)
  return 1000 + (f >= 0 ? f : 99)
}

export type CriterioNovas = 'leitura' | 'primeira' | '7dias'

export interface Contagem {
  vigentes: number
  /** pranchas cuja revisão vigente é nova (desde a última leitura do Autodoc) */
  novas: number
  /** pasta do escritório com a vigente */
  escritorioEmDia: number
  /** pasta do escritório com revisão antiga */
  escritorioVencida: number
  /** sem registro da pasta do escritório */
  escritorioSem: number
}

export interface LinhaPavimento extends Contagem {
  pavimento: string
  documentos: Documento[]
}

export interface LinhaDisciplina extends Contagem {
  disciplina: string
  pavimentos: LinhaPavimento[]
}

export interface PainelObra {
  totais: Contagem
  disciplinas: LinhaDisciplina[]
  /** como "nova" foi contada */
  criterio: CriterioNovas
  /** a partir de quando conta como nova (AAAA-MM-DD), quando o critério é a leitura */
  desde: string | null
  /** pranchas com revisão nova, mais recentes primeiro */
  novas: Array<{ documento: Documento; vigente: Linha; pavimento: string }>
}

const zero = (): Contagem => ({ vigentes: 0, novas: 0, escritorioEmDia: 0, escritorioVencida: 0, escritorioSem: 0 })
function somar(a: Contagem, b: Contagem) {
  a.vigentes += b.vigentes
  a.novas += b.novas
  a.escritorioEmDia += b.escritorioEmDia
  a.escritorioVencida += b.escritorioVencida
  a.escritorioSem += b.escritorioSem
}

/**
 * Leituras do Autodoc: `ultima` = dia da última lista publicada; `anterior` = dia da lista antes dela.
 * Nova = a vigente apareceu pela primeira vez depois da leitura anterior. Só uma leitura: é a primeira, nada
 * conta como novo. Sem saber das leituras (sem internet e sem cópia guardada): últimos 7 dias.
 */
export function painelObra(dados: DadosProjetos, leituras: { ultima: string | null; anterior: string | null } | null): PainelObra {
  let criterio: CriterioNovas = '7dias'
  let desde: string | null = null
  if (leituras?.ultima) {
    if (leituras.anterior) {
      criterio = 'leitura'
      desde = leituras.anterior
    } else criterio = 'primeira'
  }
  const ehNova = (v: Linha): boolean => {
    if (criterio === 'primeira') return false
    if (criterio === 'leitura') return !v.obsoleta && !v.apagado && String(v.vista_em) > desde!
    return revisaoNova(v, dados.hoje)
  }

  const porDisc = new Map<string, Map<string, LinhaPavimento>>()
  const novas: PainelObra['novas'] = []
  for (const d of dados.documentos) {
    const vigente = dados.vigentes.get(d.id)
    if (!vigente) continue
    const pav = pavimentoDe(d)
    let m = porDisc.get(d.disciplina)
    if (!m) porDisc.set(d.disciplina, (m = new Map()))
    let l = m.get(pav)
    if (!l) m.set(pav, (l = { pavimento: pav, documentos: [], ...zero() }))
    l.documentos.push(d)
    l.vigentes++
    if (ehNova(vigente)) {
      l.novas++
      novas.push({ documento: d, vigente, pavimento: pav })
    }
    const esc = escritorioAtualizado(dados, d.id)
    if (esc === true) l.escritorioEmDia++
    else if (esc === false) l.escritorioVencida++
    else l.escritorioSem++
  }

  const totais = zero()
  const disciplinas: LinhaDisciplina[] = [...porDisc.entries()]
    .map(([disciplina, m]) => {
      const pavimentos = [...m.values()].sort((a, b) => ordemPavimento(a.pavimento) - ordemPavimento(b.pavimento) || a.pavimento.localeCompare(b.pavimento, 'pt-BR'))
      const c = zero()
      for (const p of pavimentos) somar(c, p)
      somar(totais, c)
      return { disciplina, pavimentos, ...c }
    })
    .sort((a, b) => b.novas - a.novas || a.disciplina.localeCompare(b.disciplina, 'pt-BR'))
  novas.sort((a, b) => String(b.vigente.vista_em).localeCompare(String(a.vigente.vista_em)) || a.documento.codigo.localeCompare(b.documento.codigo))
  return { totais, disciplinas, criterio, desde, novas }
}

// Acabamentos por cômodo (sessão 5, 24/11/2026): no menu do pavimento, a disciplina Acabamentos ganha um filtro
// por acabamento (reboco, piso, pintura, drywall) e o andamento por apartamento ("Apto 305: Reboco Interno 3 de 8").
//
// Tudo sai dos dados: a categoria vem do título da ficha (nenhum código de obra aqui) e o apartamento vem do
// "grupo" do ambiente no pacote (ou do número antes do hífen, "303-05" → "Apto 303"). Cada ficha conta só nos
// cômodos em que vale (tabela ficha × tipo de cômodo, `sem_fichas` do pacote).

import { fichaDaPeca, situacaoDaPeca, type EventoFvs, type Ficha } from './situacao'
import { ehOpcaoDeAcabamentos } from './navegacao'
import type { OpcaoDosAmbientes } from './opcoes_ambientes'

export interface CategoriaDeAcabamento {
  id: string
  nome: string
}

/** Na ordem do menu. A primeira que casar com o título da ficha vale; a que não casa com nenhuma vai para "Outros". */
const CATEGORIAS: ReadonlyArray<CategoriaDeAcabamento & { re: RegExp }> = [
  { id: 'reboco', nome: 'Reboco', re: /reboco|embo[cç]o|chapisco/i },
  { id: 'piso', nome: 'Piso e revestimento', re: /piso|contrapiso|deck|revestimento|cer[aâ]mic|porcelanato|basalto/i },
  { id: 'pintura', nome: 'Pintura', re: /pintura|massa corrida|textura/i },
  { id: 'drywall', nome: 'Drywall e forro', re: /drywall|gesso|forro/i },
]
export const OUTROS_ACABAMENTOS: CategoriaDeAcabamento = { id: 'outros', nome: 'Outros' }

/** A categoria do acabamento pelo título da ficha ("Reboco Interno" → reboco; "Impermeabilização..." → outros). */
export function categoriaDoAcabamento(titulo: string): CategoriaDeAcabamento {
  const c = CATEGORIAS.find((k) => k.re.test(titulo))
  return c ? { id: c.id, nome: c.nome } : OUTROS_ACABAMENTOS
}

/** As categorias que aparecem nestes títulos, na ordem do menu ("Outros" no fim). */
export function categoriasPresentes(titulos: readonly string[]): CategoriaDeAcabamento[] {
  const ids = new Set(titulos.map((t) => categoriaDoAcabamento(t).id))
  return [...CATEGORIAS, OUTROS_ACABAMENTOS].filter((c) => ids.has(c.id)).map(({ id, nome }) => ({ id, nome }))
}

/** O apartamento do ambiente: o grupo do pacote ("Apto 303", "Área comum") ou, sem ele, o número antes do hífen. */
export function grupoDoAmbiente(nome: string, grupo?: string): string {
  if (grupo) return grupo
  const n = nome.split('-')[0]?.trim()
  return n && n !== nome ? `Apto ${n}` : 'Sem apartamento'
}

export interface AndamentoDaFicha {
  ficha: Ficha
  liberados: number
  comR: number
  /** cômodos do apartamento em que a ficha vale */
  total: number
}

export interface AndamentoDoApartamento {
  grupo: string
  fichas: AndamentoDaFicha[]
}

const natural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })
/** Apartamentos pelo número; área comum e o que não é apartamento no fim. */
const ordemDoGrupo = (a: string, b: string) => {
  const apto = (g: string) => /^apto\b/i.test(g)
  return Number(apto(b)) - Number(apto(a)) || natural.compare(a, b)
}

/**
 * Andamento de cada ficha de ambiente por apartamento: quantos cômodos liberados, com NC e em que a ficha vale.
 * Ficha que não vale em nenhum cômodo do apartamento não entra na linha dele. Cômodo sem marcação nenhuma só
 * conta no total (não precisa olhar a situação).
 */
export function andamentoPorApartamento(
  ambientes: ReadonlyArray<{ id: string; nome: string }>,
  fichas: readonly Ficha[],
  eventosDe: (id: string) => readonly EventoFvs[],
  grupoDe: (id: string) => string | undefined,
  vale: (ambienteId: string, codigo: string) => boolean = () => true,
  fichaPorId: (id: string) => Ficha | undefined = () => undefined,
): AndamentoDoApartamento[] {
  const porGrupo = new Map<string, Map<string, AndamentoDaFicha>>()
  for (const a of ambientes) {
    const grupo = grupoDoAmbiente(a.nome, grupoDe(a.id))
    let linha = porGrupo.get(grupo)
    if (!linha) porGrupo.set(grupo, (linha = new Map()))
    const eventos = eventosDe(a.id)
    for (const ficha of fichas) {
      if (!vale(a.id, ficha.codigo)) continue
      let f = linha.get(ficha.codigo)
      if (!f) linha.set(ficha.codigo, (f = { ficha, liberados: 0, comR: 0, total: 0 }))
      f.total++
      if (!eventos.length) continue
      const s = situacaoDaPeca(fichaDaPeca(ficha, eventos, fichaPorId) ?? ficha, eventos)
      if (s === 'liberado') f.liberados++
      if (s === 'reprovado') f.comR++
    }
  }
  return [...porGrupo.entries()]
    .sort(([a], [b]) => ordemDoGrupo(a, b))
    .map(([grupo, linha]) => ({ grupo, fichas: fichas.map((f) => linha.get(f.codigo)).filter((x): x is AndamentoDaFicha => !!x) }))
    .filter((l) => l.fichas.length > 0)
}

/**
 * A opção do menu é de acabamento: nem alvenaria, nem instalações, nem a ficha da grade de escavação da planta de
 * fundação (`fichas_da_grade`, rodada 9b do testador, 24/11/2026: virava "Outros" em todos os apartamentos).
 */
export function ehDeAcabamento(op: Pick<OpcaoDosAmbientes, 'titulo' | 'pontos' | 'abre'>, fichaDaGrade: (codigo: string) => boolean): boolean {
  return ehOpcaoDeAcabamentos(op) && !fichaDaGrade(op.abre.servico)
}

/**
 * A ficha vale no cômodo para o andamento dos acabamentos: o quadrado da grade de escavação não é cômodo (virava
 * "Apto ESC"), a ficha da grade não é acabamento, e o "não se aplica" do pacote (`sem_fichas`) tira a ficha do cômodo.
 */
export function valeNoAcabamento(
  daGrade: (ambienteId: string) => boolean,
  fichaDaGrade: (codigo: string) => boolean,
  semFichas: (ambienteId: string) => readonly string[] | undefined,
  // cômodo sem tipo numa planta com a tabela (25/11): nenhuma ficha vale nele até ter nome
  semTipo: (ambienteId: string) => boolean = () => false,
): (ambienteId: string, codigo: string) => boolean {
  return (id, codigo) => !daGrade(id) && !fichaDaGrade(codigo) && !semTipo(id) && !semFichas(id)?.includes(codigo)
}

/** "Reboco Interno 3 de 8" (+ " · 1 com NC"). */
export function textoDoAndamento(f: AndamentoDaFicha): string {
  return `${f.ficha.titulo} ${f.liberados} de ${f.total}${f.comR > 0 ? ` · ${f.comR} com NC` : ''}`
}

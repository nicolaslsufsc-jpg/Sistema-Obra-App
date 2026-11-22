// "O que fazer agora" (21/11/2026, item C das 5 listas): a lista de trabalho de quem cuida das cópias.
//  - plotar: para cada pessoa da lista de distribuição sem a vigente (distribuicao.aEntregar), N cópias da folha;
//  - recolher: toda cópia em campo que não é mais a vigente (com ou sem regra de distribuição).
// Cruza as listas: vigente (Autodoc) × distribuição (regras) × em campo (ficha + entregas do app).
// Função pura: sem banco nem rede.
import type { GrupoAEntregar, Pendencia } from './distribuicao'
import { chaveFolha } from './edicoes'
import { normalizar, type CopiaCruzada, type Vigente } from './painel'

export interface APlotar {
  vigente: Vigente
  empresa: string
  colaborador: string
  copias: number
  motivo: Pendencia['motivo']
  /** cópias antigas da mesma pessoa, a recolher na mesma visita */
  devolver: CopiaCruzada[]
}

export interface ARecolher {
  x: CopiaCruzada
  vigente: Vigente
}

export interface OQueFazer {
  plotar: APlotar[]
  recolher: ARecolher[]
  /** total de cópias a plotar */
  copias: number
  /** folhas diferentes a plotar */
  folhas: number
}

const ordem = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

export function oQueFazerAgora(pendentes: readonly GrupoAEntregar[], cruzadas: readonly CopiaCruzada[]): OQueFazer {
  const plotar: APlotar[] = []
  for (const g of pendentes)
    for (const p of g.pendencias) plotar.push({ vigente: p.vigente, empresa: g.empresa, colaborador: g.colaborador, copias: Math.max(1, p.regra.copias), motivo: p.motivo, devolver: p.devolver })
  // por folha (o plotter imprime uma folha de cada vez) e, dentro dela, por pessoa
  plotar.sort((a, b) => ordem.compare(a.vigente.codigo, b.vigente.codigo) || ordem.compare(`${a.empresa} ${a.colaborador}`, `${b.empresa} ${b.colaborador}`))
  const recolher: ARecolher[] = cruzadas
    .filter((x) => x.situacao === 'em campo' && x.resultado === 'desatualizada' && !!x.vigente)
    .map((x) => ({ x, vigente: x.vigente! }))
    .sort((a, b) => ordem.compare(normalizar(`${a.x.copia.empresa} ${a.x.copia.colaborador}`), normalizar(`${b.x.copia.empresa} ${b.x.copia.colaborador}`)) || ordem.compare(a.vigente.codigo, b.vigente.codigo))
  return { plotar, recolher, copias: plotar.reduce((s, p) => s + p.copias, 0), folhas: new Set(plotar.map((p) => chaveFolha(p.vigente))).size }
}

/** "3 cópias a plotar, 2 a recolher" (ou "nada a plotar nem a recolher"). */
export function frasesAgora(o: Pick<OQueFazer, 'copias' | 'recolher'>): string {
  if (!o.copias && !o.recolher.length) return 'nada a plotar nem a recolher'
  const partes: string[] = []
  if (o.copias) partes.push(`${o.copias} ${o.copias === 1 ? 'cópia' : 'cópias'} a plotar`)
  if (o.recolher.length) partes.push(`${o.recolher.length} a recolher`)
  return partes.join(', ')
}

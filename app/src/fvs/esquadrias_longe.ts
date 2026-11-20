// Esquadrias com a planta longe (testador, 20/11/2026, obra piloto em 375 px): as bolinhas das portas e janelas
// cobriam a planta de ambientes inteira. Igual aos furos de laje:
// - longe, a bolinha some (em qualquer aba); na aba Esquadrias, no lugar dela, um número por apartamento
//   ("12 esquadrias", "3 de 12 esquadrias OK"), que se junta ao vizinho quando os dois se tocariam na tela;
// - perto (1 m da folha com ESQUADRIAS_PERTO_PX_POR_M px ou mais), as bolinhas voltam, só na aba Esquadrias.
// O apartamento é o começo do nome do ambiente ("602" em "602-03"); sem traço, o nome inteiro (área comum).

import type { FurosDaArea } from './furos_laje'
import type { ElementoPacote } from './pacote'

/** Perto: 1 m da folha com pelo menos isso de px na tela (porta de 80 cm com ~19 px, bolinha de 14 px). */
export const ESQUADRIAS_PERTO_PX_POR_M = 24

/** Zoom a partir do qual as bolinhas das esquadrias aparecem (CRS.Simple: 1 ponto da folha = 2^zoom px). */
export function zoomDasEsquadrias(escala = 50): number {
  const ptPorM = ((1000 / escala) * 72) / 25.4
  return Math.log2(ESQUADRIAS_PERTO_PX_POR_M / ptPorM)
}

/** "602" em "602-03"; sem traço, o nome inteiro. */
export function unidadeDoAmbiente(nome: string): string {
  const i = nome.indexOf('-')
  return (i > 0 ? nome.slice(0, i) : nome).trim()
}

/**
 * As esquadrias agrupadas por apartamento, para o número de longe. A chave começa com "q:" para o
 * juntarNumerosPerto juntar números que se tocariam na tela. Na ordem do apartamento.
 */
export function esquadriasPorUnidade(elementos: Record<string, ElementoPacote> | undefined): FurosDaArea[] {
  const grupos = new Map<string, { ids: string[]; pts: Array<[number, number]> }>()
  for (const [id, e] of Object.entries(elementos ?? {})) {
    if (e.tipo !== 'E') continue
    const amb = e.ambiente ? elementos?.[e.ambiente] : undefined
    const unidade = unidadeDoAmbiente(amb?.nome ?? e.nome)
    const [x0, y0, x1, y1] = e.rotulo
    const g = grupos.get(unidade) ?? { ids: [], pts: [] }
    g.ids.push(id)
    g.pts.push([(x0 + x1) / 2, (y0 + y1) / 2])
    grupos.set(unidade, g)
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true }))
    .map(([unidade, g]) => {
      const xs = g.pts.map((p) => p[0])
      const ys = g.pts.map((p) => p[1])
      const centro: [number, number] = [xs.reduce((s, v) => s + v, 0) / xs.length, ys.reduce((s, v) => s + v, 0) / ys.length]
      let perto = g.pts[0]
      for (const p of g.pts) if (Math.hypot(p[0] - centro[0], p[1] - centro[1]) < Math.hypot(perto[0] - centro[0], perto[1] - centro[1])) perto = p
      return { chave: `q:esq:${unidade}`, ids: g.ids, centro, caixa: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], perto }
    })
}

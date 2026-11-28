// Canetas do mapa do caminhão: o que foi concretado junto naquela área (pedido do Nicolas, 26/11/2026).
// Antes eram duas (07/11): "Pilares" e "Vigas e laje". Agora são seis, todas as combinações que fazem
// sentido na obra; "Pilares e lajes" sem as vigas não existe. Cada área desenhada guarda a caneta
// (caminhao_areas.alvo) e vale só nas peças dela. As canetas com laje põem a laje do trecho no
// caminhão e aparecem cheias no mapa (a forma não traz o contorno da laje).
//
// Área sem caneta (as de antes de 07/11) vale em todas as peças e continua como era: conta no
// rastreio da laje, mas não põe a laje sozinha no caminhão.
// Caneta que este app não conhece (gravada por uma versão mais nova) não quebra nada: a área
// aparece no mapa, mas não vale em peça nenhuma nem na laje até o aparelho atualizar.

/** As seis canetas, na ordem dos botões. */
export const CANETAS = ['pilares', 'vigas', 'laje', 'pilares_vigas', 'vigas_laje', 'pilares_vigas_laje'] as const

export type AlvoDaArea = (typeof CANETAS)[number]

/** Texto do botão. */
export const NOME_DA_CANETA: Readonly<Record<AlvoDaArea, string>> = {
  pilares: 'Pilares',
  vigas: 'Vigas',
  laje: 'Lajes',
  pilares_vigas: 'Pilares e vigas',
  vigas_laje: 'Vigas e lajes',
  pilares_vigas_laje: 'Pilares, vigas e lajes',
}

/** As três partes de cada caneta: P pilares, V vigas (e as outras peças da forma), L laje. */
const PARTES: Readonly<Record<AlvoDaArea, { P: boolean; V: boolean; L: boolean }>> = {
  pilares: { P: true, V: false, L: false },
  vigas: { P: false, V: true, L: false },
  laje: { P: false, V: false, L: true },
  pilares_vigas: { P: true, V: true, L: false },
  vigas_laje: { P: false, V: true, L: true },
  pilares_vigas_laje: { P: true, V: true, L: true },
}

export function ehCaneta(x: unknown): x is AlvoDaArea {
  return typeof x === 'string' && (CANETAS as readonly string[]).includes(x)
}

/**
 * A área vale nesta peça? Pilar (P) na caneta com pilares, laje (L) na com laje e o resto (viga e
 * outras peças da forma) na com vigas, como a "vigas e laje" de antes. Sem caneta = todas;
 * caneta desconhecida = nenhuma.
 */
export function valeNaPeca(alvo: unknown, tipo: string): boolean {
  if (alvo === null || alvo === undefined) return true
  if (!ehCaneta(alvo)) return false
  const p = PARTES[alvo]
  return tipo === 'P' ? p.P : tipo === 'L' ? p.L : p.V
}

/** A caneta põe a laje do trecho no caminhão (e a área fica cheia no mapa)? */
export function canetaComLaje(alvo: unknown): boolean {
  return ehCaneta(alvo) && PARTES[alvo].L
}

/**
 * Separa as peças de uma planta em pilares, vigas (com as outras peças da forma) e laje, cada grupo
 * com as áreas que valem nele. Assim a fração de uma peça soma todas as áreas que valem nela, de
 * qualquer caneta (meio pilar com "Pilares" e meio com "Pilares e vigas" = pilar inteiro).
 */
export function separarPorParte<P extends { id: string }, A extends { alvo?: unknown }>(
  pecas: readonly P[],
  tipoDe: (id: string) => string,
  areas: readonly A[],
): Array<{ pecas: P[]; areas: A[] }> {
  const parte = (t: string) => (t === 'P' ? 'P' : t === 'L' ? 'L' : 'V')
  return (['P', 'V', 'L'] as const).map((k) => ({
    pecas: pecas.filter((p) => parte(tipoDe(p.id)) === k),
    areas: areas.filter((a) => valeNaPeca(a.alvo, k)),
  }))
}

/** A área conta no rastreio da laje da FVS? As com laje e as antigas, sem caneta. */
export function contaNaLaje(alvo: unknown): boolean {
  return alvo === null || alvo === undefined || canetaComLaje(alvo)
}

/** Caneta que esta versão do app não conhece (gravada por um aparelho mais novo). */
export function canetaDesconhecida(alvo: unknown): boolean {
  return alvo !== null && alvo !== undefined && !ehCaneta(alvo)
}

/**
 * A laje do trecho fica no caminhão pelo desenho? true: alguma área é de caneta com laje;
 * false: nenhuma é; null: nenhuma conhecida é, mas há área de caneta desconhecida, que pode ser
 * de laje, então não se mexe na laje (26/11/2026: o aparelho antigo tirava a laje e gravava).
 */
export function lajePeloDesenho(alvos: readonly unknown[]): boolean | null {
  if (alvos.some(canetaComLaje)) return true
  return alvos.some(canetaDesconhecida) ? null : false
}
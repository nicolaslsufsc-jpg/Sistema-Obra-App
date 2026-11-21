// Formato das células da tabela comum (guia de estilo, docs/DESIGN.md › Textos):
// sem dado vira "–"; número com vírgula e casas fixas por coluna (volume: 25,5).
export type ValorCelula = string | number | null | undefined

export function textoDaCelulaTabela(v: ValorCelula, casas?: number): string {
  if (v === null || v === undefined || v === '') return '–'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '–'
    return casas === undefined
      ? v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
      : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
  }
  return v
}

/** "9 vigentes | 4 com revisão nova | 1 atrasado": as partes vazias saem. */
export function textoDoResumo(partes: ReadonlyArray<string | null | undefined | false>): string {
  return partes.filter((p): p is string => typeof p === 'string' && p.trim() !== '').join(' | ')
}

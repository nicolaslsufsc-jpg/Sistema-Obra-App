// A concretagem de exemplo (semeada pela casca do app para a apresentação, em relatorios/exemplos.ts)
// fica na mesma obra que as concretagens reais. Para ninguém confundir, ela aparece com o
// rótulo EXEMPLO nas telas e na ficha de concreto.
//
// Como reconhecer: o id dela é derivado de `${obra}:exemplo:conc:1` (a função uid() do
// exemplos.ts). Se essa chave mudar lá, mudar aqui também.
import { uuidDeterministico } from '../nucleo/pacote_obra'

export const ROTULO_EXEMPLO = 'EXEMPLO'

/** Chaves das concretagens de exemplo (relatorios/exemplos.ts): a de ontem e as 4 de outros pavimentos. */
export const CHAVES_DE_EXEMPLO = ['conc:1', 'conc:a', 'conc:b', 'conc:c', 'conc:d'] as const

/** Os ids de todas as concretagens de exemplo desta obra. */
export async function idsDasConcretagensDeExemplo(obraId: string): Promise<Set<string>> {
  return new Set(await Promise.all(CHAVES_DE_EXEMPLO.map((k) => uuidDeterministico(`${obraId}:exemplo:${k}`))))
}

export function idDaConcretagemDeExemplo(obraId: string): Promise<string> {
  return uuidDeterministico(`${obraId}:exemplo:conc:1`)
}

/**
 * Rótulo do código da ficha no sistema oficial da obra. Sem o nome do sistema: o app é genérico e
 * o nome não deve aparecer na tela nem no CSV (pedido da demonstração, 14/11).
 */
export const ROTULO_FICHA = 'Nº da ficha'

/** Local com barras invertidas ("Pilotis \ Trecho 2") parece caminho de arquivo: mostra com travessão. */
export function localLegivel(local: string): string {
  return local.replace(/\s*\\\s*/g, ' – ')
}

/** Nome da concretagem nas listas e títulos: "EXEMPLO · Pilotis – Trecho 1 – Pilares". */
export function nomeDaConcretagem(c: { local_descricao: string; exemplo?: boolean }): string {
  const local = c.local_descricao || 'sem local'
  // só o exemplo: o local dele vem com barras do relatorios/exemplos.ts; o de verdade fica como foi digitado
  return c.exemplo ? `${ROTULO_EXEMPLO} · ${localLegivel(local)}` : local
}

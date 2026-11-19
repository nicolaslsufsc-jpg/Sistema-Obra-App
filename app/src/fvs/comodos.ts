// Nome do cômodo de cada ambiente ("Living", "Suíte 01"), que vem no pacote da planta de ambientes
// (pipeline/fvs/ambientes.py, tabela por apartamento-tipo). O id e o nome do local continuam o número
// ("303-05"): o cômodo é só texto, para as telas e listas. Sem banco e sem tela, para as listas puras.

const comodos = new Map<string, string>()

/** Lembra (ou esquece) o cômodo de um ambiente, a cada manifest que passa pelo aparelho (pacote.ts). */
export function lembrarComodo(elementoId: string, comodo: string | undefined): void {
  if (comodo) comodos.set(elementoId, comodo)
  else comodos.delete(elementoId)
}

/** Nome do cômodo pelo pacote guardado no aparelho (undefined se não tem ou o pacote não passou por aqui). */
export function comodoGuardado(elementoId: string): string | undefined {
  return comodos.get(elementoId)
}

/** "303-05 · Suíte 01" (ou só "303-05" sem nome de cômodo). É como o ambiente aparece nas listas. */
export function nomeComComodo(nome: string, comodo?: string): string {
  return comodo ? `${nome} · ${comodo}` : nome
}

/** O nome da peça para as listas, com o cômodo se for ambiente com nome. */
export const nomeDaPeca = (peca: { id: string; nome: string }): string => nomeComComodo(peca.nome, comodoGuardado(peca.id))

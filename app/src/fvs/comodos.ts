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

/**
 * A ficha vale neste local? Só o ambiente pode dizer que não, pelo `sem_fichas` do pacote (tabela ficha × tipo
 * de cômodo da obra: piso cerâmico não vai no quarto, drywall não vai na sacada...). Sem ficha escolhida, sem o
 * campo ou outro tipo de local: vale, como antes da tabela.
 */
export function fichaValeNoLocal(e: { tipo: string; sem_fichas?: readonly string[] }, codigo: string | undefined): boolean {
  if (!codigo || e.tipo !== 'A' || !e.sem_fichas?.length) return true
  return !e.sem_fichas.includes(codigo)
}

/**
 * Ambientes sem tipo (25/11/2026, aviso do chat 22): numa planta com a tabela ficha × tipo de cômodo (algum ambiente
 * com `sem_fichas`), o cômodo que ficou sem nome num apartamento em que os outros têm nome não tem como dizer que
 * fichas valem nele, e caía em todas (piso cerâmico no quarto). Ele fica sem ficha, com o aviso, até ganhar o nome.
 * Planta sem a tabela, apartamento sem nenhum nome de cômodo e o quadrado da grade de escavação ficam como antes.
 */
export function ambientesSemTipo(
  elementos: Readonly<Record<string, { tipo: string; comodo?: string; grade?: string; grupo?: string; sem_fichas?: readonly string[] }>> | undefined,
): Set<string> {
  const ambientes = Object.entries(elementos ?? {}).filter(([, e]) => e.tipo === 'A' && !e.grade)
  if (!ambientes.some(([, e]) => e.sem_fichas?.length)) return new Set()
  const gruposComNome = new Set(ambientes.filter(([, e]) => e.comodo && e.grupo).map(([, e]) => e.grupo))
  return new Set(ambientes.filter(([, e]) => !e.comodo && e.grupo && gruposComNome.has(e.grupo)).map(([id]) => id))
}

/** O nome da peça para as listas, com o cômodo se for ambiente com nome. */
export const nomeDaPeca = (peca: { id: string; nome: string }): string => nomeComComodo(peca.nome, comodoGuardado(peca.id))

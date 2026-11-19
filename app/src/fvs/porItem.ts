// Modo "Por item" (modo invertido, pedido do Nicolas de 18/11/2026). Parte pura, sem banco e sem tela
// (porItem.test.ts).
//
// Hoje a pessoa escolhe a peça e depois os itens da ficha. No modo "Por item" ela escolhe UM item da
// ficha (o prumo, por exemplo) e vai tocando as peças na planta: cada toque marca só aquele item naquela
// peça. Vale para pilar, viga e ambiente (fatia 2, decisão do Nicolas de 18/11).
// Toque com "OK" escolhido na barra: sem conferir ou NA → C; C → NC (só com observação e Confirmar);
// NC → C, que é a reinspeção (rodada seguinte, V02). Diferente dos furos e das barras, o NC não volta a
// "sem conferir": aqui o registro é o próprio item da ficha, e NC desmarcado conta como engano (sai das
// reprovações). NC posto por engano sai pelo Desfazer do aviso ou pelo "Desmarcar NC" do painel.
// Toque com "NA" escolhido: sem conferir ou C → NA; NC → NA (reinspeção); NA → sem conferir.

import type { EventoFvs, Ficha, ItemFicha, Resultado } from './situacao'
import { ultimosPorItem } from './situacao'

/** O item escolhido: o número e o título (o título confere que é o mesmo item noutra revisão da ficha). */
export interface ItemEscolhido {
  n: number
  titulo: string
}

/** Os itens que dá para marcar por item: tira os automáticos (furos, barras), que outra coisa marca. */
export function itensParaEscolher(ficha: Ficha | undefined): ItemFicha[] {
  return (ficha?.itens ?? []).filter((it) => !it.furos && !it.barras)
}

const mesmoTitulo = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * O item escolhido na ficha desta peça. A ficha da peça pode ser outra revisão (a peça já foi marcada
 * nela): vale o mesmo número com o mesmo título. Item de consolo ou capitel só vale no pilar que tem a
 * parte na planta (`ficha.partesDaPeca`, de `fichaNaPeca`).
 */
export function itemNaPeca(
  ficha: Ficha | undefined,
  escolhido: ItemEscolhido,
): { item: ItemFicha } | { falta: 'ficha' | 'item' | 'parte'; parte?: string } {
  if (!ficha) return { falta: 'ficha' }
  const it = ficha.itens.find((i) => i.n === escolhido.n)
  if (!it || !mesmoTitulo(it.titulo, escolhido.titulo) || it.furos || it.barras) return { falta: 'item' }
  if (it.parte && !ficha.partesDaPeca?.includes(it.parte)) return { falta: 'parte', parte: it.parte }
  return { item: it }
}

/** O registro mais novo do item na ficha (undefined: nunca marcado). */
export function registroDoItem(ficha: Ficha, eventos: readonly EventoFvs[], n: number): EventoFvs | undefined {
  return ultimosPorItem(eventos.filter((e) => e.ficha_id === ficha.id)).get(n)
}

/** O resultado atual do item (null: sem conferir). */
export function resultadoDoItem(ficha: Ficha, eventos: readonly EventoFvs[], n: number): Resultado | null {
  return registroDoItem(ficha, eventos, n)?.resultado ?? null
}

/** O que o toque marca: OK (e, tocando de novo, NC) ou NA. */
export type ModoDoToque = 'C' | 'NA'

/**
 * O que o toque faz, pelo resultado atual e pelo modo escolhido na barra. 'C' e 'NA': grava esse
 * resultado (sobre um NC é a reinspeção, rodada seguinte); 'pedir-nc': abre a observação e o Confirmar;
 * 'limpar': volta a sem conferir (só o NA, no modo NA).
 */
export function proximoDoToque(atual: Resultado | null, modo: ModoDoToque = 'C'): 'C' | 'NA' | 'pedir-nc' | 'limpar' {
  if (modo === 'NA') return atual === 'NA' ? 'limpar' : 'NA'
  return atual === 'C' ? 'pedir-nc' : 'C'
}

/** Texto curto do resultado para o aviso. */
export function textoDoResultado(r: Resultado | null): string {
  return r === 'C' ? 'OK' : r === 'NC' ? 'errado' : r === 'NA' ? 'não se aplica' : 'sem conferir'
}

/** Contador da barra: "7 de 32 OK · 1 errado". NA conta como resolvido (como na ficha), mas não como OK. */
export function resumoDoItem(resultados: ReadonlyArray<Resultado | null>): { total: number; ok: number; erradas: number; na: number; texto: string } {
  const ok = resultados.filter((r) => r === 'C').length
  const erradas = resultados.filter((r) => r === 'NC').length
  const na = resultados.filter((r) => r === 'NA').length
  const partes = [`${ok} de ${resultados.length - na} OK`]
  if (erradas) partes.push(`${erradas} errado${erradas > 1 ? 's' : ''}`)
  if (na) partes.push(`${na} NA`)
  return { total: resultados.length, ok, erradas, na, texto: partes.join(' · ') }
}

/** Nome do item para a lista e a barra: "4. Prumo", "12. Forma (consolo)". */
export function nomeDoItem(it: Pick<ItemFicha, 'n' | 'titulo' | 'parte'>): string {
  return `${it.n}. ${it.titulo}${it.parte ? ` (${it.parte})` : ''}`
}

/** Por obra e por tipo de local (e, nos ambientes, por ficha: cada serviço tem os seus itens). */
const chave = (obraId: string, onde: string) => `fvs_por_item:${obraId}:${onde}`

/** O item escolhido da última vez nesta obra, neste tipo (para continuar de onde parou). Sem localStorage: nada. */
export function itemGuardado(obraId: string, onde: string): ItemEscolhido | null {
  try {
    const v = JSON.parse(localStorage.getItem(chave(obraId, onde)) ?? 'null')
    return v && typeof v.n === 'number' && typeof v.titulo === 'string' ? { n: v.n, titulo: v.titulo } : null
  } catch {
    return null
  }
}

export function guardarItem(obraId: string, onde: string, it: ItemEscolhido) {
  try {
    localStorage.setItem(chave(obraId, onde), JSON.stringify({ n: it.n, titulo: it.titulo }))
  } catch {
    // sem localStorage (modo privado): o modo funciona, só não lembra o item
  }
}

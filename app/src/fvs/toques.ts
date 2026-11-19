// Diário de toques: um toque aceito não se perde se a página recarregar no mesmo instante (S3).
//
// A gravação no banco do aparelho (IndexedDB) é assíncrona: num tablet lento, um recarregar logo
// depois do toque chega antes de a transação terminar, e a marcação some sem aviso. O localStorage
// grava na hora (síncrono) e sobrevive ao recarregar. Então, no instante do toque, o app anota o
// que foi pedido; quando o banco confirma, a anotação sai. Ao abrir a FVS, o que ficou anotado e
// não está no banco é refeito, na ordem, com o mesmo id (e o mesmo lote).
//
// Limite: o toque refeito leva a hora da reabertura (o núcleo põe a hora; docs/02).
import type { Linha } from '../nucleo/banco_local'
import type { Resultado } from './situacao'

interface Base {
  /** id do registro (toque) ou do lote; anotado antes de gravar */
  id: string
  obraId: string
  usuarioId: string
  plantaId: string | null
  fichaCampoId: string | null
}

export type Toque =
  | (Base & { tipo: 'item'; pecaId: string; fichaId: string; item: number; resultado: Resultado; observacao?: string | null })
  | (Base & { tipo: 'desmarcar'; pecaId: string; fichaId: string; item: number })
  | (Base & { tipo: 'lote'; pecas: Array<{ id: string; fichaId: string; fichaCampoId: string | null }>; etapa: string | null; resultado: 'C' | 'NA' })

const chave = (obraId: string) => `fvs_toques:${obraId}`

/** O que está anotado e ainda não foi confirmado pelo banco. Sem localStorage (modo privado), nada. */
export function toquesAnotados(obraId: string): Toque[] {
  try {
    const t = JSON.parse(localStorage.getItem(chave(obraId)) ?? '[]')
    return Array.isArray(t) ? (t as Toque[]) : []
  } catch {
    return []
  }
}

function guardar(obraId: string, lista: Toque[]) {
  try {
    if (lista.length) localStorage.setItem(chave(obraId), JSON.stringify(lista))
    else localStorage.removeItem(chave(obraId))
  } catch {
    // sem espaço ou sem localStorage: o toque segue pelo caminho normal, só sem a rede de segurança
  }
}

/** No instante do toque (síncrono): anota o pedido. */
export function anotarToque(t: Toque): Toque {
  guardar(t.obraId, [...toquesAnotados(t.obraId), t])
  return t
}

/** O banco confirmou (ou a gravação falhou com aviso na tela): a anotação sai. */
export function esquecerToque(obraId: string, id: string) {
  const lista = toquesAnotados(obraId)
  const resto = lista.filter((t) => t.id !== id)
  if (resto.length !== lista.length) guardar(obraId, resto)
}

/**
 * Refaz, na ordem, os toques anotados que não chegaram ao banco. `jaGravado` diz se o registro de
 * um toque de item já está no aparelho (aí só sai a anotação). O lote é refeito sempre: os itens que
 * já entraram não estão mais vazios, e só os que faltaram são marcados, com o mesmo lote.
 * Devolve quantos toques foram refeitos.
 */
export async function refazerToques(
  obraId: string,
  jaGravado: (id: string) => Promise<boolean>,
  refazer: (t: Toque) => Promise<Linha | Linha[]>,
): Promise<number> {
  let refeitos = 0
  for (const t of toquesAnotados(obraId)) {
    try {
      if (t.tipo === 'lote') {
        const l = (await refazer(t)) as Linha[]
        if (l.length) refeitos++
      } else if (!(await jaGravado(t.id))) {
        await refazer(t)
        refeitos++
      }
    } catch (e) {
      console.error('FVS: toque anotado não pôde ser refeito', e)
    } finally {
      esquecerToque(obraId, t.id)
    }
  }
  return refeitos
}

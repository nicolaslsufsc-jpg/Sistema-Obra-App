// Revisões da prancha de um trecho. A planta nova entra com substitui_id apontando para a anterior.
//
// O cadastro da revisão nova chega ao aparelho bem antes do pacote, porque são poucos bytes. Com
// internet ruim na obra, apagar a planta antiga nessa hora deixaria a pessoa sem planta nenhuma. Por
// isso o pacote da revisão anterior só sai do aparelho depois que o da nova chegou; até lá a planta
// abre nele, com um aviso.

export interface LinhaDePlanta {
  id: string
  substitui_id?: unknown
  revisao?: unknown
}

export interface RevisaoAnterior {
  id: string
  revisao: string
}

export interface CadeiaDeRevisoes {
  /** planta vigente -> revisões anteriores do trecho, da mais nova para a mais antiga */
  anterioresDe: Map<string, RevisaoAnterior[]>
  /** planta substituída -> planta vigente do trecho */
  vigenteDe: Map<string, string>
}

export function cadeiaDeRevisoes(linhas: readonly LinhaDePlanta[]): CadeiaDeRevisoes {
  const porId = new Map(linhas.map((l) => [l.id, l]))
  const substituidas = new Set(linhas.map((l) => l.substitui_id).filter(Boolean))
  const anterioresDe = new Map<string, RevisaoAnterior[]>()
  const vigenteDe = new Map<string, string>()
  for (const vigente of linhas) {
    if (substituidas.has(vigente.id)) continue
    const anteriores: RevisaoAnterior[] = []
    const vistas = new Set([vigente.id])
    let atual = vigente
    for (;;) {
      const anterior = atual.substitui_id ? porId.get(String(atual.substitui_id)) : undefined
      if (!anterior || vistas.has(anterior.id)) break
      vistas.add(anterior.id)
      anteriores.push({ id: anterior.id, revisao: String(anterior.revisao ?? '') })
      vigenteDe.set(anterior.id, vigente.id)
      atual = anterior
    }
    if (anteriores.length) anterioresDe.set(vigente.id, anteriores)
  }
  return { anterioresDe, vigenteDe }
}

/** Os textos da planta que abre num pacote mais velho que o dela. */
export interface TextosDaRevisao {
  /** a linha de aviso no menu */
  aviso: string
  /** o botão que abre o que está no aparelho */
  abrir: string
  /** o botão que baixa a vigente (o tamanho vem depois) */
  baixar: string
  /** a faixa dentro da planta */
  faixa: string
}

/**
 * Textos quando o pacote do aparelho é de outra planta do trecho (a vigente tem outro id). Revisão
 * diferente: "Revisão nova". Mesma revisão (a prancha foi publicada de novo, 24/11/2026): "Planta
 * atualizada", sem falar em revisão nova.
 */
export function textosDaRevisao(vigente: { revisao?: unknown }, noAparelho: RevisaoAnterior): TextosDaRevisao {
  const nova = String(vigente.revisao ?? '').trim()
  const velha = noAparelho.revisao.trim()
  if (nova === velha) {
    return { aviso: 'Planta atualizada · Baixar de novo', abrir: 'Abrir', baixar: 'Baixar de novo', faixa: 'Planta atualizada no servidor.' }
  }
  return {
    aviso: `Revisão nova: no aparelho ainda está a ${velha}`,
    abrir: `Abrir ${velha}`,
    baixar: `Baixar ${nova}`,
    faixa: `Planta na revisão ${velha}. Já saiu a ${nova}.`,
  }
}

/**
 * O aviso de um grupo de plantas (o pavimento na lista, a disciplina no menu do pavimento), para a pessoa
 * ver antes de entrar (rodada 9 do testador, 24/11/2026): alguma com revisão nova a baixar dá "Revisão
 * nova para baixar"; só mesma revisão com id novo dá "Planta atualizada · Baixar de novo". Nada a baixar: null.
 */
export function avisoDasPlantas(
  plantas: readonly { id: string; revisao?: unknown }[],
  anterioresDe: ReadonlyMap<string, readonly RevisaoAnterior[]>,
  noAparelho: { has(id: string): boolean },
): string | null {
  let novas = 0
  let atualizadas = 0
  for (const p of plantas) {
    if (noAparelho.has(p.id)) continue
    const antiga = anterioresDe.get(p.id)?.find((a) => noAparelho.has(a.id))
    if (!antiga) continue
    if (textosDaRevisao(p, antiga).abrir === 'Abrir') atualizadas++
    else novas++
  }
  if (novas) return novas === 1 ? 'Revisão nova para baixar' : `${novas} revisões novas para baixar`
  if (atualizadas) return atualizadas === 1 ? 'Planta atualizada · Baixar de novo' : `${atualizadas} plantas atualizadas · Baixar de novo`
  return null
}

/** O pacote com que a planta abre: o dela ou, se ainda não baixou, o da revisão anterior mais nova. */
export function pacoteDaPlanta(plantaId: string, anteriores: readonly RevisaoAnterior[] | undefined, noAparelho: { has(id: string): boolean }): string | undefined {
  if (noAparelho.has(plantaId)) return plantaId
  return anteriores?.find((a) => noAparelho.has(a.id))?.id
}

/** O que fica no aparelho na limpeza: as plantas vigentes e o pacote com que cada uma abre hoje. */
export function pacotesAManter(vigentes: Iterable<string>, anterioresDe: ReadonlyMap<string, readonly RevisaoAnterior[]>, noAparelho: { has(id: string): boolean }): Set<string> {
  const manter = new Set<string>()
  for (const id of vigentes) {
    manter.add(id)
    const pacote = pacoteDaPlanta(id, anterioresDe.get(id), noAparelho)
    if (pacote) manter.add(pacote)
  }
  return manter
}

/**
 * O que fica no aparelho na limpeza ao abrir a FVS: o de pacotesAManter e também o pacote de planta que
 * estes dados ainda não conhecem. Os dados podem ter sido lidos antes de a sincronização trazer o cadastro
 * das plantas (a FVS abre com a leitura feita no menu, logo depois do login): sem isto, a limpeza
 * apagava as plantas que o menu tinha acabado de baixar, e a pessoa baixava a obra inteira de novo
 * (servidor, 24/11/2026: 71 plantas baixadas às 12h36 e baixadas de novo uma a uma a partir das 12h40).
 * Da obra, só sai a revisão anterior (planta que os dados conhecem como substituída), depois que a nova chegou.
 */
export function manterNaLimpeza(
  vigentes: { has(id: string): boolean; keys(): Iterable<string> },
  anterioresDe: ReadonlyMap<string, readonly RevisaoAnterior[]>,
  vigenteDe: { has(id: string): boolean },
  noAparelho: { has(id: string): boolean; keys(): Iterable<string> },
): Set<string> {
  const manter = pacotesAManter(vigentes.keys(), anterioresDe, noAparelho)
  for (const id of noAparelho.keys()) if (!vigentes.has(id) && !vigenteDe.has(id)) manter.add(id)
  return manter
}

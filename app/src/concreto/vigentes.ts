// Correções em tabela de evento (só inclusão): uma linha nova com substitui_id = linha antiga.
// cancelado = true na correção apaga o registro. Vale a linha que ninguém substituiu.
//
// Identidade estável: as outras tabelas apontam sempre para a RAIZ (primeira versão) do
// registro. Ex.: a área desenhada guarda caminhao_id = raiz do caminhão, mesmo depois de
// corrigida a nota fiscal dele.

import type { Linha } from '../nucleo/banco_local'

export interface Corrigivel extends Linha {
  substitui_id?: string | null
  cancelado?: boolean | null
}

export type Vigente<T> = T & { raiz: string }

function maisRecente(a: Linha, b: Linha): Linha {
  if (a.criado_em_dispositivo !== b.criado_em_dispositivo) {
    return a.criado_em_dispositivo > b.criado_em_dispositivo ? a : b
  }
  return a.id > b.id ? a : b
}

/**
 * Versão que vale de cada registro, sem os cancelados.
 * Dois aparelhos corrigiram a mesma linha sem internet: vale a correção mais recente
 * (hora do aparelho; empate pelo id), as outras ficam só no histórico.
 */
export function vigentes<T extends Corrigivel>(linhas: readonly T[]): Vigente<T>[] {
  const porId = new Map<string, T>()
  for (const l of linhas) porId.set(l.id, l)

  // raiz de cada linha: sobe por substitui_id até a primeira versão
  // (se a anterior ainda não chegou ao aparelho, a raiz é o id dela)
  const raizDe = new Map<string, string>()
  const achaRaiz = (l: T): string => {
    const conhecida = raizDe.get(l.id)
    if (conhecida) return conhecida
    let atual: T = l
    let raiz = l.id
    for (let passos = 0; passos < 10_000; passos++) {
      const anterior = atual.substitui_id
      if (!anterior) {
        raiz = atual.id
        break
      }
      const pai = porId.get(anterior)
      if (!pai) {
        raiz = anterior
        break
      }
      const ja = raizDe.get(pai.id)
      if (ja) {
        raiz = ja
        break
      }
      atual = pai
    }
    raizDe.set(l.id, raiz)
    return raiz
  }

  const substituidas = new Set<string>()
  for (const l of linhas) if (l.substitui_id) substituidas.add(l.substitui_id)

  // por raiz, a folha (linha não substituída) mais recente
  const vencedora = new Map<string, T>()
  for (const l of linhas) {
    if (substituidas.has(l.id)) continue
    const raiz = achaRaiz(l)
    const atual = vencedora.get(raiz)
    vencedora.set(raiz, atual ? (maisRecente(atual, l) as T) : l)
  }

  const saida: Vigente<T>[] = []
  for (const [raiz, l] of vencedora) {
    if (l.cancelado) continue
    saida.push({ ...l, raiz })
  }
  return saida
}

/**
 * Campos para registrar a correção de uma linha vigente: copia as colunas do módulo,
 * troca o que mudou e aponta substitui_id para a versão atual.
 */
export function camposDeCorrecao(
  atual: Vigente<Corrigivel>,
  colunas: readonly string[],
  mudancas: Record<string, unknown>,
): Record<string, unknown> {
  const campos: Record<string, unknown> = {}
  for (const c of colunas) if (c in atual) campos[c] = atual[c]
  return { ...campos, ...mudancas, substitui_id: atual.id }
}

/** Último registro de cada chave (hora do aparelho; empate pelo id). */
export function ultimoPorChave<T extends Linha>(linhas: readonly T[], chave: (l: T) => string): Map<string, T> {
  const m = new Map<string, T>()
  for (const l of linhas) {
    const k = chave(l)
    const atual = m.get(k)
    m.set(k, atual ? (maisRecente(atual, l) as T) : l)
  }
  return m
}

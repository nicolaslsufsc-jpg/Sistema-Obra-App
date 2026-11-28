// Desfazer do mapa do caminhão (27/11/2026, revisor e Professor): o botão volta a última ação feita
// na tela, e não "apaga a área mais recente". Antes, depois da Borracha ou de um recorte, o
// Desfazer apagava o que sobrou da área em vez de devolver o pedaço.
//
// Cada ação guarda os passos que a desfazem. Tudo continua sendo linha nova no banco (cancelar,
// corrigir ou registrar), como o resto do módulo: o histórico guarda as duas versões.
//   - tirar:  a área que a ação criou sai (cancelar);
//   - voltar: a área que a ação mudou volta ao contorno de antes (corrigir);
//   - repor:  a área que a ação apagou é gravada de novo, igual (registrar).
// A pilha fica só na memória da tela: ao sair do mapa, não há o que desfazer.

import type { Ponto } from './geometria'

export type PassoDoDesfazer =
  | { tipo: 'tirar'; raiz: string }
  | { tipo: 'voltar'; raiz: string; contorno: Ponto[] }
  | { tipo: 'repor'; planta_ref: string; contorno: Ponto[]; alvo: unknown }

export type TipoDaAcao = 'desenho' | 'apagar' | 'recorte' | 'canto' | 'tudo'

export interface AcaoDoMapa {
  tipo: TipoDaAcao
  /** raiz do caminhão */
  caminhao: string
  /** planta em que a ação foi feita (o Desfazer vale só para a planta aberta) */
  planta: string
  passos: PassoDoDesfazer[]
}

/** Quantas ações a tela guarda. */
export const MAX_ACOES = 30

export function guardarAcao(pilha: readonly AcaoDoMapa[], acao: AcaoDoMapa): AcaoDoMapa[] {
  if (acao.passos.length === 0) return [...pilha]
  return [...pilha, acao].slice(-MAX_ACOES)
}

/** A última ação deste caminhão nesta planta e a pilha sem ela; null quando não há. */
export function tirarUltima(pilha: readonly AcaoDoMapa[], caminhao: string, planta: string): { acao: AcaoDoMapa; resto: AcaoDoMapa[] } | null {
  for (let i = pilha.length - 1; i >= 0; i--) {
    const a = pilha[i]
    if (a.caminhao === caminhao && a.planta === planta) return { acao: a, resto: [...pilha.slice(0, i), ...pilha.slice(i + 1)] }
  }
  return null
}

export interface PlanoDoDesfazer<A> {
  tirar: A[]
  voltar: Array<{ area: A; contorno: Ponto[] }>
  repor: Array<{ planta_ref: string; contorno: Ponto[]; alvo: unknown }>
  /** passos que não dá mais para fazer: a área já mudou ou saiu (outro aparelho, por exemplo) */
  perdidos: number
}

/** O que gravar para desfazer a ação, com as áreas que estão valendo agora no aparelho. */
export function planoDoDesfazer<A extends { raiz: string }>(acao: AcaoDoMapa, vigentes: readonly A[]): PlanoDoDesfazer<A> {
  const porRaiz = new Map(vigentes.map((a) => [a.raiz, a]))
  const plano: PlanoDoDesfazer<A> = { tirar: [], voltar: [], repor: [], perdidos: 0 }
  for (const p of acao.passos) {
    if (p.tipo === 'repor') {
      plano.repor.push({ planta_ref: p.planta_ref, contorno: p.contorno, alvo: p.alvo })
      continue
    }
    const a = porRaiz.get(p.raiz)
    if (!a) plano.perdidos++
    else if (p.tipo === 'tirar') plano.tirar.push(a)
    else plano.voltar.push({ area: a, contorno: p.contorno })
  }
  return plano
}

export const TEXTO_DO_DESFAZER: Record<TipoDaAcao, string> = {
  desenho: 'Última área apagada.',
  apagar: 'A área apagada voltou.',
  recorte: 'O pedaço recortado voltou.',
  canto: 'O canto voltou para onde estava.',
  tudo: 'As áreas apagadas voltaram.',
}

// Pontos de instalações (frente INSTALAÇÕES, 20/11/2026; opção B do Nicolas: "Sim, no ambiente"). Parte
// pura, sem banco e sem tela (pontos.test.ts).
//
// A planta de uma disciplina (hidro, sanitário) traz os pontos do modelo (ralo, caixa sifonada, ponto de
// água, registro...) no pacote, como sobreposição ("pontos", pipeline/fvs/instalacoes.py), como as barras de
// laje: o ponto não é peça em "elementos". Na aba Pontos a pessoa toca no ponto: OK, ou errado (só com
// observação e Confirmar). O registro vai em fvs_eventos.barra_id (local de sobreposição: barra ou ponto),
// com planta_id, no item da ficha de ambiente marcado com `"pontos": "<disciplina>"`.

import type { Ficha, ItemFicha } from './situacao'

export type DisciplinaDePontos = 'hidro' | 'sanitario' | 'eletrico' | 'spda'
export type TipoDePonto =
  | 'ponto_agua'
  | 'registro'
  | 'hidrometro'
  | 'ralo'
  | 'caixa_sifonada'
  | 'caixa'
  | 'ponto_esgoto'
  // elétrico (laje e quadros) e SPDA, 20/11/2026
  | 'caixa_passagem'
  | 'ponto_luz'
  | 'quadro'
  | 'captor'
  | 'descida'
  | 'caixa_inspecao'
  | 'haste'

export interface PontoPacote {
  disciplina: DisciplinaDePontos
  tipo: TipoDePonto
  /** posição na folha, pontos do PDF, y para baixo */
  ponto: [number, number]
  nome: string
  /** id do objeto no modelo IFC */
  modelo_id?: string
}

export const NOME_DA_DISCIPLINA: Record<DisciplinaDePontos, string> = {
  hidro: 'Água fria e quente',
  sanitario: 'Esgoto e pluvial',
  eletrico: 'Caixas e quadros',
  spda: 'Captores e descidas',
}

export const NOME_DO_TIPO: Record<TipoDePonto, string> = {
  ponto_agua: 'Ponto de água',
  registro: 'Registro',
  hidrometro: 'Hidrômetro',
  ralo: 'Ralo',
  caixa_sifonada: 'Caixa sifonada',
  caixa: 'Caixa',
  ponto_esgoto: 'Ponto de esgoto',
  caixa_passagem: 'Caixa de passagem',
  ponto_luz: 'Ponto de luz',
  quadro: 'Quadro',
  captor: 'Captor',
  descida: 'Descida',
  caixa_inspecao: 'Caixa de inspeção',
  haste: 'Haste de aterramento',
}

type Pt = readonly [number, number]

/**
 * O ponto mais perto do toque, até `raio` (em pontos da folha). Dois pontos a menos de `folga` de
 * diferença: ambíguo (a pessoa aproxima a planta).
 */
export function pontoTocado(p: Pt, pontos: Readonly<Record<string, PontoPacote>>, raio: number, folga: number): { id: string } | { ambiguo: true } | null {
  let a: [number, string] | null = null
  let b: [number, string] | null = null
  for (const [id, q] of Object.entries(pontos)) {
    const d = Math.hypot(q.ponto[0] - p[0], q.ponto[1] - p[1])
    if (d > raio) continue
    if (!a || d < a[0]) {
      b = a
      a = [d, id]
    } else if (!b || d < b[0]) b = [d, id]
  }
  if (!a) return null
  if (b && b[0] - a[0] < folga) return { ambiguo: true }
  return { id: a[1] }
}

/** O item da ficha que os pontos da disciplina marcam (`"pontos": "<disciplina>"` no item), se houver. */
export function itemDosPontos(ficha: Ficha | undefined, disciplina: DisciplinaDePontos): ItemFicha | undefined {
  return ficha?.itens.find((i) => i.pontos === disciplina)
}

/** A primeira ficha (das de ambiente) com o item dos pontos da disciplina, e o número do item. */
export function fichaDosPontos(fichas: readonly Ficha[], disciplina: DisciplinaDePontos): { ficha: Ficha; item: number } | undefined {
  for (const f of fichas) {
    const it = itemDosPontos(f, disciplina)
    if (it) return { ficha: f, item: it.n }
  }
  return undefined
}

/** Nome do ponto para a pessoa: "Ralo seco 100x100 (ralo)", ou só o tipo. */
export function nomeDoPonto(p: PontoPacote): string {
  const tipo = NOME_DO_TIPO[p.tipo] ?? p.tipo
  return p.nome && p.nome !== tipo ? `${p.nome} (${tipo.toLowerCase()})` : tipo
}

/** Quantos pontos de cada tipo (para o rodapé da aba): "3 ralos, 1 caixa sifonada". */
export function resumoDosPontos(pontos: Readonly<Record<string, PontoPacote>>): Array<[TipoDePonto, number]> {
  const n = new Map<TipoDePonto, number>()
  for (const p of Object.values(pontos)) n.set(p.tipo, (n.get(p.tipo) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

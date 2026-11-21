// Pontos de instalações (frente INSTALAÇÕES, 20/11/2026; opção B do Nicolas: "Sim, no ambiente"). Parte
// pura, sem banco e sem tela (pontos.test.ts).
//
// A planta de uma disciplina (hidro, sanitário) traz os pontos do modelo (ralo, caixa sifonada, ponto de
// água, registro...) no pacote, como sobreposição ("pontos", pipeline/fvs/instalacoes.py), como as barras de
// laje: o ponto não é peça em "elementos". Na aba Pontos a pessoa toca no ponto: OK, ou errado (só com
// observação e Confirmar). O registro vai em fvs_eventos.barra_id (local de sobreposição: barra ou ponto),
// com planta_id, no item da ficha de ambiente marcado com `"pontos": "<disciplina>"`.

import type { Ficha, ItemFicha } from './situacao'

export type DisciplinaDePontos = 'hidro' | 'sanitario' | 'eletrico' | 'preventivo' | 'spda'
/** Na ordem do menu (pedido do Nicolas, 21/11/2026: hidráulico, esgoto, elétrico, preventivo, SPDA). */
export const DISCIPLINAS_DE_PONTOS: readonly DisciplinaDePontos[] = ['hidro', 'sanitario', 'eletrico', 'preventivo', 'spda']

/** A disciplina de pontos do manifest. A planta de furação também vem com "disciplina" ("furacao", pacote do
 *  20 de 21/11/2026) e não é planta de pontos: devolve undefined. */
export function disciplinaDePontos(d: string | undefined): DisciplinaDePontos | undefined {
  return (DISCIPLINAS_DE_PONTOS as readonly string[]).includes(d ?? '') ? (d as DisciplinaDePontos) : undefined
}
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
  // eletroduto como linha (21/11/2026, "eletroduto como linha"): tem "linha" além de "ponto"
  | 'eletroduto'
  // preventivo contra incêndio (21/11/2026; sem PES nem PVS na obra piloto: suposição); a tubulação é linha
  | 'hidrante'
  | 'extintor'
  | 'sprinkler'
  | 'detector'
  | 'iluminacao_emergencia'
  | 'alarme'
  | 'sinalizacao'
  | 'tubo_incendio'

export interface PontoPacote {
  disciplina: DisciplinaDePontos
  tipo: TipoDePonto
  /** posição na folha, pontos do PDF, y para baixo (no eletroduto, o meio da linha) */
  ponto: [number, number]
  /** só no que é linha (eletroduto): começo e fim na folha */
  linha?: Array<[number, number]>
  nome: string
  /** id do objeto no modelo IFC */
  modelo_id?: string
}

export const NOME_DA_DISCIPLINA: Record<DisciplinaDePontos, string> = {
  hidro: 'Água fria e quente',
  sanitario: 'Esgoto e pluvial',
  eletrico: 'Caixas, quadros e eletrodutos',
  preventivo: 'Hidrantes, extintores e sprinklers',
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
  eletroduto: 'Eletroduto',
  hidrante: 'Hidrante',
  extintor: 'Extintor',
  sprinkler: 'Sprinkler',
  detector: 'Detector',
  iluminacao_emergencia: 'Iluminação de emergência',
  alarme: 'Alarme',
  sinalizacao: 'Sinalização',
  tubo_incendio: 'Tubulação de incêndio',
}

type Pt = readonly [number, number]

function distAoSegmento(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Distância do toque ao ponto, ou à linha quando ele é linha (eletroduto). */
export function distanciaAoPonto(p: Pt, q: PontoPacote): number {
  if (q.linha && q.linha.length >= 2) {
    let melhor = Infinity
    for (let i = 0; i + 1 < q.linha.length; i++) melhor = Math.min(melhor, distAoSegmento(p, q.linha[i], q.linha[i + 1]))
    return melhor
  }
  return Math.hypot(q.ponto[0] - p[0], q.ponto[1] - p[1])
}

/**
 * O ponto mais perto do toque, até `raio` (em pontos da folha). Dois pontos a menos de `folga` de
 * diferença: ambíguo (a pessoa aproxima a planta). O círculo ganha da linha: o eletroduto termina na caixa,
 * e o toque na caixa é da caixa; a linha só é escolhida quando não há círculo debaixo do dedo.
 */
export function pontoTocado(p: Pt, pontos: Readonly<Record<string, PontoPacote>>, raio: number, folga: number): { id: string } | { ambiguo: true } | null {
  const ehLinha = (q: PontoPacote) => !!q.linha && q.linha.length >= 2
  return (
    maisPerto(p, Object.entries(pontos).filter(([, q]) => !ehLinha(q)), raio, folga) ??
    maisPerto(p, Object.entries(pontos).filter(([, q]) => ehLinha(q)), raio, folga)
  )
}

function maisPerto(p: Pt, pontos: ReadonlyArray<[string, PontoPacote]>, raio: number, folga: number): { id: string } | { ambiguo: true } | null {
  let a: [number, string] | null = null
  let b: [number, string] | null = null
  for (const [id, q] of pontos) {
    const d = distanciaAoPonto(p, q)
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

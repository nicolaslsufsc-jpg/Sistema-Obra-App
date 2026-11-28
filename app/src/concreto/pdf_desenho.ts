// Desenho dos caminhões para o PDF do relatório da concretagem (26/11/2026, pedido do Nicolas: o
// desenho "no final", junto do relatório). Uma figura por planta (trecho) que tem área: o recorte
// da planta em volta das áreas, as áreas unidas por caminhão (uniao.ts) e o número de cada um.
// Aqui só os dados da figura; quem desenha é telas/DesenhoPdf.tsx (SVG, sem biblioteca).

import { caixaDe, type Caixa, type Ponto } from './geometria'
import type { PlantaPavimento } from './planta'
import { unirAreas, type GrupoDeAreas } from './uniao'

export interface CaminhaoNoDesenho {
  sequencia: number
  cor: string
  areas: ReadonlyArray<{ id: string; contorno: ReadonlyArray<readonly [number, number]>; alvo?: unknown }>
}

export interface LadrilhoDoFundo {
  url: string
  x: number
  y: number
  lado: number
}

export interface FiguraDoDesenho {
  trecho: string
  /** recorte da planta, em px da planta: x, y, largura, altura */
  recorte: [number, number, number, number]
  ladrilhos: LadrilhoDoFundo[]
  /** peças da planta dentro do recorte (só na planta sem fundo: a de fundo já traz o desenho) */
  pecas: Array<{ nome: string; polys: readonly (readonly Ponto[])[]; centro: Ponto }>
  caminhoes: Array<{ sequencia: number; cor: string; grupos: GrupoDeAreas[] }>
}

/** No máximo este tanto de ladrilhos por figura (cada um é uma imagem no PDF). */
export const MAX_LADRILHOS = 48

/** Nível do fundo com mais detalhe que ainda cabe no limite de ladrilhos. */
export function nivelDoFundo(niveis: readonly number[], tile: number, largura: number, altura: number, maximo = MAX_LADRILHOS): number {
  const ordenados = [...niveis].sort((a, b) => b - a)
  for (const z of ordenados) {
    const lado = tile / Math.pow(2, z)
    if ((Math.floor(largura / lado) + 2) * (Math.floor(altura / lado) + 2) <= maximo) return z
  }
  return ordenados[ordenados.length - 1]
}

const tocam = (a: Caixa, x0: number, y0: number, x1: number, y1: number) => a.x0 <= x1 && a.x1 >= x0 && a.y0 <= y1 && a.y1 >= y0

/**
 * A figura de uma planta: null quando nenhum caminhão tem área nela. `margem` é a folga em volta
 * das áreas, em fração do tamanho delas.
 */
export function figuraDoDesenho(planta: PlantaPavimento, caminhoes: readonly CaminhaoNoDesenho[], margem = 0.15): FiguraDoDesenho | null {
  const comArea = caminhoes
    .map((c) => ({ ...c, areas: c.areas.filter((a) => a.contorno.length >= 3) }))
    .filter((c) => c.areas.length > 0)
  if (comArea.length === 0) return null
  const caixa = caixaDe(comArea.flatMap((c) => c.areas.flatMap((a) => a.contorno as Ponto[])))
  const folga = Math.max(caixa.x1 - caixa.x0, caixa.y1 - caixa.y0) * margem + 20
  const x0 = Math.max(0, caixa.x0 - folga)
  const y0 = Math.max(0, caixa.y0 - folga)
  const x1 = Math.min(planta.largura, caixa.x1 + folga)
  const y1 = Math.min(planta.altura, caixa.y1 + folga)
  const largura = x1 - x0
  const altura = y1 - y0

  const ladrilhos: LadrilhoDoFundo[] = []
  const f = planta.fundo
  if (f && f.niveis.length > 0) {
    const z = nivelDoFundo(f.niveis, f.tile, largura, altura)
    const lado = f.tile / Math.pow(2, z)
    for (let ty = Math.floor(y0 / lado); ty * lado < y1; ty++) {
      for (let tx = Math.floor(x0 / lado); tx * lado < x1; tx++) {
        const url = f.url(z, tx, ty)
        if (url) ladrilhos.push({ url, x: tx * lado, y: ty * lado, lado })
      }
    }
  }
  const pecas = f
    ? []
    : planta.elementos
        .filter((e) => e.polys.length > 0 && e.polys.some((p) => tocam(caixaDe(p), x0, y0, x1, y1)))
        .map((e) => ({ nome: e.nome, polys: e.polys, centro: [(e.rotulo[0] + e.rotulo[2]) / 2, (e.rotulo[1] + e.rotulo[3]) / 2] as Ponto }))
  return {
    trecho: planta.trecho,
    recorte: [x0, y0, largura, altura],
    ladrilhos,
    pecas,
    caminhoes: comArea.map((c) => ({ sequencia: c.sequencia, cor: c.cor, grupos: unirAreas(c.areas) })),
  }
}

/** Caminho SVG ("M x y L ... Z") de um anel fechado. */
export function caminhoFechado(p: readonly Ponto[]): string {
  return p.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`).join('') + 'Z'
}

/** Caminho SVG de uma linha aberta. */
export function caminhoAberto(p: readonly Ponto[]): string {
  return p.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`).join('')
}

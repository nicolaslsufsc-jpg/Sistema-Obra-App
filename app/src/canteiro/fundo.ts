// Fundo do mapa do canteiro: a planta de um pavimento que já está no aparelho (o mesmo formato que a
// FVS entrega ao Concreto, fvs/plantas.ts) ou a folha em branco com grade.
// A planta vem em pedaços de imagem por nível: no nível z, cada pixel da planta vale 2^z pixels da
// imagem, e o pedaço (x, y) cobre `tile` pixels de imagem a partir de (x * tile, y * tile).

import { LARGURA, type Folha } from './logica'

export interface PlantaDeFundo {
  id: string
  titulo: string
  largura: number
  altura: number
  fundo?: {
    tile: number
    niveis: readonly number[]
    url: (z: number, x: number, y: number) => string | undefined
  }
  /** Peças desenhadas por cima quando não há imagem (planta de teste). */
  elementos?: ReadonlyArray<{ polys: ReadonlyArray<ReadonlyArray<readonly [number, number]>> }>
}

/** Um pedaço de imagem já na medida da folha (largura 1000). */
export interface Pedaco {
  href: string
  x: number
  y: number
  lado: number
}

/**
 * O nível de imagem a usar: o menor que dá pelo menos `alvoPx` pixels na largura da planta (nítido
 * sem carregar centenas de pedaços). Se nenhum chega lá, o maior que existe.
 */
export function nivelDoFundo(niveis: readonly number[], largura: number, alvoPx = 1600): number {
  const ordem = [...niveis].sort((a, b) => a - b)
  return ordem.find((z) => largura * 2 ** z >= alvoPx) ?? ordem[ordem.length - 1]
}

/** Os pedaços de imagem que cobrem a planta inteira, na medida da folha. */
export function pedacosDoFundo(planta: PlantaDeFundo, alvoPx = 1600): Pedaco[] {
  const f = planta.fundo
  if (!f || f.niveis.length === 0 || !(planta.largura > 0)) return []
  const z = nivelDoFundo(f.niveis, planta.largura, alvoPx)
  const escala = 2 ** z
  const colunas = Math.ceil((planta.largura * escala) / f.tile)
  const linhas = Math.ceil((planta.altura * escala) / f.tile)
  // pixels da planta → unidades da folha
  const u = LARGURA / planta.largura
  const lado = (f.tile / escala) * u
  const saida: Pedaco[] = []
  for (let y = 0; y < linhas; y++) {
    for (let x = 0; x < colunas; x++) {
      const href = f.url(z, x, y)
      if (href) saida.push({ href, x: x * lado, y: y * lado, lado })
    }
  }
  return saida
}

/** Grade da folha em branco: linha fina a cada 50, mais forte a cada 250. */
export function svgDaGrade(folha: Folha): string {
  let fina = ''
  let forte = ''
  for (let x = 0; x <= folha.largura; x += 50) {
    const d = `M${x} 0V${folha.altura}`
    if (x % 250 === 0) forte += d
    else fina += d
  }
  for (let y = 0; y <= folha.altura; y += 50) {
    const d = `M0 ${y}H${folha.largura}`
    if (y % 250 === 0) forte += d
    else fina += d
  }
  return `<path d="${fina}" stroke="#e3e6ea" stroke-width="1" fill="none"/><path d="${forte}" stroke="#c3c9d1" stroke-width="1.4" fill="none"/>`
}

/** Contorno das peças (planta sem imagem), na medida da folha. */
export function svgDasPecas(planta: PlantaDeFundo): string {
  if (!planta.elementos || !(planta.largura > 0)) return ''
  const u = LARGURA / planta.largura
  const n = (v: number) => Math.round(v * u * 10) / 10
  const d = planta.elementos
    .flatMap((e) => e.polys)
    .filter((p) => p.length > 1)
    .map((p) => `M${p.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`)
    .join('')
  return d ? `<path d="${d}" fill="#eef0f3" stroke="#8a929c" stroke-width="1"/>` : ''
}

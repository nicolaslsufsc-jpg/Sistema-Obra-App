// Em que peça fica um ponto de instalação ou um furo (pedido 0.5, 21/11): o que está dentro de um pilar conta
// na ficha do pilar, o que está em cima de uma viga na da viga (item dos furos); o resto fica na laje (item
// "instalacao" da ficha de laje). "Ele vai se converter na laje, ou na viga, ou no pilar" (Nicolas, 21/11).
// Regra pura, sem tela: quem desenha e grava é a TelaPlanta.

import { dentro, type Ponto } from './areas'
import type { ElementoPacote } from './pacote'

export type PecaDaInstalacao = { tipo: 'P' | 'V'; id: string } | { tipo: 'L' }

/** Caixa [x0, y0, x1, y1] de um contorno, para descartar rápido as vigas longe do ponto. */
function caixa(pts: readonly Ponto[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of pts) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return [x0, y0, x1, y1]
}

export interface PecaComContorno {
  tipo: 'P' | 'V'
  id: string
  polys: Ponto[][]
  caixas: Array<[number, number, number, number]>
}

/** Pilares e vigas da planta com o contorno (só os que têm desenho e não são só detalhe), pilares primeiro:
 * no encontro do pilar com a viga, vale o pilar. */
export function pecasComContorno(elementos: Record<string, ElementoPacote>): PecaComContorno[] {
  const saida: PecaComContorno[] = []
  for (const tipo of ['P', 'V'] as const) {
    for (const [id, e] of Object.entries(elementos ?? {})) {
      if (e.tipo !== tipo || e.so_detalhe || !e.polys?.length) continue
      const polys = e.polys.filter((p) => p.length >= 3) as Ponto[][]
      if (polys.length) saida.push({ tipo, id, polys, caixas: polys.map(caixa) })
    }
  }
  return saida
}

/** Nome antigo: hoje leva pilares e vigas. */
export const vigasComContorno = pecasComContorno

/**
 * A peça de um ponto (pontos do PDF, y para baixo). Dentro de um pilar, o pilar; em cima de uma viga, a viga
 * (no cruzamento de duas, a primeira pela ordem do manifest). Fora deles, a laje.
 * Furo que já veio do pipeline com `viga` ou `pilar` fica nele, mesmo que o desenho não bata.
 */
export function pecaDoPonto(
  p: readonly [number, number],
  pecas: readonly PecaComContorno[],
  furo?: { viga?: string; pilar?: string },
): PecaDaInstalacao {
  if (furo?.viga) return { tipo: 'V', id: furo.viga }
  if (furo?.pilar) return { tipo: 'P', id: furo.pilar }
  for (const v of pecas) {
    for (let i = 0; i < v.polys.length; i++) {
      const [x0, y0, x1, y1] = v.caixas[i]
      if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) continue
      if (dentro(p, v.polys[i])) return { tipo: v.tipo, id: v.id }
    }
  }
  return { tipo: 'L' }
}

/**
 * Eletroduto (linha): fica na peça só se o meio e as duas pontas caem na mesma peça; o normal é atravessar,
 * e aí conta na laje.
 */
export function pecaDaLinha(linha: ReadonlyArray<readonly [number, number]>, pecas: readonly PecaComContorno[]): PecaDaInstalacao {
  if (!linha.length) return { tipo: 'L' }
  const ini = linha[0]
  const fim = linha[linha.length - 1]
  const meio: [number, number] = [(ini[0] + fim[0]) / 2, (ini[1] + fim[1]) / 2]
  const a = pecaDoPonto(meio, pecas)
  if (a.tipo === 'L') return a
  for (const q of [ini, fim]) {
    const b = pecaDoPonto(q, pecas)
    if (b.tipo !== a.tipo || b.id !== a.id) return { tipo: 'L' }
  }
  return a
}

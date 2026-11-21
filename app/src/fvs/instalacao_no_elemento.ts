// Em que peça fica um ponto de instalação ou um furo (pedido 0.5, 21/11): o que está em cima de uma viga
// conta na ficha da viga (item dos furos); o resto fica na laje (item "instalacao" da ficha de laje).
// Regra pura, sem tela: quem desenha e grava é a TelaPlanta.

import { dentro, type Ponto } from './areas'
import type { ElementoPacote } from './pacote'

export type PecaDaInstalacao = { tipo: 'V'; id: string } | { tipo: 'L' }

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

/** Vigas da planta com o contorno (só as que têm desenho e não são só detalhe). */
export function vigasComContorno(elementos: Record<string, ElementoPacote>): Array<{ id: string; polys: Ponto[][]; caixas: Array<[number, number, number, number]> }> {
  const saida: Array<{ id: string; polys: Ponto[][]; caixas: Array<[number, number, number, number]> }> = []
  for (const [id, e] of Object.entries(elementos ?? {})) {
    if (e.tipo !== 'V' || e.so_detalhe || !e.polys?.length) continue
    const polys = e.polys.filter((p) => p.length >= 3) as Ponto[][]
    if (polys.length) saida.push({ id, polys, caixas: polys.map(caixa) })
  }
  return saida
}

/**
 * A peça de um ponto (pontos do PDF, y para baixo). Em cima de uma viga, a viga; se cair em duas (cruzamento),
 * a primeira pela ordem do manifest. Fora de viga, a laje.
 * Furo que já veio do pipeline com `viga` fica nela, mesmo que o desenho não bata.
 */
export function pecaDoPonto(
  p: readonly [number, number],
  vigas: ReturnType<typeof vigasComContorno>,
  furo?: Pick<ElementoPacote, 'viga'>,
): PecaDaInstalacao {
  if (furo?.viga) return { tipo: 'V', id: furo.viga }
  for (const v of vigas) {
    for (let i = 0; i < v.polys.length; i++) {
      const [x0, y0, x1, y1] = v.caixas[i]
      if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) continue
      if (dentro(p, v.polys[i])) return { tipo: 'V', id: v.id }
    }
  }
  return { tipo: 'L' }
}

/**
 * Eletroduto (linha): fica na viga só se o meio e as duas pontas caem na mesma viga; o normal é atravessar,
 * e aí conta na laje.
 */
export function pecaDaLinha(linha: ReadonlyArray<readonly [number, number]>, vigas: ReturnType<typeof vigasComContorno>): PecaDaInstalacao {
  if (!linha.length) return { tipo: 'L' }
  const ini = linha[0]
  const fim = linha[linha.length - 1]
  const meio: [number, number] = [(ini[0] + fim[0]) / 2, (ini[1] + fim[1]) / 2]
  const a = pecaDoPonto(meio, vigas)
  if (a.tipo !== 'V') return a
  for (const q of [ini, fim]) {
    const b = pecaDoPonto(q, vigas)
    if (b.tipo !== 'V' || b.id !== a.id) return { tipo: 'L' }
  }
  return a
}

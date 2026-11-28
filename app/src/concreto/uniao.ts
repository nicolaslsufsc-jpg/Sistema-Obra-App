// Áreas do mesmo caminhão que se encostam ou se sobrepõem aparecem como um desenho só (pedido do
// Nicolas, 26/11/2026: "se eu juntar duas áreas de laje e pilar, elas se unifiquem"). É só o que se
// vê: cada área continua gravada como foi desenhada, com a caneta dela, e as peças continuam saindo
// de cada área (canetas.ts). Aqui: quais áreas formam um grupo e o contorno de fora de cada grupo.

import { canetaComLaje } from './canetas'
import { caixaDe, caixasSeTocam, pontoNoPoligono, type Caixa, type Poligono, type Ponto } from './geometria'

/** Cruzamento dos segmentos ab e cd: o t (0..1) em ab, ou null. */
function cruzamento(a: Ponto, b: Ponto, c: Ponto, d: Ponto): number | null {
  const rx = b[0] - a[0]
  const ry = b[1] - a[1]
  const sx = d[0] - c[0]
  const sy = d[1] - c[1]
  const den = rx * sy - ry * sx
  if (den === 0) return null // paralelos (ou colineares: a borda sai pelo teste dos lados)
  const qx = c[0] - a[0]
  const qy = c[1] - a[1]
  const t = (qx * sy - qy * sx) / den
  const u = (qx * ry - qy * rx) / den
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null
}

function caixaDoSegmento(a: Ponto, b: Ponto): Caixa {
  return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) }
}

/** Duas áreas se tocam: um lado cruza o outro, ou uma está dentro da outra. */
export function areasSeTocam(p: Poligono, q: Poligono): boolean {
  if (p.length < 3 || q.length < 3 || !caixasSeTocam(caixaDe(p), caixaDe(q))) return false
  if (pontoNoPoligono(p[0][0], p[0][1], q) || pontoNoPoligono(q[0][0], q[0][1], p)) return true
  const cq = caixaDe(q)
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    if (!caixasSeTocam(caixaDoSegmento(a, b), cq)) continue
    for (let j = 0; j < q.length; j++) {
      if (cruzamento(a, b, q[j], q[(j + 1) % q.length]) !== null) return true
    }
  }
  return false
}

/** Grupos de áreas que se tocam (direta ou indiretamente), pela posição na lista, em ordem. */
export function gruposQueSeTocam(polys: readonly Poligono[]): number[][] {
  const pai = polys.map((_, i) => i)
  const raiz = (i: number): number => (pai[i] === i ? i : (pai[i] = raiz(pai[i])))
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      if (raiz(i) !== raiz(j) && areasSeTocam(polys[i], polys[j])) pai[raiz(j)] = raiz(i)
    }
  }
  const grupos = new Map<number, number[]>()
  polys.forEach((_, i) => grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), i]))
  return [...grupos.values()]
}

/**
 * Contorno de fora da união das áreas: os pedaços de lado que têm a união de um lado só.
 * Devolve linhas (cada uma uma sequência de pontos), já emendadas onde dá.
 * A conta roda em vetores de números (26/11/2026): em tablet fraco, com muitas áreas de traço
 * longo, a versão com listas de pontos levava mais de meio segundo.
 */
export function bordaDaUniao(polys: readonly Poligono[]): Ponto[][] {
  const aneis = polys.filter((p) => p.length >= 3)
  const nAneis = aneis.length
  // lados de todos os anéis, em sequência: ponto inicial (ax, ay), final (bx, by) e a caixa do lado
  let total = 0
  for (const p of aneis) total += p.length
  const ax = new Float64Array(total)
  const ay = new Float64Array(total)
  const bx = new Float64Array(total)
  const by = new Float64Array(total)
  const inicio = new Int32Array(nAneis + 1)
  const cx0 = new Float64Array(nAneis)
  const cy0 = new Float64Array(nAneis)
  const cx1 = new Float64Array(nAneis)
  const cy1 = new Float64Array(nAneis)
  let k = 0
  aneis.forEach((p, r) => {
    inicio[r] = k
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (let i = 0; i < p.length; i++, k++) {
      const a = p[i]
      const b = p[(i + 1) % p.length]
      ax[k] = a[0]
      ay[k] = a[1]
      bx[k] = b[0]
      by[k] = b[1]
      if (a[0] < x0) x0 = a[0]
      if (a[1] < y0) y0 = a[1]
      if (a[0] > x1) x1 = a[0]
      if (a[1] > y1) y1 = a[1]
    }
    cx0[r] = x0
    cy0[r] = y0
    cx1[r] = x1
    cy1[r] = y1
  })
  inicio[nAneis] = k
  // ponto dentro de algum anel (raio horizontal, como pontoNoPoligono)
  const dentro = (x: number, y: number): boolean => {
    for (let r = 0; r < nAneis; r++) {
      if (x < cx0[r] || x > cx1[r] || y < cy0[r] || y > cy1[r]) continue
      let d = false
      for (let i = inicio[r], fim = inicio[r + 1]; i < fim; i++) {
        const yi = ay[i]
        const yj = by[i]
        if (yi > y !== yj > y && x < ((bx[i] - ax[i]) * (y - yi)) / (yj - yi) + ax[i]) d = !d
      }
      if (d) return true
    }
    return false
  }
  // folga para olhar dos dois lados: bem menor que um traço na tela (planta em px)
  const folga = 0.05
  const linhas: Ponto[][] = []
  const ts: number[] = []
  for (let r = 0; r < nAneis; r++) {
    const inicioDoAnel = linhas.length
    let atual: Ponto[] | null = null
    for (let i = inicio[r], fim = inicio[r + 1]; i < fim; i++) {
      const x1 = ax[i]
      const y1 = ay[i]
      const x2 = bx[i]
      const y2 = by[i]
      const dx = x2 - x1
      const dy = y2 - y1
      const len = Math.hypot(dx, dy)
      if (len === 0) continue
      const lx0 = x1 < x2 ? x1 : x2
      const lx1 = x1 < x2 ? x2 : x1
      const ly0 = y1 < y2 ? y1 : y2
      const ly1 = y1 < y2 ? y2 : y1
      ts.length = 0
      ts.push(0, 1)
      // anel longe deste lado: pula o anel inteiro
      for (let q = 0; q < nAneis; q++) {
        if (lx1 < cx0[q] || lx0 > cx1[q] || ly1 < cy0[q] || ly0 > cy1[q]) continue
        for (let j = inicio[q], fj = inicio[q + 1]; j < fj; j++) {
          if (j === i) continue
          const x3 = ax[j]
          const y3 = ay[j]
          const x4 = bx[j]
          const y4 = by[j]
          // caixa do outro lado longe: sem cruzamento
          if ((x3 < lx0 && x4 < lx0) || (x3 > lx1 && x4 > lx1) || (y3 < ly0 && y4 < ly0) || (y3 > ly1 && y4 > ly1)) continue
          const sx = x4 - x3
          const sy = y4 - y3
          const den = dx * sy - dy * sx
          if (den === 0) continue // paralelos (ou colineares: a borda sai pelo teste dos lados)
          const qx = x3 - x1
          const qy = y3 - y1
          const t = (qx * sy - qy * sx) / den
          if (t <= 1e-9 || t >= 1 - 1e-9) continue
          const u = (qx * dy - qy * dx) / den
          if (u >= 0 && u <= 1) ts.push(t)
        }
      }
      if (ts.length > 2) ts.sort((a, b) => a - b)
      const nx = (-dy / len) * folga
      const ny = (dx / len) * folga
      for (let s = 0; s + 1 < ts.length; s++) {
        if (ts[s + 1] - ts[s] < 1e-9) continue
        const p0: Ponto = [x1 + dx * ts[s], y1 + dy * ts[s]]
        const p1: Ponto = [x1 + dx * ts[s + 1], y1 + dy * ts[s + 1]]
        const mx = (p0[0] + p1[0]) / 2
        const my = (p0[1] + p1[1]) / 2
        if (dentro(mx + nx, my + ny) === dentro(mx - nx, my - ny)) {
          atual = null
          continue
        }
        const ult: Ponto | undefined = atual?.[atual.length - 1]
        if (atual && ult && ult[0] === p0[0] && ult[1] === p0[1]) atual.push(p1)
        else {
          atual = [p0, p1]
          linhas.push(atual)
        }
      }
    }
    // o anel fecha: a última linha continua na primeira do mesmo anel
    if (linhas.length - inicioDoAnel >= 2 && atual) {
      const primeira = linhas[inicioDoAnel]
      const ult = atual[atual.length - 1]
      if (ult[0] === primeira[0][0] && ult[1] === primeira[0][1]) {
        atual.push(...primeira.slice(1))
        linhas.splice(inicioDoAnel, 1)
      }
    }
  }
  return linhas
}
/** Mesmo sentido em todos os anéis, para pintar a união de uma vez (regra "nonzero"). */
export function noSentidoPositivo(p: Poligono): Ponto[] {
  let s = 0
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1])
  return s >= 0 ? [...p] : [...p].reverse()
}

export interface GrupoDeAreas {
  /** os contornos das áreas do grupo, no mesmo sentido (pintar com a regra "nonzero") */
  aneis: Ponto[][]
  /** contorno de fora da união */
  borda: Ponto[][]
  /** alguma área do grupo é de caneta com laje: o grupo aparece cheio, como laje concretada */
  laje: boolean
  /** ponto dentro do grupo, para o número do caminhão */
  rotulo: Ponto
  /** caixa de todas as áreas do grupo */
  caixa: Caixa
}

/**
 * Ponto para o número do caminhão: o centro da maior área do grupo; se o centro cair fora dela
 * (área em "L" ou em "U"), o meio do trecho mais largo da área na altura do centro.
 */
export function pontoDeRotulo(polys: readonly Poligono[]): Ponto {
  let maior = polys[0]
  let caixaMaior = caixaDe(maior)
  for (const p of polys) {
    const c = caixaDe(p)
    if ((c.x1 - c.x0) * (c.y1 - c.y0) > (caixaMaior.x1 - caixaMaior.x0) * (caixaMaior.y1 - caixaMaior.y0)) {
      maior = p
      caixaMaior = c
    }
  }
  const cx = (caixaMaior.x0 + caixaMaior.x1) / 2
  const cy = (caixaMaior.y0 + caixaMaior.y1) / 2
  if (pontoNoPoligono(cx, cy, maior)) return [cx, cy]
  const xs: number[] = []
  for (let i = 0, j = maior.length - 1; i < maior.length; j = i++) {
    const [xi, yi] = maior[i]
    const [xj, yj] = maior[j]
    if (yi > cy !== yj > cy) xs.push(((xj - xi) * (cy - yi)) / (yj - yi) + xi)
  }
  xs.sort((a, b) => a - b)
  let melhor: Ponto = [cx, cy]
  let largura = -1
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] > largura) {
      largura = xs[i + 1] - xs[i]
      melhor = [(xs[i] + xs[i + 1]) / 2, cy]
    }
  }
  return melhor
}

type AreaDesenhada = { id: string; contorno: ReadonlyArray<readonly [number, number]>; alvo?: unknown }
const guardados = new Map<string, GrupoDeAreas[]>()

/** As áreas de um caminhão numa planta, juntas nos grupos que se tocam (o cálculo fica guardado). */
export function unirAreas(areas: readonly AreaDesenhada[]): GrupoDeAreas[] {
  const validas = areas.filter((a) => a.contorno.length >= 3)
  const chave = validas.map((a) => a.id).join('|')
  const ja = guardados.get(chave)
  if (ja) return ja
  const polys = validas.map((a) => a.contorno as Poligono)
  const grupos = gruposQueSeTocam(polys).map((ids) => ({
    aneis: ids.map((i) => noSentidoPositivo(polys[i])),
    borda: bordaDaUniao(ids.map((i) => polys[i])),
    laje: ids.some((i) => canetaComLaje(validas[i].alvo)),
    rotulo: pontoDeRotulo(ids.map((i) => polys[i])),
    caixa: caixaDe(ids.flatMap((i) => polys[i])),
  }))
  if (guardados.size > 300) guardados.clear()
  guardados.set(chave, grupos)
  return grupos
}
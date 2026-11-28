// Borracha de trecho (26/11/2026, pedido do Nicolas: "funções do desenho"): tira de uma área o
// pedaço coberto pelo traço da borracha. É a diferença de dois polígonos (área menos traço).
// A borda do resultado são os pedaços da borda da área que ficam fora do traço, mais os pedaços
// da borda do traço que ficam dentro da área; emendados, formam os contornos que sobram.
// Só contas; quem grava é a tela (TelaMapa), com linha nova (correção, inclusão ou cancelamento).

import { areaDe, caixaDe, caixasSeTocam, pontoNoPoligono, type Poligono, type Ponto } from './geometria'

export type Recorte =
  /** o traço não pega a área: nada muda */
  | { tipo: 'intacta' }
  /** o traço cobre a área inteira: ela some */
  | { tipo: 'some' }
  /** o traço fica todo dentro da área, sem cruzar a borda: seria um furo, que a área não guarda */
  | { tipo: 'furo' }
  /** o que sobra da área: um contorno ou mais (o traço pode partir a área em duas) */
  | { tipo: 'sobra'; contornos: Ponto[][] }
  /** traço ou área enrolados demais para emendar com segurança: nada muda */
  | { tipo: 'falhou' }

/** Parâmetros (0..1) em que o segmento ab é cruzado pelos lados do polígono. */
function cortes(a: Ponto, b: Ponto, poli: Poligono): number[] {
  const ts: number[] = []
  const rx = b[0] - a[0]
  const ry = b[1] - a[1]
  for (let i = 0; i < poli.length; i++) {
    const c = poli[i]
    const d = poli[(i + 1) % poli.length]
    const sx = d[0] - c[0]
    const sy = d[1] - c[1]
    const den = rx * sy - ry * sx
    if (den === 0) continue
    const qx = c[0] - a[0]
    const qy = c[1] - a[1]
    const t = (qx * sy - qy * sx) / den
    const u = (qx * ry - qy * rx) / den
    if (t > 1e-9 && t < 1 - 1e-9 && u >= 0 && u <= 1) ts.push(t)
  }
  return ts
}

/** Pedaços da borda de `poli` que ficam dentro (ou fora) de `outro`. */
function pedacos(poli: Poligono, outro: Poligono, dentro: boolean): Array<[Ponto, Ponto]> {
  const saida: Array<[Ponto, Ponto]> = []
  for (let i = 0; i < poli.length; i++) {
    const a = poli[i]
    const b = poli[(i + 1) % poli.length]
    const ts = [0, ...cortes(a, b, outro).sort((x, y) => x - y), 1]
    for (let s = 0; s + 1 < ts.length; s++) {
      if (ts[s + 1] - ts[s] < 1e-9) continue
      const p0: Ponto = [a[0] + (b[0] - a[0]) * ts[s], a[1] + (b[1] - a[1]) * ts[s]]
      const p1: Ponto = [a[0] + (b[0] - a[0]) * ts[s + 1], a[1] + (b[1] - a[1]) * ts[s + 1]]
      if (pontoNoPoligono((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, outro) === dentro) saida.push([p0, p1])
    }
  }
  return saida
}

// os cruzamentos são calculados duas vezes (num lado da área e num lado do traço) e saem com
// diferença na última casa: a emenda compara os pontos arredondados
const chave = (p: Ponto) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`

/** Emenda os pedaços em contornos fechados; null se algum ponto não fecha direito. */
function emendar(segs: Array<[Ponto, Ponto]>): Ponto[][] | null {
  const porPonto = new Map<string, number[]>()
  segs.forEach(([a, b], i) => {
    for (const p of [a, b]) porPonto.set(chave(p), [...(porPonto.get(chave(p)) ?? []), i])
  })
  for (const l of porPonto.values()) if (l.length !== 2) return null
  const usado = new Array<boolean>(segs.length).fill(false)
  const aneis: Ponto[][] = []
  for (let i = 0; i < segs.length; i++) {
    if (usado[i]) continue
    const anel: Ponto[] = [segs[i][0]]
    let atual = i
    let ponta = segs[i][1]
    usado[i] = true
    for (let guarda = 0; guarda <= segs.length; guarda++) {
      if (chave(ponta) === chave(anel[0])) break
      anel.push(ponta)
      const prox = porPonto.get(chave(ponta))!.find((k) => k !== atual && !usado[k])
      if (prox === undefined) return null
      usado[prox] = true
      ponta = chave(segs[prox][0]) === chave(ponta) ? segs[prox][1] : segs[prox][0]
      atual = prox
    }
    if (chave(ponta) !== chave(anel[0])) return null
    aneis.push(anel)
  }
  return aneis
}

/** Tira os pontos que estão no meio de uma reta (sobram dos cruzamentos). */
function semPontosNaReta(p: Ponto[]): Ponto[] {
  return p.filter((q, i) => {
    const a = p[(i + p.length - 1) % p.length]
    const b = p[(i + 1) % p.length]
    return Math.abs((q[0] - a[0]) * (b[1] - a[1]) - (q[1] - a[1]) * (b[0] - a[0])) > 1e-6
  })
}

/** Sem pontos iguais seguidos (nem o último igual ao primeiro). */
function semRepetidos(p: Poligono): Ponto[] {
  const saida: Ponto[] = []
  for (const q of p) {
    const ult = saida[saida.length - 1]
    if (!ult || ult[0] !== q[0] || ult[1] !== q[1]) saida.push(q)
  }
  while (saida.length > 1 && saida[0][0] === saida[saida.length - 1][0] && saida[0][1] === saida[saida.length - 1][1]) saida.pop()
  return saida
}

/**
 * A área menos o traço da borracha. `areaMinima` (na unidade da planta, ao quadrado): sobra menor
 * que isso é lixo do traço e é jogada fora.
 */
export function recortar(areaGravada: Poligono, tracoGravado: Poligono, areaMinima = 1): Recorte {
  // a caneta grava o primeiro ponto de novo no fim (e às vezes pontos repetidos seguidos): um lado
  // de comprimento zero faz a emenda falhar, então eles saem antes da conta
  const area = semRepetidos(areaGravada)
  const traco = semRepetidos(tracoGravado)
  if (area.length < 3 || traco.length < 3 || !caixasSeTocam(caixaDe(area), caixaDe(traco))) return { tipo: 'intacta' }
  const cruza = area.some((a, i) => cortes(a, area[(i + 1) % area.length], traco).length > 0)
  if (!cruza) {
    if (pontoNoPoligono(area[0][0], area[0][1], traco)) return { tipo: 'some' }
    if (pontoNoPoligono(traco[0][0], traco[0][1], area)) return { tipo: 'furo' }
    return { tipo: 'intacta' }
  }
  const segs = [...pedacos(area, traco, false), ...pedacos(traco, area, true)]
  const aneis = emendar(segs)
  if (!aneis) return { tipo: 'falhou' }
  const contornos = aneis
    .map(semPontosNaReta)
    .filter((p) => p.length >= 3 && areaDe(p) >= areaMinima)
    .map((p) => p.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as Ponto))
  return contornos.length === 0 ? { tipo: 'some' } : { tipo: 'sobra', contornos }
}

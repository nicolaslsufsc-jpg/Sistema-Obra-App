// Geometria da planta em pixels (x para a direita, y para baixo), como no HTML legado da FVS.
// Tudo aqui é rápido de propósito: roda logo depois do traço da caneta, com a tela parada.

export type Ponto = readonly [number, number]
export type Poligono = readonly Ponto[]

export interface Caixa {
  x0: number
  y0: number
  x1: number
  y1: number
}

export function caixaDe(pontos: Poligono): Caixa {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const [x, y] of pontos) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return { x0, y0, x1, y1 }
}

export function dentroDaCaixa(c: Caixa, x: number, y: number): boolean {
  return x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1
}

/** Ponto dentro do polígono (raio horizontal). O polígono não precisa repetir o 1º ponto no fim. */
export function pontoNoPoligono(x: number, y: number, poli: Poligono): boolean {
  let dentro = false
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [xi, yi] = poli[i]
    const [xj, yj] = poli[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}

/** Área (sempre positiva) pela fórmula do laço. */
export function areaDe(poli: Poligono): number {
  let s = 0
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    s += (poli[j][0] + poli[i][0]) * (poli[j][1] - poli[i][1])
  }
  return Math.abs(s) / 2
}

/** Comprimento do traço. */
export function comprimento(pontos: Poligono): number {
  let s = 0
  for (let i = 1; i < pontos.length; i++) s += Math.hypot(pontos[i][0] - pontos[i - 1][0], pontos[i][1] - pontos[i - 1][1])
  return s
}

function distanciaAoSegmento(p: Ponto, a: Ponto, b: Ponto): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Simplifica o traço (Ramer-Douglas-Peucker, sem recursão). Mantém o 1º e o último ponto. */
export function simplificar(pontos: Poligono, tolerancia: number): Ponto[] {
  if (pontos.length <= 2) return [...pontos]
  const manter = new Uint8Array(pontos.length)
  manter[0] = 1
  manter[pontos.length - 1] = 1
  const pilha: Array<[number, number]> = [[0, pontos.length - 1]]
  while (pilha.length) {
    const [ini, fim] = pilha.pop()!
    let maior = -1
    let indice = -1
    for (let i = ini + 1; i < fim; i++) {
      const d = distanciaAoSegmento(pontos[i], pontos[ini], pontos[fim])
      if (d > maior) {
        maior = d
        indice = i
      }
    }
    if (maior > tolerancia && indice > 0) {
      manter[indice] = 1
      pilha.push([ini, indice], [indice, fim])
    }
  }
  return pontos.filter((_, i) => manter[i] === 1)
}

/** O banco aceita até 5000 pontos numa área; acima disso o registro seria recusado para sempre. */
export const MAX_PONTOS_AREA = 4000

/**
 * Traço pronto para gravar, sem nunca travar a tela ao soltar a caneta e cabendo no banco:
 *  1. tira pontos colados no anterior (caneta parada ou devagar gera muitos);
 *  2. traço ainda enorme: pega pontos a intervalos iguais até o máximo;
 *  3. só então simplifica. A simplificação pode ser lenta com muitos pontos (com 30 mil
 *     pontos em zigue-zague, dezenas de segundos); com o máximo de pontos, poucos milissegundos.
 */
export function simplificarParaGravar(pontos: Poligono, tolerancia: number, maximo = MAX_PONTOS_AREA): Ponto[] {
  if (pontos.length <= 2) return [...pontos]
  const ultimo = pontos[pontos.length - 1]
  const filtrados: Ponto[] = [pontos[0]]
  for (let i = 1; i < pontos.length - 1; i++) {
    const a = filtrados[filtrados.length - 1]
    if (Math.hypot(pontos[i][0] - a[0], pontos[i][1] - a[1]) >= tolerancia) filtrados.push(pontos[i])
  }
  filtrados.push(ultimo)
  if (filtrados.length <= maximo) return simplificar(filtrados, tolerancia)
  const amostra: Ponto[] = []
  const passo = (filtrados.length - 1) / (maximo - 1)
  for (let i = 0; i < maximo - 1; i++) amostra.push(filtrados[Math.floor(i * passo)])
  amostra.push(ultimo)
  return simplificar(amostra, tolerancia)
}

/**
 * Pontos de amostra dentro de uma peça (grade sobre a caixa, filtrada pelos polígonos).
 * Calculado uma vez por peça; a fração dentro da área é a fração destes pontos.
 * A grade acompanha o formato: viga comprida ganha mais pontos no comprimento (senão
 * encostar 5% da viga já contaria como 1/7 dela).
 */
export function amostrasDaPeca(polys: readonly Poligono[], pontosPorPoligono = 48): Ponto[] {
  const saida: Ponto[] = []
  for (const poli of polys) {
    if (poli.length < 3) continue
    const c = caixaDe(poli)
    const w = Math.max(c.x1 - c.x0, 1e-6)
    const h = Math.max(c.y1 - c.y0, 1e-6)
    const passo = Math.sqrt((w * h) / pontosPorPoligono)
    const nx = Math.min(80, Math.max(2, Math.ceil(w / passo)))
    const ny = Math.min(80, Math.max(2, Math.ceil(h / passo)))
    const passoX = w / nx
    const passoY = h / ny
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const x = c.x0 + passoX * (i + 0.5)
        const y = c.y0 + passoY * (j + 0.5)
        if (pontoNoPoligono(x, y, poli)) saida.push([x, y])
      }
    }
  }
  // peça muito fina (viga em L, por exemplo): pelo menos o centro de cada polígono
  if (saida.length === 0) {
    for (const poli of polys) {
      if (!poli.length) continue
      const c = caixaDe(poli)
      saida.push([(c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2])
    }
  }
  return saida
}

export interface AreaPreparada {
  caixa: Caixa
  contorno: Poligono
}

export function prepararArea(contorno: Poligono): AreaPreparada {
  return { caixa: caixaDe(contorno), contorno }
}

/** Fração (0 a 1) das amostras da peça que cai dentro de pelo menos uma das áreas. */
export function fracaoDentro(amostras: readonly Ponto[], areas: readonly AreaPreparada[]): number {
  if (amostras.length === 0 || areas.length === 0) return 0
  let dentro = 0
  for (const [x, y] of amostras) {
    for (const a of areas) {
      if (dentroDaCaixa(a.caixa, x, y) && pontoNoPoligono(x, y, a.contorno)) {
        dentro++
        break
      }
    }
  }
  return dentro / amostras.length
}

export function caixasSeTocam(a: Caixa, b: Caixa): boolean {
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1
}

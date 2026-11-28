// Funções do desenho das áreas (26/11/2026, pedido do Nicolas): borracha (apagar a área tocada, e
// não só a última) e mover um canto de uma área feita por linhas retas. Só contas; quem grava é a
// tela (TelaMapa), sempre com linha nova (cancelar ou corrigir), como o resto do módulo.

import { areaDe, pontoNoPoligono, type Poligono, type Ponto } from './geometria'

/** Área com poucos cantos (feita por linhas retas): os cantos aparecem e podem ser movidos. */
export const MAX_CANTOS_EDITAVEIS = 40

export function temCantosEditaveis(contorno: Poligono): boolean {
  return contorno.length >= 3 && contorno.length <= MAX_CANTOS_EDITAVEIS
}

/** A área tocada: a menor que contém o ponto (a de cima, quando uma está dentro da outra). */
export function areaNoPonto<A extends { contorno: ReadonlyArray<readonly [number, number]> }>(areas: readonly A[], x: number, y: number): A | null {
  let melhor: A | null = null
  let menor = Infinity
  for (const a of areas) {
    if (a.contorno.length < 3 || !pontoNoPoligono(x, y, a.contorno)) continue
    const t = areaDe(a.contorno)
    if (t < menor) {
      menor = t
      melhor = a
    }
  }
  return melhor
}

/** Canto mais perto do ponto, até `alcance` (na mesma unidade dos pontos); -1 se nenhum. */
export function cantoPerto(pontos: Poligono, x: number, y: number, alcance: number): number {
  let melhor = -1
  let menor = alcance
  pontos.forEach(([px, py], i) => {
    const d = Math.hypot(px - x, py - y)
    if (d <= menor) {
      menor = d
      melhor = i
    }
  })
  return melhor
}

/** O contorno com o canto `i` no lugar novo (cópia; o original não muda). */
export function moverCanto(contorno: Poligono, i: number, novo: Ponto): Ponto[] {
  return contorno.map((p, k) => (k === i ? novo : p))
}

const lado = (a: Ponto, b: Ponto, c: Ponto) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const naCaixa = (a: Ponto, b: Ponto, c: Ponto) =>
  Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1])

/** Os segmentos ab e cd se cruzam ou se encostam (inclusive em cima um do outro). */
function segmentosSeTocam(a: Ponto, b: Ponto, c: Ponto, d: Ponto): boolean {
  const d1 = lado(c, d, a)
  const d2 = lado(c, d, b)
  const d3 = lado(a, b, c)
  const d4 = lado(a, b, d)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  return (d1 === 0 && naCaixa(c, d, a)) || (d2 === 0 && naCaixa(c, d, b)) || (d3 === 0 && naCaixa(a, b, c)) || (d4 === 0 && naCaixa(a, b, d))
}

/**
 * Dois lados que não são vizinhos se cruzam ou se encostam. `fechado` = conta o lado do último
 * canto ao primeiro (área gravada); sem ele, é a linha dos cantos ainda abertos.
 */
export function ladosSeCruzam(p: Poligono, fechado = true): boolean {
  const n = p.length
  const lados = fechado ? n : n - 1
  if (lados < 3) return false
  for (let i = 0; i < lados; i++) {
    for (let j = i + 2; j < lados; j++) {
      if (fechado && i === 0 && j === n - 1) continue // o último lado encosta no primeiro
      if (segmentosSeTocam(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true
    }
  }
  return false
}

function perimetroDe(p: Poligono): number {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    s += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return s
}

/** Área menor que isto, em px² de tela, não vale como área (o mesmo limite do desenho). */
export const AREA_MINIMA_TELA = 400
/** Largura média menor que isto, em px de tela: a área virou uma lasca (quase um traço). */
export const LARGURA_MINIMA_TELA = 6

/**
 * Problema do contorno depois de mover um canto (rodada 12 do Testador, 26/11: dava para achatar a
 * área numa lasca sem aviso). `escala` = px de tela por px da planta. Os lados cruzados só contam
 * quando o contorno de antes não se cruzava (área à mão antiga pode já vir assim).
 */
export function problemaDoCanto(antes: Poligono, depois: Poligono, escala: number): 'cruza' | 'pequena' | 'fina' | null {
  if (depois.length < 3) return 'pequena'
  if (ladosSeCruzam(depois) && !ladosSeCruzam(antes)) return 'cruza'
  const a = areaDe(depois)
  if (a * escala * escala < AREA_MINIMA_TELA) return 'pequena'
  // largura média: 2 x área / perímetro (num retângulo comprido, é a largura dele)
  if ((2 * a * escala) / perimetroDe(depois) < LARGURA_MINIMA_TELA) return 'fina'
  return null
}

export const AVISO_DO_CANTO: Record<'cruza' | 'pequena' | 'fina', string> = {
  cruza: 'O canto voltou ao lugar: assim os lados da área se cruzariam.',
  pequena: 'O canto voltou ao lugar: assim a área ficaria pequena demais.',
  fina: 'O canto voltou ao lugar: assim a área ficaria fina demais, quase um traço.',
}

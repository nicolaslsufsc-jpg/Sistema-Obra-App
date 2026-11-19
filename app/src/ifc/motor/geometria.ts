// Contas de geometria que não dependem da tela.
import type { Caixa } from './tipos'

export class CaixaAcumulada {
  private min = [Infinity, Infinity, Infinity]
  private max = [-Infinity, -Infinity, -Infinity]

  somar(x: number, y: number, z: number): void {
    if (x < this.min[0]) this.min[0] = x
    if (y < this.min[1]) this.min[1] = y
    if (z < this.min[2]) this.min[2] = z
    if (x > this.max[0]) this.max[0] = x
    if (y > this.max[1]) this.max[1] = y
    if (z > this.max[2]) this.max[2] = z
  }

  vazia(): boolean {
    return this.min[0] === Infinity
  }

  valor(): Caixa {
    if (this.vazia()) return [0, 0, 0, 0, 0, 0]
    return [this.min[0], this.min[1], this.min[2], this.max[0], this.max[1], this.max[2]]
  }
}

/** Dois vértices a menos de 0,1 mm são o mesmo ponto. */
const PASSO_SOLDA = 1e4
/** Acima de 35° entre as faces, a aresta é desenhada. Cilindro de 12 lados (30°) fica liso. */
const COS_ARESTA_VIVA = Math.cos((35 * Math.PI) / 180)

// Tabelas reaproveitadas entre chamadas: esta função roda dezenas de milhares de vezes por arquivo.
let tabelaSolda = new Int32Array(1 << 12)
let soldado = new Int32Array(1 << 12)
const arestaVista = new Map<number, number>()

/**
 * Encontra as arestas que valem a pena desenhar numa peça: bordas e dobras maiores que 35°.
 * Sem isso, cada triângulo de uma parede plana viraria um risco na tela.
 * Grava pares de índices em `saida` a partir de `nSaida`. Devolve o novo tamanho.
 */
export function detectarArestas(
  pos: Float32Array,
  indices: Uint32Array,
  inicioI: number,
  qtdI: number,
  inicioV: number,
  qtdV: number,
  saida: Uint32Array,
  nSaida: number,
): number {
  // Solda: o web-ifc repete o vértice em cada face; a aresta só "fecha" comparando posição.
  if (soldado.length < qtdV) soldado = new Int32Array(qtdV * 2)
  let tam = tabelaSolda.length
  if (tam < qtdV * 2) {
    tam = 1 << Math.ceil(Math.log2(qtdV * 2))
    tabelaSolda = new Int32Array(tam)
  } else {
    tabelaSolda.fill(0, 0, tam)
  }
  const mascara = tam - 1
  for (let i = 0; i < qtdV; i++) {
    const v = inicioV + i
    const x = Math.round(pos[v * 3] * PASSO_SOLDA)
    const y = Math.round(pos[v * 3 + 1] * PASSO_SOLDA)
    const z = Math.round(pos[v * 3 + 2] * PASSO_SOLDA)
    let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & mascara
    for (;;) {
      const o = tabelaSolda[h]
      if (o === 0) {
        tabelaSolda[h] = v + 1
        soldado[i] = v
        break
      }
      const w = o - 1
      if (
        Math.round(pos[w * 3] * PASSO_SOLDA) === x &&
        Math.round(pos[w * 3 + 1] * PASSO_SOLDA) === y &&
        Math.round(pos[w * 3 + 2] * PASSO_SOLDA) === z
      ) {
        soldado[i] = w
        break
      }
      h = (h + 1) & mascara
    }
  }

  arestaVista.clear()
  // Normais por triângulo (só das faces desta peça).
  const qtdT = qtdI / 3
  const normais = new Float32Array(qtdT * 3)
  const multiplicador = pos.length + 1
  const fim = inicioI + qtdI
  let n = nSaida
  for (let k = inicioI, t = 0; k < fim; k += 3, t++) {
    const a = soldado[indices[k] - inicioV]
    const b = soldado[indices[k + 1] - inicioV]
    const c = soldado[indices[k + 2] - inicioV]
    if (a === b || b === c || a === c) continue

    const ux = pos[b * 3] - pos[a * 3]
    const uy = pos[b * 3 + 1] - pos[a * 3 + 1]
    const uz = pos[b * 3 + 2] - pos[a * 3 + 2]
    const vx = pos[c * 3] - pos[a * 3]
    const vy = pos[c * 3 + 1] - pos[a * 3 + 1]
    const vz = pos[c * 3 + 2] - pos[a * 3 + 2]
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const L = Math.hypot(nx, ny, nz)
    if (L < 1e-12) continue
    nx /= L
    ny /= L
    nz /= L
    normais[t * 3] = nx
    normais[t * 3 + 1] = ny
    normais[t * 3 + 2] = nz

    for (let e = 0; e < 3; e++) {
      const p = e === 0 ? a : e === 1 ? b : c
      const q = e === 0 ? b : e === 1 ? c : a
      const chave = p < q ? p * multiplicador + q : q * multiplicador + p
      const outra = arestaVista.get(chave)
      if (outra === undefined) {
        arestaVista.set(chave, t)
      } else {
        arestaVista.delete(chave)
        const d = nx * normais[outra * 3] + ny * normais[outra * 3 + 1] + nz * normais[outra * 3 + 2]
        if (d < COS_ARESTA_VIVA && n + 2 <= saida.length) {
          saida[n++] = p
          saida[n++] = q
        }
      }
    }
  }
  // O que sobrou é borda: só um triângulo encosta nela.
  for (const chave of arestaVista.keys()) {
    if (n + 2 > saida.length) break
    const q = chave % multiplicador
    const p = (chave - q) / multiplicador
    saida[n++] = p
    saida[n++] = q
  }
  return n
}

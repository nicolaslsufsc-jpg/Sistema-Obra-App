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
let normaisT = new Float32Array(1 << 12)

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
  // Tamanho pela peça atual, não pela maior já vista: zerar a tabela inteira a cada peça pequena
  // custava caro depois que uma peça grande passava.
  const tam = Math.max(16, 1 << Math.ceil(Math.log2(qtdV * 2)))
  if (tabelaSolda.length < tam) tabelaSolda = new Int32Array(tam)
  else tabelaSolda.fill(0, 0, tam)
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
  // Reaproveitada: só é lida a normal de triângulo que já foi escrita nesta chamada.
  if (normaisT.length < qtdT * 3) normaisT = new Float32Array(qtdT * 6)
  const normais = normaisT
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

/** Alfa (0 a 255) a partir do qual a cor do IFC conta como opaca. O sombreador usa alfa < 0,995. */
const ALFA_OPACO = 254

/**
 * Triângulos que têm algum vértice com transparência no próprio IFC (vidro). Devolve os números
 * dos triângulos (posição no índice dividida por 3).
 */
export function triangulosComAlfa(cores: Uint8Array, indices: Uint32Array): Uint32Array {
  const r: number[] = []
  for (let k = 0, t = 0; k < indices.length; k += 3, t++) {
    if (cores[indices[k] * 4 + 3] < ALFA_OPACO || cores[indices[k + 1] * 4 + 3] < ALFA_OPACO || cores[indices[k + 2] * 4 + 3] < ALFA_OPACO) r.push(t)
  }
  return Uint32Array.from(r)
}

/**
 * Índice só com os triângulos que podem sair transparentes: os de `triangulos` mais as faixas do
 * índice em `faixas` (pares início, quantidade), sem repetir triângulo. Vazio se não houver nenhum.
 * A passada transparente desenha só isto, em vez do bloco inteiro de novo.
 */
export function indiceSoDoVidro(indices: Uint32Array, triangulos: Uint32Array, faixas: readonly number[] = []): Uint32Array {
  const qtdT = indices.length / 3
  const marca = new Uint8Array(qtdT)
  let n = 0
  for (const t of triangulos) {
    if (marca[t]) continue
    marca[t] = 1
    n++
  }
  for (let f = 0; f < faixas.length; f += 2) {
    const t0 = faixas[f] / 3
    const t1 = t0 + faixas[f + 1] / 3
    for (let t = t0; t < t1; t++) {
      if (marca[t]) continue
      marca[t] = 1
      n++
    }
  }
  const r = new Uint32Array(n * 3)
  for (let t = 0, o = 0; t < qtdT && o < r.length; t++) {
    if (!marca[t]) continue
    r[o++] = indices[t * 3]
    r[o++] = indices[t * 3 + 1]
    r[o++] = indices[t * 3 + 2]
  }
  return r
}

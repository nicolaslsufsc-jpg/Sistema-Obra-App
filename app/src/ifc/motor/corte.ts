// Corte: encontra onde o plano atravessa cada peça. Sem tela aqui.
// O resultado serve para três coisas: tampar a peça cortada no 3D, desenhar a vista 2D e exportar DXF/SVG.
import { ShapeUtils, Vector2 } from 'three'
import type { ModeloIfc, Vec3 } from './tipos'

/** Plano em coordenada de cena. O lado para onde `normal` aponta é o que sai da vista. */
export interface PlanoCorte {
  normal: Vec3
  /** Um ponto do plano. */
  ponto: Vec3
  /** Eixos no plano: `u` para a direita e `v` para cima, olhando a parte que fica. */
  u: Vec3
  v: Vec3
}

export interface EntradaCorte {
  /** Número que volta no resultado (índice do modelo aberto). */
  chave: number
  modelo: ModeloIfc
  /** Matriz (coluna a coluna) do modelo para a cena. Só rotação e translação. */
  matriz: ArrayLike<number>
  /** Elemento entra no corte? */
  visivel: (elemento: number) => boolean
}

export interface CorteDeElemento {
  chave: number
  elemento: number
  /** Laços fechados no plano: [u0, v0, u1, v1, ...]. Sem repetir o primeiro ponto no fim. */
  lacos: Float64Array[]
  /** Pedaços que não fecharam (malha com furo): só risco, sem preenchimento. */
  abertos: Float64Array[]
}

export interface ResultadoCorte {
  plano: PlanoCorte
  pecas: CorteDeElemento[]
  /** min u, min v, max u, max v. Null se o plano não pegou nada. */
  limites: [number, number, number, number] | null
}

function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function normalizar(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/**
 * Monta os eixos do plano. Vertical: V é para cima. Horizontal: V é o "norte" (-Z da cena),
 * a não ser que `refV` diga outra direção (a planta sai alinhada ao prédio, e não ao arquivo).
 */
export function planoDe(normal: Vec3, ponto: Vec3, refV?: Vec3): PlanoCorte {
  const n = normalizar(normal)
  const horizontal = Math.abs(n[1]) > 0.9
  // Olhamos de +n para -n; com V para cima, U = V × n fica para a direita de quem olha.
  const ref: Vec3 = refV ?? (horizontal ? [0, 0, n[1] > 0 ? -1 : 1] : [0, 1, 0])
  const u = normalizar(cross(ref, n))
  const v = normalizar(cross(n, u))
  return { normal: n, ponto, u, v }
}

/** Passa o vetor da cena para o sistema do modelo (matriz inversa de rotação + translação). */
function paraModeloVetor(m: ArrayLike<number>, a: Vec3): Vec3 {
  return [m[0] * a[0] + m[1] * a[1] + m[2] * a[2], m[4] * a[0] + m[5] * a[1] + m[6] * a[2], m[8] * a[0] + m[9] * a[1] + m[10] * a[2]]
}

function paraModeloPonto(m: ArrayLike<number>, a: Vec3): Vec3 {
  return paraModeloVetor(m, [a[0] - m[12], a[1] - m[13], a[2] - m[14]])
}

/** Pontos a menos de 0,5 mm são o mesmo ao juntar os pedaços do corte. */
const PASSO = 2000

function chavePonto(u: number, v: number): string {
  return `${Math.round(u * PASSO)}_${Math.round(v * PASSO)}`
}

/** Junta segmentos soltos em laços fechados. */
export function juntarSegmentos(seg: number[]): { lacos: Float64Array[]; abertos: Float64Array[] } {
  const qtd = seg.length / 4
  const usados = new Uint8Array(qtd)
  const porPonto = new Map<string, number[]>()
  const anexar = (k: string, s: number) => {
    const l = porPonto.get(k)
    if (l) l.push(s)
    else porPonto.set(k, [s])
  }
  const chaves: string[] = new Array(qtd * 2)
  for (let s = 0; s < qtd; s++) {
    const a = chavePonto(seg[s * 4], seg[s * 4 + 1])
    const b = chavePonto(seg[s * 4 + 2], seg[s * 4 + 3])
    chaves[s * 2] = a
    chaves[s * 2 + 1] = b
    if (a === b) {
      usados[s] = 1 // segmento de comprimento zero
      continue
    }
    anexar(a, s)
    anexar(b, s)
  }

  const lacos: Float64Array[] = []
  const abertos: Float64Array[] = []
  for (let inicio = 0; inicio < qtd; inicio++) {
    if (usados[inicio]) continue
    usados[inicio] = 1
    const pontos: number[] = [seg[inicio * 4], seg[inicio * 4 + 1]]
    const chaveInicial = chaves[inicio * 2]
    let chaveAtual = chaves[inicio * 2 + 1]
    let u = seg[inicio * 4 + 2]
    let v = seg[inicio * 4 + 3]
    let fechou = false
    for (;;) {
      pontos.push(u, v)
      if (chaveAtual === chaveInicial) {
        fechou = true
        break
      }
      const candidatos = porPonto.get(chaveAtual)
      let prox = -1
      if (candidatos) {
        for (const c of candidatos) {
          if (!usados[c]) {
            prox = c
            break
          }
        }
      }
      if (prox < 0) break
      usados[prox] = 1
      if (chaves[prox * 2] === chaveAtual) {
        chaveAtual = chaves[prox * 2 + 1]
        u = seg[prox * 4 + 2]
        v = seg[prox * 4 + 3]
      } else {
        chaveAtual = chaves[prox * 2]
        u = seg[prox * 4]
        v = seg[prox * 4 + 1]
      }
    }
    if (fechou && pontos.length >= 8) {
      pontos.length -= 2 // o último repete o primeiro
      lacos.push(Float64Array.from(pontos))
    } else if (pontos.length >= 4) {
      abertos.push(Float64Array.from(pontos))
    }
  }
  return { lacos, abertos }
}

/** Corta uma peça. Grava os segmentos em `saida`, no sistema do plano. */
export function cortarElemento(modelo: ModeloIfc, elemento: number, n: Vec3, p0: Vec3, u: Vec3, v: Vec3, saida: number[]): void {
  const { partesInicio, partes } = modelo.tabela
  const d0 = dot(n, p0)
  const u0 = dot(u, p0)
  const v0 = dot(v, p0)
  for (let k = partesInicio[elemento]; k < partesInicio[elemento + 1]; k += 3) {
    const bloco = modelo.blocos[partes[k]]
    const pos = bloco.posicoes
    const idx = bloco.indices
    const fim = partes[k + 1] + partes[k + 2]
    for (let t = partes[k + 1]; t < fim; t += 3) {
      const a = idx[t] * 3
      const b = idx[t + 1] * 3
      const c = idx[t + 2] * 3
      const ax = pos[a]
      const ay = pos[a + 1]
      const az = pos[a + 2]
      const bx = pos[b]
      const by = pos[b + 1]
      const bz = pos[b + 2]
      const cx = pos[c]
      const cy = pos[c + 1]
      const cz = pos[c + 2]
      const da = n[0] * ax + n[1] * ay + n[2] * az - d0
      const db = n[0] * bx + n[1] * by + n[2] * bz - d0
      const dc = n[0] * cx + n[1] * cy + n[2] * cz - d0
      // Ponto exatamente no plano conta como "de cima". Assim um triângulo com um vértice no plano
      // não gera segmento repetido, e face deitada no plano não gera nada.
      const sa = da >= 0
      const sb = db >= 0
      const sc = dc >= 0
      if (sa === sb && sb === sc) continue

      let x1: number, y1: number, z1: number, x2: number, y2: number, z2: number
      if (sa !== sb) {
        const t1 = da / (da - db)
        x1 = ax + (bx - ax) * t1
        y1 = ay + (by - ay) * t1
        z1 = az + (bz - az) * t1
        if (sb !== sc) {
          const t2 = db / (db - dc)
          x2 = bx + (cx - bx) * t2
          y2 = by + (cy - by) * t2
          z2 = bz + (cz - bz) * t2
        } else {
          const t2 = da / (da - dc)
          x2 = ax + (cx - ax) * t2
          y2 = ay + (cy - ay) * t2
          z2 = az + (cz - az) * t2
        }
      } else {
        const t1 = db / (db - dc)
        x1 = bx + (cx - bx) * t1
        y1 = by + (cy - by) * t1
        z1 = bz + (cz - bz) * t1
        const t2 = da / (da - dc)
        x2 = ax + (cx - ax) * t2
        y2 = ay + (cy - ay) * t2
        z2 = az + (cz - az) * t2
      }
      saida.push(
        u[0] * x1 + u[1] * y1 + u[2] * z1 - u0,
        v[0] * x1 + v[1] * y1 + v[2] * z1 - v0,
        u[0] * x2 + u[1] * y2 + u[2] * z2 - u0,
        v[0] * x2 + v[1] * y2 + v[2] * z2 - v0,
      )
    }
  }
}

export interface Cancelamento {
  cancelado: boolean
}

function agora(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/**
 * Corta todos os modelos. Só passa pelos triângulos das peças cuja caixa o plano atravessa,
 * e devolve o controle para a tela de tempos em tempos (nada de tela travada no tablet).
 */
export async function cortar(entradas: readonly EntradaCorte[], plano: PlanoCorte, cancel?: Cancelamento): Promise<ResultadoCorte | null> {
  const pecas: CorteDeElemento[] = []
  let minU = Infinity
  let minV = Infinity
  let maxU = -Infinity
  let maxV = -Infinity
  let marca = agora()

  for (const e of entradas) {
    const m = e.matriz
    const n = paraModeloVetor(m, plano.normal)
    const u = paraModeloVetor(m, plano.u)
    const v = paraModeloVetor(m, plano.v)
    const p0 = paraModeloPonto(m, plano.ponto)
    const d0 = dot(n, p0)
    const caixas = e.modelo.tabela.caixas
    const qtd = e.modelo.tabela.expressIds.length
    const seg: number[] = []
    for (let i = 0; i < qtd; i++) {
      if (i % 64 === 0 && agora() - marca > 12) {
        await new Promise((r) => setTimeout(r, 0))
        if (cancel?.cancelado) return null
        marca = agora()
      }
      const b = i * 6
      // Distância mínima e máxima da caixa ao plano, sem testar os 8 cantos.
      const dMin =
        n[0] * (n[0] >= 0 ? caixas[b] : caixas[b + 3]) + n[1] * (n[1] >= 0 ? caixas[b + 1] : caixas[b + 4]) + n[2] * (n[2] >= 0 ? caixas[b + 2] : caixas[b + 5]) - d0
      if (dMin > 0) continue
      const dMax =
        n[0] * (n[0] >= 0 ? caixas[b + 3] : caixas[b]) + n[1] * (n[1] >= 0 ? caixas[b + 4] : caixas[b + 1]) + n[2] * (n[2] >= 0 ? caixas[b + 5] : caixas[b + 2]) - d0
      if (dMax < 0) continue
      if (!e.visivel(i)) continue

      seg.length = 0
      cortarElemento(e.modelo, i, n, p0, u, v, seg)
      if (seg.length === 0) continue
      const { lacos, abertos } = juntarSegmentos(seg)
      if (!lacos.length && !abertos.length) continue
      for (const l of [lacos, abertos]) {
        for (const pts of l) {
          for (let k = 0; k < pts.length; k += 2) {
            const a = pts[k]
            const c = pts[k + 1]
            if (a < minU) minU = a
            if (a > maxU) maxU = a
            if (c < minV) minV = c
            if (c > maxV) maxV = c
          }
        }
      }
      pecas.push({ chave: e.chave, elemento: i, lacos, abertos })
    }
  }
  return { plano, pecas, limites: minU === Infinity ? null : [minU, minV, maxU, maxV] }
}

function areaDoLaco(l: Float64Array): number {
  let a = 0
  const n = l.length
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n
    a += l[i] * l[j + 1] - l[j] * l[i + 1]
  }
  return a / 2
}

function dentro(u: number, v: number, l: Float64Array): boolean {
  let d = false
  const n = l.length
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const yi = l[i + 1]
    const yj = l[j + 1]
    if (yi > v !== yj > v && u < ((l[j] - l[i]) * (v - yi)) / (yj - yi) + l[i]) d = !d
  }
  return d
}

/**
 * Triângulos que preenchem os laços de uma peça, respeitando furos (laço dentro de laço é vazio,
 * laço dentro do vazio é cheio de novo). Devolve [u, v, u, v, ...], 3 pontos por triângulo.
 */
export function preencher(lacos: readonly Float64Array[]): number[] {
  const saida: number[] = []
  if (!lacos.length) return saida
  // Peça com muitos laços (grade, painel furado): comparar todos com todos sairia caro; preenche cada um.
  const comparar = lacos.length <= 200
  const areas = lacos.map((l) => Math.abs(areaDoLaco(l)))
  const ordem = lacos.map((_, i) => i).sort((a, b) => areas[b] - areas[a])
  const profundidade = new Int32Array(lacos.length)
  const furosDe = new Map<number, number[]>()
  if (comparar) {
    for (let a = 0; a < ordem.length; a++) {
      const i = ordem[a]
      let pai = -1
      for (let b = a - 1; b >= 0; b--) {
        const j = ordem[b]
        if (areas[j] > areas[i] && dentro(lacos[i][0], lacos[i][1], lacos[j])) {
          pai = j
          profundidade[i] = profundidade[j] + 1
          break
        }
      }
      if (profundidade[i] % 2 === 1) {
        const l = furosDe.get(pai)
        if (l) l.push(i)
        else furosDe.set(pai, [i])
      }
    }
  }
  const paraVetores = (l: Float64Array) => {
    const r: Vector2[] = new Array(l.length / 2)
    for (let i = 0; i < l.length; i += 2) r[i / 2] = new Vector2(l[i], l[i + 1])
    return r
  }
  for (let i = 0; i < lacos.length; i++) {
    if (profundidade[i] % 2 === 1) continue
    if (areas[i] < 1e-8) continue
    const contorno = paraVetores(lacos[i])
    const furos = (furosDe.get(i) ?? []).map((f) => paraVetores(lacos[f]))
    const tris = ShapeUtils.triangulateShape(contorno, furos)
    const todos = contorno.concat(...furos)
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const p = todos[t[k]]
        saida.push(p.x, p.y)
      }
    }
  }
  return saida
}

/** Direção principal da construção, em radianos (0 a 90°). Prédio raramente está alinhado ao eixo do arquivo. */
export function direcaoPrincipal(modelos: ReadonlyArray<{ modelo: ModeloIfc; matriz: ArrayLike<number> }>): number {
  const CASAS = 90
  const hist = new Float64Array(CASAS)
  for (const { modelo, matriz: m } of modelos) {
    for (const b of modelo.blocos) {
      const pos = b.posicoes
      const idx = b.indices
      // Amostra: não precisa de todos os triângulos para saber a direção das paredes.
      const passo = Math.max(1, Math.floor(idx.length / 3 / 20000)) * 3
      for (let t = 0; t + 2 < idx.length; t += passo) {
        const a = idx[t] * 3
        const c = idx[t + 1] * 3
        const d = idx[t + 2] * 3
        const ux = pos[c] - pos[a]
        const uy = pos[c + 1] - pos[a + 1]
        const uz = pos[c + 2] - pos[a + 2]
        const vx = pos[d] - pos[a]
        const vy = pos[d + 1] - pos[a + 1]
        const vz = pos[d + 2] - pos[a + 2]
        const nx = uy * vz - uz * vy
        const ny = uz * vx - ux * vz
        const nz = ux * vy - uy * vx
        const area = Math.hypot(nx, ny, nz)
        if (area < 1e-6 || Math.abs(ny) > area * 0.2) continue
        // Só o giro em torno da vertical importa.
        const wx = m[0] * nx + m[8] * nz
        const wz = m[2] * nx + m[10] * nz
        let ang = (Math.atan2(wz, wx) * 180) / Math.PI
        ang = ((ang % 90) + 90) % 90
        hist[Math.floor(ang) % CASAS] += area
      }
    }
  }
  let melhor = 0
  let pico = -1
  for (let i = 0; i < CASAS; i++) {
    const s = hist[i] + hist[(i + 1) % CASAS]
    if (s > pico) {
      pico = s
      melhor = i
    }
  }
  // Cada casa cobre 1 grau: o pico de duas casas vizinhas fica na divisa entre elas.
  return (((melhor + 1) % CASAS) * Math.PI) / 180
}

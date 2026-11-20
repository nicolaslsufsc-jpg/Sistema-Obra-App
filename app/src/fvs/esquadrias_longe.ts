// Esquadrias com a planta longe (testador, 20/11/2026, obra piloto em 375 px): as bolinhas das portas e janelas
// cobriam a planta de ambientes inteira. Igual aos furos de laje:
// - longe, a bolinha some (em qualquer aba); na aba Esquadrias, no lugar dela, um número por apartamento
//   ("12 esquadrias", "3 de 12 esquadrias OK"), que se junta ao vizinho quando os dois se tocariam na tela;
// - perto (1 m da folha com ESQUADRIAS_PERTO_PX_POR_M px ou mais), as bolinhas voltam, só na aba Esquadrias.
// O apartamento é o começo do nome do ambiente ("602" em "602-03"); sem traço, o nome inteiro (área comum).

import type { FurosDaArea } from './furos_laje'
import type { ElementoPacote } from './pacote'

/** Perto: 1 m da folha com pelo menos isso de px na tela (porta de 80 cm com ~26 px, bolinha de 14 px). */
export const ESQUADRIAS_PERTO_PX_POR_M = 32

/**
 * Pontos da folha por metro de obra na planta das esquadrias. A planta de ambientes nem sempre traz a escala
 * (no 6º da obra piloto não trazia, e a folha era ~3,4 vezes menor que 1:50): mede pelas próprias
 * esquadrias, cujo código diz a largura em cm (PM80: 80 cm; JA120B: 120 cm), pela mediana do lado maior do
 * retângulo. Com menos de 5 esquadrias medíveis, vale a escala do pacote (1:50 sem ela).
 */
export function pontosPorMetroDasEsquadrias(elementos: Record<string, ElementoPacote> | undefined, escala = 50): number {
  const medidas: number[] = []
  for (const e of Object.values(elementos ?? {})) {
    if (e.tipo !== 'E') continue
    const cm = Number(/^[A-Za-z]+(\d{2,3})/.exec(e.esquadria?.codigo ?? e.secao ?? '')?.[1])
    const lado = Math.max(e.rotulo[2] - e.rotulo[0], e.rotulo[3] - e.rotulo[1])
    if (cm >= 30 && cm <= 600 && lado > 0) medidas.push(lado / (cm / 100))
  }
  if (medidas.length < 5) return ((1000 / escala) * 72) / 25.4
  medidas.sort((a, b) => a - b)
  return medidas[Math.floor(medidas.length / 2)]
}

/** Zoom a partir do qual as bolinhas das esquadrias aparecem (CRS.Simple: 1 ponto da folha = 2^zoom px). */
export function zoomDasEsquadrias(ptPorM: number): number {
  return Math.log2(ESQUADRIAS_PERTO_PX_POR_M / ptPorM)
}

/** "602" em "602-03"; sem traço, o nome inteiro. */
export function unidadeDoAmbiente(nome: string): string {
  const i = nome.indexOf('-')
  return (i > 0 ? nome.slice(0, i) : nome).trim()
}

/**
 * As esquadrias agrupadas por apartamento, para o número de longe. A chave começa com "q:" para o
 * juntarNumerosPerto juntar números que se tocariam na tela. Na ordem do apartamento.
 */
export function esquadriasPorUnidade(elementos: Record<string, ElementoPacote> | undefined): FurosDaArea[] {
  const grupos = new Map<string, { ids: string[]; pts: Array<[number, number]> }>()
  for (const [id, e] of Object.entries(elementos ?? {})) {
    if (e.tipo !== 'E') continue
    const amb = e.ambiente ? elementos?.[e.ambiente] : undefined
    const unidade = unidadeDoAmbiente(amb?.nome ?? e.nome)
    const [x0, y0, x1, y1] = e.rotulo
    const g = grupos.get(unidade) ?? { ids: [], pts: [] }
    g.ids.push(id)
    g.pts.push([(x0 + x1) / 2, (y0 + y1) / 2])
    grupos.set(unidade, g)
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true }))
    .map(([unidade, g]) => {
      const xs = g.pts.map((p) => p[0])
      const ys = g.pts.map((p) => p[1])
      const centro: [number, number] = [xs.reduce((s, v) => s + v, 0) / xs.length, ys.reduce((s, v) => s + v, 0) / ys.length]
      let perto = g.pts[0]
      for (const p of g.pts) if (Math.hypot(p[0] - centro[0], p[1] - centro[1]) < Math.hypot(perto[0] - centro[0], perto[1] - centro[1])) perto = p
      return { chave: `q:esq:${unidade}`, ids: g.ids, centro, caixa: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], perto }
    })
}

/** Esquadrias mais perto que isto (metros de obra) se encostariam na tela de perto: viram um grupo. */
export const ESQUADRIAS_JUNTAS_M = 0.6

/**
 * Onde desenhar cada esquadria (testador no S23, 20/11: de perto, as bolinhas caíam em cima umas das
 * outras, aos pares, e o dedo não acertava). A porta entre dois cômodos é uma esquadria de cada lado, quase
 * no mesmo ponto: cada uma anda para o lado do ambiente dela. Grupo de esquadrias que se encostam abre num
 * círculo em volta do meio delas, com espaço para cada bolinha no zoom em que elas aparecem. Fora de grupo, o
 * meio do retângulo. Em pontos da folha.
 */
export function posicoesDasEsquadrias(elementos: Record<string, ElementoPacote> | undefined, ptPorM: number): Map<string, [number, number]> {
  const junta = ESQUADRIAS_JUNTAS_M * ptPorM
  const meio = (r: readonly number[]): [number, number] => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2]
  const itens = Object.entries(elementos ?? {})
    .filter(([, e]) => e.tipo === 'E')
    .map(([id, e]) => ({ id, e, p: meio(e.rotulo) }))
  const saida = new Map<string, [number, number]>()
  // grupos por encosto (quem encosta em alguém do grupo entra nele)
  const grupoDe = new Map<string, number>()
  const grupos: Array<typeof itens> = []
  for (const it of itens) {
    const perto = new Set<number>()
    for (const o of itens) if (o !== it && grupoDe.has(o.id) && Math.hypot(o.p[0] - it.p[0], o.p[1] - it.p[1]) < junta) perto.add(grupoDe.get(o.id)!)
    const [primeiro, ...outros] = [...perto]
    const alvo = primeiro ?? grupos.length
    if (primeiro === undefined) grupos.push([])
    grupos[alvo].push(it)
    grupoDe.set(it.id, alvo)
    for (const g of outros) {
      for (const o of grupos[g]) {
        grupos[alvo].push(o)
        grupoDe.set(o.id, alvo)
      }
      grupos[g] = []
    }
  }
  for (const g of grupos) {
    if (g.length === 1) saida.set(g[0].id, g[0].p)
    if (g.length < 2) continue
    const c: [number, number] = [g.reduce((s, o) => s + o.p[0], 0) / g.length, g.reduce((s, o) => s + o.p[1], 0) / g.length]
    // raio: vizinhos no círculo a ESQUADRIAS_JUNTAS_M um do outro
    const raio = Math.max(0.4, ESQUADRIAS_JUNTAS_M / 2 / Math.sin(Math.PI / g.length)) * ptPorM
    // ângulo de cada uma: para o lado do ambiente dela; se dois ficam a menos de 60°, distribui por igual
    const angulos = g.map((o) => {
      const amb = o.e.ambiente ? elementos?.[o.e.ambiente] : undefined
      const a = amb ? meio(amb.rotulo) : null
      return a && Math.hypot(a[0] - c[0], a[1] - c[1]) > 1e-6 ? Math.atan2(a[1] - c[1], a[0] - c[0]) : null
    })
    const minimo = Math.PI / 3
    const separados =
      angulos.every((a) => a !== null) &&
      angulos.every((a, i) => angulos.every((b, j) => i === j || Math.abs(Math.atan2(Math.sin(a! - b!), Math.cos(a! - b!))) >= minimo))
    const inicio = angulos.find((a) => a !== null) ?? -Math.PI / 2
    g.forEach((o, i) => {
      const a = separados ? angulos[i]! : inicio + (2 * Math.PI * i) / g.length
      saida.set(o.id, [c[0] + raio * Math.cos(a), c[1] + raio * Math.sin(a)])
    })
  }
  // a esquadria afastada pode cair perto de outra de fora do grupo: as que ainda se encostam se empurram
  const ids = [...saida.keys()]
  for (let volta = 0; volta < 8; volta++) {
    let mexeu = false
    for (let i = 0; i < ids.length; i++) {
      const a = saida.get(ids[i])!
      for (let j = i + 1; j < ids.length; j++) {
        const b = saida.get(ids[j])!
        const dx = b[0] - a[0]
        const dy = b[1] - a[1]
        if (Math.abs(dx) >= junta || Math.abs(dy) >= junta) continue
        const d = Math.hypot(dx, dy)
        if (d >= junta) continue
        const [ux, uy] = d > 1e-9 ? [dx / d, dy / d] : [1, 0]
        const passo = (junta - d) / 2 + 1e-6
        a[0] -= ux * passo
        a[1] -= uy * passo
        b[0] += ux * passo
        b[1] += uy * passo
        mexeu = true
      }
    }
    if (!mexeu) break
  }
  return saida
}

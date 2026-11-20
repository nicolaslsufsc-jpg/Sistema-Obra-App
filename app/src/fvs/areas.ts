// Áreas de laje: um polígono desenhado na planta e ligado a uma ficha, para mostrar o quanto da laje
// está liberado. Parte pura, sem banco e sem tela (testada em areas.test.ts).
//
// A laje não é concretada de uma vez e não existe como peça na forma. Quem abre a ficha desenha na hora
// a parte da laje a que ela se refere: a área fica na cor da situação da ficha, igual às peças (cinza,
// em andamento, azul liberado para concretar, verde liberado, vermelho com NC).
//
// Tabela fvs_areas, só inclusão: cada mudança é uma linha nova com o mesmo area_id, e vale a mais nova.
// As marcações apontam para o area_id, então redesenhar o contorno não perde o que foi marcado.

import type { ElementoPacote } from './pacote'
import { fichasPara, situacaoDaPeca, type EventoFvs, type Ficha, type Situacao } from './situacao'

export type Ponto = [number, number]

export interface AreaDeLaje {
  /** o area_id: é com este id que as marcações apontam para a área */
  id: string
  /** a linha que está valendo */
  versao: string
  pavimento_id: string
  /** o trecho da planta: as coordenadas do desenho só valem nele */
  setor_id: string
  planta_id: string | null
  nome: string
  ficha_id: string
  /** código da ficha no sistema oficial, se a pessoa já abriu lá */
  codigo_ficha: string | null
  contorno: Ponto[]
  usuario_id: string
  criado_em_dispositivo: string
  /** quando a área foi criada, e não a última mudança */
  criada_em: string
}

export interface LinhaDeArea {
  id: string
  area_id?: unknown
  pavimento_id?: unknown
  setor_id?: unknown
  planta_id?: unknown
  nome?: unknown
  ficha_id?: unknown
  codigo_ficha?: unknown
  contorno?: unknown
  cancelada?: unknown
  usuario_id: string
  criado_em_dispositivo: string
}

/** As áreas que valem hoje: a linha mais nova de cada uma, sem as apagadas. */
export function areasVigentes(linhas: readonly LinhaDeArea[]): AreaDeLaje[] {
  const porArea = new Map<string, LinhaDeArea[]>()
  for (const l of linhas) {
    const id = String(l.area_id ?? l.id)
    const lista = porArea.get(id)
    if (lista) lista.push(l)
    else porArea.set(id, [l])
  }
  const saida: AreaDeLaje[] = []
  for (const [id, lista] of porArea) {
    const ordem = [...lista].sort((a, b) => (a.criado_em_dispositivo === b.criado_em_dispositivo ? a.id.localeCompare(b.id) : a.criado_em_dispositivo < b.criado_em_dispositivo ? -1 : 1))
    const ultima = ordem[ordem.length - 1]
    if (ultima.cancelada) continue
    saida.push({
      id,
      versao: ultima.id,
      pavimento_id: String(ultima.pavimento_id),
      setor_id: String(ultima.setor_id),
      planta_id: (ultima.planta_id as string | null) ?? null,
      nome: String(ultima.nome ?? ''),
      ficha_id: String(ultima.ficha_id),
      codigo_ficha: (ultima.codigo_ficha as string | null) ?? null,
      contorno: (ultima.contorno as Ponto[]) ?? [],
      usuario_id: ultima.usuario_id,
      criado_em_dispositivo: ultima.criado_em_dispositivo,
      criada_em: ordem[0].criado_em_dispositivo,
    })
  }
  return saida.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
}

/** Área em pontos² (fórmula do cadarço). Sempre positiva. */
export function areaDoContorno(pts: readonly Ponto[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % pts.length]
    s += x0 * y1 - x1 * y0
  }
  return Math.abs(s) / 2
}

/** Escala da planta de forma quando o manifest não diz (os pacotes antigos são todos 1:50). */
export const ESCALA_PADRAO = 50

/** O N de 1:N que vale: o do manifest da planta, se for um número que faz sentido; senão 1:50. */
export function escalaDaPlanta(escala?: unknown): number {
  return typeof escala === 'number' && Number.isFinite(escala) && escala > 0 && escala <= 10000 ? escala : ESCALA_PADRAO
}

/** Metros por ponto: 1 ponto = 1/72 pol. no papel, vezes a escala da planta. */
function metrosPorPonto(escala?: unknown): number {
  return (0.0254 / 72) * escalaDaPlanta(escala)
}

/** m² na obra. `escala` é o N de 1:N do manifest.json da planta; sem ele, 1:50. */
export function metrosQuadrados(pts: readonly Ponto[], escala?: unknown): number {
  const m = metrosPorPonto(escala)
  return areaDoContorno(pts) * m * m
}

export function textoDaMetragem(pts: readonly Ponto[], escala?: unknown): string {
  return `≈ ${Math.round(metrosQuadrados(pts, escala)).toLocaleString('pt-BR')} m²`
}

/** Centro do polígono, onde fica a caixa com o nome. Em L ou em U pode cair fora, e tudo bem: é só um rótulo. */
export function centroDoContorno(pts: readonly Ponto[]): Ponto {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % pts.length]
    const k = x0 * y1 - x1 * y0
    a += k
    cx += (x0 + x1) * k
    cy += (y0 + y1) * k
  }
  if (Math.abs(a) < 1e-6) {
    const n = pts.length || 1
    return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n]
  }
  return [cx / (3 * a), cy / (3 * a)]
}

/** Dois segmentos se cruzam (encostar num ponto em comum não conta). */
function cruzam(a: Ponto, b: Ponto, c: Ponto, d: Ponto): boolean {
  const lado = (p: Ponto, q: Ponto, r: Ponto) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = lado(c, d, a)
  const d2 = lado(c, d, b)
  const d3 = lado(a, b, c)
  const d4 = lado(a, b, d)
  return d1 * d2 < 0 && d3 * d4 < 0
}

/** O que há de errado com o desenho, em palavras para a tela. Vazio = pode gravar. */
export function problemaDoContorno(pts: readonly Ponto[]): string {
  if (pts.length < 3) return 'Marque pelo menos 3 cantos.'
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    for (let j = i + 2; j < pts.length; j++) {
      if (i === 0 && j === pts.length - 1) continue // lados vizinhos: o último encosta no primeiro
      if (cruzam(a, b, pts[j], pts[(j + 1) % pts.length])) return 'As linhas da área se cruzam. Desfaça o último ponto e marque na ordem do contorno.'
    }
  }
  if (areaDoContorno(pts) < 1) return 'A área ficou sem tamanho: os cantos estão em linha.'
  return ''
}

/** A área como um local da planta: a tela, o painel e as listas tratam igual a uma peça. */
export function areaComoElemento(a: AreaDeLaje, escala?: unknown): ElementoPacote {
  const xs = a.contorno.map((p) => p[0])
  const ys = a.contorno.map((p) => p[1])
  return {
    tipo: 'L',
    nome: a.nome,
    secao: textoDaMetragem(a.contorno, escala),
    rotulo: xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : [0, 0, 0, 0],
    polys: [a.contorno],
  }
}

/** Ponto dentro do polígono (par/ímpar). */
export function dentro(p: readonly [number, number], pts: readonly Ponto[]): boolean {
  let d = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) d = !d
  }
  return d
}

/** Consolo ou capitel de um pilar, com o contorno na planta (pacote.ts, partesDaPlanta). */
export interface ParteNaPlanta {
  elementoId: string
  nome: string
  tipo: string
  polys: ReadonlyArray<readonly Ponto[]>
}

/** O que segura a área de laje: a parte de um pilar dentro dela que ainda não foi liberada. */
export interface TravaDaArea {
  elementoId: string
  nome: string
  tipo: string
  situacao: Situacao
}

/**
 * Consolo e capitel dentro da área (algum canto de um dentro do outro) que ainda não estão liberados
 * (item pendente ou NC) travam a área: ela fica vermelha até a parte ser conferida (decisão do Nicolas,
 * 17/11). `situacaoDe` dá a situação da parte pelos itens dela; undefined = a ficha do pilar não tem
 * item da parte, e aí não há o que travar.
 */
export function travasDaArea(contorno: readonly Ponto[], partes: readonly ParteNaPlanta[], situacaoDe: (elementoId: string, tipo: string) => Situacao | undefined): TravaDaArea[] {
  if (contorno.length < 3) return []
  const saida: TravaDaArea[] = []
  for (const pt of partes) {
    const toca = pt.polys.some((poly) => poly.some((v) => dentro(v, contorno)) || (poly.length >= 3 && contorno.some((v) => dentro(v, poly))))
    if (!toca) continue
    const s = situacaoDe(pt.elementoId, pt.tipo)
    if (s && s !== 'liberado') saida.push({ elementoId: pt.elementoId, nome: pt.nome, tipo: pt.tipo, situacao: s })
  }
  return saida.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }) || a.tipo.localeCompare(b.tipo))
}

/** "Laje 3": o próximo número livre do pavimento. */
export function proximoNomeDeArea(areas: readonly AreaDeLaje[]): string {
  let n = areas.length + 1
  const nomes = new Set(areas.map((a) => a.nome.trim().toLowerCase()))
  while (nomes.has(`laje ${n}`)) n++
  return `Laje ${n}`
}

/**
 * Fichas que a caixa oferece: primeiro as de laje, depois as outras de estrutura (parede de concreto,
 * cortina...), porque quem abre a ficha é que sabe. Só a revisão vigente de cada código. Ficha de
 * ambiente não entra: esta planta é de estrutura.
 */
export function fichasDaCaixa(fichas: readonly Ficha[]): Ficha[] {
  const deLaje = fichasPara('L', fichas)
  const codigos = new Set(deLaje.map((f) => f.codigo))
  const outras = [...new Set(fichas.flatMap((f) => f.aplica_a))].filter((t) => t !== 'L' && t !== 'A').flatMap((t) => fichasPara(t, fichas))
  const vistas = new Set<string>()
  const resto: Ficha[] = []
  for (const f of outras) {
    if (codigos.has(f.codigo) || vistas.has(f.codigo)) continue
    vistas.add(f.codigo)
    resto.push(f)
  }
  return [...deLaje, ...resto]
}

/** A ficha para já vir escolhida: a da área criada por último na obra, e não a primeira da lista. */
export function fichaInicialDaCaixa(opcoes: readonly Ficha[], areas: readonly AreaDeLaje[], fichaPorId: (id: string) => Ficha | undefined): Ficha | undefined {
  let maisNova: AreaDeLaje | undefined
  for (const a of areas) if (!maisNova || a.criada_em > maisNova.criada_em) maisNova = a
  const usada = maisNova && fichaPorId(maisNova.ficha_id)
  return (usada && opcoes.find((f) => f.codigo === usada.codigo)) ?? opcoes[0]
}

export interface ResumoDasAreas {
  total: number
  paraConcretar: number
  liberadas: number
  comR: number
  /** m² das áreas liberadas para concretar ou já liberadas */
  m2Liberados: number
  m2: number
}

/**
 * O quanto da laje está liberado no pavimento. `escalaDe` dá a escala da planta de cada área (o N do
 * manifest); quem não passa conta tudo em 1:50, como antes.
 */
export function resumoDasAreas(
  areas: readonly AreaDeLaje[],
  fichaPorId: (id: string) => Ficha | undefined,
  eventosDe: (id: string) => readonly EventoFvs[],
  escalaDe?: (plantaId: string | null) => unknown,
  /** consolo ou capitel pendente dentro da área (travasDaArea): a área conta como com NC */
  travada?: (a: AreaDeLaje) => boolean,
): ResumoDasAreas {
  const r: ResumoDasAreas = { total: 0, paraConcretar: 0, liberadas: 0, comR: 0, m2Liberados: 0, m2: 0 }
  for (const a of areas) {
    r.total++
    const m2 = metrosQuadrados(a.contorno, escalaDe?.(a.planta_id))
    r.m2 += m2
    const ficha = fichaPorId(a.ficha_id)
    const s = travada?.(a) ? 'reprovado' : ficha ? situacaoDaPeca(ficha, eventosDe(a.id)) : 'nada'
    if (s === 'concretagem') r.paraConcretar++
    if (s === 'liberado') r.liberadas++
    if (s === 'reprovado') r.comR++
    if (s === 'concretagem' || s === 'liberado') r.m2Liberados += m2
  }
  return r
}

/**
 * A área de laje que contém o ponto (coordenadas da planta); com mais de uma, a menor. É a conta que
 * liga à área o que o pacote traz pronto: os furos de laje (furos_laje.ts) e, na ligação entre peças,
 * os pilares e as vigas (ligacoes.ts).
 */
export function areaDoPonto(ponto: readonly [number, number], areas: readonly AreaDeLaje[]): AreaDeLaje | undefined {
  let melhor: AreaDeLaje | undefined
  let menor = Infinity
  for (const a of areas) {
    if (a.contorno.length < 3 || !dentro(ponto, a.contorno)) continue
    const m = Math.abs(areaDoContorno(a.contorno))
    if (m < menor) {
      menor = m
      melhor = a
    }
  }
  return melhor
}

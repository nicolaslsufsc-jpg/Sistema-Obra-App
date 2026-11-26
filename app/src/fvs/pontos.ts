// Pontos de instalações (frente INSTALAÇÕES, 20/11/2026; opção B do Nicolas: "Sim, no ambiente"). Parte
// pura, sem banco e sem tela (pontos.test.ts).
//
// A planta de uma disciplina (hidro, sanitário) traz os pontos do modelo (ralo, caixa sifonada, ponto de
// água, registro...) no pacote, como sobreposição ("pontos", pipeline/fvs/instalacoes.py), como as barras de
// laje: o ponto não é peça em "elementos". Na aba Pontos a pessoa toca no ponto: OK, ou errado (só com
// observação e Confirmar). O registro vai em fvs_eventos.barra_id (local de sobreposição: barra ou ponto),
// com planta_id, no item da ficha de ambiente marcado com `"pontos": "<disciplina>"`.

import { ladoDoQuadradoEmPontos, ZOOM_DOS_FUROS_DE_LAJE, type FurosDaArea } from './furos_laje'
import { disciplinasDoItem, type Ficha, type ItemFicha } from './situacao'

export type DisciplinaDePontos = 'hidro' | 'sanitario' | 'eletrico' | 'preventivo' | 'spda'
/** Na ordem do menu (pedido do Nicolas, 21/11/2026: hidráulico, esgoto, elétrico, preventivo, SPDA). */
export const DISCIPLINAS_DE_PONTOS: readonly DisciplinaDePontos[] = ['hidro', 'sanitario', 'eletrico', 'preventivo', 'spda']

/** A disciplina de pontos do manifest. A planta de furação também vem com "disciplina" ("furacao", pacote do
 *  20 de 21/11/2026) e não é planta de pontos: devolve undefined. */
export function disciplinaDePontos(d: string | undefined): DisciplinaDePontos | undefined {
  return (DISCIPLINAS_DE_PONTOS as readonly string[]).includes(d ?? '') ? (d as DisciplinaDePontos) : undefined
}
export type TipoDePonto =
  | 'ponto_agua'
  | 'registro'
  | 'hidrometro'
  | 'ralo'
  | 'caixa_sifonada'
  | 'caixa'
  | 'ponto_esgoto'
  // elétrico (laje e quadros) e SPDA, 20/11/2026
  | 'caixa_passagem'
  | 'ponto_luz'
  | 'quadro'
  | 'captor'
  | 'descida'
  | 'caixa_inspecao'
  | 'haste'
  // conector de aterramento do SPDA (combinado com o 20, 22/11/2026)
  | 'conector'
  // eletroduto como linha (21/11/2026, "eletroduto como linha"): tem "linha" além de "ponto"
  | 'eletroduto'
  // preventivo contra incêndio (21/11/2026; sem PES nem PVS na obra piloto: suposição); a tubulação é linha
  | 'hidrante'
  | 'extintor'
  | 'sprinkler'
  | 'detector'
  | 'iluminacao_emergencia'
  | 'alarme'
  | 'sinalizacao'
  | 'tubo_incendio'
  // 5.1 a 5.3 (redes suspensas, colunas e pontos na parede, 23/11/2026): o tubo é linha, como o eletroduto
  | 'tubo'
  | 'coluna'
  | 'caixa_parede'

export interface PontoPacote {
  disciplina: DisciplinaDePontos
  tipo: TipoDePonto
  /** posição na folha, pontos do PDF, y para baixo (no eletroduto, o meio da linha) */
  ponto: [number, number]
  /** só no que é linha (eletroduto): começo e fim na folha */
  linha?: Array<[number, number]>
  nome: string
  /** id do objeto no modelo IFC */
  modelo_id?: string
  /** o ambiente onde o ponto cai: o id da peça A na planta de ambientes (o nome vem dela); fora de ambiente, sem */
  ambiente?: string
}

export const NOME_DA_DISCIPLINA: Record<DisciplinaDePontos, string> = {
  hidro: 'Água fria e quente',
  sanitario: 'Esgoto e pluvial',
  eletrico: 'Caixas, quadros e eletrodutos',
  preventivo: 'Hidrantes, extintores e sprinklers',
  spda: 'Captores e descidas',
}

export const NOME_DO_TIPO: Record<TipoDePonto, string> = {
  ponto_agua: 'Ponto de água',
  registro: 'Registro',
  hidrometro: 'Hidrômetro',
  ralo: 'Ralo',
  caixa_sifonada: 'Caixa sifonada',
  caixa: 'Caixa',
  ponto_esgoto: 'Ponto de esgoto',
  caixa_passagem: 'Caixa de passagem',
  ponto_luz: 'Ponto de luz',
  quadro: 'Quadro',
  captor: 'Captor',
  descida: 'Descida',
  caixa_inspecao: 'Caixa de inspeção',
  haste: 'Haste de aterramento',
  conector: 'Conector de aterramento',
  eletroduto: 'Eletroduto',
  hidrante: 'Hidrante',
  extintor: 'Extintor',
  sprinkler: 'Sprinkler',
  detector: 'Detector',
  iluminacao_emergencia: 'Iluminação de emergência',
  alarme: 'Alarme',
  sinalizacao: 'Sinalização',
  tubo_incendio: 'Tubulação de incêndio',
  tubo: 'Tubo',
  coluna: 'Coluna (prumada)',
  caixa_parede: 'Caixa de parede',
}

/** Filtro por tipo de ponto (SPDA igual aos furos, pedido do Nicolas de 22/11/2026). */
export type FiltroDePontos = 'todos' | TipoDePonto

/** Nome do filtro no seletor: "Todos", "Captor"... (tipo que o app ainda não conhece: o próprio código). */
export function nomeDoFiltroDePontos(f: FiltroDePontos): string {
  return f === 'todos' ? 'Todos' : (NOME_DO_TIPO[f] ?? f)
}

/** As opções do filtro com quantos pontos cada uma tem (só as que têm algum): "todos" primeiro, depois os
 *  tipos na ordem de NOME_DO_TIPO; tipo novo do pacote, que o app não conhece, vem no fim. */
export function opcoesDoFiltroDePontos(pontos: Readonly<Record<string, PontoPacote>> | undefined): Array<{ filtro: FiltroDePontos; n: number }> {
  const n = new Map<TipoDePonto, number>()
  for (const p of Object.values(pontos ?? {})) n.set(p.tipo, (n.get(p.tipo) ?? 0) + 1)
  const tipos = (Object.keys(NOME_DO_TIPO) as TipoDePonto[]).filter((t) => n.has(t))
  for (const t of n.keys()) if (!tipos.includes(t)) tipos.push(t)
  return [{ filtro: 'todos', n: Object.keys(pontos ?? {}).length }, ...tipos.map((t) => ({ filtro: t, n: n.get(t)! }))]
}

/** Só os pontos do filtro (com "todos", os mesmos). */
export function pontosNoFiltro(pontos: Readonly<Record<string, PontoPacote>>, f: FiltroDePontos): Readonly<Record<string, PontoPacote>> {
  return f === 'todos' ? pontos : Object.fromEntries(Object.entries(pontos).filter(([, p]) => p.tipo === f))
}

/** "3 de 12 pontos OK · 1 errado" (o texto do menu), como o dos furos. */
export function textoDoAvancoDosPontos(a: { ok: number; errados: number; total: number }): string {
  const base = `${a.ok} de ${a.total} ${a.total === 1 ? 'ponto' : 'pontos'} OK`
  return a.errados ? `${base} · ${a.errados} ${a.errados === 1 ? 'errado' : 'errados'}` : base
}

/**
 * Planta com muitos pontos (23/11/2026, pacotes reais com centenas de pontos por disciplina):
 * de longe as bolinhas viram manchas e o toque pega o ponto errado. Acima deste número de pontos (os do
 * filtro), longe aparece um número por quadrado, como nos furos (furos_laje.ts), e os pontos só de perto.
 */
export const PONTOS_PARA_JUNTAR = 60

/** Distância de tela (px) entre dois pontos vizinhos para cada um ter o próprio toque. */
const PX_ENTRE_PONTOS = 24

/**
 * Zoom a partir do qual os pontos aparecem: o que põe 24 px entre um ponto e o vizinho mais perto, na
 * mediana das distâncias (nos pacotes reais de 23/11, de 10 a 30 pt da folha; os que ficam ainda mais
 * juntos se resolvem pelo "aproxime e toque de novo"). Em meios zooms, entre -2 e o zoom dos furos de laje.
 */
export function zoomDosPontos(pontos: Readonly<Record<string, PontoPacote>> | undefined): number {
  const pts = Object.values(pontos ?? {}).map((p) => p.ponto)
  if (pts.length < 2) return -2
  // vizinho mais próximo pela varredura em x (23/11: o elétrico de um andar real tem milhares de pontos, e comparar
  // todos com todos travava a tela por quase 1 s no PC)
  const xs = [...pts].sort((a, b) => a[0] - b[0])
  const ds: number[] = []
  for (let i = 0; i < xs.length; i++) {
    const [ax, ay] = xs[i]
    let m = Infinity
    for (let j = i + 1; j < xs.length && xs[j][0] - ax < m; j++) {
      const d = Math.hypot(xs[j][0] - ax, xs[j][1] - ay)
      if (d > 0 && d < m) m = d
    }
    for (let j = i - 1; j >= 0 && ax - xs[j][0] < m; j--) {
      const d = Math.hypot(xs[j][0] - ax, xs[j][1] - ay)
      if (d > 0 && d < m) m = d
    }
    if (m < Infinity) ds.push(m)
  }
  if (!ds.length) return ZOOM_DOS_FUROS_DE_LAJE
  ds.sort((x, y) => x - y)
  const d = ds[Math.floor(ds.length / 2)]
  const z = Math.ceil(Math.log2(PX_ENTRE_PONTOS / d) * 2) / 2
  return Math.min(Math.max(z, -2), ZOOM_DOS_FUROS_DE_LAJE)
}

/**
 * Os pontos agrupados por quadrado de 6 m vezes `multiplo` (o mesmo quadrado dos furos), para o número de
 * longe. Ordem: de cima para baixo, da esquerda para a direita.
 */
export function pontosPorQuadrado(pontos: Readonly<Record<string, PontoPacote>> | undefined, escala = 50, multiplo = 1): FurosDaArea[] {
  const lado = ladoDoQuadradoEmPontos(escala) * multiplo
  const grupos = new Map<string, { ordem: string; ids: string[]; pts: Array<[number, number]> }>()
  for (const [id, p] of Object.entries(pontos ?? {})) {
    const pt: [number, number] = [p.ponto[0], p.ponto[1]]
    const i = Math.floor(pt[0] / lado)
    const j = Math.floor(pt[1] / lado)
    const chave = `q:${i}:${j}`
    const g = grupos.get(chave) ?? { ordem: `${String(j).padStart(6, '0')} ${String(i).padStart(6, '0')}`, ids: [], pts: [] }
    g.ids.push(id)
    g.pts.push(pt)
    grupos.set(chave, g)
  }
  return [...grupos.entries()]
    .sort(([, a], [, b]) => a.ordem.localeCompare(b.ordem))
    .map(([chave, g]) => {
      const xs = g.pts.map((p) => p[0])
      const ys = g.pts.map((p) => p[1])
      const centro: [number, number] = [xs.reduce((s, v) => s + v, 0) / xs.length, ys.reduce((s, v) => s + v, 0) / ys.length]
      let perto = g.pts[0]
      for (const p of g.pts) if (Math.hypot(p[0] - centro[0], p[1] - centro[1]) < Math.hypot(perto[0] - centro[0], perto[1] - centro[1])) perto = p
      return { chave, ids: g.ids, centro, caixa: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as [number, number, number, number], perto }
    })
}

type Pt = readonly [number, number]

function distAoSegmento(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Distância do toque ao ponto, ou à linha quando ele é linha (eletroduto). */
export function distanciaAoPonto(p: Pt, q: PontoPacote): number {
  if (q.linha && q.linha.length >= 2) {
    let melhor = Infinity
    for (let i = 0; i + 1 < q.linha.length; i++) melhor = Math.min(melhor, distAoSegmento(p, q.linha[i], q.linha[i + 1]))
    return melhor
  }
  return Math.hypot(q.ponto[0] - p[0], q.ponto[1] - p[1])
}

/**
 * O ponto mais perto do toque, até `raio` (em pontos da folha). Dois pontos a menos de `folga` de
 * diferença: ambíguo (a pessoa aproxima a planta). O círculo ganha da linha: o eletroduto termina na caixa,
 * e o toque na caixa é da caixa; a linha só é escolhida quando não há círculo debaixo do dedo.
 *
 * `colado` (sessão 6, 25/11/2026): pontos a menos disso um do outro estão no mesmo lugar (extintor com a placa,
 * BEP sobre a descida) e nenhum zoom os separa. Quando a dúvida é só entre eles, `juntos` traz todos.
 */
export function pontoTocado(
  p: Pt,
  pontos: Readonly<Record<string, PontoPacote>>,
  raio: number,
  folga: number,
  colado?: number,
): { id: string } | { ambiguo: true; juntos?: string[] } | null {
  const ehLinha = (q: PontoPacote) => !!q.linha && q.linha.length >= 2
  return (
    maisPerto(p, Object.entries(pontos).filter(([, q]) => !ehLinha(q)), raio, folga, colado) ??
    maisPerto(p, Object.entries(pontos).filter(([, q]) => ehLinha(q)), raio, folga)
  )
}

function maisPerto(p: Pt, pontos: ReadonlyArray<[string, PontoPacote]>, raio: number, folga: number, colado?: number): { id: string } | { ambiguo: true; juntos?: string[] } | null {
  let a: [number, string] | null = null
  let b: [number, string] | null = null
  for (const [id, q] of pontos) {
    const d = distanciaAoPonto(p, q)
    if (d > raio) continue
    if (!a || d < a[0]) {
      b = a
      a = [d, id]
    } else if (!b || d < b[0]) b = [d, id]
  }
  if (!a) return null
  if (b && b[0] - a[0] < folga) {
    if (colado === undefined) return { ambiguo: true }
    // os que estão no mesmo lugar do mais perto; se o 2º mais perto é um deles, a dúvida é só entre eles
    const q0 = pontos.find(([id]) => id === a![1])![1].ponto
    const juntos = pontos.filter(([, q]) => Math.hypot(q.ponto[0] - q0[0], q.ponto[1] - q0[1]) <= colado).map(([id]) => id)
    return juntos.includes(b[1]) ? { ambiguo: true, juntos } : { ambiguo: true }
  }
  return { id: a[1] }
}

/** O item da ficha que os pontos da disciplina marcam (`"pontos": "<disciplina>"` no item), se houver. */
export function itemDosPontos(ficha: Ficha | undefined, disciplina: DisciplinaDePontos): ItemFicha | undefined {
  return ficha?.itens.find((i) => disciplinasDoItem(i).includes(disciplina))
}

/** O item marca este ponto: a disciplina está em "pontos" e o tipo em "pontos_tipos" (sem a lista, qualquer tipo). */
export function itemMarcaOPonto(i: ItemFicha, p: Pick<PontoPacote, 'disciplina' | 'tipo'>): boolean {
  return disciplinasDoItem(i).includes(p.disciplina) && (!i.pontos_tipos || i.pontos_tipos.includes(p.tipo))
}

/**
 * As fichas que podem gravar este ponto (5.1 a 5.3, 23/11/2026), uma entrada por ficha: em cada ficha de ambiente,
 * o primeiro item que marca o ponto (disciplina e tipo), menos as fichas que não valem no ambiente do ponto
 * (`semFichas`, a tabela ficha × cômodo). Nenhuma ficha de ambiente com item da disciplina: o item da instalação
 * na ficha de laje, como antes (21/11); no elétrico, também o tipo que nenhuma ficha de ambiente marca (25/11).
 * Duas ou mais: a pessoa escolhe (alvenaria ou drywall).
 */
export function fichasDoPonto(
  fichas: readonly Ficha[],
  p: Pick<PontoPacote, 'disciplina' | 'tipo'> & { ambiente?: string },
  fichasDeLaje: readonly Ficha[] = [],
  semFichas: readonly string[] = [],
  ambientesCalculados = false,
): Array<{ ficha: Ficha; item: number }> {
  // fora de cômodo (jardim, deck, laje em volta da piscina, vazio; e o SPDA de fachada): o item da instalação na
  // ficha de laje, em todas as disciplinas (decisão do Nicolas, 25/11/2026). Só na planta em que o pipeline
  // calculou o ambiente dos pontos: sem nenhum ponto com ambiente, nada mudou (pacote antigo)
  if (ambientesCalculados && !p.ambiente) {
    const fl = fichaDosPontos([], p.disciplina, fichasDeLaje, p.tipo)
    return fl ? [fl] : []
  }
  const daDisciplina = fichas.filter((f) => itemDosPontos(f, p.disciplina))
  if (!daDisciplina.length) {
    const fl = fichaDosPontos([], p.disciplina, fichasDeLaje, p.tipo)
    return fl ? [fl] : []
  }
  const r: Array<{ ficha: Ficha; item: number }> = []
  for (const f of daDisciplina) {
    if (semFichas.includes(f.codigo)) continue
    const it = f.itens.find((i) => itemMarcaOPonto(i, p))
    if (it) r.push({ ficha: f, item: it.n })
  }
  // elétrico que nenhuma ficha de ambiente marca (ponto de luz, caixa de passagem, quadro, eletroduto; e a caixa
  // de parede do cômodo que tira as fichas de elétrica): volta para o item da instalação na ficha de laje, como em
  // 21/11 (decisão do Nicolas, 25/11: "volta para a laje"; a caixa de parede sem ficha, decisão do Professor, 25/11)
  if (!r.length && LAJE_SEM_ITEM_DE_AMBIENTE.has(p.disciplina)) {
    const fl = fichaDosPontos([], p.disciplina, fichasDeLaje, p.tipo)
    return fl ? [fl] : []
  }
  return r
}

/** Disciplinas em que o tipo sem item de ficha de ambiente grava no item da ficha de laje (25/11/2026). */
const LAJE_SEM_ITEM_DE_AMBIENTE: ReadonlySet<DisciplinaDePontos> = new Set(['eletrico'])

/** A planta em que o pipeline calculou o ambiente dos pontos (algum ponto tem "ambiente"): ali, o ponto sem
 *  ambiente está fora de cômodo e vai para o item da laje (25/11/2026). */
export function ambientesCalculados(pontos: Readonly<Record<string, Pick<PontoPacote, 'ambiente'>>> | undefined): boolean {
  return !!pontos && Object.values(pontos).some((q) => !!q.ambiente)
}

type InstalacaoDaLaje = NonNullable<ItemFicha['instalacao']>
/** Tipos do preventivo que são rede de água (hidrante, sprinkler, tubulação): vão para o item de água da laje. */
const PREVENTIVO_DE_AGUA: ReadonlySet<string> = new Set(['hidrante', 'sprinkler', 'tubo_incendio', 'tubo', 'registro', 'coluna'])

/**
 * Os itens da ficha de laje (`"instalacao"`) que servem à disciplina, na ordem de preferência. A ficha de laje só
 * tem água, esgoto e elétrica. SPDA (captor, descida, conector) vai para a elétrica; preventivo: hidrante,
 * sprinkler e tubulação para a água, o resto (sinalização, emergência, detector, alarme, extintor) para a
 * elétrica. Decisão mais simples, anotada (26/11/2026): o Nicolas disse "item da laje" para todas as disciplinas,
 * e a ficha não tem item de PPCI nem de SPDA.
 */
function instalacoesDaLaje(d: DisciplinaDePontos, tipo?: string): readonly InstalacaoDaLaje[] {
  switch (d) {
    case 'hidro':
      return ['agua']
    case 'sanitario':
      return ['esgoto']
    case 'eletrico':
    case 'spda':
      return ['eletrica']
    case 'preventivo':
      return tipo === undefined ? ['agua', 'eletrica'] : PREVENTIVO_DE_AGUA.has(tipo) ? ['agua'] : ['eletrica']
  }
}

/**
 * A ficha e o item que os pontos da disciplina marcam: a primeira ficha de ambiente com `"pontos"`; sem ela, a
 * primeira ficha de laje com o item da instalação (`"instalacao": "agua"`, `"esgoto"` ou `"eletrica"`, os
 * mesmos itens dos furos de laje), porque ralo, caixa e ponto de água ficam na laje (21/11/2026).
 */
export function fichaDosPontos(
  fichas: readonly Ficha[],
  disciplina: DisciplinaDePontos,
  fichasDeLaje: readonly Ficha[] = [],
  tipo?: string,
): { ficha: Ficha; item: number } | undefined {
  for (const f of fichas) {
    const it = itemDosPontos(f, disciplina)
    if (it) return { ficha: f, item: it.n }
  }
  for (const inst of instalacoesDaLaje(disciplina, tipo))
    for (const f of fichasDeLaje) {
      const it = f.itens.find((i) => i.instalacao === inst)
      if (it) return { ficha: f, item: it.n }
    }
  return undefined
}

/**
 * A escolha entre duas fichas (alvenaria ou drywall) vale para o ambiente do ponto e para aquele par de fichas:
 * no mesmo ambiente o toque seguinte não pergunta de novo. Fica na memória enquanto o app está aberto.
 */
export function chaveDaEscolhaDoPonto(p: Pick<PontoPacote, 'ambiente'>, fichas: ReadonlyArray<{ ficha: Pick<Ficha, 'codigo'> }>): string {
  return `${p.ambiente ?? ''}|${fichas.map((f) => f.ficha.codigo).sort().join(',')}`
}
const escolhasDosPontos = new Map<string, string>()
export function lembrarEscolhaDoPonto(chave: string, codigo: string): void {
  escolhasDosPontos.set(chave, codigo)
}
export function escolhaLembradaDoPonto(chave: string): string | undefined {
  return escolhasDosPontos.get(chave)
}

/** Nome do ponto para a pessoa: "Ralo seco 100x100 (ralo)", ou só o tipo. */
export function nomeDoPonto(p: PontoPacote): string {
  const tipo = NOME_DO_TIPO[p.tipo] ?? p.tipo
  return p.nome && p.nome !== tipo ? `${p.nome} (${tipo.toLowerCase()})` : tipo
}

/** Quantos pontos de cada tipo (para o rodapé da aba): "3 ralos, 1 caixa sifonada". */
export function resumoDosPontos(pontos: Readonly<Record<string, PontoPacote>>): Array<[TipoDePonto, number]> {
  const n = new Map<TipoDePonto, number>()
  for (const p of Object.values(pontos)) n.set(p.tipo, (n.get(p.tipo) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

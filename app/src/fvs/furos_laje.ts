// Furos de laje (item 4 da frente FVS estrutura, decisões do Nicolas de 19/11/2026).
//
// O pipeline põe os furos de laje do modelo de furação no pacote como elemento "F" sem viga, com
// `furo.laje: true`. A área de laje é desenhada no app, depois do pacote, então a ligação furo → área
// é feita aqui, na leitura: o furo pertence à área vigente que o contém (a menor, se houver duas). Fora
// de qualquer área, o furo fica apagado e não marca nada. Nada disso vai ao banco: é calculado.
//
// A ficha da área diz qual item é de qual instalação (`"instalacao"` no item, dado da ficha):
// - esgoto (furos SAN) e água fria/quente (furos HID): automáticos, como o item de furação da viga
//   (todos OK: C; algum errado: NC com o furo na observação; algum sem conferir: pendente). Área sem
//   furo do tema: o item fica à mão.
// - elétrica (furos ELT/TEL): à mão, porque caixas e eletrodutos não estão no modelo. Furo elétrico
//   errado deixa o item NC sozinho; o C é sempre da pessoa (com aviso se há furo errado ou sem conferir).
//
// O registro do furo fica no próprio furo, no item do tema dele na ficha da área.

import type { AreaDeLaje } from './areas'
import { areaDoPonto } from './areas'
import type { ElementoPacote } from './pacote'
import { maisNovo, situacaoDoFuro, type EventoFvs, type Ficha, type ItemFicha, type Resultado, type Situacao } from './situacao'

export type Instalacao = 'esgoto' | 'agua' | 'eletrica'

export const NOME_DA_INSTALACAO: Record<Instalacao, string> = {
  esgoto: 'esgoto',
  agua: 'água fria/quente',
  eletrica: 'elétrica',
}

/** Começo da observação que o app grava quando são os furos que marcam o item (e não a pessoa). */
export const OBS_DOS_FUROS = 'Furo errado: '

/** Disciplina do furo (nome do pipeline ou sigla) → instalação. PCI, CLI e GERAL só aparecem na planta. */
export function instalacaoDaDisciplina(d: string): Instalacao | undefined {
  const t = d
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
  if (t.startsWith('SAN')) return 'esgoto'
  if (t.startsWith('HID')) return 'agua'
  if (t.startsWith('ELT') || t.startsWith('ELE') || t.startsWith('TEL')) return 'eletrica'
  return undefined
}

/** Furo de laje do pacote (sem viga, `furo.laje`). */
export function ehFuroDeLaje(e: ElementoPacote | undefined): boolean {
  return !!e && e.tipo === 'F' && !e.viga && e.furo?.laje === true
}

/** As instalações do furo, na ordem das disciplinas, sem repetir. */
export function instalacoesDoFuro(e: ElementoPacote): Instalacao[] {
  const saida: Instalacao[] = []
  for (const d of e.furo?.disciplinas ?? []) {
    const i = instalacaoDaDisciplina(d)
    if (i && !saida.includes(i)) saida.push(i)
  }
  return saida
}

/** Centro do furo na folha (o contorno é a bolinha que o pipeline desenha). */
export function centroDoFuro(e: ElementoPacote): [number, number] {
  const [x0, y0, x1, y1] = e.rotulo
  return [(x0 + x1) / 2, (y0 + y1) / 2]
}

/** A área de laje do furo: a vigente que contém o centro dele; com duas, a menor. Fora de todas: undefined. */
export function areaDoFuro(ponto: readonly [number, number], areas: readonly AreaDeLaje[]): AreaDeLaje | undefined {
  return areaDoPonto(ponto, areas)
}

/** Furos de laje do manifest, cada um com a área em que cai (undefined: fora de área de laje). */
export function furosDeLajeNasAreas(
  elementos: Record<string, ElementoPacote> | undefined,
  areas: readonly AreaDeLaje[],
): Map<string, AreaDeLaje | undefined> {
  const saida = new Map<string, AreaDeLaje | undefined>()
  const lista = Object.entries(elementos ?? {})
    .filter(([, e]) => ehFuroDeLaje(e))
    .sort(([, a], [, b]) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
  for (const [id, e] of lista) saida.set(id, areaDoFuro(centroDoFuro(e), areas))
  return saida
}

/** O item da ficha para a instalação (`"instalacao"` no item), se houver. */
export function itemDaInstalacao(ficha: Ficha | undefined, inst: Instalacao): ItemFicha | undefined {
  return ficha?.itens.find((i) => i.instalacao === inst)
}

/**
 * O item em que o registro do furo fica: o da primeira instalação do furo que a ficha da área tem.
 * Sem área, sem instalação ou ficha sem o item: undefined (o furo fica só para ver).
 */
export function itemDoFuroDeLaje(e: ElementoPacote, ficha: Ficha | undefined): { item: number; instalacao: Instalacao } | undefined {
  for (const inst of instalacoesDoFuro(e)) {
    const it = itemDaInstalacao(ficha, inst)
    if (it) return { item: it.n, instalacao: inst }
  }
  return undefined
}

/**
 * O resultado que os furos da área dão ao item da instalação. `atual` é o registro de agora do item
 * (para a elétrica, que só volta ao pendente se o NC foi dos furos). undefined: não mexe no item.
 *  - sem furo do tema: undefined (o item fica à mão);
 *  - esgoto e água: algum errado NC; todos OK C; senão pendente (null);
 *  - elétrica: algum errado NC; nenhum errado e o NC era dos furos: pendente; senão não mexe.
 */
export function resultadoDaInstalacao(
  inst: Instalacao,
  sits: readonly Situacao[],
  atual?: { resultado: string | null; observacao?: string | null } | null,
): Resultado | null | undefined {
  if (!sits.length) return undefined
  if (sits.includes('reprovado')) return 'NC'
  if (inst !== 'eletrica') return sits.every((s) => s === 'liberado') ? 'C' : null
  const ncDosFuros = atual?.resultado === 'NC' && (atual.observacao ?? '').startsWith(OBS_DOS_FUROS)
  return ncDosFuros ? null : undefined
}

/**
 * Situação do furo de laje fora da planta (busca da obra), sem a área: pelo registro mais novo dele
 * numa ficha de laje (é o item da instalação, na ficha da área). Sem registro: pendente.
 */
export function situacaoDoFuroDeLajeNaObra(eventos: readonly EventoFvs[], fichaPorId: (id: string) => Ficha | undefined): Situacao {
  let novo: EventoFvs | undefined
  for (const e of eventos) if (fichaPorId(e.ficha_id)?.aplica_a.includes('L') && (!novo || maisNovo(e, novo))) novo = e
  return novo ? situacaoDoFuro(novo.ficha_id, novo.item, eventos) : 'nada'
}

/** Observação do NC dado pelos furos: "Furo errado: FL3, FL7". */
export function observacaoDosFuros(errados: readonly string[]): string | null {
  return errados.length ? `${OBS_DOS_FUROS}${errados.join(', ')}` : null
}

/**
 * Aviso antes do C à mão no item da elétrica: "2 passagens elétricas ainda sem conferir. Marcar C mesmo
 * assim?". Tudo OK: null (marca sem perguntar).
 */
export function avisoDoCEletrico(sits: readonly Situacao[]): string | null {
  const errados = sits.filter((s) => s === 'reprovado').length
  const sem = sits.filter((s) => s !== 'liberado' && s !== 'reprovado').length
  const partes: string[] = []
  if (errados) partes.push(`${errados} ${errados === 1 ? 'passagem elétrica errada' : 'passagens elétricas erradas'}`)
  if (sem) partes.push(`${sem} ${sem === 1 ? 'passagem elétrica ainda sem conferir' : 'passagens elétricas ainda sem conferir'}`)
  return partes.length ? `${partes.join(' e ')}. Marcar C mesmo assim?`.replace(/^./, (c) => c.toUpperCase()) : null
}

// ---------------------------------------------------------------- densidade na planta (20/11/2026)
// No 2º pavimento da obra piloto são 954 furos de laje. Com a planta inteira na tela, o alvo de 44 px de
// cada furo cobre metros de obra e quase todo toque pegava o furo errado (medido: 88% ou mais; 2% no
// zoom 1,5; 0% do 2 para cima). Decisões do Nicolas (20/11, pelo Professor): longe, um número por área
// no lugar dos furos; toque que pega dois furos pergunta qual; o contador só com os conferíveis; os
// furos que não são de esgoto, água nem elétrica (Geral, Climatização, Incêndio) ficam escondidos.

/** Zoom a partir do qual os furos de laje aparecem e recebem toque (1 ponto da folha = 2^zoom px). */
export const ZOOM_DOS_FUROS_DE_LAJE = 1.5

/** Furo de laje que não é de esgoto, água nem elétrica: fica no pacote, mas não aparece na aba Furos. */
export function furoDeLajeEscondido(e: ElementoPacote | undefined): boolean {
  return ehFuroDeLaje(e) && instalacoesDoFuro(e!).length === 0
}

/**
 * Furo que entra no "x/y OK" da aba Furos: o de viga sempre; o de laje só dentro de área de laje e de
 * esgoto, água ou elétrica.
 */
export function furoConferivel(e: ElementoPacote, area: AreaDeLaje | undefined): boolean {
  if (!ehFuroDeLaje(e)) return true
  return !!area && instalacoesDoFuro(e).length > 0
}

/** Um número por área: quantos furos conferíveis ela tem e onde escrever (o centro deles, na folha). */
export interface FurosDaArea {
  areaId: string
  ids: string[]
  centro: [number, number]
  /** caixa dos furos na folha: [x0, y0, x1, y1] (o toque no número aproxima até ela). */
  caixa: [number, number, number, number]
  /** o furo mais perto do centro: o toque no número aproxima até ele (o centro pode cair num vão sem furo). */
  perto: [number, number]
}

/** Os furos de laje conferíveis agrupados pela área (na ordem do nome da área). */
export function furosConferiveisPorArea(
  elementos: Record<string, ElementoPacote> | undefined,
  furosNasAreas: ReadonlyMap<string, AreaDeLaje | undefined>,
): FurosDaArea[] {
  const porArea = new Map<string, { nome: string; ids: string[]; pts: Array<[number, number]> }>()
  for (const [id, area] of furosNasAreas) {
    const e = elementos?.[id]
    if (!e || !area || !furoConferivel(e, area)) continue
    const g = porArea.get(area.id) ?? { nome: area.nome, ids: [], pts: [] }
    g.ids.push(id)
    g.pts.push(centroDoFuro(e))
    porArea.set(area.id, g)
  }
  return [...porArea.entries()]
    .sort(([, a], [, b]) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
    .map(([areaId, g]) => {
      const xs = g.pts.map((p) => p[0])
      const ys = g.pts.map((p) => p[1])
      const centro: [number, number] = [xs.reduce((s, v) => s + v, 0) / xs.length, ys.reduce((s, v) => s + v, 0) / ys.length]
      let perto = g.pts[0]
      for (const p of g.pts) if (Math.hypot(p[0] - centro[0], p[1] - centro[1]) < Math.hypot(perto[0] - centro[0], perto[1] - centro[1])) perto = p
      return { areaId, ids: g.ids, centro, caixa: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], perto }
    })
}

/** Texto do número da área: "23 furos", "1 furo"; com marcação, "5 de 23 furos OK". */
export function textoDoNumeroDaArea(sits: readonly Situacao[]): string {
  const n = sits.length
  const ok = sits.filter((s) => s === 'liberado').length
  const furos = n === 1 ? 'furo' : 'furos'
  return ok ? `${ok} de ${n} ${furos} OK` : `${n} ${furos}`
}

/** Cor do número da área: algum errado, vermelho; todos OK, verde; algum OK, em andamento; senão, pendente. */
export function situacaoDoNumeroDaArea(sits: readonly Situacao[]): Situacao {
  if (sits.includes('reprovado')) return 'reprovado'
  if (sits.length && sits.every((s) => s === 'liberado')) return 'liberado'
  return sits.includes('liberado') ? 'andamento' : 'nada'
}

/**
 * Os furos cujo alvo contém o ponto do toque (tudo em px de tela), do mais perto ao mais longe. Dois ou
 * mais: a pessoa escolhe qual ("Qual furo?").
 */
export function furosNoToque(pontos: ReadonlyArray<{ id: string; x: number; y: number }>, x: number, y: number, raio: number): string[] {
  return pontos
    .map((p) => ({ id: p.id, d: Math.hypot(p.x - x, p.y - y) }))
    .filter((p) => p.d <= raio)
    .sort((a, b) => a.d - b.d)
    .map((p) => p.id)
}

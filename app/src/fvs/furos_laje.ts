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

/**
 * A camada do furo de laje (21/11/2026, plantas próprias por camada): a primeira instalação dele. É a
 * mesma regra do pipeline (pipeline/fvs/furos.py, camada_do_furo): o furo de esgoto e água fica no esgoto.
 */
export function camadaDoFuro(e: ElementoPacote): Instalacao | undefined {
  return instalacoesDoFuro(e)[0]
}

/**
 * Furo de laje que é de outra planta e fica escondido nesta: na forma com os furos de laje em plantas
 * próprias, todos; na planta de uma camada, os das outras camadas. O furo continua no pacote, para o
 * item da área ser calculado por todos os furos dela (como as barras nas plantas de armadura).
 */
export function furoDeOutraPlanta(e: ElementoPacote | undefined, m: { furos_laje?: Instalacao; furos_laje_separados?: boolean } | undefined): boolean {
  if (!ehFuroDeLaje(e) || !m) return false
  if (m.furos_laje_separados) return true
  return !!m.furos_laje && camadaDoFuro(e!) !== m.furos_laje
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
 * Furo que entra no "x/y OK" da aba Furos: o de viga sempre; o de laje se for de esgoto, água ou elétrica.
 * Desde 21/11/2026 (testador: "furos esgotos/água não funcionando", nenhum pavimento tinha área desenhada),
 * o de laje conta e se marca também fora de área: o registro fica no furo, na ficha de laje (ver
 * fichaDoFuroSemArea); quando a área for desenhada, o item dela conta os furos de dentro.
 */
export function furoConferivel(e: ElementoPacote, _area?: AreaDeLaje): boolean {
  if (!ehFuroDeLaje(e)) return true
  return instalacoesDoFuro(e).length > 0
}

/**
 * A ficha de laje em que fica o registro do furo de laje fora de área: a preferida (a do serviço escolhido,
 * se tiver o item da instalação do furo), senão a primeira ficha de laje que tem. Sem nenhuma: undefined.
 */
export function fichaDoFuroSemArea(e: ElementoPacote, fichasDeLaje: readonly Ficha[], preferida?: Ficha): { ficha: Ficha; item: number } | undefined {
  for (const f of preferida ? [preferida, ...fichasDeLaje] : fichasDeLaje) {
    const it = itemDoFuroDeLaje(e, f)
    if (it) return { ficha: f, item: it.item }
  }
  return undefined
}

/**
 * Situação do furo (de laje ou de viga) pelo registro mais novo dele, em qualquer ficha: o furo marcado
 * fora de área (numa ficha de laje) e depois contado na área (que pode ter outra ficha) não se perde.
 */
export function situacaoDoFuroPeloUltimo(eventos: readonly EventoFvs[]): Situacao {
  let novo: EventoFvs | undefined
  for (const e of eventos) if (!novo || maisNovo(e, novo)) novo = e
  return novo ? situacaoDoFuro(novo.ficha_id, novo.item, eventos) : 'nada'
}

/**
 * Furos de viga longe (20/11, decisão do Nicolas pelo Professor): o de dentro de uma área de laje entra no
 * número dela; o de fora de área, num número por quadrado de uns 6 m de obra (assim a planta fica limpa
 * mesmo antes de alguém desenhar as áreas). Um número por viga não: são dezenas de vigas com furo por
 * pavimento, e de longe os números se encavalariam como as bolinhas.
 */
export const LADO_DO_QUADRADO_M = 6

/** Lado do quadrado em pontos da folha (1 ponto = 25,4/72 mm no papel; escala 1:N). */
export function ladoDoQuadradoEmPontos(escala = 50): number {
  return (LADO_DO_QUADRADO_M * 1000) / (25.4 / 72) / escala
}

/**
 * Quadrado que cresce com a planta longe (20/11, medido no pacote do 2º): na abertura (zoom -4,5) 6 m são
 * 15 px e saíam 71 números encavalados. O lado é 6 m vezes 1, 2, 4, 8... (os quadrados maiores contêm
 * os menores, então o número só se junta, nunca pula de lugar), o menor que dê LADO_MINIMO_PX na tela.
 * De perto (zoom 0 ou mais na 1:50) fica o quadrado de 6 m.
 */
export const LADO_MINIMO_PX = 200
export function multiploDoQuadrado(zoom: number, escala = 50): number {
  const px = ladoDoQuadradoEmPontos(escala) * 2 ** zoom
  let m = 1
  while (px * m < LADO_MINIMO_PX && m < 1024) m *= 2
  return m
}

/**
 * Números de quadrado que ainda se tocariam na tela (furos na divisa de dois quadrados) viram um só.
 * largura e altura: o tamanho do número na tela, já em pontos da folha. Os números de área não se juntam;
 * o de quadrado que cair em cima de um deles desce até ficar livre.
 */
export function juntarNumerosPerto(grupos: readonly FurosDaArea[], largura: number, altura: number): FurosDaArea[] {
  const saida: FurosDaArea[] = []
  for (const g of grupos) {
    const alvo = g.chave.startsWith('q:')
      ? saida.find((o) => o.chave.startsWith('q:') && Math.abs(o.centro[0] - g.centro[0]) < largura && Math.abs(o.centro[1] - g.centro[1]) < altura)
      : undefined
    if (!alvo) {
      saida.push({ ...g, ids: [...g.ids] })
      continue
    }
    const n0 = alvo.ids.length
    const n1 = g.ids.length
    alvo.centro = [(alvo.centro[0] * n0 + g.centro[0] * n1) / (n0 + n1), (alvo.centro[1] * n0 + g.centro[1] * n1) / (n0 + n1)]
    alvo.caixa = [Math.min(alvo.caixa[0], g.caixa[0]), Math.min(alvo.caixa[1], g.caixa[1]), Math.max(alvo.caixa[2], g.caixa[2]), Math.max(alvo.caixa[3], g.caixa[3])]
    alvo.ids.push(...g.ids)
    alvo.chave = `${alvo.chave}+${g.chave}`
  }
  // número de quadrado embaixo de um número de área: desce (a área fica onde está; a conta não se mistura)
  const toca = (a: FurosDaArea, b: FurosDaArea) => Math.abs(a.centro[0] - b.centro[0]) < largura && Math.abs(a.centro[1] - b.centro[1]) < altura
  for (const q of saida) {
    if (!q.chave.startsWith('q:')) continue
    for (let i = 0; i < 6 && saida.some((o) => o !== q && !o.chave.startsWith('q:') && toca(o, q)); i++) q.centro = [q.centro[0], q.centro[1] + altura]
  }
  return saida
}

/** Um número por área (ou por quadrado): quantos furos conferíveis e onde escrever (o centro deles, na folha). */
export interface FurosDaArea {
  /** id da área de laje, ou "q:i:j" para o quadrado de furos de viga fora de área. */
  chave: string
  ids: string[]
  centro: [number, number]
  /** caixa dos furos na folha: [x0, y0, x1, y1] (o toque no número aproxima até ela). */
  caixa: [number, number, number, number]
  /** o furo mais perto do centro: o toque no número aproxima até ele (o centro pode cair num vão sem furo). */
  perto: [number, number]
}

/**
 * Os furos conferíveis agrupados para o número de longe: os de laje pela área (sempre têm uma); os de viga
 * pela área que os contém ou, fora de área, pelo quadrado de LADO_DO_QUADRADO_M. Áreas na ordem do nome,
 * depois os quadrados.
 */
export function furosConferiveisPorArea(
  elementos: Record<string, ElementoPacote> | undefined,
  furosNasAreas: ReadonlyMap<string, AreaDeLaje | undefined>,
  areas: readonly AreaDeLaje[] = [],
  escala = 50,
  multiplo = 1,
): FurosDaArea[] {
  const lado = ladoDoQuadradoEmPontos(escala) * multiplo
  const grupos = new Map<string, { ordem: string; ids: string[]; pts: Array<[number, number]> }>()
  const juntar = (chave: string, ordem: string, id: string, pt: [number, number]) => {
    const g = grupos.get(chave) ?? { ordem, ids: [], pts: [] }
    g.ids.push(id)
    g.pts.push(pt)
    grupos.set(chave, g)
  }
  const semArea: Array<[string, ElementoPacote]> = []
  for (const [id, area] of furosNasAreas) {
    const e = elementos?.[id]
    if (!e || !furoConferivel(e, area)) continue
    if (area) juntar(area.id, `a ${area.nome}`, id, centroDoFuro(e))
    else semArea.push([id, e]) // furo de laje fora de área (21/11): no quadrado, como o de viga
  }
  const vigas = Object.entries(elementos ?? {})
    .filter(([, e]) => e.tipo === 'F' && !ehFuroDeLaje(e))
    .sort(([, a], [, b]) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
  for (const [id, e] of [...vigas, ...semArea]) {
    const pt = centroDoFuro(e)
    const area = areaDoFuro(pt, areas)
    if (area) juntar(area.id, `a ${area.nome}`, id, pt)
    else {
      const i = Math.floor(pt[0] / lado)
      const j = Math.floor(pt[1] / lado)
      juntar(`q:${i}:${j}`, `q ${String(j).padStart(6, '0')} ${String(i).padStart(6, '0')}`, id, pt)
    }
  }
  return [...grupos.entries()]
    .sort(([, a], [, b]) => a.ordem.localeCompare(b.ordem, 'pt-BR', { numeric: true }))
    .map(([chave, g]) => {
      const xs = g.pts.map((p) => p[0])
      const ys = g.pts.map((p) => p[1])
      const centro: [number, number] = [xs.reduce((s, v) => s + v, 0) / xs.length, ys.reduce((s, v) => s + v, 0) / ys.length]
      let perto = g.pts[0]
      for (const p of g.pts) if (Math.hypot(p[0] - centro[0], p[1] - centro[1]) < Math.hypot(perto[0] - centro[0], perto[1] - centro[1])) perto = p
      return { chave, ids: g.ids, centro, caixa: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], perto }
    })
}

/** Texto do número da área: "23 furos", "1 furo"; com marcação, "5 de 23 furos OK" (ou "esquadrias"). */
export function textoDoNumeroDaArea(sits: readonly Situacao[], um = 'furo', varios = 'furos'): string {
  const n = sits.length
  const ok = sits.filter((s) => s === 'liberado').length
  const furos = n === 1 ? um : varios
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

/**
 * Avanço dos furos de uma planta, para o menu (21/11/2026, "furos de viga, esgoto e água em etapas similares
 * às barras de aço"): quantos furos conferíveis da planta estão OK e quantos errados, pelo registro mais novo
 * de cada um. Fica fora o furo de outra planta (o de laje na forma, quando há plantas de furação) e o só detalhe.
 */
export function avancoDosFuros(
  manifest: { elementos: Record<string, ElementoPacote>; furos_laje?: Instalacao; furos_laje_separados?: boolean },
  eventosDe: (id: string) => readonly EventoFvs[],
): { ok: number; errados: number; total: number } {
  let ok = 0
  let errados = 0
  let total = 0
  for (const [id, e] of Object.entries(manifest.elementos)) {
    if (e.tipo !== 'F' || e.so_detalhe || furoDeOutraPlanta(e, manifest) || !furoConferivel(e)) continue
    total++
    const s = situacaoDoFuroPeloUltimo(eventosDe(id))
    if (s === 'liberado') ok++
    else if (s === 'reprovado') errados++
  }
  return { ok, errados, total }
}

/** "1 de 3 furos OK · 1 errado" (o texto do menu). */
export function textoDoAvancoDosFuros(a: { ok: number; errados: number; total: number }): string {
  const base = `${a.ok} de ${a.total} ${a.total === 1 ? 'furo' : 'furos'} OK`
  return a.errados ? `${base} · ${a.errados} ${a.errados === 1 ? 'errado' : 'errados'}` : base
}

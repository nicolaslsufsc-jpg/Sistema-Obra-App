// Ligação entre itens das fichas (regras da obra, regras.ts). Parte pura, sem banco e sem tela
// (ligacoes.test.ts). Decisões do Nicolas (18 e 19/11/2026):
// - quem liga o quê é escolhido à mão, nas regras da obra (nada fixo no código);
// - o item `de`, ao ficar C, marca C no item `para` da MESMA peça;
// - entre peças (20/11/2026, "Aceito as duas"): a regra com `entre: 'area'` liga um item da ficha da
//   área de laje a um item da ficha de cada pilar ou viga DENTRO dela. Só no sentido área → peças. A
//   peça é da área quando o centro dela cai dentro do contorno; com duas áreas, vale a menor (a mesma
//   conta dos furos de laje). É calculado no aparelho: nada vai ao banco além dos registros;
// - a marcação mostra a origem (na observação) e pode ser desfeita;
// - item que já tem resultado (marcado à mão, C, NC ou NA) não é mexido; NC na origem não passa adiante.

import { areaDoPonto, type AreaDeLaje } from './areas'
import type { ElementoPacote } from './pacote'
import { chaveDoItem, type Ligacao, type RegrasFvs } from './regras'
import { ultimosPorItem, type EventoFvs, type Ficha } from './situacao'

/** Até quantos passos uma corrente de ligações (A → B → C …) segue. */
export const NIVEIS_DA_LIGACAO = 5

export interface AlvoDaLigacao {
  ligacao: Ligacao
  ficha: Ficha
  item: number
  /** de onde veio (o item que ficou C e puxou este) */
  origem: { ficha: Ficha; item: number }
}

/**
 * Os itens que o C em `origem` marca, na ordem em que devem ser gravados. `fichasDaPeca`: as fichas que
 * a peça usa (a do código pela revisão da peça); `eventos`: os registros da peça (na ficha aberta em uso).
 */
export function alvosDaLigacao(
  regras: RegrasFvs,
  origem: { ficha: Ficha; item: number },
  fichasDaPeca: readonly Ficha[],
  eventos: readonly EventoFvs[],
  niveis = NIVEIS_DA_LIGACAO,
): AlvoDaLigacao[] {
  if (!regras.ligacoes.length) return []
  const porCodigo = new Map(fichasDaPeca.map((f) => [f.codigo, f]))
  const vistos = new Set([chaveDoItem(origem.ficha.codigo, origem.item)])
  const alvos: AlvoDaLigacao[] = []
  let fila = [origem]
  for (let nivel = 0; nivel < niveis && fila.length; nivel++) {
    const proxima: typeof fila = []
    for (const o of fila) {
      for (const l of regras.ligacoes) {
        // a regra entre peças não vale dentro da peça (alvosEntrePecas)
        if (l.entre || l.de.ficha !== o.ficha.codigo || l.de.item !== o.item) continue
        const chave = chaveDoItem(l.para.ficha, l.para.item)
        if (vistos.has(chave)) continue
        vistos.add(chave)
        const ficha = porCodigo.get(l.para.ficha)
        if (!ficha || !ficha.itens.some((i) => i.n === l.para.item)) continue
        const atual = ultimosPorItem(eventos.filter((e) => e.ficha_id === ficha.id)).get(l.para.item)
        if (atual?.resultado) continue
        alvos.push({ ligacao: l, ficha, item: l.para.item, origem: o })
        proxima.push({ ficha, item: l.para.item })
      }
    }
    fila = proxima
  }
  return alvos
}

/** A observação do registro marcado pela ligação: diz de onde veio (o código da ficha só quando é outra). */
export function observacaoDaLigacao(a: AlvoDaLigacao): string {
  const it = a.origem.ficha.itens.find((i) => i.n === a.origem.item)
  const ficha = a.origem.ficha.codigo === a.ficha.codigo ? '' : `${a.origem.ficha.codigo} `
  return `Pela ligação: ${ficha}item ${a.origem.item}${it ? ` (${it.titulo})` : ''}`
}

/** Registro marcado pela ligação (lido da observação). */
export const ehDaLigacao = (e: Pick<EventoFvs, 'observacao'> | undefined) => !!e?.observacao?.startsWith('Pela ligação: ')

/** "+2 pela ligação" no aviso de um lote. */
export function maisLigados(ligados: readonly Readonly<Record<string, unknown>>[]): string {
  return ligados.length ? ` · +${ligados.length} pela ligação` : ''
}

/** O aviso depois de um C que marcou outros itens pela ligação. */
export function textoDosLigados(nome: string, ficha: Pick<Ficha, 'itens'>, ligados: readonly Readonly<Record<string, unknown>>[]): string {
  const titulos = ligados.map((l) => ficha.itens.find((i) => i.n === Number(l.item))?.titulo ?? `item ${String(l.item)}`)
  return `${nome}: também C pela ligação: ${titulos.join(', ')}`
}

// ------------------------------------------------------------------ entre peças (área de laje → pilares e vigas)

/** Tipos de peça que a área de laje alcança pela ligação. */
const TIPOS_LIGADOS_A_AREA = new Set(['P', 'V'])

/** O centro da peça na planta: o meio da caixa do desenho dela; sem desenho, o meio do nome. */
export function centroDaPeca(e: Pick<ElementoPacote, 'polys' | 'rotulo'>): [number, number] {
  const pts = e.polys.flat()
  if (!pts.length) return [(e.rotulo[0] + e.rotulo[2]) / 2, (e.rotulo[1] + e.rotulo[3]) / 2]
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}

/**
 * Os pilares e as vigas de cada área de laje (id da área → ids das peças, na ordem do nome): a peça é
 * da área que contém o centro dela (a menor, se houver duas). Peça fora de qualquer área não entra, e
 * o arranque que está na planta só para ver o detalhe (`so_detalhe`) também não.
 */
export function pecasNasAreas(elementos: Record<string, ElementoPacote> | undefined, areas: readonly AreaDeLaje[]): Map<string, string[]> {
  const saida = new Map<string, string[]>()
  if (!areas.length) return saida
  const lista = Object.entries(elementos ?? {})
    .filter(([, e]) => TIPOS_LIGADOS_A_AREA.has(e.tipo) && !e.so_detalhe)
    .sort(([, a], [, b]) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
  for (const [id, e] of lista) {
    const area = areaDoPonto(centroDaPeca(e), areas)
    if (area) saida.set(area.id, [...(saida.get(area.id) ?? []), id])
  }
  return saida
}

/** A obra tem alguma ligação entre peças? (sem nenhuma, a planta nem faz a conta das peças por área) */
export const temLigacaoEntrePecas = (regras: Pick<RegrasFvs, 'ligacoes'>) => regras.ligacoes.some((l) => l.entre === 'area')

/** Uma peça de dentro da área, com o que a ligação precisa para decidir: as fichas dela e os registros. */
export interface PecaDaArea {
  id: string
  nome: string
  /** as fichas que a peça usa (já sem os itens que não se marcam à mão: furação com furos, rastreio do concreto) */
  fichas: readonly Ficha[]
  /** os registros da peça (na ficha aberta em uso) */
  eventos: readonly EventoFvs[]
}

export interface AlvoEntrePecas extends AlvoDaLigacao {
  peca: PecaDaArea
  /** true: veio direto do item da área; false: veio em corrente, de outro item da própria peça */
  daArea: boolean
}

/**
 * Os itens que o C em `origem` (um item da ficha da área de laje) marca nas peças de dentro dela, na
 * ordem em que devem ser gravados. Em cada peça, o item ligado ainda vazio fica C e segue a corrente
 * das ligações da própria peça (o passo da área conta como o primeiro dos 5). Item que já tem
 * resultado não é mexido.
 */
export function alvosEntrePecas(regras: RegrasFvs, origem: { ficha: Ficha; item: number }, pecas: readonly PecaDaArea[]): AlvoEntrePecas[] {
  const daOrigem = regras.ligacoes.filter((l) => l.entre === 'area' && l.de.ficha === origem.ficha.codigo && l.de.item === origem.item)
  if (!daOrigem.length) return []
  const alvos: AlvoEntrePecas[] = []
  for (const peca of pecas) {
    const vistos = new Set<string>()
    for (const l of daOrigem) {
      const chave = chaveDoItem(l.para.ficha, l.para.item)
      if (vistos.has(chave)) continue
      const ficha = peca.fichas.find((f) => f.codigo === l.para.ficha)
      if (!ficha || !ficha.itens.some((i) => i.n === l.para.item)) continue
      if (ultimosPorItem(peca.eventos.filter((e) => e.ficha_id === ficha.id)).get(l.para.item)?.resultado) continue
      vistos.add(chave)
      alvos.push({ ligacao: l, ficha, item: l.para.item, origem, peca, daArea: true })
      for (const a of alvosDaLigacao(regras, { ficha, item: l.para.item }, peca.fichas, peca.eventos, NIVEIS_DA_LIGACAO - 1)) {
        const c = chaveDoItem(a.ficha.codigo, a.item)
        if (vistos.has(c)) continue
        vistos.add(c)
        alvos.push({ ...a, peca, daArea: false })
      }
    }
  }
  return alvos
}

/**
 * A observação do registro marcado entre peças: o item que veio da área diz o nome dela ("Pela
 * ligação: Laje 3 · item 25 (Concretagem)"); o que veio em corrente, na própria peça, diz o item de origem.
 */
export function observacaoEntrePecas(nomeDaArea: string, a: AlvoEntrePecas): string {
  if (!a.daArea) return observacaoDaLigacao(a)
  const it = a.origem.ficha.itens.find((i) => i.n === a.origem.item)
  return `Pela ligação: ${nomeDaArea} · item ${a.origem.item}${it ? ` (${it.titulo})` : ''}`
}

/** O local do registro: a peça, a área de laje ou a barra de laje. */
const localDe = (l: Readonly<Record<string, unknown>>) => String(l.elemento_id ?? l.area_id ?? l.barra_id ?? '')

/**
 * O aviso depois de um C que marcou outros itens pela ligação, na própria peça e nas peças de dentro
 * da área: "Laje 3: também C pela ligação: Reescoramento · C pela ligação em 3 peças: V1, V2 e V3".
 */
export function textoDasLigacoes(
  nome: string,
  ficha: Pick<Ficha, 'itens'>,
  localId: string,
  ligados: readonly Readonly<Record<string, unknown>>[],
  nomeDaPeca: (id: string) => string | undefined,
): string {
  const daqui = ligados.filter((l) => localDe(l) === localId)
  const pecas = [...new Set(ligados.filter((l) => localDe(l) !== localId).map(localDe))]
  const partes: string[] = []
  if (daqui.length) partes.push(textoDosLigados(nome, ficha, daqui).slice(nome.length + 2))
  if (pecas.length) {
    const nomes = pecas.map((id) => nomeDaPeca(id) ?? '?')
    const mostra = nomes.slice(0, 4)
    const resto = nomes.length - mostra.length
    const lista = resto > 0 ? `${mostra.join(', ')} e mais ${resto}` : mostra.length > 1 ? `${mostra.slice(0, -1).join(', ')} e ${mostra.at(-1)}` : mostra[0]
    partes.push(`C pela ligação em ${pecas.length} ${pecas.length === 1 ? 'peça' : 'peças'}: ${lista}`)
  }
  return `${nome}: ${partes.join(' · ')}`
}

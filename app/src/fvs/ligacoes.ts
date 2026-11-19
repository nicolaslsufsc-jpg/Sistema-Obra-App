// Ligação entre itens das fichas (regras da obra, regras.ts). Parte pura, sem banco e sem tela
// (ligacoes.test.ts). Decisões do Nicolas (18 e 19/11/2026):
// - quem liga o quê é escolhido à mão, nas regras da obra (nada fixo no código);
// - o item `de`, ao ficar C, marca C no item `para` da MESMA peça; entre peças diferentes, depois;
// - a marcação mostra a origem (na observação) e pode ser desfeita;
// - item que já tem resultado (marcado à mão, C, NC ou NA) não é mexido; NC na origem não passa adiante.

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
): AlvoDaLigacao[] {
  if (!regras.ligacoes.length) return []
  const porCodigo = new Map(fichasDaPeca.map((f) => [f.codigo, f]))
  const vistos = new Set([chaveDoItem(origem.ficha.codigo, origem.item)])
  const alvos: AlvoDaLigacao[] = []
  let fila = [origem]
  for (let nivel = 0; nivel < NIVEIS_DA_LIGACAO && fila.length; nivel++) {
    const proxima: typeof fila = []
    for (const o of fila) {
      for (const l of regras.ligacoes) {
        if (l.de.ficha !== o.ficha.codigo || l.de.item !== o.item) continue
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

/** A observação do registro marcado pela ligação: diz de onde veio. */
export function observacaoDaLigacao(a: AlvoDaLigacao): string {
  const it = a.origem.ficha.itens.find((i) => i.n === a.origem.item)
  return `Pela ligação: ${a.origem.ficha.codigo} item ${a.origem.item}${it ? ` (${it.titulo})` : ''}`
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

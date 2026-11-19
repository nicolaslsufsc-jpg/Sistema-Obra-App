// Item do rastreio do concreto na FVS (marcado com `rastreio_concreto: true` na ficha, dado da obra).
// Decisões do Nicolas (18 e 19/11/2026): o item fica C quando a peça tem caminhão lançado no Concreto;
// é só calculado, nada é gravado na FVS; sem caminhão o item fica como está (nunca NC). Os caminhões vêm
// de `concreto/rastreio.ts` (frente do Concreto); o texto é da FVS. Parte pura (rastreio.test.ts).
//
// O resultado entra na tela como um registro calculado, igual a um registro importado do sistema
// oficial (`origem_id`): conta na situação da peça e no histórico, mas não vai para a lista do que
// lançar e não pode ser desfeito. Uma marcação feita à mão depois dele vale por cima, como sempre.

import { situacaoDoRastreio, type CaminhaoDaPeca } from '../concreto/rastreio'
import { ultimosPorItem, type EventoFvs, type Ficha } from './situacao'

/** origem_id dos registros calculados pelo Concreto. */
export const ORIGEM_CONCRETO = 'concreto'

export const ehDoConcreto = (e: Pick<EventoFvs, 'origem_id'>) => e.origem_id === ORIGEM_CONCRETO

/** O item da ficha que o Concreto marca, se a ficha tiver. */
export function itemDoRastreio(ficha: Pick<Ficha, 'itens'> | undefined): number | null {
  return ficha?.itens.find((i) => i.rastreio_concreto === true)?.n ?? null
}

/** "2026-11-19" → meia-noite local desse dia, em ISO. */
function inicioDoDiaIso(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toISOString() : data
}

/** "2026-11-19" → "19/11" (a data do Concreto é só o dia: lida como texto, sem fuso). */
const dataCurta = (d: string) => (/^\d{4}-(\d{2})-(\d{2})/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : d)

/** "caminhão 3 · NF 1234 · 19/11" de um caminhão. */
function umCaminhao(c: CaminhaoDaPeca): string {
  return `caminhão ${c.sequencia} · ${c.nota_fiscal ? `NF ${c.nota_fiscal}` : 'NF não informada'} · ${dataCurta(c.data)}`
}

/**
 * O texto do item: "Pelo Concreto: caminhão 3 · NF 1234 · 19/11" (um caminhão), vários separados por
 * "; ", e "(parte da peça)" quando a soma dos caminhões não fecha a peça.
 */
export function textoDoRastreio(caminhoes: readonly CaminhaoDaPeca[]): string {
  const s = situacaoDoRastreio(caminhoes)
  return `Pelo Concreto: ${caminhoes.map(umCaminhao).join('; ')}${s.parcial ? ' (parte da peça)' : ''}`
}

/**
 * O registro calculado do item do rastreio de uma peça, ou null (ficha sem o item, peça sem caminhão).
 * A data é a do caminhão mais novo (a concretagem); a rodada é a do último registro do item.
 */
export function registroDoRastreio(
  pecaId: string,
  ficha: Ficha | undefined,
  caminhoes: readonly CaminhaoDaPeca[] | undefined,
  eventos: readonly EventoFvs[],
): EventoFvs | null {
  const item = itemDoRastreio(ficha)
  if (!ficha || item === null || !caminhoes?.length) return null
  if (situacaoDoRastreio(caminhoes).resultado !== 'C') return null
  const ultimo = ultimosPorItem(eventos.filter((e) => e.ficha_id === ficha.id)).get(item)
  return {
    id: `concreto:${pecaId}:${item}`,
    elemento_id: pecaId,
    ficha_id: ficha.id,
    item,
    resultado: 'C',
    rodada: ultimo?.rodada ?? 1,
    observacao: textoDoRastreio(caminhoes),
    lote_id: null,
    planta_id: null,
    usuario_id: '',
    criado_em_dispositivo: inicioDoDiaIso(caminhoes[caminhoes.length - 1].data),
    ficha_campo_id: null,
    verificado_por: 'Concreto',
    origem_id: ORIGEM_CONCRETO,
  }
}

/** As datas das concretagens da peça (para o início do prazo), tiradas do registro calculado. */
export function datasDoConcreto(eventos: readonly EventoFvs[]): string[] {
  return eventos.filter(ehDoConcreto).map((e) => e.criado_em_dispositivo)
}

// Texto da tela só de leitura das regras da obra (TelaRegras). Parte pura (regras.test.ts).
// Decisão do Nicolas (19/11/2026): as regras vêm do config_fvs.json da obra, e a tela só mostra.

import type { RefItem, RegrasFvs } from './regras'
import { compararRevisao, type Ficha } from './situacao'

export interface ItemDaRegra {
  /** "TESTE-PVS-P item 7" */
  ref: string
  /** título do item na ficha vigente, ou null quando a ficha ou o item não estão na obra */
  titulo: string | null
}

export interface LinhaDePrazo {
  id: string
  item: ItemDaRegra
  texto: string | null
  /** "3 dias depois da concretagem da peça" / "14 dias depois do C no item 5 (título)" */
  regra: string
}

export interface LinhaDeLigacao {
  id: string
  de: ItemDaRegra
  para: ItemDaRegra
}

export interface RegrasNaTela {
  prazos: LinhaDePrazo[]
  ligacoes: LinhaDeLigacao[]
  /** citações de itens que não existem nas fichas da obra */
  semFicha: number
  /** entradas do arquivo com formato errado, deixadas de fora */
  fora: number
}

/** A ficha vigente (maior revisão) de cada código. */
function vigentesPorCodigo(fichas: readonly Ficha[]): Map<string, Ficha> {
  const m = new Map<string, Ficha>()
  for (const f of fichas) {
    const a = m.get(f.codigo)
    if (!a || compararRevisao(f.revisao, a.revisao) > 0) m.set(f.codigo, f)
  }
  return m
}

export function regrasNaTela(regras: RegrasFvs, fichas: readonly Ficha[]): RegrasNaTela {
  const porCodigo = vigentesPorCodigo(fichas)
  let semFicha = 0
  const item = (r: RefItem): ItemDaRegra => {
    const titulo = porCodigo.get(r.ficha)?.itens.find((i) => i.n === r.item)?.titulo ?? null
    if (titulo === null) semFicha++
    return { ref: `${r.ficha} item ${r.item}`, titulo }
  }
  const dias = (n: number) => (n === 1 ? '1 dia' : `${n} dias`)
  const prazos = regras.prazos.map((p) => {
    const alvo = item(p)
    let depois: string
    if (p.depois_de.tipo === 'concretagem') depois = 'da concretagem da peça'
    else {
      const ref = item(p.depois_de)
      const mesma = p.depois_de.ficha === p.ficha
      depois = `do C no ${mesma ? `item ${p.depois_de.item}` : ref.ref}${ref.titulo ? ` (${ref.titulo})` : ''}`
    }
    return { id: p.id, item: alvo, texto: p.texto ?? null, regra: `${dias(p.dias)} depois ${depois}` }
  })
  const ligacoes = regras.ligacoes.map((l) => ({ id: l.id, de: item(l.de), para: item(l.para) }))
  return { prazos, ligacoes, semFicha, fora: regras.fora ?? 0 }
}

/** "2 prazos · 1 ligação" para o botão do início. */
export function resumoDasRegras(r: Pick<RegrasFvs, 'prazos' | 'ligacoes'>): string {
  const n = (k: number, um: string, varios: string) => `${k} ${k === 1 ? um : varios}`
  return `${n(r.prazos.length, 'prazo', 'prazos')} · ${n(r.ligacoes.length, 'ligação', 'ligações')}`
}

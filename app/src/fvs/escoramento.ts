// Lista de escoramento por pavimento (item 3.6 da lista de conferências, pedido do Professor em 21/11):
// "escoramento: aguardando (faltam N dias) / pode retirar desde dd/mm". Só aviso, sem bloquear (decisão
// de 18/11). Vale para todos os prazos das regras da obra (desforma do pilar, retirada dos fundos da viga,
// retirada do escoramento da laje...): cada peça ou área de laje com o item do prazo ainda sem marcar e
// com o início já marcado (a concretagem ou o item de referência). Parte pura, sem tela (escoramento.test.ts).

import type { DadosFvs } from './dados'
import { fichaDoLocalNaObra } from './dados'
import { estadoDoPrazo, inicioDoPrazo } from './prazos'
import { datasDoConcreto } from './rastreio'
import type { Prazo } from './regras'
import { fichaDaPeca, ultimosPorItem } from './situacao'

export interface LinhaDoEscoramento {
  pecaId: string
  nome: string
  tipo: string
  /** pode retirar (o prazo passou) ou aguardando */
  pode: boolean
  /** meia-noite do dia em que libera */
  liberaEm: Date
  /** dias que faltam (0 quando já pode) */
  faltam: number
}

export interface GrupoDoEscoramento {
  prazo: Prazo
  titulo: string
  /** quem pode primeiro (o que liberou há mais tempo), depois quem falta menos */
  linhas: LinhaDoEscoramento[]
  /** peças com o item do prazo vazio que ainda não têm início (sem concretagem marcada) */
  semInicio: number
}

export interface PavimentoDoEscoramento {
  pavimentoId: string
  nome: string
  grupos: GrupoDoEscoramento[]
}

type Dados = Pick<DadosFvs, 'pavimentos' | 'pecaPorId' | 'eventosDe' | 'fichaPorId' | 'fichas' | 'areaPorId' | 'regras'>

const ordemNatural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

/** A lista inteira, por pavimento (na ordem da obra) e por prazo (na ordem das regras). Vazia sem prazos. */
export function listaDoEscoramento(d: Dados, agora = new Date()): PavimentoDoEscoramento[] {
  const prazos = d.regras.prazos
  if (!prazos.length) return []
  const porPavimento = new Map<string, Map<string, GrupoDoEscoramento>>()
  for (const p of d.pecaPorId.values()) {
    const eventos = d.eventosDe.get(p.id) ?? []
    const ficha = fichaDaPeca(fichaDoLocalNaObra(d, p), eventos, (id) => d.fichaPorId.get(id))
    if (!ficha) continue
    const doPrazo = prazos.filter((pr) => pr.ficha === ficha.codigo)
    if (!doPrazo.length) continue
    const ultimos = ultimosPorItem(eventos.filter((e) => e.ficha_id === ficha.id))
    const cx = { eventos, ficha, fichaPorId: (id: string) => d.fichaPorId.get(id), datasDoConcreto: datasDoConcreto(eventos) }
    for (const prazo of doPrazo) {
      // o item já marcado (C, NC ou NA) sai da lista: a retirada foi feita ou conferida
      if (ultimos.get(prazo.item)?.resultado) continue
      let grupos = porPavimento.get(p.pavimento_id)
      if (!grupos) porPavimento.set(p.pavimento_id, (grupos = new Map()))
      let g = grupos.get(prazo.id)
      if (!g) {
        const item = ficha.itens.find((i) => i.n === prazo.item)
        grupos.set(prazo.id, (g = { prazo, titulo: prazo.texto || item?.titulo || `Item ${prazo.item}`, linhas: [], semInicio: 0 }))
      }
      const s = estadoDoPrazo(prazo, inicioDoPrazo(prazo, cx), agora)
      if (s.estado === 'sem_inicio') {
        g.semInicio++
        continue
      }
      g.linhas.push({ pecaId: p.id, nome: p.nome, tipo: p.tipo, pode: s.estado === 'cumprido', liberaEm: s.liberaEm, faltam: s.estado === 'aguardando' ? s.faltam : 0 })
    }
  }
  const ordemDoPrazo = new Map(prazos.map((p, i) => [p.id, i]))
  return d.pavimentos
    .filter((pv) => porPavimento.has(pv.id))
    .map((pv) => ({
      pavimentoId: pv.id,
      nome: pv.nome,
      grupos: [...porPavimento.get(pv.id)!.values()]
        .filter((g) => g.linhas.length || g.semInicio)
        .sort((a, b) => ordemDoPrazo.get(a.prazo.id)! - ordemDoPrazo.get(b.prazo.id)!)
        .map((g) => ({
          ...g,
          linhas: g.linhas.sort((a, b) => a.liberaEm.getTime() - b.liberaEm.getTime() || ordemNatural.compare(a.nome, b.nome)),
        })),
    }))
    .filter((pv) => pv.grupos.length)
}

const ddmm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

/** "pode retirar desde 22/11" ou "aguardando (faltam 3 dias, libera em 25/11)". */
export function textoDaLinha(l: LinhaDoEscoramento): string {
  if (l.pode) return `pode retirar desde ${ddmm(l.liberaEm)}`
  return `aguardando (${l.faltam === 1 ? 'falta 1 dia' : `faltam ${l.faltam} dias`}, libera em ${ddmm(l.liberaEm)})`
}

/** Quantas peças já podem e quantas aguardam, na obra inteira (para o botão do início). */
export function contagemDoEscoramento(lista: readonly PavimentoDoEscoramento[]): { podem: number; aguardam: number } {
  let podem = 0
  let aguardam = 0
  for (const pv of lista)
    for (const g of pv.grupos)
      for (const l of g.linhas) {
        if (l.pode) podem++
        else aguardam++
      }
  return { podem, aguardam }
}

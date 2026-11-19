// O que foi marcado no app e ainda não está no sistema oficial: a lista para lançar lá sem redigitar de
// cabeça. Parte pura, sem banco e sem tela (testada em lancamento.test.ts). O app não escreve no
// sistema oficial: quem lança é a pessoa. Registro importado de lá (origem_id) não entra.
//
// Por item, os passos que precisam ser lançados, na ordem:
// - cada rodada vira um passo, com o último resultado dela (trocar C por NA na mesma rodada é um passo só);
// - R e depois A na rodada seguinte são dois passos: o R e a reinspeção;
// - desmarcar no app apaga o passo daquela rodada; se o item já tinha marcação vinda do sistema oficial,
//   fica um passo "desmarcar", porque lá o item continua marcado.

import { nomeDaPeca } from './comodos'
import { dataBr, horaBr, montarPlanilha } from './planilha'
import { maisNovo, rotuloRodada, type EventoFvs, type Ficha, type FichaCampo, type Resultado } from './situacao'

export interface LinhaDeLancamento {
  chave: string
  /** o registro deste passo: é ele que fica marcado como já lançado */
  eventoId: string
  pavimentoId: string
  pavimentoNome: string
  pecaId: string
  pecaNome: string
  tipo: string
  fichaCodigo: string
  fichaTitulo: string
  /** a ficha no sistema oficial em que este item entra; vazio = lá ainda não há ficha para esta peça */
  fichaCampoCodigo: string | null
  item: number
  etapa: string
  itemTitulo: string
  /** vazio = desmarcado no app, mas marcado no sistema oficial */
  resultado: Resultado | null
  rodada: number
  quando: string
  quem: string
  observacao: string | null
}

export interface EntradaDeLancamento {
  pecas: Iterable<{ id: string; tipo: string; nome: string; pavimento_id: string }>
  pavimentos: ReadonlyArray<{ id: string; nome: string }>
  eventosDe: ReadonlyMap<string, readonly EventoFvs[]>
  fichaPorId: ReadonlyMap<string, Ficha>
  fichasCampoDe: ReadonlyMap<string, readonly FichaCampo[]>
  quem: (e: EventoFvs) => string
}

const ordemNatural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

/** Os passos de um item, a partir dos registros dele em ordem de data. */
export function passosDoItem(eventos: readonly EventoFvs[]): EventoFvs[] {
  const ordem = [...eventos].sort((a, b) => (maisNovo(a, b) ? 1 : -1))
  const passos: EventoFvs[] = []
  let veioDeLa = false
  for (const e of ordem) {
    if (e.origem_id) {
      veioDeLa = true
      continue
    }
    const anterior = passos[passos.length - 1]
    const mesmaRodada = anterior?.rodada === e.rodada
    if (e.resultado === null) {
      if (mesmaRodada && anterior.resultado !== null) passos.pop()
      if (veioDeLa && passos.length === 0) passos.push(e)
      continue
    }
    if (mesmaRodada) passos.pop()
    // o "O que fazer?" pode ter sido escrito num registro anterior da mesma rodada
    passos.push(e.observacao || !mesmaRodada || anterior.resultado !== e.resultado ? e : { ...e, observacao: anterior.observacao })
  }
  return passos
}

/**
 * Tudo o que falta lançar. lancados: registros que a pessoa já disse ter lançado. É por registro, e não
 * por data, porque um celular que ficou sem internet entrega depois marcações com data antiga, e elas
 * não podem sumir da lista. Se um passo mudar depois de lançado, o registro é outro e ele volta.
 */
export function listarParaLancar(d: EntradaDeLancamento, lancados?: ReadonlySet<string> | null): LinhaDeLancamento[] {
  const nomeDoPavimento = new Map(d.pavimentos.map((p) => [p.id, p.nome]))
  const ordemDoPavimento = new Map(d.pavimentos.map((p, i) => [p.id, i]))
  const saida: LinhaDeLancamento[] = []
  for (const peca of d.pecas) {
    const eventos = d.eventosDe.get(peca.id)
    if (!eventos?.some((e) => !e.origem_id)) continue
    const abertas = d.fichasCampoDe.get(peca.id) ?? []
    const porItem = new Map<string, EventoFvs[]>()
    for (const e of eventos) {
      const k = `${e.ficha_id}|${e.ficha_campo_id ?? ''}|${e.item}`
      const l = porItem.get(k)
      if (l) l.push(e)
      else porItem.set(k, [e])
    }
    for (const [k, lista] of porItem) {
      const ficha = d.fichaPorId.get(lista[0].ficha_id)
      if (!ficha) continue
      const item = ficha.itens.find((i) => i.n === lista[0].item)
      const aberta = abertas.find((a) => a.id === lista[0].ficha_campo_id)
      for (const e of passosDoItem(lista)) {
        if (lancados?.has(e.id)) continue
        saida.push({
          chave: `${peca.id}|${k}|${e.rodada}`,
          eventoId: e.id,
          pavimentoId: peca.pavimento_id,
          pavimentoNome: nomeDoPavimento.get(peca.pavimento_id) ?? '',
          pecaId: peca.id,
          pecaNome: nomeDaPeca(peca),
          tipo: peca.tipo,
          fichaCodigo: ficha.codigo,
          fichaTitulo: ficha.titulo,
          fichaCampoCodigo: aberta?.codigo ?? null,
          item: e.item,
          etapa: item?.etapa ?? '',
          itemTitulo: item?.titulo ?? `Item ${e.item}`,
          resultado: e.resultado,
          rodada: e.rodada,
          quando: e.criado_em_dispositivo,
          quem: d.quem(e),
          observacao: e.observacao,
        })
      }
    }
  }
  return saida.sort(
    (a, b) =>
      (ordemDoPavimento.get(a.pavimentoId) ?? 0) - (ordemDoPavimento.get(b.pavimentoId) ?? 0) ||
      ordemNatural.compare(a.pecaNome, b.pecaNome) ||
      a.tipo.localeCompare(b.tipo) ||
      ordemNatural.compare(a.fichaCodigo, b.fichaCodigo) ||
      (a.fichaCampoCodigo ?? '').localeCompare(b.fichaCampoCodigo ?? '') ||
      a.item - b.item ||
      a.rodada - b.rodada,
  )
}

export interface GrupoDeLancamento {
  chave: string
  pecaNome: string
  tipo: string
  pavimentoNome: string
  fichaCodigo: string
  fichaTitulo: string
  fichaCampoCodigo: string | null
  linhas: LinhaDeLancamento[]
}

/** Uma ficha de uma peça por grupo: é a tela que a pessoa abre no sistema oficial. */
export function agruparPorFicha(linhas: readonly LinhaDeLancamento[]): GrupoDeLancamento[] {
  const grupos = new Map<string, GrupoDeLancamento>()
  for (const l of linhas) {
    const k = `${l.pecaId}|${l.fichaCodigo}|${l.fichaCampoCodigo ?? ''}`
    const g = grupos.get(k)
    if (g) g.linhas.push(l)
    else
      grupos.set(k, {
        chave: k,
        pecaNome: l.pecaNome,
        tipo: l.tipo,
        pavimentoNome: l.pavimentoNome,
        fichaCodigo: l.fichaCodigo,
        fichaTitulo: l.fichaTitulo,
        fichaCampoCodigo: l.fichaCampoCodigo,
        linhas: [l],
      })
  }
  return [...grupos.values()]
}

/** Planilha para abrir no Excel. `sistema` = nome do sistema oficial em que a pessoa vai lançar. */
export function planilhaDeLancamento(linhas: readonly LinhaDeLancamento[], sistema: string): string {
  return montarPlanilha(
    ['Pavimento', 'Peça', 'Ficha', 'Título da ficha', `Ficha no ${sistema}`, 'Item', 'Etapa', 'Verificação', 'Resultado', 'Rodada', 'Data', 'Hora', 'Quem marcou', 'O que fazer'],
    linhas.map((l) => [
      l.pavimentoNome,
      l.pecaNome,
      l.fichaCodigo,
      l.fichaTitulo,
      l.fichaCampoCodigo ?? 'abrir ficha nova',
      l.item,
      l.etapa,
      l.itemTitulo,
      l.resultado ?? 'desmarcar',
      rotuloRodada(l.rodada),
      dataBr(l.quando),
      horaBr(l.quando),
      l.quem,
      l.observacao,
    ]),
  )
}

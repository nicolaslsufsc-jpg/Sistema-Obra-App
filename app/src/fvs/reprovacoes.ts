// Lista de reprovações da obra: cada item com NC, aberto ou já reinspecionado, e o caminho até a peça.
// Parte pura, sem banco e sem tela (testada em fvs.test.ts). Pedido: docs/03_BACKLOG.md, item 1.
//
// Regras:
// - Um item entra uma vez por ficha aberta, com o R mais recente dele.
// - Último registro R = aberto. Último registro A ou NA depois de um R = reinspecionado: sai dos
//   abertos e continua na lista de reinspecionados e no histórico da peça.
// - Último registro vazio = o R foi desmarcado por engano: não é reprovação.
// - NC aceito sob concessão (tratativa, 25/11) sai dos abertos sem reinspeção, com quem decidiu.

import { nomeDaPeca } from './comodos'
import { resumoDaTratativa, tratativaDaRodada, type Tratativa } from './tratativas'
import { daFichaAberta, eventosDaFichaAberta, juntarFichasDoModelo, juntarMarcadosNoApp, maisNovo, rotuloRodada, type EventoFvs, type Ficha, type FichaCampo } from './situacao'

export interface Reinspecao {
  resultado: 'C' | 'NA'
  rodada: number
  quando: string
  quem: string
}

export interface Reprovacao {
  /** única na lista: peça + ficha + ficha aberta + item */
  chave: string
  pecaId: string
  pecaNome: string
  tipo: string
  pavimentoId: string
  fichaId: string
  fichaCodigo: string
  fichaTitulo: string
  fichaCampoId: string | null
  fichaCampoCodigo: string | null
  /** quantas fichas abertas a peça tem (mais de uma = duplicada) */
  fichasNaPeca: number
  /** local completo no sistema oficial, quando a ficha veio de lá */
  local: string | null
  item: number
  itemTitulo: string
  etapa: string
  rodada: number
  observacao: string | null
  quem: string
  quando: string
  aberta: boolean
  reinspecao: Reinspecao | null
  /** arquivos das fotos dos registros R desta rodada */
  fotos: string[]
  /** planta que estava na tela quando o R foi marcado no app */
  plantaMarcada: string | null
  /** tratativa da rodada do NC (quem resolve, prazo, causa, concessão, eficácia); sem tratativa, null */
  tratativa: Tratativa | null
  /** NC aceito sob concessão (fechado sem reinspeção) */
  concessao: boolean
  /** registros NC da rodada (a tratativa aponta para um deles) */
  eventosNc: string[]
}

export interface PecaDaLista {
  id: string
  tipo: string
  nome: string
  pavimento_id: string
}

export interface EntradaDaLista {
  pecas: Iterable<PecaDaLista>
  eventosDe: ReadonlyMap<string, readonly EventoFvs[]>
  fichaPorId: ReadonlyMap<string, Ficha>
  fichasCampoDe: ReadonlyMap<string, readonly FichaCampo[]>
  fotosDe: ReadonlyMap<string, readonly string[]>
  /** tratativas por registro NC (sem a tabela no aparelho, nenhuma) */
  tratativasDe?: ReadonlyMap<string, readonly Tratativa[]>
  quem: (e: EventoFvs) => string
}

const maisAntigoPrimeiro = (a: EventoFvs, b: EventoFvs) => (maisNovo(a, b) ? 1 : -1)

/** Todas as reprovações, da mais recente para a mais antiga. */
export function listarReprovacoes(d: EntradaDaLista): Reprovacao[] {
  const saida: Reprovacao[] = []
  for (const peca of d.pecas) {
    const eventos = d.eventosDe.get(peca.id)
    if (!eventos?.some((e) => e.resultado === 'NC')) continue
    const abertas = d.fichasCampoDe.get(peca.id) ?? []
    // duas fichas do mesmo modelo na viga contam como uma, como o painel mostra (21/11)
    // e o marcado só no app entra na ficha aberta do mesmo modelo (ficha única, 23/11)
    const { fichas: daTela, juntou: comApp } = juntarMarcadosNoApp(juntarFichasDoModelo(abertas, (id) => d.fichaPorId.get(id), eventos), eventos)
    const juntou = daTela.some((fc) => fc.juntas)
    const porItem = new Map<string, EventoFvs[]>()
    const juntar = (evs: readonly EventoFvs[], fichaCampoId: string | null) => {
      for (const e of evs) {
        const k = `${e.ficha_id}|${fichaCampoId ?? ''}|${e.item}`
        const l = porItem.get(k)
        if (l) l.push(e)
        else porItem.set(k, [e])
      }
    }
    if (!juntou) for (const e of eventos) juntar([e], e.ficha_campo_id ?? null)
    else {
      if (!comApp) juntar(daFichaAberta(eventos, null), null)
      for (const fc of daTela) juntar(eventosDaFichaAberta(eventos, fc), fc.id)
    }
    for (const [k, lista] of porItem) {
      if (!lista.some((e) => e.resultado === 'NC')) continue
      lista.sort(maisAntigoPrimeiro)
      const ultimo = lista[lista.length - 1]
      if (ultimo.resultado === null) continue
      const ficha = d.fichaPorId.get(ultimo.ficha_id)
      if (!ficha) continue
      const rs = lista.filter((e) => e.resultado === 'NC')
      const r = rs[rs.length - 1]
      const daRodada = rs.filter((e) => e.rodada === r.rodada)
      // o texto pode estar num registro anterior da mesma rodada ("O que fazer?" é um registro novo)
      const comTexto = [...daRodada].reverse().find((e) => e.observacao)
      const item = ficha.itens.find((i) => i.n === ultimo.item)
      // o NC marcado só no app que entrou na ficha aberta abre nela (ficha única, 23/11)
      const doGrupo = k.split('|')[1] || null
      const aberta = abertas.find((a) => a.id === (ultimo.ficha_campo_id ?? doGrupo))
      const tratativa = tratativaDaRodada(d.tratativasDe, daRodada)
      const concessao = ultimo.resultado === 'NC' && !!tratativa?.concessao
      saida.push({
        chave: `${peca.id}|${k}`,
        pecaId: peca.id,
        pecaNome: nomeDaPeca(peca),
        tipo: peca.tipo,
        pavimentoId: peca.pavimento_id,
        fichaId: ficha.id,
        fichaCodigo: ficha.codigo,
        fichaTitulo: ficha.titulo,
        fichaCampoId: ultimo.ficha_campo_id ?? doGrupo ?? null,
        fichaCampoCodigo: aberta?.codigo ?? null,
        fichasNaPeca: abertas.length,
        local: aberta?.local ?? null,
        item: ultimo.item,
        itemTitulo: item?.titulo ?? `Item ${ultimo.item}`,
        etapa: item?.etapa ?? '',
        rodada: r.rodada,
        observacao: comTexto?.observacao ?? null,
        quem: d.quem(r),
        quando: r.criado_em_dispositivo,
        aberta: ultimo.resultado === 'NC' && !concessao,
        reinspecao:
          ultimo.resultado === 'NC'
            ? null
            : { resultado: ultimo.resultado, rodada: ultimo.rodada, quando: ultimo.criado_em_dispositivo, quem: d.quem(ultimo) },
        fotos: daRodada.flatMap((e) => d.fotosDe.get(e.id) ?? []),
        plantaMarcada: r.planta_id ?? null,
        tratativa,
        concessao,
        eventosNc: daRodada.map((e) => e.id),
      })
    }
  }
  return saida.sort((a, b) => (a.quando === b.quando ? a.chave.localeCompare(b.chave) : a.quando < b.quando ? 1 : -1))
}

/**
 * A lista em texto, para mandar à equipe (WhatsApp, e-mail). Só o que a pessoa está vendo, com os
 * filtros aplicados. onde: "3º Pavimento · Trecho 2".
 */
export function textoDaLista(lista: readonly Reprovacao[], titulo: string, onde: (r: Reprovacao) => string): string {
  const blocos = lista.map((r) => {
    const linhas = [`*${r.pecaNome}* · ${onde(r)}`, `${r.item}. ${r.itemTitulo}`]
    if (r.observacao) linhas.push(`O que fazer: ${r.observacao}`)
    const trat = resumoDaTratativa(r.tratativa, r.aberta)
    if (trat) linhas.push(trat)
    linhas.push(`${rotuloDaReprovacao(r)} · ${r.reinspecao ? r.reinspecao.quem : r.quem}`)
    return linhas.join('\n')
  })
  return [titulo, ...blocos].join('\n\n')
}

/** Filtros com que a lista abre vindo da planta (ex.: "15 com NC" do trecho). */
export function filtrosDoTrecho(pavimentoId: string, trecho: string): FiltrosDaLista {
  return { situacao: 'abertas', quem: '', pavimentoId, trecho }
}

/** Rótulo curto do resultado: "NC V01" ou, depois da reinspeção, "C V02". */
export function rotuloDaReprovacao(r: Reprovacao): string {
  if (r.concessao) return `NC ${rotuloRodada(r.rodada)} · concessão`
  return r.reinspecao ? `${r.reinspecao.resultado} ${rotuloRodada(r.reinspecao.rodada)}` : `NC ${rotuloRodada(r.rodada)}`
}

export type SituacaoDaLista = 'abertas' | 'reinspecionadas' | 'todas'

export interface FiltrosDaLista {
  situacao: SituacaoDaLista
  quem: string
  pavimentoId: string
  trecho: string
}

export const SEM_FILTRO: FiltrosDaLista = { situacao: 'abertas', quem: '', pavimentoId: '', trecho: '' }

export function filtrarReprovacoes(lista: readonly Reprovacao[], f: FiltrosDaLista, trechoDe: (r: Reprovacao) => string | null): Reprovacao[] {
  return lista.filter(
    (r) =>
      (f.situacao === 'todas' || r.aberta === (f.situacao === 'abertas')) &&
      (!f.quem || r.quem === f.quem || r.reinspecao?.quem === f.quem) &&
      (!f.pavimentoId || r.pavimentoId === f.pavimentoId) &&
      (!f.trecho || trechoDe(r) === f.trecho),
  )
}

/** "Mezanino \ Trecho 2 \ Pilares \ P100" -> "Trecho 2". */
export function trechoDoLocal(local: string | null): string | null {
  const m = /\bTrecho\s*(\d+)\b/i.exec(local ?? '')
  return m ? `Trecho ${m[1]}` : null
}

/** O que é preciso saber de uma linha de lista para achar a planta da peça. */
export interface LocalDaLista {
  pecaId: string
  tipo: string
  local: string | null
  plantaMarcada: string | null
}

export interface PlantaDaLista {
  id: string
  trecho: string
  disciplina: string
  tamanho?: number
}

/**
 * Em que planta a reprovação está. Pela ordem: a planta em que foi marcada, o trecho escrito no
 * local do sistema oficial e, por último, os pacotes que estão no aparelho.
 */
export function plantaPreferida(r: LocalDaLista, plantas: readonly PlantaDaLista[]): PlantaDaLista | undefined {
  const marcada = plantas.find((p) => p.id === r.plantaMarcada)
  if (marcada) return marcada
  const trecho = trechoDoLocal(r.local)?.toLowerCase()
  return trecho ? plantas.find((p) => p.trecho.trim().toLowerCase() === trecho) : undefined
}

export type DestinoDaPeca =
  | { tipo: 'abrir'; plantaId: string }
  /** a peça deve estar numa destas plantas, que ainda não estão no aparelho */
  | { tipo: 'baixar'; plantas: PlantaDaLista[] }
  /** todas as plantas do pavimento estão no aparelho e a peça não está em nenhuma */
  | { tipo: 'sem_planta' }

/**
 * Aonde o toque na linha leva. plantas: as vigentes do pavimento. pecasNoAparelho: peça -> plantas
 * do aparelho em que ela aparece. noAparelho: plantas que estão no aparelho.
 */
export function destinoDaPeca(
  r: LocalDaLista,
  plantas: readonly PlantaDaLista[],
  pecasNoAparelho: ReadonlyMap<string, readonly string[]>,
  noAparelho: ReadonlySet<string>,
): DestinoDaPeca {
  const candidatas = plantas.filter((p) => (p.disciplina === 'arquitetura') === (r.tipo === 'A'))
  const comAPeca = new Set(pecasNoAparelho.get(r.pecaId) ?? [])
  const preferida = plantaPreferida(r, candidatas)
  if (preferida && comAPeca.has(preferida.id)) return { tipo: 'abrir', plantaId: preferida.id }
  const achada = candidatas.find((p) => comAPeca.has(p.id))
  if (achada) return { tipo: 'abrir', plantaId: achada.id }
  if (preferida && !noAparelho.has(preferida.id)) return { tipo: 'baixar', plantas: [preferida] }
  const faltam = candidatas.filter((p) => !noAparelho.has(p.id))
  return faltam.length ? { tipo: 'baixar', plantas: faltam } : { tipo: 'sem_planta' }
}

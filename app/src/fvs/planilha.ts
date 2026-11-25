// Planilhas que o app entrega para abrir no Excel. Parte pura, sem banco e sem tela.
//
// Situação da obra: uma linha por peça e ficha, para o escritório filtrar. Quem fica pendente também
// aparece: a pergunta do dia é justamente o que falta.

import { concretadaDe } from './concretada'
import { nomeDaPeca } from './comodos'
import { textoDaMetragem } from './areas'
import { daFichaAberta, fichaDaPeca, fichaNaPeca, fichasPara, maisNovo, percentualConforme, ROTULO_SITUACAO as ROTULO, situacaoDaPeca, ultimosPorItem, type EventoFvs, type Ficha, type FichaCampo } from './situacao'

/** Texto que o Excel não executa: célula começando com = + - @ viraria fórmula ao abrir a planilha. */
export function celula(valor: string | number | null | undefined): string {
  const t = String(valor ?? '').replace(/\r?\n/g, ' ')
  const seguro = /^[=+\-@\t]/.test(t) ? `'${t}` : t
  return /[;"]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
}

export const dataBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')
export const horaBr = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** Ponto e vírgula, com marca de UTF-8 para os acentos saírem certos no Excel. */
export function montarPlanilha(cabecalho: readonly string[], linhas: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>): string {
  return '﻿' + [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n') + '\r\n'
}

const NOME_TIPO: Record<string, string> = { P: 'Pilar', V: 'Viga', L: 'Laje', A: 'Ambiente', F: 'Furo' }
const ordemNatural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

export interface EntradaDaSituacao {
  /** pilares, vigas e áreas de laje numa concretagem cadastrada (concretada.ts): verde só com ela */
  concretadas?: ReadonlySet<string>
  pecas: Iterable<{ id: string; tipo: string; nome: string; secao?: string | null; pavimento_id: string }>
  pavimentos: ReadonlyArray<{ id: string; nome: string }>
  fichas: readonly Ficha[]
  fichaPorId: ReadonlyMap<string, Ficha>
  fichasCampoDe: ReadonlyMap<string, readonly FichaCampo[]>
  eventosDe: ReadonlyMap<string, readonly EventoFvs[]>
  quem: (e: EventoFvs) => string
  /** área de laje desenhada no app: tem a ficha e o código dela, e a metragem no lugar da seção */
  areaDe?: (id: string) => { ficha_id: string; codigo_ficha: string | null; contorno: ReadonlyArray<readonly [number, number]>; planta_id?: string | null } | undefined
  /** escala (N de 1:N) da planta em que a área foi desenhada; sem ela, o m² sai em 1:50 */
  escalaDe?: (plantaId: string | null) => unknown
  /** consolo e capitel do pilar (pacote no aparelho): os itens deles contam na situação */
  partesDe?: (id: string) => readonly string[]
}

export interface LinhaDaSituacao {
  pavimento: string
  tipo: string
  peca: string
  secao: string
  ficha: string
  situacao: string
  a: number
  r: number
  na: number
  vazios: number
  conforme: number | null
  ultima: string | null
  quem: string
  fichaNoSistema: string
  status: string
  duplicada: boolean
}

/** Uma linha por peça e ficha aberta; peça sem ficha aberta entra uma vez, com a ficha padrão do tipo. */
export function linhasDaSituacao(d: EntradaDaSituacao): LinhaDaSituacao[] {
  const nomeDoPavimento = new Map(d.pavimentos.map((p) => [p.id, p.nome]))
  const ordemDoPavimento = new Map(d.pavimentos.map((p, i) => [p.id, i]))
  const pecas = [...d.pecas].sort(
    (a, b) =>
      (ordemDoPavimento.get(a.pavimento_id) ?? 0) - (ordemDoPavimento.get(b.pavimento_id) ?? 0) ||
      a.tipo.localeCompare(b.tipo) ||
      ordemNatural.compare(a.nome, b.nome),
  )
  const saida: LinhaDaSituacao[] = []
  for (const peca of pecas) {
    const eventos = d.eventosDe.get(peca.id) ?? []
    const abertas = d.fichasCampoDe.get(peca.id) ?? []
    const area = d.areaDe?.(peca.id)
    const base = {
      pavimento: nomeDoPavimento.get(peca.pavimento_id) ?? '',
      tipo: NOME_TIPO[peca.tipo] ?? peca.tipo,
      peca: nomeDaPeca(peca),
      secao: area ? textoDaMetragem(area.contorno as Array<[number, number]>, d.escalaDe?.(area.planta_id ?? null)) : (peca.secao ?? ''),
      duplicada: abertas.length > 1,
    }
    const partes = d.partesDe?.(peca.id)
    const linha = (fichaModelo: Ficha | undefined, evs: readonly EventoFvs[], aberta?: FichaCampo) => {
      const ficha = fichaNaPeca(fichaModelo, partes)
      const daFicha = ficha ? evs.filter((e) => e.ficha_id === ficha.id) : []
      const ult = ultimosPorItem(daFicha)
      const contar = (r: string) => [...ult.values()].filter((e) => e.resultado === r).length
      const ultima = daFicha.reduce<EventoFvs | undefined>((m, e) => (!m || maisNovo(e, m) ? e : m), undefined)
      saida.push({
        ...base,
        ficha: ficha ? ficha.codigo : (aberta?.ficha_codigo ?? ''),
        // ficha modelo que não está no app: vale o status do sistema oficial, na coluna ao lado
        situacao: ficha ? ROTULO[situacaoDaPeca(ficha, daFicha, undefined, concretadaDe(d.concretadas, peca.id, peca.tipo))] : aberta ? '' : ROTULO.nada,
        a: contar('C'),
        r: contar('NC'),
        na: contar('NA'),
        // item de consolo ou capitel só falta no pilar que tem a parte
        vazios: ficha ? ficha.itens.filter((it) => !ult.get(it.n)?.resultado && (!it.parte || !!ficha.partesDaPeca?.includes(it.parte))).length : 0,
        conforme: ficha ? percentualConforme(ficha, daFicha) : null,
        ultima: ultima?.criado_em_dispositivo ?? null,
        quem: ultima ? d.quem(ultima) : '',
        fichaNoSistema: aberta?.codigo ?? area?.codigo_ficha ?? '',
        status: aberta?.status ?? '',
      })
    }
    if (area) {
      linha(d.fichaPorId.get(area.ficha_id), eventos)
      continue
    }
    for (const aberta of abertas) linha(aberta.ficha_id ? d.fichaPorId.get(aberta.ficha_id) : undefined, daFichaAberta(eventos, aberta.id), aberta)
    const doApp = daFichaAberta(eventos, null)
    const fichaPorId = (id: string) => d.fichaPorId.get(id)
    if (peca.tipo === 'A') {
      // ambiente: cada serviço é uma ficha; só entra o que já começou, para não virar dez linhas por cômodo
      for (const vigente of fichasPara('A', d.fichas)) {
        const ficha = fichaDaPeca(vigente, doApp, fichaPorId)!
        if (doApp.some((e) => e.ficha_id === ficha.id)) linha(ficha, doApp)
      }
      if (!abertas.length && !doApp.length) linha(undefined, [])
    } else if (!abertas.length || doApp.length) {
      linha(fichaDaPeca(fichasPara(peca.tipo, d.fichas)[0], doApp, fichaPorId), doApp)
    }
  }
  return saida
}

/**
 * Tira as colunas do sistema oficial quando a obra não tem um (docs/modulos/integracoes.md).
 * `colunas` são as posições delas no cabeçalho.
 */
function semSistema<T>(cab: string[], linhas: T[][], sistema: string | null, colunas: readonly number[]): [string[], T[][]] {
  if (sistema) return [cab, linhas]
  const fica = (_: unknown, i: number) => !colunas.includes(i)
  return [cab.filter(fica), linhas.map((l) => l.filter(fica))]
}

/** Planilha da situação da obra. `sistema` = nome do sistema oficial da obra; null tira as colunas dele. */
export function planilhaDaSituacao(linhas: readonly LinhaDaSituacao[], sistema: string | null = null): string {
  return montarPlanilha(
    ...semSistema(
    ['Pavimento', 'Tipo', 'Peça', 'Seção', 'Ficha', 'Situação', 'C', 'NC', 'NA', 'Itens vazios', '% conforme', 'Última marcação', 'Hora', 'Quem marcou', `Ficha no ${sistema}`, `Status no ${sistema}`, 'Ficha duplicada'],
    linhas.map((l) => [
      l.pavimento,
      l.tipo,
      l.peca,
      l.secao,
      l.ficha,
      l.situacao,
      l.a,
      l.r,
      l.na,
      l.vazios,
      l.conforme,
      l.ultima ? dataBr(l.ultima) : '',
      l.ultima ? horaBr(l.ultima) : '',
      l.quem,
      l.fichaNoSistema,
      l.status,
      l.duplicada ? 'sim' : '',
    ]),
    sistema,
    [14, 15, 16],
    ),
  )
}

/** A lista de reprovações, com os filtros aplicados. */
export function planilhaDeReprovacoes(
  lista: ReadonlyArray<{
    pecaNome: string
    tipo: string
    fichaCodigo: string
    item: number
    etapa: string
    itemTitulo: string
    rodada: number
    observacao: string | null
    quem: string
    quando: string
    aberta: boolean
    fichaCampoCodigo: string | null
    reinspecao: { resultado: string; quando: string; quem: string } | null
  }>,
  pavimentoDe: (i: number) => string,
  trechoDe: (i: number) => string,
  sistema: string | null = null,
): string {
  return montarPlanilha(
    ...semSistema(
    ['Pavimento', 'Trecho', 'Tipo', 'Peça', 'Ficha', `Ficha no ${sistema}`, 'Item', 'Etapa', 'Verificação', 'O que fazer', 'Rodada', 'Data do NC', 'Hora', 'Quem marcou', 'Situação', 'Reinspeção', 'Data', 'Quem reinspecionou'],
    lista.map((r, i) => [
      pavimentoDe(i),
      trechoDe(i),
      NOME_TIPO[r.tipo] ?? r.tipo,
      r.pecaNome,
      r.fichaCodigo,
      r.fichaCampoCodigo,
      r.item,
      r.etapa,
      r.itemTitulo,
      r.observacao,
      `V${String(r.rodada).padStart(2, '0')}`,
      dataBr(r.quando),
      horaBr(r.quando),
      r.quem,
      r.aberta ? 'Aberta' : 'Reinspecionada',
      r.reinspecao?.resultado,
      r.reinspecao ? dataBr(r.reinspecao.quando) : '',
      r.reinspecao?.quem,
    ]),
    sistema,
    [5],
    ),
  )
}

/** Entrega um texto como arquivo baixado pelo navegador. */
export function baixarTexto(nome: string, conteudo: string, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

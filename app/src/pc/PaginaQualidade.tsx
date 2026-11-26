// Indicadores da qualidade (versão PC, ideia 6, 25/11/2026): % conforme por ficha e por pavimento, NC abertas e
// há quantos dias, tempo entre começar e liberar, concretagens com e sem laudo e andamento por apartamento. Só
// leitura, só com o que a FVS e o Concreto já têm neste aparelho (sem tabela nova). As contas ficam em
// qualidade.ts. Poucos números no topo, tabelas com barra ordenada, sem pizza.
import { useMemo, useState } from 'preact/hooks'
import type { ObraLocal, UsuarioLocal } from '../nucleo/conta'
import { BotaoExportarPdf } from '../telas/ExportarPdf'
import type { FolhaPdf } from '../telas/folha_pdf'
import { EtiquetaStatus, LinhaResumo, Tabela, type ColunaTabela, type Status } from '../telas/Tabela'
import { reprovacoesDaObra } from '../fvs/dados'
import { concretadaDe } from '../fvs/concretada'
import { ehDoConcreto } from '../fvs/rastreio'
import { grupoDoAmbiente } from '../fvs/acabamentos'
import { grupoDoAmbienteGuardado } from '../fvs/pacote'
import { situacaoDaPeca, type Ficha, type Situacao } from '../fvs/situacao'
import type { Reprovacao } from '../fvs/reprovacoes'
import { dataLocal } from '../concreto/cps'
import {
  andamentoDosApartamentos,
  conformidadePor,
  faixasDasNcs,
  inspecoesDaPeca,
  laudosDasConcretagens,
  liberacaoDaFicha,
  mediana,
  ncsAbertas,
  NOME_DO_LAUDO,
  porcento,
  porSemana,
  totalDaConformidade,
  type Inspecao,
  type LaudoDaConcretagem,
  type LinhaDeConformidade,
  type LinhaDoApartamento,
  type NcAberta,
  type SituacaoDoLaudo,
} from './qualidade'
import { dataBR, type DadosPc } from './dados_pc'
import { noPeriodo, textoDoPeriodo } from './versao_pc'

const pct = (n: number | null) => (n === null ? '–' : `${n}%`)
const dias1 = (n: number | null) => (n === null ? '–' : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }))
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
const mpa = (n: number | null) => (n === null ? '–' : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))

function Indicador({ titulo, valor, sub, alerta, testid }: { titulo: string; valor: string; sub: string; alerta?: boolean; testid: string }) {
  return (
    <div class={`pc-indicador${alerta ? ' pc-alerta' : ''}`} data-testid={testid}>
      <dt>{titulo}</dt>
      <dd>{valor}</dd>
      <p>{sub}</p>
    </div>
  )
}

/** Barra fina (o número fica sempre escrito ao lado). */
function Barra({ valor, max = 100, texto }: { valor: number | null; max?: number; texto: string }) {
  const p = valor === null || max <= 0 ? 0 : Math.round((valor / max) * 100)
  return (
    <span class="pc-mini">
      <span class="pc-mini-trilho" aria-hidden="true">
        <span class="pc-mini-cheio" style={{ width: `${p}%` }} />
      </span>
      <span class="pc-mini-num">{texto}</span>
    </span>
  )
}

const STATUS_DO_LAUDO: Record<SituacaoDoLaudo, Status> = {
  abaixo_fck: 'nc',
  atrasado: 'nc',
  com_laudo: 'liberado',
  aguardando: 'pendente',
  no_prazo: 'sem-dado',
  sem_caminhao: 'sem-dado',
}
const ORDEM_DO_LAUDO: readonly SituacaoDoLaudo[] = ['com_laudo', 'abaixo_fck', 'atrasado', 'aguardando', 'no_prazo', 'sem_caminhao']

interface Filtro {
  pavimento: string
  de: string
  ate: string
}

/** Tudo o que a página mostra, já cortado pelos filtros. */
function calcular(dados: DadosPc, filtro: Filtro, agora: Date) {
  const f = dados.fvs!
  const ordemDoPav = new Map(f.pavimentos.map((p, i) => [p.id, p.ordem ?? i]))
  const nomeDoPav = new Map(f.pavimentos.map((p) => [p.id, p.nome]))
  const pavId = filtro.pavimento ? f.pavimentos.find((p) => p.nome === filtro.pavimento)?.id : undefined
  const noPav = (id: string) => !filtro.pavimento || id === pavId
  const fichaPorId = (id: string): Ficha | undefined => f.fichaPorId.get(id)

  // inspeções, liberações e situação por cômodo, peça por peça (peças da planta e lajes desenhadas)
  const inspecoes: Inspecao[] = []
  const liberadas: Array<{ fichaCodigo: string; fichaTitulo: string; pavimentoId: string; dias: number; fim: string }> = []
  const fichasDoComodo = new Map<string, Array<{ situacao: Situacao }>>()
  const inspecoesDoComodo = new Map<string, Inspecao[]>()
  for (const p of f.pecaPorId.values()) {
    if (!noPav(p.pavimento_id)) continue
    const eventos = f.eventosDe.get(p.id) ?? []
    if (!eventos.length) continue
    const daPeca = inspecoesDaPeca({ id: p.id, pavimentoId: p.pavimento_id }, eventos, fichaPorId, ehDoConcreto)
    const comodo = p.tipo === 'A' && !f.areaPorId.has(p.id)
    if (comodo) inspecoesDoComodo.set(p.id, daPeca)
    inspecoes.push(...daPeca.filter((i) => noPeriodo(i.quando, filtro.de, filtro.ate)))
    const concretada = concretadaDe(f.concretadas, p.id, p.tipo)
    const situacoes: Array<{ situacao: Situacao }> = []
    for (const fichaId of new Set(eventos.filter((e) => !ehDoConcreto(e)).map((e) => e.ficha_id))) {
      const ficha = fichaPorId(fichaId)
      if (!ficha) continue
      const situacao = situacaoDaPeca(ficha, eventos, undefined, concretada)
      situacoes.push({ situacao })
      const lib = liberacaoDaFicha(ficha, eventos, situacao, ehDoConcreto)
      if (lib && noPeriodo(lib.fim, filtro.de, filtro.ate)) liberadas.push({ fichaCodigo: ficha.codigo, fichaTitulo: ficha.titulo, pavimentoId: p.pavimento_id, dias: lib.dias, fim: lib.fim })
    }
    if (comodo) fichasDoComodo.set(p.id, situacoes)
  }

  const total = totalDaConformidade(inspecoes)
  const porFicha = conformidadePor(inspecoes, (i) => i.fichaCodigo, (i) => `${i.fichaCodigo} · ${i.fichaTitulo}`)
  const porPavimento = conformidadePor(inspecoes, (i) => i.pavimentoId, (i) => nomeDoPav.get(i.pavimentoId) ?? '–', (a, b) => (ordemDoPav.get(a) ?? 0) - (ordemDoPav.get(b) ?? 0))

  // NC abertas: estado de hoje (o período não corta: uma NC aberta antes do período continua aberta)
  const abertas = ncsAbertas(
    reprovacoesDaObra(f).filter((r) => noPav(r.pavimentoId)),
    agora,
  )
  const faixas = faixasDasNcs(abertas.map((a) => a.dias))

  // tempo até liberar, por ficha
  const porCodigo = new Map<string, { nome: string; dias: number[] }>()
  for (const l of liberadas) {
    const g = porCodigo.get(l.fichaCodigo) ?? { nome: `${l.fichaCodigo} · ${l.fichaTitulo}`, dias: [] }
    g.dias.push(l.dias)
    porCodigo.set(l.fichaCodigo, g)
  }
  const tempos = [...porCodigo.entries()]
    .map(([codigo, g]) => ({ codigo, nome: g.nome, pecas: g.dias.length, mediana: mediana(g.dias), maximo: Math.max(...g.dias) }))
    .sort((a, b) => (b.mediana ?? 0) - (a.mediana ?? 0) || a.codigo.localeCompare(b.codigo))
  const semanas = porSemana(
    liberadas.map((l) => l.fim),
    agora,
  )

  // laudos (Concreto)
  const c = dados.concreto
  const laudos = c ? laudosDasConcretagens(c, dataLocal(agora)).filter((l) => noPav(l.concretagem.pavimento_id) && noPeriodo(l.concretagem.data, filtro.de, filtro.ate)) : []
  const nomeDoPavConcreto = new Map((c?.pavimentos ?? []).map((p) => [p.id, p.nome]))
  const contaLaudo = Object.fromEntries(ORDEM_DO_LAUDO.map((s) => [s, laudos.filter((l) => l.situacao === s).length])) as Record<SituacaoDoLaudo, number>
  const comCaminhao = laudos.length - contaLaudo.sem_caminhao

  // apartamentos (cômodos: tipo A da planta; o grupo vem do pacote da planta, ou do número antes do hífen)
  const comodos = [...f.pecaPorId.values()]
    .filter((p) => p.tipo === 'A' && !f.areaPorId.has(p.id) && noPav(p.pavimento_id))
    .map((p) => ({ id: p.id, pavimentoId: p.pavimento_id, apartamento: grupoDoAmbiente(p.nome, grupoDoAmbienteGuardado(p.id)) }))
  const apartamentos = andamentoDosApartamentos(
    comodos,
    (id) => fichasDoComodo.get(id) ?? [],
    (id) => (inspecoesDoComodo.get(id) ?? []).filter((i) => noPeriodo(i.quando, filtro.de, filtro.ate)),
    (id) => ordemDoPav.get(id) ?? 0,
  )

  return { total, porFicha, porPavimento, abertas, faixas, liberadas, tempos, semanas, laudos, contaLaudo, comCaminhao, nomeDoPav, nomeDoPavConcreto, apartamentos }
}

export function PaginaQualidade({ dados, obra, usuario }: { dados: DadosPc; obra: ObraLocal; usuario: UsuarioLocal }) {
  const [filtro, setFiltro] = useState<Filtro>({ pavimento: '', de: '', ate: '' })
  const f = dados.fvs
  const r = useMemo(() => (f ? calcular(dados, filtro, new Date()) : null), [dados, filtro, f])
  if (!f || !r) {
    return (
      <main class="tela pc-pagina" data-testid="pc-pagina-qualidade">
        <h1>Qualidade</h1>
        <p class="pc-msg pc-erro">Não deu para ler a FVS neste aparelho: {dados.erros.fvs ?? 'sem dados'}</p>
      </main>
    )
  }
  const periodo = textoDoPeriodo(filtro.de, filtro.ate)
  const periodoErrado = !!(filtro.de && filtro.ate && filtro.de > filtro.ate)
  const inspecoes = r.total.c + r.total.nc
  const maisAntiga = r.abertas[0]?.dias ?? null
  const medianaGeral = mediana(r.liberadas.map((l) => l.dias))
  const maxSemana = Math.max(1, ...r.semanas.map((s) => s.n))

  // ---- colunas
  const colunasConformidade = (primeira: string): ColunaTabela<LinhaDeConformidade>[] => [
    { titulo: primeira, valor: (l) => l.nome },
    { titulo: 'Itens inspecionados', valor: (l) => l.c + l.nc, numero: true },
    { titulo: 'NC', valor: (l) => (l.nc > 0 ? <EtiquetaStatus status="nc">{l.nc}</EtiquetaStatus> : 0), numero: true },
    { titulo: '% conforme', valor: (l) => <Barra valor={l.pct} texto={pct(l.pct)} /> },
  ]
  const colunasNc: ColunaTabela<NcAberta<Reprovacao>>[] = [
    { titulo: 'Dias aberta', valor: (a) => (a.dias > 30 ? <EtiquetaStatus status="nc">{a.dias}</EtiquetaStatus> : a.dias), numero: true },
    { titulo: 'Desde', valor: (a) => dataBR(a.r.quando), numero: true },
    { titulo: 'Pavimento', valor: (a) => r.nomeDoPav.get(a.r.pavimentoId) ?? null },
    { titulo: 'Peça', valor: (a) => a.r.pecaNome },
    { titulo: 'Ficha', valor: (a) => a.r.fichaCodigo },
    { titulo: 'Item', valor: (a) => `${a.r.item}. ${a.r.itemTitulo}` },
    { titulo: 'Rodada', valor: (a) => a.r.rodada, numero: true },
    { titulo: 'Quem', valor: (a) => a.r.quem || null },
  ]
  type Tempo = (typeof r.tempos)[number]
  const maxMediana = Math.max(0, ...r.tempos.map((t) => t.mediana ?? 0))
  const colunasTempo: ColunaTabela<Tempo>[] = [
    { titulo: 'Ficha', valor: (t) => t.nome },
    { titulo: 'Peças liberadas', valor: (t) => t.pecas, numero: true },
    { titulo: 'Mediana (dias)', valor: (t) => <Barra valor={t.mediana} max={maxMediana} texto={dias1(t.mediana)} /> },
    { titulo: 'Máximo (dias)', valor: (t) => dias1(t.maximo), numero: true },
  ]
  const colunasLaudo: ColunaTabela<LaudoDaConcretagem>[] = [
    { titulo: 'Data', valor: (l) => dataBR(l.concretagem.data), numero: true },
    { titulo: 'Pavimento', valor: (l) => r.nomeDoPavConcreto.get(l.concretagem.pavimento_id) ?? null },
    { titulo: 'Local', valor: (l) => l.concretagem.local_descricao || null },
    { titulo: 'fck (MPa)', valor: (l) => l.concretagem.fck_mpa, numero: true },
    { titulo: 'Caminhões', valor: (l) => l.caminhoes, numero: true },
    { titulo: 'Menor exemplar (MPa)', valor: (l) => (l.menorExemplar === null ? null : mpa(l.menorExemplar)), numero: true },
    { titulo: 'Laudo', valor: (l) => <EtiquetaStatus status={STATUS_DO_LAUDO[l.situacao]}>{NOME_DO_LAUDO[l.situacao]}</EtiquetaStatus> },
  ]
  const colunasApto: ColunaTabela<LinhaDoApartamento>[] = [
    { titulo: 'Pavimento', valor: (l) => r.nomeDoPav.get(l.pavimentoId) ?? null },
    { titulo: 'Apartamento', valor: (l) => l.apartamento },
    { titulo: 'Cômodos', valor: (l) => l.comodos, numero: true },
    { titulo: 'Fichas começadas', valor: (l) => l.fichas, numero: true },
    { titulo: 'Liberadas', valor: (l) => <Barra valor={l.liberadas} max={l.fichas} texto={`${l.liberadas} de ${l.fichas}`} /> },
    { titulo: 'Com NC', valor: (l) => (l.comNc > 0 ? <EtiquetaStatus status="nc">{l.comNc}</EtiquetaStatus> : 0), numero: true },
    { titulo: '% conforme', valor: (l) => pct(porcento(l.c, l.c + l.nc)), numero: true },
  ]

  const resumoDoTopo = [
    `${pct(r.total.pct)} dos itens conformes (${r.total.c} de ${inspecoes})`,
    `${plural(r.abertas.length, 'NC aberta', 'NC abertas')}${r.faixas.mais30 ? `, ${r.faixas.mais30} há mais de 30 dias` : ''}`,
    `mediana até liberar ${dias1(medianaGeral)} dias (${plural(r.liberadas.length, 'ficha liberada', 'fichas liberadas')})`,
    `${r.contaLaudo.com_laudo} de ${r.comCaminhao} concretagens com laudo`,
  ]
  const montar = (): FolhaPdf => ({
    modulo: 'Qualidade',
    // com período (o PDF do mês), o período vai no título: o Chrome usa o título no nome do arquivo
    titulo: filtro.de || filtro.ate ? `Indicadores da qualidade ${periodo}` : 'Indicadores da qualidade',
    sub: `${filtro.pavimento || 'Todos os pavimentos'}${filtro.de || filtro.ate ? '' : ` · ${periodo}`} · gerado em ${dataBR(new Date().toISOString())}`,
    resumo: resumoDoTopo,
    deitada: true,
    tabelas: [
      {
        titulo: 'Conformidade por ficha (pior primeiro)',
        colunas: ['Ficha', 'Itens inspecionados', 'NC', '% conforme'],
        curtas: [1, 2, 3],
        linhas: r.porFicha.map((l) => [l.nome, l.c + l.nc, l.nc, pct(l.pct)]),
        vazio: 'Nenhum item inspecionado com estes filtros.',
      },
      {
        titulo: 'Conformidade por pavimento',
        colunas: ['Pavimento', 'Itens inspecionados', 'NC', '% conforme'],
        curtas: [1, 2, 3],
        linhas: r.porPavimento.map((l) => [l.nome, l.c + l.nc, l.nc, pct(l.pct)]),
        vazio: 'Nenhum item inspecionado com estes filtros.',
      },
      {
        titulo: 'NC abertas (mais antiga primeiro)',
        colunas: ['Dias aberta', 'Desde', 'Pavimento', 'Peça', 'Ficha', 'Item', 'Rodada', 'Quem'],
        curtas: [0, 1, 6],
        linhas: r.abertas.map((a) => [a.dias, dataBR(a.r.quando), r.nomeDoPav.get(a.r.pavimentoId) ?? '–', a.r.pecaNome, a.r.fichaCodigo, `${a.r.item}. ${a.r.itemTitulo}`, a.r.rodada, a.r.quem || '–']),
        vazio: 'Nenhuma NC aberta.',
      },
      {
        titulo: 'Tempo entre começar e liberar a ficha',
        colunas: ['Ficha', 'Peças liberadas', 'Mediana (dias)', 'Máximo (dias)'],
        curtas: [1, 2, 3],
        linhas: r.tempos.map((t) => [t.nome, t.pecas, dias1(t.mediana), dias1(t.maximo)]),
        vazio: 'Nenhuma ficha liberada com estes filtros.',
      },
      {
        titulo: 'Concretagens e laudos',
        colunas: ['Data', 'Pavimento', 'Local', 'fck (MPa)', 'Caminhões', 'Menor exemplar (MPa)', 'Laudo'],
        curtas: [0, 3, 4, 5],
        linhas: r.laudos.map((l) => [dataBR(l.concretagem.data), r.nomeDoPavConcreto.get(l.concretagem.pavimento_id) ?? '–', l.concretagem.local_descricao || '–', l.concretagem.fck_mpa, l.caminhoes, mpa(l.menorExemplar), NOME_DO_LAUDO[l.situacao]]),
        vazio: 'Nenhuma concretagem com estes filtros.',
      },
      {
        titulo: 'Andamento por apartamento',
        colunas: ['Pavimento', 'Apartamento', 'Cômodos', 'Fichas começadas', 'Liberadas', 'Com NC', '% conforme'],
        curtas: [2, 3, 4, 5, 6],
        linhas: r.apartamentos.map((l) => [r.nomeDoPav.get(l.pavimentoId) ?? '–', l.apartamento, l.comodos, l.fichas, l.liberadas, l.comNc, pct(porcento(l.c, l.c + l.nc))]),
        vazio: 'Nenhum apartamento com ficha começada.',
      },
    ],
  })

  return (
    <main class="tela pc-pagina pc-avanco pc-qualidade" data-testid="pc-pagina-qualidade">
      <div class="pc-titulo">
        <h1>Qualidade</h1>
        <p>
          {filtro.pavimento || 'Obra inteira'} · {periodo}
        </p>
        <div class="pc-titulo-acoes">
          <BotaoExportarPdf obra={obra} usuario={usuario} montar={montar} rotulo="PDF dos indicadores" testid="pc-qualidade-pdf" />
        </div>
      </div>

      <div class="pc-filtros">
        <label>
          Pavimento
          <select value={filtro.pavimento} data-testid="pc-qualidade-pavimento" onChange={(e) => setFiltro({ ...filtro, pavimento: (e.target as HTMLSelectElement).value })}>
            <option value="">Todos</option>
            {f.pavimentos.map((p) => (
              <option key={p.id} value={p.nome}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          De
          <input type="date" value={filtro.de} data-testid="pc-qualidade-de" onInput={(e) => setFiltro({ ...filtro, de: (e.target as HTMLInputElement).value })} />
        </label>
        <label>
          Até
          <input type="date" value={filtro.ate} data-testid="pc-qualidade-ate" onInput={(e) => setFiltro({ ...filtro, ate: (e.target as HTMLInputElement).value })} />
        </label>
        {(filtro.pavimento || filtro.de || filtro.ate) && (
          <button type="button" class="pc-bt" onClick={() => setFiltro({ pavimento: '', de: '', ate: '' })}>
            Limpar filtros
          </button>
        )}
      </div>
      {periodoErrado && (
        <p class="pc-msg pc-erro" role="alert">
          A data "De" está depois da data "Até": nada vai aparecer.
        </p>
      )}

      <dl class="pc-indicadores" data-testid="pc-qualidade-indicadores">
        <Indicador testid="pc-qind-conforme" titulo="Itens conformes" valor={pct(r.total.pct)} sub={`${r.total.c} de ${inspecoes} itens inspecionados · ${plural(r.total.nc, 'NC', 'NC')}`} />
        <Indicador
          testid="pc-qind-nc"
          titulo="NC abertas"
          valor={String(r.abertas.length)}
          sub={r.abertas.length ? `${r.faixas.ate7} até 7 dias · ${r.faixas.ate30} de 8 a 30 · ${r.faixas.mais30} há mais de 30 · a mais antiga há ${maisAntiga} dias` : 'nenhuma NC aberta'}
          alerta={r.faixas.mais30 > 0}
        />
        <Indicador
          testid="pc-qind-tempo"
          titulo="Começar até liberar (dias)"
          valor={dias1(medianaGeral)}
          sub={r.liberadas.length ? `mediana de ${plural(r.liberadas.length, 'ficha liberada', 'fichas liberadas')} · máximo ${dias1(Math.max(...r.liberadas.map((l) => l.dias)))}` : 'nenhuma ficha liberada'}
        />
        <Indicador
          testid="pc-qind-laudos"
          titulo="Concretagens com laudo"
          valor={`${r.contaLaudo.com_laudo} de ${r.comCaminhao}`}
          sub={dados.concreto ? `${r.contaLaudo.abaixo_fck} abaixo do fck · ${r.contaLaudo.atrasado} com laudo atrasado · ${r.contaLaudo.aguardando + r.contaLaudo.no_prazo} ainda sem laudo` : 'o Concreto não abriu neste aparelho'}
          alerta={r.contaLaudo.abaixo_fck + r.contaLaudo.atrasado > 0}
        />
      </dl>

      <div class="pc-duas">
        <section class="pc-secao">
          <h2>Conformidade por ficha</h2>
          <LinhaResumo testid="pc-qualidade-ficha-resumo" partes={['pior primeiro', 'cada item inspecionado conta uma vez por rodada', 'NA fica fora']} />
          <Tabela rotulo="Conformidade por ficha" testid="pc-qualidade-por-ficha" colunas={colunasConformidade('Ficha')} linhas={r.porFicha} chave={(l) => l.chave} />
        </section>
        <section class="pc-secao">
          <h2>Conformidade por pavimento</h2>
          <LinhaResumo partes={[periodo]} />
          <Tabela rotulo="Conformidade por pavimento" testid="pc-qualidade-por-pavimento" colunas={colunasConformidade('Pavimento')} linhas={r.porPavimento} chave={(l) => l.chave} />
        </section>
      </div>

      <section class="pc-secao">
        <h2>NC abertas</h2>
        <LinhaResumo testid="pc-qualidade-nc-resumo" partes={[plural(r.abertas.length, 'aberta', 'abertas'), `${r.faixas.ate7} até 7 dias`, `${r.faixas.ate30} de 8 a 30 dias`, `${r.faixas.mais30} há mais de 30 dias`, 'a situação de hoje (o período não corta)']} />
        <Tabela rotulo="NC abertas" testid="pc-qualidade-ncs" colunas={colunasNc} linhas={r.abertas.slice(0, 200)} chave={(a) => a.r.chave} />
        {r.abertas.length > 200 && <p class="pc-nota">A tela mostra as 200 mais antigas; o PDF leva todas.</p>}
      </section>

      <div class="pc-duas">
        <section class="pc-secao">
          <h2>Começar até liberar, por ficha</h2>
          <LinhaResumo partes={['da primeira marcação da ficha na peça até a marcação que a liberou', 'mais demorada primeiro']} />
          <Tabela rotulo="Tempo até liberar por ficha" testid="pc-qualidade-tempos" colunas={colunasTempo} linhas={r.tempos} chave={(t) => t.codigo} />
        </section>
        <section class="pc-secao">
          <h2>Fichas liberadas por semana</h2>
          <LinhaResumo partes={['semana de segunda a domingo', 'últimas 12 semanas']} />
          {r.semanas.length ? (
            <ul class="pc-semanas" data-testid="pc-qualidade-semanas">
              {r.semanas.map((s) => (
                <li key={s.semana}>
                  <span class="pc-semanas-rotulo">{dataBR(s.semana)}</span>
                  <Barra valor={s.n} max={maxSemana} texto={String(s.n)} />
                </li>
              ))}
            </ul>
          ) : (
            <p class="pc-nota">Nenhuma ficha liberada nas últimas 12 semanas.</p>
          )}
        </section>
      </div>

      <section class="pc-secao">
        <h2>Concretagens e laudos</h2>
        {dados.concreto ? (
          <>
            <LinhaResumo testid="pc-qualidade-laudos-resumo" partes={ORDEM_DO_LAUDO.filter((s) => r.contaLaudo[s] > 0).map((s) => `${r.contaLaudo[s]} ${NOME_DO_LAUDO[s].toLowerCase()}`)} />
            <Tabela rotulo="Concretagens e laudos" testid="pc-qualidade-laudos" colunas={colunasLaudo} linhas={r.laudos} chave={(l) => l.concretagem.raiz} />
            <p class="pc-nota">Laudo = resultado da idade de controle (a maior, em geral 28 dias) em todos os caminhões. Atrasado: passou 3 dias da data de romper sem resultado.</p>
          </>
        ) : (
          <p class="pc-msg pc-erro">Não deu para ler o Concreto neste aparelho: {dados.erros.concreto ?? 'sem dados'}</p>
        )}
      </section>

      <section class="pc-secao">
        <h2>Andamento por apartamento</h2>
        <LinhaResumo partes={[plural(r.apartamentos.length, 'apartamento com ficha começada', 'apartamentos com ficha começada')]} />
        <Tabela rotulo="Andamento por apartamento" testid="pc-qualidade-aptos" colunas={colunasApto} linhas={r.apartamentos} chave={(l) => `${l.pavimentoId}|${l.apartamento}`} />
      </section>
    </main>
  )
}


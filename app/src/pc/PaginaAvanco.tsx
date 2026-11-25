// Avanço da obra (versão PC, 24/11/2026): a tela inicial do escritório, feita para o chefe. Por residencial
// (ou a obra inteira): pilares e vigas prontos, lajes liberadas para concretar, armação conferida, o que já
// foi concretado e o gráfico pavimento × etapa. Só leitura. As contas ficam em avanco.ts.
import { useEffect, useMemo, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { ObraLocal, UsuarioLocal } from '../nucleo/conta'
import type { EstadoSincronizacao } from '../nucleo/usarSincronizacao'
import { apoiosDaObra, type ApoiosDaPeca } from '../fvs/escoramento_residencial'
import { estruturaNoAparelho } from '../fvs/pacote'
import { BotaoExportarPdf } from '../telas/ExportarPdf'
import type { FolhaPdf } from '../telas/folha_pdf'
import { EtiquetaStatus, LinhaResumo, Tabela, type ColunaTabela } from '../telas/Tabela'
import {
  apoiosDoIndice,
  avancoPorPavimento,
  concretoPorPavimento,
  doAgrupamento,
  ESTADOS,
  indiceDeApoios,
  juntarApoios,
  lajesParaConcretar,
  NOME_DO_ESTADO,
  nomesDosResidenciais,
  porcento,
  resumoDoConcreto,
  type LajeParaConcretar,
  type LinhaDoPavimento,
} from './avanco'
import { baixarTexto } from '../fvs/planilha'
import { caminhoesDoAvanco, indiceDeApoiosDaObra, pecasBase, pecasDoAvanco } from './avanco_dados'
import type { DestinoPc } from './CascaPc'
import { dataBR, type DadosPc } from './dados_pc'

type Tipo = 'todas' | 'pilares' | 'vigas' | 'lajes'
const NOME_DO_TIPO: Record<Tipo, string> = { todas: 'Pilares, vigas e lajes', pilares: 'Pilares', vigas: 'Vigas', lajes: 'Lajes' }

const pct = (parte: number, total: number) => {
  const p = porcento(parte, total)
  return p === null ? '–' : `${p}%`
}
const m3 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const de = (parte: number, total: number) => `${parte} de ${total}`
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

function Indicador({ titulo, valor, sub, alerta, testid }: { titulo: string; valor: string; sub?: ComponentChildren; alerta?: boolean; testid: string }) {
  return (
    <div class={`pc-indicador${alerta ? ' pc-alerta' : ''}`} data-testid={testid}>
      <dt>{titulo}</dt>
      <dd>{valor}</dd>
      <p>{sub ?? ' '}</p>
    </div>
  )
}

/** Barra fina de quanto está pronto, ao lado do "x de y" (o número fica sempre escrito). */
function BarraMini({ parte, total }: { parte: number; total: number }) {
  const p = porcento(parte, total) ?? 0
  return (
    <span class="pc-mini">
      <span class="pc-mini-trilho" aria-hidden="true">
        <span class="pc-mini-cheio" style={{ width: `${p}%` }} />
      </span>
      <span class="pc-mini-num">{pct(parte, total)}</span>
    </span>
  )
}

interface Dica {
  x: number
  y: number
  titulo: string
  texto: string
}

/**
 * Gráfico pavimento × etapa: uma linha por pavimento; à esquerda a conferência da FVS (barras empilhadas
 * por situação), à direita a concretagem (concretado × previsto). As duas barras têm escalas próprias e
 * cada uma mostra os próprios números.
 */
function Grafico({ linhas, tipo }: { linhas: readonly LinhaDoPavimento[]; tipo: Tipo }) {
  const [dica, setDica] = useState<Dica | null>(null)
  const conta = (l: LinhaDoPavimento) => (tipo === 'todas' ? l.todas : l[tipo])
  const concreto = (l: LinhaDoPavimento) =>
    tipo === 'lajes'
      ? { feito: l.concreto.lajes, total: l.concreto.lajesPrevistas }
      : tipo === 'todas'
        ? { feito: l.concreto.pecas + l.concreto.lajes, total: l.concreto.pecasPrevistas + l.concreto.lajesPrevistas }
        : { feito: l.concreto.pecas, total: l.concreto.pecasPrevistas }
  const maior = Math.max(1, ...linhas.map((l) => conta(l).total))
  const mostrar = (e: MouseEvent, titulo: string, texto: string) => {
    const caixa = (e.currentTarget as HTMLElement).closest('.pc-grafico')!.getBoundingClientRect()
    setDica({ x: e.clientX - caixa.left, y: e.clientY - caixa.top, titulo, texto })
  }
  return (
    <div class="pc-grafico" data-testid="pc-grafico" onMouseLeave={() => setDica(null)}>
      <ul class="pc-legenda" aria-label="Legenda">
        {ESTADOS.map((e) => (
          <li key={e}>
            <span class={`pc-cor pc-cor-${e}`} aria-hidden="true" />
            {NOME_DO_ESTADO[e]}
          </li>
        ))}
        <li class="pc-legenda-sep">
          <span class="pc-cor pc-cor-concretado" aria-hidden="true" />
          Concretado
        </li>
      </ul>
      <div class="pc-grafico-grade" role="img" aria-label={`Situação e concretagem por pavimento: ${NOME_DO_TIPO[tipo]}. Os números estão nas tabelas abaixo.`}>
        <span />
        <b class="pc-grafico-cab">Conferência (FVS)</b>
        <b class="pc-grafico-cab">Concretagem</b>
        {linhas.map((l) => {
          const c = conta(l)
          const k = concreto(l)
          const partes = k.total > 1 || tipo === 'lajes' ? (tipo === 'pilares' ? 'pilares' : tipo === 'vigas' ? 'vigas' : tipo === 'lajes' ? 'lajes' : 'peças') : 'peça'
          return (
            <>
              <span class="pc-grafico-rotulo" key={`${l.pavimentoId}r`}>
                {l.pavimento}
              </span>
              <span class="pc-grafico-linha" key={`${l.pavimentoId}f`}>
                <span class="pc-pilha" style={{ width: `${(c.total / maior) * 100}%` }}>
                  {ESTADOS.filter((e) => c[e] > 0).map((e) => (
                    <span
                      key={e}
                      class={`pc-seg pc-cor-${e}`}
                      data-estado={e}
                      style={{ flexGrow: c[e] }}
                      onMouseMove={(ev) => mostrar(ev, l.pavimento, `${NOME_DO_ESTADO[e]}: ${c[e]} de ${c.total} (${pct(c[e], c.total)})`)}
                    >
                      {/* o número só entra no segmento em que cabe; os outros estão na dica e na tabela */}
                      {c[e] / c.total >= 0.09 && c[e]}
                    </span>
                  ))}
                </span>
                <span class="pc-grafico-total">{c.total}</span>
              </span>
              <span class="pc-grafico-linha" key={`${l.pavimentoId}c`}>
                {k.total === 0 ? (
                  <span class="pc-grafico-total">–</span>
                ) : (
                  <>
                    <span class="pc-pilha pc-pilha-concreto" onMouseMove={(ev) => mostrar(ev, l.pavimento, `Concretado: ${k.feito} de ${k.total} ${partes} (${pct(k.feito, k.total)})`)}>
                      {k.feito > 0 && <span class="pc-seg pc-cor-concretado" style={{ flexGrow: k.feito }} />}
                      {k.total - k.feito > 0 && <span class="pc-seg pc-cor-falta" style={{ flexGrow: k.total - k.feito }} />}
                    </span>
                    <span class="pc-grafico-total">{de(k.feito, k.total)}</span>
                  </>
                )}
              </span>
            </>
          )
        })}
      </div>
      {dica && (
        <div class="pc-dica" style={{ left: `${dica.x + 12}px`, top: `${dica.y + 12}px` }} role="status">
          <b>{dica.titulo}</b>
          {dica.texto}
        </div>
      )}
    </div>
  )
}

function horaCurta(iso: string): string {
  const d = new Date(iso)
  const hoje = new Date().toDateString() === d.toDateString()
  return hoje ? `às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : `em ${d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
}

/** De quando são os dados: o que o servidor mandou na última sincronização (ou só o aparelho, sem conta). */
function textoDosDados(s: EstadoSincronizacao): string {
  if (s.local) return 'Sem conta: só o que está neste aparelho'
  if (s.sincronizando) return 'Buscando no servidor…'
  const ate = s.ultima ? `Dados do servidor ${horaCurta(s.ultima)}` : 'Ainda não sincronizado com o servidor'
  if (!s.online) return `Sem internet. ${ate}`
  return s.problema ? `${ate}. A última tentativa falhou (${s.problema})` : ate
}

export function PaginaAvanco({
  dados,
  obra,
  usuario,
  sincronizacao,
  aoSincronizar,
  aoIr,
}: {
  dados: DadosPc
  obra: ObraLocal
  usuario: UsuarioLocal
  sincronizacao: EstadoSincronizacao
  aoSincronizar: () => void
  aoIr: (d: DestinoPc) => void
}) {
  const f = dados.fvs
  const [residencial, setResidencial] = useState<string | null>(null)
  const [tipo, setTipo] = useState<Tipo>('todas')
  // Quem apoia cada viga e cada laje. Duas fontes, as duas do banco do aparelho (nenhum download):
  // as plantas guardadas aqui, se houver, e o índice de apoios publicado nas regras da obra (poucos KB),
  // que serve o PC que nunca baixou planta. A planta daqui passa na frente; o índice cobre o resto.
  const [fontes, setFontes] = useState<{ dasPlantas: ReadonlyMap<string, ApoiosDaPeca>; doIndice: ReadonlyMap<string, ApoiosDaPeca> } | null>(null)
  useEffect(() => {
    if (!f) return
    let vivo = true
    const nomeDoPavimento = new Map(f.pavimentos.map((p) => [p.id, p.nome]))
    Promise.all([
      estruturaNoAparelho()
        .then((plantas) => apoiosDaObra(plantas, f.pecaPorId, [...f.areaPorId.values()]))
        .catch(() => new Map<string, ApoiosDaPeca>()),
      indiceDeApoiosDaObra(obra.id)
        .then((indice) => apoiosDoIndice(indice, pecasBase(f), (id) => nomeDoPavimento.get(id) ?? ''))
        .catch(() => new Map<string, ApoiosDaPeca>()),
    ]).then(([dasPlantas, doIndice]) => vivo && setFontes({ dasPlantas, doIndice }))
    return () => {
      vivo = false
    }
  }, [f, obra.id])
  const apoios = useMemo(() => (fontes ? juntarApoios(fontes.dasPlantas, fontes.doIndice) : null), [fontes])

  const caminhoes = useMemo(() => caminhoesDoAvanco(dados.concreto), [dados.concreto])
  const todas = useMemo(() => (f && apoios ? pecasDoAvanco(f, caminhoes, apoios) : []), [f, apoios, caminhoes])
  const nomes = useMemo(() => nomesDosResidenciais(f?.regras.residenciais ?? []), [f])
  // residencial que saiu das regras (dado novo do servidor): volta para a obra inteira
  const atual = residencial !== null && nomes.includes(residencial) ? residencial : null

  if (!f) {
    return (
      <main class="tela pc-pagina" data-testid="pc-pagina-painel">
        <h1>Avanço da obra</h1>
        <p class="pc-msg pc-erro">Não deu para ler a FVS neste aparelho: {dados.erros.fvs ?? 'sem dados'}</p>
      </main>
    )
  }
  if (!apoios) {
    return (
      <main class="tela pc-pagina" data-testid="pc-pagina-painel" aria-busy="true">
        <h1>Avanço da obra</h1>
        <p>Lendo as plantas deste aparelho…</p>
      </main>
    )
  }

  const pecas = doAgrupamento(todas, atual)
  const parciais = pecas.filter((p) => p.parcial).length
  const { linhas, total } = avancoPorPavimento(pecas, f.pavimentos)
  const lajes = lajesParaConcretar(pecas, todas, f.pavimentos, apoios)
  // já concretada (90% numa concretagem do Concreto, a regra do verde da planta): feita, não mais "para concretar"
  const feita = (l: LajeParaConcretar) => l.concretada || (l.concluida && l.liberada)
  const lajesLiberadas = lajes.filter((l) => l.liberada && !feita(l))
  const lajesFeitas = lajes.filter(feita)
  const resDe = new Map(todas.map((p) => [p.id, p.residenciais]))
  const residenciaisDe = (id: string) => resDe.get(id) ?? []
  const concreto = resumoDoConcreto(caminhoes, atual, residenciaisDe)
  const concretoDaObra = atual === null ? concreto : resumoDoConcreto(caminhoes, null, residenciaisDe)
  const porPav = concretoPorPavimento(caminhoes, atual, residenciaisDe)
  const semResidencial = nomes.length > 0 ? todas.filter((p) => p.residenciais.length === 0).length : 0
  const semPlanta = lajes.filter((l) => l.semElementos).length
  const nomeDoGrupo = atual ?? 'Obra inteira'
  // de onde saíram os apoios, para a pessoa saber (e para o teste)
  const fonteDosApoios = fontes!.dasPlantas.size > 0 ? (fontes!.doIndice.size > 0 ? 'plantas e índice' : 'plantas') : fontes!.doIndice.size > 0 ? 'índice' : 'nenhuma'
  // o índice para publicar nas regras da obra: só sai de um aparelho que tem as plantas
  const baixarIndice = () => {
    const nomeDoPavimento = new Map(f.pavimentos.map((p) => [p.id, p.nome]))
    const pavimentos = indiceDeApoios(pecasBase(f), fontes!.dasPlantas, (id) => nomeDoPavimento.get(id) ?? '')
    baixarTexto(`apoios_${obra.codigo.replace(/[^\p{L}\p{N}]+/gu, '-')}.json`, JSON.stringify({ apoios: { gerado_em: new Date().toISOString(), pavimentos } }), 'application/json;charset=utf-8')
  }

  // ---- tabelas
  const colunasDoTipo = (qual: 'pilares' | 'vigas'): ColunaTabela<LinhaDoPavimento>[] => [
    { titulo: 'Pavimento', valor: (l) => l.pavimento },
    { titulo: 'Prontos', valor: (l) => de(l[qual].pronto, l[qual].total), numero: true },
    { titulo: '% pronto', valor: (l) => <BarraMini parte={l[qual].pronto} total={l[qual].total} /> },
    { titulo: 'P/ concretar', valor: (l) => l[qual].concretar, numero: true },
    { titulo: 'Andamento', valor: (l) => l[qual].andamento, numero: true },
    { titulo: 'Com NC', valor: (l) => (l[qual].nc > 0 ? <EtiquetaStatus status="nc">{l[qual].nc}</EtiquetaStatus> : 0), numero: true },
    { titulo: 'Pendentes', valor: (l) => l[qual].pendente, numero: true },
  ]
  const comTotal = linhas.length > 1 ? [...linhas, total] : linhas
  const colunasDaArmacao: ColunaTabela<LinhaDoPavimento>[] = [
    { titulo: 'Pavimento', valor: (l) => l.pavimento },
    { titulo: 'Peças com armação conferida', valor: (l) => (l.armadura.total ? de(l.armadura.ok, l.armadura.total) : null), numero: true },
    { titulo: '% conferido', valor: (l) => (l.armadura.total ? <BarraMini parte={l.armadura.ok} total={l.armadura.total} /> : null) },
    { titulo: 'Com NC na armação', valor: (l) => (l.armadura.total ? (l.armadura.nc > 0 ? <EtiquetaStatus status="nc">{l.armadura.nc}</EtiquetaStatus> : 0) : null), numero: true },
  ]
  const situacaoDaLaje = (l: LajeParaConcretar) =>
    l.concretada ? <EtiquetaStatus status="liberado">Concretada</EtiquetaStatus> : feita(l) ? <EtiquetaStatus status="liberado">Ficha concluída</EtiquetaStatus> : l.liberada ? <EtiquetaStatus status="liberado">Liberada para concretar</EtiquetaStatus> : l.falta.some((t) => t.includes('não conformidade')) ? <EtiquetaStatus status="nc">Com não conformidade</EtiquetaStatus> : <EtiquetaStatus status="pendente">Falta conferir</EtiquetaStatus>
  const colunasDasLajes: ColunaTabela<LajeParaConcretar>[] = [
    { titulo: 'Pavimento', valor: (l) => l.pavimento },
    { titulo: 'Laje', valor: (l) => l.nome },
    { titulo: 'Situação', valor: situacaoDaLaje },
    { titulo: 'O que falta', valor: (l) => (l.falta.length ? l.falta.join('; ') : null) },
  ]
  const colunasDoConcreto: ColunaTabela<LinhaDoPavimento>[] = [
    { titulo: 'Pavimento', valor: (l) => l.pavimento },
    { titulo: 'Concretagens', valor: (l) => (l.pavimentoId ? (porPav.get(l.pavimentoId)?.concretagens ?? null) : concreto.concretagens || null), numero: true },
    { titulo: 'Caminhões', valor: (l) => (l.pavimentoId ? (porPav.get(l.pavimentoId)?.caminhoes ?? null) : concreto.caminhoes || null), numero: true },
    { titulo: 'Volume (m³)', valor: (l) => (l.pavimentoId ? (porPav.get(l.pavimentoId)?.volume ?? null) : concreto.caminhoes ? concreto.volume : null), numero: true, casas: 1 },
    { titulo: 'Pilares e vigas concretados', valor: (l) => (l.concreto.pecasPrevistas ? de(l.concreto.pecas, l.concreto.pecasPrevistas) : null), numero: true },
    { titulo: 'Lajes concretadas', valor: (l) => (l.concreto.lajesPrevistas ? de(l.concreto.lajes, l.concreto.lajesPrevistas) : null), numero: true },
  ]

  // ---- folha do Imprimir / PDF: os mesmos números da tela
  const montar = (): FolhaPdf => {
    const linhaDoTipo = (qual: 'pilares' | 'vigas') => (l: LinhaDoPavimento) => [l.pavimento, de(l[qual].pronto, l[qual].total), pct(l[qual].pronto, l[qual].total), l[qual].concretar, l[qual].andamento, l[qual].nc, l[qual].pendente]
    const cabDoTipo = ['Pavimento', 'Prontos', '% pronto', 'Liberados p/ concretar', 'Em andamento', 'Com NC', 'Pendentes']
    return {
      modulo: 'Avanço da obra',
      titulo: nomeDoGrupo,
      sub: textoDosDados(sincronizacao),
      deitada: true,
      resumo: [
        `Pilares prontos: ${de(total.pilares.pronto, total.pilares.total)} (${pct(total.pilares.pronto, total.pilares.total)})`,
        `Vigas prontas: ${de(total.vigas.pronto, total.vigas.total)} (${pct(total.vigas.pronto, total.vigas.total)})`,
        `Lajes liberadas para concretar: ${lajesLiberadas.length} de ${lajes.length}`,
        `Armação conferida: ${pct(total.armadura.ok, total.armadura.total)}`,
        `Concreto: ${m3(concreto.volume)} m³ em ${plural(concreto.caminhoes, 'caminhão', 'caminhões')}`,
      ],
      tabelas: [
        { titulo: 'Pilares por pavimento', colunas: cabDoTipo, curtas: [1, 2, 3, 4, 5, 6], linhas: comTotal.map(linhaDoTipo('pilares')), vazio: 'Sem pilares neste agrupamento.' },
        { titulo: 'Vigas por pavimento', colunas: cabDoTipo, curtas: [1, 2, 3, 4, 5, 6], linhas: comTotal.map(linhaDoTipo('vigas')), vazio: 'Sem vigas neste agrupamento.' },
        {
          titulo: 'Lajes',
          colunas: ['Pavimento', 'Laje', 'Situação', 'O que falta'],
          linhas: lajes.map((l) => [l.pavimento, l.nome, l.concretada ? 'Concretada' : feita(l) ? 'Ficha concluída' : l.liberada ? 'Liberada para concretar' : l.falta.some((t) => t.includes('não conformidade')) ? 'Com não conformidade' : 'Falta conferir', l.falta.join('; ')]),
          vazio: 'Sem lajes neste agrupamento.',
        },
        {
          titulo: 'Armação (peças com os itens de armadura conferidos)',
          colunas: ['Pavimento', 'Conferidas', '% conferido', 'Com NC'],
          curtas: [1, 2, 3],
          linhas: comTotal.filter((l) => l.armadura.total > 0).map((l) => [l.pavimento, de(l.armadura.ok, l.armadura.total), pct(l.armadura.ok, l.armadura.total), l.armadura.nc]),
          vazio: 'As fichas deste agrupamento não têm item de armadura.',
        },
        {
          titulo: 'Concretagem',
          colunas: ['Pavimento', 'Concretagens', 'Caminhões', 'Volume (m³)', 'Pilares e vigas concretados', 'Lajes concretadas'],
          curtas: [1, 2, 3],
          linhas: linhas.map((l) => {
            const c = porPav.get(l.pavimentoId)
            return [l.pavimento, c?.concretagens ?? '', c?.caminhoes ?? '', c ? m3(c.volume) : '', l.concreto.pecasPrevistas ? de(l.concreto.pecas, l.concreto.pecasPrevistas) : '', l.concreto.lajesPrevistas ? de(l.concreto.lajes, l.concreto.lajesPrevistas) : '']
          }),
          vazio: 'Sem peças neste agrupamento.',
          nota: concreto.divididos > 0 ? `${concreto.divididos} caminhão(ões) também concretaram peça de outro residencial: o volume deles entra inteiro.` : undefined,
        },
      ],
    }
  }

  const chip = (valor: string | null, nome: string) => (
    <button type="button" key={nome} class="pc-chip" aria-pressed={atual === valor} data-testid="pc-agrupamento" data-valor={valor ?? ''} onClick={() => setResidencial(valor)}>
      {nome}
    </button>
  )

  return (
    <main class="tela pc-pagina pc-avanco" data-testid="pc-pagina-painel" data-apoios={fonteDosApoios}>
      <div class="pc-titulo">
        <h1>Avanço da obra</h1>
        <p data-testid="pc-avanco-dados">{textoDosDados(sincronizacao)}</p>
        <div class="pc-titulo-acoes">
          {!sincronizacao.local && (
            <button type="button" class="pc-bt" data-testid="pc-avanco-atualizar" disabled={sincronizacao.sincronizando || !sincronizacao.online} onClick={aoSincronizar}>
              Atualizar
            </button>
          )}
          <BotaoExportarPdf obra={obra} usuario={usuario} montar={montar} rotulo="Imprimir / PDF" testid="pc-avanco-pdf" />
        </div>
      </div>

      <div class="pc-filtros">
        <div class="pc-chips" role="group" aria-label="Agrupamento">
          {chip(null, 'Obra inteira')}
          {nomes.map((n) => chip(n, n))}
        </div>
      </div>
      {nomes.length === 0 && <LinhaResumo testid="pc-avanco-sem-residencial" partes={['A obra não tem residenciais nas regras: avanço por pavimento']} />}

      <dl class="pc-indicadores" data-testid="pc-indicadores">
        <Indicador
          testid="pc-ind-pilares"
          titulo="Pilares prontos"
          valor={de(total.pilares.pronto, total.pilares.total)}
          sub={`${pct(total.pilares.pronto, total.pilares.total)} · ${total.pilares.concretar} liberados p/ concretar · ${total.pilares.andamento} em andamento · ${total.pilares.nc} com NC`}
          alerta={total.pilares.nc > 0}
        />
        <Indicador
          testid="pc-ind-vigas"
          titulo="Vigas prontas"
          valor={de(total.vigas.pronto, total.vigas.total)}
          sub={`${pct(total.vigas.pronto, total.vigas.total)} · ${total.vigas.concretar} liberados p/ concretar · ${total.vigas.andamento} em andamento · ${total.vigas.nc} com NC`}
          alerta={total.vigas.nc > 0}
        />
        <Indicador testid="pc-ind-lajes" titulo="Lajes liberadas para concretar" valor={de(lajesLiberadas.length, lajes.length)} sub={`${plural(lajesFeitas.length, 'já feita', 'já feitas')} · ${lajes.length - lajesFeitas.length - lajesLiberadas.length} faltando`} />
        <Indicador testid="pc-ind-armacao" titulo="Armação conferida" valor={pct(total.armadura.ok, total.armadura.total)} sub={total.armadura.total ? `${de(total.armadura.ok, total.armadura.total)} peças` : 'as fichas não têm item de armadura'} />
        <Indicador
          testid="pc-ind-concreto"
          titulo="Concreto lançado (m³)"
          valor={m3(concreto.volume)}
          sub={`${plural(concreto.concretagens, 'concretagem', 'concretagens')} · ${plural(concreto.caminhoes, 'caminhão', 'caminhões')}${concreto.ultima ? ` · última ${dataBR(concreto.ultima)}` : ''}`}
        />
      </dl>

      <section class="pc-secao">
        <div class="pc-secao-cab">
          <h2>Pavimento × etapa</h2>
          <div class="pc-chips" role="group" aria-label="Peças do gráfico">
            {(Object.keys(NOME_DO_TIPO) as Tipo[]).map((t) => (
              <button type="button" key={t} class="pc-chip" aria-pressed={tipo === t} data-testid={`pc-tipo-${t}`} onClick={() => setTipo(t)}>
                {t === 'todas' ? 'Tudo' : NOME_DO_TIPO[t]}
              </button>
            ))}
          </div>
        </div>
        {linhas.length === 0 ? <p class="pc-nota">–</p> : <Grafico linhas={linhas} tipo={tipo} />}
      </section>

      <LinhaResumo testid="pc-avanco-regra-pronto" partes={['Pronto = conferido e concretado: 90% da peça numa concretagem cadastrada no Concreto, o verde da planta', 'ficha toda marcada sem concretagem conta como liberada para concretar']} />

      <div class="pc-duas">
        <section class="pc-secao">
          <h2>Pilares</h2>
          <Tabela rotulo="Pilares por pavimento" testid="pc-avanco-pilares" colunas={colunasDoTipo('pilares')} linhas={comTotal.filter((l) => l.pilares.total > 0)} chave={(l) => l.pavimentoId || 'total'} />
        </section>
        <section class="pc-secao">
          <h2>Vigas</h2>
          <Tabela rotulo="Vigas por pavimento" testid="pc-avanco-vigas" colunas={colunasDoTipo('vigas')} linhas={comTotal.filter((l) => l.vigas.total > 0)} chave={(l) => l.pavimentoId || 'total'} />
        </section>
      </div>

      <section class="pc-secao">
        <h2>Lajes: liberadas para concretar e o que falta</h2>
        <LinhaResumo testid="pc-avanco-lajes-resumo" partes={[
          fonteDosApoios === 'índice' && 'pilares e vigas de cada laje pelo índice de apoios da obra',
          fonteDosApoios === 'nenhuma' && lajes.length > 0 && 'sem planta neste aparelho e sem índice de apoios nas regras da obra',`${lajesLiberadas.length} liberadas para concretar`, `${lajesFeitas.length} já feitas`, `${lajes.length - lajesFeitas.length - lajesLiberadas.length} faltando`, semPlanta > 0 && `${semPlanta} sem a planta neste aparelho`]} />
        <Tabela rotulo="Lajes" testid="pc-avanco-lajes" colunas={colunasDasLajes} linhas={lajes} chave={(l) => l.id} />
      </section>

      <div class="pc-duas">
        <section class="pc-secao">
          <h2>Armação</h2>
          <LinhaResumo partes={['Peças com todos os itens de armadura da ficha conferidos', 'por peso fica para quando houver o quantitativo de aço']} />
          <Tabela rotulo="Armação por pavimento" testid="pc-avanco-armacao" colunas={colunasDaArmacao} linhas={comTotal.filter((l) => l.armadura.total > 0)} chave={(l) => l.pavimentoId || 'total'} />
        </section>
        <section class="pc-secao">
          <h2>Concretagem</h2>
          <LinhaResumo
            testid="pc-avanco-concreto-resumo"
            partes={[
              `${nomeDoGrupo}: ${m3(concreto.volume)} m³`,
              atual !== null && `obra inteira: ${m3(concretoDaObra.volume)} m³`,
              concreto.divididos > 0 && `${plural(concreto.divididos, 'caminhão dividido', 'caminhões divididos')} com outro residencial (volume inteiro)`,
              concreto.semPeca > 0 && `${plural(concreto.semPeca, 'caminhão', 'caminhões')} sem peça marcada`,
              concreto.semVolume > 0 && `${plural(concreto.semVolume, 'caminhão', 'caminhões')} sem volume`,
              parciais > 0 && `${plural(parciais, 'peça', 'peças')} com caminhão abaixo de 90% (ainda não conta como concretada)`,
            ]}
          />
          <Tabela rotulo="Concretagem por pavimento" testid="pc-avanco-concreto" colunas={colunasDoConcreto} linhas={comTotal} chave={(l) => l.pavimentoId || 'total'} />
        </section>
      </div>

      {semResidencial > 0 && atual === null && <LinhaResumo testid="pc-avanco-fora" partes={[`${semResidencial} peças fora de qualquer residencial (só entram na obra inteira)`]} />}

      <section class="pc-faixa-acoes" data-testid="pc-painel-acoes" aria-label="Ações">
        <h2>Ações</h2>
        <button type="button" class="pc-bt" data-testid="pc-painel-relatorios" onClick={() => aoIr({ tipo: 'pagina', pagina: 'relatorios' })}>
          Gerar relatórios ›
        </button>
        <button type="button" class="pc-bt" data-testid="pc-painel-pranchas" onClick={() => aoIr({ tipo: 'pagina', pagina: 'pranchas' })}>
          Procurar prancha ou PDF ›
        </button>
        <button type="button" class="pc-bt" onClick={() => aoIr({ tipo: 'modulo', id: 'fvs' })}>
          Abrir a FVS ›
        </button>
        {fontes!.dasPlantas.size > 0 && (
          <button type="button" class="pc-bt" data-testid="pc-avanco-baixar-indice" title="Arquivo pequeno com os pilares e as vigas de cada viga e laje, para publicar nas regras da obra. Com ele, o Avanço funciona em PC que não baixou as plantas." onClick={baixarIndice}>
            Baixar índice de apoios (.json)
          </button>
        )}
      </section>
    </main>
  )
}

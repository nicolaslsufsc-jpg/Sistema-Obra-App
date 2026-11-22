// Abas Pranchas e Entregas do painel (protótipo aprovado em 14/11/2026): a lista vigente e a distribuição
// inteiras, com busca e filtros. Tocar numa linha abre a prancha.
import { useMemo, useState } from 'preact/hooks'
import { chaveFolha, compararEscritorio, type RegistroEscritorio } from '../edicoes'
import { melhor, normalizar, rotuloRev, type CopiaCruzada, type Vigente, rotuloDaCopia } from '../painel'
import type { Contexto } from './ModuloProjetos'
import { CabecalhoBase, tocavel, usarBase } from './baseComum'
import { dataBR, plural } from './comum'
import { alvoDe, alvoDaFolha, seloDe } from './TelaPranchaBase'
import { BotaoExportarPdf } from '../../telas/ExportarPdf'
import { abaFicha, baixarXlsx, type Aba } from '../ficha_v2'
import type { FolhaPdf } from '../../telas/folha_pdf'

const PAGINA = 60

function Busca({ valor, mudar, rotulo }: { valor: string; mudar: (v: string) => void; rotulo: string }) {
  return (
    <div class="pj-busca">
      <input type="search" aria-label={rotulo} placeholder={rotulo} value={valor} onInput={(e) => mudar(e.currentTarget.value)} />
    </div>
  )
}

function Filtros<T extends string>({ opcoes, valor, mudar }: { opcoes: { v: T; rotulo: string; n: number }[]; valor: T; mudar: (v: T) => void }) {
  return (
    <div class="pj-filtros" role="group" aria-label="Filtro">
      {opcoes.map((o) => (
        <button key={o.v} type="button" class={valor === o.v ? 'ativa' : ''} aria-pressed={valor === o.v} onClick={() => mudar(o.v)}>
          {o.rotulo} <span class="n">{o.n}</span>
        </button>
      ))}
    </div>
  )
}

const ROTULO_FILTRO: Record<FiltroEntregaDaFolha, string> = {
  'em campo': 'em campo',
  desatualizada: 'desatualizadas',
  conferir: 'conferir',
  recolhida: 'provavelmente recolhidas',
  devolvida: 'devolvidas',
}
type FiltroEntregaDaFolha = 'em campo' | 'desatualizada' | 'conferir' | 'recolhida' | 'devolvida'

/** Linha de baixo do título da folha: o filtro e a busca da tela, ou "Todas". */
function filtroDaFolha(busca: string, filtro: string): string {
  const partes = [filtro && `filtro ${filtro}`, busca.trim() && `busca "${busca.trim()}"`].filter(Boolean)
  return partes.length ? `Com ${partes.join(' e ')}` : 'Todas'
}

const contem = (q: string, ...campos: string[]) => {
  const t = normalizar(q).trim()
  return !t || campos.some((c) => normalizar(c).includes(t))
}

// ---------------------------------------------------------------------------------------------
// Pranchas
// ---------------------------------------------------------------------------------------------

interface LinhaPrancha {
  vigente: Vigente
  emCampo: number
  desatualizadas: number
  escritorio: RegistroEscritorio | undefined
  escritorioAtrasado: boolean
}

/** A lista mestre como está na tela (com a busca e o filtro): a vigente de cada prancha, as cópias e o escritório. */
function abaListaMestre(linhas: readonly LinhaPrancha[]): Aba {
  const data = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? { data: d } : d || null)
  return {
    nome: 'LISTA MESTRE',
    cabecalho: true,
    larguras: [16, 22, 30, 50, 10, 12, 18, 9, 13, 13, 13],
    linhas: [
      ['Disciplina', 'Pasta', 'Código', 'Título', 'Vigente', 'Vigente desde', 'Status', 'Em campo', 'Precisa trocar', 'Escritório', 'Escritório em dia'],
      ...linhas.map((l) => [
        l.vigente.disciplina,
        l.vigente.pasta,
        l.vigente.codigo,
        l.vigente.titulo,
        rotuloRev(l.vigente.fase, l.vigente.revisao),
        data(l.vigente.data),
        l.vigente.status,
        l.emCampo,
        l.desatualizadas,
        l.escritorio ? rotuloRev(l.escritorio.fase, l.escritorio.revisao) : 'sem registro',
        l.escritorio ? (l.escritorioAtrasado ? 'NÃO' : 'SIM') : '',
      ]),
    ],
  }
}

export type FiltroPrancha = 'todas' | 'canteiro' | 'trocar' | 'escritorio'

/** Filtros da aba Pranchas: no canteiro = tem cópia em campo; precisa trocar = alguma cópia em campo desatualizada. */
const PASSA_PRANCHA: Record<FiltroPrancha, (l: LinhaPrancha) => boolean> = {
  todas: () => true,
  canteiro: (l) => l.emCampo > 0,
  trocar: (l) => l.desatualizadas > 0,
  escritorio: (l) => l.escritorioAtrasado,
}

export function TelaPranchasBase({ ctx, aoSair, filtroInicial }: { ctx: Contexto; aoSair: () => void; filtroInicial?: FiltroPrancha }) {
  const { base, corrigida, cruzadas, resumo } = usarBase(ctx)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroPrancha>(filtroInicial ?? 'todas')
  const [quantas, setQuantas] = useState(PAGINA)

  const linhas = useMemo<LinhaPrancha[]>(() => {
    if (!corrigida || !cruzadas) return []
    const porFolha = new Map<string, Vigente[]>()
    for (const v of corrigida.vigentes) porFolha.set(chaveFolha(v), [...(porFolha.get(chaveFolha(v)) ?? []), v])
    const contagem = new Map<string, { emCampo: number; desatualizadas: number }>()
    for (const x of cruzadas) {
      if (!x.vigente || x.situacao !== 'em campo') continue
      const k = chaveFolha(x.vigente)
      const c = contagem.get(k) ?? { emCampo: 0, desatualizadas: 0 }
      c.emCampo++
      if (x.resultado === 'desatualizada') c.desatualizadas++
      contagem.set(k, c)
    }
    return [...porFolha.entries()]
      .map(([k, vs]) => {
        const v = melhor(vs)
        const e = corrigida.escritorio.get(k)
        const atrasado = !!e && compararEscritorio(e, v) === 'desatualizado'
        return { vigente: v, ...(contagem.get(k) ?? { emCampo: 0, desatualizadas: 0 }), escritorio: e, escritorioAtrasado: atrasado }
      })
      .sort((a, b) => a.vigente.disciplina.localeCompare(b.vigente.disciplina, 'pt-BR') || Number(a.vigente.de) - Number(b.vigente.de) || a.vigente.codigo.localeCompare(b.vigente.codigo))
  }, [corrigida, cruzadas, ctx.dados.hoje])

  if (base === undefined) return <main class="tela">Carregando…</main>
  const achadas = linhas.filter((l) => contem(busca, l.vigente.codigo, l.vigente.titulo, l.vigente.disciplina, l.vigente.de))
  const filtradas = achadas.filter(PASSA_PRANCHA[filtro])
  // a lista com a busca e o filtro, inteira (sem o "Mostrar mais"), em A4 (21/11/2026)
  const folha = (): FolhaPdf => ({
    modulo: 'Projetos',
    titulo: 'Pranchas da lista vigente',
    sub: filtroDaFolha(busca, { todas: '', canteiro: 'no canteiro', trocar: 'precisa trocar', escritorio: 'escritório desatualizado' }[filtro]),
    resumo: [plural(filtradas.length, 'prancha', 'pranchas'), plural(filtradas.reduce((s, l) => s + l.desatualizadas, 0), 'cópia desatualizada', 'cópias desatualizadas')],
    tabelas: [
      {
        colunas: ['Disciplina', 'Código', 'Título', 'Vigente', 'Data', 'Em campo', 'Desatualizadas', 'Escritório'],
        curtas: [1, 3, 4, 5, 6],
        linhas: filtradas.map((l) => [
          l.vigente.disciplina,
          l.vigente.codigo,
          l.vigente.titulo,
          rotuloRev(l.vigente.fase, l.vigente.revisao),
          dataBR(l.vigente.data),
          l.emCampo,
          l.desatualizadas || '',
          `${l.escritorio ? rotuloRev(l.escritorio.fase, l.escritorio.revisao) : 'sem registro'}${l.escritorioAtrasado ? ' (desatualizado)' : ''}`,
        ]),
        vazio: 'Nenhuma prancha.',
      },
    ],
    deitada: true,
  })

  return (
    <main class="tela pj-painel">
      <CabecalhoBase ctx={ctx} aba="pranchas" aoSair={aoSair} base={base} temCruzamento={!!resumo} />
      <section class="pj-bloco">
        <h2>Pranchas da lista vigente</h2>
        <div class="pj-baixar">
          <BotaoExportarPdf obra={ctx.obra} usuario={ctx.usuario} montar={folha} testid="projetos-pdf-pranchas" desativado={filtradas.length === 0} />
          <button
            type="button"
            class="pj-pequeno"
            data-testid="projetos-xlsx-pranchas"
            disabled={filtradas.length === 0}
            onClick={() => baixarXlsx(`${ctx.dados.hoje}_${ctx.obra.codigo}_lista_mestre.xlsx`, [abaListaMestre(filtradas)])}
          >
            Baixar lista mestre (.xlsx)
          </button>
        </div>
        <Busca valor={busca} mudar={setBusca} rotulo="Buscar código, título ou número" />
        <Filtros
          valor={filtro}
          mudar={setFiltro}
          opcoes={[
            { v: 'todas', rotulo: 'Todas', n: achadas.length },
            { v: 'canteiro', rotulo: 'No canteiro', n: achadas.filter(PASSA_PRANCHA.canteiro).length },
            { v: 'trocar', rotulo: 'Precisa trocar', n: achadas.filter(PASSA_PRANCHA.trocar).length },
            { v: 'escritorio', rotulo: 'Escritório desatualizado', n: achadas.filter(PASSA_PRANCHA.escritorio).length },
          ]}
        />
        {filtradas.length === 0 && <p class="discreto">Nenhuma prancha.</p>}
        <ul class="pj-lista-painel" data-testid="lista-pranchas">
          {filtradas.slice(0, quantas).map((l) => (
            <li key={l.vigente.codigo} class="pj-linha-painel pj-tocavel" {...tocavel(() => ctx.ir({ nome: 'prancha-base', ...alvoDaFolha(l.vigente) }))}>
              <div>
                <b>{l.vigente.codigo}</b> <span class="discreto">{l.vigente.titulo}</span>
                <br />
                <span class="pj-rev nova">{rotuloRev(l.vigente.fase, l.vigente.revisao)}</span> de {dataBR(l.vigente.data)}
                <div class="discreto">
                  {l.vigente.disciplina} · {plural(l.emCampo, 'cópia', 'cópias')} em campo · escritório{' '}
                  {l.escritorio ? rotuloRev(l.escritorio.fase, l.escritorio.revisao) : 'sem registro'}
                </div>
              </div>
              {l.desatualizadas > 0 ? (
                <span class="pj-selo des">{plural(l.desatualizadas, 'desatualizada', 'desatualizadas')}</span>
              ) : l.escritorioAtrasado ? (
                <span class="pj-selo conf">escritório</span>
              ) : null}
            </li>
          ))}
        </ul>
        {filtradas.length > quantas && (
          <button type="button" class="pj-pequeno" onClick={() => setQuantas(quantas + PAGINA * 5)}>
            Mostrar mais ({filtradas.length - quantas})
          </button>
        )}
      </section>
    </main>
  )
}

// ---------------------------------------------------------------------------------------------
// Entregas
// ---------------------------------------------------------------------------------------------

export type FiltroEntrega = 'em campo' | 'desatualizada' | 'conferir' | 'recolhida' | 'devolvida' | 'todas'

const PASSA: Record<FiltroEntrega, (x: CopiaCruzada) => boolean> = {
  'em campo': (x) => x.situacao === 'em campo',
  desatualizada: (x) => x.situacao === 'em campo' && x.resultado === 'desatualizada',
  conferir: (x) => x.situacao === 'em campo' && x.resultado === 'conferir',
  recolhida: (x) => x.situacao === 'recolhida',
  devolvida: (x) => x.situacao === 'devolvida',
  todas: () => true,
}

export function TelaEntregasBase({ ctx, aoSair, filtroInicial, buscaInicial }: { ctx: Contexto; aoSair: () => void; filtroInicial?: FiltroEntrega; buscaInicial?: string }) {
  const { base, cruzadas, resumo } = usarBase(ctx)
  const [busca, setBusca] = useState(buscaInicial ?? '')
  const [filtro, setFiltro] = useState<FiltroEntrega>(filtroInicial ?? 'em campo')
  const [quantas, setQuantas] = useState(PAGINA)

  const ordenadas = useMemo(
    () => [...(cruzadas ?? [])].sort((a, b) => (b.copia.entrega ?? '').localeCompare(a.copia.entrega ?? '') || b.copia.linha - a.copia.linha),
    [cruzadas],
  )

  if (base === undefined) return <main class="tela">Carregando…</main>
  const achadas = ordenadas.filter((x) => contem(busca, x.copia.empresa, x.copia.colaborador, x.copia.codigo, x.copia.titulo, x.copia.disciplinaNome, x.copia.disciplina))
  const filtradas = achadas.filter(PASSA[filtro])
  const n = (f: FiltroEntrega) => achadas.filter(PASSA[f]).length
  const folha = (): FolhaPdf => ({
    modulo: 'Projetos',
    titulo: 'Entregas de cópias',
    sub: filtroDaFolha(busca, filtro === 'todas' ? '' : ROTULO_FILTRO[filtro]),
    resumo: [plural(filtradas.length, 'entrega', 'entregas')],
    tabelas: [
      {
        colunas: ['Situação', 'Disciplina', 'Código', 'Título', 'Revisão', 'Empresa', 'Colaborador', 'Entregue', 'Devolvida'],
        curtas: [2, 4, 7, 8],
        linhas: filtradas.map((x) => {
          const c = x.copia
          return [seloDe(x).texto, c.disciplinaNome, c.codigo, c.titulo, rotuloDaCopia(c), c.empresa, c.colaborador, (c.entrega ? dataBR(c.entrega) : c.entregaTexto) + (c.app?.assinaturaId ? ' (assinada)' : ''), c.devolucao ? dataBR(c.devolucao) : '']
        }),
        vazio: 'Nenhuma entrega.',
      },
    ],
    deitada: true,
  })

  return (
    <main class="tela pj-painel">
      <CabecalhoBase ctx={ctx} aba="entregas" aoSair={aoSair} base={base} temCruzamento={!!resumo} />
      <section class="pj-bloco">
        <h2>Entregas de cópias</h2>
        <div class="pj-baixar">
          <BotaoExportarPdf obra={ctx.obra} usuario={ctx.usuario} montar={folha} testid="projetos-pdf-entregas" desativado={filtradas.length === 0} />
          <button
            type="button"
            class="pj-pequeno"
            data-testid="projetos-xlsx-entregas"
            disabled={filtradas.length === 0}
            onClick={() => baixarXlsx(`${ctx.dados.hoje}_${ctx.obra.codigo}_distribuicao.xlsx`, [abaFicha(filtradas, 'DISTRIBUICAO')])}
          >
            Baixar distribuição (.xlsx)
          </button>
        </div>
        <Busca valor={busca} mudar={setBusca} rotulo="Buscar empresa, colaborador ou prancha" />
        <Filtros
          valor={filtro}
          mudar={setFiltro}
          opcoes={[
            { v: 'em campo', rotulo: 'Em campo', n: n('em campo') },
            { v: 'desatualizada', rotulo: 'Desatualizadas', n: n('desatualizada') },
            { v: 'conferir', rotulo: 'Conferir', n: n('conferir') },
            { v: 'recolhida', rotulo: 'Provavelmente recolhidas', n: n('recolhida') },
            { v: 'devolvida', rotulo: 'Devolvidas', n: n('devolvida') },
            { v: 'todas', rotulo: 'Todas', n: achadas.length },
          ]}
        />
        {filtradas.length === 0 && <p class="discreto">Nenhuma entrega.</p>}
        <ul class="pj-lista-painel" data-testid="lista-entregas">
          {filtradas.slice(0, quantas).map((x) => {
            const c = x.copia
            const selo = seloDe(x)
            return (
              <li key={c.linha} class="pj-linha-painel pj-tocavel" {...tocavel(() => ctx.ir({ nome: 'prancha-base', ...alvoDe(x) }))}>
                <div>
                  <span class={`pj-selo ${selo.classe}`}>{selo.texto}</span>
                  <br />
                  <b>
                    {c.disciplinaNome} {c.codigo}
                  </b>{' '}
                  <span class="discreto">{c.titulo}</span>
                  <br />
                  <span class="pj-rev">{rotuloDaCopia(c)}</span> · {c.empresa}
                  {c.colaborador ? ` · ${c.colaborador}` : ''}
                  <div class="discreto">
                    entregue {c.entrega ? dataBR(c.entrega) : `"${c.entregaTexto}"`}
                    {c.app ? ' pelo app' : ''}
                    {c.devolucao ? ` · devolvida ${dataBR(c.devolucao)}` : ''}{' '}
                    {c.app?.assinaturaId && (
                      <span class="pj-selo ok" data-testid="entrega-assinada">
                        ✍ assinada
                      </span>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
        {filtradas.length > quantas && (
          <button type="button" class="pj-pequeno" onClick={() => setQuantas(quantas + PAGINA * 5)}>
            Mostrar mais ({filtradas.length - quantas})
          </button>
        )}
      </section>
    </main>
  )
}


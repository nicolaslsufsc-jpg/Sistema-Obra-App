// Abas Pranchas e Entregas do painel (protótipo aprovado em 14/11/2026): a lista vigente e a distribuição
// inteiras, com busca e filtros. Tocar numa linha abre a prancha.
import { useMemo, useState } from 'preact/hooks'
import { chaveFolha, type RegistroEscritorio } from '../edicoes'
import { compararCopia, melhor, normalizar, rotuloRev, type Copia, type CopiaCruzada, type Vigente } from '../painel'
import type { Contexto } from './ModuloProjetos'
import { CabecalhoBase, tocavel, usarBase } from './baseComum'
import { dataBR, plural } from './comum'
import { alvoDe, alvoDaFolha, seloDe } from './TelaPranchaBase'

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

type FiltroPrancha = 'todas' | 'desatualizadas' | 'escritorio'

export function TelaPranchasBase({ ctx, aoSair }: { ctx: Contexto; aoSair: () => void }) {
  const { base, corrigida, cruzadas, resumo } = usarBase(ctx)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroPrancha>('todas')
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
        const atrasado = !!e && compararCopia({ revisao: e.revisao, fase: e.fase, entrega: e.data } as Copia, v, ctx.dados.hoje).resultado === 'desatualizada'
        return { vigente: v, ...(contagem.get(k) ?? { emCampo: 0, desatualizadas: 0 }), escritorio: e, escritorioAtrasado: atrasado }
      })
      .sort((a, b) => a.vigente.disciplina.localeCompare(b.vigente.disciplina, 'pt-BR') || Number(a.vigente.de) - Number(b.vigente.de) || a.vigente.codigo.localeCompare(b.vigente.codigo))
  }, [corrigida, cruzadas, ctx.dados.hoje])

  if (base === undefined) return <main class="tela">Carregando…</main>
  const achadas = linhas.filter((l) => contem(busca, l.vigente.codigo, l.vigente.titulo, l.vigente.disciplina, l.vigente.de))
  const filtradas = achadas.filter((l) => (filtro === 'desatualizadas' ? l.desatualizadas > 0 : filtro === 'escritorio' ? l.escritorioAtrasado : true))

  return (
    <main class="tela pj-painel">
      <CabecalhoBase ctx={ctx} aba="pranchas" aoSair={aoSair} base={base} temCruzamento={!!resumo} />
      <section class="pj-bloco">
        <h2>Pranchas da lista vigente</h2>
        <Busca valor={busca} mudar={setBusca} rotulo="Buscar código, título ou número" />
        <Filtros
          valor={filtro}
          mudar={setFiltro}
          opcoes={[
            { v: 'todas', rotulo: 'Todas', n: achadas.length },
            { v: 'desatualizadas', rotulo: 'Com cópia desatualizada', n: achadas.filter((l) => l.desatualizadas > 0).length },
            { v: 'escritorio', rotulo: 'Escritório desatualizado', n: achadas.filter((l) => l.escritorioAtrasado).length },
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

type FiltroEntrega = 'em campo' | 'desatualizada' | 'conferir' | 'recolhida' | 'devolvida' | 'todas'

const PASSA: Record<FiltroEntrega, (x: CopiaCruzada) => boolean> = {
  'em campo': (x) => x.situacao === 'em campo',
  desatualizada: (x) => x.situacao === 'em campo' && x.resultado === 'desatualizada',
  conferir: (x) => x.situacao === 'em campo' && x.resultado === 'conferir',
  recolhida: (x) => x.situacao === 'recolhida',
  devolvida: (x) => x.situacao === 'devolvida',
  todas: () => true,
}

export function TelaEntregasBase({ ctx, aoSair }: { ctx: Contexto; aoSair: () => void }) {
  const { base, cruzadas, resumo } = usarBase(ctx)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroEntrega>('em campo')
  const [quantas, setQuantas] = useState(PAGINA)

  const ordenadas = useMemo(
    () => [...(cruzadas ?? [])].sort((a, b) => (b.copia.entrega ?? '').localeCompare(a.copia.entrega ?? '') || b.copia.linha - a.copia.linha),
    [cruzadas],
  )

  if (base === undefined) return <main class="tela">Carregando…</main>
  const achadas = ordenadas.filter((x) => contem(busca, x.copia.empresa, x.copia.colaborador, x.copia.codigo, x.copia.titulo, x.copia.disciplinaNome))
  const filtradas = achadas.filter(PASSA[filtro])
  const n = (f: FiltroEntrega) => achadas.filter(PASSA[f]).length

  return (
    <main class="tela pj-painel">
      <CabecalhoBase ctx={ctx} aba="entregas" aoSair={aoSair} base={base} temCruzamento={!!resumo} />
      <section class="pj-bloco">
        <h2>Entregas de cópias</h2>
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
                  <span class="pj-rev">{rotuloRev(c.fase, c.revisao)}</span> · {c.empresa}
                  {c.colaborador ? ` · ${c.colaborador}` : ''}
                  <div class="discreto">
                    entregue {c.entrega ? dataBR(c.entrega) : `"${c.entregaTexto}"`}
                    {c.devolucao ? ` · devolvida ${dataBR(c.devolucao)}` : ''}
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


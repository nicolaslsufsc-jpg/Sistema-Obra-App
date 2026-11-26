// Aba Entregas (23/11/2026, pedido do Nicolas: "acho que dá para ter uma aba com as entregas"). Uma linha
// por entrega: data e hora, pessoa, empresa, quantas pranchas e se foi assinada, da mais nova para a mais
// velha, com busca por pessoa ou empresa e filtro de data. Tocar abre o comprovante (no formulário da obra,
// quando a obra tem um). As contas estão em projetos/entregas.ts. Só leitura.
import { useMemo, useState } from 'preact/hooks'
import { entregasDaObra, filtrarEntregas, type FiltroEntregas } from '../entregas'
import { dataHoraDe } from '../assinatura'
import { somarDias } from '../regras'
import type { Contexto } from './ModuloProjetos'
import { CabecalhoBase, tocavel, usarBase } from './baseComum'
import { dataBR, plural } from './comum'
import '../../telas/cabecalho.css'

type Periodo = 'tudo' | 'hoje' | '7' | '30' | 'datas'

const PERIODOS: { p: Periodo; rotulo: string }[] = [
  { p: 'tudo', rotulo: 'Tudo' },
  { p: 'hoje', rotulo: 'Hoje' },
  { p: '7', rotulo: '7 dias' },
  { p: '30', rotulo: '30 dias' },
  { p: 'datas', rotulo: 'Datas…' },
]

export function TelaEntregas({ ctx, aoSair, buscaInicial }: { ctx: Contexto; aoSair: () => void; buscaInicial?: string }) {
  const { dados, ir } = ctx
  const { base, resumo } = usarBase(ctx)
  const [busca, setBusca] = useState(buscaInicial ?? '')
  const [periodo, setPeriodo] = useState<Periodo>('tudo')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [assinatura, setAssinatura] = useState<FiltroEntregas['assinatura']>('todas')
  const todas = useMemo(() => entregasDaObra(dados), [dados])

  const filtro: FiltroEntregas = { busca, assinatura }
  if (periodo === 'hoje') filtro.de = dados.hoje
  else if (periodo === '7') filtro.de = somarDias(dados.hoje, -6)
  else if (periodo === '30') filtro.de = somarDias(dados.hoje, -29)
  else if (periodo === 'datas') {
    filtro.de = de || undefined
    filtro.ate = ate || undefined
  }
  const lista = filtrarEntregas(todas, filtro)
  const pranchas = lista.reduce((n, x) => n + x.pranchas, 0)

  if (base === undefined) return <main class="tela">Carregando…</main>
  return (
    <main class="tela pj-painel">
      <CabecalhoBase ctx={ctx} aba="entregas" aoSair={aoSair} base={base} temCruzamento={!!resumo} />
      <section class="pj-bloco">
        <h2>Entregas</h2>
        {ctx.semConta ? (
          <p class="discreto">As entregas registradas no app ficam no servidor: entre com a sua conta para ver a lista.</p>
        ) : (
          <>
            <p class="discreto" data-testid="entregas-resumo">
              {todas.length === 0
                ? 'Sem entregas'
                : `${plural(lista.length, 'entrega', 'entregas')}${lista.length !== todas.length ? ` de ${todas.length}` : ''} · ${plural(pranchas, 'prancha', 'pranchas')}. Toque para abrir o comprovante.`}
            </p>
            <div class="pj-busca">
              <input type="search" aria-label="Buscar pessoa ou empresa" placeholder="Buscar pessoa ou empresa" value={busca} onInput={(e) => setBusca(e.currentTarget.value)} />
            </div>
            <div class="pj-filtros" role="group" aria-label="Período" data-testid="entregas-periodo">
              {PERIODOS.map((x) => (
                <button key={x.p} type="button" class={periodo === x.p ? 'ativa' : ''} aria-pressed={periodo === x.p} onClick={() => setPeriodo(x.p)}>
                  {x.rotulo}
                </button>
              ))}
            </div>
            {periodo === 'datas' && (
              <div class="pj-campos-2 pj-datas">
                <label>
                  De <input type="date" value={de} max={ate || undefined} onInput={(e) => setDe(e.currentTarget.value)} data-testid="entregas-de" />
                </label>
                <label>
                  Até <input type="date" value={ate} min={de || undefined} onInput={(e) => setAte(e.currentTarget.value)} data-testid="entregas-ate" />
                </label>
              </div>
            )}
            <div class="pj-filtros" role="group" aria-label="Assinatura">
              {(
                [
                  ['todas', 'Todas'],
                  ['assinadas', 'Assinadas'],
                  ['sem', 'Sem assinatura'],
                ] as const
              ).map(([v, r]) => (
                <button key={v} type="button" class={assinatura === v ? 'ativa' : ''} aria-pressed={assinatura === v} onClick={() => setAssinatura(v)}>
                  {r}
                </button>
              ))}
            </div>
            {todas.length > 0 && lista.length === 0 && <p class="discreto">Sem entregas com esse filtro</p>}
            <ul class="pj-lista-painel" data-testid="entregas-lista">
              {lista.map((x) => (
                <li key={x.chave} class="pj-linha-painel pj-tocavel pj-entrega" data-testid="entrega-linha" {...tocavel(() => ir({ nome: 'comprovante', chave: x.chave }))}>
                  <div>
                    <b>{x.colaborador || 'sem nome'}</b> <span class="discreto">· {x.empresa}</span>
                    <div class="discreto">
                      {x.assinaturaId ? dataHoraDe(x.quando) : dataBR(x.dia)} · {plural(x.pranchas, 'prancha', 'pranchas')}
                      {x.copias !== x.pranchas ? ` (${plural(x.copias, 'cópia', 'cópias')})` : ''}
                      {x.devolvidas ? ` · ${x.devolvidas} devolvida${x.devolvidas > 1 ? 's' : ''}` : ''}
                    </div>
                  </div>
                  {x.assinaturaId ? <span class="pj-selo ok">assinada</span> : <span class="pj-selo rec">sem assinatura</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  )
}

// Painel da obra (21/11/2026): a primeira tela do Projetos no app com conta. Resumo por disciplina e
// pavimento, sempre comparado com a última leitura do Autodoc. Só leitura. Ver projetos/obra.ts.
import { useEffect, useMemo } from 'preact/hooks'
import { painelObra, type Contagem, type PainelObra } from '../obra'
import type { Contexto } from './ModuloProjetos'
import { dataBR, plural, rotuloRevisao, Topo } from './comum'
import { FaixaAutodoc, usarEstadoAutodoc } from './FaixaAutodoc'
import { tocavel } from './baseComum'

const LIMITE_NOVAS = 40

export function TelaObra({ ctx, aoSair }: { ctx: Contexto; aoSair: () => void }) {
  const { dados, obra, ir, trocar, semConta } = ctx
  const estado = usarEstadoAutodoc(obra.id, !semConta)
  // sem conta não há Autodoc nem servidor: a primeira tela é o painel da base
  useEffect(() => {
    if (semConta) trocar({ nome: 'painel' })
  }, [semConta])
  const leituras = estado?.ultima ? { ultima: estado.ultima.dataLista, anterior: estado.anterior ?? null } : null
  const p = useMemo(() => painelObra(dados, leituras), [dados, leituras?.ultima, leituras?.anterior])

  if (semConta) return <main class="tela">Carregando…</main>
  const t = p.totais
  return (
    <main class="tela pj-painel" data-testid="projetos-obra">
      <Topo titulo="Projetos" sub={`${obra.codigo} · painel da obra`} aoVoltar={aoSair} />
      <FaixaAutodoc obraId={obra.id} estado={estado} />

      <ul class="pj-cartoes" aria-label="Resumo da obra" data-testid="obra-resumo">
        <li class="neutro">
          <span class="numero" data-testid="obra-vigentes">{t.vigentes}</span>
          <strong>vigentes</strong>
          <span class="discreto">{plural(p.disciplinas.length, 'disciplina', 'disciplinas')}</span>
        </li>
        <li class={t.novas ? 'atencao' : 'bom'}>
          <span class="numero" data-testid="obra-novas">{t.novas}</span>
          <strong>com revisão nova</strong>
          <span class="discreto">{textoCriterio(p)}</span>
        </li>
        <li class={t.escritorioVencida ? 'ruim' : 'bom'}>
          <span class="numero" data-testid="obra-pc-vencida">{t.escritorioVencida}</span>
          <strong>PC atrás do Autodoc</strong>
          <span class="discreto">pasta do escritório com revisão antiga</span>
        </li>
        <li class="neutro">
          <span class="numero">{t.escritorioEmDia}</span>
          <strong>PC em dia</strong>
          <span class="discreto">{t.escritorioSem ? `${t.escritorioSem} sem registro do escritório` : 'todas com registro'}</span>
        </li>
      </ul>

      <nav class="pj-menu" aria-label="Partes do módulo">
        <button type="button" onClick={() => ir({ nome: 'lista' })}>
          <strong>Lista de projetos</strong>
          <span class="discreto">todas as pranchas com a revisão vigente</span>
        </button>
        <button type="button" onClick={() => ir({ nome: 'inicio' })}>
          <strong>Cópias em campo</strong>
          <span class="discreto">recolher, conferir, empresas e entregas</span>
        </button>
        <button type="button" onClick={() => ir({ nome: 'painel' })} data-testid="obra-canteiro">
          <strong>Controle do canteiro</strong>
          <span class="discreto">a ficha de cópias × a vigente: OK, recolher, conferir; escritório; Excel ficha v2</span>
        </button>
      </nav>

      <section class="pj-bloco" data-testid="obra-disciplinas">
        <h2>Por disciplina e pavimento</h2>
        {p.disciplinas.length === 0 && (
          <p class="discreto" data-testid="obra-vazia">
            Ainda não há pranchas nesta obra. A lista vem do Autodoc pelo atalho do PC e chega aqui na sincronização.
          </p>
        )}
        {p.disciplinas.map((d) => (
          <details key={d.disciplina} class="pj-disc" open={p.disciplinas.length <= 2}>
            <summary>
              <b>{d.disciplina}</b> <Numeros c={d} />
            </summary>
            <ul class="pj-lista-painel pj-pavimentos">
              {d.pavimentos.map((pv) => (
                <li key={pv.pavimento} class="pj-linha-painel">
                  <div>
                    <b>{pv.pavimento}</b>
                    <div class="discreto">{plural(pv.vigentes, 'prancha vigente', 'pranchas vigentes')}</div>
                  </div>
                  <Numeros c={pv} curto />
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>

      {p.novas.length > 0 && (
        <section class="pj-bloco" data-testid="obra-lista-novas">
          <h2>Revisões novas ({p.novas.length})</h2>
          <ul class="pj-lista-painel">
            {p.novas.slice(0, LIMITE_NOVAS).map(({ documento: d, vigente, pavimento }) => (
              <li key={d.id} class="pj-linha-painel pj-tocavel" {...tocavel(() => ir({ nome: 'prancha', documentoId: d.id }))}>
                <div>
                  <b>{d.codigo}</b> <span class="discreto">{d.titulo}</span>
                  <div class="discreto">
                    {d.disciplina} · {pavimento} · desde {dataBR(String(vigente.vista_em))}
                  </div>
                </div>
                <span class="pj-selo conf">{rotuloRevisao(vigente)}</span>
              </li>
            ))}
          </ul>
          {p.novas.length > LIMITE_NOVAS && <p class="discreto">E mais {p.novas.length - LIMITE_NOVAS}. A lista inteira está na Lista de projetos.</p>}
        </section>
      )}
    </main>
  )
}

export function textoCriterio(p: Pick<PainelObra, 'criterio' | 'desde'>): string {
  if (p.criterio === 'leitura') return `desde a leitura de ${dataBR(p.desde)}`
  if (p.criterio === 'primeira') return 'primeira leitura do Autodoc'
  return 'últimos 7 dias'
}

function Numeros({ c, curto }: { c: Contagem; curto?: boolean }) {
  return (
    <span class="pj-contagens">
      {!curto && <span class="pj-selo rec">{plural(c.vigentes, 'vigente', 'vigentes')}</span>}
      {c.novas > 0 && <span class="pj-selo conf">{plural(c.novas, 'nova', 'novas')}</span>}
      {c.escritorioVencida > 0 && <span class="pj-selo des">{c.escritorioVencida} PC atrás</span>}
      {c.novas === 0 && c.escritorioVencida === 0 && <span class="pj-selo ok">em dia</span>}
    </span>
  )
}

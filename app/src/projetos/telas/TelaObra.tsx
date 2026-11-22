// Painel da obra (21/11/2026): a primeira tela do Projetos no app com conta. Resumo por disciplina e
// pavimento, sempre comparado com a última leitura do Autodoc. Só leitura. Ver projetos/obra.ts.
import { useEffect, useMemo, useState } from 'preact/hooks'
import { painelObra, type Contagem, type PainelObra } from '../obra'
import type { Contexto } from './ModuloProjetos'
import { dataBR, plural, rotuloRevisao, Topo } from './comum'
import { FaixaAutodoc, usarEstadoAutodoc } from './FaixaAutodoc'
import { tocavel } from './baseComum'
import { QuadroSituacao } from './QuadroSituacao'
import { usarAgora } from './TelaAgora'
import { frasesAgora } from '../agora'
import { PedidoAutodoc } from './PedidoAutodoc'
import { escritorioAtualizado, podeGerir } from '../dados'

const LIMITE_NOVAS = 40

export function TelaObra({ ctx, aoSair }: { ctx: Contexto; aoSair: () => void }) {
  const { dados, obra, ir, trocar, semConta } = ctx
  // sobe quando um pedido ao Autodoc fica pronto: relê a última lista e sincroniza
  const [versao, setVersao] = useState(0)
  const estado = usarEstadoAutodoc(obra.id, !semConta, versao)
  const { resumo, escritorio, agora, cruzadas } = usarAgora(ctx)
  // sem conta não há Autodoc nem servidor: a primeira tela é o painel da base
  useEffect(() => {
    if (semConta) trocar({ nome: 'painel' })
  }, [semConta])
  const leituras = estado?.ultima ? { ultima: estado.ultima.dataLista, anterior: estado.anterior ?? null } : null
  const p = useMemo(() => painelObra(dados, leituras), [dados, leituras?.ultima, leituras?.anterior])

  if (semConta) return <main class="tela">Carregando…</main>
  const t = p.totais
  // cada número abre a lista de projetos só com aquelas pranchas (item D)
  const comVigente = dados.documentos.filter((d) => dados.vigentes.has(d.id))
  const abrirLista = (titulo: string, ids: string[]) => ir({ nome: 'lista', titulo, ids })
  const doEscritorio = (v: boolean) => comVigente.filter((d) => escritorioAtualizado(dados, d.id) === v).map((d) => d.id)
  // os selos de cada disciplina e pavimento também abrem a lista (achado do testador, 22/11)
  const idsNovas = new Set(p.novas.map((n) => n.documento.id))
  const abrirParte = (onde: string, ids: string[], qual: Selo) => {
    if (qual === 'vigentes') abrirLista(`${onde} · vigentes`, ids)
    else if (qual === 'novas') abrirLista(`${onde} · com revisão nova`, ids.filter((id) => idsNovas.has(id)))
    else abrirLista(`${onde} · PC atrás do Autodoc`, ids.filter((id) => escritorioAtualizado(dados, id) === false))
  }
  return (
    <main class="tela pj-painel" data-testid="projetos-obra">
      <Topo titulo="Projetos" sub={`${obra.codigo} · painel da obra`} aoVoltar={aoSair} />
      {/* o quadro vem logo abaixo do título, antes do Autodoc e dos números (testador, 22/11: em 375 px ficava no fim da 1ª tela) */}
      {cruzadas && <QuadroSituacao cruzadas={cruzadas} ir={ir} documentos={dados.documentos} />}
      <FaixaAutodoc obraId={obra.id} estado={estado} />
      {podeGerir(obra.papel) && (
        <PedidoAutodoc
          obraId={obra.id}
          aoPronto={() => {
            setVersao((v) => v + 1)
            ctx.sincronizar()
          }}
          depois={agora ? { texto: frasesAgora(agora), abrir: () => ir({ nome: 'agora' }) } : undefined}
        />
      )}

      <ul class="pj-cartoes" aria-label="Resumo da obra" data-testid="obra-resumo">
        <li class="neutro pj-tocavel" {...tocavel(() => abrirLista('vigentes', comVigente.map((d) => d.id)))}>
          <span class="numero" data-testid="obra-vigentes">{t.vigentes}</span>
          <strong>vigentes</strong>
          <span class="discreto">{plural(p.disciplinas.length, 'disciplina', 'disciplinas')}</span>
        </li>
        <li class={`${t.novas ? 'atencao' : 'bom'} pj-tocavel`} data-testid="obra-cartao-novas" {...tocavel(() => abrirLista('com revisão nova', p.novas.map((n) => n.documento.id)))}>
          <span class="numero" data-testid="obra-novas">{t.novas}</span>
          <strong>com revisão nova</strong>
          <span class="discreto">{textoCriterio(p)}</span>
        </li>
        <li class={`${t.escritorioVencida ? 'ruim' : 'bom'} pj-tocavel`} {...tocavel(() => abrirLista('PC atrás do Autodoc', doEscritorio(false)))}>
          <span class="numero" data-testid="obra-pc-vencida">{t.escritorioVencida}</span>
          <strong>PC atrás do Autodoc</strong>
          <span class="discreto">pasta do escritório com revisão antiga</span>
        </li>
        <li class="neutro pj-tocavel" {...tocavel(() => abrirLista('PC em dia', doEscritorio(true)))}>
          <span class="numero">{t.escritorioEmDia}</span>
          <strong>PC em dia</strong>
          <span class="discreto">{t.escritorioSem ? `${t.escritorioSem} sem registro do escritório` : 'todas com registro'}</span>
        </li>
      </ul>

      <section class="pj-bloco" data-testid="obra-canteiro-resumo">
        <h2>No canteiro</h2>
        {!resumo ? (
          <p class="discreto">
            Ainda sem a ficha de cópias neste aparelho. Importe em Controle do canteiro → Importar para ver o que está em campo e o que precisa trocar.
          </p>
        ) : (
          <ul class="pj-cartoes" aria-label="Cópias no canteiro">
            <li class="neutro pj-tocavel" {...tocavel(() => ir({ nome: 'pranchas-base', filtro: 'canteiro' }))}>
              <span class="numero" data-testid="obra-em-campo">{resumo.emCampo}</span>
              <strong>cópias em campo</strong>
              <span class="discreto">{plural(resumo.emDia, 'em dia', 'em dia')}</span>
            </li>
            <li class={resumo.desatualizadas.length ? 'ruim pj-tocavel' : 'bom pj-tocavel'} {...tocavel(() => ir({ nome: 'pranchas-base', filtro: 'trocar' }))}>
              <span class="numero" data-testid="obra-trocar">{resumo.desatualizadas.length}</span>
              <strong>precisam trocar</strong>
              <span class="discreto">cópia em campo com revisão antiga</span>
            </li>
            <li class={resumo.conferir.length ? 'atencao pj-tocavel' : 'bom pj-tocavel'} data-testid="obra-cartao-conferir" {...tocavel(() => ir({ nome: 'entregas-base', filtro: 'conferir' }))}>
              <span class="numero">{resumo.conferir.length}</span>
              <strong>conferir</strong>
              <span class="discreto">o app não decidiu sozinho</span>
            </li>
            {agora && (
              <li class={`${agora.copias ? 'ruim' : 'bom'} pj-tocavel`} {...tocavel(() => ir({ nome: 'agora' }))}>
                <span class="numero" data-testid="obra-a-plotar">{agora.copias}</span>
                <strong>a plotar</strong>
                <span class="discreto">{agora.copias ? `${agora.folhas} ${agora.folhas === 1 ? 'folha' : 'folhas'} para a lista de distribuição` : 'todos da lista com a vigente'}</span>
              </li>
            )}
            {agora && (
              <li class={`${agora.recolher.length ? 'ruim' : 'bom'} pj-tocavel`} {...tocavel(() => ir({ nome: 'agora' }))}>
                <span class="numero" data-testid="obra-a-recolher">{agora.recolher.length}</span>
                <strong>a recolher</strong>
                <span class="discreto">cópia antiga em campo</span>
              </li>
            )}
            {escritorio && (
              <li class={escritorio.desatualizados.length ? 'ruim pj-tocavel' : 'bom pj-tocavel'} {...tocavel(() => ir({ nome: 'pranchas-base', filtro: 'escritorio' }))}>
                <span class="numero">{escritorio.desatualizados.length}</span>
                <strong>escritório desatualizado</strong>
                <span class="discreto">pasta do PC atrás da vigente</span>
              </li>
            )}
          </ul>
        )}
      </section>

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
              <b>{d.disciplina}</b> <Numeros c={d} abrir={(q) => abrirParte(d.disciplina, d.pavimentos.flatMap((pv) => pv.documentos.map((x) => x.id)), q)} />
            </summary>
            <ul class="pj-lista-painel pj-pavimentos">
              {d.pavimentos.map((pv) => (
                <li key={pv.pavimento} class="pj-linha-painel pj-tocavel" {...tocavel(() => abrirLista(`${d.disciplina} · ${pv.pavimento}`, pv.documentos.map((x) => x.id)))}>
                  <div>
                    <b>{pv.pavimento}</b>
                    <div class="discreto">{plural(pv.vigentes, 'prancha vigente', 'pranchas vigentes')}</div>
                  </div>
                  <Numeros c={pv} curto abrir={(q) => abrirParte(`${d.disciplina} · ${pv.pavimento}`, pv.documentos.map((x) => x.id), q)} />
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

type Selo = 'vigentes' | 'novas' | 'pc'

function Numeros({ c, curto, abrir }: { c: Contagem; curto?: boolean; abrir: (qual: Selo) => void }) {
  // botão dentro do resumo (summary) ou da linha tocável: abre a lista sem abrir/fechar a disciplina
  const selo = (qual: Selo, classe: string, texto: string) => (
    <button
      type="button"
      class={`pj-selo ${classe} pj-selo-botao`}
      data-testid={`obra-selo-${qual}`}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        abrir(qual)
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {texto}
    </button>
  )
  return (
    <span class="pj-contagens">
      {!curto && selo('vigentes', 'rec', plural(c.vigentes, 'vigente', 'vigentes'))}
      {c.novas > 0 && selo('novas', 'conf', plural(c.novas, 'nova', 'novas'))}
      {c.escritorioVencida > 0 && selo('pc', 'des', `${c.escritorioVencida} PC atrás`)}
      {c.novas === 0 && c.escritorioVencida === 0 && <span class="pj-selo ok">em dia</span>}
    </span>
  )
}

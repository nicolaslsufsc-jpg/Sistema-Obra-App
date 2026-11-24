// Painel da obra (21/11/2026): a primeira tela do Projetos no app com conta. Resumo por disciplina e
// pavimento, sempre comparado com a última leitura do Autodoc. Só leitura. Ver projetos/obra.ts.
import { useEffect, useMemo, useState } from 'preact/hooks'
import { campoPorDocumento, painelObra, type Contagem, type PainelObra } from '../obra'
import { documentosPorFolha } from '../canteiro'
import type { Contexto } from './ModuloProjetos'
import { dataBR, plural, rotuloRevisao, Topo } from './comum'
import { FaixaAutodoc, usarEstadoAutodoc } from './FaixaAutodoc'
import { tocavel } from './baseComum'
import { QuadroSituacao } from './QuadroSituacao'
import { usarAgora } from './TelaAgora'
import { frasesAgora } from '../agora'
import { PedidoAutodoc } from './PedidoAutodoc'
import { escritorioAtualizado, podeGerir, podeRegistrar } from '../dados'
import { LinhaResumo, Tabela, type Status } from '../../telas/Tabela'
import { COLUNAS_RESUMO, type LinhaResumoObra } from './comum'
import { Ajuda } from '../../telas/Ajuda'

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
  // as cópias em campo entram em cada disciplina e pavimento pela mesma regra do quadro (testador, 23/11: o
  // bloco dizia "em dia" com 319 a trocar no quadro)
  const campo = useMemo(() => (cruzadas ? campoPorDocumento(cruzadas, documentosPorFolha(dados)) : undefined), [cruzadas, dados])
  const p = useMemo(() => painelObra(dados, leituras, campo), [dados, leituras?.ultima, leituras?.anterior, campo])

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
    else if (qual === 'trocar') abrirLista(`${onde} · cópia a trocar`, ids.filter((id) => (campo?.get(id)?.trocar ?? 0) > 0))
    else if (qual === 'conferir') abrirLista(`${onde} · cópia a conferir`, ids.filter((id) => (campo?.get(id)?.conferir ?? 0) > 0))
    else abrirLista(`${onde} · cópia desatualizada no escritório`, ids.filter((id) => escritorioAtualizado(dados, id) === false))
  }
  const linhasObra: LinhaResumoObra[] = [
    { id: 'vigentes', rotulo: 'Vigentes', testid: 'obra-vigentes', n: t.vigentes, nota: plural(p.disciplinas.length, 'disciplina', 'disciplinas'), status: 'liberado', abrir: () => abrirLista('vigentes', comVigente.map((d) => d.id)) },
    { id: 'novas', rotulo: 'Com revisão nova', testid: 'obra-novas', testidRotulo: 'obra-cartao-novas', n: t.novas, nota: textoCriterio(p), status: t.novas ? 'pendente' : 'liberado', abrir: () => abrirLista('com revisão nova', p.novas.map((n) => n.documento.id)) },
    { id: 'pc', rotulo: 'Cópia desatualizada no escritório', testid: 'obra-pc-vencida', n: t.escritorioVencida, nota: 'pasta do PC com revisão antiga', status: t.escritorioVencida ? 'nc' : 'liberado', abrir: () => abrirLista('cópia desatualizada no escritório', doEscritorio(false)) },
    { id: 'pc-em-dia', rotulo: 'Escritório em dia', n: t.escritorioEmDia, nota: t.escritorioSem ? `${t.escritorioSem} sem registro do escritório` : 'todas com registro', status: 'liberado', abrir: () => abrirLista('escritório em dia', doEscritorio(true)) },
  ]
  const linhasCanteiro: LinhaResumoObra[] = resumo
    ? [
        { id: 'em-campo', rotulo: 'Cópias em campo', testid: 'obra-em-campo', n: resumo.emCampo, nota: plural(resumo.emDia, 'em dia', 'em dia'), status: 'liberado', abrir: () => ir({ nome: 'pranchas-base', filtro: 'canteiro' }) },
        { id: 'trocar', rotulo: 'Precisam trocar', testid: 'obra-trocar', n: resumo.desatualizadas.length, nota: 'cópia em campo com revisão antiga', status: resumo.desatualizadas.length ? 'nc' : 'liberado', abrir: () => ir({ nome: 'pranchas-base', filtro: 'trocar' }) },
        { id: 'conferir', rotulo: 'Conferir', testidRotulo: 'obra-cartao-conferir', n: resumo.conferir.length, nota: 'o app não decidiu sozinho', status: resumo.conferir.length ? 'pendente' : 'liberado', abrir: () => ir({ nome: 'entregas-base', filtro: 'conferir' }) },
        ...(agora
          ? [
              { id: 'plotar', rotulo: 'A plotar', testid: 'obra-a-plotar', n: agora.copias, nota: agora.copias ? `${agora.folhas} ${agora.folhas === 1 ? 'folha' : 'folhas'} para a lista de distribuição` : 'todos da lista com a vigente', status: (agora.copias ? 'nc' : 'liberado') as Status, abrir: () => ir({ nome: 'agora' }) },
              { id: 'recolher', rotulo: 'A recolher', testid: 'obra-a-recolher', n: agora.recolher.length, nota: 'cópia antiga em campo', status: (agora.recolher.length ? 'nc' : 'liberado') as Status, abrir: () => ir({ nome: 'agora' }) },
            ]
          : []),
        ...(escritorio
          ? [{ id: 'escritorio', rotulo: 'Escritório desatualizado', n: escritorio.desatualizados.length, nota: 'pasta do PC sem a vigente', status: (escritorio.desatualizados.length ? 'nc' : 'liberado') as Status, abrir: () => ir({ nome: 'pranchas-base', filtro: 'escritorio' }) }]
          : []),
      ]
    : []
  return (
    <main class="tela pj-painel" data-testid="projetos-obra">
      <Topo titulo="Projetos" sub={`${obra.codigo} · painel da obra`} aoVoltar={aoSair} />
      {/* registrar a entrega de uma cópia física: o caminho curto, logo abaixo do título (Nicolas, 22/11) */}
      {podeRegistrar(obra.papel) && (
        <button type="button" class="principal pj-entregar-topo" data-testid="obra-entregar" onClick={() => ir({ nome: 'entregar-copia' })}>
          Entregar cópia
          <span>escolher a prancha, para quem, quantas cópias e a assinatura</span>
        </button>
      )}
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

      {/* resumo numa linha e tabela (guia de estilo, 23/11/2026): cada linha abre a lista dela (item D) */}
      <LinhaResumo
        testid="obra-linha-resumo"
        partes={[
          plural(t.vigentes, 'vigente', 'vigentes'),
          `${t.novas} com revisão nova`,
          t.escritorioVencida ? plural(t.escritorioVencida, 'cópia desatualizada no escritório', 'cópias desatualizadas no escritório') : null,
          resumo ? `${resumo.desatualizadas.length} a trocar em campo` : null,
        ]}
      />
      <Tabela
        rotulo="Resumo da obra"
        testid="obra-resumo"
        colunas={COLUNAS_RESUMO}
        linhas={linhasObra}
        chave={(l) => l.id}
        aoTocar={(l) => l.abrir()}
      />

      <section class="pj-bloco" data-testid="obra-canteiro-resumo">
        <h2>No canteiro</h2>
        {!resumo ? (
          <p class="discreto so-com-ajuda">
            Sem ficha de cópias
            <Ajuda>Importe em Controle do canteiro › Importar para ver o que está em campo e o que precisa trocar.</Ajuda>
          </p>
        ) : (
          <Tabela rotulo="Cópias no canteiro" colunas={COLUNAS_RESUMO} linhas={linhasCanteiro} chave={(l) => l.id} aoTocar={(l) => l.abrir()} />
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
        <button type="button" onClick={() => ir({ nome: 'entregas-lista' })} data-testid="obra-entregas">
          <strong>Entregas</strong>
          <span class="discreto">quem levou o quê e quando, com o comprovante assinado</span>
        </button>
        <button type="button" onClick={() => ir({ nome: 'painel' })} data-testid="obra-canteiro">
          <strong>Controle do canteiro</strong>
          <span class="discreto">a ficha de cópias × a vigente: OK, recolher, conferir; escritório; Excel ficha v2</span>
        </button>
      </nav>

      <section class="pj-bloco" data-testid="obra-disciplinas">
        <h2>Por disciplina e pavimento</h2>
        {p.disciplinas.length === 0 && (
          <p class="discreto so-com-ajuda" data-testid="obra-vazia">
            Sem pranchas
            <Ajuda>A lista vem do Autodoc pelo atalho do PC e chega aqui na sincronização.</Ajuda>
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

type Selo = 'vigentes' | 'novas' | 'pc' | 'trocar' | 'conferir'

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
      {c.trocar > 0 && selo('trocar', 'des', `${c.trocar} a trocar`)}
      {c.conferir > 0 && selo('conferir', 'conf', `${c.conferir} conferir`)}
      {c.novas > 0 && selo('novas', 'conf', plural(c.novas, 'nova', 'novas'))}
      {c.escritorioVencida > 0 && selo('pc', 'des', `${c.escritorioVencida} desatualizada${c.escritorioVencida > 1 ? 's' : ''} no PC`)}
      {c.novas === 0 && c.escritorioVencida === 0 && c.trocar === 0 && c.conferir === 0 && <span class="pj-selo ok">em dia</span>}
    </span>
  )
}

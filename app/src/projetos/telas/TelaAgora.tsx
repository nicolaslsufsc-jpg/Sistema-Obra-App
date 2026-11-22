// "O que fazer agora" (21/11/2026, item C das 5 listas): plotar N de cada folha para quem a lista de
// distribuição manda, e recolher toda cópia em campo que não é mais a vigente. Cada linha abre onde se
// registra: a entrega com assinatura (com conta, quando a folha está no servidor) ou a prancha da base
// (devolução e correções). Ver projetos/agora.ts.
import { useMemo } from 'preact/hooks'
import { frasesAgora, oQueFazerAgora, type APlotar } from '../agora'
import { documentosPorFolha } from '../canteiro'
import { chaveFolha } from '../edicoes'
import { normalizar, rotuloRev } from '../painel'
import type { Contexto } from './ModuloProjetos'
import { CabecalhoBase, tocavel, usarBase } from './baseComum'
import { plural } from './comum'
import { alvoDaFolha, alvoDe, ondeDaCopia } from './TelaPranchaBase'
import { BotaoExportarPdf } from '../../telas/ExportarPdf'
import type { FolhaPdf } from '../../telas/folha_pdf'

const pessoa = (empresa: string, colaborador: string) => (colaborador ? `${empresa} · ${colaborador}` : `${empresa} (qualquer pessoa)`)

/** O "O que fazer agora" da obra (para o painel, o painel da obra e o fim do pedido ao Autodoc). */
export function usarAgora(ctx: Contexto) {
  const b = usarBase(ctx)
  const agora = useMemo(() => (b.pendentes && b.cruzadas ? oQueFazerAgora(b.pendentes, b.cruzadas) : null), [b.pendentes, b.cruzadas])
  return { ...b, agora }
}

export function TelaAgora({ ctx, aoSair }: { ctx: Contexto; aoSair: () => void }) {
  const { ir, obra, usuario, dados, semConta } = ctx
  const { base, resumo, regras, agora } = usarAgora(ctx)
  const porFolha = useMemo(() => documentosPorFolha(dados), [dados])
  if (base === undefined) return <main class="tela">Carregando…</main>

  const empresaId = (nome: string) => dados.empresas.find((e) => e.ativa && normalizar(e.nome) === normalizar(nome))?.id
  const abrirPlotar = (p: APlotar) => {
    const doc = semConta ? undefined : porFolha.get(chaveFolha(p.vigente))
    if (doc) ir({ nome: 'entregar', documentoId: doc, empresaId: empresaId(p.empresa) })
    else ir({ nome: 'prancha-base', ...alvoDaFolha(p.vigente) })
  }
  const temLista = regras.some((r) => r.ativo)

  const folha = (): FolhaPdf => ({
    modulo: 'Projetos',
    titulo: 'O que fazer agora',
    resumo: agora ? [frasesAgora(agora), plural(agora.folhas, 'folha a plotar', 'folhas a plotar')] : [],
    tabelas: [
      {
        titulo: 'Plotar e entregar',
        colunas: ['Folha', 'Revisão', 'Cópias', 'Para', 'Recolher na entrega'],
        curtas: [1, 2],
        linhas: (agora?.plotar ?? []).map((p) => [
          `${p.vigente.codigo} ${p.vigente.titulo}`,
          rotuloRev(p.vigente.fase, p.vigente.revisao),
          p.copias,
          pessoa(p.empresa, p.colaborador),
          p.devolver.map((x) => rotuloRev(x.copia.fase, x.copia.revisao)).join(', '),
        ]),
        vazio: temLista ? 'Nada a plotar.' : 'Sem lista de distribuição.',
      },
      {
        titulo: 'Recolher',
        colunas: ['Folha', 'Em campo', 'Vigente', 'De quem', 'Onde'],
        curtas: [1, 2, 4],
        linhas: (agora?.recolher ?? []).map(({ x, vigente }) => [
          `${vigente.codigo} ${vigente.titulo}`,
          rotuloRev(x.copia.fase, x.copia.revisao),
          rotuloRev(vigente.fase, vigente.revisao),
          pessoa(x.copia.empresa, x.copia.colaborador),
          ondeDaCopia(x.copia),
        ]),
        vazio: 'Nada a recolher.',
      },
    ],
  })

  return (
    <main class="tela pj-painel">
      <CabecalhoBase ctx={ctx} aba="agora" aoSair={aoSair} base={base} temCruzamento={!!resumo} />
      <section class="pj-bloco">
        <h2>O que fazer agora</h2>
        {!agora ? (
          <p class="discreto">Falta a ficha de cópias ou a lista vigente.</p>
        ) : (
          <>
            <p data-testid="agora-resumo">
              <b>{frasesAgora(agora)}</b>
              {agora.copias > 0 ? ` · ${plural(agora.folhas, 'folha', 'folhas')} no plotter` : ''}
            </p>
            {!temLista && (
              <p class="discreto" data-testid="agora-sem-lista">
                Sem lista de distribuição, só aparece o que recolher.{' '}
                <button type="button" class="pj-pequeno secundario" onClick={() => ctx.trocar({ nome: 'distribuicao' })}>
                  Montar a lista
                </button>
              </p>
            )}
            <div class="acoes">
              <BotaoExportarPdf obra={obra} usuario={usuario} montar={folha} testid="agora-pdf" desativado={!agora.plotar.length && !agora.recolher.length} />
            </div>
          </>
        )}
      </section>

      {agora && agora.plotar.length > 0 && (
        <section class="pj-bloco" data-testid="agora-plotar">
          <h2>
            Plotar e entregar <span class="pj-selo conf">{plural(agora.copias, 'cópia', 'cópias')}</span>
          </h2>
          <ul class="pj-lista-painel">
            {agora.plotar.map((p) => (
              <li key={`${p.vigente.codigo}|${p.empresa}|${p.colaborador}`} class="pj-linha-painel pj-tocavel" data-testid="agora-plotar-linha" {...tocavel(() => abrirPlotar(p))}>
                <div>
                  <b>
                    Plotar {p.copias} de {p.vigente.codigo}
                  </b>{' '}
                  <span class="pj-rev nova">{rotuloRev(p.vigente.fase, p.vigente.revisao)}</span>
                  <div class="discreto">
                    para <b>{pessoa(p.empresa, p.colaborador)}</b>
                    {p.devolver.length ? ` · recolher ${p.devolver.map((x) => rotuloRev(x.copia.fase, x.copia.revisao)).join(', ')} na entrega` : ''}
                  </div>
                </div>
                <span class={`pj-selo ${p.motivo === 'trocar' ? 'des' : 'conf'}`}>{p.motivo === 'trocar' ? 'trocar' : 'nova'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {agora && agora.recolher.length > 0 && (
        <section class="pj-bloco" data-testid="agora-recolher">
          <h2>
            Recolher <span class="pj-selo des">{agora.recolher.length}</span>
          </h2>
          <ul class="pj-lista-painel">
            {agora.recolher.map(({ x, vigente }) => (
              <li key={x.copia.linha} class="pj-linha-painel pj-tocavel" data-testid="agora-recolher-linha" {...tocavel(() => ir({ nome: 'prancha-base', ...alvoDe(x) }))}>
                <div>
                  <b>
                    Recolher {vigente.codigo} <span class="pj-rev velha">{rotuloRev(x.copia.fase, x.copia.revisao)}</span>
                  </b>
                  <div class="discreto">
                    de <b>{pessoa(x.copia.empresa, x.copia.colaborador)}</b> · vigente {rotuloRev(vigente.fase, vigente.revisao)} · {ondeDaCopia(x.copia)}
                  </div>
                </div>
                <div class={`pj-dias${(x.dias ?? 0) <= 15 ? ' leve' : ''}`}>{x.dias ?? '?'} d</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

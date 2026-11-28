import { useState } from 'preact/hooks'
import { csvPorCaminhao, legendaDoRelatorio, percentual, relatorioPorCaminhao, relatorioPorPeca, type PecaRelatorio } from '../relatorio'
import type { Contexto } from './ModuloConcreto'
import { caminhoesComLajeDesenhada } from '../dados'
import { sistemaDaObra } from '../../integracoes/sistema_oficial'
import { corDoCaminhao, dataBR, numBR, plural, Topo } from './comum'
import { nomeDaConcretagem } from '../exemplo'
import { BotaoExportarPdf, quemGera } from '../../telas/ExportarPdf'
import { ehLajeDeTrecho } from '../lajes'
import { figuraDoDesenho, type FiguraDoDesenho } from '../pdf_desenho'
import { carregarPlantas, idDaRef } from '../planta'
import { ehFundacao } from '../tipos_peca'
import { RelatorioComDesenho } from './DesenhoPdf'
import type { FolhaPdf } from '../../telas/folha_pdf'

export function TelaRelatorio({ ctx, concretagemRaiz }: { ctx: Contexto; concretagemRaiz: string }) {
  const { dados, voltar } = ctx
  const sistema = sistemaDaObra(ctx.obra)?.nome ?? null
  const [modo, setModo] = useState<'caminhao' | 'peca'>('caminhao')
  const [copiado, setCopiado] = useState('')
  const c = dados.concretagens.find((x) => x.raiz === concretagemRaiz)
  if (!c) {
    return (
      <main class="tela">
        <Topo titulo="Relatório" aoVoltar={voltar} />
        <p>Esta concretagem foi apagada.</p>
      </main>
    )
  }
  const pav = dados.pavimentos.find((p) => p.id === c.pavimento_id)
  const cams = dados.caminhoesDe.get(c.raiz) ?? []
  const pecas = new Map<string, PecaRelatorio>([...dados.pecaPorId.values()].map((p) => [p.id, { id: p.id, nome: p.nome, tipo: p.tipo }]))
  const porCaminhao = relatorioPorCaminhao(cams, dados.pecasDe, pecas, dados.lajesFvsDe, caminhoesComLajeDesenhada(dados))
  const porPeca = relatorioPorPeca(porCaminhao)
  const legenda = legendaDoRelatorio(porCaminhao)
  const volume = cams.reduce((s, x) => s + (x.volume_m3 ?? 0), 0)
  const nomeArquivo = `${c.data}_concreto_${(pav?.nome ?? 'pavimento').replace(/[^\p{L}\p{N}]+/gu, '-')}.csv`

  const baixar = () => {
    const blob = new Blob([csvPorCaminhao(c, porCaminhao, sistema)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nomeArquivo
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  // as duas tabelas (por caminhão e por peça) numa folha A4 (21/11/2026; antes era o Imprimir da tela)
  const nomesDasPecas = (l: (typeof porCaminhao)[number]) =>
    l.pecas.length === 0 ? 'sem peça desenhada' : l.pecas.map((i) => `${i.peca.nome}${i.parcial ? ` (${percentual(i.fracao)})` : ''}`).join(', ')
  const folha = (): FolhaPdf => ({
    modulo: 'Concreto',
    titulo: `Peças concretadas · ${pav?.nome ?? ''}`,
    sub: `${dataBR(c.data)} · ${nomeDaConcretagem(c)} · fck ${numBR(c.fck_mpa)} MPa${c.codigo_construpoint && sistema ? ` · ${c.codigo_construpoint}` : ''}`,
    resumo: [plural(cams.length, 'caminhão', 'caminhões'), `${numBR(volume)} m³`, plural(porPeca.length, 'peça', 'peças')],
    tabelas: [
      {
        titulo: 'Por caminhão',
        colunas: ['Caminhão', 'NF', 'm³', 'Peças'],
        curtas: [0, 1, 2],
        linhas: porCaminhao.map((l) => [l.caminhao.sequencia, l.caminhao.nota_fiscal, numBR(l.caminhao.volume_m3, 2), nomesDasPecas(l)]),
        vazio: 'Sem caminhões',
      },
      {
        titulo: 'Por peça',
        colunas: ['Peça', 'Caminhões (NF)'],
        curtas: [0],
        linhas: porPeca.map((l) => [l.peca.nome, l.caminhoes.map((x) => `${x.caminhao.sequencia} (NF ${x.caminhao.nota_fiscal || '—'}${x.parcial ? `, ${percentual(x.fracao)}` : ''})`).join(', ')]),
        vazio: 'Sem peças desenhadas',
        // uma frase por linha (a quebra vale dentro de .cc-pdf, concreto.css)
        nota: legenda.join('\n') || undefined,
      },
    ],
  })
  // O PDF (26/11): antes das tabelas, uma página por trecho com o desenho de onde foi cada caminhão
  // (áreas unidas por caminhão, com o número). Sem área desenhada, saem só as tabelas, como antes.
  const montarPdf = async (): Promise<FolhaPdf> => {
    const padrao = folha()
    const figuras: FiguraDoDesenho[] = []
    if (pav) {
      const pecasDaPlanta = (dados.pecasDoPavimento.get(pav.id) ?? []).filter((p) => !ehLajeDeTrecho(p) && !ehFundacao(p.tipo))
      const plantas = await carregarPlantas({ obraId: ctx.obra.id, obraCodigo: ctx.obra.codigo, pavimento: pav, pecas: pecasDaPlanta })
      const chaveDe = dados.chavePlanta ?? ((id: string) => id)
      for (const pl of plantas) {
        const f = figuraDoDesenho(
          pl,
          cams.map((x) => ({
            sequencia: x.sequencia,
            cor: corDoCaminhao(x.sequencia),
            areas: (dados.areasDe.get(x.raiz) ?? []).filter((a) => chaveDe(idDaRef(a.planta_ref)) === chaveDe(pl.id)),
          })),
        )
        if (f) figuras.push(f)
      }
      // o fundo da planta são imagens: carregadas antes, para já estarem prontas quando o Imprimir abrir
      await Promise.all(
        figuras.flatMap((f) =>
          f.ladrilhos.map(
            (l) =>
              new Promise<void>((ok) => {
                const im = new Image()
                im.onload = im.onerror = () => ok()
                im.src = l.url
              }),
          ),
        ),
      )
    }
    const quando = new Date()
    const quem = await quemGera(ctx.usuario)
    return {
      ...padrao,
      propria: (
        <RelatorioComDesenho
          folha={padrao}
          figuras={figuras}
          legenda={cams.map((x) => ({
            sequencia: x.sequencia,
            cor: corDoCaminhao(x.sequencia),
            texto: `Caminhão ${x.sequencia} · NF ${x.nota_fiscal || '—'}${x.volume_m3 !== null ? ` · ${numBR(x.volume_m3, 2)} m³` : ''}`,
          }))}
          obra={ctx.obra}
          quem={quem}
          quando={quando}
        />
      ),
    }
  }
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(csvPorCaminhao(c, porCaminhao, sistema).replace('﻿', '').replace(/;/g, '\t'))
      setCopiado('Copiado. Cole no Excel.')
    } catch {
      setCopiado('Não deu para copiar neste aparelho. Use "Baixar CSV".')
    }
  }

  return (
    <main class="tela cc-relatorio">
      <Topo titulo="Peças concretadas" sub={`${pav?.nome ?? ''} · ${dataBR(c.data)} · ${nomeDaConcretagem(c)}`} aoVoltar={voltar} />
      <p class="cc-impressao">
        <strong>
          {pav?.nome} · {dataBR(c.data)} · {nomeDaConcretagem(c)}
        </strong>{' '}
        · fck {numBR(c.fck_mpa)} MPa · {plural(cams.length, 'caminhão', 'caminhões')} · {numBR(volume)} m³
        {c.codigo_construpoint ? ` · ${c.codigo_construpoint}` : ''}
      </p>

      <div class="acoes nao-imprimir">
        <div class="cc-seg" role="tablist">
          <button type="button" role="tab" aria-selected={modo === 'caminhao'} class={modo === 'caminhao' ? 'on' : ''} onClick={() => setModo('caminhao')}>
            Por caminhão
          </button>
          <button type="button" role="tab" aria-selected={modo === 'peca'} class={modo === 'peca' ? 'on' : ''} onClick={() => setModo('peca')}>
            Por peça
          </button>
        </div>
        <button type="button" onClick={baixar}>
          Baixar CSV
        </button>
        <button type="button" onClick={copiar}>
          Copiar para o Excel
        </button>
        <BotaoExportarPdf obra={ctx.obra} usuario={ctx.usuario} montar={montarPdf} testid="concreto-pdf-relatorio" />
      </div>
      {copiado && <p class="aviso nao-imprimir">{copiado}</p>}

      {modo === 'caminhao' ? (
        <table class="cc-tabela" data-testid="relatorio-caminhao">
          <thead>
            <tr>
              <th>Caminhão</th>
              <th>NF</th>
              <th>m³</th>
              <th>Peças</th>
            </tr>
          </thead>
          <tbody>
            {porCaminhao.map((l) => (
              <tr key={l.caminhao.raiz}>
                <td>
                  <span class="cc-bolinha" style={{ background: corDoCaminhao(l.caminhao.sequencia) }}>
                    {l.caminhao.sequencia}
                  </span>
                </td>
                <td>{l.caminhao.nota_fiscal || '—'}</td>
                <td>{numBR(l.caminhao.volume_m3, 2)}</td>
                <td>
                  {l.pecas.length === 0 ? (
                    <span class="aviso">sem peça desenhada</span>
                  ) : (
                    l.pecas.map((i, k) => (
                      <span key={i.peca.id} class={i.parcial ? 'cc-parcial' : ''}>
                        {k > 0 ? ', ' : ''}
                        {i.peca.nome}
                        {i.parcial ? ` (${percentual(i.fracao)})` : ''}
                      </span>
                    ))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table class="cc-tabela" data-testid="relatorio-peca">
          <thead>
            <tr>
              <th>Peça</th>
              <th>Caminhões</th>
            </tr>
          </thead>
          <tbody>
            {porPeca.length === 0 && (
              <tr>
                <td colSpan={2} class="discreto">
                  Nenhuma peça ainda. Abra "Desenhar na planta" na concretagem.
                </td>
              </tr>
            )}
            {porPeca.map((l) => (
              <tr key={l.peca.id}>
                <td>
                  <strong>{l.peca.nome}</strong>
                </td>
                <td>
                  {l.caminhoes.map((x, k) => (
                    <span key={x.caminhao.raiz} class={x.parcial ? 'cc-parcial' : ''}>
                      {k > 0 ? ', ' : ''}
                      {x.caminhao.sequencia} (NF {x.caminhao.nota_fiscal || '—'}
                      {x.parcial ? `, ${percentual(x.fracao)}` : ''})
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {legenda.length > 0 && (
        <ul class="cc-legenda-relatorio discreto" data-testid="legenda-relatorio">
          {legenda.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
    </main>
  )
}

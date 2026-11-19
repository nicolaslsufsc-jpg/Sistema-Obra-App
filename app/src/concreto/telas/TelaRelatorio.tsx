import { useState } from 'preact/hooks'
import { csvPorCaminhao, percentual, relatorioPorCaminhao, relatorioPorPeca, type PecaRelatorio } from '../relatorio'
import type { Contexto } from './ModuloConcreto'
import { sistemaDaObra } from '../../integracoes/sistema_oficial'
import { corDoCaminhao, dataBR, numBR, plural, Topo } from './comum'
import { nomeDaConcretagem } from '../exemplo'

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
  const porCaminhao = relatorioPorCaminhao(cams, dados.pecasDe, pecas)
  const porPeca = relatorioPorPeca(porCaminhao)
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
        <button type="button" onClick={() => window.print()}>
          Imprimir
        </button>
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
      <p class="discreto">Parcial: a área desenhada cobre menos de 90% da peça. Confira se outro caminhão completou a peça.</p>
    </main>
  )
}

// Comprovante de uma entrega assinada (21/11/2026): quem retirou, data e hora, as pranchas e a assinatura.
// Abre depois de registrar a entrega, pelo "assinada" na prancha e pela aba Entregas (23/11), que abre também
// as entregas sem assinatura (agrupadas por empresa, pessoa e dia). O PDF sai pelo Exportar PDF.
import { useEffect, useState } from 'preact/hooks'
import { dataHoraDe, entregaDaAssinatura, folhaDoComprovante, imagemDaAssinatura } from '../assinatura'
import { BotaoExportarPdf } from '../../telas/ExportarPdf'
import type { Contexto } from './ModuloProjetos'
import { dataBR, rotuloRevisao, Topo } from './comum'
import { sincronizador } from '../../nucleo/servicos'
import { disciplinasDaFicha, linhasDaFicha, modeloDasLinhas, TABELA_FORMULARIOS, type ModeloFichaEntrega } from '../ficha_entrega'
import type { FolhaPdf } from '../../telas/folha_pdf'
import type { DadosProjetos } from '../dados'
import type { Linha } from '../../nucleo/banco_local'
import { FichaEntrega, recortarAssinatura } from './FichaEntrega'
import { eventosDaEntrega } from '../entregas'

export function TelaComprovante({ ctx, assinaturaId, chave }: { ctx: Contexto; assinaturaId?: string; chave?: string }) {
  const { dados, obra, usuario, voltar, ir } = ctx
  // pela chave da aba Entregas: 'a:<assinatura>' é a mesma entrega assinada; 's:...' é entrega sem assinatura
  const assinatura = assinaturaId ?? (chave?.startsWith('a:') ? chave.slice(2) : null)
  const linhas = assinatura ? entregaDaAssinatura(dados, assinatura) : chave ? eventosDaEntrega(dados, chave) : []
  const [imagem, setImagem] = useState<string | null | undefined>(assinatura ? undefined : null)
  useEffect(() => {
    let valendo = true
    if (!assinatura) {
      setImagem(null)
      return
    }
    setImagem(undefined)
    imagemDaAssinatura(obra.id, assinatura).then((u) => valendo && setImagem(u))
    return () => {
      valendo = false
    }
  }, [obra.id, assinatura])
  // formulário da obra para a entrega (dado da obra; sem ele, vale o comprovante de sempre)
  const [modelo, setModelo] = useState<ModeloFichaEntrega | null>(null)
  useEffect(() => {
    let valendo = true
    sincronizador
      .linhas(TABELA_FORMULARIOS, obra.id)
      .then((l) => valendo && setModelo(modeloDasLinhas(l)))
      .catch(() => undefined)
    return () => {
      valendo = false
    }
  }, [obra.id])

  const l0 = linhas[0]
  const empresa = l0 ? dados.empresaPorId.get(String(l0.empresa_id))?.nome : ''
  return (
    <main class="tela" data-testid="comprovante">
      <Topo titulo="Comprovante de entrega" sub={l0 ? `${String(l0.colaborador ?? '') || 'sem nome'} · ${empresa ?? ''}` : undefined} aoVoltar={voltar} />
      {linhas.length === 0 ? (
        <p class="pj-vazio">Esta entrega ainda não está no aparelho. Sincronize e tente de novo.</p>
      ) : (
        <>
          <section class="pj-secao">
            <p>
              {assinatura ? 'Retirado em ' : 'Entregue em '}
              <strong data-testid="comprovante-quando">{assinatura ? dataHoraDe(l0.criado_em_dispositivo) : dataBR(String(l0.data_evento ?? ''))}</strong>
              {l0.colaborador ? (
                <>
                  {' '}
                  por <strong>{String(l0.colaborador)}</strong>
                </>
              ) : null}
              {empresa ? ` (${empresa})` : ''}.
            </p>
            <ul class="pj-historico" data-testid="comprovante-pranchas">
              {linhas.map((l) => {
                const doc = dados.documentoPorId.get(String(l.documento_id))
                return (
                  <li key={l.id} class="pj-tocavel" onClick={() => doc && ir({ nome: 'prancha', documentoId: doc.id })}>
                    <strong>{doc?.codigo ?? 'prancha?'}</strong>
                    <span class="pj-selo ok">{rotuloRevisao(dados.revisaoPorId.get(String(l.revisao_id)))}</span>
                    <span class="discreto">{doc?.titulo}</span>
                  </li>
                )
              })}
            </ul>
          </section>
          <section class="pj-secao">
            <h2>Assinatura</h2>
            {imagem === undefined && <p class="discreto">Carregando…</p>}
            {!assinatura && (
              <p class="discreto" data-testid="comprovante-sem-assinatura">
                Entrega sem assinatura no app (registrada pela ficha ou antes da assinatura). No PDF, a coluna fica em branco para assinar à mão.
              </p>
            )}
            {assinatura && imagem === null && <p class="discreto">Assinatura guardada. A imagem só aparece com internet.</p>}
            {imagem && <img class="pj-assinatura-img" src={imagem} alt="Assinatura de quem retirou" data-testid="comprovante-assinatura" />}
          </section>
          {modelo && (
            <p class="discreto" data-testid="comprovante-modelo">
              O PDF sai no formulário da obra{modelo.referencia ? ` (${modelo.referencia})` : ''}: uma linha por prancha, com a assinatura.
            </p>
          )}
          <div class="acoes">
            {modelo ? (
              <BotaoExportarPdf
                obra={obra}
                usuario={usuario}
                rotulo={`Exportar ${modelo.referencia || 'ficha'} (PDF)`}
                montar={async () => folhaDaFichaDeEntrega(dados, modelo, obra.nome, linhas, await recortarAssinatura(imagem ?? null))}
                testid="projetos-pdf-ficha"
                desativado={imagem === undefined}
              />
            ) : (
              <BotaoExportarPdf obra={obra} usuario={usuario} montar={() => folhaDoComprovante(dados, linhas, imagem ?? null)} testid="projetos-pdf-comprovante" desativado={imagem === undefined} />
            )}
          </div>
        </>
      )}
    </main>
  )
}

/** A folha do Exportar PDF no formato do formulário da obra: uma linha por prancha, A4 deitado. */
function folhaDaFichaDeEntrega(
  dados: Pick<DadosProjetos, 'documentoPorId' | 'revisaoPorId' | 'empresaPorId'>,
  modelo: ModeloFichaEntrega,
  obra: string,
  linhas: readonly Linha[],
  imagem: string | null,
): FolhaPdf {
  const pranchas = linhas.flatMap((l) => {
    const doc = dados.documentoPorId.get(String(l.documento_id))
    return doc ? [doc] : []
  })
  const { marcadas, outros } = disciplinasDaFicha(modelo, pranchas)
  return {
    modulo: 'Projetos',
    titulo: `${modelo.referencia || 'Ficha'} entrega`,
    tabelas: [],
    deitada: true,
    propria: <FichaEntrega modelo={modelo} obra={obra} linhas={linhasDaFicha(dados, linhas)} marcadas={marcadas} outros={outros} assinatura={imagem} />,
  }
}

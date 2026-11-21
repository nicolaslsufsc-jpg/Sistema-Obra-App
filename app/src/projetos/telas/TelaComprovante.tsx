// Comprovante de uma entrega assinada (21/11/2026): quem retirou, data e hora, as pranchas e a assinatura.
// Abre depois de registrar a entrega e pelo "assinada" na prancha. O PDF sai pelo Exportar PDF.
import { useEffect, useState } from 'preact/hooks'
import { dataHoraDe, entregaDaAssinatura, folhaDoComprovante, imagemDaAssinatura } from '../assinatura'
import { BotaoExportarPdf } from '../../telas/ExportarPdf'
import type { Contexto } from './ModuloProjetos'
import { rotuloRevisao, Topo } from './comum'

export function TelaComprovante({ ctx, assinaturaId }: { ctx: Contexto; assinaturaId: string }) {
  const { dados, obra, usuario, voltar, ir } = ctx
  const linhas = entregaDaAssinatura(dados, assinaturaId)
  const [imagem, setImagem] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let valendo = true
    imagemDaAssinatura(obra.id, assinaturaId).then((u) => valendo && setImagem(u))
    return () => {
      valendo = false
    }
  }, [obra.id, assinaturaId])

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
              Retirado em <strong data-testid="comprovante-quando">{dataHoraDe(l0.criado_em_dispositivo)}</strong>
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
            {imagem === null && <p class="discreto">A assinatura está guardada, mas a imagem só aparece com internet (ela já subiu deste ou de outro aparelho).</p>}
            {imagem && <img class="pj-assinatura-img" src={imagem} alt="Assinatura de quem retirou" data-testid="comprovante-assinatura" />}
          </section>
          <div class="acoes">
            <BotaoExportarPdf obra={obra} usuario={usuario} montar={() => folhaDoComprovante(dados, linhas, imagem ?? null)} testid="projetos-pdf-comprovante" desativado={imagem === undefined} />
          </div>
        </>
      )}
    </main>
  )
}

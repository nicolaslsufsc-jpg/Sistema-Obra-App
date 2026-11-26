import { useState } from 'preact/hooks'
import { escritorioAtualizado, podeGerir, podeRegistrar, registrarEscritorio } from '../dados'
import type { Contexto } from './ModuloProjetos'
import { dataBR, horaBR, rotuloRevisao, Selo, SeloSituacao, Topo } from './comum'
import { linkSeguro } from '../../nucleo/links'
import { Icone } from '../../telas/icones'

export function TelaPrancha({ ctx, documentoId }: { ctx: Contexto; documentoId: string }) {
  const { dados, obra, usuario, ir, voltar, recarregar, avisar } = ctx
  const doc = dados.documentoPorId.get(documentoId)
  const [salvando, setSalvando] = useState(false)
  if (!doc) {
    return (
      <main class="tela">
        <Topo titulo="Prancha" aoVoltar={voltar} />
        <p>Este projeto não está mais no aparelho.</p>
      </main>
    )
  }
  const vigente = dados.vigentes.get(doc.id)
  const revisoes = dados.revisoesDe.get(doc.id) ?? []
  const sits = (dados.situacoesDe.get(doc.id) ?? []).slice().sort((a, b) => (dados.empresaPorId.get(a.empresa_id)?.nome ?? '').localeCompare(dados.empresaPorId.get(b.empresa_id)?.nome ?? '', 'pt-BR'))
  const abertas = sits.flatMap((s) => s.entregas_abertas)
  const escr = dados.escritorio.get(doc.id)
  const escrOk = escritorioAtualizado(dados, doc.id)

  const marcarEscritorio = async () => {
    if (!vigente) return
    if (!confirm(`Registrar que a pasta do escritório está com ${rotuloRevisao(vigente)} de ${doc.codigo}?`)) return
    setSalvando(true)
    await registrarEscritorio(obra.id, usuario.id, { documento_id: doc.id, revisao_id: vigente.id, data_evento: dados.hoje })
    await recarregar()
    setSalvando(false)
    avisar('Pasta do escritório registrada como atualizada.')
  }

  return (
    <main class="tela">
      <Topo titulo={doc.codigo} sub={doc.disciplina} aoVoltar={voltar} />
      <section class="cartao">
        <dl class="pj-dados">
          <dt>Título</dt>
          <dd>{doc.titulo || '—'}</dd>
          <dt>Vigente</dt>
          <dd>
            {vigente ? (
              <>
                {rotuloRevisao(vigente)} <span class="discreto">· publicada em {horaBR(String(vigente.cadastrada_em_autodoc ?? '')) || 'data desconhecida'}</span>
              </>
            ) : (
              <Selo classe="info">sem revisão vigente no sistema de projetos</Selo>
            )}
          </dd>
          {doc.pasta_autodoc && (
            <>
              <dt>Pasta</dt>
              <dd class="discreto">{doc.pasta_autodoc}</dd>
            </>
          )}
        </dl>
        {linkSeguro(doc.link_pasta) && (
          <a class="pj-link" href={linkSeguro(doc.link_pasta)!} target="_blank" rel="noopener noreferrer">
            Abrir a pasta no sistema de projetos <Icone id="fora" />
          </a>
        )}
      </section>

      {podeRegistrar(obra.papel) && (
        <div class="acoes">
          <button type="button" class="principal" disabled={!vigente} onClick={() => ir({ nome: 'entregar', documentoId: doc.id })}>
            Entregar cópia
          </button>
          <button type="button" disabled={abertas.length === 0} onClick={() => ir({ nome: 'recolher', documentoId: doc.id })}>
            Recolher cópia
          </button>
        </div>
      )}

      <section class="pj-secao">
        <h2>Em campo</h2>
        {sits.length === 0 ? (
          <p class="pj-vazio">Sem entregas</p>
        ) : (
          <ul class="pj-historico" data-testid="em-campo">
            {sits.map((s) => {
              const emp = dados.empresaPorId.get(s.empresa_id)
              const rev = s.revisao_em_campo_id ? dados.revisaoPorId.get(s.revisao_em_campo_id) : null
              return (
                <li key={s.empresa_id}>
                  <strong>{emp?.nome ?? 'empresa?'}</strong>
                  <SeloSituacao situacao={s.situacao} />
                  <span>
                    {s.situacao === 'DEVOLVIDO' ? 'devolveu' : `tem ${rotuloRevisao(rev)}`}
                    {s.entregas_abertas.length > 1 && ` (${s.entregas_abertas.length} entregas abertas)`}
                  </span>
                  {s.ultimo_evento && <span class="quando">{dataBR(s.ultimo_evento)}</span>}
                  {s.entregas_abertas
                    .filter((e) => e.assinatura_id)
                    .map((e) => (
                      <button key={e.id} type="button" class="pj-pequeno" data-testid="entrega-assinada" onClick={() => ctx.ir({ nome: 'comprovante', assinaturaId: String(e.assinatura_id) })}>
                        assinada · comprovante
                      </button>
                    ))}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section class="pj-secao">
        <h2>Pasta do escritório</h2>
        {escr ? (
          <p>
            Está com <strong>{rotuloRevisao(dados.revisaoPorId.get(String(escr.revisao_id)))}</strong> desde {dataBR(String(escr.data_evento))}.{' '}
            {escrOk ? <Selo classe="bom">atualizada</Selo> : <Selo classe="ruim">precisa atualizar</Selo>}
          </p>
        ) : (
          <p class="pj-vazio">Sem registro de qual revisão está na pasta.</p>
        )}
        {podeGerir(obra.papel) && vigente && !escrOk && (
          <button type="button" class="pj-pequeno" disabled={salvando} onClick={marcarEscritorio}>
            Pasta atualizada com {rotuloRevisao(vigente)}
          </button>
        )}
      </section>

      <section class="pj-secao">
        <h2>Revisões</h2>
        <ul class="pj-historico" data-testid="revisoes">
          {revisoes.map((r) => (
            <li key={r.id}>
              <strong>{rotuloRevisao(r)}</strong>
              {r.id === vigente?.id && <Selo classe="bom">vigente</Selo>}
              {!!r.obsoleta && <Selo classe="neutro">obsoleta</Selo>}
              <span class="quando">
                vista em {dataBR(String(r.vista_em))}
                {r.cadastrada_por ? ` · ${String(r.cadastrada_por)}` : ''}
                {r.status_autodoc ? ` · ${String(r.status_autodoc)}` : ''}
              </span>
            </li>
          ))}
          {revisoes.length === 0 && <li class="pj-vazio">–</li>}
        </ul>
      </section>
    </main>
  )
}

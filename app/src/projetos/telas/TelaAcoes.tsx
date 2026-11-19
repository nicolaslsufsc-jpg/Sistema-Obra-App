import { useState } from 'preact/hooks'
import { escritorioAtualizado, podeGerir, podeRegistrar, registrarEscritorio } from '../dados'
import type { Contexto } from './ModuloProjetos'
import { dataBR, rotuloRevisao, Selo, Topo } from './comum'

export function TelaAcoes({ ctx }: { ctx: Contexto }) {
  const { dados, obra, usuario, ir, voltar, recarregar, avisar } = ctx
  const [salvando, setSalvando] = useState('')
  const nomeEmpresa = (id: string) => dados.empresaPorId.get(id)?.nome ?? 'empresa?'
  const codigo = (id: string) => dados.documentoPorId.get(id)?.codigo ?? id
  const rev = (id: string | null) => rotuloRevisao(id ? dados.revisaoPorId.get(id) : null)

  const recolher = dados.situacoes.filter((s) => s.situacao === 'RECOLHER').sort((a, b) => codigo(a.documento_id).localeCompare(codigo(b.documento_id)))
  const conferir = dados.situacoes.filter((s) => s.situacao === 'CONFERIR').sort((a, b) => codigo(a.documento_id).localeCompare(codigo(b.documento_id)))
  const novasDocs = [...new Set(dados.novas.map((r) => String(r.documento_id)))]
  const entregar = novasDocs.flatMap((docId) => recolher.filter((s) => s.documento_id === docId).map((s) => ({ docId, s })))
  const escritorio = dados.documentos.filter((d) => escritorioAtualizado(dados, d.id) === false)
  const semRegistro = novasDocs.filter((id) => escritorioAtualizado(dados, id) === null && dados.vigentes.has(id))

  const marcarEscritorio = async (docId: string) => {
    const vigente = dados.vigentes.get(docId)
    if (!vigente) return
    if (!confirm(`Registrar que a pasta do escritório está com ${rotuloRevisao(vigente)} de ${codigo(docId)}?`)) return
    setSalvando(docId)
    await registrarEscritorio(obra.id, usuario.id, { documento_id: docId, revisao_id: vigente.id, data_evento: dados.hoje })
    await recarregar()
    setSalvando('')
    avisar(`${codigo(docId)}: pasta do escritório registrada como atualizada.`)
  }

  const nada = dados.novas.length === 0 && recolher.length === 0 && conferir.length === 0 && escritorio.length === 0

  return (
    <main class="tela">
      <Topo titulo="Chegou revisão: o que fazer" sub={`hoje, ${dataBR(dados.hoje)}`} aoVoltar={voltar} />
      {nada && <p class="pj-vazio">Nada pendente: sem revisão nova nos últimos 7 dias, nada a recolher, nada a conferir.</p>}

      {dados.novas.length > 0 && (
        <section class="pj-secao" data-testid="acoes-novas">
          <h2>
            Revisões novas <Selo classe="info">{dados.novas.length}</Selo>
          </h2>
          {dados.novas.map((r) => {
            const docId = String(r.documento_id)
            const vigente = dados.vigentes.get(docId)
            const escrOk = escritorioAtualizado(dados, docId)
            return (
              <div class="pj-acao" key={r.id}>
                <span>
                  <strong>
                    {codigo(docId)} · {rotuloRevisao(r)}
                    {vigente?.id === r.id ? '' : ' (não é a vigente)'}
                  </strong>
                  <span class="discreto">
                    {dados.documentoPorId.get(docId)?.titulo ?? ''} · vista em {dataBR(String(r.vista_em))}
                    {escrOk === false ? ' · escritório desatualizado' : escrOk === null ? ' · escritório sem registro' : ''}
                  </span>
                </span>
                <button type="button" class="pj-pequeno" onClick={() => ir({ nome: 'prancha', documentoId: docId })}>
                  Abrir
                </button>
              </div>
            )
          })}
        </section>
      )}

      {entregar.length > 0 && (
        <section class="pj-secao" data-testid="acoes-entregar">
          <h2>
            Imprimir e entregar <Selo classe="neutro">{entregar.length}</Selo>
          </h2>
          {entregar.map(({ docId, s }) => (
            <div class="pj-acao" key={`${docId}-${s.empresa_id}`}>
              <span>
                <strong>
                  {codigo(docId)} {rev(s.revisao_vigente_id)} → {nomeEmpresa(s.empresa_id)}
                </strong>
                <span class="discreto">tem {rev(s.revisao_em_campo_id)}</span>
              </span>
              {podeRegistrar(obra.papel) && (
                <button type="button" class="pj-pequeno" onClick={() => ir({ nome: 'entregar', documentoId: docId, empresaId: s.empresa_id })}>
                  Entregar
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {recolher.length > 0 && (
        <section class="pj-secao" data-testid="acoes-recolher">
          <h2>
            Recolher <Selo classe="ruim">{recolher.length}</Selo>
          </h2>
          {recolher.map((s) => (
            <div class="pj-acao" key={`${s.documento_id}-${s.empresa_id}`}>
              <span>
                <strong>
                  {nomeEmpresa(s.empresa_id)}: {codigo(s.documento_id)} {rev(s.revisao_em_campo_id)}
                </strong>
                <span class="discreto">vigente {rev(s.revisao_vigente_id)} · desde {dataBR(s.ultimo_evento)}</span>
              </span>
              {podeRegistrar(obra.papel) && (
                <button type="button" class="pj-pequeno" onClick={() => ir({ nome: 'recolher', documentoId: s.documento_id, entregaId: s.entregas_abertas[0]?.id })}>
                  Recolher
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {(escritorio.length > 0 || semRegistro.length > 0) && (
        <section class="pj-secao" data-testid="acoes-escritorio">
          <h2>
            Atualizar escritório <Selo classe="info">{escritorio.length + semRegistro.length}</Selo>
          </h2>
          {escritorio.map((d) => (
            <div class="pj-acao" key={d.id}>
              <span>
                <strong>{d.codigo}</strong>
                <span class="discreto">
                  pasta tem {rev(String(dados.escritorio.get(d.id)?.revisao_id ?? ''))}, vigente {rev(dados.vigentes.get(d.id)?.id ?? null)}
                </span>
              </span>
              {podeGerir(obra.papel) && (
                <button type="button" class="pj-pequeno" disabled={salvando === d.id} onClick={() => marcarEscritorio(d.id)}>
                  Pasta atualizada
                </button>
              )}
            </div>
          ))}
          {semRegistro.map((id) => (
            <div class="pj-acao" key={id}>
              <span>
                <strong>{codigo(id)}</strong>
                <span class="discreto">sem registro da revisão na pasta · vigente {rev(dados.vigentes.get(id)?.id ?? null)}</span>
              </span>
              {podeGerir(obra.papel) && (
                <button type="button" class="pj-pequeno" disabled={salvando === id} onClick={() => marcarEscritorio(id)}>
                  Pasta atualizada
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {conferir.length > 0 && (
        <section class="pj-secao" data-testid="acoes-conferir">
          <h2>
            Conferir <Selo classe="info">{conferir.length}</Selo>
          </h2>
          {conferir.map((s) => (
            <div class="pj-acao" key={`${s.documento_id}-${s.empresa_id}`}>
              <span>
                <strong>
                  {nomeEmpresa(s.empresa_id)}: {codigo(s.documento_id)}
                </strong>
                <span class="discreto">
                  {s.entregas_abertas.length >= 2
                    ? `${s.entregas_abertas.length} entregas abertas: qual é a que vale?`
                    : `sem revisão vigente no sistema de projetos (em campo: ${rev(s.revisao_em_campo_id)})`}
                </span>
              </span>
              <button type="button" class="pj-pequeno" onClick={() => ir({ nome: 'prancha', documentoId: s.documento_id })}>
                Abrir
              </button>
            </div>
          ))}
        </section>
      )}
    </main>
  )
}

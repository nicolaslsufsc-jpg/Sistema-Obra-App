// Lista mestra em A4, pelo Imprimir do navegador (dá para salvar em PDF), para levar à auditoria.
import { plural, Topo } from '../../relatorios/telas/comum'
import { dataBR } from '../../relatorios/regras'
import { nomeDaCategoria, NOME_DO_ESCOPO, type Escopo } from '../categorias'
import { NOME_DO_STATUS, statusDaRevisao, validadeDe } from '../regras'
import { NOME_DA_SITUACAO_NC } from '../ligacoes'
import type { ContextoDoc } from './ModuloDocumentos'

export function TelaImprimir({ ctx, escopo }: { ctx: ContextoDoc; escopo: Escopo }) {
  const { dados, hoje, obra, voltar } = ctx
  // os exemplos saem marcados EXEMPLO, para a folha bater com a tela (demo de 14/11); somem quando o gestor tira os exemplos
  const docs = dados.documentos.filter((d) => d.escopo === escopo)
  const nExemplos = docs.filter((d) => d.exemplo).length
  return (
    <>
      <Topo titulo="Imprimir lista mestra" aoVoltar={voltar}>
        <button type="button" class="principal" onClick={() => window.print()}>
          Imprimir
        </button>
      </Topo>
      <article class="doc-folha" data-testid="folha-lista-mestra">
        <header>
          <h1>Lista mestra de documentos · {NOME_DO_ESCOPO[escopo]}</h1>
          <p>
            {obra.codigo} · {obra.nome} · emitida em {dataBR(hoje)}
          </p>
        </header>
        <div class="doc-tabela-rolagem">
          <table class="rl-doc-tabela doc-tabela">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Código</th>
                <th>Título</th>
                <th>Rev.</th>
                <th>Data</th>
                <th>Validade</th>
                <th>Responsável</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const v = validadeDe(d, hoje)
                return (
                  <tr key={d.chave}>
                    <td data-rot="Categoria">{nomeDaCategoria(d.categoria)}</td>
                    <td data-rot="Código" class="doc-curta">{d.codigo}</td>
                    <td data-rot="Título">
                      {d.exemplo && <strong class="doc-marca-exemplo">EXEMPLO · </strong>}
                      {d.atual.titulo}
                    </td>
                    <td data-rot="Rev." class="doc-curta">{d.atual.revisao}</td>
                    <td data-rot="Data" class="doc-curta">{dataBR(d.atual.data_revisao)}</td>
                    <td data-rot="Validade" class="doc-curta">
                      {d.atual.validade ? dataBR(d.atual.validade) : '—'}
                      {v.tipo === 'vencido' ? <strong> VENCIDO</strong> : ''}
                    </td>
                    <td data-rot="Responsável">{d.atual.responsavel}</td>
                    <td data-rot="Status" class="doc-curta">{NOME_DO_STATUS[statusDaRevisao(d, d.atual)]}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {docs.length === 0 && <p>Sem documentos</p>}
        {nExemplos > 0 && (
          <p class="doc-nota" data-testid="nota-exemplos">
            {nExemplos === docs.length ? 'Todos os documentos desta lista são' : nExemplos === 1 ? '1 documento desta lista é' : `${nExemplos} documentos desta lista são`} de exemplo (marcados EXEMPLO) e não valem para a auditoria.
          </p>
        )}
        {escopo === 'obra' && (
          <section data-testid="folha-registros">
            <h2 class="doc-folha-sub">Registros dos módulos</h2>
            <div class="doc-tabela-rolagem">
              <table class="rl-doc-tabela doc-tabela doc-tabela-registros">
                <thead>
                  <tr>
                    <th>Módulo</th>
                    <th>Registro</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.ligacoes.fichas.map((f) => (
                    <tr key={`f:${f.codigo}`}>
                      <td data-rot="Módulo" class="doc-curta">FVS</td>
                      <td data-rot="Registro">
                        {f.codigo} rev. {f.revisao} · {f.titulo}
                      </td>
                      <td data-rot="Situação">
                        {plural(f.pecasVerificadas, 'peça verificada', 'peças verificadas')} · {plural(f.marcacoes, 'marcação', 'marcações')}
                      </td>
                    </tr>
                  ))}
                  {dados.ligacoes.concretagens.map((c) => (
                    <tr key={`c:${c.raiz}`}>
                      <td data-rot="Módulo" class="doc-curta">Concreto</td>
                      <td data-rot="Registro">
                        {dataBR(c.data)} · {c.exemplo ? 'EXEMPLO · ' : ''}
                        {c.local} · fck {c.fck} MPa
                      </td>
                      <td data-rot="Situação">
                        {plural(c.caminhoes, 'caminhão', 'caminhões')} · {plural(c.cpsMoldados, 'CP moldado', 'CPs moldados')} · {plural(c.cpsRompidos, 'rompido', 'rompidos')}
                      </td>
                    </tr>
                  ))}
                  {dados.ligacoes.ncs.map((n) => (
                    <tr key={`n:${n.raiz}`}>
                      <td data-rot="Módulo" class="doc-curta">NC</td>
                      <td data-rot="Registro">
                        {dataBR(n.data)} · {n.titulo}
                      </td>
                      <td data-rot="Situação">
                        {NOME_DA_SITUACAO_NC[n.situacao]}
                        {n.prazo ? ` · prazo ${dataBR(n.prazo)}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <p class="doc-nota">Só a revisão vigente de cada documento.</p>
      </article>
    </>
  )
}

// Lista mestra: abas Empresa e Obra, filtros por categoria e status, busca, selos de vencido.
import { useState } from 'preact/hooks'
import { Topo } from '../../relatorios/telas/comum'
import { dataBR } from '../../relatorios/regras'
import { CATEGORIAS, nomeDaCategoria, NOME_DO_ESCOPO, type Escopo } from '../categorias'
import { podeCadastrar } from '../dados'
import { AVISO_TOTAL, contarVencidos, filtrar, NOME_DO_STATUS, statusDaRevisao, tamanhoEmTexto, validadeDe, type Documento, type FiltroStatus } from '../regras'
import { BotaoExportarPdf } from '../../telas/ExportarPdf'
import type { FolhaPdf } from '../../telas/folha_pdf'
import type { ContextoDoc } from './ModuloDocumentos'
import { SeloExemplo, SeloStatus, SeloValidade } from './comum'
import { tirarExemplos } from '../exemplos'
import { banco } from '../../nucleo/servicos'
import { Registros } from './Registros'
import { BotoesOffline } from './Offline'

const FILTROS_STATUS: ReadonlyArray<{ v: FiltroStatus; t: string }> = [
  { v: 'todos', t: 'Todos' },
  { v: 'vencidos', t: 'Vencidos' },
  { v: 'em_revisao', t: 'Em revisão' },
]

export function TelaLista({ ctx, escopo }: { ctx: ContextoDoc; escopo: Escopo }) {
  const { dados, hoje, obra, usuario, ir, trocar, voltar, recarregar } = ctx
  const nExemplos = dados.documentos.filter((d) => d.exemplo).length
  const [categoria, setCategoria] = useState<string | null>(null)
  const [status, setStatus] = useState<FiltroStatus>('todos')
  const [busca, setBusca] = useState('')

  const doEscopo = dados.documentos.filter((d) => d.escopo === escopo)
  const lista = filtrar(dados.documentos, { escopo, categoria, status, busca }, hoje)
  const avisos = contarVencidos(dados.documentos, hoje)
  const porCategoria = new Map<string, Documento[]>()
  for (const d of lista) {
    const g = porCategoria.get(d.categoria)
    if (g) g.push(d)
    else porCategoria.set(d.categoria, [d])
  }
  const categoriasComDoc = CATEGORIAS.filter((c) => doEscopo.some((d) => d.categoria === c.id))
  // a lista com os filtros da tela em A4 (21/11/2026); a lista mestra inteira continua no "Imprimir lista mestra"
  const folha = (): FolhaPdf => {
    const filtros = [
      categoria && nomeDaCategoria(categoria),
      status !== 'todos' && FILTROS_STATUS.find((f) => f.v === status)?.t,
      busca.trim() && `busca "${busca.trim()}"`,
    ].filter(Boolean)
    return {
      modulo: 'Documentos',
      titulo: `Lista mestra · ${NOME_DO_ESCOPO[escopo]}`,
      sub: filtros.length ? `Filtros: ${filtros.join(' · ')}` : `Todos os documentos (${NOME_DO_ESCOPO[escopo].toLowerCase()})`,
      resumo: [
        lista.length === doEscopo.length ? `${doEscopo.length} ${doEscopo.length === 1 ? 'documento' : 'documentos'}` : `${lista.length} de ${doEscopo.length} documentos`,
        ...(avisos.vencidos > 0 ? [`${avisos.vencidos} ${avisos.vencidos === 1 ? 'vencido' : 'vencidos'}`] : []),
      ],
      tabelas: [
        {
          colunas: ['Categoria', 'Código', 'Título', 'Rev.', 'Data', 'Validade', 'Responsável', 'Status'],
          curtas: [1, 3, 4, 5, 7],
          linhas: [...porCategoria.values()].flat().map((d) => {
            const v = validadeDe(d, hoje)
            return [
              nomeDaCategoria(d.categoria),
              d.codigo,
              `${d.exemplo ? 'EXEMPLO · ' : ''}${d.atual.titulo}`,
              d.atual.revisao,
              dataBR(d.atual.data_revisao),
              d.atual.validade ? `${dataBR(d.atual.validade)}${v.tipo === 'vencido' ? ' VENCIDO' : ''}` : '',
              d.atual.responsavel,
              NOME_DO_STATUS[statusDaRevisao(d, d.atual)],
            ]
          }),
          vazio: '–',
          nota: nExemplos > 0 ? 'Documentos marcados EXEMPLO não valem para a auditoria.' : undefined,
        },
      ],
      deitada: true,
    }
  }
  const trocarEscopo = (e: Escopo) => {
    setCategoria(null)
    trocar({ nome: 'lista', escopo: e })
  }

  return (
    <>
      <Topo titulo="Documentos" sub={`${obra.codigo} · Lista mestra (PBQP-H)`} aoVoltar={voltar} paraMenu />

      {(avisos.vencidos > 0 || avisos.vencendo > 0) && (
        <p class="doc-avisos" data-testid="avisos">
          {avisos.vencidos > 0 && <strong>{avisos.vencidos === 1 ? '1 documento vencido' : `${avisos.vencidos} documentos vencidos`}</strong>}
          {avisos.vencidos > 0 && avisos.vencendo > 0 && ' · '}
          {avisos.vencendo > 0 && <span>{avisos.vencendo === 1 ? '1 vence em até 30 dias' : `${avisos.vencendo} vencem em até 30 dias`}</span>}
        </p>
      )}

      <div class="rl-abas" role="tablist">
        <button type="button" role="tab" aria-selected={escopo === 'empresa'} class={escopo === 'empresa' ? 'on' : ''} data-testid="aba-empresa" onClick={() => trocarEscopo('empresa')}>
          Empresa
        </button>
        <button type="button" role="tab" aria-selected={escopo === 'obra'} class={escopo === 'obra' ? 'on' : ''} data-testid="aba-obra" onClick={() => trocarEscopo('obra')}>
          Obra
        </button>
      </div>

      {podeCadastrar(obra.papel) && (
        <button type="button" class="principal rl-largo" data-testid="cadastrar" onClick={() => ir({ nome: 'novo', escopo })}>
          Cadastrar documento
        </button>
      )}

      <div class="doc-filtros">
        <input type="search" placeholder="Buscar por código, título ou responsável" aria-label="Buscar" value={busca} onInput={(e) => setBusca((e.target as HTMLInputElement).value)} />
        <select aria-label="Categoria" data-testid="filtro-categoria" value={categoria ?? ''} onChange={(e) => setCategoria((e.target as HTMLSelectElement).value || null)}>
          <option value="">Todas as categorias</option>
          {categoriasComDoc.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} ({doEscopo.filter((d) => d.categoria === c.id).length})
            </option>
          ))}
        </select>
        <div class="rl-chips" role="group" aria-label="Status" data-testid="filtro-status">
          {FILTROS_STATUS.map((f) => (
            <button type="button" key={f.v} class={`rl-chip${status === f.v ? ' on' : ''}`} aria-pressed={status === f.v} onClick={() => setStatus(f.v)}>
              {f.t}
            </button>
          ))}
        </div>
      </div>

      <p class="discreto" data-testid="contagem">
        {lista.length === doEscopo.length ? `${doEscopo.length} ${doEscopo.length === 1 ? 'documento' : 'documentos'}.` : `${lista.length} de ${doEscopo.length} documentos.`}
      </p>
      {lista.length === 0 && <p class="discreto">{doEscopo.length === 0 ? 'Sem documentos' : 'Sem documentos com estes filtros'}</p>}

      <div data-testid="lista-mestra">
        {[...porCategoria].map(([cat, docs]) => (
          <section key={cat} class="doc-grupo">
            <h2>{nomeDaCategoria(cat)}</h2>
            {/* a pasta inteira (só a revisão vigente de cada documento): opcional, nada baixa sozinho */}
            <BotoesOffline pasta arquivos={docs.map((d) => (d.atual.arquivo_id ? dados.arquivos.get(d.atual.arquivo_id) : undefined))} recarregar={recarregar} testid={`offline-pasta-${cat}`} />
            <ul class="lista">
              {docs.map((d) => (
                <li key={d.chave}>
                  <button type="button" class="rl-linha" onClick={() => ir({ nome: 'documento', chave: d.chave })}>
                    <span class="rl-linha-texto">
                      <strong>
                        <span class="doc-codigo">{d.codigo}</span> {d.atual.titulo}
                      </strong>
                      <span class="discreto">
                        rev. {d.atual.revisao} · {dataBR(d.atual.data_revisao)} · {d.atual.responsavel}
                        {d.atual.validade ? ` · validade ${dataBR(d.atual.validade)}` : ''}
                      </span>
                    </span>
                    {d.exemplo && <SeloExemplo />}
                    {d.atual.situacao === 'em_revisao' && <SeloStatus status="em_revisao" />}
                    <SeloValidade doc={d} hoje={hoje} />
                    {!d.atual.arquivo_id && <span class="rl-selo neutro">Sem arquivo</span>}
                    {d.atual.arquivo_id && dados.arquivos.get(d.atual.arquivo_id)?.onde === 'offline' && (
                      <span class="rl-selo neutro" data-testid="selo-offline">
                        No aparelho
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {escopo === 'obra' && <Registros ligacoes={dados.ligacoes} />}

      <div class="doc-rodape">
        <button type="button" data-testid="imprimir-lista" onClick={() => ir({ nome: 'imprimir', escopo })}>
          Imprimir lista mestra
        </button>
        <BotaoExportarPdf obra={obra} usuario={usuario} montar={folha} rotulo="Exportar PDF (com os filtros)" testid="documentos-pdf-lista" desativado={lista.length === 0} />
        {nExemplos > 0 && (
          <div class="doc-exemplos" data-testid="aviso-exemplos">
            <p class="discreto">
              {nExemplos === 1 ? '1 documento é de exemplo' : `${nExemplos} documentos são de exemplo`} (marcados EXEMPLO): saem na impressão com a marca EXEMPLO e não contam nos avisos de vencido.
            </p>
            {podeCadastrar(obra.papel) && (
              <button
                type="button"
                data-testid="tirar-exemplos"
                onClick={async () => {
                  if (!confirm(`Tirar os ${nExemplos} documentos de exemplo deste aparelho? Eles não voltam.`)) return
                  await tirarExemplos(banco, obra.id)
                  await recarregar()
                }}
              >
                Tirar os exemplos
              </button>
            )}
          </div>
        )}
        <p class="discreto">Arquivos no aparelho: {tamanhoEmTexto(dados.totalArquivos)}.</p>
        {dados.totalOffline > 0 && (
          <p class="discreto" data-testid="total-offline">
            Baixados para usar offline: {tamanhoEmTexto(dados.totalOffline)} (continuam no servidor).
          </p>
        )}
        {dados.totalArquivos > AVISO_TOTAL && (
          <p class="aviso" data-testid="aviso-espaco">
            Os arquivos dos documentos passam de {tamanhoEmTexto(AVISO_TOTAL)}. O "Salvar arquivo" fica pesado: prefira PDFs menores.
          </p>
        )}
      </div>
    </>
  )
}

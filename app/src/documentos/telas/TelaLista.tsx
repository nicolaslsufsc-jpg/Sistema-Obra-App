// Lista mestra: abas Empresa e Obra, filtros por categoria e status, busca, selos de vencido.
import { useState } from 'preact/hooks'
import { Topo } from '../../relatorios/telas/comum'
import { dataBR } from '../../relatorios/regras'
import { CATEGORIAS, nomeDaCategoria, type Escopo } from '../categorias'
import { podeCadastrar } from '../dados'
import { AVISO_TOTAL, contarVencidos, filtrar, tamanhoEmTexto, type Documento, type FiltroStatus } from '../regras'
import type { ContextoDoc } from './ModuloDocumentos'
import { SeloExemplo, SeloStatus, SeloValidade } from './comum'
import { tirarExemplos } from '../exemplos'
import { banco } from '../../nucleo/servicos'
import { Registros } from './Registros'

const FILTROS_STATUS: ReadonlyArray<{ v: FiltroStatus; t: string }> = [
  { v: 'todos', t: 'Todos' },
  { v: 'vencidos', t: 'Vencidos' },
  { v: 'em_revisao', t: 'Em revisão' },
]

export function TelaLista({ ctx, escopo }: { ctx: ContextoDoc; escopo: Escopo }) {
  const { dados, hoje, obra, ir, trocar, voltar, recarregar } = ctx
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
      {lista.length === 0 && <p class="discreto">{doEscopo.length === 0 ? 'Nenhum documento cadastrado aqui ainda.' : 'Nenhum documento com estes filtros.'}</p>}

      <div data-testid="lista-mestra">
        {[...porCategoria].map(([cat, docs]) => (
          <section key={cat} class="doc-grupo">
            <h2>{nomeDaCategoria(cat)}</h2>
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
        {dados.totalArquivos > AVISO_TOTAL && (
          <p class="aviso" data-testid="aviso-espaco">
            Os arquivos dos documentos passam de {tamanhoEmTexto(AVISO_TOTAL)}. O "Salvar arquivo" fica pesado: prefira PDFs menores.
          </p>
        )}
      </div>
    </>
  )
}

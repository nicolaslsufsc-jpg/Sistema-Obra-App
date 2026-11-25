import { escritorioAtualizado } from '../dados'
import { baixarTexto, fichaCsv, nomeDaFicha } from '../ficha'
import type { Contexto } from './ModuloProjetos'
import { plural, Topo } from './comum'
import { Ajuda } from '../../telas/Ajuda'

export function TelaInicio({ ctx, aoSair }: { ctx: Contexto; aoSair: () => void }) {
  const { dados, obra, ir, avisar, semConta } = ctx
  const recolher = dados.situacoes.filter((s) => s.situacao === 'RECOLHER').length
  const conferir = dados.situacoes.filter((s) => s.situacao === 'CONFERIR').length
  const escritorio = dados.documentos.filter((d) => escritorioAtualizado(dados, d.id) === false).length
  const novasDocs = new Set(dados.novas.map((r) => String(r.documento_id))).size

  const exportar = () => {
    if (dados.eventos.length === 0) {
      avisar('Sem entregas registradas: a ficha sairia vazia.', 'erro')
      return
    }
    baixarTexto(nomeDaFicha(obra.codigo, dados.hoje), fichaCsv(dados))
    avisar('Ficha gerada. Abra o arquivo no Excel.')
  }

  return (
    <main class="tela">
      <Topo titulo="Projetos" sub={`${obra.codigo} · revisões e cópias em campo`} aoVoltar={aoSair} />

      <ul class="pj-resumo" aria-label="Resumo">
        <li>
          <button type="button" class="novas" onClick={() => ir({ nome: 'acoes' })} data-testid="resumo-novas">
            <span class="numero">{novasDocs}</span>
            <span>{novasDocs === 1 ? 'projeto com revisão nova' : 'projetos com revisão nova'}</span>
            <span class="discreto">últimos 7 dias</span>
          </button>
        </li>
        <li>
          <button type="button" class={recolher > 0 ? 'ruim' : ''} onClick={() => ir({ nome: 'acoes' })} data-testid="resumo-recolher">
            <span class="numero">{recolher}</span>
            <span>{recolher === 1 ? 'cópia a recolher' : 'cópias a recolher'}</span>
            <span class="discreto">revisão vencida em campo</span>
          </button>
        </li>
        <li>
          <button type="button" class={conferir > 0 ? 'info' : ''} onClick={() => ir({ nome: 'acoes' })} data-testid="resumo-conferir">
            <span class="numero">{conferir}</span>
            <span>a conferir</span>
            <span class="discreto">algo não bate</span>
          </button>
        </li>
        <li>
          <button type="button" class={escritorio > 0 ? 'info' : ''} onClick={() => ir({ nome: 'acoes' })} data-testid="resumo-escritorio">
            <span class="numero">{escritorio}</span>
            <span>{escritorio === 1 ? 'pasta do escritório vencida' : 'pastas do escritório vencidas'}</span>
            <span class="discreto">sem a revisão vigente</span>
          </button>
        </li>
      </ul>

      <nav class="pj-menu" aria-label="Partes do módulo">
        <button type="button" onClick={() => ir({ nome: 'lista' })}>
          <strong>Lista de projetos</strong>
          <span class="discreto">{plural(dados.documentos.length, 'prancha', 'pranchas')} com a revisão vigente</span>
        </button>
        <button type="button" onClick={() => ir({ nome: 'acoes' })}>
          <strong>Chegou revisão: o que fazer</strong>
          <span class="discreto">imprimir, entregar, recolher, atualizar escritório, conferir</span>
        </button>
        <button type="button" onClick={() => ir({ nome: 'empresas' })}>
          <strong>Empresas</strong>
          <span class="discreto">{plural(dados.empresas.length, 'empresa cadastrada', 'empresas cadastradas')}</span>
        </button>
        <button type="button" onClick={exportar}>
          <strong>Exportar ficha de cópias (CSV)</strong>
          <span class="discreto">uma linha por entrega, para abrir no Excel</span>
        </button>
      </nav>

      {dados.documentos.length === 0 && (
        <p class="pj-vazio so-com-ajuda" data-testid="projetos-vazio">
          Sem pranchas
          <Ajuda>
            {semConta
              ? 'Importar a lista de pranchas do sistema de projetos direto no app vem numa próxima versão. Empresas já podem ser cadastradas.'
              : 'A lista vem do sistema de projetos da obra, pelo PC do escritório, e chega aqui na sincronização.'}
          </Ajuda>
        </p>
      )}
    </main>
  )
}

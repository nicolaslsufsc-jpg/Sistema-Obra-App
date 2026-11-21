import { useState } from 'preact/hooks'
import { normalizar, revisaoNova } from '../regras'
import type { Documento } from '../dados'
import type { Contexto } from './ModuloProjetos'
import { plural, rotuloRevisao, Selo, Topo } from './comum'
import { BotaoExportarPdf } from '../../telas/ExportarPdf'
import type { FolhaPdf } from '../../telas/folha_pdf'

export function TelaLista({ ctx }: { ctx: Contexto }) {
  const { dados, obra, usuario, ir, voltar } = ctx
  const [busca, setBusca] = useState('')
  const q = normalizar(busca.trim())
  const visiveis = q ? dados.documentos.filter((d) => d.busca.includes(q)) : dados.documentos

  const grupos = new Map<string, Documento[]>()
  for (const d of visiveis) {
    const l = grupos.get(d.disciplina)
    if (l) l.push(d)
    else grupos.set(d.disciplina, [d])
  }

  // a lista (com a busca, se houver) em A4 (21/11/2026)
  const folha = (): FolhaPdf => {
    const linhas = visiveis.map((d) => {
      const vigente = dados.vigentes.get(d.id)
      const sits = dados.situacoesDe.get(d.id) ?? []
      return [
        d.disciplina,
        d.codigo,
        d.titulo || 'sem título',
        vigente ? rotuloRevisao(vigente) : 'sem vigente',
        (dados.revisoesDe.get(d.id) ?? []).some((r) => revisaoNova(r, dados.hoje)) ? 'sim' : '',
        sits.filter((s) => s.situacao === 'RECOLHER').length || '',
        sits.filter((s) => s.situacao === 'CONFERIR').length || '',
      ]
    })
    return {
      modulo: 'Projetos',
      titulo: 'Lista de projetos',
      sub: q ? `Busca: "${busca.trim()}"` : undefined,
      resumo: [plural(visiveis.length, 'prancha', 'pranchas'), plural(grupos.size, 'disciplina', 'disciplinas')],
      tabelas: [
        {
          colunas: ['Disciplina', 'Código', 'Título', 'Vigente', 'Nova', 'A recolher', 'Conferir'],
          curtas: [1, 3, 4, 5, 6],
          linhas,
          vazio: q ? 'Nada com esse texto.' : 'Nenhum projeto nesta obra ainda.',
          nota: 'A recolher e Conferir: cópias em campo (da lista de distribuição).',
        },
      ],
    }
  }

  return (
    <main class="tela">
      <Topo titulo="Lista de projetos" sub={plural(dados.documentos.length, 'prancha', 'pranchas')} aoVoltar={voltar} />
      <div class="acoes">
        <BotaoExportarPdf obra={obra} usuario={usuario} montar={folha} testid="projetos-pdf-lista" desativado={visiveis.length === 0} />
      </div>
      <div class="pj-busca">
        <input
          type="search"
          value={busca}
          onInput={(e) => setBusca(e.currentTarget.value)}
          placeholder="Buscar por código ou título"
          aria-label="Buscar por código ou título"
          autocomplete="off"
        />
      </div>
      {visiveis.length === 0 && <p class="pj-vazio">{q ? 'Nada com esse texto.' : 'Nenhum projeto nesta obra ainda.'}</p>}
      {[...grupos].map(([disciplina, docs]) => (
        <section key={disciplina}>
          <h2 class="pj-grupo">
            {disciplina} ({docs.length})
          </h2>
          <ul class="lista">
            {docs.map((d) => {
              const vigente = dados.vigentes.get(d.id)
              const nova = (dados.revisoesDe.get(d.id) ?? []).some((r) => revisaoNova(r, dados.hoje))
              const sits = dados.situacoesDe.get(d.id) ?? []
              const recolher = sits.filter((s) => s.situacao === 'RECOLHER').length
              const conferir = sits.filter((s) => s.situacao === 'CONFERIR').length
              return (
                <li key={d.id}>
                  <button type="button" class="pj-linha" onClick={() => ir({ nome: 'prancha', documentoId: d.id })} data-codigo={d.codigo}>
                    <span>
                      <span class="codigo">{d.codigo}</span>
                      <span class="discreto">{d.titulo || 'sem título'}</span>
                    </span>
                    <span class="pj-selos">
                      <Selo classe={vigente ? 'neutro' : 'info'}>{vigente ? rotuloRevisao(vigente) : 'sem vigente'}</Selo>
                      {nova && <Selo classe="info">nova</Selo>}
                      {recolher > 0 && <Selo classe="ruim">{recolher} a recolher</Selo>}
                      {conferir > 0 && <Selo classe="info">conferir</Selo>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </main>
  )
}

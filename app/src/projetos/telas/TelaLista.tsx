import { useState } from 'preact/hooks'
import { normalizar, revisaoNova } from '../regras'
import type { Documento } from '../dados'
import type { Contexto } from './ModuloProjetos'
import { plural, rotuloRevisao, Selo, Topo } from './comum'

export function TelaLista({ ctx }: { ctx: Contexto }) {
  const { dados, ir, voltar } = ctx
  const [busca, setBusca] = useState('')
  const q = normalizar(busca.trim())
  const visiveis = q ? dados.documentos.filter((d) => d.busca.includes(q)) : dados.documentos

  const grupos = new Map<string, Documento[]>()
  for (const d of visiveis) {
    const l = grupos.get(d.disciplina)
    if (l) l.push(d)
    else grupos.set(d.disciplina, [d])
  }

  return (
    <main class="tela">
      <Topo titulo="Lista de projetos" sub={plural(dados.documentos.length, 'prancha', 'pranchas')} aoVoltar={voltar} />
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

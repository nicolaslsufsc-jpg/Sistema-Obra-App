// Modos de cor e legenda. Tocar numa categoria da legenda filtra por ela.
import { CATEGORIAS, corDoPavimento } from '../motor/categorias'
import type { ModoCor, Sessao } from '../sessao'
import { numero } from './PainelModelos'

const MODOS: Array<{ id: ModoCor; nome: string; explica: string }> = [
  { id: 'categoria', nome: 'Por categoria', explica: 'Estrutura em azul, paredes em tons claros, instalações em cores fortes.' },
  { id: 'modelo', nome: 'Por modelo', explica: 'Uma cor para cada arquivo. Bom para conferir um projeto contra o outro.' },
  { id: 'pavimento', nome: 'Por pavimento', explica: 'Do piso mais baixo (claro) ao topo (escuro).' },
  { id: 'original', nome: 'Cores do arquivo', explica: 'As cores que vieram no IFC.' },
]

export function PainelCores({ sessao }: { sessao: Sessao }) {
  const contagens = new Map<string, number>()
  for (const m of sessao.modelos) {
    m.indice.categoria.forEach((c) => {
      const nome = CATEGORIAS[c].nome
      contagens.set(nome, (contagens.get(nome) ?? 0) + 1)
    })
  }
  const marcadas = sessao.filtro.marcados.categoria
  const pavimentos = sessao.pavimentos()

  return (
    <div class="ifc-pilha">
      <div class="ifc-modos" role="radiogroup" aria-label="Modo de cor">
        {MODOS.map((m) => (
          <label key={m.id} class="ifc-modo">
            <input type="radio" name="ifc-modo-cor" checked={sessao.modoCor === m.id} onChange={() => sessao.definirModoCor(m.id)} />
            <span>
              <strong>{m.nome}</strong>
              <small>{m.explica}</small>
            </span>
          </label>
        ))}
      </div>

      <label class="ifc-opcao ifc-opcao-destaque">
        <input type="checkbox" checked={sessao.arestas} onChange={(e) => sessao.definirArestas((e.target as HTMLInputElement).checked)} />
        <span class="ifc-opcao-nome">Mostrar arestas das peças</span>
      </label>

      {sessao.modoCor === 'categoria' && (
        <section>
          <h3>Legenda</h3>
          <ul class="ifc-lista-limpa">
            {CATEGORIAS.filter((c) => contagens.has(c.nome)).map((c) => (
              <li key={c.id}>
                <label class="ifc-opcao">
                  <input type="checkbox" checked={marcadas?.has(c.nome) ?? false} onChange={() => sessao.alternarMarcado('categoria', c.nome)} aria-label={`Filtrar por ${c.nome}`} />
                  <span class="ifc-amostra ifc-amostra-pequena" style={{ background: c.cor, opacity: c.alfa < 1 ? 0.75 : 1 }} aria-hidden="true" />
                  <span class="ifc-opcao-nome">{c.nome}</span>
                  <span class="ifc-contagem">{numero(contagens.get(c.nome) ?? 0)}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sessao.modoCor === 'modelo' && (
        <section>
          <h3>Legenda</h3>
          <ul class="ifc-lista-limpa">
            {sessao.modelos.map((m) => (
              <li key={m.chave} class="ifc-legenda">
                <span class="ifc-amostra ifc-amostra-pequena" style={{ background: m.cor }} aria-hidden="true" />
                <span class="ifc-opcao-nome">{m.nome}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sessao.modoCor === 'pavimento' && (
        <section>
          <h3>Legenda</h3>
          <ul class="ifc-lista-limpa">
            {pavimentos.map((p, i) => (
              <li key={p.nome} class="ifc-legenda">
                <span class="ifc-amostra ifc-amostra-pequena" style={{ background: corDoPavimento(i, pavimentos.length) }} aria-hidden="true" />
                <span class="ifc-opcao-nome">{p.nome}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

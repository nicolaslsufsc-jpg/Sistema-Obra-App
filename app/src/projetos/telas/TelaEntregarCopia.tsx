// "Entregar cópia" (22/11/2026, pedido do Nicolas): escolher a disciplina (botões) e a prancha (lista com a
// revisão vigente). O toque na prancha abre o formulário de entrega que já existia (para quem, quantas cópias,
// assinatura). Funciona sem internet: tudo vem do aparelho. Ver projetos/entregar.ts.
import { useMemo, useState } from 'preact/hooks'
import { disciplinasParaEntregar, pranchasDaDisciplina } from '../entregar'
import type { Contexto } from './ModuloProjetos'
import { plural, rotuloRevisao, Topo } from './comum'

const LIMITE = 60

export function TelaEntregarCopia({ ctx, disciplina: inicial }: { ctx: Contexto; disciplina?: string }) {
  const { dados, obra, ir, trocar, voltar } = ctx
  const disciplinas = useMemo(() => disciplinasParaEntregar(dados), [dados])
  const disciplina = inicial && disciplinas.some((d) => d.nome === inicial) ? inicial : disciplinas.length === 1 ? disciplinas[0].nome : ''
  const [busca, setBusca] = useState('')
  const [quantas, setQuantas] = useState(LIMITE)
  const pranchas = useMemo(() => (disciplina ? pranchasDaDisciplina(dados, disciplina, busca) : []), [dados, disciplina, busca])

  return (
    <main class="tela pj-entregar" data-testid="entregar-copia">
      <Topo titulo="Entregar cópia" sub={`${obra.codigo} · ${disciplina ? 'escolha a prancha' : 'escolha a disciplina'}`} aoVoltar={voltar} />
      {disciplinas.length === 0 && <p class="pj-vazio">Ainda não há prancha com revisão vigente nesta obra. A lista vem do Autodoc e chega aqui na sincronização.</p>}

      {disciplinas.length > 0 && (
        <section class="pj-bloco">
          <h2>1. Disciplina</h2>
          {/* a escolha fica na rota: o "voltar" do aparelho volta um passo, e a tela reabre onde estava */}
          <div class="pj-filtros pj-escolha" role="group" aria-label="Disciplina" data-testid="entregar-disciplinas">
            {disciplinas.map((d) => (
              <button
                key={d.nome}
                type="button"
                aria-pressed={d.nome === disciplina}
                data-testid="entregar-disciplina"
                onClick={() => {
                  setBusca('')
                  setQuantas(LIMITE)
                  trocar({ nome: 'entregar-copia', disciplina: d.nome })
                }}
              >
                {d.nome} <b>{d.pranchas}</b>
              </button>
            ))}
          </div>
        </section>
      )}

      {disciplina && (
        <section class="pj-bloco">
          <h2>2. Prancha de {disciplina}</h2>
          <label class="pj-campo">
            <span>Buscar pelo número ou pelo título</span>
            <input type="search" value={busca} onInput={(e) => setBusca(e.currentTarget.value)} data-testid="entregar-busca" />
          </label>
          <p class="discreto" data-testid="entregar-quantas">
            {plural(pranchas.length, 'prancha', 'pranchas')}. O toque abre a entrega, já na revisão vigente.
          </p>
          {pranchas.length === 0 && <p class="pj-vazio">Nada com esse texto.</p>}
          <ul class="lista" data-testid="entregar-pranchas">
            {pranchas.slice(0, quantas).map((d) => (
              <li key={d.id}>
                <button type="button" class="pj-linha" data-testid="entregar-prancha" data-codigo={d.codigo} onClick={() => ir({ nome: 'entregar', documentoId: d.id })}>
                  <span>
                    <span class="codigo">
                      {d.numero} · {d.codigo}
                    </span>
                    <span class="discreto">{d.titulo || 'sem título'}</span>
                  </span>
                  <span class="pj-selos">
                    <span class="selo neutro">{rotuloRevisao(dados.vigentes.get(d.id))}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {pranchas.length > quantas && (
            <button type="button" class="pj-pequeno" onClick={() => setQuantas(quantas + LIMITE * 3)}>
              Mostrar mais ({pranchas.length - quantas})
            </button>
          )}
        </section>
      )}
    </main>
  )
}

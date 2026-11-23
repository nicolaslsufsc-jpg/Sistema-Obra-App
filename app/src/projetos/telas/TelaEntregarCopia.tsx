// "Entregar cópia" (22/11/2026, pedido do Nicolas): escolher a disciplina (botões) e a prancha (lista com a
// revisão vigente). Desde 23/11 ("entregar várias folhas de uma vez"): o toque MARCA a prancha; dá para marcar
// várias, filtrar por disciplina (ou todas) e pavimento, e a barra de baixo abre o formulário de entrega que já
// existia com todas as marcadas: para quem, quantas cópias de cada e UMA assinatura. Cada prancha continua
// virando o seu próprio registro de entrega. Funciona sem internet: tudo vem do aparelho. Ver projetos/entregar.ts.
import { useMemo, useState } from 'preact/hooks'
import { disciplinasParaEntregar, pavimentosDasPranchas, pranchasParaEntregar, TODAS } from '../entregar'
import type { Contexto } from './ModuloProjetos'
import { plural, rotuloRevisao, Topo } from './comum'

const LIMITE = 60
/** "Marcar as N da lista" só aparece até este tanto (evita marcar a obra inteira sem querer). */
const MARCAR_TODAS_ATE = 100

export function TelaEntregarCopia({
  ctx,
  disciplina: disciplinaInicial,
  pavimento: pavimentoInicial,
  marcadas: marcadasIniciais,
}: {
  ctx: Contexto
  disciplina?: string
  pavimento?: string
  marcadas?: string[]
}) {
  const { dados, obra, ir, trocar, voltar } = ctx
  const disciplinas = useMemo(() => disciplinasParaEntregar(dados), [dados])
  const valida = (x?: string) => !!x && (x === TODAS || disciplinas.some((d) => d.nome === x))
  const [disciplina, setDisciplina] = useState(valida(disciplinaInicial) ? disciplinaInicial! : disciplinas.length === 1 ? disciplinas[0].nome : '')
  const [pavimento, setPavimento] = useState(pavimentoInicial ?? '')
  const [busca, setBusca] = useState('')
  const [quantas, setQuantas] = useState(LIMITE)
  // as marcadas, na ordem em que foram marcadas; continuam marcadas quando o filtro muda
  const [marcadas, setMarcadas] = useState<string[]>(() => (marcasIniciaisValidas(marcadasIniciais, dados.vigentes)))
  const marcado = useMemo(() => new Set(marcadas), [marcadas])

  const daDisciplina = useMemo(() => (disciplina ? pranchasParaEntregar(dados, { disciplina }) : []), [dados, disciplina])
  const pavimentos = useMemo(() => pavimentosDasPranchas(daDisciplina), [daDisciplina])
  const pav = pavimento && pavimentos.some((p) => p.nome === pavimento) ? pavimento : ''
  const pranchas = useMemo(() => (disciplina ? pranchasParaEntregar(dados, { disciplina, pavimento: pav, busca }) : []), [dados, disciplina, pav, busca])

  const alternar = (id: string) => setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))
  const naoMarcadasDaLista = pranchas.filter((d) => !marcado.has(d.id))
  const escolherDisciplina = (nome: string) => {
    setDisciplina(nome)
    setPavimento('')
    setBusca('')
    setQuantas(LIMITE)
  }
  const entregar = () => {
    if (marcadas.length === 0) return
    // guarda filtros e marcadas na tela de agora: o "voltar" do formulário reabre a lista como estava
    trocar({ nome: 'entregar-copia', disciplina, pavimento: pav, marcadas })
    ir({ nome: 'entregar', documentoId: marcadas[0], outras: marcadas.slice(1) })
  }

  return (
    <main class="tela pj-entregar" data-testid="entregar-copia">
      <Topo titulo="Entregar cópia" sub={`${obra.codigo} · ${disciplina ? 'marque as pranchas' : 'escolha a disciplina'}`} aoVoltar={voltar} />
      {disciplinas.length === 0 && <p class="pj-vazio">Ainda não há prancha com revisão vigente nesta obra. A lista vem do Autodoc e chega aqui na sincronização.</p>}

      {disciplinas.length > 0 && (
        <section class="pj-bloco">
          <h2>1. Disciplina</h2>
          <div class="pj-filtros pj-escolha" role="group" aria-label="Disciplina" data-testid="entregar-disciplinas">
            {disciplinas.length > 1 && (
              <button type="button" aria-pressed={disciplina === TODAS} data-testid="entregar-disciplina" onClick={() => escolherDisciplina(TODAS)}>
                Todas <b>{disciplinas.reduce((s, d) => s + d.pranchas, 0)}</b>
              </button>
            )}
            {disciplinas.map((d) => (
              <button key={d.nome} type="button" aria-pressed={d.nome === disciplina} data-testid="entregar-disciplina" onClick={() => escolherDisciplina(d.nome)}>
                {d.nome} <b>{d.pranchas}</b>
              </button>
            ))}
          </div>
          {pavimentos.length > 1 && (
            <>
              <h2>Pavimento</h2>
              <div class="pj-filtros pj-escolha" role="group" aria-label="Pavimento" data-testid="entregar-pavimentos">
                <button type="button" aria-pressed={pav === ''} data-testid="entregar-pavimento" onClick={() => setPavimento('')}>
                  Todos
                </button>
                {pavimentos.map((p) => (
                  <button key={p.nome} type="button" aria-pressed={p.nome === pav} data-testid="entregar-pavimento" onClick={() => setPavimento(p.nome)}>
                    {p.nome} <b>{p.pranchas}</b>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {disciplina && (
        <section class="pj-bloco">
          <h2>2. Marque as pranchas{disciplina !== TODAS ? ` de ${disciplina}` : ''}</h2>
          <label class="pj-campo">
            <span>Buscar pelo número ou pelo título</span>
            <input type="search" value={busca} onInput={(e) => setBusca(e.currentTarget.value)} data-testid="entregar-busca" />
          </label>
          <p class="discreto" data-testid="entregar-quantas">
            {plural(pranchas.length, 'prancha', 'pranchas')}. Toque para marcar; vai a revisão vigente de cada uma.
          </p>
          {naoMarcadasDaLista.length > 1 && pranchas.length <= MARCAR_TODAS_ATE && (
            <button type="button" class="pj-pequeno" data-testid="entregar-marcar-todas" onClick={() => setMarcadas((m) => [...m, ...naoMarcadasDaLista.map((d) => d.id)])}>
              Marcar as {pranchas.length} da lista
            </button>
          )}
          {pranchas.length === 0 && <p class="pj-vazio">Nada com esse filtro.</p>}
          <ul class="lista" data-testid="entregar-pranchas">
            {pranchas.slice(0, quantas).map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  class={`pj-linha pj-marcavel${marcado.has(d.id) ? ' marcada' : ''}`}
                  role="checkbox"
                  aria-checked={marcado.has(d.id)}
                  data-testid="entregar-prancha"
                  data-codigo={d.codigo}
                  onClick={() => alternar(d.id)}
                >
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

      {marcadas.length > 0 && (
        <div class="pj-barra-entregar" data-testid="entregar-barra">
          <button type="button" class="pj-pequeno" data-testid="entregar-limpar" onClick={() => setMarcadas([])}>
            Limpar
          </button>
          <button type="button" class="principal" data-testid="entregar-seguir" onClick={entregar}>
            Entregar {plural(marcadas.length, 'prancha', 'pranchas')}
          </button>
        </div>
      )}
    </main>
  )
}

/** Só as que ainda têm revisão vigente (a lista pode ter mudado na sincronização). */
function marcasIniciaisValidas(ids: string[] | undefined, vigentes: Map<string, unknown>): string[] {
  return (ids ?? []).filter((id, i, l) => vigentes.has(id) && l.indexOf(id) === i)
}

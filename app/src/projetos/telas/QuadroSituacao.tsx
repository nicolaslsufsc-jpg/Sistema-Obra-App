// Quadro de situação no topo do painel (22/11/2026, pedido do Nicolas: "não temos nada de dashboards"):
// uma frase, uma barra empilhada por disciplina (em dia × a trocar × a conferir) e quem tem mais a trocar.
// Sem cartão de número (guia de front end): cada linha é um botão que abre as Entregas já filtradas.
import { useMemo } from 'preact/hooks'
import { situacaoPor, type CopiaCruzada, type Situacao } from '../painel'
import type { Contexto } from './ModuloProjetos'
import { plural } from './comum'

const PESSOAS = 5
const SEP = ' · '
const pct = (n: number, total: number) => `${total ? (n / total) * 100 : 0}%`

function partes(s: Situacao): string {
  const p: string[] = []
  if (s.trocar) p.push(`${s.trocar} a trocar`)
  if (s.conferir) p.push(`${s.conferir} a conferir`)
  p.push(`${s.emDia} em dia`)
  return p.join(SEP)
}

/** A barra empilhada: a largura do trilho é o total do grupo sobre o maior grupo. */
function Trilho({ s, max }: { s: Situacao; max: number }) {
  return (
    <span class="pj-sit-trilho" style={{ width: `${Math.max(8, (s.total / max) * 100)}%` }} aria-hidden="true">
      {s.trocar > 0 && <i class="trocar" style={{ width: pct(s.trocar, s.total) }} />}
      {s.conferir > 0 && <i class="conferir" style={{ width: pct(s.conferir, s.total) }} />}
      {s.emDia > 0 && <i class="emdia" style={{ width: pct(s.emDia, s.total) }} />}
    </span>
  )
}

export function QuadroSituacao({ cruzadas, ir }: { cruzadas: readonly CopiaCruzada[]; ir: Contexto['ir'] }) {
  // Agrupa pela chave da disciplina (a ficha diz "ESTRUTURAL" e o servidor "Estrutura": é a mesma), com o nome
  // do servidor quando houver; a busca das Entregas acha pela chave.
  const porDisc = useMemo(() => situacaoPor(cruzadas, (x) => x.copia.disciplina), [cruzadas])
  const nomeDisc = useMemo(() => {
    const m = new Map<string, string>()
    for (const x of cruzadas) if (x.copia.app || !m.has(x.copia.disciplina)) m.set(x.copia.disciplina, x.copia.disciplinaNome || x.copia.disciplina)
    return m
  }, [cruzadas])
  const porPessoa = useMemo(
    () => situacaoPor(cruzadas, (x) => `${x.copia.empresa}${x.copia.colaborador ? SEP + x.copia.colaborador : ''}`).filter((s) => s.trocar > 0),
    [cruzadas],
  )
  const t = porDisc.reduce(
    (a, s) => ({ emDia: a.emDia + s.emDia, trocar: a.trocar + s.trocar, conferir: a.conferir + s.conferir, total: a.total + s.total }),
    { emDia: 0, trocar: 0, conferir: 0, total: 0 },
  )
  if (!t.total) return null
  const maxDisc = Math.max(1, ...porDisc.map((s) => s.total))
  const maxPessoa = Math.max(1, ...porPessoa.map((s) => s.trocar))
  // a busca das Entregas acha por empresa, colaborador e disciplina: vale o último pedaço do nome
  const busca = (nome: string) => nome.split(SEP).pop() ?? nome
  return (
    <section class="pj-bloco pj-sit" data-testid="quadro-situacao">
      <h2>Situação das cópias em campo</h2>
      <p data-testid="quadro-frase">
        <b>{plural(t.total, 'cópia em campo', 'cópias em campo')}</b>: {t.trocar} a trocar, {t.conferir} a conferir, {t.emDia} em dia.
      </p>
      <p class="pj-sit-legenda discreto" aria-hidden="true">
        <span>
          <i class="trocar" /> a trocar
        </span>
        <span>
          <i class="conferir" /> a conferir
        </span>
        <span>
          <i class="emdia" /> em dia
        </span>
      </p>
      <h3>Por disciplina</h3>
      <ul class="pj-sit-lista" data-testid="quadro-disciplinas">
        {porDisc.map((s) => (
          <li key={s.nome}>
            <button type="button" class="pj-sit-linha" data-testid="quadro-disciplina" onClick={() => ir({ nome: 'entregas-base', filtro: 'em campo', busca: s.nome })}>
              <b>{nomeDisc.get(s.nome) ?? s.nome}</b>
              <span class="discreto">{partes(s)}</span>
              <Trilho s={s} max={maxDisc} />
            </button>
          </li>
        ))}
      </ul>
      {porPessoa.length > 0 && (
        <>
          <h3>Quem tem mais cópias a trocar</h3>
          <ul class="pj-sit-lista" data-testid="quadro-pessoas">
            {porPessoa.slice(0, PESSOAS).map((s) => (
              <li key={s.nome}>
                <button type="button" class="pj-sit-linha" data-testid="quadro-pessoa" onClick={() => ir({ nome: 'entregas-base', filtro: 'desatualizada', busca: busca(s.nome) })}>
                  <b>{s.nome}</b>
                  <span class="discreto">{s.trocar} a trocar</span>
                  <span class="pj-sit-trilho" style={{ width: `${Math.max(8, (s.trocar / maxPessoa) * 100)}%` }} aria-hidden="true">
                    <i class="trocar" style={{ width: '100%' }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {porPessoa.length > PESSOAS && (
            <button type="button" class="pj-pequeno secundario" onClick={() => ir({ nome: 'agora' })}>
              Ver as {porPessoa.length} pessoas em Fazer agora
            </button>
          )}
        </>
      )}
    </section>
  )
}

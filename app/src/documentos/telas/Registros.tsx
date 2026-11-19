// Registros dos módulos na lista mestra da obra (só leitura): fichas da FVS, concretagens e CPs do
// Concreto, relatórios de Qualidade abertos como NC. Cada grupo diz em que módulo o registro está.
import { dataBR } from '../../relatorios/regras'
import { NOME_DA_SITUACAO_NC, type Ligacoes } from '../ligacoes'

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

// Abrir o registro direto no outro módulo pede a casca (núcleo) e uma entrada nova na FVS e no Concreto:
// fica para quando o Nicolas aprovar. Por enquanto, o caminho por extenso.
function Onde({ modulo }: { modulo: string }) {
  return <p class="discreto doc-onde">Para abrir: menu da obra › {modulo}</p>
}

export function Registros({ ligacoes }: { ligacoes: Ligacoes }) {
  const { fichas, concretagens, ncs } = ligacoes
  return (
    <section class="doc-registros" data-testid="registros-modulos">
      <h2>Registros dos módulos</h2>
      <p class="discreto">Só leitura: estes registros são feitos e corrigidos no próprio módulo.</p>

      <section class="doc-grupo" data-testid="registros-fvs">
        <h3>FVS · fichas de verificação</h3>
        {fichas.length === 0 ? (
          <p class="discreto">Nenhuma ficha no aparelho.</p>
        ) : (
          <ul class="lista">
            {fichas.map((f) => (
              <li key={f.codigo} class="doc-registro">
                <strong>
                  <span class="doc-codigo">{f.codigo}</span> {f.titulo}
                </strong>
                <span class="discreto">
                  rev. {f.revisao} · {plural(f.pecasVerificadas, 'peça verificada', 'peças verificadas')} · {plural(f.marcacoes, 'marcação', 'marcações')}
                  {f.abertas > 0 ? ` · ${plural(f.abertas, 'ficha aberta', 'fichas abertas')} no histórico` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Onde modulo="FVS" />
      </section>

      <section class="doc-grupo" data-testid="registros-concreto">
        <h3>Concreto · concretagens e corpos de prova</h3>
        {concretagens.length === 0 ? (
          <p class="discreto">Nenhuma concretagem registrada.</p>
        ) : (
          <ul class="lista">
            {concretagens.map((c) => (
              <li key={c.raiz} class="doc-registro">
                <strong>
                  {dataBR(c.data)} · {c.exemplo ? 'EXEMPLO · ' : ''}
                  {c.local || 'sem local'}
                </strong>
                <span class="discreto">
                  fck {c.fck} MPa · {plural(c.caminhoes, 'caminhão', 'caminhões')} · {plural(c.cpsMoldados, 'CP moldado', 'CPs moldados')} · {plural(c.cpsRompidos, 'rompido', 'rompidos')}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Onde modulo="Concreto" />
      </section>

      <section class="doc-grupo" data-testid="registros-nc">
        <h3>Não conformidades abertas (relatórios de Qualidade)</h3>
        {ncs.length === 0 ? (
          <p class="discreto">Nenhuma NC aberta.</p>
        ) : (
          <ul class="lista">
            {ncs.map((n) => (
              <li key={n.raiz} class="doc-registro">
                <strong>{n.titulo}</strong>
                <span class="discreto">
                  {dataBR(n.data)} · {NOME_DA_SITUACAO_NC[n.situacao]}
                  {n.prazo ? ` · prazo ${dataBR(n.prazo)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Onde modulo="Relatórios" />
      </section>
    </section>
  )
}

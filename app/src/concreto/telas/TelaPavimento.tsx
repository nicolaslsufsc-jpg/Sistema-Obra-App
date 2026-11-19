import { dataLocal, piorSituacao } from '../cps'
import { piorDoCaminhao, podeRegistrar } from '../dados'
import type { Contexto } from './ModuloConcreto'
import { dataBR, numBR, plural, Selo, Topo } from './comum'
import { nomeDaConcretagem } from '../exemplo'

export function TelaPavimento({ ctx, pavimentoId }: { ctx: Contexto; pavimentoId: string }) {
  const { dados, obra, ir, voltar } = ctx
  const pav = dados.pavimentos.find((p) => p.id === pavimentoId)
  const hoje = dataLocal(new Date())
  const concs = dados.concretagens.filter((c) => c.pavimento_id === pavimentoId)
  const pecas = dados.pecasDoPavimento.get(pavimentoId) ?? []

  return (
    <main class="tela">
      <Topo titulo={pav?.nome ?? 'Pavimento'} sub={`${obra.codigo} · Concreto`} aoVoltar={voltar} />

      <div class="acoes">
        {podeRegistrar(obra.papel) && (
          <button type="button" class="principal" onClick={() => ir({ nome: 'nova-concretagem', pavimentoId })}>
            + Nova concretagem
          </button>
        )}
        <button type="button" onClick={() => ir({ nome: 'mapa', pavimentoId })}>
          Mapa do pavimento
        </button>
      </div>
      <p class="discreto">{pecas.length > 0 ? `${plural(pecas.length, 'peça cadastrada', 'peças cadastradas')} neste pavimento.` : 'Nenhuma peça cadastrada neste pavimento (a FVS cadastra as peças ao publicar a planta).'}</p>

      <h2>Concretagens</h2>
      {concs.length === 0 ? (
        <p class="discreto" data-testid="pavimento-vazio">
          {podeRegistrar(obra.papel) ? 'Nenhuma concretagem neste pavimento. Toque em Nova concretagem para começar.' : 'Nenhuma concretagem neste pavimento.'}
        </p>
      ) : (
        <ul class="lista">
          {concs.map((c) => {
            const cams = dados.caminhoesDe.get(c.raiz) ?? []
            const volume = cams.reduce((s, x) => s + (x.volume_m3 ?? 0), 0)
            const pior = piorSituacao(cams.map((x) => piorDoCaminhao(dados, x, c, hoje)).filter((s) => s !== null))
            return (
              <li key={c.raiz}>
                <button type="button" class="cc-linha" onClick={() => ir({ nome: 'concretagem', raiz: c.raiz })}>
                  <span>
                    <strong>
                      {dataBR(c.data)} · {nomeDaConcretagem(c)}
                    </strong>
                    <span class="discreto">
                      fck {numBR(c.fck_mpa)} MPa · {plural(cams.length, 'caminhão', 'caminhões')} · {numBR(volume)} m³
                      {c.codigo_construpoint ? ` · ${c.codigo_construpoint}` : ''}
                    </span>
                  </span>
                  {pior && <Selo situacao={pior} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}

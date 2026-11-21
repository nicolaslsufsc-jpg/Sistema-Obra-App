import { dataLocal, GRAVIDADE } from '../cps'
import { concretagemDe, piorDoCaminhao } from '../dados'
import { diasComConcretagem } from '../ficha_concreto'
import type { Contexto } from './ModuloConcreto'
import { dataBR, numBR, plural, Selo, Topo } from './comum'
import { nomeDaConcretagem } from '../exemplo'
import { SecaoFvm } from './TelasFvm'
import { SecaoPlanilha } from './SecaoPlanilha'

export function TelaInicio({ ctx, aoSair }: { ctx: Contexto; aoSair: () => void }) {
  const { dados, obra, ir } = ctx
  const hoje = dataLocal(new Date())

  // caminhões com laudo atrasado ou abaixo do fck, de todos os pavimentos
  const alertas = dados.caminhoes
    .map((c) => {
      const conc = concretagemDe(dados, c)
      return conc ? { c, conc, pior: piorDoCaminhao(dados, c, conc, hoje) } : null
    })
    .filter((x): x is NonNullable<typeof x> => !!x && (x.pior === 'atrasado' || x.pior === 'abaixo_fck'))
    .sort((a, b) => GRAVIDADE[a.pior!] - GRAVIDADE[b.pior!] || a.conc.data.localeCompare(b.conc.data))
  const nomePav = new Map(dados.pavimentos.map((p) => [p.id, p.nome]))
  const dias = diasComConcretagem(dados.concretagens).slice(0, 10)

  return (
    <main class="tela">
      <Topo titulo="Concreto" sub={`${obra.codigo} · rastreabilidade por peça`} aoVoltar={aoSair} paraMenu />

      {alertas.length > 0 && (
        <section class="cartao cc-alertas" data-testid="alertas">
          <h2>Laudos que pedem atenção ({alertas.length})</h2>
          <ul class="lista">
            {alertas.slice(0, 30).map(({ c, conc, pior }) => (
              <li key={c.raiz}>
                <button type="button" class="cc-linha" onClick={() => ir({ nome: 'caminhao', raiz: c.raiz })}>
                  <span>
                    <strong>
                      Caminhão {c.sequencia}
                      {c.nota_fiscal ? ` · NF ${c.nota_fiscal}` : ''}
                    </strong>
                    <span class="discreto">
                      {nomePav.get(conc.pavimento_id)} · {dataBR(conc.data)} · {nomeDaConcretagem(conc)}
                    </span>
                  </span>
                  <Selo situacao={pior!} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ctx.fvm && <SecaoFvm ctx={ctx} fvm={ctx.fvm} />}

      <h2>Pavimentos</h2>
      {dados.pavimentos.length === 0 ? (
        <p class="discreto">Nenhum pavimento cadastrado nesta obra ainda.</p>
      ) : (
        <ul class="lista">
          {dados.pavimentos.map((p) => {
            const concs = dados.concretagens.filter((c) => c.pavimento_id === p.id)
            const cams = concs.flatMap((c) => dados.caminhoesDe.get(c.raiz) ?? [])
            const volume = cams.reduce((s, c) => s + (c.volume_m3 ?? 0), 0)
            const ruins = cams.filter((c) => {
              const conc = concs.find((x) => x.raiz === c.concretagem_id)!
              const pior = piorDoCaminhao(dados, c, conc, hoje)
              return pior === 'atrasado' || pior === 'abaixo_fck'
            }).length
            return (
              <li key={p.id}>
                <button type="button" class="cc-linha" onClick={() => ir({ nome: 'pavimento', pavimentoId: p.id })}>
                  <span>
                    <strong>{p.nome}</strong>
                    <span class="discreto">
                      {concs.length === 0
                        ? 'nenhuma concretagem'
                        : `${plural(concs.length, 'concretagem', 'concretagens')} · ${plural(cams.length, 'caminhão', 'caminhões')} · ${numBR(volume)} m³`}
                    </span>
                  </span>
                  {ruins > 0 && <Selo situacao="atrasado" texto={`${ruins} com problema`} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {dias.length > 0 && (
        <section data-testid="fichas-concreto">
          <h2>Ficha de concreto por dia</h2>
          <p class="discreto">Os caminhões do dia, de todos os pavimentos, prontos para colar na planilha da obra.</p>
          <ul class="lista">
            {dias.map((d) => {
              const concs = dados.concretagens.filter((c) => c.data === d)
              const cams = concs.flatMap((c) => dados.caminhoesDe.get(c.raiz) ?? [])
              const volume = cams.reduce((s, c) => s + (c.volume_m3 ?? 0), 0)
              return (
                <li key={d}>
                  <button type="button" class="cc-linha" onClick={() => ir({ nome: 'ficha', data: d })}>
                    <span>
                      <strong>{dataBR(d)}</strong>
                      <span class="discreto">
                        {plural(concs.length, 'concretagem', 'concretagens')} · {plural(cams.length, 'caminhão', 'caminhões')} · {numBR(volume)} m³
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <SecaoPlanilha ctx={ctx} />
    </main>
  )
}

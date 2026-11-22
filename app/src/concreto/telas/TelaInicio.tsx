import { useState } from 'preact/hooks'
import { dataLocal } from '../cps'
import { lotesComAlerta, resumoDasIdades } from '../laudos_lote'
import { diasComConcretagem } from '../ficha_concreto'
import type { Contexto } from './ModuloConcreto'
import { dataBR, numBR, plural, Selo, Topo } from './comum'
import { nomeDaConcretagem } from '../exemplo'
import { SecaoFvm } from './TelasFvm'
import { SecaoPlanilha } from './SecaoPlanilha'

export function TelaInicio({ ctx, aoSair }: { ctx: Contexto; aoSair: () => void }) {
  const { dados, obra, ir } = ctx
  const hoje = dataLocal(new Date())

  // laudos atrasados ou abaixo do fck, por lote (a concretagem inteira), de todos os pavimentos
  const lotes = lotesComAlerta(dados, hoje)
  const camsComAlerta = lotes.reduce((n, l) => n + l.caminhoes.length, 0)
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(new Set())
  const alternar = (raiz: string) =>
    setAbertos((a) => {
      const n = new Set(a)
      if (n.has(raiz)) n.delete(raiz)
      else n.add(raiz)
      return n
    })
  const nomePav = new Map(dados.pavimentos.map((p) => [p.id, p.nome]))
  const dias = diasComConcretagem(dados.concretagens).slice(0, 10)

  return (
    <main class="tela">
      <Topo titulo="Concreto" sub={`${obra.codigo} · rastreabilidade por peça`} aoVoltar={aoSair} paraMenu />

      {/* "Laudos depois dos pavimentos" (Nicolas, 21/11): primeiro o mapa por pavimento, depois os alertas de laudo */}
      <h2>Pavimentos</h2>
      {dados.pavimentos.length === 0 ? (
        <p class="discreto">Nenhum pavimento cadastrado nesta obra ainda.</p>
      ) : (
        <ul class="lista">
          {dados.pavimentos.map((p) => {
            const concs = dados.concretagens.filter((c) => c.pavimento_id === p.id)
            const cams = concs.flatMap((c) => dados.caminhoesDe.get(c.raiz) ?? [])
            const volume = cams.reduce((s, c) => s + (c.volume_m3 ?? 0), 0)
            const ruins = lotes.filter((l) => l.concretagem.pavimento_id === p.id).length
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
                  {ruins > 0 && <Selo situacao="atrasado" texto={`${plural(ruins, 'lote', 'lotes')} com problema`} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {lotes.length > 0 && (
        <section class="cartao cc-alertas" data-testid="alertas">
          <h2>
            Laudos que pedem atenção: {plural(lotes.length, 'lote', 'lotes')} ({plural(camsComAlerta, 'caminhão', 'caminhões')})
          </h2>
          <ul class="lista">
            {lotes.map((l) => {
              const conc = l.concretagem
              const aberto = abertos.has(conc.raiz)
              const total = dados.caminhoesDe.get(conc.raiz)?.length ?? l.caminhoes.length
              return (
                <li key={conc.raiz} data-testid="alerta-lote">
                  <button type="button" class="cc-linha" aria-expanded={aberto} onClick={() => alternar(conc.raiz)}>
                    <span>
                      <strong>
                        {dataBR(conc.data)} · {nomeDaConcretagem(conc)}
                      </strong>
                      <span class="discreto">
                        {nomePav.get(conc.pavimento_id)} · {l.caminhoes.length === total ? plural(total, 'caminhão', 'caminhões') : `${l.caminhoes.length} de ${plural(total, 'caminhão', 'caminhões')}`}
                      </span>
                      <span class="discreto">{resumoDasIdades(l)}</span>
                    </span>
                    <Selo situacao={l.pior} />
                  </button>
                  {aberto && (
                    <ul class="lista cc-alerta-caminhoes" data-testid="alerta-caminhoes">
                      {l.caminhoes.map(({ caminhao: c, pior }) => (
                        <li key={c.raiz}>
                          <button type="button" class="cc-linha" onClick={() => ir({ nome: 'caminhao', raiz: c.raiz })}>
                            <span>
                              <strong>
                                Caminhão {c.sequencia}
                                {c.nota_fiscal ? ` · NF ${c.nota_fiscal}` : ''}
                              </strong>
                            </span>
                            <Selo situacao={pior} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {ctx.fvm && <SecaoFvm ctx={ctx} fvm={ctx.fvm} />}

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

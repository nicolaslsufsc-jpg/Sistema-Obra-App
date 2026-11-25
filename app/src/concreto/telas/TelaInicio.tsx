import { useState } from 'preact/hooks'
import { dataLocal } from '../cps'
import { lotesComAlerta, resumoDasIdades } from '../laudos_lote'
import { diasComConcretagem } from '../ficha_concreto'
import type { Contexto } from './ModuloConcreto'
import { dataBR, plural, Selo, Topo } from './comum'
import { piorSituacao } from '../cps'
import { piorDoCaminhao } from '../dados'
import { EtiquetaStatus, Tabela, type ColunaTabela, type Status } from '../../telas/Tabela'
import { nomeDaConcretagem } from '../exemplo'
import { SecaoFvm } from './TelasFvm'
import { SecaoPlanilha } from './SecaoPlanilha'

interface LinhaPavimento {
  id: string
  nome: string
  concretagens: number | null
  caminhoes: number | null
  volume: number | null
  status: { s: Status; texto: string }
}

// tabela de referência do guia (docs/DESIGN.md › Tela de referência: Concreto)
const COLUNAS_PAVIMENTO: ColunaTabela<LinhaPavimento>[] = [
  { titulo: 'Pavimento', valor: (l) => l.nome },
  { titulo: 'Concretagens', tituloCurto: 'Conc.', valor: (l) => l.concretagens, numero: true },
  { titulo: 'Caminhões', tituloCurto: 'Cam.', valor: (l) => l.caminhoes, numero: true },
  { titulo: 'Volume (m³)', tituloCurto: 'm³', valor: (l) => l.volume, numero: true, casas: 1 },
  { titulo: 'Status', valor: (l) => <EtiquetaStatus status={l.status.s}>{l.status.texto}</EtiquetaStatus> },
]

interface LinhaDia {
  data: string
  concretagens: number
  caminhoes: number
  volume: number | null
}

const COLUNAS_DIA: ColunaTabela<LinhaDia>[] = [
  { titulo: 'Data', valor: (l) => dataBR(l.data), numero: true },
  { titulo: 'Concretagens', tituloCurto: 'Conc.', valor: (l) => l.concretagens || null, numero: true },
  { titulo: 'Caminhões', tituloCurto: 'Cam.', valor: (l) => l.caminhoes || null, numero: true },
  { titulo: 'Volume (m³)', tituloCurto: 'm³', valor: (l) => l.volume, numero: true, casas: 1 },
]

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
  const linhaDoPavimento = (p: (typeof dados.pavimentos)[number]): LinhaPavimento => {
    const concs = dados.concretagens.filter((c) => c.pavimento_id === p.id)
    const pares = concs.flatMap((c) => (dados.caminhoesDe.get(c.raiz) ?? []).map((cam) => [cam, c] as const))
    const ruins = lotes.filter((l) => l.concretagem.pavimento_id === p.id).length
    const pior = piorSituacao(pares.map(([cam, c]) => piorDoCaminhao(dados, cam, c, hoje)).filter((s) => s !== null))
    let status: LinhaPavimento['status']
    if (concs.length === 0) status = { s: 'sem-dado', texto: 'Sem dado' }
    else if (ruins > 0) status = { s: 'nc', texto: `${plural(ruins, 'lote', 'lotes')} com problema` }
    else if (pior === 'conforme') status = { s: 'liberado', texto: 'Conforme' }
    else status = { s: 'pendente', texto: 'Em andamento' }
    return {
      id: p.id,
      nome: p.nome,
      concretagens: concs.length || null,
      caminhoes: pares.length || null,
      volume: pares.length ? pares.reduce((s, [cam]) => s + (cam.volume_m3 ?? 0), 0) : null,
      status,
    }
  }

  return (
    <main class="tela">
      <Topo titulo="Concreto" sub={`${obra.codigo} · rastreabilidade por peça`} aoVoltar={aoSair} paraMenu />

      {/* "Laudos depois dos pavimentos" (Nicolas, 21/11): primeiro o mapa por pavimento, depois os alertas de laudo */}
      <h2>Pavimentos</h2>
      {dados.pavimentos.length === 0 ? (
        <p class="discreto">Sem pavimentos</p>
      ) : (
        <Tabela
          rotulo="Pavimentos"
          testid="tabela-pavimentos"
          colunas={COLUNAS_PAVIMENTO}
          linhas={dados.pavimentos.map((p) => linhaDoPavimento(p))}
          chave={(l) => l.id}
          aoTocar={(l) => ir({ nome: 'pavimento', pavimentoId: l.id })}
        />
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
          <h2>Ficha do dia</h2>
          <Tabela
            rotulo="Ficha do dia"
            colunas={COLUNAS_DIA}
            linhas={dias.map((d) => {
              const concs = dados.concretagens.filter((c) => c.data === d)
              const cams = concs.flatMap((c) => dados.caminhoesDe.get(c.raiz) ?? [])
              return { data: d, concretagens: concs.length, caminhoes: cams.length, volume: cams.length ? cams.reduce((s, c) => s + (c.volume_m3 ?? 0), 0) : null }
            })}
            chave={(l) => l.data}
            aoTocar={(l) => ir({ nome: 'ficha', data: l.data })}
          />
        </section>
      )}

      <SecaoPlanilha ctx={ctx} />
    </main>
  )
}

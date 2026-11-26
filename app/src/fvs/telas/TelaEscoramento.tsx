// Escoramento e desforma por pavimento (item 3.6 da lista de conferências, 21/11/2026). Só aviso: o app
// não impede marcar antes do prazo (decisão do Nicolas de 18/11); quem decide é a obra. A conta é a mesma
// do selo do prazo no painel da peça (prazos.ts), aqui reunida para o pavimento inteiro (escoramento.ts).
import { useEffect, useMemo, useState } from 'preact/hooks'
import { contagemDoEscoramento, listaDoEscoramento, textoDaLinha, type LinhaDoEscoramento } from '../escoramento'
import { apoiosDaObra, avisosPorResidencial, situacaoDoAviso, textoDoQueFalta, TITULO_DO_GRUPO, type ApoiosDaPeca } from '../escoramento_residencial'
import { estruturaNoAparelho } from '../pacote'
import type { Prazo } from '../regras'
import { usarIrAtePeca } from './IrAtePeca'
import type { ContextoFvs } from './ModuloFvs'

const NOME_TIPO: Record<string, string> = { P: 'Pilar', V: 'Viga', L: 'Laje' }

interface LinhaNaTela extends LinhaDoEscoramento {
  chave: string
  pavimentoId: string
  local: null
  plantaMarcada: string | null
  prazo: Prazo
}

export function TelaEscoramento({ ctx, aviso }: { ctx: ContextoFvs; aviso: string }) {
  const { dados, ir, voltar } = ctx
  // a data muda à meia-noite: a tela usa a hora em que foi aberta
  const [agora] = useState(() => new Date())
  const lista = useMemo(() => listaDoEscoramento(dados, agora), [dados, agora])
  // avisos por residencial (3.8, 23/11): viga e laje entram pelos pilares que as apoiam, lidos das plantas
  // guardadas no aparelho; até a leitura terminar, só os pilares
  const comResidenciais = !!dados.regras.residenciais?.length && dados.regras.prazos.length > 0
  const [apoios, setApoios] = useState<ReadonlyMap<string, ApoiosDaPeca>>(() => new Map())
  useEffect(() => {
    if (!comResidenciais) return
    let vivo = true
    estruturaNoAparelho()
      .then((plantas) => {
        if (vivo) setApoios(apoiosDaObra(plantas, dados.pecaPorId, [...dados.areaPorId.values()]))
      })
      .catch((e) => console.error('FVS: leitura das plantas para o escoramento', e))
    return () => {
      vivo = false
    }
  }, [comResidenciais, dados])
  const avisos = useMemo(() => (comResidenciais ? avisosPorResidencial(dados, apoios, agora) : []), [comResidenciais, dados, apoios, agora])
  const total = contagemDoEscoramento(lista)
  const [pavimentoId, setPavimentoId] = useState('')
  const visiveis = pavimentoId ? lista.filter((pv) => pv.pavimentoId === pavimentoId) : lista
  const { abrir, erro, ofertaDaLinha } = usarIrAtePeca<LinhaNaTela>(ctx, (l, plantaId) => {
    ir({ nome: 'planta', plantaId, pecaId: l.pecaId, item: l.prazo.item })
  })
  // a planta em que a peça foi marcada por último ajuda a achar o trecho
  const plantaDe = (pecaId: string) => {
    const evs = dados.eventosDe.get(pecaId) ?? []
    for (let i = evs.length - 1; i >= 0; i--) if (evs[i].planta_id) return evs[i].planta_id
    return null
  }

  return (
    <main class="tela fv-inicio fv-escoramento">
      {/* cabeçalho comum (22/11, guia: só a seta, no canto esquerdo, como nos níveis do menu) */}
      <header class="so-cabecalho fv-topo-inicio fv-topo-nivel">
        <button type="button" class="fv-voltar so-cab-voltar" onClick={voltar} aria-label="Voltar" title="Voltar">
          <span aria-hidden="true">‹</span>
        </button>
        <div class="so-cab-titulo">
          <h1>Escoramento e desforma</h1>
          <p class="discreto" data-testid="fvs-esc-contagem">
            {total.podem} {total.podem === 1 ? 'pode retirar' : 'podem retirar'} · {total.aguardam} {total.aguardam === 1 ? 'aguardando' : 'aguardando'}
          </p>
        </div>
      </header>
      {aviso && <p class="faixa-aviso">{aviso}</p>}
      <p class="discreto fv-esc-dica">Só aviso: o prazo conta da concretagem (ou do item que a regra diz) e o app não impede marcar antes.</p>
      {erro && (
        <p class="erro" role="alert">
          {erro}
        </p>
      )}
      {avisos.length > 0 && (
        <section class="cartao fv-esc-pavimento fv-esc-residenciais" data-testid="fvs-esc-residenciais">
          <h2>Por residencial</h2>
          <ul class="fv-esc-avisos">
            {avisos.map((a) => (
              <li key={a.chave} class={`fv-esc-aviso${a.pode ? ' pode' : ''}`} data-testid="fvs-esc-aviso">
                <b>
                  {a.residencial} · {a.pavimento}
                </b>
                <span class="fv-esc-aviso-grupo">{TITULO_DO_GRUPO[a.grupo]}</span>
                <span class={`fv-rep-res ${a.pode ? 'r-ok' : 'fv-esc-espera'}`} data-testid="fvs-esc-aviso-situacao">
                  {situacaoDoAviso(a, agora)}
                </span>
                {a.faltam.length > 0 && <span class="discreto fv-esc-falta">{textoDoQueFalta(a)}</span>}
              </li>
            ))}
          </ul>
          <p class="discreto">Viga e laje entram pelos pilares que as apoiam, nas plantas baixadas neste aparelho. Peça na divisa conta nos dois residenciais.</p>
        </section>
      )}
      {!dados.regras.prazos.length ? (
        <p class="discreto" data-testid="fvs-esc-sem-regras">
          A obra não tem prazos nas regras. Quem cuida do cadastro põe no arquivo das regras da obra.
        </p>
      ) : !lista.length ? (
        <p class="discreto" data-testid="fvs-esc-vazia">
          Nenhuma peça concretada com prazo em aberto.
        </p>
      ) : (
        <>
          {lista.length > 1 && (
            <label class="fv-esc-filtro">
              Pavimento
              <select data-testid="fvs-esc-pavimento" value={pavimentoId} onChange={(ev) => setPavimentoId((ev.target as HTMLSelectElement).value)}>
                <option value="">Todos</option>
                {lista.map((pv) => (
                  <option key={pv.pavimentoId} value={pv.pavimentoId}>
                    {pv.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          {visiveis.map((pv) => (
            <section key={pv.pavimentoId} class="cartao fv-esc-pavimento" data-testid="fvs-esc-pavimento-cartao">
              <h2>{pv.nome}</h2>
              {pv.grupos.map((g) => (
                <div key={g.prazo.id} class="fv-esc-grupo" data-testid="fvs-esc-grupo">
                  <h3>
                    {g.titulo} <span class="discreto">· {g.prazo.dias} dias</span>
                  </h3>
                  <ul class="fv-rep-lista">
                    {g.linhas.map((l) => {
                      const linha: LinhaNaTela = { ...l, chave: `${g.prazo.id}|${l.pecaId}`, pavimentoId: pv.pavimentoId, local: null, plantaMarcada: plantaDe(l.pecaId), prazo: g.prazo }
                      return (
                        <li key={linha.chave} data-testid="fvs-esc-linha">
                          <button type="button" class="fv-rep fv-esc-linha" onClick={() => abrir(linha)}>
                            <span class="fv-rep-topo">
                              <b class="fv-rep-peca">{l.nome}</b>
                              <span class="fv-rep-onde">{NOME_TIPO[l.tipo] ?? l.tipo}</span>
                              <span class={`fv-rep-res ${l.pode ? 'r-ok' : 'fv-esc-espera'}`} data-testid="fvs-esc-situacao">
                                {textoDaLinha(l)}
                              </span>
                            </span>
                          </button>
                          {ofertaDaLinha(linha)}
                        </li>
                      )
                    })}
                  </ul>
                  {g.semInicio > 0 && (
                    <p class="discreto" data-testid="fvs-esc-sem-inicio">
                      {g.semInicio === 1 ? '1 peça ainda sem concretagem marcada.' : `${g.semInicio} peças ainda sem concretagem marcada.`}
                    </p>
                  )}
                </div>
              ))}
            </section>
          ))}
        </>
      )}
    </main>
  )
}

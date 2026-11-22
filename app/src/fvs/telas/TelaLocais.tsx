// Locais fora da planta (21/11/2026): blocos de fundação, trechos de cortina, paredes de concreto aparente
// e outros locais do sistema oficial que não são peça da prancha (locais_sistema). A lista mostra os que
// têm ficha aberta ou marcação; cada local abre como uma peça sem planta: as fichas abertas dele, os
// itens com o último resultado e, para quem pode marcar, C, NC e NA (o registro vai em local_id).
import { useMemo, useRef, useState } from 'preact/hooks'
import type { Linha } from '../../nucleo/banco_local'
import { ligarDepoisDe, observar, podeRegistrar, prazoDoItemNaPeca, quemMarcou, textoDoErroDeGravacao, tocarItem, type Contexto } from '../dados'
import { dia, quando } from '../formato'
import { filtrarGrupos, gruposDeLocais } from '../locais'
import { observacaoDoPrazo, perguntaDoPrazo, seloDoPrazo } from '../prazos'
import {
  daFichaAberta,
  fichaSoNoApp,
  historico,
  NOME_DO_RESULTADO,
  ordenarFichasAbertas,
  reprovacoesDoItem,
  ROTULO_SITUACAO,
  rotuloRodada,
  SO_NO_APP,
  situacaoDaFichaAberta,
  ultimosPorItem,
  type EventoFvs,
  type Ficha,
  type FichaCampo,
} from '../situacao'
import { anotarToque, esquecerToque, type Toque } from '../toques'
import { CampoNc } from './CampoNc'
import type { ContextoFvs } from './ModuloFvs'
import '../../telas/cabecalho.css'

export function TelaLocais({ ctx, aviso }: { ctx: ContextoFvs; aviso: string }) {
  const { dados, voltar, ir, sistema } = ctx
  const [busca, setBusca] = useState('')
  const grupos = useMemo(() => gruposDeLocais(dados), [dados])
  const vistos = filtrarGrupos(grupos, busca)
  const total = grupos.reduce((n, g) => n + g.locais.length, 0)

  return (
    <main class="tela fv-inicio fv-locais">
      <header class="so-cabecalho fv-topo-inicio">
        <button type="button" class="fv-voltar so-cab-voltar" onClick={voltar} aria-label="Voltar">
          <span aria-hidden="true">‹</span>
        </button>
        <div class="so-cab-titulo">
          <h1>Locais fora da planta</h1>
          <p class="discreto">
            Blocos, cortinas, paredes e outros locais {sistema ? `do ${sistema.nome}` : 'do sistema oficial'} que não são peça da prancha.
          </p>
        </div>
      </header>
      {aviso && <p class="aviso">{aviso}</p>}
      {total === 0 ? (
        <p data-testid="fvs-locais-vazio">Nenhum local fora da planta tem ficha ou marcação nesta obra.</p>
      ) : (
        <>
          {total > 8 && (
            <input type="search" class="fv-locais-busca" placeholder="Buscar local" aria-label="Buscar local" value={busca} onInput={(e) => setBusca((e.target as HTMLInputElement).value)} />
          )}
          {vistos.length === 0 && <p class="discreto">Nenhum local com esse nome.</p>}
          {vistos.map((g) => (
            <section key={g.titulo} class="fv-locais-grupo" data-testid="fvs-locais-grupo">
              {g.titulo && <h2>{g.titulo}</h2>}
              <ul class="lista">
                {g.locais.map((l) => (
                  <li key={l.local.id}>
                    <button type="button" class="fv-local-linha" data-testid="fvs-local" onClick={() => ir({ nome: 'local', localId: l.local.id })}>
                      <span class="fv-local-nome">
                        <strong>{l.local.nome}</strong>
                        <span class="discreto">
                          {l.fichas > 0 && `${l.fichas === 1 ? '1 ficha' : `${l.fichas} fichas`}`}
                          {l.fichas > 0 && l.registros > 0 && ' · '}
                          {l.registros > 0 && `${l.registros === 1 ? '1 marcação' : `${l.registros} marcações`}`}
                          {l.local.apagado_no_sistema && ' · apagado no sistema'}
                        </span>
                      </span>
                      <span class={`fv-sit s-${l.situacao}`}>{ROTULO_SITUACAO[l.situacao]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </main>
  )
}

export function TelaLocal({ ctx, localId, aviso }: { ctx: ContextoFvs; localId: string; aviso: string }) {
  const { dados, voltar, props, registrados, recarregar } = ctx
  const local = dados.localPorId.get(localId)
  const pode = podeRegistrar(props.obra.papel)
  const [erro, setErro] = useState('')
  const atuais = useRef(dados)
  atuais.current = dados
  const fila = useRef<Promise<unknown>>(Promise.resolve())

  const abertas = dados.fichasCampoDoLocal.get(localId) ?? []
  const eventos = dados.eventosDe.get(localId) ?? []
  const fichaPorId = (id: string) => dados.fichaPorId.get(id)
  // marcações feitas só no app (sem ficha aberta): uma "ficha" a mais, como na peça
  const soNoApp = eventos.filter((e) => !e.ficha_campo_id)
  const fichaDoApp = soNoApp.length ? fichaPorId(soNoApp[0].ficha_id) : undefined
  const opcoes: FichaCampo[] = ordenarFichasAbertas([...abertas, ...(fichaDoApp ? [fichaSoNoApp(fichaDoApp)] : [])], fichaPorId, eventos)
  const [idAberta, setIdAberta] = useState<string | null>(null)
  const aberta = opcoes.find((o) => o.id === idAberta) ?? opcoes[0]
  // sem ficha nenhuma no local (só pode acontecer com o local aberto pelo link): a pessoa escolhe a ficha
  const [fichaEscolhida, setFichaEscolhida] = useState<string>('')
  const vigentes = useMemo(() => fichasVigentes(dados.fichas), [dados.fichas])
  const ficha = aberta ? (aberta.ficha_id ? fichaPorId(aberta.ficha_id) : undefined) : fichaPorId(fichaEscolhida)
  const trilha = aberta && aberta.id !== SO_NO_APP ? aberta.id : null

  if (!local) {
    return (
      <main class="tela fv-inicio fv-local">
        <header class="so-cabecalho fv-topo-inicio">
          <button type="button" class="fv-voltar so-cab-voltar" onClick={voltar} aria-label="Voltar">
            <span aria-hidden="true">‹</span>
          </button>
          <h1>Local não encontrado</h1>
        </header>
        <p>Este local não está mais no aparelho. Volte e sincronize.</p>
      </main>
    )
  }

  const c: Contexto = { obraId: props.obra.id, usuarioId: props.usuario.id, plantaId: null, fichaCampoId: trilha, locais: dados.localPorId }
  const doItem = (evs: readonly EventoFvs[], f: Ficha) => daFichaAberta(evs, trilha).filter((e) => e.ficha_id === f.id)
  const ultimos = ficha ? ultimosPorItem(doItem(eventos, ficha)) : new Map<number, EventoFvs>()
  const nomeDe = (e: EventoFvs) => quemMarcou(e, dados, props.usuario.id)

  /** Uma gravação depois da outra; cada uma vê o que a anterior gravou (como no painel da planta). */
  const executar = (passo: (evs: readonly EventoFvs[]) => Promise<Linha[]>) => {
    setErro('')
    fila.current = fila.current
      .then(async () => {
        const linhas = await passo(daFichaAberta(atuais.current.eventosDe.get(localId) ?? [], trilha))
        if (linhas.length) atuais.current = registrados(linhas)
      })
      .catch(async (e) => {
        console.error('FVS: gravação falhou', e)
        setErro(textoDoErroDeGravacao(e))
        atuais.current = await recarregar().catch(() => atuais.current)
      })
  }

  const tocar = (f: Ficha, item: number, r: 'C' | 'NC' | 'NA') => {
    const v = ultimos.get(item)
    const viraC = r === 'C' && v?.resultado !== 'C'
    // C dentro do prazo das regras da obra (escoramento, reescoramento): só avisa e grava "Marcado antes do prazo"
    const prazo = viraC ? prazoDoItemNaPeca(dados, f, doItem(eventos, f), item) : null
    if (prazo && !confirm(perguntaDoPrazo(prazo, local.nome))) return
    const obs = prazo ? observacaoDoPrazo(prazo) : null
    const id = crypto.randomUUID()
    const toque: Toque = { tipo: 'item', id, obraId: c.obraId, usuarioId: c.usuarioId, plantaId: null, fichaCampoId: trilha, pecaId: localId, fichaId: f.id, item, resultado: r, ...(obs ? { observacao: obs } : {}) }
    anotarToque(toque)
    executar(async (evs) => {
      const gravado = await tocarItem(c, localId, f, item, r, evs, id, obs).finally(() => esquecerToque(toque.obraId, toque.id))
      atuais.current = registrados([gravado])
      if (gravado.resultado !== 'C') return []
      // ligação entre fichas da obra: o C marca os itens ligados do mesmo local
      const depois = daFichaAberta(atuais.current.eventosDe.get(localId) ?? [], trilha)
      return ligarDepoisDe(c, atuais.current.regras, localId, f, [item], depois)
    })
  }

  /** "O que fazer?" do NC: registro novo igual ao mais novo do item, com o texto (só se mudou). */
  const salvarNc = (f: Ficha, item: number, texto: string) =>
    executar(async (evs) => {
      const atual = ultimosPorItem(evs.filter((e) => e.ficha_id === f.id)).get(item)
      if (atual?.resultado !== 'NC' || (atual.observacao ?? '') === texto.trim()) return []
      return [await observar(c, atual, texto)]
    })

  return (
    <main class="tela fv-inicio fv-local" data-testid="fvs-tela-local">
      <header class="so-cabecalho fv-topo-inicio">
        <button type="button" class="fv-voltar so-cab-voltar" onClick={voltar} aria-label="Voltar">
          <span aria-hidden="true">‹</span>
        </button>
        <div class="so-cab-titulo">
          <h1>{local.nome}</h1>
          <p class="discreto">{local.nome_completo}</p>
        </div>
      </header>
      {aviso && <p class="aviso">{aviso}</p>}
      {erro && (
        <p class="aviso" role="alert" data-testid="fvs-local-erro">
          {erro}
        </p>
      )}
      {local.apagado_no_sistema && <p class="discreto">Este local foi apagado no sistema oficial; fica aqui para não perder o histórico.</p>}

      {opcoes.length > 0 && (
        <section class="fv-local-fichas" data-testid="fvs-local-fichas">
          <h2>{opcoes.length === 1 ? 'Ficha' : `${opcoes.length} fichas`}</h2>
          {opcoes.map((a) => {
            const sa = situacaoDaFichaAberta(a, fichaPorId, eventos)
            return (
              <button type="button" key={a.id} class={`fv-aberta fv-local-aberta${a.id === aberta?.id ? ' on' : ''}`} aria-pressed={a.id === aberta?.id} onClick={() => setIdAberta(a.id)}>
                <b>{a.ficha_titulo ?? a.ficha_codigo ?? 'Ficha'}</b>
                <span>
                  {a.codigo} · {a.status} · <span class={`fv-sit s-${sa}`}>{ROTULO_SITUACAO[sa]}</span>
                  {a.inspetor && ` · ${a.inspetor}`}
                  {a.atualizada_em && ` · ${quando(a.atualizada_em)}`}
                </span>
              </button>
            )
          })}
        </section>
      )}

      {!aberta && (
        <label class="fv-local-escolher">
          Ficha para marcar
          <select value={fichaEscolhida} onChange={(e) => setFichaEscolhida((e.target as HTMLSelectElement).value)} data-testid="fvs-local-escolher-ficha">
            <option value="">Escolha a ficha</option>
            {vigentes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.codigo} · {f.titulo}
              </option>
            ))}
          </select>
        </label>
      )}

      {aberta && !ficha && (
        <p class="aviso" data-testid="fvs-local-sem-modelo">
          A ficha {aberta.ficha_codigo ?? aberta.codigo} ainda não está entre as fichas da obra no aparelho: só o resumo do sistema ({aberta.qtd_a} C · {aberta.qtd_r} NC · {aberta.qtd_na} NA).
        </p>
      )}

      {ficha && (
        <section class="fv-local-itens" data-testid="fvs-local-itens">
          <h2>
            {ficha.codigo} · {ficha.titulo}
          </h2>
          {!pode && <p class="discreto">Você só vê: o seu acesso nesta obra é de leitura.</p>}
          {ficha.itens.map((it) => {
            const v = ultimos.get(it.n)
            const reprovado = v?.resultado === 'NC'
            const passadas = reprovacoesDoItem(historico(doItem(eventos, ficha), it.n)).filter((x) => !reprovado || x.rodada !== v?.rodada)
            const prazo = v?.resultado === 'C' ? null : prazoDoItemNaPeca(dados, ficha, doItem(eventos, ficha), it.n)
            return (
              <div class="fv-item" key={it.n} data-item={it.n}>
                <div class="fv-num">{it.n}</div>
                <div class="fv-tx">
                  <div class="fv-tt">{it.titulo}</div>
                  {prazo && (
                    <div class="fv-prazo" data-testid="fvs-prazo">
                      Aguardando · {seloDoPrazo(prazo)}
                    </div>
                  )}
                  {it.descricao && <div class="fv-ds">{it.descricao}</div>}
                  {v?.resultado && (
                    <div class={`fv-hr r-${v.resultado}`} data-testid="fvs-local-resultado">
                      {v.resultado} {quando(v.criado_em_dispositivo)} · {rotuloRodada(v.rodada)} · {nomeDe(v)}
                      {v.resultado === 'C' && v.observacao && <span> · {v.observacao}</span>}
                    </div>
                  )}
                  {passadas.length > 0 && (
                    <details class="fv-hist" data-testid="fvs-hist">
                      <summary>Reprovado antes: {passadas.map((x) => `${rotuloRodada(x.rodada)} ${dia(x.evento.criado_em_dispositivo)}`).join(', ')}</summary>
                      {passadas.map((x) => (
                        <div class="fv-hist-r" key={x.rodada}>
                          <div>
                            {rotuloRodada(x.rodada)}: NC {quando(x.evento.criado_em_dispositivo)} · {nomeDe(x.evento)}
                          </div>
                          {x.observacao && <div class="fv-hist-obs">{x.observacao}</div>}
                        </div>
                      ))}
                    </details>
                  )}
                  {reprovado && v && (
                    <div class="fv-nc" data-testid="fvs-local-nc">
                      <CampoNc inicial={v.observacao ?? ''} pode={pode} salvar={(t) => salvarNc(ficha, it.n, t)} />
                    </div>
                  )}
                </div>
                {pode && (
                  <div class="fv-bt">
                    {reprovado && <div class="fv-reinsp">Para reinspecionar ({rotuloRodada(v.rodada + 1)}), toque C, NC ou NA:</div>}
                    {(['C', 'NC', 'NA'] as const).map((r) => (
                      <button
                        type="button"
                        key={r}
                        data-r={r}
                        title={NOME_DO_RESULTADO[r]}
                        class={v?.resultado === r ? 'on' : ''}
                        aria-pressed={v?.resultado === r}
                        aria-label={`${NOME_DO_RESULTADO[r]} no item ${it.n}`}
                        onClick={() => tocar(ficha, it.n, r)}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </section>
      )}
    </main>
  )
}

/** A revisão mais nova de cada código, na ordem do código. */
function fichasVigentes(fichas: readonly Ficha[]): Ficha[] {
  const porCodigo = new Map<string, Ficha>()
  for (const f of fichas) {
    const a = porCodigo.get(f.codigo)
    if (!a || Number(f.revisao) > Number(a.revisao)) porCodigo.set(f.codigo, f)
  }
  return [...porCodigo.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }))
}

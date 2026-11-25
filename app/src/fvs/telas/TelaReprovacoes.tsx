// Lista de reprovações (R) da obra. Tocar na linha abre a planta do trecho certo, centrada na peça,
// com o painel no item reprovado. Funciona sem internet, com o que está no aparelho.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { reprovacoesDaObra, urlDaFoto } from '../dados'
import { baixarTexto, planilhaDeReprovacoes } from '../planilha'
import {
  filtrarReprovacoes,
  rotuloDaReprovacao,
  SEM_FILTRO,
  textoDaLista,
  type FiltrosDaLista,
  type Reprovacao,
  type SituacaoDaLista,
} from '../reprovacoes'
import { hojeBr, hojeNoAparelho, quando } from '../formato'
import { AVISO_ACAO_CORRETIVA, hojeLocal, resumoDaTratativa, repetidosNaObra, situacaoDoPrazo } from '../tratativas'
import { trechoDoRegistro, usarIrAtePeca } from './IrAtePeca'
import type { ContextoFvs } from './ModuloFvs'
import '../../telas/cabecalho.css'

const NOME_TIPO: Record<string, string> = { P: 'Pilar', V: 'Viga', L: 'Laje', A: 'Ambiente', F: 'Furo' }

// Ao voltar da planta, a lista volta como estava (filtros e ponto da rolagem).
let memoria: { obraId: string; filtros: FiltrosDaLista; rolagem: number } | null = null

/** Abre a lista já filtrada (o "15 com NC" da planta leva às reprovações daquele trecho). */
export function filtrarListaAoAbrir(obraId: string, filtros: FiltrosDaLista) {
  memoria = { obraId, filtros, rolagem: 0 }
}

export function TelaReprovacoes({ ctx, aviso }: { ctx: ContextoFvs; aviso: string }) {
  const { dados, props, ir, voltar } = ctx
  const obraId = props.obra.id
  const [filtros, setFiltros] = useState<FiltrosDaLista>(() => (memoria?.obraId === obraId ? memoria.filtros : SEM_FILTRO))
  const [avisoEnvio, setAvisoEnvio] = useState('')
  const lista = useMemo(() => reprovacoesDaObra(dados), [dados])
  const { aparelho, abrir, erro, ofertaDaLinha, limparOferta } = usarIrAtePeca<Reprovacao>(ctx, (r, plantaId) => {
    memoria = { obraId, filtros, rolagem: window.scrollY }
    ir({ nome: 'planta', plantaId, pecaId: r.pecaId, fichaCampoId: r.fichaCampoId, item: r.item })
  })

  useEffect(() => {
    if (memoria?.obraId === obraId && memoria.rolagem) window.scrollTo(0, memoria.rolagem)
  }, [obraId])

  const nomePavimento = useMemo(() => new Map(dados.pavimentos.map((p) => [p.id, p.nome])), [dados])
  const trechoDe = (r: Reprovacao) => trechoDoRegistro(r, dados, aparelho)

  const visiveis = filtrarReprovacoes(lista, filtros, trechoDe)
  const abertas = lista.filter((r) => r.aberta).length
  // o mesmo item da mesma ficha com NC em 3 locais ou mais: aviso de ação corretiva (só avisa, 25/11)
  const repetidos = useMemo(() => repetidosNaObra(lista), [lista])
  // aceito sob concessão: fechado sem reinspeção (conta à parte)
  const concessoes = lista.filter((r) => r.concessao).length
  const hoje = hojeLocal()
  const quemMarcou = [...new Set(lista.flatMap((r) => (r.reinspecao ? [r.quem, r.reinspecao.quem] : [r.quem])))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const pavimentos = dados.pavimentos.filter((p) => lista.some((r) => r.pavimentoId === p.id))
  const trechos = [...new Set(lista.filter((r) => !filtros.pavimentoId || r.pavimentoId === filtros.pavimentoId).map(trechoDe).filter((t): t is string => !!t))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { numeric: true }),
  )

  const mudar = (novo: Partial<FiltrosDaLista>) => {
    const f = { ...filtros, ...novo }
    memoria = { obraId, filtros: f, rolagem: 0 }
    setFiltros(f)
    setAvisoEnvio('')
    limparOferta()
  }

  const ondeEsta = (r: Reprovacao) => [nomePavimento.get(r.pavimentoId), trechoDe(r)].filter(Boolean).join(' · ')

  /** Abre o "compartilhar" do celular (WhatsApp, e-mail); no PC, copia o texto. */
  const enviarLista = async () => {
    const nomeDaSituacao = filtros.situacao === 'abertas' ? 'abertas' : filtros.situacao === 'reinspecionadas' ? 'reinspecionadas' : ''
    const titulo = `Reprovações ${nomeDaSituacao} · ${props.obra.codigo} · ${hojeBr()}`.replace(/\s+/g, ' ')
    const texto = textoDaLista(visiveis, titulo, ondeEsta)
    try {
      if (navigator.share) {
        await navigator.share({ text: texto })
        return
      }
      await navigator.clipboard.writeText(texto)
      setAvisoEnvio('Lista copiada. É só colar na mensagem.')
    } catch (e) {
      // a pessoa fechou o "compartilhar": não é erro
      if ((e as Error)?.name !== 'AbortError') setAvisoEnvio('Não consegui enviar a lista. Use "Baixar planilha".')
    }
  }

  const baixarPlanilha = () =>
    baixarTexto(
      `reprovacoes_${props.obra.codigo}_${hojeNoAparelho()}.csv`,
      planilhaDeReprovacoes(
        visiveis,
        (i) => nomePavimento.get(visiveis[i].pavimentoId) ?? '',
        (i) => trechoDe(visiveis[i]) ?? '',
        ctx.sistema?.nome ?? null,
      ),
    )

  return (
    <main class="tela fv-inicio fv-reprovacoes">
      <header class="so-cabecalho fv-topo-inicio">
        <button type="button" class="fv-voltar so-cab-voltar" onClick={voltar} aria-label="Voltar">
          <span aria-hidden="true">‹</span>
        </button>
        <div class="so-cab-titulo">
          <h1>Reprovações</h1>
          <p class="discreto" data-testid="fvs-rep-contagem">
            {abertas} {abertas === 1 ? 'aberta' : 'abertas'} · {lista.length - abertas - concessoes} {lista.length - abertas - concessoes === 1 ? 'reinspecionada' : 'reinspecionadas'}
            {concessoes > 0 && ` · ${concessoes} sob concessão`}
          </p>
        </div>
      </header>
      {aviso && <p class="faixa-aviso">{aviso}</p>}
      {erro && (
        <p class="erro" role="alert">
          {erro}
        </p>
      )}

      <div class="fv-rep-filtros">
        <label>
          Situação
          <select
            data-testid="fvs-rep-situacao"
            value={filtros.situacao}
            onChange={(ev) => mudar({ situacao: (ev.target as HTMLSelectElement).value as SituacaoDaLista })}
          >
            <option value="abertas">Abertas</option>
            <option value="reinspecionadas">Reinspecionadas</option>
            <option value="todas">Todas</option>
          </select>
        </label>
        <label>
          Quem marcou
          <select data-testid="fvs-rep-quem" value={filtros.quem} onChange={(ev) => mudar({ quem: (ev.target as HTMLSelectElement).value })}>
            <option value="">Todos</option>
            {quemMarcou.map((q) => (
              <option value={q} key={q}>
                {q}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pavimento
          <select data-testid="fvs-rep-pavimento" value={filtros.pavimentoId} onChange={(ev) => mudar({ pavimentoId: (ev.target as HTMLSelectElement).value, trecho: '' })}>
            <option value="">Todos</option>
            {pavimentos.map((p) => (
              <option value={p.id} key={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Trecho
          <select data-testid="fvs-rep-trecho" value={filtros.trecho} onChange={(ev) => mudar({ trecho: (ev.target as HTMLSelectElement).value })}>
            <option value="">Todos</option>
            {trechos.map((t) => (
              <option value={t} key={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      {visiveis.length > 0 && (
        <div class="fv-lan-acoes">
          <button type="button" class="fv-baixar" data-testid="fvs-rep-enviar" onClick={enviarLista}>
            Enviar a lista ({visiveis.length})
          </button>
          <button type="button" class="fv-link-lan" data-testid="fvs-rep-planilha" onClick={baixarPlanilha}>
            Baixar planilha
          </button>
          {avisoEnvio && (
            <span class="discreto" role="status" data-testid="fvs-rep-enviou">
              {avisoEnvio}
            </span>
          )}
        </div>
      )}

      {visiveis.length === 0 ? (
        <p class="discreto" data-testid="fvs-rep-vazia">
          {lista.length === 0 ? 'Sem reprovações' : 'Sem reprovações com estes filtros'}
        </p>
      ) : (
        <ul class="lista fv-rep-lista">
          {visiveis.map((r) => {
            const trecho = trechoDe(r)
            const trat = resumoDaTratativa(r.tratativa, r.aberta, hoje)
            const atrasado = situacaoDoPrazo(r.tratativa?.prazo ?? null, r.aberta, hoje) === 'atrasado'
            const vezes = repetidos.get(`${r.fichaId}|${r.item}`)
            return (
              <li key={r.chave} data-testid="fvs-rep">
                <button type="button" class={`fv-rep${r.aberta ? '' : ' fechada'}${r.fotos.length ? ' com-foto' : ''}`} onClick={() => abrir(r)}>
                  {r.fotos.length > 0 && <Miniatura arquivoId={r.fotos[0]} total={r.fotos.length} ctx={ctx} />}
                  <span class="fv-rep-topo">
                    <b class="fv-rep-peca">{r.pecaNome}</b>
                    <span class="fv-rep-onde">
                      {NOME_TIPO[r.tipo] ?? r.tipo} · {nomePavimento.get(r.pavimentoId)}
                      {trecho && ` · ${trecho}`}
                    </span>
                    <span class={`fv-rep-res ${r.aberta ? 'r-NC' : 'r-ok'}`}>{rotuloDaReprovacao(r)}</span>
                  </span>
                  <span class="fv-rep-item">
                    {r.item}. {r.itemTitulo}
                  </span>
                  <span class="discreto">
                    {r.fichaTitulo}
                    {r.etapa && ` · ${r.etapa.charAt(0) + r.etapa.slice(1).toLowerCase()}`}
                  </span>
                  {r.observacao && <span class="fv-rep-obs">{r.observacao}</span>}
                  {trat && (
                    <span class={`fv-rep-trat${atrasado ? ' atrasado' : ''}`} data-testid="fvs-rep-trat">
                      {trat}
                    </span>
                  )}
                  {vezes && r.aberta && (
                    <span class="fv-rep-acao" data-testid="fvs-rep-acao">
                      Este item tem NC em {vezes} locais. {AVISO_ACAO_CORRETIVA}
                    </span>
                  )}
                  <span class="discreto">
                    NC {quando(r.quando)} · {r.quem}
                  </span>
                  {r.reinspecao && (
                    <span class="fv-rep-ok">
                      Reinspecionado: {r.reinspecao.resultado} {quando(r.reinspecao.quando)} · {r.reinspecao.quem}
                    </span>
                  )}
                  {r.fichasNaPeca > 1 && r.fichaCampoCodigo && <span class="fv-rep-dup">Ficha duplicada: esta é a {r.fichaCampoCodigo}</span>}
                </button>
                {ofertaDaLinha(r)}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}

/** Foto da reprovação: só carrega quando a linha aparece na tela. Sem internet e sem a foto no aparelho, fica o aviso. */
function Miniatura({ arquivoId, total, ctx }: { arquivoId: string; total: number; ctx: ContextoFvs }) {
  const caixa = useRef<HTMLSpanElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    const carregar = () =>
      urlDaFoto(arquivoId, ctx.dados.arquivoPorId.get(arquivoId))
        .then((u) => vivo && setUrl(u))
        .catch((e) => console.warn('FVS: foto não carregou', e))
    const el = caixa.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      carregar()
      return
    }
    const obs = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        obs.disconnect()
        carregar()
      }
    })
    obs.observe(el)
    return () => {
      vivo = false
      obs.disconnect()
    }
  }, [arquivoId])
  return (
    <span class="fv-rep-foto" ref={caixa}>
      {url ? <img src={url} alt="Foto da reprovação" /> : <span>Foto</span>}
      {total > 1 && <em>+{total - 1}</em>}
    </span>
  )
}

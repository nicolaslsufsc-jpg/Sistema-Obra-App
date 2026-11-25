// Peças com mais de uma ficha no sistema oficial, com a situação de cada uma. Serve para saber o que
// corrigir lá: o app guarda as duas e não escolhe por ninguém. Tocar na linha abre a peça na planta.
import { concretadaDe } from '../concretada'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { codigoParaLer, quando } from '../formato'
import { listarDuplicadas, ROTULO_SITUACAO as ROTULO, situacaoDaFichaAberta } from '../situacao'
import type { PecaDuplicada } from '../situacao'
import { trechoDoRegistro, usarIrAtePeca } from './IrAtePeca'
import type { ContextoFvs } from './ModuloFvs'
import type { SistemaOficial } from '../../integracoes/sistema_oficial'
import '../../telas/cabecalho.css'

const NOME_TIPO: Record<string, string> = { P: 'Pilar', V: 'Viga', L: 'Laje', A: 'Ambiente', F: 'Furo' }

let memoria: { obraId: string; pavimentoId: string; rolagem: number } | null = null

export function TelaDuplicadas({ ctx, sistema, aviso }: { ctx: ContextoFvs; sistema: SistemaOficial; aviso: string }) {
  const { dados, props, ir, voltar } = ctx
  const obraId = props.obra.id
  const [pavimentoId, setPavimentoId] = useState(() => (memoria?.obraId === obraId ? memoria.pavimentoId : ''))
  const fichaPorId = (id: string) => dados.fichaPorId.get(id)
  const lista = useMemo(() => listarDuplicadas(dados.pecaPorId.values(), dados.fichasCampoDe, dados.pavimentos), [dados])
  const { aparelho, abrir, erro, ofertaDaLinha, limparOferta } = usarIrAtePeca<PecaDuplicada>(ctx, (l, plantaId) => {
    memoria = { obraId, pavimentoId, rolagem: window.scrollY }
    ir({ nome: 'planta', plantaId, pecaId: l.pecaId })
  })

  useEffect(() => {
    if (memoria?.obraId === obraId && memoria.rolagem) window.scrollTo(0, memoria.rolagem)
  }, [obraId])

  const nomePavimento = useMemo(() => new Map(dados.pavimentos.map((p) => [p.id, p.nome])), [dados])
  const pavimentos = dados.pavimentos.filter((p) => lista.some((l) => l.pavimentoId === p.id))
  const visiveis = lista.filter((l) => !pavimentoId || l.pavimentoId === pavimentoId)

  return (
    <main class="tela fv-inicio fv-reprovacoes fv-duplicadas">
      <header class="so-cabecalho fv-topo-inicio">
        <button type="button" class="fv-voltar so-cab-voltar" onClick={voltar} aria-label="Voltar">
          <span aria-hidden="true">‹</span>
        </button>
        <div class="so-cab-titulo">
          <h1>Fichas duplicadas</h1>
          <p class="discreto" data-testid="fvs-dup-contagem">
            {lista.length} {lista.length === 1 ? 'peça' : 'peças'} com mais de uma ficha no {sistema.nome}
          </p>
        </div>
      </header>
      {aviso && <p class="faixa-aviso">{aviso}</p>}
      {erro && (
        <p class="erro" role="alert">
          {erro}
        </p>
      )}
      <p class="discreto">O app guarda as duas situações e não escolhe nenhuma. Para acabar com a duplicada, corrija a ficha no {sistema.nome}.</p>
      <div class="fv-rep-filtros fv-dup-filtro">
        <label>
          Pavimento
          <select
            data-testid="fvs-dup-pavimento"
            value={pavimentoId}
            onChange={(ev) => {
              const v = (ev.target as HTMLSelectElement).value
              memoria = { obraId, pavimentoId: v, rolagem: 0 }
              setPavimentoId(v)
              limparOferta()
            }}
          >
            <option value="">Todos</option>
            {pavimentos.map((p) => (
              <option value={p.id} key={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul class="lista fv-rep-lista">
        {visiveis.map((l) => {
          const trecho = trechoDoRegistro(l, dados, aparelho)
          const eventos = dados.eventosDe.get(l.pecaId) ?? []
          return (
            <li key={l.chave} data-testid="fvs-dup">
              <button type="button" class="fv-rep fv-dup" onClick={() => abrir(l)}>
                <span class="fv-rep-topo">
                  <b class="fv-rep-peca">{l.pecaNome}</b>
                  <span class="fv-rep-onde">
                    {NOME_TIPO[l.tipo] ?? l.tipo} · {nomePavimento.get(l.pavimentoId)}
                    {trecho && ` · ${trecho}`}
                  </span>
                </span>
                {l.fichas.map((f) => {
                  const s = situacaoDaFichaAberta(f, fichaPorId, eventos, undefined, undefined, concretadaDe(dados.concretadas, l.pecaId, l.tipo))
                  return (
                    <span class="fv-dup-ficha" key={f.id}>
                      <b title={f.codigo}>{codigoParaLer(f.codigo)}</b>
                      <span>
                        {f.status} · <span class={`fv-sit s-${s}`}>{ROTULO[s]}</span>
                        {f.inspetor && ` · ${f.inspetor}`}
                        {f.atualizada_em && ` · ${quando(f.atualizada_em)}`}
                      </span>
                    </span>
                  )
                })}
              </button>
              {ofertaDaLinha(l)}
            </li>
          )
        })}
      </ul>
    </main>
  )
}

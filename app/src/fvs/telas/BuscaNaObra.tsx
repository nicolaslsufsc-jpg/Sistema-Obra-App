// Busca de peça na obra inteira: digita "P124", escolhe o pavimento, cai na peça. Funciona sem
// internet; se a planta da peça não estiver no aparelho, oferece baixar ali mesmo.
import { nomeDaPeca } from '../comodos'
import { useMemo, useState } from 'preact/hooks'
import { buscarPecas } from '../busca'
import { fichaDoLocalNaObra, partesDoPilar, travasDaAreaNaObra, type Peca } from '../dados'
import { fichaDaPeca, fichasPara, ROTULO_SITUACAO as ROTULO, situacaoDoFuroNaObra, situacaoDoLocal, type Situacao } from '../situacao'
import { usarIrAtePeca } from './IrAtePeca'
import type { ContextoFvs } from './ModuloFvs'

const NOME_TIPO: Record<string, string> = { P: 'Pilar', V: 'Viga', L: 'Laje', A: 'Ambiente', F: 'Furo' }

// ao voltar da planta, a busca continua como estava (a pessoa costuma olhar uma peça depois da outra)
let memoria: { obraId: string; texto: string } | null = null

export function BuscaNaObra({ ctx }: { ctx: ContextoFvs }) {
  const obraId = ctx.props.obra.id
  const [texto, setTexto] = useState(() => (memoria?.obraId === obraId ? memoria.texto : ''))
  return (
    <div class="fv-busca-obra">
      <input
        type="search"
        data-testid="fvs-busca-obra"
        placeholder="Buscar peça na obra (ex.: P124)"
        aria-label="Buscar peça na obra"
        autocomplete="off"
        value={texto}
        onInput={(ev) => {
          const t = (ev.target as HTMLInputElement).value
          memoria = { obraId, texto: t }
          setTexto(t)
        }}
      />
      {texto.trim() && <Resultados texto={texto} ctx={ctx} />}
    </div>
  )
}

function Resultados({ texto, ctx }: { texto: string; ctx: ContextoFvs }) {
  const { dados, ir } = ctx
  const { achadas, total } = useMemo(() => buscarPecas<Peca>(dados.pecaPorId.values(), texto, dados.pavimentos), [texto, dados])
  const { abrir, erro, ofertaDaLinha } = usarIrAtePeca<ReturnType<typeof paraLinha>>(ctx, (l, plantaId) => ir({ nome: 'planta', plantaId, pecaId: l.pecaId }))
  const nomePavimento = useMemo(() => new Map(dados.pavimentos.map((p) => [p.id, p.nome])), [dados])

  if (!achadas.length) return <p class="discreto" data-testid="fvs-busca-vazia">Nenhuma peça com esse nome nesta obra.</p>

  function paraLinha(p: Peca) {
    return { chave: p.id, pecaId: p.id, pavimentoId: p.pavimento_id, tipo: p.tipo, local: dados.fichasCampoDe.get(p.id)?.[0]?.local ?? null, plantaMarcada: null }
  }
  const situacaoDe = (p: Peca): Situacao => {
    const eventos = dados.eventosDe.get(p.id) ?? []
    const fichaPorId = (id: string) => dados.fichaPorId.get(id)
    // furo: o registro dele é no item de furação da ficha de viga (o mesmo que a planta mostra)
    if (p.tipo === 'F') return situacaoDoFuroNaObra(fichasPara('V', dados.fichas)[0], eventos, fichaPorId)
    const area = dados.areaPorId.get(p.id)
    if (area && travasDaAreaNaObra(dados, area).length) return 'reprovado'
    return situacaoDoLocal(fichaDaPeca(fichaDoLocalNaObra(dados, p), eventos, fichaPorId), dados.fichasCampoDe.get(p.id) ?? [], fichaPorId, eventos, undefined, partesDoPilar(p.id))
  }

  return (
    <>
      {erro && (
        <p class="erro" role="alert">
          {erro}
        </p>
      )}
      <ul class="lista fv-rep-lista">
        {achadas.map((p) => {
          const l = paraLinha(p)
          const s = situacaoDe(p)
          return (
            <li key={p.id} data-testid="fvs-busca-linha">
              <button type="button" class={`fv-rep fv-busca-linha s-${s}`} onClick={() => abrir(l)}>
                <span class="fv-rep-topo">
                  <b class="fv-rep-peca">{nomeDaPeca(p)}</b>
                  <span class="fv-rep-onde">
                    {NOME_TIPO[p.tipo] ?? p.tipo} · {nomePavimento.get(p.pavimento_id)}
                    {p.secao && ` · ${p.secao}`}
                  </span>
                  <span class={`fv-sit s-${s}`}>{ROTULO[s]}</span>
                </span>
              </button>
              {ofertaDaLinha(l)}
            </li>
          )
        })}
      </ul>
      {total > achadas.length && <p class="discreto">Mais {total - achadas.length}: continue digitando para achar a peça.</p>}
    </>
  )
}

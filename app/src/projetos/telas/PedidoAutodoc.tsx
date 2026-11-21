// Botão "Atualizar do Autodoc" no topo do painel (só gestor, só com conta). Grava o pedido no servidor e
// acompanha: pedido → buscando → pronto/erro. Ao ficar pronto, chama aoPronto (sincroniza e refaz o painel).
// Ver projetos/pedido_autodoc.ts.
import { useEffect, useRef, useState } from 'preact/hooks'
import { pedirAtualizacao, textoDoPedido, ultimoPedido, type PedidoAtualizacao } from '../pedido_autodoc'

/** Enquanto o pedido está aberto, a tela pergunta ao servidor a cada tanto. */
export const CONSULTA_MS = { valor: 20_000 }

export function PedidoAutodoc({ obraId, aoPronto }: { obraId: string; aoPronto: () => void }) {
  const [pedido, setPedido] = useState<PedidoAtualizacao | null | undefined>(undefined)
  const [enviando, setEnviando] = useState(false)
  const [problema, setProblema] = useState('')
  const [agora, setAgora] = useState(() => new Date())
  const estadoAntes = useRef<string | null>(null)

  const consultar = async () => {
    try {
      const p = await ultimoPedido(obraId)
      setProblema('')
      setPedido(p)
      setAgora(new Date())
    } catch {
      setProblema('Sem conexão com o servidor: o pedido precisa de internet.')
      setPedido((x) => (x === undefined ? null : x))
    }
  }

  useEffect(() => {
    consultar()
  }, [obraId])

  // pedido aberto (pendente ou buscando): consulta de novo; ao virar pronto, refaz o painel
  useEffect(() => {
    const antes = estadoAntes.current
    estadoAntes.current = pedido?.estado ?? null
    if (pedido?.estado === 'pronto' && (antes === 'pendente' || antes === 'buscando')) aoPronto()
    if (pedido?.estado !== 'pendente' && pedido?.estado !== 'buscando') return
    const t = setTimeout(consultar, CONSULTA_MS.valor)
    return () => clearTimeout(t)
  }, [pedido, agora])

  const pedir = async () => {
    setEnviando(true)
    setProblema('')
    try {
      setPedido(await pedirAtualizacao(obraId))
      setAgora(new Date())
    } catch (e) {
      setProblema(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  const t = textoDoPedido(pedido ?? null, agora)
  const pode = !enviando && pedido !== undefined && (!t || t.podePedir)
  return (
    <section class={`pj-pedido ${t?.tipo ?? ''}`} data-testid="pedido-autodoc" aria-live="polite">
      <button type="button" class="principal" onClick={pedir} disabled={!pode} data-testid="pedido-autodoc-botao">
        {enviando ? 'Pedindo…' : t?.tipo === 'aberto' || t?.tipo === 'parado' ? 'Atualização pedida' : 'Atualizar do Autodoc'}
      </button>
      {!t && pedido === null && !problema && <span class="discreto">Busca no Autodoc pelo PC do escritório, publica a lista e baixa as revisões novas.</span>}
      {t && (
        <span data-testid="pedido-autodoc-estado">
          {t.tipo === 'aberto' && <span class="pj-girando" aria-hidden="true" />}
          {t.texto}
        </span>
      )}
      {t && t.falharam.length > 0 && (
        <details data-testid="pedido-autodoc-falharam">
          <summary>Ver as que falharam ({t.falharam.length})</summary>
          <ul>
            {t.falharam.map((f) => (
              <li key={f.codigo}>
                <b>{f.codigo}</b>
                {f.motivo ? ` · ${f.motivo}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
      {problema && (
        <span class="erro" role="alert">
          {problema}
        </span>
      )}
    </section>
  )
}

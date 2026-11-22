// Botão "Atualizar do Autodoc" no topo do painel (só gestor, só com conta). Grava o pedido no servidor e
// acompanha: pedido → buscando → pronto/erro. Ao ficar pronto, chama aoPronto (sincroniza e refaz o painel).
// Ver projetos/pedido_autodoc.ts.
import { useEffect, useRef, useState } from 'preact/hooks'
import { pedirAtualizacao, textoDoPedido, ultimoPedido, type PedidoAtualizacao } from '../pedido_autodoc'

/** Enquanto o pedido está aberto, a tela pergunta ao servidor a cada tanto. */
export const CONSULTA_MS = { valor: 20_000 }

/** depois: a frase do "O que fazer agora" (aparece quando o pedido fica pronto) e o que o toque abre. */
export function PedidoAutodoc({ obraId, aoPronto, depois }: { obraId: string; aoPronto: () => void; depois?: { texto: string; abrir: () => void } }) {
  const [pedido, setPedido] = useState<PedidoAtualizacao | null | undefined>(undefined)
  const [enviando, setEnviando] = useState(false)
  const [problema, setProblema] = useState('')
  // o servidor disse que esta conta não é gestora desta obra: o botão fica desligado, com o motivo
  const [semPermissao, setSemPermissao] = useState(false)
  const [agora, setAgora] = useState(() => new Date())
  const estadoAntes = useRef<string | null>(null)

  const consultar = async () => {
    try {
      const p = await ultimoPedido(obraId)
      setProblema('')
      setPedido(p)
      setAgora(new Date())
    } catch {
      // "sem conexão" só quando o aparelho está mesmo sem internet (achado do testador, 21/11)
      setProblema(
        typeof navigator !== 'undefined' && navigator.onLine === false
          ? 'Sem internet: o pedido ao Autodoc precisa de internet.'
          : 'Não consegui ver o último pedido no servidor agora. O botão continua valendo.',
      )
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
      const msg = e instanceof Error ? e.message : String(e)
      if (/Só o gestor/.test(msg)) setSemPermissao(true)
      setProblema(msg)
    } finally {
      setEnviando(false)
    }
  }

  const t = textoDoPedido(pedido ?? null, agora)
  const pode = !enviando && !semPermissao && pedido !== undefined && (!t || t.podePedir)
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
      {t?.tipo === 'pronto' && depois && (
        <button type="button" class="pj-pequeno" onClick={depois.abrir} data-testid="pedido-autodoc-agora">
          Agora: {depois.texto} ›
        </button>
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

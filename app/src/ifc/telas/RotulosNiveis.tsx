// Nomes dos pavimentos na vista 2D do corte. Acompanham a câmera direto no DOM, sem redesenhar a tela.
import { useEffect, useRef } from 'preact/hooks'
import { formatarMetros, type Sessao } from '../sessao'

export function RotulosNiveis({ sessao }: { sessao: Sessao }) {
  const c = sessao.corte
  const ativo = c?.vista2D ?? false
  const niveis = ativo ? sessao.niveisDoCorte() : []
  const caixa = useRef<HTMLDivElement>(null)
  const chave = niveis.map((n) => `${n.nome}${n.ponto[1]}`).join('|')

  useEffect(() => {
    const v = sessao.visor
    if (!v || !ativo) return
    const lista = niveis
    const atualizar = () => {
      const filhos = caixa.current?.children
      if (!filhos) return
      // De baixo para cima: rótulo que encostaria no anterior some até dar zoom.
      let ultimoY = Infinity
      for (let i = 0; i < lista.length; i++) {
        const el = filhos[i] as HTMLElement | undefined
        if (!el) continue
        const { y } = v.naTela(lista[i].ponto)
        el.style.transform = `translateY(${Math.round(y)}px) translateY(-100%)`
        const cabe = ultimoY - y >= 16
        el.style.visibility = cabe ? 'visible' : 'hidden'
        if (cabe) ultimoY = y
      }
    }
    v.eventos.aoDesenhar = atualizar
    atualizar()
    v.pedirDesenho()
    return () => {
      v.eventos.aoDesenhar = undefined
    }
    // `chave` resume a lista de níveis: ela é recriada a cada desenho da tela
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao, ativo, chave])

  if (!niveis.length) return null
  return (
    <div ref={caixa} class="ifc-niveis" aria-label="Níveis dos pavimentos">
      {niveis.map((n) => (
        <div key={n.nome} class="ifc-nivel">
          {n.nome} <b>{formatarMetros(n.elevacao)}</b>
        </div>
      ))}
    </div>
  )
}

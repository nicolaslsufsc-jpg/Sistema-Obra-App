// O painel da peça e a imagem ampliada são camadas por cima da planta. O voltar do Android fecha a
// camada de cima, como em qualquer app, em vez de sair da planta e perder o ponto em que a pessoa
// estava. Cada camada é uma entrada no histórico do navegador, em cima da entrada da planta.
import { useEffect, useRef, useState } from 'preact/hooks'

export function usarCamadas(pecaInicial: string | undefined) {
  // ao voltar de outra tela (trocou de trecho, foi à lista), o painel volta como estava
  const [sel, setSel] = useState<string | null>(() => pecaInicial ?? (history.state?.painel as string | undefined) ?? null)
  const [zoom, setZoom] = useState<string | null>(null)
  const zoomAgora = useRef(zoom)
  zoomAgora.current = zoom
  // Fechar pelo botão também volta no histórico. A tela muda na hora; o popstate chega depois e
  // só confirma. Peça tocada nesse meio-tempo abre quando ele chegar.
  const voltaNossa = useRef(false)
  const abrirDepois = useRef<string | null>(null)
  // desenho de área de laje e a caixa dela: outra camada, que o voltar cancela
  const cancelarSobre = useRef<(() => void) | null>(null)
  const sobreDepois = useRef(false)

  useEffect(() => {
    const aoVoltar = (e: PopStateEvent) => {
      if (e.state?.tela !== 'fvs') return
      if (voltaNossa.current) {
        voltaNossa.current = false
        const id = abrirDepois.current
        abrirDepois.current = null
        // a camada de baixo já é um painel (escolha de peça fechada com o painel aberto): troca, sem empilhar
        if (id) {
          if (history.state?.painel) history.replaceState({ ...history.state, painel: id }, '')
          else history.pushState({ ...history.state, painel: id }, '')
        }
        if (sobreDepois.current) {
          sobreDepois.current = false
          history.pushState({ ...history.state, sobre: true }, '')
        }
        return
      }
      if (cancelarSobre.current) {
        const cancelar = cancelarSobre.current
        cancelarSobre.current = null
        cancelar()
        return
      }
      if (zoomAgora.current) {
        setZoom(null)
        return
      }
      setSel((e.state.painel as string | undefined) ?? null)
    }
    window.addEventListener('popstate', aoVoltar)
    return () => window.removeEventListener('popstate', aoVoltar)
  }, [])

  const abrirPainel = (id: string) => {
    setSel(id)
    if (voltaNossa.current) abrirDepois.current = id
    else if (history.state?.painel) history.replaceState({ ...history.state, painel: id }, '')
    else if (id !== sel) history.pushState({ ...history.state, painel: id }, '')
  }

  const fecharPainel = () => {
    setSel(null)
    abrirDepois.current = null
    if (history.state?.painel && !voltaNossa.current) {
      voltaNossa.current = true
      history.back()
    }
  }

  const abrirZoom = (src: string) => {
    history.pushState({ ...history.state, zoom: true }, '')
    setZoom(src)
  }

  const fecharZoom = () => {
    setZoom(null)
    if (history.state?.zoom && !voltaNossa.current) {
      voltaNossa.current = true
      history.back()
    }
  }

  /** Abre o desenho de uma área por cima da planta: o voltar do aparelho cancela o desenho, e não sai da planta. */
  const abrirSobre = (aoCancelar: () => void) => {
    cancelarSobre.current = aoCancelar
    if (voltaNossa.current) sobreDepois.current = true
    else if (!history.state?.sobre) history.pushState({ ...history.state, sobre: true }, '')
  }

  const fecharSobre = () => {
    cancelarSobre.current = null
    sobreDepois.current = false
    if (history.state?.sobre && !voltaNossa.current) {
      voltaNossa.current = true
      history.back()
    }
  }

  /** O "‹" do topo: sai da planta de uma vez, mesmo com o painel aberto. */
  const sair = (voltar: () => void) => {
    const camadas = (history.state?.painel ? 1 : 0) + (history.state?.sobre ? 1 : 0)
    cancelarSobre.current = null
    if (camadas) history.go(-(camadas + 1))
    else voltar()
  }

  return { sel, abrirPainel, fecharPainel, zoom, abrirZoom, fecharZoom, abrirSobre, fecharSobre, sair }
}

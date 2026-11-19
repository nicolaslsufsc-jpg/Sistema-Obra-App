// Traço com a caneta (ou o mouse) por cima do mapa, sem travar:
// - a caneta desenha; o dedo continua arrastando e ampliando a planta (o Leaflet nem vê a caneta);
// - enquanto a caneta está encostada, toques de dedo/palma são ignorados;
// - o traço vai direto para um <canvas> por cima do mapa (sem Preact, sem Leaflet a cada ponto),
//   com os pontos intermediários do evento (getCoalescedEvents) e canvas de baixa latência;
// - só quando a caneta sobe o traço vira área (o resto do trabalho fica para depois).

export interface OpcoesCaneta {
  /** Desenho ligado agora? (lido a cada toque) */
  ativo: () => boolean
  cor: () => string
  /** Mouse também desenha (PC). Se false, o mouse arrasta o mapa. */
  mouseDesenha: () => boolean
  /** A caneta encostou: pare o que o mapa estiver fazendo (inércia do arrasto com o dedo). */
  aoComecar?: () => void
  /** Pontos em pixels do container. comprimento em pixels de tela. */
  aoTerminar: (pontos: Array<[number, number]>, comprimento: number) => void
}

/** Tinta de baixa latência: só no Android (tablet e celular com caneta). */
export function rapidoNesteAparelho(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /Android/i.test(ua)
}

export function instalarCaneta(container: HTMLElement, tinta: HTMLCanvasElement, o: OpcoesCaneta): () => void {
  // Canvas de baixa latência (desynchronized) só no Android, onde a caneta precisa dele. No PC com
  // Windows, em algumas placas de vídeo ele ignora a transparência e a tinta cobre a planta inteira
  // de preto enquanto o mouse desenha (relato de 16/11/2026, docs/modulos/3_concreto.md).
  const ctx = (tinta.getContext('2d', { desynchronized: rapidoNesteAparelho() }) ?? tinta.getContext('2d'))!
  let traco: { id: number; pontos: Array<[number, number]>; caixa: DOMRect; comprimento: number } | null = null
  let dpr = 1

  const ajustarTamanho = () => {
    const r = container.getBoundingClientRect()
    dpr = window.devicePixelRatio || 1
    tinta.width = Math.max(1, Math.round(r.width * dpr))
    tinta.height = Math.max(1, Math.round(r.height * dpr))
    tinta.style.width = `${r.width}px`
    tinta.style.height = `${r.height}px`
  }
  ajustarTamanho()
  const observador = new ResizeObserver(ajustarTamanho)
  observador.observe(container)

  const limpar = () => ctx.clearRect(0, 0, tinta.width, tinta.height)

  // Só a ponta da caneta (button 0): botão lateral (2) e borracha (5) não desenham.
  const desenhaEste = (e: PointerEvent) =>
    o.ativo() && e.button === 0 && (e.pointerType === 'pen' || (e.pointerType === 'mouse' && o.mouseDesenha()))

  const engolir = (e: Event) => {
    e.stopPropagation()
    e.preventDefault()
  }

  const aoDescer = (e: PointerEvent) => {
    if (traco) {
      // outro dedo (palma) com a caneta encostada: ignora
      if (e.pointerId !== traco.id) engolir(e)
      return
    }
    if (!desenhaEste(e)) return
    engolir(e)
    // sem isto, a planta ainda deslizando (inércia) grava a área fora do lugar: o traço é
    // desenhado na tela e só convertido em coordenada da planta quando a caneta sobe
    o.aoComecar?.()
    try {
      container.setPointerCapture(e.pointerId)
    } catch {
      /* sem captura: segue assim mesmo */
    }
    const caixa = container.getBoundingClientRect()
    const p: [number, number] = [e.clientX - caixa.left, e.clientY - caixa.top]
    traco = { id: e.pointerId, pontos: [p], caixa, comprimento: 0 }
    ctx.lineWidth = 3 * dpr
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = o.cor()
    ctx.fillStyle = o.cor()
    ctx.beginPath()
    ctx.arc(p[0] * dpr, p[1] * dpr, 2 * dpr, 0, Math.PI * 2)
    ctx.fill()
  }

  const aoMover = (e: PointerEvent) => {
    if (!traco) return
    engolir(e)
    if (e.pointerId !== traco.id) return
    const eventos = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : []
    const lista = eventos.length > 0 ? eventos : [e]
    const ult = traco.pontos[traco.pontos.length - 1]
    ctx.beginPath()
    ctx.moveTo(ult[0] * dpr, ult[1] * dpr)
    let ant = ult
    for (const ev of lista) {
      const p: [number, number] = [ev.clientX - traco.caixa.left, ev.clientY - traco.caixa.top]
      if (p[0] === ant[0] && p[1] === ant[1]) continue
      traco.comprimento += Math.hypot(p[0] - ant[0], p[1] - ant[1])
      traco.pontos.push(p)
      ctx.lineTo(p[0] * dpr, p[1] * dpr)
      ant = p
    }
    ctx.stroke()
  }

  const aoSubir = (e: PointerEvent) => {
    if (!traco) return
    engolir(e)
    if (e.pointerId !== traco.id) return
    const { pontos, comprimento } = traco
    traco = null
    try {
      container.releasePointerCapture(e.pointerId)
    } catch {
      /* já solto */
    }
    // a tinta fica até a área aparecer no mapa (próximo quadro), para não piscar
    requestAnimationFrame(() => requestAnimationFrame(limpar))
    if (e.type === 'pointercancel') return
    o.aoTerminar(pontos, comprimento)
  }

  // fase de captura: chega antes do Leaflet e, para a caneta, não deixa chegar nele
  const opc = { capture: true, passive: false } as const
  container.addEventListener('pointerdown', aoDescer, opc)
  container.addEventListener('pointermove', aoMover, opc)
  container.addEventListener('pointerup', aoSubir, opc)
  container.addEventListener('pointercancel', aoSubir, opc)
  // o Android pode transformar a caneta em toque/rolagem se o navegador decidir o gesto
  const semToque = (e: TouchEvent) => {
    if (traco) engolir(e)
  }
  container.addEventListener('touchstart', semToque, opc)
  container.addEventListener('touchmove', semToque, opc)

  return () => {
    observador.disconnect()
    container.removeEventListener('pointerdown', aoDescer, opc)
    container.removeEventListener('pointermove', aoMover, opc)
    container.removeEventListener('pointerup', aoSubir, opc)
    container.removeEventListener('pointercancel', aoSubir, opc)
    container.removeEventListener('touchstart', semToque, opc)
    container.removeEventListener('touchmove', semToque, opc)
  }
}

// Traço com o dedo, para quem não tem caneta (celular). Só vale com o modo "Área" ligado: fora
// dele o dedo continua arrastando a planta. A caneta e o mouse ficam com app/src/concreto/caneta.ts.

export interface OpcoesDedo {
  ativo: () => boolean
  cor: () => string
  aoTerminar: (pontos: Array<[number, number]>, comprimento: number) => void
}

export function instalarDedo(container: HTMLElement, tinta: HTMLCanvasElement, o: OpcoesDedo): () => void {
  const ctx = (tinta.getContext('2d', { desynchronized: true }) ?? tinta.getContext('2d'))!
  let traco: { id: number; pontos: Array<[number, number]>; caixa: DOMRect; comprimento: number } | null = null
  const dpr = () => window.devicePixelRatio || 1
  const engolir = (e: Event) => {
    e.stopPropagation()
    e.preventDefault()
  }

  const aoDescer = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || !o.ativo()) return
    engolir(e)
    if (traco) return // segundo dedo: ignora
    try {
      container.setPointerCapture(e.pointerId)
    } catch {
      /* sem captura: segue assim mesmo */
    }
    const caixa = container.getBoundingClientRect()
    traco = { id: e.pointerId, pontos: [[e.clientX - caixa.left, e.clientY - caixa.top]], caixa, comprimento: 0 }
    ctx.lineWidth = 3 * dpr()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = o.cor()
  }

  const aoMover = (e: PointerEvent) => {
    if (!traco || e.pointerType !== 'touch') return
    engolir(e)
    if (e.pointerId !== traco.id) return
    const k = dpr()
    const eventos = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : []
    let ant = traco.pontos[traco.pontos.length - 1]
    ctx.beginPath()
    ctx.moveTo(ant[0] * k, ant[1] * k)
    for (const ev of eventos.length > 0 ? eventos : [e]) {
      const p: [number, number] = [ev.clientX - traco.caixa.left, ev.clientY - traco.caixa.top]
      if (p[0] === ant[0] && p[1] === ant[1]) continue
      traco.comprimento += Math.hypot(p[0] - ant[0], p[1] - ant[1])
      traco.pontos.push(p)
      ctx.lineTo(p[0] * k, p[1] * k)
      ant = p
    }
    ctx.stroke()
  }

  const aoSubir = (e: PointerEvent) => {
    if (!traco || e.pointerType !== 'touch') return
    engolir(e)
    if (e.pointerId !== traco.id) return
    const { pontos, comprimento } = traco
    traco = null
    try {
      container.releasePointerCapture(e.pointerId)
    } catch {
      /* já solto */
    }
    requestAnimationFrame(() => requestAnimationFrame(() => ctx.clearRect(0, 0, tinta.width, tinta.height)))
    if (e.type !== 'pointercancel') o.aoTerminar(pontos, comprimento)
  }

  const opc = { capture: true, passive: false } as const
  container.addEventListener('pointerdown', aoDescer, opc)
  container.addEventListener('pointermove', aoMover, opc)
  container.addEventListener('pointerup', aoSubir, opc)
  container.addEventListener('pointercancel', aoSubir, opc)
  return () => {
    container.removeEventListener('pointerdown', aoDescer, opc)
    container.removeEventListener('pointermove', aoMover, opc)
    container.removeEventListener('pointerup', aoSubir, opc)
    container.removeEventListener('pointercancel', aoSubir, opc)
  }
}

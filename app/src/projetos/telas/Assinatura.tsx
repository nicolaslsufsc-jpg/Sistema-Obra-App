// Quadro para assinar com o dedo ou a caneta (21/11/2026). Desenha num canvas; quem usa pede o PNG
// com `pegar.current()` na hora de salvar (null = em branco).
import { useEffect, useRef, useState } from 'preact/hooks'
import type { MutableRef } from 'preact/hooks'

export type PegarAssinatura = () => Promise<Blob | null>

// Papel branco e tinta escura nos dois temas: a assinatura (e o PNG guardado) fica igual no claro, no
// escuro e no PDF. Por isso a cor está aqui, no desenho, e não no CSS (que só usa as cores do tema).
const PAPEL = 'white'
const TINTA = 'black'

function pintarPapel(g: CanvasRenderingContext2D, c: HTMLCanvasElement) {
  g.fillStyle = PAPEL
  g.fillRect(0, 0, c.width, c.height)
}

export function QuadroAssinatura({ pegar, aoMudar }: { pegar: MutableRef<PegarAssinatura | null>; aoMudar?: (assinado: boolean) => void }) {
  const tela = useRef<HTMLCanvasElement>(null)
  const riscou = useRef(false)
  const ultimo = useRef<{ x: number; y: number } | null>(null)
  const [assinado, setAssinado] = useState(false)

  // tamanho real do canvas = tamanho na tela × densidade (traço nítido no celular)
  useEffect(() => {
    const c = tela.current
    if (!c) return
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const r = c.getBoundingClientRect()
    c.width = Math.round(r.width * dpr)
    c.height = Math.round(r.height * dpr)
    const g = c.getContext('2d')
    if (g) {
      pintarPapel(g, c)
      g.scale(dpr, dpr)
      g.lineWidth = 2.2
      g.lineCap = 'round'
      g.lineJoin = 'round'
      g.strokeStyle = TINTA
    }
    pegar.current = () =>
      new Promise((ok) => {
        if (!riscou.current || !tela.current) return ok(null)
        tela.current.toBlob((b) => ok(b), 'image/png')
      })
    return () => {
      pegar.current = null
    }
  }, [])

  const ponto = (e: PointerEvent) => {
    const r = tela.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const comecar = (e: PointerEvent) => {
    e.preventDefault()
    ultimo.current = ponto(e)
    try {
      tela.current?.setPointerCapture(e.pointerId)
    } catch {
      // sem captura o traço para na borda; não impede de assinar
    }
  }
  const mover = (e: PointerEvent) => {
    if (!ultimo.current) return
    e.preventDefault()
    const g = tela.current?.getContext('2d')
    const p = ponto(e)
    if (g) {
      g.beginPath()
      g.moveTo(ultimo.current.x, ultimo.current.y)
      g.lineTo(p.x, p.y)
      g.stroke()
    }
    ultimo.current = p
    if (!riscou.current) {
      riscou.current = true
      setAssinado(true)
      aoMudar?.(true)
    }
  }
  const parar = () => {
    ultimo.current = null
  }
  const limpar = () => {
    const c = tela.current
    const g = c?.getContext('2d')
    if (c && g) {
      g.save()
      g.setTransform(1, 0, 0, 1, 0, 0)
      pintarPapel(g, c)
      g.restore()
    }
    riscou.current = false
    setAssinado(false)
    aoMudar?.(false)
  }

  return (
    <div class="pj-assinatura">
      <canvas
        ref={tela}
        class="pj-assinatura-quadro"
        data-testid="assinatura-quadro"
        aria-label="Quadro para assinar com o dedo ou a caneta"
        onPointerDown={comecar}
        onPointerMove={mover}
        onPointerUp={parar}
        onPointerCancel={parar}
        onPointerLeave={parar}
      />
      <div class="pj-assinatura-rodape">
        <span class="discreto">{assinado ? 'Assinado.' : 'Assine aqui com o dedo ou a caneta.'}</span>
        <button type="button" class="pj-pequeno" onClick={limpar} disabled={!assinado}>
          Limpar
        </button>
      </div>
    </div>
  )
}

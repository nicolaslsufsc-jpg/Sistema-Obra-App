// A prancha de forma na tela (mesmo pacote de planta da FVS), com as marcas por cima.
// Toque: dedo curto, caneta curta ou clique. Traço: a caneta sempre desenha (o dedo continua movendo
// a planta, como no Concreto); no modo "Área", o dedo e o mouse também desenham.
import type { ComponentChildren } from 'preact'
import { useLayoutEffect, useRef } from 'preact/hooks'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { instalarCaneta } from '../../concreto/caneta'
import { areaDe, caixaDe, simplificarParaGravar, type Ponto } from '../../concreto/geometria'
import type { ElementoPlanta, PlantaPavimento } from '../../concreto/planta'
import { instalarDedo } from '../dedo'
import { pecaTocada } from '../regras'

const ll = ([x, y]: Ponto): L.LatLngTuple => [-y, x]

const COR_BASE = '#5b6470'

export interface MarcaDesenho {
  id: string
  forma: 'peca' | 'area' | 'ponto'
  elemento_id?: string | null
  contorno?: ReadonlyArray<readonly [number, number]> | null
  cor: string
}

export type Modo = 'tocar' | 'ponto' | 'area'

export interface Toque {
  x: number
  y: number
  peca?: ElementoPlanta
  /** Pixels de tela por pixel da planta. */
  escala: number
}

export function MapaPlanta({
  planta,
  marcas,
  destaque,
  modo = 'tocar',
  desenha = false,
  cor = '#1565c0',
  aoTocar,
  aoArea,
  aoAreaPequena,
  children,
}: {
  planta: PlantaPavimento
  marcas: readonly MarcaDesenho[]
  /** Peça com contorno preto (a que está aberta no painel). */
  destaque?: string | null
  modo?: Modo
  /** Quem vê sem poder marcar passa false: a caneta vira um dedo. */
  desenha?: boolean
  cor?: string
  aoTocar: (t: Toque) => void
  aoArea?: (contorno: Ponto[]) => void
  aoAreaPequena?: () => void
  children?: ComponentChildren
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const tinta = useRef<HTMLCanvasElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const camadas = useRef(new Map<string, L.Polygon[]>())
  const grupo = useRef<L.LayerGroup | null>(null)
  const rend = useRef<L.Canvas | null>(null)
  // lido pelos ouvintes do mapa sem remontar o mapa
  const atual = useRef({ modo, desenha, cor, aoTocar, aoArea, aoAreaPequena })
  atual.current = { modo, desenha, cor, aoTocar, aoArea, aoAreaPequena }

  useLayoutEffect(() => {
    if (!caixa.current || !tinta.current) return
    const m = L.map(caixa.current, {
      crs: L.CRS.Simple,
      minZoom: -5,
      maxZoom: 4,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      attributionControl: false,
      zoomControl: false,
      boxZoom: false,
      doubleClickZoom: false,
      keyboard: false,
      preferCanvas: true,
    })
    mapa.current = m
    // testes e bancada: o mapa fica acessível no elemento, para medir e tocar peças
    if (import.meta.env.DEV) Object.assign(caixa.current, { __mapa: m })

    const limites = L.latLngBounds([-planta.altura, 0], [0, planta.largura])
    m.setMaxBounds(limites.pad(0.4))
    // abre nas peças, não na prancha inteira: notas e detalhes em volta deixariam a estrutura pequena
    const pontos = planta.elementos.flatMap((e) => e.polys.flat())
    const c = pontos.length > 0 ? caixaDe(pontos) : null
    const alvo = c ? L.latLngBounds(ll([c.x0, c.y1]), ll([c.x1, c.y0])) : limites
    let enquadrado = false
    const enquadrar = () => {
      m.invalidateSize({ pan: false })
      const t = m.getSize()
      if (!enquadrado && t.x > 50 && t.y > 50) {
        m.fitBounds(alvo, { padding: [16, 16], animate: false })
        enquadrado = true
      }
    }
    enquadrar()
    if (!enquadrado) m.setView(limites.getCenter(), -2, { animate: false })

    const renderizador = L.canvas({ tolerance: 6, padding: 0.3 })
    rend.current = renderizador
    montarFundo(m, planta, limites)

    // O toque é resolvido no mapa inteiro (pecaTocada), não polígono a polígono: mesma regra para
    // dedo, caneta e mouse, com folga para viga fina e nome escrito na prancha.
    const mapaCamadas = new Map<string, L.Polygon[]>()
    for (const e of planta.elementos) {
      const polys = e.polys.length
        ? e.polys
        : ([[[e.rotulo[0], e.rotulo[1]], [e.rotulo[2], e.rotulo[1]], [e.rotulo[2], e.rotulo[3]], [e.rotulo[0], e.rotulo[3]]]] as Ponto[][])
      mapaCamadas.set(
        e.id,
        polys.map((p) => L.polygon(p.map(ll), { renderer: renderizador, interactive: false, weight: 1, color: COR_BASE, fillColor: COR_BASE, fillOpacity: 0.04 }).addTo(m)),
      )
    }
    camadas.current = mapaCamadas
    grupo.current = L.layerGroup().addTo(m)

    // nomes das peças: só na planta de teste (a planta da FVS já tem os nomes no desenho)
    if (!planta.fundo) {
      const rotulos = L.layerGroup()
      for (const e of planta.elementos) {
        const [x0, y0, x1, y1] = e.rotulo
        L.marker(ll([(x0 + x1) / 2, (y0 + y1) / 2]), {
          interactive: false,
          keyboard: false,
          icon: L.divIcon({ className: 'rl-rotulo', html: e.nome, iconSize: [60, 18], iconAnchor: [30, 9] }),
        }).addTo(rotulos)
      }
      const mostrar = () => {
        if (m.getZoom() >= -2) rotulos.addTo(m)
        else rotulos.remove()
      }
      m.on('zoomend', mostrar)
      mostrar()
    }

    const tocar = (x: number, y: number) => {
      const escala = Math.pow(2, m.getZoom())
      atual.current.aoTocar({ x, y, escala, peca: pecaTocada(planta.elementos, x, y, 8 / escala) })
    }

    // Depois de um traço o navegador ainda pode mandar um "click": não vale como toque.
    let ignorarCliqueAte = 0
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (Date.now() < ignorarCliqueAte) return
      tocar(e.latlng.lng, -e.latlng.lat)
    })

    const terminar = (pts: Array<[number, number]>, comprimento: number) => {
      ignorarCliqueAte = Date.now() + 250
      if (comprimento < 12) {
        const p = m.containerPointToLatLng(pts[0])
        tocar(p.lng, -p.lat)
        return
      }
      const escala = Math.pow(2, m.getZoom())
      const naPlanta: Ponto[] = pts.map((q) => {
        const p = m.containerPointToLatLng(q)
        return [Math.round(p.lng * 10) / 10, Math.round(-p.lat * 10) / 10]
      })
      const contorno = simplificarParaGravar(naPlanta, 1.5 / escala)
      if (contorno.length < 3 || areaDe(contorno) * escala * escala < 400) {
        atual.current.aoAreaPequena?.()
        return
      }
      atual.current.aoArea?.(contorno)
    }

    const tirarCaneta = instalarCaneta(caixa.current, tinta.current, {
      ativo: () => atual.current.desenha,
      cor: () => atual.current.cor,
      mouseDesenha: () => atual.current.modo === 'area',
      aoComecar: () => m.stop(),
      aoTerminar: terminar,
    })
    const tirarDedo = instalarDedo(caixa.current, tinta.current, {
      ativo: () => atual.current.desenha && atual.current.modo === 'area',
      cor: () => atual.current.cor,
      aoTerminar: terminar,
    })
    const ro = new ResizeObserver(enquadrar)
    ro.observe(caixa.current)
    return () => {
      tirarCaneta()
      tirarDedo()
      ro.disconnect()
      m.remove()
      mapa.current = null
    }
  }, [planta])

  // No modo Área o dedo e o mouse desenham: não podem arrastar a planta ao mesmo tempo.
  useLayoutEffect(() => {
    const m = mapa.current
    if (!m) return
    if (modo === 'area' && desenha) {
      m.dragging.disable()
      m.touchZoom.disable()
    } else {
      m.dragging.enable()
      m.touchZoom.enable()
    }
  }, [modo, desenha, planta])

  // Pintura: quando mudam as marcas ou a peça aberta. No mesmo quadro da tela (useLayoutEffect): a
  // cor na planta não pode aparecer depois do aviso "P12 marcada".
  useLayoutEffect(() => {
    const g = grupo.current
    if (!g || !mapa.current) return
    g.clearLayers()
    for (const ls of camadas.current.values()) {
      for (const l of ls) l.setStyle({ color: COR_BASE, fillColor: COR_BASE, fillOpacity: 0.04, weight: 1 })
    }
    for (const mc of marcas) {
      if (mc.forma === 'peca') {
        const ls = camadas.current.get(mc.elemento_id ?? '') ?? []
        for (const l of ls) l.setStyle({ color: mc.cor, fillColor: mc.cor, fillOpacity: 0.55, weight: 2.5 })
        // com o andar inteiro na tela o pilar tem poucos pixels: o anel mostra onde ele está
        if (ls[0]) L.circleMarker(ls[0].getBounds().getCenter(), { renderer: rend.current!, interactive: false, radius: 9, color: mc.cor, weight: 2, fill: false }).addTo(g)
      } else if (mc.forma === 'area' && mc.contorno) {
        L.polygon(mc.contorno.map((p) => ll(p as Ponto)), { renderer: rend.current!, interactive: false, color: mc.cor, weight: 3, fillOpacity: 0.18 }).addTo(g)
      } else if (mc.forma === 'ponto' && mc.contorno?.[0]) {
        L.circleMarker(ll(mc.contorno[0] as Ponto), { renderer: rend.current!, interactive: false, radius: 10, color: '#fff', weight: 3, fillColor: mc.cor, fillOpacity: 1 }).addTo(g)
      }
    }
    if (destaque) for (const l of camadas.current.get(destaque) ?? []) l.setStyle({ color: '#111', weight: 4 })
  }, [marcas, destaque, planta])

  return (
    <div class={`rl-mapa${modo === 'area' && desenha ? ' desenhando' : ''}`} ref={caixa} data-testid="mapa">
      <canvas ref={tinta} class="rl-tinta" />
      {children}
    </div>
  )
}

function montarFundo(m: L.Map, planta: PlantaPavimento, limites: L.LatLngBounds) {
  const f = planta.fundo
  if (!f) return
  const Camada = L.GridLayer.extend({
    createTile(c: L.Coords) {
      const img = document.createElement('img')
      img.alt = ''
      const url = f.url(c.z, c.x, c.y)
      if (url) img.src = url
      return img
    },
  }) as unknown as new (o: L.GridLayerOptions) => L.GridLayer
  new Camada({
    tileSize: f.tile,
    minNativeZoom: Math.min(...f.niveis),
    maxNativeZoom: Math.max(...f.niveis),
    minZoom: -5,
    maxZoom: 4,
    bounds: limites,
    noWrap: true,
    keepBuffer: 4,
  }).addTo(m)
}

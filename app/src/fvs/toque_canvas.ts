// O Canvas da planta com o toque pelo contorno mais perto (a regra está em toque.ts).
import L from 'leaflet'
import { escolherNoToque, distanciaAoContorno, type Candidato, type OpcoesDeToque, type Ponto } from './toque'

type CamadaDoCanvas = L.Path & {
  _parts?: Ponto[][]
  _containsPoint(p: L.Point): boolean
  options: L.PathOptions & OpcoesDeToque
}

function candidato(camada: CamadaDoCanvas, p: L.Point, tolerancia: number): Candidato<CamadaDoCanvas> | null {
  const o = camada.options
  const margem = o.margemToque ?? tolerancia
  const fundo = !!o.toqueDeFundo
  const parte = !!o.toqueDeParte
  if (camada instanceof L.Polygon && camada._parts) {
    const meiaLinha = o.stroke === false ? 0 : (o.weight ?? 3) / 2
    const d = distanciaAoContorno(p, camada._parts)
    return { camada, d: d === 0 ? 0 : Math.max(0, d - meiaLinha), margem, fundo, parte }
  }
  // outros desenhos (nenhum hoje na planta): como o Leaflet faz
  return camada._containsPoint(p) ? { camada, d: 0, margem, fundo, parte } : null
}

/** Liga ou desliga o toque nos desenhos (desligado: o toque vai direto para o mapa). */
export function toqueSoNoMapa(r: L.Canvas | null, so: boolean) {
  if (r) (r as unknown as { soMapa: boolean }).soMapa = so
}

/** O renderizador de Canvas da planta, com o toque pelo contorno mais perto. */
export function canvasDaPlanta(opcoes: L.RendererOptions): L.Canvas {
  const Canvas = (L.Canvas as unknown as { extend(props: object): new (o: L.RendererOptions) => L.Canvas }).extend({
    _onClick(this: any, e: MouseEvent) {
      // aba Barras: nenhum desenho recebe o toque, ele vai todo para o mapa (que escolhe a barra)
      if (this.soMapa) return this._fireEvent(false, e)
      const p: L.Point = this._map.mouseEventToLayerPoint(e)
      const clique = e.type === 'click' || e.type === 'preclick'
      const candidatos: Candidato<CamadaDoCanvas>[] = []
      for (let ordem = this._drawFirst; ordem; ordem = ordem.next) {
        const camada = ordem.layer as CamadaDoCanvas
        if (!camada.options.interactive) continue
        if (clique && this._map._draggableMoved(camada)) continue
        const c = candidato(camada, p, this.options.tolerance || 0)
        if (c) candidatos.push(c)
      }
      const escolhida = escolherNoToque(candidatos)
      this._fireEvent(escolhida ? [escolhida] : false, e)
    },
  })
  return new Canvas(opcoes)
}

// Leva o corte para fora do app: DXF (abre no AutoCAD) e SVG (vetor para qualquer programa).
// Medidas em metros, sem escala: 1 unidade do desenho = 1 metro.
import type { ResultadoCorte } from './corte'

export interface InfoPeca {
  /** Nome da camada no DXF: categoria da peça. */
  camada: string
  corCorte: string
}

export interface Nivel {
  nome: string
  /** Coordenada V no plano do corte. */
  v: number
}

function nomeCamadaDxf(t: string): string {
  return (
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .toUpperCase() || 'CORTE'
  )
}

function n(v: number): string {
  return v.toFixed(4)
}

/** DXF R12: o formato mais simples, abre em qualquer versão do AutoCAD. */
export function corteParaDxf(r: ResultadoCorte, info: (chave: number, elemento: number) => InfoPeca, niveis: readonly Nivel[] = []): string {
  const camadas = new Set<string>(['NIVEIS'])
  const corpo: string[] = []
  const polilinha = (pts: Float64Array, fechada: boolean, camada: string) => {
    corpo.push('0', 'POLYLINE', '8', camada, '66', '1', '70', fechada ? '1' : '0')
    for (let i = 0; i < pts.length; i += 2) {
      corpo.push('0', 'VERTEX', '8', camada, '10', n(pts[i]), '20', n(pts[i + 1]), '30', '0.0')
    }
    corpo.push('0', 'SEQEND', '8', camada)
  }
  for (const p of r.pecas) {
    const camada = nomeCamadaDxf(info(p.chave, p.elemento).camada)
    camadas.add(camada)
    for (const l of p.lacos) polilinha(l, true, camada)
    for (const a of p.abertos) polilinha(a, false, camada)
  }
  if (r.limites) {
    const [u0, , u1] = r.limites
    const folga = (u1 - u0) * 0.04 + 0.5
    for (const nv of niveis) {
      corpo.push('0', 'LINE', '8', 'NIVEIS', '10', n(u0 - folga), '20', n(nv.v), '30', '0.0', '11', n(u1 + folga), '21', n(nv.v), '31', '0.0')
      corpo.push('0', 'TEXT', '8', 'NIVEIS', '10', n(u0 - folga), '20', n(nv.v + 0.08), '30', '0.0', '40', '0.2', '1', nv.nome.replace(/[\r\n]/g, ' '))
    }
  }
  const tabela: string[] = ['0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(camadas.size)]
  let cor = 1
  for (const c of camadas) {
    tabela.push('0', 'LAYER', '2', c, '70', '0', '62', String((cor++ % 7) + 1), '6', 'CONTINUOUS')
  }
  tabela.push('0', 'ENDTAB', '0', 'ENDSEC')
  const secao = ['0', 'SECTION', '2', 'ENTITIES', ...corpo, '0', 'ENDSEC', '0', 'EOF']
  return [...tabela, ...secao].join('\n') + '\n'
}

function escapar(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** SVG com as peças cheias. Y invertido, porque no SVG o Y cresce para baixo. */
export function corteParaSvg(r: ResultadoCorte, info: (chave: number, elemento: number) => InfoPeca, niveis: readonly Nivel[] = []): string {
  if (!r.limites) return '<svg xmlns="http://www.w3.org/2000/svg"/>'
  const [u0, v0, u1, v1] = r.limites
  const folga = Math.max(u1 - u0, v1 - v0) * 0.04 + 0.5
  const margemNivel = niveis.length ? folga * 3 : 0
  const x = u0 - folga - margemNivel
  const y = -v1 - folga
  const w = u1 - u0 + 2 * folga + margemNivel
  const h = v1 - v0 + 2 * folga
  const partes: string[] = []
  const caminho = (l: Float64Array, fechar: boolean) => {
    let d = ''
    for (let i = 0; i < l.length; i += 2) d += `${i === 0 ? 'M' : 'L'}${l[i].toFixed(3)} ${(-l[i + 1]).toFixed(3)}`
    return fechar ? d + 'Z' : d
  }
  for (const p of r.pecas) {
    const { corCorte } = info(p.chave, p.elemento)
    if (p.lacos.length) {
      partes.push(`<path d="${p.lacos.map((l) => caminho(l, true)).join('')}" fill="${corCorte}" fill-rule="evenodd" stroke="#18222e" stroke-width="0.012"/>`)
    }
    for (const a of p.abertos) partes.push(`<path d="${caminho(a, false)}" fill="none" stroke="#18222e" stroke-width="0.012"/>`)
  }
  for (const nv of niveis) {
    partes.push(`<line x1="${x.toFixed(3)}" x2="${(x + w).toFixed(3)}" y1="${(-nv.v).toFixed(3)}" y2="${(-nv.v).toFixed(3)}" stroke="#1f4e79" stroke-width="0.012" stroke-dasharray="0.2 0.1"/>`)
    partes.push(`<text x="${x.toFixed(3)}" y="${(-nv.v - 0.06).toFixed(3)}" font-size="0.22" font-family="sans-serif" fill="#1f4e79">${escapar(nv.nome)}</text>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x.toFixed(3)} ${y.toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)}" width="${(w * 50).toFixed(0)}" height="${(h * 50).toFixed(0)}"><rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${w.toFixed(3)}" height="${h.toFixed(3)}" fill="#fff"/>${partes.join('')}</svg>`
}

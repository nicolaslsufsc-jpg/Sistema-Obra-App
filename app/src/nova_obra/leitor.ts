// Nova obra, etapa 3: leitor de pilares e vigas de uma planta de forma, no navegador.
//
// É o porte do leitor do PC (pipeline/legado/gerador_fvs.py: pilares_da_forma, vigas_da_forma,
// faixa_da_viga; e pipeline/fvs/estrutura.py: painel de laje, viga larga e inclinada), com uma
// diferença: o que lá é fixo para a projetista da obra piloto (camadas PILAR_CONCRETO e VIG_FACES,
// nomes "P12" e "V 132", seção "(20x50)" embaixo do nome) aqui vem de um PERFIL DA PROJETISTA, que é
// dado: o perfil da obra piloto vem pronto, e o de outra projetista se ensina com 2 ou 3 toques
// (aprenderPerfil).
//
// Medidas em pontos do PDF, como no Python (lá a planta é 1:50). As larguras de viga dependem da
// escala e são convertidas; as distâncias entre nome e desenho são de papel e ficam iguais.
import type { DesenhoDaPagina, Retangulo, TextoDaPagina, Traco } from './desenho'

export type ModoSecao = 'no_nome' | 'abaixo' | 'perto' | 'nenhuma'

export interface RegraPeca {
  /** expressão do nome inteiro (sem a seção), ex. "^P\d+[a-z]*$" */
  padrao: string
  /** camada dos contornos (pilar) ou das faces (viga); null = qualquer uma */
  camada: string | null
  /** onde está a seção: no mesmo texto do nome, embaixo dele, perto, ou não tem */
  secao: ModoSecao
  /** expressão do texto da seção quando ela é separada; o grupo 1 é a seção */
  secaoPadrao: string
}

export interface PerfilProjetista {
  id: string
  nome: string
  /** onde estão os nomes: texto normal do PDF, comentário, ou os dois */
  textos: 'texto' | 'comentario' | 'ambos'
  pilar: RegraPeca
  viga: RegraPeca
  /**
   * A viga para no pilar quando o vão seguinte tem o nome de outra viga na mesma fila de nomes (viga de
   * um vão só). Desligado no perfil da obra piloto, para dar o mesmo resultado do PC.
   */
  vigaPorVao?: boolean
}

/** Perfil da obra piloto: o leitor do PC, igual. */
export const PERFIL_PILOTO: PerfilProjetista = {
  id: 'piloto',
  nome: 'Projetista da obra piloto (camadas PILAR_CONCRETO e VIG_FACES)',
  textos: 'comentario',
  pilar: { padrao: '^P\\d+[a-z]*$', camada: 'PILAR_CONCRETO', secao: 'abaixo', secaoPadrao: '^\\((\\d+x\\d+)\\)$' },
  viga: { padrao: '^V ?\\d+[A-Za-z]*$', camada: 'VIG_FACES', secao: 'perto', secaoPadrao: '^[ab]: ?(\\d+/\\d+)$' },
}

export interface PecaLida {
  tipo: 'P' | 'V'
  nome: string
  secao: string
  /** em pontos da folha */
  rotulo: Retangulo
  polys: Array<Array<[number, number]>>
}

export interface Leitura {
  pecas: PecaLida[]
  /** textos com cara de nome de peça que o leitor não usou (outro jeito de escrever, peça sem seção...) */
  naoLidos: TextoDaPagina[]
  /** "V40" com "h=12" encostado: painel de laje, não viga */
  paineis: TextoDaPagina[]
  /** pilar com o mesmo nome em mais de um lugar (ficou o de contorno mais perto) */
  repetidos: string[]
}

// ----------------------------------------------------------------------------------------- geometria

const largura = (r: Retangulo) => r[2] - r[0]
const altura = (r: Retangulo) => r[3] - r[1]
const centro = (r: Retangulo): [number, number] => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2]
const uniao = (a: Retangulo, b: Retangulo): Retangulo => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]
const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100
const ret1 = (r: Retangulo): Retangulo => [r1(r[0]), r1(r[1]), r1(r[2]), r1(r[3])]

/** Distância entre retângulos (0 se encostam). */
export function distRet(a: Retangulo, b: Retangulo): number {
  const dx = Math.max(a[0] - b[2], b[0] - a[2], 0)
  const dy = Math.max(a[1] - b[3], b[1] - a[3], 0)
  return Math.hypot(dx, dy)
}

function seCruzam(a: Retangulo, b: Retangulo): boolean {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]
}

function caixa(pts: number[]): Retangulo {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i])
    x1 = Math.max(x1, pts[i])
    y0 = Math.min(y0, pts[i + 1])
    y1 = Math.max(y1, pts[i + 1])
  }
  return [x0, y0, x1, y1]
}

/** Quadrilátero fechado (o "re" e o "qu" do PyMuPDF). */
const ehQuadrilatero = (t: Traco) => t.fechado && t.pts.length === 8

/** Segmento [linha, início, fim] na horizontal (linha = y) ou na vertical (linha = x). */
type Seg = [number, number, number]

export interface Segmentos {
  hs: Seg[]
  vs: Seg[]
  inclinados: Array<[number, number, number, number]>
}

/** Faces de viga de uma camada: retas (horizontais e verticais) e inclinadas, como segmentos_vigas. */
export function segmentosDaCamada(tracos: readonly Traco[], camada: string | null): Segmentos {
  const hs: Seg[] = []
  const vs: Seg[] = []
  const inclinados: Array<[number, number, number, number]> = []
  for (const t of tracos) {
    if (camada !== null && t.camada !== camada) continue
    const quad = ehQuadrilatero(t)
    const n = t.pts.length / 2
    const lados = t.fechado ? n : n - 1
    for (let i = 0; i < lados; i++) {
      const ax = t.pts[2 * i]
      const ay = t.pts[2 * i + 1]
      const bx = t.pts[(2 * (i + 1)) % t.pts.length]
      const by = t.pts[(2 * (i + 1) + 1) % t.pts.length]
      const dx = bx - ax
      const dy = by - ay
      if (Math.abs(dx) > 1 && Math.abs(dy) > 1) {
        if (Math.hypot(dx, dy) > 6) inclinados.push([ax, ay, bx, by])
      } else if (!quad) {
        // como o PC: as faces retas vêm das linhas soltas; retângulo fechado é outra coisa (pilar, furo)
        if (Math.abs(ay - by) < 0.3 && Math.abs(dx) > 1) hs.push([r1((ay + by) / 2), Math.min(ax, bx), Math.max(ax, bx)])
        else if (Math.abs(ax - bx) < 0.3 && Math.abs(dy) > 1) vs.push([r1((ax + bx) / 2), Math.min(ay, by), Math.max(ay, by)])
      }
    }
  }
  return { hs, vs, inclinados }
}

/** Trechos cobertos na mesma linha, juntando os que se encostam (intervalos do PC). */
function intervalos(segs: readonly Seg[], linha: number, tol = 0.6): Array<[number, number]> {
  const iv = segs.filter((s) => Math.abs(s[0] - linha) <= tol).map((s) => [s[1], s[2]] as [number, number])
  iv.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const out: Array<[number, number]> = []
  for (const [s0, s1] of iv) {
    if (out.length && s0 <= out[out.length - 1][1] + 1.5) out[out.length - 1][1] = Math.max(out[out.length - 1][1], s1)
    else out.push([s0, s1])
  }
  return out
}

/** Larguras de viga em pontos para a escala: o PC usa 7 a 30 pontos (até 48 nas largas) em 1:50. */
export function largurasDeViga(escala: number): { min: number; normal: number; larga: number } {
  const f = 50 / (escala || 50)
  return { min: 7 * f, normal: 30 * f, larga: 48 * f }
}

/**
 * O par de faces paralelas ao lado do nome, estendido ao longo da viga até outra viga começar
 * (faixa_reta do PC). "outros" são os nomes das outras vigas na mesma direção: [início, fim, linha].
 */
export function faixaReta(
  lbl: Retangulo,
  horizontal: boolean,
  segs: readonly Seg[],
  outros: ReadonlyArray<[number, number, number]>,
  larg: { min: number; max: number; normal: number },
  vigaPorVao = false,
): Retangulo | null {
  let cAx: number, cTr: number, t0: number, t1: number, a0: number
  if (horizontal) {
    ;[cAx, cTr, t0, t1, a0] = [(lbl[0] + lbl[2]) / 2, (lbl[1] + lbl[3]) / 2, lbl[1], lbl[3], lbl[0]]
  } else {
    ;[cAx, cTr, t0, t1, a0] = [(lbl[1] + lbl[3]) / 2, (lbl[0] + lbl[2]) / 2, lbl[0], lbl[2], lbl[1]]
  }
  const linhas = [...new Set(segs.filter(([l, s0, s1]) => s0 - 25 <= cAx && cAx <= s1 + 25 && Math.abs(l - cTr) < 40 + larg.max - larg.normal).map((s) => s[0]))].sort((a, b) => a - b)
  const cobre = (iv: Array<[number, number]>) => iv.some(([s0, s1]) => s0 - 25 <= cAx && cAx <= s1 + 25)
  let melhor: [number, number, number] | null = null
  const ivs = new Map<number, Array<[number, number]>>()
  const iv = (l: number) => {
    let v = ivs.get(l)
    if (!v) ivs.set(l, (v = intervalos(segs, l)))
    return v
  }
  for (let i = 0; i < linhas.length; i++) {
    for (let j = i + 1; j < linhas.length; j++) {
      const la = linhas[i]
      const lb = linhas[j]
      const w = lb - la
      if (w < larg.min || w > larg.max) continue
      if (!cobre(iv(la)) || !cobre(iv(lb))) continue
      const d = la <= cTr && cTr <= lb ? 0 : Math.min(Math.abs(cTr - la), Math.abs(cTr - lb), Math.abs(t0 - lb), Math.abs(t1 - la))
      if (d > 22) continue
      if (!melhor || d < melhor[0] || (d === melhor[0] && w < melhor[2] - melhor[1])) melhor = [d, la, lb]
    }
  }
  if (!melhor) return null
  const [, la, lb] = melhor
  const juntos: Array<[number, number]> = []
  for (const [s0, s1] of [...iv(la), ...iv(lb)].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    if (juntos.length && s0 <= juntos[juntos.length - 1][1] + 2) juntos[juntos.length - 1][1] = Math.max(juntos[juntos.length - 1][1], s1)
    else juntos.push([s0, s1])
  }
  const cortes = outros.filter(([o0, o1, otr]) => la - 24 <= otr && otr <= lb + 24 && !(o0 <= cAx && cAx <= o1)).map((o) => o[0])
  // nomes de outra viga na mesma linha de texto que este (mesma fila de nomes, como numa viga por vão)
  const mesmaFila = vigaPorVao ? outros.filter(([o0, o1, otr]) => Math.abs(otr - cTr) < 3 && !(o0 <= cAx && cAx <= o1)).map((o) => o[0]) : []
  let k = 0
  let kd = Infinity
  juntos.forEach(([s0, s1], j) => {
    const d = s0 - 25 <= cAx && cAx <= s1 + 25 ? 0 : Math.min(Math.abs(s0 - cAx), Math.abs(s1 - cAx))
    if (d < kd) [k, kd] = [j, d]
  })
  let [ini, fim] = juntos[k]
  let j = k
  // Acréscimo ao PC (só com vigaPorVao): lá a viga só para se o nome da outra estiver nos primeiros 30
  // pontos do trecho seguinte. Aqui para também se o nome de outra viga, na mesma fila de nomes,
  // estiver em qualquer lugar do trecho seguinte (viga de um vão só com o nome no meio não invade a
  // vizinha). Ver docs/modulos/nova_obra.md, etapa 3.
  const paraNoTrecho = (t: [number, number], antes: number) => cortes.some((c) => antes - 5 < c && c <= t[0] + 30) || mesmaFila.some((c) => antes - 5 < c && c <= t[1])
  while (j + 1 < juntos.length && juntos[j + 1][0] - juntos[j][1] <= 45 && !paraNoTrecho(juntos[j + 1], juntos[j][1])) {
    j++
    fim = juntos[j][1]
  }
  j = k
  while (j - 1 >= 0 && juntos[j][0] - juntos[j - 1][1] <= 45 && !cortes.some((c) => juntos[j - 1][1] - 5 < c && c <= juntos[j][0] + 30) && !mesmaFila.some((c) => juntos[j - 1][0] - 5 < c && c <= juntos[j][0]) && juntos[j][0] > a0 - 25) {
    j--
    ini = juntos[j][0]
  }
  for (const c of cortes) {
    if (cAx < c && c < fim) fim = Math.min(fim, c - 6)
    if (ini < c && c < a0 - 30) ini = Math.max(ini, c)
  }
  return horizontal ? [ini, la, fim, lb] : [la, ini, lb, fim]
}

function distPontoSegmento(px: number, py: number, s: readonly number[]): number {
  const [ax, ay, bx, by] = s
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

const anguloDe = (s: readonly number[]) => (((Math.atan2(s[3] - s[1], s[2] - s[0]) * 180) / Math.PI) % 180 + 180) % 180

/** Viga inclinada (rampa): gira o desenho até a viga ficar deitada e usa a mesma busca (faixa_inclinada do PC). */
export function faixaInclinada(rotulo: Retangulo, segs: ReadonlyArray<readonly number[]>, larg: { min: number; max: number; normal: number }): Array<[number, number]> | null {
  const [cx, cy] = centro(rotulo)
  const angulos: number[] = []
  for (const a of segs.filter((s) => distPontoSegmento(cx, cy, s) < 45).map(anguloDe).sort((a, b) => a - b)) {
    if (!angulos.length || a - angulos[angulos.length - 1] > 2) angulos.push(a)
  }
  const meio = Math.max(largura(rotulo), altura(rotulo)) / 2
  const nome: Retangulo = [-meio, -5, meio, 5]
  let melhor: [number, number, number, Retangulo] | null = null
  for (const ang of angulos) {
    const th = (ang * Math.PI) / 180
    const cos = Math.cos(th)
    const sin = Math.sin(th)
    const hs: Seg[] = []
    for (const s of segs) {
      const dif = Math.abs(anguloDe(s) - ang)
      if (Math.min(dif, 180 - dif) > 1.5) continue
      const gira = (x: number, y: number) => [(x - cx) * cos + (y - cy) * sin, -(x - cx) * sin + (y - cy) * cos]
      const [x0, y0] = gira(s[0], s[1])
      const [x1, y1] = gira(s[2], s[3])
      hs.push([r1((y0 + y1) / 2), Math.min(x0, x1), Math.max(x0, x1)])
    }
    const fx = faixaReta(nome, true, hs, [], larg)
    if (!fx) continue
    const d = fx[1] <= 0 && 0 <= fx[3] ? 0 : Math.min(Math.abs(fx[1]), Math.abs(fx[3]))
    if (!melhor || d < melhor[0]) melhor = [d, cos, sin, fx]
  }
  if (!melhor) return null
  const [, cos, sin, fx] = melhor
  return [
    [fx[0], fx[1]],
    [fx[2], fx[1]],
    [fx[2], fx[3]],
    [fx[0], fx[3]],
  ].map(([x, y]) => [r2(cx + x * cos - y * sin), r2(cy + x * sin + y * cos)] as [number, number])
}

const poligonoDe = (r: Retangulo): Array<[number, number]> => [
  [r2(r[0]), r2(r[1])],
  [r2(r[2]), r2(r[1])],
  [r2(r[2]), r2(r[3])],
  [r2(r[0]), r2(r[3])],
]

// ------------------------------------------------------------------------------------------- nomes

/** Seção escrita no mesmo texto do nome: "P-01  20x50", "VT-03 15/40", "P12 (19x60)". */
const RE_SECAO_JUNTO = /^(.*?\S)\s+\(?\s*(\d+\s*[xX×/]\s*\d+)\s*\)?$/
const RE_ALTURA = /^h ?= ?\d/
/** Com cara de nome de peça: 1 a 3 letras, número. */
const RE_PARECE_NOME = /^[A-Z]{1,3}[- ]?\d+[A-Za-z]*$/

/** Nome sem espaço: "V 40" -> "V40" (nome_viga do PC). */
export const nomeLimpo = (s: string) => s.replace(/\s+/g, '')

/** Nome e seção de um texto, conforme a regra. Null se não é nome desta regra. */
export function lerNome(texto: string, regra: RegraPeca): { nome: string; secao: string } | null {
  const re = new RegExp(regra.padrao)
  const t = texto.trim()
  if (regra.secao === 'no_nome') {
    const m = RE_SECAO_JUNTO.exec(t)
    if (m && re.test(m[1].trim())) return { nome: nomeLimpo(m[1]), secao: m[2].replace(/\s+/g, '') }
  }
  if (re.test(t)) return { nome: nomeLimpo(t), secao: '' }
  return null
}

function textosDoPerfil(d: DesenhoDaPagina, perfil: PerfilProjetista): TextoDaPagina[] {
  return d.textos.filter((t) => perfil.textos === 'ambos' || (t.origem ?? 'texto') === perfil.textos)
}

/** Índices dos nomes de viga que são painel de laje: "h=12+5" encostado embaixo (rotulos_de_painel do PC). */
function paineisDeLaje(textos: readonly TextoDaPagina[], regraViga: RegraPeca): Set<number> {
  const rotulos = textos.map((t, i) => [i, t] as const).filter(([, t]) => /^[A-Z]{1,3} ?\d+[A-Za-z]*$/.test(t.texto))
  const fora = new Set<number>()
  if (!rotulos.length) return fora
  const re = new RegExp(regraViga.padrao)
  for (const h of textos) {
    if (!RE_ALTURA.test(h.texto)) continue
    let mi = -1
    let md = Infinity
    for (const [i, r] of rotulos) {
      const dd = distRet(r.ret, h.ret)
      if (dd < md) [mi, md] = [i, dd]
    }
    if (md < 6 && re.test(textos[mi].texto)) fora.add(mi)
  }
  return fora
}

// ------------------------------------------------------------------------------------------ leitura

function dentro(r: Retangulo, janela: Retangulo | null): boolean {
  if (!janela) return true
  const [cx, cy] = centro(r)
  return cx >= janela[0] && cx <= janela[2] && cy >= janela[1] && cy <= janela[3]
}

interface Contorno {
  caixa: Retangulo
  pts: number[]
}

function contornosDePilar(d: DesenhoDaPagina, regra: RegraPeca, escala: number): Contorno[] {
  const ppm = (1000 / (escala || 50) / 25.4) * 72 // pontos por metro
  const saida: Contorno[] = []
  for (const t of d.tracos) {
    if (regra.camada !== null ? t.camada !== regra.camada || !ehQuadrilatero(t) : !t.fechado || t.pts.length < 6) continue
    const c = caixa(t.pts)
    // sem camada definida: só o que tem tamanho de pilar (de 10 cm a 3 m), para não pegar a folha ou o carimbo
    if (regra.camada === null && (Math.max(largura(c), altura(c)) > 3 * ppm || Math.min(largura(c), altura(c)) < 0.1 * ppm)) continue
    saida.push({ caixa: c, pts: t.pts })
  }
  return saida
}

/** Pilares: nome, seção e o contorno mais perto (pilares_da_forma do PC). */
function lerPilares(textos: readonly TextoDaPagina[], d: DesenhoDaPagina, regra: RegraPeca, escala: number, janela: Retangulo | null, usados: Set<TextoDaPagina>) {
  const contornos = contornosDePilar(d, regra, escala)
  const reSecao = new RegExp(regra.secaoPadrao)
  const secoes = textos.filter((t) => reSecao.test(t.texto))
  const cand = new Map<string, PecaLida & { dist: number; lugares: Retangulo[] }>()
  for (const t of textos) {
    if (!dentro(t.ret, janela)) continue
    const lido = lerNome(t.texto, regra)
    if (!lido) continue
    const r = t.ret
    const cx = centro(r)[0]
    const secs: string[] = []
    let rot: Retangulo = r
    if (regra.secao === 'no_nome') {
      if (lido.secao) secs.push(lido.secao)
    } else if (regra.secao === 'abaixo') {
      let yref = r[3]
      for (const s of [...secoes].sort((a, b) => a.ret[1] - b.ret[1])) {
        if (Math.abs(centro(s.ret)[0] - cx) < 22 && s.ret[1] - yref > -9 && s.ret[1] - yref < 12) {
          secs.push(reSecao.exec(s.texto)![1])
          yref = s.ret[3]
        }
      }
      for (const s of secoes) {
        const v = reSecao.exec(s.texto)![1]
        if (secs.includes(v) && Math.abs(centro(s.ret)[0] - cx) < 22 && s.ret[1] - r[1] >= 0 && s.ret[1] - r[1] < 40) {
          rot = uniao(rot, s.ret)
          usados.add(s)
        }
      }
    } else if (regra.secao === 'perto') {
      let melhor: TextoDaPagina | null = null
      for (const s of secoes) if (distRet(s.ret, r) < 30 && (!melhor || distRet(s.ret, r) < distRet(melhor.ret, r))) melhor = s
      if (melhor) {
        secs.push(reSecao.exec(melhor.texto)![1])
        rot = uniao(rot, melhor.ret)
        usados.add(melhor)
      }
    }
    if (regra.secao !== 'nenhuma' && !secs.length) continue // nome solto (tabela, legenda): não é pilar desenhado
    usados.add(t)
    let mi = -1
    let md = Infinity
    contornos.forEach((c, i) => {
      const dd = distRet(c.caixa, r)
      if (dd < md) [mi, md] = [i, dd]
    })
    const poly = mi >= 0 && md < 80 ? contornos[mi].pts : null
    const polys: Array<Array<[number, number]>> = []
    if (poly) {
      const p: Array<[number, number]> = []
      for (let i = 0; i < poly.length; i += 2) p.push([r2(poly[i]), r2(poly[i + 1])])
      polys.push(p)
    }
    const reg = { tipo: 'P' as const, nome: lido.nome, secao: [...new Set(secs)].join(' / '), rotulo: ret1(rot), polys, dist: r1(md), lugares: [r] }
    const ant = cand.get(lido.nome)
    if (ant) reg.lugares = [...ant.lugares, r]
    if (!ant || (!ant.polys.length && poly) || (poly && ant.polys.length && md < ant.dist)) cand.set(lido.nome, reg)
    else ant.lugares = reg.lugares
  }
  const repetidos = [...cand.values()].filter((c) => c.lugares.some((l) => distRet(l, c.lugares[0]) > 40)).map((c) => c.nome)
  return { pilares: [...cand.values()].map(({ dist: _d, lugares: _l, ...p }) => p), repetidos }
}

/** Vigas: nome, faixa entre as faces e seção (vigas_da_forma do PC + viga larga e inclinada). */
function lerVigas(textos: readonly TextoDaPagina[], d: DesenhoDaPagina, regra: RegraPeca, escala: number, janela: Retangulo | null, usados: Set<TextoDaPagina>, vigaPorVao: boolean) {
  const { hs, vs, inclinados } = segmentosDaCamada(d.tracos, regra.camada)
  const lv = largurasDeViga(escala)
  const reSecao = new RegExp(regra.secaoPadrao)
  const secs = textos.filter((t) => reSecao.test(t.texto)).map((t) => ({ s: reSecao.exec(t.texto)![1], t }))
  const rot: Array<{ nome: string; secao: string; r: Retangulo; t: TextoDaPagina }> = []
  for (const t of textos) {
    if (!dentro(t.ret, janela)) continue
    const lido = lerNome(t.texto, regra)
    if (lido) rot.push({ nome: lido.nome, secao: lido.secao, r: t.ret, t })
  }
  const deitado = (r: Retangulo) => largura(r) >= altura(r)
  const hor = rot.filter((o) => deitado(o.r)).map((o) => [o.r[0], o.r[2], (o.r[1] + o.r[3]) / 2] as [number, number, number])
  const ver = rot.filter((o) => !deitado(o.r)).map((o) => [o.r[1], o.r[3], (o.r[0] + o.r[2]) / 2] as [number, number, number])
  const res = new Map<string, PecaLida & { secs: string[] }>()
  for (const { nome, secao, r, t } of rot) {
    usados.add(t)
    const h = deitado(r)
    const ini = h ? r[0] : r[1]
    const tr = h ? (r[1] + r[3]) / 2 : (r[0] + r[2]) / 2
    const outros = (h ? hor : ver).filter((o) => !(Math.abs(o[0] - ini) < 0.5 && Math.abs(o[2] - tr) < 0.5))
    const fx = faixaReta(r, h, h ? hs : vs, outros, { min: lv.min, max: lv.normal, normal: lv.normal }, vigaPorVao)
    let reg = res.get(nome)
    if (!reg) res.set(nome, (reg = { tipo: 'V', nome, secao: '', rotulo: ret1(r), polys: [], secs: [] }))
    if (secao) reg.secs.push(secao)
    if (!fx) continue
    reg.polys.push(poligonoDe(fx))
    if (reg.polys.length === 1) reg.rotulo = ret1(r)
    if (regra.secao === 'perto') {
      const zona: Retangulo = [fx[0] - 26, fx[1] - 26, fx[2] + 26, fx[3] + 26]
      for (const s of secs) {
        if (deitado(s.t.ret) === h && seCruzam(zona, s.t.ret)) {
          reg.secs.push(s.s)
          usados.add(s.t)
        }
      }
    }
  }
  // o leitor da obra não achou: tenta viga larga, inclinada e inclinada larga, nessa ordem (estrutura.py)
  // (como no PC: só nas vigas sem contorno nenhum depois da primeira busca, e em todos os nomes delas)
  const semContorno = new Set([...res.values()].filter((v) => !v.polys.length).map((v) => v.nome))
  for (const { nome, r } of rot) {
    const reg = res.get(nome)!
    if (!semContorno.has(nome)) continue
    const h = deitado(r)
    const fx = faixaReta(r, h, h ? hs : vs, [], { min: lv.min, max: lv.larga, normal: lv.normal })
    const p = fx
      ? poligonoDe(fx)
      : faixaInclinada(r, inclinados, { min: lv.min, max: lv.normal, normal: lv.normal }) ?? faixaInclinada(r, inclinados, { min: lv.min, max: lv.larga, normal: lv.normal })
    if (p) reg.polys.push(p)
  }
  return [...res.values()].map(({ secs: ss, ...v }) => ({ ...v, secao: [...new Set(ss)].join(' / ') }))
}

/** Lê pilares e vigas da folha com o perfil. Janela: só os nomes dentro dela (pontos da folha). */
export function lerPecas(d: DesenhoDaPagina, perfil: PerfilProjetista, escala: number, janela: Retangulo | null = null): Leitura {
  const todos = textosDoPerfil(d, perfil)
  const fora = paineisDeLaje(todos, perfil.viga)
  const paineis = todos.filter((_, i) => fora.has(i) && dentro(todos[i].ret, janela))
  const textos = todos.filter((_, i) => !fora.has(i))
  const usados = new Set<TextoDaPagina>(paineis)
  const { pilares, repetidos } = lerPilares(textos, d, perfil.pilar, escala, janela, usados)
  const vigas = lerVigas(textos, d, perfil.viga, escala, janela, usados, !!perfil.vigaPorVao)
  const pecas = [...pilares.sort((a, b) => a.nome.localeCompare(b.nome)), ...vigas.sort((a, b) => a.nome.localeCompare(b.nome))]
  const naoLidos = d.textos.filter((t) => !usados.has(t) && dentro(t.ret, janela) && pareceNome(t.texto))
  return { pecas, naoLidos, paineis, repetidos }
}

/** O texto (ou o começo dele, antes da seção) tem cara de nome de peça. */
export function pareceNome(texto: string): boolean {
  const t = texto.trim()
  const m = RE_SECAO_JUNTO.exec(t)
  return RE_PARECE_NOME.test(t) || (!!m && RE_PARECE_NOME.test(m[1].trim()))
}

/** Tenta cada perfil e fica com o que achou mais peças. Nenhum achou: null ("me ensine"). */
export function lerComPerfis(d: DesenhoDaPagina, perfis: readonly PerfilProjetista[], escala: number, janela: Retangulo | null = null): { perfil: PerfilProjetista; leitura: Leitura } | null {
  let melhor: { perfil: PerfilProjetista; leitura: Leitura } | null = null
  for (const perfil of perfis) {
    const leitura = lerPecas(d, perfil, escala, janela)
    if (leitura.pecas.length && (!melhor || leitura.pecas.length > melhor.leitura.pecas.length)) melhor = { perfil, leitura }
  }
  return melhor
}

// ----------------------------------------------------------------------------------------- ensinar

export interface Toque {
  tipo: 'P' | 'V'
  /** ponto da folha */
  x: number
  y: number
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const RE_ESTRUTURA_NOME = /^([A-Z]{1,3})\s?(-?)\s?(\d+)([A-Za-z]*)$/
const SECAO_SEPARADA = '^\\(?\\s*(?:[ab]:\\s?)?(\\d+\\s*[xX×/]\\s*\\d+)\\s*\\)?$'

function textoMaisPerto(textos: readonly TextoDaPagina[], x: number, y: number, folga: number, filtro: (t: TextoDaPagina) => boolean): TextoDaPagina | null {
  let melhor: TextoDaPagina | null = null
  let md = Infinity
  for (const t of textos) {
    if (!filtro(t)) continue
    const dd = distRet(t.ret, [x, y, x, y])
    if (dd <= folga && dd < md) [melhor, md] = [t, dd]
  }
  return melhor
}

/**
 * Aprende o perfil de uma projetista com toques no nome de um pilar e de uma viga (e um terceiro
 * opcional, num nome escrito de outro jeito). De cada toque tira: o jeito de escrever o nome, onde
 * fica a seção, e a camada dos contornos (pilar) ou das faces (viga).
 */
export function aprenderPerfil(d: DesenhoDaPagina, toques: readonly Toque[], escala: number, base?: PerfilProjetista, folga = 15): { perfil: PerfilProjetista | null; avisos: string[] } {
  const avisos: string[] = []
  const prefixos: Record<'P' | 'V', Set<string>> = { P: new Set(), V: new Set() }
  const regras: Record<'P' | 'V', Partial<RegraPeca>> = { P: {}, V: {} }
  const origens = new Set<'texto' | 'comentario'>()
  for (const tq of toques) {
    const t = textoMaisPerto(d.textos, tq.x, tq.y, folga, (t) => pareceNome(t.texto))
    const qual = tq.tipo === 'P' ? 'pilar' : 'viga'
    if (!t) {
      avisos.push(`No toque da ${qual} não achei nome de peça. Toque em cima do nome.`)
      continue
    }
    origens.add(t.origem ?? 'texto')
    const junto = RE_SECAO_JUNTO.exec(t.texto.trim())
    const soNome = junto && RE_ESTRUTURA_NOME.test(junto[1].trim()) ? junto[1].trim() : t.texto.trim()
    const m = RE_ESTRUTURA_NOME.exec(soNome)
    if (!m) {
      avisos.push(`"${t.texto}" não parece nome de ${qual}.`)
      continue
    }
    prefixos[tq.tipo].add(m[1])
    const r = regras[tq.tipo]
    if (junto && soNome !== t.texto.trim()) {
      r.secao = 'no_nome'
      r.secaoPadrao = SECAO_SEPARADA
    } else if (!r.secao || r.secao === 'nenhuma') {
      const reS = new RegExp(SECAO_SEPARADA)
      const s = textoMaisPerto(d.textos, centro(t.ret)[0], centro(t.ret)[1], 40, (x) => x !== t && reS.test(x.texto))
      if (!s) r.secao = 'nenhuma'
      else r.secao = Math.abs(centro(s.ret)[0] - centro(t.ret)[0]) < 22 && s.ret[1] >= t.ret[1] ? 'abaixo' : 'perto'
      r.secaoPadrao = SECAO_SEPARADA
    }
    // camada: a do contorno (pilar) ou das faces (viga) mais perto do nome
    if (r.camada === undefined && d.camadas.length) {
      if (tq.tipo === 'P') {
        let melhor: Traco | null = null
        let md = Infinity
        for (const tr of d.tracos) {
          if (!tr.fechado || tr.pts.length < 6) continue
          const dd = distRet(caixa(tr.pts), t.ret)
          const c = caixa(tr.pts)
          if (Math.max(largura(c), altura(c)) > 200) continue
          if (dd < md) [melhor, md] = [tr, dd]
        }
        if (melhor && md < 80) r.camada = melhor.camada
      } else {
        const lv = largurasDeViga(escala)
        const h = largura(t.ret) >= altura(t.ret)
        let melhor: [number, string | null] | null = null
        for (const cam of new Set(d.tracos.map((x) => x.camada))) {
          const segs = segmentosDaCamada(d.tracos, cam)
          const fx = faixaReta(t.ret, h, h ? segs.hs : segs.vs, [], { min: lv.min, max: lv.larga, normal: lv.normal })
          if (!fx) continue
          const tr = h ? (t.ret[1] + t.ret[3]) / 2 : (t.ret[0] + t.ret[2]) / 2
          const dd = h ? Math.min(Math.abs(fx[1] - tr), Math.abs(fx[3] - tr)) : Math.min(Math.abs(fx[0] - tr), Math.abs(fx[2] - tr))
          if (!melhor || dd < melhor[0]) melhor = [dd, cam]
        }
        if (melhor) r.camada = melhor[1]
      }
    }
  }
  const regra = (tipo: 'P' | 'V', antiga: RegraPeca | undefined): RegraPeca | null => {
    const ps = [...prefixos[tipo]]
    if (!ps.length) return antiga ?? null
    const r = regras[tipo]
    return {
      padrao: `^(?:${ps.map(escapar).join('|')})[- ]?\\d+[A-Za-z]*$`,
      camada: r.camada ?? null,
      secao: r.secao ?? 'nenhuma',
      secaoPadrao: r.secaoPadrao ?? SECAO_SEPARADA,
    }
  }
  const pilar = regra('P', base?.pilar)
  const viga = regra('V', base?.viga)
  if (!pilar) avisos.push('Falta tocar no nome de um pilar.')
  if (!viga) avisos.push('Falta tocar no nome de uma viga.')
  if (!pilar || !viga) return { perfil: null, avisos }
  const textos = origens.size === 2 ? 'ambos' : origens.has('comentario') ? 'comentario' : 'texto'
  const nome = `Projetista: ${[...prefixos.P, ...prefixos.V].join(', ')}${pilar.camada ? ` (camadas ${pilar.camada} e ${viga.camada ?? 'qualquer'})` : ''}`
  return { perfil: { id: base?.id ?? `p${Date.now().toString(36)}`, nome, textos, pilar, viga, vigaPorVao: true }, avisos }
}

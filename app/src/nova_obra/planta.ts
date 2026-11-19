// Nova obra, etapa 2: a planta de um pavimento a partir do PDF e as peças marcadas à mão. Monta o pacote
// da planta (manifest.json + pacote.bin) no formato de pipeline/fvs/pacote.py, com um campo novo,
// `escala` (1:N), que o app de hoje ignora: pacote antigo e novo abrem iguais.
import type { ElementoPacote } from '../fvs/pacote'
import type { Retangulo, TextoDaPagina } from './pdf'

export type TipoPeca = 'P' | 'V' | 'L'

export interface PecaRascunho {
  tipo: TipoPeca
  nome: string
  secao: string
  /** onde o nome está escrito (ou o contorno, se não houver texto), em pontos da planta */
  rotulo: Retangulo
  /** contornos desenhados, em pontos da planta */
  polys: Array<Array<[number, number]>>
  /** veio da leitura automática (ler de novo troca); marcada ou corrigida à mão fica */
  lida?: boolean
}

/** O que a leitura automática deixou para conferir (textos em pontos da planta). */
export interface LeituraRascunho {
  /** nome do perfil da projetista usado */
  perfil: string
  /** textos com cara de nome de peça que o leitor não usou */
  naoLidos: Array<{ texto: string; ret: Retangulo }>
  /** "V40" com "h=12" encostado: tratado como painel de laje, não viga */
  paineis: Array<{ texto: string; ret: Retangulo }>
  /** pilar com o mesmo nome em dois lugares */
  repetidos: string[]
}

export interface PlantaRascunho {
  /** planta_id (fixo desde a criação) */
  id: string
  pavimento: string
  trecho: string
  prancha: string
  revisao: string
  arquivo: string
  /** tamanho da página do PDF, em pontos */
  pagina: { largura: number; altura: number }
  /** janela da página que vira planta, em pontos da página (y para baixo) */
  janela: Retangulo
  /** 1:N; null = ainda não escolhida */
  escala: number | null
  /** o PDF não tem texto nenhum (escaneado): só o modo de desenhar */
  semTexto: boolean
  pecas: PecaRascunho[]
  /** a planta desenhada (tiles) bate com esta janela? */
  gerada: { janela: Retangulo; tiles: number; bytes: number; segundos: number } | null
  /** última leitura automática (etapa 3); sem ela, a planta foi marcada só à mão */
  leitura?: LeituraRascunho | null
}

const mesmaJanela = (a: Retangulo, b: Retangulo) => a.every((v, i) => Math.abs(v - b[i]) < 0.01)
export const plantaEmDia = (p: PlantaRascunho) => !!p.gerada && mesmaJanela(p.gerada.janela, p.janela)

/** "EX2-FORMA-TERREO-R00.pdf" -> prancha "EX2-FORMA-TERREO-R00", revisão "R00". */
export function pranchaDoArquivo(nome: string): { prancha: string; revisao: string } {
  const prancha = nome.replace(/\.pdf$/i, '').split(' - ')[0].trim() || 'Prancha'
  const m = /-R(\d+)$/i.exec(prancha)
  return { prancha: prancha.slice(0, 160), revisao: m ? `R${m[1].padStart(2, '0')}` : 'R00' }
}

/** Trocar a janela não tira as peças do lugar: elas andam o mesmo tanto que a origem andou. */
export function moverJanela(p: PlantaRascunho, janela: Retangulo): PlantaRascunho {
  const dx = p.janela[0] - janela[0]
  const dy = p.janela[1] - janela[1]
  const m = ([x, y]: [number, number]): [number, number] => [x + dx, y + dy]
  const r = (q: Retangulo): Retangulo => [q[0] + dx, q[1] + dy, q[2] + dx, q[3] + dy]
  const textos = (l: Array<{ texto: string; ret: Retangulo }>) => l.map((t) => ({ ...t, ret: r(t.ret) }))
  return {
    ...p,
    janela,
    pecas: p.pecas.map((pc) => ({ ...pc, rotulo: r(pc.rotulo), polys: pc.polys.map((pl) => pl.map(m)) })),
    leitura: p.leitura ? { ...p.leitura, naoLidos: textos(p.leitura.naoLidos), paineis: textos(p.leitura.paineis) } : p.leitura,
  }
}

/**
 * Junta a leitura automática (em pontos da folha) com a planta: as peças lidas antes saem, as marcadas
 * ou corrigidas à mão ficam, e uma peça lida com o mesmo nome de uma feita à mão não entra de novo.
 */
export function aplicarLeitura(
  p: PlantaRascunho,
  l: { pecas: ReadonlyArray<{ tipo: 'P' | 'V'; nome: string; secao: string; rotulo: Retangulo; polys: Array<Array<[number, number]>> }>; naoLidos: readonly TextoDaPagina[]; paineis: readonly TextoDaPagina[]; repetidos: readonly string[] },
  perfil: string,
): PlantaRascunho {
  const [jx, jy] = p.janela
  const r = (q: Retangulo): Retangulo => [arred(q[0] - jx, 2), arred(q[1] - jy, 2), arred(q[2] - jx, 2), arred(q[3] - jy, 2)]
  const aMao = p.pecas.filter((pc) => !pc.lida)
  const ja = new Set(aMao.map((pc) => `${pc.tipo}:${pc.nome.toUpperCase()}`))
  const lidas: PecaRascunho[] = l.pecas
    .filter((pc) => !ja.has(`${pc.tipo}:${pc.nome.toUpperCase()}`))
    .map((pc) => ({ tipo: pc.tipo, nome: pc.nome, secao: pc.secao, rotulo: r(pc.rotulo), polys: pc.polys.map((pl) => pl.map(([x, y]) => [arred(x - jx, 2), arred(y - jy, 2)] as [number, number])), lida: true }))
  const textos = (ts: readonly TextoDaPagina[]) => ts.map((t) => ({ texto: t.texto, ret: r(t.ret) }))
  return { ...p, pecas: [...aMao, ...lidas], leitura: { perfil, naoLidos: textos(l.naoLidos), paineis: textos(l.paineis), repetidos: [...l.repetidos] } }
}

/**
 * Contorno de uma peça marcada à mão pelo nome, tirado da leitura automática da mesma planta (achado do
 * Testador: peça marcada pelo nome ficava sem contorno). Em pontos da planta; null se a leitura não a achou.
 */
export function contornoDaLeitura(
  janela: Retangulo,
  l: { pecas: ReadonlyArray<{ tipo: 'P' | 'V'; nome: string; polys: Array<Array<[number, number]>> }> },
  tipo: TipoPeca,
  nome: string,
): Array<Array<[number, number]>> | null {
  const achada = l.pecas.find((pc) => pc.tipo === tipo && pc.nome.toUpperCase() === nome.toUpperCase() && pc.polys.length)
  if (!achada) return null
  return achada.polys.map((pl) => pl.map(([x, y]) => [arred(x - janela[0], 2), arred(y - janela[1], 2)] as [number, number]))
}

export interface ItemConferencia {
  /** o que mostrar */
  texto: string
  /** índice da peça na planta (para abrir), ou o texto não lido (para virar peça) */
  peca?: number
  ret: Retangulo
}

export interface Conferencia {
  semContorno: ItemConferencia[]
  semSecao: ItemConferencia[]
  repetidos: ItemConferencia[]
  naoLidos: ItemConferencia[]
  paineis: ItemConferencia[]
}

/** As listas para conferir a planta depois da leitura (e também à mão). */
export function conferencia(p: PlantaRascunho): Conferencia {
  const semContorno: ItemConferencia[] = []
  const semSecao: ItemConferencia[] = []
  const repetidos: ItemConferencia[] = []
  const vistos = new Map<string, number>()
  p.pecas.forEach((pc, i) => {
    const item = { texto: pc.nome || '(sem nome)', peca: i, ret: pc.rotulo }
    if (pc.tipo !== 'L' && !pc.polys.length) semContorno.push(item)
    if (pc.tipo !== 'L' && !pc.secao.trim()) semSecao.push(item)
    const k = `${pc.tipo}:${pc.nome.toUpperCase()}`
    if (vistos.has(k)) repetidos.push(item)
    else vistos.set(k, i)
  })
  for (const nome of p.leitura?.repetidos ?? []) {
    const i = p.pecas.findIndex((pc) => pc.tipo === 'P' && pc.nome === nome)
    if (i >= 0 && !repetidos.some((x) => x.peca === i)) repetidos.push({ texto: `${nome} (em dois lugares da planta)`, peca: i, ret: p.pecas[i].rotulo })
  }
  // não lido que já virou peça (tocado depois) sai da lista
  const nomes = new Set(p.pecas.map((pc) => pc.nome.toUpperCase()))
  const naoLidos = (p.leitura?.naoLidos ?? []).filter((t) => !nomes.has(nomeESecao(t.texto).nome.toUpperCase())).map((t) => ({ texto: t.texto, ret: t.ret }))
  const paineis = (p.leitura?.paineis ?? []).filter((t) => !nomes.has(nomeESecao(t.texto).nome.toUpperCase())).map((t) => ({ texto: t.texto, ret: t.ret }))
  return { semContorno, semSecao, repetidos, naoLidos, paineis }
}

const RE_NOME = /^[A-Za-z]{1,3}\s?-?\s?\d+[A-Za-z]?['’]?$/
const RE_SECAO = /^\(?(\d{1,3}(?:[.,]\d)?)\s*[xX×/]\s*(\d{1,3}(?:[.,]\d)?)\)?$/

/** Tipo pelo começo do nome: P pilar, V viga, L laje; null se não der para dizer. */
export function tipoDoNome(nome: string): TipoPeca | null {
  const c = nome.trim().toUpperCase()[0]
  return c === 'P' || c === 'V' || c === 'L' ? c : null
}

/** Separa "P-01  20x50" em nome e seção. Texto que não parece nome de peça vira o nome inteiro. */
export function nomeESecao(texto: string): { nome: string; secao: string } {
  const partes = texto.trim().split(/\s+/)
  let nome = ''
  let secao = ''
  // nome pode vir em dois pedaços ("V 132")
  for (let i = 0; i < partes.length; i++) {
    const um = partes[i]
    const dois = i + 1 < partes.length ? `${partes[i]} ${partes[i + 1]}` : ''
    if (!nome && dois && RE_NOME.test(dois) && !RE_NOME.test(um)) {
      nome = dois
      i++
    } else if (!nome && RE_NOME.test(um)) nome = um
    else if (!secao && RE_SECAO.test(um)) {
      const m = RE_SECAO.exec(um)!
      secao = `${m[1]}x${m[2]}`
    }
  }
  if (!nome) nome = texto.trim()
  // o banco quer nome sem espaço ("V46", não "V 46")
  return { nome: nome.replace(/\s+/g, '').slice(0, 40), secao }
}

/** O texto da página mais perto do toque (em pontos da página), até `raio` pontos dele. */
export function textoPerto(textos: readonly TextoDaPagina[], x: number, y: number, raio: number): TextoDaPagina | null {
  let melhor: TextoDaPagina | null = null
  let dist = raio
  for (const t of textos) {
    const dx = Math.max(t.ret[0] - x, 0, x - t.ret[2])
    const dy = Math.max(t.ret[1] - y, 0, y - t.ret[3])
    const d = Math.hypot(dx, dy)
    if (d < dist || (d === 0 && melhor && area(t.ret) < area(melhor.ret))) {
      melhor = t
      dist = d
    }
  }
  return melhor
}
const area = (r: Retangulo) => (r[2] - r[0]) * (r[3] - r[1])

/** Peça tocada no nome: o retângulo do texto (em pontos da página) vai para a planta. */
export function pecaDoTexto(t: TextoDaPagina, janela: Retangulo, tipoEscolhido: TipoPeca): PecaRascunho {
  const { nome, secao } = nomeESecao(t.texto)
  return {
    tipo: tipoDoNome(nome) ?? tipoEscolhido,
    nome,
    secao,
    rotulo: [t.ret[0] - janela[0], t.ret[1] - janela[1], t.ret[2] - janela[0], t.ret[3] - janela[1]],
    polys: [],
  }
}

/** Retângulo desenhado com dois toques (em pontos da planta). */
export function retanguloDeDoisToques(a: [number, number], b: [number, number]): { rotulo: Retangulo; poly: Array<[number, number]> } {
  const x0 = Math.min(a[0], b[0])
  const x1 = Math.max(a[0], b[0])
  const y0 = Math.min(a[1], b[1])
  const y1 = Math.max(a[1], b[1])
  return {
    rotulo: [x0, y0, x1, y1],
    poly: [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
  }
}

/** Problemas da planta que impedem salvar o pacote. */
export function problemasDaPlanta(p: PlantaRascunho, pavimentos: readonly string[]): string[] {
  const n = `${p.pavimento}, ${p.trecho}`
  const l: string[] = []
  if (!pavimentos.includes(p.pavimento)) l.push(`Planta ${p.prancha}: o pavimento "${p.pavimento}" não está mais na lista.`)
  if (!p.trecho.trim()) l.push(`Planta ${p.prancha}: falta o nome do trecho.`)
  if (!p.escala) l.push(`Planta ${n}: escolha a escala.`)
  if (!plantaEmDia(p)) l.push(`Planta ${n}: falta desenhar a planta (botão "Desenhar a planta").`)
  if (!p.pecas.length) l.push(`Planta ${n}: nenhuma peça marcada.`)
  const vistos = new Set<string>()
  for (const pc of p.pecas) {
    const k = `${pc.tipo}:${pc.nome.toUpperCase()}`
    if (!pc.nome.trim()) l.push(`Planta ${n}: há uma peça sem nome.`)
    else if (vistos.has(k)) l.push(`Planta ${n}: ${pc.nome} marcado duas vezes.`)
    vistos.add(k)
  }
  return l
}

const arred = (v: number, casas: number) => Math.round(v * 10 ** casas) / 10 ** casas

/** manifest.json + pacote.bin da planta, como pipeline/fvs/pacote.py (tiles na ordem z, y, x). */
export function montarPacotePlanta(
  cab: { planta_id: string; obra: string; pavimento: string; trecho: string; prancha: string; revisao: string; largura: number; altura: number; niveis: number[]; escala: number | null },
  tiles: ReadonlyMap<string, Blob>,
  elementos: ReadonlyMap<string, PecaRascunho>,
): { manifest: string; bin: Blob } {
  const ordem = (k: string) => k.split('/').map(Number)
  const nomes = [...tiles.keys()].sort((a, b) => {
    const [za, xa, ya] = ordem(a)
    const [zb, xb, yb] = ordem(b)
    return za - zb || ya - yb || xa - xb
  })
  const pedacos: Record<string, [number, number]> = {}
  const partes: Blob[] = []
  let pos = 0
  for (const k of nomes) {
    const b = tiles.get(k)!
    pedacos[`t:${k}`] = [pos, b.size]
    partes.push(b)
    pos += b.size
  }
  const elem: Record<string, ElementoPacote> = {}
  for (const id of [...elementos.keys()].sort()) {
    const e = elementos.get(id)!
    elem[id] = {
      tipo: e.tipo,
      nome: e.nome,
      secao: e.secao,
      rotulo: e.rotulo.map((v) => arred(v, 1)) as Retangulo,
      polys: e.polys.map((p) => p.map(([x, y]) => [arred(x, 2), arred(y, 2)] as [number, number])),
    }
  }
  const manifest = {
    formato: 1,
    planta_id: cab.planta_id,
    obra: cab.obra,
    pavimento: cab.pavimento,
    trecho: cab.trecho,
    prancha: cab.prancha,
    revisao: cab.revisao,
    largura: cab.largura,
    altura: cab.altura,
    tile: 512,
    niveis: cab.niveis,
    ...(cab.escala ? { escala: cab.escala } : {}),
    elementos: elem,
    detalhes: {},
    pedacos,
  }
  return { manifest: JSON.stringify(manifest), bin: new Blob(partes, { type: 'application/octet-stream' }) }
}

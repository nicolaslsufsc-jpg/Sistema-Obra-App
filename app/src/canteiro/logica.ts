// Lógica do mapa do canteiro, sem tela e sem banco: posicionar, mover, girar, mudar o tamanho,
// renomear, apagar, duplicar, ordem, traçados (caminho e área) e desfazer. Tudo devolve uma lista nova
// (a anterior fica intacta: é o que o "desfazer" guarda).
//
// Medidas: a folha tem sempre 1000 de largura (LARGURA); a altura segue a proporção do fundo.
// Assim o mapa não depende do tamanho da planta em pixels, e trocar o fundo mantém cada figura
// no mesmo lugar relativo. x, y = centro da figura; tamanho = largura dela; giro em graus, horário.

import { FIGURAS, figuraPorId } from './figuras'

export const LARGURA = 1000
export const ALTURA_EM_BRANCO = 700
export const TAMANHO_MIN = 15
export const TAMANHO_MAX = 800
export const NOME_MAX = 40
/** Quantos passos o "desfazer" guarda. */
export const PASSOS_MAX = 60

export type Ponto = [number, number]

export interface ItemCanteiro {
  id: string
  /** id da figura (figuras.ts), 'caminho' ou 'area' */
  tipo: string
  x: number
  y: number
  /** graus, sentido horário, 0 a 359 */
  giro: number
  /** largura na folha */
  tamanho: number
  nome: string
  /** só nos traçados (caminho e área): os pontos, na medida da folha */
  pontos?: Ponto[]
  /** só nos traçados: id de uma das CORES */
  cor?: string
}

/** Traçados: desenhados ponto a ponto pela pessoa, sem figura da paleta. */
export const TRACADOS = {
  caminho: { nome: 'Caminho', minimo: 2 },
  area: { nome: 'Área', minimo: 3 },
} as const
export type TipoTracado = keyof typeof TRACADOS

/** Cores dos traçados (a primeira é a que vem escolhida). */
export const CORES = [
  { id: 'laranja', nome: 'Laranja', hex: '#e8772e' },
  { id: 'azul', nome: 'Azul', hex: '#2f6fb5' },
  { id: 'verde', nome: 'Verde', hex: '#2e8b4a' },
  { id: 'vermelho', nome: 'Vermelho', hex: '#c62828' },
  { id: 'roxo', nome: 'Roxo', hex: '#7b3fa0' },
  { id: 'preto', nome: 'Preto', hex: '#1f2937' },
] as const

export function hexDaCor(id: string | undefined): string {
  return (CORES.find((c) => c.id === id) ?? CORES[0]).hex
}

export function ehTracado(i: Pick<ItemCanteiro, 'tipo'>): boolean {
  return i.tipo in TRACADOS
}

/** Item que fica por baixo das figuras e só é pego quando nenhuma figura foi: setor e área. */
function ehFundo(i: Pick<ItemCanteiro, 'tipo'>): boolean {
  return i.tipo === 'setor' || i.tipo === 'area'
}

export interface Folha {
  largura: number
  altura: number
}

/** Folha de um fundo com `largura` x `altura` em qualquer unidade (pixels da planta, por exemplo). */
export function folhaDe(largura: number, altura: number): Folha {
  if (!(largura > 0) || !(altura > 0)) return { largura: LARGURA, altura: ALTURA_EM_BRANCO }
  return { largura: LARGURA, altura: Math.round((LARGURA * altura) / largura) }
}

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Altura do item na folha (pela proporção da figura). */
export function alturaDoItem(i: Pick<ItemCanteiro, 'tipo' | 'tamanho'>): number {
  const f = figuraPorId(i.tipo)
  return f ? (i.tamanho * f.vb[1]) / f.vb[0] : i.tamanho
}

function trocar(itens: readonly ItemCanteiro[], id: string, mudar: (i: ItemCanteiro) => ItemCanteiro): ItemCanteiro[] {
  return itens.map((i) => (i.id === id ? mudar(i) : i))
}

/** Põe uma figura na folha. Figura desconhecida não entra. O centro nunca fica fora da folha. */
export function posicionar(itens: readonly ItemCanteiro[], tipo: string, x: number, y: number, folha: Folha, id: string): ItemCanteiro[] {
  const f = figuraPorId(tipo)
  if (!f) return [...itens]
  return [...itens, { id, tipo, x: limitar(x, 0, folha.largura), y: limitar(y, 0, folha.altura), giro: 0, tamanho: f.tamanho, nome: f.nome }]
}

/** Leva o centro do item para x, y. No traçado, os pontos andam junto. */
export function mover(itens: readonly ItemCanteiro[], id: string, x: number, y: number, folha: Folha): ItemCanteiro[] {
  return trocar(itens, id, (i) => {
    const nx = limitar(x, 0, folha.largura)
    const ny = limitar(y, 0, folha.altura)
    if (!i.pontos) return { ...i, x: nx, y: ny }
    return { ...i, x: nx, y: ny, pontos: i.pontos.map(([px, py]): Ponto => [px + nx - i.x, py + ny - i.y]) }
  })
}

/** Giro entre 0 e 359, inteiro. */
export function normalizarGiro(graus: number): number {
  const g = Math.round(graus) % 360
  return g < 0 ? g + 360 : g
}

/** Soma `graus` ao giro do item (negativo gira para a esquerda). Traçado não gira. */
export function girar(itens: readonly ItemCanteiro[], id: string, graus: number): ItemCanteiro[] {
  return trocar(itens, id, (i) => (ehTracado(i) ? i : { ...i, giro: normalizarGiro(i.giro + graus) }))
}

export function girarPara(itens: readonly ItemCanteiro[], id: string, graus: number): ItemCanteiro[] {
  return trocar(itens, id, (i) => (ehTracado(i) ? i : { ...i, giro: normalizarGiro(graus) }))
}

export function redimensionar(itens: readonly ItemCanteiro[], id: string, tamanho: number): ItemCanteiro[] {
  if (!Number.isFinite(tamanho)) return [...itens]
  return trocar(itens, id, (i) => (ehTracado(i) ? i : { ...i, tamanho: limitar(Math.round(tamanho), TAMANHO_MIN, TAMANHO_MAX) }))
}

/** Multiplica o tamanho (1.2 = 20% maior). */
export function escalar(itens: readonly ItemCanteiro[], id: string, fator: number): ItemCanteiro[] {
  const i = itens.find((x) => x.id === id)
  return i ? redimensionar(itens, id, i.tamanho * fator) : [...itens]
}

export function renomear(itens: readonly ItemCanteiro[], id: string, nome: string): ItemCanteiro[] {
  const limpo = nome.replace(/\s+/g, ' ').trim().slice(0, NOME_MAX)
  return trocar(itens, id, (i) => ({ ...i, nome: limpo }))
}

export function apagar(itens: readonly ItemCanteiro[], id: string): ItemCanteiro[] {
  return itens.filter((i) => i.id !== id)
}

// ---------------------------------------------------------------------
// Traçados (caminho com seta e área colorida)
// ---------------------------------------------------------------------

/** Centro da caixa que envolve os pontos. */
export function centroDosPontos(pontos: readonly Ponto[]): Ponto {
  const xs = pontos.map((p) => p[0])
  const ys = pontos.map((p) => p[1])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}

/** Cria um caminho ou uma área com os pontos tocados. Com menos pontos que o mínimo, não cria. */
export function tracar(itens: readonly ItemCanteiro[], tipo: TipoTracado, pontos: readonly Ponto[], folha: Folha, id: string, cor: string = CORES[0].id): ItemCanteiro[] {
  if (pontos.length < TRACADOS[tipo].minimo) return [...itens]
  const dentro = pontos.map(([x, y]): Ponto => [Math.round(limitar(x, 0, folha.largura)), Math.round(limitar(y, 0, folha.altura))])
  const [x, y] = centroDosPontos(dentro)
  return [...itens, { id, tipo, x, y, giro: 0, tamanho: 0, nome: TRACADOS[tipo].nome, pontos: dentro, cor: CORES.some((c) => c.id === cor) ? cor : CORES[0].id }]
}

/** Leva um ponto do traçado para outro lugar (alça do ponto). */
export function moverPonto(itens: readonly ItemCanteiro[], id: string, indice: number, x: number, y: number, folha: Folha): ItemCanteiro[] {
  return trocar(itens, id, (i) => {
    if (!i.pontos || indice < 0 || indice >= i.pontos.length) return i
    const pontos = i.pontos.map((p, n): Ponto => (n === indice ? [Math.round(limitar(x, 0, folha.largura)), Math.round(limitar(y, 0, folha.altura))] : p))
    const [cx, cy] = centroDosPontos(pontos)
    return { ...i, pontos, x: cx, y: cy }
  })
}

export function colorir(itens: readonly ItemCanteiro[], id: string, cor: string): ItemCanteiro[] {
  if (!CORES.some((c) => c.id === cor)) return [...itens]
  return trocar(itens, id, (i) => (ehTracado(i) ? { ...i, cor } : i))
}

// ---------------------------------------------------------------------
// Duplicar e ordem
// ---------------------------------------------------------------------

/** Cópia do item, um pouco para baixo e para a direita, por cima dos outros. */
export function duplicar(itens: readonly ItemCanteiro[], id: string, novoId: string, folha: Folha, passo = 30): ItemCanteiro[] {
  const i = itens.find((x) => x.id === id)
  if (!i) return [...itens]
  const copia: ItemCanteiro = i.pontos ? { ...i, id: novoId, pontos: i.pontos.map(([x, y]): Ponto => [x, y]) } : { ...i, id: novoId }
  // perto da borda de baixo ou da direita, a cópia vai para o outro lado (nunca some da folha)
  const dx = i.x + passo > folha.largura ? -passo : passo
  const dy = i.y + passo > folha.altura ? -passo : passo
  return mover([...itens, copia], novoId, i.x + dx, i.y + dy, folha)
}

/** Traz para a frente: passa a ser desenhado por último (dentro do grupo dele, ver `ordemDeDesenho`). */
export function paraFrente(itens: readonly ItemCanteiro[], id: string): ItemCanteiro[] {
  const i = itens.find((x) => x.id === id)
  return i ? [...itens.filter((x) => x.id !== id), i] : [...itens]
}

/** Manda para trás: passa a ser desenhado primeiro (dentro do grupo dele). */
export function paraTras(itens: readonly ItemCanteiro[], id: string): ItemCanteiro[] {
  const i = itens.find((x) => x.id === id)
  return i ? [i, ...itens.filter((x) => x.id !== id)] : [...itens]
}

// ---------------------------------------------------------------------
// Desfazer
// ---------------------------------------------------------------------

export interface Historico {
  passado: readonly (readonly ItemCanteiro[])[]
  atual: readonly ItemCanteiro[]
}

export function novoHistorico(itens: readonly ItemCanteiro[] = []): Historico {
  return { passado: [], atual: itens }
}

const iguais = (a: readonly ItemCanteiro[], b: readonly ItemCanteiro[]) => a === b || JSON.stringify(a) === JSON.stringify(b)

/** Registra um passo. Passo que não muda nada não entra (senão o "desfazer" pareceria não funcionar). */
export function aplicar(h: Historico, itens: readonly ItemCanteiro[]): Historico {
  if (iguais(h.atual, itens)) return h
  return { passado: [...h.passado, h.atual].slice(-PASSOS_MAX), atual: itens }
}

export function podeDesfazer(h: Historico): boolean {
  return h.passado.length > 0
}

/** Volta o último passo. Sem passo para voltar, devolve o mesmo histórico. */
export function desfazer(h: Historico): Historico {
  if (h.passado.length === 0) return h
  return { passado: h.passado.slice(0, -1), atual: h.passado[h.passado.length - 1] }
}

// ---------------------------------------------------------------------
// Geometria do toque
// ---------------------------------------------------------------------

/**
 * Ordem de desenho, em três grupos: por baixo os setores e as áreas, depois os caminhos, por cima as
 * figuras. Dentro de cada grupo vale a ordem da lista ("trazer para a frente" leva ao fim da lista).
 */
export function ordemDeDesenho(itens: readonly ItemCanteiro[]): ItemCanteiro[] {
  return [...itens.filter(ehFundo), ...itens.filter((i) => i.tipo === 'caminho'), ...itens.filter((i) => !ehFundo(i) && i.tipo !== 'caminho')]
}

/** Ponto da folha → ponto na caixa do item (origem no centro, sem o giro). */
export function noItem(i: ItemCanteiro, x: number, y: number): [number, number] {
  const a = (-i.giro * Math.PI) / 180
  const dx = x - i.x
  const dy = y - i.y
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)]
}

/** Ponto da caixa do item (origem no centro) → ponto da folha. */
export function doItem(i: ItemCanteiro, lx: number, ly: number): [number, number] {
  const a = (i.giro * Math.PI) / 180
  return [i.x + lx * Math.cos(a) - ly * Math.sin(a), i.y + lx * Math.sin(a) + ly * Math.cos(a)]
}

/** Distância do ponto ao segmento a-b. */
function distanciaAoSegmento(x: number, y: number, a: Ponto, b: Ponto): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const t = dx === 0 && dy === 0 ? 0 : limitar(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1)
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy))
}

/** Distância do ponto à linha do caminho. */
export function distanciaAoCaminho(pontos: readonly Ponto[], x: number, y: number): number {
  let menor = Infinity
  for (let n = 0; n + 1 < pontos.length; n++) menor = Math.min(menor, distanciaAoSegmento(x, y, pontos[n], pontos[n + 1]))
  return menor
}

/** O ponto está dentro do polígono? */
export function dentroDaArea(pontos: readonly Ponto[], x: number, y: number): boolean {
  let dentro = false
  for (let n = 0, m = pontos.length - 1; n < pontos.length; m = n++) {
    const [xi, yi] = pontos[n]
    const [xj, yj] = pontos[m]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}

/** Meia espessura da linha do caminho, na medida da folha. */
export const MEIA_LINHA = 3

/**
 * O item que está no ponto tocado. `folga` aumenta a caixa (dedo com luva: a figura pequena continua
 * fácil de pegar). Quem decide, nesta ordem:
 * 1. o toque caiu dentro da caixa de mais de uma figura: ganha a menor (o extintor em cima do setor,
 *    ou encostado numa figura maior, continua pegável); empate, a de cima;
 * 2. o toque está na linha de um caminho (com a folga);
 * 3. o toque só pegou a figura pela folga: ganha a de centro mais perto do dedo;
 * 4. por último, o setor ou a área que estiver embaixo.
 */
export function itemNoPonto(itens: readonly ItemCanteiro[], x: number, y: number, folga = 0): ItemCanteiro | undefined {
  const ordem = ordemDeDesenho(itens)
  let dentro: { i: ItemCanteiro; area: number } | undefined
  let perto: { i: ItemCanteiro; d: number } | undefined
  let caminho: { i: ItemCanteiro; d: number } | undefined
  let fundo: ItemCanteiro | undefined
  for (let n = ordem.length - 1; n >= 0; n--) {
    const i = ordem[n]
    if (i.tipo === 'caminho') {
      const d = distanciaAoCaminho(i.pontos ?? [], x, y)
      if (d <= MEIA_LINHA + folga && (!caminho || d < caminho.d)) caminho = { i, d }
      continue
    }
    if (i.tipo === 'area') {
      if (dentroDaArea(i.pontos ?? [], x, y)) fundo ??= i
      continue
    }
    const [lx, ly] = noItem(i, x, y)
    const mw = i.tamanho / 2
    const mh = alturaDoItem(i) / 2
    const naCaixa = Math.abs(lx) <= mw && Math.abs(ly) <= mh
    if (!naCaixa && (Math.abs(lx) > mw + folga || Math.abs(ly) > mh + folga)) continue
    if (i.tipo === 'setor') {
      fundo ??= i
    } else if (naCaixa) {
      const area = mw * mh
      if (!dentro || area < dentro.area) dentro = { i, area }
    } else {
      const d = Math.hypot(lx, ly)
      if (!perto || d < perto.d) perto = { i, d }
    }
  }
  return dentro?.i ?? caminho?.i ?? perto?.i ?? fundo
}

/** Giro que aponta o topo do item para o ponto (alça de girar). Perto de um múltiplo de 15° ele encaixa. */
export function giroParaOPonto(i: ItemCanteiro, x: number, y: number): number {
  const g = normalizarGiro((Math.atan2(y - i.y, x - i.x) * 180) / Math.PI + 90)
  const perto = Math.round(g / 15) * 15
  return normalizarGiro(Math.abs(g - perto) <= 4 ? perto : g)
}

/** Tamanho que leva o canto do item até o ponto (alça de tamanho). */
export function tamanhoParaOPonto(i: ItemCanteiro, x: number, y: number): number {
  const prop = alturaDoItem(i) / i.tamanho
  const d = Math.hypot(x - i.x, y - i.y)
  return limitar(Math.round((2 * d) / Math.hypot(1, prop)), TAMANHO_MIN, TAMANHO_MAX)
}

/** Meia altura da caixa que envolve o item já girado (onde começa o nome, embaixo). */
export function meiaAlturaGirada(i: ItemCanteiro): number {
  const a = (i.giro * Math.PI) / 180
  return Math.abs((i.tamanho / 2) * Math.sin(a)) + Math.abs((alturaDoItem(i) / 2) * Math.cos(a))
}

/** Tamanho da letra do nome do item. */
export function letraDoItem(i: ItemCanteiro): number {
  if (ehTracado(i)) return 15
  return limitar(i.tamanho * 0.13, 9, 26)
}

// ---------------------------------------------------------------------
// Vista (zoom e arrasto da folha na tela)
// ---------------------------------------------------------------------

/** x, y: ponto da folha no canto de cima à esquerda da tela; k: pixels da tela por unidade da folha. */
export interface Vista {
  x: number
  y: number
  k: number
}

/** A folha inteira na tela, centralizada, com uma margem. */
export function ajustarVista(folha: Folha, larguraPx: number, alturaPx: number, margemPx = 8): Vista {
  const k = Math.max(0.01, Math.min((larguraPx - 2 * margemPx) / folha.largura, (alturaPx - 2 * margemPx) / folha.altura))
  return { k, x: (folha.largura - larguraPx / k) / 2, y: (folha.altura - alturaPx / k) / 2 }
}

export function telaParaFolha(v: Vista, px: number, py: number): [number, number] {
  return [v.x + px / v.k, v.y + py / v.k]
}

/** Zoom em volta de um ponto da tela (o ponto da folha debaixo do dedo não sai do lugar). */
export function zoomNoPonto(v: Vista, fator: number, px: number, py: number, kMin: number, kMax: number): Vista {
  const k = limitar(v.k * fator, kMin, kMax)
  const [fx, fy] = telaParaFolha(v, px, py)
  return { k, x: fx - px / k, y: fy - py / k }
}

/** Arrasta a folha `dx`, `dy` pixels da tela. */
export function arrastarVista(v: Vista, dx: number, dy: number): Vista {
  return { k: v.k, x: v.x - dx / v.k, y: v.y - dy / v.k }
}

// ---------------------------------------------------------------------
// Leitura segura do que estava guardado
// ---------------------------------------------------------------------

/** Tira o que não é item válido (figura que saiu do app, número estragado). Nunca lança erro. */
export function limparItens(bruto: unknown): ItemCanteiro[] {
  if (!Array.isArray(bruto)) return []
  const numero = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
  const vistos = new Set<string>()
  const saida: ItemCanteiro[] = []
  for (const b of bruto as Array<Partial<ItemCanteiro> | null>) {
    if (!b || typeof b.id !== 'string' || typeof b.tipo !== 'string' || vistos.has(b.id)) continue
    const nome = typeof b.nome === 'string' ? b.nome.slice(0, NOME_MAX) : ''
    if (b.tipo in TRACADOS) {
      const tipo = b.tipo as TipoTracado
      const pontos = Array.isArray(b.pontos) ? b.pontos.filter((p): p is Ponto => Array.isArray(p) && p.length === 2 && numero(p[0]) && numero(p[1])).map(([x, y]): Ponto => [x, y]) : []
      if (pontos.length < TRACADOS[tipo].minimo) continue
      const [x, y] = centroDosPontos(pontos)
      vistos.add(b.id)
      saida.push({ id: b.id, tipo, x, y, giro: 0, tamanho: 0, nome, pontos, cor: CORES.some((c) => c.id === b.cor) ? (b.cor as string) : CORES[0].id })
      continue
    }
    if (!figuraPorId(b.tipo) || ![b.x, b.y, b.giro, b.tamanho].every(numero)) continue
    vistos.add(b.id)
    saida.push({
      id: b.id,
      tipo: b.tipo,
      x: b.x as number,
      y: b.y as number,
      giro: normalizarGiro(b.giro as number),
      tamanho: limitar(b.tamanho as number, TAMANHO_MIN, TAMANHO_MAX),
      nome,
    })
  }
  return saida
}

// ---------------------------------------------------------------------
// Legenda
// ---------------------------------------------------------------------

export interface LinhaDaLegenda {
  /** id da figura, 'caminho' ou 'area' */
  tipo: string
  /** só nos traçados */
  cor?: string
  nome: string
  quantidade: number
}

/**
 * Legenda do que está no mapa: uma linha por figura usada (com quantas há) e uma por caminho ou área
 * de cada cor e nome. Na ordem da paleta; os traçados no fim.
 */
export function legendaDe(itens: readonly ItemCanteiro[]): LinhaDaLegenda[] {
  const linhas = new Map<string, LinhaDaLegenda>()
  for (const i of itens) {
    const f = figuraPorId(i.tipo)
    if (!f && !ehTracado(i)) continue
    const nome = f ? f.nome : i.nome || TRACADOS[i.tipo as TipoTracado].nome
    const chave = f ? i.tipo : `${i.tipo}|${i.cor}|${nome}`
    const l = linhas.get(chave)
    if (l) l.quantidade++
    else linhas.set(chave, f ? { tipo: i.tipo, nome, quantidade: 1 } : { tipo: i.tipo, cor: i.cor, nome, quantidade: 1 })
  }
  const posicao = (l: LinhaDaLegenda) => {
    const n = FIGURAS.findIndex((f) => f.id === l.tipo)
    return n >= 0 ? n : l.tipo === 'caminho' ? 1000 : 2000
  }
  return [...linhas.values()].sort((a, b) => posicao(a) - posicao(b))
}

// Barras de aço da laje (plano A do Nicolas, 18/11/2026). Parte pura, sem banco e sem tela (barras.test.ts).
//
// O pacote da planta de forma traz as barras das pranchas de armação, já alinhadas na folha
// (pipeline/fvs/barras_laje.py), em quatro camadas. Na aba Barras a pessoa toca na barra: OK, ou errada
// (só com observação e Confirmar). A ficha de laje continua na área desenhada na aba Lajes: todas as barras
// de todas as camadas que tocam a área OK deixam o item de armadura ("barras": true) C sozinho; alguma
// errada, NC. Barra que cruza duas áreas conta nas duas.

import { dentro as ponto_dentro } from './areas'
import type { EventoFvs, Ficha, ItemFicha, Resultado, Situacao } from './situacao'
import { maisNovo } from './situacao'

export type CamadaDeBarras = 'transversal_superior' | 'transversal_inferior' | 'longitudinal_superior' | 'longitudinal_inferior'

/** A ordem das camadas no app (a mesma das pranchas). */
export const CAMADAS: readonly CamadaDeBarras[] = ['transversal_superior', 'transversal_inferior', 'longitudinal_superior', 'longitudinal_inferior']

export const NOME_DA_CAMADA: Record<CamadaDeBarras, string> = {
  transversal_superior: 'Transversal superior',
  transversal_inferior: 'Transversal inferior',
  longitudinal_superior: 'Longitudinal superior',
  longitudinal_inferior: 'Longitudinal inferior',
}

/** Curto, para a observação do item e os botões no celular. */
export const SIGLA_DA_CAMADA: Record<CamadaDeBarras, string> = {
  transversal_superior: 'transv. sup.',
  transversal_inferior: 'transv. inf.',
  longitudinal_superior: 'long. sup.',
  longitudinal_inferior: 'long. inf.',
}

export interface BarraPacote {
  camada: CamadaDeBarras
  /** polilinha da barra, pontos do PDF da folha, y para baixo */
  linha: Array<[number, number]>
  /** posição da etiqueta ("N25"); sem etiqueta ligada, não vem */
  posicao?: string
  /** "N25 1ø10 C=850" */
  texto?: string
  prancha?: string
}

type Pt = readonly [number, number]

/** "Armadura transversal superior" -> transversal_superior (o nome do setor vem de pipeline/fvs/armadura_laje.py). */
export function camadaDoTrecho(trecho: string): CamadaDeBarras | undefined {
  const t = trecho.toLowerCase()
  return CAMADAS.find((c) => t.includes(NOME_DA_CAMADA[c].toLowerCase()))
}

/** As camadas que o pacote tem, na ordem do app. */
export function camadasDoPacote(barras: Record<string, BarraPacote> | undefined): CamadaDeBarras[] {
  const tem = new Set(Object.values(barras ?? {}).map((b) => b.camada))
  return CAMADAS.filter((c) => tem.has(c))
}

function cruza(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const lado = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = lado(c, d, a)
  const d2 = lado(c, d, b)
  const d3 = lado(a, b, c)
  const d4 = lado(a, b, d)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** A barra toca a área: algum ponto dela está dentro, ou ela cruza o contorno (decisão de 18/11: conta). */
export function barraNaArea(linha: readonly Pt[], contorno: readonly Pt[]): boolean {
  if (contorno.length < 3 || linha.length < 2) return false
  if (linha.some((p) => ponto_dentro(p, contorno as Array<[number, number]>))) return true
  for (let i = 0; i + 1 < linha.length; i++) {
    for (let j = 0; j < contorno.length; j++) {
      if (cruza(linha[i], linha[i + 1], contorno[j], contorno[(j + 1) % contorno.length])) return true
    }
  }
  return false
}

/** Ids das barras que tocam a área (de todas as camadas, ou só de uma). */
export function barrasDaArea(barras: Record<string, BarraPacote>, contorno: readonly Pt[], camada?: CamadaDeBarras): string[] {
  return Object.entries(barras)
    .filter(([, b]) => (!camada || b.camada === camada) && barraNaArea(b.linha, contorno))
    .map(([id]) => id)
}

function distAoSegmento(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1])
}

export function distanciaABarra(p: Pt, linha: readonly Pt[]): number {
  let melhor = Infinity
  for (let i = 0; i + 1 < linha.length; i++) melhor = Math.min(melhor, distAoSegmento(p, linha[i], linha[i + 1]))
  return melhor
}

/** Barras juntas (achado #5 da lista de campo, 24/11): até 7 cm uma da outra... */
export const JUNTAS_CM = 7
/** ...em pelo menos 60% do comprimento da mais curta. */
export const JUNTAS_PARTE = 0.6

/** Quantos pontos da folha (1/72 pol.) dão `cm` de obra numa prancha 1:`escala` (sem escala no pacote, 1:50). */
export function pontosDeCm(cm: number, escala = 50): number {
  return (cm * 10) / ((25.4 / 72) * escala)
}

function comprimento(linha: readonly Pt[]): number {
  let t = 0
  for (let i = 0; i + 1 < linha.length; i++) t += Math.hypot(linha[i + 1][0] - linha[i][0], linha[i + 1][1] - linha[i][1])
  return t
}

/** Pontos ao longo da polilinha, de `passo` em `passo` (as duas pontas entram). */
function amostras(linha: readonly Pt[], n: number): Pt[] {
  const total = comprimento(linha)
  if (total === 0 || linha.length < 2) return linha.slice(0, 1)
  const out: Pt[] = []
  for (let k = 0; k < n; k++) {
    let alvo = (total * k) / (n - 1)
    for (let i = 0; i + 1 < linha.length; i++) {
      const seg = Math.hypot(linha[i + 1][0] - linha[i][0], linha[i + 1][1] - linha[i][1])
      if (alvo <= seg || i + 2 === linha.length) {
        const t = seg === 0 ? 0 : Math.min(1, alvo / seg)
        out.push([linha[i][0] + t * (linha[i + 1][0] - linha[i][0]), linha[i][1] + t * (linha[i + 1][1] - linha[i][1])])
        break
      }
      alvo -= seg
    }
  }
  return out
}

/** As duas barras correm juntas: a mais curta fica a até `tol` da outra em pelo menos `parte` do comprimento. */
export function corremJuntas(a: readonly Pt[], b: readonly Pt[], tol: number, parte = JUNTAS_PARTE): boolean {
  const [curta, longa] = comprimento(a) <= comprimento(b) ? [a, b] : [b, a]
  const pts = amostras(curta, 21)
  let perto = 0
  for (const p of pts) if (distanciaABarra(p, longa) <= tol) perto++
  return perto >= parte * pts.length
}

/**
 * Grupos de barras juntas, por camada (24/11, pedido do Nicolas: "se tem duas barras muito próximas, elas são
 * juntas. Então a pessoa dá um clique e já confira as duas"). Devolve, para cada barra que tem par, a lista do
 * grupo dela (ordenada); barra sozinha não entra. O grupo é transitivo (A junto de B e B junto de C: A, B e C).
 */
export function gruposDeBarras(barras: Record<string, BarraPacote>, tol: number, parte = JUNTAS_PARTE): Map<string, string[]> {
  const ids = Object.keys(barras).sort()
  const pai = new Map(ids.map((id) => [id, id]))
  const raiz = (id: string): string => {
    let r = id
    while (pai.get(r) !== r) r = pai.get(r)!
    pai.set(id, r)
    return r
  }
  // caixas com a folga, varridas em x: só compara as que se cruzam
  const caixas = ids.map((id) => {
    const l = barras[id].linha
    const xs = l.map((q) => q[0])
    const ys = l.map((q) => q[1])
    return { id, x0: Math.min(...xs) - tol, x1: Math.max(...xs) + tol, y0: Math.min(...ys) - tol, y1: Math.max(...ys) + tol }
  })
  caixas.sort((p, q) => p.x0 - q.x0)
  for (let i = 0; i < caixas.length; i++) {
    const a = caixas[i]
    for (let j = i + 1; j < caixas.length && caixas[j].x0 <= a.x1; j++) {
      const b = caixas[j]
      if (b.y0 > a.y1 || a.y0 > b.y1) continue
      const ba = barras[a.id]
      const bb = barras[b.id]
      if (ba.camada !== bb.camada) continue
      if (raiz(a.id) === raiz(b.id)) continue
      if (corremJuntas(ba.linha, bb.linha, tol, parte)) pai.set(raiz(a.id), raiz(b.id))
    }
  }
  const porRaiz = new Map<string, string[]>()
  for (const id of ids) {
    const r = raiz(id)
    const g = porRaiz.get(r)
    if (g) g.push(id)
    else porRaiz.set(r, [id])
  }
  const out = new Map<string, string[]>()
  for (const g of porRaiz.values()) if (g.length > 1) for (const id of g) out.set(id, g)
  return out
}

/**
 * A barra que o dedo tocou: a mais perto, até `raio` (margem generosa, nas unidades da folha), com o grupo dela
 * (as barras juntas, ver `gruposDeBarras`; sozinha, só ela). Se outra barra, de fora do grupo, está quase à mesma
 * distância (menos que `folga`), não escolhe: a planta precisa de mais zoom. Barra do mesmo grupo não pede zoom:
 * o toque pega o grupo inteiro.
 */
export function barraTocada(
  p: Pt,
  barras: Record<string, BarraPacote>,
  camada: CamadaDeBarras,
  raio: number,
  folga: number,
  grupos?: ReadonlyMap<string, readonly string[]>,
): { id: string; grupo: string[] } | { ambiguo: true } | null {
  const perto: Array<[number, string]> = []
  for (const [id, barra] of Object.entries(barras)) {
    if (barra.camada !== camada) continue
    const d = distanciaABarra(p, barra.linha)
    if (d <= raio) perto.push([d, id])
  }
  if (!perto.length) return null
  perto.sort((x, y) => x[0] - y[0])
  const [d0, id] = perto[0]
  const grupo = [...(grupos?.get(id) ?? [id])]
  const outra = perto.find(([, o]) => !grupo.includes(o))
  if (outra && outra[0] - d0 < folga) return { ambiguo: true }
  return { id, grupo }
}

/** O item de armadura da ficha de laje (marcado com `"barras": true` na ficha), se houver. */
export function itemDasBarras(ficha: Ficha | undefined): ItemFicha | undefined {
  return ficha?.itens.find((i) => i.barras)
}

/**
 * Situação da barra: o registro mais novo dela (C OK, NC errada, vazio sem conferir). Não depende da laje:
 * a barra que cruza duas áreas é a mesma barra nas duas.
 */
export function situacaoDaBarra(eventos: readonly EventoFvs[]): Situacao {
  let ult: EventoFvs | undefined
  for (const e of eventos) if (!ult || maisNovo(e, ult)) ult = e
  return ult?.resultado === 'NC' ? 'reprovado' : ult?.resultado ? 'liberado' : 'nada'
}

/** A observação da barra errada (o que a pessoa escreveu ao confirmar o NC). */
export function observacaoDaBarra(eventos: readonly EventoFvs[]): string | null {
  let ult: EventoFvs | undefined
  for (const e of eventos) if (!ult || maisNovo(e, ult)) ult = e
  return ult?.resultado === 'NC' ? (ult.observacao ?? null) : null
}

/** O resultado que as barras da área dão ao item de armadura: alguma errada NC; todas OK C; senão pendente. */
export function resultadoPelasBarras(sits: readonly Situacao[]): Resultado | null {
  if (!sits.length) return null
  if (sits.includes('reprovado')) return 'NC'
  return sits.every((s) => s === 'liberado') ? 'C' : null
}

/** Nome da barra para a pessoa: "N25 (long. inf.)", ou "barra sem posição (long. inf.)". */
export function nomeDaBarra(b: BarraPacote): string {
  return `${b.posicao ?? 'barra sem posição'} (${SIGLA_DA_CAMADA[b.camada]})`
}

/** "Barra errada: N12 (long. sup.): faltou uma barra; N3 (long. inf.)" para a observação do item da laje. */
export function observacaoDasErradas(erradas: ReadonlyArray<{ barra: BarraPacote; obs: string | null }>): string | null {
  if (!erradas.length) return null
  const partes = erradas.map(({ barra, obs }) => `${nomeDaBarra(barra)}${obs ? `: ${obs}` : ''}`)
  return `Barra${erradas.length > 1 ? 's erradas' : ' errada'}: ${partes.join('; ')}`
}

/** "Barras: 12 de 40 OK, 1 errada" */
export function resumoDasBarras(sits: readonly Situacao[]): { total: number; ok: number; erradas: number; texto: string } {
  const ok = sits.filter((s) => s === 'liberado').length
  const erradas = sits.filter((s) => s === 'reprovado').length
  const texto = `Barras: ${ok} de ${sits.length} OK${erradas ? `, ${erradas} errada${erradas > 1 ? 's' : ''}` : ''}`
  return { total: sits.length, ok, erradas, texto }
}

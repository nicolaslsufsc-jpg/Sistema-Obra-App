// Avanço da obra (versão PC, 24/11/2026): as contas da tela do chefe. Pedido do Nicolas: "quantos pilares
// do residencial D estão prontos? ... qual laje está pronta para concretar? ... quantos por cento do meu aço".
// Aqui só as regras, sem banco e sem tela (avanco.test.ts). Quem liga isto aos dados é o avanco_dados.ts.
//
// O agrupamento (residencial, bloco, torre) é DADO da obra: a lista `residenciais` das regras da FVS
// (fvs_regras), a mesma dos avisos de escoramento. O pilar entra pelo nome; a viga e a laje, pelos pilares
// que as apoiam; peça na divisa conta nos dois. Obra sem a lista: só "Obra inteira", por pavimento.
import { dentro, type Ponto } from '../fvs/areas'
import { residenciaisDoPilar, type ApoiosDaPeca, type PlantaDoAparelho } from '../fvs/escoramento_residencial'
import { centroDaPeca } from '../fvs/ligacoes'
import type { Residencial } from '../fvs/regras'

/** Onde a peça está na conferência (o mesmo que as cores da planta da FVS). */
export type Estado = 'pronto' | 'concretar' | 'andamento' | 'nc' | 'pendente'

export const ESTADOS: readonly Estado[] = ['pronto', 'concretar', 'andamento', 'pendente', 'nc']

export const NOME_DO_ESTADO: Record<Estado, string> = {
  pronto: 'Pronto (concretado)',
  concretar: 'Liberado para concretar',
  andamento: 'Em andamento',
  pendente: 'Pendente',
  nc: 'Com não conformidade',
}

export type TipoDePeca = 'P' | 'V' | 'L'

export interface PecaDoAvanco {
  id: string
  tipo: TipoDePeca
  nome: string
  pavimentoId: string
  estado: Estado
  /** itens de armadura da ficha: todos conferidos, falta algum, algum com NC; null = a ficha não tem item de armadura */
  armadura: 'ok' | 'falta' | 'nc' | null
  /** numa concretagem cadastrada no Concreto, 90% da peça ou da área (a regra do verde da planta) */
  concretada: boolean
  /** tem caminhão no Concreto, mas abaixo dos 90% (não fica verde; a tela conta à parte) */
  parcial?: boolean
  /** residenciais da peça (vazio: a obra não tem a lista, ou a peça ficou fora dela) */
  residenciais: string[]
}

export interface Pavimento {
  id: string
  nome: string
}

type Contagem = Record<Estado, number> & { total: number }

const zero = (): Contagem => ({ pronto: 0, concretar: 0, andamento: 0, pendente: 0, nc: 0, total: 0 })

/** Quantos por cento, inteiro; sem total, null (a tela mostra "–"). */
export function porcento(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 100) : null
}

/**
 * Os residenciais de cada peça. Pilar: pelo nome, no pavimento dele. Viga e laje: pelos pilares que as
 * apoiam; a viga que só apoia em viga, pelas vigas que ela toca (algumas voltas, para a corrente de vigas).
 * A mesma regra dos avisos de escoramento (fvs/escoramento_residencial.ts).
 */
export function residenciaisDasPecas(
  pecas: ReadonlyArray<Pick<PecaDoAvanco, 'id' | 'tipo' | 'nome' | 'pavimentoId'>>,
  residenciais: readonly Residencial[],
  nomeDoPavimento: (id: string) => string,
  apoios: ReadonlyMap<string, ApoiosDaPeca>,
): Map<string, string[]> {
  const de = new Map<string, string[]>()
  if (!residenciais.length) return de
  for (const p of pecas) if (p.tipo === 'P') de.set(p.id, residenciaisDoPilar(residenciais, nomeDoPavimento(p.pavimentoId), p.nome))
  const juntar = (ids: readonly string[]) => [...new Set(ids.flatMap((id) => de.get(id) ?? []))]
  for (const p of pecas) {
    if (p.tipo === 'P') continue
    const ap = apoios.get(p.id)
    if (ap) de.set(p.id, juntar(ap.pilares))
  }
  for (let volta = 0; volta < 4; volta++) {
    let mudou = false
    for (const p of pecas) {
      if (p.tipo === 'P' || de.get(p.id)?.length) continue
      const r = juntar(apoios.get(p.id)?.vigas ?? [])
      if (r.length) {
        de.set(p.id, r)
        mudou = true
      }
    }
    if (!mudou) break
  }
  return de
}

/** Os nomes dos residenciais da obra, na ordem em que aparecem nas regras, sem repetir. */
export function nomesDosResidenciais(residenciais: readonly Residencial[]): string[] {
  return [...new Set(residenciais.map((r) => r.nome))]
}

/** As peças do agrupamento: null = obra inteira. */
export function doAgrupamento<T extends Pick<PecaDoAvanco, 'residenciais'>>(pecas: readonly T[], residencial: string | null): T[] {
  return residencial === null ? [...pecas] : pecas.filter((p) => p.residenciais.includes(residencial))
}

export interface LinhaDoPavimento {
  pavimentoId: string
  pavimento: string
  pilares: Contagem
  vigas: Contagem
  lajes: Contagem
  /** as três juntas: a barra do gráfico */
  todas: Contagem
  /** peças com item de armadura na ficha, e quantas com todos conferidos */
  armadura: { total: number; ok: number; nc: number }
  /** pilares e vigas com caminhão lançado × os do pavimento; idem as lajes */
  concreto: { pecas: number; pecasPrevistas: number; lajes: number; lajesPrevistas: number }
}

/** Uma linha por pavimento que tem peça, na ordem da obra, e a linha do total. */
export function avancoPorPavimento(pecas: readonly PecaDoAvanco[], pavimentos: readonly Pavimento[]): { linhas: LinhaDoPavimento[]; total: LinhaDoPavimento } {
  const nova = (pavimentoId: string, pavimento: string): LinhaDoPavimento => ({
    pavimentoId,
    pavimento,
    pilares: zero(),
    vigas: zero(),
    lajes: zero(),
    todas: zero(),
    armadura: { total: 0, ok: 0, nc: 0 },
    concreto: { pecas: 0, pecasPrevistas: 0, lajes: 0, lajesPrevistas: 0 },
  })
  const porId = new Map(pavimentos.map((p) => [p.id, nova(p.id, p.nome)]))
  const total = nova('', 'Total')
  for (const p of pecas) {
    const l = porId.get(p.pavimentoId)
    if (!l) continue
    for (const alvo of [l, total]) {
      const c = p.tipo === 'P' ? alvo.pilares : p.tipo === 'V' ? alvo.vigas : alvo.lajes
      c[p.estado]++
      c.total++
      alvo.todas[p.estado]++
      alvo.todas.total++
      if (p.armadura) {
        alvo.armadura.total++
        if (p.armadura === 'ok') alvo.armadura.ok++
        if (p.armadura === 'nc') alvo.armadura.nc++
      }
      if (p.tipo === 'L') {
        alvo.concreto.lajesPrevistas++
        if (p.concretada) alvo.concreto.lajes++
      } else {
        alvo.concreto.pecasPrevistas++
        if (p.concretada) alvo.concreto.pecas++
      }
    }
  }
  return { linhas: pavimentos.map((p) => porId.get(p.id)!).filter((l) => l.todas.total > 0), total }
}

export interface LajeParaConcretar {
  id: string
  nome: string
  pavimentoId: string
  pavimento: string
  /** a ficha da laje e todos os pilares e vigas dela conferidos */
  liberada: boolean
  concretada: boolean
  /** a ficha da laje já está toda conferida (inclusive a concretagem): não é mais "para concretar" */
  concluida: boolean
  /** o que falta, em frases curtas (vazio quando liberada) */
  falta: string[]
  /** a planta do pavimento não está no aparelho: não deu para saber os pilares e as vigas da laje */
  semElementos: boolean
}

const conferida = (e: Estado) => e === 'pronto' || e === 'concretar'
const ordemNatural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

function nomes(lista: readonly string[], ate = 8): string {
  const ordenada = [...lista].sort(ordemNatural.compare)
  return ordenada.length > ate ? `${ordenada.slice(0, ate).join(', ')} e mais ${ordenada.length - ate}` : ordenada.join(', ')
}

/**
 * As lajes do agrupamento: liberada para concretar = a ficha da laje com os itens de antes da concretagem
 * conferidos (ou toda pronta) e todos os pilares e vigas que a apoiam também. Para as outras, o que falta.
 * `todas` = as peças da obra inteira (o pilar de uma laje na divisa pode estar no outro residencial).
 */
export function lajesParaConcretar(
  lajes: readonly PecaDoAvanco[],
  todas: readonly PecaDoAvanco[],
  pavimentos: readonly Pavimento[],
  apoios: ReadonlyMap<string, ApoiosDaPeca>,
): LajeParaConcretar[] {
  const porId = new Map(todas.map((p) => [p.id, p]))
  const ordem = new Map(pavimentos.map((p, i) => [p.id, i]))
  const nome = new Map(pavimentos.map((p) => [p.id, p.nome]))
  return lajes
    .filter((l) => l.tipo === 'L')
    .map((l) => {
      const ap = apoios.get(l.id)
      const dela = (ap ? [...ap.pilares, ...ap.vigas] : []).map((id) => porId.get(id)).filter((p): p is PecaDoAvanco => !!p)
      const falta: string[] = []
      if (l.estado === 'nc') falta.push('ficha da laje com não conformidade')
      else if (l.estado === 'andamento') falta.push('ficha da laje em andamento')
      else if (l.estado === 'pendente') falta.push('ficha da laje sem marcação')
      // sem saber quem apoia a laje (nem planta no aparelho, nem índice de apoios da obra): melhor não dizer que está liberada
      if (!ap) falta.push('sem a planta neste aparelho e sem o índice de apoios da obra: não dá para conferir os pilares e as vigas da laje')
      for (const [tipo, rotulo] of [['P', 'pilares'], ['V', 'vigas']] as const) {
        const doTipo = dela.filter((p) => p.tipo === tipo)
        const comNc = doTipo.filter((p) => p.estado === 'nc').map((p) => p.nome)
        const semConferir = doTipo.filter((p) => !conferida(p.estado) && p.estado !== 'nc').map((p) => p.nome)
        if (comNc.length) falta.push(`${rotulo} com não conformidade: ${nomes(comNc)}`)
        if (semConferir.length) falta.push(`${rotulo} sem conferir: ${nomes(semConferir)}`)
      }
      return {
        id: l.id,
        nome: l.nome,
        pavimentoId: l.pavimentoId,
        pavimento: nome.get(l.pavimentoId) ?? '',
        liberada: falta.length === 0,
        concretada: l.concretada,
        concluida: l.estado === 'pronto',
        falta,
        semElementos: !ap,
      }
    })
    .sort((a, b) => (ordem.get(a.pavimentoId) ?? 0) - (ordem.get(b.pavimentoId) ?? 0) || ordemNatural.compare(a.nome, b.nome))
}

/** Um caminhão do Concreto, só com o que o avanço usa. */
export interface CaminhaoDoAvanco {
  id: string
  concretagemId: string
  pavimentoId: string
  /** AAAA-MM-DD */
  data: string
  volume: number | null
  /** peças e áreas de laje que o caminhão concretou (ids) */
  pecas: string[]
}

export interface ResumoDoConcreto {
  concretagens: number
  caminhoes: number
  volume: number
  /** caminhões sem volume digitado (o volume acima não os conta) */
  semVolume: number
  ultima: string | null
  /**
   * caminhões que também concretaram peça de outro residencial: o volume deles entra inteiro aqui
   * (o Concreto não divide o volume do caminhão por peça)
   */
  divididos: number
  /** caminhões sem peça marcada: só entram na obra inteira */
  semPeca: number
}

/**
 * O concreto do agrupamento. Obra inteira: todos os caminhões. Residencial: os caminhões que concretaram
 * alguma peça dele (caminhão sem peça marcada não tem como entrar num residencial).
 */
export function resumoDoConcreto(caminhoes: readonly CaminhaoDoAvanco[], residencial: string | null, residenciaisDe: (pecaId: string) => readonly string[]): ResumoDoConcreto {
  let divididos = 0
  let semPeca = 0
  const dele = caminhoes.filter((c) => {
    if (!c.pecas.length) semPeca++
    if (residencial === null) return true
    const res = new Set(c.pecas.flatMap((id) => residenciaisDe(id)))
    if (!res.has(residencial)) return false
    if (res.size > 1) divididos++
    return true
  })
  return {
    concretagens: new Set(dele.map((c) => c.concretagemId)).size,
    caminhoes: dele.length,
    volume: dele.reduce((s, c) => s + (c.volume ?? 0), 0),
    semVolume: dele.filter((c) => c.volume === null).length,
    ultima: dele.map((c) => c.data).sort().at(-1) ?? null,
    divididos,
    semPeca: residencial === null ? semPeca : 0,
  }
}

/** Volume, concretagens e caminhões por pavimento (o pavimento é o da concretagem). */
export function concretoPorPavimento(caminhoes: readonly CaminhaoDoAvanco[], residencial: string | null, residenciaisDe: (pecaId: string) => readonly string[]): Map<string, { concretagens: number; caminhoes: number; volume: number }> {
  const m = new Map<string, { ids: Set<string>; caminhoes: number; volume: number }>()
  for (const c of caminhoes) {
    if (residencial !== null && !c.pecas.some((id) => residenciaisDe(id).includes(residencial))) continue
    let l = m.get(c.pavimentoId)
    if (!l) m.set(c.pavimentoId, (l = { ids: new Set(), caminhoes: 0, volume: 0 }))
    l.ids.add(c.concretagemId)
    l.caminhoes++
    l.volume += c.volume ?? 0
  }
  return new Map([...m].map(([k, v]) => [k, { concretagens: v.ids.size, caminhoes: v.caminhoes, volume: v.volume }]))
}

/**
 * Item de armadura de uma ficha: o marcado com `barras` (laje, pelas barras da planta) ou o que fala de
 * armadura, armação ou aço na etapa ou no título. Vem do texto da ficha da obra, não de uma lista fixa.
 */
export function ehItemDeArmadura(item: { etapa: string; titulo: string; barras?: boolean }): boolean {
  if (item.barras) return true
  const t = `${item.etapa} ${item.titulo}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return /armadur|armac|\baco\b|ferragem|estribo/.test(t)
}

/** A situação dos itens de armadura da peça: os resultados deles, um por item (null = sem marcação). */
export function situacaoDaArmadura(resultados: ReadonlyArray<string | null | undefined>): PecaDoAvanco['armadura'] {
  if (!resultados.length) return null
  if (resultados.some((r) => r === 'NC')) return 'nc'
  return resultados.every((r) => r === 'C' || r === 'NA') ? 'ok' : 'falta'
}

// ---------------------------------------------------------------------------------------------------------
// Índice de apoios (24/11/2026): o PC do chefe não pode depender de baixar as plantas (dezenas de MB) só para
// saber quem apoia cada viga e cada laje. O índice é essa resposta já calculada, pelo NOME das peças, por
// pavimento: poucos KB. Fica nas regras da FVS da obra (`fvs_regras`, chave "apoios"; no pacote sem conta, no
// config_fvs.json), que o aparelho já sincroniza. É dado da obra: sai de um aparelho que tem as plantas
// (botão "Baixar índice de apoios" do Avanço) e quem publica as regras põe lá.
//   "apoios": { "pavimentos": { "2º Pavimento": { "V:V1": [["P1","P2"], []], "L:L1": [["P1","P2"], ["V1"]] } } }
// Cada peça: [pilares que a apoiam, vigas que a apoiam].

export type IndiceDeApoios = Record<string, Record<string, [string[], string[]]>>

const normal = (s: string) => s.trim().toLocaleUpperCase('pt-BR')
const chaveDaPeca = (tipo: string, nome: string) => `${tipo}:${normal(nome)}`
type PecaDoIndice = Pick<PecaDoAvanco, 'id' | 'tipo' | 'nome' | 'pavimentoId'>

/** Monta o índice a partir dos apoios por id (lidos das plantas): só vigas e lajes que têm algum apoio. */
export function indiceDeApoios(pecas: readonly PecaDoIndice[], apoios: ReadonlyMap<string, ApoiosDaPeca>, nomeDoPavimento: (id: string) => string): IndiceDeApoios {
  const porId = new Map(pecas.map((p) => [p.id, p]))
  const nomesDe = (ids: readonly string[]) => [...new Set(ids.flatMap((id) => (porId.has(id) ? [porId.get(id)!.nome.trim()] : [])))].sort(ordemNatural.compare)
  const saida: IndiceDeApoios = {}
  for (const p of [...pecas].sort((a, b) => ordemNatural.compare(a.nome, b.nome))) {
    if (p.tipo === 'P') continue
    const ap = apoios.get(p.id)
    const pavimento = nomeDoPavimento(p.pavimentoId)
    if (!ap || !pavimento) continue
    const linha: [string[], string[]] = [nomesDe(ap.pilares), nomesDe(ap.vigas)]
    if (!linha[0].length && !linha[1].length) continue
    ;(saida[pavimento] ??= {})[`${p.tipo}:${p.nome.trim()}`] = linha
  }
  return saida
}

/** Lê o índice das regras da obra (a chave "apoios"). Entrada torta fica de fora; sem nada válido, null. */
export function lerIndiceDeApoios(v: unknown): IndiceDeApoios | null {
  const pavimentos = (v as { pavimentos?: unknown } | null)?.pavimentos
  if (!pavimentos || typeof pavimentos !== 'object' || Array.isArray(pavimentos)) return null
  const lista = (x: unknown): string[] | null => (Array.isArray(x) && x.length <= 500 && x.every((n) => typeof n === 'string' && n.trim() !== '') ? x.map((n: string) => n.trim()) : null)
  const saida: IndiceDeApoios = {}
  for (const [pavimento, pecas] of Object.entries(pavimentos as Record<string, unknown>)) {
    if (!pecas || typeof pecas !== 'object' || Array.isArray(pecas)) continue
    for (const [chave, par] of Object.entries(pecas as Record<string, unknown>)) {
      if (!/^[VL]:./.test(chave) || !Array.isArray(par) || par.length !== 2) continue
      const pilares = lista(par[0])
      const vigas = lista(par[1])
      if (!pilares || !vigas) continue
      ;(saida[pavimento] ??= {})[chave] = [pilares, vigas]
    }
  }
  return Object.keys(saida).length ? saida : null
}

/** Do índice (por nome) para os apoios por id das peças deste aparelho. Nome que não existe mais é ignorado. */
export function apoiosDoIndice(indice: IndiceDeApoios | null, pecas: readonly PecaDoIndice[], nomeDoPavimento: (id: string) => string): Map<string, ApoiosDaPeca> {
  const saida = new Map<string, ApoiosDaPeca>()
  if (!indice) return saida
  const doPavimento = new Map(Object.entries(indice).map(([pv, pecasDele]) => [normal(pv), new Map(Object.entries(pecasDele).map(([k, par]) => [chaveDaPeca(k.slice(0, 1), k.slice(2)), par]))]))
  const idDe = new Map(pecas.map((p) => [`${p.pavimentoId}|${chaveDaPeca(p.tipo, p.nome)}`, p.id]))
  for (const p of pecas) {
    if (p.tipo === 'P') continue
    const par = doPavimento.get(normal(nomeDoPavimento(p.pavimentoId)))?.get(chaveDaPeca(p.tipo, p.nome))
    if (!par) continue
    const ids = (tipo: string, nomes: readonly string[]) => nomes.flatMap((n) => idDe.get(`${p.pavimentoId}|${chaveDaPeca(tipo, n)}`) ?? [])
    saida.set(p.id, { pilares: ids('P', par[0]), vigas: ids('V', par[1]) })
  }
  return saida
}

/** A planta no aparelho (medida agora) passa na frente; o índice cobre as peças sem planta aqui. */
export function juntarApoios(dasPlantas: ReadonlyMap<string, ApoiosDaPeca>, doIndice: ReadonlyMap<string, ApoiosDaPeca>): Map<string, ApoiosDaPeca> {
  return new Map([...doIndice, ...dasPlantas])
}

// ---- centros (25/11, "5 blz" do Nicolas): para as lajes desenhadas no app sem a planta no aparelho
//
// A área de laje desenhada no app (fvs_areas) não está nos pacotes, então não tem linha no índice. O índice
// leva, por pavimento, a planta escolhida (a forma, a mesma dos apoios) e o centro de cada pilar e viga, pelo
// nome, em px da planta, inteiro. Com o contorno da área (sincronizado, leve), a regra é a da laje do pacote:
// os pilares e as vigas com o centro dentro. Gerado igual pelo pipeline (pipeline/fvs/indice_apoios.py,
// `centros_dos_manifests` e `apoios_das_areas`); o teste cruzado está em apoios_pipeline.test.ts.

/** Um pavimento: a planta dos centros e, por "P:nome" ou "V:nome", os centros [x1, y1, x2, y2...]. */
export interface CentrosDoPavimento {
  planta: string
  pecas: Record<string, number[]>
}
export type CentrosDoIndice = Record<string, CentrosDoPavimento>

/**
 * Os centros das plantas do aparelho, para o botão "Baixar índice de apoios": por pavimento, a planta com mais
 * pilares e vigas (a mesma escolha de apoiosDaObra) e o centro de cada pilar e viga com desenho, fora o só detalhe.
 */
export function centrosDasPlantas(plantas: readonly PlantaDoAparelho[], pavimentoDe: (id: string) => string | undefined, nomeDoPavimento: (id: string) => string): CentrosDoIndice {
  const melhor = new Map<string, { p: PlantaDoAparelho; n: number }>()
  for (const p of plantas) {
    let n = 0
    const votos = new Map<string, number>()
    for (const [id, e] of Object.entries(p.elementos)) {
      if (e.tipo !== 'P' && e.tipo !== 'V') continue
      n++
      const pv = pavimentoDe(id)
      if (pv) votos.set(pv, (votos.get(pv) ?? 0) + 1)
    }
    const pv = [...votos].sort((a, b) => b[1] - a[1])[0]?.[0]
    if (pv && n > (melhor.get(pv)?.n ?? 0)) melhor.set(pv, { p, n })
  }
  const saida: CentrosDoIndice = {}
  for (const [pv, { p }] of melhor) {
    const nome = nomeDoPavimento(pv)
    if (!nome) continue
    const pecas: Record<string, number[]> = {}
    for (const e of Object.values(p.elementos)) {
      if ((e.tipo !== 'P' && e.tipo !== 'V') || e.so_detalhe || !e.polys.some((poly) => poly.length >= 3)) continue
      const [x, y] = centroDaPeca(e)
      ;(pecas[`${e.tipo}:${e.nome.trim()}`] ??= []).push(Math.round(x), Math.round(y))
    }
    const chaves = Object.keys(pecas).sort((a, b) => a[0].localeCompare(b[0]) || ordemNatural.compare(a.slice(2), b.slice(2)))
    if (chaves.length) saida[nome] = { planta: p.planta_id, pecas: Object.fromEntries(chaves.map((k) => [k, pecas[k]])) }
  }
  return saida
}

/** Lê os centros das regras da obra (a chave "centros" de "apoios"). Entrada torta fica de fora; sem nada, null. */
export function lerCentrosDeApoios(v: unknown): CentrosDoIndice | null {
  const centros = (v as { centros?: unknown } | null)?.centros
  if (!centros || typeof centros !== 'object' || Array.isArray(centros)) return null
  const saida: CentrosDoIndice = {}
  for (const [pavimento, c] of Object.entries(centros as Record<string, unknown>)) {
    const { planta, pecas } = (c ?? {}) as { planta?: unknown; pecas?: unknown }
    if (typeof planta !== 'string' || !pecas || typeof pecas !== 'object' || Array.isArray(pecas)) continue
    const boas: Record<string, number[]> = {}
    for (const [chave, xy] of Object.entries(pecas as Record<string, unknown>)) {
      if (/^[PV]:./.test(chave) && Array.isArray(xy) && xy.length >= 2 && xy.length <= 100 && xy.length % 2 === 0 && xy.every((n) => typeof n === 'number' && Number.isFinite(n))) boas[chave] = xy as number[]
    }
    if (Object.keys(boas).length) saida[pavimento] = { planta, pecas: boas }
  }
  return Object.keys(saida).length ? saida : null
}

/** Uma área de laje desenhada, só com o que a conta precisa. */
export interface AreaDoIndice {
  id: string
  pavimento_id: string
  contorno: readonly Ponto[]
}

/**
 * Os apoios das áreas de laje desenhadas, pelos centros do índice: os pilares e as vigas com o centro dentro do
 * contorno, por nome, no pavimento da área. Vale a forma do pavimento, como em apoiosDaObra quando a planta da
 * área não está no aparelho. Pavimento sem centros ou contorno com menos de 3 pontos: a área fica de fora.
 */
export function apoiosDasAreasPeloIndice(
  centros: CentrosDoIndice | null,
  areas: readonly AreaDoIndice[],
  pecas: readonly PecaDoIndice[],
  nomeDoPavimento: (id: string) => string,
): Map<string, ApoiosDaPeca> {
  const saida = new Map<string, ApoiosDaPeca>()
  if (!centros) return saida
  const doPavimento = new Map(Object.entries(centros).map(([pv, c]) => [normal(pv), c]))
  const idDe = new Map(pecas.map((p) => [`${p.pavimentoId}|${chaveDaPeca(p.tipo, p.nome)}`, p.id]))
  for (const a of areas) {
    const c = doPavimento.get(normal(nomeDoPavimento(a.pavimento_id)))
    if (!c || a.contorno.length < 3) continue
    const ap: ApoiosDaPeca = { pilares: [], vigas: [] }
    for (const [chave, xy] of Object.entries(c.pecas)) {
      let dentroDela = false
      for (let i = 0; i + 1 < xy.length && !dentroDela; i += 2) dentroDela = dentro([xy[i], xy[i + 1]], a.contorno)
      if (!dentroDela) continue
      const id = idDe.get(`${a.pavimento_id}|${chaveDaPeca(chave[0], chave.slice(2))}`)
      if (id) (chave[0] === 'P' ? ap.pilares : ap.vigas).push(id)
    }
    saida.set(a.id, ap)
  }
  return saida
}

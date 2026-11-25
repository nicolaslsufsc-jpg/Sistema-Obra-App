// Avisos de escoramento por residencial (item 3.8, pedido do Nicolas em 23/11/2026): "tal residencial de tal
// pavimento pode desescorar". Respostas dele às 6 perguntas ("Aprovo os itens", pelo Professor):
//   1. os pilares de cada residencial são dado da obra (`residenciais` nas regras); viga e laje entram pelos
//      pilares que as apoiam (a viga pelos pilares que ela toca na planta, a laje pelos de dentro dela);
//   2. peça na divisa segura os dois residenciais;
//   3. dois avisos: desforma dos pilares e escoramento de vigas e lajes (cada um com os prazos das regras);
//   4. peça ainda não concretada segura o aviso;
//   5. só dias (os prazos de hoje);
//   6. teste com os pacotes da obra no aparelho.
// Só aviso, como a lista por peça (escoramento.ts): o app não impede nada. Parte pura, sem banco e sem tela
// (escoramento_residencial.test.ts); a geometria vem dos manifests dos pacotes guardados no aparelho.

import type { AreaDeLaje, Ponto } from './areas'
import { dentro } from './areas'
import type { DadosFvs, Peca } from './dados'
import { fichaDoLocalNaObra } from './dados'
import { centroDaPeca } from './ligacoes'
import type { ElementoPacote } from './pacote'
import { estadoDoPrazo, inicioDoPrazo } from './prazos'
import { datasDoConcreto } from './rastreio'
import type { Residencial } from './regras'
import { fichaDaPeca, ultimosPorItem } from './situacao'

/** O que apoia uma viga ou laje: ids dos pilares (e das vigas, para a viga que apoia em viga). */
export interface ApoiosDaPeca {
  pilares: string[]
  vigas: string[]
}

type Caixa = [number, number, number, number]

function caixaDe(polys: readonly (readonly Ponto[])[]): Caixa | null {
  const pts = polys.flat()
  if (!pts.length) return null
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

const cruzaCaixa = (a: Caixa, b: Caixa, folga: number) => a[0] - folga <= b[2] && b[0] - folga <= a[2] && a[1] - folga <= b[3] && b[1] - folga <= a[3]

function distanciaPontoSegmento(p: Ponto, a: Ponto, b: Ponto): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

function segmentosCruzam(a: Ponto, b: Ponto, c: Ponto, d: Ponto): boolean {
  const lado = (p: Ponto, q: Ponto, r: Ponto) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return lado(a, b, c) * lado(a, b, d) < 0 && lado(c, d, a) * lado(c, d, b) < 0
}

const arestas = (poly: readonly Ponto[]) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]] as const)

/** Dois contornos se tocam: um dentro do outro, bordas que se cruzam ou que passam a menos de `folga`. */
export function contornosSeTocam(a: readonly (readonly Ponto[])[], b: readonly (readonly Ponto[])[], folga: number): boolean {
  for (const pa of a)
    for (const pb of b) {
      if (!pa.length || !pb.length) continue
      if (dentro(pa[0], pb as Ponto[]) || dentro(pb[0], pa as Ponto[])) return true
      for (const [p, q] of arestas(pa))
        for (const [r, s] of arestas(pb)) {
          if (segmentosCruzam(p, q, r, s)) return true
          if (Math.min(distanciaPontoSegmento(p, r, s), distanciaPontoSegmento(q, r, s), distanciaPontoSegmento(r, p, q), distanciaPontoSegmento(s, p, q)) <= folga) return true
        }
    }
  return false
}

const mediana = (l: number[]) => {
  if (!l.length) return 0
  const s = [...l].sort((x, y) => x - y)
  return s[Math.floor(s.length / 2)]
}

/**
 * Quem apoia cada viga, laje (do pacote) e área de laje desenhada, numa planta: a viga, pelos pilares e
 * vigas que ela toca; a laje, pelos pilares (e vigas) com o centro dentro dela. A folga é um quarto do
 * lado menor típico dos pilares da planta (o desenho da viga para na face do pilar, às vezes um pouco antes).
 */
export function apoiosDoManifest(elementos: Readonly<Record<string, ElementoPacote>>, areas: readonly Pick<AreaDeLaje, 'id' | 'contorno'>[] = []): Map<string, ApoiosDaPeca> {
  const pecas = Object.entries(elementos).filter(([, e]) => !e.so_detalhe && e.polys.some((p) => p.length >= 3))
  const pilares = pecas.filter(([, e]) => e.tipo === 'P').map(([id, e]) => ({ id, e, cx: caixaDe(e.polys)! }))
  const vigas = pecas.filter(([, e]) => e.tipo === 'V').map(([id, e]) => ({ id, e, cx: caixaDe(e.polys)! }))
  const folga = Math.max(0.5, mediana(pilares.map(({ cx }) => Math.min(cx[2] - cx[0], cx[3] - cx[1]))) / 4)
  const saida = new Map<string, ApoiosDaPeca>()
  for (const v of vigas) {
    const ps = pilares.filter((p) => cruzaCaixa(v.cx, p.cx, folga) && contornosSeTocam(v.e.polys, p.e.polys, folga)).map((p) => p.id)
    const vs = vigas.filter((o) => o.id !== v.id && cruzaCaixa(v.cx, o.cx, folga) && contornosSeTocam(v.e.polys, o.e.polys, folga)).map((o) => o.id)
    saida.set(v.id, { pilares: ps, vigas: vs })
  }
  const centros = [...pilares, ...vigas].map((p) => ({ id: p.id, tipo: p.e.tipo, c: centroDaPeca(p.e) }))
  const lajes: Array<[string, readonly (readonly Ponto[])[]]> = [
    ...pecas.filter(([, e]) => e.tipo === 'L').map(([id, e]) => [id, e.polys] as [string, readonly (readonly Ponto[])[]]),
    ...areas.filter((a) => a.contorno.length >= 3).map((a) => [a.id, [a.contorno]] as [string, readonly (readonly Ponto[])[]]),
  ]
  for (const [id, polys] of lajes) {
    const de = centros.filter((c) => polys.some((poly) => dentro(c.c, poly as Ponto[])))
    saida.set(id, { pilares: de.filter((c) => c.tipo === 'P').map((c) => c.id), vigas: de.filter((c) => c.tipo === 'V').map((c) => c.id) })
  }
  return saida
}

/** Uma planta do aparelho, só com o que a conta precisa. */
export interface PlantaDoAparelho {
  planta_id: string
  elementos: Readonly<Record<string, ElementoPacote>>
}

/**
 * Os apoios da obra inteira, pelas plantas do aparelho: por pavimento, a planta com mais pilares e vigas (a
 * forma; as de armadura e de furação repetem as peças ou não as têm). As áreas de laje usam a planta em que
 * foram desenhadas; sem ela no aparelho, a forma do pavimento.
 */
export function apoiosDaObra(plantas: readonly PlantaDoAparelho[], pecaPorId: ReadonlyMap<string, Pick<Peca, 'pavimento_id'>>, areas: readonly AreaDeLaje[]): Map<string, ApoiosDaPeca> {
  const melhor = new Map<string, { p: PlantaDoAparelho; n: number }>()
  for (const p of plantas) {
    let n = 0
    const votos = new Map<string, number>()
    for (const [id, e] of Object.entries(p.elementos)) {
      if (e.tipo !== 'P' && e.tipo !== 'V') continue
      n++
      const pv = pecaPorId.get(id)?.pavimento_id
      if (pv) votos.set(pv, (votos.get(pv) ?? 0) + 1)
    }
    const pv = [...votos].sort((a, b) => b[1] - a[1])[0]?.[0]
    if (pv && n > (melhor.get(pv)?.n ?? 0)) melhor.set(pv, { p, n })
  }
  const porPlanta = new Map(plantas.map((p) => [p.planta_id, p]))
  const saida = new Map<string, ApoiosDaPeca>()
  for (const [pv, { p }] of melhor) {
    const daqui = areas.filter((a) => (a.planta_id && porPlanta.has(a.planta_id) ? a.planta_id === p.planta_id : a.pavimento_id === pv))
    for (const [id, ap] of apoiosDoManifest(p.elementos, daqui)) saida.set(id, ap)
  }
  // área desenhada numa planta do aparelho que não é a forma escolhida (outra revisão, outro trecho)
  for (const a of areas) {
    if (saida.has(a.id) || !a.planta_id) continue
    const p = porPlanta.get(a.planta_id)
    if (p) for (const [id, ap] of apoiosDoManifest(p.elementos, [a])) if (id === a.id) saida.set(id, ap)
  }
  return saida
}

const normal = (s: string) => s.trim().toLocaleUpperCase('pt-BR')

/** Os residenciais de um pilar pelo nome, no pavimento: a lista do pavimento passa na frente da geral. */
export function residenciaisDoPilar(residenciais: readonly Residencial[], nomeDoPavimento: string, nomeDoPilar: string): string[] {
  const doPavimento = residenciais.filter((r) => r.pavimento && normal(r.pavimento) === normal(nomeDoPavimento))
  const lista = doPavimento.length ? doPavimento : residenciais.filter((r) => !r.pavimento)
  const nome = normal(nomeDoPilar)
  return lista.filter((r) => r.pilares.some((p) => normal(p) === nome)).map((r) => r.nome)
}

export type GrupoDoAviso = 'pilares' | 'vigas_lajes'

export interface PecaQueFalta {
  pecaId: string
  nome: string
  tipo: string
  /** null = ainda sem concretagem marcada */
  liberaEm: Date | null
}

export interface AvisoDoResidencial {
  chave: string
  pavimentoId: string
  pavimento: string
  residencial: string
  grupo: GrupoDoAviso
  /** todas as peças do residencial no pavimento com o prazo cumprido (ou a retirada já marcada) */
  pode: boolean
  /** quando todas liberam (a mais tarde); null se alguma ainda não foi concretada */
  liberaEm: Date | null
  /** as que seguram o aviso: aguardando (pela data) e sem concretagem */
  faltam: PecaQueFalta[]
  /** peças do residencial no pavimento com esse prazo */
  total: number
}

type Dados = Pick<DadosFvs, 'pavimentos' | 'pecaPorId' | 'eventosDe' | 'fichaPorId' | 'fichas' | 'areaPorId' | 'regras'>

type Estado = { tipo: 'feito' } | { tipo: 'cumprido'; liberaEm: Date } | { tipo: 'aguardando'; liberaEm: Date } | { tipo: 'sem_inicio' }

const PESO: Record<Estado['tipo'], number> = { feito: 0, cumprido: 1, aguardando: 2, sem_inicio: 3 }

/** O pior estado entre os prazos da peça (o que mais segura); entre dois aguardando, o que libera mais tarde. */
function pior(a: Estado | null, b: Estado): Estado {
  if (!a || PESO[b.tipo] > PESO[a.tipo]) return b
  if (PESO[b.tipo] < PESO[a.tipo]) return a
  if ((a.tipo === 'aguardando' || a.tipo === 'cumprido') && (b.tipo === 'aguardando' || b.tipo === 'cumprido')) return b.liberaEm > a.liberaEm ? b : a
  return a
}

const ordemNatural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

/**
 * Os avisos da obra, por pavimento, residencial e grupo (desforma dos pilares; escoramento de vigas e
 * lajes), do mais urgente para o menos: primeiro os que já podem (os mais antigos antes), depois os que
 * aguardando têm data (a mais perto antes), por fim os que ainda esperam concretagem. Residencial que não
 * começou (nenhuma peça concretada) ou que terminou (todas as retiradas marcadas) não aparece.
 */
export function avisosPorResidencial(d: Dados, apoios: ReadonlyMap<string, ApoiosDaPeca>, agora = new Date()): AvisoDoResidencial[] {
  const residenciais = d.regras.residenciais ?? []
  const prazos = d.regras.prazos
  if (!residenciais.length || !prazos.length) return []
  const nomeDoPavimento = new Map(d.pavimentos.map((p) => [p.id, p.nome]))
  const ordemDoPavimento = new Map(d.pavimentos.map((p, i) => [p.id, i]))
  const areas: Peca[] = [...d.areaPorId.values()].map((a) => ({ id: a.id, pavimento_id: a.pavimento_id, tipo: 'L', nome: a.nome, secao: null }))
  const pecas = [...d.pecaPorId.values(), ...areas]

  // residenciais de cada peça: pilar pelo nome; viga e laje pelos pilares que as apoiam, e a viga que só
  // apoia em viga pelas vigas que ela toca (algumas voltas, para a corrente de vigas)
  const resDe = new Map<string, string[]>()
  for (const p of pecas)
    if (p.tipo === 'P') resDe.set(p.id, residenciaisDoPilar(residenciais, nomeDoPavimento.get(p.pavimento_id) ?? '', p.nome))
  const residenciaisDe = (ids: readonly string[]) => [...new Set(ids.flatMap((id) => resDe.get(id) ?? []))]
  for (const p of pecas) {
    if (p.tipo === 'P') continue
    const ap = apoios.get(p.id)
    if (ap) resDe.set(p.id, residenciaisDe(ap.pilares))
  }
  for (let volta = 0; volta < 4; volta++) {
    let mudou = false
    for (const p of pecas) {
      if (p.tipo === 'P' || resDe.get(p.id)?.length) continue
      const ap = apoios.get(p.id)
      const r = ap ? residenciaisDe(ap.vigas) : []
      if (r.length) {
        resDe.set(p.id, r)
        mudou = true
      }
    }
    if (!mudou) break
  }

  const grupos = new Map<string, { pv: string; res: string; grupo: GrupoDoAviso; pecas: Array<{ p: Peca; e: Estado }> }>()
  for (const p of pecas) {
    const res = resDe.get(p.id)
    if (!res?.length) continue
    const eventos = d.eventosDe.get(p.id) ?? []
    const ficha = fichaDaPeca(fichaDoLocalNaObra(d, p), eventos, (id) => d.fichaPorId.get(id))
    if (!ficha) continue
    const doPrazo = prazos.filter((pr) => pr.ficha === ficha.codigo)
    if (!doPrazo.length) continue
    const ultimos = ultimosPorItem(eventos.filter((e) => e.ficha_id === ficha.id))
    const cx = { eventos, ficha, fichaPorId: (id: string) => d.fichaPorId.get(id), datasDoConcreto: datasDoConcreto(eventos) }
    let estado: Estado | null = null
    for (const prazo of doPrazo) {
      if (ultimos.get(prazo.item)?.resultado) {
        estado = pior(estado, { tipo: 'feito' })
        continue
      }
      const s = estadoDoPrazo(prazo, inicioDoPrazo(prazo, cx), agora)
      estado = pior(estado, s.estado === 'sem_inicio' ? { tipo: 'sem_inicio' } : { tipo: s.estado, liberaEm: s.liberaEm })
    }
    const grupo: GrupoDoAviso = p.tipo === 'P' ? 'pilares' : 'vigas_lajes'
    for (const r of res) {
      const k = `${p.pavimento_id}|${r}|${grupo}`
      let g = grupos.get(k)
      if (!g) grupos.set(k, (g = { pv: p.pavimento_id, res: r, grupo, pecas: [] }))
      g.pecas.push({ p, e: estado! })
    }
  }

  const avisos: AvisoDoResidencial[] = []
  for (const [chave, g] of grupos) {
    const estados = g.pecas.map((x) => x.e)
    if (estados.every((e) => e.tipo === 'sem_inicio') || estados.every((e) => e.tipo === 'feito')) continue
    const faltam: PecaQueFalta[] = g.pecas
      .filter((x) => x.e.tipo === 'aguardando' || x.e.tipo === 'sem_inicio')
      .map((x) => ({ pecaId: x.p.id, nome: x.p.nome, tipo: x.p.tipo, liberaEm: x.e.tipo === 'aguardando' ? x.e.liberaEm : null }))
      .sort((a, b) => (a.liberaEm && b.liberaEm ? a.liberaEm.getTime() - b.liberaEm.getTime() : a.liberaEm ? -1 : b.liberaEm ? 1 : 0) || ordemNatural.compare(a.nome, b.nome))
    const datas = estados.flatMap((e) => (e.tipo === 'aguardando' || e.tipo === 'cumprido' ? [e.liberaEm] : []))
    const semInicio = estados.some((e) => e.tipo === 'sem_inicio')
    avisos.push({
      chave,
      pavimentoId: g.pv,
      pavimento: nomeDoPavimento.get(g.pv) ?? '',
      residencial: g.res,
      grupo: g.grupo,
      pode: !faltam.length,
      liberaEm: semInicio || !datas.length ? null : new Date(Math.max(...datas.map((x) => x.getTime()))),
      faltam,
      total: g.pecas.length,
    })
  }
  const nivel = (a: AvisoDoResidencial) => (a.pode ? 0 : a.liberaEm ? 1 : 2)
  return avisos.sort(
    (a, b) =>
      nivel(a) - nivel(b) ||
      (a.liberaEm && b.liberaEm ? a.liberaEm.getTime() - b.liberaEm.getTime() : 0) ||
      a.faltam.length - b.faltam.length ||
      (ordemDoPavimento.get(a.pavimentoId) ?? 0) - (ordemDoPavimento.get(b.pavimentoId) ?? 0) ||
      ordemNatural.compare(a.residencial, b.residencial) ||
      a.grupo.localeCompare(b.grupo),
  )
}

const ddmm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

export const TITULO_DO_GRUPO: Record<GrupoDoAviso, string> = { pilares: 'Desforma dos pilares', vigas_lajes: 'Escoramento de vigas e lajes' }

/** "pode desescorar desde 20/11", "libera em 25/11 (faltam 3 dias)" ou "esperando concretagem". */
export function situacaoDoAviso(a: AvisoDoResidencial, agora = new Date()): string {
  const verbo = a.grupo === 'pilares' ? 'pode desformar' : 'pode desescorar'
  if (a.pode) return a.liberaEm ? `${verbo} desde ${ddmm(a.liberaEm)}` : verbo
  if (!a.liberaEm) return 'esperando concretagem'
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const n = Math.round((a.liberaEm.getTime() - hoje.getTime()) / 86_400_000)
  return `libera em ${ddmm(a.liberaEm)} (${n === 1 ? 'falta 1 dia' : `faltam ${n} dias`})`
}

/**
 * O que segura o aviso: "falta V50, V51 (libera 25/11); falta concretar P47, P62 e mais 30". As que aguardam
 * vêm juntas pela data (até 3 datas); de cada lista, no máximo `ate` nomes e "e mais N".
 */
export function textoDoQueFalta(a: AvisoDoResidencial, ate = 6): string {
  const nomes = (l: readonly PecaQueFalta[]) => l.slice(0, ate).map((f) => f.nome).join(', ') + (l.length > ate ? ` e mais ${l.length - ate}` : '')
  const porData = new Map<string, PecaQueFalta[]>()
  for (const f of a.faltam) if (f.liberaEm) porData.set(ddmm(f.liberaEm), [...(porData.get(ddmm(f.liberaEm)) ?? []), f])
  const datas = [...porData]
  const partes = datas.slice(0, 3).map(([d, l]) => `falta ${nomes(l)} (libera ${d})`)
  const depois = datas.slice(3).reduce((n, [, l]) => n + l.length, 0)
  if (depois) partes.push(`mais ${depois} ${depois === 1 ? 'libera' : 'liberam'} depois`)
  const sem = a.faltam.filter((f) => !f.liberaEm)
  if (sem.length) partes.push(`falta concretar ${nomes(sem)}`)
  return partes.join('; ')
}

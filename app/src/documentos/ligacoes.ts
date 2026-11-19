// Registros dos outros módulos que entram na lista mestra da obra, SÓ PARA LER (segunda rodada, 09/11/2026).
//
// O SiAC pede que os registros da qualidade estejam identificados e localizáveis. Eles já existem nos
// módulos (fichas e verificações da FVS, concretagens e CPs do Concreto, relatórios de Qualidade como
// NC): aqui só são contados e listados, a partir das mesmas linhas do aparelho. Nada é gravado e nenhum
// arquivo da FVS, do Concreto ou dos Relatórios é alterado; só as funções puras deles são reaproveitadas.
import type { Linha } from '../nucleo/banco_local'
import { vigentes, type Corrigivel } from '../concreto/vigentes'
import { montarDados, situacaoDoRelatorio, type SituacaoRelatorio } from '../relatorios/regras'

/** Tabelas lidas (todas do núcleo ou de módulos já sincronizados). */
export const TABELAS_LIDAS = [
  'fichas_modelo',
  'fvs_eventos',
  'fvs_fichas_campo',
  'concretagens',
  'caminhoes',
  'cp_resultados',
  'relatorios',
  'relatorio_andamentos',
] as const

export type LinhasLidas = Partial<Record<(typeof TABELAS_LIDAS)[number], readonly Linha[]>>

export interface FichaFvs {
  codigo: string
  titulo: string
  revisao: string
  /** Revisões da ficha guardadas no aparelho (a vigente é a maior). */
  revisoes: number
  /** Peças ou áreas de laje com alguma marcação nesta ficha (qualquer revisão). */
  pecasVerificadas: number
  /** Marcações (C, NC ou NA) feitas nesta ficha. */
  marcacoes: number
  /** Fichas abertas no sistema oficial com este código. */
  abertas: number
}

export interface ConcretagemResumo {
  raiz: string
  data: string
  local: string
  fck: number
  caminhoes: number
  cpsMoldados: number
  cpsRompidos: number
  exemplo: boolean
}

export interface NcAberta {
  raiz: string
  data: string
  titulo: string
  situacao: Exclude<SituacaoRelatorio, 'resolvido'>
  prazo: string | null
  gravidade: string | null
}

export interface Ligacoes {
  fichas: FichaFvs[]
  concretagens: ConcretagemResumo[]
  ncs: NcAberta[]
}

const natural = new Intl.Collator('pt-BR', { numeric: true })

/** Revisão maior: "02" > "1", "B" > "A" (comparação natural). */
const revisaoMaior = (a: string, b: string) => natural.compare(a, b) > 0

function fichasDaFvs(t: LinhasLidas): FichaFvs[] {
  const porCodigo = new Map<string, { atual: Linha; ids: Set<string>; revisoes: number }>()
  for (const f of t.fichas_modelo ?? []) {
    if (f.apagado) continue
    const codigo = String(f.codigo ?? '').trim()
    if (!codigo) continue
    const g = porCodigo.get(codigo)
    if (!g) porCodigo.set(codigo, { atual: f, ids: new Set([f.id]), revisoes: 1 })
    else {
      g.ids.add(f.id)
      g.revisoes++
      if (revisaoMaior(String(f.revisao ?? '0'), String(g.atual.revisao ?? '0'))) g.atual = f
    }
  }
  const codigoDoId = new Map<string, string>()
  for (const [codigo, g] of porCodigo) for (const id of g.ids) codigoDoId.set(id, codigo)

  const pecas = new Map<string, Set<string>>()
  const marcacoes = new Map<string, number>()
  for (const e of t.fvs_eventos ?? []) {
    const codigo = codigoDoId.get(String(e.ficha_id ?? ''))
    if (!codigo || !e.resultado) continue
    marcacoes.set(codigo, (marcacoes.get(codigo) ?? 0) + 1)
    // a área de laje grava em area_id, não em elemento_id (fvs/dados.ts): conta como local verificado
    const local = e.elemento_id ?? e.area_id
    if (local) {
      const s = pecas.get(codigo) ?? new Set<string>()
      s.add(String(local))
      pecas.set(codigo, s)
    }
  }
  const abertas = new Map<string, number>()
  for (const fc of t.fvs_fichas_campo ?? []) {
    const codigo = String(fc.ficha_codigo ?? '').trim()
    if (porCodigo.has(codigo)) abertas.set(codigo, (abertas.get(codigo) ?? 0) + 1)
  }
  return [...porCodigo]
    .map(([codigo, g]) => ({
      codigo,
      titulo: String(g.atual.titulo ?? ''),
      revisao: String(g.atual.revisao ?? '0'),
      revisoes: g.revisoes,
      pecasVerificadas: pecas.get(codigo)?.size ?? 0,
      marcacoes: marcacoes.get(codigo) ?? 0,
      abertas: abertas.get(codigo) ?? 0,
    }))
    .sort((a, b) => natural.compare(a.codigo, b.codigo))
}

function concretagensDoConcreto(t: LinhasLidas, idDoExemplo: string | null): ConcretagemResumo[] {
  const concs = vigentes((t.concretagens ?? []) as Corrigivel[])
  const cams = vigentes((t.caminhoes ?? []) as Corrigivel[])
  const res = vigentes((t.cp_resultados ?? []) as Corrigivel[])
  const camsDe = new Map<string, typeof cams>()
  for (const c of cams) {
    const k = String(c.concretagem_id)
    camsDe.set(k, [...(camsDe.get(k) ?? []), c])
  }
  const rompidosDe = new Map<string, number>()
  for (const r of res) {
    if (r.resistencia_mpa === null || r.resistencia_mpa === undefined || r.resistencia_mpa === '') continue
    const k = String(r.caminhao_id)
    rompidosDe.set(k, (rompidosDe.get(k) ?? 0) + 1)
  }
  return concs
    .map((c) => {
      const doConc = camsDe.get(c.raiz) ?? []
      return {
        raiz: c.raiz,
        data: String(c.data ?? ''),
        local: String(c.local_descricao ?? ''),
        fck: Number(c.fck_mpa ?? 0),
        caminhoes: doConc.length,
        cpsMoldados: doConc.reduce((s, cam) => s + Number(cam.cps_moldados ?? 0), 0),
        cpsRompidos: doConc.reduce((s, cam) => s + (rompidosDe.get(cam.raiz) ?? 0), 0),
        exemplo: c.raiz === idDoExemplo,
      }
    })
    .sort((a, b) => b.data.localeCompare(a.data) || natural.compare(a.local, b.local))
}

function ncsDosRelatorios(t: LinhasLidas): NcAberta[] {
  const d = montarDados({ relatorios: t.relatorios ?? [], relatorio_andamentos: t.relatorio_andamentos ?? [] })
  const saida: NcAberta[] = []
  for (const r of d.relatorios) {
    if (r.tipo !== 'qualidade' || d.exemplos.has(r.raiz)) continue
    const situacao = situacaoDoRelatorio(r, d.andamentos.get(r.raiz))
    if (situacao === 'resolvido') continue
    saida.push({ raiz: r.raiz, data: r.data, titulo: r.titulo, situacao, prazo: r.prazo, gravidade: r.gravidade })
  }
  return saida.sort((a, b) => b.data.localeCompare(a.data))
}

/** Junta o que os módulos já têm no aparelho. `idDoExemplo` = raiz da concretagem de apresentação. */
export function montarLigacoes(t: LinhasLidas, idDoExemplo: string | null = null): Ligacoes {
  return { fichas: fichasDaFvs(t), concretagens: concretagensDoConcreto(t, idDoExemplo), ncs: ncsDosRelatorios(t) }
}

export const NOME_DA_SITUACAO_NC: Record<NcAberta['situacao'], string> = { aberto: 'Aberta', em_andamento: 'Em andamento' }

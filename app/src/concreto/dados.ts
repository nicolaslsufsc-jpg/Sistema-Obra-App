// Leitura e registro dos dados do Concreto no aparelho (pelo núcleo: funciona sem internet).

import type { Linha } from '../nucleo/banco_local'
import type { PapelNaObra } from '../nucleo/conta'
import { sincronizador } from '../nucleo/servicos'
import { dataLocal, piorSituacao, situacaoDasIdades, type IdadeCP, type ResultadoCP, type SituacaoCP } from './cps'
import { idDaLaje, lajeDoTrecho, nomeNaTela, nomeNoBanco } from './lajes'
import { estadoDasPecas, type EstadoPeca, type MudancaPeca } from './pecas'
import { montarRastreioDasLajes } from './rastreio'
import { chavesDasPlantas } from './plantas_equivalentes'
import { areasVigentes, type LinhaDeArea } from '../fvs/areas'
import { camposDeCorrecao, vigentes, type Corrigivel, type Vigente } from './vigentes'

import { idsDasConcretagensDeExemplo } from './exemplo'
import { TABELAS_CONCRETO } from './tabelas'
export { TABELAS_CONCRETO }

/** Colunas do módulo copiadas numa correção (substitui_id e cancelado à parte). */
const COLUNAS = {
  concretagens: [
    'pavimento_id', 'data', 'local_descricao', 'codigo_construpoint', 'fornecedor', 'fck_mpa', 'slump_cm',
    'slump_tolerancia_cm', 'idades_dias', 'cps_por_idade', 'observacao',
  ],
  caminhoes: [
    'concretagem_id', 'sequencia', 'nota_fiscal', 'volume_m3', 'saida_usina', 'chegada_obra', 'inicio_descarga',
    'fim_descarga', 'slump_medido_cm', 'agua_adicionada_l', 'cps_moldados', 'observacao',
  ],
  caminhao_areas: ['caminhao_id', 'planta_ref', 'contorno', 'alvo'],
  cp_resultados: ['caminhao_id', 'idade_dias', 'numero_cp', 'data_ensaio', 'resistencia_mpa', 'origem', 'laudo_arquivo_id', 'observacao'],
} as const

type TabelaCorrigivel = keyof typeof COLUNAS

export type Concretagem = Vigente<Corrigivel> & {
  pavimento_id: string
  data: string
  local_descricao: string
  codigo_construpoint: string | null
  fornecedor: string | null
  fck_mpa: number
  slump_cm: number | null
  slump_tolerancia_cm: number | null
  idades_dias: number[]
  cps_por_idade: number
  observacao: string | null
  /** a concretagem de exemplo da apresentação (exemplo.ts), não é dado real */
  exemplo?: boolean
}

export type Caminhao = Vigente<Corrigivel> & {
  concretagem_id: string
  sequencia: number
  nota_fiscal: string | null
  volume_m3: number | null
  saida_usina: string | null
  chegada_obra: string | null
  inicio_descarga: string | null
  fim_descarga: string | null
  slump_medido_cm: number | null
  agua_adicionada_l: number | null
  cps_moldados: number | null
  observacao: string | null
}

/** Em que peças a área vale: 'pilares', 'vigas_laje' (vigas e a laje do trecho) ou vazio = todas (áreas antigas). */
export type AlvoDaArea = 'pilares' | 'vigas_laje'
export type Area = Vigente<Corrigivel> & { caminhao_id: string; planta_ref: string; contorno: Array<[number, number]>; alvo?: AlvoDaArea | null }

export type Resultado = Vigente<Corrigivel> & ResultadoCP & {
  caminhao_id: string
  data_ensaio: string | null
  origem: string
  observacao: string | null
  laudo_arquivo_id?: string | null
}

export interface Peca {
  id: string
  pavimento_id: string
  tipo: string
  nome: string
  secao: string | null
}

export interface Pavimento {
  id: string
  nome: string
  ordem: number
}

/** Área de laje da FVS (fvs_areas) que o caminhão cobriu: calculado pela sobreposição dos desenhos, nada gravado. */
export interface LajeFvsDoCaminhao {
  area_id: string
  nome: string
  /** fração da área da FVS dentro das áreas do caminhão */
  fracao: number
  parcial: boolean
}

export interface DadosConcreto {
  pavimentos: Pavimento[]
  concretagens: Concretagem[]
  caminhoes: Caminhao[]
  /** por raiz da concretagem */
  caminhoesDe: Map<string, Caminhao[]>
  /** por raiz do caminhão */
  areasDe: Map<string, Area[]>
  registrosPecasDe: Map<string, Linha[]>
  pecasDe: Map<string, Map<string, EstadoPeca>>
  resultadosDe: Map<string, Resultado[]>
  /** peças (elementos) por pavimento */
  pecasDoPavimento: Map<string, Peca[]>
  pecaPorId: Map<string, Peca>
  /** áreas de laje da FVS por raiz do caminhão (rastreio.ts); vazio quando a FVS não desenhou laje */
  lajesFvsDe: Map<string, LajeFvsDoCaminhao[]>
  /**
   * id de planta (linha de "plantas" ou trecho) → chave: mesma chave = mesma planta na tela
   * (plantas_equivalentes.ts). Ausente: cada id vale por si.
   */
  chavePlanta?: (id: string) => string
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v))

function agrupar<T>(itens: readonly T[], chave: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const i of itens) {
    const k = chave(i)
    const l = m.get(k)
    if (l) l.push(i)
    else m.set(k, [i])
  }
  return m
}

/** Lê tudo do Concreto da obra (o que já foi baixado + o que foi registrado aqui). */
export async function carregar(obraId: string): Promise<DadosConcreto> {
  const [pav, conc, cam, areas, regsPecas, res, elem, areasFvs, plantasLinhas] = await Promise.all([
    sincronizador.linhas('pavimentos', obraId),
    sincronizador.linhas('concretagens', obraId),
    sincronizador.linhas('caminhoes', obraId),
    sincronizador.linhas('caminhao_areas', obraId),
    sincronizador.linhas('caminhao_elementos', obraId),
    sincronizador.linhas('cp_resultados', obraId),
    sincronizador.linhas('elementos', obraId),
    sincronizador.linhas('fvs_areas', obraId),
    sincronizador.linhas('plantas', obraId),
  ])
  const chavePlanta = chavesDasPlantas(plantasLinhas)
  const idsExemplo = await idsDasConcretagensDeExemplo(obraId)
  const pavimentos = pav
    .map((p) => ({ id: p.id, nome: String(p.nome), ordem: Number(p.ordem) }))
    .sort((a, b) => a.ordem - b.ordem)
  const concretagens = vigentes(conc as Corrigivel[]).map(
    (c) =>
      ({
        ...c,
        fck_mpa: Number(c.fck_mpa),
        slump_cm: num(c.slump_cm),
        slump_tolerancia_cm: num(c.slump_tolerancia_cm),
        idades_dias: ((c.idades_dias as unknown[]) ?? [7, 28]).map(Number),
        cps_por_idade: Number(c.cps_por_idade ?? 2),
        exemplo: idsExemplo.has(String(c.raiz)),
      }) as Concretagem,
  )
  const caminhoes = vigentes(cam as Corrigivel[]).map(
    (c) =>
      ({
        ...c,
        sequencia: Number(c.sequencia),
        volume_m3: num(c.volume_m3),
        slump_medido_cm: num(c.slump_medido_cm),
        agua_adicionada_l: num(c.agua_adicionada_l),
        cps_moldados: num(c.cps_moldados),
      }) as Caminhao,
  )
  const resultados = vigentes(res as Corrigivel[]).map(
    (r) =>
      ({
        ...r,
        idade_dias: Number(r.idade_dias),
        numero_cp: Number(r.numero_cp),
        resistencia_mpa: Number(r.resistencia_mpa),
      }) as Resultado,
  )
  const pecas: Peca[] = elem.map((e) => ({
    id: e.id,
    pavimento_id: String(e.pavimento_id),
    tipo: String(e.tipo),
    // laje de trecho: "Laje_Trecho_2" no banco, "Laje do Trecho 2" nas telas (lajes.ts)
    nome: nomeNaTela(String(e.tipo), String(e.nome)),
    secao: (e.secao as string | null) ?? null,
  }))
  const registrosPecasDe = agrupar(regsPecas, (r) => String(r.caminhao_id))
  const pecasDe = new Map<string, Map<string, EstadoPeca>>()
  for (const [k, regs] of registrosPecasDe) pecasDe.set(k, estadoDasPecas(regs))

  // laje da obra = área desenhada na FVS: que caminhões cobriram cada uma (só cálculo).
  // Aqui o exemplo entra (o relatório é da própria concretagem); quem tira o exemplo é o rastreio da FVS.
  const lajes = areasVigentes(areasFvs as unknown as LinhaDeArea[])
  const nomeDaArea = new Map(lajes.map((a) => [a.id, a.nome]))
  const lajesFvsDe = new Map<string, LajeFvsDoCaminhao[]>()
  for (const [areaId, r] of montarRastreioDasLajes({ concretagens: conc, caminhoes: cam, caminhao_areas: areas, exemplos: new Set(), chavePlanta }, lajes)) {
    for (const c of r.caminhoes) {
      const item = { area_id: areaId, nome: nomeDaArea.get(areaId) || 'Área de laje', fracao: c.fracao ?? 1, parcial: c.parcial }
      const lista = lajesFvsDe.get(c.caminhao_raiz)
      if (lista) lista.push(item)
      else lajesFvsDe.set(c.caminhao_raiz, [item])
    }
  }

  return {
    pavimentos,
    concretagens: concretagens.sort((a, b) => (a.data === b.data ? a.criado_em_dispositivo.localeCompare(b.criado_em_dispositivo) : a.data < b.data ? 1 : -1)),
    caminhoes,
    caminhoesDe: new Map([...agrupar(caminhoes, (c) => c.concretagem_id)].map(([k, l]) => [k, l.sort((a, b) => a.sequencia - b.sequencia)])),
    areasDe: agrupar(vigentes(areas as Corrigivel[]) as Area[], (a) => a.caminhao_id),
    registrosPecasDe,
    pecasDe,
    resultadosDe: agrupar(resultados, (r) => r.caminhao_id),
    pecasDoPavimento: agrupar(pecas, (p) => p.pavimento_id),
    pecaPorId: new Map(pecas.map((p) => [p.id, p])),
    lajesFvsDe,
    chavePlanta,
  }
}

/**
 * Dia da moldagem dos CPs = dia da concretagem. Os horários do caminhão valem só pela hora
 * (se a data da concretagem for corrigida, os CPs acompanham sem corrigir cada caminhão).
 */
export function dataMoldagem(_c: Caminhao, conc: Concretagem): string {
  return conc.data
}

export function idadesDoCaminhao(d: DadosConcreto, c: Caminhao, conc: Concretagem, hoje = dataLocal(new Date())): IdadeCP[] {
  return situacaoDasIdades({
    dataMoldagem: dataMoldagem(c, conc),
    idades: conc.idades_dias,
    fck: conc.fck_mpa,
    resultados: d.resultadosDe.get(c.raiz) ?? [],
    hoje,
  })
}

export function piorDoCaminhao(d: DadosConcreto, c: Caminhao, conc: Concretagem, hoje?: string): SituacaoCP | null {
  return piorSituacao(idadesDoCaminhao(d, c, conc, hoje).map((i) => i.situacao))
}

/** Caminhões (raiz) com área de "vigas e laje" desenhada: a laje que encheram (relatório e mapa). */
export function caminhoesComLajeDesenhada(d: Pick<DadosConcreto, 'areasDe'>): Set<string> {
  const s = new Set<string>()
  for (const [raiz, areas] of d.areasDe) if (areas.some((a) => a.alvo === 'vigas_laje')) s.add(raiz)
  return s
}

export function concretagemDe(d: DadosConcreto, c: Caminhao): Concretagem | undefined {
  return d.concretagens.find((x) => x.raiz === c.concretagem_id)
}

export function podeRegistrar(papel: PapelNaObra): boolean {
  return papel !== 'leitura'
}

export function podeLancarLaudo(papel: PapelNaObra): boolean {
  return papel === 'admin' || papel === 'gestor'
}

/** A laje do trecho é uma linha de "elementos", e o banco só deixa gestor e admin cadastrarem peça. */
export function podeCriarLaje(papel: PapelNaObra): boolean {
  return papel === 'admin' || papel === 'gestor'
}

/**
 * id da laje do trecho (lajes.ts). Se ainda não existe entre as peças do pavimento, cria a linha
 * em "elementos" no aparelho (vai para o servidor com o resto). Quem chama confere podeCriarLaje.
 */
export async function garantirLaje(
  obraId: string,
  usuarioId: string,
  pavimentoId: string,
  trecho: string,
  pecasDoPavimento: readonly Peca[],
): Promise<string> {
  const existente = lajeDoTrecho(pecasDoPavimento, trecho)
  if (existente) return existente.id
  const id = await idDaLaje(pavimentoId, trecho)
  // a lista pode estar atrasada (outro toque acabou de criar): o id é sempre o mesmo, basta olhar
  if ((await sincronizador.linhas('elementos', obraId)).some((e) => e.id === id)) return id
  await sincronizador.registrar('elementos', obraId, usuarioId, { id, pavimento_id: pavimentoId, tipo: 'L', nome: nomeNoBanco(trecho), secao: null })
  return id
}

// ---------------------------------------------------------------------
// Registro (sempre inclusão; correção = linha nova)
// ---------------------------------------------------------------------

export function registrar(tabela: (typeof TABELAS_CONCRETO)[number], obraId: string, usuarioId: string, campos: Record<string, unknown>) {
  return sincronizador.registrar(tabela, obraId, usuarioId, campos)
}

export function corrigir(
  tabela: TabelaCorrigivel,
  obraId: string,
  usuarioId: string,
  atual: Vigente<Corrigivel>,
  mudancas: Record<string, unknown>,
) {
  return sincronizador.registrar(tabela, obraId, usuarioId, camposDeCorrecao(atual, COLUNAS[tabela], mudancas))
}

export function cancelar(tabela: TabelaCorrigivel, obraId: string, usuarioId: string, atual: Vigente<Corrigivel>) {
  return corrigir(tabela, obraId, usuarioId, atual, { cancelado: true })
}

export async function registrarPecas(
  obraId: string,
  usuarioId: string,
  caminhaoRaiz: string,
  mudancas: readonly MudancaPeca[],
  origem: 'desenho' | 'manual',
) {
  for (const m of mudancas) {
    await sincronizador.registrar('caminhao_elementos', obraId, usuarioId, {
      caminhao_id: caminhaoRaiz,
      elemento_id: m.elemento_id,
      origem,
      fracao: origem === 'manual' ? null : m.fracao,
      incluido: m.incluido,
    })
  }
}

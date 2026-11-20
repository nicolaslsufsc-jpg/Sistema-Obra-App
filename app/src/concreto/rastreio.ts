// Rastreio do concreto para a FVS: que caminhões levaram cada peça. A FVS usa isto para pôr
// C no item "Controle de Concreto e rastreabilidade" (marcado com `rastreio_concreto: true` na
// ficha). Regras em docs/modulos/3_concreto.md ("Rastreio na FVS", decisões do Nicolas de 18 e 19/11/2026).
//
// Arquivo leve, de propósito: a FVS importa daqui sem carregar o módulo do Concreto (telas,
// Leaflet, dados.ts). Só dados e regra; o texto da tela ("pelo Concreto: caminhão N · NF …") é
// da FVS. Sem cache em memória: cada chamada lê o banco do aparelho, então a recarga da FVS
// (quando a sincronização traz dado novo) sempre vê o caminhão de agora.

import type { Linha } from '../nucleo/banco_local'
import { sincronizador } from '../nucleo/servicos'
import { idsDasConcretagensDeExemplo } from './exemplo'
import { amostrasDaPeca, caixaDe, caixasSeTocam, fracaoDentro, prepararArea, type AreaPreparada, type Ponto } from './geometria'
import { estadoDasPecas, LIMITE_INCLUIR, LIMITE_INTEIRA } from './pecas'
import { idDaRef } from './planta'
import { vigentes, type Corrigivel, type Vigente } from './vigentes'

/**
 * Tipos de peça com rastreio pela peça: pilar e viga. A laje da FVS não é peça, é a área desenhada
 * no app (fvs_areas): o rastreio dela é por cima das áreas dos caminhões (montarRastreioDasLajes).
 */
export const TIPOS_RASTREIO: readonly string[] = ['P', 'V']

export interface CaminhaoDaPeca {
  /** raiz do caminhão (id estável, mesmo depois de corrigido) */
  caminhao_raiz: string
  concretagem_raiz: string
  /** caminhão N da concretagem */
  sequencia: number
  /** null quando não foi informada (a FVS escreve "NF não informada") */
  nota_fiscal: string | null
  /** data da concretagem (AAAA-MM-DD), a mesma dos CPs */
  data: string
  /** fração da peça dentro das áreas do caminhão; null = incluída à mão */
  fracao: number | null
  /** a área pegou só parte da peça (entre 10% e 90%) */
  parcial: boolean
}

export interface LinhasDoRastreio {
  concretagens: readonly Linha[]
  caminhoes: readonly Linha[]
  caminhao_elementos: readonly Linha[]
  elementos: readonly Linha[]
  /** raízes das concretagens de exemplo (exemplo.ts): não contam */
  exemplos: ReadonlySet<string>
}

const textoOuNulo = (v: unknown): string | null => {
  const t = v === null || v === undefined ? '' : String(v).trim()
  return t ? t : null
}

type CaminhaoValido = { cam: Vigente<Corrigivel>; conc: Vigente<Corrigivel> }

/** Caminhões vigentes de concretagem vigente, sem as concretagens de exemplo. */
function caminhoesValidos(l: Pick<LinhasDoRastreio, 'concretagens' | 'caminhoes' | 'exemplos'>): CaminhaoValido[] {
  const concretagens = new Map<string, Vigente<Corrigivel>>()
  for (const c of vigentes(l.concretagens as Corrigivel[])) if (!l.exemplos.has(c.raiz)) concretagens.set(c.raiz, c)
  // caminhão de concretagem cancelada não conta
  return vigentes(l.caminhoes as Corrigivel[]).flatMap((cam) => {
    const conc = concretagens.get(String(cam.concretagem_id))
    return conc ? [{ cam, conc }] : []
  })
}

function caminhaoDaPeca({ cam, conc }: CaminhaoValido, fracao: number | null, parcial: boolean): CaminhaoDaPeca {
  return {
    caminhao_raiz: cam.raiz,
    concretagem_raiz: conc.raiz,
    sequencia: Number(cam.sequencia),
    nota_fiscal: textoOuNulo(cam.nota_fiscal),
    data: String(conc.data),
    fracao,
    parcial,
  }
}

const porDataESequencia = (a: CaminhaoDaPeca, b: CaminhaoDaPeca) => (a.data === b.data ? a.sequencia - b.sequencia : a.data < b.data ? -1 : 1)

/** Puro: caminhões de cada peça (pilar e viga), em ordem de data e depois de sequência. */
export function montarRastreio(l: LinhasDoRastreio): Map<string, CaminhaoDaPeca[]> {
  const caminhoes = caminhoesValidos(l)

  const tipoDe = new Map(l.elementos.map((e) => [e.id, String(e.tipo)]))
  const registrosDe = new Map<string, Linha[]>()
  for (const r of l.caminhao_elementos) {
    const k = String(r.caminhao_id)
    const lista = registrosDe.get(k)
    if (lista) lista.push(r)
    else registrosDe.set(k, [r])
  }

  const saida = new Map<string, CaminhaoDaPeca[]>()
  for (const valido of caminhoes) {
    for (const [elemento, estado] of estadoDasPecas(registrosDe.get(valido.cam.raiz) ?? [])) {
      if (!estado.incluido) continue
      if (!TIPOS_RASTREIO.includes(tipoDe.get(elemento) ?? '')) continue
      // a correção à mão vale a peça inteira (a pessoa confirmou), mesmo que o desenho tenha pego só parte
      const manual = estado.origem === 'manual'
      const item = caminhaoDaPeca(valido, manual ? null : estado.fracao, manual ? false : estado.parcial)
      const lista = saida.get(elemento)
      if (lista) lista.push(item)
      else saida.set(elemento, [item])
    }
  }
  for (const lista of saida.values()) lista.sort(porDataESequencia)
  return saida
}

/**
 * Caminhões de cada peça da obra, lidos do banco do aparelho. Obra sem nada do Concreto (ou modo
 * local sem caminhão): Map vazio, sem erro.
 */
export async function caminhoesDasPecas(obraId: string): Promise<Map<string, CaminhaoDaPeca[]>> {
  const [concretagens, caminhoes, caminhao_elementos, elementos, exemplos] = await Promise.all([
    sincronizador.linhas('concretagens', obraId),
    sincronizador.linhas('caminhoes', obraId),
    sincronizador.linhas('caminhao_elementos', obraId),
    sincronizador.linhas('elementos', obraId),
    idsDasConcretagensDeExemplo(obraId),
  ])
  return montarRastreio({ concretagens, caminhoes, caminhao_elementos, elementos, exemplos })
}

export interface SituacaoDoRastreio {
  /** C com caminhão; null = pendente (sem caminhão nunca é NC) */
  resultado: 'C' | null
  /** nenhum caminhão pegou a peça inteira e a soma das frações não fecha a peça */
  parcial: boolean
}

/**
 * Puro: a situação do item de rastreio pelos caminhões da peça. Na laje, passar a `cobertura`
 * (montarRastreioDasLajes): dois caminhões em cima do mesmo pedaço não somam duas vezes.
 */
export function situacaoDoRastreio(caminhoes: readonly CaminhaoDaPeca[], cobertura?: number): SituacaoDoRastreio {
  if (caminhoes.length === 0) return { resultado: null, parcial: false }
  // incluída à mão (fração null) conta como inteira
  const soma = cobertura ?? caminhoes.reduce((s, c) => s + (c.fracao === null ? 1 : c.fracao), 0)
  return { resultado: 'C', parcial: soma < LIMITE_INTEIRA }
}

// ---------------------------------------------------------------------
// Laje: a área desenhada na FVS (fvs_areas) x as áreas dos caminhões (caminhao_areas)
// ---------------------------------------------------------------------

/** A área de laje da FVS, como a FVS já tem (areasVigentes em fvs/areas.ts). */
export interface AreaDeLajeFvs {
  /** area_id */
  id: string
  /** o trecho (setores.id): as coordenadas só valem na planta dele */
  setor_id: string
  contorno: readonly Ponto[]
}

export interface RastreioDaLaje {
  /** caminhões que pegaram pelo menos 10% da área, em ordem de data e sequência */
  caminhoes: CaminhaoDaPeca[]
  /** fração da área (0 a 1) dentro das áreas de todos esses caminhões juntos */
  cobertura: number
}

export interface LinhasDoRastreioDaLaje extends Pick<LinhasDoRastreio, 'concretagens' | 'caminhoes' | 'exemplos'> {
  caminhao_areas: readonly Linha[]
}

/** Pontos de amostra por área de laje (a laje é grande: mais pontos que uma peça). */
const AMOSTRAS_LAJE = 400

/**
 * Puro: caminhões de cada área de laje da FVS. Vale a área do caminhão desenhada na mesma planta
 * (trecho) que a área da FVS, com a caneta "vigas e laje" ou das de antes das duas canetas (sem alvo);
 * a caneta "pilares" não conta. Sem tabela nova: a ligação é a sobreposição dos dois desenhos.
 * Área sem caminhão não entra no Map (pendente).
 */
export function montarRastreioDasLajes(l: LinhasDoRastreioDaLaje, areas: readonly AreaDeLajeFvs[]): Map<string, RastreioDaLaje> {
  const validos = new Map(caminhoesValidos(l).map((v) => [v.cam.raiz, v]))
  // áreas vigentes dos caminhões válidos, por trecho e por caminhão
  const porSetor = new Map<string, Map<string, AreaPreparada[]>>()
  for (const a of vigentes(l.caminhao_areas as Corrigivel[])) {
    if (a.alvo === 'pilares') continue
    const cam = String(a.caminhao_id)
    if (!validos.has(cam)) continue
    const contorno = a.contorno as Ponto[] | undefined
    if (!contorno || contorno.length < 3) continue
    const setor = idDaRef(String(a.planta_ref))
    const doSetor = porSetor.get(setor) ?? new Map<string, AreaPreparada[]>()
    porSetor.set(setor, doSetor)
    const lista = doSetor.get(cam)
    if (lista) lista.push(prepararArea(contorno))
    else doSetor.set(cam, [prepararArea(contorno)])
  }

  const saida = new Map<string, RastreioDaLaje>()
  for (const area of areas) {
    const doSetor = porSetor.get(area.setor_id)
    if (!doSetor || area.contorno.length < 3) continue
    const caixa = caixaDe(area.contorno)
    const amostras = amostrasDaPeca([area.contorno], AMOSTRAS_LAJE)
    const caminhoes: CaminhaoDaPeca[] = []
    const juntas: AreaPreparada[] = []
    for (const [cam, preparadas] of doSetor) {
      const perto = preparadas.filter((p) => caixasSeTocam(p.caixa, caixa))
      if (!perto.length) continue
      const fracao = fracaoDentro(amostras, perto)
      if (fracao < LIMITE_INCLUIR) continue
      caminhoes.push(caminhaoDaPeca(validos.get(cam)!, fracao, fracao < LIMITE_INTEIRA))
      juntas.push(...perto)
    }
    if (!caminhoes.length) continue
    saida.set(area.id, { caminhoes: caminhoes.sort(porDataESequencia), cobertura: fracaoDentro(amostras, juntas) })
  }
  return saida
}

/**
 * Caminhões de cada área de laje, lidos do banco do aparelho (sem cache). A FVS passa as áreas
 * vigentes que ela já tem. Nada lançado: Map vazio, sem erro.
 */
export async function caminhoesDasLajes(obraId: string, areas: readonly AreaDeLajeFvs[]): Promise<Map<string, RastreioDaLaje>> {
  if (!areas.length) return new Map()
  const [concretagens, caminhoes, caminhao_areas, exemplos] = await Promise.all([
    sincronizador.linhas('concretagens', obraId),
    sincronizador.linhas('caminhoes', obraId),
    sincronizador.linhas('caminhao_areas', obraId),
    idsDasConcretagensDeExemplo(obraId),
  ])
  return montarRastreioDasLajes({ concretagens, caminhoes, caminhao_areas, exemplos }, areas)
}

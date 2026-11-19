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
import { estadoDasPecas, LIMITE_INTEIRA } from './pecas'
import { vigentes, type Corrigivel } from './vigentes'

/** Tipos de peça com rastreio por enquanto: pilar e viga. Laje fica para depois (decisão de 18/11). */
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

/** Puro: caminhões de cada peça (pilar e viga), em ordem de data e depois de sequência. */
export function montarRastreio(l: LinhasDoRastreio): Map<string, CaminhaoDaPeca[]> {
  // concretagens vigentes, sem as de exemplo
  const concretagens = new Map<string, Corrigivel>()
  for (const c of vigentes(l.concretagens as Corrigivel[])) if (!l.exemplos.has(c.raiz)) concretagens.set(c.raiz, c)

  // caminhões vigentes de concretagem vigente (caminhão de concretagem cancelada não conta)
  const caminhoes = vigentes(l.caminhoes as Corrigivel[]).filter((c) => concretagens.has(String(c.concretagem_id)))

  const tipoDe = new Map(l.elementos.map((e) => [e.id, String(e.tipo)]))
  const registrosDe = new Map<string, Linha[]>()
  for (const r of l.caminhao_elementos) {
    const k = String(r.caminhao_id)
    const lista = registrosDe.get(k)
    if (lista) lista.push(r)
    else registrosDe.set(k, [r])
  }

  const saida = new Map<string, CaminhaoDaPeca[]>()
  for (const cam of caminhoes) {
    const conc = concretagens.get(String(cam.concretagem_id))!
    for (const [elemento, estado] of estadoDasPecas(registrosDe.get(cam.raiz) ?? [])) {
      if (!estado.incluido) continue
      if (!TIPOS_RASTREIO.includes(tipoDe.get(elemento) ?? '')) continue
      const item: CaminhaoDaPeca = {
        caminhao_raiz: cam.raiz,
        concretagem_raiz: conc.raiz as string,
        sequencia: Number(cam.sequencia),
        nota_fiscal: textoOuNulo(cam.nota_fiscal),
        data: String(conc.data),
        // a correção à mão vale a peça inteira (a pessoa confirmou), mesmo que o desenho tenha pego só parte
        fracao: estado.origem === 'manual' ? null : estado.fracao,
        parcial: estado.origem === 'manual' ? false : estado.parcial,
      }
      const lista = saida.get(elemento)
      if (lista) lista.push(item)
      else saida.set(elemento, [item])
    }
  }
  for (const lista of saida.values()) {
    lista.sort((a, b) => (a.data === b.data ? a.sequencia - b.sequencia : a.data < b.data ? -1 : 1))
  }
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

/** Puro: a situação do item de rastreio pelos caminhões da peça. */
export function situacaoDoRastreio(caminhoes: readonly CaminhaoDaPeca[]): SituacaoDoRastreio {
  if (caminhoes.length === 0) return { resultado: null, parcial: false }
  // incluída à mão (fração null) conta como inteira
  const soma = caminhoes.reduce((s, c) => s + (c.fracao === null ? 1 : c.fracao), 0)
  return { resultado: 'C', parcial: soma < LIMITE_INTEIRA }
}

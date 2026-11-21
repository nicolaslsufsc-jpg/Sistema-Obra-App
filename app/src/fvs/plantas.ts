// Plantas para outros módulos. O Concreto registra `fontePlantasFvs` com
// registrarFonteDePlantas (app/src/concreto/planta.ts): o formato abaixo é o PlantaPavimento dele.
// Pixels da folha, x para a direita, y para baixo; `id` da peça = elementos.id.
// Um pavimento tem uma planta por trecho. Só vem o que já está no aparelho (funciona sem internet).

import { sincronizador } from '../nucleo/servicos'
import type { Linha } from '../nucleo/banco_local'
import { abrirPacote, pacotesNoAparelho, type PacoteAberto } from './pacote'
import { FORA_DA_ESTRUTURA } from './situacao'
import { cadeiaDeRevisoes, pacoteDaPlanta } from './revisoes'

export interface ElementoDesenho {
  id: string
  tipo: 'P' | 'V' | 'L'
  nome: string
  rotulo: readonly [number, number, number, number]
  polys: ReadonlyArray<ReadonlyArray<readonly [number, number]>>
}

export interface PlantaDesenho {
  /** Estável entre revisões: é o trecho (setores.id), não a linha de "plantas". */
  id: string
  revisao: string
  /** "<id>@<revisão>": o que foi desenhado em cima guarda isto. */
  ref: string
  trecho: string
  titulo: string
  largura: number
  altura: number
  fundo: {
    tile: number
    niveis: readonly number[]
    url: (z: number, x: number, y: number) => string | undefined
  }
  elementos: readonly ElementoDesenho[]
}

/**
 * Imagem transparente de 1 pixel, para o pedaço em branco da folha, que não vem no pacote. Sem endereço
 * nenhum, o navegador desenha uma borda em volta da imagem: um retângulo cinza no meio da planta.
 */
const TILE_VAZIO = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

/** Converte um pacote aberto para o formato de desenho. `idEstavel` = setor (trecho) da planta. */
export function plantaDeDesenho(pacote: PacoteAberto, idEstavel: string, titulo: string): PlantaDesenho {
  const m = pacote.manifest
  return {
    id: idEstavel,
    revisao: m.revisao,
    ref: `${idEstavel}@${m.revisao}`,
    trecho: m.trecho,
    titulo,
    largura: m.largura,
    altura: m.altura,
    fundo: { tile: m.tile, niveis: m.niveis, url: (z, x, y) => pacote.tile(z, x, y) ?? TILE_VAZIO },
    // só peças de estrutura: ambiente (planta de arquitetura), furo de viga, esquadria e parede não interessam a quem desenha concretagem
    elementos: Object.entries(m.elementos).flatMap(([id, e]) => (e.tipo === 'A' || e.tipo === 'F' || e.tipo === 'E' || e.tipo === 'M' ? [] : [{ id, tipo: e.tipo, nome: e.nome, rotulo: e.rotulo, polys: e.polys }])),
  }
}

/** Planta de forma (tem pilar, viga ou laje). A planta de ambientes da FVS não entra aqui. */
export function ehPlantaDeEstrutura(pacote: PacoteAberto): boolean {
  return Object.values(pacote.manifest.elementos).some((e) => !FORA_DA_ESTRUTURA.has(e.tipo))
}

/** Plantas vigentes de um pavimento (a que nenhuma revisão nova substituiu), uma por trecho. */
export function plantasVigentes(linhas: readonly Linha[], pavimentoId: string): Linha[] {
  const substituidas = new Set(linhas.map((p) => p.substitui_id as string | null).filter(Boolean))
  const porSetor = new Map<string, Linha>()
  for (const p of linhas) {
    if (p.pavimento_id !== pavimentoId || substituidas.has(p.id)) continue
    const k = String(p.setor_id)
    const a = porSetor.get(k)
    if (!a || Date.parse(p.criado_em_dispositivo) > Date.parse(a.criado_em_dispositivo)) porSetor.set(k, p)
  }
  return [...porSetor.values()]
}

// Pacotes abertos ficam guardados: as imagens são cortadas uma vez e usadas por quem pedir de novo.
const abertos = new Map<string, PacoteAberto>()

/**
 * Plantas de um pavimento que já estão no aparelho, em ordem de trecho. Quem baixa é o início
 * do módulo FVS; trecho ainda não baixado simplesmente não vem. Revisão nova ainda não baixada: vem
 * a anterior, que é a que está no aparelho (`revisao` e `ref` dizem qual é).
 */
export async function plantasDoPavimento(obraId: string, pavimentoId: string, nomePavimento: string): Promise<PlantaDesenho[]> {
  const linhas = await sincronizador.linhas('plantas', obraId)
  const vigentes = plantasVigentes(linhas, pavimentoId)
  const { anterioresDe } = cadeiaDeRevisoes(linhas)
  const noAparelho = await pacotesNoAparelho()
  const saida: PlantaDesenho[] = []
  for (const p of vigentes) {
    const pacoteId = pacoteDaPlanta(p.id, anterioresDe.get(p.id), noAparelho)
    if (!pacoteId) continue
    let a = abertos.get(pacoteId)
    if (!a) {
      const novo = await abrirPacote(pacoteId)
      if (!novo) continue
      abertos.set(pacoteId, novo)
      a = novo
    }
    if (!ehPlantaDeEstrutura(a)) continue
    saida.push(plantaDeDesenho(a, String(p.setor_id), `${nomePavimento} · ${a.manifest.trecho}`))
  }
  const ordem = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })
  return saida.sort((x, y) => ordem.compare(x.trecho, y.trecho))
}

/** No formato de `registrarFonteDePlantas` do Concreto. */
export function fontePlantasFvs(p: { obraId: string; pavimento: { id: string; nome: string } }): Promise<PlantaDesenho[]> {
  return plantasDoPavimento(p.obraId, p.pavimento.id, p.pavimento.nome)
}

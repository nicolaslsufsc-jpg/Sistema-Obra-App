// Peças que receberam cada caminhão: do desenho (fração dentro das áreas) e das correções
// manuais (toque na peça). Regras em docs/modulos/3_concreto.md.

import type { Linha } from '../nucleo/banco_local'
import { amostrasDaPeca, areaDe, caixaDe, fracaoDentro, pontoNoPoligono, type AreaPreparada, type Caixa, type Ponto } from './geometria'
import type { ElementoPlanta } from './planta'
import { ultimoPorChave } from './vigentes'

/** A partir desta fração a peça entra no caminhão (abaixo disso é traço de raspão). */
export const LIMITE_INCLUIR = 0.1
/** A partir desta fração a peça está inteira; entre os dois limites é parcial. */
export const LIMITE_INTEIRA = 0.9
/** Variação de fração que vale um registro novo (evita registro a cada traço). */
const VARIACAO_MINIMA = 0.05

export interface EstadoPeca {
  elemento_id: string
  incluido: boolean
  /** null quando veio só de correção manual */
  fracao: number | null
  origem: 'desenho' | 'manual'
  parcial: boolean
}

interface RegistroPeca extends Linha {
  caminhao_id: string
  elemento_id: string
  origem: 'desenho' | 'manual'
  fracao: number | string | null
  incluido: boolean
}

const numero = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v))

/**
 * Estado de cada peça de UM caminhão. Vale o último registro manual da peça; sem manual,
 * o último do desenho. Só devolve as peças que já tiveram algum registro.
 */
export function estadoDasPecas(registros: readonly Linha[]): Map<string, EstadoPeca> {
  const regs = registros as readonly RegistroPeca[]
  const manual = ultimoPorChave(regs.filter((r) => r.origem === 'manual'), (r) => r.elemento_id)
  const desenho = ultimoPorChave(regs.filter((r) => r.origem === 'desenho'), (r) => r.elemento_id)
  const saida = new Map<string, EstadoPeca>()
  for (const [id, d] of desenho) {
    const f = numero(d.fracao)
    saida.set(id, {
      elemento_id: id,
      incluido: d.incluido,
      fracao: f,
      origem: 'desenho',
      parcial: d.incluido && f !== null && f < LIMITE_INTEIRA,
    })
  }
  for (const [id, m] of manual) {
    const anterior = saida.get(id)
    saida.set(id, {
      elemento_id: id,
      incluido: m.incluido,
      fracao: anterior?.fracao ?? null,
      origem: 'manual',
      parcial: false,
    })
  }
  return saida
}

export interface PecaPreparada {
  id: string
  caixa: Caixa
  amostras: Ponto[]
}

export function prepararPecas(elementos: readonly ElementoPlanta[]): PecaPreparada[] {
  return elementos.map((e) => {
    const polys = e.polys.length
      ? e.polys
      : [[[e.rotulo[0], e.rotulo[1]], [e.rotulo[2], e.rotulo[1]], [e.rotulo[2], e.rotulo[3]], [e.rotulo[0], e.rotulo[3]]] as Ponto[]]
    return { id: e.id, caixa: caixaDe(polys.flat()), amostras: amostrasDaPeca(polys) }
  })
}

/**
 * Peça no ponto tocado (x, y da planta), com folga de `tol` em volta: viga é fina na tela.
 * Vale o contorno e também o nome (rótulo), como na planta da FVS; pilar cortado na emenda
 * só tem rótulo. Com mais de uma peça no alcance, fica a de menor área (a mais específica).
 */
export function pecaNoPonto(elementos: readonly ElementoPlanta[], x: number, y: number, tol = 0): ElementoPlanta | undefined {
  const pontos: Ponto[] = [[x, y], [x - tol, y], [x + tol, y], [x, y - tol], [x, y + tol]]
  let melhor: ElementoPlanta | undefined
  let menor = Infinity
  let noContorno = false
  for (const e of elementos) {
    for (const p of e.polys) {
      if (pontos.some(([a, b]) => pontoNoPoligono(a, b, p))) {
        const area = areaDe(p)
        if (!noContorno || area < menor) {
          menor = area
          melhor = e
          noContorno = true
        }
      }
    }
  }
  if (noContorno) return melhor
  // nenhum contorno no alcance: tenta o nome escrito na planta
  for (const e of elementos) {
    const [x0, y0, x1, y1] = e.rotulo
    if (x >= x0 - tol && x <= x1 + tol && y >= y0 - tol && y <= y1 + tol) {
      const area = (x1 - x0) * (y1 - y0)
      if (area < menor) {
        menor = area
        melhor = e
      }
    }
  }
  return melhor
}

export interface MudancaPeca {
  elemento_id: string
  incluido: boolean
  /** null: laje do trecho que veio com a área (não tem contorno, então não tem fração). */
  fracao: number | null
}

/**
 * Laje do trecho que vem com a caneta das vigas e laje: é um registro de desenho, sem fração,
 * e fica no caminhão enquanto ele tiver área dessa caneta no trecho. Desenhar põe; Desfazer e
 * Apagar áreas tiram. O toque na laje continua valendo mais (é manual).
 * Devolve a mudança a gravar, ou null se o último registro de desenho já está certo.
 */
export function mudancaDaLajeDoDesenho(temArea: boolean, lajeId: string, registrosDoCaminhao: readonly Linha[]): MudancaPeca | null {
  const regs = (registrosDoCaminhao as readonly RegistroPeca[]).filter((r) => r.origem === 'desenho' && r.elemento_id === lajeId)
  const agora = ultimoPorChave(regs, (r) => r.elemento_id).get(lajeId)?.incluido ?? false
  return agora === temArea ? null : { elemento_id: lajeId, incluido: temArea, fracao: null }
}

/**
 * Registros de desenho a gravar depois que as áreas de um caminhão mudaram: compara a
 * fração nova de cada peça com o último registro de desenho dela.
 */
export function mudancasDoDesenho(
  pecas: readonly PecaPreparada[],
  areas: readonly AreaPreparada[],
  registrosDoCaminhao: readonly Linha[],
): MudancaPeca[] {
  return mudancasDoDesenhoPorPlanta([{ pecas, areas }], registrosDoCaminhao)
}

export interface PlantaComAreas {
  /** Peças desta planta (trecho). */
  pecas: readonly PecaPreparada[]
  /** Áreas do caminhão desenhadas NESTA planta (outro trecho tem outras coordenadas). */
  areas: readonly AreaPreparada[]
}

/**
 * Igual a mudancasDoDesenho, com várias plantas (trechos) do pavimento: cada área só
 * conta nas peças da planta dela. Peça que aparece em dois trechos (pilar na emenda)
 * fica com a maior fração. Peça de planta que não está no aparelho não muda.
 */
export function mudancasDoDesenhoPorPlanta(
  plantas: readonly PlantaComAreas[],
  registrosDoCaminhao: readonly Linha[],
): MudancaPeca[] {
  const fracoes = new Map<string, number>()
  for (const { pecas, areas } of plantas) {
    for (const p of pecas) {
      const toca = areas.some((a) => a.caixa.x0 <= p.caixa.x1 && p.caixa.x0 <= a.caixa.x1 && a.caixa.y0 <= p.caixa.y1 && p.caixa.y0 <= a.caixa.y1)
      const f = toca ? Math.round(fracaoDentro(p.amostras, areas) * 1000) / 1000 : 0
      fracoes.set(p.id, Math.max(fracoes.get(p.id) ?? 0, f))
    }
  }
  const regs = registrosDoCaminhao as readonly RegistroPeca[]
  const ultimo = ultimoPorChave(regs.filter((r) => r.origem === 'desenho'), (r) => r.elemento_id)
  const mudancas: MudancaPeca[] = []
  for (const [id, fracao] of fracoes) {
    const incluido = fracao >= LIMITE_INCLUIR
    const antes = ultimo.get(id)
    if (!antes) {
      if (incluido) mudancas.push({ elemento_id: id, incluido, fracao })
      continue
    }
    const fAntes = numero(antes.fracao) ?? 0
    const cruzouInteira = fAntes >= LIMITE_INTEIRA !== fracao >= LIMITE_INTEIRA
    if (antes.incluido !== incluido || (incluido && (Math.abs(fAntes - fracao) >= VARIACAO_MINIMA || cruzouInteira))) {
      mudancas.push({ elemento_id: id, incluido, fracao })
    }
  }
  return mudancas
}

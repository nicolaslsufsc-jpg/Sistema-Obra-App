// Relatório das peças concretadas: por caminhão e por peça. CSV para o Excel em português
// (mesmas regras da exportação de obra: ";", vírgula decimal, apóstrofo antes de = + - @).

import type { EstadoPeca } from './pecas'
import { ROTULO_FICHA } from './exemplo'
import { ORDEM_DO_TIPO, tipoNoCsv } from './tipos_peca'

export interface CaminhaoRelatorio {
  raiz: string
  sequencia: number
  nota_fiscal: string | null
  volume_m3: number | null
}

export interface PecaRelatorio {
  id: string
  nome: string
  tipo: string
}

export interface ItemPeca {
  peca: PecaRelatorio
  fracao: number | null
  parcial: boolean
  origem: 'desenho' | 'manual'
}

export interface LinhaPorCaminhao {
  caminhao: CaminhaoRelatorio
  pecas: ItemPeca[]
}

export interface LinhaPorPeca {
  peca: PecaRelatorio
  caminhoes: Array<{ caminhao: CaminhaoRelatorio; fracao: number | null; parcial: boolean }>
}

const ordemNatural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })
const ORDEM_TIPO = ORDEM_DO_TIPO

function compararPecas(a: PecaRelatorio, b: PecaRelatorio): number {
  return (ORDEM_TIPO[a.tipo] ?? 9) - (ORDEM_TIPO[b.tipo] ?? 9) || ordemNatural.compare(a.nome, b.nome)
}

/** Área de laje da FVS coberta pelo caminhão (dados.ts, `lajesFvsDe`). */
export interface LajeFvsRelatorio {
  area_id: string
  nome: string
  fracao: number
  parcial: boolean
}

/** A laje que o caminhão encheu, pela área "vigas e laje" desenhada na planta. */
export const LAJE_DESENHADA: PecaRelatorio = { id: 'laje-desenhada', nome: 'Laje (área desenhada)', tipo: 'L' }

/**
 * `lajeDesenhada`: raízes dos caminhões com área de "vigas e laje" desenhada (a laje entra como peça).
 * `lajesFvs`: as áreas de laje desenhadas na FVS que cada caminhão cobriu (por raiz do caminhão).
 * Entram como peça do tipo L, de origem "desenho", junto com as peças do caminhão.
 */
export function relatorioPorCaminhao(
  caminhoes: readonly CaminhaoRelatorio[],
  estados: ReadonlyMap<string, ReadonlyMap<string, EstadoPeca>>,
  pecas: ReadonlyMap<string, PecaRelatorio>,
  lajesFvs?: ReadonlyMap<string, readonly LajeFvsRelatorio[]>,
  lajeDesenhada?: ReadonlySet<string>,
): LinhaPorCaminhao[] {
  return [...caminhoes]
    .sort((a, b) => a.sequencia - b.sequencia)
    .map((c) => {
      const itens: ItemPeca[] = []
      for (const e of estados.get(c.raiz)?.values() ?? []) {
        if (!e.incluido) continue
        const peca = pecas.get(e.elemento_id) ?? { id: e.elemento_id, nome: '(peça fora da planta)', tipo: '?' }
        itens.push({ peca, fracao: e.fracao, parcial: e.parcial, origem: e.origem })
      }
      for (const l of lajesFvs?.get(c.raiz) ?? []) {
        itens.push({ peca: { id: l.area_id, nome: l.nome, tipo: 'L' }, fracao: l.fracao, parcial: l.parcial, origem: 'desenho' })
      }
      // laje da área "vigas e laje" desenhada no caminhão (22/11, pedido do Nicolas): a forma não traz o
      // contorno da laje, então a área desenhada é a laje que o caminhão encheu. Só entra quando o
      // caminhão ainda não tem laje (do trecho ou da FVS).
      if (lajeDesenhada?.has(c.raiz) && !itens.some((i) => i.peca.tipo === 'L')) {
        itens.push({ peca: LAJE_DESENHADA, fracao: null, parcial: false, origem: 'desenho' })
      }
      itens.sort((a, b) => compararPecas(a.peca, b.peca))
      return { caminhao: c, pecas: itens }
    })
}

export function relatorioPorPeca(porCaminhao: readonly LinhaPorCaminhao[]): LinhaPorPeca[] {
  const m = new Map<string, LinhaPorPeca>()
  for (const l of porCaminhao) {
    for (const i of l.pecas) {
      const atual = m.get(i.peca.id) ?? { peca: i.peca, caminhoes: [] }
      atual.caminhoes.push({ caminhao: l.caminhao, fracao: i.fracao, parcial: i.parcial })
      m.set(i.peca.id, atual)
    }
  }
  return [...m.values()].sort((a, b) => compararPecas(a.peca, b.peca))
}

function celula(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return String(v).replace('.', ',')
  let t = v
  // tabulação no começo também vira fórmula no Excel (varredura do testador, 08/11; a da FVS já protege)
  if (/^[=+\-@\t]/.test(t)) t = `'${t}`
  if (/[;"\n\r]/.test(t)) t = `"${t.replace(/"/g, '""')}"`
  return t
}

export function percentual(f: number | null): string {
  return f === null ? '' : `${Math.round(f * 100)}%`
}

/** Como a peça entrou no caminhão, em poucas palavras: "toque", "com a área" (laje) ou "85%". */
export function comoEntrou(e: { origem: 'desenho' | 'manual'; fracao: number | null }): string {
  if (e.origem === 'manual') return 'toque'
  return e.fracao === null ? 'com a área' : percentual(e.fracao)
}

/**
 * Uma linha por peça de cada caminhão. Começa com BOM para o Excel abrir em UTF-8. `sistema` = nome do
 * sistema oficial da obra; null tira a coluna da ficha de lá (docs/modulos/integracoes.md).
 */
export function csvPorCaminhao(
  concretagem: { data: string; local_descricao: string; codigo_construpoint: string | null },
  linhas: readonly LinhaPorCaminhao[],
  sistema: string | null = null,
): string {
  const comFicha = <T>(l: T[]): T[] => (sistema ? l : l.filter((_, i) => i !== 2))
  const cab = comFicha(['Data', 'Local', ROTULO_FICHA, 'Caminhão', 'NF', 'Volume (m³)', 'Peça', 'Tipo', 'Dentro da área', 'Parcial', 'Origem'])
  const saida = [cab.join(';')]
  const dataBR = concretagem.data.split('-').reverse().join('/')
  for (const l of linhas) {
    const base = [dataBR, concretagem.local_descricao, concretagem.codigo_construpoint, l.caminhao.sequencia, l.caminhao.nota_fiscal, l.caminhao.volume_m3]
    if (l.pecas.length === 0) {
      saida.push(comFicha([...base, 'sem peça desenhada', '', '', '', '']).map(celula).join(';'))
      continue
    }
    for (const i of l.pecas) {
      saida.push(
        comFicha([...base, i.peca.nome, tipoNoCsv(i.peca.tipo), percentual(i.fracao), i.parcial ? 'sim' : 'não', i.origem === 'manual' ? 'toque' : 'desenho'])
          .map(celula)
          .join(';'),
      )
    }
  }
  return '﻿' + saida.join('\r\n') + '\r\n'
}

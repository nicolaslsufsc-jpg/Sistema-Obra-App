// Plantas de um pavimento para o desenho das áreas concretadas.
//
// Formato igual ao do HTML legado da FVS (pipeline/legado/modelo_app.html): pixels,
// x para a direita, y para baixo; cada peça com o retângulo do rótulo e os polígonos.
// Um pavimento tem várias plantas (uma por trecho, cada prancha de forma tem o próprio
// sistema de coordenadas). As plantas de verdade vêm do pacote de planta da FVS, que entra
// aqui como uma "fonte de plantas" (registrada em telas/ModuloConcreto.tsx). Sem planta de
// verdade, só a obra TESTE tem planta: uma esquemática gerada a partir das peças
// cadastradas em "elementos".
//
// Cada área desenhada guarda em caminhao_areas.planta_ref a planta e a revisão
// ("<id da planta>@<revisão>"). A área só aparece e só conta peças na planta dela.

import type { Ponto } from './geometria'

export type TipoPeca = 'P' | 'V' | 'L'

export interface ElementoPlanta {
  /** id da peça na tabela elementos */
  id: string
  tipo: TipoPeca
  nome: string
  /** [x0, y0, x1, y1] onde fica o nome */
  rotulo: readonly [number, number, number, number]
  polys: readonly (readonly Ponto[])[]
}

export interface FundoTiles {
  tile: number
  niveis: readonly number[]
  url: (z: number, x: number, y: number) => string | undefined
}

export interface PlantaPavimento {
  /** Planta (prancha) estável entre revisões. */
  id: string
  revisao: string
  /** "<id>@<revisão>": vai em caminhao_areas.planta_ref. */
  ref: string
  /** Nome curto para escolher na tela (ex.: "Trecho 2"). */
  trecho: string
  titulo: string
  largura: number
  altura: number
  fundo?: FundoTiles
  elementos: readonly ElementoPlanta[]
  /** Planta esquemática de teste (não é a obra). */
  teste?: boolean
}

export interface PecaCadastrada {
  id: string
  tipo: string
  nome: string
}

const ordemNatural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

export function refDaPlanta(id: string, revisao: string): string {
  return `${id}@${revisao}`
}

/** id da planta de um planta_ref (refs antigas, sem "@", são o próprio id). */
export function idDaRef(ref: string): string {
  const i = ref.lastIndexOf('@')
  return i > 0 ? ref.slice(0, i) : ref
}

export function revisaoDaRef(ref: string): string {
  const i = ref.lastIndexOf('@')
  return i > 0 ? ref.slice(i + 1) : ''
}

// ---------------------------------------------------------------------
// Fontes de plantas
// ---------------------------------------------------------------------

export interface PedidoPlantas {
  obraId: string
  obraCodigo: string
  pavimento: { id: string; nome: string }
  pecas: readonly PecaCadastrada[]
}

export type FontePlantas = (p: PedidoPlantas) => Promise<PlantaPavimento[]> | PlantaPavimento[]

const fonteDeTeste: FontePlantas = ({ obraCodigo, pavimento, pecas }) =>
  obraCodigo === 'TESTE' && pecas.length > 0
    ? [plantaEsquematica(`teste-esquematica:${pavimento.id}`, `${pavimento.nome} (planta de teste)`, pecas)]
    : []

const fontes: FontePlantas[] = []

/** Acrescenta uma fonte de plantas (ex.: o pacote da FVS). Devolve a função que tira a fonte. */
export function registrarFonteDePlantas(f: FontePlantas): () => void {
  fontes.push(f)
  return () => {
    const i = fontes.indexOf(f)
    if (i >= 0) fontes.splice(i, 1)
  }
}

/**
 * Plantas do pavimento, em ordem de trecho. Se alguma fonte de verdade tiver planta,
 * a planta de teste não aparece. Fonte com erro (pacote corrompido, por exemplo) é pulada.
 */
export async function carregarPlantas(p: PedidoPlantas): Promise<PlantaPavimento[]> {
  const reais: PlantaPavimento[] = []
  for (const f of fontes) {
    try {
      reais.push(...(await f(p)))
    } catch (e) {
      console.warn('Concreto: fonte de plantas falhou', e)
    }
  }
  const lista = reais.length > 0 ? reais : await fonteDeTeste(p)
  return [...lista].sort((a, b) => ordemNatural.compare(a.trecho, b.trecho) || ordemNatural.compare(a.id, b.id))
}

/**
 * Planta esquemática (só para teste): pilares numa grade, vigas entre pilares vizinhos,
 * lajes nos vãos. Não representa a obra; serve para testar o desenho com a caneta.
 */
export function plantaEsquematica(
  id: string,
  titulo: string,
  pecas: readonly PecaCadastrada[],
  trecho = 'Planta de teste',
  revisao = '0',
): PlantaPavimento {
  const ordenar = (t: string) => pecas.filter((p) => p.tipo === t).sort((a, b) => ordemNatural.compare(a.nome, b.nome))
  const pilares = ordenar('P')
  const vigas = ordenar('V')
  const lajes = ordenar('L')

  const VAO = 320
  const LADO = 44
  const MARGEM = 120
  const colunas = Math.max(2, Math.ceil(Math.sqrt(Math.max(pilares.length, 4) * 1.6)))
  const linhas = Math.max(2, Math.ceil(Math.max(pilares.length, 4) / colunas))
  const centro = (c: number, l: number): Ponto => [MARGEM + c * VAO, MARGEM + l * VAO]
  const elementos: ElementoPlanta[] = []

  pilares.forEach((p, i) => {
    const [cx, cy] = centro(i % colunas, Math.floor(i / colunas))
    const meio = LADO / 2
    elementos.push({
      id: p.id,
      tipo: 'P',
      nome: p.nome,
      rotulo: [cx + meio + 4, cy - meio - 30, cx + meio + 90, cy - meio - 4],
      polys: [[[cx - meio, cy - meio], [cx + meio, cy - meio], [cx + meio, cy + meio], [cx - meio, cy + meio]]],
    })
  })

  // vãos horizontais e depois verticais da grade
  const vaos: Array<[Ponto, Ponto, 'h' | 'v']> = []
  for (let l = 0; l < linhas; l++) for (let c = 0; c + 1 < colunas; c++) vaos.push([centro(c, l), centro(c + 1, l), 'h'])
  for (let c = 0; c < colunas; c++) for (let l = 0; l + 1 < linhas; l++) vaos.push([centro(c, l), centro(c, l + 1), 'v'])
  const LARG_VIGA = 20
  vigas.forEach((v, i) => {
    const extra = Math.floor(i / vaos.length) // mais vigas que vãos: desloca para baixo da planta
    const [a, b, sentido] = vaos[i % vaos.length]
    const dy = extra * (linhas * VAO)
    const m = LARG_VIGA / 2
    const poli: Ponto[] =
      sentido === 'h'
        ? [[a[0] + LADO / 2, a[1] - m + dy], [b[0] - LADO / 2, b[1] - m + dy], [b[0] - LADO / 2, b[1] + m + dy], [a[0] + LADO / 2, a[1] + m + dy]]
        : [[a[0] - m, a[1] + LADO / 2 + dy], [a[0] + m, a[1] + LADO / 2 + dy], [b[0] + m, b[1] - LADO / 2 + dy], [b[0] - m, b[1] - LADO / 2 + dy]]
    const mx = (a[0] + b[0]) / 2
    const my = (a[1] + b[1]) / 2 + dy
    elementos.push({
      id: v.id,
      tipo: 'V',
      nome: v.nome,
      rotulo: sentido === 'h' ? [mx - 40, my - 40, mx + 40, my - 14] : [mx + 14, my - 13, mx + 94, my + 13],
      polys: [poli],
    })
  })

  const celulas: Ponto[] = []
  for (let l = 0; l + 1 < linhas; l++) for (let c = 0; c + 1 < colunas; c++) celulas.push(centro(c, l))
  lajes.forEach((laje, i) => {
    if (i >= celulas.length) return
    const [x, y] = celulas[i]
    const f = LADO / 2 + LARG_VIGA
    elementos.push({
      id: laje.id,
      tipo: 'L',
      nome: laje.nome,
      rotulo: [x + VAO / 2 - 40, y + VAO / 2 - 13, x + VAO / 2 + 40, y + VAO / 2 + 13],
      polys: [[[x + f, y + f], [x + VAO - f, y + f], [x + VAO - f, y + VAO - f], [x + f, y + VAO - f]]],
    })
  })

  const extras = Math.max(0, Math.ceil(vigas.length / Math.max(1, vaos.length)) - 1)
  return {
    id,
    revisao,
    ref: refDaPlanta(id, revisao),
    trecho,
    titulo,
    teste: true,
    largura: MARGEM * 2 + (colunas - 1) * VAO,
    altura: MARGEM * 2 + (linhas - 1) * VAO + extras * linhas * VAO,
    elementos,
  }
}

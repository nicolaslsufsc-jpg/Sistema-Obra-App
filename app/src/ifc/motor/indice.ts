// Índice de busca: categoria e valores de filtro de cada elemento, de todos os modelos abertos.
// A busca roda em cima disto, sem tocar na geometria.
import { CATEGORIAS, INDICE_CATEGORIA, categoriaDe, semAcento } from './categorias'
import type { ModeloIfc } from './tipos'

export type Faceta = 'pavimento' | 'categoria' | 'camada' | 'material' | 'tipo' | 'classe' | 'modelo'

export const FACETAS: ReadonlyArray<{ id: Faceta; nome: string }> = [
  { id: 'pavimento', nome: 'Pavimento' },
  { id: 'categoria', nome: 'Categoria' },
  { id: 'camada', nome: 'Camada' },
  { id: 'material', nome: 'Material' },
  { id: 'tipo', nome: 'Tipo' },
  { id: 'classe', nome: 'Classe IFC' },
  { id: 'modelo', nome: 'Modelo' },
]

export const SEM_VALOR = '(não informado)'

/** Lista global de valores de cada faceta: "TIPO 1" do ARQ e do EST é o mesmo valor. */
export type Dicionarios = Record<Faceta, { lista: string[]; mapa: Map<string, number> }>

export function novosDicionarios(): Dicionarios {
  const d = {} as Dicionarios
  for (const f of FACETAS) d[f.id] = { lista: [], mapa: new Map() }
  return d
}

function pegar(d: Dicionarios[Faceta], valor: string): number {
  let i = d.mapa.get(valor)
  if (i === undefined) {
    i = d.lista.length
    d.lista.push(valor)
    d.mapa.set(valor, i)
  }
  return i
}

export interface IndiceModelo {
  modelo: ModeloIfc
  /** Índice em CATEGORIAS, por elemento. */
  categoria: Uint8Array
  /** Por faceta, id do valor de cada elemento. */
  valores: Record<Faceta, Int32Array>
  /** Texto de busca de cada elemento (sem acento, minúsculo). Montado na primeira busca. */
  texto: string[] | null
  /** Texto de busca de cada conjunto de propriedades. */
  textoPsets: string[] | null
}

/** "IfcWallStandardCase" vira "Wall Standard Case": menos ruído na lista. */
export function nomeDaClasse(c: string): string {
  return c
    .replace(/^ifc/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
}

export function indexarModelo(modelo: ModeloIfc, dic: Dicionarios): IndiceModelo {
  const { meta, tabela } = modelo
  const n = tabela.expressIds.length
  const categoria = new Uint8Array(n)
  const valores = {} as Record<Faceta, Int32Array>
  for (const f of FACETAS) valores[f.id] = new Int32Array(n)
  const idModelo = pegar(dic.modelo, meta.nome)
  const mapaLocal = (lista: readonly string[], d: Dicionarios[Faceta]) => lista.map((v) => pegar(d, v))
  const pav = mapaLocal(
    meta.pavimentos.map((p) => p.nome),
    dic.pavimento,
  )
  const cam = mapaLocal(meta.camadas, dic.camada)
  const mat = mapaLocal(meta.materiais, dic.material)
  const tip = mapaLocal(meta.tipos, dic.tipo)
  const cla = mapaLocal(meta.classes.map(nomeDaClasse), dic.classe)
  const catIds = CATEGORIAS.map((c) => pegar(dic.categoria, c.nome))

  // Muitas peças repetem a mesma combinação de classe, camada, nome, pai, tipo e material.
  const cache = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    const c = tabela.classe[i]
    const ca = tabela.camada[i]
    const t = tabela.tipo[i]
    const ma = tabela.material[i]
    const chave = `${c}|${ca}|${t}|${ma}|${meta.nomes[i]}|${meta.pais[i]}`
    let idc = cache.get(chave)
    if (idc === undefined) {
      idc =
        INDICE_CATEGORIA[
          categoriaDe({
            classe: c >= 0 ? meta.classes[c] : '',
            camada: ca >= 0 ? meta.camadas[ca] : '',
            nome: meta.nomes[i],
            pai: meta.pais[i],
            tipo: t >= 0 ? meta.tipos[t] : '',
            material: ma >= 0 ? meta.materiais[ma] : '',
          })
        ]
      cache.set(chave, idc)
    }
    categoria[i] = idc
    valores.categoria[i] = catIds[idc]
    valores.modelo[i] = idModelo
    const p = tabela.pavimento[i]
    valores.pavimento[i] = p >= 0 ? pav[p] : pegar(dic.pavimento, SEM_VALOR)
    valores.camada[i] = ca >= 0 ? cam[ca] : pegar(dic.camada, SEM_VALOR)
    valores.material[i] = ma >= 0 ? mat[ma] : pegar(dic.material, SEM_VALOR)
    valores.tipo[i] = t >= 0 ? tip[t] : pegar(dic.tipo, SEM_VALOR)
    valores.classe[i] = c >= 0 ? cla[c] : pegar(dic.classe, SEM_VALOR)
  }
  return { modelo, categoria, valores, texto: null, textoPsets: null }
}

function montarTextos(ind: IndiceModelo): string[] {
  if (ind.texto) return ind.texto
  const { meta, tabela } = ind.modelo
  const n = tabela.expressIds.length
  const t: string[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const partes = [
      meta.nomes[i],
      meta.pais[i],
      meta.tags[i],
      meta.guids[i],
      tabela.tipo[i] >= 0 ? meta.tipos[tabela.tipo[i]] : '',
      tabela.material[i] >= 0 ? meta.materiais[tabela.material[i]] : '',
      tabela.camada[i] >= 0 ? meta.camadas[tabela.camada[i]] : '',
      tabela.classe[i] >= 0 ? meta.classes[tabela.classe[i]] : '',
      tabela.pavimento[i] >= 0 ? meta.pavimentos[tabela.pavimento[i]].nome : '',
      CATEGORIAS[ind.categoria[i]].nome,
      String(tabela.expressIds[i]),
    ]
    t[i] = semAcento(partes.join(' '))
  }
  ind.texto = t
  return t
}

function montarTextosPsets(ind: IndiceModelo): string[] {
  if (ind.textoPsets) return ind.textoPsets
  ind.textoPsets = ind.modelo.meta.psets.map((p) => semAcento(p.props.map(([k, v]) => `${k} ${v}`).join(' ')))
  return ind.textoPsets
}

export interface Filtro {
  /** Palavras separadas por espaço: o elemento tem que ter todas. */
  texto: string
  /** Por faceta, os valores marcados. Faceta sem nada marcado não filtra. */
  marcados: Partial<Record<Faceta, Set<string>>>
}

export function filtroVazio(): Filtro {
  return { texto: '', marcados: {} }
}

export function filtroAtivo(f: Filtro): boolean {
  return f.texto.trim().length > 0 || Object.values(f.marcados).some((s) => s && s.size > 0)
}

export interface ResultadoBusca {
  total: number
  /** Por modelo, 1 para os elementos que passam no filtro. */
  passa: Uint8Array[]
  /** Quantos elementos cada valor teria, se fosse marcado (com os outros filtros aplicados). */
  contagens: Record<Faceta, Map<string, number>>
}

/**
 * Aplica o filtro a todos os modelos.
 * A contagem de cada faceta ignora a própria faceta: marcar "3º pavimento" não zera os outros
 * pavimentos da lista, então dá para marcar mais de um.
 */
export function buscar(indices: readonly IndiceModelo[], dic: Dicionarios, filtro: Filtro): ResultadoBusca {
  const termos = semAcento(filtro.texto).split(/\s+/).filter(Boolean)
  const facetas = FACETAS.map((f) => f.id)

  // Faceta marcada → tabela (id do valor → está marcado)
  const ativas: Array<{ faceta: Faceta; ok: Uint8Array }> = []
  for (const f of facetas) {
    const s = filtro.marcados[f]
    if (!s || s.size === 0) continue
    const ok = new Uint8Array(dic[f].lista.length)
    for (const v of s) {
      const i = dic[f].mapa.get(v)
      if (i !== undefined) ok[i] = 1
    }
    ativas.push({ faceta: f, ok })
  }

  const contadores = {} as Record<Faceta, Uint32Array>
  for (const f of facetas) contadores[f] = new Uint32Array(dic[f].lista.length)
  const passa: Uint8Array[] = []
  let total = 0

  for (const ind of indices) {
    const n = ind.modelo.tabela.expressIds.length
    const saida = new Uint8Array(n)
    passa.push(saida)

    let textos: string[] | null = null
    let casaPset: Uint8Array[] | null = null
    if (termos.length) {
      textos = montarTextos(ind)
      const tp = montarTextosPsets(ind)
      casaPset = termos.map((t) => Uint8Array.from(tp, (s) => (s.includes(t) ? 1 : 0)))
    }
    const { psetsInicio, psetsLista } = ind.modelo.tabela

    for (let i = 0; i < n; i++) {
      if (textos && casaPset) {
        const s = textos[i]
        let todos = true
        for (let k = 0; k < termos.length && todos; k++) {
          if (s.includes(termos[k])) continue
          let achou = false
          const casa = casaPset[k]
          for (let p = psetsInicio[i]; p < psetsInicio[i + 1]; p++) {
            if (casa[psetsLista[p]]) {
              achou = true
              break
            }
          }
          todos = achou
        }
        if (!todos) continue
      }

      let falhas = 0
      let unica: Faceta | null = null
      for (let a = 0; a < ativas.length; a++) {
        const t = ativas[a]
        if (!t.ok[ind.valores[t.faceta][i]]) {
          falhas++
          unica = t.faceta
          if (falhas > 1) break
        }
      }
      if (falhas > 1) continue
      if (falhas === 1) {
        contadores[unica!][ind.valores[unica!][i]]++
        continue
      }
      saida[i] = 1
      total++
      for (let f = 0; f < facetas.length; f++) {
        const nomeF = facetas[f]
        contadores[nomeF][ind.valores[nomeF][i]]++
      }
    }
  }

  const contagens = {} as Record<Faceta, Map<string, number>>
  for (const f of facetas) {
    const m = new Map<string, number>()
    const c = contadores[f]
    for (let i = 0; i < c.length; i++) if (c[i] > 0) m.set(dic[f].lista[i], c[i])
    contagens[f] = m
  }
  return { total, passa, contagens }
}

/** Título do elemento na lista: o nome do IFC, ou o que houver de mais útil se ele não tiver nome. */
export function tituloDoElemento(ind: IndiceModelo, i: number): string {
  const { meta, tabela } = ind.modelo
  return meta.nomes[i] || (tabela.tipo[i] >= 0 ? meta.tipos[tabela.tipo[i]] : '') || `${CATEGORIAS[ind.categoria[i]].nome} ${tabela.expressIds[i]}`
}

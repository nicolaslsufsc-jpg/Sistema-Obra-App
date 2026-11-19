// Lê um IFC aberto no web-ifc e devolve o ModeloIfc. Sem tela e sem thread aqui: quem chama é o
// leitor.worker.ts no navegador e os testes no Node.
import {
  IFCBUILDINGSTOREY,
  IFCELEMENTQUANTITY,
  IFCPRESENTATIONLAYERASSIGNMENT,
  IFCPROJECT,
  IFCPROPERTYSET,
  IFCRELAGGREGATES,
  IFCRELASSOCIATESMATERIAL,
  IFCRELCONTAINEDINSPATIALSTRUCTURE,
  IFCRELDEFINESBYPROPERTIES,
  IFCRELDEFINESBYTYPE,
  IFCRELNESTS,
  IFCSPACE,
  IFCOPENINGELEMENT,
  type IfcAPI,
} from 'web-ifc'
import type { BlocoGeometria, Caixa, ConjuntoPropriedades, MetaModelo, ModeloIfc, Pavimento, TabelaElementos, Vec3 } from './tipos'
import { CaixaAcumulada, detectarArestas } from './geometria'

export type AoProgresso = (fase: string, fracao: number) => void

/** Tamanho alvo de cada bloco. Blocos menores andam melhor no celular e permitem pular o que está fora da tela. */
const VERTICES_POR_BLOCO = 400_000

class BlocoEmObra {
  posicoes: Float32Array
  normais: Int8Array
  cores: Uint8Array
  elementos: Float32Array
  indices: Uint32Array
  arestas: Uint32Array
  nV = 0
  nI = 0
  nA = 0
  caixa = new CaixaAcumulada()

  constructor(
    readonly pavimento: number,
    capV: number,
    capI: number,
  ) {
    this.posicoes = new Float32Array(capV * 3)
    this.normais = new Int8Array(capV * 4)
    this.cores = new Uint8Array(capV * 4)
    this.elementos = new Float32Array(capV)
    this.indices = new Uint32Array(capI)
    this.arestas = new Uint32Array(capI)
  }

  cabe(v: number, i: number): boolean {
    return this.nV + v <= this.elementos.length && this.nI + i <= this.indices.length && this.nA + i * 2 <= this.arestas.length
  }

  fechar(): BlocoGeometria {
    return {
      pavimento: this.pavimento,
      posicoes: this.posicoes.slice(0, this.nV * 3),
      normais: this.normais.slice(0, this.nV * 4),
      cores: this.cores.slice(0, this.nV * 4),
      elementos: this.elementos.slice(0, this.nV),
      indices: this.indices.slice(0, this.nI),
      arestas: this.arestas.slice(0, this.nA),
      caixa: this.caixa.valor(),
    }
  }
}

function valor(campo: unknown): string {
  if (campo === null || campo === undefined) return ''
  if (typeof campo === 'object' && 'value' in (campo as object)) return valor((campo as { value: unknown }).value)
  return String(campo)
}

/** Número sem ruído de ponto flutuante e com vírgula, como se escreve no Brasil. */
function textoDoValor(campo: unknown): string {
  if (campo === null || campo === undefined) return ''
  if (typeof campo === 'object' && 'value' in (campo as object)) return textoDoValor((campo as { value: unknown }).value)
  if (typeof campo === 'number') return String(Number(campo.toFixed(4))).replace('.', ',')
  if (typeof campo === 'boolean') return campo ? 'Sim' : 'Não'
  const t = String(campo)
  if (t === 'T') return 'Sim'
  if (t === 'F') return 'Não'
  return t
}

function lista(campo: unknown): Array<{ value: number }> {
  if (!campo) return []
  return (Array.isArray(campo) ? campo : [campo]) as Array<{ value: number }>
}

function ids(api: IfcAPI, modelo: number, tipo: number): number[] {
  const v = api.GetLineIDsWithType(modelo, tipo, true)
  const r: number[] = new Array(v.size())
  for (let i = 0; i < r.length; i++) r[i] = v.get(i)
  return r
}

class Dicionario {
  readonly itens: string[] = []
  private readonly mapa = new Map<string, number>()
  indice(t: string): number {
    const limpo = t.trim()
    if (!limpo) return -1
    let i = this.mapa.get(limpo)
    if (i === undefined) {
      i = this.itens.length
      this.itens.push(limpo)
      this.mapa.set(limpo, i)
    }
    return i
  }
}

/** Fator para converter a unidade de comprimento do arquivo em metros. */
function fatorMetros(api: IfcAPI, modelo: number): number {
  try {
    const projetos = ids(api, modelo, IFCPROJECT)
    if (!projetos.length) return 1
    const projeto = api.GetLine(modelo, projetos[0], true)
    for (const u of lista(projeto.UnitsInContext?.Units) as unknown as Array<Record<string, unknown>>) {
      if (valor(u.UnitType) !== 'LENGTHUNIT') continue
      const prefixo = valor(u.Prefix)
      if (u.ConversionFactor) {
        const cf = u.ConversionFactor as { ValueComponent?: unknown }
        const n = Number(valor(cf.ValueComponent))
        return Number.isFinite(n) && n > 0 ? n : 1
      }
      const tabela: Record<string, number> = { MILLI: 0.001, CENTI: 0.01, DECI: 0.1, DECA: 10, HECTO: 100, KILO: 1000 }
      return tabela[prefixo] ?? 1
    }
  } catch {
    // arquivo sem unidade declarada: fica em metros
  }
  return 1
}

/** Nome de um material, qualquer que seja o jeito que o IFC guardou. */
function nomeDoMaterial(api: IfcAPI, modelo: number, id: number, prof = 0): string {
  if (prof > 5) return ''
  let l: Record<string, unknown>
  try {
    l = api.GetLine(modelo, id)
  } catch {
    return ''
  }
  const direto = valor(l.Name) || valor(l.LayerSetName)
  const filhos: Array<{ value: number }> = []
  if (l.ForLayerSet) filhos.push(l.ForLayerSet as { value: number })
  if (l.ForProfileSet) filhos.push(l.ForProfileSet as { value: number })
  if (l.Material) filhos.push(l.Material as { value: number })
  for (const k of ['MaterialLayers', 'Materials', 'MaterialConstituents', 'MaterialProfiles']) filhos.push(...lista(l[k]))
  if (direto && !('MaterialLayers' in l)) return direto
  const nomes = new Set<string>()
  for (const f of filhos) {
    const n = nomeDoMaterial(api, modelo, f.value, prof + 1)
    if (n) nomes.add(n)
  }
  return [...nomes].join(' + ') || direto
}

function lerPset(api: IfcAPI, modelo: number, id: number, tipoLinha: number): ConjuntoPropriedades | null {
  let l: Record<string, unknown>
  try {
    l = api.GetLine(modelo, id)
  } catch {
    return null
  }
  const props: Array<[string, string]> = []
  if (tipoLinha === IFCPROPERTYSET) {
    for (const h of lista(l.HasProperties)) {
      try {
        const p = api.GetLine(modelo, h.value) as Record<string, unknown>
        const v = textoDoValor(p.NominalValue)
        if (v) props.push([valor(p.Name), v])
      } catch {
        // propriedade quebrada no arquivo: segue sem ela
      }
    }
  } else if (tipoLinha === IFCELEMENTQUANTITY) {
    for (const h of lista(l.Quantities)) {
      try {
        const q = api.GetLine(modelo, h.value) as Record<string, unknown>
        const v = q.LengthValue ?? q.AreaValue ?? q.VolumeValue ?? q.CountValue ?? q.WeightValue ?? q.TimeValue
        const t = textoDoValor(v)
        if (t) props.push([valor(q.Name), t])
      } catch {
        // idem
      }
    }
  } else {
    return null
  }
  if (!props.length) return null
  return { nome: valor(l.Name) || 'Propriedades', props }
}

export interface EntradaLeitura {
  api: IfcAPI
  modeloId: number
  nome: string
  tamanho: number
  id: string
  aoProgresso?: AoProgresso
}

export function lerModelo({ api, modeloId: m, nome, tamanho, id, aoProgresso }: EntradaLeitura): ModeloIfc {
  const progresso = aoProgresso ?? (() => {})
  progresso('Lendo a estrutura do arquivo', 0)
  const fator = fatorMetros(api, m)

  // --- Pavimentos, em ordem de altura
  const pavLinhas = ids(api, m, IFCBUILDINGSTOREY).map((pid) => {
    const l = api.GetLine(m, pid) as Record<string, unknown>
    const elev = Number(valor(l.Elevation))
    return {
      pid,
      nome: valor(l.Name) || valor(l.LongName) || `Pavimento ${pid}`,
      elevacao: valor(l.Elevation) !== '' && Number.isFinite(elev) ? Number((elev * fator).toFixed(4)) : null,
    }
  })
  pavLinhas.sort((a, b) => (a.elevacao ?? 0) - (b.elevacao ?? 0))
  const pavimentos: Pavimento[] = pavLinhas.map((p) => ({ nome: p.nome.trim(), elevacao: p.elevacao }))
  const pavDoId = new Map(pavLinhas.map((p, i) => [p.pid, i]))

  const pavDoElemento = new Map<number, number>()
  // Móvel dentro de um ambiente (IfcSpace) não aponta para o pavimento: aponta para o ambiente,
  // e o ambiente é que está no pavimento. Serve só para achar o pavimento, não é "pai" para mostrar.
  const espacoDe = new Map<number, number>()
  for (const r of ids(api, m, IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
    const l = api.GetLine(m, r) as Record<string, unknown>
    const estrutura = (l.RelatingStructure as { value: number })?.value
    const p = pavDoId.get(estrutura)
    for (const e of lista(l.RelatedElements)) {
      if (p !== undefined) pavDoElemento.set(e.value, p)
      else if (estrutura) espacoDe.set(e.value, estrutura)
    }
  }

  // --- Quem é parte de quem (a parede que tem camadas de reboco, por exemplo)
  const paiDe = new Map<number, number>()
  for (const tipoRel of [IFCRELAGGREGATES, IFCRELNESTS]) {
    for (const r of ids(api, m, tipoRel)) {
      const l = api.GetLine(m, r) as Record<string, unknown>
      const pai = (l.RelatingObject as { value: number })?.value
      if (!pai) continue
      const p = pavDoId.get(pai)
      for (const f of lista(l.RelatedObjects)) {
        paiDe.set(f.value, pai)
        if (p !== undefined) pavDoElemento.set(f.value, p)
      }
    }
  }
  const pavimentoDe = (e: number): number => {
    let atual: number | undefined = e
    for (let g = 0; g < 8 && atual !== undefined; g++) {
      const p = pavDoElemento.get(atual)
      if (p !== undefined) return p
      atual = paiDe.get(atual) ?? espacoDe.get(atual)
    }
    return -1
  }

  // --- Camadas (no ArchiCAD é o que realmente separa parede de guarda-corpo)
  progresso('Lendo camadas e materiais', 0.02)
  const dicCamadas = new Dicionario()
  const camadaDoItem = new Map<number, number>()
  for (const a of ids(api, m, IFCPRESENTATIONLAYERASSIGNMENT)) {
    const l = api.GetLine(m, a) as Record<string, unknown>
    const c = dicCamadas.indice(valor(l.Name))
    if (c < 0) continue
    for (const it of lista(l.AssignedItems)) camadaDoItem.set(it.value, c)
  }

  // --- Materiais
  const dicMateriais = new Dicionario()
  const materialDe = new Map<number, number>()
  const cacheMaterial = new Map<number, number>()
  for (const r of ids(api, m, IFCRELASSOCIATESMATERIAL)) {
    const l = api.GetLine(m, r) as Record<string, unknown>
    const mid = (l.RelatingMaterial as { value: number })?.value
    if (!mid) continue
    let idx = cacheMaterial.get(mid)
    if (idx === undefined) {
      idx = dicMateriais.indice(nomeDoMaterial(api, m, mid))
      cacheMaterial.set(mid, idx)
    }
    for (const e of lista(l.RelatedObjects)) materialDe.set(e.value, idx)
  }

  // --- Propriedades
  progresso('Lendo propriedades', 0.04)
  const psets: ConjuntoPropriedades[] = []
  const cachePset = new Map<number, number>()
  const indicePset = (pid: number): number => {
    let i = cachePset.get(pid)
    if (i !== undefined) return i
    const tipoLinha = api.GetLineType(m, pid)
    const conj = lerPset(api, m, pid, tipoLinha)
    i = conj ? psets.push(conj) - 1 : -1
    cachePset.set(pid, i)
    return i
  }
  const psetsDe = new Map<number, number[]>()
  const anexar = (e: number, i: number) => {
    if (i < 0) return
    const l = psetsDe.get(e)
    if (l) {
      if (!l.includes(i)) l.push(i)
    } else psetsDe.set(e, [i])
  }
  for (const r of ids(api, m, IFCRELDEFINESBYPROPERTIES)) {
    const l = api.GetLine(m, r) as Record<string, unknown>
    const def = (l.RelatingPropertyDefinition as { value: number })?.value
    if (!def) continue
    const i = indicePset(def)
    for (const e of lista(l.RelatedObjects)) anexar(e.value, i)
  }

  // --- Tipos (família do Revit, por exemplo)
  const dicTipos = new Dicionario()
  const tipoDe = new Map<number, number>()
  for (const r of ids(api, m, IFCRELDEFINESBYTYPE)) {
    const l = api.GetLine(m, r) as Record<string, unknown>
    const tid = (l.RelatingType as { value: number })?.value
    if (!tid) continue
    const tl = api.GetLine(m, tid) as Record<string, unknown>
    const t = dicTipos.indice(valor(tl.Name))
    const ps = lista(tl.HasPropertySets).map((h) => indicePset(h.value))
    for (const e of lista(l.RelatedObjects)) {
      tipoDe.set(e.value, t)
      for (const i of ps) anexar(e.value, i)
    }
  }

  // --- Geometria
  progresso('Gerando a geometria', 0.08)
  const dicClasses = new Dicionario()
  const blocos: BlocoGeometria[] = []
  const emObra = new Map<number, BlocoEmObra>()
  const indiceElemento = new Map<number, number>()
  const expressIds: number[] = []
  const caixasEl: number[] = []
  const partes: number[][] = []
  const caixaModelo = new CaixaAcumulada()
  let origem: Vec3 | null = null
  const ultimoRelato = { t: 0 }

  const fecharBloco = (b: BlocoEmObra) => {
    blocos.push(b.fechar())
    // índice do bloco entra nas partes quando ele fecha
    return blocos.length - 1
  }
  // Partes pendentes de cada bloco em obra: [elemento, inicio, qtd]
  const pendentes = new Map<BlocoEmObra, number[]>()
  const descarregar = (b: BlocoEmObra) => {
    const indice = fecharBloco(b)
    const p = pendentes.get(b) ?? []
    for (let i = 0; i < p.length; i += 3) partes[p[i]].push(indice, p[i + 1], p[i + 2])
    pendentes.delete(b)
  }

  const ignorar = new Set([IFCSPACE, IFCOPENINGELEMENT])

  api.StreamAllMeshes(m, (malha, indiceMalha, totalMalhas) => {
    const agora = Date.now()
    if (agora - ultimoRelato.t > 250) {
      ultimoRelato.t = agora
      progresso('Gerando a geometria', 0.08 + (0.82 * indiceMalha) / Math.max(1, totalMalhas))
    }
    const express = malha.expressID
    const tipoLinha = api.GetLineType(m, express)
    if (ignorar.has(tipoLinha)) return
    const geos = malha.geometries
    const qtdGeos = geos.size()
    if (qtdGeos === 0) return

    const pav = pavimentoDe(express)
    let el = indiceElemento.get(express)
    if (el === undefined) {
      el = expressIds.length
      indiceElemento.set(express, el)
      expressIds.push(express)
      caixasEl.push(Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity)
      partes.push([])
    }
    const base = el * 6

    for (let g = 0; g < qtdGeos; g++) {
      const col = geos.get(g)
      const geo = api.GetGeometry(m, col.geometryExpressID)
      const vs = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize())
      const is = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize())
      const nV = vs.length / 6
      const nI = is.length
      if (nV === 0 || nI === 0) {
        geo.delete()
        continue
      }

      let bloco = emObra.get(pav)
      if (!bloco || !bloco.cabe(nV, nI)) {
        if (bloco) descarregar(bloco)
        const capV = Math.max(VERTICES_POR_BLOCO, nV)
        bloco = new BlocoEmObra(pav, capV, Math.max(capV * 3, nI))
        emObra.set(pav, bloco)
      }

      const t = col.flatTransformation
      if (!origem) {
        // Primeiro vértice do arquivo, arredondado ao metro: fica perto do modelo inteiro, e é coordenada real.
        const x = vs[0]
        const y = vs[1]
        const z = vs[2]
        origem = [
          Math.round(t[0] * x + t[4] * y + t[8] * z + t[12]),
          Math.round(t[1] * x + t[5] * y + t[9] * z + t[13]),
          Math.round(t[2] * x + t[6] * y + t[10] * z + t[14]),
        ]
      }
      const [ox, oy, oz] = origem

      const r = Math.round(col.color.x * 255)
      const gg = Math.round(col.color.y * 255)
      const bb = Math.round(col.color.z * 255)
      const a = Math.round(col.color.w * 255)

      const inicioV = bloco.nV
      const pos = bloco.posicoes
      const nor = bloco.normais
      const cor = bloco.cores
      const ele = bloco.elementos
      let minX = caixasEl[base]
      let minY = caixasEl[base + 1]
      let minZ = caixasEl[base + 2]
      let maxX = caixasEl[base + 3]
      let maxY = caixasEl[base + 4]
      let maxZ = caixasEl[base + 5]

      for (let i = 0, j = 0; i < nV; i++, j += 6) {
        const x = vs[j]
        const y = vs[j + 1]
        const z = vs[j + 2]
        const X = t[0] * x + t[4] * y + t[8] * z + t[12] - ox
        const Y = t[1] * x + t[5] * y + t[9] * z + t[13] - oy
        const Z = t[2] * x + t[6] * y + t[10] * z + t[14] - oz
        const k = inicioV + i
        pos[k * 3] = X
        pos[k * 3 + 1] = Y
        pos[k * 3 + 2] = Z
        if (X < minX) minX = X
        if (Y < minY) minY = Y
        if (Z < minZ) minZ = Z
        if (X > maxX) maxX = X
        if (Y > maxY) maxY = Y
        if (Z > maxZ) maxZ = Z

        const nx = vs[j + 3]
        const ny = vs[j + 4]
        const nz = vs[j + 5]
        let NX = t[0] * nx + t[4] * ny + t[8] * nz
        let NY = t[1] * nx + t[5] * ny + t[9] * nz
        let NZ = t[2] * nx + t[6] * ny + t[10] * nz
        const L = Math.hypot(NX, NY, NZ) || 1
        NX /= L
        NY /= L
        NZ /= L
        nor[k * 4] = NX * 127
        nor[k * 4 + 1] = NY * 127
        nor[k * 4 + 2] = NZ * 127
        cor[k * 4] = r
        cor[k * 4 + 1] = gg
        cor[k * 4 + 2] = bb
        cor[k * 4 + 3] = a
        ele[k] = el
      }
      caixasEl[base] = minX
      caixasEl[base + 1] = minY
      caixasEl[base + 2] = minZ
      caixasEl[base + 3] = maxX
      caixasEl[base + 4] = maxY
      caixasEl[base + 5] = maxZ
      bloco.caixa.somar(minX, minY, minZ)
      bloco.caixa.somar(maxX, maxY, maxZ)
      caixaModelo.somar(minX, minY, minZ)
      caixaModelo.somar(maxX, maxY, maxZ)

      const inicioI = bloco.nI
      const idx = bloco.indices
      for (let i = 0; i < nI; i++) idx[inicioI + i] = is[i] + inicioV
      bloco.nI += nI
      bloco.nV += nV

      bloco.nA = detectarArestas(pos, idx, inicioI, nI, inicioV, nV, bloco.arestas, bloco.nA)

      let p = pendentes.get(bloco)
      if (!p) {
        p = []
        pendentes.set(bloco, p)
      }
      p.push(el, inicioI, nI)
      geo.delete()
    }
  })

  for (const b of emObra.values()) if (b.nV > 0) descarregar(b)

  progresso('Organizando os elementos', 0.92)

  // --- Tabela de elementos
  const n = expressIds.length
  const nomes: string[] = new Array(n)
  const tags: string[] = new Array(n)
  const guids: string[] = new Array(n)
  const pais: string[] = new Array(n)
  const classe = new Int32Array(n)
  const tipo = new Int32Array(n)
  const pavimento = new Int32Array(n)
  const camada = new Int32Array(n)
  const material = new Int32Array(n)
  const nomesDosPais = new Map<number, string>()
  const psetsInicio = new Uint32Array(n + 1)
  const psetsLista: number[] = []
  const partesInicio = new Uint32Array(n + 1)
  let qtdPartes = 0
  for (let i = 0; i < n; i++) qtdPartes += partes[i].length
  const partesPlano = new Uint32Array(qtdPartes)
  let posPartes = 0

  const camadaDe = (rep: number): number => {
    const direta = camadaDoItem.get(rep)
    if (direta !== undefined) return direta
    const l = api.GetLine(m, rep) as Record<string, unknown>
    for (const it of lista(l.Items)) {
      const c = camadaDoItem.get(it.value)
      if (c !== undefined) return c
    }
    return -1
  }

  for (let i = 0; i < n; i++) {
    if (i % 2000 === 0) progresso('Organizando os elementos', 0.92 + (0.07 * i) / n)
    const e = expressIds[i]
    const l = api.GetLine(m, e) as Record<string, unknown>
    nomes[i] = valor(l.Name)
    tags[i] = valor(l.Tag)
    guids[i] = valor(l.GlobalId)
    classe[i] = dicClasses.indice(api.GetNameFromTypeCode(api.GetLineType(m, e)))
    pavimento[i] = pavimentoDe(e)

    let t = tipoDe.get(e)
    if (t === undefined) t = dicTipos.indice(valor(l.ObjectType))
    tipo[i] = t ?? -1

    let c = -1
    if (camadaDoItem.size > 0 && l.Representation) {
      try {
        const forma = api.GetLine(m, (l.Representation as { value: number }).value) as Record<string, unknown>
        for (const rep of lista(forma.Representations)) {
          c = camadaDe(rep.value)
          if (c >= 0) break
        }
      } catch {
        // sem representação legível: fica sem camada
      }
    }
    // Parte de parede sem camada própria herda a do pai.
    const pai = paiDe.get(e)
    material[i] = materialDe.get(e) ?? (pai !== undefined ? (materialDe.get(pai) ?? -1) : -1)
    if (pai !== undefined) {
      let nomePai = nomesDosPais.get(pai)
      if (nomePai === undefined) {
        const lp = api.GetLine(m, pai) as Record<string, unknown>
        nomePai = valor(lp.Name)
        nomesDosPais.set(pai, nomePai)
        if (c < 0 && camadaDoItem.size > 0 && lp.Representation) {
          try {
            const forma = api.GetLine(m, (lp.Representation as { value: number }).value) as Record<string, unknown>
            for (const rep of lista(forma.Representations)) {
              c = camadaDe(rep.value)
              if (c >= 0) break
            }
          } catch {
            // idem
          }
        }
      }
      pais[i] = nomePai
    } else {
      pais[i] = ''
    }
    camada[i] = c

    psetsInicio[i] = psetsLista.length
    const ps = psetsDe.get(e)
    if (ps) psetsLista.push(...ps)

    partesInicio[i] = posPartes
    const pt = partes[i]
    for (let k = 0; k < pt.length; k++) partesPlano[posPartes++] = pt[k]
  }
  psetsInicio[n] = psetsLista.length
  partesInicio[n] = posPartes

  // Sem pavimento no IFC: estima pela altura (o último pavimento abaixo do pé do elemento).
  const niveis = pavimentos.map((p, i) => ({ i, y: p.elevacao })).filter((p): p is { i: number; y: number } => p.y !== null)
  if (niveis.length) {
    const oy = origem ? (origem as Vec3)[1] : 0
    for (let i = 0; i < n; i++) {
      if (pavimento[i] >= 0) continue
      const pe = caixasEl[i * 6 + 1] + oy + 0.05
      let achado = niveis[0].i
      for (const nv of niveis) if (nv.y <= pe) achado = nv.i
      pavimento[i] = achado
    }
  }

  const caixaFinal: Caixa = caixaModelo.valor()
  const meta: MetaModelo = {
    versao: 1,
    id,
    nome,
    tamanhoIfc: tamanho,
    schema: api.GetModelSchema(m),
    origem: origem ?? [0, 0, 0],
    caixa: caixaFinal,
    pavimentos,
    classes: dicClasses.itens,
    tipos: dicTipos.itens,
    camadas: dicCamadas.itens,
    materiais: dicMateriais.itens,
    nomes,
    tags,
    guids,
    pais,
    psets,
  }
  const tabela: TabelaElementos = {
    expressIds: Uint32Array.from(expressIds),
    caixas: Float32Array.from(caixasEl),
    partesInicio,
    partes: partesPlano,
    classe,
    tipo,
    pavimento,
    camada,
    material,
    psetsInicio,
    psetsLista: Uint32Array.from(psetsLista),
  }
  progresso('Pronto', 1)
  return { meta, tabela, blocos }
}

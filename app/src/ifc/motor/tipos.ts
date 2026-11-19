// Formato em memória de um IFC já convertido. É o que o visor, a busca e os cortes usam,
// e é o que fica guardado no aparelho (pacote.ts): reabrir não precisa ler o IFC de novo.
//
// Coordenadas: metros, Y para cima (como o web-ifc entrega). Cada modelo guarda posições relativas
// à própria `origem`, para caber em Float32 sem perder precisão. A `origem` fica em coordenada real,
// e é ela que mantém vários IFCs da mesma obra um por cima do outro.

export type Vec3 = [number, number, number]
/** min x, y, z, max x, y, z */
export type Caixa = [number, number, number, number, number, number]

/** Um pedaço da geometria do modelo: um desenho na placa de vídeo. Agrupado por pavimento. */
export interface BlocoGeometria {
  /** Índice em `meta.pavimentos`, ou -1. */
  pavimento: number
  /** 3 por vértice, relativas a `meta.origem`. */
  posicoes: Float32Array
  /** 4 por vértice (o 4º é enchimento, a placa de vídeo prefere alinhado em 4). */
  normais: Int8Array
  /** RGBA do IFC, 4 por vértice. */
  cores: Uint8Array
  /** Índice do elemento, 1 por vértice. */
  elementos: Float32Array
  /** Triângulos, 3 por triângulo. */
  indices: Uint32Array
  /** Arestas vivas: pares de índices de vértice. */
  arestas: Uint32Array
  caixa: Caixa
}

export interface ConjuntoPropriedades {
  nome: string
  /** [nome, valor] */
  props: Array<[string, string]>
}

export interface Pavimento {
  nome: string
  /** Metros, na mesma coordenada real da `origem`. Null se o IFC não diz. */
  elevacao: number | null
}

/** Texto e relações: vai como JSON no pacote. */
export interface MetaModelo {
  versao: 1
  id: string
  nome: string
  tamanhoIfc: number
  schema: string
  origem: Vec3
  /** Caixa do modelo, relativa à `origem`. */
  caixa: Caixa
  pavimentos: Pavimento[]
  classes: string[]
  tipos: string[]
  camadas: string[]
  materiais: string[]
  /** Por elemento. */
  nomes: string[]
  tags: string[]
  guids: string[]
  /** Nome do elemento "pai" quando o elemento é parte de outro (ex.: REBOCO dentro de uma parede). */
  pais: string[]
  psets: ConjuntoPropriedades[]
}

/** Tabela de elementos em binário, indexada pelo índice do elemento. */
export interface TabelaElementos {
  expressIds: Uint32Array
  /** 6 por elemento, relativas à origem. */
  caixas: Float32Array
  /** n+1 posições em `partes`, em trios. */
  partesInicio: Uint32Array
  /** Trios [bloco, primeiro índice, qtd de índices]. */
  partes: Uint32Array
  /** Índices nas listas do `meta`; -1 = não informado. */
  classe: Int32Array
  tipo: Int32Array
  pavimento: Int32Array
  camada: Int32Array
  material: Int32Array
  psetsInicio: Uint32Array
  psetsLista: Uint32Array
}

export interface ModeloIfc {
  meta: MetaModelo
  tabela: TabelaElementos
  blocos: BlocoGeometria[]
}

export function qtdElementos(m: ModeloIfc): number {
  return m.tabela.expressIds.length
}

export function qtdTriangulos(m: ModeloIfc): number {
  return m.blocos.reduce((s, b) => s + b.indices.length / 3, 0)
}

/** Buffers para transferir o modelo entre threads sem copiar. */
export function buffersDoModelo(m: ModeloIfc): ArrayBuffer[] {
  const t = m.tabela
  const lista: ArrayBufferLike[] = [
    t.expressIds.buffer,
    t.caixas.buffer,
    t.partesInicio.buffer,
    t.partes.buffer,
    t.classe.buffer,
    t.tipo.buffer,
    t.pavimento.buffer,
    t.camada.buffer,
    t.material.buffer,
    t.psetsInicio.buffer,
    t.psetsLista.buffer,
  ]
  for (const b of m.blocos) {
    lista.push(b.posicoes.buffer, b.normais.buffer, b.cores.buffer, b.elementos.buffer, b.indices.buffer, b.arestas.buffer)
  }
  return lista as ArrayBuffer[]
}

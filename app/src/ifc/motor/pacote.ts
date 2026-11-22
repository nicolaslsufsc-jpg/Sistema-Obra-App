// Grava e lê o modelo convertido como um arquivo só (.obra3d): cabeçalho JSON + vetores binários.
// É como fica guardado no aparelho e como vai de um aparelho para outro: converte uma vez no PC
// e abre no tablet sem ler o IFC de novo.
import type { BlocoGeometria, Caixa, MetaModelo, ModeloIfc, TabelaElementos } from './tipos'

const ASSINATURA = 0x33_4f_42_4f // "OBO3" em little-endian
// Versão 2 (21/11/2026): as propriedades (psets) saem do cabeçalho e vão em pedaços de JSON logo depois
// dele. Nos modelos grandes de hidráulica e elétrica (1 GB de IFC) o cabeçalho com todas as
// propriedades passava do limite de tamanho de texto do navegador (~512 MB): o modelo não ficava
// guardado no aparelho e nem dava para salvar o .obra3d. A versão 1 continua sendo lida.
const VERSAO = 2
const PSETS_POR_PEDACO = 2000

type Vetor = Float32Array | Int8Array | Uint8Array | Uint32Array | Int32Array
type NomeTipo = 'F32' | 'I8' | 'U8' | 'U32' | 'I32'

const CONSTRUTORES = {
  F32: Float32Array,
  I8: Int8Array,
  U8: Uint8Array,
  U32: Uint32Array,
  I32: Int32Array,
} as const

function nomeDoTipo(v: Vetor): NomeTipo {
  if (v instanceof Float32Array) return 'F32'
  if (v instanceof Int8Array) return 'I8'
  if (v instanceof Uint8Array) return 'U8'
  if (v instanceof Uint32Array) return 'U32'
  return 'I32'
}

interface DescVetor {
  t: NomeTipo
  /** Quantidade de itens (não de bytes). */
  n: number
}

interface Cabecalho {
  meta: MetaModelo
  tabela: Record<keyof TabelaElementos, DescVetor>
  blocos: Array<{ pavimento: number; caixa: Caixa; v: Record<CampoBloco, DescVetor> }>
  /** Versão 2: tamanho em bytes de cada pedaço de JSON com as propriedades (o `meta.psets` vem vazio). */
  psetsPedacos?: number[]
}

type CampoBloco = 'posicoes' | 'normais' | 'cores' | 'elementos' | 'indices' | 'arestas'
const CAMPOS_BLOCO: CampoBloco[] = ['posicoes', 'normais', 'cores', 'elementos', 'indices', 'arestas']
const CAMPOS_TABELA: Array<keyof TabelaElementos> = [
  'expressIds',
  'caixas',
  'partesInicio',
  'partes',
  'classe',
  'tipo',
  'pavimento',
  'camada',
  'material',
  'psetsInicio',
  'psetsLista',
]

const ALINHAMENTO = 8

function preenchimento(tamanho: number): number {
  return (ALINHAMENTO - (tamanho % ALINHAMENTO)) % ALINHAMENTO
}

/** Partes do arquivo, na ordem. Não junta num buffer só: modelo grande não caberia duas vezes na memória. */
export function partesDoPacote(m: ModeloIfc): BlobPart[] {
  const descrever = (v: Vetor): DescVetor => ({ t: nomeDoTipo(v), n: v.length })
  const codificar = new TextEncoder()
  const pedacos: Uint8Array[] = []
  for (let i = 0; i < m.meta.psets.length; i += PSETS_POR_PEDACO) pedacos.push(codificar.encode(JSON.stringify(m.meta.psets.slice(i, i + PSETS_POR_PEDACO))))
  const cab: Cabecalho = {
    meta: { ...m.meta, psets: [] },
    psetsPedacos: pedacos.map((p) => p.length),
    tabela: Object.fromEntries(CAMPOS_TABELA.map((c) => [c, descrever(m.tabela[c])])) as Cabecalho['tabela'],
    blocos: m.blocos.map((b) => ({
      pavimento: b.pavimento,
      caixa: b.caixa,
      v: Object.fromEntries(CAMPOS_BLOCO.map((c) => [c, descrever(b[c])])) as Record<CampoBloco, DescVetor>,
    })),
  }
  const json = codificar.encode(JSON.stringify(cab))
  const inicio = new ArrayBuffer(12)
  const dv = new DataView(inicio)
  dv.setUint32(0, ASSINATURA, true)
  dv.setUint32(4, VERSAO, true)
  dv.setUint32(8, json.length, true)
  const partes: BlobPart[] = [inicio, json as BlobPart, ...(pedacos as BlobPart[])]
  let total = 12 + json.length + pedacos.reduce((a, p) => a + p.length, 0)
  const empurrar = (v: Vetor) => {
    const p = preenchimento(total)
    if (p) {
      partes.push(new Uint8Array(p))
      total += p
    }
    partes.push(v as BlobPart)
    total += v.byteLength
  }
  for (const c of CAMPOS_TABELA) empurrar(m.tabela[c])
  for (const b of m.blocos) for (const c of CAMPOS_BLOCO) empurrar(b[c])
  return partes
}

export function pacoteParaBlob(m: ModeloIfc): Blob {
  return new Blob(partesDoPacote(m), { type: 'application/octet-stream' })
}

export function ehPacote(cabeca: ArrayBuffer): boolean {
  return cabeca.byteLength >= 4 && new DataView(cabeca).getUint32(0, true) === ASSINATURA
}

/**
 * Lê o pacote sem copiar os vetores: eles apontam para o próprio `dados`.
 * Com `soltar`, copia só o que continua em uso no JS depois de ir para a placa de vídeo (tabela,
 * posições e índices). Quando o resto for enviado, o buffer grande inteiro pode sair da memória.
 */
export function lerPacote(dados: ArrayBuffer, soltar = false): ModeloIfc {
  if (!ehPacote(dados)) throw new Error('Este arquivo não é um modelo convertido (.obra3d).')
  const dv = new DataView(dados)
  const versao = dv.getUint32(4, true)
  if (versao !== 1 && versao !== VERSAO) throw new Error(`Modelo convertido com versão ${versao} do formato. Abra o IFC de novo.`)
  const tamJson = dv.getUint32(8, true)
  const decodificar = new TextDecoder()
  const cab = JSON.parse(decodificar.decode(new Uint8Array(dados, 12, tamJson))) as Cabecalho
  let pos = 12 + tamJson
  for (const tam of cab.psetsPedacos ?? []) {
    const pedaco = JSON.parse(decodificar.decode(new Uint8Array(dados, pos, tam))) as MetaModelo['psets']
    for (const c of pedaco) cab.meta.psets.push(c)
    pos += tam
  }
  const pegar = (d: DescVetor) => {
    pos += preenchimento(pos)
    const C = CONSTRUTORES[d.t]
    const v = new C(dados, pos, d.n)
    pos += v.byteLength
    return v
  }
  const tabela = {} as Record<keyof TabelaElementos, Vetor>
  for (const c of CAMPOS_TABELA) {
    const t = pegar(cab.tabela[c])
    tabela[c] = soltar ? t.slice() : t
  }
  const blocos: BlocoGeometria[] = cab.blocos.map((b) => {
    const v = {} as Record<CampoBloco, Vetor>
    for (const c of CAMPOS_BLOCO) {
      const t = pegar(b.v[c])
      v[c] = soltar && (c === 'posicoes' || c === 'indices') ? t.slice() : t
    }
    return { pavimento: b.pavimento, caixa: b.caixa, ...v } as unknown as BlocoGeometria
  })
  return { meta: cab.meta, tabela: tabela as unknown as TabelaElementos, blocos }
}

/** Só o cabeçalho, para listar o que está guardado sem carregar a geometria (na versão 2, sem as propriedades). */
export async function lerMetaDoPacote(arquivo: Blob): Promise<MetaModelo> {
  const ini = await arquivo.slice(0, 12).arrayBuffer()
  if (!ehPacote(ini)) throw new Error('Arquivo inválido.')
  const tamJson = new DataView(ini).getUint32(8, true)
  const json = await arquivo.slice(12, 12 + tamJson).text()
  return (JSON.parse(json) as Cabecalho).meta
}

/** Arquivo comprimido para levar a outro aparelho. */
export async function pacoteComprimido(m: ModeloIfc): Promise<Blob> {
  const fluxo = pacoteParaBlob(m).stream().pipeThrough(new CompressionStream('gzip'))
  return new Response(fluxo).blob()
}

/** Abre um .obra3d, comprimido ou não. */
export async function abrirArquivoDePacote(arquivo: Blob): Promise<ModeloIfc> {
  const cabeca = new Uint8Array(await arquivo.slice(0, 2).arrayBuffer())
  if (cabeca[0] === 0x1f && cabeca[1] === 0x8b) {
    const fluxo = arquivo.stream().pipeThrough(new DecompressionStream('gzip'))
    return lerPacote(await new Response(fluxo).arrayBuffer())
  }
  return lerPacote(await arquivo.arrayBuffer())
}

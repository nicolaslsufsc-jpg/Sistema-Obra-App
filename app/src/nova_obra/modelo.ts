// Nova obra (docs/modulos/nova_obra.md, etapa 1): o rascunho da obra montado pela tela (obra,
// pavimentos, fichas) e o pacote que sai dele, no mesmo formato do pipeline (indice.json + fichas.json).
// Sem planta ainda (etapa 2). O .zip abre pelo "Abrir pacote da obra (.zip)" de sempre.
import { uuidDeterministico, type FichaDoPacote, type IndicePacote, type PlantaDoIndice } from '../nucleo/pacote_obra'
import type { ItemFicha } from '../fvs/situacao'
import { sha256Hex } from '../fvs/pacote'
import { gravarZipBlob } from './zip_gravar'
import { montarPacotePlanta, problemasDaPlanta, type PecaRascunho, type PlantaRascunho } from './planta'
import type { TilesGuardados } from './guardados'

export const TIPOS_DE_PECA = [
  { id: 'P', nome: 'Pilar' },
  { id: 'V', nome: 'Viga' },
  { id: 'L', nome: 'Laje' },
  { id: 'A', nome: 'Ambiente' },
] as const

/** Como a ficha diz qual é a etapa da concretagem. */
export type EtapaConcretagem = { modo: 'pelo_nome' } | { modo: 'nenhuma' } | { modo: 'etapa'; etapa: string }

export interface ItemRascunho {
  etapa: string
  titulo: string
  descricao: string
  dispositivo: string
  tolerancia: string
}

export interface FichaRascunho {
  codigo: string
  titulo: string
  revisao: string
  aplica_a: string[]
  itens: ItemRascunho[]
  concretagem: EtapaConcretagem
}

export interface RascunhoObra {
  codigo: string
  nome: string
  empresa: string
  /** de baixo para cima, como `pavimentos.ordem` */
  pavimentos: string[]
  fichas: FichaRascunho[]
  /** plantas (etapa 2); os PDFs e os tiles ficam em guardados.ts */
  plantas: PlantaRascunho[]
}

export const rascunhoVazio = (): RascunhoObra => ({ codigo: '', nome: '', empresa: '', pavimentos: [], fichas: [], plantas: [] })
export const fichaVazia = (): FichaRascunho => ({ codigo: '', titulo: '', revisao: '0', aplica_a: ['P'], itens: [], concretagem: { modo: 'pelo_nome' } })

/** Código da obra: o mesmo formato do banco (`obras.codigo`): maiúsculas, números, `_` e `-`. */
export function normalizarCodigo(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9_-]/g, '')
}

/** Pavimentos comuns, de baixo para cima: "Subsolo, Térreo, 1º ... Nº, Cobertura". */
export function pavimentosPadrao(subsolos: number, tipos: number, cobertura: boolean): string[] {
  const l: string[] = []
  for (let i = subsolos; i >= 1; i--) l.push(subsolos === 1 ? 'Subsolo' : `Subsolo ${i}`)
  l.push('Térreo')
  for (let i = 1; i <= tipos; i++) l.push(`${i}º Pavimento`)
  if (cobertura) l.push('Cobertura')
  return l
}

const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/** Linhas e células de um texto copiado do Excel (tabulação; célula com quebra de linha vem entre aspas). */
export function lerTabela(texto: string): string[][] {
  const linhas: string[][] = []
  let linha: string[] = []
  let cel = ''
  let aspas = false
  const t = texto.replace(/\r\n?/g, '\n')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') {
        cel += '"'
        i++
      } else if (c === '"') aspas = false
      else cel += c
    } else if (c === '"' && cel === '') aspas = true
    else if (c === '\t') {
      linha.push(cel)
      cel = ''
    } else if (c === '\n') {
      linha.push(cel)
      linhas.push(linha)
      linha = []
      cel = ''
    } else cel += c
  }
  if (cel !== '' || linha.length) {
    linha.push(cel)
    linhas.push(linha)
  }
  return linhas.map((l) => l.map((c) => c.trim())).filter((l) => l.some((c) => c !== ''))
}

type Coluna = keyof ItemRascunho | 'n'
const NOMES_DE_COLUNA: Array<[Coluna, RegExp]> = [
  ['n', /^(n|no|n°|nº|num|numero|item|itens)$/],
  ['etapa', /^(etapa|fase|grupo)/],
  ['titulo', /^(titulo|verificacao|o que verificar|item de verificacao|servico)/],
  ['descricao', /^(descricao|metodo|como verificar|criterio de verificacao)/],
  ['dispositivo', /^(dispositivo|instrumento|ferramenta|equipamento)/],
  ['tolerancia', /^(tolerancia|criterio|aceitacao|limite)/],
]
const ORDEM_SEM_CABECALHO: Coluna[] = ['etapa', 'titulo', 'descricao', 'dispositivo', 'tolerancia']

/**
 * Itens de ficha colados do Excel. Com cabeçalho (Etapa, Item, Título...), as colunas vão pelo nome, em
 * qualquer ordem; sem cabeçalho: Etapa, Título, Descrição, Dispositivo, Tolerância. Etapa vazia repete a
 * de cima (célula mesclada no Excel). Linha sem título fica de fora.
 */
export function itensColados(texto: string): { itens: ItemRascunho[]; ignoradas: number } {
  const linhas = lerTabela(texto)
  if (!linhas.length) return { itens: [], ignoradas: 0 }
  let colunas: Array<Coluna | null> = ORDEM_SEM_CABECALHO
  const cab = linhas[0].map((c) => NOMES_DE_COLUNA.find(([, re]) => re.test(semAcento(c)))?.[0] ?? null)
  const comCabecalho = cab.includes('titulo')
  if (comCabecalho) colunas = cab
  const itens: ItemRascunho[] = []
  let ignoradas = 0
  let etapa = ''
  for (const l of linhas.slice(comCabecalho ? 1 : 0)) {
    const it: ItemRascunho = { etapa: '', titulo: '', descricao: '', dispositivo: '', tolerancia: '' }
    l.forEach((c, i) => {
      const col = colunas[i]
      if (col && col !== 'n') it[col] = c
    })
    if (it.etapa) etapa = it.etapa
    else it.etapa = etapa
    if (!it.titulo) {
      ignoradas++
      continue
    }
    itens.push(it)
  }
  return { itens, ignoradas }
}

export const etapasDaFicha = (f: Pick<FichaRascunho, 'itens'>) => [...new Set(f.itens.map((i) => i.etapa))]

/** Os problemas que impedem salvar (mesmas regras do banco: fvs_conferir_itens e obras.codigo). */
export function problemas(r: RascunhoObra): string[] {
  const p: string[] = []
  if (!/^[A-Z0-9_-]{2,30}$/.test(r.codigo)) p.push('Código da obra: de 2 a 30 letras maiúsculas, números, - ou _.')
  if (!r.nome.trim()) p.push('Falta o nome da obra.')
  if (!r.pavimentos.length) p.push('Cadastre pelo menos um pavimento.')
  const pav = new Set<string>()
  for (const n of r.pavimentos) {
    if (!n.trim()) p.push('Há um pavimento sem nome.')
    else if (pav.has(semAcento(n))) p.push(`Pavimento repetido: ${n}.`)
    pav.add(semAcento(n))
  }
  const codigos = new Set<string>()
  r.fichas.forEach((f, i) => {
    const nome = f.codigo.trim() || `ficha ${i + 1}`
    if (!f.codigo.trim()) p.push(`Ficha ${i + 1}: falta o código.`)
    else if (codigos.has(f.codigo.trim().toUpperCase())) p.push(`Ficha ${nome}: código repetido.`)
    codigos.add(f.codigo.trim().toUpperCase())
    if (!f.titulo.trim()) p.push(`Ficha ${nome}: falta o título.`)
    if (!f.aplica_a.length) p.push(`Ficha ${nome}: escolha a que se aplica (pilar, viga...).`)
    if (!f.itens.length) p.push(`Ficha ${nome}: precisa de pelo menos um item.`)
    if (f.itens.length > 300) p.push(`Ficha ${nome}: no máximo 300 itens.`)
    f.itens.forEach((it, j) => {
      if (!it.titulo.trim()) p.push(`Ficha ${nome}, item ${j + 1}: falta o título.`)
      if (it.titulo.length > 500 || it.etapa.length > 120 || it.descricao.length > 2000) p.push(`Ficha ${nome}, item ${j + 1}: texto longo demais.`)
    })
    if (f.concretagem.modo === 'etapa' && !etapasDaFicha(f).includes(f.concretagem.etapa))
      p.push(`Ficha ${nome}: a etapa da concretagem escolhida não existe mais nos itens.`)
  })
  const trechos = new Set<string>()
  for (const pl of r.plantas ?? []) {
    p.push(...problemasDaPlanta(pl, r.pavimentos))
    const k = `${semAcento(pl.pavimento)}|${semAcento(pl.trecho)}`
    if (trechos.has(k)) p.push(`Pavimento ${pl.pavimento}: duas plantas com o trecho "${pl.trecho}". Dê nomes diferentes (Trecho A, Trecho B).`)
    trechos.add(k)
  }
  return p
}

const PLURAL: Record<string, [string, string]> = { P: ['pilar', 'pilares'], V: ['viga', 'vigas'], L: ['laje', 'lajes'], A: ['ambiente', 'ambientes'] }
const quantas = (n: number, tipo: string) => `${n} ${PLURAL[tipo]?.[n === 1 ? 0 : 1] ?? 'peças'}`

/**
 * Avisos que não impedem salvar, mas a pessoa precisa saber (achados do Testador de 09/11/2026):
 * peças sem nenhuma ficha (ficam com 0 itens na FVS) e peças sem contorno (a FVS pinta o retângulo do nome).
 */
export function avisos(r: RascunhoObra): string[] {
  const a: string[] = []
  const pecas = (r.plantas ?? []).flatMap((pl) => pl.pecas)
  const cobertos = new Set(r.fichas.flatMap((f) => f.aplica_a))
  for (const { id, nome } of TIPOS_DE_PECA) {
    const n = pecas.filter((pc) => pc.tipo === id).length
    if (n && !cobertos.has(id))
      a.push(`${quantas(n, id)} sem ficha: nenhuma ficha vale para ${nome.toLowerCase()}, e na FVS ${n === 1 ? 'ela fica' : 'elas ficam'} com 0 itens. Em Fichas, marque ${nome} no "Vale para" de uma ficha.`)
  }
  // laje não tem contorno desenhado (é o painel): só pilar, viga e ambiente
  const sem = pecas.filter((pc) => pc.tipo !== 'L' && !pc.polys.length).length
  if (sem)
    a.push(`${sem} ${sem === 1 ? 'peça' : 'peças'} sem contorno: na FVS ${sem === 1 ? 'aparece' : 'aparecem'} só como o retângulo do nome. Em Plantas, use "Ler as peças sozinho" ou abra a peça e "Desenhar contorno".`)
  return a
}

/** A ficha no formato do pacote (o de fichas.json do pipeline), com a marca da etapa da concretagem nos itens. */
export function fichaDoPacote(f: FichaRascunho): FichaDoPacote {
  const itens: ItemFicha[] = f.itens.map((it, i) => {
    const item: ItemFicha = { n: i + 1, etapa: it.etapa.trim(), titulo: it.titulo.trim() }
    if (it.descricao.trim()) item.descricao = it.descricao.trim()
    if (it.dispositivo.trim()) item.dispositivo = it.dispositivo.trim()
    if (it.tolerancia.trim()) item.tolerancia = it.tolerancia.trim()
    if (f.concretagem.modo === 'nenhuma') item.concretagem = false
    if (f.concretagem.modo === 'etapa') item.concretagem = item.etapa === f.concretagem.etapa.trim()
    return item
  })
  return { codigo: f.codigo.trim(), titulo: f.titulo.trim(), revisao: f.revisao.trim() || '0', aplica_a: [...f.aplica_a], itens }
}

/** Nome de pasta seguro dentro do .zip: "3º Pavimento" -> "3_Pavimento". */
const pasta = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'x'

/** Id da peça: fixo pelo código da obra, pavimento, tipo e nome (a mesma peça em dois trechos é uma só). */
export const idDaPeca = (codigo: string, pavimento: string, pc: Pick<PecaRascunho, 'tipo' | 'nome'>) =>
  uuidDeterministico(`nova-obra:${codigo}:${semAcento(pavimento)}:${pc.tipo}:${pc.nome.toUpperCase()}`)

export type LerTiles = (plantaId: string) => Promise<TilesGuardados | null>

/** indice.json + fichas.json + o pacote de cada planta. */
export async function pacoteDoRascunho(
  r: RascunhoObra,
  agora = new Date(),
  lerTiles: LerTiles = async () => null,
): Promise<{ indice: IndicePacote & { empresa?: string; origem: string }; fichas: FichaDoPacote[]; arquivos: Array<[string, string | Blob]> }> {
  const arquivos: Array<[string, string | Blob]> = []
  const pavimentos: IndicePacote['pavimentos'] = []
  for (const [ordem, nomePav] of r.pavimentos.entries()) {
    const pecas = new Map<string, { id: string; tipo: string; nome: string; secao: string }>()
    const plantas: PlantaDoIndice[] = []
    for (const pl of (r.plantas ?? []).filter((x) => x.pavimento === nomePav)) {
      const t = await lerTiles(pl.id)
      if (!t) throw new Error(`A planta ${pl.prancha} (${nomePav}) não está desenhada neste aparelho. Abra a planta e toque em "Desenhar a planta".`)
      const elementos = new Map<string, PecaRascunho>()
      for (const pc of pl.pecas) {
        const id = await idDaPeca(r.codigo, nomePav, pc)
        elementos.set(id, pc)
        if (!pecas.has(id)) pecas.set(id, { id, tipo: pc.tipo, nome: pc.nome, secao: pc.secao })
      }
      const { manifest, bin } = montarPacotePlanta(
        { planta_id: pl.id, obra: r.codigo, pavimento: nomePav, trecho: pl.trecho.trim(), prancha: pl.prancha, revisao: pl.revisao, largura: t.largura, altura: t.altura, niveis: t.niveis, escala: pl.escala },
        new Map(t.tiles),
        elementos,
      )
      const dir = `${String(ordem + 1).padStart(2, '0')}_${pasta(nomePav)}/${pasta(pl.trecho)}/`
      const mBytes = new TextEncoder().encode(manifest)
      plantas.push({
        id: pl.id,
        trecho: pl.trecho.trim(),
        pasta: dir,
        prancha: pl.prancha,
        revisao: pl.revisao,
        largura: t.largura,
        altura: t.altura,
        elementos: elementos.size,
        disciplina: 'estrutura',
        manifest: { sha256: await sha256Hex(mBytes.buffer), tamanho: mBytes.length },
        pacote: { sha256: await sha256Hex(await bin.arrayBuffer()), tamanho: bin.size },
      })
      arquivos.push([dir + 'manifest.json', manifest], [dir + 'pacote.bin', bin])
    }
    pavimentos.push({ nome: nomePav.trim(), pecas: [...pecas.values()], plantas })
  }
  const indice = {
    obra: r.codigo,
    nome: r.nome.trim(),
    ...(r.empresa.trim() ? { empresa: r.empresa.trim() } : {}),
    gerado_em: agora.toISOString(),
    origem: 'nova_obra',
    pavimentos,
  }
  return { indice, fichas: r.fichas.map(fichaDoPacote), arquivos }
}

/** O .zip do pacote, pronto para o "Abrir pacote da obra (.zip)". */
export async function zipDoRascunho(r: RascunhoObra, agora = new Date(), lerTiles?: LerTiles): Promise<Blob> {
  const { indice, fichas, arquivos } = await pacoteDoRascunho(r, agora, lerTiles)
  // o indice.json por último, como no pipeline: zip cortado no meio não parece pacote completo
  return gravarZipBlob([...arquivos, ['fichas.json', JSON.stringify(fichas, null, 1)], ['indice.json', JSON.stringify(indice, null, 1)]], agora)
}

/** Nome do arquivo: "obra_EX2_2026-11-09.zip". */
export const nomeDoZip = (r: RascunhoObra, agora = new Date()) => `obra_${r.codigo || 'NOVA'}_${agora.toISOString().slice(0, 10)}.zip`

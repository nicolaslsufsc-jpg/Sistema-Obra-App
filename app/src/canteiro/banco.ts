// Mapas do canteiro guardados no aparelho, num banco PRÓPRIO do navegador (não é o banco do núcleo
// nem tabela do servidor): sem migração, sem fila de envio, funciona sem internet. Por obra e por folha
// (o canteiro geral ou um pavimento), e cada folha pode ter mais de um mapa ("Fase estrutura",
// "Fase acabamento"). Para sincronizar depois: docs/modulos/8_canteiro.md.
import Dexie, { type Table } from 'dexie'
import { limparItens, type ItemCanteiro } from './logica'

/** Folha que toda obra tem, mesmo sem pavimento cadastrado. */
export const FOLHA_GERAL = 'geral'
/** Fundo sem planta: folha em branco com grade. */
export const FUNDO_GRADE = 'grade'
/** O mapa que toda folha tem (e o único que existia na primeira versão). */
export const MAPA_PRINCIPAL = 'principal'
export const NOME_DO_PRINCIPAL = 'Mapa principal'
export const NOME_DE_MAPA_MAX = 30

export interface MapaGuardado {
  /** "<obra>|<folha>" no mapa principal (como na primeira versão); "<obra>|<folha>|<mapa>" nos outros */
  chave: string
  obraId: string
  /** FOLHA_GERAL ou o id do pavimento */
  folhaId: string
  /** MAPA_PRINCIPAL ou o id do mapa; registro da primeira versão não tem e é o principal */
  mapaId?: string
  nome?: string
  /** FUNDO_GRADE ou o id da planta usada como fundo */
  fundo: string
  itens: ItemCanteiro[]
  atualizadoEm: string
}

export interface MapaDaLista {
  id: string
  nome: string
  figuras: number
}

class BancoDoCanteiro extends Dexie {
  mapas!: Table<MapaGuardado, string>
  constructor() {
    super('sistema-obra-canteiro')
    this.version(1).stores({ mapas: 'chave, obraId' })
  }
}

let banco: BancoDoCanteiro | null = null
const db = () => (banco ??= new BancoDoCanteiro())

const chaveDe = (obraId: string, folhaId: string, mapaId: string) => (mapaId === MAPA_PRINCIPAL ? `${obraId}|${folhaId}` : `${obraId}|${folhaId}|${mapaId}`)

export function nomeDeMapaLimpo(nome: string): string {
  return nome.replace(/\s+/g, ' ').trim().slice(0, NOME_DE_MAPA_MAX)
}

const nomeDe = (m: Pick<MapaGuardado, 'mapaId' | 'nome'>) => (typeof m.nome === 'string' && m.nome ? m.nome : (m.mapaId ?? MAPA_PRINCIPAL) === MAPA_PRINCIPAL ? NOME_DO_PRINCIPAL : 'Mapa')

/** Grava o mapa inteiro (substitui o que havia). `nome` vazio mantém o nome que o mapa já tinha. */
export async function guardarMapa(
  obraId: string,
  folhaId: string,
  mapaId: string,
  dados: { fundo: string; itens: readonly ItemCanteiro[]; nome?: string },
  agora = new Date(),
): Promise<void> {
  const chave = chaveDe(obraId, folhaId, mapaId)
  await db().transaction('rw', db().mapas, async () => {
    const antes = await db().mapas.get(chave)
    const nome = nomeDeMapaLimpo(dados.nome ?? '') || (antes ? nomeDe(antes) : nomeDe({ mapaId }))
    await db().mapas.put({ chave, obraId, folhaId, mapaId, nome, fundo: dados.fundo, itens: dados.itens.map((i) => ({ ...i })), atualizadoEm: agora.toISOString() })
  })
}

/**
 * O mapa pedido, ou um mapa vazio se ainda não há nada. O que estiver estragado é descartado.
 * `fundo: null` = ninguém escolheu fundo ainda neste mapa (a tela sugere a planta, se houver).
 */
export async function lerMapa(obraId: string, folhaId: string, mapaId: string = MAPA_PRINCIPAL): Promise<{ fundo: string | null; itens: ItemCanteiro[] }> {
  const m = await db().mapas.get(chaveDe(obraId, folhaId, mapaId))
  if (!m) return { fundo: null, itens: [] }
  return { fundo: typeof m.fundo === 'string' && m.fundo ? m.fundo : null, itens: limparItens(m.itens) }
}

const daObra = (obraId: string) => db().mapas.where('obraId').equals(obraId).toArray()

/** Os mapas da folha: o principal primeiro (existe sempre), depois os outros pelo nome. */
export async function mapasDaFolha(obraId: string, folhaId: string): Promise<MapaDaLista[]> {
  const ordem = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })
  const lista = (await daObra(obraId))
    .filter((m) => m.folhaId === folhaId)
    .map((m) => ({ id: m.mapaId ?? MAPA_PRINCIPAL, nome: nomeDe(m), figuras: limparItens(m.itens).length }))
  const principal = lista.find((m) => m.id === MAPA_PRINCIPAL) ?? { id: MAPA_PRINCIPAL, nome: NOME_DO_PRINCIPAL, figuras: 0 }
  return [principal, ...lista.filter((m) => m.id !== MAPA_PRINCIPAL).sort((a, b) => ordem.compare(a.nome, b.nome))]
}

/** Troca o nome de um mapa (o principal também pode ter nome). Nome vazio não muda nada. */
export async function renomearMapa(obraId: string, folhaId: string, mapaId: string, nome: string): Promise<void> {
  const limpo = nomeDeMapaLimpo(nome)
  if (!limpo) return
  const atual = await lerMapa(obraId, folhaId, mapaId)
  await guardarMapa(obraId, folhaId, mapaId, { fundo: atual.fundo ?? FUNDO_GRADE, itens: atual.itens, nome: limpo })
}

/** Apaga um mapa. O principal não some da lista: fica vazio e volta ao nome padrão. */
export async function apagarMapa(obraId: string, folhaId: string, mapaId: string): Promise<void> {
  await db().mapas.delete(chaveDe(obraId, folhaId, mapaId))
}

/** Quantas figuras há em cada folha da obra, somando os mapas dela. */
export async function figurasPorFolha(obraId: string): Promise<Map<string, number>> {
  const saida = new Map<string, number>()
  for (const m of await daObra(obraId)) saida.set(m.folhaId, (saida.get(m.folhaId) ?? 0) + limparItens(m.itens).length)
  return saida
}

/** Só para os testes: fecha e apaga o banco do módulo. */
export async function apagarBancoDoCanteiro(): Promise<void> {
  await db().delete()
  banco = null
}

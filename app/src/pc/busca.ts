// Busca única da versão PC: pranchas do Projetos, documentos e PDFs da lista mestra e plantas da FVS
// numa lista só. Aqui só as regras (sem tela), para o teste de unidade.
import { normalizar } from './versao_pc'

export type Origem = 'projetos' | 'documentos' | 'fvs'

export const NOME_DA_ORIGEM: Record<Origem, string> = {
  projetos: 'Prancha (Projetos)',
  documentos: 'Documento',
  fvs: 'Planta da FVS',
}

export interface ItemDaBusca {
  /** única na lista: origem + id */
  chave: string
  origem: Origem
  codigo: string
  titulo: string
  /** disciplina, categoria ou pavimento */
  grupo: string
  revisao: string
  /** AAAA-MM-DD, quando se sabe */
  data: string
  /** onde abrir o arquivo: id do arquivo no aparelho (Documentos) ou link da pasta (Projetos) */
  arquivoId?: string | null
  link?: string | null
  /** texto livre do painel de detalhe */
  detalhe?: string
}

/** Junta as fontes; prancha repetida (mesmo código na base e no cadastro) fica uma vez só, a primeira. */
export function juntar(...fontes: ReadonlyArray<readonly ItemDaBusca[]>): ItemDaBusca[] {
  const vistos = new Set<string>()
  const lista: ItemDaBusca[] = []
  for (const f of fontes) {
    for (const i of f) {
      const k = `${i.origem}|${normalizar(i.codigo || i.chave)}`
      if (vistos.has(k)) continue
      vistos.add(k)
      lista.push(i)
    }
  }
  return lista
}

/** Cada palavra digitada tem que estar no código, no título, no grupo ou na revisão (sem acento). */
export function buscar(lista: readonly ItemDaBusca[], texto: string, origem: Origem | 'todas' = 'todas'): ItemDaBusca[] {
  const palavras = normalizar(texto).split(/\s+/).filter(Boolean)
  return lista.filter((i) => {
    if (origem !== 'todas' && i.origem !== origem) return false
    if (palavras.length === 0) return true
    const alvo = normalizar(`${i.codigo} ${i.titulo} ${i.grupo} ${i.revisao}`)
    return palavras.every((p) => alvo.includes(p))
  })
}

/** Quantos de cada origem, para os botões de filtro. */
export function contarPorOrigem(lista: readonly ItemDaBusca[]): Record<Origem, number> {
  const n: Record<Origem, number> = { projetos: 0, documentos: 0, fvs: 0 }
  for (const i of lista) n[i.origem]++
  return n
}

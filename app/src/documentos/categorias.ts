// Categorias do módulo Documentos, pelos requisitos do PBQP-H (SiAC, Execução de Obras).
// A lista e a origem de cada uma estão em docs/modulos/4_documentos.md (inclusive o que ainda
// precisa ser conferido na norma). Categoria nova ou nome novo: uma linha aqui, sem migração.

export type Escopo = 'empresa' | 'obra'

export interface Categoria {
  id: string
  nome: string
  /** Onde a categoria aparece primeiro no cadastro (a pessoa pode trocar o escopo). */
  escopo: Escopo
}

export const CATEGORIAS: readonly Categoria[] = [
  { id: 'sistema', nome: 'Sistema da qualidade', escopo: 'empresa' },
  { id: 'procedimentos', nome: 'Procedimentos do sistema', escopo: 'empresa' },
  { id: 'pes', nome: 'Procedimentos de execução (PES)', escopo: 'empresa' },
  { id: 'fvs', nome: 'Fichas de verificação de serviço (FVS)', escopo: 'empresa' },
  { id: 'materiais', nome: 'Materiais (FVM)', escopo: 'empresa' },
  { id: 'fornecedores', nome: 'Fornecedores', escopo: 'empresa' },
  { id: 'pessoas', nome: 'Qualificação e treinamento', escopo: 'empresa' },
  { id: 'equipamentos', nome: 'Calibração de equipamentos', escopo: 'obra' },
  { id: 'pqo', nome: 'Plano da Qualidade da Obra (PQO)', escopo: 'obra' },
  { id: 'controle_tecnologico', nome: 'Controle tecnológico', escopo: 'obra' },
  { id: 'nc', nome: 'Não conformidade e ação corretiva', escopo: 'obra' },
  { id: 'auditoria', nome: 'Auditorias e análise crítica', escopo: 'empresa' },
  { id: 'cliente', nome: 'Cliente', escopo: 'obra' },
  { id: 'outros', nome: 'Outros (ART, alvará, licenças, atas)', escopo: 'obra' },
]

const POR_ID = new Map(CATEGORIAS.map((c) => [c.id, c]))

export function nomeDaCategoria(id: string): string {
  return POR_ID.get(id)?.nome ?? id
}

export function ordemDaCategoria(id: string): number {
  const i = CATEGORIAS.findIndex((c) => c.id === id)
  return i < 0 ? CATEGORIAS.length : i
}

export const NOME_DO_ESCOPO: Record<Escopo, string> = { empresa: 'Empresa', obra: 'Obra' }

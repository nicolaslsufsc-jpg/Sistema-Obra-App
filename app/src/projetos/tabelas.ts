// Tabelas do módulo Projetos que o aparelho baixa (supabase/migrations/20261103234000_projetos.sql),
// pais antes dos filhos. listas_autodoc fica só no servidor (é do script do PC).
export const TABELAS_PROJETOS = ['empresas', 'documentos', 'revisoes', 'escritorio_eventos', 'distribuicao_eventos'] as const

/**
 * Lista de distribuição (quem recebe cada projeto): migração 20261120130000_projetos_destinatarios.sql.
 * Bloco à parte, no fim (como as regras da FVS): servidor sem a migração só para esta tabela.
 * Gestor inclui; os outros só leem (regra do servidor; a tela de Distribuição também esconde).
 */
export const TABELA_DESTINATARIOS = 'distribuicao_destinatarios'
export const TABELAS_PROJETOS_DISTRIBUICAO = [TABELA_DESTINATARIOS] as const

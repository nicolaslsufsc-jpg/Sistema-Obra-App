// Tabela do módulo Documentos no servidor: migração 20261120150000_documentos.sql (20/11/2026).
// Fica num arquivo próprio (sem regras nem telas) para o núcleo listar sem carregar o módulo.
// Bloco à parte, no fim (nucleo/tabelas.ts): servidor sem a migração só deixa esta tabela de fora.
// Gestor e admin cadastram; os outros só leem (regra do servidor; a tela também esconde).
export const TABELA_DOCUMENTOS = 'doc_documentos'
export const TABELAS_DOCUMENTOS = [TABELA_DOCUMENTOS] as const

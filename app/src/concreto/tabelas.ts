// Tabelas do módulo Concreto (supabase/migrations/20261103230000_concreto.sql), pais antes dos filhos.
export const TABELAS_CONCRETO = ['concretagens', 'caminhoes', 'caminhao_areas', 'caminhao_elementos', 'cp_resultados'] as const

// FVM (recebimento de materiais, 18/11/2026): AINDA SEM MIGRAÇÃO no servidor. Fora de
// TABELAS_CONCRETO de propósito, para não entrar na baixa nem no envio do servidor (no CI, a
// baixa dava erro nelas e o app nunca chegava a "Sincronizado"). Gravadas só no aparelho, por um
// sincronizador próprio (fvm_dados.ts), e só no app sem conta. Com a migração, passam para a
// lista de cima e o sincronizador próprio sai. Ver docs/modulos/3_concreto.md, pendência 11.
export const TABELAS_FVM = ['materiais_controlados', 'recebimentos'] as const

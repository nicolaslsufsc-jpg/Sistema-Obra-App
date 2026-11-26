// FVM (recebimento de materiais, 18/11/2026; migração 20261120120000_concreto_fvm.sql desde 20/11).
// As duas tabelas não apontam para nenhuma outra do Concreto (o recebimento guarda uma cópia do
// material). Ficam no fim da lista do Concreto: enquanto a migração não estiver aplicada num
// servidor, só elas dão erro na baixa e as outras do Concreto continuam chegando.
// recebimento_usos (onde o lote foi usado, migração 20261125120000_concreto_fvm_usos.sql, 25/11): filha
// de recebimentos, vem depois dela.
export const TABELAS_FVM = ['materiais_controlados', 'recebimentos', 'recebimento_usos'] as const

// Tabelas do módulo Concreto (supabase/migrations/20261103230000_concreto.sql e a do FVM), pais antes dos filhos.
export const TABELAS_CONCRETO = ['concretagens', 'caminhoes', 'caminhao_areas', 'caminhao_elementos', 'cp_resultados', ...TABELAS_FVM] as const

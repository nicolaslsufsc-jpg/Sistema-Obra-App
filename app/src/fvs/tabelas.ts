// Tabelas do módulo FVS (supabase/migrations/20261104100000_fvs.sql), pais antes dos filhos.
export const TABELAS_FVS = ['fichas_modelo', 'plantas', 'fvs_eventos', 'fvs_fotos'] as const

/**
 * Fichas abertas (histórico do sistema oficial) e áreas de laje. Ficam por último na lista do núcleo: a
 * baixa para na primeira tabela com erro, e estas dependem de migrações novas
 * (20261105120000_fvs_fichas_campo.sql, aplicada em 06/11, e 20261106130000_fvs_areas.sql, ainda
 * não). Enquanto faltar uma no servidor, o app avisa do erro, mas as outras tabelas chegam.
 */
export const TABELAS_FVS_HISTORICO = ['fvs_fichas_campo', 'fvs_areas'] as const

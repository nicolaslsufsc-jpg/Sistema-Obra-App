// Tabelas do módulo FVS (supabase/migrations/20261104100000_fvs.sql), pais antes dos filhos.
export const TABELAS_FVS = ['fichas_modelo', 'plantas', 'fvs_eventos', 'fvs_fotos'] as const

/**
 * Fichas abertas (histórico do sistema oficial) e áreas de laje. Ficam por último na lista do núcleo: a
 * baixa para na primeira tabela com erro, e estas dependem de migrações novas
 * (20261105120000_fvs_fichas_campo.sql, aplicada em 06/11, e 20261106130000_fvs_areas.sql, ainda
 * não). Enquanto faltar uma no servidor, o app avisa do erro, mas as outras tabelas chegam.
 */
export const TABELAS_FVS_HISTORICO = ['fvs_fichas_campo', 'fvs_areas'] as const

/**
 * Contorno de pilar ou viga redesenhado à mão (migração 20261123120000_fvs_redesenhos.sql, 23/11/2026).
 * Bloco à parte, no fim: num servidor sem a migração, só esta tabela dá erro e as outras continuam chegando.
 */
export const TABELAS_FVS_REDESENHOS = ['fvs_redesenhos'] as const

/**
 * Tratativa de NC: quem resolve, prazo, causa, concessão e eficácia (migração 20261125150000_fvs_tratativas.sql,
 * 25/11/2026). Bloco à parte, no fim: num servidor sem a migração, só esta tabela dá erro e as outras continuam chegando.
 */
export const TABELAS_FVS_TRATATIVAS = ['fvs_tratativas'] as const

// Tabelas que o aparelho baixa para cada obra, na ordem (pais antes dos filhos).
// Módulo novo: acrescente aqui as tabelas que ele precisa ter offline
// (e chame nucleo.preparar_tabela() nelas na migração do módulo).
// A baixa para na primeira tabela com erro: tabela cuja migração ainda não foi aplicada no
// servidor vai para o fim, para não travar as que já existem.
import { TABELAS_NUCLEO } from '../config'
import { TABELAS_CONCRETO } from '../concreto/tabelas'
import { TABELAS_FVS, TABELAS_FVS_HISTORICO } from '../fvs/tabelas'
import { TABELAS_PROJETOS } from '../projetos/tabelas'
import { TABELAS_RELATORIOS } from '../relatorios/tabelas'

export const TABELAS_SINCRONIZADAS: readonly string[] = [
  ...TABELAS_NUCLEO,
  ...TABELAS_FVS,
  ...TABELAS_CONCRETO,
  ...TABELAS_PROJETOS,
  ...TABELAS_RELATORIOS,
  // em 07/11 a migração das áreas de laje (20261106130000_fvs_areas.sql) ainda não estava aplicada
  ...TABELAS_FVS_HISTORICO,
]

/**
 * As mesmas tabelas em blocos: o núcleo baixa primeiro (os módulos apontam para ele) e depois
 * os módulos baixam ao mesmo tempo, cada um na própria ordem. Módulo só aponta para o núcleo
 * e para as próprias tabelas, então "pais antes dos filhos" continua valendo. Módulo novo:
 * acrescente a lista dele aqui também.
 */
export const BLOCOS_SINCRONIZADOS: readonly (readonly string[])[] = [
  TABELAS_NUCLEO,
  TABELAS_FVS,
  TABELAS_CONCRETO,
  TABELAS_PROJETOS,
  TABELAS_RELATORIOS,
  // Bloco à parte: a tabela cuja migração ainda não foi aplicada no servidor só para este bloco.
  TABELAS_FVS_HISTORICO,
]

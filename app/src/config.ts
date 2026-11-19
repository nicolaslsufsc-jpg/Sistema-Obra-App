// Configuração pública do Supabase. A publishable key é pública por definição
// (o acesso aos dados é controlado pelas regras RLS no banco), então pode ficar no código.
// Chave secret/service_role e senha do banco NUNCA entram aqui: ficam no .env do PC.
//
// VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY só existem para os testes locais
// (supabase/testes/rodar_integracao.sh). No uso normal valem os valores abaixo.
// Projeto zktsuwxgvvyufuihkndj (São Paulo, desde 04/11/2026). O antigo, wtptoyvyypaeotxiqupy (EUA), foi desativado.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zktsuwxgvvyufuihkndj.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_UkMxFtS6lcprzAlWCpxwHQ_KKLLJ0op'

// Nome do bucket de arquivos de obra (criado na migração do núcleo).
export const BUCKET_OBRAS = 'obras'

// Onde o supabase-js guarda a sessão no navegador.
export const CHAVE_SESSAO = 'sistema-obra-sessao'

// Tabelas do núcleo baixadas para cada obra. Os módulos acrescentam as suas em
// TABELAS_SINCRONIZADAS (src/nucleo/tabelas.ts).
export const TABELAS_NUCLEO = ['pavimentos', 'setores', 'elementos', 'arquivos'] as const

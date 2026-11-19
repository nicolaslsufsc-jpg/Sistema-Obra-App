import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CHAVE_SESSAO, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config'

/** Cliente do Supabase do app. A sessão fica guardada no navegador (CHAVE_SESSAO). */
export function criarCliente(url = SUPABASE_URL, chave = SUPABASE_PUBLISHABLE_KEY): SupabaseClient {
  return createClient(url, chave, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // login por código: não há link de volta
      storageKey: CHAVE_SESSAO,
    },
  })
}

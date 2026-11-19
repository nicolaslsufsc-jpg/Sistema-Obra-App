/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/preact" />

interface ImportMetaEnv {
  // Só para testes locais: apontam o app para o servidor de teste em vez do Supabase.
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

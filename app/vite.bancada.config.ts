// Compila a bancada da FVS (dev/fvs.html) como site pronto, para o pacote do PC da empresa
// (pipeline/fvs/montar_entrega.py). Não é o app publicado: sem login, sem service worker e sem
// falar com o servidor. Uso: npx vite build --config vite.bancada.config.ts --outDir PASTA
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  // nada da bancada vai para o Supabase de verdade (o mesmo que o teste de tela faz)
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:9') },
  build: { rollupOptions: { input: resolve(import.meta.dirname, 'dev/fvs.html') } },
})

import { resolve } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import { semDadosDeObra } from './sem_dados_de_obra'

// Mesmo padrão de src/config.ts: servidor dos testes (VITE_SUPABASE_URL) ou o de São Paulo.
const SUPABASE_PADRAO = 'https://zktsuwxgvvyufuihkndj.supabase.co'

/**
 * Lista de permissões do navegador (Content-Security-Policy), só no app compilado (o modo de
 * desenvolvimento do Vite precisa de scripts soltos). O app só roda o próprio código e só fala
 * com o próprio endereço e com o Supabase. Se algum dia entrar um texto malicioso numa tela, o
 * navegador não deixa ele rodar script de fora nem mandar o login para outro lugar.
 * Serviço novo (mapa de fora, fonte, etc.): acrescente o endereço aqui.
 */
function listaDePermissoes(supabase: string): Plugin {
  const origem = new URL(supabase).origin
  const ws = origem.replace(/^http/, 'ws')
  const politica = [
    "default-src 'self'",
    // 'wasm-unsafe-eval': o leitor de IFC (web-ifc) é um programa WebAssembly do próprio app.
    "script-src 'self' 'wasm-unsafe-eval'",
    // Telas e Leaflet mexem em style pelo JavaScript; estilo não roda código.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ${origem} ${ws} blob: data:`,
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  return {
    name: 'lista-de-permissoes',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: politica }, injectTo: 'head-prepend' },
    ],
  }
}

export default defineConfig(({ mode }) => ({
  // O leitor de IFC usa o web-ifc dentro de um worker: sem isto, o Vite só o descobre com a tela
  // aberta e recarrega a página no meio da leitura (só acontece em desenvolvimento).
  optimizeDeps: { include: ['web-ifc'] },
  // Duas páginas: o app (index.html) e a Nova obra (nova_obra.html, docs/modulos/nova_obra.md), que fica
  // fora da casca até o botão no menu sem conta ser aprovado.
  build: { rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), nova_obra: resolve(import.meta.dirname, 'nova_obra.html') } } },
  plugins: [
    preact(),
    semDadosDeObra(),
    listaDePermissoes(process.env.VITE_SUPABASE_URL || loadEnv(mode, process.cwd()).VITE_SUPABASE_URL || SUPABASE_PADRAO),
    VitePWA({
      // "prompt": versão nova só entra quando a pessoa toca em "Atualizar".
      // Nunca recarrega sozinho no meio de uma conferência.
      registerType: 'prompt',
      // O manifesto vai com o cookie: atrás do Cloudflare Access (README), sem isto o Chrome pede o
      // manifesto sem login, recebe a página do Access e não oferece "Instalar app".
      useCredentials: true,
      includeAssets: ['icone.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Sistema Obra',
        short_name: 'Obra',
        description: 'FVS, projetos, concreto e documentos da obra, com uso offline.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f4f6f8',
        theme_color: '#1f4e79',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Só a casca do app vai para o cache. Dados do Supabase nunca passam pelo cache:
        // o que é offline fica no banco local (IndexedDB).
        // .wasm: o leitor de IFC precisa dele para abrir sem internet; é maior que o limite padrão de 2 MB.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webmanifest,wasm}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
}))

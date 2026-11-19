// Tema antes da primeira pintura (mesma chave de src/telas/tema.ts). Arquivo à parte porque a
// política de segurança do app (vite.config.ts) não deixa rodar script escrito dentro do HTML.
try {
  if (localStorage.getItem('tema') === 'claro') document.documentElement.dataset.tema = 'claro'
} catch (e) {}

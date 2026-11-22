// Tema antes da primeira pintura (mesma chave de src/telas/tema.ts). Arquivo à parte porque a
// política de segurança do app (vite.config.ts) não deixa rodar script escrito dentro do HTML.
try {
  // claro é o padrão (21/11/2026); só o escuro marca o <html>
  if (localStorage.getItem('tema') === 'escuro') document.documentElement.dataset.tema = 'escuro'
} catch (e) {}

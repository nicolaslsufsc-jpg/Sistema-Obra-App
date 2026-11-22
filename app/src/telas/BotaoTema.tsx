import { useState } from 'preact/hooks'
import { definirTema, lerTema } from './tema'

/** Botão do menu: no claro (padrão) oferece o "Tema escuro"; no escuro, volta ao claro. */
export function BotaoTema() {
  const [tema, setTema] = useState(lerTema)
  const trocar = () => {
    const novo = tema === 'claro' ? 'escuro' : 'claro'
    definirTema(novo)
    setTema(novo)
  }
  // No topo só cabe o ícone (20/11/2026): o nome completo fica no aria-label e na dica.
  const nome = tema === 'claro' ? 'Tema escuro' : 'Tema claro'
  return (
    <button type="button" class="botao-tema" data-testid="botao-tema" aria-pressed={tema === 'escuro'} aria-label={nome} title={nome} onClick={trocar}>
      {tema === 'claro' ? <IconeLua /> : <IconeSol />}
    </button>
  )
}

// Ícones desenhados (os símbolos de texto ☀/☾ mudam de cara em cada aparelho)
function IconeSol() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      <path d="M12 1.5v2.5M12 20v2.5M1.5 12h2.5M20 12h2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
    </svg>
  )
}
function IconeLua() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </svg>
  )
}

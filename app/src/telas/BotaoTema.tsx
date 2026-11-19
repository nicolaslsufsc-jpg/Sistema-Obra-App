import { useState } from 'preact/hooks'
import { definirTema, lerTema } from './tema'

/** Botão do menu: no escuro oferece o "Modo sol (claro)"; no claro, volta ao escuro. */
export function BotaoTema() {
  const [tema, setTema] = useState(lerTema)
  const trocar = () => {
    const novo = tema === 'claro' ? 'escuro' : 'claro'
    definirTema(novo)
    setTema(novo)
  }
  return (
    <button type="button" class="botao-tema" data-testid="botao-tema" aria-pressed={tema === 'claro'} onClick={trocar}>
      {tema === 'claro' ? 'Modo escuro' : 'Modo sol (claro)'}
    </button>
  )
}

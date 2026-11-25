// Ajuda curta (guia de estilo, docs/DESIGN.md › Textos, 23/11/2026): o texto que explica a tela
// não fica no meio dela; fica num "?" que abre um texto curto ao tocar (e fecha ao tocar de novo).
// Só elementos de frase (button e span), para caber dentro de um parágrafo ou de um título.
import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import './ajuda.css'

export function Ajuda({ children, testid }: { children: ComponentChildren; testid?: string }) {
  const [aberta, setAberta] = useState(false)
  return (
    <span class={`so-ajuda${aberta ? ' aberta' : ''}`} data-testid={testid}>
      <button type="button" class="so-ajuda-botao" aria-label="Ajuda" title="Ajuda" aria-expanded={aberta} onClick={() => setAberta(!aberta)}>
        <span aria-hidden="true">?</span>
      </button>
      <span class="so-ajuda-texto" role="note" hidden={!aberta}>
        {children}
      </span>
    </span>
  )
}

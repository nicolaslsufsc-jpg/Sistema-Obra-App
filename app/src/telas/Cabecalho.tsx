// Cabeçalho comum das telas dos módulos (guia de estilo, docs/DESIGN.md, 21/11/2026):
// voltar à esquerda (só a seta, sempre igual), título no centro (quebra em duas linhas, nunca "..."),
// ações à direita (Exportar PDF, Reportar...). Os Topo dos módulos usam este componente.
import { createContext, type ComponentChildren } from 'preact'
import { useContext } from 'preact/hooks'
import './cabecalho.css'

/** Ações que o módulo põe em todo cabeçalho dele (o "Reportar", no Concreto), depois das da tela. */
export const AcoesDoModulo = createContext<ComponentChildren>(null)

export function Cabecalho({
  titulo,
  sub,
  aoVoltar,
  paraMenu = false,
  classe,
  children,
}: {
  titulo: string
  sub?: string
  aoVoltar: () => void
  /** a seta leva ao menu do app: muda só o nome lido pelo leitor de tela, a seta é a mesma */
  paraMenu?: boolean
  /** classe do módulo (cc-topo, pj-topo...), para o que cada módulo ainda ajusta */
  classe?: string
  children?: ComponentChildren
}) {
  const doModulo = useContext(AcoesDoModulo)
  return (
    <header class={`so-cabecalho${classe ? ` ${classe}` : ''}`} data-testid="cabecalho">
      <button type="button" class="so-cab-voltar" onClick={aoVoltar} aria-label={paraMenu ? 'Voltar ao menu' : 'Voltar'} title={paraMenu ? 'Voltar ao menu' : 'Voltar'}>
        <span aria-hidden="true">‹</span>
      </button>
      <div class="so-cab-titulo">
        <h1>{titulo}</h1>
        {sub && <p class="so-cab-sub">{sub}</p>}
      </div>
      {(children || doModulo) && (
        <div class="so-cab-acoes">
          {children}
          {doModulo}
        </div>
      )}
    </header>
  )
}

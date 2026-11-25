// Tabela comum (guia de estilo, docs/DESIGN.md › Layout e Componentes, 21/11/2026):
// cabeçalho fixo, linha fina entre as linhas, 40 px de altura no mínimo, números à direita com
// algarismos de largura fixa, unidade só no cabeçalho, "–" quando não há dado.
// Em uso no Concreto (pavimentos, concretagens, ficha do dia) e no Projetos (resumo e pranchas), desde 23/11/2026.
import type { ComponentChildren } from 'preact'
import { textoDaCelulaTabela, textoDoResumo, type ValorCelula } from './tabela_formato'
import './tabela.css'

export type Status = 'liberado' | 'pendente' | 'nc' | 'sem-dado'

export interface ColunaTabela<L> {
  /** com a unidade, quando houver: "Volume (m³)" */
  titulo: string
  /** título curto para o celular (até 480 px), quando o longo não cabe: "Conc." */
  tituloCurto?: string
  valor: (linha: L) => ValorCelula | ComponentChildren
  /** coluna de número ou data: à direita, tabular-nums */
  numero?: boolean
  /** casas decimais fixas (volume: 1) */
  casas?: number
}

export function Tabela<L>({
  colunas,
  linhas,
  chave,
  aoTocar,
  selecionada,
  rotulo,
  testid,
  atributos,
}: {
  colunas: ReadonlyArray<ColunaTabela<L>>
  linhas: readonly L[]
  chave: (linha: L) => string
  /** toque na linha (abre o item): a linha vira botão para o teclado também */
  aoTocar?: (linha: L) => void
  selecionada?: string | null
  /** nome da tabela para o leitor de tela */
  rotulo: string
  testid?: string
  /** atributos data-* de cada linha (data-codigo...), para os testes e para quem precisar achar a linha */
  atributos?: (linha: L) => Record<`data-${string}`, string>
}) {
  return (
    <div class="so-tabela-caixa" data-testid={testid}>
      <table class="so-tabela" aria-label={rotulo}>
        <thead>
          <tr>
            {colunas.map((c) => (
              <th scope="col" class={c.numero ? 'so-num' : undefined}>
                {c.tituloCurto ? (
                  <>
                    <span class="so-th-longo">{c.titulo}</span>
                    <abbr class="so-th-curto" title={c.titulo}>
                      {c.tituloCurto}
                    </abbr>
                  </>
                ) : (
                  c.titulo
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const k = chave(l)
            return (
              <tr
                key={k}
                {...(atributos ? atributos(l) : {})}
                class={`${aoTocar ? 'so-tocavel' : ''}${selecionada === k ? ' so-selecionada' : ''}`}
                tabIndex={aoTocar ? 0 : undefined}
                onClick={aoTocar ? () => aoTocar(l) : undefined}
                onKeyDown={aoTocar ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), aoTocar(l)) : undefined}
              >
                {colunas.map((c) => {
                  const v = c.valor(l)
                  const simples = v === null || v === undefined || typeof v === 'string' || typeof v === 'number'
                  return <td class={c.numero ? 'so-num' : undefined}>{simples ? textoDaCelulaTabela(v as ValorCelula, c.casas) : v}</td>
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Resumo numa linha só, no topo da tabela: "9 vigentes | 4 com revisão nova | 1 atrasado". */
export function LinhaResumo({ partes, testid }: { partes: ReadonlyArray<string | null | undefined | false>; testid?: string }) {
  const texto = textoDoResumo(partes)
  if (!texto) return null
  return (
    <p class="so-resumo" data-testid={testid}>
      {texto}
    </p>
  )
}

/** Status com cor e texto (cor sozinha não basta). */
export function EtiquetaStatus({ status, children }: { status: Status; children: ComponentChildren }) {
  return (
    <span class={`so-status so-status-${status}`} data-status={status}>
      <span class="so-status-bola" aria-hidden="true" />
      {children}
    </span>
  )
}

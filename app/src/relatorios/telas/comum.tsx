import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { dataBR, diaDaSemana } from '../regras'
import type { Opcao } from '../tipos'

export function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`
}

export function numBR(v: unknown, casas = 2): string {
  if (v === null || v === undefined || v === '') return ''
  return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas })
}

/** "sexta-feira, 06/11/2026" */
export function dataPorExtenso(data: string): string {
  return `${diaDaSemana(data)}, ${dataBR(data)}`
}

export function Topo({ titulo, sub, aoVoltar, children }: { titulo: string; sub?: string; aoVoltar: () => void; children?: ComponentChildren }) {
  return (
    <header class="rl-topo nao-imprimir">
      <button type="button" class="rl-voltar" onClick={aoVoltar} aria-label="Voltar">
        ‹ Voltar
      </button>
      <div class="rl-titulo">
        <h1>{titulo}</h1>
        {sub && <p class="discreto">{sub}</p>}
      </div>
      {children}
    </header>
  )
}

export type Tom = 'bom' | 'ruim' | 'info' | 'neutro'

export function Selo({ tom, children }: { tom: Tom; children: ComponentChildren }) {
  return <span class={`rl-selo ${tom}`}>{children}</span>
}

/** Botões de uma escolha só. Tocar no escolhido desmarca, se `limpavel`. */
export function Chips({
  opcoes,
  valor,
  aoEscolher,
  rotulo,
  limpavel = true,
  desativado = false,
  teste,
}: {
  opcoes: readonly Opcao[]
  valor: string | null | undefined
  aoEscolher: (v: string | null) => void
  rotulo: string
  limpavel?: boolean
  desativado?: boolean
  teste?: string
}) {
  return (
    <div class="rl-chips" role="group" aria-label={rotulo} data-testid={teste}>
      {opcoes.map((o) => (
        <button
          type="button"
          key={o.v}
          class={`rl-chip${valor === o.v ? ' on' : ''}`}
          aria-pressed={valor === o.v}
          disabled={desativado}
          onClick={() => aoEscolher(valor === o.v ? (limpavel ? null : o.v) : o.v)}
        >
          {o.t}
        </button>
      ))}
    </div>
  )
}

/** Mensagem que some sozinha. */
export function usarMensagem(): [string, (m: string) => void] {
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 3500)
    return () => clearTimeout(t)
  }, [msg])
  return [msg, setMsg]
}

export function erroEmTexto(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

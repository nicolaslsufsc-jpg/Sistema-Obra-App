import type { ComponentChildren } from 'preact'
import type { Linha } from '../../nucleo/banco_local'
import { ROTULO_SITUACAO, rotulo, type NomeSituacao } from '../regras'
import { Cabecalho } from '../../telas/Cabecalho'
import { EtiquetaStatus, type ColunaTabela, type Status } from '../../telas/Tabela'

export function dataBR(data: string | null | undefined): string {
  if (!data) return ''
  const [a, m, d] = String(data).slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function horaBR(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

export function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`
}

export function rotuloRevisao(r: Linha | null | undefined): string {
  return r ? rotulo(r) : '—'
}

const CLASSE: Record<NomeSituacao, string> = { OK: 'bom', RECOLHER: 'ruim', DEVOLVIDO: 'neutro', CONFERIR: 'info' }

export function SeloSituacao({ situacao, texto }: { situacao: NomeSituacao; texto?: string }) {
  return (
    <span class={`selo ${CLASSE[situacao]}`} data-situacao={situacao}>
      {texto ?? ROTULO_SITUACAO[situacao]}
    </span>
  )
}

export function Selo({ classe, children }: { classe: 'bom' | 'ruim' | 'neutro' | 'info'; children: ComponentChildren }) {
  return <span class={`selo ${classe}`}>{children}</span>
}

export function Topo({ titulo, sub, aoVoltar, children }: { titulo: string; sub?: string; aoVoltar: () => void; children?: ComponentChildren }) {
  return (
    <Cabecalho titulo={titulo} sub={sub} aoVoltar={aoVoltar} classe="pj-topo">
      {children}
    </Cabecalho>
  )
}

export function Campo({ rotulo: r, erro, dica, children }: { rotulo: string; erro?: string; dica?: string; children: ComponentChildren }) {
  return (
    <label class={`pj-campo${erro ? ' com-erro' : ''}`}>
      <span>{r}</span>
      {children}
      {dica && !erro && <span class="discreto">{dica}</span>}
      {erro && <span class="erro">{erro}</span>}
    </label>
  )
}

/** Mensagem no alto da tela depois de uma ação (some sozinha quando a tela muda). */
export function Mensagem({ texto, tipo = 'ok' }: { texto: string; tipo?: 'ok' | 'erro' }) {
  if (!texto) return null
  return (
    <div class={`faixa-mensagem pj-mensagem ${tipo}`} role="status">
      <p>{texto}</p>
    </div>
  )
}


/** Uma linha da tabela de resumo (no lugar dos cartões com número grande, guia de estilo 23/11/2026). */
export interface LinhaResumoObra {
  id: string
  rotulo: string
  /** data-testid do número (os testes leem o número por ele) */
  testid?: string
  testidRotulo?: string
  /** número, ou "–" quando não se aplica */
  n: number | string
  nota: string
  status: Status
  abrir: () => void
}

const TEXTO_STATUS: Record<Status, string> = { liberado: 'Em dia', pendente: 'Pendente', nc: 'Atrasado', 'sem-dado': 'Sem dado' }

export const COLUNAS_RESUMO: ColunaTabela<LinhaResumoObra>[] = [
  {
    titulo: 'Item',
    valor: (l) => (
      <span class="pj-resumo-item">
        <b data-testid={l.testidRotulo}>{l.rotulo}</b>
        <span class="discreto">{l.nota}</span>
      </span>
    ),
  },
  { titulo: 'Quant.', valor: (l) => <span data-testid={l.testid}>{l.n}</span>, numero: true },
  { titulo: 'Status', valor: (l) => <EtiquetaStatus status={l.status}>{TEXTO_STATUS[l.status]}</EtiquetaStatus> },
]


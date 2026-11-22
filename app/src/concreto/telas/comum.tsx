import type { ComponentChildren } from 'preact'
import { ROTULO_SITUACAO, type SituacaoCP } from '../cps'
import { Cabecalho } from '../../telas/Cabecalho'

export function dataBR(data: string | null | undefined): string {
  if (!data) return ''
  const [a, m, d] = data.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function horaBR(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function numBR(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return ''
  return v.toLocaleString('pt-BR', { maximumFractionDigits: casas })
}

export function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`
}

/** Texto digitado ("8,5" ou "8.5") → número; vazio → null; inválido → NaN. */
export function lerNumero(t: string): number | null {
  const s = t.trim().replace(/\s/g, '').replace(',', '.')
  if (s === '') return null
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN
}

/** Data (AAAA-MM-DD) + hora digitada (HH:MM) → hora ISO no fuso do aparelho. */
export function juntarDataHora(data: string, hora: string): string | null {
  if (!hora) return null
  const [a, m, d] = data.split('-').map(Number)
  const [h, min] = hora.split(':').map(Number)
  return new Date(a, m - 1, d, h, min).toISOString()
}

export function horaParaCampo(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const CLASSE: Record<SituacaoCP, string> = {
  previsto: 'neutro',
  rompe_hoje: 'info',
  aguardando: 'info',
  atrasado: 'ruim',
  abaixo_fck: 'ruim',
  conforme: 'bom',
  informado: 'neutro',
}

export function Selo({ situacao, texto }: { situacao: SituacaoCP; texto?: string }) {
  return (
    <span class={`selo ${CLASSE[situacao]}`} data-situacao={situacao}>
      {texto ?? ROTULO_SITUACAO[situacao]}
    </span>
  )
}

/** Cabeçalho do módulo: o comum do app (telas/Cabecalho.tsx, guia de estilo 21/11/2026). `paraMenu`: a seta leva ao menu do app. */
export function Topo({
  titulo,
  sub,
  aoVoltar,
  paraMenu = false,
  children,
}: {
  titulo: string
  sub?: string
  aoVoltar: () => void
  paraMenu?: boolean
  children?: ComponentChildren
}) {
  return (
    <Cabecalho titulo={titulo} sub={sub} aoVoltar={aoVoltar} paraMenu={paraMenu} classe="cc-topo">
      {children}
    </Cabecalho>
  )
}

/** Cor de cada caminhão no mapa (pela sequência). Contraste bom no sol e no fundo branco. */
const CORES = ['#1565c0', '#c62828', '#2e7d32', '#ef6c00', '#6a1b9a', '#00838f', '#ad1457', '#5d4037', '#283593', '#9e9d24']
export function corDoCaminhao(sequencia: number): string {
  return CORES[(Math.max(1, sequencia) - 1) % CORES.length]
}

// Versão PC (protótipo de 23/11/2026, proposta em docs/modulos/6_frontend.md › "Versão PC").
// Só aparece em tela larga com mouse (PC): o celular e o tablet, que são de toque, ficam iguais a hoje.
// Enquanto é proposta, fica desligada até a pessoa tocar em "Experimentar a versão PC"; a escolha é
// lembrada no aparelho (localStorage) e sai em "Voltar à versão de hoje".
import { useEffect, useState } from 'preact/hooks'

/** A partir daqui o PC ganha a barra lateral (o tablet deitado tem 1280 px, mas é de toque). */
export const LARGURA_PC = 1100
export const CONSULTA_PC = `(min-width: ${LARGURA_PC}px) and (hover: hover) and (pointer: fine)`
const CHAVE = 'versao_pc'

export type PaginaPc = 'painel' | 'relatorios' | 'pranchas'

/** A versão PC vale quando a tela serve (larga e com mouse) e a pessoa ligou. */
export function versaoPcAtiva(telaServe: boolean, escolha: string | null): boolean {
  return telaServe && escolha === 'ligada'
}

function lerEscolha(): string | null {
  try {
    return localStorage.getItem(CHAVE)
  } catch {
    return null
  }
}

function gravarEscolha(v: 'ligada' | 'desligada') {
  try {
    localStorage.setItem(CHAVE, v)
  } catch {
    // aba anônima ou armazenamento bloqueado: vale só até fechar
  }
}

function telaDePc(): boolean {
  return typeof matchMedia === 'function' && matchMedia(CONSULTA_PC).matches
}

/** Se a tela é de PC agora (muda ao redimensionar a janela) e se a pessoa ligou a versão PC. */
export function usarVersaoPc(): { serve: boolean; ativa: boolean; ligar: () => void; desligar: () => void } {
  const [serve, setServe] = useState(telaDePc)
  const [escolha, setEscolha] = useState(lerEscolha)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia(CONSULTA_PC)
    const mudou = () => setServe(mq.matches)
    mq.addEventListener('change', mudou)
    return () => mq.removeEventListener('change', mudou)
  }, [])
  return {
    serve,
    ativa: versaoPcAtiva(serve, escolha),
    ligar: () => {
      gravarEscolha('ligada')
      setEscolha('ligada')
    },
    desligar: () => {
      gravarEscolha('desligada')
      setEscolha('desligada')
    },
  }
}

/** Sem acento e em minúsculas, para a busca. */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** AAAA-MM-DD dentro do período (as pontas valem; ponta vazia = sem limite). Data vazia só passa sem período. */
export function noPeriodo(dia: string | null | undefined, de: string, ate: string): boolean {
  if (!de && !ate) return true
  const d = (dia ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  return (!de || d >= de) && (!ate || d <= ate)
}

/** "de 01/11/2026 a 23/11/2026", "desde 01/11/2026", "até 23/11/2026" ou "todo o período". */
export function textoDoPeriodo(de: string, ate: string): string {
  const br = (d: string) => d.split('-').reverse().join('/')
  if (de && ate) return `de ${br(de)} a ${br(ate)}`
  if (de) return `desde ${br(de)}`
  if (ate) return `até ${br(ate)}`
  return 'todo o período'
}

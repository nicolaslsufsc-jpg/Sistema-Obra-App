// A FVS lê os dados da obra por trás enquanto o menu está na tela (aprovado pelo Professor em 21/11: a
// primeira abertura levava ~3 s no tablet). Este arquivo fica no app principal e é leve: só agenda. A
// leitura (pre_leitura.ts, com o código da FVS) é carregada quando o aparelho está livre, depois que o menu
// já apareceu, e não grava nada: nem banco, nem fila, nem sincronização.

/** Espera antes de começar: a primeira tela e a sincronização de abertura vêm antes. */
const ESPERA_MS = 800

/** Agenda a leitura antecipada. Devolve o cancelamento (sair do menu antes de ela começar). */
export function lerFvsAntes(obraId: string, usuarioId: string): () => void {
  let cancelado = false
  let ocioso: number | undefined
  const w = window as Window & {
    requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  const ir = () => {
    if (cancelado) return
    import('./pre_leitura')
      .then((m) => {
        if (!cancelado) return m.preLerFvs(obraId, usuarioId)
      })
      .catch(() => {}) // sem o arquivo (versão nova do app chegando): a FVS lê ao abrir, como antes
  }
  const relogio = window.setTimeout(() => {
    if (w.requestIdleCallback) ocioso = w.requestIdleCallback(ir, { timeout: 5000 })
    else ir()
  }, ESPERA_MS)
  return () => {
    cancelado = true
    window.clearTimeout(relogio)
    if (ocioso !== undefined) w.cancelIdleCallback?.(ocioso)
  }
}

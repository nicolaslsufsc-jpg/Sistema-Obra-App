// Procura versão nova do app ao abrir e ao voltar para a aba (reteste com cabo, 20/11/2026): recarregar
// a aba duas vezes não mostrou a faixa "Versão nova do app disponível"; só apareceu depois de forçar a
// verificação do service worker. O Chrome só confere o sw.js de vez em quando; aqui o app pede a
// conferência (registration.update()). Não muda a estratégia de cache nem atualiza sozinho: a versão nova
// fica esperando e a faixa pede o toque em "Atualizar" (registerType 'prompt', vite.config.ts).

/** O que o app usa do registro do service worker (dá para testar sem navegador). */
export interface RegistroSw {
  update(): Promise<unknown>
}

interface Ambiente {
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>
  window: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setInterval' | 'clearInterval'>
  online: () => boolean
}

/** Com a aba aberta muito tempo (tablet ligado o dia todo), confere também a cada 30 min. */
export const CADA_30_MIN = 30 * 60_000

function ambienteDoNavegador(): Ambiente {
  return { document, window, online: () => navigator.onLine }
}

/** Confere agora e sempre que a aba volta a ficar visível ou a internet volta. Devolve quem desliga. */
export function checarAtualizacao(registro: RegistroSw, amb: Ambiente = ambienteDoNavegador()): () => void {
  const checar = () => {
    if (amb.document.visibilityState !== 'visible' || !amb.online()) return
    // sem rede no meio, ou outra conferência já em andamento: tenta de novo na próxima vez
    registro.update().catch(() => undefined)
  }
  const aoMudarVisibilidade = () => checar()
  amb.document.addEventListener('visibilitychange', aoMudarVisibilidade)
  amb.window.addEventListener('online', checar)
  const relogio = amb.window.setInterval(checar, CADA_30_MIN)
  checar()
  return () => {
    amb.document.removeEventListener('visibilitychange', aoMudarVisibilidade)
    amb.window.removeEventListener('online', checar)
    amb.window.clearInterval(relogio)
  }
}

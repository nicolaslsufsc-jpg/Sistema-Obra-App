// Tema do app: claro por padrão (guia de estilo, 21/11/2026); o escuro é opção no menu. Até 21/11 o escuro era
// o padrão: quem tinha escolhido o escuro de volta ("escuro" guardado) continua nele; sem escolha, fica o claro.
// A escolha fica no aparelho. O index.html aplica a mesma chave antes da primeira pintura, para a tela não piscar.
export type Tema = 'escuro' | 'claro'
export const CHAVE_TEMA = 'tema'

export function lerTema(): Tema {
  try {
    return localStorage.getItem(CHAVE_TEMA) === 'escuro' ? 'escuro' : 'claro'
  } catch {
    return 'claro'
  }
}

export function aplicarTema(tema: Tema, raiz: HTMLElement = document.documentElement) {
  if (tema === 'escuro') raiz.dataset.tema = 'escuro'
  else delete raiz.dataset.tema
}

export function definirTema(tema: Tema, raiz: HTMLElement = document.documentElement) {
  try {
    localStorage.setItem(CHAVE_TEMA, tema)
  } catch {
    // sem armazenamento (aba anônima): vale só até fechar
  }
  aplicarTema(tema, raiz)
}

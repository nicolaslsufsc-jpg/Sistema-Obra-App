// Tema do app: escuro por padrão; "Modo sol" deixa claro (igual ao app até 14/11/2026), para o tablet no sol.
// A escolha fica no aparelho. O index.html aplica a mesma chave antes da primeira pintura, para a tela não piscar.
export type Tema = 'escuro' | 'claro'
export const CHAVE_TEMA = 'tema'

export function lerTema(): Tema {
  try {
    return localStorage.getItem(CHAVE_TEMA) === 'claro' ? 'claro' : 'escuro'
  } catch {
    return 'escuro'
  }
}

export function aplicarTema(tema: Tema, raiz: HTMLElement = document.documentElement) {
  if (tema === 'claro') raiz.dataset.tema = 'claro'
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

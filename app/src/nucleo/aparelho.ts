// Informações do aparelho: armazenamento persistente e instalação do app.

/** Pede ao navegador para não apagar os dados do app quando faltar espaço. */
export async function pedirArmazenamentoPersistente(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function armazenamentoPersistente(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false
  } catch {
    return false
  }
}

export async function espacoUsado(): Promise<{ usado: number; total: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.()
    return e ? { usado: e.usage ?? 0, total: e.quota ?? 0 } : null
  } catch {
    return null
  }
}

// O Chrome avisa cedo que o app pode ser instalado; guardamos o aviso para o botão "Instalar".
interface EventoInstalacao extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
let eventoInstalacao: EventoInstalacao | null = null
const ouvintes = new Set<() => void>()

export function ouvirInstalacao() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    eventoInstalacao = e as EventoInstalacao
    ouvintes.forEach((f) => f())
  })
  window.addEventListener('appinstalled', () => {
    eventoInstalacao = null
    ouvintes.forEach((f) => f())
  })
}

export function podeInstalar(): boolean {
  return eventoInstalacao !== null
}

export function aoMudarInstalacao(f: () => void): () => void {
  ouvintes.add(f)
  return () => ouvintes.delete(f)
}

export async function instalar(): Promise<boolean> {
  if (!eventoInstalacao) return false
  await eventoInstalacao.prompt()
  const { outcome } = await eventoInstalacao.userChoice
  eventoInstalacao = null
  ouvintes.forEach((f) => f())
  return outcome === 'accepted'
}

export function formatarBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1).replace('.', ',')} GB`
}

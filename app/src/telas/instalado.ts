// O app já está instalado neste aparelho? (20/11/2026, achado do testador: a faixa "Instale o app"
// aparecia na aba do Chrome com o app já instalado.)
// Três sinais, do mais certo ao mais fraco:
//  1. a tela está aberta como app (display-mode standalone, ou o "standalone" do Safari);
//  2. getInstalledRelatedApps, onde o navegador tem (Chrome do Android): o manifesto se lista em related_applications;
//  3. a marca guardada no armazenamento local quando o Chrome avisa que instalou (evento appinstalled).
// Se o Chrome volta a oferecer a instalação (beforeinstallprompt), o app foi desinstalado: a marca sai.

const MARCA = 'app_instalado'
const ouvintes = new Set<() => void>()

function avisar() {
  ouvintes.forEach((f) => f())
}

function guardarMarca(sim: boolean) {
  try {
    if (sim) localStorage.setItem(MARCA, '1')
    else localStorage.removeItem(MARCA)
  } catch {
    // armazenamento bloqueado: fica só nos outros sinais
  }
}

function temMarca(): boolean {
  try {
    return localStorage.getItem(MARCA) === '1'
  } catch {
    return false
  }
}

/** A tela está aberta como app instalado (não numa aba do navegador). */
export function abertoComoApp(): boolean {
  try {
    if (matchMedia('(display-mode: standalone)').matches) return true
  } catch {
    // sem matchMedia: segue
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** Liga os ouvintes uma vez, quando o app abre (este arquivo é carregado junto com o menu). */
if (typeof window !== 'undefined') {
  window.addEventListener('appinstalled', () => {
    guardarMarca(true)
    avisar()
  })
  window.addEventListener('beforeinstallprompt', () => {
    if (!temMarca()) return
    guardarMarca(false)
    avisar()
  })
}

/** true quando algum dos três sinais diz que o app está instalado neste aparelho. */
export async function appInstalado(): Promise<boolean> {
  if (abertoComoApp()) {
    guardarMarca(true)
    return true
  }
  if (temMarca()) return true
  try {
    const buscar = (navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> }).getInstalledRelatedApps
    if (buscar) {
      const apps = await buscar.call(navigator)
      if (apps.length > 0) {
        guardarMarca(true)
        return true
      }
    }
  } catch {
    // o navegador recusou a pergunta: segue sem esse sinal
  }
  return false
}

/** Chama `f` quando a instalação muda (instalou nesta aba, ou o Chrome voltou a oferecer). Devolve o desligar. */
export function aoMudarAppInstalado(f: () => void): () => void {
  ouvintes.add(f)
  return () => {
    ouvintes.delete(f)
  }
}

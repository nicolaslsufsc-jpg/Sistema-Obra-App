// Os últimos erros do app, para ir junto com o reporte. Só em memória (somem ao fechar o app),
// já limpos de dado pessoal (coleta.ts). Instala uma vez, quando o módulo que tem o botão abre.
import { limparTexto } from './coleta'

export const MAX_ERROS = 20

export class AnelDeErros {
  private readonly itens: string[] = []
  constructor(private readonly max = MAX_ERROS) {}

  anotar(origem: string, valor: unknown) {
    const msg = valor instanceof Error ? `${valor.name}: ${valor.message}` : typeof valor === 'string' ? valor : safeJson(valor)
    const hora = new Date().toLocaleTimeString('pt-BR')
    this.itens.push(limparTexto(`${hora} [${origem}] ${msg}`))
    if (this.itens.length > this.max) this.itens.splice(0, this.itens.length - this.max)
  }

  lista(): string[] {
    return [...this.itens]
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v)
  } catch {
    return String(v)
  }
}

export const errosRecentes = new AnelDeErros()
let instalado = false

/** Escuta erros não tratados e console.error. Chamar mais de uma vez não duplica. */
export function instalarCapturaDeErros(alvo: Window | undefined = typeof window === 'undefined' ? undefined : window) {
  // fora do navegador (testes que importam o módulo no Node) não há o que escutar
  if (instalado || !alvo) return
  instalado = true
  alvo.addEventListener('error', (e) => errosRecentes.anotar('erro', (e as ErrorEvent).error ?? (e as ErrorEvent).message))
  alvo.addEventListener('unhandledrejection', (e) => errosRecentes.anotar('promessa', (e as PromiseRejectionEvent).reason))
  const original = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    errosRecentes.anotar('console', args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : safeJson(a))).join(' '))
    original(...args)
  }
}

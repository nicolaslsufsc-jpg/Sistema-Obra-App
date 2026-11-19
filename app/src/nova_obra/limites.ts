// Nova obra: limites para um PDF pesado não travar a aba (achados do Revisor de 09/11/2026).
// Fica fora do pdf.ts para os testes rodarem no Node sem o trabalhador do pdf.js.

/** Arquivo maior que isso nem abre: o navegador do tablet não aguenta ler tudo na memória. */
export const PDF_MAXIMO_BYTES = 200 * 1024 * 1024

/** A Nova obra lê só a primeira página: PDF com mais páginas que isso é recusado (o pdf.js indexa todas). */
export const PAGINAS_MAXIMAS = 20

/**
 * Imagem dentro do PDF acima disso (largura x altura, em pixels) não é desenhada: 50 Mpx são 200 MB
 * descomprimidos. O pdf.js pula a imagem e desenha o resto; se a planta for só essa imagem (digitalização),
 * sai em branco e a tela avisa com PLANTA_EM_BRANCO.
 */
export const IMAGEM_MAXIMA_PIXELS = 50_000_000

/** Até onde o pdf.js usa um canvas para reduzir imagem no trabalhador (sem isso ele "adivinha" testando, devagar). */
export const CANVAS_MAXIMO_BYTES = 64 * 1024 * 1024

/** Página: lado até 14.400 pontos (5,08 m, o limite do formato PDF) e área até 25 milhões de pontos² (uns 3 A0). */
export const LADO_MAXIMO_PT = 14_400
export const AREA_MAXIMA_PT2 = 25_000_000

/**
 * Opções do pdf.getDocument. isEvalSupported: o pdf.js 6 já não usa eval, mas se alguém voltar para uma
 * versão antiga a opção impede que ele tente (a CSP do app não libera eval no trabalhador).
 */
export const OPCOES_PDF = {
  enableXfa: false,
  isEvalSupported: false,
  maxImageSize: IMAGEM_MAXIMA_PIXELS,
  canvasMaxAreaInBytes: CANVAS_MAXIMO_BYTES,
} as const

export const PLANTA_EM_BRANCO = `A planta saiu em branco. Se o PDF é uma digitalização ou foto, a imagem passa de ${IMAGEM_MAXIMA_PIXELS / 1_000_000} milhões de pixels e o app não desenha (travaria a aba). Exporte a prancha em vetor ou digitalize com resolução menor.`

const mb = (b: number) => `${Math.round(b / 1024 / 1024)} MB`
const metros = (pt: number) => `${((pt * 0.0254) / 72).toFixed(2).replace('.', ',')} m`

/** null se o arquivo pode abrir; senão, o motivo em português. */
export function conferirArquivo(nome: string, bytes: number): string | null {
  if (bytes <= PDF_MAXIMO_BYTES) return null
  return `${nome} tem ${mb(bytes)}, e o app abre PDF de até ${mb(PDF_MAXIMO_BYTES)}. Exporte só a prancha da planta de forma (uma página, sem imagens de fundo) e suba de novo.`
}

/** null se o número de páginas serve; senão, o motivo em português. */
export function conferirPaginas(n: number): string | null {
  if (n >= 1 && n <= PAGINAS_MAXIMAS) return null
  if (n < 1) return 'O PDF não tem nenhuma página.'
  return `O PDF tem ${n} páginas, e o app aceita até ${PAGINAS_MAXIMAS} (lê só a primeira). Exporte só a prancha da planta de forma, numa página, e suba de novo.`
}

/** null se a página cabe; senão, o motivo em português. */
export function conferirPagina(largura: number, altura: number): string | null {
  if (Math.max(largura, altura) <= LADO_MAXIMO_PT && largura * altura <= AREA_MAXIMA_PT2) return null
  return `A página do PDF tem ${metros(largura)} x ${metros(altura)}, maior do que o app consegue desenhar (até ${metros(LADO_MAXIMO_PT)} de lado e umas 3 folhas A0 de área). Exporte só o trecho da planta numa folha menor e suba de novo.`
}

/** Traduz os erros do pdf.js que a pessoa pode encontrar; o resto passa como veio. */
export function mensagemDoPdf(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  const nome = e instanceof Error ? e.name : ''
  if (/Image exceeded maximum allowed size/i.test(m))
    return `O PDF tem uma imagem grande demais (mais de ${IMAGEM_MAXIMA_PIXELS / 1_000_000} milhões de pixels), provavelmente uma digitalização ou foto de fundo. Exporte a prancha em vetor, sem a imagem, ou com resolução menor.`
  if (nome === 'PasswordException' || /password/i.test(m)) return 'O PDF tem senha. Abra no computador, salve uma cópia sem senha e suba essa cópia.'
  if (nome === 'InvalidPDFException' || /Invalid PDF/i.test(m)) return 'O arquivo não é um PDF válido (pode estar corrompido ou incompleto).'
  return m
}

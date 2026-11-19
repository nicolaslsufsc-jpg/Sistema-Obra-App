// Reportar problema: o que vai junto com o comentário, sem dado pessoal.
// Plano de 18/11/2026 (notas do Professor). Versão SEM servidor: o reporte fica no aparelho e sai
// num .zip que a pessoa manda (WhatsApp, e-mail). O envio pelo servidor é proposta (tabela e
// Storage são núcleo e migração).

export type Gravidade = 'atrapalha' | 'impede'

export const ROTULO_GRAVIDADE: Record<Gravidade, string> = {
  atrapalha: 'Atrapalha, mas dá para trabalhar',
  impede: 'Impede de trabalhar',
}

export const LIMITE_COMENTARIO = 2000
export const MAX_IMAGENS = 3

/** O que vai junto sozinho. Sem nome, e-mail, localização nem o que estava digitado na tela. */
export interface ContextoDoReporte {
  modulo: string
  tela: string
  versao_app: string
  obra_id: string
  obra_codigo: string
  usuario_id: string
  sem_conta: boolean
  tela_px: string
  navegador: string
  instalado: boolean
  online: boolean
  fila: { pendentes: number; com_erro: number; ultima_sincronizacao: string | null }
  erros: string[]
}

export interface Reporte {
  id: string
  criado_em: string
  comentario: string
  gravidade: Gravidade
  contexto: ContextoDoReporte
  /** imagens já reduzidas (JPEG) */
  imagens: Blob[]
}

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g
const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g
// chaves do Supabase e afins, e qualquer sequência longa sem espaço que pareça segredo
const CHAVE = /\b(sb_(secret|publishable)_[\w-]+|[A-Za-z0-9_-]{40,})\b/g
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
// parâmetros de endereço podem levar código de login: some tudo depois do "?" ou "#"
const PARAMS_URL = /(https?:\/\/[^\s?#'"]+)[?#][^\s'"]*/g

/** Tira de uma mensagem de erro o que pode ser dado pessoal ou segredo. Corta em 300 caracteres. */
export function limparTexto(t: string): string {
  return t
    .replace(PARAMS_URL, '$1?[removido]')
    .replace(JWT, '[removido]')
    .replace(EMAIL, '[removido]')
    .replace(UUID, '[id]')
    .replace(CHAVE, '[removido]')
    .slice(0, 300)
}

/**
 * Versão do app: o nome do arquivo principal gerado pelo build (index-<hash>.js) muda a cada
 * versão publicada. Assim não precisa mexer na configuração do build (núcleo).
 */
export function versaoDoApp(doc: Pick<Document, 'querySelectorAll'> = document, dev = import.meta.env.DEV): string {
  if (dev) return 'desenvolvimento'
  for (const s of doc.querySelectorAll('script[src]')) {
    const m = /\/assets\/(index-[\w-]+)\.js/.exec((s as HTMLScriptElement).src)
    if (m) return m[1]
  }
  return 'desconhecida'
}

/** Navegador e sistema, resumidos (sem o user agent inteiro). */
export function navegadorResumido(ua: string): string {
  const sistema = /Android [\d.]+/.exec(ua)?.[0] ?? (/Windows NT/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'outro')
  const nav =
    /OPR\/|Opera/.test(ua) ? 'Opera' : /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\/(\d+)/.test(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}` : /Safari\//.test(ua) ? 'Safari' : 'outro'
  return `${nav} · ${sistema}`
}

/** Texto do reporte para ler no PC ou colar no chat (vai no .zip como reporte.txt). */
export function textoDoReporte(r: Pick<Reporte, 'criado_em' | 'comentario' | 'gravidade' | 'contexto'> & { imagens: unknown[] }): string {
  const c = r.contexto
  const linhas = [
    `REPORTE DE PROBLEMA · ${new Date(r.criado_em).toLocaleString('pt-BR')}`,
    '',
    `Gravidade: ${ROTULO_GRAVIDADE[r.gravidade]}`,
    'O que aconteceu:',
    r.comentario,
    '',
    '--- Vai junto ---',
    `Módulo / tela: ${c.modulo} / ${c.tela}`,
    `Versão do app: ${c.versao_app}`,
    `Obra: ${c.obra_codigo} (${c.obra_id})`,
    `Usuário (id): ${c.usuario_id}`,
    `Modo: ${c.sem_conta ? 'sem conta (só neste aparelho)' : 'com conta'}${c.online ? '' : ' · sem internet'}`,
    `Aparelho: ${c.navegador} · tela ${c.tela_px}${c.instalado ? ' · instalado' : ''}`,
    `Fila: ${c.fila.pendentes} esperando envio, ${c.fila.com_erro} com erro${c.fila.ultima_sincronizacao ? ` · última sincronização ${c.fila.ultima_sincronizacao}` : ''}`,
    `Imagens: ${r.imagens.length}`,
    '',
    c.erros.length === 0 ? 'Erros recentes do app: nenhum' : `Erros recentes do app (${c.erros.length}, mais novo por último):`,
    ...c.erros.map((e) => `- ${e}`),
  ]
  return linhas.join('\n') + '\n'
}

/** Nome da pasta do reporte no .zip: reporte-2026-11-18-0942-<4 letras do id>. */
export function nomeDoReporte(r: Pick<Reporte, 'id' | 'criado_em'>): string {
  const d = new Date(r.criado_em)
  const p = (n: number) => String(n).padStart(2, '0')
  return `reporte-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}-${r.id.slice(0, 4)}`
}

// Classificação de erros do servidor para a fila de envio.
//
// transitório: vale tentar de novo depois (sem internet, servidor fora, token vencido).
//              A fila para e tenta na próxima sincronização.
// permanente : tentar de novo vai dar o mesmo erro (sem permissão, dado inválido,
//              referência inexistente). O item fica marcado com erro e a fila segue.

export type Gravidade = 'transitorio' | 'permanente'

export interface ErroServidor {
  gravidade: Gravidade
  mensagem: string
  codigo?: string
  status?: number
}

/** Resposta de erro do PostgREST/supabase-js: { error, status }. status 0 = falha de rede. */
export function erroDoBanco(status: number, erro: { message?: string; code?: string } | null): ErroServidor {
  const codigo = erro?.code || undefined
  const mensagem = erro?.message || `Erro HTTP ${status}`
  return { gravidade: gravidadePorStatus(status, codigo), mensagem, codigo, status }
}

function gravidadePorStatus(status: number, codigo?: string): Gravidade {
  if (status === 0) return 'transitorio' // sem internet
  if (status === 401) return 'transitorio' // token vencido: renova e tenta de novo
  if (codigo === 'PGRST301' || codigo === 'PGRST303') return 'transitorio' // JWT inválido/vencido
  if (status === 408 || status === 429) return 'transitorio'
  if (status >= 500) return 'transitorio'
  return 'permanente'
}

/** Erro do armazenamento (storage-js). Sem status = falha de rede. */
export function erroDoArmazenamento(erro: unknown): ErroServidor & { duplicado: boolean } {
  const e = erro as { message?: string; status?: number; statusCode?: string | number; error?: string } | null
  const mensagem = e?.message || String(erro)
  const status = typeof e?.status === 'number' ? e.status : undefined
  const statusCorpo = e?.statusCode !== undefined ? Number(e.statusCode) : undefined
  // O Supabase responde "já existe" como HTTP 400 com statusCode "409" ou como HTTP 409.
  const duplicado = status === 409 || statusCorpo === 409 || /already exists|duplicate/i.test(mensagem)
  if (status === undefined) {
    return { gravidade: 'transitorio', mensagem, duplicado: false }
  }
  // Token vencido: o Supabase responde statusCode "403" com mensagem "jwt expired".
  if (/jwt expired|exp" claim|token is expired|invalid jwt/i.test(mensagem)) {
    return { gravidade: 'transitorio', mensagem, status, duplicado: false }
  }
  const efetivo = statusCorpo && statusCorpo >= 400 ? statusCorpo : status
  return { gravidade: gravidadePorStatus(efetivo), mensagem, status, duplicado }
}

/** Texto para a tela: falha de rede vira "sem conexão com o servidor". */
export function mensagemParaTela(erro: ErroServidor): string {
  const rede = erro.status === 0 || /fetch|network|socket|ECONN|load failed/i.test(erro.mensagem)
  if (erro.gravidade === 'transitorio' && rede) return 'sem conexão com o servidor'
  return erro.mensagem
}

// Servidor de teste que se passa pelo Supabase para o supabase-js:
//   /rest/v1/*     -> PostgREST de verdade (mesma versão do Supabase), sobre o banco local
//                     com a migração do núcleo. RLS de verdade.
//   /storage/v1/*  -> armazenamento em memória. A permissão é conferida pelo banco: cada envio
//                     insere em storage.objects pelo PostgREST com o token do usuário, então as
//                     regras sistema_obra_ler / sistema_obra_enviar valem como no Supabase.
//   /auth/v1/*     -> login falso: aceita o código CODIGO_TESTE para os usuários de dados.ts.
//
// derrubarRede(true) simula aparelho sem internet (a conexão é cortada).

import http from 'node:http'
import { createHmac, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { CODIGO_TESTE } from './dados'

export interface UsuarioTeste {
  id: string
  email: string
}

export interface OpcoesServidorTeste {
  pgrstUrl: string
  segredoJwt: string
  usuarios: UsuarioTeste[]
  porta?: number
}

export interface ServidorTeste {
  url: string
  /** Conteúdo guardado, por "bucket/caminho". */
  arquivos: Armazenamento
  codigosPedidos: string[]
  /** Quantos pedidos chegaram, por "MÉTODO /caminho" (sem a consulta). */
  pedidos: Map<string, number>
  derrubarRede(fora: boolean): void
  /** Validade (s) dos tokens emitidos pelo login falso a partir de agora. */
  validadeToken(segundos: number): void
  /**
   * Só para a PRÓXIMA sessão emitida por /verify: validade real do JWT (exp) e a validade que
   * o servidor informa (expires_in/expires_at). Servem para testar a renovação do login.
   */
  proximaSessao(ajuste: { exp?: number; informada?: number }): void
  /**
   * Função chamada antes de cada pedido (ex.: para mudar o banco no meio de uma exportação).
   * Se devolver 'derrubar', a conexão deste pedido é cortada sem resposta (simula queda de rede).
   */
  antesDoPedido?: (metodo: string, caminho: string) => Promise<void | 'derrubar'>
  fechar(): Promise<void>
}

/**
 * Onde o servidor de teste guarda os arquivos. Com SO_ARMAZENAMENTO (pasta, definida pelo
 * rodar_integracao.sh) todos os servidores de teste da mesma rodada enxergam os mesmos arquivos,
 * como no Supabase: o resultado não depende da ordem em que os arquivos de teste rodam.
 */
export interface Armazenamento {
  get(chave: string): Buffer | undefined
  set(chave: string, bytes: Buffer): void
  has(chave: string): boolean
}

function criarArmazenamento(pasta?: string): Armazenamento {
  if (!pasta) {
    const memoria = new Map<string, Buffer>()
    return { get: (k) => memoria.get(k), set: (k, b) => void memoria.set(k, b), has: (k) => memoria.has(k) }
  }
  const arquivo = (chave: string) => path.join(pasta, ...chave.split('/'))
  return {
    get: (k) => (existsSync(arquivo(k)) ? readFileSync(arquivo(k)) : undefined),
    set: (k, b) => {
      mkdirSync(path.dirname(arquivo(k)), { recursive: true })
      writeFileSync(arquivo(k), b)
    },
    has: (k) => existsSync(arquivo(k)),
  }
}

export function assinarJwt(segredo: string, carga: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const cabecalho = b64({ alg: 'HS256', typ: 'JWT' })
  const corpo = b64(carga)
  const assinatura = createHmac('sha256', segredo).update(`${cabecalho}.${corpo}`).digest('base64url')
  return `${cabecalho}.${corpo}.${assinatura}`
}

export function tokenDe(usuario: UsuarioTeste, segredo: string, validadeS = 3600): string {
  const agora = Math.floor(Date.now() / 1000)
  return assinarJwt(segredo, {
    sub: usuario.id,
    email: usuario.email,
    role: 'authenticated',
    aud: 'authenticated',
    // sem "iat": os testes adiantam o relógio e o PostgREST recusa token "emitido no futuro"
    exp: agora + validadeS,
  })
}

function lerCorpo(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((ok, falha) => {
    const partes: Buffer[] = []
    req.on('data', (p: Buffer) => partes.push(p))
    req.on('end', () => ok(Buffer.concat(partes)))
    req.on('error', falha)
  })
}

function json(res: http.ServerResponse, status: number, corpo: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(corpo))
}

function cargaDoToken(autorizacao: string | undefined): Record<string, unknown> | null {
  const token = autorizacao?.replace(/^Bearer\s+/i, '')
  if (!token || token.split('.').length !== 3) return null
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  } catch {
    return null
  }
}

export async function iniciarServidorTeste(o: OpcoesServidorTeste): Promise<ServidorTeste> {
  let fora = false
  let validade = 3600
  let ajusteProxima: { exp?: number; informada?: number } | null = null
  const arquivos = criarArmazenamento(process.env.SO_ARMAZENAMENTO)
  const codigosPedidos: string[] = []
  const pedidos = new Map<string, number>()
  const refresh = new Map<string, UsuarioTeste>()

  const sessao = (u: UsuarioTeste, ajuste: { exp?: number; informada?: number } | null = null) => {
    const tokenRefresh = randomUUID()
    refresh.set(tokenRefresh, u)
    const agora = Math.floor(Date.now() / 1000)
    const exp = ajuste?.exp ?? validade
    const informada = ajuste?.informada ?? exp
    return {
      access_token: tokenDe(u, o.segredoJwt, exp),
      token_type: 'bearer',
      expires_in: informada,
      expires_at: agora + informada,
      refresh_token: tokenRefresh,
      user: usuarioJson(u),
    }
  }
  const usuarioJson = (u: UsuarioTeste) => ({
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: u.email,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-11-03T00:00:00Z',
  })

  // Token "de verdade" só se for JWT; a publishable key (sem pontos) vira anon, como no Supabase.
  const autorizacaoParaPostgrest = (req: http.IncomingMessage): Record<string, string> => {
    const a = req.headers.authorization
    return a && cargaDoToken(a) ? { authorization: a } : {}
  }

  const repassar = async (req: http.IncomingMessage, res: http.ServerResponse, caminho: string) => {
    const corpo = req.method === 'GET' || req.method === 'HEAD' ? undefined : await lerCorpo(req)
    const cabecalhos: Record<string, string> = { ...autorizacaoParaPostgrest(req) }
    for (const h of ['content-type', 'accept', 'prefer', 'range', 'accept-profile', 'content-profile']) {
      const v = req.headers[h]
      if (typeof v === 'string') cabecalhos[h] = v
    }
    const r = await fetch(o.pgrstUrl + caminho, {
      method: req.method,
      headers: cabecalhos,
      body: corpo ? new Uint8Array(corpo) : undefined,
    })
    const saida: Record<string, string> = {}
    r.headers.forEach((v, k) => {
      if (!['content-length', 'transfer-encoding', 'connection', 'content-encoding'].includes(k)) saida[k] = v
    })
    res.writeHead(r.status, saida)
    res.end(Buffer.from(await r.arrayBuffer()))
  }

  const armazenar = async (req: http.IncomingMessage, res: http.ServerResponse, bucket: string, nome: string) => {
    const bytes = await lerCorpo(req)
    const r = await fetch(`${o.pgrstUrl}/objects`, {
      method: 'POST',
      headers: {
        ...autorizacaoParaPostgrest(req),
        'content-type': 'application/json',
        'content-profile': 'storage',
        prefer: 'return=minimal',
      },
      body: JSON.stringify({ bucket_id: bucket, name: nome, metadata: { size: bytes.length } }),
    })
    if (r.status === 201) {
      arquivos.set(`${bucket}/${nome}`, bytes)
      return json(res, 200, { Key: `${bucket}/${nome}`, Id: randomUUID() })
    }
    if (r.status === 401) return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'jwt expired' })
    const erro = (await r.json().catch(() => ({}))) as { code?: string; message?: string }
    if (erro.code === '23505') {
      return json(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' })
    }
    if (r.status === 401) {
      return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: erro.message ?? 'jwt expired' })
    }
    return json(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' })
  }

  const ler = async (req: http.IncomingMessage, res: http.ServerResponse, bucket: string, nome: string) => {
    const q = new URLSearchParams({ select: 'name', bucket_id: `eq.${bucket}`, name: `eq.${nome}` })
    const r = await fetch(`${o.pgrstUrl}/objects?${q}`, {
      headers: { ...autorizacaoParaPostgrest(req), 'accept-profile': 'storage' },
    })
    if (r.status === 401) return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'jwt expired' })
    const linhas = (await r.json().catch(() => [])) as unknown[]
    const bytes = arquivos.get(`${bucket}/${nome}`)
    if (!Array.isArray(linhas) || linhas.length === 0 || !bytes) {
      return json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' })
    }
    res.writeHead(200, { 'content-type': 'application/octet-stream' })
    res.end(bytes)
  }

  // Lista como o Storage do Supabase: filhos diretos da pasta; subpasta vem com id null.
  const listar = async (req: http.IncomingMessage, res: http.ServerResponse, bucket: string) => {
    const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}') as { prefix?: string; limit?: number; offset?: number }
    const pasta = (corpo.prefix ?? '').replace(/\/+$/, '')
    const q = new URLSearchParams({ select: 'name,id,metadata,created_at', bucket_id: `eq.${bucket}` })
    if (pasta) q.set('name', `like.${pasta}/*`)
    const r = await fetch(`${o.pgrstUrl}/objects?${q}`, {
      headers: { ...autorizacaoParaPostgrest(req), 'accept-profile': 'storage' },
    })
    if (r.status === 401) return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'jwt expired' })
    const objetos = (await r.json().catch(() => [])) as { name: string; id: string; metadata: unknown; created_at: string }[]
    const filhos = new Map<string, { name: string; id: string | null; metadata: unknown; created_at?: string }>()
    for (const obj of Array.isArray(objetos) ? objetos : []) {
      const resto = pasta ? obj.name.slice(pasta.length + 1) : obj.name
      const [primeiro, ...depois] = resto.split('/')
      if (depois.length > 0) filhos.set(primeiro, { name: primeiro, id: null, metadata: null })
      else filhos.set(primeiro, { name: primeiro, id: obj.id, metadata: obj.metadata, created_at: obj.created_at })
    }
    const ordenados = [...filhos.values()].sort((a, b) => a.name.localeCompare(b.name))
    const inicio = corpo.offset ?? 0
    return json(res, 200, ordenados.slice(inicio, inicio + (corpo.limit ?? 100)))
  }

  const autenticacao = async (req: http.IncomingMessage, res: http.ServerResponse, caminho: string) => {
    const url = new URL(caminho, 'http://x')
    const corpo = req.method === 'POST' ? JSON.parse((await lerCorpo(req)).toString() || '{}') : {}
    const porEmail = (email?: string) => o.usuarios.find((u) => u.email === email?.toLowerCase())
    switch (url.pathname) {
      case '/otp':
        codigosPedidos.push(corpo.email)
        return json(res, 200, {})
      case '/verify': {
        const u = porEmail(corpo.email)
        if (!u || corpo.token !== CODIGO_TESTE) {
          return json(res, 403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' })
        }
        const ajuste = ajusteProxima
        ajusteProxima = null
        return json(res, 200, sessao(u, ajuste))
      }
      case '/token': {
        const u = refresh.get(corpo.refresh_token)
        if (!u) return json(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' })
        refresh.delete(corpo.refresh_token)
        return json(res, 200, sessao(u))
      }
      case '/user': {
        const carga = cargaDoToken(req.headers.authorization)
        const u = o.usuarios.find((x) => x.id === carga?.sub)
        return u ? json(res, 200, usuarioJson(u)) : json(res, 401, { code: 401, msg: 'invalid JWT' })
      }
      case '/logout':
        res.writeHead(204)
        return res.end()
      default:
        return json(res, 404, { msg: `rota de teste inexistente: ${url.pathname}` })
    }
  }

  const servidor = http.createServer(async (req, res) => {
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('access-control-allow-headers', '*')
    res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
    res.setHeader('access-control-expose-headers', 'content-range, content-profile')
    if (fora) {
      req.socket.destroy()
      return
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      return res.end()
    }
    const chave = `${req.method} ${(req.url ?? '/').split('?')[0]}`
    pedidos.set(chave, (pedidos.get(chave) ?? 0) + 1)
    if (resultado.antesDoPedido && (await resultado.antesDoPedido(req.method ?? 'GET', req.url ?? '/')) === 'derrubar') {
      req.socket.destroy()
      return
    }
    try {
      const caminho = req.url ?? '/'
      if (caminho.startsWith('/rest/v1')) return await repassar(req, res, caminho.slice('/rest/v1'.length) || '/')
      if (caminho.startsWith('/auth/v1')) return await autenticacao(req, res, caminho.slice('/auth/v1'.length))
      const lista = /^\/storage\/v1\/object\/list\/([^/?]+)/.exec(caminho)
      if (lista && req.method === 'POST') return await listar(req, res, lista[1])
      const m = /^\/storage\/v1\/object\/(?:authenticated\/)?([^/]+)\/(.+?)(?:\?.*)?$/.exec(caminho)
      if (m) {
        const [, bucket, nome] = m
        const nomeDecodificado = decodeURIComponent(nome)
        if (req.method === 'POST' || req.method === 'PUT') return await armazenar(req, res, bucket, nomeDecodificado)
        if (req.method === 'GET') return await ler(req, res, bucket, nomeDecodificado)
      }
      json(res, 404, { msg: `rota de teste inexistente: ${req.method} ${caminho}` })
    } catch (e) {
      json(res, 500, { msg: String(e) })
    }
  })

  await new Promise<void>((ok) => servidor.listen(o.porta ?? 0, '127.0.0.1', ok))
  const { port } = servidor.address() as AddressInfo
  const resultado: ServidorTeste = {
    url: `http://127.0.0.1:${port}`,
    arquivos,
    codigosPedidos,
    pedidos,
    derrubarRede: (f) => {
      fora = f
    },
    validadeToken: (s) => {
      validade = s
    },
    proximaSessao: (ajuste) => {
      ajusteProxima = ajuste
    },
    fechar: () =>
      new Promise((ok) => {
        servidor.closeAllConnections()
        servidor.close(() => ok())
      }),
  }
  return resultado
}

// Login por código de e-mail, usuário do aparelho e lista de obras.
//
// O app funciona offline com o "usuário local" guardado no banco do aparelho.
// A sessão do Supabase só é necessária para sincronizar. Sem internet, o token
// vence (1 h) e getSession() devolve vazio, mas a sessão continua guardada e
// renova quando a internet volta. Por isso o app não trata "sem sessão" como "saiu".

import { isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js'
import type { BancoLocal } from './banco_local'
import { erroDoBanco, type ErroServidor } from './erros'
import { CHAVE_SESSAO } from '../config'
import { ehModoLocal } from './local'

export interface UsuarioLocal {
  id: string
  email: string
}

export type PapelNaObra = 'admin' | 'gestor' | 'campo' | 'leitura'

export interface ObraLocal {
  id: string
  codigo: string
  nome: string
  empresa: string | null
  papel: PapelNaObra
  /** Sistema oficial externo da obra (campo sistema_oficial do pacote); sem ele, nada de sistema oficial na tela. */
  sistema_oficial?: string | null
}

/**
 * 'ok' = pode sincronizar; 'offline' = sem conexão com o servidor; 'entrar' = precisa pedir
 * código de novo; 'outro' = o navegador está logado com outra pessoa (ex.: outra aba no PC);
 * 'local' = modo sem conta (local.ts): o app não fala com o servidor.
 */
export type EstadoSessao = 'ok' | 'offline' | 'entrar' | 'outro' | 'local'

export interface LoginPendente {
  email: string
  /** Hora (ISO) em que o código foi pedido. */
  em: string
}

/** Código pedido há menos que isto ainda é oferecido ao reabrir o app. */
const VALIDADE_LOGIN_PENDENTE_MS = 60 * 60 * 1000
/** Sair não espera o servidor mais que isto (sem internet o supabase-js insiste por ~25 s). */
const ESPERA_MAXIMA_SAIR_MS = 2000

export class Conta {
  constructor(
    private readonly cliente: SupabaseClient,
    private readonly banco: BancoLocal,
  ) {}

  usuarioLocal(): Promise<UsuarioLocal | undefined> {
    return this.banco.lerMeta<UsuarioLocal>('usuario')
  }

  /** Manda o código numérico para o e-mail (hoje 8 dígitos, configurado no painel do Supabase). Cria a conta se não existir (cadastro livre). */
  async pedirCodigo(email: string): Promise<string | null> {
    const normalizado = email.trim().toLowerCase()
    const { error } = await this.cliente.auth.signInWithOtp({
      email: normalizado,
      options: { shouldCreateUser: true },
    })
    if (error) return traduzirErroLogin(error, 'pedir')
    // Se o Android fechar o app enquanto a pessoa lê o e-mail, a tela do código volta sozinha.
    await this.banco.gravarMeta('login_pendente', { email: normalizado, em: new Date().toISOString() })
    return null
  }

  /** Código pedido há menos de 1 h e ainda não usado. */
  async loginPendente(): Promise<LoginPendente | undefined> {
    const p = await this.banco.lerMeta<LoginPendente>('login_pendente')
    if (!p) return undefined
    if (Date.now() - new Date(p.em).getTime() > VALIDADE_LOGIN_PENDENTE_MS) {
      await this.banco.apagarMeta('login_pendente')
      return undefined
    }
    return p
  }

  cancelarLoginPendente(): Promise<void> {
    return this.banco.apagarMeta('login_pendente')
  }

  /** Confere o código. Se der certo, o usuário fica guardado no aparelho. */
  async confirmarCodigo(email: string, codigo: string): Promise<UsuarioLocal | string> {
    const { data, error } = await this.cliente.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: codigo.replace(/\D/g, ''),
      type: 'email',
    })
    if (error || !data.user) return error ? traduzirErroLogin(error, 'confirmar') : 'Não foi possível entrar.'
    const usuario: UsuarioLocal = { id: data.user.id, email: data.user.email ?? email }
    const anterior = await this.usuarioLocal()
    if (!anterior || anterior.id !== usuario.id) {
      // Outra pessoa (ou ninguém guardado): apaga o que estiver baixado. A fila de envio fica.
      await this.banco.esquecerTudoBaixado()
      await this.banco.apagarMeta('obras')
      await this.banco.apagarMeta('obra_atual')
    }
    // O que foi feito no modo sem conta neste aparelho sobe em nome de quem entrou (C1, 18/11/2026).
    // Antes ficava na fila do usuário sem conta e nunca era enviado.
    const semConta = await this.banco.lerMeta<string>('usuario_local_id')
    if (semConta) await this.banco.passarFila(semConta, usuario.id)
    await this.banco.gravarMeta('usuario', usuario)
    await this.banco.apagarMeta('login_pendente')
    await this.banco.apagarMeta('modo_local') // entrou com e-mail: a sincronização volta a valer
    return usuario
  }

  /** Estado do login. Com `usuarioId`, confere também se a sessão é dessa pessoa. */
  async estadoSessao(usuarioId?: string): Promise<EstadoSessao> {
    if (await ehModoLocal(this.banco)) return 'local'
    try {
      const { data, error } = await this.cliente.auth.getSession()
      if (data.session) return usuarioId && data.session.user.id !== usuarioId ? 'outro' : 'ok'
      if (error && isAuthRetryableFetchError(error)) return 'offline'
      return 'entrar'
    } catch {
      return 'offline'
    }
  }

  /** Há login válido desta pessoa agora? (usado pela sincronização antes de cada envio) */
  async sessaoDoUsuario(usuarioId: string): Promise<boolean> {
    return (await this.estadoSessao(usuarioId)) === 'ok'
  }

  /**
   * Sai da conta neste aparelho. Apaga o que foi baixado; a fila de envio fica guardada
   * e é enviada quando a mesma pessoa entrar de novo.
   */
  async sair(): Promise<void> {
    // Avisa o servidor só com internet, e sem esperar mais que 2 s: sem internet e com token
    // vencido, o supabase-js fica ~25 s tentando renovar. Se a sessão antiga reaparecer depois
    // (corrida rara), estadoSessao() devolve 'outro' e nada é enviado com ela.
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      const saida = this.cliente.auth.signOut({ scope: 'local' }).catch(() => undefined)
      await Promise.race([saida, new Promise((ok) => setTimeout(ok, ESPERA_MAXIMA_SAIR_MS))])
    }
    try {
      // Apaga a sessão guardada (e as chaves auxiliares do supabase-js) mesmo sem resposta do servidor.
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const chave = localStorage.key(i)
        if (chave && (chave === CHAVE_SESSAO || chave.startsWith(`${CHAVE_SESSAO}-`))) localStorage.removeItem(chave)
      }
    } catch {
      // sem localStorage
    }
    await this.banco.esquecerTudoBaixado()
    await this.banco.apagarMeta('usuario')
    await this.banco.apagarMeta('obras')
    await this.banco.apagarMeta('obra_atual')
    await this.banco.apagarMeta('login_pendente')
  }

  // ---------------------------------------------------------------
  // Obras
  // ---------------------------------------------------------------

  obrasLocais(): Promise<ObraLocal[]> {
    return this.banco.lerMeta<ObraLocal[]>('obras').then((o) => o ?? [])
  }

  /**
   * Busca no servidor as obras que o usuário pode ver e o papel em cada uma.
   * Obra que sumiu da lista (acesso revogado) é apagada do aparelho.
   * Sem internet, devolve o erro e não mexe em nada.
   */
  async atualizarObras(usuarioId: string): Promise<ObraLocal[] | ErroServidor> {
    const perfil = await this.cliente.from('perfis').select('papel').eq('id', usuarioId).maybeSingle()
    if (perfil.error) return erroDoBanco(perfil.status, perfil.error)
    const obras = await this.cliente
      .from('obras')
      .select('id, codigo, nome, empresa')
      .eq('apagado', false)
      .order('codigo')
    if (obras.error) return erroDoBanco(obras.status, obras.error)
    const acessos = await this.cliente.from('acessos').select('obra_id, papel').eq('usuario_id', usuarioId)
    if (acessos.error) return erroDoBanco(acessos.status, acessos.error)

    const admin = (perfil.data as { papel?: string } | null)?.papel === 'admin'
    const papelPorObra = new Map((acessos.data as { obra_id: string; papel: PapelNaObra }[]).map((a) => [a.obra_id, a.papel]))
    const lista: ObraLocal[] = (obras.data as Omit<ObraLocal, 'papel'>[]).map((o) => ({
      ...o,
      papel: admin ? 'admin' : (papelPorObra.get(o.id) ?? 'leitura'),
    }))

    const antes = await this.obrasLocais()
    const ids = new Set(lista.map((o) => o.id))
    for (const o of antes) if (!ids.has(o.id)) await this.banco.esquecerObra(o.id)
    await this.banco.gravarMeta('obras', lista)
    const atual = await this.banco.lerMeta<string>('obra_atual')
    if (atual && !ids.has(atual)) await this.banco.apagarMeta('obra_atual')
    return lista
  }

  obraAtual(): Promise<string | undefined> {
    return this.banco.lerMeta<string>('obra_atual')
  }

  escolherObra(obraId: string): Promise<void> {
    return this.banco.gravarMeta('obra_atual', obraId)
  }
}

function traduzirErroLogin(erro: { message?: string; status?: number; code?: string }, etapa: 'pedir' | 'confirmar'): string {
  if (isAuthRetryableFetchError(erro)) return 'Sem internet. Para entrar o aparelho precisa estar conectado.'
  const m = (erro.message ?? '').toLowerCase()
  if (etapa === 'confirmar' && (erro.code === 'otp_expired' || m.includes('expired') || m.includes('invalid'))) {
    return 'Código errado ou vencido. Confira ou peça um novo.'
  }
  if (etapa === 'pedir' && (erro.code === 'email_address_invalid' || m.includes('invalid'))) {
    return 'E-mail inválido. Confira o endereço.'
  }
  if (erro.status === 429 || erro.code === 'over_email_send_rate_limit' || m.includes('rate limit')) {
    return 'Muitos pedidos de código seguidos. Espere alguns minutos e tente de novo.'
  }
  if (erro.code === 'signup_disabled') return 'Este e-mail não tem cadastro. Peça acesso ao administrador.'
  return `Não foi possível entrar: ${erro.message ?? 'erro desconhecido'}`
}

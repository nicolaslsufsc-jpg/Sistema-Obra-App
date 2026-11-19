// Pessoas da obra: o admin dá, muda e tira acesso pelo app (precisa de internet).
// E-mails vêm de funções do banco que só respondem ao admin (migração 20261103210000).
import type { SupabaseClient } from '@supabase/supabase-js'
import { erroDoBanco, mensagemParaTela, type ErroServidor } from './erros'

export type PapelDeAcesso = 'gestor' | 'campo' | 'leitura'

export interface PessoaDaObra {
  usuario_id: string
  email: string
  nome: string
  /** 'admin' = administrador global: vê todas as obras, não tem linha em acessos para mexer. */
  papel: PapelDeAcesso | 'admin'
  desde: string
}

export interface ContaSemAcesso {
  usuario_id: string
  email: string
  nome: string
  criada_em: string
  /** Já tem acesso a alguma outra obra. */
  em_outra_obra: boolean
}

export interface ContasSemAcesso {
  contas: ContaSemAcesso[]
  /** Quantas existem no todo; a lista traz no máximo as 200 mais recentes. */
  total: number
}

/** Mensagem para a tela. As do banco começam com "Sistema Obra: " e já dizem o que fazer. */
export function textoDoErro(e: ErroServidor): string {
  if (e.mensagem.startsWith('Sistema Obra: ')) return e.mensagem.slice('Sistema Obra: '.length)
  if (e.codigo === 'PGRST202') {
    return 'O banco ainda não tem as funções de pessoas: aplique a migração 20261103210000_nucleo_pessoas.sql (supabase/README.md, passo 7).'
  }
  if (e.status === 401 || e.codigo === '42501' || e.codigo === 'PGRST301' || e.codigo === 'PGRST303') {
    return 'Seu login venceu ou não tem permissão. Volte para a obra e toque em "Entrar de novo".'
  }
  return mensagemParaTela(e)
}

export class Pessoas {
  constructor(private readonly cliente: SupabaseClient) {}

  async daObra(obraId: string): Promise<PessoaDaObra[] | string> {
    const { data, error, status } = await this.cliente.rpc('pessoas_da_obra', { p_obra_id: obraId })
    return error ? textoDoErro(erroDoBanco(status, error)) : (data as PessoaDaObra[])
  }

  async semAcesso(obraId: string): Promise<ContasSemAcesso | string> {
    const { data, error, status } = await this.cliente.rpc('contas_sem_acesso', { p_obra_id: obraId })
    if (error) return textoDoErro(erroDoBanco(status, error))
    const linhas = data as (ContaSemAcesso & { total: number })[]
    return { contas: linhas.map(({ total: _t, ...c }) => c), total: linhas.length ? Number(linhas[0].total) : 0 }
  }

  /** Dá o acesso (ou muda o papel). Devolve null se deu certo, ou o motivo. */
  async darAcesso(email: string, obraId: string, papel: PapelDeAcesso): Promise<string | null> {
    const { error, status } = await this.cliente.rpc('dar_acesso', { p_email: email, p_obra_id: obraId, p_papel: papel })
    return error ? textoDoErro(erroDoBanco(status, error)) : null
  }

  /** Muda o papel. Confere que uma linha mudou: sem permissão ou acesso já tirado dão 0 linhas sem erro. */
  async mudarPapel(usuarioId: string, obraId: string, papel: PapelDeAcesso): Promise<string | null> {
    const { data, error, status } = await this.cliente
      .from('acessos')
      .update({ papel })
      .eq('usuario_id', usuarioId)
      .eq('obra_id', obraId)
      .select('usuario_id')
    if (error) return textoDoErro(erroDoBanco(status, error))
    if (!data || data.length === 0) return 'Nada mudou: sem permissão, ou a pessoa já não tinha acesso a esta obra (alguém tirou).'
    return null
  }

  async tirarAcesso(usuarioId: string, obraId: string): Promise<string | null> {
    const { data, error, status } = await this.cliente
      .from('acessos')
      .delete()
      .eq('usuario_id', usuarioId)
      .eq('obra_id', obraId)
      .select('usuario_id')
    if (error) return textoDoErro(erroDoBanco(status, error))
    if (!data || data.length === 0) return 'Nada mudou: sem permissão, ou a pessoa já não tinha acesso a esta obra (alguém tirou).'
    return null
  }
}

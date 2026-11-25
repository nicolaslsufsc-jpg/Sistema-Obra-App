// Nova obra: o servidor de verdade para publicar.ts, com as peças do núcleo como estão (servicos.ts):
// a sessão de quem entrou no app neste navegador, a fila de sincronização e a função `convidar` do banco.
// Nada aqui muda o núcleo.
import type { SupabaseClient } from '@supabase/supabase-js'
import * as servicos from '../nucleo/servicos'
import type { Conta } from '../nucleo/conta'
import { erroDoBanco, mensagemParaTela } from '../nucleo/erros'
import { textoDoErro } from '../nucleo/pessoas'
import type { Sincronizador } from '../nucleo/sincronizacao'
import type { Servidor } from './publicar'

interface Pecas {
  cliente: SupabaseClient
  conta: Conta
  sincronizador: Sincronizador
}

/** Monta o servidor com as peças dadas (no app, as de servicos.ts; nos testes, as do servidor local). */
export const criarServidor = ({ cliente, conta, sincronizador }: Pecas): Servidor => ({
  async usuario() {
    // a mesma conferência da fila (conta.sessaoDoUsuario): a pessoa guardada neste navegador e a sessão dela
    const u = await conta.usuarioLocal()
    if (!u || (await conta.estadoSessao(u.id)) !== 'ok') return null
    return { id: u.id, email: u.email }
  },

  async ehAdmin(usuarioId) {
    const { data, error, status } = await cliente.from('perfis').select('papel').eq('id', usuarioId).maybeSingle()
    if (error) return mensagemParaTela(erroDoBanco(status, error))
    return (data as { papel?: string } | null)?.papel === 'admin'
  },

  async obraPorCodigo(codigo) {
    const { data, error, status } = await cliente.from('obras').select('id').eq('codigo', codigo).maybeSingle()
    if (error) return mensagemParaTela(erroDoBanco(status, error))
    return (data as { id: string } | null) ?? null
  },

  async criarObra(o) {
    const { error, status } = await cliente.from('obras').insert({ id: o.id, codigo: o.codigo, nome: o.nome, empresa: o.empresa })
    return error ? textoDoErro(erroDoBanco(status, error)) : null
  },

  registrar: (tabela, obraId, usuarioId, campos) => sincronizador.registrar(tabela, obraId, usuarioId, campos),
  registrarArquivo: (obraId, usuarioId, modulo, conteudo, nome) => sincronizador.registrarArquivo(obraId, usuarioId, modulo, conteudo, nome),

  async enviar(usuarioId) {
    const r = await sincronizador.enviar(usuarioId)
    const f = await sincronizador.contarFila(usuarioId)
    return {
      pendentes: f.pendentes,
      comErro: f.comErro,
      parouPor: r.parouPor ? mensagemParaTela(r.parouPor) : undefined,
    }
  },

  async convidar(obraId, nome, papel, email) {
    const { error, status } = await cliente.rpc('convidar', {
      p_obra_id: obraId,
      p_nome: nome,
      p_papel: papel,
      p_email: email,
    })
    return error ? textoDoErro(erroDoBanco(status, error)) : null
  },

  async atualizarObras(usuarioId) {
    await conta.atualizarObras(usuarioId)
  },
})

export const servidorDoApp: Servidor = criarServidor(servicos)

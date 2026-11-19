// Instâncias únicas do núcleo, usadas pelas telas e pelos módulos.
import { BancoLocal } from './banco_local'
import { Conta } from './conta'
import { Pessoas } from './pessoas'
import { Sincronizador } from './sincronizacao'
import { criarCliente } from './supabase'
import { BLOCOS_SINCRONIZADOS, TABELAS_SINCRONIZADAS } from './tabelas'
import { BUCKET_OBRAS } from '../config'

export const banco = new BancoLocal()
export const cliente = criarCliente()
export const conta = new Conta(cliente, banco)
export const sincronizador = new Sincronizador({
  banco,
  cliente,
  tabelas: TABELAS_SINCRONIZADAS,
  blocos: BLOCOS_SINCRONIZADOS,
  bucket: BUCKET_OBRAS,
  sessaoValida: (usuarioId) => conta.sessaoDoUsuario(usuarioId),
})
export const pessoas = new Pessoas(cliente)

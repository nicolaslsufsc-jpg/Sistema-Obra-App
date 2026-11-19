// Faixa do modo sem conta dentro dos módulos: no lugar de "esperando envio" (nada vai ao
// servidor), diz quantos registros estão só neste aparelho e se já foram para um arquivo .obra.
import type { BancoLocal } from '../nucleo/banco_local'
import type { ObraLocal, UsuarioLocal } from '../nucleo/conta'
import { baixarBlob } from '../nucleo/baixar'
import { empacotar, gerarSalvamento, nomeDoArquivo } from '../nucleo/salvamento'

export const chaveUltimoSalvamento = (obraId: string) => `ultimo_salvamento:${obraId}`

export interface SituacaoArquivo {
  /** registros desta pessoa nesta obra, guardados no aparelho */
  registros: number
  /** criado_em do registro mais novo (ISO) */
  maisNovo?: string
  /** hora do último .obra salvo (botão ou pasta automática), ISO */
  ultimo?: string
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

/** Texto da faixa e se está tudo salvo. Sem registro nenhum: sem faixa (texto vazio). */
export function textoDaFaixa(s: SituacaoArquivo, agora = new Date()): { texto: string; salvo: boolean } {
  if (s.registros === 0) return { texto: '', salvo: true }
  const n = `${s.registros} ${s.registros === 1 ? 'registro' : 'registros'}`
  const salvo = !!s.ultimo && (!s.maisNovo || Date.parse(s.ultimo) >= Date.parse(s.maisNovo))
  const quando = s.ultimo ? (dia(s.ultimo) === dia(agora.toISOString()) ? `às ${hora(s.ultimo)}` : `em ${dia(s.ultimo)} às ${hora(s.ultimo)}`) : ''
  if (salvo) return { texto: `Salvo ${quando}: ${n} no arquivo.`, salvo: true }
  return { texto: `${n} só neste aparelho · ${s.ultimo ? `último arquivo ${quando}` : 'ainda sem arquivo'}`, salvo: false }
}

export async function lerSituacao(banco: BancoLocal, usuario: UsuarioLocal, obra: ObraLocal): Promise<SituacaoArquivo> {
  let registros = 0
  let maisNovo: string | undefined
  await banco.fila
    .where('obra_id')
    .equals(obra.id)
    .filter((i) => i.usuario_id === usuario.id)
    .each((i) => {
      registros++
      if (!maisNovo || i.criado_em > maisNovo) maisNovo = i.criado_em
    })
  const ultimo = await banco.lerMeta<string>(chaveUltimoSalvamento(obra.id))
  return { registros, maisNovo, ultimo }
}

/** Baixa o .obra da obra e anota a hora. Devolve a hora (ISO). O mesmo da faixa do menu. */
export async function salvarArquivoDaObra(banco: BancoLocal, usuario: UsuarioLocal, obra: ObraLocal): Promise<string> {
  const blob = await empacotar(await gerarSalvamento(banco, usuario, obra))
  const agora = new Date()
  baixarBlob(nomeDoArquivo(obra, agora), blob)
  await banco.gravarMeta(chaveUltimoSalvamento(obra.id), agora.toISOString())
  return agora.toISOString()
}

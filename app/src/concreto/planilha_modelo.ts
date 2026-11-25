// Modelo da planilha de controle guardado como DADO DA OBRA (pedido do Nicolas, 23/11/2026): alguém
// envia o .xlsx da construtora uma vez, e daí em diante a planilha sai em um clique, em qualquer aparelho.
// Vai pela tabela "arquivos" do núcleo (registrarArquivo), como os laudos: sem migração nova. O modelo
// é o arquivo do Concreto com o nome fixo NOME_DO_MODELO; trocar o modelo = enviar outro (vale o mais novo).
// Obra sem modelo: a tela continua pedindo o arquivo a cada vez, como antes.

import { BUCKET_OBRAS } from '../config'
import type { Linha } from '../nucleo/banco_local'
import { banco, cliente, sincronizador } from '../nucleo/servicos'
import { LAYOUT_PADRAO, preencherModelo } from './planilha_controle'
import { abrirXlsx } from './xlsx'

export const NOME_DO_MODELO = 'modelo_planilha_controle.xlsx'
export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
/** o modelo enxuto tem menos de 1 MB; a planilha cheia, com milhares de linhas, não serve de modelo */
export const LIMITE_DO_MODELO = 10 * 1024 * 1024

/** O modelo da obra (o mais novo), ou null. */
export function modeloDaObra(arquivos: readonly Linha[]): Linha | null {
  return (
    arquivos
      .filter((a) => !a.apagado && a.nome_original === NOME_DO_MODELO && String(a.caminho ?? '').includes('/concreto/'))
      .sort((a, b) => String(b.criado_em_dispositivo ?? '').localeCompare(String(a.criado_em_dispositivo ?? '')))[0] ?? null
  )
}

/** Confere o arquivo escolhido (tamanho, é .xlsx, tem a aba e a Tabela). Devolve a mensagem de recusa ou null. */
export async function recusaDoModelo(bytes: Uint8Array): Promise<string | null> {
  if (bytes.byteLength > LIMITE_DO_MODELO) return 'O modelo passa de 10 MB. Use o modelo vazio (sem os dados antigos).'
  try {
    preencherModelo(await abrirXlsx(bytes), [], LAYOUT_PADRAO)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

/** Guarda o modelo como arquivo da obra (fica no aparelho e vai para o servidor na próxima sincronização). */
export async function guardarModelo(obraId: string, usuarioId: string, bytes: Uint8Array<ArrayBuffer>): Promise<Linha> {
  const recusa = await recusaDoModelo(bytes)
  if (recusa) throw new Error(recusa)
  return sincronizador.registrarArquivo(obraId, usuarioId, 'concreto', new Blob([bytes], { type: TIPO_XLSX }), NOME_DO_MODELO)
}

/** Os bytes do modelo: do aparelho (se ainda não subiu) ou do servidor (precisa de internet). */
export async function bytesDoModelo(modelo: Linha): Promise<Uint8Array> {
  const local = await banco.conteudos.get(String(modelo.id))
  if (local) return new Uint8Array(local.bytes)
  const { data, error } = await cliente.storage.from(BUCKET_OBRAS).download(String(modelo.caminho))
  if (error || !data) throw new Error('Não consegui baixar o modelo da obra. Confira a internet e tente de novo.')
  return new Uint8Array(await data.arrayBuffer())
}

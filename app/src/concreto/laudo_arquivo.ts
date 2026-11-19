// O arquivo do laudo do laboratório (PDF ou foto), ligado aos resultados de uma idade pela coluna
// cp_resultados.laudo_arquivo_id, que existe desde a migração do Concreto. Não precisa de migração nova:
// o arquivo vai pelo registrarArquivo do núcleo (como os Documentos e as fotos da FVS) e entra no .obra.
// As regras de segurança (lista fechada de tipos, até 10 MB, tipo reconhecido pelos bytes) são as dos
// Documentos, para não haver duas versões delas.
import { banco, sincronizador } from '../nucleo/servicos'
import { comoAbrir, nomeLimpo, recusaDoArquivo, tipoDoArquivo, type ComoAbrir } from '../documentos/regras'

export { ACEITAR_NO_SELETOR as ACEITAR_LAUDO } from '../documentos/regras'

/** Mensagem de recusa do arquivo escolhido, ou null se pode entrar. */
export function recusaDoLaudo(arquivo: { size: number; type: string; name: string }): string | null {
  return recusaDoArquivo(arquivo.size, tipoDoArquivo(arquivo))
}

/** Guarda o arquivo no aparelho e na fila de envio. Devolve o id da linha em `arquivos`. */
export async function guardarLaudo(obraId: string, usuarioId: string, arquivo: File): Promise<string> {
  // a tela já recusa, mas quem grava confere de novo
  const recusa = recusaDoLaudo(arquivo)
  if (recusa) throw new Error(recusa)
  const linha = await sincronizador.registrarArquivo(obraId, usuarioId, 'concreto', arquivo, nomeLimpo(arquivo.name))
  return linha.id
}

/**
 * Endereço do laudo no aparelho (blob:) e se ele abre no navegador. O tipo sai dos bytes, nunca do
 * registro. null = o conteúdo não está neste aparelho (já foi enviado ao servidor, ou veio de outro).
 * Quem chama devolve com URL.revokeObjectURL.
 */
export async function urlDoLaudo(arquivoId: string): Promise<({ url: string } & ComoAbrir) | null> {
  const local = await banco.conteudos.get(arquivoId)
  if (!local) return null
  const como = comoAbrir(new Uint8Array(local.bytes.slice(0, 16)))
  return { url: URL.createObjectURL(new Blob([local.bytes], { type: como.tipo })), ...como }
}

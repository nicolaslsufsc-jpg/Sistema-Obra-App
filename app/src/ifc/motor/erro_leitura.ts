// Mensagem de erro da leitura do IFC que a pessoa entende.
// Teste de 21/11 no celular (7 GB de RAM): o IFC de 1,6 GB não coube na memória do leitor (web-ifc), que
// devolveu objetos vazios e o erro saía como "Cannot read properties of undefined (reading 'Name')".

/** A partir deste tamanho, erro estranho na leitura é quase sempre falta de memória do aparelho. */
export const GRANDE_PARA_LER = 300 * 1e6

export function mensagemDeErroDaLeitura(erro: unknown, tamanhoArquivo: number): string {
  const m = erro instanceof Error ? erro.message : String(erro)
  const pareceMemoria =
    erro instanceof RangeError || /memory|memória|allocation|alloc|undefined \(reading|of undefined|of null/i.test(m)
  if (tamanhoArquivo >= GRANDE_PARA_LER && pareceMemoria) {
    const gb = (tamanhoArquivo / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
    return `faltou memória neste aparelho para abrir este modelo (${gb} GB). Abra no PC, ou use o IFC por pavimento.`
  }
  return m
}

// Print ou foto do reporte: só imagem, até 10 MB na entrada, reduzida para JPEG de até 1600 px
// de largura. Regravar no canvas também tira os metadados da foto (inclusive localização do GPS).

export const LIMITE_ENTRADA = 10 * 1024 * 1024
export const LARGURA_MAX = 1600
export const ACEITAR_IMAGEM = 'image/jpeg,image/png,image/webp,image/heic,image/heif'

export function recusaDaImagem(a: { size: number; type: string }): string | null {
  if (!a.type.startsWith('image/') || a.type === 'image/svg+xml') return 'Escolha uma imagem (print ou foto).'
  if (a.size > LIMITE_ENTRADA) return 'Imagem grande demais (máximo 10 MB).'
  return null
}

/** Novo tamanho mantendo a proporção, sem passar de LARGURA_MAX no lado maior. */
export function tamanhoReduzido(largura: number, altura: number, max = LARGURA_MAX): [number, number] {
  const maior = Math.max(largura, altura)
  if (maior <= max) return [largura, altura]
  const k = max / maior
  return [Math.round(largura * k), Math.round(altura * k)]
}

export async function reduzirImagem(arquivo: Blob): Promise<Blob> {
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(arquivo)
  } catch {
    throw new Error('Não consegui abrir esta imagem. Tente um print em PNG ou JPG.')
  }
  const [l, a] = tamanhoReduzido(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = l
  canvas.height = a
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, l, a)
  bmp.close()
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.82))
  if (!blob) throw new Error('Não consegui preparar a imagem.')
  return blob
}

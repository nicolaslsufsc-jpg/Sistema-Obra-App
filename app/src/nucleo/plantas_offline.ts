// Com login: deixa no aparelho as plantas vigentes da obra para usar sem internet, sem levar .zip.
//
// O cadastro (pavimentos, peças, fichas) já chega pela sincronização. As plantas não: cada uma é um
// pacote (manifest.json + pacote.bin) no armazenamento do Supabase, um por trecho
// (docs/02_CONTRATO_NUCLEO.md, "Armazenamento de arquivos"). Antes, a pessoa tocava "Baixar" em cada
// pavimento dentro da FVS; agora o menu baixa sozinho, uma por vez, as que faltam, quando há internet.
//
// O código da FVS (lista de plantas, download conferido pelo SHA-256) é reaproveitado, carregado só
// quando precisa (import dinâmico), para o menu continuar leve.
import type { DonoDoPacote } from '../fvs/pacote'

export interface PlantaParaBaixar {
  id: string
  prancha: string
  manifest: { tamanho: number } | null
  pacote: { tamanho: number } | null
}

export interface SituacaoDasPlantas {
  /** Plantas vigentes da obra com arquivo no servidor. */
  total: number
  /** Dessas, quantas já estão no aparelho. */
  noAparelho: number
  /** As que faltam, na ordem em que serão baixadas. */
  faltam: PlantaParaBaixar[]
  /** Bytes das que faltam (o que o servidor diz de cada arquivo). */
  bytesQueFaltam: number
}

/** Só entra na conta planta cujos arquivos já chegaram pela sincronização (linha em "arquivos"). */
export function situacaoDasPlantas(plantas: readonly PlantaParaBaixar[], noAparelho: ReadonlySet<string>): SituacaoDasPlantas {
  const comArquivo = plantas.filter((p) => p.manifest && p.pacote)
  const faltam = comArquivo.filter((p) => !noAparelho.has(p.id))
  return {
    total: comArquivo.length,
    noAparelho: comArquivo.length - faltam.length,
    faltam,
    bytesQueFaltam: faltam.reduce((t, p) => t + (p.manifest?.tamanho ?? 0) + (p.pacote?.tamanho ?? 0), 0),
  }
}

/** Plantas vigentes, do pavimento de baixo para o de cima (a ordem do download). */
function vigentes(dados: { pavimentos: readonly { id: string }[]; plantasDe: ReadonlyMap<string, readonly PlantaParaBaixar[]> }): PlantaParaBaixar[] {
  return dados.pavimentos.flatMap((pv) => [...(dados.plantasDe.get(pv.id) ?? [])])
}

/** Lê do banco do aparelho as plantas vigentes da obra e o que já está guardado. */
export async function lerSituacao(obraId: string): Promise<SituacaoDasPlantas> {
  const [{ carregar }, { pacotesNoAparelho }] = await Promise.all([import('../fvs/dados'), import('../fvs/pacote')])
  const [dados, guardadas] = await Promise.all([carregar(obraId), pacotesNoAparelho()])
  return situacaoDasPlantas(vigentes(dados), new Set(guardadas.keys()))
}

/**
 * Baixa as plantas que faltam, uma depois da outra. Se uma falhar, as anteriores ficam no aparelho e o
 * erro sobe (com o texto da FVS para a tela). `parar()` devolvendo true interrompe entre uma e outra.
 */
export async function baixarQueFaltam(
  obraId: string,
  dono: DonoDoPacote,
  aoProgresso: (feitas: number, total: number) => void,
  parar: () => boolean = () => false,
): Promise<number> {
  const [{ carregar, baixarPlanta }, { pacotesNoAparelho }] = await Promise.all([import('../fvs/dados'), import('../fvs/pacote')])
  const dados = await carregar(obraId)
  const guardadas = await pacotesNoAparelho()
  const { faltam } = situacaoDasPlantas(vigentes(dados), new Set(guardadas.keys()))
  const porId = dados.plantaPorId
  let feitas = 0
  for (const p of faltam) {
    if (parar()) break
    aoProgresso(feitas, faltam.length)
    await baixarPlanta(porId.get(p.id)!, dono)
    feitas++
  }
  aoProgresso(feitas, faltam.length)
  return feitas
}

/** Texto do erro de download, o mesmo que a FVS mostra (sem espaço, internet caiu...). */
export async function textoDoErro(e: unknown): Promise<string> {
  const { textoDoErroDeDownload } = await import('../fvs/pacote')
  return textoDoErroDeDownload(e)
}

/** Cabe no aparelho? Deixa 50 MB de folga para registros e fotos. null = o navegador não diz. */
export function cabeNoAparelho(bytes: number, espaco: { usado: number; total: number } | null): boolean | null {
  if (!espaco || espaco.total <= 0) return null
  return bytes + 50 * 1024 * 1024 <= espaco.total - espaco.usado
}

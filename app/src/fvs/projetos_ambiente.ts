// Projetos do ambiente (pipeline/fvs/modulacao.py): o recorte da prancha de cada projeto que o ambiente tem
// (modulação, paginação de piso, impermeabilização...), mostrado no painel como o detalhe do pilar.
// A modulação é o `detalhe` do ambiente e aparece em toda ficha; os outros vêm em `projetos` e aparecem só
// nas fichas que o pacote lista (paginação no piso; impermeabilização no piso e no reboco...).

import type { DetalhePacote, ElementoPacote } from './pacote'

export interface RecorteDoAmbiente {
  /** chave em `detalhes` (imagem "d:CHAVE") */
  chave: string
  titulo: string
  prancha: string
  /** o recorte é a modulação (o `detalhe` do ambiente) */
  modulacao: boolean
}

/**
 * Recortes que o painel do ambiente mostra, na ordem: modulação primeiro, depois os projetos na ordem do pacote.
 * codigoFicha: a ficha escolhida no topo; sem ficha, todos os projetos aparecem (nada fica escondido).
 * Chave que não está no pacote é ignorada.
 */
export function recortesDoAmbiente(
  el: Pick<ElementoPacote, 'tipo' | 'detalhe' | 'projetos'>,
  detalhes: Record<string, DetalhePacote>,
  codigoFicha?: string | null,
): RecorteDoAmbiente[] {
  if (el.tipo !== 'A') return []
  const saida: RecorteDoAmbiente[] = []
  const mod = el.detalhe ? detalhes[el.detalhe] : undefined
  if (el.detalhe && mod) saida.push({ chave: el.detalhe, titulo: mod.titulo || 'Modulação', prancha: mod.prancha, modulacao: true })
  for (const chave of el.projetos ?? []) {
    const d = detalhes[chave]
    if (!d || saida.some((r) => r.chave === chave)) continue
    if (codigoFicha && d.fichas?.length && !d.fichas.includes(codigoFicha)) continue
    saida.push({ chave, titulo: d.titulo, prancha: d.prancha, modulacao: false })
  }
  return saida
}

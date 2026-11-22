// Qual planta é "a mesma" para casar a área do caminhão com a planta da tela (22/11/2026).
//
// O mapa mostra a planta pelo trecho (setores.id), que é o id que a FVS dá (fvs/plantas.ts). Mas uma
// área pode ter sido gravada com o id da linha de "plantas" (a carga das áreas da obra foi assim), e o
// mesmo pavimento pode ter mais de uma cópia da mesma prancha, cada uma num trecho. Sem isto a área
// existe no aparelho e não aparece na planta (o caso do S23 em 22/11).
//
// Regra: a linha de "plantas" vale pelo trecho dela (o que a substitui fica no mesmo trecho); trechos
// do mesmo pavimento com a mesma prancha (sem a revisão no fim) são a mesma planta. Sem as linhas de
// "plantas" no aparelho, cada id vale por si (como antes).

import type { Linha } from '../nucleo/banco_local'

/** Prancha sem a revisão no fim ("...FOR2PAVTIP-R02" → "...FOR2PAVTIP"). */
export function pranchaSemRevisao(prancha: string): string {
  return prancha.trim().replace(/[-_. ]?R\d+$/i, '')
}

/**
 * Devolve uma função id → chave: dois ids com a mesma chave são a mesma planta. O id pode ser o da
 * linha de "plantas" ou o do trecho. Id desconhecido volta como está.
 */
export function chavesDasPlantas(linhas: readonly Linha[]): (id: string) => string {
  // grupo de cada trecho: pavimento + prancha sem revisão
  const grupoDoSetor = new Map<string, string>()
  const setorDaLinha = new Map<string, string>()
  for (const p of linhas) {
    const setor = p.setor_id ? String(p.setor_id) : ''
    if (!setor) continue
    setorDaLinha.set(String(p.id), setor)
    const prancha = p.prancha ? pranchaSemRevisao(String(p.prancha)) : ''
    if (prancha && !grupoDoSetor.has(setor)) grupoDoSetor.set(setor, `${p.pavimento_id ?? ''}|${prancha}`)
  }
  // chave do grupo = o menor trecho dele (fica igual em todo aparelho)
  const chaveDoGrupo = new Map<string, string>()
  for (const [setor, g] of grupoDoSetor) {
    const atual = chaveDoGrupo.get(g)
    if (!atual || setor < atual) chaveDoGrupo.set(g, setor)
  }
  return (id: string) => {
    const setor = setorDaLinha.get(id) ?? id
    const g = grupoDoSetor.get(setor)
    return (g && chaveDoGrupo.get(g)) || setor
  }
}

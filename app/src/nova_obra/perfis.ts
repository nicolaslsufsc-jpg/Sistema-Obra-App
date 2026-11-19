// Nova obra, etapa 3: os perfis de projetista ensinados neste aparelho. São dados (nomes, camadas,
// onde fica a seção), não código: o perfil ensinado numa planta serve para as outras plantas da
// mesma projetista, nesta obra e nas próximas.
import { PERFIL_PILOTO, type PerfilProjetista } from './leitor'

const CHAVE = 'nova_obra:perfis'

/** Os perfis ensinados aqui, do mais novo para o mais velho. */
export function perfisEnsinados(): PerfilProjetista[] {
  try {
    const l = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    return Array.isArray(l) ? l.filter((p) => p && typeof p.id === 'string' && p.pilar && p.viga) : []
  } catch {
    return []
  }
}

/** Todos os perfis para tentar ler sozinho: os ensinados e o da obra piloto. */
export function perfisParaLer(): PerfilProjetista[] {
  return [...perfisEnsinados(), PERFIL_PILOTO]
}

export function guardarPerfil(p: PerfilProjetista): void {
  const outros = perfisEnsinados().filter((x) => x.id !== p.id)
  try {
    localStorage.setItem(CHAVE, JSON.stringify([p, ...outros].slice(0, 20)))
  } catch {
    // sem espaço no navegador: o perfil vale só agora
  }
}

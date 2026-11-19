// Último módulo aberto (casca): o Android fecha o Chrome (ou a pessoa fecha) com a FVS aberta, e ao
// reabrir o app voltava ao menu. O histórico do navegador (history.state) sobrevive a um recarregar,
// mas não a fechar o Chrome. Então a casca guarda no aparelho só a obra e o id do módulo aberto; o
// ponto dentro do módulo (planta, peça) é do próprio módulo (ex.: fvs/onde_estava.ts).
// Pedido 7 ao núcleo (docs/modulos/1_fvs_status.md), liberado pela frente 01 em 18/11/2026.

const CHAVE = 'casca_ultimo_modulo'

type Guardado = { obraId: string; modulo: string }

function armazenamento(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** Ao abrir um módulo pelo menu. */
export function lembrarModulo(obraId: string, modulo: string, s = armazenamento()): void {
  try {
    s?.setItem(CHAVE, JSON.stringify({ obraId, modulo } satisfies Guardado))
  } catch {
    // sem espaço ou sem localStorage (modo privado): só não volta ao módulo ao reabrir
  }
}

/** Ao voltar ao menu, sair da conta, trocar de obra, perder a obra ou trocar o pacote. */
export function esquecerModulo(s = armazenamento()): void {
  try {
    s?.removeItem(CHAVE)
  } catch {
    // nada a fazer
  }
}

/** O módulo para reabrir, se foi guardado para esta obra (quem confere se ele ainda está no menu é a casca). */
export function moduloGuardado(obraId: string, s = armazenamento()): string | undefined {
  try {
    const g = JSON.parse(s?.getItem(CHAVE) ?? 'null') as Partial<Guardado> | null
    return g && g.obraId === obraId && typeof g.modulo === 'string' ? g.modulo : undefined
  } catch {
    return undefined
  }
}

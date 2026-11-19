// Onde a pessoa estava na FVS (tela, planta e peça com o painel aberto), guardado no aparelho.
// Com o Chrome fechado e aberto de novo, o histórico do navegador some; a casca volta ao módulo
// (telas/ultimo_modulo.ts) e a FVS volta aqui. Só é lido quando a casca avisa que é uma volta
// (`retomar` no history.state): abrir a FVS pelo menu continua começando no início.

const chave = (obraId: string) => `fvs_onde:${obraId}`

/** O pedaço da tela da FVS que dá para guardar (o tipo completo fica em telas/ModuloFvs.tsx). */
export type OndeEstava = { nome: string; plantaId?: string; pecaId?: string; [k: string]: unknown }

function armazenamento(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function ler(obraId: string, s: Storage | null): { tela?: OndeEstava; painel?: string | null } {
  try {
    const g = JSON.parse(s?.getItem(chave(obraId)) ?? 'null')
    return g && typeof g === 'object' ? g : {}
  } catch {
    return {}
  }
}

function gravar(obraId: string, v: { tela?: OndeEstava; painel?: string | null }, s: Storage | null) {
  try {
    s?.setItem(chave(obraId), JSON.stringify(v))
  } catch {
    // sem espaço ou sem localStorage: só não volta ao ponto ao reabrir
  }
}

/** A tela da FVS mudou (o painel aberto fica para a planta nova decidir). */
export function lembrarTela(obraId: string, tela: OndeEstava, s = armazenamento()): void {
  const antes = ler(obraId, s)
  const mesmaPlanta = antes.tela?.nome === 'planta' && tela.nome === 'planta' && antes.tela.plantaId === tela.plantaId
  // entrar na planta com uma peça (busca, lista) já abre o painel dela
  const painel = mesmaPlanta ? antes.painel : typeof tela.pecaId === 'string' ? tela.pecaId : null
  gravar(obraId, { tela, painel: painel ?? null }, s)
}

/** O painel da planta abriu (id da peça) ou fechou (null). */
export function lembrarPainel(obraId: string, painel: string | null, s = armazenamento()): void {
  const antes = ler(obraId, s)
  if (antes.tela?.nome !== 'planta') return
  gravar(obraId, { ...antes, painel }, s)
}

/** A tela para voltar: na planta, com a peça do painel aberta (se estava aberta). */
export function telaGuardada(obraId: string, s = armazenamento()): OndeEstava | undefined {
  const { tela, painel } = ler(obraId, s)
  if (!tela || typeof tela.nome !== 'string') return undefined
  if (tela.nome === 'planta') {
    if (typeof tela.plantaId !== 'string') return undefined
    // o painel aberto por último manda: outra peça tocada depois, ou o painel fechado (sem peça)
    if (painel === tela.pecaId) return { ...tela }
    return { nome: 'planta', plantaId: tela.plantaId, ...(painel ? { pecaId: painel } : {}) }
  }
  return tela
}

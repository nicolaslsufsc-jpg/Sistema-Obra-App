/**
 * Unidade de conferência nas telas da FVS (ideia 14, 25/11/2026). A escolha é feita na montagem da obra
 * (Nova obra) e chega em `fvs_regras.regras.unidades`; a leitura é de regras.ts (unidadeDe).
 *
 * peça / parede / ambiente: a tela segue como sempre (um toque, um local).
 * trecho / área / pavimento: o "conforme" num local marca também os outros locais do grupo, num lote.
 * O registro fica sempre no local: trocar a unidade no meio da obra não apaga nem converte nada; o local
 * que tem registro de antes da troca só ganha o aviso "conferido por <unidade> até <data>".
 *
 * Aqui só contas puras; quem grava é a tela (marcarLote, em dados.ts).
 */
import { historicoDeUnidades, unidadeDe, type RegrasFvs, type Unidade } from './regras'
import { ultimosPorItem, type EventoFvs } from './situacao'

export const NOME_DA_UNIDADE: Record<Unidade, string> = {
  peca: 'peça',
  parede: 'parede',
  ambiente: 'ambiente',
  trecho: 'trecho',
  area: 'área',
  pavimento: 'pavimento',
}

/** Unidade em que um toque vale para vários locais. */
export function ehDeGrupo(u: Unidade | null | undefined): u is 'trecho' | 'area' | 'pavimento' {
  return u === 'trecho' || u === 'area' || u === 'pavimento'
}

/** A unidade de grupo da ficha hoje, ou null (sem a chave `unidades`, ou peça / parede / ambiente: como sempre). */
export function unidadeDeGrupo(regras: RegrasFvs, codigoDaFicha: string | undefined, dia?: string): 'trecho' | 'area' | 'pavimento' | null {
  if (!codigoDaFicha) return null
  const u = unidadeDe(regras, codigoDaFicha, dia)
  return ehDeGrupo(u) ? u : null
}

export interface LocalDoGrupo {
  id: string
  tipo: string
  /** está na planta aberta (o trecho) */
  naPlanta: boolean
  pavimentoId?: string
}

/**
 * Os outros locais que o toque num local marca junto (sem o próprio local).
 * trecho: os do mesmo tipo na planta aberta. pavimento: os do mesmo tipo no pavimento (de qualquer trecho).
 * área: os do mesmo tipo dentro das áreas desenhadas que contêm o local (`areas`: área -> locais de dentro);
 * local fora de toda área não tem grupo.
 */
export function outrosDoGrupo(
  unidade: 'trecho' | 'area' | 'pavimento',
  local: LocalDoGrupo,
  locais: readonly LocalDoGrupo[],
  areas: ReadonlyMap<string, readonly string[]> = new Map(),
): string[] {
  const doTipo = locais.filter((l) => l.id !== local.id && l.tipo === local.tipo)
  if (unidade === 'trecho') return doTipo.filter((l) => l.naPlanta).map((l) => l.id)
  if (unidade === 'pavimento') return doTipo.filter((l) => (local.pavimentoId ? l.pavimentoId === local.pavimentoId : l.naPlanta)).map((l) => l.id)
  const juntos = new Set<string>()
  for (const dentro of areas.values()) if (dentro.includes(local.id)) for (const id of dentro) juntos.add(id)
  return doTipo.filter((l) => juntos.has(l.id)).map((l) => l.id)
}

/** "25/11" de "2026-11-25". */
function diaCurto(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
}

/**
 * O aviso do local que tem registro de antes de a unidade da ficha mudar: "conferido por ambiente até 25/11"
 * (a unidade que valia no registro mais antigo do local e o dia em que a unidade de hoje começou).
 * Sem troca de unidade, ou sem registro anterior a ela: null.
 * datas: `criado_em_dispositivo` dos registros do local nesta ficha.
 */
export function avisoDaUnidadeAnterior(regras: RegrasFvs, codigoDaFicha: string | undefined, datas: readonly string[], dia = new Date().toISOString().slice(0, 10)): string | null {
  if (!codigoDaFicha || !datas.length) return null
  const vigentes = historicoDeUnidades(regras, codigoDaFicha).filter((u) => u.desde <= dia)
  const atual = vigentes.at(-1)
  if (!atual || vigentes.length < 2) return null
  const maisAntigo = datas.reduce((a, b) => (a < b ? a : b)).slice(0, 10)
  if (maisAntigo >= atual.desde) return null
  // a unidade que valia no dia do registro mais antigo (antes da primeira entrada: a primeira, a mais próxima)
  const antes = vigentes.filter((u) => u.desde <= maisAntigo).at(-1) ?? vigentes[0]
  if (antes.unidade === atual.unidade) return null
  return `Conferido por ${NOME_DA_UNIDADE[antes.unidade]} até ${diaCurto(atual.desde)}`
}

/**
 * Os itens que o grupo recebe depois de um toque de vários itens (pincel, "Etapa C"): só os que ficaram C no
 * local tocado (os gravados agora e os que já eram C). Item NC ou NA no local não vira C nos outros
 * (revisão de 25/11). eventos: os registros do local nesta ficha, já com os do toque.
 */
export function itensCDoLocal(fichaId: string, eventos: readonly EventoFvs[], pedidos: readonly number[]): number[] {
  const ult = ultimosPorItem(eventos.filter((e) => e.ficha_id === fichaId))
  return pedidos.filter((n) => ult.get(n)?.resultado === 'C')
}

/**
 * "Marcado antes do prazo" aceito no local tocado: a mesma observação vai a cada item do grupo.
 * prazo: a observação por `${local}#${item}` (prazosDoLote); devolve item -> observação.
 */
export function observacoesDoLocal(local: string, prazo: ReadonlyMap<string, string>): Map<number, string> {
  const m = new Map<number, string>()
  for (const [k, v] of prazo) if (k.startsWith(`${local}#`)) m.set(Number(k.slice(local.length + 1)), v)
  return m
}

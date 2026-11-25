// Navegação da FVS em 3 níveis (pedido do Nicolas, 21/11/2026: "a pessoa vai ver os pavimentos... quando ela
// clica, ela vai ter tipo os submenus... eu quero conferir estrutura... alvenaria... opções numa listinha"):
//   1. pavimentos, na ordem da obra;
//   2. as disciplinas que o pavimento tem (só as que têm planta publicada);
//   3. as opções da disciplina, cada uma abrindo a planta que já existe.
// O agrupamento sai só dos dados (a disciplina do setor da planta e o título da ficha): nada de obra aqui.

import type { Planta } from './dados'
import type { OpcaoDosAmbientes } from './opcoes_ambientes'

/** Disciplina do setor da planta → disciplina do menu. A que o app não conhece vira uma disciplina própria. */
const GRUPO: Record<string, string> = {
  fundacao: 'fundacao', // blocos de fundação (planta de locação, 23/11/2026)
  estrutura: 'estrutura', // forma: pilares, vigas, lajes e furos de viga
  armadura: 'estrutura', // armadura de laje, uma planta por direção
  furacao: 'estrutura', // furos de laje, uma planta por camada
  vedacao: 'alvenaria', // modulação de paredes
  arquitetura: 'acabamentos', // planta de ambientes (reboco, piso, pintura...); a alvenaria dela vai para Alvenaria
  hidro: 'instalacoes',
  sanitario: 'instalacoes',
  eletrico: 'instalacoes',
  preventivo: 'instalacoes', // preventivo contra incêndio (21/11/2026)
  spda: 'instalacoes',
}

export const NOME_DA_DISCIPLINA: Record<string, string> = {
  fundacao: 'Fundação',
  estrutura: 'Estrutura',
  alvenaria: 'Alvenaria',
  acabamentos: 'Acabamentos',
  instalacoes: 'Instalações',
}

/** Ordem da obra: fundação, estrutura, alvenaria, acabamentos, instalações; as outras depois, na ordem em que aparecem. */
const ORDEM = ['fundacao', 'estrutura', 'alvenaria', 'acabamentos', 'instalacoes']

/** Opção da planta de ambientes que é de alvenaria (vai para Alvenaria, e não para Acabamentos). */
export const ehOpcaoDeAlvenaria = (op: Pick<OpcaoDosAmbientes, 'titulo'>) => /alvenaria|veda[cç][aã]o|modula[cç][aã]o|fiada/i.test(op.titulo)

/** Opção da planta de ambientes que é de instalações: a ficha tem item de pontos (vai para Instalações, 21/11/2026). */
export const ehOpcaoDeInstalacoes = (op: Pick<OpcaoDosAmbientes, 'pontos'>) => !!op.pontos?.length

/** Opção de ambientes que fica em Acabamentos: nem de alvenaria nem de instalações. */
export const ehOpcaoDeAcabamentos = (op: Pick<OpcaoDosAmbientes, 'titulo' | 'pontos'>) => !ehOpcaoDeAlvenaria(op) && !ehOpcaoDeInstalacoes(op)

/** Nome da disciplina no menu ("instalacoes" → "Instalações"; a que o app não conhece, com a 1ª letra maiúscula). */
export function nomeDaDisciplinaDoMenu(id: string): string {
  return NOME_DA_DISCIPLINA[id] ?? (id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Outros')
}

export interface DisciplinaDoPavimento {
  id: string
  nome: string
  plantas: Planta[]
}

/**
 * As disciplinas do pavimento, na ordem da obra, só as que têm planta. A planta de ambientes entra em
 * Acabamentos e, se o pacote dela (já no aparelho) tem opção de alvenaria, também em Alvenaria; se todas as
 * opções são de alvenaria, só em Alvenaria. Sem o pacote no aparelho, fica em Acabamentos (com o Baixar).
 */
export function disciplinasDoPavimento(plantas: readonly Planta[], opcoesAmb: ReadonlyMap<string, readonly OpcaoDosAmbientes[]> = new Map()): DisciplinaDoPavimento[] {
  const porId = new Map<string, Planta[]>()
  const juntar = (id: string, p: Planta) => porId.set(id, [...(porId.get(id) ?? []), p])
  for (const p of plantas) {
    const grupo = GRUPO[p.disciplina] ?? (p.disciplina || 'outros')
    if (p.disciplina === 'arquitetura') {
      const ops = opcoesAmb.get(p.id) ?? []
      const deAlvenaria = ops.filter(ehOpcaoDeAlvenaria).length
      const deInstalacoes = ops.filter((o) => !ehOpcaoDeAlvenaria(o) && ehOpcaoDeInstalacoes(o)).length
      if (deAlvenaria > 0) juntar('alvenaria', p)
      if (deInstalacoes > 0) juntar('instalacoes', p)
      if (ops.length === 0 || ops.some(ehOpcaoDeAcabamentos)) juntar('acabamentos', p)
      continue
    }
    juntar(grupo, p)
  }
  const pos = (id: string) => {
    const i = ORDEM.indexOf(id)
    return i < 0 ? ORDEM.length : i
  }
  return [...porId.entries()]
    .map(([id, lista]) => ({ id, nome: nomeDaDisciplinaDoMenu(id), plantas: lista }))
    .sort((a, b) => pos(a.id) - pos(b.id))
}

/** Abas da planta de forma que viram opção em Estrutura, na ordem da obra. */
export const OPCOES_DA_FORMA: ReadonlyArray<{ tipo: string; nome: string }> = [
  { tipo: 'P', nome: 'Pilares' },
  { tipo: 'V', nome: 'Vigas' },
  { tipo: 'L', nome: 'Lajes' },
  { tipo: 'F', nome: 'Furos de viga' },
  { tipo: 'B', nome: 'Barras de laje' },
]

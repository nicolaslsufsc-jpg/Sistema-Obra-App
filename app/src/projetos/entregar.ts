// "Entregar cópia" (22/11/2026, pedido do Nicolas): o caminho curto para registrar a entrega de uma cópia
// física. Disciplina → prancha (com a revisão vigente) → para quem (empresa e pessoa) → quantas cópias →
// assinatura. Aqui ficam só as listas, puras; as telas estão em telas/TelaEntregarCopia.tsx e Formularios.tsx.
import type { DadosProjetos, Documento } from './dados'
import { normalizar } from './regras'

export interface DisciplinaParaEntregar {
  nome: string
  /** pranchas com revisão vigente (as que dá para entregar) */
  pranchas: number
}

/** Disciplinas que têm prancha com revisão vigente, em ordem alfabética. */
export function disciplinasParaEntregar(d: Pick<DadosProjetos, 'documentos' | 'vigentes'>): DisciplinaParaEntregar[] {
  const m = new Map<string, number>()
  for (const doc of d.documentos) if (d.vigentes.has(doc.id)) m.set(doc.disciplina, (m.get(doc.disciplina) ?? 0) + 1)
  return [...m].map(([nome, pranchas]) => ({ nome, pranchas })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Pranchas da disciplina com revisão vigente, pelo número; a busca acha por código e título, sem acento. */
export function pranchasDaDisciplina(d: Pick<DadosProjetos, 'documentos' | 'vigentes'>, disciplina: string, busca = ''): Documento[] {
  const q = normalizar(busca).trim()
  return d.documentos
    .filter((doc) => doc.disciplina === disciplina && d.vigentes.has(doc.id) && (!q || normalizar(doc.busca).includes(q) || normalizar(`${doc.codigo} ${doc.titulo}`).includes(q)))
    .sort((a, b) => a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }) || a.codigo.localeCompare(b.codigo))
}

/**
 * Quem já recebeu cópia daquela empresa (o nome como foi escrito na entrega), do mais frequente para o menos.
 * Serve de botão no formulário; nome novo continua podendo ser digitado.
 */
export function pessoasDaEmpresa(d: Pick<DadosProjetos, 'eventos'>, empresaId: string): string[] {
  const m = new Map<string, { nome: string; n: number }>()
  for (const e of d.eventos) {
    if (e.apagado || e.tipo !== 'entrega' || String(e.empresa_id) !== empresaId) continue
    const nome = String(e.colaborador ?? '').trim()
    if (!nome) continue
    const k = normalizar(nome)
    const p = m.get(k) ?? { nome, n: 0 }
    p.n++
    m.set(k, p)
  }
  return [...m.values()].sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, 'pt-BR')).map((p) => p.nome)
}

export const COPIAS_MAXIMO = 20

/** "3" → 3; vazio, texto ou fora de 1 a 20 → null (o formulário avisa). */
export function lerCopias(texto: string): number | null {
  const n = Number(String(texto).trim())
  return Number.isInteger(n) && n >= 1 && n <= COPIAS_MAXIMO ? n : null
}

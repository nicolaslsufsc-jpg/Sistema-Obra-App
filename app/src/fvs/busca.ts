// Busca de peça na obra inteira, no início do módulo. Na obra, a pessoa está na frente do P124 e não
// sabe em que "Trecho" da prancha ele fica. Parte pura, sem banco e sem tela.

export interface PecaDaBusca {
  id: string
  tipo: string
  nome: string
  pavimento_id: string
}

const normal = (t: string) => t.trim().toUpperCase().replace(/\s+/g, '')
const semLetras = (nome: string) => nome.replace(/^[A-Z]+/, '')
const ordemNatural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

/**
 * Peças cujo nome começa com o texto, nos pavimentos em que existem. Só número ("124") acha P124 e V124,
 * porque no teclado do celular é o que dá menos trabalho. Primeiro o nome exato, depois em ordem de
 * nome; o mesmo nome fica em ordem de pavimento. Devolve no máximo `limite`, e quantas achou ao todo.
 */
export function buscarPecas<T extends PecaDaBusca>(pecas: Iterable<T>, texto: string, pavimentos: ReadonlyArray<{ id: string }>, limite = 30): { achadas: T[]; total: number } {
  const q = normal(texto)
  if (!q) return { achadas: [], total: 0 }
  const soNumero = /^\d/.test(q)
  const ordemDoPavimento = new Map(pavimentos.map((p, i) => [p.id, i]))
  const exato = (nome: string) => nome === q || (soNumero && semLetras(nome) === q)
  const lista: Array<{ peca: T; nome: string }> = []
  for (const peca of pecas) {
    const nome = normal(peca.nome)
    if (nome.startsWith(q) || (soNumero && semLetras(nome).startsWith(q))) lista.push({ peca, nome })
  }
  lista.sort(
    (a, b) =>
      Number(exato(b.nome)) - Number(exato(a.nome)) ||
      ordemNatural.compare(a.nome, b.nome) ||
      (ordemDoPavimento.get(a.peca.pavimento_id) ?? 0) - (ordemDoPavimento.get(b.peca.pavimento_id) ?? 0),
  )
  return { achadas: lista.slice(0, limite).map((x) => x.peca), total: lista.length }
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toUpperCase()

/** Texto do ambiente na lista da busca da planta: "Living - Apto 303" (o mesmo jeito do local no sistema oficial). */
export function textoDoComodo(e: { comodo?: string; grupo?: string }): string | undefined {
  if (!e.comodo) return undefined
  return e.grupo ? `${e.comodo} - ${e.grupo}` : e.comodo
}

/**
 * O texto da busca é este cômodo? 2 = nome inteiro ("Living / Cozinha - Apto 303", "living cozinha 303"),
 * 1 = começo do nome, com pelo menos 3 letras ("living 303", "303 suite"), 0 = não. Sem acento e sem espaço,
 * e sempre com o apartamento: só o nome do cômodo ("Living") não basta, há um em cada apartamento.
 */
export function casaComodo(e: { comodo?: string; grupo?: string }, texto: string): 0 | 1 | 2 {
  if (!e.comodo) return 0
  const q = semAcento(texto)
  const c = semAcento(e.comodo)
  const g = semAcento(e.grupo ?? '')
  const num = g.replace(/^APTO/, '')
  if (!q || !num) return 0
  let resto: string | null = null
  for (const a of [g, num]) {
    if (q.endsWith(a)) resto = q.slice(0, -a.length)
    else if (q.startsWith(a)) resto = q.slice(a.length)
    if (resto !== null) break
  }
  if (!resto) return 0
  if (resto === c) return 2
  return resto.length >= 3 && c.startsWith(resto) ? 1 : 0
}

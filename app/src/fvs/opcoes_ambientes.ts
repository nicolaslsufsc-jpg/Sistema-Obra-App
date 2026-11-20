// Opções dos ambientes para o menu do pavimento (decisão do Nicolas, 20/11/2026): em vez de ir pela lista de
// cômodos, a pessoa escolhe o que vai conferir (alvenaria, reboco, piso e paginação, impermeabilização,
// esquadrias...) e a planta de ambientes abre já filtrada. O menu é da frente 10 e só chama esta função;
// a TelaPlanta abre com `abre` (servicoInicial e abaInicial).
//
// Montada só com dados (nenhum nome de obra aqui):
// - uma opção por ficha que vale para ambiente (aplica_a com "A"), na ordem do código;
// - projeto do pacote (paginação, impermeabilização...) que aparece em uma ficha só entra no nome da opção
//   dessa ficha; o que aparece em várias fichas vira opção própria, que abre na primeira ficha da lista dele;
//   o que não tem lista de fichas aparece em todas e não vira opção;
// - "Esquadrias", se o pacote tem esquadrias e alguma ficha tem item de esquadria: abre na aba Esquadrias.

import type { DetalhePacote, ElementoPacote } from './pacote'
import { fichasPara, type Ficha } from './situacao'

export type AbaDosAmbientes = 'ambientes' | 'esquadrias'

export interface OpcaoDosAmbientes {
  /** "amb:ficha:<código>", "amb:projeto:<sigla>" ou "amb:esquadrias" */
  id: string
  titulo: string
  setor: 'Ambientes'
  /** o que a TelaPlanta recebe: servicoInicial (código da ficha) e abaInicial */
  abre: { servico: string; aba: AbaDosAmbientes }
  /** títulos dos projetos que aparecem no painel nessa opção ("Paginação de piso") */
  projetos: string[]
}

interface ProjetoDoPacote {
  titulo: string
  sigla: string
  /** null: aparece em todas as fichas */
  fichas: string[] | null
}

/** Os projetos que os ambientes do pacote têm, na ordem em que aparecem (título antes do " · Apto 303"). */
function projetosDoPacote(elementos: Record<string, ElementoPacote>, detalhes: Record<string, DetalhePacote>): ProjetoDoPacote[] {
  const porTitulo = new Map<string, ProjetoDoPacote>()
  for (const el of Object.values(elementos)) {
    if (el.tipo !== 'A') continue
    for (const chave of el.projetos ?? []) {
      const d = detalhes[chave]
      if (!d) continue
      const titulo = (d.titulo.split(' · ')[0] ?? '').trim() || chave
      const atual = porTitulo.get(titulo)
      const fichas = d.fichas && d.fichas.length ? d.fichas : null
      if (!atual) {
        porTitulo.set(titulo, { titulo, sigla: chave.split('_')[0] || chave, fichas: fichas ? [...fichas] : null })
      } else if (atual.fichas) {
        // recortes do mesmo projeto com listas diferentes: vale a soma (sem lista em algum: em todas)
        if (!fichas) atual.fichas = null
        else for (const f of fichas) if (!atual.fichas.includes(f)) atual.fichas.push(f)
      }
    }
  }
  return [...porTitulo.values()]
}

export function opcoesDosAmbientes(
  manifest: { elementos: Record<string, ElementoPacote>; detalhes: Record<string, DetalhePacote> },
  fichasModelo: readonly Ficha[],
): OpcaoDosAmbientes[] {
  const fichas = fichasPara('A', fichasModelo)
  if (!fichas.length) return []
  const codigos = new Set(fichas.map((f) => f.codigo))
  const projetos = projetosDoPacote(manifest.elementos, manifest.detalhes)
  const saida: OpcaoDosAmbientes[] = []
  for (const f of fichas) {
    const daFicha = projetos.filter((p) => !p.fichas || p.fichas.includes(f.codigo))
    // projeto só desta ficha (entre as que existem): entra no nome
    const proprios = daFicha.filter((p) => p.fichas && p.fichas.filter((c) => codigos.has(c)).length === 1)
    saida.push({
      id: `amb:ficha:${f.codigo}`,
      titulo: proprios.length ? `${f.titulo} · ${proprios.map((p) => p.titulo).join(', ')}` : f.titulo,
      setor: 'Ambientes',
      abre: { servico: f.codigo, aba: 'ambientes' },
      projetos: daFicha.map((p) => p.titulo),
    })
  }
  for (const p of projetos) {
    const validas = (p.fichas ?? []).filter((c) => codigos.has(c))
    if (validas.length < 2) continue
    saida.push({
      id: `amb:projeto:${p.sigla}`,
      titulo: p.titulo,
      setor: 'Ambientes',
      abre: { servico: validas[0], aba: 'ambientes' },
      projetos: [p.titulo],
    })
  }
  const temEsquadrias = Object.values(manifest.elementos).some((e) => e.tipo === 'E')
  const comItem = fichas.find((f) => f.itens.some((i) => i.esquadrias))
  if (temEsquadrias && comItem) {
    saida.push({ id: 'amb:esquadrias', titulo: 'Esquadrias', setor: 'Ambientes', abre: { servico: comItem.codigo, aba: 'esquadrias' }, projetos: [] })
  }
  return saida
}

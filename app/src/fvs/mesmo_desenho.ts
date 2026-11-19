// Peças com o mesmo desenho na planta (o P101 e o P101a, por exemplo: na prancha, um pilar que
// nasce em cima do outro). Os contornos se sobrepõem, e o toque no desenho pegaria sempre o de cima.
// Com isto, o toque no desenho deixa a pessoa escolher; o toque no nome continua indo direto.
import type { ElementoPacote } from './pacote'

/** Para cada peça que divide o desenho com outra: todas as peças daquele desenho, em ordem de nome. */
export function pecasDoMesmoDesenho(elementos: Iterable<readonly [string, Pick<ElementoPacote, 'tipo' | 'nome' | 'polys'>]>): Map<string, string[]> {
  const porDesenho = new Map<string, Array<{ id: string; nome: string }>>()
  for (const [id, e] of elementos) {
    // peça sem contorno (só o nome) não divide desenho com ninguém
    if (!e.polys.length) continue
    const chave = `${e.tipo}|${JSON.stringify(e.polys)}`
    const lista = porDesenho.get(chave)
    if (lista) lista.push({ id, nome: e.nome })
    else porDesenho.set(chave, [{ id, nome: e.nome }])
  }
  const ordem = new Intl.Collator('pt-BR', { numeric: true })
  const res = new Map<string, string[]>()
  for (const lista of porDesenho.values()) {
    if (lista.length < 2) continue
    const ids = lista.sort((a, b) => ordem.compare(a.nome, b.nome)).map((x) => x.id)
    for (const id of ids) res.set(id, ids)
  }
  return res
}

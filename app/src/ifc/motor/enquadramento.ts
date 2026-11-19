// Caixa para o botão "Enquadrar": a do conjunto principal, sem peças soltas muito longe.
// Alguns IFCs trazem marcadores (origem, georreferência) a dezenas de metros do prédio; com a caixa
// inteira, o prédio fica pequeno num canto. Os cortes continuam usando a caixa inteira.
//
// Regra (vale com 12 peças ou com 40 mil): em cada eixo, as peças que se encostam ou ficam perto
// formam grupos; o conjunto principal é o grupo com mais peças. Uma peça só sai se estiver separada
// dele por um vão vazio maior que VAO_MINIMO metros E maior que o tamanho do próprio conjunto nesse
// eixo. Prédio é contínuo (nada sai, por mais alto ou comprido que seja); dois prédios vizinhos ficam
// (o vão entre eles é menor que eles); o marcador a 40 m de uma casa de 6 m sai.

/** Vão vazio mínimo, em metros, para uma peça contar como solta. */
export const VAO_MINIMO = 10
/** Com menos peças que isto, nada sai. */
const POUCAS = 5

export type Caixa6 = [number, number, number, number, number, number]

/** Peças (posições em `caixas`) que formam o grupo principal no eixo `k`. */
function grupoPrincipal(caixas: ArrayLike<number>, pecas: number[], k: number): number[] {
  const ordem = [...pecas].sort((a, b) => caixas[a + k] - caixas[b + k])
  // grupos: corre pelas peças em ordem, abre grupo novo quando há vão maior que VAO_MINIMO
  const grupos: Array<{ pecas: number[]; ini: number; fim: number }> = []
  for (const b of ordem) {
    const g = grupos[grupos.length - 1]
    if (g && caixas[b + k] - g.fim <= VAO_MINIMO) {
      g.pecas.push(b)
      g.fim = Math.max(g.fim, caixas[b + k + 3])
    } else grupos.push({ pecas: [b], ini: caixas[b + k], fim: caixas[b + k + 3] })
  }
  if (grupos.length === 1) return pecas
  let principal = grupos[0]
  for (const g of grupos) if (g.pecas.length > principal.pecas.length) principal = g
  if (pecas.length < POUCAS) return pecas
  // junta ao principal os grupos cujo vão até ele não é maior que o tamanho do que já foi juntado
  let ini = principal.ini
  let fim = principal.fim
  const i = grupos.indexOf(principal)
  const ficam = [...principal.pecas]
  let a = i - 1
  let d = i + 1
  for (;;) {
    const limite = Math.max(fim - ini, VAO_MINIMO)
    if (a >= 0 && ini - grupos[a].fim <= limite) {
      ficam.push(...grupos[a].pecas)
      ini = Math.min(ini, grupos[a].ini)
      a--
    } else if (d < grupos.length && grupos[d].ini - fim <= limite) {
      ficam.push(...grupos[d].pecas)
      fim = Math.max(fim, grupos[d].fim)
      d++
    } else break
  }
  // sem a maioria das peças no conjunto não dá para dizer qual é o solto: fica tudo
  if (ficam.length * 2 <= pecas.length) return pecas
  return ficam
}

/**
 * Recebe as caixas das peças (6 números por peça: x0 y0 z0 x1 y1 z1, já na coordenada da cena) e
 * devolve a caixa que junta só as peças do conjunto principal. Null se não houver peça com desenho.
 */
export function caixaSemIsolados(caixas: ArrayLike<number>): Caixa6 | null {
  // peça sem geometria fica com caixa infinita: não entra na conta
  let pecas: number[] = []
  for (let i = 0, n = Math.floor(caixas.length / 6); i < n; i++) {
    const b = i * 6
    let ok = true
    for (let k = 0; k < 3; k++) if (!Number.isFinite(caixas[b + k]) || !Number.isFinite(caixas[b + k + 3]) || caixas[b + k] > caixas[b + k + 3]) ok = false
    if (ok) pecas.push(b)
  }
  if (pecas.length === 0) return null
  // tirar uma peça num eixo pode abrir vão em outro: repete até parar de mudar (no máximo 3 voltas)
  for (let volta = 0; volta < 3; volta++) {
    const antes = pecas.length
    for (let k = 0; k < 3; k++) pecas = grupoPrincipal(caixas, pecas, k)
    if (pecas.length === antes) break
  }
  const r: Caixa6 = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
  for (const b of pecas) {
    for (let k = 0; k < 3; k++) {
      r[k] = Math.min(r[k], caixas[b + k])
      r[k + 3] = Math.max(r[k + 3], caixas[b + k + 3])
    }
  }
  return r
}

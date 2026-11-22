// Seleção de várias peças de uma vez na planta (pedido do Nicolas de 21/11, a "caneta": "segurar como o
// clique de um mouse para selecionar vários elementos ao mesmo tempo"). Com o botão "Arrastar" ligado no
// Pincel ou no "Por item", o dedo desenha um retângulo e entram as peças cujo nome fica dentro dele, como
// na seleção por janela de um programa de desenho. Parte pura, sem tela (selecao.test.ts).

/** [x0, y0, x1, y1] em pontos da prancha, y para baixo (o mesmo do `rotulo` do pacote). */
export type Retangulo = [number, number, number, number]

/** O retângulo entre dois cantos, em qualquer ordem. */
export function retanguloEntre(a: readonly [number, number], b: readonly [number, number]): Retangulo {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]
}

interface PecaNaPlanta {
  tipo: string
  rotulo: readonly number[]
  so_detalhe?: boolean
}

/**
 * Peças do tipo cujo nome (o centro do rótulo) fica dentro do retângulo, na ordem de leitura (de cima para
 * baixo, da esquerda para a direita). O arranque que só mostra detalhe fica de fora.
 */
export function pecasNoRetangulo(elementos: Iterable<readonly [string, PecaNaPlanta]>, r: Retangulo, tipo: string): string[] {
  const dentro: Array<{ id: string; x: number; y: number }> = []
  for (const [id, e] of elementos) {
    if (e.tipo !== tipo || e.so_detalhe) continue
    const x = (e.rotulo[0] + e.rotulo[2]) / 2
    const y = (e.rotulo[1] + e.rotulo[3]) / 2
    if (x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) dentro.push({ id, x, y })
  }
  // linhas de 20 pontos (uns 7 mm na prancha): nomes na mesma altura contam como a mesma linha
  return dentro.sort((a, b) => Math.round(a.y / 20) - Math.round(b.y / 20) || a.x - b.x).map((p) => p.id)
}

/** Arraste curto (menos de 12 px na tela) é toque, não seleção. */
export const ARRASTE_MINIMO_PX = 12

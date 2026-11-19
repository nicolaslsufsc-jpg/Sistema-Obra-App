// Coloca um modelo em cima do outro. Muitas vezes os IFCs de uma obra já chegam na mesma coordenada,
// mas nem sempre: arquitetura exportada do Revit e estrutura do Eberick podem ter origens diferentes.
// O ajuste é só translação e giro em torno da vertical (prédio não tomba).
import { Matrix4 } from 'three'
import type { Vec3 } from './tipos'

/** P' = R(giro) · (P - pivo) + pivo + delta, com tudo em coordenada real. */
export interface Ajuste {
  giro: number
  pivo: Vec3
  delta: Vec3
}

export function ajusteNeutro(): Ajuste {
  return { giro: 0, pivo: [0, 0, 0], delta: [0, 0, 0] }
}

export function ajusteEhNeutro(a: Ajuste): boolean {
  return a.giro === 0 && a.delta[0] === 0 && a.delta[1] === 0 && a.delta[2] === 0
}

/** Matriz que leva a posição do arquivo para a cena. */
export function matrizDoModelo(origemModelo: Vec3, origemCena: Vec3, a: Ajuste): Matrix4 {
  const paraReal = new Matrix4().makeTranslation(origemModelo[0], origemModelo[1], origemModelo[2])
  const menosPivo = new Matrix4().makeTranslation(-a.pivo[0], -a.pivo[1], -a.pivo[2])
  const giro = new Matrix4().makeRotationY(a.giro)
  const maisPivo = new Matrix4().makeTranslation(a.pivo[0] + a.delta[0], a.pivo[1] + a.delta[1], a.pivo[2] + a.delta[2])
  const paraCena = new Matrix4().makeTranslation(-origemCena[0], -origemCena[1], -origemCena[2])
  return paraCena.multiply(maisPivo).multiply(giro).multiply(menosPivo).multiply(paraReal)
}

/**
 * Ajuste a partir de pares de pontos, em coordenada real.
 * `de` é onde o ponto está no modelo que vai mexer; `para` é onde ele deveria estar.
 * Um par: só desloca. Dois pares: também gira em torno da vertical.
 * O par novo é aplicado por cima do ajuste que o modelo já tinha: `de` já vem com ele aplicado.
 */
export function ajusteDePontos(atual: Ajuste, de: readonly Vec3[], para: readonly Vec3[]): Ajuste {
  if (de.length === 0 || de.length !== para.length) return atual
  let giroExtra = 0
  if (de.length >= 2) {
    const a0 = Math.atan2(de[1][2] - de[0][2], de[1][0] - de[0][0])
    const a1 = Math.atan2(para[1][2] - para[0][2], para[1][0] - para[0][0])
    // Em Y para cima, girar de +x para +z é giro negativo em torno de Y.
    giroExtra = -(a1 - a0)
  }
  // Compõe: novo P' = Rn · (P_atual - de0) + para0, com P_atual = R · (P - pivo) + pivo + delta.
  // Mantendo o pivô antigo: P' = R(giro+n) · (P - pivo) + pivo + novoDelta.
  const giro = atual.giro + giroExtra
  const c = Math.cos(giroExtra)
  const s = Math.sin(giroExtra)
  const giraY = (x: number, y: number, z: number): Vec3 => [c * x + s * z, y, -s * x + c * z]
  // Aplica Rn ao (pivo + delta - de0) e soma para0, depois tira o pivô.
  const base = giraY(atual.pivo[0] + atual.delta[0] - de[0][0], atual.pivo[1] + atual.delta[1] - de[0][1], atual.pivo[2] + atual.delta[2] - de[0][2])
  return {
    giro,
    pivo: atual.pivo,
    delta: [base[0] + para[0][0] - atual.pivo[0], base[1] + para[0][1] - atual.pivo[1], base[2] + para[0][2] - atual.pivo[2]],
  }
}

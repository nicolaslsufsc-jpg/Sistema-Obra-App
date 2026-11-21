// Ciclo do toque num local marcado por toque (barra, ponto de instalação, eletroduto; furo de laje pela frente
// 18). Parte pura, sem banco e sem tela (ciclo_do_toque.test.ts). Pedido do Nicolas, 21/11/2026.

import type { Situacao } from './situacao'

/**
 * O que faz o toque no local (barra, ponto, furo), pedido do Nicolas em 21/11: 1 toque OK (verde),
 * 2 toques errada (vermelho, abre a caixa do NC), 3 toques tira a verificação. O 3º toque vale com a caixa do
 * NC ainda aberta (ncAberto: a caixa aberta é desta mesma barra): fecha a caixa e volta para sem conferir.
 */
export type PassoDoToque = 'ok' | 'abrir_nc' | 'tirar'
export function passoDoToque(s: Situacao, ncAberto: boolean): PassoDoToque {
  if (ncAberto) return 'tirar'
  if (s === 'liberado') return 'abrir_nc'
  if (s === 'reprovado') return 'tirar'
  return 'ok'
}

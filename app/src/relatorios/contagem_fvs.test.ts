import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { Linha } from '../nucleo/banco_local'
import { contarFvsDoDia } from './dados'

let seq = 0
function ev(el: string, item: number, resultado: string | null, hora: string, extra: Record<string, unknown> = {}): Linha {
  seq++
  return { id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`, obra_id: 'o', usuario_id: 'u', dispositivo_id: 'd', criado_em_dispositivo: `2026-11-13T${hora}:00.000-03:00`, apagado: false, elemento_id: el, ficha_id: 'f1', item, rodada: 1, resultado, observacao: null, ...extra }
}

describe('Diário: itens da FVS no dia', () => {
  it('a descrição de uma NC não conta outra NC (o registro novo é do mesmo item)', () => {
    const fvs = [
      ev('P1', 1, 'C', '10:00'), ev('P1', 2, 'C', '10:00'), ev('P1', 3, 'C', '10:01'), ev('P1', 4, 'C', '10:01'),
      ev('P1', 5, 'NC', '10:02'),
      ev('P1', 5, 'NC', '10:03', { observacao: 'Espaçador faltando' }),
    ]
    expect(contarFvsDoDia(fvs, '2026-11-13')).toEqual({ aprovados: 4, reprovados: 1, naoAplica: 0, pecas: 1 })
  })

  it('vale o último registro do item; desmarcado não conta; rodadas contam à parte', () => {
    const fvs = [
      ev('P2', 1, 'C', '09:00'), ev('P2', 1, 'NC', '09:05'), // trocou C por NC: 1 NC
      ev('P2', 2, 'C', '09:00'), ev('P2', 2, null, '09:10'), // desmarcou: não conta
      ev('P2', 3, 'NC', '09:00'), ev('P2', 3, 'C', '11:00', { rodada: 2 }), // reinspeção: NC e C
      ev('P3', 1, 'NA', '09:00'),
      { ...ev('P3', 2, 'C', '12:00'), criado_em_dispositivo: '2026-11-11T12:00:00.000-03:00' }, // outro dia: fora (longe da meia-noite, vale em qualquer fuso)
    ]
    expect(contarFvsDoDia(fvs, '2026-11-13')).toEqual({ aprovados: 1, reprovados: 2, naoAplica: 1, pecas: 2 })
  })
})

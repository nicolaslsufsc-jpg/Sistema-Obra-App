import { describe, expect, it } from 'vitest'
import type { Linha } from '../nucleo/banco_local'
import { escritorioPorDocumento, normalizar, revisaoNova, rotulo, situacoes, vigentePorDocumento } from './regras'

let n = 0
function linha(campos: Record<string, unknown>): Linha {
  n++
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    obra_id: 'o',
    usuario_id: 'u',
    dispositivo_id: 'd',
    criado_em_dispositivo: `2026-11-03T10:${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}.000Z`,
    apagado: false,
    ...campos,
  }
}

const rev = (documento_id: string, fase: string, numero: string, extra: Record<string, unknown> = {}) =>
  linha({ documento_id, fase, numero, obsoleta: false, vista_em: '2026-11-03', ...extra })

describe('vigência (igual à view revisoes_vigentes)', () => {
  it('LO vence EX mesmo com número menor', () => {
    const ex = rev('d1', 'EX', '05')
    const lo = rev('d1', 'LO', '02')
    expect(vigentePorDocumento([ex, lo]).get('d1')?.id).toBe(lo.id)
  })
  it('na mesma fase vale o maior número', () => {
    const a = rev('d2', 'EX', '03')
    const b = rev('d2', 'EX', '04')
    expect(vigentePorDocumento([b, a]).get('d2')?.id).toBe(b.id)
  })
  it('obsoleta não concorre; só obsoletas = sem vigente', () => {
    const ex = rev('d1', 'EX', '05')
    const lo = rev('d1', 'LO', '02', { obsoleta: true })
    expect(vigentePorDocumento([ex, lo]).get('d1')?.id).toBe(ex.id)
    expect(vigentePorDocumento([lo]).has('d1')).toBe(false)
  })
  it('fase desconhecida fica abaixo de EX e LO', () => {
    const ap = rev('d3', 'AP', '09')
    const ex = rev('d3', 'EX', '01')
    expect(vigentePorDocumento([ap, ex]).get('d3')?.id).toBe(ex.id)
  })
  it('linha apagada não conta', () => {
    const lo = rev('d1', 'LO', '02', { apagado: true })
    expect(vigentePorDocumento([lo]).size).toBe(0)
  })
  it('rótulo', () => {
    expect(rotulo({ fase: 'LO', numero: '02' })).toBe('LO R02')
  })
})

describe('escritório (igual à view documentos_escritorio)', () => {
  it('vale o último evento pela hora do aparelho', () => {
    const a = linha({ documento_id: 'd1', revisao_id: 'r1', criado_em_dispositivo: '2026-10-02T10:00:00.000Z' })
    const b = linha({ documento_id: 'd1', revisao_id: 'r2', criado_em_dispositivo: '2026-10-03T10:00:00.000Z' })
    expect(escritorioPorDocumento([b, a]).get('d1')?.id).toBe(b.id)
  })
})

describe('situação por empresa e documento (igual à view situacao_distribuicao)', () => {
  const vigentes = new Map<string, Linha>([
    ['d1', rev('d1', 'LO', '02')],
    ['d2', rev('d2', 'EX', '04')],
  ])
  const entrega = (empresa_id: string, documento_id: string, revisao_id: string, data_evento: string) =>
    linha({ tipo: 'entrega', empresa_id, documento_id, revisao_id, entrega_id: null, data_evento })

  it('na vigente = OK; em revisão vencida = RECOLHER', () => {
    const ok = entrega('A', 'd1', vigentes.get('d1')!.id, '2026-10-05')
    const velha = entrega('A', 'd2', 'r-velha', '2026-10-05')
    const s = situacoes([ok, velha], vigentes)
    expect(s.find((x) => x.documento_id === 'd1')?.situacao).toBe('OK')
    const r = s.find((x) => x.documento_id === 'd2')!
    expect(r.situacao).toBe('RECOLHER')
    expect(r.revisao_em_campo_id).toBe('r-velha')
    expect(r.revisao_vigente_id).toBe(vigentes.get('d2')!.id)
  })
  it('devolvida = DEVOLVIDO, com a data da devolução', () => {
    const e = entrega('A', 'd1', 'r-velha', '2026-10-05')
    const dev = linha({ tipo: 'devolucao', empresa_id: 'A', documento_id: 'd1', revisao_id: 'r-velha', entrega_id: e.id, data_evento: '2026-10-09' })
    const s = situacoes([e, dev], vigentes)
    expect(s).toHaveLength(1)
    expect(s[0].situacao).toBe('DEVOLVIDO')
    expect(s[0].entregas_abertas).toHaveLength(0)
    expect(s[0].ultimo_evento).toBe('2026-10-09')
  })
  it('duas entregas abertas = CONFERIR, e as duas aparecem para recolher', () => {
    const a = entrega('B', 'd2', 'r-velha', '2026-10-06')
    const b = entrega('B', 'd2', vigentes.get('d2')!.id, '2026-10-07')
    const s = situacoes([a, b], vigentes)
    expect(s[0].situacao).toBe('CONFERIR')
    expect(s[0].entregas_abertas.map((x) => x.id)).toEqual([b.id, a.id])
    expect(s[0].revisao_em_campo_id).toBe(vigentes.get('d2')!.id)
  })
  it('documento sem vigente = CONFERIR', () => {
    const e = entrega('B', 'd9', 'r-obsoleta', '2026-10-08')
    const s = situacoes([e], vigentes)
    expect(s[0].situacao).toBe('CONFERIR')
    expect(s[0].revisao_vigente_id).toBeNull()
  })
  it('devolução apagada não fecha a entrega', () => {
    const e = entrega('A', 'd1', vigentes.get('d1')!.id, '2026-10-05')
    const dev = linha({ tipo: 'devolucao', empresa_id: 'A', documento_id: 'd1', revisao_id: e.revisao_id, entrega_id: e.id, data_evento: '2026-10-09', apagado: true })
    expect(situacoes([e, dev], vigentes)[0].situacao).toBe('OK')
  })
})

describe('revisão nova e busca', () => {
  it('nova = vista nos últimos 7 dias', () => {
    expect(revisaoNova(rev('d1', 'LO', '02', { vista_em: '2026-11-03' }), '2026-11-04')).toBe(true)
    expect(revisaoNova(rev('d1', 'LO', '02', { vista_em: '2026-10-28' }), '2026-11-04')).toBe(true)
    expect(revisaoNova(rev('d1', 'LO', '02', { vista_em: '2026-10-27' }), '2026-11-04')).toBe(false)
    expect(revisaoNova(rev('d1', 'LO', '02', { vista_em: '2026-11-03', obsoleta: true }), '2026-11-04')).toBe(false)
  })
  it('normalizar ignora maiúsculas e acentos', () => {
    expect(normalizar('Fôrma do PILOTIS – Ãrea')).toBe('forma do pilotis – area')
    expect(normalizar('XPT.ES.112').includes(normalizar('es.112'))).toBe(true)
  })
})

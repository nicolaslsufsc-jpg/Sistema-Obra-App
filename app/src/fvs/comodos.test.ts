import { describe, expect, it } from 'vitest'
import { casaComodo, textoDoComodo } from './busca'
import { comodoGuardado, lembrarComodo, nomeComComodo, nomeDaPeca } from './comodos'
import { listarReprovacoes } from './reprovacoes'

describe('nome do cômodo do ambiente', () => {
  const sala = { comodo: 'Living / Cozinha', grupo: 'Apto 303' }

  it('a busca da planta acha pelo cômodo e o apartamento, sem acento e sem espaço', () => {
    expect(textoDoComodo(sala)).toBe('Living / Cozinha - Apto 303')
    for (const t of ['Living / Cozinha - Apto 303', 'living/cozinha 303', '303 LIVING COZINHA', 'livingcozinhaapto303']) expect(casaComodo(sala, t)).toBe(2)
    for (const t of ['living 303', '303 liv', 'Apto 303 living']) expect(casaComodo(sala, t)).toBe(1)
    expect(casaComodo(sala, 'living')).toBe(0) // há um em cada apartamento
    expect(casaComodo(sala, 'li 303')).toBe(0) // pouco texto
    expect(casaComodo(sala, 'living 304')).toBe(0)
    expect(casaComodo(sala, 'cozinha 303')).toBe(0) // é pelo começo do nome
    expect(casaComodo({ grupo: 'Apto 303' }, '303')).toBe(0)
    expect(textoDoComodo({ grupo: 'Apto 303' })).toBeUndefined()
    expect(casaComodo({ comodo: 'Suíte 01', grupo: 'Apto 303' }, 'suite 01 303')).toBe(2)
  })

  it('as listas mostram "303-03 · Living" e só o número quando não há nome', () => {
    expect(nomeComComodo('303-03', 'Living')).toBe('303-03 · Living')
    expect(nomeComComodo('303-03')).toBe('303-03')
    lembrarComodo('a1', 'Living')
    expect(comodoGuardado('a1')).toBe('Living')
    expect(nomeDaPeca({ id: 'a1', nome: '303-03' })).toBe('303-03 · Living')
    lembrarComodo('a1', undefined) // pacote novo sem o nome: esquece
    expect(nomeDaPeca({ id: 'a1', nome: '303-03' })).toBe('303-03')
  })

  it('a lista de reprovações leva o nome do cômodo', () => {
    lembrarComodo('a2', 'Suíte 01')
    const ficha = { id: 'f1', codigo: 'EXE-PVS-ALV', titulo: 'Alvenaria', revisao: 0, aplica_a: ['A'], itens: [{ n: 1, etapa: 'MARCAÇÃO', titulo: 'Primeira fiada' }] }
    const ev = { id: 'e1', elemento_id: 'a2', ficha_id: 'f1', item: 1, resultado: 'NC', rodada: 1, criado_em_dispositivo: '2026-11-18T10:00:00Z', usuario_id: 'u' }
    const linhas = listarReprovacoes({
      pecas: [{ id: 'a2', tipo: 'A', nome: '303-01', pavimento_id: 'pv' }],
      eventosDe: new Map([['a2', [ev as never]]]),
      fichaPorId: new Map([['f1', ficha as never]]),
      fichasCampoDe: new Map(),
      fotosDe: new Map(),
      quem: () => 'você',
    })
    expect(linhas.map((l) => l.pecaNome)).toEqual(['303-01 · Suíte 01'])
  })
})

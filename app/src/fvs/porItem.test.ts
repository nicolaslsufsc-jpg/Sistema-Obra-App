// Modo "Por item" (18/11/2026). Ficha fictícia da obra EXE.
import { describe, expect, it, vi } from 'vitest'
import {
  guardarItem,
  itemGuardado,
  itemNaPeca,
  itensParaEscolher,
  nomeDoItem,
  proximoDoToque,
  registroDoItem,
  resultadoDoItem,
  resumoDoItem,
  textoDoResultado,
} from './porItem'
import { fichaNaPeca, type EventoFvs, type Ficha, type Resultado } from './situacao'

const PILAR: Ficha = {
  id: 'f-exe-pil',
  codigo: 'EXE-PVS-001',
  titulo: 'Pilar (Obra Exemplo)',
  revisao: '0',
  aplica_a: ['P'],
  itens: [
    { n: 1, etapa: 'INÍCIO', titulo: 'Projeto na mão' },
    { n: 4, etapa: 'FORMA', titulo: 'Prumo' },
    { n: 7, etapa: 'ARMAÇÃO', titulo: 'Furação', furos: true },
    { n: 12, etapa: 'FORMA', titulo: 'Forma do consolo', parte: 'consolo' },
  ],
}

let seq = 0
function ev(item: number, resultado: Resultado | null, ficha = PILAR.id): EventoFvs {
  seq++
  return {
    id: `e${String(seq).padStart(4, '0')}`,
    elemento_id: 'p1',
    ficha_id: ficha,
    item,
    resultado,
    rodada: 1,
    observacao: null,
    lote_id: null,
    planta_id: null,
    usuario_id: 'u',
    criado_em_dispositivo: `2026-11-18T10:00:${String(seq % 60).padStart(2, '0')}.${String(seq).padStart(3, '0')}Z`,
  }
}

describe('itens para escolher', () => {
  it('tira os itens que outra coisa marca (furos, barras)', () => {
    expect(itensParaEscolher(PILAR).map((i) => i.n)).toEqual([1, 4, 12])
    expect(itensParaEscolher(undefined)).toEqual([])
  })

  it('nome do item com a parte', () => {
    expect(nomeDoItem(PILAR.itens[1])).toBe('4. Prumo')
    expect(nomeDoItem(PILAR.itens[3])).toBe('12. Forma do consolo (consolo)')
  })
})

describe('o item escolhido na ficha da peça', () => {
  const prumo = { n: 4, titulo: 'Prumo' }

  it('acha pelo número e confere o título', () => {
    expect(itemNaPeca(PILAR, prumo)).toEqual({ item: PILAR.itens[1] })
    expect(itemNaPeca(PILAR, { n: 4, titulo: '  prumo ' })).toEqual({ item: PILAR.itens[1] })
  })

  it('outra revisão com outro item no mesmo número: não marca', () => {
    const rev1: Ficha = { ...PILAR, id: 'f-exe-pil-r1', itens: [{ n: 4, etapa: 'FORMA', titulo: 'Esquadro' }] }
    expect(itemNaPeca(rev1, prumo)).toEqual({ falta: 'item' })
    expect(itemNaPeca({ ...PILAR, itens: [] }, prumo)).toEqual({ falta: 'item' })
    expect(itemNaPeca(undefined, prumo)).toEqual({ falta: 'ficha' })
  })

  it('item automático nunca é marcado por aqui', () => {
    expect(itemNaPeca(PILAR, { n: 7, titulo: 'Furação' })).toEqual({ falta: 'item' })
  })

  it('item de consolo só no pilar que tem consolo na planta', () => {
    const consolo = { n: 12, titulo: 'Forma do consolo' }
    expect(itemNaPeca(fichaNaPeca(PILAR, []), consolo)).toEqual({ falta: 'parte', parte: 'consolo' })
    expect(itemNaPeca(fichaNaPeca(PILAR, ['capitel']), consolo)).toEqual({ falta: 'parte', parte: 'consolo' })
    expect('item' in itemNaPeca(fichaNaPeca(PILAR, ['consolo']), consolo)).toBe(true)
  })
})

describe('o toque', () => {
  it('modo OK: sem conferir ou NA → C; C → pedir o NC; NC → C (reinspeção)', () => {
    expect(proximoDoToque(null)).toBe('C')
    expect(proximoDoToque('NA', 'C')).toBe('C')
    expect(proximoDoToque('C', 'C')).toBe('pedir-nc')
    expect(proximoDoToque('NC', 'C')).toBe('C')
  })

  it('modo NA: sem conferir, C ou NC → NA; NA → sem conferir', () => {
    expect(proximoDoToque(null, 'NA')).toBe('NA')
    expect(proximoDoToque('C', 'NA')).toBe('NA')
    expect(proximoDoToque('NC', 'NA')).toBe('NA')
    expect(proximoDoToque('NA', 'NA')).toBe('limpar')
  })

  it('o resultado atual é o registro mais novo do item nesta ficha', () => {
    const evs = [ev(4, 'C'), ev(1, 'NC'), ev(4, 'NC'), ev(4, 'C', 'outra-ficha')]
    expect(resultadoDoItem(PILAR, evs, 4)).toBe('NC')
    expect(resultadoDoItem(PILAR, evs, 1)).toBe('NC')
    expect(resultadoDoItem(PILAR, evs, 12)).toBeNull()
    expect(resultadoDoItem(PILAR, [...evs, ev(4, null)], 4)).toBeNull()
    expect(registroDoItem(PILAR, evs, 4)?.id).toBe(evs[2].id)
  })

  it('texto do aviso', () => {
    expect(['C', 'NC', 'NA', null].map((r) => textoDoResultado(r as Resultado | null))).toEqual(['OK', 'errado', 'não se aplica', 'sem conferir'])
  })
})

describe('contador', () => {
  it('OK de quantos se aplicam, errados e NA', () => {
    expect(resumoDoItem([]).texto).toBe('0 de 0 OK')
    expect(resumoDoItem(['C', null, null]).texto).toBe('1 de 3 OK')
    expect(resumoDoItem(['C', 'NC', null]).texto).toBe('1 de 3 OK · 1 errado')
    expect(resumoDoItem(['NC', 'NC', 'NA', 'C']).texto).toBe('1 de 3 OK · 2 errados · 1 NA')
    expect(resumoDoItem(['C', 'NA'])).toMatchObject({ total: 2, ok: 1, erradas: 0, na: 1 })
  })
})

describe('o item fica guardado no aparelho', () => {
  it('guarda e lê por obra e por tipo', () => {
    const mem = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v) })
    expect(itemGuardado('obra-exe', 'P')).toBeNull()
    guardarItem('obra-exe', 'P', { n: 4, titulo: 'Prumo' })
    expect(itemGuardado('obra-exe', 'P')).toEqual({ n: 4, titulo: 'Prumo' })
    expect(itemGuardado('obra-exe', 'V')).toBeNull()
    expect(itemGuardado('outra-obra', 'P')).toBeNull()
    mem.set('fvs_por_item:obra-exe:P', '{"n":"x"}')
    expect(itemGuardado('obra-exe', 'P')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('sem localStorage (modo privado), não quebra', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
    })
    expect(itemGuardado('obra-exe', 'P')).toBeNull()
    expect(() => guardarItem('obra-exe', 'P', { n: 4, titulo: 'Prumo' })).not.toThrow()
    vi.unstubAllGlobals()
  })
})

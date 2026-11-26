// Onde o lote foi usado (recebimento_usos, 25/11): regras do formulário e gravação no aparelho.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { errosDoUso, podeMarcarUso, quantidadeUsada, type FormUso } from './fvm'
import { carregarFvm, desfazerUso, registrarRecebimento, registrarUso } from './fvm_dados'
import { TABELAS_CONCRETO } from './tabelas'

const OBRA = 'b0000000-0000-0000-0000-0000000000f8'
const USUARIO = '00000000-0000-0000-0000-0000000000f8'
const PAV = 'a0000000-0000-0000-0000-0000000000f8'
const HOJE = '2026-11-25'

const form = (m: Partial<FormUso> = {}): FormUso => ({ pavimento_id: PAV, elemento_id: null, local_texto: '', quantidade: null, data: HOJE, ...m })

describe('regras do uso', () => {
  it('só material liberado (com ou sem ressalva) pode ser usado', () => {
    expect(podeMarcarUso('liberado')).toBe(true)
    expect(podeMarcarUso('liberado_ressalva')).toBe(true)
    expect(podeMarcarUso('retido')).toBe(false)
    expect(podeMarcarUso('devolvido')).toBe(false)
    expect(errosDoUso(form(), { data: '2026-11-20', situacao: 'retido' }, HOJE).situacao).toBeTruthy()
  })

  it('pede o pavimento; data entre o recebimento e hoje; quantidade é opcional mas positiva', () => {
    const r = { data: '2026-11-20', situacao: 'liberado' as const }
    expect(errosDoUso(form(), r, HOJE)).toEqual({})
    expect(errosDoUso(form({ pavimento_id: '' }), r, HOJE).pavimento_id).toBeTruthy()
    expect(errosDoUso(form({ data: '2026-11-26' }), r, HOJE).data).toMatch(/depois de hoje/)
    expect(errosDoUso(form({ data: '2026-11-19' }), r, HOJE).data).toMatch(/antes do recebimento/)
    expect(errosDoUso(form({ quantidade: 0 }), r, HOJE).quantidade).toBeTruthy()
    expect(errosDoUso(form({ quantidade: 12.5 }), r, HOJE)).toEqual({})
  })

  it('soma só os usos com quantidade', () => {
    expect(quantidadeUsada([{ quantidade: 2 }, { quantidade: null }, { quantidade: 0.5 }])).toBe(2.5)
  })

  it('a tabela dos usos sincroniza depois da dos recebimentos (filha depois da mãe)', () => {
    const t = TABELAS_CONCRETO as readonly string[]
    expect(t.indexOf('recebimento_usos')).toBeGreaterThan(t.indexOf('recebimentos'))
  })
})

describe('usos no aparelho', () => {
  it('marca, lista pelo recebimento e desfaz', async () => {
    const rec = await registrarRecebimento(OBRA, USUARIO, {
      material_codigo: 'ACO-CA50',
      material_nome: 'Aço CA-50',
      unidade: 'kg',
      data: '2026-11-20',
      fornecedor: 'Fornecedor Exemplo',
      nota_fiscal: '123',
      lote: 'L-01',
      quantidade: 2500,
      itens: [],
      documentos: [],
      fotos: [],
      situacao: 'liberado',
      motivo: null,
      observacao: null,
    })
    await registrarUso(OBRA, USUARIO, { recebimento_id: rec.id, pavimento_id: PAV, elemento_id: null, local_texto: 'Pilares do eixo 3', quantidade: 800, data: '2026-11-21', observacao: null })
    await registrarUso(OBRA, USUARIO, { recebimento_id: rec.id, pavimento_id: PAV, elemento_id: null, local_texto: null, quantidade: null, data: '2026-11-22', observacao: null })
    let fvm = await carregarFvm(OBRA)
    expect(fvm.usos.map((u) => u.data)).toEqual(['2026-11-22', '2026-11-21'])
    expect(fvm.usos.every((u) => u.recebimento_id === rec.id)).toBe(true)
    expect(quantidadeUsada(fvm.usos)).toBe(800)

    await desfazerUso(OBRA, USUARIO, fvm.usos[1])
    fvm = await carregarFvm(OBRA)
    expect(fvm.usos).toHaveLength(1)
    expect(fvm.usos[0]).toMatchObject({ data: '2026-11-22', quantidade: null, local_texto: null })
  })
})

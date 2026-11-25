import { describe, expect, it } from 'vitest'
import { andamentoPorApartamento, categoriaDoAcabamento, categoriasPresentes, ehDeAcabamento, grupoDoAmbiente, textoDoAndamento, valeNoAcabamento } from './acabamentos'
import type { EventoFvs, Ficha } from './situacao'

// Obra EXE: títulos genéricos de fichas de acabamento, como vêm do servidor
const ficha = (id: string, codigo: string, titulo: string): Ficha => ({
  id,
  codigo,
  titulo,
  revisao: '0',
  aplica_a: ['A'],
  itens: [
    { n: 1, etapa: 'INÍCIO', titulo: 'Local limpo' },
    { n: 2, etapa: 'EXECUÇÃO', titulo: 'Acabamento' },
  ],
})
const REBOCO = ficha('fr', 'EXE-PVS-REB', 'Reboco Interno')
const PISO = ficha('fp', 'EXE-PVS-PISO', 'Revestimento Cerâmico de Piso')
const PINTURA = ficha('fn', 'EXE-PVS-PINT', 'Pintura Interna com Massa Corrida')

let n = 0
const ev = (elemento_id: string, f: Ficha, item: number, resultado: EventoFvs['resultado']): EventoFvs => ({
  id: `e${++n}`,
  elemento_id,
  ficha_id: f.id,
  item,
  resultado,
  rodada: 1,
  observacao: null,
  lote_id: null,
  planta_id: null,
  usuario_id: 'u',
  criado_em_dispositivo: `2026-11-24T10:00:${String(n).padStart(2, '0')}Z`,
})

describe('categoria do acabamento pelo título da ficha', () => {
  it('reboco, piso, pintura, drywall e o resto em outros', () => {
    expect(categoriaDoAcabamento('Reboco Interno').id).toBe('reboco')
    expect(categoriaDoAcabamento('Revestimento Cerâmico de Parede').id).toBe('piso')
    expect(categoriaDoAcabamento('Piso Vinílico').id).toBe('piso')
    expect(categoriaDoAcabamento('Contrapiso Interno').id).toBe('piso')
    expect(categoriaDoAcabamento('Pintura Interna - Textura Rolada').id).toBe('pintura')
    expect(categoriaDoAcabamento('Paredes de Gesso Acartonado (Drywall)').id).toBe('drywall')
    expect(categoriaDoAcabamento('Forro em Madeira').id).toBe('drywall')
    expect(categoriaDoAcabamento('Impermeabilização - Manta Asfáltica')).toEqual({ id: 'outros', nome: 'Outros' })
  })

  it('só as categorias que aparecem, na ordem do menu, com outros no fim', () => {
    expect(categoriasPresentes(['Impermeabilização', 'Pintura Interna', 'Reboco Interno', 'Pintura Externa']).map((c) => c.id)).toEqual(['reboco', 'pintura', 'outros'])
    expect(categoriasPresentes([])).toEqual([])
  })
})

describe('andamento por apartamento', () => {
  it('apartamento pelo grupo do pacote, ou pelo número antes do hífen', () => {
    expect(grupoDoAmbiente('305-02', 'Apto 305')).toBe('Apto 305')
    expect(grupoDoAmbiente('305-02')).toBe('Apto 305')
    expect(grupoDoAmbiente('Hall')).toBe('Sem apartamento')
  })

  it('"Apto 305: Reboco Interno 1 de 2": cada ficha conta só onde vale, área comum no fim', () => {
    const ambientes = [
      { id: 'a1', nome: '305-01' },
      { id: 'a2', nome: '305-02' },
      { id: 'a3', nome: '305-03' }, // banho: sem reboco
      { id: 'a4', nome: '1001-01' },
      { id: 'c1', nome: 'C-01' },
    ]
    const grupos: Record<string, string> = { c1: 'Área comum' }
    const evs: Record<string, EventoFvs[]> = {
      a1: [ev('a1', REBOCO, 1, 'C'), ev('a1', REBOCO, 2, 'C')],
      a2: [ev('a2', REBOCO, 1, 'NC')],
      a3: [ev('a3', PISO, 1, 'C')],
    }
    const vale = (id: string, codigo: string) => !(id === 'a3' && codigo === REBOCO.codigo)
    const r = andamentoPorApartamento(ambientes, [REBOCO, PISO, PINTURA], (id) => evs[id] ?? [], (id) => grupos[id], vale)
    // apartamentos pelo número (305 antes de 1001), área comum no fim
    expect(r.map((l) => l.grupo)).toEqual(['Apto 305', 'Apto 1001', 'Área comum'])
    const apto305 = r[0].fichas.map((f) => [f.ficha.codigo, f.liberados, f.comR, f.total])
    expect(apto305).toEqual([
      ['EXE-PVS-REB', 1, 1, 2],
      ['EXE-PVS-PISO', 0, 0, 3],
      ['EXE-PVS-PINT', 0, 0, 3],
    ])
    expect(textoDoAndamento(r[0].fichas[0])).toBe('Reboco Interno 1 de 2 · 1 com NC')
    expect(textoDoAndamento(r[1].fichas[0])).toBe('Reboco Interno 0 de 1')
  })

  it('apartamento em que nenhuma das fichas vale não aparece', () => {
    const r = andamentoPorApartamento([{ id: 'a1', nome: '101-01' }], [REBOCO], () => [], () => undefined, () => false)
    expect(r).toEqual([])
  })
})

// rodada 9b do testador (24/11/2026): com a planta de fundação baixada, os quadrados da escavação viravam
// "Apto ESC" e a ficha de escavação virava o acabamento "Outros" em todos os apartamentos
describe('grade de escavação fora dos acabamentos', () => {
  const ESC = ficha('fe', 'EXE-PVS-ESC', 'Escavação')
  const daGrade = (id: string) => id.startsWith('q')
  const fichaDaGrade = (codigo: string) => codigo === ESC.codigo

  it('o quadrado não vira apartamento e a ficha da grade não conta em nenhum cômodo', () => {
    const ambientes = [
      { id: 'a1', nome: '101-01' },
      { id: 'a2', nome: '101-02' },
      { id: 'q1', nome: 'ESC-A1' },
      { id: 'q2', nome: 'ESC-A2' },
    ]
    const linhas = andamentoPorApartamento(ambientes, [REBOCO, ESC], () => [], () => undefined, valeNoAcabamento(daGrade, fichaDaGrade, () => undefined))
    expect(linhas.map((l) => [l.grupo, l.fichas.map(textoDoAndamento)])).toEqual([['Apto 101', ['Reboco Interno 0 de 2']]])
  })

  it('o "não se aplica" do pacote continua valendo', () => {
    const vale = valeNoAcabamento(daGrade, fichaDaGrade, (id) => (id === 'a1' ? [REBOCO.codigo] : undefined))
    expect([vale('a1', REBOCO.codigo), vale('a2', REBOCO.codigo), vale('q1', REBOCO.codigo), vale('a2', ESC.codigo)]).toEqual([false, true, false, false])
  })

  it('cômodo sem tipo (sem nome num apartamento com nomes) fica fora de todas as fichas', () => {
    const vale = valeNoAcabamento(daGrade, fichaDaGrade, () => undefined, (id) => id === 'a2')
    expect([vale('a1', REBOCO.codigo), vale('a2', REBOCO.codigo)]).toEqual([true, false])
  })

  it('a opção da ficha da grade sai do menu de acabamentos (sem "Outros")', () => {
    const op = (titulo: string, servico: string) => ({ titulo, pontos: undefined, abre: { servico, aba: 'ambientes' as const } })
    const ops = [op('Reboco Interno', REBOCO.codigo), op('Escavação', ESC.codigo)].filter((o) => ehDeAcabamento(o, fichaDaGrade))
    expect(categoriasPresentes(ops.map((o) => o.titulo)).map((c) => c.nome)).toEqual(['Reboco'])
  })
})

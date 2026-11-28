// Seis canetas do mapa (26/11): em que peças cada área vale, laje, rastreio e caneta desconhecida.
import { describe, expect, it } from 'vitest'
import { CANETAS, canetaComLaje, canetaDesconhecida, contaNaLaje, ehCaneta, lajePeloDesenho, NOME_DA_CANETA, separarPorParte, valeNaPeca } from './canetas'
import { caminhoesComLajeDesenhada, type Area } from './dados'

const vale = (alvo: unknown) => ['P', 'V', 'L', 'K'].filter((t) => valeNaPeca(alvo, t)).join('')

describe('canetas', () => {
  it('são as seis combinações que fazem sentido, sem "pilares e lajes"', () => {
    expect(CANETAS.map((c) => NOME_DA_CANETA[c])).toEqual(['Pilares', 'Vigas', 'Lajes', 'Pilares e vigas', 'Vigas e lajes', 'Pilares, vigas e lajes'])
    expect(ehCaneta('pilares_laje')).toBe(false)
  })

  it('cada caneta vale só nas peças dela; o resto da forma (bloco...) anda com as vigas, como antes', () => {
    expect(vale('pilares')).toBe('P')
    expect(vale('vigas')).toBe('VK')
    expect(vale('laje')).toBe('L')
    expect(vale('pilares_vigas')).toBe('PVK')
    expect(vale('vigas_laje')).toBe('VLK') // igual à "vigas e laje" de antes (tudo menos pilar)
    expect(vale('pilares_vigas_laje')).toBe('PVLK')
  })

  it('área antiga sem caneta vale em tudo; caneta desconhecida (versão nova) não vale em nada e não quebra', () => {
    expect(vale(null)).toBe('PVLK')
    expect(vale(undefined)).toBe('PVLK')
    expect(vale('paredes')).toBe('')
    expect(canetaComLaje('paredes')).toBe(false)
    expect(contaNaLaje('paredes')).toBe(false)
  })

  it('só as canetas com laje põem a laje no caminhão; o rastreio da laje conta essas e as antigas', () => {
    expect(CANETAS.filter(canetaComLaje)).toEqual(['laje', 'vigas_laje', 'pilares_vigas_laje'])
    expect(canetaComLaje(null)).toBe(false)
    expect(contaNaLaje(null)).toBe(true)
    expect(CANETAS.filter(contaNaLaje)).toEqual(['laje', 'vigas_laje', 'pilares_vigas_laje'])
  })

  it('laje pelo desenho: caneta desconhecida sozinha não decide (a laje fica como está)', () => {
    expect(lajePeloDesenho(['pilares', 'vigas_laje'])).toBe(true)
    expect(lajePeloDesenho(['pilares', null])).toBe(false)
    expect(lajePeloDesenho([])).toBe(false)
    expect(lajePeloDesenho(['pilares', 'paredes'])).toBeNull()
    expect(lajePeloDesenho(['laje', 'paredes'])).toBe(true)
    expect(canetaDesconhecida('paredes')).toBe(true)
    expect(canetaDesconhecida(null)).toBe(false)
    expect(canetaDesconhecida('vigas')).toBe(false)
  })

  it('a peça soma as áreas de todas as canetas que valem nela', () => {
    const pecas = [{ id: 'p1' }, { id: 'v1' }, { id: 'l1' }]
    const tipo = (id: string) => id[0].toUpperCase()
    const areas = [{ alvo: 'pilares' }, { alvo: 'pilares_vigas' }, { alvo: 'laje' }, { alvo: null }, { alvo: 'nova' }]
    const g = separarPorParte(pecas, tipo, areas)
    expect(g.map((x) => x.pecas.map((p) => p.id))).toEqual([['p1'], ['v1'], ['l1']])
    expect(g.map((x) => x.areas.map((a) => a.alvo))).toEqual([['pilares', 'pilares_vigas', null], ['pilares_vigas', null], ['laje', null]])
  })

  it('o relatório marca a laje desenhada nos caminhões com caneta de laje', () => {
    const area = (caminhao_id: string, alvo: string | null) => ({ caminhao_id, alvo }) as unknown as Area
    const areasDe = new Map([
      ['k1', [area('k1', 'pilares_vigas_laje')]],
      ['k2', [area('k2', 'vigas')]],
      ['k3', [area('k3', 'laje')]],
      ['k4', [area('k4', 'pilares_vigas')]],
    ])
    expect([...caminhoesComLajeDesenhada({ areasDe })]).toEqual(['k1', 'k3'])
  })
})

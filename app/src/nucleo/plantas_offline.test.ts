import { describe, expect, it } from 'vitest'
import { cabeNoAparelho, situacaoDasPlantas, type PlantaParaBaixar } from './plantas_offline'

const MB = 1024 * 1024
const planta = (id: string, mb: number | null): PlantaParaBaixar => ({
  id,
  prancha: `EXE-FOR-${id}`,
  manifest: mb === null ? null : { tamanho: 1000 },
  pacote: mb === null ? null : { tamanho: mb * MB },
})

describe('plantas para usar sem internet', () => {
  it('conta só as plantas com arquivo e separa as que faltam', () => {
    const s = situacaoDasPlantas([planta('a', 10), planta('b', 20), planta('c', null)], new Set(['a']))
    expect(s.total).toBe(2)
    expect(s.noAparelho).toBe(1)
    expect(s.faltam.map((p) => p.id)).toEqual(['b'])
    expect(s.bytesQueFaltam).toBe(20 * MB + 1000)
  })

  it('tudo no aparelho: nada falta', () => {
    const s = situacaoDasPlantas([planta('a', 10)], new Set(['a', 'velha']))
    expect(s.faltam).toEqual([])
    expect(s.noAparelho).toBe(1)
  })

  it('sem planta publicada: total zero (o menu não mostra o bloco)', () => {
    expect(situacaoDasPlantas([], new Set()).total).toBe(0)
  })

  it('confere o espaço com 50 MB de folga', () => {
    expect(cabeNoAparelho(100 * MB, { usado: 0, total: 200 * MB })).toBe(true)
    expect(cabeNoAparelho(100 * MB, { usado: 60 * MB, total: 200 * MB })).toBe(false)
    expect(cabeNoAparelho(100 * MB, null)).toBeNull()
    expect(cabeNoAparelho(100 * MB, { usado: 0, total: 0 })).toBeNull()
  })
})

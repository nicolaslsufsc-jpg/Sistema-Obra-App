import { describe, expect, it } from 'vitest'
import { terminarBaixa } from './fim_da_baixa'

describe('terminarBaixa', () => {
  it('relê o aparelho antes de tirar o "baixando" (sem mostrar a contagem velha no meio)', async () => {
    const ordem: string[] = []
    await terminarBaixa(
      async () => {
        await new Promise((r) => setTimeout(r, 5))
        ordem.push('releu')
      },
      () => ordem.push('tirou'),
    )
    expect(ordem).toEqual(['releu', 'tirou'])
  })

  it('se reler falhar, tira o "baixando" do mesmo jeito', async () => {
    let tirou = false
    await expect(terminarBaixa(() => Promise.reject(new Error('banco')), () => (tirou = true))).rejects.toThrow('banco')
    expect(tirou).toBe(true)
  })
})

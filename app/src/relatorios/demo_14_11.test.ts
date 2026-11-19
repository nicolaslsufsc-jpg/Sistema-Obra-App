// Ajustes da demo de 14/11/2026 (Testador): aviso de envio sem conta e números com ponto do milhar.
import { describe, expect, it } from 'vitest'
import { avisoDaSincronizacao } from './regras'
import { plural } from './telas/comum'

describe('Relatórios: demo de 14/11', () => {
  it('sem conta não há servidor: nenhum aviso de envio', () => {
    expect(avisoDaSincronizacao({ online: true, pendentes: 1, comErro: 0, local: true })).toBe('')
    expect(avisoDaSincronizacao({ online: false, pendentes: 3, comErro: 2, local: true })).toBe('')
  })

  it('com conta: recusado primeiro, depois sem internet, depois esperando envio', () => {
    expect(avisoDaSincronizacao({ online: true, pendentes: 1, comErro: 2 })).toMatch(/^2 registro\(s\) recusado/)
    expect(avisoDaSincronizacao({ online: false, pendentes: 1, comErro: 0 })).toMatch(/^Sem internet/)
    expect(avisoDaSincronizacao({ online: true, pendentes: 1, comErro: 0 })).toBe('1 registro(s) esperando envio.')
    expect(avisoDaSincronizacao({ online: true, pendentes: 0, comErro: 0 })).toBe('')
  })

  it('número com ponto do milhar (pt-BR)', () => {
    expect(plural(11728, 'marcação', 'marcações')).toBe('11.728 marcações')
    expect(plural(1, 'marcação', 'marcações')).toBe('1 marcação')
  })
})

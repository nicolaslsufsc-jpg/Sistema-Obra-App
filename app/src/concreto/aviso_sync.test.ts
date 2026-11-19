import { describe, expect, it } from 'vitest'
import { avisoDaSincronizacao } from './aviso_sync'

describe('faixa de sincronização do Concreto', () => {
  it('app sem conta: nada a enviar, nenhum aviso (mesmo com pendentes ou offline)', () => {
    expect(avisoDaSincronizacao({ local: true, online: true, pendentes: 3, comErro: 0 })).toBe('')
    expect(avisoDaSincronizacao({ local: true, online: false, pendentes: 3, comErro: 1 })).toBe('')
  })
  it('com conta: recusado, sem internet, esperando envio, nada', () => {
    expect(avisoDaSincronizacao({ online: true, pendentes: 2, comErro: 1 })).toContain('1 registro(s) recusado(s)')
    expect(avisoDaSincronizacao({ online: false, pendentes: 2, comErro: 0 })).toContain('Sem internet')
    expect(avisoDaSincronizacao({ online: true, pendentes: 2, comErro: 0 })).toBe('2 registro(s) esperando envio.')
    expect(avisoDaSincronizacao({ online: true, pendentes: 0, comErro: 0 })).toBe('')
  })
})

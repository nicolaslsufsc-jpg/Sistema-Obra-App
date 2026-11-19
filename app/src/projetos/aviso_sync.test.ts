import { describe, expect, it } from 'vitest'
import { avisoDoEnvio } from './aviso_sync'

describe('faixa de envio do Projetos', () => {
  it('app sem conta: nenhum aviso, mesmo com pendentes ou sem internet', () => {
    expect(avisoDoEnvio({ local: true, online: true, pendentes: 1 })).toBe('')
    expect(avisoDoEnvio({ local: true, online: false, pendentes: 3 })).toBe('')
  })
  it('com conta: sem internet, esperando envio, nada', () => {
    expect(avisoDoEnvio({ online: false, pendentes: 2 })).toContain('Sem internet')
    expect(avisoDoEnvio({ online: true, pendentes: 2 })).toBe('2 registro(s) esperando envio.')
    expect(avisoDoEnvio({ online: true, pendentes: 0 })).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { BLOCOS_SINCRONIZADOS, TABELAS_SINCRONIZADAS } from '../nucleo/tabelas'
import { TABELAS_CONCRETO, TABELAS_FVM } from './tabelas'

// Desde 20/11 o FVM tem migração (20261120120000_concreto_fvm.sql) e sincroniza com o servidor.
// No CI do PR #78 (18/11), sem a migração, a baixa dava erro nelas: por isso ficam no FIM da lista
// do Concreto, e um servidor ainda sem a migração só perde o FVM, não o resto do Concreto.
describe('FVM com migração', () => {
  it('as tabelas do FVM entram na baixa e no envio, no bloco do Concreto', () => {
    const bloco = BLOCOS_SINCRONIZADOS.find((b) => b.includes('concretagens'))!
    for (const t of TABELAS_FVM) {
      expect(TABELAS_SINCRONIZADAS).toContain(t)
      expect(bloco).toContain(t)
    }
  })

  it('ficam no fim da lista do Concreto', () => {
    expect(TABELAS_CONCRETO.slice(-TABELAS_FVM.length)).toEqual([...TABELAS_FVM])
  })
})

import { describe, expect, it } from 'vitest'
import { BLOCOS_SINCRONIZADOS, TABELAS_SINCRONIZADAS } from '../nucleo/tabelas'
import { TABELAS_FVM } from './tabelas'

// CI do PR #78 (18/11): com as tabelas do FVM na lista, a baixa do servidor dava erro nelas (sem
// migração) e o app nunca chegava a "Sincronizado hoje". Enquanto não houver migração, ficam fora.
describe('FVM sem migração', () => {
  it('as tabelas do FVM não entram na baixa nem no envio do servidor', () => {
    for (const t of TABELAS_FVM) {
      expect(TABELAS_SINCRONIZADAS).not.toContain(t)
      expect(BLOCOS_SINCRONIZADOS.flat()).not.toContain(t)
    }
  })
})

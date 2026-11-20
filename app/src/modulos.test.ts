// Menu com e sem conta (teste com cabo, 20/11): Documentos só funciona sem conta e só aparece nele.
import { describe, expect, it } from 'vitest'
import { modulosDoMenu } from './modulos'

describe('módulos do menu', () => {
  it('com conta, sem o Documentos; sem conta, com ele', () => {
    const ids = (semConta: boolean) => modulosDoMenu(semConta).map((m) => m.id)
    expect(ids(false)).toEqual(['fvs', 'concreto'])
    expect(ids(true)).toEqual(['fvs', 'concreto', 'documentos'])
  })
})

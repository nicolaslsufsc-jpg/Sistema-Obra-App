// Menu com e sem conta (teste com cabo, 20/11): Documentos só funciona sem conta e só aparece nele.
// O IFC voltou ao menu em 20/11, com e sem conta, sem o selo "beta".
import { describe, expect, it } from 'vitest'
import { modulosDoMenu } from './modulos'

describe('módulos do menu', () => {
  it('com conta, sem o Documentos; sem conta, com ele', () => {
    const ids = (semConta: boolean) => modulosDoMenu(semConta).map((m) => m.id)
    expect(ids(false)).toEqual(['fvs', 'concreto', 'ifc'])
    expect(ids(true)).toEqual(['fvs', 'concreto', 'documentos', 'ifc'])
    expect(modulosDoMenu(true).some((m) => m.beta)).toBe(false)
  })
})

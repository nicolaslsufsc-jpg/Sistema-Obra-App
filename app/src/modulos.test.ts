// Menu com e sem conta (teste com cabo, 20/11): Documentos e Projetos (de volta em 20/11) só funcionam sem conta e só aparecem nele.
import { describe, expect, it } from 'vitest'
import { modulosDoMenu } from './modulos'

describe('módulos do menu', () => {
  it('com conta, sem o Documentos e o Projetos; sem conta, com eles', () => {
    const ids = (semConta: boolean) => modulosDoMenu(semConta).map((m) => m.id)
    expect(ids(false)).toEqual(['fvs', 'concreto'])
    expect(ids(true)).toEqual(['fvs', 'projetos', 'concreto', 'documentos'])
  })
})

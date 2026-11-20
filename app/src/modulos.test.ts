// Menu com e sem conta (teste com cabo, 20/11): o Documentos só funciona sem conta e só aparece nele.
// O Projetos voltou em 20/11 só sem conta; com a lista de distribuição no servidor (#44) aparece também com conta.
// O IFC voltou ao menu em 20/11, com e sem conta, sem o selo "beta".
import { describe, expect, it } from 'vitest'
import { modulosDoMenu } from './modulos'

describe('módulos do menu', () => {
  it('com conta, sem o Documentos; sem conta, com ele; o Projetos nos dois', () => {
    const ids = (semConta: boolean) => modulosDoMenu(semConta).map((m) => m.id)
    expect(ids(false)).toEqual(['fvs', 'projetos', 'concreto', 'ifc'])
    expect(ids(true)).toEqual(['fvs', 'projetos', 'concreto', 'documentos', 'ifc'])
    // o único beta do menu é o Projetos, com e sem conta
    expect(modulosDoMenu(false).filter((m) => m.beta).map((m) => m.id)).toEqual(['projetos'])
    expect(modulosDoMenu(true).filter((m) => m.beta).map((m) => m.id)).toEqual(['projetos'])
  })
})

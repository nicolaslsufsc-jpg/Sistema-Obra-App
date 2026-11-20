// Menu com e sem conta (teste com cabo, 20/11): o Projetos (de volta em 20/11) só funciona sem conta e só aparece nele.
// O Documentos abre também com conta desde 20/11 (tabela doc_documentos no servidor, item 3 do núcleo).
// O IFC voltou ao menu em 20/11, com e sem conta, sem o selo "beta".
import { describe, expect, it } from 'vitest'
import { modulosDoMenu } from './modulos'

describe('módulos do menu', () => {
  it('com conta, sem o Projetos; sem conta, com ele; o Documentos nos dois', () => {
    const ids = (semConta: boolean) => modulosDoMenu(semConta).map((m) => m.id)
    expect(ids(false)).toEqual(['fvs', 'concreto', 'documentos', 'ifc'])
    expect(ids(true)).toEqual(['fvs', 'projetos', 'concreto', 'documentos', 'ifc'])
    // o único beta do menu é o Projetos (só sem conta)
    expect(modulosDoMenu(false).some((m) => m.beta)).toBe(false)
    expect(modulosDoMenu(true).filter((m) => m.beta).map((m) => m.id)).toEqual(['projetos'])
  })
})

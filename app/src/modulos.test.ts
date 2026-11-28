// Menu com e sem conta (teste com cabo, 20/11): desde os itens 2 e 3 do núcleo (20/11) o Projetos (lista de
// distribuição no servidor) e o Documentos (tabela doc_documentos) abrem também com conta.
// O IFC voltou ao menu em 20/11, com e sem conta, sem o selo "beta".
import { describe, expect, it } from 'vitest'
import { modulosDoMenu } from './modulos'

describe('módulos do menu', () => {
  it('com e sem conta, os mesmos módulos: Projetos e Documentos nos dois', () => {
    const ids = (semConta: boolean) => modulosDoMenu(semConta).map((m) => m.id)
    expect(ids(false)).toEqual(['fvs', 'projetos', 'concreto', 'documentos', 'ifc', 'canteiro'])
    expect(ids(true)).toEqual(['fvs', 'projetos', 'concreto', 'documentos', 'ifc', 'canteiro'])
    // os betas do menu, com e sem conta: Projetos e o Mapa do canteiro (26/11)
    expect(modulosDoMenu(false).filter((m) => m.beta).map((m) => m.id)).toEqual(['projetos', 'canteiro'])
    expect(modulosDoMenu(true).filter((m) => m.beta).map((m) => m.id)).toEqual(['projetos', 'canteiro'])
  })
})

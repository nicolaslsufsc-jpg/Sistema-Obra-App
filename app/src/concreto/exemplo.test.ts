import { describe, expect, it } from 'vitest'
import { uuidDeterministico } from '../nucleo/pacote_obra'
import { idDaConcretagemDeExemplo, localLegivel, nomeDaConcretagem } from './exemplo'

describe('concretagem de exemplo', () => {
  it('reconhece o id que o exemplos.ts dá para ela (chave conc:1 da obra)', async () => {
    const obra = 'b0000000-0000-0000-0000-0000000000ee'
    expect(await idDaConcretagemDeExemplo(obra)).toBe(await uuidDeterministico(`${obra}:exemplo:conc:1`))
    expect(await idDaConcretagemDeExemplo(obra)).not.toBe(await idDaConcretagemDeExemplo('outra-obra'))
  })

  it('nome com o rótulo EXEMPLO só na de exemplo', () => {
    // o exemplo vem com barras invertidas (parece caminho de arquivo): mostra com travessão
    expect(nomeDaConcretagem({ local_descricao: 'Pilotis \\ Trecho 1 \\ Pilares', exemplo: true })).toBe('EXEMPLO · Pilotis – Trecho 1 – Pilares')
    // o local de verdade fica como a pessoa digitou
    expect(nomeDaConcretagem({ local_descricao: 'Pilotis \\ Trecho 1' })).toBe('Pilotis \\ Trecho 1')
    expect(nomeDaConcretagem({ local_descricao: '', exemplo: false })).toBe('sem local')
  })
})

describe('dicas do formulário (demonstração, 14/11)', () => {
  it('dica do local sem barras invertidas', () => {
    expect(localLegivel('Pilotis \\ Trecho 2 \\ Vigas')).toBe('Pilotis – Trecho 2 – Vigas')
    expect(localLegivel('Pilotis\\Trecho 2')).toBe('Pilotis – Trecho 2')
    expect(localLegivel('Térreo · Trecho 1')).toBe('Térreo · Trecho 1')
  })
})

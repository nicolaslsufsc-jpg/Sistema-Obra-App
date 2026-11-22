// Erro da leitura do IFC: em modelo grande, "reading 'Name'" e afins viram "faltou memória".
import { describe, expect, it } from 'vitest'
import { GRANDE_PARA_LER, mensagemDeErroDaLeitura } from '../src/ifc/motor/erro_leitura'

describe('mensagem de erro da leitura', () => {
  it('modelo grande com erro de memória: mensagem clara, com o tamanho', () => {
    const m = mensagemDeErroDaLeitura(new TypeError("Cannot read properties of undefined (reading 'Name')"), 1.63e9)
    expect(m).toContain('faltou memória')
    expect(m).toContain('1,6 GB')
    expect(m).toContain('PC')
    expect(mensagemDeErroDaLeitura(new RangeError('Array buffer allocation failed'), GRANDE_PARA_LER)).toContain('faltou memória')
  })
  it('arquivo pequeno ou outro erro: mantém a mensagem original', () => {
    expect(mensagemDeErroDaLeitura(new TypeError("Cannot read properties of undefined (reading 'Name')"), 5e6)).toContain("reading 'Name'")
    expect(mensagemDeErroDaLeitura(new Error('O arquivo não parece ser um IFC válido.'), 2e9)).toBe('O arquivo não parece ser um IFC válido.')
    expect(mensagemDeErroDaLeitura('texto', 1)).toBe('texto')
  })
})

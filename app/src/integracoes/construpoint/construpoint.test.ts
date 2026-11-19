import { describe, expect, it } from 'vitest'
import { sistemaDaObra } from '../sistema_oficial'
import { obraDoPacote } from '../../nucleo/pacote_obra'

describe('galho do Construpoint', () => {
  it('a obra do pacote com sistema_oficial "construpoint" usa este galho', async () => {
    const obra = await obraDoPacote({ obra: 'EXE', sistema_oficial: 'Construpoint' })
    expect(obra.sistema_oficial).toBe('construpoint')
    expect(sistemaDaObra(obra)?.nome).toBe('Construpoint')
  })
})

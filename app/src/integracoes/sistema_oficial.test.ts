import { describe, expect, it } from 'vitest'
import { avisoDoSistemaOficial, sistemaDaObra, sistemasInstalados } from './sistema_oficial'

describe('sistema oficial da obra', () => {
  it('obra sem o campo, ou com um sistema que não veio nesta versão: nenhum', () => {
    expect(sistemaDaObra(null)).toBeNull()
    expect(sistemaDaObra({})).toBeNull()
    expect(sistemaDaObra({ sistema_oficial: '' })).toBeNull()
    expect(sistemaDaObra({ sistema_oficial: 'sistema-que-nao-existe' })).toBeNull()
  })

  it('cada galho instalado é achado pelo id, sem diferença de maiúscula', () => {
    for (const s of sistemasInstalados()) {
      expect(sistemaDaObra({ sistema_oficial: s.id })).toBe(s)
      expect(sistemaDaObra({ sistema_oficial: ` ${s.id.toUpperCase()} ` })).toBe(s)
      expect(s.nome.trim()).not.toBe('')
    }
  })

  it('aviso no início da FVS: só com histórico e sem sistema achado', () => {
    // sem histórico, nada a dizer
    expect(avisoDoSistemaOficial({}, false)).toBeNull()
    expect(avisoDoSistemaOficial({ sistema_oficial: 'sistema-que-nao-existe' }, false)).toBeNull()
    // histórico sem o campo no pacote
    expect(avisoDoSistemaOficial({}, true)).toBe(
      'Este pacote tem histórico de um sistema oficial, mas não diz qual. Gere o pacote de novo com --sistema-oficial.',
    )
    expect(avisoDoSistemaOficial(null, true)).toContain('--sistema-oficial')
    expect(avisoDoSistemaOficial({ sistema_oficial: '  ' }, true)).toContain('mas não diz qual')
    // histórico de um sistema cujo galho não veio nesta versão
    expect(avisoDoSistemaOficial({ sistema_oficial: 'sistema-que-nao-existe' }, true)).toContain('"sistema-que-nao-existe"')
    // sistema achado: sem aviso
    for (const s of sistemasInstalados()) expect(avisoDoSistemaOficial({ sistema_oficial: s.id }, true)).toBeNull()
  })
})

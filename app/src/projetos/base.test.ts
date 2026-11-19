// A base do painel é de uma obra só: importar com uma obra aberta não aparece em outra.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { importarBase, lerBase } from './base'
import { DISTRIBUICAO_EXE, VIGENTES_EXE } from './exemplo_exe'

const OBRA_A = 'b0000000-0000-0000-0000-0000000000b1'
const OBRA_B = 'b0000000-0000-0000-0000-0000000000b2'
const arquivo = (texto: string, nome: string) => new File([texto], nome, { type: 'text/csv' })

describe('base do painel por obra', () => {
  it('fica presa à obra aberta na importação', async () => {
    await importarBase(OBRA_A, { vigentes: arquivo(VIGENTES_EXE, 'vig.csv'), distribuicao: arquivo(DISTRIBUICAO_EXE, 'dist.csv') })
    expect((await lerBase(OBRA_A))!.copias).toHaveLength(12)
    expect(await lerBase(OBRA_B)).toBeNull()
  })
  it('importar na outra obra não mexe na primeira', async () => {
    await importarBase(OBRA_B, { vigentes: arquivo(VIGENTES_EXE, 'vig_b.csv') })
    expect((await lerBase(OBRA_B))!.copias).toHaveLength(0)
    expect((await lerBase(OBRA_A))!.copias).toHaveLength(12)
    expect((await lerBase(OBRA_A))!.vigentesArquivo).toBe('vig.csv')
  })
  it('arquivo errado não apaga a base que já estava', async () => {
    await expect(importarBase(OBRA_A, { distribuicao: arquivo('a;b\n1;2', 'errado.csv') })).rejects.toThrow(/colunas/)
    expect((await lerBase(OBRA_A))!.copias).toHaveLength(12)
  })
})

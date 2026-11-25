// Estaca (S) e bloco (K) do Concreto (fundações, 22/11/2026) não têm desenho e não são peça da FVS:
// ficam de fora sem erro, como qualquer tipo desconhecido. Desde 23/11 o bloco é peça da FVS no pavimento
// que tem planta de fundação (planta de blocos). Obra fictícia EXE.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { banco } from '../nucleo/servicos'
import type { Linha } from '../nucleo/banco_local'
import { carregar, TIPOS_DA_FVS } from './dados'

const OBRA = 'e0000000-0000-0000-0000-0000000000f5'
const PAV = 'e0000000-0000-0000-0000-0000000000f6'

function elemento(id: string, nome: string, tipo: string) {
  const linha = { id, obra_id: OBRA, usuario_id: 'u', dispositivo_id: 'd', criado_em_dispositivo: '2026-11-22T10:00:00Z', apagado: false, pavimento_id: PAV, tipo, nome, secao: null }
  return { tabela: 'elementos', id, obra_id: OBRA, linha: linha as unknown as Linha, pendente: 0 as const }
}

describe('fundações na FVS', () => {
  it('estaca e bloco sem geometria (e tipo desconhecido) não entram nas peças da FVS, sem erro', async () => {
    await banco.registros.bulkPut([
      elemento('e0000000-0000-0000-0000-0000000000a1', 'P1', 'P'),
      elemento('e0000000-0000-0000-0000-0000000000a2', 'E-P1.A', 'S'),
      elemento('e0000000-0000-0000-0000-0000000000a3', 'BL-P1', 'K'),
      elemento('e0000000-0000-0000-0000-0000000000a4', 'X-1', 'Z'),
    ])
    const d = await carregar(OBRA)
    expect([...d.pecaPorId.values()].map((p) => p.nome)).toEqual(['P1'])
    expect(TIPOS_DA_FVS.has('S')).toBe(true) // só no pavimento com planta de fundação (teste abaixo)
  })

  it('com planta de fundação no pavimento, o bloco (23/11) e a estaca (24/11) entram', async () => {
    const base = { obra_id: OBRA, usuario_id: 'u', dispositivo_id: 'd', criado_em_dispositivo: '2026-11-23T10:00:00Z', apagado: false }
    const reg = (tabela: string, linha: Record<string, unknown>) => ({ tabela, id: String(linha.id), obra_id: OBRA, linha: { ...base, ...linha } as unknown as Linha, pendente: 0 as const })
    await banco.registros.bulkPut([
      reg('pavimentos', { id: PAV, nome: 'Subsolo', ordem: 1 }),
      reg('setores', { id: 'e0000000-0000-0000-0000-0000000000b1', pavimento_id: PAV, nome_projeto: 'Blocos', disciplina: 'fundacao' }),
      reg('plantas', { id: 'e0000000-0000-0000-0000-0000000000b2', pavimento_id: PAV, setor_id: 'e0000000-0000-0000-0000-0000000000b1', prancha: 'EXE.FU.LO.001-R00', revisao: 'R00', elementos: 1 }),
    ])
    const d = await carregar(OBRA)
    expect([...d.pecaPorId.values()].map((p) => p.nome).sort()).toEqual(['BL-P1', 'E-P1.A', 'P1'])
    expect(TIPOS_DA_FVS.has('K')).toBe(true)
  })
})

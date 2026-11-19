import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { banco } from '../nucleo/servicos'
import type { Linha } from '../nucleo/banco_local'
import { carregar } from './dados'

const OBRA = 'e0000000-0000-0000-0000-0000000000e1'
const PAV = 'e0000000-0000-0000-0000-0000000000e2'

function elemento(id: string, nome: string, tipo: string, exemplo?: boolean) {
  const linha = { id, obra_id: OBRA, usuario_id: 'u', dispositivo_id: 'd', criado_em_dispositivo: '2026-11-13T10:00:00Z', apagado: false, pavimento_id: PAV, tipo, nome, secao: null, ...(exemplo ? { exemplo: true } : {}) }
  return { tabela: 'elementos', id, obra_id: OBRA, linha: linha as unknown as Linha, pendente: 0 as const }
}

describe('peças de exemplo', () => {
  it('a laje de exemplo do Concreto não entra na FVS (contagem e mapa)', async () => {
    await banco.registros.bulkPut([
      elemento('e0000000-0000-0000-0000-000000000001', 'P1', 'P'),
      elemento('e0000000-0000-0000-0000-000000000002', 'Laje_Trecho_1', 'L', true),
    ])
    const d = await carregar(OBRA)
    expect([...d.pecaPorId.values()].map((p) => p.nome)).toEqual(['P1'])
  })
})

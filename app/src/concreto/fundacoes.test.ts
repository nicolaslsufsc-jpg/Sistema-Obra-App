// Fundações no Concreto (22/11/2026): estaca (S) e bloco (K), sem desenho, ligados à mão ao caminhão.
// Aparecem pelo nome com o tipo na frente na lista, no relatório, no CSV e na planilha. Obra fictícia EXE.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { banco } from '../nucleo/servicos'
import type { Linha } from '../nucleo/banco_local'
import { carregar } from './dados'
import { csvPorCaminhao, relatorioPorCaminhao, type PecaRelatorio } from './relatorio'
import { LAYOUT_PADRAO, tipoDoCaminhao } from './planilha_controle'
import type { EstadoPeca } from './pecas'
import { nomeDaPeca, tipoNoCsv } from './tipos_peca'

const OBRA = 'e0000000-0000-0000-0000-0000000000c5'
const PAV = 'e0000000-0000-0000-0000-0000000000c6'
const linha = (tabela: string, id: string, campos: Record<string, unknown>) => ({
  tabela,
  id,
  obra_id: OBRA,
  linha: { id, obra_id: OBRA, usuario_id: 'u', dispositivo_id: 'd', criado_em_dispositivo: '2026-11-22T10:00:00Z', apagado: false, ...campos } as unknown as Linha,
  pendente: 0 as const,
})

describe('fundações no Concreto', () => {
  it('nome na tela com o tipo na frente; CSV por extenso só para estaca e bloco', () => {
    expect(nomeDaPeca('S', 'E-P72.A')).toBe('Estaca E-P72.A')
    expect(nomeDaPeca('K', 'BL-P36')).toBe('Bloco BL-P36')
    expect(nomeDaPeca('P', 'P1')).toBe('P1')
    expect(tipoNoCsv('S')).toBe('Estaca')
    expect(tipoNoCsv('P')).toBe('P')
  })

  it('a estaca e o bloco ligados à mão entram no caminhão, sem planta', async () => {
    await banco.registros.bulkPut([
      linha('pavimentos', PAV, { nome: 'Subsolo', ordem: 0 }),
      linha('elementos', 'e0000000-0000-0000-0000-0000000000d1', { pavimento_id: PAV, tipo: 'S', nome: 'E-P1.A', secao: null }),
      linha('elementos', 'e0000000-0000-0000-0000-0000000000d2', { pavimento_id: PAV, tipo: 'K', nome: 'BL-P1', secao: null }),
      linha('caminhao_elementos', 'e0000000-0000-0000-0000-0000000000e1', { caminhao_id: 'k1', elemento_id: 'e0000000-0000-0000-0000-0000000000d1', origem: 'manual', fracao: null, incluido: true }),
      linha('caminhao_elementos', 'e0000000-0000-0000-0000-0000000000e2', { caminhao_id: 'k1', elemento_id: 'e0000000-0000-0000-0000-0000000000d2', origem: 'manual', fracao: null, incluido: true }),
    ])
    const d = await carregar(OBRA)
    const doCam = [...(d.pecasDe.get('k1')?.values() ?? [])].filter((e) => e.incluido).map((e) => d.pecaPorId.get(e.elemento_id)?.nome)
    expect(doCam.sort()).toEqual(['Bloco BL-P1', 'Estaca E-P1.A'])
  })

  it('relatório em ordem (pilar antes, depois estaca e bloco), CSV e tipo da planilha', () => {
    const pecas = new Map<string, PecaRelatorio>([
      ['s', { id: 's', nome: 'Estaca E-P1.A', tipo: 'S' }],
      ['b', { id: 'b', nome: 'Bloco BL-P1', tipo: 'K' }],
      ['p', { id: 'p', nome: 'P1', tipo: 'P' }],
    ])
    const est = (id: string) => [id, { elemento_id: id, incluido: true, fracao: null, parcial: false, origem: 'manual' } as EstadoPeca] as const
    const estados = new Map([['k1', new Map([est('b'), est('s'), est('p')])], ['k2', new Map([est('b'), est('s')])]])
    const cams = [
      { raiz: 'k1', sequencia: 1, nota_fiscal: '10', volume_m3: 8 },
      { raiz: 'k2', sequencia: 2, nota_fiscal: '11', volume_m3: 8 },
    ]
    const linhas = relatorioPorCaminhao(cams, estados, pecas)
    expect(linhas[0].pecas.map((i) => i.peca.nome)).toEqual(['P1', 'Estaca E-P1.A', 'Bloco BL-P1'])
    const csv = csvPorCaminhao({ data: '2026-11-20', local_descricao: 'Fundação', codigo_construpoint: null }, linhas)
    expect(csv).toContain('Estaca E-P1.A;Estaca;')
    expect(csv).toContain('Bloco BL-P1;Bloco;')
    expect(tipoDoCaminhao([{ tipo: 'S' }, { tipo: 'K' }], LAYOUT_PADRAO)).toBe('Estaca e bloco')
    expect(tipoDoCaminhao([{ tipo: 'K' }], LAYOUT_PADRAO)).toBe('Bloco')
    expect(tipoDoCaminhao([{ tipo: 'P' }, { tipo: 'S' }], LAYOUT_PADRAO)).toBe(LAYOUT_PADRAO.tipos.P)
  })
})

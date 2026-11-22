// A laje concretada pela área de "vigas e laje" do caminhão (22/11/2026, pedido do Nicolas): a forma
// não traz o contorno da laje, então a área desenhada no caminhão é a laje que ele encheu.
import { describe, expect, it } from 'vitest'
import { caminhoesComLajeDesenhada, type Area } from './dados'
import { csvPorCaminhao, LAJE_DESENHADA, relatorioPorCaminhao, relatorioPorPeca } from './relatorio'
import type { EstadoPeca } from './pecas'

const area = (caminhao_id: string, alvo: Area['alvo']) => ({ caminhao_id, alvo }) as unknown as Area

describe('laje desenhada no caminhão', () => {
  it('só os caminhões com área de vigas e laje (a de pilares não conta)', () => {
    const areasDe = new Map([
      ['k1', [area('k1', 'vigas_laje')]],
      ['k2', [area('k2', 'pilares')]],
      ['k3', [area('k3', 'pilares'), area('k3', 'vigas_laje')]],
    ])
    expect([...caminhoesComLajeDesenhada({ areasDe })].sort()).toEqual(['k1', 'k3'])
  })

  it('entra no relatório como a laje do caminhão, uma linha só no "por peça"', () => {
    const cams = [
      { raiz: 'k1', sequencia: 1, nota_fiscal: '10', volume_m3: 8 },
      { raiz: 'k2', sequencia: 2, nota_fiscal: '11', volume_m3: 8 },
      { raiz: 'k3', sequencia: 3, nota_fiscal: '12', volume_m3: 8 },
    ]
    const linhas = relatorioPorCaminhao(cams, new Map(), new Map(), undefined, new Set(['k1', 'k3']))
    expect(linhas.map((l) => l.pecas.map((i) => i.peca.nome))).toEqual([['Laje (área desenhada)'], [], ['Laje (área desenhada)']])
    const porPeca = relatorioPorPeca(linhas)
    expect(porPeca).toHaveLength(1)
    expect(porPeca[0].caminhoes.map((c) => c.caminhao.sequencia)).toEqual([1, 3])
    expect(csvPorCaminhao({ data: '2026-11-20', local_descricao: 'Local', codigo_construpoint: null }, linhas)).toContain('Laje (área desenhada);L;;')
  })

  it('não repete quando o caminhão já tem a laje (do trecho ou da FVS)', () => {
    const cams = [{ raiz: 'k1', sequencia: 1, nota_fiscal: '10', volume_m3: 8 }]
    const lajeFvs = new Map([['k1', [{ area_id: 'la', nome: 'Laje A', fracao: 1, parcial: false }]]])
    expect(relatorioPorCaminhao(cams, new Map(), new Map(), lajeFvs, new Set(['k1']))[0].pecas.map((i) => i.peca.id)).toEqual(['la'])
    const estados = new Map([['k1', new Map([['lt', { elemento_id: 'lt', incluido: true, fracao: null, parcial: false, origem: 'desenho' } as EstadoPeca]])]])
    const pecas = new Map([['lt', { id: 'lt', nome: 'Laje do Trecho 1', tipo: 'L' }]])
    expect(relatorioPorCaminhao(cams, estados, pecas, undefined, new Set(['k1']))[0].pecas.map((i) => i.peca.id)).toEqual(['lt'])
    expect(LAJE_DESENHADA.tipo).toBe('L')
  })
})

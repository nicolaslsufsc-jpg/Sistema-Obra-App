// A laje da obra é a área desenhada na FVS (fvs_areas). O relatório do Concreto mostra, em cada
// caminhão, as áreas de laje da FVS que ele cobriu (só cálculo: sobreposição dos desenhos).
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { banco, sincronizador } from '../nucleo/servicos'
import { carregar } from './dados'
import { csvPorCaminhao, relatorioPorCaminhao, relatorioPorPeca } from './relatorio'

const OBRA = 'b0000000-0000-0000-0000-0000000000e1'
const USUARIO = '00000000-0000-0000-0000-0000000000e1'
const PAVIMENTO = 'a0000000-0000-0000-0000-0000000000e1'
const SETOR = 'a1000000-0000-0000-0000-0000000000e1'
const FICHA = 'f0000000-0000-0000-0000-0000000000e1'

const ret = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]

async function areaDaFvs(id: string, nome: string, contorno: [number, number][], extra: Record<string, unknown> = {}) {
  const linhaId = (extra.id as string | undefined) ?? id
  const linha = {
    id: linhaId,
    area_id: id,
    obra_id: OBRA,
    pavimento_id: PAVIMENTO,
    setor_id: SETOR,
    planta_id: null,
    nome,
    ficha_id: FICHA,
    codigo_ficha: null,
    contorno,
    cancelada: false,
    usuario_id: USUARIO,
    dispositivo_id: '00000000-0000-0000-0000-000000000000',
    criado_em_dispositivo: '2026-11-20T08:00:00.000Z',
    apagado: false,
    ...extra,
  }
  await banco.registros.put({ tabela: 'fvs_areas', id: linhaId, obra_id: OBRA, linha: linha as never, pendente: 0 })
}

describe('laje da FVS no relatório do Concreto', () => {
  it('a área de laje entra como peça L do caminhão, com a porcentagem quando é parcial', () => {
    const cams = [{ raiz: 'k1', sequencia: 1, nota_fiscal: '10', volume_m3: 8 }]
    const lajes = new Map([['k1', [{ area_id: 'la', nome: 'Laje A', fracao: 0.5, parcial: true }]]])
    const linhas = relatorioPorCaminhao(cams, new Map(), new Map(), lajes)
    expect(linhas[0].pecas).toEqual([{ peca: { id: 'la', nome: 'Laje A', tipo: 'L' }, fracao: 0.5, parcial: true, origem: 'desenho' }])
    expect(relatorioPorPeca(linhas)[0].peca.nome).toBe('Laje A')
    const csv = csvPorCaminhao({ data: '2026-11-20', local_descricao: 'Local', codigo_construpoint: null }, linhas)
    expect(csv).toContain('Laje A;L;50%;sim;desenho')
    // sem o parâmetro novo, tudo como antes
    expect(relatorioPorCaminhao(cams, new Map(), new Map())[0].pecas).toEqual([])
  })

  it('carregar: liga a área da FVS ao caminhão que desenhou em cima, na mesma planta', async () => {
    expect((await carregar(OBRA)).lajesFvsDe.size).toBe(0)

    await areaDaFvs('e0000000-0000-0000-0000-0000000000e1', 'Laje A', ret(0, 0, 100, 100))
    await areaDaFvs('e0000000-0000-0000-0000-0000000000e2', 'Laje B', ret(200, 0, 300, 100))
    // apagada na FVS: não aparece
    await areaDaFvs('e0000000-0000-0000-0000-0000000000e3', 'Laje C', ret(0, 0, 100, 100), { cancelada: true })

    const c = await sincronizador.registrar('concretagens', OBRA, USUARIO, { pavimento_id: PAVIMENTO, data: '2026-11-20', fck_mpa: 30, substitui_id: null, cancelado: false })
    const k = await sincronizador.registrar('caminhoes', OBRA, USUARIO, { concretagem_id: c.id, sequencia: 1, nota_fiscal: '77', substitui_id: null, cancelado: false })
    // cobre a Laje A inteira e nada da B
    await sincronizador.registrar('caminhao_areas', OBRA, USUARIO, { caminhao_id: k.id, planta_ref: SETOR + '@R01', contorno: ret(-5, -5, 105, 105), alvo: 'vigas_laje', substitui_id: null, cancelado: false })

    const d = await carregar(OBRA)
    expect(d.lajesFvsDe.get(k.id)).toEqual([{ area_id: 'e0000000-0000-0000-0000-0000000000e1', nome: 'Laje A', fracao: 1, parcial: false }])

    const pecas = new Map([...d.pecaPorId.values()].map((p) => [p.id, { id: p.id, nome: p.nome, tipo: p.tipo }]))
    const linhas = relatorioPorCaminhao(d.caminhoesDe.get(c.id) ?? [], d.pecasDe, pecas, d.lajesFvsDe)
    expect(linhas[0].pecas.map((i) => i.peca.nome)).toEqual(['Laje A'])
  })
})

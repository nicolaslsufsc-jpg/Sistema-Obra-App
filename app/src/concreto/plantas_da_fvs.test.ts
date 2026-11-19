// O Concreto precisa receber as plantas que a FVS baixou para o aparelho. Este teste abre o módulo
// pelo mesmo arquivo que o app carrega (telas/ModuloConcreto, via SobDemanda.tsx): se o registro de
// fontePlantasFvs sumir, a obra de verdade volta a mostrar "ainda não tem planta neste aparelho".
// A obra TESTE não serve para conferir isto: ela cai na planta esquemática e esconde o problema.
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { guardarPacote, type Manifest } from '../fvs/pacote'
import { banco } from '../nucleo/servicos'
import { carregarPlantas } from './planta'

// O Leaflet só carrega no navegador, e aqui nada é desenhado.
vi.mock('leaflet', () => ({ default: {} }))

const OBRA = 'b0000000-0000-0000-0000-0000000000d1'
const PAVIMENTO = 'a0000000-0000-0000-0000-0000000000d1'
const SETOR = 'a1000000-0000-0000-0000-0000000000d1'
const PLANTA = 'a2000000-0000-0000-0000-0000000000d1'
const PILAR = 'e0000000-0000-0000-0000-0000000000d1'

const manifest: Manifest = {
  formato: 1,
  planta_id: PLANTA,
  trecho: 'Trecho 2',
  prancha: 'OBRA.ES.LO.001.FOR-R02',
  revisao: 'R02',
  largura: 2000,
  altura: 1300,
  tile: 512,
  niveis: [0],
  elementos: {
    [PILAR]: { tipo: 'P', nome: 'P1', secao: '20x60', rotulo: [10, 10, 40, 30], polys: [[[100, 100], [120, 100], [120, 160], [100, 160]]] },
  },
  detalhes: {},
  pedacos: { 't:0/0/0': [0, 5] },
}

async function fvsBaixouUmaPlanta() {
  const linha = {
    id: PLANTA,
    obra_id: OBRA,
    pavimento_id: PAVIMENTO,
    setor_id: SETOR,
    substitui_id: null,
    usuario_id: '00000000-0000-0000-0000-0000000000d1',
    dispositivo_id: '00000000-0000-0000-0000-000000000000',
    criado_em_dispositivo: '2026-11-06T10:00:00.000Z',
    apagado: false,
  }
  await banco.registros.put({ tabela: 'plantas', id: PLANTA, obra_id: OBRA, linha: linha as never, pendente: 0 })
  await guardarPacote(JSON.stringify(manifest), new Blob([new Uint8Array([1, 2, 3, 4, 5])]))
}

describe('plantas da FVS no módulo Concreto', () => {
  const pedido = { obraId: OBRA, obraCodigo: 'EXE', pavimento: { id: PAVIMENTO, nome: '2º pavimento' }, pecas: [] }

  it('ao abrir o módulo, a prancha baixada pela FVS chega numa obra que não é a TESTE', async () => {
    await fvsBaixouUmaPlanta()
    // antes de o módulo abrir, nada liga as duas pontas: a FVS não é carregada antes da hora
    expect(await carregarPlantas(pedido)).toEqual([])

    await import('./telas/ModuloConcreto')

    const plantas = await carregarPlantas(pedido)
    expect(plantas).toHaveLength(1)
    const [planta] = plantas
    expect(planta.teste).toBeUndefined()
    expect(planta).toMatchObject({ id: SETOR, revisao: 'R02', ref: `${SETOR}@R02`, trecho: 'Trecho 2', titulo: '2º pavimento · Trecho 2', largura: 2000, altura: 1300 })
    expect(planta.elementos.map((e) => [e.id, e.tipo, e.nome])).toEqual([[PILAR, 'P', 'P1']])
    expect(planta.fundo?.url(0, 0, 0)).toMatch(/^blob:/)
  })

  it('reabrir o módulo não duplica a planta', async () => {
    await import('./telas/ModuloConcreto')
    await import('./telas/ModuloConcreto')
    expect(await carregarPlantas(pedido)).toHaveLength(1)
  })
})

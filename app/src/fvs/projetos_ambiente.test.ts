import { describe, expect, it } from 'vitest'
import type { DetalhePacote, ElementoPacote } from './pacote'
import { recortesDoAmbiente } from './projetos_ambiente'

const DETALHES: Record<string, DetalhePacote> = {
  M_Apto_101: { titulo: 'Modulação · Apto 101', prancha: 'EXE.VD.EX.024-R00', aco: false },
  PP_Apto_101: { titulo: 'Paginação de piso · Apto 101', prancha: 'EXE.AR.DE.053-R00', aco: false, fichas: ['EXE-PVS-PISO'] },
  IM_Apto_101: { titulo: 'Impermeabilização · Apto 101', prancha: 'EXE.IM.EX.006-R01', aco: false, fichas: ['EXE-PVS-PISO', 'EXE-PVS-REB'] },
  X_Livre: { titulo: 'Outro · Apto 101', prancha: 'EXE.XX-R00', aco: false },
}

type Amb = Pick<ElementoPacote, 'tipo' | 'detalhe' | 'projetos'>
const amb: Amb = { tipo: 'A', detalhe: 'M_Apto_101', projetos: ['PP_Apto_101', 'IM_Apto_101', 'X_Livre'] }
const chaves = (cod?: string | null, el: Amb = amb) => recortesDoAmbiente(el, DETALHES, cod).map((r) => r.chave)

describe('recortes de projeto no painel do ambiente', () => {
  it('modulação primeiro, em toda ficha; cada projeto só nas fichas dele', () => {
    expect(chaves('EXE-PVS-PISO')).toEqual(['M_Apto_101', 'PP_Apto_101', 'IM_Apto_101', 'X_Livre'])
    expect(chaves('EXE-PVS-REB')).toEqual(['M_Apto_101', 'IM_Apto_101', 'X_Livre'])
    expect(chaves('EXE-PVS-ALV')).toEqual(['M_Apto_101', 'X_Livre'])
  })

  it('sem ficha escolhida, mostra todos', () => {
    expect(chaves(undefined)).toEqual(['M_Apto_101', 'PP_Apto_101', 'IM_Apto_101', 'X_Livre'])
    expect(chaves(null)).toEqual(['M_Apto_101', 'PP_Apto_101', 'IM_Apto_101', 'X_Livre'])
  })

  it('título, prancha e qual é a modulação', () => {
    const [m, p] = recortesDoAmbiente(amb, DETALHES, 'EXE-PVS-PISO')
    expect(m).toEqual({ chave: 'M_Apto_101', titulo: 'Modulação · Apto 101', prancha: 'EXE.VD.EX.024-R00', modulacao: true })
    expect(p).toEqual({ chave: 'PP_Apto_101', titulo: 'Paginação de piso · Apto 101', prancha: 'EXE.AR.DE.053-R00', modulacao: false })
  })

  it('sem modulação, só os projetos; chave fora do pacote e repetida não entram', () => {
    expect(chaves('EXE-PVS-PISO', { tipo: 'A', detalhe: undefined, projetos: ['PP_Apto_101', 'NAO_EXISTE', 'PP_Apto_101'] })).toEqual(['PP_Apto_101'])
    expect(chaves('EXE-PVS-PISO', { tipo: 'A', detalhe: 'NAO_EXISTE', projetos: undefined })).toEqual([])
  })

  it('só ambiente tem recorte de projeto', () => {
    expect(chaves('EXE-PVS-PISO', { ...amb, tipo: 'P' })).toEqual([])
  })
})

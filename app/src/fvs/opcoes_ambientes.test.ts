import { describe, expect, it } from 'vitest'
import { opcoesDosAmbientes } from './opcoes_ambientes'
import type { DetalhePacote, ElementoPacote } from './pacote'
import type { Ficha, ItemFicha } from './situacao'

const item = (n: number, extra: Partial<ItemFicha> = {}): ItemFicha => ({ n, etapa: 'E', titulo: `Item ${n}`, ...extra }) as ItemFicha
const ficha = (codigo: string, titulo: string, extra: Partial<Ficha> = {}): Ficha => ({
  id: codigo,
  codigo,
  titulo,
  revisao: '0',
  aplica_a: ['A'],
  itens: [item(1)],
  ...extra,
})

const FICHAS: Ficha[] = [
  ficha('EXE-PVS-PIN', 'Pintura'),
  ficha('EXE-PVS-ALV', 'Alvenaria', { itens: [item(1), item(3, { esquadrias: true })] }),
  ficha('EXE-PVS-PISO', 'Piso cerâmico'),
  ficha('EXE-PVS-REB', 'Reboco', { itens: [item(1), item(5, { esquadrias: true })] }),
  ficha('EXE-PVS-P', 'Pilares', { aplica_a: ['P'] }),
]

const DETALHES: Record<string, DetalhePacote> = {
  M_Apto_101: { titulo: 'Modulação · Apto 101', prancha: 'EXE.VD-R00', aco: false },
  PP_Apto_101: { titulo: 'Paginação de piso · Apto 101', prancha: 'EXE.AR-R00', aco: false, fichas: ['EXE-PVS-PISO'] },
  IM_Apto_101: { titulo: 'Impermeabilização · Apto 101', prancha: 'EXE.IM-R01', aco: false, fichas: ['EXE-PVS-PISO', 'EXE-PVS-REB'] },
  PP_Apto_102: { titulo: 'Paginação de piso · Apto 102', prancha: 'EXE.AR-R00', aco: false, fichas: ['EXE-PVS-PISO'] },
}

const amb = (nome: string, projetos?: string[]): ElementoPacote => ({ tipo: 'A', nome, secao: '10 m²', detalhe: 'M_Apto_101', projetos }) as ElementoPacote
const ELEMENTOS: Record<string, ElementoPacote> = {
  a1: amb('101-01', ['PP_Apto_101', 'IM_Apto_101']),
  a2: amb('102-01', ['PP_Apto_102']),
  e1: { tipo: 'E', nome: 'PM80', secao: '' } as ElementoPacote,
}

describe('opções dos ambientes para o menu do pavimento', () => {
  it('uma por ficha de ambiente, projetos de uma ficha no nome, projeto de várias fichas à parte, esquadrias no fim', () => {
    const op = opcoesDosAmbientes({ elementos: ELEMENTOS, detalhes: DETALHES }, FICHAS)
    expect(op.map((o) => o.id)).toEqual([
      'amb:ficha:EXE-PVS-ALV',
      'amb:ficha:EXE-PVS-PIN',
      'amb:ficha:EXE-PVS-PISO',
      'amb:ficha:EXE-PVS-REB',
      'amb:projeto:IM',
      'amb:esquadrias',
    ])
    const porId = Object.fromEntries(op.map((o) => [o.id, o]))
    expect(porId['amb:ficha:EXE-PVS-PISO']).toEqual({
      id: 'amb:ficha:EXE-PVS-PISO',
      titulo: 'Piso cerâmico · Paginação de piso',
      setor: 'Ambientes',
      abre: { servico: 'EXE-PVS-PISO', aba: 'ambientes' },
      projetos: ['Paginação de piso', 'Impermeabilização'],
    })
    expect(porId['amb:ficha:EXE-PVS-REB'].titulo).toBe('Reboco')
    expect(porId['amb:ficha:EXE-PVS-REB'].projetos).toEqual(['Impermeabilização'])
    expect(porId['amb:ficha:EXE-PVS-ALV'].projetos).toEqual([])
    // impermeabilização: abre na primeira ficha da lista dela (o piso)
    expect(porId['amb:projeto:IM'].abre).toEqual({ servico: 'EXE-PVS-PISO', aba: 'ambientes' })
    // esquadrias: a primeira ficha (na ordem do código) com item de esquadria
    expect(porId['amb:esquadrias'].abre).toEqual({ servico: 'EXE-PVS-ALV', aba: 'esquadrias' })
  })

  it('projeto sem lista de fichas aparece em todas e não vira opção', () => {
    const det = { ...DETALHES, X_Apto_101: { titulo: 'Outro · Apto 101', prancha: 'EXE.X-R00', aco: false } }
    const el = { a1: amb('101-01', ['X_Apto_101']) }
    const op = opcoesDosAmbientes({ elementos: el, detalhes: det }, FICHAS)
    expect(op.every((o) => o.id.startsWith('amb:ficha:'))).toBe(true)
    expect(op.every((o) => o.projetos.includes('Outro'))).toBe(true)
  })

  it('projeto de várias fichas em que só uma existe fica no nome dela; ficha com revisão nova conta uma vez', () => {
    const det = { IM_Apto_101: { ...DETALHES.IM_Apto_101, fichas: ['EXE-PVS-PISO', 'NAO-EXISTE'] } }
    const fichas = [...FICHAS, ficha('EXE-PVS-PISO', 'Piso cerâmico rev 1', { revisao: '1' })]
    const op = opcoesDosAmbientes({ elementos: { a1: amb('101-01', ['IM_Apto_101']) }, detalhes: det }, fichas)
    expect(op.filter((o) => o.id === 'amb:ficha:EXE-PVS-PISO').map((o) => o.titulo)).toEqual(['Piso cerâmico rev 1 · Impermeabilização'])
    expect(op.some((o) => o.id.startsWith('amb:projeto:'))).toBe(false)
  })

  it('sem esquadria no pacote ou sem item de esquadria, sem a opção; sem ficha de ambiente, lista vazia', () => {
    const { e1: _e1, ...semE } = ELEMENTOS
    expect(opcoesDosAmbientes({ elementos: semE, detalhes: DETALHES }, FICHAS).some((o) => o.id === 'amb:esquadrias')).toBe(false)
    const semItem = FICHAS.map((f) => ({ ...f, itens: [item(1)] }))
    expect(opcoesDosAmbientes({ elementos: ELEMENTOS, detalhes: DETALHES }, semItem).some((o) => o.id === 'amb:esquadrias')).toBe(false)
    expect(opcoesDosAmbientes({ elementos: ELEMENTOS, detalhes: DETALHES }, [FICHAS[4]])).toEqual([])
  })
})

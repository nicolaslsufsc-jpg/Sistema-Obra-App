// Área do caminhão × planta da tela: casa pelo trecho, pela linha de "plantas" e pela cópia da mesma
// prancha no pavimento (o S23 não mostrava as lajes em 22/11/2026). Obra fictícia EXE.
import { describe, expect, it } from 'vitest'
import type { Linha } from '../nucleo/banco_local'
import { chavesDasPlantas, pranchaSemRevisao } from './plantas_equivalentes'
import { montarRastreioDasLajes } from './rastreio'

const pl = (id: string, setor: string, pav: string, prancha: string, substitui: string | null = null) =>
  ({ id, setor_id: setor, pavimento_id: pav, prancha, substitui_id: substitui }) as unknown as Linha

const linhas = [
  pl('linha-a1', 'setor-a', 'pav-2', 'EXE.ES.FOR2PAV-R02'),
  pl('linha-b1', 'setor-b', 'pav-2', 'EXE.ES.FOR2PAV-R02'), // cópia da mesma forma em outro trecho
  pl('linha-c1', 'setor-c', 'pav-2', 'EXE.ES.LAJ2PAV-R00'), // outra prancha do pavimento
  pl('linha-d1', 'setor-d', 'pav-3', 'EXE.ES.FOR2PAV-R02'), // mesma prancha, outro pavimento
  pl('linha-s1', 'setor-s', 'pav-0', 'EXE.ES.FORSUB-R14'),
  pl('linha-s2', 'setor-s', 'pav-0', 'EXE.ES.FORSUB-R14', 'linha-s1'), // substitui a s1, mesmo trecho
]

describe('plantas equivalentes', () => {
  const chave = chavesDasPlantas(linhas)

  it('tira a revisão do fim da prancha', () => {
    expect(pranchaSemRevisao('EXE.ES.FOR2PAV-R02')).toBe('EXE.ES.FOR2PAV')
    expect(pranchaSemRevisao('EXE.ES.FOR2PAV')).toBe('EXE.ES.FOR2PAV')
  })

  it('a linha de "plantas" vale pelo trecho dela (e a que ela substitui também)', () => {
    expect(chave('linha-a1')).toBe(chave('setor-a'))
    expect(chave('linha-s1')).toBe(chave('setor-s'))
    expect(chave('linha-s2')).toBe(chave('setor-s'))
  })

  it('cópia da mesma prancha no mesmo pavimento é a mesma planta; outra prancha ou outro pavimento não', () => {
    expect(chave('setor-a')).toBe(chave('setor-b'))
    expect(chave('linha-a1')).toBe(chave('setor-b'))
    expect(chave('setor-c')).not.toBe(chave('setor-a'))
    expect(chave('setor-d')).not.toBe(chave('setor-a'))
  })

  it('id desconhecido (planta de teste, sem linhas) vale por si', () => {
    expect(chave('outra')).toBe('outra')
    expect(chavesDasPlantas([])('setor-a')).toBe('setor-a')
  })

  it('o rastreio da laje da FVS acha a área gravada com o id da linha de "plantas"', () => {
    const quadrado = [[0, 0], [100, 0], [100, 100], [0, 100]]
    const l = {
      concretagens: [{ id: 'c1', data: '2026-11-20', cancelado: false } as unknown as Linha],
      caminhoes: [{ id: 'k1', concretagem_id: 'c1', sequencia: 1, cancelado: false } as unknown as Linha],
      caminhao_areas: [{ id: 'a1', caminhao_id: 'k1', planta_ref: 'linha-a1@R02', alvo: 'vigas_laje', contorno: quadrado, cancelado: false } as unknown as Linha],
      exemplos: new Set<string>(),
    }
    const lajes = [{ id: 'laje-1', setor_id: 'setor-a', contorno: quadrado as Array<[number, number]> }]
    expect(montarRastreioDasLajes(l, lajes as never).size).toBe(0)
    expect(montarRastreioDasLajes({ ...l, chavePlanta: chave }, lajes as never).get('laje-1')?.caminhoes).toHaveLength(1)
  })
})

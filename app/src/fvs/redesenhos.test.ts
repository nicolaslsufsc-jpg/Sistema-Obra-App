import { describe, expect, it } from 'vitest'
import { avisoDeRevisaoNova, chaveDoRedesenho, comRedesenhos, redesenhosVigentes, type LinhaDeRedesenho } from './redesenhos'
import type { ElementoPacote } from './pacote'

const quadrado: Array<[number, number]> = [
  [0, 0],
  [20, 0],
  [20, 60],
  [0, 60],
]
const linha = (id: string, extra: Partial<LinhaDeRedesenho> = {}): LinhaDeRedesenho => ({
  id,
  elemento_id: 'p1',
  setor_id: 's1',
  planta_id: 'r00',
  contorno: quadrado,
  substitui_id: null,
  cancelado: false,
  usuario_id: 'u1',
  criado_em_dispositivo: '2026-11-23T10:00:00.000Z',
  ...extra,
})
const elemento = (tipo: ElementoPacote['tipo'], polys: ElementoPacote['polys']): ElementoPacote => ({ tipo, nome: tipo + '1', secao: '', rotulo: [1, 2, 3, 4], polys })

describe('redesenhos que valem', () => {
  it('a ponta da cadeia vale; a substituída não', () => {
    const a = linha('a')
    const b = linha('b', { substitui_id: 'a', contorno: [[0, 0], [30, 0], [30, 60]], criado_em_dispositivo: '2026-11-23T09:00:00.000Z' })
    const v = redesenhosVigentes([a, b])
    // b vale mesmo com hora antes de a: ela corrige a (relógios diferentes entre aparelhos)
    expect(v.get(chaveDoRedesenho('p1', 's1'))?.id).toBe('b')
    expect(v.get(chaveDoRedesenho('p1', 's1'))?.contorno).toHaveLength(3)
  })

  it('voltar ao original some com o redesenho', () => {
    const v = redesenhosVigentes([linha('a'), linha('b', { substitui_id: 'a', cancelado: true, contorno: null })])
    expect(v.size).toBe(0)
  })

  it('dois aparelhos sem internet: vale a mais nova das pontas', () => {
    const v = redesenhosVigentes([linha('a'), linha('b', { criado_em_dispositivo: '2026-11-23T11:00:00.000Z' }), linha('c', { criado_em_dispositivo: '2026-11-23T10:30:00.000Z' })])
    expect(v.get(chaveDoRedesenho('p1', 's1'))?.id).toBe('b')
  })

  it('cada trecho tem o seu (as coordenadas só valem nele)', () => {
    const v = redesenhosVigentes([linha('a'), linha('b', { setor_id: 's2' })])
    expect([...v.keys()].sort()).toEqual([chaveDoRedesenho('p1', 's1'), chaveDoRedesenho('p1', 's2')])
  })

  it('contorno estragado não entra', () => {
    expect(redesenhosVigentes([linha('a', { contorno: [[0, 0], [1, 1]] })]).size).toBe(0)
    expect(redesenhosVigentes([linha('a', { contorno: [[0, 0], [1, 1], ['x', 2]] })]).size).toBe(0)
  })
})

describe('manifest com os redesenhos', () => {
  const manifest = { elementos: { p1: elemento('P', [[[5, 5], [6, 5], [6, 6]]]), v1: elemento('V', [[[0, 0], [9, 0], [9, 1]]]), l1: elemento('L', []) } }

  it('o contorno novo entra no lugar do original; o resto da peça fica', () => {
    const m = comRedesenhos(manifest, redesenhosVigentes([linha('a')]), 's1')!
    expect(m.elementos.p1.polys).toEqual([quadrado])
    expect(m.elementos.p1.redesenhada).toBe(true)
    expect(m.elementos.p1.rotulo).toEqual([1, 2, 3, 4])
    expect(m.elementos.v1).toBe(manifest.elementos.v1)
    // o pacote não muda: voltar ao original é só deixar de aplicar
    expect(manifest.elementos.p1.polys[0]).toHaveLength(3)
    expect(manifest.elementos.p1.redesenhada).toBeUndefined()
  })

  it('sem redesenho no trecho, devolve o mesmo manifest', () => {
    expect(comRedesenhos(manifest, redesenhosVigentes([linha('a')]), 's2')).toBe(manifest)
    expect(comRedesenhos(manifest, new Map(), 's1')).toBe(manifest)
    expect(comRedesenhos(manifest, undefined, 's1')).toBe(manifest)
    expect(comRedesenhos(undefined, redesenhosVigentes([linha('a')]), 's1')).toBeUndefined()
  })

  it('só pilar e viga', () => {
    const m = comRedesenhos(manifest, redesenhosVigentes([linha('a', { elemento_id: 'l1' })]), 's1')
    expect(m).toBe(manifest)
  })

  it('peça sem contorno no pacote ganha o rótulo no desenho novo', () => {
    const semContorno = { elementos: { p1: elemento('P', []) } }
    const m = comRedesenhos(semContorno, redesenhosVigentes([linha('a')]), 's1')!
    expect(m.elementos.p1.rotulo).toEqual([0, 0, 20, 60])
  })
})

describe('aviso de revisão nova', () => {
  const rev = (id: string) => ({ r00: 'R00', r01: 'R01' })[id]

  it('mesma revisão: sem aviso', () => {
    expect(avisoDeRevisaoNova({ planta_id: 'r00' }, 'r00', rev)).toBe('')
    expect(avisoDeRevisaoNova({ planta_id: null }, 'r01', rev)).toBe('')
  })

  it('redesenhado na R00 e a tela na R01: avisa, sem apagar', () => {
    const a = avisoDeRevisaoNova({ planta_id: 'r00' }, 'r01', rev)
    expect(a).toContain('revisão R00')
    expect(a).toContain('Esta planta é a R01')
    expect(a).toContain('volte ao original')
  })
})

import { describe, expect, it } from 'vitest'
import type { Caminhao, Concretagem, DadosConcreto } from './dados'
import { lotesComAlerta, resumoDasIdades } from './laudos_lote'

// Dados mínimos (obra fictícia): só o que a conta dos laudos lê.
const conc = (raiz: string, data: string): Concretagem => ({ raiz, data, pavimento_id: 'pav', fck_mpa: 40, idades_dias: [7, 28], local_descricao: raiz }) as unknown as Concretagem
const cam = (raiz: string, concretagem_id: string, sequencia: number): Caminhao => ({ raiz, concretagem_id, sequencia, nota_fiscal: `9${sequencia}` }) as unknown as Caminhao

function dados(concs: Concretagem[], cams: Caminhao[], resultados: Record<string, Array<[number, number]>> = {}): DadosConcreto {
  const caminhoesDe = new Map<string, Caminhao[]>()
  for (const c of cams) caminhoesDe.set(c.concretagem_id as string, [...(caminhoesDe.get(c.concretagem_id as string) ?? []), c])
  const resultadosDe = new Map(Object.entries(resultados).map(([k, v]) => [k, v.map(([idade_dias, resistencia_mpa]) => ({ idade_dias, numero_cp: 1, resistencia_mpa }))]))
  return { concretagens: concs, caminhoes: cams, caminhoesDe, resultadosDe } as unknown as DadosConcreto
}

describe('laudos por lote', () => {
  it('uma linha por lote, com os caminhões dentro e o maior atraso de cada idade', () => {
    // lote A: 3 caminhões sem laudo de 7 nem de 28 dias (moldados há 42 dias)
    // lote B: 2 caminhões; 7 dias ok, 28 dias atrasado só no 2º (o 1º tem laudo)
    // lote C: tudo em dia: não aparece
    const d = dados(
      [conc('A', '2026-10-01'), conc('B', '2026-10-10'), conc('C', '2026-11-20')],
      [cam('a1', 'A', 1), cam('a2', 'A', 2), cam('a3', 'A', 3), cam('b2', 'B', 2), cam('b1', 'B', 1), cam('c1', 'C', 1)],
      { b1: [[7, 30], [28, 45]], b2: [[7, 31]] },
    )
    const lotes = lotesComAlerta(d, '2026-11-12')
    expect(lotes.map((l) => l.concretagem.raiz)).toEqual(['A', 'B'])
    const [a, b] = lotes
    expect(a.caminhoes.map((c) => c.caminhao.raiz)).toEqual(['a1', 'a2', 'a3'])
    expect(a.idades).toEqual([
      { idade: 7, atrasados: 3, diasDeAtraso: 35, abaixo: 0 },
      { idade: 28, atrasados: 3, diasDeAtraso: 14, abaixo: 0 },
    ])
    expect(resumoDasIdades(a)).toBe('7 dias: atrasado há 35 dias · 28 dias: atrasado há 14 dias')
    // só o caminhão com alerta entra, na ordem do caminhão
    expect(b.caminhoes.map((c) => c.caminhao.raiz)).toEqual(['b2'])
    expect(resumoDasIdades(b)).toBe('28 dias: atrasado há 5 dias')
  })

  it('atrasado vem antes do abaixo do fck (como na gravidade do app) e diz quantos caminhões', () => {
    const d = dados([conc('A', '2026-09-01'), conc('B', '2026-10-01')], [cam('a1', 'A', 1), cam('b1', 'B', 1), cam('b2', 'B', 2)], {
      a1: [[7, 30]],
      b1: [[7, 25], [28, 38]],
      b2: [[7, 26], [28, 36]],
    })
    const lotes = lotesComAlerta(d, '2026-11-10')
    expect(lotes.map((l) => [l.concretagem.raiz, l.pior])).toEqual([
      ['A', 'atrasado'],
      ['B', 'abaixo_fck'],
    ])
    expect(resumoDasIdades(lotes[1])).toBe('28 dias: 2 abaixo do fck')
  })

  it('dentro da margem de 3 dias ainda não é atraso', () => {
    const d = dados([conc('A', '2026-11-01')], [cam('a1', 'A', 1)])
    expect(lotesComAlerta(d, '2026-11-11')).toEqual([])
    expect(lotesComAlerta(d, '2026-11-12')).toHaveLength(1)
  })
})

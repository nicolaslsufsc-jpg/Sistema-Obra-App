import { describe, expect, it } from 'vitest'
import {
  agruparTratativas,
  camposLimpos,
  comTratativas,
  eventoDaTratativa,
  hojeLocal,
  repetidosNaObra,
  repetiuNoLocal,
  responsaveisDaObra,
  resumoDaTratativa,
  situacaoDoPrazo,
  tratativaDaRodada,
  tratativaMudou,
  TRATATIVA_VAZIA,
  type Tratativa,
} from './tratativas'
import type { EventoFvs } from './situacao'

const ev = (id: string, quando: string): EventoFvs => ({
  id,
  elemento_id: 'p1',
  ficha_id: 'f1',
  item: 1,
  resultado: 'NC',
  rodada: 1,
  observacao: null,
  lote_id: null,
  planta_id: null,
  usuario_id: 'u1',
  criado_em_dispositivo: quando,
})

const trat = (id: string, evento: string, quando: string, campos: Partial<Tratativa> = {}): Tratativa => ({
  ...TRATATIVA_VAZIA,
  id,
  evento_nc_id: evento,
  usuario_id: 'u1',
  criado_em_dispositivo: quando,
  ...campos,
})

describe('tratativa de NC: campos', () => {
  it('apara o texto, corta no tamanho do banco e só aceita causa, eficácia e data válidas', () => {
    const c = camposLimpos({ responsavel: '  Empreiteiro  ', causa: 'chuva' as never, eficacia: 'talvez' as never, prazo: '01/12/2026', casos_parecidos: 'x'.repeat(600) })
    expect(c.responsavel).toBe('Empreiteiro')
    expect(c.causa).toBeNull()
    expect(c.eficacia).toBeNull()
    expect(c.prazo).toBeNull()
    expect(c.casos_parecidos).toHaveLength(500)
    expect(camposLimpos({ prazo: '2026-12-01', causa: 'material' })).toMatchObject({ prazo: '2026-12-01', causa: 'material' })
  })

  it('concessão sem quem decidiu não vale (o banco recusaria e o registro ficaria preso na fila)', () => {
    expect(camposLimpos({ concessao: true }).concessao).toBe(false)
    expect(camposLimpos({ concessao: true, concessao_por: '   ' }).concessao).toBe(false)
    expect(camposLimpos({ concessao: true, concessao_por: 'Engenheiro' })).toMatchObject({ concessao: true, concessao_por: 'Engenheiro' })
  })

  it('só grava se mudou alguma coisa', () => {
    expect(tratativaMudou(null, camposLimpos({}))).toBe(false)
    expect(tratativaMudou(null, camposLimpos({ responsavel: 'A' }))).toBe(true)
    const a = camposLimpos({ responsavel: 'A', causa: 'projeto' })
    expect(tratativaMudou(a, camposLimpos({ responsavel: ' A ', causa: 'projeto' }))).toBe(false)
    expect(tratativaMudou(a, camposLimpos({ responsavel: 'A', causa: 'material' }))).toBe(true)
  })
})

describe('tratativa de NC: qual vale', () => {
  it('a mais nova entre as que apontam para qualquer registro NC da rodada', () => {
    const tratativasDe = agruparTratativas([
      { id: 't1', evento_nc_id: 'e1', responsavel: 'A', criado_em_dispositivo: '2026-11-25T10:00:00Z' },
      { id: 't2', evento_nc_id: 'e2', responsavel: 'B', criado_em_dispositivo: '2026-11-25T11:00:00Z' },
      { id: 't3', evento_nc_id: 'outro', responsavel: 'C', criado_em_dispositivo: '2026-11-25T12:00:00Z' },
      { id: 't4', evento_nc_id: 'e1', responsavel: 'D', criado_em_dispositivo: '2026-11-25T13:00:00Z', apagado: true },
    ])
    const t = tratativaDaRodada(tratativasDe, [ev('e1', '2026-11-25T09:00:00Z'), ev('e2', '2026-11-25T09:30:00Z')])
    expect(t?.responsavel).toBe('B')
    expect(tratativaDaRodada(tratativasDe, [ev('e9', '2026-11-25T09:00:00Z')])).toBeNull()
    expect(tratativaDaRodada(undefined, [ev('e1', '')])).toBeNull()
  })

  it('a tratativa nova aponta para o registro da que vale, ou para o primeiro NC da rodada', () => {
    const evs = [ev('e2', '2026-11-25T09:30:00Z'), ev('e1', '2026-11-25T09:00:00Z')]
    expect(eventoDaTratativa(evs, null)).toBe('e1')
    expect(eventoDaTratativa(evs, trat('t', 'e2', ''))).toBe('e2')
    expect(eventoDaTratativa([], null)).toBeNull()
  })

  it('a gravada agora entra na lista sem reler o aparelho, sem duplicar', () => {
    const m = comTratativas(undefined, [trat('t1', 'e1', 'a')])
    const m2 = comTratativas(m, [trat('t1', 'e1', 'a'), trat('t2', 'e1', 'b')])
    expect(m2.get('e1')?.map((t) => t.id)).toEqual(['t1', 't2'])
  })
})

describe('tratativa de NC: prazo só avisa', () => {
  it('atrasado, vence hoje ou no prazo, só com o NC aberto', () => {
    expect(situacaoDoPrazo('2026-11-24', true, '2026-11-25')).toBe('atrasado')
    expect(situacaoDoPrazo('2026-11-25', true, '2026-11-25')).toBe('hoje')
    expect(situacaoDoPrazo('2026-11-26', true, '2026-11-25')).toBe('no_prazo')
    expect(situacaoDoPrazo('2026-11-24', false, '2026-11-25')).toBeNull()
    expect(situacaoDoPrazo(null, true, '2026-11-25')).toBeNull()
  })

  it('hoje é pela hora do aparelho, não UTC', () => {
    expect(hojeLocal(new Date(2026, 10, 25, 23, 30))).toBe('2026-11-25')
  })

  it('resumo de uma linha, com concessão e eficácia', () => {
    const t = camposLimpos({ responsavel: 'Equipe A', prazo: '2026-11-20', causa: 'outro', causa_obs: 'chuva', concessao: true, concessao_por: 'Eng.', eficacia: 'eficaz' })
    expect(resumoDaTratativa(t, true, '2026-11-25')).toBe('Quem resolve: Equipe A · até 20/11/2026 · Causa: Outro (chuva) · Aceito sob concessão por Eng. · Correção eficaz')
    // com concessão, o prazo não fica atrasado
    expect(resumoDaTratativa(camposLimpos({ prazo: '2026-11-20' }), true, '2026-11-25')).toBe('até 20/11/2026 · atrasado')
    expect(resumoDaTratativa(null)).toBe('')
  })
})

describe('tratativa de NC: repetição pede ação corretiva (só avisa)', () => {
  it('3 rodadas com NC no mesmo local', () => {
    expect(repetiuNoLocal(2)).toBe(false)
    expect(repetiuNoLocal(3)).toBe(true)
  })

  it('o mesmo item da mesma ficha com NC em 3 locais da obra', () => {
    const r = (pecaId: string, item = 1) => ({ fichaId: 'f1', item, pecaId })
    const m = repetidosNaObra([r('p1'), r('p2'), r('p2'), r('p3'), r('p1', 2)])
    expect(m.get('f1|1')).toBe(3)
    expect(m.has('f1|2')).toBe(false)
  })

  it('sugere quem já resolveu NC na obra, o mais usado primeiro', () => {
    const m = new Map([
      ['e1', [trat('a', 'e1', '', { responsavel: 'B' }), trat('b', 'e1', '', { responsavel: 'A' })]],
      ['e2', [trat('c', 'e2', '', { responsavel: 'A' })]],
    ])
    expect(responsaveisDaObra(m)).toEqual(['A', 'B'])
  })
})

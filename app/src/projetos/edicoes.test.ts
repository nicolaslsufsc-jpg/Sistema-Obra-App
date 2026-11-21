// Tela de edição (protótipo de 14/11/2026): correção por linha nova, com histórico; e a pasta do escritório.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { aplicarEdicoes, chaveFolha, compararEscritorio, gravarEdicao, historicoDaPrancha, lerEdicoes, resumirEscritorio, type Edicao } from './edicoes'
import { DISTRIBUICAO_EXE, VIGENTES_EXE } from './exemplo_exe'
import { cruzar, lerDistribuicao, lerVigentes, resumir } from './painel'

const HOJE = '2026-11-14'
const OBRA = 'b0000000-0000-0000-0000-0000000000c1'
const vigentes = lerVigentes(VIGENTES_EXE)
const copias = lerDistribuicao(DISTRIBUICAO_EXE)
const base = { vigentes, copias }
const FORMAS = 'EXE.ES.100.FORPILOTIS'

describe('chave da folha', () => {
  it('é o código sem a fase: a mesma folha em EX e em LO', () => {
    expect(chaveFolha({ codigo: 'EXE.ES.LO.100.FORPILOTIS' })).toBe(FORMAS)
    expect(chaveFolha({ codigo: 'EXE.ES.EX.100.FORPILOTIS' })).toBe(FORMAS)
    expect(chaveFolha({ codigo: 'X.Y' })).toBe('X.Y')
  })
})

describe('correções gravadas (nada se apaga)', () => {
  it('cada correção é uma linha nova que aponta para a anterior', async () => {
    const dados = { empresa: 'Empreiteira Alfa', colaborador: 'João', fase: 'LO', revisao: 2, entrega: '2026-10-25', devolucao: null }
    await gravarEdicao(OBRA, { tipo: 'copia', alvo: 1, codigo: '100', dados }, 'eu', new Date('2026-11-14T10:00:00Z'))
    const lista = await gravarEdicao(OBRA, { tipo: 'copia', alvo: 1, codigo: '100', dados: { ...dados, devolucao: '2026-11-14' } }, 'eu', new Date('2026-11-14T11:00:00Z'))
    expect(lista).toHaveLength(2)
    expect(lista[0].substitui_id).toBeNull()
    expect(lista[1].substitui_id).toBe(lista[0].id)
    expect(await lerEdicoes(OBRA)).toHaveLength(2)
    // vale a última: devolvida
    const c = aplicarEdicoes(base, lista).copias.find((x) => x.linha === 1)!
    expect(c.devolucao).toBe('2026-11-14')
    // a base importada não muda
    expect(copias.find((x) => x.linha === 1)!.devolucao).toBeNull()
  })
})

describe('aplicar as correções', () => {
  const ed = (e: Partial<Edicao> & Pick<Edicao, 'tipo' | 'alvo'>, n: number): Edicao =>
    ({ id: `e${n}`, substitui_id: null, em: `2026-11-14T0${n}:00:00Z`, usuario: 'eu', ...e }) as Edicao

  it('corrigir a revisão da cópia muda o resultado do painel', () => {
    const antes = resumir(cruzar(copias, vigentes, HOJE))
    const e = ed({ tipo: 'copia', alvo: 1, codigo: '100', dados: { empresa: 'Empreiteira Alfa', colaborador: 'João', fase: 'LO', revisao: 2, entrega: '2026-10-25', devolucao: null } } as Edicao, 1)
    const b = aplicarEdicoes(base, [e])
    const depois = resumir(cruzar(b.copias, b.vigentes, HOJE))
    expect(depois.desatualizadas.length).toBe(antes.desatualizadas.length - 1)
    expect(depois.emDia).toBe(antes.emDia + 1)
  })
  it('corrigir a vigente vale para a folha nas duas fases', () => {
    const e = ed({ tipo: 'vigente', alvo: FORMAS, dados: { titulo: 'FORMAS DO PILOTIS', fase: 'LO', revisao: 3, data: '2026-11-10' } } as Edicao, 1)
    const v = aplicarEdicoes(base, [e]).vigentes.find((x) => x.codigo === 'EXE.ES.LO.100.FORPILOTIS')!
    expect(v).toMatchObject({ revisao: 3, data: '2026-11-10' })
  })
  it('a base foi reimportada e a linha virou outra prancha: a correção não vale e fica como órfã', () => {
    const e = ed({ tipo: 'copia', alvo: 1, codigo: '999', dados: { empresa: 'X', colaborador: '', fase: 'EX', revisao: 0, entrega: null, devolucao: null } } as Edicao, 1)
    const b = aplicarEdicoes(base, [e])
    expect(b.orfas).toHaveLength(1)
    expect(b.copias.find((x) => x.linha === 1)!.empresa).toBe('Empreiteira Alfa')
  })
  it('histórico da prancha: a folha e as cópias dela, mais novo primeiro', () => {
    const lista = [
      ed({ tipo: 'escritorio', alvo: FORMAS, dados: { fase: 'LO', revisao: 1, data: '2026-10-01' } } as Edicao, 1),
      ed({ tipo: 'copia', alvo: 1, codigo: '100', dados: {} } as Edicao, 2),
      ed({ tipo: 'copia', alvo: 5, codigo: '4', dados: {} } as Edicao, 3),
    ]
    expect(historicoDaPrancha(lista, FORMAS, [1, 2]).map((e) => e.id)).toEqual(['e2', 'e1'])
  })
})

describe('escritório desatualizado', () => {
  it('pasta com revisão velha: desatualizado, com os dias desde a vigente; sem registro conta à parte', () => {
    const esc = new Map([
      [FORMAS, { fase: 'LO', revisao: 1, data: '2026-10-01' }], // vigente LO R02 de 22/10 → 23 d
      ['EXE.ES.200.PILSUBSOLO', { fase: 'LO', revisao: 0, data: '2026-11-02' }], // em dia
    ])
    const r = resumirEscritorio(vigentes, esc, HOJE)
    expect(r.desatualizados).toHaveLength(1)
    expect(r.desatualizados[0]).toMatchObject({ dias: 23 })
    expect(r.desatualizados[0].vigente.codigo).toBe('EXE.ES.LO.100.FORPILOTIS')
    expect(r.emDia).toBe(1)
    expect(r.semRegistro).toBe(4)
  })

  it('regra estrita: EX na pasta com a LO de mesmo número vigente é desatualizado, mesmo atualizada depois', () => {
    expect(compararEscritorio({ fase: 'EX', revisao: 2 }, { fase: 'LO', revisao: 2 })).toBe('desatualizado')
    expect(compararEscritorio({ fase: 'LO', revisao: 0 }, { fase: 'EX', revisao: 5 })).toBe('à frente')
    expect(compararEscritorio({ fase: 'LO', revisao: 2 }, { fase: 'LO', revisao: 2 })).toBe('em dia')
    const r = resumirEscritorio(vigentes, new Map([[FORMAS, { fase: 'EX', revisao: 2, data: '2026-11-13' }]]), HOJE)
    expect(r.desatualizados).toHaveLength(1)
  })
})

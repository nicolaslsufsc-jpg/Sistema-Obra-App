// Trocar a unidade de conferência numa obra já publicada (ideia 14, pendência 11, 25/11/2026).
import { describe, expect, it } from 'vitest'
import { historicoDeUnidades, lerRegras, regrasVigentes, unidadeDe } from '../fvs/regras'
import { linhaVigente, regrasComTroca, unidadePadrao, unidadesDaObra, type FichaDaObra, type LinhaDeRegras } from './trocar_unidade'

const pilares: FichaDaObra = { codigo: 'EXE-PVS-01', titulo: 'Pilares', aplica_a: ['P'] }
const ambientes: FichaDaObra = { codigo: 'EXE-PVS-02', titulo: 'Revestimento', aplica_a: ['A', 'M'] }
const paredes: FichaDaObra = { codigo: 'EXE-PVS-03', titulo: 'Alvenaria', aplica_a: ['M'] }

const PRAZO = { id: 'p1', ficha: 'EXE-PVS-01', item: 3, dias: 21, depois_de: { tipo: 'concretagem' } }
const LIGACAO = { id: 'l1', de: { ficha: 'EXE-PVS-01', item: 5 }, para: { ficha: 'EXE-PVS-02', item: 2 } }

const publicada: LinhaDeRegras = {
  id: 'a',
  criado_em_servidor: '2026-11-20T10:00:00Z',
  regras: {
    prazos: [PRAZO],
    ligacoes: [LIGACAO],
    outra_chave: { qualquer: 'coisa' },
    unidades: [
      { id: 'unidade-1', ficha: 'EXE-PVS-01', unidade: 'peca', desde: '2026-11-20' },
      { id: 'unidade-2', ficha: 'EXE-PVS-02', unidade: 'ambiente', desde: '2026-11-20' },
    ],
  },
}
const antiga: LinhaDeRegras = { id: 'z', criado_em_servidor: '2026-11-19T10:00:00Z', regras: { prazos: [] } }

describe('Trocar a unidade de uma obra publicada', () => {
  it('versão nova: copia tudo da que vale e acrescenta a entrada, sem apagar a anterior', () => {
    const r = regrasComTroca([antiga, publicada], ambientes, 'parede', '2026-12-10', '2026-11-25')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.regras.prazos).toEqual([PRAZO])
    expect(r.regras.ligacoes).toEqual([LIGACAO])
    expect(r.regras.outra_chave).toEqual({ qualquer: 'coisa' })
    expect(r.entrada).toEqual({ id: 'unidade-3', ficha: 'EXE-PVS-02', unidade: 'parede', desde: '2026-12-10' })
    // a linha nova vira a vigente; antes da data vale a antiga, depois a nova, e o histórico tem as duas
    const nova = { id: 'b', criado_em_dispositivo: '2026-11-25T12:00:00Z', regras: r.regras }
    const regras = regrasVigentes([antiga, publicada, nova])
    expect(regras.fora).toBeUndefined()
    expect(unidadeDe(regras, 'EXE-PVS-02', '2026-12-09')).toBe('ambiente')
    expect(unidadeDe(regras, 'EXE-PVS-02', '2026-12-10')).toBe('parede')
    expect(historicoDeUnidades(regras, 'EXE-PVS-02').map((u) => u.unidade)).toEqual(['ambiente', 'parede'])
    expect(regras.prazos).toHaveLength(1)
    expect(regras.ligacoes).toHaveLength(1)
    // a linha publicada continua igual (nada sobrescrito)
    expect((publicada.regras as { unidades: unknown[] }).unidades).toHaveLength(2)
  })

  it('troca no mesmo dia da última: a mais nova da lista vale', () => {
    const r = regrasComTroca([publicada], pilares, 'pavimento', '2026-11-25', '2026-11-25')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const r2 = regrasComTroca([{ id: 'b', criado_em_servidor: '2026-11-25T12:00:00Z', regras: r.regras }], pilares, 'trecho', '2026-11-25', '2026-11-25')
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    expect(unidadeDe(lerRegras(r2.regras), 'EXE-PVS-01', '2026-11-25')).toBe('trecho')
  })

  it('recusa: data no passado, antes da troca marcada, a mesma unidade e unidade que não serve para a ficha', () => {
    const erro = (r: ReturnType<typeof regrasComTroca>) => (r.ok ? '' : r.erro)
    expect(erro(regrasComTroca([publicada], pilares, 'pavimento', '2026-11-24', '2026-11-25'))).toMatch(/de hoje em diante/)
    expect(erro(regrasComTroca([publicada], pilares, 'pavimento', '25/11/2026', '2026-11-25'))).toMatch(/Escolha a data/)
    expect(erro(regrasComTroca([publicada], pilares, 'peca', '2026-11-30', '2026-11-25'))).toMatch(/já é conferida por peça/)
    expect(erro(regrasComTroca([publicada], pilares, 'parede', '2026-11-30', '2026-11-25'))).toMatch(/não vale para parede/)
    expect(erro(regrasComTroca([publicada], paredes, 'ambiente', '2026-11-30', '2026-11-25'))).toMatch(/não vale para ambiente/)
    expect(erro(regrasComTroca([publicada], paredes, 'peca', '2026-11-30', '2026-11-25'))).toMatch(/não vale para pilar/)
    const marcada = regrasComTroca([publicada], pilares, 'pavimento', '2026-12-10', '2026-11-25')
    if (!marcada.ok) throw new Error(marcada.erro)
    const depois = [{ id: 'b', criado_em_servidor: '2026-11-25T12:00:00Z', regras: marcada.regras }]
    expect(erro(regrasComTroca(depois, pilares, 'trecho', '2026-12-01', '2026-11-25'))).toMatch(/Já há uma troca marcada para 10\/12\/2026/)
  })

  it('obra sem fvs_regras (ou sem unidades): começa do padrão e cria a primeira versão', () => {
    expect(unidadePadrao(['P', 'V'])).toBe('peca')
    expect(unidadePadrao(['A'])).toBe('ambiente')
    expect(unidadePadrao(['M'])).toBe('parede')
    expect(regrasComTroca([], paredes, 'parede', '2026-11-25', '2026-11-25')).toMatchObject({ ok: false })
    const r = regrasComTroca([], pilares, 'pavimento', '2026-11-25', '2026-11-25')
    expect(r).toMatchObject({ ok: true, regras: { unidades: [{ id: 'unidade-1', ficha: 'EXE-PVS-01', unidade: 'pavimento', desde: '2026-11-25' }] } })
  })

  it('a tela: uma linha por código (a maior revisão), o que vale hoje e a troca marcada', () => {
    const marcada = regrasComTroca([publicada], ambientes, 'parede', '2026-12-10', '2026-11-25')
    if (!marcada.ok) throw new Error(marcada.erro)
    const linhas = [publicada, { id: 'b', criado_em_servidor: '2026-11-25T12:00:00Z', regras: marcada.regras }]
    expect(linhaVigente(linhas)?.id).toBe('b')
    const tela = unidadesDaObra(
      [{ ...ambientes, aplica_a: ['A'], revisao: '0' }, { ...ambientes, revisao: '1' }, pilares, paredes],
      lerRegras(linhaVigente(linhas)?.regras),
      '2026-11-25',
    )
    expect(tela.map((t) => [t.ficha.codigo, t.hoje, t.padrao, t.depois?.unidade ?? null])).toEqual([
      ['EXE-PVS-01', 'peca', false, null],
      ['EXE-PVS-02', 'ambiente', false, 'parede'],
      ['EXE-PVS-03', 'parede', true, null],
    ])
    expect(tela[1].ficha.revisao).toBe('1')
  })
})

// Ideia 14 (25/11/2026): unidade de conferência escolhida na montagem da obra.
import { describe, expect, it } from 'vitest'
import { abrirZip } from '../nucleo/zip'
import { linhasDoCadastro } from '../nucleo/pacote_obra'
import { historicoDeUnidades, lerRegras, unidadeDe } from '../fvs/regras'
import { comUnidade, configFvsDoRascunho, fichaVazia, pacoteDoRascunho, problemas, unidadeDaFicha, zipDoRascunho, type FichaRascunho, type RascunhoObra } from './modelo'

const item = { etapa: 'Execução', titulo: 'Prumo', descricao: '', dispositivo: '', tolerancia: '' }
const ficha = (codigo: string, parcial: Partial<FichaRascunho> = {}): FichaRascunho => ({ ...fichaVazia(), codigo, titulo: codigo, itens: [item], ...parcial })
const rascunho = (fichas: FichaRascunho[]): RascunhoObra => ({ codigo: 'EXE-U', nome: 'Obra Exemplo', empresa: '', pavimentos: ['Térreo'], fichas, plantas: [] })
const AGORA = new Date('2026-11-25T12:00:00Z')

describe('Nova obra: unidade de conferência', () => {
  it('sem escolha, a unidade sai do "Vale para"; escolher acerta o "Vale para" quando precisa', () => {
    expect(unidadeDaFicha(ficha('A', { aplica_a: ['P', 'V'] }))).toBe('peca')
    expect(unidadeDaFicha(ficha('B', { aplica_a: ['A'] }))).toBe('ambiente')
    expect(unidadeDaFicha(ficha('C', { aplica_a: ['M'] }))).toBe('parede')
    expect(comUnidade(ficha('D', { aplica_a: ['A'] }), 'parede').aplica_a).toEqual(['M'])
    expect(comUnidade(ficha('E', { aplica_a: ['M'] }), 'ambiente').aplica_a).toEqual(['A'])
    expect(comUnidade(ficha('F', { aplica_a: ['A', 'P'] }), 'peca').aplica_a).toEqual(['P'])
    // grupo (trecho, área, pavimento): o "Vale para" fica como estava
    expect(comUnidade(ficha('G', { aplica_a: ['M'] }), 'pavimento')).toMatchObject({ unidade: 'pavimento', aplica_a: ['M'] })
  })

  it('combinação sem sentido segura o salvar', () => {
    expect(problemas(rascunho([ficha('EXE-1', { unidade: 'peca', aplica_a: ['P', 'A'] })])).join()).toMatch(/"Por peça" vale só para pilar, viga e laje/)
    expect(problemas(rascunho([ficha('EXE-2', { unidade: 'parede', aplica_a: ['M', 'A'] })])).join()).toMatch(/"Por parede" vale só para parede/)
    expect(problemas(rascunho([ficha('EXE-3', { unidade: 'trecho', aplica_a: ['A', 'M'] })]))).toEqual([])
  })

  it('vai no config_fvs.json do .zip, vira linha em fvs_regras e a FVS lê a unidade de cada ficha', async () => {
    const r = rascunho([ficha('EXE-PVS-01', { aplica_a: ['P'] }), ficha('EXE-PVS-02', { unidade: 'pavimento', aplica_a: ['M'] }), ficha('EXE-PVS-03', { aplica_a: ['A'] })])
    expect(configFvsDoRascunho(r, AGORA).unidades.map((u) => [u.ficha, u.unidade, u.desde])).toEqual([
      ['EXE-PVS-01', 'peca', '2026-11-25'],
      ['EXE-PVS-02', 'pavimento', '2026-11-25'],
      ['EXE-PVS-03', 'ambiente', '2026-11-25'],
    ])
    const zip = await zipDoRascunho(r, AGORA)
    expect(JSON.parse((await (await abrirZip(zip)).texto('config_fvs.json'))!)).toEqual(configFvsDoRascunho(r, AGORA))

    // o mesmo caminho da publicação no servidor (publicar.ts)
    const { indice, fichas, configFvs } = await pacoteDoRascunho(r, AGORA)
    const obra = { id: 'b1000000-0000-0000-0000-0000000000aa', codigo: 'EXE-U', nome: 'Obra Exemplo', empresa: null, papel: 'admin' as const }
    const { linhas } = await linhasDoCadastro(obra, indice, fichas, configFvs)
    const linha = linhas.find((l) => l.tabela === 'fvs_regras')
    expect(linha).toBeTruthy()
    const regras = lerRegras(linha!.linha.regras)
    expect(regras.fora).toBeUndefined()
    expect(unidadeDe(regras, 'EXE-PVS-02', '2026-11-26')).toBe('pavimento')
    expect(unidadeDe(regras, 'EXE-PVS-03', '2026-11-26')).toBe('ambiente')
    // antes da obra montada, e ficha que não está na lista: null (a tela segue como sempre)
    expect(unidadeDe(regras, 'EXE-PVS-02', '2026-11-24')).toBeNull()
    expect(unidadeDe(regras, 'OUTRA', '2026-11-26')).toBeNull()
  })

  it('trocar no meio da obra: entrada nova com "desde" novo, a antiga fica no histórico', () => {
    const regras = lerRegras({
      prazos: [],
      unidades: [
        { id: 'u1', ficha: 'EXE-PVS-02', unidade: 'ambiente', desde: '2026-11-25' },
        { id: 'u2', ficha: 'EXE-PVS-02', unidade: 'parede', desde: '2026-12-10' },
        { id: 'u3', ficha: 'EXE-PVS-02', unidade: 'nenhuma', desde: '2026-12-11' },
        { id: 'u4', ficha: 'EXE-PVS-02', unidade: 'pavimento', desde: '10/12/2026' },
      ],
    })
    expect(regras.fora).toBe(2)
    expect(unidadeDe(regras, 'EXE-PVS-02', '2026-12-09')).toBe('ambiente')
    expect(unidadeDe(regras, 'EXE-PVS-02', '2026-12-10')).toBe('parede')
    expect(historicoDeUnidades(regras, 'EXE-PVS-02').map((u) => [u.unidade, u.desde])).toEqual([
      ['ambiente', '2026-11-25'],
      ['parede', '2026-12-10'],
    ])
  })
})

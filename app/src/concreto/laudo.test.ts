import { describe, expect, it } from 'vitest'
import { colunasDoLaudo, dataSugerida, erroDaDataDeEnsaio, laudoDaIdade, planejarLaudo, resultadosPorCaixa, valorAtual, type ResultadoDoLaudo } from './laudo'

let n = 0
function res(caminhao_id: string, idade_dias: number, numero_cp: number, resistencia_mpa: number, data_ensaio: string | null = null): ResultadoDoLaudo {
  n++
  return {
    id: `r${String(n).padStart(3, '0')}`,
    caminhao_id,
    idade_dias,
    numero_cp,
    resistencia_mpa,
    data_ensaio,
    criado_em_dispositivo: `2026-11-08T10:00:${String(n % 60).padStart(2, '0')}.000Z`,
  }
}

const base = { idade: 7, dataEnsaio: '2026-11-14', dataMoldagem: '2026-11-07', hoje: '2026-11-14', nomeDoCaminhao: (id: string) => `Caminhão ${id}` }

describe('laudo: vários CPs de uma vez', () => {
  it('caixas preenchidas viram resultados novos; vazias não gravam nada', () => {
    const { gravacoes, erros } = planejarLaudo({
      ...base,
      existentes: [],
      caixas: [
        { caminhao_id: '1', numero_cp: 1, valor: 31.2 },
        { caminhao_id: '1', numero_cp: 2, valor: null },
        { caminhao_id: '2', numero_cp: 1, valor: 29 },
      ],
    })
    expect(erros).toEqual([])
    expect(gravacoes).toEqual([
      { tipo: 'novo', campos: { caminhao_id: '1', idade_dias: 7, numero_cp: 1, resistencia_mpa: 31.2, data_ensaio: '2026-11-14', origem: 'manual' } },
      { tipo: 'novo', campos: { caminhao_id: '2', idade_dias: 7, numero_cp: 1, resistencia_mpa: 29, data_ensaio: '2026-11-14', origem: 'manual' } },
    ])
  })

  it('valor igual ao que já está não grava; valor diferente vira correção', () => {
    const a = res('1', 7, 1, 31.2)
    const b = res('1', 7, 2, 30)
    const { gravacoes } = planejarLaudo({
      ...base,
      existentes: [a, b],
      caixas: [
        { caminhao_id: '1', numero_cp: 1, valor: 31.2 },
        { caminhao_id: '1', numero_cp: 2, valor: 32.5 },
      ],
    })
    expect(gravacoes).toEqual([{ tipo: 'corrigir', atual: b, mudancas: { resistencia_mpa: 32.5, data_ensaio: '2026-11-14', origem: 'manual' } }])
  })

  it('a outra idade não conta: o CP1 de 28 dias é outro corpo de prova', () => {
    const { gravacoes } = planejarLaudo({ ...base, existentes: [res('1', 28, 1, 45)], caixas: [{ caminhao_id: '1', numero_cp: 1, valor: 31 }] })
    expect(gravacoes.map((g) => g.tipo)).toEqual(['novo'])
  })

  it('uma casa depois da vírgula, como o banco guarda', () => {
    const a = res('1', 7, 1, 31.2)
    const { gravacoes } = planejarLaudo({ ...base, existentes: [a], caixas: [{ caminhao_id: '1', numero_cp: 1, valor: 31.24 }, { caminhao_id: '2', numero_cp: 1, valor: 28.06 }] })
    expect(gravacoes).toHaveLength(1)
    expect(gravacoes[0]).toMatchObject({ tipo: 'novo', campos: { resistencia_mpa: 28.1 } })
  })

  it('CP lançado duas vezes: fica o valor da caixa e o repetido sai', () => {
    const velho = res('1', 7, 1, 30)
    const novo = res('1', 7, 1, 31)
    const porCaixa = resultadosPorCaixa([velho, novo], 7)
    expect(valorAtual(porCaixa, '1', 1)).toBe(31)
    const { gravacoes } = planejarLaudo({ ...base, existentes: [velho, novo], caixas: [{ caminhao_id: '1', numero_cp: 1, valor: 31 }] })
    expect(gravacoes).toEqual([{ tipo: 'cancelar', atual: velho }])
  })

  it('número errado ou data antes da moldagem: não grava nada e diz onde está o erro', () => {
    const r = planejarLaudo({
      ...base,
      dataEnsaio: '2026-11-06',
      existentes: [],
      caixas: [
        { caminhao_id: '1', numero_cp: 1, valor: 30 },
        { caminhao_id: '2', numero_cp: 2, valor: Number.NaN },
        { caminhao_id: '3', numero_cp: 1, valor: 250 },
      ],
    })
    expect(r.gravacoes).toEqual([])
    expect(r.erros).toEqual([
      'A data do ensaio (06/11/2026) é antes da moldagem (07/11/2026).',
      'Caminhão 2, CP2: resistência em MPa, de 0 a 200.',
      'Caminhão 3, CP1: resistência em MPa, de 0 a 200.',
    ])
  })

  it('caixas por caminhão: os CPs por idade, ou mais se já tem CP de número maior naquela idade', () => {
    expect(colunasDoLaudo(2, [], 7)).toBe(2)
    expect(colunasDoLaudo(2, [res('1', 7, 3, 30), res('1', 28, 5, 40)], 7)).toBe(3)
    expect(colunasDoLaudo(2, [res('1', 7, 3, 30), res('1', 28, 5, 40)], 28)).toBe(5)
  })

  it('data sugerida: a do laudo já lançado daquela idade, senão a data prevista', () => {
    expect(dataSugerida([], 7, '2026-11-14', '2026-11-20')).toBe('2026-11-14')
    expect(dataSugerida([res('1', 7, 1, 30, '2026-11-15'), res('1', 28, 1, 40, '2026-12-05')], 7, '2026-11-14', '2026-11-20')).toBe('2026-11-15')
  })
  it('laudo lançado antes da data prevista: sugere hoje, não uma data no futuro', () => {
    expect(dataSugerida([], 28, '2026-12-05', '2026-11-13')).toBe('2026-11-13')
  })
})

describe('data do ensaio (teste da obra de demonstração, 13/11)', () => {
  const hoje = '2026-11-13'
  it('no futuro: recusa, com um dia de folga para o relógio do aparelho', () => {
    expect(erroDaDataDeEnsaio('2026-11-20', '2026-11-06', hoje)).toBe('A data do ensaio (20/11/2026) está no futuro. Hoje é 13/11/2026.')
    expect(erroDaDataDeEnsaio('2026-11-15', '2026-11-06', hoje)).not.toBeNull()
    expect(erroDaDataDeEnsaio('2026-11-14', '2026-11-06', hoje)).toBeNull()
    expect(erroDaDataDeEnsaio('2026-11-13', '2026-11-06', hoje)).toBeNull()
  })
  it('antes da moldagem: recusa; no dia da moldagem e sem data: aceita', () => {
    expect(erroDaDataDeEnsaio('2026-11-05', '2026-11-06', hoje)).toBe('A data do ensaio (05/11/2026) é antes da moldagem (06/11/2026).')
    expect(erroDaDataDeEnsaio('2026-11-06', '2026-11-06', hoje)).toBeNull()
    expect(erroDaDataDeEnsaio(null, '2026-11-06', hoje)).toBeNull()
  })
  it('laudo com data no futuro não grava nada', () => {
    const r = planejarLaudo({ ...base, dataEnsaio: '2026-11-20', existentes: [], caixas: [{ caminhao_id: '1', numero_cp: 1, valor: 30 }] })
    expect(r.gravacoes).toEqual([])
    expect(r.erros).toEqual(['A data do ensaio (20/11/2026) está no futuro. Hoje é 14/11/2026.'])
  })
})

describe('arquivo do laudo (PDF ou foto)', () => {
  it('resultado novo leva o arquivo; sem arquivo, não leva nada', () => {
    const com = planejarLaudo({ ...base, existentes: [], caixas: [{ caminhao_id: '1', numero_cp: 1, valor: 30 }], laudoArquivoId: 'arq1' })
    expect(com.gravacoes).toEqual([
      { tipo: 'novo', campos: { caminhao_id: '1', idade_dias: 7, numero_cp: 1, resistencia_mpa: 30, data_ensaio: '2026-11-14', origem: 'manual', laudo_arquivo_id: 'arq1' } },
    ])
    const sem = planejarLaudo({ ...base, existentes: [], caixas: [{ caminhao_id: '1', numero_cp: 1, valor: 30 }] })
    expect(sem.gravacoes[0]).toEqual({ tipo: 'novo', campos: { caminhao_id: '1', idade_dias: 7, numero_cp: 1, resistencia_mpa: 30, data_ensaio: '2026-11-14', origem: 'manual' } })
  })
  it('anexar depois: resultado já lançado com o mesmo valor ganha só o arquivo', () => {
    const atual = res('1', 7, 1, 30, '2026-11-14')
    const r = planejarLaudo({ ...base, existentes: [atual], caixas: [{ caminhao_id: '1', numero_cp: 1, valor: 30 }], laudoArquivoId: 'arq1' })
    expect(r.gravacoes).toEqual([{ tipo: 'corrigir', atual, mudancas: { laudo_arquivo_id: 'arq1' } }])
  })
  it('valor mudado e arquivo novo vão na mesma correção; o mesmo arquivo de novo não grava nada', () => {
    const atual = { ...res('1', 7, 1, 30, '2026-11-14'), laudo_arquivo_id: 'arq1' }
    const mudou = planejarLaudo({ ...base, existentes: [atual], caixas: [{ caminhao_id: '1', numero_cp: 1, valor: 31 }], laudoArquivoId: 'arq2' })
    expect(mudou.gravacoes).toEqual([{ tipo: 'corrigir', atual, mudancas: { resistencia_mpa: 31, data_ensaio: '2026-11-14', origem: 'manual', laudo_arquivo_id: 'arq2' } }])
    const igual = planejarLaudo({ ...base, existentes: [atual], caixas: [{ caminhao_id: '1', numero_cp: 1, valor: 30 }], laudoArquivoId: 'arq1' })
    expect(igual.gravacoes).toEqual([])
  })
  it('laudo anexado da idade: o do resultado mais recente com arquivo, só daquela idade', () => {
    const a = { ...res('1', 7, 1, 30), laudo_arquivo_id: 'velho', criado_em_dispositivo: '2026-11-14T10:00:00Z' }
    const b = { ...res('2', 7, 1, 31), laudo_arquivo_id: 'novo', criado_em_dispositivo: '2026-11-15T10:00:00Z' }
    const c = { ...res('1', 28, 1, 40), laudo_arquivo_id: 'outra-idade', criado_em_dispositivo: '2026-12-05T10:00:00Z' }
    expect(laudoDaIdade([a, b, c], 7)).toBe('novo')
    expect(laudoDaIdade([res('1', 7, 1, 30)], 7)).toBeNull()
  })
})

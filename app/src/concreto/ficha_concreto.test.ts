import { describe, expect, it } from 'vitest'
import { fichaDoDia, linhasParaExcel, csvDoDia, diasComConcretagem, type ConcretagemDaFicha, type CaminhaoDaFicha } from './ficha_concreto'

// Horas no fuso do aparelho (o formulário grava assim: dia da concretagem + hora digitada).
const h = (hora: string) => {
  const [hh, mm] = hora.split(':').map(Number)
  return new Date(2026, 10, 3, hh, mm).toISOString()
}

const conc = (c: Partial<ConcretagemDaFicha>): ConcretagemDaFicha => ({
  raiz: 'c1',
  data: '2026-11-03',
  pavimento_id: 'pav',
  local_descricao: 'Trecho 2 · Vigas',
  codigo_construpoint: 'FIC-0215',
  fornecedor: 'Polimix',
  fck_mpa: 40,
  slump_cm: 12,
  slump_tolerancia_cm: 2,
  criado_em_dispositivo: '2026-11-03T10:00:00.000Z',
  ...c,
})

const cam = (c: Partial<CaminhaoDaFicha>): CaminhaoDaFicha => ({
  sequencia: 1,
  nota_fiscal: '1001',
  volume_m3: 8.5,
  saida_usina: h('07:10'),
  chegada_obra: h('07:40'),
  inicio_descarga: h('07:50'),
  fim_descarga: h('08:20'),
  slump_medido_cm: 12.5,
  agua_adicionada_l: null,
  cps_moldados: 4,
  observacao: null,
  ...c,
})

const obra = { codigo: 'EXE', nome: 'Obra Exemplo' }
const pavimentos = new Map([['pav', 'Pilotis']])

describe('ficha de concreto usinado do dia', () => {
  it('uma linha por caminhão, na ordem das colunas da ficha', () => {
    const f = fichaDoDia({
      obra,
      data: '2026-11-03',
      concretagens: [conc({})],
      caminhoesDe: new Map([['c1', [cam({ sequencia: 2, nota_fiscal: '1002', agua_adicionada_l: 20 }), cam({})]]]),
      pavimentos,
    })
    expect(f.cabecalho).toEqual({
      obra: 'EXE · Obra Exemplo',
      fornecedor: 'Polimix',
      data: '03/11/2026',
      fck: '40',
      brita: '',
      slump: '12 ± 2',
    })
    expect(f.linhas).toHaveLength(2)
    // caminhões em ordem de sequência
    expect(f.linhas.map((l) => l.caminhao)).toEqual([1, 2])
    const l = f.linhas[0]
    expect(l).toMatchObject({
      data: '03/11/2026',
      fck: 40,
      lacre: '',
      caminhao: 1,
      nf: '1001',
      volume: 8.5,
      ac: '',
      slump: 12.5,
      cps: 4,
      saida: '07:10',
      chegada: '07:40',
      inicio: '07:50',
      fim: '08:20',
    })
    // a primeira linha de cada concretagem identifica a concretagem
    expect(l.observacao).toBe('Pilotis · Trecho 2 · Vigas · FIC-0215')
    // água adicionada vai na observação
    expect(f.linhas[1].observacao).toBe('Água: 20 L')
    expect(f.volumeTotal).toBe(17)
    expect(f.avisos).toEqual([])
  })

  it('duas concretagens no dia: na ordem da chegada do primeiro caminhão; fck diferente vira aviso', () => {
    const f = fichaDoDia({
      obra,
      data: '2026-11-03',
      concretagens: [
        conc({ raiz: 'tarde', local_descricao: 'Trecho 3 · Pilares', fck_mpa: 35, codigo_construpoint: null, criado_em_dispositivo: '2026-11-03T09:00:00.000Z' }),
        conc({ raiz: 'manha', criado_em_dispositivo: '2026-11-03T18:00:00.000Z' }),
      ],
      caminhoesDe: new Map([
        ['tarde', [cam({ chegada_obra: h('14:00'), observacao: 'chuva' })]],
        ['manha', [cam({ chegada_obra: h('07:40') })]],
      ]),
      pavimentos,
    })
    expect(f.linhas.map((l) => l.observacao)).toEqual(['Pilotis · Trecho 2 · Vigas · FIC-0215', 'Pilotis · Trecho 3 · Pilares · chuva'])
    expect(f.linhas.map((l) => l.fck)).toEqual([40, 35])
    expect(f.cabecalho.fck).toBe('40 / 35')
    expect(f.avisos).toContain('As concretagens do dia têm fck diferente (40 e 35 MPa): confira o cabeçalho.')
  })

  it('sem horário nem caminhão não quebra', () => {
    const f = fichaDoDia({
      obra,
      data: '2026-11-03',
      concretagens: [conc({ fornecedor: null, slump_cm: null, raiz: 'vazia' })],
      caminhoesDe: new Map(),
      pavimentos: new Map(),
    })
    expect(f.linhas).toEqual([])
    expect(f.cabecalho.fornecedor).toBe('')
    expect(f.cabecalho.slump).toBe('')
    expect(f.avisos).toContain('Nenhum caminhão registrado nas concretagens deste dia.')
  })

  it('linhas para colar no Excel: só as linhas, separadas por tabulação, vírgula decimal, sem cabeçalho', () => {
    const f = fichaDoDia({ obra, data: '2026-11-03', concretagens: [conc({})], caminhoesDe: new Map([['c1', [cam({ slump_medido_cm: 12.5 })]]]), pavimentos })
    const t = linhasParaExcel(f)
    expect(t.split('\r\n')).toHaveLength(1)
    expect(t).toBe('03/11/2026\t40\t\t1\t1001\t8,5\t\t12,5\t4\t07:10\t07:40\t07:50\t08:20\tPilotis · Trecho 2 · Vigas · FIC-0215')
  })

  it('CSV tem o cabeçalho da ficha e os títulos das colunas', () => {
    const f = fichaDoDia({ obra, data: '2026-11-03', concretagens: [conc({})], caminhoesDe: new Map([['c1', [cam({})]]]), pavimentos })
    const csv = csvDoDia(f)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    const linhas = csv.replace('\uFEFF', '').trimEnd().split('\r\n')
    expect(linhas[0]).toBe('Controle de concreto usinado')
    expect(linhas).toContain('Obra;EXE · Obra Exemplo')
    expect(linhas).toContain('Data;fck;Lacre;Caminhão;NF;Volume (m³);A/C;Slump;CP;Saída central;Chegada obra;Início descarga;Fim descarga;Observação')
    expect(linhas[linhas.length - 1]).toBe('03/11/2026;40;;1;1001;8,5;;12,5;4;07:10;07:40;07:50;08:20;Pilotis · Trecho 2 · Vigas · FIC-0215')
  })

  it('CSV: célula que começa com = + - @ ou tabulação não vira fórmula no Excel', () => {
    const f = fichaDoDia({ obra, data: '2026-11-03', concretagens: [conc({})], caminhoesDe: new Map([['c1', [cam({ nota_fiscal: '\t=1+1' })]]]), pavimentos })
    const linhas = csvDoDia(f).replace('﻿', '').trimEnd().split('\r\n')
    expect(linhas[linhas.length - 1]).toContain(";'\t=1+1;")
  })

  it('concretagem de exemplo: toda linha dela sai com EXEMPLO e a ficha avisa', () => {
    const f = fichaDoDia({
      obra,
      data: '2026-11-03',
      concretagens: [conc({ exemplo: true })],
      caminhoesDe: new Map([['c1', [cam({}), cam({ sequencia: 2, nota_fiscal: '1002' })]]]),
      pavimentos,
    })
    expect(f.linhas.map((l) => l.observacao.split(' · ')[0])).toEqual(['EXEMPLO', 'EXEMPLO'])
    expect(f.avisos.some((a) => a.includes('EXEMPLO') && a.includes('não é real'))).toBe(true)
    const real = fichaDoDia({ obra, data: '2026-11-03', concretagens: [conc({})], caminhoesDe: new Map([['c1', [cam({})]]]), pavimentos })
    expect(real.linhas[0].observacao).not.toContain('EXEMPLO')
    expect(real.avisos.some((a) => a.includes('EXEMPLO'))).toBe(false)
  })

  it('dias com concretagem: mais recente primeiro, sem repetir', () => {
    const dias = diasComConcretagem([conc({ data: '2026-11-01' }), conc({ data: '2026-11-03' }), conc({ data: '2026-11-01' })])
    expect(dias).toEqual(['2026-11-03', '2026-11-01'])
  })
})

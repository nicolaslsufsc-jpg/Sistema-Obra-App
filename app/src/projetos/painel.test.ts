import { describe, expect, it } from 'vitest'
import { chaveNumero, cruzar, lerData, lerDistribuicao, lerRevisao, lerVigentes, resumir, rotuloRev } from './painel'
import { DISTRIBUICAO_EXE, VIGENTES_EXE } from './exemplo_exe'


const HOJE = '2026-11-14'

describe('leitura', () => {
  it('revisão: sem fase vale EX; "R02 LO" é LO', () => {
    expect(lerRevisao('R02')).toEqual({ numero: 2, fase: 'EX' })
    expect(lerRevisao('R02 LO')).toEqual({ numero: 2, fase: 'LO' })
    expect(lerRevisao('xx').numero).toBeNull()
    expect(rotuloRev('LO', 2)).toBe('LO R02')
    expect(rotuloRev('EX', 0)).toBe('R00')
  })
  it('número sem zeros da frente', () => {
    expect(chaveNumero('004')).toBe('4')
    expect(chaveNumero('4')).toBe('4')
    expect(chaveNumero('de001')).toBe('DE001')
  })
  it('data: ano com 3 dígitos não vira data', () => {
    expect(lerData('2026-10-15')).toBe('2026-10-15')
    expect(lerData('22/10/2026')).toBe('2026-10-22')
    expect(lerData('12/10/202')).toBeNull()
  })
  it('ignora o cabeçalho repetido e lê as duas planilhas', () => {
    expect(lerVigentes(VIGENTES_EXE)).toHaveLength(6)
    const c = lerDistribuicao('﻿' + DISTRIBUICAO_EXE)
    expect(c).toHaveLength(12)
    expect(c.find((x) => x.linha === 5)!.codigo).toBe('4')
  })
  it('arquivo sem as colunas é recusado com o nome do que falta', () => {
    expect(() => lerDistribuicao('a;b\n1;2')).toThrow(/não tem as colunas: codigo/)
    expect(() => lerVigentes('')).toThrow(/vazio/)
  })
})

describe('cruzamento (regras de 14/11/2026)', () => {
  const x = cruzar(lerDistribuicao(DISTRIBUICAO_EXE), lerVigentes(VIGENTES_EXE), HOJE)
  const por = (linha: number) => x.find((y) => y.copia.linha === linha)!

  it('revisão menor que a vigente: desatualizada, dias desde a data da vigente', () => {
    expect(por(1)).toMatchObject({ resultado: 'desatualizada', dias: 23 })
    expect(por(2).resultado).toBe('em dia')
  })
  it('a LO tem revisão própria: EX com o mesmo número entregue antes da LO é desatualizada', () => {
    expect(por(3)).toMatchObject({ resultado: 'desatualizada', loDepois: true, dias: 13 })
    expect(por(4).resultado).toBe('em dia')
  })
  it('mesma empresa com 2 cópias em campo: fica a mais nova, a outra é provavelmente recolhida', () => {
    expect(por(5).situacao).toBe('em campo')
    expect(por(6).situacao).toBe('recolhida')
  })
  it('conferir: revisão maior, não achada, LO bem posterior, data com erro', () => {
    expect(por(7)).toMatchObject({ resultado: 'conferir', motivo: 'revisão maior' })
    expect(por(8)).toMatchObject({ resultado: 'conferir', motivo: 'não achada' })
    expect(por(10)).toMatchObject({ resultado: 'conferir', motivo: 'datas' })
    expect(por(11)).toMatchObject({ resultado: 'conferir', motivo: 'data de entrega' })
  })
  it('número com duas folhas: escolhe pelo título (a nota entre parênteses não conta)', () => {
    expect(por(9).vigente?.titulo).toMatch(/^SUBSOLO/)
    expect(por(9).resultado).toBe('desatualizada')
  })
  it('devolvida não entra no painel', () => {
    expect(por(12).situacao).toBe('devolvida')
  })
  it('resumo: números, faixas e barras', () => {
    const r = resumir(x)
    expect(r.emCampo).toBe(10)
    expect(r.emDia).toBe(2)
    expect(r.desatualizadas.map((y) => y.copia.linha)).toEqual([9, 1, 3, 5])
    expect(r.conferir).toHaveLength(4)
    expect(r.recolhidas).toBe(1)
    expect(r.faixas).toEqual([2, 1, 1, 0])
    expect(r.porEmpresa[0]).toMatchObject({ nome: 'Empreiteira Alfa', quantas: 3 })
    expect(r.porDisciplina.map((b) => b.nome)).toContain('ARQUITETÔNICO')
  })
})

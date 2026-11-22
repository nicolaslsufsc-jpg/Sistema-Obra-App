import { describe, expect, it } from 'vitest'
import { motivoDaTroca, situacaoPor, chaveNumero, cruzar, lerData, lerDistribuicao, lerRevisao, lerVigentes, resumir, rotuloRev } from './painel'
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
  it('mesma pessoa com 2 cópias em campo: fica a mais nova, a outra é provavelmente recolhida', () => {
    expect(por(5).situacao).toBe('em campo')
    expect(por(6).situacao).toBe('recolhida')
  })
  it('a regra vale por pessoa: cada pessoa da empresa fica com a cópia dela, nova ou antiga', () => {
    // Formas Delta já tem a 101 LO R02 (linha 2, Ana). Entram mais três da mesma vigente no mesmo dia.
    const extra = [
      '20;101;R02 LO;FORMAS DO PILOTIS;ESTRUTURAL;1;2026-11-14;Formas Delta;Bruno;', // outra pessoa: em campo
      '21;101;R02 LO;FORMAS DO PILOTIS;ESTRUTURAL;1;2026-11-14;Formas Delta;Ana;', // a mesma Ana de novo: só uma fica
      '22;101;R01 LO;FORMAS DO PILOTIS;ESTRUTURAL;1;2026-11-14;Formas Delta;Caio;', // revisão antiga de outra pessoa: em campo, a recolher
    ]
    const y = cruzar(lerDistribuicao([DISTRIBUICAO_EXE, ...extra].join(String.fromCharCode(10))), lerVigentes(VIGENTES_EXE), '2026-11-14')
    const s = (linha: number) => y.find((z) => z.copia.linha === linha)!
    expect(s(20)).toMatchObject({ situacao: 'em campo', resultado: 'em dia' })
    expect([s(2).situacao, s(21).situacao].sort()).toEqual(['em campo', 'recolhida'])
    expect(s(22)).toMatchObject({ situacao: 'em campo', resultado: 'desatualizada' })
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

describe('quadro de situação (topo do painel)', () => {
  const x = cruzar(lerDistribuicao(DISTRIBUICAO_EXE), lerVigentes(VIGENTES_EXE), '2026-11-14')
  it('por disciplina: só cópias em campo; a soma bate com o resumo; quem tem mais a trocar vem primeiro', () => {
    const d = situacaoPor(x, (y) => y.copia.disciplinaNome || y.copia.disciplina)
    const r = resumir(x)
    const soma = (k: 'emDia' | 'trocar' | 'conferir' | 'total') => d.reduce((s, l) => s + l[k], 0)
    expect([soma('total'), soma('emDia'), soma('trocar'), soma('conferir')]).toEqual([r.emCampo, r.emDia, r.desatualizadas.length, r.conferir.length])
    expect(d.every((l) => l.total === l.emDia + l.trocar + l.conferir)).toBe(true)
    expect(d.map((l) => l.trocar)).toEqual([...d.map((l) => l.trocar)].sort((a, b) => b - a))
  })
  it('o motivo da troca em cada linha: "saiu a LO" ou "revisão nova" (a LO é uma contagem nova)', () => {
    const por = (linha: number) => motivoDaTroca(x.find((y) => y.copia.linha === linha)!)
    expect(por(1)).toBe('revisão nova') // R01 LO, vigente LO R02
    expect(por(3)).toBe('saiu a LO') // EX R00 entregue antes da LO R00
    expect(por(2)).toBeNull() // em dia
    expect(por(7)).toBeNull() // conferir
    expect(por(12)).toBeNull() // devolvida
    expect(motivoDaTroca({ situacao: 'em campo', resultado: 'desatualizada', foraDeUso: true })).toBe('prancha fora de uso')
    // as duas parcelas somam as desatualizadas em campo: a regra 1 continua contando as duas
    const des = x.filter((y) => y.situacao === 'em campo' && y.resultado === 'desatualizada')
    expect(des.filter((y) => motivoDaTroca(y) === 'saiu a LO').length + des.filter((y) => motivoDaTroca(y) === 'revisão nova').length).toBe(des.length)
  })
  it('por pessoa: cada pessoa com o que tem a trocar', () => {
    const p = situacaoPor(x, (y) => `${y.copia.empresa} · ${y.copia.colaborador}`)
    expect(p.find((l) => l.nome === 'Empreiteira Alfa · João')).toMatchObject({ trocar: 1 })
    expect(p.find((l) => l.nome === 'Formas Delta · Ana')).toMatchObject({ trocar: 0, emDia: 2 })
  })
})

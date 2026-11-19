import { describe, expect, it } from 'vitest'
import { avisosDeHorario, mensagemDeFalha } from './horarios'

describe('avisosDeHorario', () => {
  it('em ordem: nenhum aviso', () => {
    expect(avisosDeHorario({ saida: '07:10', chegada: '07:45', inicio: '07:50', fim: '08:20' })).toEqual([])
  })
  it('chegada antes da saída da usina', () => {
    expect(avisosDeHorario({ saida: '08:00', chegada: '07:45', inicio: '', fim: '' })).toEqual(['Chegada na obra (07:45) antes da saída da usina (08:00). Confira.'])
  })
  it('início antes da chegada', () => {
    expect(avisosDeHorario({ saida: '', chegada: '08:00', inicio: '07:55', fim: '08:30' })).toEqual(['Início da descarga (07:55) antes da chegada na obra (08:00). Confira.'])
  })
  it('fim antes do início', () => {
    expect(avisosDeHorario({ saida: '', chegada: '', inicio: '09:00', fim: '08:30' })).toEqual(['Fim da descarga (08:30) antes do início da descarga (09:00). Confira.'])
  })
  it('campo vazio no meio: compara com o anterior preenchido', () => {
    expect(avisosDeHorario({ saida: '09:00', chegada: '', inicio: '08:00', fim: '' })).toHaveLength(1)
  })
  it('tudo vazio: nenhum aviso', () => {
    expect(avisosDeHorario({ saida: '', chegada: '', inicio: '', fim: '' })).toEqual([])
  })
})

describe('mensagemDeFalha', () => {
  it('com motivo', () => {
    expect(mensagemDeFalha(new Error('disco cheio'))).toBe('Não salvou: disco cheio. Confira e tente de novo.')
  })
  it('sem motivo', () => {
    expect(mensagemDeFalha(undefined)).toBe('Não salvou. Confira e tente de novo.')
  })
})

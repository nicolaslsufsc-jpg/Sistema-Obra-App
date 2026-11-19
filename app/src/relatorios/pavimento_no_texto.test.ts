import { describe, expect, it } from 'vitest'
import { pavimentoNoTexto } from './regras'

const PAVS = [
  { id: 'terreo', nome: 'Térreo', ordem: 1 },
  { id: 'p2', nome: '2º Pavimento', ordem: 2 },
  { id: 'p12', nome: '12º Pavimento', ordem: 12 },
  { id: 'cob', nome: 'Cobertura', ordem: 13 },
]

describe('pavimento citado no texto do serviço (abre a planta nele)', () => {
  it('acha pelo nome, sem acento nem maiúscula, e pelo número com "pav"', () => {
    expect(pavimentoNoTexto('Armação de pilares do 2º pavimento', PAVS)).toBe('p2')
    expect(pavimentoNoTexto('fôrma da laje 2o pav', PAVS)).toBe('p2')
    expect(pavimentoNoTexto('Limpeza do TERREO', PAVS)).toBe('terreo')
    expect(pavimentoNoTexto('impermeabilização na cobertura', PAVS)).toBe('cob')
  })
  it('12º não vira 2º; texto sem pavimento dá null', () => {
    expect(pavimentoNoTexto('Concretagem do 12º pavimento', PAVS)).toBe('p12')
    expect(pavimentoNoTexto('Recebimento de aço', PAVS)).toBeNull()
    expect(pavimentoNoTexto('caminhão 2 chegou', PAVS)).toBeNull()
  })
})

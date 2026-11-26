// Entregas agrupadas (aba Entregas, 23/11/2026). Obra fictícia EXE.
import { describe, expect, it } from 'vitest'
import type { Linha } from '../nucleo/banco_local'
import { chaveDaEntrega, entregasDaObra, eventosDaEntrega, filtrarEntregas, pessoasDaEmpresa } from './entregas'

let n = 0
const ev = (x: Record<string, unknown>) => ({ id: `e${++n}`, tipo: 'entrega', empresa_id: 'alfa', apagado: false, ...x }) as unknown as Linha
const empresaPorId = new Map([
  ['alfa', { id: 'alfa', nome: 'Empreiteira Alfa' }],
  ['beta', { id: 'beta', nome: 'Hidráulica Beta' }],
]) as never

describe('entregas agrupadas', () => {
  const assinada = [1, 2, 3].map((i) =>
    ev({ documento_id: `d${i}`, assinatura_id: 'ass1', colaborador: 'André', data_evento: '2026-11-23', criado_em_dispositivo: `2026-11-23T14:0${i}:00Z` }),
  )
  // duas cópias da mesma prancha na mesma entrega
  assinada.push(ev({ documento_id: 'd1', assinatura_id: 'ass1', colaborador: 'André', data_evento: '2026-11-23', criado_em_dispositivo: '2026-11-23T14:04:00Z' }))
  // carga da ficha: sem assinatura, mesmo dia e pessoa = uma entrega; "joão" e "João" são a mesma pessoa
  const ficha = [
    ev({ documento_id: 'd1', colaborador: 'João', data_evento: '2026-11-10', criado_em_dispositivo: '2026-11-22T09:00:00Z' }),
    ev({ documento_id: 'd2', colaborador: 'joão ', data_evento: '2026-11-10', criado_em_dispositivo: '2026-11-22T09:00:01Z' }),
    ev({ documento_id: 'd3', colaborador: 'João', data_evento: '2026-11-12', criado_em_dispositivo: '2026-11-22T09:00:02Z' }),
    ev({ documento_id: 'd4', colaborador: 'Maria', empresa_id: 'beta', data_evento: '2026-11-12', criado_em_dispositivo: '2026-11-22T09:00:03Z' }),
  ]
  const apagada = ev({ documento_id: 'd9', colaborador: 'X', data_evento: '2026-11-23', apagado: true })
  const devolucao = { id: 'dev1', tipo: 'devolucao', entrega_id: ficha[0].id, apagado: false } as unknown as Linha
  const d = { eventos: [...ficha, ...assinada, apagada, devolucao], empresaPorId }

  it('uma linha por assinatura; sem assinatura, por empresa + pessoa + dia; a mais nova primeiro', () => {
    const l = entregasDaObra(d)
    expect(l.map((x) => [x.colaborador, x.dia, x.pranchas, x.copias, !!x.assinaturaId])).toEqual([
      ['André', '2026-11-23', 3, 4, true],
      // mesmo dia: a registrada por último primeiro
      ['Maria', '2026-11-12', 1, 1, false],
      ['João', '2026-11-12', 1, 1, false],
      ['João', '2026-11-10', 2, 2, false],
    ])
    expect(l[0].quando).toBe('2026-11-23T14:01:00Z')
    expect(l[0].empresa).toBe('Empreiteira Alfa')
    expect(l[3].devolvidas).toBe(1)
  })

  it('a chave abre os registros da entrega (o comprovante)', () => {
    const l = entregasDaObra(d)
    expect(l[0].chave).toBe('a:ass1')
    expect(eventosDaEntrega(d, l[0].chave).map((e) => e.documento_id)).toEqual(['d1', 'd2', 'd3', 'd1'])
    expect(eventosDaEntrega(d, l[3].chave)).toHaveLength(2)
    expect(chaveDaEntrega(ficha[0])).toBe(chaveDaEntrega(ficha[1]))
  })

  it('busca por pessoa ou empresa (sem acento), período e assinatura', () => {
    const l = entregasDaObra(d)
    expect(filtrarEntregas(l, { busca: 'andre' }).map((x) => x.colaborador)).toEqual(['André'])
    expect(filtrarEntregas(l, { busca: 'hidraulica' }).map((x) => x.colaborador)).toEqual(['Maria'])
    expect(filtrarEntregas(l, { de: '2026-11-11', ate: '2026-11-12' })).toHaveLength(2)
    expect(filtrarEntregas(l, { assinatura: 'assinadas' })).toHaveLength(1)
    expect(filtrarEntregas(l, { assinatura: 'sem' })).toHaveLength(3)
  })

  it('pessoas da empresa: quem recebeu, cópias ainda em campo e a última entrega', () => {
    expect(pessoasDaEmpresa(d, 'alfa')).toEqual([
      { colaborador: 'André', emCampo: 4, ultimaEntrega: '2026-11-23' },
      { colaborador: 'João', emCampo: 2, ultimaEntrega: '2026-11-12' },
    ])
    expect(pessoasDaEmpresa(d, 'gama')).toEqual([])
  })
})

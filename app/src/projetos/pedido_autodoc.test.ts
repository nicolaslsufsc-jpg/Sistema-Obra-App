import { describe, expect, it } from 'vitest'
import { textoDoPedido, type PedidoAtualizacao } from './pedido_autodoc'

const AGORA = new Date('2026-11-21T15:00:00')
const ha = (min: number) => new Date(AGORA.getTime() - min * 60_000).toISOString()
const p = (x: Partial<PedidoAtualizacao>): PedidoAtualizacao => ({ id: 'p', estado: 'pendente', criado_em: ha(1), iniciado_em: null, concluido_em: null, resumo: null, erro: null, ...x })

describe('pedido de atualização do Autodoc', () => {
  it('sem pedido: nada a mostrar', () => expect(textoDoPedido(null, AGORA)).toBeNull())

  it('pendente: esperando o PC; passou de 15 min: o PC não respondeu', () => {
    expect(textoDoPedido(p({ criado_em: ha(2) }), AGORA)).toMatchObject({ tipo: 'aberto', podePedir: false, texto: 'Pedido às 14:58. Esperando o PC do escritório (ele confere a cada 5 min).' })
    expect(textoDoPedido(p({ criado_em: ha(16) }), AGORA)).toMatchObject({ tipo: 'parado', podePedir: false })
    expect(textoDoPedido(p({ criado_em: ha(16) }), AGORA)!.texto).toContain('O PC do escritório não respondeu')
  })

  it('buscando; passou de 30 min: interrompido, pode pedir de novo', () => {
    expect(textoDoPedido(p({ estado: 'buscando', iniciado_em: ha(5) }), AGORA)).toMatchObject({ tipo: 'aberto', texto: 'Buscando no Autodoc desde 14:55…' })
    expect(textoDoPedido(p({ estado: 'buscando', iniciado_em: ha(31) }), AGORA)).toMatchObject({ tipo: 'erro', podePedir: true })
  })

  it('pronto: novas, baixadas e as que falharam, com o código', () => {
    const t = textoDoPedido(p({ estado: 'pronto', iniciado_em: ha(4), concluido_em: ha(1), resumo: { revisoes_novas: 1, baixadas: 0, falharam: [{ codigo: 'EXE.ES.EX.200.PILSUBSOLO-R00', motivo: 'Em Análise' }] } }), AGORA)!
    expect(t.texto).toBe('Pronto hoje às 14:59: 1 revisão nova, 0 baixadas, 1 falhou.')
    expect(t.falharam.map((f) => f.codigo)).toEqual(['EXE.ES.EX.200.PILSUBSOLO-R00'])
    expect(t.podePedir).toBe(true)
  })

  it('pronto sem revisão nova: diz que conferiu, quando, e que não há nada novo', () => {
    const sem = (min: number) => textoDoPedido(p({ estado: 'pronto', iniciado_em: ha(min + 1), concluido_em: ha(min), resumo: { revisoes_novas: 0, baixadas: 0, falharam: [] } }), AGORA)!
    expect(sem(1)).toMatchObject({ tipo: 'pronto', podePedir: true, texto: 'Conferido hoje às 14:59: o Autodoc não tem revisão nova. A lista do app está igual à do Autodoc.' })
    expect(sem(24 * 60).texto).toContain('Conferido ontem às 15:00')
    expect(sem(3 * 24 * 60).texto).toContain('Conferido em 18/11 às 15:00')
  })

  it('erro: mostra o motivo que o PC mandou', () => {
    expect(textoDoPedido(p({ estado: 'erro', iniciado_em: ha(4), concluido_em: ha(3), erro: 'login do Autodoc vencido: entre no PC' }), AGORA)!.texto).toBe('Não atualizou (14:57): login do Autodoc vencido: entre no PC')
  })
})

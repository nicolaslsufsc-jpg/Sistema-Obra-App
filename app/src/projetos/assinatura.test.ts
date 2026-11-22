import { describe, expect, it } from 'vitest'
import { dataHoraDe, entregaDaAssinatura, folhaDoComprovante } from './assinatura'

const ev = (id: string, doc: string, assinatura: string | null, tipo = 'entrega') =>
  ({ id, tipo, documento_id: doc, revisao_id: `r${doc}`, empresa_id: 'e1', colaborador: 'João', data_evento: '2026-11-21', criado_em_dispositivo: '2026-11-21T14:37:00', assinatura_id: assinatura, apagado: false }) as never

describe('entrega com assinatura', () => {
  const eventos = [ev('1', 'd1', 'a1'), ev('2', 'd2', 'a1'), ev('3', 'd3', null), ev('4', 'd1', 'a1', 'devolucao'), ev('5', 'd4', 'a2')]

  it('uma assinatura junta as pranchas da mesma entrega (só entregas)', () => {
    expect(entregaDaAssinatura({ eventos }, 'a1').map((e: { id: string }) => e.id)).toEqual(['1', '2'])
    expect(entregaDaAssinatura({ eventos }, 'nenhuma')).toEqual([])
  })

  it('data e hora no formato dd/mm/aaaa hh:mm', () => {
    expect(dataHoraDe('2026-11-21T14:37:00')).toBe('21/11/2026 14:37')
    expect(dataHoraDe(null)).toBe('')
  })

  it('o comprovante lista as pranchas, quem retirou, a hora e a assinatura', () => {
    const d = {
      documentoPorId: new Map([
        ['d1', { codigo: 'EXE.ES.100.FORPILOTIS', titulo: 'FORMAS DO PILOTIS' }],
        ['d2', { codigo: 'EXE.ES.200.PILSUBSOLO', titulo: 'PILARES' }],
      ]),
      revisaoPorId: new Map([
        ['rd1', { fase: 'LO', numero: '02' }],
        ['rd2', { fase: 'EX', numero: '00' }],
      ]),
      empresaPorId: new Map([['e1', { nome: 'Empreiteira Alfa' }]]),
    } as never
    const f = folhaDoComprovante(d, entregaDaAssinatura({ eventos }, 'a1'), 'data:image/png;base64,AAA')
    expect(f.sub).toBe('Retirado por João · Empreiteira Alfa · 21/11/2026 14:37')
    expect(f.tabelas[0].linhas).toEqual([
      ['EXE.ES.100.FORPILOTIS', 'FORMAS DO PILOTIS', 'LO R02', '21/11/2026'],
      ['EXE.ES.200.PILSUBSOLO', 'PILARES', 'EX R00', '21/11/2026'],
    ])
    expect(f.imagens?.[0].src).toBe('data:image/png;base64,AAA')
    // sem a imagem (sem internet): linha em branco para assinar à mão no papel
    expect(folhaDoComprovante(d, entregaDaAssinatura({ eventos }, 'a1'), null).imagens?.[0].src).toBe('')
  })
})

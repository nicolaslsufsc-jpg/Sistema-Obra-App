import { describe, expect, it } from 'vitest'
import { buscar, contarPorOrigem, juntar, type ItemDaBusca } from './busca'
import { noPeriodo, textoDoPeriodo, versaoPcAtiva } from './versao_pc'

const item = (o: Partial<ItemDaBusca> & Pick<ItemDaBusca, 'chave' | 'origem'>): ItemDaBusca => ({ codigo: '', titulo: '', grupo: '', revisao: '', data: '', ...o })

describe('versão PC', () => {
  it('só liga em tela de PC e quando a pessoa escolheu', () => {
    expect(versaoPcAtiva(true, 'ligada')).toBe(true)
    expect(versaoPcAtiva(true, null)).toBe(false)
    expect(versaoPcAtiva(true, 'desligada')).toBe(false)
    // celular, tablet de toque ou janela estreita: nunca, mesmo ligada
    expect(versaoPcAtiva(false, 'ligada')).toBe(false)
  })

  it('período: pontas valem, ponta vazia não limita, data ruim só passa sem período', () => {
    expect(noPeriodo('2026-11-10', '2026-11-01', '2026-11-10')).toBe(true)
    expect(noPeriodo('2026-11-10T14:00:00Z', '2026-11-11', '')).toBe(false)
    expect(noPeriodo('2026-11-10', '', '2026-11-09')).toBe(false)
    expect(noPeriodo(null, '', '')).toBe(true)
    expect(noPeriodo(null, '2026-11-01', '')).toBe(false)
    expect(textoDoPeriodo('2026-11-01', '2026-11-23')).toBe('de 01/11/2026 a 23/11/2026')
    expect(textoDoPeriodo('', '')).toBe('todo o período')
  })
})

describe('busca única', () => {
  const lista = juntar(
    [item({ chave: 'a', origem: 'projetos', codigo: 'EXE-ES-001', titulo: 'Fôrma do térreo', grupo: 'Estrutura' })],
    [
      item({ chave: 'b', origem: 'projetos', codigo: 'exe-es-001', titulo: 'repetida na base' }),
      item({ chave: 'c', origem: 'documentos', codigo: 'PO-01', titulo: 'Procedimento de concretagem' }),
      item({ chave: 'd', origem: 'fvs', codigo: 'EXE-ES-002', titulo: 'Planta de fôrma', grupo: '1º Pavimento' }),
    ],
  )

  it('prancha com o mesmo código entra uma vez', () => {
    expect(lista.map((i) => i.chave)).toEqual(['a', 'c', 'd'])
  })

  it('todas as palavras, sem acento, em qualquer campo', () => {
    expect(buscar(lista, 'forma terreo').map((i) => i.chave)).toEqual(['a'])
    expect(buscar(lista, 'FÔRMA').map((i) => i.chave)).toEqual(['a', 'd'])
    expect(buscar(lista, 'pavimento forma').map((i) => i.chave)).toEqual(['d'])
    expect(buscar(lista, '').length).toBe(3)
  })

  it('filtra pela origem e conta cada uma', () => {
    expect(buscar(lista, 'exe', 'fvs').map((i) => i.chave)).toEqual(['d'])
    expect(contarPorOrigem(lista)).toEqual({ projetos: 1, documentos: 1, fvs: 1 })
  })
})

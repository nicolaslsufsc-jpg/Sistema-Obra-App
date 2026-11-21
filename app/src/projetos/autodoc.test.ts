import { describe, expect, it } from 'vitest'
import { faixaAutodoc, type EstadoAutodoc } from './autodoc'

const agora = new Date('2026-11-21T15:00:00')
const estado = (publicadaEm: string, extra: Partial<NonNullable<EstadoAutodoc['ultima']>> = {}): EstadoAutodoc => ({
  conferidoEm: agora.toISOString(),
  ultima: {
    dataLista: '2026-11-21',
    publicadaEm,
    quem: 'Ana Exemplo',
    revisoesNovas: 0,
    documentosNovos: 0,
    resultado: '',
    ...extra,
  },
})

describe('faixa da última atualização do Autodoc', () => {
  it('em dia: data, hora e quem rodou; sem novidade', () => {
    const f = faixaAutodoc(estado(new Date('2026-11-21T08:40:00').toISOString()), agora)
    expect(f.tipo).toBe('ok')
    expect(f.titulo).toBe('Última atualização do Autodoc: 21/11/2026 08:40, por Ana Exemplo')
    expect(f.detalhe).toBe('sem revisão nova')
  })

  it('em dia com novidades: conta revisões e documentos novos', () => {
    const f = faixaAutodoc(estado(new Date('2026-11-21T08:40:00').toISOString(), { revisoesNovas: 3, documentosNovos: 1 }), agora)
    expect(f.detalhe).toBe('3 revisões novas · 1 documento novo')
  })

  it('mais de 1 dia: pede para rodar o atalho no PC', () => {
    const f = faixaAutodoc(estado(new Date('2026-11-20T14:59:00').toISOString(), { revisoesNovas: 2 }), agora)
    expect(f.tipo).toBe('atrasada')
    expect(f.detalhe).toBe('Mais de 1 dia sem atualizar. Rode o atalho "Atualizar projetos do Autodoc" no PC.')
  })

  it('exatamente 1 dia ainda vale', () => {
    expect(faixaAutodoc(estado(new Date('2026-11-20T15:00:00').toISOString()), agora).tipo).toBe('ok')
  })

  it('obra sem nenhuma lista publicada', () => {
    const f = faixaAutodoc({ ultima: null, conferidoEm: agora.toISOString() }, agora)
    expect(f.tipo).toBe('nunca')
    expect(f.detalhe).toContain('Atualizar projetos do Autodoc')
  })

  it('nunca consultou o servidor (sem internet desde a instalação)', () => {
    expect(faixaAutodoc(null, agora).tipo).toBe('sem-dados')
  })
})

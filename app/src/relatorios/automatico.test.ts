// Diário automático (26/11/2026): o bloco "O que o app registrou hoje". Dados fictícios da obra EXE.
import { describe, expect, it } from 'vitest'
import type { Linha } from '../nucleo/banco_local'
import { fraseDaConcretagem, fraseDaFvs, lista, montarAutomatico, noPavimento, type EntradasDoAutomatico } from './automatico'

const DIA = '2026-11-13'
let seq = 0
const linha = (campos: Record<string, unknown>, hora = '10:00', id?: string): Linha =>
  ({ id: id ?? `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, obra_id: 'o', usuario_id: 'u1', dispositivo_id: 'd', criado_em_dispositivo: `${DIA}T${hora}:00.000-03:00`, apagado: false, ...campos }) as Linha
const ev = (local: Record<string, unknown>, ficha: string, item: number, resultado: string | null, hora = '10:00', extra: Record<string, unknown> = {}) =>
  linha({ ficha_id: ficha, item, rodada: 1, resultado, ...local, ...extra }, hora)

const base = (): EntradasDoAutomatico => ({
  data: DIA,
  eventos: [],
  fichas: [linha({ codigo: 'EXE-PVS-01', titulo: 'Pilares' }, '08:00', 'f1'), linha({ codigo: 'EXE-PVS-09', titulo: 'Laje' }, '08:00', 'f2')],
  elementos: [linha({ pavimento_id: 'pv3', tipo: 'P', nome: 'P1' }, '08:00', 'P1'), linha({ pavimento_id: 'pv3', tipo: 'P', nome: 'P2' }, '08:00', 'P2'), linha({ pavimento_id: 'pv4', tipo: 'P', nome: 'P1' }, '08:00', 'Q1'), linha({ pavimento_id: 'pv3', tipo: 'L', nome: 'L1' }, '08:00', 'L1')],
  areas: [linha({ area_id: 'A1', pavimento_id: 'pv4', nome: 'Laje 1' }, '08:00', 'A1')],
  plantas: [linha({ pavimento_id: 'pv4' }, '08:00', 'pl4')],
  pavimentos: [linha({ nome: '3º Pavimento', ordem: 3 }, '08:00', 'pv3'), linha({ nome: 'Cobertura', ordem: 4 }, '08:00', 'pv4')],
  concretagens: [],
  caminhoes: [],
  caminhaoElementos: [],
  nomes: { u2: 'Pessoa Dois' },
})

describe('Diário automático: FVS do dia', () => {
  it('uma frase por ficha e pavimento, com locais, itens e quem marcou', () => {
    const x = base()
    x.eventos = [
      ev({ elemento_id: 'P1' }, 'f1', 1, 'C'),
      ev({ elemento_id: 'P1' }, 'f1', 2, 'C'),
      ev({ elemento_id: 'P1' }, 'f1', 3, 'NC'),
      ev({ elemento_id: 'P2' }, 'f1', 1, 'C', '10:05', { usuario_id: 'u2' }),
      ev({ elemento_id: 'P2' }, 'f1', 2, 'NA', '10:05', { usuario_id: 'u2' }),
      ev({ elemento_id: 'Q1' }, 'f1', 1, 'C', '11:00', { verificado_por: 'Pessoa Um' }),
      // área de laje (area_id), ponto de instalação (barra_id + planta_id): o pavimento vem da área e da planta
      ev({ area_id: 'A1' }, 'f2', 4, 'C', '11:10', { verificado_por: 'Pessoa Um' }),
      ev({ barra_id: 'pt-1', planta_id: 'pl4' }, 'f2', 8, 'C', '11:20', { verificado_por: 'Pessoa Um' }),
      // outro dia: fora
      { ...ev({ elemento_id: 'P1' }, 'f1', 9, 'C'), criado_em_dispositivo: '2026-11-12T10:00:00.000-03:00' },
    ]
    const r = montarAutomatico(x)
    expect(r.fvs).toEqual([
      { ficha: 'EXE-PVS-01 · Pilares', pavimento: '3º Pavimento', locais: 2, conformes: 3, naoConformes: 1, naoAplica: 1, quem: ['Pessoa Dois'], semNome: 1 },
      { ficha: 'EXE-PVS-01 · Pilares', pavimento: 'Cobertura', locais: 1, conformes: 1, naoConformes: 0, naoAplica: 0, quem: ['Pessoa Um'], semNome: 0 },
      { ficha: 'EXE-PVS-09 · Laje', pavimento: 'Cobertura', locais: 2, conformes: 2, naoConformes: 0, naoAplica: 0, quem: ['Pessoa Um'], semNome: 0 },
    ])
    expect(r.total).toEqual({ locais: 5, conformes: 6, naoConformes: 1, naoAplica: 1 })
    expect(r.frases[0]).toBe('Foi realizada a verificação da ficha EXE-PVS-01 · Pilares no 3º Pavimento, em 2 locais: 3 itens conformes, 1 não conforme e 1 não se aplica. Marcado por Pessoa Dois e 1 outra pessoa.')
    expect(r.frases[1]).toBe('Foi realizada a verificação da ficha EXE-PVS-01 · Pilares na Cobertura, em 1 local: 1 item conforme. Marcado por Pessoa Um.')
  })

  it('vale o último registro do item no dia; desmarcado não conta; a descrição do NC não conta outro NC', () => {
    const x = base()
    x.eventos = [
      ev({ elemento_id: 'P1' }, 'f1', 1, 'C', '10:00'),
      ev({ elemento_id: 'P1' }, 'f1', 1, 'NC', '10:01'),
      ev({ elemento_id: 'P1' }, 'f1', 1, 'NC', '10:02', { observacao: 'Espaçador faltando' }),
      ev({ elemento_id: 'P1' }, 'f1', 2, 'C', '10:03'),
      ev({ elemento_id: 'P1' }, 'f1', 2, null, '10:04'),
    ]
    const r = montarAutomatico(x)
    expect(r.fvs).toHaveLength(1)
    expect([r.fvs[0].conformes, r.fvs[0].naoConformes, r.fvs[0].locais]).toEqual([0, 1, 1])
    // tudo desmarcado: nada no bloco
    x.eventos = [ev({ elemento_id: 'P1' }, 'f1', 2, 'C', '10:03'), ev({ elemento_id: 'P1' }, 'f1', 2, null, '10:04')]
    expect(montarAutomatico(x).frases).toEqual([])
  })

  it('dia fechado: só o que foi feito até a hora do fechamento; o resto é contado à parte', () => {
    const x = base()
    x.eventos = [ev({ elemento_id: 'P1' }, 'f1', 1, 'C', '10:00'), ev({ elemento_id: 'P1' }, 'f1', 2, 'C', '17:30'), ev({ elemento_id: 'P2' }, 'f1', 1, 'NC', '18:00')]
    x.ate = `${DIA}T17:00:00.000-03:00`
    const r = montarAutomatico(x)
    expect([r.fvs[0].conformes, r.fvs[0].naoConformes, r.fvs[0].locais, r.depois]).toEqual([1, 0, 1, 2])
    // reaberto (sem a hora): volta a contar tudo
    expect(montarAutomatico({ ...x, ate: null }).total).toEqual({ locais: 2, conformes: 2, naoConformes: 1, naoAplica: 0 })
  })

  it('registros antigos (A e R), ficha que não está no aparelho e local sem pavimento', () => {
    const x = base()
    x.eventos = [ev({ elemento_id: 'P1' }, 'f1', 1, 'A'), ev({ elemento_id: 'P1' }, 'f1', 2, 'R'), ev({ local_id: 'loc-9' }, 'f-fora', 1, 'C')]
    const r = montarAutomatico(x)
    expect(r.frases).toEqual([
      'Foi realizada a verificação da ficha ficha sem nome, em 1 local: 1 item conforme. Marcado por 1 pessoa.',
      'Foi realizada a verificação da ficha EXE-PVS-01 · Pilares no 3º Pavimento, em 1 local: 1 item conforme e 1 não conforme. Marcado por 1 pessoa.',
    ])
  })
})

describe('Diário automático: concretagens do dia', () => {
  const conc = (campos: Record<string, unknown>, id: string, hora = '09:00') => linha({ data: DIA, pavimento_id: 'pv3', local_descricao: '', fornecedor: null, fck_mpa: 30, substitui_id: null, cancelado: false, ...campos }, hora, id)
  const cam = (concretagem: string, volume: number | null, id: string, extra: Record<string, unknown> = {}) => linha({ concretagem_id: concretagem, volume_m3: volume, substitui_id: null, cancelado: false, ...extra }, '09:30', id)

  it('caminhões, volume, fck, fornecedor e o local por escrito', () => {
    const x = base()
    x.concretagens = [conc({ local_descricao: 'laje L1', fornecedor: 'Concreteira Exemplo' }, 'c1')]
    x.caminhoes = [cam('c1', 8, 'k1'), cam('c1', 7.5, 'k2'), cam('c1', 8, 'k3')]
    const r = montarAutomatico(x)
    expect(r.concretagens).toEqual([{ raiz: 'c1', local: 'laje L1', pavimento: '3º Pavimento', fornecedor: 'Concreteira Exemplo', caminhoes: 3, volume: 23.5, fck: 30 }])
    expect(r.frases).toEqual(['Foi realizada a concretagem de laje L1 no 3º Pavimento, com 3 caminhões e 23,5 m³ de concreto fck 30 MPa (Concreteira Exemplo).'])
  })

  it('sem local por escrito: as peças marcadas nos caminhões; correção e cancelamento valem', () => {
    const x = base()
    x.concretagens = [
      conc({}, 'c1'),
      conc({ fck_mpa: 35, substitui_id: 'c1' }, 'c1b', '09:10'),
      conc({ local_descricao: 'cancelada' }, 'c2'),
      conc({ local_descricao: 'cancelada', substitui_id: 'c2', cancelado: true }, 'c2b', '09:20'),
      conc({ data: '2026-11-12' }, 'c3'),
    ]
    x.caminhoes = [cam('c1', 8, 'k1'), cam('c1', 8, 'k2'), cam('c1', 8, 'k2b', { substitui_id: 'k2', cancelado: true })]
    x.caminhaoElementos = [linha({ caminhao_id: 'k1', elemento_id: 'P2', incluido: true }), linha({ caminhao_id: 'k1', elemento_id: 'P1', incluido: true }), linha({ caminhao_id: 'k1', elemento_id: 'L1', incluido: false })]
    const r = montarAutomatico(x)
    expect(r.frases).toEqual(['Foi realizada a concretagem de P1 e P2 no 3º Pavimento, com 1 caminhão e 8 m³ de concreto fck 35 MPa.'])
  })

  it('concretagem cadastrada sem caminhão ainda, e a que foi cadastrada depois do fechamento', () => {
    const x = base()
    x.concretagens = [conc({ local_descricao: 'pilares do trecho 1' }, 'c1'), conc({ local_descricao: 'depois' }, 'c2', '18:00')]
    x.ate = `${DIA}T17:00:00.000-03:00`
    const r = montarAutomatico(x)
    expect(r.frases).toEqual(['Foi realizada a concretagem de pilares do trecho 1 no 3º Pavimento, concreto fck 30 MPa. Nenhum caminhão lançado ainda.'])
    expect(r.depois).toBe(1)
  })

  it('as concretagens vêm antes das fichas', () => {
    const x = base()
    x.concretagens = [conc({ local_descricao: 'laje L1' }, 'c1')]
    x.caminhoes = [cam('c1', null, 'k1')]
    x.eventos = [ev({ elemento_id: 'P1' }, 'f1', 1, 'C')]
    const r = montarAutomatico(x)
    expect(r.frases.map((f) => f.slice(0, 28))).toEqual(['Foi realizada a concretagem ', 'Foi realizada a verificação '])
    expect(r.frases[0]).toBe('Foi realizada a concretagem de laje L1 no 3º Pavimento, com 1 caminhão de concreto fck 30 MPa.')
  })
})

describe('Diário automático: texto', () => {
  it('lista e artigo do pavimento', () => {
    expect(lista([])).toBe('')
    expect(lista(['a'])).toBe('a')
    expect(lista(['a', 'b', 'c'])).toBe('a, b e c')
    expect(noPavimento('3º Pavimento')).toBe('no 3º Pavimento')
    expect(noPavimento('Térreo')).toBe('no Térreo')
    expect(noPavimento('Cobertura')).toBe('na Cobertura')
    expect(noPavimento('Fundação')).toBe('na Fundação')
    expect(noPavimento('Subsolo')).toBe('no Subsolo')
    expect(noPavimento('Pilotis')).toBe('no Pilotis')
    expect(noPavimento('Mezanino')).toBe('no Mezanino')
    expect(noPavimento('Barrilete')).toBe('no Barrilete')
    expect(noPavimento('Nível +3,20')).toBe('em Nível +3,20')
    expect(noPavimento('')).toBe('')
  })
  it('frases sem dado nenhum não quebram', () => {
    expect(fraseDaConcretagem({ raiz: 'x', local: '', pavimento: '', fornecedor: '', caminhoes: 0, volume: 0, fck: null })).toBe('Foi realizada a concretagem. Nenhum caminhão lançado ainda.')
    expect(fraseDaFvs({ ficha: 'F', pavimento: '', locais: 1, conformes: 0, naoConformes: 0, naoAplica: 2, quem: [], semNome: 0 })).toBe('Foi realizada a verificação da ficha F, em 1 local: 2 não se aplicam.')
  })
})

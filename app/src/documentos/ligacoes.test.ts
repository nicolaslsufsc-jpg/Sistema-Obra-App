import { describe, expect, it } from 'vitest'
import type { Linha } from '../nucleo/banco_local'
import { montarLigacoes } from './ligacoes'

let n = 0
function l(campos: Record<string, unknown>): Linha {
  n++
  return {
    id: `id-${n}`,
    obra_id: 'obra',
    usuario_id: 'u',
    dispositivo_id: 'd',
    criado_em_dispositivo: `2026-11-01T10:00:${String(n).padStart(2, '0')}.000Z`,
    apagado: false,
    ...campos,
  } as Linha
}

describe('lista mestra: registros dos outros módulos (só leitura)', () => {
  it('FVS: ficha pela maior revisão, peças verificadas e marcações somadas entre revisões', () => {
    const r0 = l({ codigo: 'EXE-FVS-01', titulo: 'Pilar antigo', revisao: '0' })
    const r1 = l({ codigo: 'EXE-FVS-01', titulo: 'Pilar', revisao: '1' })
    const outra = l({ codigo: 'EXE-FVS-02', titulo: 'Viga', revisao: '0' })
    const ev = (ficha: Linha, elemento: string, resultado: string | null) => l({ ficha_id: ficha.id, elemento_id: elemento, item: 1, resultado })
    const r = montarLigacoes({
      fichas_modelo: [r0, r1, outra],
      fvs_eventos: [ev(r0, 'p1', 'C'), ev(r1, 'p1', 'NC'), ev(r1, 'p2', 'C'), ev(r1, 'p3', null)],
      fvs_fichas_campo: [l({ ficha_codigo: 'EXE-FVS-01' }), l({ ficha_codigo: 'OUTRA' })],
    })
    expect(r.fichas.map((f) => f.codigo)).toEqual(['EXE-FVS-01', 'EXE-FVS-02'])
    expect(r.fichas[0]).toMatchObject({ titulo: 'Pilar', revisao: '1', revisoes: 2, pecasVerificadas: 2, marcacoes: 3, abertas: 1 })
    expect(r.fichas[1]).toMatchObject({ pecasVerificadas: 0, marcacoes: 0, abertas: 0 })
  })

  it('FVS: área de laje (grava em area_id) conta como local verificado (demo de 14/11)', () => {
    const laje = l({ codigo: 'EXE-FVS-03', titulo: 'Laje maciça', revisao: '0' })
    const r = montarLigacoes({
      fichas_modelo: [laje],
      fvs_eventos: [l({ ficha_id: laje.id, area_id: 'a1', item: 1, resultado: 'C' }), l({ ficha_id: laje.id, area_id: 'a1', item: 2, resultado: 'C' }), l({ ficha_id: laje.id, area_id: 'a2', item: 1, resultado: 'NA' })],
    })
    expect(r.fichas[0]).toMatchObject({ pecasVerificadas: 2, marcacoes: 3 })
  })

  it('Concreto: só a versão vigente, sem as canceladas, com caminhões e CPs', () => {
    const c1 = l({ data: '2026-11-03', local_descricao: 'Térreo · Pilares', fck_mpa: 30 })
    const c1b = l({ substitui_id: c1.id, data: '2026-11-04', local_descricao: 'Térreo · Pilares', fck_mpa: 35 })
    const cancelada = l({ data: '2026-11-05', local_descricao: 'Errada', fck_mpa: 25 })
    const cancela = l({ substitui_id: cancelada.id, cancelado: true, data: '2026-11-05', local_descricao: 'Errada', fck_mpa: 25 })
    const cam1 = l({ concretagem_id: c1.id, sequencia: 1, cps_moldados: 4 })
    const cam2 = l({ concretagem_id: c1.id, sequencia: 2, cps_moldados: 4 })
    const r = montarLigacoes(
      {
        concretagens: [c1, c1b, cancelada, cancela],
        caminhoes: [cam1, cam2],
        cp_resultados: [l({ caminhao_id: cam1.id, resistencia_mpa: 31.2 }), l({ caminhao_id: cam1.id, resistencia_mpa: null }), l({ caminhao_id: cam2.id, resistencia_mpa: 33 })],
      },
      c1.id,
    )
    expect(r.concretagens).toHaveLength(1)
    expect(r.concretagens[0]).toMatchObject({ raiz: c1.id, data: '2026-11-04', fck: 35, caminhoes: 2, cpsMoldados: 8, cpsRompidos: 2, exemplo: true })
  })

  it('NC: só relatório de Qualidade que não foi resolvido', () => {
    const aberta = l({ tipo: 'qualidade', data: '2026-11-02', titulo: 'Bicheira no pilar', itens: [], prazo: '2026-11-10' })
    const andando = l({ tipo: 'qualidade', data: '2026-11-03', titulo: 'Prumo fora', itens: [] })
    const resolvida = l({ tipo: 'qualidade', data: '2026-11-01', titulo: 'Já feita', itens: [] })
    const seguranca = l({ tipo: 'seguranca', data: '2026-11-04', titulo: 'Guarda-corpo', itens: [] })
    const r = montarLigacoes({
      relatorios: [aberta, andando, resolvida, seguranca],
      relatorio_andamentos: [l({ relatorio_id: andando.id, situacao: 'em_andamento' }), l({ relatorio_id: resolvida.id, situacao: 'resolvido' })],
    })
    expect(r.ncs.map((x) => [x.titulo, x.situacao])).toEqual([
      ['Prumo fora', 'em_andamento'],
      ['Bicheira no pilar', 'aberto'],
    ])
    expect(r.ncs[1].prazo).toBe('2026-11-10')
  })

  it('sem nada no aparelho, tudo vazio', () => {
    expect(montarLigacoes({})).toEqual({ fichas: [], concretagens: [], ncs: [] })
  })
})

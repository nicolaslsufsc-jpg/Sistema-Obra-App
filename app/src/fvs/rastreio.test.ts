// Item do rastreio do concreto na FVS (rastreio.ts): o C calculado pelos caminhões, o texto, a data no
// prazo e o que fica fora da lista para lançar. Fichas fictícias da obra EXE.
import { describe, expect, it } from 'vitest'
import type { CaminhaoDaPeca } from '../concreto/rastreio'
import { inicioDoPrazo, type ContextoDoPrazo } from './prazos'
import { datasDoConcreto, ehDoConcreto, itemDoRastreio, registroDoRastreio, textoDoRastreio } from './rastreio'
import { ultimosPorItem, type EventoFvs, type Ficha } from './situacao'

const PILAR: Ficha = {
  id: 'f-exe-p',
  codigo: 'EXE-PIL',
  titulo: 'Pilar (Obra Exemplo)',
  revisao: '0',
  aplica_a: ['P'],
  itens: [
    { n: 1, etapa: 'FORMAS', titulo: 'Prumo' },
    { n: 2, etapa: 'CONCRETAGEM', titulo: 'Controle do concreto', concretagem: true, rastreio_concreto: true },
    { n: 3, etapa: 'DESFORMA', titulo: 'Desforma', concretagem: false },
  ],
}

const cam = (sequencia: number, nota_fiscal: string | null, data: string, fracao: number | null = 1, parcial = false): CaminhaoDaPeca => ({
  caminhao_raiz: `k${sequencia}`,
  concretagem_raiz: 'c1',
  sequencia,
  nota_fiscal,
  data,
  fracao,
  parcial,
})

function ev(item: number, resultado: EventoFvs['resultado'], quando: string, rodada = 1): EventoFvs {
  return { id: `e-${item}-${quando}`, elemento_id: 'p1', ficha_id: PILAR.id, item, resultado, rodada, observacao: null, lote_id: null, planta_id: null, usuario_id: 'u', criado_em_dispositivo: quando }
}

describe('rastreio do concreto na FVS', () => {
  it('o texto diz caminhão, NF e data; NF vazia e parte da peça aparecem', () => {
    expect(textoDoRastreio([cam(3, '1234', '2026-11-19')])).toBe('Pelo Concreto: caminhão 3 · NF 1234 · 19/11')
    expect(textoDoRastreio([cam(1, null, '2026-11-18', 0.4, true), cam(2, '77', '2026-11-19', 0.3, true)])).toBe(
      'Pelo Concreto: caminhão 1 · NF não informada · 18/11; caminhão 2 · NF 77 · 19/11 (parte da peça)',
    )
  })

  it('peça com caminhão: registro calculado C no item marcado, com a data da concretagem e sem dono', () => {
    expect(itemDoRastreio(PILAR)).toBe(2)
    const r = registroDoRastreio('p1', PILAR, [cam(3, '1234', '2026-11-19')], [])!
    expect([r.item, r.resultado, r.rodada, r.verificado_por, ehDoConcreto(r)]).toEqual([2, 'C', 1, 'Concreto', true])
    const d = new Date(r.criado_em_dispositivo)
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()]).toEqual([2026, 11, 19, 0])
  })

  it('a data é a da concretagem mais nova, em qualquer ordem da lista', () => {
    const r = registroDoRastreio('p1', PILAR, [cam(2, '9', '2026-11-21'), cam(1, '8', '2026-11-18')], [])!
    expect(new Date(r.criado_em_dispositivo).getDate()).toBe(21)
  })

  it('sem caminhão, ficha sem o item ou sem ficha: nada', () => {
    expect(registroDoRastreio('p1', PILAR, [], [])).toBeNull()
    expect(registroDoRastreio('p1', PILAR, undefined, [])).toBeNull()
    expect(registroDoRastreio('p1', { ...PILAR, itens: PILAR.itens.map((i) => ({ ...i, rastreio_concreto: undefined })) }, [cam(1, '1', '2026-11-19')], [])).toBeNull()
    expect(registroDoRastreio('p1', undefined, [cam(1, '1', '2026-11-19')], [])).toBeNull()
  })

  it('marcação à mão depois da concretagem vale por cima; a de antes perde para o caminhão', () => {
    const calc = registroDoRastreio('p1', PILAR, [cam(1, '1', '2026-11-19')], [])!
    const depois = ev(2, 'NC', '2026-11-20T12:00:00.000Z')
    expect(ultimosPorItem([calc, depois]).get(2)?.resultado).toBe('NC')
    const antes = ev(2, 'NC', '2026-11-10T12:00:00.000Z', 2)
    const calc2 = registroDoRastreio('p1', PILAR, [cam(1, '1', '2026-11-19')], [antes])!
    expect(calc2.rodada).toBe(2) // segue a rodada do item
    expect(ultimosPorItem([antes, calc2]).get(2)?.resultado).toBe('C')
  })

  it('o prazo da concretagem conta da data do caminhão, mesmo com C à mão em outro dia', () => {
    const calc = registroDoRastreio('p1', PILAR, [cam(1, '1', '2026-11-19')], [])!
    const eventos = [calc]
    const cx: ContextoDoPrazo = { eventos, ficha: PILAR, fichaPorId: () => PILAR, datasDoConcreto: datasDoConcreto(eventos) }
    const inicio = inicioDoPrazo({ id: 'd', ficha: 'EXE-PIL', item: 3, dias: 3, depois_de: { tipo: 'concretagem' } }, cx)!
    expect([inicio.getMonth() + 1, inicio.getDate()]).toEqual([11, 19])
  })
})

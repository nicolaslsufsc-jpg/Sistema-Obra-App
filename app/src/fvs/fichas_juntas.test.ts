import { describe, expect, it } from 'vitest'
import { listarReprovacoes } from './reprovacoes'
import { eventosDaFichaAberta, fichaDaTela, historico, juntarFichasDoModelo, situacaoDaFichaAberta, situacaoDoLocal, ultimosPorItem, type EventoFvs, type Ficha, type FichaCampo, type Resultado } from './situacao'

// Obra fictícia EXE: a viga V1 com duas fichas do mesmo modelo no sistema oficial (pedido de 21/11).
const VIGA: Ficha = {
  id: 'fv',
  codigo: 'EXE-PVS-VIGA',
  titulo: 'Viga',
  revisao: '0',
  aplica_a: ['V'],
  itens: [1, 2, 3, 4].map((n) => ({ n, etapa: 'MONTAGEM', titulo: `Item ${n}` })),
}
const PILAR: Ficha = { ...VIGA, id: 'fp', codigo: 'EXE-PVS-PILAR', aplica_a: ['P'] }
const porId = (id: string) => [VIGA, PILAR].find((f) => f.id === id)
const aberta = (id: string, ficha = VIGA, atualizada = '2026-10-01'): FichaCampo => ({
  id,
  elemento_id: 'v1',
  ficha_id: ficha.id,
  codigo: `FVS-${id}`,
  local: 'Obra Exemplo \\ V1',
  ficha_codigo: ficha.codigo,
  ficha_titulo: ficha.titulo,
  status: 'Aceito',
  inspetor: null,
  atualizada_em: atualizada,
  qtd_a: 0,
  qtd_r: 0,
  qtd_na: 0,
})
let n = 0
/** registro que veio do sistema oficial (origem_id) ou, com app, marcado no app */
const ev = (fc: string | null, item: number, resultado: Resultado | null, quando: string, app = false, ficha = VIGA): EventoFvs => ({
  id: `e${String(++n).padStart(3, '0')}`,
  elemento_id: 'v1',
  ficha_id: ficha.id,
  item,
  resultado,
  rodada: 1,
  observacao: null,
  lote_id: null,
  planta_id: null,
  usuario_id: 'u',
  criado_em_dispositivo: quando,
  ficha_campo_id: fc,
  ...(app ? {} : { origem_id: `cp${n}`, verificado_por: 'Pessoa Exemplo' }),
})
const resultados = (evs: EventoFvs[]) => Object.fromEntries([...ultimosPorItem(evs)].map(([k, e]) => [k, e.resultado]))

describe('viga com duas fichas do mesmo modelo: uma na tela (21/11)', () => {
  // a: completa (4 itens com C); b: incompleta, com NC no item 2 e o item 4 com NA
  const eventos = [
    ev('a', 1, 'C', '2026-10-10'),
    ev('a', 2, 'C', '2026-10-10'),
    ev('a', 3, 'C', '2026-10-10'),
    ev('a', 4, 'C', '2026-10-10'),
    ev('b', 2, 'NC', '2026-09-01'),
    ev('b', 4, 'NA', '2026-09-01'),
  ]

  it('fica uma ficha só, a mais completa, com a outra junta', () => {
    const tela = juntarFichasDoModelo([aberta('b'), aberta('a')], porId, eventos)
    expect(tela.map((f) => [f.id, f.juntas?.map((j) => j.id)])).toEqual([['a', ['b']]])
    expect(fichaDaTela(tela, 'b')?.id).toBe('a')
  })

  it('item a item: vale a base, mas o NC da outra prevalece, mesmo mais antigo', () => {
    const [fc] = juntarFichasDoModelo([aberta('a'), aberta('b')], porId, eventos)
    expect(resultados(eventosDaFichaAberta(eventos, fc))).toEqual({ 1: 'C', 2: 'NC', 3: 'C', 4: 'C' })
    expect(situacaoDaFichaAberta(fc, porId, eventos)).toBe('reprovado')
  })

  it('item vazio na base vem da outra', () => {
    const evs = [ev('a', 1, 'C', '2026-10-10'), ev('a', 2, 'C', '2026-10-10'), ev('b', 3, 'C', '2026-09-01'), ev('b', 4, 'NA', '2026-09-01')]
    const [fc] = juntarFichasDoModelo([aberta('a'), aberta('b')], porId, evs)
    expect(fc.id).toBe('a')
    expect(resultados(eventosDaFichaAberta(evs, fc))).toEqual({ 1: 'C', 2: 'C', 3: 'C', 4: 'NA' })
    // antes: duas abas, uma "em andamento"; agora a viga fica liberada
    expect(situacaoDoLocal(VIGA, [aberta('a'), aberta('b')], porId, evs)).toBe('liberado')
  })

  it('a correção marcada no app (na base) tira o NC e o histórico junta as duas', () => {
    const corrigido = [...eventos, ev('a', 2, 'C', '2026-11-20', true)]
    const [fc] = juntarFichasDoModelo([aberta('a'), aberta('b')], porId, corrigido)
    const daTela = eventosDaFichaAberta(corrigido, fc)
    expect(resultados(daTela)).toEqual({ 1: 'C', 2: 'C', 3: 'C', 4: 'C' })
    expect(historico(daTela, 2).map((e) => e.resultado)).toEqual(['NC', 'C', 'C'])
    expect(situacaoDaFichaAberta(fc, porId, corrigido)).toBe('liberado')
  })

  it('nada é apagado: os registros de cada ficha seguem com a ficha deles', () => {
    const copia = JSON.stringify(eventos)
    const [fc] = juntarFichasDoModelo([aberta('a'), aberta('b')], porId, eventos)
    eventosDaFichaAberta(eventos, fc)
    expect(JSON.stringify(eventos)).toBe(copia)
  })

  it('pilar e fichas de modelos diferentes não juntam', () => {
    const pil = [aberta('p1', PILAR), aberta('p2', PILAR)]
    expect(juntarFichasDoModelo(pil, porId, []).map((f) => f.juntas)).toEqual([undefined, undefined])
    const outra: Ficha = { ...VIGA, id: 'fv2', codigo: 'EXE-PVS-VIGA-2' }
    const mistas = [aberta('a'), aberta('x', outra)]
    expect(juntarFichasDoModelo(mistas, (id) => (id === 'fv2' ? outra : porId(id)), []).length).toBe(2)
  })

  it('lista de NC: um item, aberto; depois da correção no app, reinspecionado', () => {
    const base = {
      pecas: [{ id: 'v1', tipo: 'V', nome: 'V1', pavimento_id: 'pv1' }],
      fichaPorId: new Map([VIGA, PILAR].map((f) => [f.id, f])),
      fichasCampoDe: new Map([['v1', [aberta('a'), aberta('b')]]]),
      fotosDe: new Map(),
      quem: () => 'Pessoa Exemplo',
    }
    const antes = listarReprovacoes({ ...base, eventosDe: new Map([['v1', eventos]]) })
    expect(antes.map((r) => [r.item, r.aberta, r.fichaCampoId])).toEqual([[2, true, 'b']])
    const depois = listarReprovacoes({ ...base, eventosDe: new Map([['v1', [...eventos, ev('a', 2, 'C', '2026-11-20', true)]]]) })
    expect(depois.map((r) => [r.item, r.aberta, r.reinspecao?.resultado])).toEqual([[2, false, 'C']])
  })
})

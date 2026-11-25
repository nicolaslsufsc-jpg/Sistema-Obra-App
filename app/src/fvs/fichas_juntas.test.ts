import { describe, expect, it } from 'vitest'
import { listarReprovacoes } from './reprovacoes'
import { automaticosNaFichaAberta, eventosDaFichaAberta, fichaAbertaDoAutomatico, eventosNaFicha, fichaDaTela, historico, juntarFichasDoModelo, juntarMarcadosNoApp, SO_NO_APP, situacaoDaFichaAberta, situacaoDoLocal, soNoAppAinda, ultimosPorItem, type EventoFvs, type Ficha, type FichaCampo, type Resultado } from './situacao'

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

describe('ficha única por peça: o marcado só no app entra na ficha aberta (23/11)', () => {
  // pilar P1 da Obra Exemplo: ficha aberta 'p' no sistema oficial com os itens 1 e 2; o app marcou 3 e 4
  const pil = (fc: string | null, item: number, r: Resultado | null, quando: string, app = false) => ({ ...ev(fc, item, r, quando, app, PILAR), elemento_id: 'p1' })
  const abertaP = { ...aberta('p', PILAR), elemento_id: 'p1' }
  const eventos = [pil('p', 1, 'C', '2026-11-01'), pil('p', 2, 'C', '2026-11-01'), pil(null, 3, 'C', '2026-11-10', true), pil(null, 4, 'C', '2026-11-10', true)]

  it('uma ficha só na tela, sem a aba "Marcado só no app"', () => {
    const { fichas, juntou } = juntarMarcadosNoApp([abertaP], eventos)
    expect(juntou).toBe(true)
    expect(fichas.map((f) => [f.id, f.juntas?.map((j) => j.id)])).toEqual([['p', [SO_NO_APP]]])
    expect(resultados(eventosDaFichaAberta(eventos, fichas[0]))).toEqual({ 1: 'C', 2: 'C', 3: 'C', 4: 'C' })
    // antes: duas abas, cada uma em andamento; agora o pilar fica liberado
    expect(situacaoDoLocal(PILAR, [abertaP], porId, eventos)).toBe('liberado')
  })

  it('o pincel e o "por item" enxergam a ficha inteira', () => {
    expect(resultados(eventosNaFicha(eventos, 'p', [abertaP]))).toEqual({ 1: 'C', 2: 'C', 3: 'C', 4: 'C' })
    // sem ficha aberta, continua só o do app
    expect(resultados(eventosNaFicha(eventos, null, []))).toEqual({ 3: 'C', 4: 'C' })
  })

  it('o NC marcado no app aparece na ficha e na lista de NC, e abre nela', () => {
    const comNc = [...eventos, pil(null, 2, 'NC', '2026-11-12', true)]
    expect(situacaoDoLocal(PILAR, [abertaP], porId, comNc)).toBe('reprovado')
    const lista = listarReprovacoes({
      pecas: [{ id: 'p1', tipo: 'P', nome: 'P1', pavimento_id: 'pv1' }],
      fichaPorId: new Map([VIGA, PILAR].map((f) => [f.id, f])),
      fichasCampoDe: new Map([['p1', [abertaP]]]),
      fotosDe: new Map(),
      quem: () => 'Pessoa Exemplo',
      eventosDe: new Map([['p1', comNc]]),
    })
    expect(lista.map((r) => [r.item, r.aberta, r.fichaCampoId])).toEqual([[2, true, 'p']])
  })

  it('não junta quando o app marcou em modelo que não tem ficha aberta, ou em dois modelos', () => {
    expect(juntarMarcadosNoApp([abertaP], [pil(null, 1, 'C', '2026-11-10', true)].map((e) => ({ ...e, ficha_id: 'outro' }))).juntou).toBe(false)
    const doisModelos = [pil(null, 1, 'C', '2026-11-10', true), { ...pil(null, 2, 'C', '2026-11-10', true), ficha_id: VIGA.id }]
    expect(juntarMarcadosNoApp([abertaP], doisModelos).juntou).toBe(false)
    expect(juntarMarcadosNoApp([], eventos).juntou).toBe(false)
    expect(juntarMarcadosNoApp([abertaP], eventos.slice(0, 2)).juntou).toBe(false)
  })

  it('tom mais claro: só o que veio do app e ainda não foi lançado lá', () => {
    const [doSistema, , doApp] = eventos
    expect(soNoAppAinda(doSistema, new Set())).toBe(false)
    expect(soNoAppAinda(doApp, new Set())).toBe(true)
    expect(soNoAppAinda(doApp, new Set([doApp.id]))).toBe(false)
    expect(soNoAppAinda(undefined, new Set())).toBe(false)
  })

  it('nada é regravado: cada registro segue sem ficha aberta', () => {
    const copia = JSON.stringify(eventos)
    eventosDaFichaAberta(eventos, juntarMarcadosNoApp([abertaP], eventos).fichas[0])
    expect(JSON.stringify(eventos)).toBe(copia)
  })
})

// Achado #6 da lista de campo (24/11): o item de furação OK pelos furos ia para "só no app" e virava uma
// ficha à parte, com um item só, em andamento para sempre: a viga ficava laranja.
describe('furos e barras marcados só no app contam na ficha aberta', () => {
  // a ficha do sistema oficial é a R0; a vigente do app é a R1 (mesmo código), com o item 5 dos furos
  const comFuros = (id: string, revisao: string): Ficha => ({ ...VIGA, id, revisao, itens: [...VIGA.itens, { n: 5, etapa: 'EXECUÇÃO', titulo: 'Passagens em vigas', furos: true }] })
  const R0 = comFuros('fv-r0', '0')
  const R1 = comFuros('fv-r1', '1')
  const LAJE: Ficha = { ...VIGA, id: 'fl', codigo: 'EXE-PVS-LAJE', aplica_a: ['L'], itens: [{ n: 1, etapa: 'ARMADURA', titulo: 'Armadura', barras: true }] }
  const porId2 = (id: string) => [R0, R1, VIGA, PILAR, LAJE].find((f) => f.id === id)
  const doSistema = [1, 2, 3, 4].map((i) => ev('cp', i, 'C', '2026-10-10', false, R0))

  it('antes: o item dos furos noutra revisão segurava a viga em andamento; agora fica liberada', () => {
    const furos = ev(null, 5, 'C', '2026-11-20', true, R1)
    expect(situacaoDoLocal(R1, [aberta('cp', R0)], porId2, [...doSistema, furos])).toBe('liberado')
    // sem o registro dos furos, o item 5 da R0 está vazio: em andamento
    expect(situacaoDoLocal(R1, [aberta('cp', R0)], porId2, doSistema)).toBe('andamento')
  })

  it('com outro registro só no app de outro modelo, o dos furos entra na ficha mesmo assim', () => {
    const furos = ev(null, 5, 'NC', '2026-11-20', true, R1)
    const outro = ev(null, 1, 'C', '2026-11-20', true, PILAR)
    const evs = automaticosNaFichaAberta([...doSistema, furos, outro], [aberta('cp', R0)], porId2)
    expect(evs.find((e) => e.id === furos.id)).toMatchObject({ ficha_campo_id: 'cp', ficha_id: 'fv-r0', item: 5, resultado: 'NC' })
    // o registro comum (marcado pela pessoa) fica como estava
    expect(evs.find((e) => e.id === outro.id)).toBe(outro)
    expect(situacaoDoLocal(R1, [aberta('cp', R0)], porId2, [...doSistema, furos])).toBe('reprovado')
  })

  it('a ficha aberta em uso: a do mesmo modelo; senão a do mesmo código; senão a única com o item', () => {
    expect(fichaAbertaDoAutomatico('furos', R1, [aberta('x', R0), aberta('y', R1)], porId2, [])?.fc.id).toBe('y')
    expect(fichaAbertaDoAutomatico('furos', R1, [aberta('x', PILAR), aberta('y', R0)], porId2, [])?.fc.id).toBe('y')
    const OUTRA = comFuros('fv-outra', '0')
    const porId3 = (id: string) => (id === OUTRA.id ? { ...OUTRA, codigo: 'EXE-PVS-VIGA-2' } : porId2(id))
    expect(fichaAbertaDoAutomatico('furos', R1, [aberta('z', { ...OUTRA, codigo: 'EXE-PVS-VIGA-2' })], porId3, [])).toMatchObject({ item: 5 })
    // a revisão da ficha aberta sem o item marcado como furos: o mesmo número de item, no mesmo código
    expect(fichaAbertaDoAutomatico('furos', R1, [aberta('w', { ...VIGA, id: 'fv-sem', itens: [...VIGA.itens, { n: 5, etapa: 'EXECUÇÃO', titulo: 'Passagens' }] })], (id) => (id === 'fv-sem' ? { ...VIGA, id: 'fv-sem', itens: [...VIGA.itens, { n: 5, etapa: 'EXECUÇÃO', titulo: 'Passagens' }] } : porId2(id)), [], 5)).toMatchObject({ item: 5 })
    // sem ficha aberta, ou nenhuma com o item: continua só no app
    expect(fichaAbertaDoAutomatico('furos', R1, [], porId2, [])).toBe(undefined)
    expect(fichaAbertaDoAutomatico('furos', R1, [aberta('x', PILAR)], porId2, [], 5)).toBe(undefined)
  })

  it('barras: o item de armadura também entra; peça sem ficha aberta fica como antes', () => {
    const barras = ev(null, 1, 'C', '2026-11-20', true, LAJE)
    expect(automaticosNaFichaAberta([barras], [aberta('l', LAJE)], porId2)[0]).toMatchObject({ ficha_campo_id: 'l', item: 1 })
    const sem = [barras]
    expect(automaticosNaFichaAberta(sem, [], porId2)).toBe(sem)
  })
})

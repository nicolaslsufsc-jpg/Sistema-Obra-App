import 'fake-indexeddb/auto'
import { COBERTURA_CONCRETADA, concretadaDe, pecasConcretadas } from './concretada'
import { describe, expect, it } from 'vitest'
import {
  aoTocar,
  combinarSituacoes,
  daFichaAberta,
  etapasDa,
  fichaDaPeca,
  fichaSoNoApp,
  fichasPara,
  historico,
  itensAntesDaConcretagem,
  listarDuplicadas,
  normalizarResultado,
  ordenarFichasAbertas,
  percentualConforme,
  reprovacoesDoItem,
  resumoDaEstrutura,
  resumoDosAmbientes,
  esquadriaValeNoItem,
  rotuloRodada,
  situacaoDaFichaAberta,
  situacaoDaPeca,
  situacaoDoLocal,
  SO_NO_APP,
  ultimosPorItem,
  type EventoFvs,
  type Ficha,
  type FichaCampo,
} from './situacao'
import {
  abrirPacote,
  abrirPacoteOuAnterior,
  baixarPacote,
  comPrazo,
  conferirManifest,
  DownloadParado,
  guardarPacote,
  lerComProgresso,
  limparPacotes,
  pacotesNoAparelho,
  pecasNoAparelho,
  textoDoErroDeDownload,
} from './pacote'
import { avisoDasPlantas, cadeiaDeRevisoes, manterNaLimpeza, pacoteDaPlanta, pacotesAManter, textosDaRevisao } from './revisoes'
import { ehPlantaDeEstrutura, plantaDeDesenho, plantasVigentes } from './plantas'
import { SEM_REGRAS } from './regras'
import type { Linha } from '../nucleo/banco_local'
import { TABELAS_SINCRONIZADAS } from '../nucleo/tabelas'
import { buscarPecas } from './busca'
import { baixarPlanta, usarFonteDeArquivos, type Planta } from './dados'
import { avisoDaSincronizacao, avisoHoraNaFrente, comRegistros, paraLancarDaObra, desfazerLote, localDoRegistro, marcarPelosFuros, voltarItem, horaNaFrente, horaNormal, ligarDepoisDe, ligarEntrePecas, marcarLote, tocarItem, registroNaFrente, relogioAntesDoPacote, relogioAtrasado, textoDoErroDeGravacao, type DadosFvs } from './dados'
import { sincronizador } from '../nucleo/servicos'
import { hojeNoAparelho } from './formato'
import { DadosDaTela } from './leitura'

const ficha: Ficha = {
  id: 'f1',
  codigo: 'TESTE-PVS-1',
  titulo: 'Pilares',
  revisao: '0',
  aplica_a: ['P'],
  itens: [
    { n: 1, etapa: 'INÍCIO', titulo: 'Local limpo' },
    { n: 2, etapa: 'INÍCIO', titulo: 'Projeto' },
    { n: 3, etapa: 'EXECUÇÃO', titulo: 'Prumo' },
  ],
}

let seq = 0
function ev(item: number, resultado: EventoFvs['resultado'], rodada = 1, extra: Partial<EventoFvs> = {}): EventoFvs {
  seq++
  return {
    id: `e${String(seq).padStart(3, '0')}`,
    elemento_id: 'p1',
    ficha_id: 'f1',
    item,
    resultado,
    rodada,
    observacao: null,
    lote_id: null,
    planta_id: null,
    usuario_id: 'u1',
    criado_em_dispositivo: `2026-11-04T10:${String(Math.floor(seq / 60) % 60).padStart(2, '0')}:${String(seq % 60).padStart(2, '0')}Z`,
    ...extra,
  }
}

describe('situação da peça na ficha', () => {
  it('sem registro = pendente; parte marcada = em andamento; tudo A/NA = liberado', () => {
    expect(situacaoDaPeca(ficha, [])).toBe('nada')
    const e = [ev(1, 'C'), ev(2, 'NA')]
    expect(situacaoDaPeca(ficha, e)).toBe('andamento')
    expect(situacaoDaPeca(ficha, e, 'INÍCIO')).toBe('liberado')
    expect(situacaoDaPeca(ficha, [...e, ev(3, 'C')])).toBe('liberado')
  })

  it('qualquer R deixa a peça reprovada; a reinspeção aprovada libera', () => {
    const e = [ev(1, 'C'), ev(2, 'C'), ev(3, 'NC')]
    expect(situacaoDaPeca(ficha, e)).toBe('reprovado')
    expect(situacaoDaPeca(ficha, e, 'INÍCIO')).toBe('liberado')
    expect(situacaoDaPeca(ficha, [...e, ev(3, 'C', 2)])).toBe('liberado')
  })

  it('vale o último registro de cada item; desmarcar volta a pendente', () => {
    const e = [ev(1, 'C'), ev(1, null)]
    expect(ultimosPorItem(e).get(1)?.resultado).toBeNull()
    expect(situacaoDaPeca(ficha, e)).toBe('nada')
  })

  it('mesmo horário: desempata pelo id (o mesmo em todos os aparelhos)', () => {
    const a = ev(1, 'C', 1, { id: 'b', criado_em_dispositivo: '2026-11-04T10:00:00Z' })
    const b = ev(1, 'NC', 1, { id: 'a', criado_em_dispositivo: '2026-11-04T10:00:00Z' })
    expect(ultimosPorItem([a, b]).get(1)?.id).toBe('b')
    expect(ultimosPorItem([b, a]).get(1)?.id).toBe('b')
  })

  it('registro de outra ficha não conta', () => {
    expect(situacaoDaPeca(ficha, [ev(1, 'NC', 1, { ficha_id: 'outra' })])).toBe('nada')
  })

  it('percentual conforme ignora NA e itens vazios', () => {
    expect(percentualConforme(ficha, [])).toBeNull()
    expect(percentualConforme(ficha, [ev(1, 'C'), ev(2, 'NA'), ev(3, 'NC')])).toBe(50)
  })
})

describe('liberado para concretar (azul)', () => {
  const pilar: Ficha = {
    id: 'f1',
    codigo: 'PVS-P',
    titulo: 'Pilares',
    revisao: '0',
    aplica_a: ['P'],
    itens: [
      { n: 1, etapa: 'CONDIÇÕES DE INÍCIO', titulo: 'a' },
      { n: 2, etapa: 'MONTAGEM - FORMA E ARMADURA', titulo: 'b' },
      { n: 3, etapa: 'CONCRETAGEM', titulo: 'c' },
      { n: 4, etapa: 'DESFORMA', titulo: 'd' },
    ],
  }
  const antes = () => [ev(1, 'C'), ev(2, 'NA')]

  it('os itens antes da concretagem são os das etapas anteriores a ela', () => {
    expect(itensAntesDaConcretagem(pilar).map((i) => i.n)).toEqual([1, 2])
  })

  it('"ANTES DA CONCRETAGEM" é antes; a etapa que conta é a da concretagem em si', () => {
    const bloco: Ficha = {
      ...pilar,
      itens: [
        { n: 1, etapa: 'CONDIÇÕES DE INÍCIO', titulo: 'a' },
        { n: 2, etapa: 'ANTES DA CONCRETAGEM', titulo: 'b' },
        { n: 3, etapa: 'CONCRETAGEM', titulo: 'c' },
        { n: 4, etapa: ' PÓS CONCRETAGEM', titulo: 'd' },
      ],
    }
    expect(itensAntesDaConcretagem(bloco).map((i) => i.n)).toEqual([1, 2])
  })

  it('etapa com outro nome que inclui a concretagem também vale', () => {
    const subpressao: Ficha = {
      ...pilar,
      itens: [
        { n: 1, etapa: 'PREPARAÇÃO DA BASE', titulo: 'a' },
        { n: 2, etapa: 'COLOCAÇÃO DE ARMADURAS E CONCRETAGEM', titulo: 'b' },
      ],
    }
    expect(itensAntesDaConcretagem(subpressao).map((i) => i.n)).toEqual([1])
  })

  it('ficha sem etapa de concretagem nunca fica azul', () => {
    expect(itensAntesDaConcretagem(ficha)).toEqual([])
    expect(situacaoDaPeca(ficha, [ev(1, 'C'), ev(2, 'C')])).toBe('andamento')
  })

  it('ficha que começa pela concretagem não tem o que liberar antes', () => {
    const f: Ficha = { ...pilar, itens: [{ n: 1, etapa: 'CONCRETAGEM', titulo: 'a' }, { n: 2, etapa: 'CURA', titulo: 'b' }] }
    expect(itensAntesDaConcretagem(f)).toEqual([])
    expect(situacaoDaPeca(f, [ev(1, 'C')])).toBe('andamento')
  })

  it('fica azul com A ou NA em tudo antes da concretagem, e não antes disso', () => {
    expect(situacaoDaPeca(pilar, [ev(1, 'C')])).toBe('andamento')
    expect(situacaoDaPeca(pilar, antes())).toBe('concretagem')
  })

  it('um R em qualquer item tira o azul; a reinspeção aprovada devolve', () => {
    const comR = [ev(1, 'C'), ev(2, 'NC')]
    expect(situacaoDaPeca(pilar, comR)).toBe('reprovado')
    expect(situacaoDaPeca(pilar, [...comR, ev(2, 'C', 2)])).toBe('concretagem')
    expect(situacaoDaPeca(pilar, [...antes(), ev(3, 'NC')])).toBe('reprovado')
  })

  it('desmarcar um item de antes tira o azul', () => {
    expect(situacaoDaPeca(pilar, [...antes(), ev(2, null)])).toBe('andamento')
  })

  it('continua azul durante a concretagem e fica verde só com a ficha inteira', () => {
    expect(situacaoDaPeca(pilar, [...antes(), ev(3, 'C')])).toBe('concretagem')
    expect(situacaoDaPeca(pilar, [...antes(), ev(3, 'C'), ev(4, 'C')])).toBe('liberado')
  })

  // Achado #2 da lista de campo (24/11), o Nicolas: "a peça fica verde quando estiver numa concretagem cadastrada
  // ... Vamos botar um coeficiente aí de 90%". Pilar, viga e laje: verde = azul + concretagem cadastrada no Concreto.
  it('com o Concreto: a ficha inteira sem concretagem fica azul; azul e concretada fica verde', () => {
    const tudo = [...antes(), ev(3, 'C'), ev(4, 'C')]
    expect(situacaoDaPeca(pilar, tudo, undefined, false)).toBe('concretagem')
    expect(situacaoDaPeca(pilar, tudo, undefined, true)).toBe('liberado')
    // verde não espera os itens da concretagem para frente (cura, desforma): basta o azul e a concretagem
    expect(situacaoDaPeca(pilar, antes(), undefined, true)).toBe('liberado')
    // concretada mas sem o azul: em andamento; com NC: NC; nada marcado: pendente
    expect(situacaoDaPeca(pilar, [ev(1, 'C')], undefined, true)).toBe('andamento')
    expect(situacaoDaPeca(pilar, [...antes(), ev(3, 'NC')], undefined, true)).toBe('reprovado')
    expect(situacaoDaPeca(pilar, [], undefined, true)).toBe('nada')
    // olhando uma etapa só, a concretagem não muda nada
    expect(situacaoDaPeca(pilar, antes(), 'MONTAGEM - FORMA E ARMADURA', false)).toBe('liberado')
  })

  it('com o Concreto: ficha sem etapa de concretagem segue a regra de antes', () => {
    expect(situacaoDaPeca(ficha, [ev(1, 'C'), ev(2, 'C')], undefined, false)).toBe(situacaoDaPeca(ficha, [ev(1, 'C'), ev(2, 'C')]))
  })

  it('com o Concreto: o local e as fichas abertas também (azul sem concretagem, verde com)', () => {
    const tudo = [...antes(), ev(3, 'C'), ev(4, 'C')]
    const porId = (id: string) => (id === pilar.id ? pilar : undefined)
    expect(situacaoDoLocal(pilar, [], porId, tudo, undefined, undefined, false)).toBe('concretagem')
    expect(situacaoDoLocal(pilar, [], porId, tudo, undefined, undefined, true)).toBe('liberado')
    expect(situacaoDoLocal(pilar, [], porId, tudo)).toBe('liberado')
  })

  it('olhando uma etapa só, a pergunta é se ela terminou: não fica azul', () => {
    expect(situacaoDaPeca(pilar, antes(), 'MONTAGEM - FORMA E ARMADURA')).toBe('liberado')
  })

  it('duas fichas na mesma peça: azul só com as duas prontas para concretar', () => {
    expect(combinarSituacoes(['concretagem', 'concretagem'])).toBe('concretagem')
    expect(combinarSituacoes(['concretagem', 'liberado'])).toBe('concretagem')
    expect(combinarSituacoes(['concretagem', 'andamento'])).toBe('andamento')
    expect(combinarSituacoes(['concretagem', 'nada'])).toBe('andamento')
    expect(combinarSituacoes(['concretagem', 'reprovado'])).toBe('reprovado')
  })

  it('o resumo do pavimento conta as liberadas para concretar à parte', () => {
    const r = resumoDaEstrutura([{ id: 'p1', tipo: 'P' }, { id: 'p2', tipo: 'P' }, { id: 'p3', tipo: 'P' }], [pilar], (id) =>
      id === 'p1' ? antes() : id === 'p2' ? [...antes(), ev(3, 'C'), ev(4, 'C')] : [],
    )
    expect(r).toMatchObject({ total: 3, liberadas: 1, paraConcretar: 1, comR: 0 })
  })
})

describe('toque nos botões e rodadas', () => {
  it('item vazio recebe o resultado na V01; mesmo botão desmarca; outro troca', () => {
    expect(aoTocar(undefined, 'C')).toEqual({ resultado: 'C', rodada: 1 })
    expect(aoTocar(ev(1, 'C'), 'C')).toEqual({ resultado: null, rodada: 1 })
    expect(aoTocar(ev(1, 'C'), 'NA')).toEqual({ resultado: 'NA', rodada: 1 })
  })

  it('item reprovado: qualquer botão é reinspeção (V02), inclusive R de novo', () => {
    expect(aoTocar(ev(1, 'NC'), 'C')).toEqual({ resultado: 'C', rodada: 2 })
    expect(aoTocar(ev(1, 'NC', 2), 'NC')).toEqual({ resultado: 'NC', rodada: 3 })
  })

  it('desmarcado depois de V02 continua na V02', () => {
    expect(aoTocar(ev(1, null, 2), 'C')).toEqual({ resultado: 'C', rodada: 2 })
  })

  it('rótulo e histórico', () => {
    expect(rotuloRodada(1)).toBe('V01')
    expect(rotuloRodada(12)).toBe('V12')
    const h = historico([ev(1, 'C'), ev(2, 'NC'), ev(1, 'NC')], 1)
    expect(h.map((x) => x.resultado)).toEqual(['C', 'NC'])
  })
})

describe('reprovações de um item (histórico no painel)', () => {
  it('uma por rodada, com o último registro da rodada', () => {
    const r1 = ev(1, 'NC', 1)
    const r1texto = ev(1, 'NC', 1, { observacao: 'Trocar' })
    const a2 = ev(1, 'C', 2)
    const r3 = ev(1, 'NC', 3, { observacao: 'De novo' })
    const hist = [r1, r1texto, a2, r3]
    const lista = reprovacoesDoItem(hist)
    expect(lista.map((x) => [x.rodada, x.evento.id, x.observacao])).toEqual([
      [1, r1texto.id, 'Trocar'],
      [3, r3.id, 'De novo'],
    ])
    expect(lista[0].eventos.map((e) => e.id)).toEqual([r1.id, r1texto.id]) // as fotos podem estar em qualquer um
  })

  it('R desmarcado na mesma rodada foi engano; texto apagado não volta', () => {
    expect(reprovacoesDoItem([ev(1, 'NC', 1), ev(1, null, 1), ev(1, 'C', 1)])).toEqual([])
    expect(reprovacoesDoItem([ev(1, 'NC', 1, { observacao: 'Trocar' }), ev(1, 'NC', 1)])[0].observacao).toBeNull()
    expect(reprovacoesDoItem([])).toEqual([])
    expect(reprovacoesDoItem([ev(1, 'C', 1)])).toEqual([])
  })
})

describe('revisão nova da ficha', () => {
  const rev0: Ficha = { ...ficha, id: 'r0', revisao: '0' }
  const rev1: Ficha = { ...ficha, id: 'r1', revisao: '1', itens: [{ n: 1, etapa: 'INÍCIO', titulo: 'Local limpo' }] }
  const rev2: Ficha = { ...ficha, id: 'r2', revisao: '2' }
  const outra: Ficha = { ...ficha, id: 'o1', codigo: 'OUTRA' }
  const fichas = [rev0, rev1, rev2, outra]
  const porId = (id: string) => fichas.find((f) => f.id === id)

  it('peça ainda não marcada usa a vigente', () => {
    expect(fichaDaPeca(rev2, [], porId)).toBe(rev2)
    expect(fichaDaPeca(undefined, [], porId)).toBeUndefined()
  })

  it('peça marcada numa revisão anterior continua nela, a mais nova delas', () => {
    expect(fichaDaPeca(rev2, [ev(1, 'C', 1, { ficha_id: 'r0' })], porId)).toBe(rev0)
    expect(fichaDaPeca(rev2, [ev(1, 'C', 1, { ficha_id: 'r0' }), ev(1, 'C', 1, { ficha_id: 'r1' }), ev(2, 'C', 1, { ficha_id: 'r0' })], porId)).toBe(rev1)
  })

  it('já tem marcação na vigente: fica na vigente', () => {
    expect(fichaDaPeca(rev2, [ev(1, 'C', 1, { ficha_id: 'r0' }), ev(1, 'C', 1, { ficha_id: 'r2' })], porId)).toBe(rev2)
  })

  it('marcação de outra ficha ou de ficha aberta do sistema oficial não muda a escolha', () => {
    expect(fichaDaPeca(rev2, [ev(1, 'C', 1, { ficha_id: 'o1' })], porId)).toBe(rev2)
    expect(fichaDaPeca(rev2, [ev(1, 'C', 1, { ficha_id: 'r0', ficha_campo_id: 'fc' })], porId)).toBe(rev2)
    expect(fichaDaPeca(rev2, [ev(1, 'C', 1, { ficha_id: 'sumiu' })], porId)).toBe(rev2)
  })

  it('o que já estava liberado continua liberado no resumo depois da revisão nova', () => {
    const marcados = [ev(1, 'C', 1, { ficha_id: 'r0' }), ev(2, 'C', 1, { ficha_id: 'r0' }), ev(3, 'C', 1, { ficha_id: 'r0' })]
    const r = resumoDaEstrutura([{ id: 'p1', tipo: 'P' }, { id: 'p2', tipo: 'P' }], [rev0, rev2], (id) => (id === 'p1' ? marcados : []))
    expect(r).toMatchObject({ total: 2, liberadas: 1, comR: 0 })
  })

  it('ambiente: serviço começado numa revisão anterior continua na lista, com os liberados dela', () => {
    const alv0: Ficha = { ...ficha, id: 'alv0', codigo: 'ALV', revisao: '0', aplica_a: ['A'] }
    const alv1: Ficha = { ...ficha, id: 'alv1', codigo: 'ALV', revisao: '1', aplica_a: ['A'] }
    const evs = [1, 2, 3].map((n) => ev(n, 'C', 1, { elemento_id: 'a1', ficha_id: 'alv0' }))
    const r = resumoDosAmbientes([{ id: 'a1', tipo: 'A' }], [alv0, alv1], (id) => (id === 'a1' ? evs : []))
    expect(r.servicos.map((s) => [s.ficha.id, s.liberados])).toEqual([['alv1', 1]])
  })
})

describe('marcação em lote no aparelho', () => {
  const OBRA = 'b0000000-0000-0000-0000-00000000aaaa'
  const c = { obraId: OBRA, usuarioId: '00000000-0000-0000-0000-0000000000a1', plantaId: null }
  const gravadosNaObra = () => sincronizador.linhas('fvs_eventos', OBRA)
  const paraEventos = (linhas: Linha[]) => comRegistros({ eventosDe: new Map() } as unknown as DadosFvs, linhas).eventosDe

  it('marca só o que está vazio, com o mesmo lote; desfazer limpa o que não mudou depois', async () => {
    const jaMarcado = ev(1, 'NA', 1, { elemento_id: 'p9' })
    const lote = await marcarLote(c, [{ id: 'p9', ficha, eventos: [jaMarcado] }], null, 'C')
    expect(lote.map((l) => [l.item, l.resultado])).toEqual([[2, 'C'], [3, 'C']])
    expect(new Set(lote.map((l) => l.lote_id)).size).toBe(1)

    // o item 3 mudou depois do lote: fica como está
    const registro = await sincronizador.registrar('fvs_eventos', OBRA, c.usuarioId, { elemento_id: 'p9', ficha_id: ficha.id, item: 3, resultado: 'NC', rodada: 1, observacao: null })
    // hora explícita: no Windows o relógio repete o mesmo milissegundo e os dois registros empatariam
    const mudou = { ...registro, criado_em_dispositivo: new Date(Date.parse(String(lote[1].criado_em_dispositivo)) + 1000).toISOString() }
    const eventos = paraEventos([...lote, mudou])
    const desfeitos = await desfazerLote(c, lote, (id) => eventos.get(id) ?? [])
    expect(desfeitos.map((l) => [l.item, l.resultado, l.lote_id])).toEqual([[2, null, lote[0].lote_id]])
  })

  it('desfazer leva a ficha aberta em que o lote foi marcado', async () => {
    const lote = await marcarLote({ ...c, fichaCampoId: 'fc1' }, [{ id: 'p8', ficha, eventos: [] }], 'INÍCIO', 'C')
    expect(lote.every((l) => l.ficha_campo_id === 'fc1')).toBe(true)
    const eventos = paraEventos(lote)
    const desfeitos = await desfazerLote(c, lote, (id) => eventos.get(id) ?? [])
    expect(desfeitos.length).toBe(2)
    expect(desfeitos.every((l) => l.ficha_campo_id === 'fc1')).toBe(true)
  })

  it('item com marcação de hora à frente não trava o lote: grava tudo, com a hora real deste aparelho', async () => {
    const antes = (await gravadosNaObra()).length
    const noFuturo = ev(3, null, 1, { elemento_id: 'p7', criado_em_dispositivo: new Date(Date.now() + 60_000).toISOString() })
    const inicio = Date.now()
    const gravados = await marcarLote(c, [{ id: 'p7', ficha, eventos: [noFuturo] }], null, 'C')
    expect(gravados.length).toBe(ficha.itens.length)
    expect((await gravadosNaObra()).length).toBe(antes + ficha.itens.length)
    // a hora gravada é a do aparelho, não a do registro "do futuro"
    for (const g of gravados) expect(Date.parse(String(g.criado_em_dispositivo))).toBeLessThanOrEqual(Date.now())
    for (const g of gravados) expect(Date.parse(String(g.criado_em_dispositivo))).toBeGreaterThanOrEqual(inicio - 1)
  })
})

describe('barra de laje no servidor (pedido 0, 20/11)', () => {
  const OBRA = 'b0000000-0000-0000-0000-00000000bbb0'
  const BARRA = 'fb000000-0000-0000-0000-000000000001'
  const LAJE: Ficha = { ...ficha, id: 'f-laje', codigo: 'TESTE-PVS-LAJE', aplica_a: ['L'] }
  // a barra é do pacote da planta: o registro vai em barra_id, com a planta
  const c = { obraId: OBRA, usuarioId: '00000000-0000-0000-0000-0000000000a1', plantaId: 'pl1', areas: new Set(['ar1']), barras: new Set([BARRA]) }
  const paraEventos = (linhas: Linha[]) => comRegistros({ eventosDe: new Map() } as unknown as DadosFvs, linhas).eventosDe

  it('o registro da barra vai em barra_id (não em elemento_id) e a tela lê como os outros locais', async () => {
    const ok = await marcarPelosFuros(c, BARRA, LAJE, 2, 'C', null, [])
    expect([ok.barra_id, ok.elemento_id, ok.area_id, ok.planta_id]).toEqual([BARRA, undefined, undefined, 'pl1'])
    expect(localDoRegistro(ok)).toBe(BARRA)
    const eventos = paraEventos([ok])
    expect(eventos.get(BARRA)?.map((e) => [e.item, e.resultado])).toEqual([[2, 'C']])
    // o "Desfazer" do toque volta o item na mesma barra
    const volta = await voltarItem(c, ok, undefined, eventos.get(BARRA) ?? [])
    expect([volta?.barra_id, volta?.elemento_id, volta?.resultado]).toEqual([BARRA, undefined, null])
    // o "Desfazer" do "Tudo OK nesta camada" (lote) também
    const lote = [{ ...ok, lote_id: 'lt1' }]
    const desfeitos = await desfazerLote(c, lote, (id) => paraEventos(lote).get(id) ?? [])
    expect(desfeitos.map((l) => [l.barra_id, l.elemento_id, l.resultado])).toEqual([[BARRA, undefined, null]])
    // peça e área não mudam
    expect((await marcarPelosFuros(c, 'v1', ficha, 2, 'C', null, [])).elemento_id).toBe('v1')
    expect((await marcarPelosFuros(c, 'ar1', LAJE, 2, 'C', null, [])).area_id).toBe('ar1')
  })

  it('registro antigo da barra (gravado em elemento_id, antes de 20/11) continua no lugar dela', () => {
    const antigo = { id: 'x1', elemento_id: BARRA, ficha_id: LAJE.id, item: 2, resultado: 'C', rodada: 1, criado_em_dispositivo: '2026-11-19T10:00:00.000Z' } as unknown as Linha
    expect(paraEventos([antigo]).get(BARRA)?.length).toBe(1)
  })
})

describe('regras da obra na gravação (prazo e ligação, 19/11)', () => {
  const OBRA = 'b0000000-0000-0000-0000-00000000bbbb'
  const c = { obraId: OBRA, usuarioId: '00000000-0000-0000-0000-0000000000a1', plantaId: null }
  const paraEventos = (linhas: Linha[]) => comRegistros({ eventosDe: new Map() } as unknown as DadosFvs, linhas).eventosDe
  const regras = { prazos: [], ligacoes: [{ id: 'l1', de: { ficha: ficha.codigo, item: 1 }, para: { ficha: ficha.codigo, item: 2 } }, { id: 'l2', de: { ficha: ficha.codigo, item: 2 }, para: { ficha: ficha.codigo, item: 3 } }] }

  it('C com a observação do prazo fica gravado; NA não leva observação', async () => {
    const r = await tocarItem(c, 'p1', ficha, 1, 'C', [], undefined, 'Marcado antes do prazo (libera em 22/11)')
    expect([r.resultado, r.observacao]).toEqual(['C', 'Marcado antes do prazo (libera em 22/11)'])
    const na = await tocarItem(c, 'p1', ficha, 2, 'NA', [], undefined, 'qualquer')
    expect(na.observacao).toBeNull()
  })

  it('lote: a observação do prazo vai só nos itens dela', async () => {
    const lote = await marcarLote(c, [{ id: 'p2', ficha, eventos: [] }], null, 'C', undefined, new Map([['p2#2', 'Marcado antes do prazo (libera em 22/11)']]))
    expect(lote.map((l) => [l.item, l.observacao])).toEqual([[1, null], [2, 'Marcado antes do prazo (libera em 22/11)'], [3, null]])
  })

  it('ligação: o C marca os itens ligados vazios, com a origem; o desfazer os limpa', async () => {
    const origem = await tocarItem(c, 'p3', ficha, 1, 'C', [])
    const ligados = await ligarDepoisDe(c, regras, 'p3', ficha, [1], paraEventos([origem]).get('p3') ?? [])
    expect(ligados.map((l) => [l.item, l.resultado])).toEqual([[2, 'C'], [3, 'C']])
    expect(String(ligados[0].observacao)).toMatch(/^Pela ligação: item 1/)
    expect(ligados.every((l) => l.lote_id)).toBe(true)
    const eventos = paraEventos([origem, ...ligados])
    const desfeitos = await desfazerLote(c, ligados, (id) => eventos.get(id) ?? [])
    expect(desfeitos.map((l) => [l.item, l.resultado])).toEqual([[2, null], [3, null]])
  })

  it('ligação não mexe no item já marcado à mão, e sem regras não grava nada', async () => {
    const na = await tocarItem(c, 'p4', ficha, 2, 'NA', [])
    const evs = paraEventos([na]).get('p4') ?? []
    expect(await ligarDepoisDe(c, regras, 'p4', ficha, [1], evs)).toEqual([])
    expect(await ligarDepoisDe(c, SEM_REGRAS, 'p4', ficha, [1], [])).toEqual([])
  })

  it('ligação entre peças: o C na área marca as peças de dentro dela, cada uma na ficha aberta dela; o desfazer limpa', async () => {
    const LAJE: Ficha = { ...ficha, id: 'f-laje', codigo: 'TESTE-PVS-LAJE', aplica_a: ['L'] }
    // a regra entre peças (área item 1 → peça item 2) e as da mesma peça (1 → 2 → 3)
    const entre = { prazos: [], ligacoes: [{ id: 'e1', entre: 'area' as const, de: { ficha: LAJE.codigo, item: 1 }, para: { ficha: ficha.codigo, item: 2 } }, ...regras.ligacoes] }
    const pecas = [
      { id: 'v1', nome: 'V1', fichas: [ficha], eventos: [], fichaCampoId: null },
      { id: 'v2', nome: 'V2', fichas: [ficha], eventos: [], fichaCampoId: 'fc9' },
      { id: 'v3', nome: 'V3', fichas: [ficha], eventos: [ev(2, 'NA', 1, { elemento_id: 'v3' })], fichaCampoId: null },
    ]
    const ligados = await ligarEntrePecas(c, entre, 'Laje 3', LAJE, [1], pecas)
    // v1 e v2: o item 2 (da área) e o 3 (corrente da própria peça); a v3 já tinha o item 2 marcado à mão
    expect(ligados.map((l) => [l.elemento_id, l.item, l.resultado, l.ficha_campo_id ?? null])).toEqual([
      ['v1', 2, 'C', null],
      ['v1', 3, 'C', null],
      ['v2', 2, 'C', 'fc9'],
      ['v2', 3, 'C', 'fc9'],
    ])
    expect(ligados[0].observacao).toBe(`Pela ligação: Laje 3 · item 1 (${ficha.itens[0].titulo})`)
    expect(ligados[1].observacao).toBe(`Pela ligação: item 2 (${ficha.itens[1].titulo})`)
    expect(new Set(ligados.map((l) => l.lote_id)).size).toBe(1)
    expect(ligados.every((l) => l.lote_id && !l.area_id)).toBe(true)
    // de novo, com o que já foi gravado: nada vazio, nada a gravar
    const eventos = paraEventos(ligados)
    const depois = pecas.map((p) => ({ ...p, eventos: [...p.eventos, ...(eventos.get(p.id) ?? [])] }))
    expect(await ligarEntrePecas(c, entre, 'Laje 3', LAJE, [1], depois)).toEqual([])
    // o "Desfazer" do aviso limpa os quatro, cada um na ficha aberta do próprio registro
    const desfeitos = await desfazerLote(c, ligados, (id) => eventos.get(id) ?? [])
    expect(desfeitos.map((l) => [l.elemento_id, l.item, l.resultado, l.ficha_campo_id ?? null])).toEqual([
      ['v1', 2, null, null],
      ['v1', 3, null, null],
      ['v2', 2, null, 'fc9'],
      ['v2', 3, null, 'fc9'],
    ])
    // sem regra entre peças, ou outro item da área: nada
    expect(await ligarEntrePecas(c, regras, 'Laje 3', LAJE, [1], pecas)).toEqual([])
    expect(await ligarEntrePecas(c, entre, 'Laje 3', LAJE, [3], pecas)).toEqual([])
  })
})

describe('hora vinda do servidor', () => {
  it('fica no formato único do app, qualquer que seja o fuso do banco', () => {
    expect(horaNormal('2026-11-05T12:00:00.123Z')).toBe('2026-11-05T12:00:00.123Z')
    expect(horaNormal('2026-11-05T12:00:00.123+00:00')).toBe('2026-11-05T12:00:00.123Z')
    expect(horaNormal('2026-11-05T09:00:00.123-03:00')).toBe('2026-11-05T12:00:00.123Z')
    expect(horaNormal('2026-11-05T09:00:00.123456-03:00')).toBe('2026-11-05T12:00:00.123Z')
    expect(horaNormal('2026-11-05T12:00:00+00:00')).toBe('2026-11-05T12:00:00.000Z')
    expect(horaNormal('sem data')).toBe('sem data')
  })

  it('vale o último de verdade: 10:30 em Brasília é depois de 13:00 UTC', () => {
    const d = comRegistros({ eventosDe: new Map() } as unknown as DadosFvs, [
      { id: 'b', elemento_id: 'x', ficha_id: 'f', item: 1, resultado: 'C', rodada: 1, usuario_id: 'u', criado_em_dispositivo: '2026-11-05T10:30:00.000-03:00' } as unknown as Linha,
      { id: 'a', elemento_id: 'x', ficha_id: 'f', item: 1, resultado: 'NC', rodada: 1, usuario_id: 'u', criado_em_dispositivo: '2026-11-05T13:00:00.000Z' } as unknown as Linha,
    ])
    expect(ultimosPorItem(d.eventosDe.get('x')!).get(1)!.id).toBe('b')
  })

  it('registro gravado com A e R (antes de 08/11/2026) é lido como C e NC, e a peça fica com NC', () => {
    expect([normalizarResultado('A'), normalizarResultado('R'), normalizarResultado('NA')]).toEqual(['C', 'NC', 'NA'])
    expect([normalizarResultado('C'), normalizarResultado('NC'), normalizarResultado(null), normalizarResultado('X')]).toEqual(['C', 'NC', null, null])
    const linha = (id: string, item: number, resultado: string | null) =>
      ({ id, elemento_id: 'x', ficha_id: ficha.id, item, resultado, rodada: 1, usuario_id: 'u', criado_em_dispositivo: `2026-11-05T10:0${item}:00.000Z` }) as unknown as Linha
    const d = comRegistros({ eventosDe: new Map() } as unknown as DadosFvs, [linha('a', 1, 'A'), linha('b', 2, 'NA'), linha('c', 3, 'R')])
    const evs = d.eventosDe.get('x')!
    expect(evs.map((e) => e.resultado)).toEqual(['C', 'NA', 'NC'])
    expect(situacaoDaPeca(ficha, evs)).toBe('reprovado')
    expect(reprovacoesDoItem(historico(evs, 3))).toHaveLength(1)
    // reinspeção de um R antigo vai para a rodada seguinte, como a de um NC
    expect(aoTocar(evs[2], 'C')).toEqual({ resultado: 'C', rodada: 2 })
  })
})

describe('aviso da sincronização', () => {
  it('recusado vem primeiro, depois sem internet, depois o que espera envio', () => {
    expect(avisoDaSincronizacao({ online: true, pendentes: 0, comErro: 0 })).toBe('')
    expect(avisoDaSincronizacao({ online: true, pendentes: 3, comErro: 0 })).toBe('3 registro(s) esperando envio.')
    expect(avisoDaSincronizacao({ online: false, pendentes: 3, comErro: 0 })).toMatch(/^Sem internet/)
    expect(avisoDaSincronizacao({ online: false, pendentes: 3, comErro: 2 })).toMatch(/^2 registro\(s\) recusado/)
    // sem conta não há servidor: nem "esperando envio" nem "quando a internet voltar"
    expect(avisoDaSincronizacao({ online: true, pendentes: 3, comErro: 0, local: true })).toBe('')
    expect(avisoDaSincronizacao({ online: false, pendentes: 3, comErro: 0, local: true })).toBe('')
  })
})

describe('nome de arquivo', () => {
  it('leva a data do aparelho: às 23h30 de Brasília ainda é hoje, mesmo que em UTC já seja amanhã', () => {
    expect(hojeNoAparelho(new Date(2026, 10, 5, 23, 30))).toBe('2026-11-05')
    expect(hojeNoAparelho(new Date(2026, 0, 9, 0, 1))).toBe('2026-01-09')
  })
})

describe('relógio do aparelho', () => {
  const agora = Date.parse('2026-11-05T12:00:00.000Z')

  it('nota o registro valendo com hora depois da deste aparelho', () => {
    expect(horaNaFrente({ criado_em_dispositivo: '2026-11-05T12:00:01.000Z' }, agora)).toBe(true)
    expect(horaNaFrente({ criado_em_dispositivo: '2026-11-05T11:59:59.000Z' }, agora)).toBe(false)
    expect(horaNaFrente({ criado_em_dispositivo: '2026-11-05T12:00:00.000Z' }, agora)).toBe(false)
    expect(horaNaFrente(undefined, agora)).toBe(false)
    // como vem do servidor, com fuso
    expect(horaNaFrente({ criado_em_dispositivo: '2026-11-05T12:00:01.5+00:00' }, agora)).toBe(true)
    expect(horaNaFrente({ criado_em_dispositivo: '2026-11-05T08:59:00-03:00' }, agora)).toBe(false)
  })

  it('o aviso do item diz quem marcou e quando, com o ano (relógio em 2099 não parece hoje)', () => {
    const t = avisoHoraNaFrente('Pessoa Dois', '2099-11-05T15:00:00.000Z')
    expect(t).toMatch(/Pessoa Dois/)
    expect(t).toMatch(/2099/)
    expect(t).toMatch(/A sua foi gravada/)
  })

  it('registro da obra mais de 10 min à frente da hora do aparelho', () => {
    const doEvento = (iso: string) => ({ id: iso, criado_em_dispositivo: iso }) as unknown as EventoFvs
    const comEventos = (...isos: string[]) => ({ eventosDe: new Map([['p1', isos.map(doEvento)]]) })
    expect(registroNaFrente(comEventos('2026-11-05T12:05:00.000Z', '2026-11-05T11:00:00.000Z'), agora)).toBeNull()
    expect(registroNaFrente(comEventos('2026-11-05T11:00:00.000Z', '2099-01-01T00:00:00.000Z', '2026-11-05T12:30:00.000Z'), agora)?.criado_em_dispositivo).toBe('2099-01-01T00:00:00.000Z')
    expect(registroNaFrente({ eventosDe: new Map() }, agora)).toBeNull()
  })

  it('relógio antes da data do pacote da obra', () => {
    expect(relogioAntesDoPacote(agora, '2026-11-05T12:30:00.000Z')).toBe(true)
    expect(relogioAntesDoPacote(agora, '2026-11-05T12:05:00.000Z')).toBe(false)
    expect(relogioAntesDoPacote(agora, '2026-11-01T12:00:00.000Z')).toBe(false)
    expect(relogioAntesDoPacote(agora, null)).toBe(false)
  })

  it('toque não gravado: explica em português, sem texto técnico do navegador', () => {
    expect(textoDoErroDeGravacao({ name: 'QuotaExceededError' })).toMatch(/sem espaço/)
    expect(textoDoErroDeGravacao({ name: 'AbortError', inner: { name: 'QuotaExceededError' } })).toMatch(/sem espaço/)
    expect(textoDoErroDeGravacao(new Error('Confira a data'))).toBe('Confira a data')
    const doBanco = Object.assign(new Error('Transaction aborted'), { name: 'AbortError' })
    expect(textoDoErroDeGravacao(doBanco)).toMatch(/não foi gravada/)
    expect(textoDoErroDeGravacao(new TypeError('x'))).toMatch(/não foi gravada/)
    expect(textoDoErroDeGravacao(null)).toMatch(/não foi gravada/)
  })

  it('aviso de relógio atrasado só com diferença grande', () => {
    expect(relogioAtrasado(agora, '2026-11-05T12:30:00+00:00')).toBe(true)
    expect(relogioAtrasado(agora, '2026-11-05T12:05:00+00:00')).toBe(false)
    expect(relogioAtrasado(agora, '2026-11-01T12:00:00+00:00')).toBe(false)
    expect(relogioAtrasado(agora, null)).toBe(false)
    expect(relogioAtrasado(agora, undefined)).toBe(false)
  })
})

describe('busca de peça na obra', () => {
  const pavimentos = [{ id: 'sub' }, { id: 't' }, { id: 'p3' }]
  const p = (tipo: string, nome: string, pavimento_id: string) => ({ id: `${pavimento_id}-${nome}`, tipo, nome, pavimento_id })
  const pecas = [p('P', 'P124', 'p3'), p('P', 'P124', 'sub'), p('P', 'P12', 't'), p('V', 'V124', 't'), p('V', 'V12', 'p3'), p('P', 'P2', 't'), p('A', '303-01', 'p3')]
  const nomes = (t: string) => buscarPecas(pecas, t, pavimentos).achadas.map((x) => x.id)

  it('acha pelo começo do nome, em qualquer pavimento, sem ligar para maiúscula e espaço', () => {
    expect(nomes('P124')).toEqual(['sub-P124', 'p3-P124'])
    expect(nomes(' p 124 ')).toEqual(['sub-P124', 'p3-P124'])
    expect(nomes('P1')).toEqual(['t-P12', 'sub-P124', 'p3-P124'])
    expect(nomes('X')).toEqual([])
    expect(nomes('   ')).toEqual([])
  })

  it('só número acha pilar e viga, o nome exato primeiro', () => {
    expect(nomes('12')).toEqual(['t-P12', 'p3-V12', 'sub-P124', 'p3-P124', 't-V124'])
    expect(nomes('124')).toEqual(['sub-P124', 'p3-P124', 't-V124'])
  })

  it('ambiente pelo número do apartamento', () => {
    expect(nomes('303')).toEqual(['p3-303-01'])
  })

  it('limita a lista e diz quantas achou', () => {
    const muitas = Array.from({ length: 50 }, (_, i) => p('P', `P${i + 1}`, 't'))
    const r = buscarPecas(muitas, 'P', pavimentos, 10)
    expect(r.achadas.length).toBe(10)
    expect(r.total).toBe(50)
    expect(r.achadas[1].nome).toBe('P2') // ordem de número, e não de texto
  })
})

describe('fichas por tipo de peça', () => {
  it('pega a maior revisão de cada código e só as do tipo', () => {
    const fs: Ficha[] = [
      { ...ficha, id: 'a', revisao: '0' },
      { ...ficha, id: 'b', revisao: '2' },
      { ...ficha, id: 'c', revisao: '10' },
      { ...ficha, id: 'v', codigo: 'TESTE-PVS-2', aplica_a: ['V'] },
    ]
    expect(fichasPara('P', fs).map((f) => f.id)).toEqual(['c'])
    expect(fichasPara('V', fs).map((f) => f.id)).toEqual(['v'])
    expect(fichasPara('L', fs)).toEqual([])
    expect(etapasDa(ficha)).toEqual(['INÍCIO', 'EXECUÇÃO'])
  })
})

describe('registros novos nos dados da tela', () => {
  const vazio = {
    pavimentos: [],
    plantasDe: new Map(),
    plantaPorId: new Map(),
    anterioresDe: new Map(),
    vigenteDe: new Map(),
    fichas: [],
    fichaPorId: new Map(),
    fichasCampoDe: new Map(),
    fichasCampoSemPeca: [],
    localPorId: new Map(),
    fichasCampoDoLocal: new Map(),
    pecaPorId: new Map(),
    areasDe: new Map(),
    areaPorId: new Map(),
    eventosDe: new Map(),
    fotosDe: new Map(),
    arquivoPorId: new Map(),
    nomePorUsuario: new Map(),
    lancados: new Set<string>(),
    servidorMaisNovo: null,
    regras: SEM_REGRAS,
    redesenhos: new Map(),
    concretadas: new Set(),
  } as DadosFvs
  const paraEventoDeTeste = (id: string, elemento: string) =>
    ({ id, elemento_id: elemento, ficha_id: 'f1', item: 1, resultado: 'C', rodada: 1, observacao: null, lote_id: null, planta_id: null, usuario_id: '', criado_em_dispositivo: '2026-11-05T03:00:00.000Z' }) as const
  const linha = (id: string, elemento: string) =>
    ({ id, elemento_id: elemento, ficha_id: 'f1', item: 1, resultado: 'C', rodada: 1, usuario_id: 'u1', criado_em_dispositivo: '2026-11-06T10:00:00.000Z' }) as unknown as Linha

  it('entra sem mexer nos dados de antes', () => {
    const d = comRegistros(vazio, [linha('a', 'p1'), linha('b', 'p1'), linha('c', 'p2')])
    expect(d.eventosDe.get('p1')?.map((e) => e.id)).toEqual(['a', 'b'])
    expect(d.eventosDe.get('p2')?.map((e) => e.id)).toEqual(['c'])
    expect(vazio.eventosDe.size).toBe(0)
  })

  it('o item calculado pelo Concreto não entra na lista do que lançar; a marcação à mão entra', () => {
    const pecas = new Map([['p1', { id: 'p1', pavimento_id: 'pv', tipo: 'P', nome: 'P1', secao: null }]])
    const calculado = { ...paraEventoDeTeste('concreto:p1:1', 'p1'), origem_id: 'concreto', verificado_por: 'Concreto' }
    const d = { ...vazio, pecaPorId: pecas, fichas: [ficha], fichaPorId: new Map([[ficha.id, ficha]]), eventosDe: new Map([['p1', [calculado]]]) } as DadosFvs
    expect(paraLancarDaObra(d)).toEqual([])
    const comToque = comRegistros(d, [{ ...linha('t', 'p1'), item: 2 } as unknown as Linha])
    expect(paraLancarDaObra(comToque).map((l) => l.item)).toEqual([2])
  })

  it('o que a leitura do aparelho já trouxe não entra duas vezes', () => {
    const d = comRegistros(comRegistros(vazio, [linha('a', 'p1')]), [linha('a', 'p1'), linha('b', 'p1')])
    expect(d.eventosDe.get('p1')?.map((e) => e.id)).toEqual(['a', 'b'])
  })

  // Uma leitura do aparelho que só termina quando o teste manda.
  function leitorComLeiturasNaMao() {
    const pedidas: Array<(d: DadosFvs) => void> = []
    const publicados: DadosFvs[] = []
    const leitor = new DadosDaTela(() => new Promise<DadosFvs>((ok) => pedidas.push(ok)), (d) => publicados.push(d))
    const ids = (d: DadosFvs, peca = 'p1') => d.eventosDe.get(peca)?.map((e) => e.id) ?? []
    return { pedidas, publicados, leitor, ids }
  }

  it('marcação feita durante a leitura do aparelho não some da tela', async () => {
    const { pedidas, publicados, leitor, ids } = leitorComLeiturasNaMao()
    const primeira = leitor.recarregar()
    pedidas[0](vazio)
    await primeira
    const durante = leitor.recarregar() // a sincronização mandou reler
    leitor.registrados([linha('toque', 'p1')]) // a pessoa tocou enquanto o aparelho lia
    pedidas[1](vazio) // a leitura não viu o toque
    await durante
    expect(ids(publicados[publicados.length - 1])).toEqual(['toque'])
  })

  it('a leitura que já viu o toque não duplica', async () => {
    const { pedidas, publicados, leitor, ids } = leitorComLeiturasNaMao()
    const primeira = leitor.recarregar()
    pedidas[0](vazio)
    await primeira
    const durante = leitor.recarregar()
    leitor.registrados([linha('toque', 'p1')])
    pedidas[1](comRegistros(vazio, [linha('toque', 'p1')]))
    await durante
    expect(ids(publicados[publicados.length - 1])).toEqual(['toque'])
  })

  it('leitura antiga que termina depois da nova não passa por cima', async () => {
    const { pedidas, publicados, leitor, ids } = leitorComLeiturasNaMao()
    const antiga = leitor.recarregar()
    const nova = leitor.recarregar()
    pedidas[1](comRegistros(vazio, [linha('novo', 'p1')]))
    await nova
    pedidas[0](vazio)
    expect(ids(await antiga)).toEqual(['novo'])
    expect(ids(publicados[publicados.length - 1])).toEqual(['novo'])
  })

  it('toque depois da leitura entra direto, sem reler', async () => {
    const { pedidas, leitor, ids } = leitorComLeiturasNaMao()
    const primeira = leitor.recarregar()
    pedidas[0](vazio)
    await primeira
    expect(ids(leitor.registrados([linha('a', 'p1')]))).toEqual(['a'])
    expect(ids(leitor.registrados([linha('b', 'p1')]))).toEqual(['a', 'b'])
    expect(pedidas.length).toBe(1)
  })

  it('leitura que falha não trava as seguintes', async () => {
    let falha = true
    const publicados: DadosFvs[] = []
    const leitor = new DadosDaTela(async () => {
      if (falha) throw new Error('falhou')
      return vazio
    }, (d) => publicados.push(d))
    await expect(leitor.recarregar()).rejects.toThrow('falhou')
    falha = false
    await leitor.recarregar()
    expect(publicados.length).toBe(1)
  })
})

describe('lista de tabelas', () => {
  it('tabela que depende de migração nova fica por último: se faltar no servidor, não trava as outras', () => {
    // desde 21/11 os locais do sistema oficial vêm depois das fichas abertas; desde 23/11 os redesenhos
    // e o formulário da obra do Projetos (migrações mais novas) ficam por último
    expect(TABELAS_SINCRONIZADAS.slice(-6)).toEqual(['fvs_fichas_campo', 'fvs_areas', 'locais_sistema', 'importacoes', 'fvs_redesenhos', 'projetos_formularios'])
    expect(TABELAS_SINCRONIZADAS).toContain('fvs_eventos')
    expect(TABELAS_SINCRONIZADAS.indexOf('fvs_eventos')).toBeLessThan(TABELAS_SINCRONIZADAS.indexOf('fvs_fichas_campo'))
  })
})

describe('fichas abertas no sistema oficial (ficha duplicada)', () => {
  const porId = (id: string) => (id === 'f1' ? ficha : undefined)
  const aberta = (id: string, extra: Partial<FichaCampo> = {}): FichaCampo => ({
    id,
    elemento_id: 'p1',
    ficha_id: 'f1',
    codigo: `FVS-${id}`,
    local: 'Pavimento \\ Trecho 1 \\ Pilares \\ P1',
    ficha_codigo: 'TESTE-PVS-1',
    ficha_titulo: 'Pilares',
    status: 'Aceito',
    inspetor: 'Pessoa',
    atualizada_em: null,
    qtd_a: 0,
    qtd_r: 0,
    qtd_na: 0,
    ...extra,
  })
  const tudoA = (fc: string) => [1, 2, 3].map((n) => ev(n, 'C', 1, { ficha_campo_id: fc }))

  it('cada ficha aberta tem os seus registros: uma não apaga a outra', () => {
    const evs = [...tudoA('a'), ev(1, 'NC', 1, { ficha_campo_id: 'b' })]
    expect(situacaoDaFichaAberta(aberta('a'), porId, evs)).toBe('liberado')
    expect(situacaoDaFichaAberta(aberta('b'), porId, evs)).toBe('reprovado')
    // o R mais novo da outra ficha não muda o item nesta
    expect(ultimosPorItem(daFichaAberta(evs, 'a')).get(1)?.resultado).toBe('C')
  })

  it('na planta, a peça duplicada fica com NC se qualquer uma tiver R', () => {
    const evs = [...tudoA('a'), ev(1, 'NC', 1, { ficha_campo_id: 'b' })]
    expect(situacaoDoLocal(ficha, [aberta('a'), aberta('b')], porId, evs)).toBe('reprovado')
  })

  it('duas aprovadas = liberado; aprovada e agendada = em andamento; duas vazias = pendente', () => {
    const duas = [aberta('a'), aberta('b')]
    expect(situacaoDoLocal(ficha, duas, porId, [...tudoA('a'), ...tudoA('b')])).toBe('liberado')
    expect(situacaoDoLocal(ficha, duas, porId, tudoA('a'))).toBe('andamento')
    expect(situacaoDoLocal(ficha, duas, porId, [])).toBe('nada')
  })

  it('combinar: a regra de várias fichas juntas', () => {
    expect(combinarSituacoes([])).toBe('nada')
    expect(combinarSituacoes(['liberado', 'reprovado'])).toBe('reprovado')
    expect(combinarSituacoes(['liberado', 'liberado'])).toBe('liberado')
    expect(combinarSituacoes(['nada', 'liberado'])).toBe('andamento')
  })

  it('sem ficha aberta, continua valendo a ficha padrão do tipo, com os registros do app', () => {
    const evs = [1, 2, 3].map((n) => ev(n, 'C'))
    expect(situacaoDoLocal(ficha, [], porId, evs)).toBe('liberado')
    expect(situacaoDoLocal(undefined, [], porId, evs)).toBe('nada')
  })

  it('marcação feita só no app não some quando a ficha do sistema oficial chega', () => {
    // ficha única (23/11): o marcado só no app entra na ficha aberta, com a regra item a item de 21/11
    const doSistema = () => [1, 2, 3].map((n) => ev(n, 'C', 1, { ficha_campo_id: 'a', origem_id: `cp${n}` }))
    const doApp = [ev(1, 'NC')]
    expect(situacaoDoLocal(ficha, [aberta('a')], porId, [...doApp, ...doSistema()])).toBe('reprovado')
    const comA = [1, 2, 3].map((n) => ev(n, 'C'))
    expect(situacaoDoLocal(ficha, [aberta('a')], porId, [...comA, ...doSistema()])).toBe('liberado')
    // a correção feita no app depois do NC de lá libera o item
    const ncLa = [ev(1, 'NC', 1, { ficha_campo_id: 'a', origem_id: 'cp9' }), ev(2, 'C', 1, { ficha_campo_id: 'a', origem_id: 'cp8' }), ev(3, 'C', 1, { ficha_campo_id: 'a', origem_id: 'cp7' })]
    expect(situacaoDoLocal(ficha, [aberta('a')], porId, ncLa)).toBe('reprovado')
    expect(situacaoDoLocal(ficha, [aberta('a')], porId, [...ncLa, ev(1, 'C', 2)])).toBe('liberado')
    expect(situacaoDaFichaAberta(fichaSoNoApp(ficha), porId, doApp)).toBe('reprovado')
    expect(fichaSoNoApp(ficha).id).toBe(SO_NO_APP)
  })

  it('lista de duplicadas: só peça com mais de uma ficha, em ordem de pavimento e número', () => {
    const pecas = [
      { id: 'p10', tipo: 'P', nome: 'P10', pavimento_id: 'pav1' },
      { id: 'p9', tipo: 'P', nome: 'P9', pavimento_id: 'pav1' },
      { id: 'v1', tipo: 'V', nome: 'V1', pavimento_id: 'pav0' },
      { id: 'p1', tipo: 'P', nome: 'P1', pavimento_id: 'pav0' },
    ]
    const fichas = new Map([
      ['p10', [aberta('a'), aberta('b')]],
      ['p9', [aberta('c', { local: 'X \\ Trecho 2 \\ P9' }), aberta('d')]],
      ['v1', [aberta('e'), aberta('f')]],
      ['p1', [aberta('g')]],
    ])
    const l = listarDuplicadas(pecas, fichas, [{ id: 'pav0' }, { id: 'pav1' }])
    expect(l.map((x) => x.pecaNome)).toEqual(['V1', 'P9', 'P10'])
    expect(l[1].fichas.map((f) => f.id)).toEqual(['c', 'd'])
    expect(l[1].local).toContain('Trecho 2')
  })

  it('ficha aberta de um modelo que não está cadastrado não dá erro', () => {
    expect(situacaoDaFichaAberta(aberta('a', { ficha_id: null }), porId, [])).toBe('nada')
    expect(situacaoDaFichaAberta(aberta('a', { ficha_id: 'outra' }), porId, [])).toBe('nada')
  })

  it('o painel abre na ficha que pede atenção', () => {
    const evs = [...tudoA('a'), ev(1, 'NC', 1, { ficha_campo_id: 'b' })]
    expect(ordenarFichasAbertas([aberta('a'), aberta('b'), aberta('c')], porId, evs).map((f) => f.id)).toEqual(['b', 'c', 'a'])
  })

  it('resumo do pavimento conta a peça duplicada uma vez, com a situação combinada', () => {
    const evs = [...tudoA('a'), ev(1, 'NC', 1, { ficha_campo_id: 'b' })]
    const campo = { fichasDe: (id: string) => (id === 'p1' ? [aberta('a'), aberta('b')] : []), ficha: porId }
    const r = resumoDaEstrutura([{ id: 'p1', tipo: 'P' }, { id: 'p2', tipo: 'P' }], [ficha], (id) => (id === 'p1' ? evs : []), campo)
    expect(r).toEqual({ total: 2, liberadas: 0, paraConcretar: 0, comR: 1, duplicadas: 1 })
  })
})

describe('fichas por ambiente (alvenaria, reboco...)', () => {
  const alvenaria: Ficha = { ...ficha, id: 'fa', codigo: 'TESTE-PVS-013', titulo: 'Alvenaria', aplica_a: ['A'] }
  const reboco: Ficha = { ...ficha, id: 'fr', codigo: 'TESTE-PVS-015', titulo: 'Reboco', aplica_a: ['A'] }
  const fichas = [ficha, alvenaria, reboco]
  const locais = [
    { id: 'p1', tipo: 'P' },
    { id: 'a1', tipo: 'A' },
    { id: 'a2', tipo: 'A' },
    { id: 'a3', tipo: 'A' },
  ]
  const tudoA = (elemento_id: string, ficha_id: string) => [1, 2, 3].map((n) => ev(n, 'C', 1, { elemento_id, ficha_id }))

  it('o ambiente tem as fichas dele, em ordem de código; pilar não vê ficha de ambiente', () => {
    expect(fichasPara('A', fichas).map((f) => f.id)).toEqual(['fa', 'fr'])
    expect(fichasPara('P', fichas).map((f) => f.id)).toEqual(['f1'])
  })

  it('cada ficha tem a sua situação no mesmo ambiente', () => {
    const evs = tudoA('a1', 'fa')
    expect(situacaoDaPeca(alvenaria, evs)).toBe('liberado')
    expect(situacaoDaPeca(reboco, evs)).toBe('nada')
  })

  it('resumo do pavimento: só as fichas começadas, contando liberados e com NC', () => {
    const evs = new Map<string, EventoFvs[]>([
      ['a1', tudoA('a1', 'fa')],
      ['a2', [ev(1, 'NC', 1, { elemento_id: 'a2', ficha_id: 'fa' })]],
      ['p1', tudoA('p1', 'f1')],
    ])
    const eventosDe = (id: string) => evs.get(id) ?? []
    const r = resumoDosAmbientes(locais, fichas, eventosDe)
    expect(r.total).toBe(3)
    expect(r.servicos.map((s) => [s.ficha.id, s.liberados, s.comR])).toEqual([['fa', 1, 1]])
    // a estrutura não conta ambiente, e o ambiente não conta pilar
    expect(resumoDaEstrutura(locais, fichas, eventosDe)).toEqual({ total: 1, liberadas: 1, paraConcretar: 0, comR: 0, duplicadas: 0 })
  })

  it('resumo: a ficha conta só os ambientes em que vale (tabela ficha × tipo de cômodo)', () => {
    const evs = new Map<string, EventoFvs[]>([['a1', tudoA('a1', 'fa')]])
    const codigoFa = fichas.find((f) => f.id === 'fa')!.codigo
    const r = resumoDosAmbientes(locais, fichas, (id) => evs.get(id) ?? [], (id, codigo) => !(id === 'a2' && codigo === codigoFa))
    expect(r.total).toBe(3)
    expect(r.servicos.map((s) => [s.ficha.id, s.liberados, s.total])).toEqual([['fa', 1, 2]])
  })

  it('item desmarcado não conta como ficha começada', () => {
    const evs = [ev(1, 'C', 1, { elemento_id: 'a1', ficha_id: 'fr' }), ev(1, null, 1, { elemento_id: 'a1', ficha_id: 'fr' })]
    const r = resumoDosAmbientes(locais, fichas, (id) => (id === 'a1' ? evs : []))
    expect(r.servicos).toEqual([])
  })
})

describe('pacote de planta no aparelho', () => {
  const eu = { obraId: 'obra-1', usuarioId: 'u1' }
  const manifest = {
    formato: 1,
    planta_id: 'planta-1',
    trecho: 'Trecho 1',
    prancha: 'X-R00',
    revisao: 'R00',
    largura: 100,
    altura: 50,
    tile: 512,
    niveis: [0],
    elementos: { p1: { tipo: 'P', nome: 'P1', secao: '', rotulo: [0, 0, 1, 1], polys: [], detalhe: 'P_P1' } },
    detalhes: { P_P1: { titulo: 'P1', prancha: 'Y', aco: false } },
    pedacos: { 't:0/0/0': [0, 3], 'd:P_P1': [3, 2] },
  }

  it('confere formato e pedaços', () => {
    expect(() => conferirManifest({ ...manifest, formato: 2 }, 5)).toThrow(/formato/)
    expect(() => conferirManifest(manifest, 4)).toThrow(/corrompido/)
    expect(conferirManifest(manifest, 5).planta_id).toBe('planta-1')
  })

  it('guarda, abre, corta os pedaços e limpa o que não serve mais', async () => {
    await guardarPacote(JSON.stringify(manifest), new Blob([new Uint8Array([1, 2, 3, 4, 5])]), eu)
    expect([...(await pacotesNoAparelho()).keys()]).toEqual(['planta-1'])
    const p = await abrirPacote('planta-1')
    expect(p).not.toBeNull()
    const det = await p!.pedaco('d:P_P1')!.arrayBuffer()
    expect([...new Uint8Array(det)]).toEqual([4, 5])
    expect(p!.pedaco('t:9/9/9')).toBeUndefined()
    expect(await limparPacotes(eu, new Set(['planta-1']))).toBe(0)
    expect(await limparPacotes(eu, new Set())).toBe(1)
    expect(await abrirPacote('planta-1')).toBeNull()
  })

  it('limpeza: sai o que é de outra pessoa ou revisão antiga desta obra; outra obra da mesma pessoa fica', async () => {
    const bin = () => new Blob([new Uint8Array([1, 2, 3, 4, 5])])
    const m = (id: string) => JSON.stringify({ ...manifest, planta_id: id })
    await guardarPacote(m('minha-vigente'), bin(), eu)
    await guardarPacote(m('minha-antiga'), bin(), eu)
    await guardarPacote(m('minha-outra-obra'), bin(), { obraId: 'obra-2', usuarioId: 'u1' })
    await guardarPacote(m('de-outra-pessoa'), bin(), { obraId: 'obra-2', usuarioId: 'u2' })
    expect(await limparPacotes(eu, new Set(['minha-vigente']))).toBe(2)
    expect([...(await pacotesNoAparelho()).keys()].sort()).toEqual(['minha-outra-obra', 'minha-vigente'])
    await limparPacotes({ obraId: 'obra-2', usuarioId: 'u1' }, new Set())
    await limparPacotes(eu, new Set())
  })

  it('entrega a planta no formato de desenho (Concreto), com o id da peça', async () => {
    await guardarPacote(JSON.stringify(manifest), new Blob([new Uint8Array([1, 2, 3, 4, 5])]), eu)
    const p = await abrirPacote('planta-1')
    const d = plantaDeDesenho(p!, 'setor-1', '3º · Trecho 1')
    expect(d.id).toBe('setor-1')
    expect(d.ref).toBe('setor-1@R00')
    expect(d.elementos.map((e) => [e.id, e.tipo, e.nome])).toEqual([['p1', 'P', 'P1']])
    expect(d.fundo.tile).toBe(512)
    // pedaço em branco não vem no pacote: imagem transparente, senão o navegador desenha uma borda
    expect(d.fundo.url(9, 9, 9)).toMatch(/^data:image\//)
    await limparPacotes(eu, new Set())
  })

  it('planta de ambientes: guarda o apartamento de cada ambiente e não vai para o Concreto', async () => {
    const amb = {
      ...manifest,
      planta_id: 'planta-amb',
      trecho: 'Ambientes',
      elementos: { a1: { tipo: 'A', nome: '303-01', secao: '12,1 m²', grupo: 'Apto 303', rotulo: [0, 0, 1, 1], polys: [[[0, 0], [1, 0], [1, 1]]] } },
      detalhes: {},
      pedacos: { 't:0/0/0': [0, 3] },
    }
    await guardarPacote(JSON.stringify(amb), new Blob([new Uint8Array([1, 2, 3])]), eu)
    const p = await abrirPacote('planta-amb')
    expect(p!.manifest.elementos.a1.grupo).toBe('Apto 303')
    expect(ehPlantaDeEstrutura(p!)).toBe(false)
    expect(plantaDeDesenho(p!, 'setor-a', '3º · Ambientes').elementos).toEqual([])
    await guardarPacote(JSON.stringify(manifest), new Blob([new Uint8Array([1, 2, 3, 4, 5])]), eu)
    expect(ehPlantaDeEstrutura((await abrirPacote('planta-1'))!)).toBe(true)
    await limparPacotes(eu, new Set())
  })

  it('peças do aparelho: em que plantas cada uma aparece', async () => {
    const com = (planta_id: string, pecas: string[]) =>
      JSON.stringify({ ...manifest, planta_id, detalhes: {}, pedacos: {}, elementos: Object.fromEntries(pecas.map((id) => [id, { tipo: 'P', nome: id, secao: '', rotulo: [0, 0, 1, 1], polys: [] }])) })
    await guardarPacote(com('t1', ['a', 'b']), new Blob([]), eu)
    await guardarPacote(com('t2', ['b', 'c']), new Blob([]), eu)
    const m = await pecasNoAparelho()
    expect([...m.get('a')!]).toEqual(['t1'])
    expect([...m.get('b')!].sort()).toEqual(['t1', 't2'])
    expect(m.get('z')).toBeUndefined()
    await limparPacotes(eu, new Set())
  })

  it('download conta os bytes, avisa o progresso, confere o arquivo e guarda', async () => {
    const hash = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource))].map((x) => x.toString(16).padStart(2, '0')).join('')
    const texto = new TextEncoder().encode(JSON.stringify({ ...manifest, planta_id: 'baixada' }))
    const bin = new Uint8Array([1, 2, 3, 4, 5])
    const arquivos = {
      m: { id: 'm', caminho: 'x/manifest.json', hash: await hash(texto), tamanho: texto.length },
      p: { id: 'p', caminho: 'x/pacote.bin', hash: await hash(bin), tamanho: bin.length },
    }
    const baixar = (caminho: string, aoBytes?: (n: number) => void) => {
      const dados = caminho.endsWith('.bin') ? bin : texto
      // dois pedaços, como numa conexão de verdade
      const corpo = new ReadableStream({
        start(c) {
          c.enqueue(dados.slice(0, 2))
          c.enqueue(dados.slice(2))
          c.close()
        },
      })
      return lerComProgresso(new Response(corpo), aoBytes)
    }
    const fracoes: number[] = []
    const g = await baixarPacote(baixar, arquivos.m, arquivos.p, eu, (f) => fracoes.push(f))
    expect(g.planta_id).toBe('baixada')
    expect(fracoes[fracoes.length - 1]).toBe(1)
    expect([...fracoes].sort((a, b) => a - b)).toEqual(fracoes)
    expect((await pacotesNoAparelho()).has('baixada')).toBe(true)
    await expect(baixarPacote(baixar, { ...arquivos.m, hash: '0'.repeat(64) }, arquivos.p, eu)).rejects.toThrow(/diferente do registrado/)
    await limparPacotes(eu, new Set())
  })

  it('planta já no aparelho não baixa de novo: abrir duas vezes = um download (limite de dados, 24/11)', async () => {
    const hash = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource))].map((x) => x.toString(16).padStart(2, '0')).join('')
    const texto = new TextEncoder().encode(JSON.stringify({ ...manifest, planta_id: 'uma-vez' }))
    const bin = new Uint8Array([1, 2, 3, 4, 5])
    const pedidos: string[] = []
    usarFonteDeArquivos(async (caminho) => {
      pedidos.push(caminho)
      return new Blob([caminho.endsWith('.bin') ? bin : texto])
    })
    const planta = {
      id: 'uma-vez',
      manifest: { id: 'm', caminho: 'o/fvs/plantas/uma-vez/manifest.json', hash: await hash(texto), tamanho: texto.length },
      pacote: { id: 'p', caminho: 'o/fvs/plantas/uma-vez/pacote.bin', hash: await hash(bin), tamanho: bin.length },
    } as unknown as Planta
    // duas telas pedindo ao mesmo tempo (menu e FVS): um download só
    await Promise.all([baixarPlanta(planta, eu), baixarPlanta(planta, eu)])
    expect(pedidos).toHaveLength(2)
    // abrir de novo, recarregar, trocar de pavimento e voltar: zero bytes do servidor
    const fracoes: number[] = []
    expect((await baixarPlanta(planta, eu, (f) => fracoes.push(f))).planta_id).toBe('uma-vez')
    await baixarPlanta(planta, eu)
    expect(pedidos).toHaveLength(2)
    expect(fracoes).toEqual([1])
    // outra pessoa no mesmo aparelho: o pacote passa a ser dela, sem baixar (a limpeza não tira)
    const outra = { obraId: 'obra-1', usuarioId: 'u2' }
    await baixarPlanta(planta, outra)
    expect(pedidos).toHaveLength(2)
    expect(await limparPacotes(outra, new Set(['uma-vez']))).toBe(0)
    // arquivo diferente no servidor com o mesmo id (não acontece: a revisão nova tem id novo): baixa
    const bin2 = new Uint8Array([9, 9, 9, 9, 9])
    usarFonteDeArquivos(async (caminho) => {
      pedidos.push(caminho)
      return new Blob([caminho.endsWith('.bin') ? bin2 : texto])
    })
    await baixarPlanta({ ...planta, pacote: { ...planta.pacote!, hash: await hash(bin2) } } as Planta, outra)
    expect(pedidos).toHaveLength(4)
    await limparPacotes(outra, new Set())
  })

  it('sem como contar, lê de uma vez; aparelho cheio tem aviso próprio', async () => {
    expect(await (await lerComProgresso(new Response('abc'))).text()).toBe('abc')
    expect(textoDoErroDeDownload({ name: 'QuotaExceededError' })).toMatch(/sem espaço/)
    expect(textoDoErroDeDownload({ name: 'AbortError', inner: { name: 'QuotaExceededError' } })).toMatch(/sem espaço/)
    expect(textoDoErroDeDownload(new Error('Falhou'))).toBe('Falhou')
    expect(textoDoErroDeDownload(null)).toMatch(/Confira a internet/)
    expect(textoDoErroDeDownload(new TypeError('Failed to fetch'))).toMatch(/Confira a internet/)
  })

  it('conexão parada no meio do download: desiste, solta a conexão e explica', async () => {
    let cancelou = false
    // chega um pedaço e depois nada, sem erro nenhum: é assim que a internet fraca para
    const corpo = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array([1, 2]))
      },
      cancel() {
        cancelou = true
      },
    })
    const chegou: number[] = []
    const erro = await lerComProgresso(new Response(corpo), (n) => chegou.push(n), 20).catch((e) => e)
    expect(erro).toBeInstanceOf(DownloadParado)
    expect(textoDoErroDeDownload(erro)).toMatch(/conexão parou/)
    expect(chegou).toEqual([2])
    expect(cancelou).toBe(true)
  })

  it('download lento que continua chegando não é dado como parado', async () => {
    const corpo = new ReadableStream({
      async start(c) {
        for (const b of [1, 2, 3, 4, 5, 6]) {
          await new Promise((ok) => setTimeout(ok, 60))
          c.enqueue(new Uint8Array([b]))
        }
        c.close()
      },
    })
    // o limite é sem chegar nada, e não do arquivo inteiro: 360 ms no total, com limite de 300 ms.
    // Folga grande entre um pedaço e outro, para o teste não falhar com o PC ocupado.
    const b = await lerComProgresso(new Response(corpo), () => {}, 300)
    expect(b.size).toBe(6)
  })

  it('comPrazo devolve o resultado ou o erro da própria promessa e não deixa relógio rodando', async () => {
    expect(await comPrazo(Promise.resolve(7), 1000)).toBe(7)
    await expect(comPrazo(Promise.reject(new Error('Outro')), 1000)).rejects.toThrow('Outro')
    await expect(comPrazo(new Promise(() => {}), 5)).rejects.toBeInstanceOf(DownloadParado)
  })

  it('revisões: acha a cadeia do trecho e a planta vigente de cada uma', () => {
    const { anterioresDe, vigenteDe } = cadeiaDeRevisoes([
      { id: 'r0', revisao: 'R00' },
      { id: 'r1', revisao: 'R01', substitui_id: 'r0' },
      { id: 'r2', revisao: 'R02', substitui_id: 'r1' },
      { id: 'outro', revisao: 'R00' },
    ])
    expect(anterioresDe.get('r2')).toEqual([
      { id: 'r1', revisao: 'R01' },
      { id: 'r0', revisao: 'R00' },
    ])
    expect(anterioresDe.has('outro')).toBe(false)
    expect(anterioresDe.has('r1')).toBe(false)
    expect(vigenteDe.get('r0')).toBe('r2')
    expect(vigenteDe.get('r1')).toBe('r2')
    expect(vigenteDe.has('r2')).toBe(false)
    expect(vigenteDe.has('outro')).toBe(false)
  })

  it('revisões: dado torto (ciclo, anterior que não chegou) não trava', () => {
    expect(cadeiaDeRevisoes([{ id: 'a', substitui_id: 'b' }, { id: 'b', substitui_id: 'a' }]).anterioresDe.size).toBe(0)
    const r = cadeiaDeRevisoes([{ id: 'c', substitui_id: 'nao-chegou', revisao: 'R05' }])
    expect(r.anterioresDe.size).toBe(0)
    expect(r.vigenteDe.size).toBe(0)
  })

  it('revisão nova: a anterior fica no aparelho até a nova chegar, e aí sai', () => {
    const anterioresDe = new Map([['nova', [{ id: 'r1', revisao: 'R01' }, { id: 'r0', revisao: 'R00' }]]])
    // a nova ainda não veio: abre na anterior mais nova que está aqui; as mais antigas podem sair
    expect(pacoteDaPlanta('nova', anterioresDe.get('nova'), new Set(['r1', 'r0']))).toBe('r1')
    expect(pacoteDaPlanta('nova', anterioresDe.get('nova'), new Set(['r0']))).toBe('r0')
    expect(pacoteDaPlanta('nova', anterioresDe.get('nova'), new Set())).toBeUndefined()
    expect([...pacotesAManter(['nova', 'sem-revisao'], anterioresDe, new Set(['r1', 'r0']))].sort()).toEqual(['nova', 'r1', 'sem-revisao'])
    // a nova chegou: nenhuma anterior fica
    expect(pacoteDaPlanta('nova', anterioresDe.get('nova'), new Set(['nova', 'r1']))).toBe('nova')
    expect([...pacotesAManter(['nova'], anterioresDe, new Set(['nova', 'r1']))]).toEqual(['nova'])
  })

  it('mesma revisão com id novo (prancha publicada de novo): "Planta atualizada", não "Revisão nova"', () => {
    // revisão mudou de fato: avisa a revisão nova e diz qual está no aparelho
    expect(textosDaRevisao({ revisao: 'R02' }, { id: 'velha', revisao: 'R01' })).toEqual({
      aviso: 'Revisão nova: no aparelho ainda está a R01',
      abrir: 'Abrir R01',
      baixar: 'Baixar R02',
      faixa: 'Planta na revisão R01. Já saiu a R02.',
    })
    // mesma revisão (o id da planta é outro): planta atualizada, baixar de novo
    const mesma = textosDaRevisao({ revisao: 'R02' }, { id: 'velha', revisao: 'R02' })
    expect(mesma).toEqual({ aviso: 'Planta atualizada · Baixar de novo', abrir: 'Abrir', baixar: 'Baixar de novo', faixa: 'Planta atualizada no servidor.' })
    expect(Object.values(mesma).join(' ')).not.toMatch(/Revisão nova|R02/)
    // espaço sobrando não vira revisão nova
    expect(textosDaRevisao({ revisao: ' R02' }, { id: 'velha', revisao: 'R02 ' }).aviso).toBe('Planta atualizada · Baixar de novo')
  })

  it('aviso do pavimento e da disciplina antes de entrar: revisão nova vence planta atualizada', () => {
    const anterioresDe = new Map([
      ['a2', [{ id: 'a1', revisao: 'R02' }]],
      ['b2', [{ id: 'b1', revisao: 'R02' }]],
      ['c2', [{ id: 'c1', revisao: 'R01' }]],
    ])
    const a2 = { id: 'a2', revisao: 'R02' }
    const b2 = { id: 'b2', revisao: 'R02' }
    const c2 = { id: 'c2', revisao: 'R02' }
    // tudo baixado (ou nada a baixar): sem aviso
    expect(avisoDasPlantas([a2, c2], anterioresDe, new Set(['a2', 'c2']))).toBeNull()
    expect(avisoDasPlantas([a2], anterioresDe, new Set())).toBeNull()
    // só mesma revisão com id novo
    expect(avisoDasPlantas([a2], anterioresDe, new Set(['a1']))).toBe('Planta atualizada · Baixar de novo')
    expect(avisoDasPlantas([a2, b2], anterioresDe, new Set(['a1', 'b1']))).toBe('2 plantas atualizadas · Baixar de novo')
    // uma com revisão nova de fato: vence
    expect(avisoDasPlantas([a2, c2], anterioresDe, new Set(['a1', 'c1']))).toBe('Revisão nova para baixar')
  })

  it('limpeza com dados lidos antes da sincronização não apaga a planta que acabou de baixar (24/11)', async () => {
    const bin = () => new Blob([new Uint8Array([1, 2, 3, 4, 5])])
    for (const id of ['baixada-agora', 'nova', 'r1']) await guardarPacote(JSON.stringify({ ...manifest, planta_id: id }), bin(), eu)
    const noAparelho = await pacotesNoAparelho()
    // dados de antes do cadastro chegar: não conhecem planta nenhuma, então nada sai
    expect(await limparPacotes(eu, manterNaLimpeza(new Map(), new Map(), new Map(), noAparelho))).toBe(0)
    // dados novos: a revisão anterior (r1) sai porque a nova chegou; a desconhecida continua
    const anterioresDe = new Map([['nova', [{ id: 'r1', revisao: 'R01' }]]])
    expect(await limparPacotes(eu, manterNaLimpeza(new Map([['nova', 1]]), anterioresDe, new Map([['r1', 'nova']]), await pacotesNoAparelho()))).toBe(1)
    expect([...(await pacotesNoAparelho()).keys()].sort()).toEqual(['baixada-agora', 'nova'])
    await limparPacotes(eu, new Set())
  })

  it('revisão nova: abre o pacote que está no aparelho, o da vigente primeiro', async () => {
    const m = (id: string, revisao: string) => JSON.stringify({ ...manifest, planta_id: id, revisao })
    const bin = () => new Blob([new Uint8Array([1, 2, 3, 4, 5])])
    await guardarPacote(m('r0', 'R00'), bin(), eu)
    expect((await abrirPacoteOuAnterior('r1', ['r0']))!.manifest.revisao).toBe('R00')
    expect(await abrirPacoteOuAnterior('r1', [])).toBeNull()
    await guardarPacote(m('r1', 'R01'), bin(), eu)
    expect((await abrirPacoteOuAnterior('r1', ['r0']))!.manifest.revisao).toBe('R01')
    await limparPacotes(eu, new Set())
  })

  it('plantas vigentes: revisão nova substitui a antiga, uma por trecho', () => {
    const l = (id: string, setor: string, extra: Record<string, unknown> = {}) =>
      ({ id, pavimento_id: 'pv', setor_id: setor, criado_em_dispositivo: '2026-11-01T00:00:00Z', ...extra }) as unknown as Linha
    const v = plantasVigentes(
      [l('a', 's1'), l('b', 's1', { substitui_id: 'a' }), l('c', 's2'), l('d', 's3', { pavimento_id: 'outro' })],
      'pv',
    )
    expect(v.map((p) => p.id).sort()).toEqual(['b', 'c'])
  })
})

describe('item de esquadria por classe ou código (23/11)', () => {
  const porta = { codigo: 'PM80', classe: 'porta' }
  const janela = { codigo: 'JA120B', classe: 'janela' }
  const pcf = { codigo: 'PCF90', classe: 'porta' }
  it('true ou sem lista: vale em todas', () => {
    expect(esquadriaValeNoItem({ esquadrias: true }, porta)).toBe(true)
    expect(esquadriaValeNoItem({ esquadrias: [] }, janela)).toBe(true)
    expect(esquadriaValeNoItem(undefined, porta)).toBe(true)
  })
  it('por classe e pelo começo do código, sem ligar para maiúsculas', () => {
    expect(esquadriaValeNoItem({ esquadrias: ['janela'] }, janela)).toBe(true)
    expect(esquadriaValeNoItem({ esquadrias: ['janela'] }, porta)).toBe(false)
    expect(esquadriaValeNoItem({ esquadrias: ['pcf'] }, pcf)).toBe(true)
    expect(esquadriaValeNoItem({ esquadrias: ['PCF'] }, porta)).toBe(false)
    expect(esquadriaValeNoItem({ esquadrias: ['PCF', 'janela'] }, janela)).toBe(true)
  })
  it('esquadria sem dado: vale (como antes)', () => {
    expect(esquadriaValeNoItem({ esquadrias: ['janela'] }, undefined)).toBe(true)
  })
})

describe('peça concretada pelo Concreto (achado #2, 24/11)', () => {
  const cam = (fracao: number | null) => ({ caminhao_raiz: 'c', concretagem_raiz: 'k', sequencia: 1, nota_fiscal: null, data: '2026-11-20', fracao, parcial: false })

  it('o coeficiente é um só, com nome: 90%', () => {
    expect(COBERTURA_CONCRETADA).toBe(0.9)
  })

  it('pilar e viga: a soma das frações dos caminhões chega a 90% (incluída à mão conta inteira)', () => {
    const c = pecasConcretadas(
      new Map([
        ['inteira', [cam(1)]],
        ['duas_metades', [cam(0.5), cam(0.45)]],
        ['parte', [cam(0.6)]],
        ['a_mao', [cam(null)]],
      ]),
      new Map(),
    )
    expect([...c].sort()).toEqual(['a_mao', 'duas_metades', 'inteira'])
  })

  it('laje: a área da FVS coberta em pelo menos 90% pelas áreas dos caminhões', () => {
    const c = pecasConcretadas(new Map(), new Map([['l90', { cobertura: 0.9 }], ['l89', { cobertura: 0.89 }], ['l100', { cobertura: 1 }]]))
    expect([...c].sort()).toEqual(['l100', 'l90'])
  })

  it('só pilar, viga e laje pedem a concretagem; os outros tipos seguem como antes', () => {
    const c = new Set(['p1'])
    expect(concretadaDe(c, 'p1', 'P')).toBe(true)
    expect(concretadaDe(c, 'v1', 'V')).toBe(false)
    expect(concretadaDe(c, 'l1', 'L')).toBe(false)
    expect(concretadaDe(c, 'a1', 'A')).toBe(undefined)
    expect(concretadaDe(c, 'k1', 'K')).toBe(undefined)
    expect(concretadaDe(undefined, 'p1', 'P')).toBe(undefined)
  })
})

// Regras da obra (prazos e ligações), prazos e ligações entre fichas. Fichas fictícias da obra EXE.
// Decisões do Nicolas (18 e 19/11/2026): prazo só avisa; só C inicia prazo; ligação na mesma peça marca C,
// com a origem, e pode ser desfeita; marca à mão não é mexida.
import { describe, expect, it } from 'vitest'
import { alvosDaLigacao, ehDaLigacao, observacaoDaLigacao } from './ligacoes'
import { estadoDoPrazo, inicioDoPrazo, observacaoDoPrazo, perguntaDoPrazo, prazoPendente, seloDoPrazo, type ContextoDoPrazo } from './prazos'
import { lerRegras, regrasVigentes, SEM_REGRAS, type Prazo } from './regras'
import type { EventoFvs, Ficha, Resultado } from './situacao'

const VIGA: Ficha = {
  id: 'f-exe-vig',
  codigo: 'EXE-VIG',
  titulo: 'Viga (Obra Exemplo)',
  revisao: '0',
  aplica_a: ['V'],
  itens: [
    { n: 1, etapa: 'FORMAS', titulo: 'Fundo e escoramento' },
    { n: 2, etapa: 'FORMAS', titulo: 'Laterais' },
    { n: 3, etapa: 'CONCRETAGEM', titulo: 'Rastreabilidade' },
    { n: 4, etapa: 'CONCRETAGEM', titulo: 'Concretagem' },
    { n: 5, etapa: 'DESFORMA', titulo: 'Retirada do escoramento' },
    { n: 6, etapa: 'DESFORMA', titulo: 'Reescoramento' },
  ],
}

let seq = 0
function ev(item: number, resultado: Resultado | null, quando: string, ficha = VIGA): EventoFvs {
  seq++
  return {
    id: `e${String(seq).padStart(4, '0')}`,
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
  }
}

const RETIRADA: Prazo = { id: 'retirada', ficha: 'EXE-VIG', item: 5, dias: 21, depois_de: { tipo: 'concretagem' }, texto: 'Retirada do escoramento' }
const REESC: Prazo = { id: 'reesc', ficha: 'EXE-VIG', item: 6, dias: 7, depois_de: { tipo: 'item', ficha: 'EXE-VIG', item: 5 } }
const REGRAS = { prazos: [RETIRADA, REESC], ligacoes: [] }

const cx = (eventos: EventoFvs[], datasDoConcreto: string[] = []): ContextoDoPrazo => ({
  eventos,
  ficha: VIGA,
  fichaPorId: (id) => (id === VIGA.id ? VIGA : undefined),
  datasDoConcreto,
})

describe('regras da obra', () => {
  it('lê prazos e ligações e deixa de fora a entrada torta', () => {
    const r = lerRegras({
      prazos: [
        RETIRADA,
        { ...RETIRADA, id: 'sem-dias', dias: null },
        { ...RETIRADA, id: 'dias-texto', dias: '21' },
        { ...RETIRADA, id: 'quebrado', dias: 2.5 },
        { ...REESC, id: 'proprio', depois_de: { tipo: 'item', ficha: 'EXE-VIG', item: 6 } },
        { ...RETIRADA, id: 'sem-depois', depois_de: { tipo: 'outro' } },
        RETIRADA, // id repetido: vale o primeiro
      ],
      ligacoes: [
        { id: 'l1', de: { ficha: 'EXE-VIG', item: 1 }, para: { ficha: 'EXE-VIG', item: 2 } },
        { id: 'l2', de: { ficha: 'EXE-VIG', item: 1 }, para: { ficha: 'EXE-VIG', item: 1 } },
        { id: 'l3', de: { ficha: 'EXE-VIG' }, para: { ficha: 'EXE-VIG', item: 2 } },
      ],
    })
    expect(r.prazos.map((p) => p.id)).toEqual(['retirada'])
    expect(r.ligacoes.map((l) => l.id)).toEqual(['l1'])
  })
  it('sem regras, ou formato errado: nenhuma regra', () => {
    expect(lerRegras(null)).toBe(SEM_REGRAS)
    expect(lerRegras('x')).toBe(SEM_REGRAS)
    expect(lerRegras({ prazos: 'x' })).toBe(SEM_REGRAS)
    expect(regrasVigentes([])).toBe(SEM_REGRAS)
  })
  it('vale a linha mais nova da obra; apagada não conta', () => {
    const velha = { id: 'a', regras: { prazos: [RETIRADA] }, criado_em_servidor: '2026-11-18T10:00:00Z' }
    const nova = { id: 'b', regras: { prazos: [REESC] }, criado_em_servidor: '2026-11-19T10:00:00Z' }
    const apagada = { id: 'c', regras: { prazos: [] }, criado_em_servidor: '2026-11-20T10:00:00Z', apagado: true }
    expect(regrasVigentes([nova, velha, apagada]).prazos.map((p) => p.id)).toEqual(['reesc'])
    // só no aparelho (sem conta): a hora do aparelho
    expect(regrasVigentes([{ id: 'x', regras: { prazos: [RETIRADA] }, criado_em_dispositivo: '2026-11-19T00:00:00Z' }]).prazos).toHaveLength(1)
  })
})

describe('prazos', () => {
  it('conta da concretagem: o caminhão do Concreto vale antes do item da ficha', () => {
    const evs = [ev(4, 'C', '2026-11-01T15:00:00')]
    expect(inicioDoPrazo(RETIRADA, cx(evs))?.getDate()).toBe(1)
    expect(inicioDoPrazo(RETIRADA, cx(evs, ['2026-10-30']))?.getDate()).toBe(30)
    // mais de um caminhão: o mais novo
    expect(inicioDoPrazo(RETIRADA, cx([], ['2026-10-28', '2026-10-30', '2026-10-29']))?.getDate()).toBe(30)
  })
  it('sem concretagem marcada (ou só NA): sem início', () => {
    expect(inicioDoPrazo(RETIRADA, cx([]))).toBeNull()
    expect(inicioDoPrazo(RETIRADA, cx([ev(4, 'NA', '2026-11-01T15:00:00')]))).toBeNull()
    // concretagem desmarcada depois: sem início de novo
    expect(inicioDoPrazo(RETIRADA, cx([ev(4, 'C', '2026-11-01T15:00:00'), ev(4, null, '2026-11-01T16:00:00')]))).toBeNull()
  })
  it('conta de outro item: só o C dele inicia (NA não)', () => {
    expect(inicioDoPrazo(REESC, cx([ev(5, 'C', '2026-11-22T09:00:00')]))?.getDate()).toBe(22)
    expect(inicioDoPrazo(REESC, cx([ev(5, 'NA', '2026-11-22T09:00:00')]))).toBeNull()
    expect(inicioDoPrazo(REESC, cx([ev(5, 'C', '2026-11-22T09:00:00'), ev(5, 'NC', '2026-11-22T10:00:00')]))).toBeNull()
    // item de referência marcado numa revisão anterior da ficha (mesmo código) também vale
    const rev0 = { ...VIGA, id: 'f-exe-vig-r0' }
    const c = { ...cx([ev(5, 'C', '2026-11-22T09:00:00', rev0)]), fichaPorId: (id: string) => (id === rev0.id ? rev0 : id === VIGA.id ? VIGA : undefined) }
    expect(inicioDoPrazo(REESC, c)?.getDate()).toBe(22)
  })
  it('dias corridos; libera à meia-noite do dia início + dias (hora do aparelho)', () => {
    const inicio = new Date(2026, 10, 1, 15, 0)
    expect(estadoDoPrazo(RETIRADA, inicio, new Date(2026, 10, 21, 23, 59))).toMatchObject({ estado: 'aguardando', faltam: 1 })
    expect(estadoDoPrazo(RETIRADA, inicio, new Date(2026, 10, 22, 0, 0))).toMatchObject({ estado: 'cumprido' })
    expect(estadoDoPrazo(RETIRADA, inicio, new Date(2026, 10, 2, 8, 0))).toMatchObject({ estado: 'aguardando', faltam: 20 })
    expect(estadoDoPrazo({ ...RETIRADA, dias: 0 }, inicio, new Date(2026, 10, 1, 16, 0))).toMatchObject({ estado: 'cumprido' })
    expect(estadoDoPrazo(RETIRADA, null, new Date())).toEqual({ estado: 'sem_inicio' })
  })
  it('a data do caminhão (só dia) é o dia local, em qualquer fuso', () => {
    const d = inicioDoPrazo(RETIRADA, cx([], ['2026-11-01']))!
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 10, 1, 0])
  })
  it('o prazo que segura o item: sem início, ou o que libera mais tarde; nenhum segurando = null', () => {
    const agora = new Date(2026, 10, 10, 12)
    const longo: Prazo = { ...RETIRADA, id: 'longo', dias: 28 }
    const r = { prazos: [RETIRADA, longo], ligacoes: [] }
    const evs = [ev(4, 'C', '2026-11-01T15:00:00')]
    expect(prazoPendente(r, cx(evs), 5, agora)?.prazo.id).toBe('longo')
    expect(prazoPendente(r, cx(evs), 5, new Date(2026, 11, 1))).toBeNull()
    expect(prazoPendente(r, cx([]), 5, agora)?.situacao.estado).toBe('sem_inicio')
    // item sem prazo
    expect(prazoPendente(r, cx(evs), 2, agora)).toBeNull()
    expect(prazoPendente(SEM_REGRAS, cx(evs), 5, agora)).toBeNull()
  })
  it('textos: selo, pergunta e a observação gravada', () => {
    const agora = new Date(2026, 10, 19, 12)
    const p = prazoPendente(REGRAS, cx([ev(4, 'C', '2026-11-01T15:00:00')]), 5, agora)!
    expect(seloDoPrazo(p)).toBe('faltam 3 dias (libera em 22/11)')
    expect(perguntaDoPrazo(p, 'V12')).toContain('V12 · Retirada do escoramento: o prazo de 21 dias ainda não venceu (libera em 22/11)')
    expect(observacaoDoPrazo(p)).toBe('Marcado antes do prazo (libera em 22/11)')
    const sem = prazoPendente(REGRAS, cx([]), 6, agora)!
    expect(seloDoPrazo(sem)).toBe('prazo de 7 dias do item 5, ainda sem data')
    expect(observacaoDoPrazo(sem)).toBe('Marcado antes do prazo (sem data de início)')
    const um = prazoPendente(REGRAS, cx([ev(4, 'C', '2026-11-01T15:00:00')]), 5, new Date(2026, 10, 21, 9))!
    expect(seloDoPrazo(um)).toBe('falta 1 dia (libera em 22/11)')
  })
})

describe('ligação entre fichas (mesma peça)', () => {
  const PILAR: Ficha = { ...VIGA, id: 'f-exe-pil', codigo: 'EXE-PIL', aplica_a: ['P'] }
  const lig = (id: string, de: [string, number], para: [string, number]) => ({ id, de: { ficha: de[0], item: de[1] }, para: { ficha: para[0], item: para[1] } })

  it('o C na origem marca os itens ligados, em corrente, sem laço', () => {
    const r = { prazos: [], ligacoes: [lig('a', ['EXE-VIG', 1], ['EXE-VIG', 2]), lig('b', ['EXE-VIG', 2], ['EXE-VIG', 3]), lig('volta', ['EXE-VIG', 3], ['EXE-VIG', 1])] }
    const alvos = alvosDaLigacao(r, { ficha: VIGA, item: 1 }, [VIGA], [])
    expect(alvos.map((a) => a.item)).toEqual([2, 3])
    expect(alvos[1].origem.item).toBe(2)
  })
  it('item já marcado (C, NC ou NA) não é mexido, nem segue a corrente por ele', () => {
    const r = { prazos: [], ligacoes: [lig('a', ['EXE-VIG', 1], ['EXE-VIG', 2]), lig('b', ['EXE-VIG', 2], ['EXE-VIG', 3])] }
    expect(alvosDaLigacao(r, { ficha: VIGA, item: 1 }, [VIGA], [ev(2, 'NA', '2026-11-01T10:00:00')])).toEqual([])
    expect(alvosDaLigacao(r, { ficha: VIGA, item: 1 }, [VIGA], [ev(2, 'NC', '2026-11-01T10:00:00')])).toEqual([])
    // desmarcado (vazio) conta como vazio
    expect(alvosDaLigacao(r, { ficha: VIGA, item: 1 }, [VIGA], [ev(2, 'C', '2026-11-01T10:00:00'), ev(2, null, '2026-11-01T11:00:00')]).map((a) => a.item)).toEqual([2, 3])
  })
  it('só na mesma peça: ficha que a peça não usa, ou item que não existe, não marca nada', () => {
    const r = { prazos: [], ligacoes: [lig('a', ['EXE-VIG', 1], ['EXE-PIL', 2]), lig('b', ['EXE-VIG', 1], ['EXE-VIG', 99])] }
    expect(alvosDaLigacao(r, { ficha: VIGA, item: 1 }, [VIGA], [])).toEqual([])
    // a peça que usa as duas fichas: liga
    expect(alvosDaLigacao(r, { ficha: VIGA, item: 1 }, [VIGA, PILAR], []).map((a) => `${a.ficha.codigo}#${a.item}`)).toEqual(['EXE-PIL#2'])
  })
  it('a corrente para em 5 passos', () => {
    const r = { prazos: [], ligacoes: [1, 2, 3, 4, 5].map((n) => lig(`l${n}`, ['EXE-VIG', n], ['EXE-VIG', n + 1])) }
    const FICHA = { ...VIGA, itens: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ n, etapa: 'X', titulo: `Item ${n}` })) }
    const r6 = { ...r, ligacoes: [...r.ligacoes, lig('l6', ['EXE-VIG', 6], ['EXE-VIG', 7])] }
    expect(alvosDaLigacao(r6, { ficha: FICHA, item: 1 }, [FICHA], []).map((a) => a.item)).toEqual([2, 3, 4, 5, 6])
  })
  it('a observação diz de onde veio', () => {
    const r = { prazos: [], ligacoes: [lig('a', ['EXE-VIG', 4], ['EXE-VIG', 3])] }
    const [a] = alvosDaLigacao(r, { ficha: VIGA, item: 4 }, [VIGA], [])
    const obs = observacaoDaLigacao(a)
    expect(obs).toBe('Pela ligação: EXE-VIG item 4 (Concretagem)')
    expect(ehDaLigacao({ observacao: obs })).toBe(true)
    expect(ehDaLigacao({ observacao: 'outra' })).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
  apoiosDoIndice,
  avancoPorPavimento,
  concretoPorPavimento,
  doAgrupamento,
  ehItemDeArmadura,
  indiceDeApoios,
  juntarApoios,
  lerIndiceDeApoios,
  lajesParaConcretar,
  nomesDosResidenciais,
  porcento,
  residenciaisDasPecas,
  resumoDoConcreto,
  situacaoDaArmadura,
  type CaminhaoDoAvanco,
  type PecaDoAvanco,
} from './avanco'

// Obra EXE de mentira: 2 pavimentos, residenciais A e B, a viga V2 e a laje L1 na divisa.
const PAVS = [
  { id: 'pv1', nome: '1º Pavimento' },
  { id: 'pv2', nome: '2º Pavimento' },
]
const RES = [
  { nome: 'Residencial A', pilares: ['P1', 'P2'] },
  { nome: 'Residencial B', pilares: ['P3', 'P4'] },
]
const peca = (id: string, tipo: PecaDoAvanco['tipo'], nome: string, estado: PecaDoAvanco['estado'], extra: Partial<PecaDoAvanco> = {}): PecaDoAvanco => ({
  id,
  tipo,
  nome,
  pavimentoId: 'pv1',
  estado,
  armadura: null,
  concretada: false,
  residenciais: [],
  ...extra,
})
const APOIOS = new Map([
  ['v1', { pilares: ['p1', 'p2'], vigas: [] }],
  ['v2', { pilares: ['p2', 'p3'], vigas: [] }], // na divisa
  ['v3', { pilares: [], vigas: ['v1'] }], // só apoia em viga
  ['l1', { pilares: ['p1', 'p2', 'p3'], vigas: ['v1', 'v2'] }],
])

function pecasDaObra(): PecaDoAvanco[] {
  const lista = [
    peca('p1', 'P', 'P1', 'pronto', { armadura: 'ok', concretada: true }),
    peca('p2', 'P', 'P2', 'concretar', { armadura: 'ok' }),
    peca('p3', 'P', 'P3', 'andamento', { armadura: 'falta' }),
    peca('p4', 'P', 'P4', 'nc', { armadura: 'nc' }),
    peca('v1', 'V', 'V1', 'concretar'),
    peca('v2', 'V', 'V2', 'pendente'),
    peca('v3', 'V', 'V3', 'pronto'),
    peca('l1', 'L', 'Laje 1', 'concretar'),
    peca('x1', 'P', 'P1', 'pendente', { pavimentoId: 'pv2' }),
  ]
  const res = residenciaisDasPecas(lista, RES, (id) => PAVS.find((p) => p.id === id)!.nome, APOIOS)
  return lista.map((p) => ({ ...p, residenciais: res.get(p.id) ?? [] }))
}

describe('avanço: agrupamento que vem dos dados', () => {
  it('pilar pelo nome; viga e laje pelos pilares; divisa nos dois; viga em viga pela corrente', () => {
    const d = new Map(pecasDaObra().map((p) => [p.id, p.residenciais]))
    expect(d.get('p1')).toEqual(['Residencial A'])
    expect(d.get('p4')).toEqual(['Residencial B'])
    expect(d.get('v1')).toEqual(['Residencial A'])
    expect(d.get('v2')).toEqual(['Residencial A', 'Residencial B'])
    expect(d.get('v3')).toEqual(['Residencial A'])
    expect(d.get('l1')).toEqual(['Residencial A', 'Residencial B'])
    // o mesmo nome de pilar no outro pavimento também entra (a lista não tem pavimento)
    expect(d.get('x1')).toEqual(['Residencial A'])
  })

  it('obra sem residencial: ninguém tem agrupamento e a obra inteira traz tudo', () => {
    const lista = [peca('p1', 'P', 'P1', 'pronto')]
    expect(residenciaisDasPecas(lista, [], () => '', APOIOS).size).toBe(0)
    expect(nomesDosResidenciais([])).toEqual([])
    expect(doAgrupamento(lista, null)).toHaveLength(1)
  })

  it('lista do pavimento passa na frente da lista geral', () => {
    const res = [...RES, { nome: 'Residencial C', pilares: ['P1'], pavimento: '2º Pavimento' }]
    const d = residenciaisDasPecas(pecasDaObra(), res, (id) => PAVS.find((p) => p.id === id)!.nome, APOIOS)
    expect(d.get('x1')).toEqual(['Residencial C'])
    expect(d.get('p1')).toEqual(['Residencial A'])
    expect(nomesDosResidenciais(res)).toEqual(['Residencial A', 'Residencial B', 'Residencial C'])
  })
})

describe('avanço: pilares, vigas, armação', () => {
  it('conta por pavimento e no total, com em andamento e NC separados', () => {
    const { linhas, total } = avancoPorPavimento(pecasDaObra(), PAVS)
    expect(linhas.map((l) => l.pavimento)).toEqual(['1º Pavimento', '2º Pavimento'])
    expect(linhas[0].pilares).toEqual({ pronto: 1, concretar: 1, andamento: 1, pendente: 0, nc: 1, total: 4 })
    expect(linhas[0].vigas).toMatchObject({ pronto: 1, concretar: 1, pendente: 1, total: 3 })
    expect(linhas[0].lajes).toMatchObject({ concretar: 1, total: 1 })
    expect(linhas[0].todas.total).toBe(8)
    expect(total.pilares.total).toBe(5)
    expect(linhas[0].armadura).toEqual({ total: 4, ok: 2, nc: 1 })
    expect(linhas[0].concreto).toEqual({ pecas: 1, pecasPrevistas: 7, lajes: 0, lajesPrevistas: 1 })
  })

  it('no residencial só entram as peças dele; pavimento sem peça some', () => {
    const { linhas, total } = avancoPorPavimento(doAgrupamento(pecasDaObra(), 'Residencial B'), PAVS)
    expect(linhas).toHaveLength(1)
    expect(total.pilares).toMatchObject({ andamento: 1, nc: 1, total: 2 })
    expect(total.vigas.total).toBe(1) // só a da divisa
  })

  it('porcento arredonda e não divide por zero', () => {
    expect(porcento(1, 3)).toBe(33)
    expect(porcento(0, 0)).toBeNull()
  })

  it('item de armadura pelo texto da ficha ou pela marca "barras"', () => {
    expect(ehItemDeArmadura({ etapa: 'ARMAÇÃO', titulo: 'Posição das barras' })).toBe(true)
    expect(ehItemDeArmadura({ etapa: 'MONTAGEM', titulo: 'Conferência do aço e dos estribos' })).toBe(true)
    expect(ehItemDeArmadura({ etapa: 'MONTAGEM', titulo: 'Espaçadores', barras: true })).toBe(true)
    expect(ehItemDeArmadura({ etapa: 'MONTAGEM', titulo: 'Prumo da fôrma' })).toBe(false)
    expect(ehItemDeArmadura({ etapa: 'MONTAGEM', titulo: 'Travamento do espaço' })).toBe(false)
    expect(situacaoDaArmadura([])).toBeNull()
    expect(situacaoDaArmadura(['C', 'NA'])).toBe('ok')
    expect(situacaoDaArmadura(['C', null])).toBe('falta')
    expect(situacaoDaArmadura(['C', 'NC'])).toBe('nc')
  })
})

describe('avanço: lajes para concretar', () => {
  it('diz o que falta: pilares e vigas da laje, com e sem NC', () => {
    const todas = pecasDaObra()
    const [l] = lajesParaConcretar(todas, todas, PAVS, APOIOS)
    expect(l.liberada).toBe(false)
    expect(l.falta).toEqual(['pilares sem conferir: P3', 'vigas sem conferir: V2'])
  })

  it('liberada quando a laje e todos os elementos dela estão conferidos', () => {
    const todas = pecasDaObra().map((p) => (p.id === 'p3' || p.id === 'v2' ? { ...p, estado: 'concretar' as const } : p))
    const [l] = lajesParaConcretar(todas, todas, PAVS, APOIOS)
    expect(l).toMatchObject({ liberada: true, concluida: false, falta: [], semElementos: false })
    // ficha da laje toda conferida: liberada e concluída (a tela mostra como feita, não "para concretar")
    const feita = todas.map((p) => (p.id === 'l1' ? { ...p, estado: 'pronto' as const } : p))
    expect(lajesParaConcretar(feita, feita, PAVS, APOIOS)[0]).toMatchObject({ liberada: true, concluida: true })
  })

  it('NC na laje ou num pilar segura; sem a planta no aparelho a laje não sai como liberada', () => {
    const todas = pecasDaObra().map((p) => (p.id === 'p3' ? { ...p, estado: 'nc' as const } : p.id === 'l1' ? { ...p, estado: 'nc' as const } : p))
    expect(lajesParaConcretar(todas, todas, PAVS, APOIOS)[0].falta).toEqual(['ficha da laje com não conformidade', 'pilares com não conformidade: P3', 'vigas sem conferir: V2'])
    const sem = lajesParaConcretar(pecasDaObra(), pecasDaObra(), PAVS, new Map())[0]
    expect(sem).toMatchObject({ liberada: false, semElementos: true })
    expect(sem.falta[0]).toContain('sem a planta neste aparelho e sem o índice de apoios')
  })
})

describe('avanço: concretagem', () => {
  const caminhoes: CaminhaoDoAvanco[] = [
    { id: 'c1', concretagemId: 'k1', pavimentoId: 'pv1', data: '2026-11-10', volume: 8, pecas: ['p1'] },
    { id: 'c2', concretagemId: 'k1', pavimentoId: 'pv1', data: '2026-11-10', volume: 7.5, pecas: ['p2', 'p3'] }, // nos dois residenciais
    { id: 'c3', concretagemId: 'k2', pavimentoId: 'pv2', data: '2026-11-20', volume: null, pecas: [] },
  ]
  const res = new Map(pecasDaObra().map((p) => [p.id, p.residenciais]))
  const de = (id: string) => res.get(id) ?? []

  it('obra inteira soma tudo e conta o caminhão sem volume e sem peça', () => {
    expect(resumoDoConcreto(caminhoes, null, de)).toEqual({ concretagens: 2, caminhoes: 3, volume: 15.5, semVolume: 1, ultima: '2026-11-20', divididos: 0, semPeca: 1 })
  })

  it('residencial: só os caminhões com peça dele; o dividido entra inteiro e é contado à parte', () => {
    expect(resumoDoConcreto(caminhoes, 'Residencial B', de)).toMatchObject({ concretagens: 1, caminhoes: 1, volume: 7.5, divididos: 1, ultima: '2026-11-10', semPeca: 0 })
    expect(resumoDoConcreto(caminhoes, 'Residencial A', de)).toMatchObject({ caminhoes: 2, volume: 15.5, divididos: 1 })
  })

  it('por pavimento', () => {
    const m = concretoPorPavimento(caminhoes, null, de)
    expect(m.get('pv1')).toEqual({ concretagens: 1, caminhoes: 2, volume: 15.5 })
    expect(m.get('pv2')).toEqual({ concretagens: 1, caminhoes: 1, volume: 0 })
    expect(concretoPorPavimento(caminhoes, 'Residencial B', de).has('pv2')).toBe(false)
  })
})

describe('avanço: índice de apoios (sem baixar planta)', () => {
  const nomePav = (id: string) => PAVS.find((p) => p.id === id)!.nome
  const pecas = pecasDaObra()

  it('vai e volta: o índice por nome dá os mesmos apoios por id', () => {
    const indice = indiceDeApoios(pecas, APOIOS, nomePav)
    expect(indice).toEqual({
      '1º Pavimento': {
        'L:Laje 1': [['P1', 'P2', 'P3'], ['V1', 'V2']],
        'V:V1': [['P1', 'P2'], []],
        'V:V2': [['P2', 'P3'], []],
        'V:V3': [[], ['V1']],
      },
    })
    // passa pelo JSON das regras, como chega do servidor
    const lido = lerIndiceDeApoios({ gerado_em: '2026-11-24', pavimentos: JSON.parse(JSON.stringify(indice)) })
    const volta = apoiosDoIndice(lido, pecas, nomePav)
    expect(volta.get('v2')).toEqual({ pilares: ['p2', 'p3'], vigas: [] })
    expect(volta.get('l1')).toEqual({ pilares: ['p1', 'p2', 'p3'], vigas: ['v1', 'v2'] })
    // e os residenciais saem iguais aos das plantas
    const comIndice = residenciaisDasPecas(pecas, RES, nomePav, volta)
    for (const p of pecas) expect(comIndice.get(p.id) ?? [], p.id).toEqual(p.residenciais)
    // a laje sai com o que falta, sem planta nenhuma no aparelho
    expect(lajesParaConcretar(pecas, pecas, PAVS, volta)[0]).toMatchObject({ semElementos: false, falta: ['pilares sem conferir: P3', 'vigas sem conferir: V2'] })
  })

  it('nome com maiúscula e espaço diferentes casa; o pavimento é o da peça; nome que sumiu é ignorado', () => {
    const indice = lerIndiceDeApoios({ pavimentos: { ' 1º pavimento ': { 'V:v1': [[' p1 ', 'P99'], []] }, '2º Pavimento': { 'V:V1': [['P1'], []] } } })
    const a = apoiosDoIndice(indice, pecas, nomePav)
    expect(a.get('v1')).toEqual({ pilares: ['p1'], vigas: [] })
    expect(a.has('v2')).toBe(false)
  })

  it('entrada torta fica de fora; sem nada válido, null', () => {
    expect(lerIndiceDeApoios(null)).toBeNull()
    expect(lerIndiceDeApoios({ pavimentos: [] })).toBeNull()
    expect(lerIndiceDeApoios({ pavimentos: { A: { 'P:P1': [[], []], 'V:V1': [['P1']], 'V:V2': [['P1'], [3]], 'V:V3': 'x' } } })).toBeNull()
    expect(lerIndiceDeApoios({ pavimentos: { A: { 'V:V1': [['P1'], []], 'X:1': [[], []] } } })).toEqual({ A: { 'V:V1': [['P1'], []] } })
  })

  it('a planta no aparelho passa na frente do índice', () => {
    const j = juntarApoios(new Map([['v1', { pilares: ['p1'], vigas: [] }]]), new Map([['v1', { pilares: ['p9'], vigas: [] }], ['v2', { pilares: ['p2'], vigas: [] }]]))
    expect(j.get('v1')!.pilares).toEqual(['p1'])
    expect(j.get('v2')!.pilares).toEqual(['p2'])
  })
})

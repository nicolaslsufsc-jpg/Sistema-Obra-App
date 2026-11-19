import { describe, expect, it } from 'vitest'
import {
  compararListas,
  errosDoRecebimento,
  lerListaDeMateriais,
  ordenarRecebimentos,
  resultadoDoValor,
  situacaoSugerida,
  situacoesPossiveis,
  type FormRecebimento,
  type MaterialControlado,
} from './fvm'

// Lista fictícia (obra EXE): o formato é o mesmo do materiais.json do pacote da obra.
const LISTA = JSON.stringify({
  materiais: [
    {
      codigo: 'ACO',
      nome: 'Aço CA-50',
      unidade: 't',
      estrutural: true,
      exige_ensaio: false,
      documentos: ['Certificado de qualidade do lote'],
      itens: [
        { codigo: '1', texto: 'Bitola conforme o pedido' },
        { codigo: '2', texto: 'Comprimento da barra (m)', valor: { min: 11.9, max: 12.1 } },
      ],
    },
    { codigo: 'BLOCO', nome: 'Bloco estrutural', unidade: 'un', estrutural: true, exige_ensaio: true, itens: [{ texto: 'Sem trinca' }] },
    { codigo: 'CONC', nome: 'Concreto usinado', unidade: 'm³', via: 'concreto' },
    { codigo: 'ACO', nome: 'Repetido', itens: [{ texto: 'x' }] },
    { codigo: 'VAZIO', nome: 'Sem itens' },
    { nome: 'Sem código', itens: [{ texto: 'x' }] },
  ],
})

const material = (codigo: string): MaterialControlado => lerListaDeMateriais(LISTA).materiais.find((m) => m.codigo === codigo)!

describe('lista de materiais (materiais.json)', () => {
  it('lê os válidos e explica os que ficaram de fora', () => {
    const { materiais, erros } = lerListaDeMateriais(LISTA)
    expect(materiais.map((m) => m.codigo)).toEqual(['ACO', 'BLOCO', 'CONC'])
    expect(erros).toHaveLength(3)
    expect(erros.join(' ')).toMatch(/ACO: código repetido/)
    expect(erros.join(' ')).toMatch(/VAZIO: sem itens/)
    expect(erros.join(' ')).toMatch(/item 6: falta o código/)
    expect(material('ACO').itens[1].valor).toEqual({ min: 11.9, max: 12.1 })
    expect(material('BLOCO').itens[0].codigo).toBe('1') // sem código: numera
    expect(material('CONC').via).toBe('concreto')
  })

  it('arquivo quebrado ou sem a lista não derruba o app', () => {
    expect(lerListaDeMateriais('{ruim').erros[0]).toMatch(/JSON com erro/)
    expect(lerListaDeMateriais('{"outra":1}').erros[0]).toMatch(/não tem a lista/)
    expect(lerListaDeMateriais('null').erros[0]).toMatch(/não tem a lista/)
  })

  it('faixa invertida não vira item medido', () => {
    const r = lerListaDeMateriais(JSON.stringify({ materiais: [{ codigo: 'X', nome: 'X', itens: [{ texto: 't', valor: { min: 5, max: 1 } }] }] }))
    expect(r.materiais[0].itens[0].valor).toBeUndefined()
  })

  it('importar de novo: novo entra, mudado corrige, o que saiu é cancelado', () => {
    const atuais = lerListaDeMateriais(LISTA).materiais.map((m) => ({ ...m, id: `id-${m.codigo}` }))
    const novaLista = lerListaDeMateriais(
      JSON.stringify({
        materiais: [
          { codigo: 'ACO', nome: 'Aço CA-50 (novo texto)', unidade: 't', estrutural: true, itens: [{ texto: 'Bitola' }] },
          { codigo: 'BLOCO', nome: 'Bloco estrutural', unidade: 'un', estrutural: true, exige_ensaio: true, itens: [{ texto: 'Sem trinca' }] },
          { codigo: 'AREIA', nome: 'Areia média', unidade: 'm³', itens: [{ texto: 'Sem torrão' }] },
        ],
      }),
    ).materiais
    const r = compararListas(atuais, novaLista)
    expect(r.incluir.map((m) => m.codigo)).toEqual(['AREIA'])
    expect(r.corrigir.map((c) => c.atual.id)).toEqual(['id-ACO'])
    expect(r.cancelar.map((a) => a.id)).toEqual(['id-CONC'])
    // a mesma lista de novo não muda nada
    const igual = compararListas(atuais, lerListaDeMateriais(LISTA).materiais)
    expect(igual).toEqual({ incluir: [], corrigir: [], cancelar: [] })
  })
})

describe('ficha de recebimento', () => {
  const base = (m: MaterialControlado, mud: Partial<FormRecebimento> = {}): FormRecebimento => ({
    data: '2026-11-18',
    fornecedor: 'Fornecedor Exemplo',
    nota_fiscal: '1234',
    lote: 'L-01',
    quantidade: 5,
    conferencia: m.itens.map((i) => ({ codigo: i.codigo, texto: i.texto, resultado: 'C', valor: i.valor ? 12 : null, observacao: null })),
    situacao: 'liberado',
    motivo: '',
    ...mud,
  })

  it('item medido: dentro da faixa é C, fora é NC', () => {
    const item = material('ACO').itens[1]
    expect(resultadoDoValor(item, 12)).toBe('C')
    expect(resultadoDoValor(item, 11.9)).toBe('C')
    expect(resultadoDoValor(item, 11.5)).toBe('NC')
    expect(resultadoDoValor(item, null)).toBeNull()
    expect(resultadoDoValor(material('ACO').itens[0], 3)).toBeNull()
  })

  it('sugestão: NC devolve, ensaio retém, o resto libera', () => {
    expect(situacaoSugerida(material('ACO'), [{ resultado: 'C' }, { resultado: 'NA' }])).toBe('liberado')
    expect(situacaoSugerida(material('ACO'), [{ resultado: 'NC' }])).toBe('devolvido')
    expect(situacaoSugerida(material('BLOCO'), [{ resultado: 'C' }])).toBe('retido')
    // certificado do lote não veio: segura até chegar
    expect(situacaoSugerida(material('ACO'), [{ resultado: 'C' }], true)).toBe('retido')
    expect(situacaoSugerida(material('ACO'), [{ resultado: 'NC' }], true)).toBe('devolvido')
    expect(situacoesPossiveis([{ resultado: 'NC' }])).not.toContain('liberado')
    expect(situacoesPossiveis([{ resultado: 'C' }])).not.toContain('liberado_ressalva')
    // exige ensaio: o campo não libera no portão
    expect(situacoesPossiveis([{ resultado: 'C' }], material('BLOCO'))).toEqual(['retido', 'devolvido'])
  })

  it('ficha completa e conforme: sem erro', () => {
    expect(errosDoRecebimento(material('ACO'), base(material('ACO')), '2026-11-18')).toEqual({})
  })

  it('aponta cada campo que falta, no lugar dele', () => {
    const m = material('ACO')
    const e = errosDoRecebimento(m, base(m, { fornecedor: ' ', nota_fiscal: '', lote: '', quantidade: null, conferencia: [], situacao: null }), '2026-11-18')
    expect(Object.keys(e).sort()).toEqual(['fornecedor', 'item:1', 'item:2', 'lote', 'nota_fiscal', 'quantidade', 'situacao'])
    expect(errosDoRecebimento(m, base(m, { data: '2026-11-19' }), '2026-11-18').data).toMatch(/depois de hoje/)
    expect(errosDoRecebimento(m, base(m, { quantidade: 0 }), '2026-11-18').quantidade).toBeTruthy()
    expect(errosDoRecebimento(m, base(m, { quantidade: Number.NaN }), '2026-11-18').quantidade).toBeTruthy()
  })

  it('material com ensaio não pode sair liberado do recebimento', () => {
    const m = material('BLOCO')
    expect(errosDoRecebimento(m, base(m, { situacao: 'liberado' }), '2026-11-18').situacao).toMatch(/ensaio/)
    expect(errosDoRecebimento(m, base(m, { situacao: 'retido', motivo: 'aguardar ensaio de compressão' }), '2026-11-18')).toEqual({})
  })

  it('lote só é obrigatório em material estrutural', () => {
    const areia = lerListaDeMateriais(JSON.stringify({ materiais: [{ codigo: 'AREIA', nome: 'Areia', itens: [{ texto: 'ok' }] }] })).materiais[0]
    expect(errosDoRecebimento(areia, base(areia, { lote: '' }), '2026-11-18').lote).toBeUndefined()
  })

  it('NC sem observação, liberar com NC e reter sem motivo são barrados', () => {
    const m = material('ACO')
    const nc = base(m).conferencia.map((c, i) => (i === 0 ? { ...c, resultado: 'NC' as const } : c))
    expect(errosDoRecebimento(m, base(m, { conferencia: nc, situacao: 'devolvido', motivo: 'x' }), '2026-11-18')['item:1']).toMatch(/NC/)
    const ncObs = nc.map((c, i) => (i === 0 ? { ...c, observacao: 'bitola 10 no lugar de 12,5' } : c))
    expect(errosDoRecebimento(m, base(m, { conferencia: ncObs, situacao: 'liberado' }), '2026-11-18').situacao).toMatch(/só dá/)
    expect(errosDoRecebimento(m, base(m, { conferencia: ncObs, situacao: 'liberado_ressalva', motivo: '' }), '2026-11-18').motivo).toBeTruthy()
    expect(errosDoRecebimento(m, base(m, { conferencia: ncObs, situacao: 'liberado_ressalva', motivo: 'usar só em contrapiso' }), '2026-11-18')).toEqual({})
  })
})

describe('lista de recebimentos', () => {
  it('retidos no topo, depois do mais novo para o mais antigo', () => {
    const r = (id: string, situacao: string, data: string) => ({ id, situacao, data, criado_em_dispositivo: `${data}T10:00` })
    const lista = [r('a', 'liberado', '2026-11-18'), r('b', 'retido', '2026-11-10'), r('c', 'devolvido', '2026-11-17')]
    expect(ordenarRecebimentos(lista).map((x) => x.id)).toEqual(['b', 'a', 'c'])
  })
})

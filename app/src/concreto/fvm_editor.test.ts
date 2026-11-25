// Editor do modelo de material (25/11): regras do formulário, a gravação no aparelho e o exemplo da obra EXE.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { compararListas, errosDoMaterial, formularioDoMaterial, lerListaDeMateriais, materialDoFormulario, type FormMaterial, type MaterialControlado } from './fvm'
import { carregarFvm, retirarMaterial, salvarMaterial } from './fvm_dados'
import exemplo from './materiais.exemplo.json'

const OBRA = 'b0000000-0000-0000-0000-0000000000f7'
const USUARIO = '00000000-0000-0000-0000-0000000000f7'

const ACO: MaterialControlado = {
  codigo: 'ACO',
  nome: 'Aço CA-50',
  unidade: 'kg',
  estrutural: true,
  exige_ensaio: false,
  via: null,
  itens: [
    { codigo: '1', texto: 'Bitola conforme o pedido' },
    { codigo: '2', texto: 'Comprimento da barra (m)', valor: { min: 11.9, max: 12.1 } },
  ],
  documentos: ['Certificado do lote'],
  ordem: 3,
}

describe('formulário do material', () => {
  it('material novo pede código, nome e um item', () => {
    const f = formularioDoMaterial(null)
    expect(Object.keys(errosDoMaterial(f, []))).toEqual(expect.arrayContaining(['codigo', 'nome', 'itens']))
    const ok: FormMaterial = { ...f, codigo: 'AREIA', nome: 'Areia média', itens: [{ codigo: '', texto: 'Sem torrões de argila' }] }
    expect(errosDoMaterial(ok, ['ACO'])).toEqual({})
  })

  it('código não repete (sem diferença de maiúscula)', () => {
    const f: FormMaterial = { ...formularioDoMaterial(null), codigo: 'aco', nome: 'Outro aço', itens: [{ codigo: '', texto: 'x' }] }
    expect(errosDoMaterial(f, ['ACO']).codigo).toMatch(/Já existe/)
  })

  it('material da concretagem (via) pode ficar sem itens', () => {
    const f: FormMaterial = { ...formularioDoMaterial(null), codigo: 'CONC', nome: 'Concreto', itens: [] }
    expect(errosDoMaterial(f, [], 'concreto')).toEqual({})
  })

  it('texto longo demais aparece no item certo', () => {
    const f: FormMaterial = { ...formularioDoMaterial(ACO), itens: [{ codigo: '1', texto: 'ok' }, { codigo: '', texto: 'x'.repeat(301) }] }
    expect(errosDoMaterial(f, [])['item:1']).toMatch(/300/)
  })

  it('editar mantém o código e a faixa dos itens que ficaram; item novo ganha número livre', () => {
    const f = formularioDoMaterial(ACO)
    f.itens = [f.itens[1], { codigo: '', texto: '  Etiqueta do fabricante  ' }, { codigo: '', texto: '   ' }]
    f.documentos = ['Certificado do lote', 'Certificado do lote', '']
    const m = materialDoFormulario(f, ACO, 99)
    expect(m.itens).toEqual([
      { codigo: '2', texto: 'Comprimento da barra (m)', valor: { min: 11.9, max: 12.1 } },
      { codigo: '3', texto: 'Etiqueta do fabricante' },
    ])
    expect(m.documentos).toEqual(['Certificado do lote'])
    expect(m.ordem).toBe(3)
  })

  it('material novo vai para o fim da lista e sem unidade vira "un"', () => {
    const f: FormMaterial = { ...formularioDoMaterial(null), codigo: ' AREIA ', nome: 'Areia', unidade: ' ', itens: [{ codigo: '', texto: 'Limpa' }] }
    expect(materialDoFormulario(f, null, 6)).toMatchObject({ codigo: 'AREIA', unidade: 'un', ordem: 6, via: null, itens: [{ codigo: '1', texto: 'Limpa' }] })
  })
})

describe('gravação no aparelho', () => {
  it('incluir, corrigir (substitui_id), não gravar sem mudança e tirar da lista', async () => {
    const novo = await salvarMaterial(OBRA, USUARIO, ACO, null)
    expect(novo).not.toBeNull()
    let fvm = await carregarFvm(OBRA)
    expect(fvm.materiais.map((m) => m.nome)).toEqual(['Aço CA-50'])

    expect(await salvarMaterial(OBRA, USUARIO, { ...ACO }, fvm.materiais[0])).toBeNull()

    const corrigida = await salvarMaterial(OBRA, USUARIO, { ...ACO, nome: 'Aço CA-50 (barras)' }, fvm.materiais[0])
    expect(corrigida).toMatchObject({ substitui_id: novo!.id })
    fvm = await carregarFvm(OBRA)
    expect(fvm.materiais).toHaveLength(1)
    expect(fvm.materiais[0]).toMatchObject({ nome: 'Aço CA-50 (barras)', raiz: novo!.id })

    await retirarMaterial(OBRA, USUARIO, fvm.materiais[0])
    expect((await carregarFvm(OBRA)).materiais).toHaveLength(0)
  })
})

describe('materiais.exemplo.json (obra EXE)', () => {
  it('lê sem erro: aço, bloco, cimento, argamassa, drywall e o concreto pela concretagem', () => {
    const { materiais, erros } = lerListaDeMateriais(JSON.stringify(exemplo))
    expect(erros).toEqual([])
    expect(materiais.map((m) => m.codigo)).toEqual(['ACO-CA50', 'BLOCO-EST', 'CIMENTO', 'ARGAMASSA', 'DRYWALL-ST', 'CONCRETO'])
    expect(materiais.find((m) => m.codigo === 'CONCRETO')?.via).toBe('concreto')
    // só sim ou não: nenhum item com medida digitada
    expect(materiais.flatMap((m) => m.itens).some((i) => i.valor)).toBe(false)
  })

  it('o que o editor grava é o que a importação acharia igual (formulário ida e volta)', () => {
    const { materiais } = lerListaDeMateriais(JSON.stringify(exemplo))
    const volta = materiais.map((m) => materialDoFormulario(formularioDoMaterial(m), m, 0))
    expect(compararListas(materiais, volta)).toEqual({ incluir: [], corrigir: [], cancelar: [] })
  })
})

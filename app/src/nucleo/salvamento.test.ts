import { afterEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BancoLocal } from './banco_local'
import type { ObraLocal, UsuarioLocal } from './conta'
import { Sincronizador } from './sincronizacao'
import { aplicarSalvamento, contarFilaDaObra, desempacotar, empacotar, gerarSalvamento, nomeDoArquivo } from './salvamento'

const TABELAS = ['pavimentos', 'arquivos', 'teste_eventos']
let n = 0
const novo = () => {
  const banco = new BancoLocal(`teste-salvamento-${++n}`)
  return { banco, s: new Sincronizador({ banco, cliente: {} as SupabaseClient, tabelas: TABELAS }) }
}
const usuarioA: UsuarioLocal = { id: '00000000-0000-0000-0000-0000000000a1', email: 'a@teste' }
const usuarioB: UsuarioLocal = { id: '00000000-0000-0000-0000-0000000000b2', email: 'b@teste' }
const obra: ObraLocal = { id: 'b0000000-0000-0000-0000-0000000000bb', codigo: 'EXE', nome: 'Obra Exemplo', empresa: null, papel: 'admin' }
const BYTES = new Uint8Array([1, 2, 3, 250, 251, 252])

async function tresRegistros(banco: BancoLocal, s: Sincronizador) {
  await s.registrar('pavimentos', obra.id, usuarioA.id, { nome: 'Térreo', ordem: 1 })
  await s.registrar('pavimentos', obra.id, usuarioA.id, { nome: '1º', ordem: 2 })
  const arq = await s.registrarArquivo(obra.id, usuarioA.id, 'fvs', new Blob([BYTES], { type: 'image/jpeg' }), 'foto.jpg')
  return { arq, banco }
}

describe('salvamento', () => {
  const original = globalThis.CompressionStream
  afterEach(() => {
    globalThis.CompressionStream = original
  })

  it('ida e volta: a fila de um aparelho entra no outro, no usuário de lá', async () => {
    const a = novo()
    const { arq } = await tresRegistros(a.banco, a.s)
    const salvo = await gerarSalvamento(a.banco, usuarioA, obra)
    expect(salvo.formato).toBe('sistema-obra-salvo')
    expect(salvo.itens).toHaveLength(3)
    expect(salvo.itens.map((i) => i.tabela)).toEqual(['pavimentos', 'pavimentos', 'arquivos'])
    expect(salvo.conteudos).toHaveLength(1)
    expect('seq' in salvo.itens[0]).toBe(false)

    const blob = await empacotar(salvo)
    expect(blob.type).toBe('application/gzip')
    const inicio = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
    expect([...inicio]).toEqual([0x1f, 0x8b])

    const lido = await desempacotar(blob)
    expect(lido).toEqual(salvo)

    const b = novo()
    expect(await aplicarSalvamento(b.banco, lido, usuarioB)).toEqual({ novos: 3, repetidos: 0 })
    expect(await b.s.contarFila(usuarioB.id)).toEqual({ pendentes: 3, comErro: 0 })
    expect(await b.s.contarFila(usuarioA.id)).toEqual({ pendentes: 0, comErro: 0 })
    const conteudo = await b.banco.conteudos.get(arq.id)
    expect([...new Uint8Array(conteudo!.bytes)]).toEqual([...BYTES])
    const reg = await b.banco.registros.get(['arquivos', arq.id])
    expect(reg?.pendente).toBe(1)
    expect(reg?.linha.usuario_id).toBe(usuarioB.id)
    expect((await b.s.linhas('pavimentos', obra.id)).map((l) => l.nome).sort()).toEqual(['1º', 'Térreo'])
    expect(await b.banco.lerMeta('obras')).toEqual([obra])
    expect(await b.banco.lerMeta('obra_atual')).toBe(obra.id)
  })

  it('o mesmo arquivo restaurado de novo não duplica nada', async () => {
    const a = novo()
    await tresRegistros(a.banco, a.s)
    const salvo = await gerarSalvamento(a.banco, usuarioA, obra)
    const b = novo()
    await aplicarSalvamento(b.banco, salvo, usuarioB)
    expect(await aplicarSalvamento(b.banco, salvo, usuarioB)).toEqual({ novos: 0, repetidos: 3 })
    expect(await b.banco.fila.count()).toBe(3)
  })

  it('restaurar arquivo de outra obra não troca a obra atual que já existia', async () => {
    const a = novo()
    await tresRegistros(a.banco, a.s)
    const salvo = await gerarSalvamento(a.banco, usuarioA, obra)
    const b = novo()
    const outra: ObraLocal = { ...obra, id: 'b0000000-0000-0000-0000-0000000000cc', codigo: 'OUTRA' }
    await b.banco.gravarMeta('obras', [outra])
    await b.banco.gravarMeta('obra_atual', outra.id)
    await aplicarSalvamento(b.banco, salvo, usuarioB)
    expect(await b.banco.lerMeta('obra_atual')).toBe(outra.id)
    expect((await b.banco.lerMeta<ObraLocal[]>('obras'))!.map((o) => o.codigo)).toEqual(['OUTRA', 'EXE'])
  })

  it('conta só a fila da obra aberta', async () => {
    const a = novo()
    await tresRegistros(a.banco, a.s)
    const outra: ObraLocal = { ...obra, id: 'b0000000-0000-0000-0000-0000000000cc', codigo: 'OUTRA' }
    await a.s.registrar('pavimentos', outra.id, usuarioA.id, { nome: 'X', ordem: 1 })
    expect(await contarFilaDaObra(a.banco, usuarioA, obra)).toBe(3)
    expect(await contarFilaDaObra(a.banco, usuarioA, outra)).toBe(1)
    expect(await contarFilaDaObra(a.banco, usuarioB, obra)).toBe(0)
  })

  it('recusa arquivo que não é um salvamento', async () => {
    await expect(desempacotar(new Blob(['{"x":1}']))).rejects.toThrow('Este arquivo não é um salvamento do Sistema Obra')
    await expect(desempacotar(new Blob(['lixo']))).rejects.toThrow('Este arquivo não é um salvamento do Sistema Obra')
  })

  it('sem CompressionStream sai JSON puro, e o leitor aceita', async () => {
    const a = novo()
    await tresRegistros(a.banco, a.s)
    const salvo = await gerarSalvamento(a.banco, usuarioA, obra)
    // @ts-expect-error simula navegador antigo
    globalThis.CompressionStream = undefined
    const blob = await empacotar(salvo)
    expect(blob.type).toBe('application/json')
    expect(await desempacotar(blob)).toEqual(salvo)
  })

  describe('fichas que as marcações usam (falha N1 de 08/11)', () => {
    const ficha = (revisao: string, titulo = 'Pilares') => ({
      id: `f0000000-0000-0000-0000-00000000000${revisao}`,
      obra_id: obra.id,
      usuario_id: '00000000-0000-0000-0000-0000000000c0',
      dispositivo_id: 'pacote',
      criado_em_dispositivo: '2026-11-08T10:00:00.000Z',
      apagado: false,
      codigo: 'EXE-PVS-001',
      titulo,
      revisao,
      aplica_a: ['P'],
      itens: [{ n: 1, etapa: 'MONTAGEM', titulo: 'Prumo' }],
    })
    const gravarFicha = (banco: BancoLocal, f: ReturnType<typeof ficha>) =>
      banco.registros.put({ tabela: 'fichas_modelo', id: f.id, obra_id: obra.id, linha: f, pendente: 0 })

    async function marcadoNaRev0() {
      const a = novo()
      await gravarFicha(a.banco, ficha('0'))
      await gravarFicha(a.banco, ficha('9', 'outra ficha, sem marcação'))
      await a.s.registrar('teste_eventos', obra.id, usuarioA.id, { ficha_id: ficha('0').id, item_n: 1, resultado: 'R' })
      await a.s.registrar('pavimentos', obra.id, usuarioA.id, { nome: 'Térreo', ordem: 1 })
      return gerarSalvamento(a.banco, usuarioA, obra)
    }

    it('o .obra leva só as fichas usadas, e o aparelho que já tem a rev. 1 recebe a rev. 0', async () => {
      const salvo = await desempacotar(await empacotar(await marcadoNaRev0()))
      expect(salvo.fichas?.map((f) => f.revisao)).toEqual(['0'])

      const b = novo()
      await gravarFicha(b.banco, ficha('1'))
      expect(await aplicarSalvamento(b.banco, salvo, usuarioB)).toEqual({ novos: 2, repetidos: 0 })
      const rev0 = await b.banco.registros.get(['fichas_modelo', ficha('0').id])
      expect(rev0?.linha.revisao).toBe('0')
      expect(rev0?.pendente).toBe(0) // é cadastro, não vai para a fila
      expect(await b.banco.registros.get(['fichas_modelo', ficha('1').id])).toBeTruthy()
      expect(await b.banco.fila.count()).toBe(2)
    })

    it('ficha que o aparelho já tem não é trocada pela do arquivo', async () => {
      const salvo = await marcadoNaRev0()
      const b = novo()
      await gravarFicha(b.banco, ficha('0', 'título daqui'))
      await aplicarSalvamento(b.banco, salvo, usuarioB)
      expect((await b.banco.registros.get(['fichas_modelo', ficha('0').id]))?.linha.titulo).toBe('título daqui')
    })

    it('.obra de antes (sem fichas) e ficha estragada no arquivo continuam restaurando os registros', async () => {
      const salvo = await marcadoNaRev0()
      const antigo = { ...salvo, fichas: undefined }
      delete antigo.fichas
      const b = novo()
      expect(await aplicarSalvamento(b.banco, antigo, usuarioB)).toEqual({ novos: 2, repetidos: 0 })
      const c = novo()
      const estragado = { ...salvo, fichas: [{ id: 'x' } as never, ...(salvo.fichas ?? [])] }
      expect(await aplicarSalvamento(c.banco, estragado, usuarioB)).toEqual({ novos: 2, repetidos: 0 })
      expect(await c.banco.registros.get(['fichas_modelo', 'x'])).toBeUndefined()
      expect(await c.banco.registros.get(['fichas_modelo', ficha('0').id])).toBeTruthy()
    })
  })

  it('nome do arquivo tem código da obra, data e hora', () => {
    expect(nomeDoArquivo(obra, new Date(2026, 10, 7, 14, 30))).toBe('salvo-EXE-2026-11-07_14-30.obra')
  })
})

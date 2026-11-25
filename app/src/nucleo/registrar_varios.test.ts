// registrarVarios (24/11/2026, aprovado pelo Nicolas): vários registros numa transação só no aparelho, para o
// "Confirmar OK em todos" da FVS com milhares de pontos. Os registros e a fila têm de ser iguais aos de
// registrar(), um por um, e a sincronização não muda.
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BancoLocal } from './banco_local'
import { Sincronizador } from './sincronizacao'

const OBRA = '11111111-1111-1111-1111-111111111111'
const USUARIO = '00000000-0000-0000-0000-0000000000c1'

/** Servidor falso que aceita tudo e guarda o que recebeu, por tabela e na ordem. */
function servidorQueAceita() {
  const recebidos: { tabela: string; linhas: Record<string, unknown>[] }[] = []
  const cliente = {
    from: (tabela: string) => ({
      upsert: (linhas: Record<string, unknown>[]) => {
        recebidos.push({ tabela, linhas })
        const pedido = {
          abortSignal: () => pedido,
          then: (ok: (v: unknown) => unknown) => Promise.resolve({ error: null, status: 201 }).then(ok),
        }
        return pedido
      },
    }),
  }
  return { cliente: cliente as unknown as SupabaseClient, recebidos }
}

/** Tira o que muda de um registro para outro (id e hora) para comparar o formato. */
const formato = (o: object): Record<string, unknown> => {
  const { id, criado_em_dispositivo, criado_em, seq, linha, ...resto } = o as Record<string, unknown> & { linha?: object }
  void id
  void criado_em_dispositivo
  void criado_em
  void seq
  return linha ? { ...resto, linha: formato(linha) } : resto
}

/** Os registros do aparelho, na ordem dos pontos (o banco devolve na ordem do id, que é sorteado). */
const porPonto = (l: object[]) => l.map(formato).sort((x, y) => String((x.linha as Record<string, unknown>).barra_id).localeCompare(String((y.linha as Record<string, unknown>).barra_id)))

describe('registrarVarios', () => {
  it('grava os mesmos registros e itens da fila que registrar(), na mesma ordem', async () => {
    const um = new BancoLocal(`varios-${crypto.randomUUID()}`)
    const varios = new BancoLocal(`varios-${crypto.randomUUID()}`)
    const s1 = new Sincronizador({ banco: um, cliente: {} as SupabaseClient, tabelas: ['teste_eventos'] })
    const s2 = new Sincronizador({ banco: varios, cliente: {} as SupabaseClient, tabelas: ['teste_eventos'] })
    // o mesmo aparelho nos dois bancos, para a coluna dispositivo_id ser igual
    await varios.gravarMeta('dispositivo_id', await um.dispositivoId())
    const campos = [1, 2, 3].map((n) => ({ barra_id: `pt-${n}`, item: 4, resultado: 'C', rodada: 1, observacao: null }))

    const a: Record<string, unknown>[] = []
    for (const c of campos) a.push(await s1.registrar('teste_eventos', OBRA, USUARIO, c))
    const b = await s2.registrarVarios('teste_eventos', OBRA, USUARIO, campos)

    expect(b.map(formato)).toEqual(a.map(formato))
    expect(porPonto(await varios.registros.toArray())).toEqual(porPonto(await um.registros.toArray()))
    const filaB = await varios.fila.orderBy('seq').toArray()
    expect(filaB.map(formato)).toEqual((await um.fila.orderBy('seq').toArray()).map(formato))
    // a fila na ordem da lista, com o id de cada registro
    expect(filaB.map((x) => x.id)).toEqual(b.map((l) => l.id))
    expect(await s2.contarFila(USUARIO)).toEqual({ pendentes: 3, comErro: 0 })
  })

  it('ou entram todos ou nenhum: um campo proibido no meio não deixa nada no aparelho', async () => {
    const banco = new BancoLocal(`varios-${crypto.randomUUID()}`)
    const s = new Sincronizador({ banco, cliente: {} as SupabaseClient, tabelas: ['teste_eventos'] })
    await expect(
      s.registrarVarios('teste_eventos', OBRA, USUARIO, [{ barra_id: 'pt-1' }, { barra_id: 'pt-2', usuario_id: USUARIO }, { barra_id: 'pt-3' }]),
    ).rejects.toThrow('preenchida pelo núcleo')
    expect(await banco.registros.count()).toBe(0)
    expect(await banco.fila.count()).toBe(0)
    // o banco do aparelho falha no meio (fila cheia, por exemplo): os registros já postos também saem
    const falha = vi.spyOn(banco.fila, 'bulkAdd').mockRejectedValueOnce(new Error('sem espaço'))
    await expect(s.registrarVarios('teste_eventos', OBRA, USUARIO, [{ barra_id: 'pt-1' }, { barra_id: 'pt-2' }])).rejects.toThrow('sem espaço')
    falha.mockRestore()
    expect(await banco.registros.count()).toBe(0)
    expect(await banco.fila.count()).toBe(0)
    // de novo, sem falha: entram os dois
    await s.registrarVarios('teste_eventos', OBRA, USUARIO, [{ barra_id: 'pt-1' }, { barra_id: 'pt-2' }])
    expect(await banco.fila.count()).toBe(2)
    // tabela fora da lista: recusa antes de gravar
    await expect(s.registrarVarios('outra', OBRA, USUARIO, [{ barra_id: 'pt-9' }])).rejects.toThrow('não está na lista')
    // lista vazia: nada a fazer
    expect(await s.registrarVarios('teste_eventos', OBRA, USUARIO, [])).toEqual([])
    expect(await banco.fila.count()).toBe(2)
  })

  it('sincronização igual: sobem em lotes, na ordem, e saem da fila como pendente 0', async () => {
    const { cliente, recebidos } = servidorQueAceita()
    const banco = new BancoLocal(`varios-${crypto.randomUUID()}`)
    const s = new Sincronizador({ banco, cliente, tabelas: ['teste_eventos'], tamanhoLote: 100 })
    const linhas = await s.registrarVarios(
      'teste_eventos',
      OBRA,
      USUARIO,
      Array.from({ length: 250 }, (_, n) => ({ barra_id: `pt-${n}`, item: 4, resultado: 'C' })),
    )
    const r = await s.enviar(USUARIO)
    expect(r).toEqual({ enviados: 250, comErro: 0 })
    expect(recebidos.map((x) => [x.tabela, x.linhas.length])).toEqual([
      ['teste_eventos', 100],
      ['teste_eventos', 100],
      ['teste_eventos', 50],
    ])
    expect(recebidos.flatMap((x) => x.linhas.map((l) => l.id))).toEqual(linhas.map((l) => l.id))
    expect(await s.contarFila(USUARIO)).toEqual({ pendentes: 0, comErro: 0 })
    expect((await banco.registros.toArray()).every((x) => x.pendente === 0)).toBe(true)
  })
})

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { banco } from '../nucleo/servicos'
import type { Linha } from '../nucleo/banco_local'
import type { DadosFvs } from './dados'
import { DadosDaTela, dadosGuardados } from './leitura'
import { guardarPacote, pacotesJaLidos, pacotesNoAparelho, removerPacotes } from './pacote'

// Abrir a FVS de novo sem reler o aparelho (pedido do Nicolas, 21/11: "FVS demora 5s para abrir").
const OBRA = 'e0000000-0000-0000-0000-0000000020c1'
const dadosDe = (n: number) => ({ eventosDe: new Map(), n }) as unknown as DadosFvs
const esperar = () => new Promise((ok) => setTimeout(ok, 30))

describe('abrir a FVS de novo', () => {
  it('guarda os dados lidos e diz se ainda valem: gravação com a FVS fechada obriga a reler', async () => {
    let leituras = 0
    const publicados: DadosFvs[] = []
    const chave = `${OBRA}|eu`
    const a = new DadosDaTela(async () => dadosDe(++leituras), (d) => publicados.push(d), chave)
    expect(a.guardadoVale()).toBe(false)
    a.aberta(true)
    await a.recarregar()
    expect((dadosGuardados(chave) as unknown as { n: number }).n).toBe(1)
    // gravação com a FVS aberta (o toque entra nos dados dela): não invalida
    await banco.registros.put({ tabela: 'fvs_eventos', id: 'x1', obra_id: OBRA, linha: { id: 'x1', obra_id: OBRA } as unknown as Linha, pendente: 0 })
    await esperar()
    a.aberta(false)

    // abre de novo: os mesmos dados, sem ler
    const b = new DadosDaTela(async () => dadosDe(++leituras), () => {}, chave)
    expect(b.guardadoVale()).toBe(true)
    expect((b.dados() as unknown as { n: number }).n).toBe(1)
    expect(leituras).toBe(1)

    // fechada, outra parte do app grava (sincronização, Concreto): a próxima abertura relê
    await banco.registros.put({ tabela: 'fvs_eventos', id: 'x2', obra_id: OBRA, linha: { id: 'x2', obra_id: OBRA } as unknown as Linha, pendente: 0 })
    await esperar()
    const c = new DadosDaTela(async () => dadosDe(++leituras), () => {}, chave)
    expect(c.guardadoVale()).toBe(false)
    c.aberta(true)
    await c.recarregar()
    c.aberta(false)
    expect(new DadosDaTela(async () => dadosDe(0), () => {}, chave).guardadoVale()).toBe(true)

    // leitura velha (mais de 30 min) também relê
    expect(new DadosDaTela(async () => dadosDe(0), () => {}, chave).guardadoVale(Date.now() + 31 * 60 * 1000)).toBe(false)
    // sem chave nada é guardado
    expect(new DadosDaTela(async () => dadosDe(0), () => {}).guardadoVale()).toBe(false)
  })

  it('a lista de plantas do aparelho é lida uma vez e acompanha o que se baixa e apaga', async () => {
    const manifest = (id: string) =>
      JSON.stringify({ formato: 1, planta_id: id, largura: 10, altura: 10, elementos: {}, pedacos: { 't:0/0/0': [0, 3] } })
    const bin = () => new Blob([new Uint8Array([1, 2, 3])])
    const eu = { obraId: OBRA, usuarioId: 'eu' }
    await guardarPacote(manifest('pl-1'), bin(), eu)
    expect([...(await pacotesNoAparelho()).keys()]).toContain('pl-1')
    expect(pacotesJaLidos()?.has('pl-1')).toBe(true)
    await guardarPacote(manifest('pl-2'), bin(), eu)
    expect(pacotesJaLidos()?.has('pl-2')).toBe(true)
    await removerPacotes(['pl-1'])
    const agora = await pacotesNoAparelho()
    expect([agora.has('pl-1'), agora.has('pl-2')]).toEqual([false, true])
  })
})

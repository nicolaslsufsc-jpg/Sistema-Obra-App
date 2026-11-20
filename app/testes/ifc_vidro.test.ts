// Passada transparente só com o vidro: o bloco inteiro não é mais desenhado duas vezes.
import { describe, expect, it } from 'vitest'
import { IfcAPI } from 'web-ifc'
import { indiceSoDoVidro, triangulosComAlfa } from '../src/ifc/motor/geometria'
import { lerModelo } from '../src/ifc/motor/leitor'
import { amostraBytes } from './ifc/amostra'

/** RGBA de 4 vértices: os dois primeiros opacos, o 3º vidro (alfa 90), o 4º quase opaco (253). */
const cores = new Uint8Array([200, 200, 200, 255, 200, 200, 200, 255, 120, 190, 220, 90, 200, 200, 200, 253])

describe('triângulos de vidro', () => {
  it('acha o triângulo que tem algum vértice transparente no próprio IFC', () => {
    // t0 só opacos; t1 encosta no vértice de vidro; t2 encosta no de alfa 253 (o sombreador já trata como transparente)
    const indices = new Uint32Array([0, 1, 0, 0, 1, 2, 1, 0, 3])
    expect([...triangulosComAlfa(cores, indices)]).toEqual([1, 2])
    expect(triangulosComAlfa(cores, new Uint32Array([0, 1, 0]))).toHaveLength(0)
  })

  it('índice do vidro: triângulos do arquivo mais as faixas da categoria vidro, sem repetir', () => {
    const indices = new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    // triângulo 1 é vidro no arquivo; a categoria vidro pega os triângulos 1 e 2 (início 3, 6 índices)
    expect([...indiceSoDoVidro(indices, new Uint32Array([1]), [3, 6])]).toEqual([3, 4, 5, 6, 7, 8])
    expect([...indiceSoDoVidro(indices, new Uint32Array([3]))]).toEqual([9, 10, 11])
    expect(indiceSoDoVidro(indices, new Uint32Array(0))).toHaveLength(0)
  })

  it('na amostra lida pelo web-ifc, a parede (opaca) não entra na passada transparente', async () => {
    const api = new IfcAPI()
    await api.Init()
    const id = api.OpenModel(amostraBytes(), { COORDINATE_TO_ORIGIN: false })
    const m = lerModelo({ api, modeloId: id, nome: 'amostra.ifc', tamanho: 1, id: 'teste' })
    api.CloseModel(id)
    const triangulos = m.blocos.reduce((s, b) => s + b.indices.length / 3, 0)
    const vidro = m.blocos.reduce((s, b) => s + indiceSoDoVidro(b.indices, triangulosComAlfa(b.cores, b.indices)).length / 3, 0)
    expect(triangulos).toBeGreaterThan(0)
    expect(vidro).toBeLessThan(triangulos)
  })
})

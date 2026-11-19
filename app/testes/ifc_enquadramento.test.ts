// Botão "Enquadrar": ignora peças soltas muito longe do conjunto, sem cortar prédio nenhum.
import { describe, expect, it } from 'vitest'
import { IfcAPI } from 'web-ifc'
import { caixaSemIsolados } from '../src/ifc/motor/enquadramento'
import { lerModelo } from '../src/ifc/motor/leitor'
import { amostraBytes } from './ifc/amostra'

/** Uma peça: caixa de 1 m centrada em (x, y, z), ou do tamanho pedido. */
const peca = (x: number, y: number, z: number, t = 1) => [x - t / 2, y - t / 2, z - t / 2, x + t / 2, y + t / 2, z + t / 2]

describe('enquadrar sem peças soltas', () => {
  it('casa pequena com um marcador de georreferência a 40 m: o marcador fica fora', () => {
    const casa = [peca(0, 0, 0, 6), peca(-3, 1.5, 0), peca(3, 1.5, 0), peca(0, 1.5, -3), peca(0, 1.5, 3), peca(0, 4, 0, 5), peca(1, 0.5, 1)]
    const caixas = [...casa, peca(-35, -1, 17)].flat()
    const r = caixaSemIsolados(caixas)!
    expect(r[0]).toBeGreaterThan(-5)
    expect(r[5]).toBeLessThan(5)
  })

  it('prédio comprido (60 m) e torre alta (30 andares): nada sai', () => {
    const comprido = Array.from({ length: 61 }, (_, i) => peca(i, 1, 0)).flat()
    expect(caixaSemIsolados(comprido)).toEqual([-0.5, 0.5, -0.5, 60.5, 1.5, 0.5])
    // andares de baixo com mais peças que os de cima, e uma caixa d'água solta no topo
    const torre = [
      ...Array.from({ length: 200 }, (_, i) => peca(i % 10, (i % 5) * 3, 0)),
      ...Array.from({ length: 25 }, (_, i) => peca(i % 5, 15 + i * 3, 0)),
      peca(2, 92, 0),
    ].flat()
    const t = caixaSemIsolados(torre)!
    expect(t[4]).toBeCloseTo(92.5)
  })

  it('dois prédios vizinhos a 20 m: os dois ficam; um barracão solto a 150 m sai', () => {
    const predio = (x0: number) => Array.from({ length: 30 }, (_, i) => peca(x0 + (i % 6) * 6, Math.floor(i / 6) * 3, 0))
    const caixas = [...predio(0), ...predio(50), peca(230, 0, 0, 4)].flat()
    const r = caixaSemIsolados(caixas)!
    expect(r[0]).toBeCloseTo(-0.5)
    expect(r[3]).toBeCloseTo(80.5)
  })

  it('poucas peças, peças juntas e peça sem geometria: usa tudo o que tem desenho', () => {
    const poucas = [peca(0, 0, 0), peca(50, 0, 0)].flat()
    expect(caixaSemIsolados(poucas)).toEqual([-0.5, -0.5, -0.5, 50.5, 0.5, 0.5])
    const juntas = [peca(0, 0, 0), peca(0.1, 0, 0), peca(0.2, 0, 0), peca(0.3, 0, 0), peca(0.4, 0, 0), peca(2.5, 0, 0)].flat()
    expect(caixaSemIsolados(juntas)![3]).toBeCloseTo(3)
    const semDesenho = [...peca(0, 0, 0), Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
    expect(caixaSemIsolados(semDesenho)).toEqual([-0.5, -0.5, -0.5, 0.5, 0.5, 0.5])
    expect(caixaSemIsolados([])).toBeNull()
  })

  it('a amostra lida pelo web-ifc enquadra igual à caixa inteira', async () => {
    const api = new IfcAPI()
    await api.Init()
    const id = api.OpenModel(amostraBytes(), { COORDINATE_TO_ORIGIN: false })
    const m = lerModelo({ api, modeloId: id, nome: 'amostra.ifc', tamanho: 1, id: 'teste' })
    api.CloseModel(id)
    const r = caixaSemIsolados(m.tabela.caixas)!
    m.meta.caixa.forEach((v, k) => expect(r[k]).toBeCloseTo(v, 3))
  })
})

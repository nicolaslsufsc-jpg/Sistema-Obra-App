// Leitura de IFC com o web-ifc de verdade, no Node, sobre a amostra escrita à mão.
import { beforeAll, describe, expect, it } from 'vitest'
import { IfcAPI } from 'web-ifc'
import { lerModelo } from '../src/ifc/motor/leitor'
import { lerPacote, pacoteParaBlob, pacoteComprimido, abrirArquivoDePacote, lerMetaDoPacote } from '../src/ifc/motor/pacote'
import { qtdElementos, type ModeloIfc } from '../src/ifc/motor/tipos'
import { amostraBytes } from './ifc/amostra'

let modelo: ModeloIfc

beforeAll(async () => {
  const api = new IfcAPI()
  await api.Init()
  const id = api.OpenModel(amostraBytes(), { COORDINATE_TO_ORIGIN: false })
  modelo = lerModelo({ api, modeloId: id, nome: 'amostra.ifc', tamanho: 1, id: 'teste' })
  api.CloseModel(id)
})

function indicePorNome(nome: string): number {
  const i = modelo.meta.nomes.indexOf(nome)
  expect(i, `elemento ${nome}`).toBeGreaterThanOrEqual(0)
  return i
}

describe('leitura do IFC', () => {
  it('acha todos os elementos com nome, classe e etiqueta', () => {
    expect(qtdElementos(modelo)).toBe(5)
    const p1 = indicePorNome('P1')
    expect(modelo.meta.classes[modelo.tabela.classe[p1]]).toMatch(/column/i)
    expect(modelo.meta.tags[p1]).toBe('T-003')
  })

  it('converte milímetro para metro, inclusive a elevação dos pavimentos', () => {
    expect(modelo.meta.pavimentos.map((p) => p.nome)).toEqual(['Terreo', '1 Pavimento'])
    expect(modelo.meta.pavimentos.map((p) => p.elevacao)).toEqual([0, 3])
    const a = indicePorNome('Parede A') * 6
    const c = modelo.tabela.caixas
    expect(c[a + 3] - c[a]).toBeCloseTo(5, 3)
    expect(c[a + 4] - c[a + 1]).toBeCloseTo(3, 3) // Y é a altura
  })

  it('liga cada elemento ao pavimento certo', () => {
    const nomePav = (n: string) => modelo.meta.pavimentos[modelo.tabela.pavimento[indicePorNome(n)]].nome
    expect(nomePav('Parede A')).toBe('Terreo')
    expect(nomePav('Parede B')).toBe('1 Pavimento')
    expect(nomePav('P1')).toBe('Terreo')
    expect(nomePav('L1')).toBe('1 Pavimento')
  })

  it('lê camada, material e propriedades', () => {
    const camada = (n: string) => modelo.meta.camadas[modelo.tabela.camada[indicePorNome(n)]]
    expect(camada('Parede A')).toBe('Alvenaria Externa')
    expect(camada('P1')).toBe('Estrutura')
    expect(modelo.meta.materiais[modelo.tabela.material[indicePorNome('P1')]]).toBe('Concreto C30')

    const p1 = indicePorNome('P1')
    const psets = Array.from(modelo.tabela.psetsLista.slice(modelo.tabela.psetsInicio[p1], modelo.tabela.psetsInicio[p1 + 1]))
    expect(psets).toHaveLength(1)
    const conj = modelo.meta.psets[psets[0]]
    expect(conj.nome).toBe('Dados do concreto')
    expect(conj.props).toContainEqual(['Fck', '30'])
    expect(conj.props).toContainEqual(['Resistente ao fogo', 'Sim'])
  })

  it('cada elemento aponta para os próprios triângulos', () => {
    const { partes, partesInicio, caixas } = modelo.tabela
    for (let e = 0; e < qtdElementos(modelo); e++) {
      expect(partesInicio[e + 1]).toBeGreaterThan(partesInicio[e])
      for (let p = partesInicio[e]; p < partesInicio[e + 1]; p += 3) {
        const bloco = modelo.blocos[partes[p]]
        for (let k = partes[p + 1]; k < partes[p + 1] + partes[p + 2]; k++) {
          const v = bloco.indices[k]
          expect(bloco.elementos[v]).toBe(e)
          const x = bloco.posicoes[v * 3]
          expect(x).toBeGreaterThanOrEqual(caixas[e * 6] - 1e-3)
          expect(x).toBeLessThanOrEqual(caixas[e * 6 + 3] + 1e-3)
        }
      }
    }
  })

  it('desenha só as arestas vivas: uma caixa tem 12, não 18', () => {
    const p1 = indicePorNome('P1')
    const bloco = modelo.blocos.find((b) => b.elementos.includes(p1))!
    let arestas = 0
    for (let i = 0; i < bloco.arestas.length; i += 2) if (bloco.elementos[bloco.arestas[i]] === p1) arestas++
    expect(arestas).toBe(12)
  })
})

describe('pacote .obra3d', () => {
  it('ida e volta mantém tudo igual', async () => {
    const dados = await pacoteParaBlob(modelo).arrayBuffer()
    const lido = lerPacote(dados)
    expect(lido.meta).toEqual(modelo.meta)
    expect(Array.from(lido.tabela.classe)).toEqual(Array.from(modelo.tabela.classe))
    expect(lido.blocos).toHaveLength(modelo.blocos.length)
    expect(Array.from(lido.blocos[0].posicoes)).toEqual(Array.from(modelo.blocos[0].posicoes))
    expect(Array.from(lido.blocos[0].arestas)).toEqual(Array.from(modelo.blocos[0].arestas))
  })

  it('o arquivo comprimido abre igual', async () => {
    const z = await pacoteComprimido(modelo)
    const lido = await abrirArquivoDePacote(z)
    expect(lido.meta.nomes).toEqual(modelo.meta.nomes)
    expect(Array.from(lido.blocos[0].indices)).toEqual(Array.from(modelo.blocos[0].indices))
  })

  it('lê só o cabeçalho para listar', async () => {
    const meta = await lerMetaDoPacote(pacoteParaBlob(modelo))
    expect(meta.nome).toBe('amostra.ifc')
  })

  it('recusa arquivo que não é pacote', () => {
    expect(() => lerPacote(new ArrayBuffer(32))).toThrow(/não é um modelo/)
  })
})

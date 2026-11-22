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

  it('muitas propriedades vão em pedaços (modelo grande de hidráulica) e voltam iguais', async () => {
    const psets = Array.from({ length: 4500 }, (_, i) => ({ nome: `Pset ${i}`, props: [['Comprimento', `${i} mm`]] as [string, string][] }))
    const grande = { ...modelo, meta: { ...modelo.meta, psets } }
    const blob = pacoteParaBlob(grande)
    const lido = lerPacote(await blob.arrayBuffer())
    expect(lido.meta.psets).toHaveLength(4500)
    expect(lido.meta.psets[4499]).toEqual(psets[4499])
    expect(lido.meta).toEqual(grande.meta)
    expect(Array.from(lido.blocos[0].indices)).toEqual(Array.from(modelo.blocos[0].indices))
    // a lista do aparelho lê só o cabeçalho: sem as propriedades
    const meta = await lerMetaDoPacote(blob)
    expect(meta.nome).toBe('amostra.ifc')
    expect(meta.psets).toEqual([])
  })

  it('modelo guardado na versão 1 (propriedades no cabeçalho) continua abrindo', () => {
    // monta o arquivo como a versão 1 gravava
    const enc = new TextEncoder()
    const desc = (v: { length: number; constructor: { name: string } }) => ({ t: ({ Float32Array: 'F32', Int8Array: 'I8', Uint8Array: 'U8', Uint32Array: 'U32', Int32Array: 'I32' } as Record<string, string>)[v.constructor.name], n: v.length })
    const camposTabela = ['expressIds', 'caixas', 'partesInicio', 'partes', 'classe', 'tipo', 'pavimento', 'camada', 'material', 'psetsInicio', 'psetsLista'] as const
    const camposBloco = ['posicoes', 'normais', 'cores', 'elementos', 'indices', 'arestas'] as const
    const cab = {
      meta: modelo.meta,
      tabela: Object.fromEntries(camposTabela.map((c) => [c, desc(modelo.tabela[c])])),
      blocos: modelo.blocos.map((b) => ({ pavimento: b.pavimento, caixa: b.caixa, v: Object.fromEntries(camposBloco.map((c) => [c, desc(b[c])])) })),
    }
    const json = enc.encode(JSON.stringify(cab))
    const vetores = [...camposTabela.map((c) => modelo.tabela[c]), ...modelo.blocos.flatMap((b) => camposBloco.map((c) => b[c]))]
    let total = 12 + json.length
    const partes: Uint8Array[] = []
    for (const v of vetores) {
      const p = (8 - (total % 8)) % 8
      partes.push(new Uint8Array(p))
      total += p
      partes.push(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))
      total += v.byteLength
    }
    const dados = new Uint8Array(total)
    const dv = new DataView(dados.buffer)
    dv.setUint32(0, 0x33_4f_42_4f, true)
    dv.setUint32(4, 1, true)
    dv.setUint32(8, json.length, true)
    dados.set(json, 12)
    let pos = 12 + json.length
    for (const p of partes) {
      dados.set(p, pos)
      pos += p.length
    }
    const lido = lerPacote(dados.buffer)
    expect(lido.meta).toEqual(modelo.meta)
    expect(Array.from(lido.blocos[0].posicoes)).toEqual(Array.from(modelo.blocos[0].posicoes))
  })
})

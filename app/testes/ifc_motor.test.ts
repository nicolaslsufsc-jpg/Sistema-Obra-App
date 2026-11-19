// Partes do leitor de IFC sem tela: cortes, categorias, busca e alinhamento.
import { beforeAll, describe, expect, it } from 'vitest'
import { IfcAPI } from 'web-ifc'
import { Matrix4, Vector3 } from 'three'
import { lerModelo } from '../src/ifc/motor/leitor'
import { categoriaDe, corDoModelo, corDoPavimento, escurecer } from '../src/ifc/motor/categorias'
import { cortar, direcaoPrincipal, juntarSegmentos, planoDe, preencher, type EntradaCorte } from '../src/ifc/motor/corte'
import { corteParaDxf, corteParaSvg } from '../src/ifc/motor/exportar'
import { buscar, filtroVazio, indexarModelo, novosDicionarios, type Dicionarios, type IndiceModelo } from '../src/ifc/motor/indice'
import { ajusteDePontos, ajusteNeutro, matrizDoModelo } from '../src/ifc/motor/alinhamento'
import type { ModeloIfc, Vec3 } from '../src/ifc/motor/tipos'
import { amostraBytes } from './ifc/amostra'

let modelo: ModeloIfc
let dic: Dicionarios
let indice: IndiceModelo
const IDENTIDADE = new Matrix4().elements

function entrada(m: ModeloIfc, matriz: ArrayLike<number> = IDENTIDADE): EntradaCorte {
  return { chave: 1, modelo: m, matriz, visivel: () => true }
}

function area(l: Float64Array): number {
  let a = 0
  for (let i = 0; i < l.length; i += 2) {
    const j = (i + 2) % l.length
    a += l[i] * l[j + 1] - l[j] * l[i + 1]
  }
  return Math.abs(a / 2)
}

function areaTriangulos(t: number[]): number {
  let s = 0
  for (let i = 0; i < t.length; i += 6) {
    s += Math.abs((t[i + 2] - t[i]) * (t[i + 5] - t[i + 1]) - (t[i + 4] - t[i]) * (t[i + 3] - t[i + 1])) / 2
  }
  return s
}

const elementoPorNome = (n: string) => modelo.meta.nomes.indexOf(n)

beforeAll(async () => {
  const api = new IfcAPI()
  await api.Init()
  const id = api.OpenModel(amostraBytes(), { COORDINATE_TO_ORIGIN: false })
  modelo = lerModelo({ api, modeloId: id, nome: 'amostra.ifc', tamanho: 1, id: 'teste' })
  api.CloseModel(id)
  dic = novosDicionarios()
  indice = indexarModelo(modelo, dic)
})

describe('corte', () => {
  it('planta a 1,20 m corta parede, pilar e janela do térreo, e nada do andar de cima', async () => {
    const y = 1.2 - modelo.meta.origem[1]
    const r = await cortar([entrada(modelo)], planoDe([0, 1, 0], [0, y, 0]))
    const nomes = r!.pecas.map((p) => modelo.meta.nomes[p.elemento]).sort()
    expect(nomes).toEqual(['J1', 'P1', 'Parede A'])
  })

  it('o pilar de 40 x 40 cm vira um quadrado fechado de 0,16 m²', async () => {
    const y = 1.2 - modelo.meta.origem[1]
    const r = await cortar([entrada(modelo)], planoDe([0, 1, 0], [0, y, 0]))
    const p1 = r!.pecas.find((p) => p.elemento === elementoPorNome('P1'))!
    expect(p1.lacos).toHaveLength(1)
    expect(p1.abertos).toHaveLength(0)
    expect(area(p1.lacos[0])).toBeCloseTo(0.16, 4)
    expect(areaTriangulos(preencher(p1.lacos))).toBeCloseTo(0.16, 4)
  })

  it('o corte vertical passa pelas duas paredes e pela laje, e os limites batem com a altura do prédio', async () => {
    // Plano z = 0,1 m do arquivo (Y da cena): corta as paredes ao meio na espessura.
    const parede = elementoPorNome('Parede A') * 6
    const c = modelo.tabela.caixas
    const zMeio = (c[parede + 2] + c[parede + 5]) / 2
    const r = await cortar([entrada(modelo)], planoDe([0, 0, 1], [0, 0, zMeio]))
    const nomes = r!.pecas.map((p) => modelo.meta.nomes[p.elemento]).sort()
    expect(nomes).toEqual(['L1', 'Parede A', 'Parede B'])
    const [, v0, , v1] = r!.limites!
    expect(v1 - v0).toBeCloseTo(6, 3)
  })

  it('peça oculta fica fora do corte', async () => {
    const y = 1.2 - modelo.meta.origem[1]
    const p1 = elementoPorNome('P1')
    const r = await cortar([{ ...entrada(modelo), visivel: (i) => i !== p1 }], planoDe([0, 1, 0], [0, y, 0]))
    expect(r!.pecas.some((p) => p.elemento === p1)).toBe(false)
  })

  it('plano fora do prédio não acha nada', async () => {
    const r = await cortar([entrada(modelo)], planoDe([0, 1, 0], [0, 500, 0]))
    expect(r!.pecas).toHaveLength(0)
    expect(r!.limites).toBeNull()
  })

  it('modelo deslocado e girado corta no lugar certo', async () => {
    const m = new Matrix4().makeRotationY(Math.PI / 2).setPosition(10, 2, 30)
    const y = 2 + 1.2 - modelo.meta.origem[1]
    const r = await cortar([entrada(modelo, m.elements)], planoDe([0, 1, 0], [10, y, 30]))
    const p1 = r!.pecas.find((p) => p.elemento === elementoPorNome('P1'))!
    expect(area(p1.lacos[0])).toBeCloseTo(0.16, 4)
  })

  it('furo é respeitado no preenchimento: quadrado 4 x 4 com furo 2 x 2 dá 12 m²', () => {
    const fora = Float64Array.from([0, 0, 4, 0, 4, 4, 0, 4])
    const furo = Float64Array.from([1, 1, 3, 1, 3, 3, 1, 3])
    expect(areaTriangulos(preencher([fora, furo]))).toBeCloseTo(12, 6)
  })

  it('duas peças separadas na mesma lista são preenchidas cada uma', () => {
    const a = Float64Array.from([0, 0, 1, 0, 1, 1, 0, 1])
    const b = Float64Array.from([5, 5, 6, 5, 6, 6, 5, 6])
    expect(areaTriangulos(preencher([a, b]))).toBeCloseTo(2, 6)
  })

  it('junta segmentos soltos e fora de ordem num laço só', () => {
    const { lacos, abertos } = juntarSegmentos([1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1])
    expect(lacos).toHaveLength(1)
    expect(abertos).toHaveLength(0)
    expect(area(lacos[0])).toBeCloseTo(1, 6)
  })

  it('malha com furo não vira laço falso: fica como risco aberto', () => {
    const { lacos, abertos } = juntarSegmentos([0, 0, 1, 0, 1, 0, 1, 1])
    expect(lacos).toHaveLength(0)
    expect(abertos).toHaveLength(1)
  })

  it('direção do prédio: amostra alinhada aos eixos dá 0° ou 90°', () => {
    const g = (direcaoPrincipal([{ modelo, matriz: IDENTIDADE }]) * 180) / Math.PI
    expect(Math.min(Math.abs(g), Math.abs(g - 90), Math.abs(g - 1))).toBeLessThanOrEqual(2)
  })
})

describe('exportar o corte', () => {
  const info = () => ({ camada: 'Lajes e pisos', corCorte: '#55636f' })

  it('DXF tem camada sem acento, polilinha fechada e níveis', async () => {
    const y = 1.2 - modelo.meta.origem[1]
    const r = (await cortar([entrada(modelo)], planoDe([0, 1, 0], [0, y, 0])))!
    const dxf = corteParaDxf(r, info, [{ nome: 'Térreo +0,00', v: 0 }])
    expect(dxf).toContain('LAJES_E_PISOS')
    expect(dxf).toContain('POLYLINE')
    expect(dxf).toContain('SEQEND')
    expect(dxf).toContain('Térreo +0,00')
    expect(dxf.trim().endsWith('EOF')).toBe(true)
  })

  it('SVG escapa o nome do nível e pinta as peças', async () => {
    const y = 1.2 - modelo.meta.origem[1]
    const r = (await cortar([entrada(modelo)], planoDe([0, 1, 0], [0, y, 0])))!
    const svg = corteParaSvg(r, info, [{ nome: 'A&B <1>', v: 0 }])
    expect(svg).toContain('A&amp;B &lt;1&gt;')
    expect(svg).toContain('fill="#55636f"')
    expect(svg).not.toContain('<1>')
  })
})

describe('categorias', () => {
  const base = { classe: '', camada: '', nome: '', pai: '', tipo: '', material: '' }

  it('classe do IFC decide quando já diz o que a peça é', () => {
    expect(categoriaDe({ ...base, classe: 'IfcColumn', nome: 'P1' })).toBe('pilar')
    expect(categoriaDe({ ...base, classe: 'IfcBeam', nome: 'V1P3' })).toBe('viga')
    expect(categoriaDe({ ...base, classe: 'IfcWallStandardCase' })).toBe('parede')
    expect(categoriaDe({ ...base, classe: 'IfcPile' })).toBe('fundacao')
    expect(categoriaDe({ ...base, classe: 'IfcFlowTerminal' })).toBe('mobiliario')
  })

  it('proxy do ArchiCAD: a camada separa as peças', () => {
    const proxy = { ...base, classe: 'IfcBuildingElementProxy' }
    expect(categoriaDe({ ...proxy, camada: '1 |ARQ| Pilar Fachada', nome: 'Pilar Madeira:20x20cm' })).toBe('pilar')
    expect(categoriaDe({ ...proxy, camada: '1 |ARQ| Viga Fachada' })).toBe('viga')
    expect(categoriaDe({ ...proxy, camada: '1 |ARQ| Guarda-Corpo', nome: 'GC05' })).toBe('guarda')
    expect(categoriaDe({ ...proxy, camada: '1 |ARQ| Forro Entregue', nome: 'FORRO 240' })).toBe('forro')
    expect(categoriaDe({ ...proxy, camada: '1 |ARQ| Piso' })).toBe('laje')
    expect(categoriaDe({ ...proxy, camada: 'I ARQ I Floreiras Soltas' })).toBe('terreno')
  })

  it('o nome vale mais que a camada: vidro e porta numa camada de parede', () => {
    const parte = { ...base, classe: 'IfcBuildingElementPart', camada: '1 |ARQ| Parede - Geral.3D' }
    expect(categoriaDe({ ...parte, nome: 'VIDRO', material: 'VIDRO' })).toBe('vidro')
    expect(categoriaDe({ ...parte, nome: 'ALUMÍNIO', pai: 'PM80' })).toBe('porta')
    expect(categoriaDe({ ...parte, nome: 'ALUMÍNIO', tipo: 'Janela de Correr 2-Folhas 27' })).toBe('caixilho')
    expect(categoriaDe({ ...parte, nome: 'GESSO DRYWALL ST', pai: 'Parede-404' })).toBe('parede')
  })

  it('alumínio não é elétrica (a palavra "lumin" está dentro de "alumínio")', () => {
    const proxy = { ...base, classe: 'IfcBuildingElementProxy' }
    expect(categoriaDe({ ...proxy, nome: 'Peça', material: '.Alumínio Anodizado' })).toBe('caixilho')
    expect(categoriaDe({ ...proxy, nome: 'Luminária do hall' })).toBe('eletrica')
    expect(categoriaDe({ ...proxy, camada: '1 I ARQ I Grelhas Marrom', nome: '268', material: '.Alumínio Anodizado' })).toBe('caixilho')
    expect(categoriaDe({ ...proxy, nome: 'ALUMÍNIO', camada: '1 |ARQ| Parede - Geral.3D', pai: 'Parede-403' })).toBe('caixilho')
  })

  it('guarda-corpo continua guarda-corpo, menos o vidro dele', () => {
    const parte = { ...base, classe: 'IfcBuildingElementPart', camada: '1 |ARQ| Guarda-Corpo', pai: 'GC05' }
    expect(categoriaDe({ ...parte, nome: 'ALUMÍNIO' })).toBe('guarda')
    expect(categoriaDe({ ...parte, nome: 'VIDRO' })).toBe('vidro')
  })

  it('sem nenhuma pista cai em outros', () => {
    expect(categoriaDe({ ...base, classe: 'IfcBuildingElementProxy', nome: 'XPTO' })).toBe('outros')
  })

  it('cor do modelo sai do nome do arquivo', () => {
    expect(corDoModelo('OUTRA_EST_REV05.ifc', 0)).toBe(corDoModelo('Projeto.EST.ifc', 3))
    expect(corDoModelo('OUTRA_ARQ_REV10.ifc', 0)).not.toBe(corDoModelo('OUTRA_EST_REV05.ifc', 0))
    expect(corDoModelo('EXE.AR.EX.000.TORRE.ifc', 1)).toBe(corDoModelo('OUTRA_ARQ.ifc', 0))
  })

  it('escalas de cor dão hexadecimal válido nas pontas', () => {
    expect(corDoPavimento(0, 5)).toMatch(/^#[0-9a-f]{6}$/i)
    expect(corDoPavimento(4, 5)).toMatch(/^#[0-9a-f]{6}$/i)
    expect(corDoPavimento(0, 1)).toMatch(/^#[0-9a-f]{6}$/i)
    expect(escurecer('#ffffff')).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('busca', () => {
  const nomesAchados = (passa: Uint8Array) => modelo.meta.nomes.filter((_, i) => passa[i])

  it('sem filtro passa tudo', () => {
    const r = buscar([indice], dic, filtroVazio())
    expect(r.total).toBe(5)
  })

  it('texto ignora acento e maiúscula, e acha em nome, tag, material e propriedade', () => {
    const t = (texto: string) => nomesAchados(buscar([indice], dic, { texto, marcados: {} }).passa[0])
    expect(t('PAREDE t-001')).toEqual(['Parede A'])
    expect(t('T-003')).toEqual(['P1'])
    expect(t('concreto')).toEqual(expect.arrayContaining(['P1', 'L1']))
    expect(t('FCK')).toEqual(['P1']) // só na propriedade
    expect(t('térreo pilares')).toEqual(['P1']) // duas palavras: as duas têm que estar
    expect(t('nao existe')).toEqual([])
  })

  it('facetas: dentro da mesma é "ou", entre facetas diferentes é "e"', () => {
    const r = buscar([indice], dic, {
      texto: '',
      marcados: { pavimento: new Set(['Terreo']), categoria: new Set(['Paredes', 'Pilares']) },
    })
    expect(nomesAchados(r.passa[0]).sort()).toEqual(['P1', 'Parede A'])
  })

  it('marcar um pavimento não zera a contagem dos outros, para poder marcar mais de um', () => {
    const r = buscar([indice], dic, { texto: '', marcados: { pavimento: new Set(['Terreo']) } })
    expect(r.contagens.pavimento.get('Terreo')).toBe(3)
    expect(r.contagens.pavimento.get('1 Pavimento')).toBe(2)
    // As outras facetas contam só o que está no térreo.
    expect(r.contagens.categoria.get('Lajes e pisos')).toBeUndefined()
    expect(r.contagens.categoria.get('Pilares')).toBe(1)
  })

  it('dois modelos: mesmo pavimento é o mesmo valor na lista', () => {
    const d = novosDicionarios()
    const a = indexarModelo(modelo, d)
    const b = indexarModelo({ ...modelo, meta: { ...modelo.meta, nome: 'outro.ifc' } }, d)
    const r = buscar([a, b], d, { texto: '', marcados: { pavimento: new Set(['Terreo']) } })
    expect(r.total).toBe(6)
    expect(r.contagens.modelo.get('amostra.ifc')).toBe(3)
    expect(r.contagens.modelo.get('outro.ifc')).toBe(3)
  })
})

describe('alinhamento', () => {
  const aplicar = (m: Matrix4, p: Vec3) => new Vector3(...p).applyMatrix4(m).toArray()
  const origem: Vec3 = [100, 0, 200]
  const cena: Vec3 = [100, 0, 200]

  it('sem ajuste, modelos com a mesma origem ficam no mesmo lugar', () => {
    const m = matrizDoModelo(origem, cena, ajusteNeutro())
    expect(aplicar(m, [1, 2, 3])).toEqual([1, 2, 3])
  })

  it('origens diferentes mantêm a coordenada real', () => {
    const m = matrizDoModelo([110, 0, 200], cena, ajusteNeutro())
    expect(aplicar(m, [1, 2, 3])).toEqual([11, 2, 3])
  })

  it('um par de pontos só desloca', () => {
    const a = ajusteDePontos(ajusteNeutro(), [[10, 5, 20]], [[13, 5, 16]])
    expect(a.giro).toBe(0)
    expect(a.delta).toEqual([3, 0, -4])
  })

  it('dois pares também acertam o giro: os dois pontos caem exatamente no alvo', () => {
    const de: Vec3[] = [
      [100, 0, 200],
      [110, 0, 200],
    ]
    const para: Vec3[] = [
      [150, 1, 250],
      [150, 1, 260],
    ]
    const a = ajusteDePontos(ajusteNeutro(), de, para)
    const m = matrizDoModelo([0, 0, 0], [0, 0, 0], a)
    for (let i = 0; i < 2; i++) {
      const r = aplicar(m, de[i])
      expect(r[0]).toBeCloseTo(para[i][0], 6)
      expect(r[1]).toBeCloseTo(para[i][1], 6)
      expect(r[2]).toBeCloseTo(para[i][2], 6)
    }
  })

  it('um segundo alinhamento soma por cima do primeiro', () => {
    const a1 = ajusteDePontos(
      ajusteNeutro(),
      [
        [0, 0, 0],
        [10, 0, 0],
      ],
      [
        [5, 0, 5],
        [5, 0, 15],
      ],
    )
    const m1 = matrizDoModelo([0, 0, 0], [0, 0, 0], a1)
    const ondeEsta = aplicar(m1, [10, 0, 0]) as Vec3
    const a2 = ajusteDePontos(a1, [ondeEsta], [[7, 0, 20]])
    const m2 = matrizDoModelo([0, 0, 0], [0, 0, 0], a2)
    const r = aplicar(m2, [10, 0, 0])
    expect(r[0]).toBeCloseTo(7, 6)
    expect(r[2]).toBeCloseTo(20, 6)
  })
})

import { describe, expect, it } from 'vitest'
import { BancoLocal } from '../nucleo/banco_local'
import { abrirPacoteZip, prepararObraLocal } from '../nucleo/pacote_obra'
import { abrirPacote } from '../fvs/pacote'
import { escalaDosTextos, niveisDaPlanta, trechoDosTextos } from './pdf'
import { aplicarLeitura, conferencia, contornoDaLeitura, moverJanela, montarPacotePlanta, nomeESecao, pecaDoTexto, plantaEmDia, pranchaDoArquivo, problemasDaPlanta, retanguloDeDoisToques, textoPerto, type PlantaRascunho } from './planta'
import { fichaVazia, idDaPeca, problemas, zipDoRascunho, type RascunhoObra } from './modelo'
import type { TilesGuardados } from './guardados'

const blob = (t: string) => new Blob([t])

function planta(parcial: Partial<PlantaRascunho> = {}): PlantaRascunho {
  return {
    id: 'a2000000-0000-0000-0000-0000000000e2',
    pavimento: 'Térreo',
    trecho: 'Planta inteira',
    prancha: 'EX2-FORMA-TERREO-R00',
    revisao: 'R00',
    arquivo: 'EX2-FORMA-TERREO-R00.pdf',
    pagina: { largura: 2384, altura: 1684 },
    janela: [100, 50, 1100, 650],
    escala: 75,
    semTexto: false,
    pecas: [
      { tipo: 'P', nome: 'P-01', secao: '20x50', rotulo: [10, 10, 40, 20], polys: [] },
      { tipo: 'V', nome: 'VT-01', secao: '15x40', rotulo: [50, 10, 90, 20], polys: [[[50, 30], [90, 30], [90, 35], [50, 35]]] },
    ],
    gerada: { janela: [100, 50, 1100, 650], tiles: 3, bytes: 9, segundos: 1 },
    ...parcial,
  }
}

describe('Nova obra: plantas', () => {
  it('nome e seção do texto da projetista B e da obra piloto', () => {
    expect(nomeESecao('P-01  20x50')).toEqual({ nome: 'P-01', secao: '20x50' })
    expect(nomeESecao('VT-03 15x40')).toEqual({ nome: 'VT-03', secao: '15x40' })
    expect(nomeESecao('V 132')).toEqual({ nome: 'V132', secao: '' })
    expect(nomeESecao('P12 (19x60)')).toEqual({ nome: 'P12', secao: '19x60' })
    expect(nomeESecao('ESCADA')).toEqual({ nome: 'ESCADA', secao: '' })
  })

  it('escala do carimbo: uma só, senão pergunta', () => {
    const t = (texto: string) => ({ texto, ret: [0, 0, 1, 1] as [number, number, number, number] })
    expect(escalaDosTextos([t('ESCALA 1:75'), t('P-01')])).toBe(75)
    expect(escalaDosTextos([t('Esc. 1/50')])).toBe(50)
    expect(escalaDosTextos([t('1:50'), t('DETALHE 1:20')])).toBeNull()
    expect(escalaDosTextos([t('11:30'), t('P-01')])).toBeNull()
    expect(escalaDosTextos([])).toBeNull()
    // trecho do título da prancha (achado do Testador)
    expect(trechoDosTextos([t('FORMA DO TIPO 1 - TRECHO B'), t('P-01')])).toBe('Trecho B')
    expect(trechoDosTextos([t('Trecho 2'), t('trecho 2')])).toBe('Trecho 2')
    expect(trechoDosTextos([t('TRECHO A'), t('TRECHO B')])).toBeNull()
    expect(trechoDosTextos([t('TRECHOS'), t('P-01')])).toBeNull()
  })

  it('níveis como o folha_unica.py: até a folha caber em 1024 px', () => {
    expect(niveisDaPlanta(2384, 1684)).toEqual([-2, -1, 0, 1])
    expect(niveisDaPlanta(9900, 8164)).toEqual([-4, -3, -2, -1, 0, 1])
  })

  it('prancha e revisão pelo nome do arquivo', () => {
    expect(pranchaDoArquivo('EX2-FORMA-TIPO1-A-R03.pdf')).toEqual({ prancha: 'EX2-FORMA-TIPO1-A-R03', revisao: 'R03' })
    expect(pranchaDoArquivo('forma terreo.PDF')).toEqual({ prancha: 'forma terreo', revisao: 'R00' })
  })

  it('tocar no nome: o texto mais perto, dentro da folga; vira peça em coordenadas da planta', () => {
    const textos = [
      { texto: 'P-01  20x50', ret: [110, 60, 150, 70] as [number, number, number, number] },
      { texto: 'VT-01  15x40', ret: [200, 60, 250, 70] as [number, number, number, number] },
    ]
    expect(textoPerto(textos, 300, 300, 10)).toBeNull()
    const t = textoPerto(textos, 152, 65, 10)!
    expect(t.texto).toBe('P-01  20x50')
    expect(pecaDoTexto(t, [100, 50, 1100, 650], 'V')).toEqual({ tipo: 'P', nome: 'P-01', secao: '20x50', rotulo: [10, 10, 50, 20], polys: [] })
    // nome que não diz o tipo: vale o escolhido na tela
    expect(pecaDoTexto({ texto: 'C12', ret: [100, 50, 110, 60] }, [100, 50, 1100, 650], 'V').tipo).toBe('V')
  })

  it('retângulo de dois toques em qualquer ordem', () => {
    expect(retanguloDeDoisToques([30, 40], [10, 5]).rotulo).toEqual([10, 5, 30, 40])
  })

  it('trocar a janela leva as peças junto e pede para desenhar de novo', () => {
    const p = planta()
    const q = moverJanela(p, [80, 40, 1100, 650])
    expect(q.pecas[0].rotulo).toEqual([30, 20, 60, 30])
    expect(q.pecas[1].polys[0][0]).toEqual([70, 40])
    expect(plantaEmDia(p)).toBe(true)
    expect(plantaEmDia(q)).toBe(false)
  })

  it('problemas da planta', () => {
    expect(problemasDaPlanta(planta(), ['Térreo'])).toEqual([])
    const l = problemasDaPlanta(planta({ escala: null, gerada: null, pecas: [{ tipo: 'P', nome: 'P1', secao: '', rotulo: [0, 0, 1, 1], polys: [] }, { tipo: 'P', nome: 'p1', secao: '', rotulo: [0, 0, 1, 1], polys: [] }] }), ['Tipo 1']).join('\n')
    expect(l).toMatch(/não está mais na lista/)
    expect(l).toMatch(/escolha a escala/)
    expect(l).toMatch(/falta desenhar a planta/)
    expect(l).toMatch(/p1 marcado duas vezes/)
  })

  it('leitura automática: vai para coordenadas da planta; ler de novo troca as lidas e guarda as feitas à mão', () => {
    const lida = (nome: string, x: number) => ({ tipo: 'P' as const, nome, secao: '20x50', rotulo: [x, 60, x + 30, 70] as [number, number, number, number], polys: [[[x, 80], [x + 10, 80], [x + 10, 100], [x, 100]] as Array<[number, number]>] })
    const base = planta({ pecas: [{ tipo: 'V', nome: 'VT-01', secao: '', rotulo: [0, 0, 1, 1], polys: [] }] })
    const l1 = { pecas: [lida('P-01', 110), lida('VT-01', 200)], naoLidos: [{ texto: 'PX-3', ret: [300, 60, 320, 70] as [number, number, number, number] }], paineis: [], repetidos: [] }
    const a = aplicarLeitura(base, { ...l1, pecas: [lida('P-01', 110), { ...lida('VT-01', 200), tipo: 'V' as const }] }, 'Perfil X')
    // VT-01 já estava à mão: a lida não entra
    expect(a.pecas.map((p) => [p.nome, !!p.lida])).toEqual([
      ['VT-01', false],
      ['P-01', true],
    ])
    // janela começa em (100, 50)
    expect(a.pecas[1].rotulo).toEqual([10, 10, 40, 20])
    expect(a.pecas[1].polys[0][0]).toEqual([10, 30])
    expect(a.leitura).toEqual({ perfil: 'Perfil X', naoLidos: [{ texto: 'PX-3', ret: [200, 10, 220, 20] }], paineis: [], repetidos: [] })
    // ler de novo: a P-01 lida antes sai, a nova entra
    const b = aplicarLeitura(a, { pecas: [lida('P-02', 150)], naoLidos: [], paineis: [], repetidos: [] }, 'Perfil X')
    expect(b.pecas.map((p) => p.nome)).toEqual(['VT-01', 'P-02'])
    // trocar a janela leva os textos da conferência junto
    expect(moverJanela(a, [80, 40, 1100, 650]).leitura!.naoLidos[0].ret).toEqual([220, 20, 240, 30])
  })

  it('conferência: sem contorno, sem seção, repetido, não lido e painel', () => {
    const r = (x: number): [number, number, number, number] => [x, 0, x + 10, 5]
    const c = conferencia(
      planta({
        pecas: [
          { tipo: 'P', nome: 'P-01', secao: '', rotulo: r(0), polys: [] },
          { tipo: 'V', nome: 'V-1', secao: '15x40', rotulo: r(20), polys: [[[0, 0], [1, 0], [1, 1]]] },
          { tipo: 'V', nome: 'v-1', secao: '15x40', rotulo: r(40), polys: [[[0, 0], [1, 0], [1, 1]]] },
          { tipo: 'L', nome: 'L1', secao: '', rotulo: r(60), polys: [] },
          { tipo: 'P', nome: 'P-03', secao: '20x50', rotulo: r(80), polys: [[[0, 0], [1, 0], [1, 1]]] },
        ],
        leitura: {
          perfil: 'X',
          naoLidos: [
            { texto: 'PT-1  20x20', ret: r(100) },
            { texto: 'P-01', ret: r(120) },
          ],
          paineis: [{ texto: 'V40', ret: r(140) }],
          repetidos: ['P-03'],
        },
      }),
    )
    expect(c.semContorno.map((x) => x.texto)).toEqual(['P-01']) // laje não precisa
    expect(c.semSecao.map((x) => x.texto)).toEqual(['P-01'])
    expect(c.repetidos.map((x) => [x.texto, x.peca])).toEqual([
      ['v-1', 2],
      ['P-03 (em dois lugares da planta)', 4],
    ])
    // P-01 já virou peça: sai da lista
    expect(c.naoLidos.map((x) => x.texto)).toEqual(['PT-1  20x20'])
    expect(c.paineis.map((x) => x.texto)).toEqual(['V40'])
  })

  it('pacote da planta: tiles na ordem z, y, x, escala no manifest, pedaços certos', async () => {
    const tiles = new Map([
      ['1/1/0', blob('B')],
      ['0/0/0', blob('AA')],
      ['1/0/0', blob('CCC')],
    ])
    const { manifest, bin } = montarPacotePlanta(
      { planta_id: 'x', obra: 'EX2', pavimento: 'Térreo', trecho: 'Planta inteira', prancha: 'F', revisao: 'R00', largura: 1000, altura: 600, niveis: [-1, 0, 1], escala: 75 },
      tiles,
      new Map([['e1', planta().pecas[0]]]),
    )
    const m = JSON.parse(manifest)
    expect(m).toMatchObject({ formato: 1, tile: 512, escala: 75, detalhes: {}, elementos: { e1: { tipo: 'P', nome: 'P-01', secao: '20x50' } } })
    expect(m.pedacos).toEqual({ 't:0/0/0': [0, 2], 't:1/0/0': [2, 3], 't:1/1/0': [5, 1] })
    expect(await bin.text()).toBe('AACCCB')
  })

  it('obra com planta: o .zip abre no app e a planta fica guardada para a FVS', async () => {
    const r: RascunhoObra = {
      codigo: 'EX2',
      nome: 'Obra Exemplo 2',
      empresa: '',
      pavimentos: ['Térreo'],
      fichas: [{ ...fichaVazia(), codigo: 'EX2-PVS-01', titulo: 'Pilares', itens: [{ etapa: 'Fôrma', titulo: 'Prumo', descricao: '', dispositivo: '', tolerancia: '' }] }],
      plantas: [planta(), planta({ id: 'a2000000-0000-0000-0000-0000000000e3', trecho: 'Trecho B', pecas: [{ tipo: 'P', nome: 'P-01', secao: '20x50', rotulo: [0, 0, 5, 5], polys: [] }] })],
    }
    expect(problemas(r)).toEqual([])
    const lerTiles = async (id: string): Promise<TilesGuardados> => ({ id, janela: [100, 50, 1100, 650], niveis: [-1, 0, 1], largura: 1000, altura: 600, tiles: [['0/0/0', blob('webp')]] })
    await expect(zipDoRascunho(r, new Date(), async () => null)).rejects.toThrow(/não está desenhada neste aparelho/)
    const zip = await zipDoRascunho(r, new Date(), lerTiles)
    const pacote = await abrirPacoteZip(zip, 'obra_EX2.zip')
    const pav = pacote.indice.pavimentos[0]
    // P-01 está nos dois trechos: é uma peça só
    expect(pav.pecas.map((p) => p.nome).sort()).toEqual(['P-01', 'VT-01'])
    expect(pav.pecas.find((p) => p.nome === 'P-01')!.id).toBe(await idDaPeca('EX2', 'Térreo', { tipo: 'P', nome: 'P-01' }))
    expect(pav.plantas.map((p) => [p.trecho, p.pasta])).toEqual([
      ['Planta inteira', '01_Terreo/Planta_inteira/'],
      ['Trecho B', '01_Terreo/Trecho_B/'],
    ])
    const banco = new BancoLocal('teste-nova-obra-planta')
    const res = await prepararObraLocal(banco, pacote)
    expect(res.plantasGuardadas).toBe(2)
    const aberto = (await abrirPacote(pav.plantas[0].id))!
    expect(aberto.manifest).toMatchObject({ escala: 75, largura: 1000, altura: 600 })
    expect(await aberto.pedaco('t:0/0/0')!.text()).toBe('webp')
    // o trecho repetido em outro pavimento seria problema
    expect(problemas({ ...r, plantas: [planta(), planta({ id: 'outro' })] }).join()).toMatch(/duas plantas com o trecho "Planta inteira"/)
  })
})

describe('contorno da peça marcada à mão (achado do Testador)', () => {
  it('pega da leitura automática o contorno do mesmo nome e tipo, na coordenada da planta', () => {
    const l = { pecas: [{ tipo: 'P' as const, nome: 'P1', polys: [[[110, 220], [130, 220], [130, 270]] as Array<[number, number]>] }, { tipo: 'V' as const, nome: 'V1', polys: [] }] }
    expect(contornoDaLeitura([100, 200, 900, 800], l, 'P', 'p1')).toEqual([[[10, 20], [30, 20], [30, 70]]])
    expect(contornoDaLeitura([100, 200, 900, 800], l, 'V', 'P1')).toBeNull() // tipo diferente
    expect(contornoDaLeitura([100, 200, 900, 800], l, 'V', 'V1')).toBeNull() // lida, mas sem contorno
    expect(contornoDaLeitura([100, 200, 900, 800], l, 'P', 'P9')).toBeNull()
  })
})


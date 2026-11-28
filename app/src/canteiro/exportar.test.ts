// Desenho do mapa em SVG (o mesmo da tela e da imagem exportada), legenda, prancha A4, PDF e o fundo em pedaços.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { A4_DEITADO, FAIXA_TITULO, escaparXml, meioDoCaminho, nomeDoArquivo, pdfDeJpeg, pranchaDoMapa, svgDaLegenda, svgDoItem, svgDosItens } from './exportar'
import { nivelDoFundo, pedacosDoFundo, svgDaGrade, svgDasPecas, type PlantaDeFundo } from './fundo'
import { ALTURA_EM_BRANCO, LARGURA, legendaDe, type ItemCanteiro } from './logica'

const folha = { largura: LARGURA, altura: ALTURA_EM_BRANCO }
const grua: ItemCanteiro = { id: 'g', tipo: 'grua', x: 300, y: 200, giro: 30, tamanho: 150, nome: 'Grua 1' }
const caminho: ItemCanteiro = { id: 'c', tipo: 'caminho', x: 150, y: 100, giro: 0, tamanho: 0, nome: 'Rota do caminhão', pontos: [[100, 100], [200, 100]], cor: 'laranja' }
const area: ItemCanteiro = { id: 'r', tipo: 'area', x: 600, y: 550, giro: 0, tamanho: 0, nome: 'Área de risco', pontos: [[500, 500], [700, 500], [600, 600]], cor: 'vermelho' }
const letraDe = (svg: string) => Number(/font-size="([\d.]+)"/.exec(svg)![1])

describe('desenho das figuras', () => {
  it('a figura vai no centro, girada e na escala do tamanho, com o nome embaixo', () => {
    const svg = svgDoItem(grua)
    expect(svg).toContain('translate(300 200) rotate(30) translate(-75 -82.5) scale(1.5)')
    expect(svg).toContain('>Grua 1</text>')
  })

  it('na tela o nome tem letra mínima; na imagem exportada, a letra da figura', () => {
    const extintor = { id: 'e', tipo: 'extintor', x: 0, y: 0, giro: 0, tamanho: 40, nome: 'Extintor' }
    expect(letraDe(svgDoItem(extintor))).toBe(9)
    expect(letraDe(svgDoItem(extintor, 29.5))).toBe(29.5)
    expect(letraDe(svgDosItens([extintor], 20))).toBe(20)
  })

  it('o nome digitado nunca vira marcação', () => {
    const perigoso = '<script>alert(1)</script> & "x"'
    for (const i of [grua, caminho, area]) {
      const svg = svgDoItem({ ...i, nome: perigoso })
      expect(svg).not.toContain('<script>')
      expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;')
    }
    expect(escaparXml(`a'b`)).toBe('a&#39;b')
  })

  it('sem nome não há texto; o nome do setor vai dentro, gira com ele e encolhe para caber', () => {
    expect(svgDoItem({ ...grua, nome: '' })).not.toContain('<text')
    const setor = (nome: string) => svgDoItem({ id: 's', tipo: 'setor', x: 500, y: 300, giro: 90, tamanho: 200, nome })
    expect(setor('Setor A')).toContain('<text transform="translate(500 300) rotate(90)"')
    expect(letraDe(setor('A'))).toBe(26)
    expect(letraDe(setor('Setor A · Armação e fôrmas'))).toBeLessThan(13)
  })

  it('caminho: linha na cor escolhida, seta no último ponto e nome no meio', () => {
    const svg = svgDoItem(caminho)
    expect(svg).toContain('d="M100 100L200 100"')
    expect(svg).toContain('stroke="#e8772e"')
    // a ponta da seta passa um pouco do último ponto (200, 100), no sentido do caminho
    expect(svg).toMatch(/<path d="M2\d\d(\.\d+)? 100L/)
    expect(svg).toContain('>Rota do caminhão</text>')
    expect(meioDoCaminho([[0, 0], [100, 0], [100, 300]])).toEqual([100, 100])
    // dois toques no mesmo lugar no fim: a seta continua com direção
    expect(svgDoItem({ ...caminho, pontos: [[100, 100], [200, 100], [200, 100]] })).not.toContain('NaN')
  })

  it('área: polígono fechado, transparente, com o nome no centro', () => {
    const svg = svgDoItem(area)
    expect(svg).toContain('d="M500 500L700 500L600 600Z"')
    expect(svg).toContain('fill="#c62828" fill-opacity="0.2"')
    expect(svg).toContain('>Área de risco</text>')
  })

  it('ordem do desenho: setor e área por baixo, depois o caminho, a figura por cima', () => {
    const setor: ItemCanteiro = { id: 's', tipo: 'setor', x: 500, y: 300, giro: 0, tamanho: 200, nome: 'Setor A' }
    const svg = svgDosItens([grua, caminho, setor, area])
    const onde = (t: string) => svg.indexOf(t)
    expect(onde('Setor A')).toBeLessThan(onde('Rota do caminhão'))
    expect(onde('Área de risco')).toBeLessThan(onde('Rota do caminhão'))
    expect(onde('Rota do caminhão')).toBeLessThan(onde('Grua 1'))
  })
})

describe('legenda', () => {
  const itens = [grua, { ...grua, id: 'g2', nome: 'Grua 2' }, caminho, area, { ...grua, id: 'e', tipo: 'extintor', nome: '' }]

  it('uma linha por figura usada, com a quantidade, e uma por caminho ou área de cada cor e nome', () => {
    expect(legendaDe(itens)).toEqual([
      { tipo: 'grua', nome: 'Grua', quantidade: 2 },
      { tipo: 'extintor', nome: 'Extintor', quantidade: 1 },
      { tipo: 'caminho', cor: 'laranja', nome: 'Rota do caminhão', quantidade: 1 },
      { tipo: 'area', cor: 'vermelho', nome: 'Área de risco', quantidade: 1 },
    ])
    expect(legendaDe([])).toEqual([])
    // dois caminhos com o mesmo nome e a mesma cor contam juntos; sem nome, vale o nome do tipo
    expect(legendaDe([caminho, { ...caminho, id: 'c2' }, { ...caminho, id: 'c3', nome: '' }])).toEqual([
      { tipo: 'caminho', cor: 'laranja', nome: 'Rota do caminhão', quantidade: 2 },
      { tipo: 'caminho', cor: 'laranja', nome: 'Caminho', quantidade: 1 },
    ])
  })

  it('desenha em colunas, com "(2)" quando há mais de uma, e corta o que não cabe', () => {
    const leg = svgDaLegenda(legendaDe(itens), 12, 100, 976, 4)
    expect(leg.svg).toContain('>Legenda</text>')
    expect(leg.svg).toContain('>Grua (2)</text>')
    expect(leg.svg).toContain('>Extintor</text>')
    expect(leg.svg).toContain('>Área de risco</text>')
    expect(leg.altura).toBe(22 + 28 + 6)
    expect(svgDaLegenda([], 0, 0, 100, 1)).toEqual({ svg: '', altura: 0 })
    const cortada = svgDaLegenda(legendaDe(itens), 0, 0, 220, 1, 2)
    expect(cortada.svg).toContain('>Grua (2)</text>')
    expect(cortada.svg).toContain('>e mais 3</text>')
    expect(cortada.svg).not.toContain('>Extintor</text>')
  })
})

describe('prancha (imagem e A4)', () => {
  it('imagem: título, grade, figuras e legenda embaixo, na largura da folha', () => {
    const p = pranchaDoMapa({ folha, itens: [grua], titulo: 'Mapa do canteiro · Obra Exemplo', subtitulo: 'Canteiro geral · 26/11/2026' })
    expect(p.largura).toBe(1000)
    expect(p.mapa).toEqual({ x: 0, y: FAIXA_TITULO, esc: 1 })
    // faixa do título + folha + legenda de uma linha (22 + 28 + 6) + 12 de respiro
    expect(p.altura).toBe(FAIXA_TITULO + ALTURA_EM_BRANCO + 56 + 12)
    const svg = p.svg(2400)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1949"')).toBe(true)
    expect(svg).toContain('Mapa do canteiro · Obra Exemplo')
    expect(svg).toContain('Canteiro geral · 26/11/2026')
    expect(svg).toContain(svgDaGrade(folha))
    expect(svg).toContain('>Grua 1</text>')
    expect(svg).toContain('>Legenda</text>')
  })

  it('imagem sem figura: sem legenda, só o título e a folha', () => {
    const p = pranchaDoMapa({ folha, itens: [], titulo: 'T' })
    expect(p.altura).toBe(FAIXA_TITULO + ALTURA_EM_BRANCO)
    expect(p.svg()).not.toContain('Legenda')
  })

  it('A4 deitado: o mapa cabe inteiro na página, com a legenda ao lado', () => {
    const p = pranchaDoMapa({ folha, itens: [grua, caminho], titulo: 'Mapa do canteiro · Obra Exemplo', subtitulo: 'Térreo · Fase estrutura · 26/11/2026' }, 'a4')
    expect([p.largura, p.altura]).toEqual([A4_DEITADO.largura, A4_DEITADO.altura])
    // proporção do A4 (297 x 210 mm)
    expect(p.largura / p.altura).toBeCloseTo(297 / 210, 2)
    expect(p.mapa.x).toBeGreaterThanOrEqual(28)
    expect(p.mapa.y).toBeGreaterThanOrEqual(28)
    // o mapa termina antes da coluna da legenda (220 + 14) e da margem de baixo
    expect(p.mapa.x + folha.largura * p.mapa.esc).toBeLessThanOrEqual(A4_DEITADO.largura - 28 - 234 + 0.01)
    expect(p.mapa.y + folha.altura * p.mapa.esc).toBeLessThanOrEqual(A4_DEITADO.altura - 28 + 0.01)
    const svg = p.svg()
    expect(svg).toContain(`viewBox="0 0 ${A4_DEITADO.largura} ${A4_DEITADO.altura}"`)
    expect(svg).toContain('Térreo · Fase estrutura · 26/11/2026')
    expect(svg).toContain('>Rota do caminhão</text>')
    expect(svg).toContain('>Legenda</text>')
  })

  it('A4 sem figura: o mapa usa a largura toda', () => {
    const cheio = pranchaDoMapa({ folha, itens: [grua], titulo: 'T' }, 'a4')
    const vazio = pranchaDoMapa({ folha, itens: [], titulo: 'T' }, 'a4')
    expect(vazio.mapa.esc).toBeGreaterThan(cheio.mapa.esc)
  })

  it('com planta em imagem não desenha grade nem tampa a planta com branco', () => {
    const planta: PlantaDeFundo = { id: 'p', titulo: 'Térreo', largura: 2000, altura: 1000, fundo: { tile: 256, niveis: [0], url: () => 'blob:x' } }
    const svg = pranchaDoMapa({ folha: { largura: 1000, altura: 500 }, itens: [], planta, titulo: 'T' }).svg()
    expect(svg).not.toContain(svgDaGrade({ largura: 1000, altura: 500 }))
    expect(svg).not.toContain('height="500" fill="#ffffff"')
  })

  it('nome do arquivo sem acento nem espaço, em png ou pdf', () => {
    expect(nomeDoArquivo('EXE', '1º pavimento · Trecho 2', new Date(2026, 10, 26))).toBe('mapa_canteiro_EXE_1_pavimento_Trecho_2_2026-11-26.png')
    expect(nomeDoArquivo('EXE', 'Térreo Fase estrutura', new Date(2026, 10, 26), 'pdf')).toBe('mapa_canteiro_EXE_Terreo_Fase_estrutura_2026-11-26.pdf')
  })
})

describe('PDF', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 0xff, 0xd9])
  const pdf = pdfDeJpeg(jpeg, 2480, 1754, 841.89, 595.28, 'Mapa do canteiro · Obra Exemplo')
  const texto = new TextDecoder('latin1').decode(pdf)

  it('uma página A4 deitada com a imagem ocupando a página inteira', () => {
    expect(texto.startsWith('%PDF-1.4\n')).toBe(true)
    expect(texto.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(texto).toContain('/MediaBox [0 0 841.89 595.28]')
    expect(texto).toContain('/Count 1')
    expect(texto).toContain('/Width 2480 /Height 1754')
    expect(texto).toContain(`/Filter /DCTDecode /Length ${jpeg.length}`)
    expect(texto).toContain('q 841.89 0 0 595.28 0 0 cm /Im0 Do Q')
  })

  it('a imagem vai inteira, byte a byte', () => {
    const inicio = texto.indexOf('stream\n') + 'stream\n'.length
    expect([...pdf.slice(inicio, inicio + jpeg.length)]).toEqual([...jpeg])
  })

  it('o índice aponta o começo de cada objeto (é o que o leitor de PDF usa para abrir)', () => {
    const onde = Number(/startxref\n(\d+)\n/.exec(texto)![1])
    expect(texto.slice(onde, onde + 9)).toBe('xref\n0 7\n')
    const linhas = texto.slice(onde).split('\n').slice(3, 9)
    linhas.forEach((l, k) => {
      expect(l).toMatch(/^\d{10} 00000 n $/)
      expect(texto.slice(Number(l.slice(0, 10))).startsWith(`${k + 1} 0 obj\n`)).toBe(true)
    })
  })

  it('o título com acento vai em UTF-16', () => {
    // "Ma" = 004D 0061; "·" = 00B7
    expect(texto).toContain('/Title <FEFF004D0061')
    expect(texto).toContain('00B7')
  })
})

describe('fundo', () => {
  const planta: PlantaDeFundo = {
    id: 'p',
    titulo: 'Térreo',
    largura: 2048,
    altura: 1280,
    fundo: { tile: 256, niveis: [-3, -2, -1, 0, 1], url: (z, x, y) => (x === 0 && y === 0 ? undefined : `t:${z}/${x}/${y}`) },
  }

  it('escolhe o menor nível que dá a largura pedida', () => {
    expect(nivelDoFundo([-3, -2, -1, 0, 1], 2048, 1600)).toBe(0)
    expect(nivelDoFundo([-3, -2, -1, 0, 1], 2048, 900)).toBe(-1)
    expect(nivelDoFundo([-3, -2], 2048, 1600)).toBe(-2)
  })

  it('os pedaços cobrem a planta inteira, na medida da folha', () => {
    const ps = pedacosDoFundo(planta, 1600)
    // nível 0: 8 colunas x 5 linhas, menos o pedaço que a fonte não tem
    expect(ps).toHaveLength(8 * 5 - 1)
    expect(ps[0]).toEqual({ href: 't:0/1/0', x: 125, y: 0, lado: 125 })
    expect(Math.max(...ps.map((p) => p.x + p.lado))).toBe(1000)
  })

  it('planta sem imagem: contorno das peças na medida da folha; sem nada, nada', () => {
    const svg = svgDasPecas({ id: 'p', titulo: '', largura: 2000, altura: 1000, elementos: [{ polys: [[[0, 0], [200, 0], [200, 100]]] }] })
    expect(svg).toContain('d="M0 0L100 0L100 50Z"')
    expect(svgDasPecas({ id: 'p', titulo: '', largura: 2000, altura: 1000 })).toBe('')
    expect(pedacosDoFundo({ id: 'p', titulo: '', largura: 2000, altura: 1000 })).toEqual([])
  })
})

describe('cores do módulo', () => {
  it('canteiro.css não tem cor solta, só variáveis do tema', () => {
    const css = readFileSync(new URL('./canteiro.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const soltas = css.split('\n').flatMap((l, i) => (/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(l) ? [`${i + 1}: ${l.trim()}`] : []))
    expect(soltas).toEqual([])
  })
})

// Confere a Obra Exemplo 2 (testes/obra_exemplo2.ts): PDFs bem formados e gabarito coerente.
// OBRA2_SAIDA=<pasta fora do repositório> grava os PDFs e o gabarito no disco, para abrir num leitor de PDF.
import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { CAMADAS, FICHAS_PARA_COLAR, gerarObraExemplo2, pecasPorPavimento, PONTOS_POR_METRO } from './obra_exemplo2'

const texto = (b: Uint8Array) => new TextDecoder('latin1').decode(b)

/** Confere a tabela xref: cada objeto começa exatamente onde ela diz. */
function conferirXref(pdf: Uint8Array) {
  const t = texto(pdf)
  const inicio = Number(/startxref\n(\d+)/.exec(t)![1])
  expect(t.slice(inicio, inicio + 4)).toBe('xref')
  const linhas = t.slice(inicio).split('\n')
  const n = Number(linhas[1].split(' ')[1])
  for (let i = 1; i < n; i++) {
    const pos = Number(linhas[2 + i].slice(0, 10))
    expect(t.slice(pos, pos + `${i} 0 obj`.length)).toBe(`${i} 0 obj`)
  }
}

describe('Obra Exemplo 2 (projetista B, fictícia)', () => {
  const pranchas = gerarObraExemplo2()

  it('gera as cinco pranchas, com xref certo', () => {
    expect(pranchas.map((p) => p.arquivo)).toEqual([
      'EX2-FORMA-TERREO-R00.pdf',
      'EX2-FORMA-TERREO-SEM-CAMADAS-R00.pdf',
      'EX2-FORMA-TERREO-ESCANEADA-R00.pdf',
      'EX2-FORMA-TIPO1-A-R00.pdf',
      'EX2-FORMA-TIPO1-B-R00.pdf',
    ])
    for (const p of pranchas) {
      expect(texto(p.pdf.subarray(0, 8))).toBe('%PDF-1.6')
      conferirXref(p.pdf)
    }
  })

  it('camadas com os nomes da projetista B, e não os da obra piloto', () => {
    const comCamadas = texto(pranchas[0].pdf)
    for (const c of CAMADAS) expect(comCamadas).toContain(`/Name (${c})`)
    expect(comCamadas).not.toContain('PILAR_CONCRETO')
    expect(comCamadas).not.toContain('VIG_FACES')
    expect(texto(pranchas[1].pdf)).not.toContain('/OCG')
  })

  it('nomes P-01 e VT-01 com a seção ao lado, em texto normal; a escaneada não tem texto', () => {
    const t = texto(pranchas[0].pdf)
    expect(t).toContain('(P-01  20x50) Tj')
    expect(t).toContain('(VT-01  15x40) Tj')
    expect(t).toContain('(ESCALA 1:75) Tj')
    expect(t).not.toContain('/Annots') // nada de nome como comentário
    const esc = texto(pranchas[2].pdf)
    expect(esc).not.toContain('Tj')
    expect(esc).toContain('/Subtype /Image')
  })

  it('gabarito: Térreo 12 pilares e 9 vigas; Tipo 1 15 pilares e 12 vigas, com a fila repetida contada uma vez', () => {
    const t = pranchas[0].pecas
    expect(t.filter((p) => p.tipo === 'P')).toHaveLength(12)
    expect(t.filter((p) => p.tipo === 'V')).toHaveLength(9)
    const porPav = pecasPorPavimento(pranchas)
    const tipo1 = [...porPav.get('Tipo 1')!]
    expect(tipo1.filter((n) => n.startsWith('P:'))).toHaveLength(15)
    expect(tipo1.filter((n) => n.startsWith('V:'))).toHaveLength(12)
    // a fila repetida: P-103, P-108, P-113 nas duas pranchas, em lugares diferentes da folha
    const a = pranchas[3].pecas.find((p) => p.nome === 'P-103')!
    const b = pranchas[4].pecas.find((p) => p.nome === 'P-103')!
    expect(b.retangulo[0] - a.retangulo[0]).toBeCloseTo(-7 * PONTOS_POR_METRO, 1) // 2 vãos de 5 m para trás + 3 m de deslocamento
  })

  it('pilar de 20x50 na escala 1:75', () => {
    const [x0, y0, x1, y1] = pranchas[0].pecas[0].retangulo
    expect((x1 - x0) / PONTOS_POR_METRO).toBeCloseTo(0.2, 3)
    expect((y1 - y0) / PONTOS_POR_METRO).toBeCloseTo(0.5, 3)
  })

  it('fichas para colar: cabeçalho e 5 itens separados por tabulação', () => {
    const linhas = FICHAS_PARA_COLAR.split('\n')
    expect(linhas).toHaveLength(6)
    for (const l of linhas) expect(l.split('\t')).toHaveLength(6)
  })

  it.runIf(!!process.env.OBRA2_SAIDA)('grava no disco (OBRA2_SAIDA)', () => {
    const pasta = process.env.OBRA2_SAIDA!
    mkdirSync(pasta, { recursive: true })
    for (const p of pranchas) writeFileSync(path.join(pasta, p.arquivo), p.pdf)
    writeFileSync(path.join(pasta, 'gabarito.json'), JSON.stringify(pranchas.map(({ pdf: _pdf, ...r }) => r), null, 1))
    writeFileSync(path.join(pasta, 'fichas_para_colar.tsv'), FICHAS_PARA_COLAR)
  })
})

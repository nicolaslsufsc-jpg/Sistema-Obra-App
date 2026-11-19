import { describe, expect, it } from 'vitest'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { desenhoDaPagina, DRAW, OP, type DesenhoDaPagina } from './desenho'
import { aprenderPerfil, lerComPerfis, lerPecas, PERFIL_PILOTO, type Leitura, type PecaLida, type Toque } from './leitor'
import { gerarObraExemplo2, pranchaEstiloPiloto, type PecaGabarito } from '../../testes/obra_exemplo2'

async function desenho(pdf: Uint8Array): Promise<DesenhoDaPagina> {
  const tarefa = pdfjs.getDocument({ data: pdf.slice(), verbosity: 0 })
  const doc = await tarefa.promise
  const pg = await doc.getPage(1)
  const oc = await doc.getOptionalContentConfig()
  const camadas: string[] = []
  for (const [, g] of oc as unknown as Iterable<[string, { name?: string }]>) if (g?.name) camadas.push(g.name)
  const d = await desenhoDaPagina(pg, (id) => (oc.getGroup(id) as { name?: string } | null)?.name ?? null, camadas)
  await tarefa.destroy()
  return d
}

const caixa = (p: PecaLida): [number, number, number, number] => {
  const xs = p.polys.flat().map((q) => q[0])
  const ys = p.polys.flat().map((q) => q[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/** Toda peça do gabarito achada, com a seção e o contorno certos, e nenhuma a mais. */
function confere(l: Leitura, gabarito: readonly PecaGabarito[], tol = 0.6) {
  const achadas = new Map(l.pecas.map((p) => [`${p.tipo}:${p.nome}`, p]))
  expect([...achadas.keys()].sort()).toEqual(gabarito.map((g) => `${g.tipo}:${g.nome}`).sort())
  for (const g of gabarito) {
    const p = achadas.get(`${g.tipo}:${g.nome}`)!
    expect(p.secao, g.nome).toBe(g.secao)
    expect(p.polys.length, `${g.nome} sem contorno`).toBeGreaterThan(0)
    caixa(p).forEach((v, i) => expect(Math.abs(v - g.retangulo[i]), `${g.nome} canto ${i}`).toBeLessThan(tol))
  }
}

/** Toque no meio do texto do nome (como a pessoa faria). */
function toqueNoNome(d: DesenhoDaPagina, tipo: 'P' | 'V', nome: string): Toque {
  const t = d.textos.find((x) => x.texto.startsWith(nome))!
  return { tipo, x: (t.ret[0] + t.ret[2]) / 2, y: (t.ret[1] + t.ret[3]) / 2 }
}

describe('Nova obra: leitor de peças', () => {
  const obra = gerarObraExemplo2()
  const terreo = obra.find((p) => p.variante === 'camadas' && p.pavimento === 'Térreo')!

  it('os códigos de operação do pdf.js são os que o leitor usa', () => {
    for (const [k, v] of Object.entries(OP)) expect(pdfjs.OPS[k as keyof typeof pdfjs.OPS], k).toBe(v)
    // DrawOPS não é exportado: confere pelo arquivo do pdf.js indiretamente (um retângulo vira 4 pontos fechados)
    expect(DRAW.closePath).toBe(4)
  })

  it('tira textos, traços e camadas da folha', async () => {
    const d = await desenho(terreo.pdf)
    expect(d.camadas).toEqual(['FOLHA', 'CARIMBO', 'PILARES', 'VIGAS', 'TEXTO-PILARES', 'TEXTO-VIGAS'])
    expect(d.textos.some((t) => /^P-01\s+20x50$/.test(t.texto))).toBe(true)
    const pilares = d.tracos.filter((t) => t.camada === 'PILARES')
    expect(pilares).toHaveLength(12)
    expect(pilares.every((t) => t.fechado && t.pts.length === 8)).toBe(true)
    // P-01 na folha (y para baixo) igual ao gabarito
    const g = terreo.pecas.find((p) => p.nome === 'P-01')!
    const xs = pilares[0].pts.filter((_, i) => i % 2 === 0)
    const ys = pilares[0].pts.filter((_, i) => i % 2 === 1)
    expect(Math.min(...xs)).toBeCloseTo(g.retangulo[0], 1)
    expect(Math.min(...ys)).toBeCloseTo(g.retangulo[1], 1)
    expect(d.tracos.filter((t) => t.camada === 'VIGAS')).toHaveLength(18)
  })

  it('outra projetista, sem ensinar: não acha nada (o app pede "me ensine")', async () => {
    const d = await desenho(terreo.pdf)
    expect(lerComPerfis(d, [PERFIL_PILOTO], 75)).toBeNull()
  })

  it('ensinada com 2 toques: acha todas as peças do gabarito, sem peça a mais, nas 3 pranchas', async () => {
    const d = await desenho(terreo.pdf)
    const { perfil, avisos } = aprenderPerfil(d, [toqueNoNome(d, 'P', 'P-01'), toqueNoNome(d, 'V', 'VT-01')], 75)
    expect(avisos).toEqual([])
    expect(perfil).toMatchObject({ textos: 'texto', pilar: { camada: 'PILARES', secao: 'no_nome' }, viga: { camada: 'VIGAS', secao: 'no_nome' } })
    for (const prancha of obra.filter((p) => p.variante === 'camadas')) {
      const l = lerPecas(await desenho(prancha.pdf), perfil!, 75)
      confere(l, prancha.pecas)
      expect(l.naoLidos.map((t) => t.texto)).toEqual([])
    }
    // e o perfil aprendido entra na lista: a próxima prancha já lê sozinha
    expect(lerComPerfis(d, [PERFIL_PILOTO, perfil!], 75)!.perfil).toBe(perfil)
  })

  it('PDF sem camadas: ensinado, acha as mesmas peças (pelo tamanho do contorno)', async () => {
    const semCamadas = obra.find((p) => p.variante === 'sem_camadas')!
    const d = await desenho(semCamadas.pdf)
    expect(d.camadas).toEqual([])
    const { perfil } = aprenderPerfil(d, [toqueNoNome(d, 'P', 'P-05'), toqueNoNome(d, 'V', 'VT-04')], 75)
    expect(perfil!.pilar.camada).toBeNull()
    confere(lerPecas(d, perfil!, 75), semCamadas.pecas)
  })

  it('escaneado: sem texto, ensinar não serve (fica o modo à mão)', async () => {
    const d = await desenho(obra.find((p) => p.variante === 'escaneada')!.pdf)
    expect(d.textos).toEqual([])
    const r = aprenderPerfil(d, [{ tipo: 'P', x: 300, y: 300 }], 75)
    expect(r.perfil).toBeNull()
    expect(r.avisos.join(' ')).toMatch(/não achei nome/)
  })

  it('toque fora de nome: avisa, e só a janela conta', async () => {
    const d = await desenho(terreo.pdf)
    const r = aprenderPerfil(d, [{ tipo: 'P', x: 5, y: 5 }, toqueNoNome(d, 'V', 'VT-01')], 75)
    expect(r.perfil).toBeNull()
    expect(r.avisos.join(' ')).toMatch(/pilar/)
    const { perfil } = aprenderPerfil(d, [toqueNoNome(d, 'P', 'P-01'), toqueNoNome(d, 'V', 'VT-01')], 75)
    // janela só com a primeira fila: 4 pilares e 3 vigas
    const p1 = terreo.pecas.find((p) => p.nome === 'P-01')!
    const l = lerPecas(d, perfil!, 75, [0, 0, 2384, p1.retangulo[3] + 20])
    expect(l.pecas.filter((p) => p.tipo === 'P')).toHaveLength(4)
    expect(l.pecas.filter((p) => p.tipo === 'V')).toHaveLength(3)
  })

  it('jeito da obra piloto: o perfil pronto lê sozinho (comentários, viga em pé, larga, inclinada, painel)', async () => {
    const p = pranchaEstiloPiloto()
    const d = await desenho(p.pdf)
    expect(d.textos.filter((t) => t.origem === 'comentario').length).toBeGreaterThan(20)
    const r = lerComPerfis(d, [PERFIL_PILOTO], 50)!
    expect(r.perfil.id).toBe('piloto')
    // a inclinada: o gabarito é a caixa em volta; o contorno lido é girado, então a tolerância é maior
    confere(r.leitura, p.pecas, 1.5)
    expect(r.leitura.paineis.map((t) => t.texto)).toEqual(p.paineis)
    expect(r.leitura.naoLidos.map((t) => t.texto)).toEqual(['P9'])
  })
})

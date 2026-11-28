// Desfazer do mapa (27/11): volta a última ação da tela, e não "apaga a área mais recente".
import { describe, expect, it } from 'vitest'
import { guardarAcao, MAX_ACOES, planoDoDesfazer, tirarUltima, type AcaoDoMapa } from './desfazer'
import type { Ponto } from './geometria'

const ret = (x0: number, y0: number, x1: number, y1: number): Ponto[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]
const acao = (tipo: AcaoDoMapa['tipo'], passos: AcaoDoMapa['passos'], caminhao = 'k1', planta = 'pl1'): AcaoDoMapa => ({ tipo, caminhao, planta, passos })

describe('desfazer do mapa', () => {
  it('depois do recorte: a área volta ao contorno de antes e o segundo pedaço sai (não apaga o que sobrou)', () => {
    const inteira = ret(0, 0, 300, 100)
    const a = acao('recorte', [
      { tipo: 'voltar', raiz: 'area1', contorno: inteira },
      { tipo: 'tirar', raiz: 'pedaco2' },
    ])
    // como está no aparelho depois do recorte: a área 1 menor e o pedaço 2
    const vigentes = [
      { raiz: 'area1', contorno: ret(0, 0, 100, 100) },
      { raiz: 'pedaco2', contorno: ret(200, 0, 300, 100) },
      { raiz: 'outra', contorno: ret(500, 500, 600, 600) },
    ]
    const p = planoDoDesfazer(a, vigentes)
    expect(p.voltar.map((v) => [v.area.raiz, v.contorno])).toEqual([['area1', inteira]])
    expect(p.tirar.map((x) => x.raiz)).toEqual(['pedaco2'])
    expect(p.repor).toEqual([])
    expect(p.perdidos).toBe(0)
  })

  it('depois da borracha (toque ou recorte que cobre a área toda): a área é gravada de novo, igual', () => {
    const a = acao('apagar', [{ tipo: 'repor', planta_ref: 'pl1@R01', contorno: ret(0, 0, 50, 50), alvo: 'pilares' }])
    const p = planoDoDesfazer(a, [])
    expect(p.repor).toEqual([{ planta_ref: 'pl1@R01', contorno: ret(0, 0, 50, 50), alvo: 'pilares' }])
    expect(p.tirar).toEqual([])
    expect(p.voltar).toEqual([])
  })

  it('depois do desenho: só a área desenhada sai', () => {
    const p = planoDoDesfazer(acao('desenho', [{ tipo: 'tirar', raiz: 'nova' }]), [
      { raiz: 'velha', contorno: ret(0, 0, 9, 9) },
      { raiz: 'nova', contorno: ret(20, 20, 40, 40) },
    ])
    expect(p.tirar.map((x) => x.raiz)).toEqual(['nova'])
  })

  it('área que já mudou ou saiu (outro aparelho): o passo é contado como perdido e nada é inventado', () => {
    const p = planoDoDesfazer(acao('canto', [{ tipo: 'voltar', raiz: 'sumiu', contorno: ret(0, 0, 9, 9) }]), [])
    expect(p.voltar).toEqual([])
    expect(p.perdidos).toBe(1)
  })

  it('a pilha: a última ação do caminhão e da planta abertos; outra planta ou outro caminhão não entram', () => {
    let pilha: AcaoDoMapa[] = []
    pilha = guardarAcao(pilha, acao('desenho', [{ tipo: 'tirar', raiz: 'a' }]))
    pilha = guardarAcao(pilha, acao('desenho', [{ tipo: 'tirar', raiz: 'b' }], 'k1', 'pl2'))
    pilha = guardarAcao(pilha, acao('apagar', [{ tipo: 'repor', planta_ref: 'r', contorno: [], alvo: null }], 'k2'))
    // ação que não mudou nada não entra
    pilha = guardarAcao(pilha, acao('recorte', []))
    expect(pilha).toHaveLength(3)
    const u = tirarUltima(pilha, 'k1', 'pl1')!
    expect(u.acao.passos).toEqual([{ tipo: 'tirar', raiz: 'a' }])
    expect(u.resto).toHaveLength(2)
    expect(tirarUltima(u.resto, 'k1', 'pl1')).toBeNull()
    expect(tirarUltima(pilha, 'k3', 'pl1')).toBeNull()
  })

  it('a pilha guarda no máximo as últimas ações', () => {
    let pilha: AcaoDoMapa[] = []
    for (let i = 0; i < MAX_ACOES + 5; i++) pilha = guardarAcao(pilha, acao('desenho', [{ tipo: 'tirar', raiz: `a${i}` }]))
    expect(pilha).toHaveLength(MAX_ACOES)
    expect(tirarUltima(pilha, 'k1', 'pl1')!.acao.passos).toEqual([{ tipo: 'tirar', raiz: `a${MAX_ACOES + 4}` }])
  })
})

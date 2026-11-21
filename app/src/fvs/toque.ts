// Qual contorno o toque na planta pega.
//
// O Canvas do Leaflet entrega o toque à ÚLTIMA camada desenhada que estiver a até `tolerance` px do
// ponto, e os pilares são desenhados por cima das vigas. No celular a viga tem uns 5 px: um toque nela
// que também passasse perto da borda do pilar vizinho abria o pilar (achado do Testador, 09/11:
// V10 abria P32). Aqui o toque vai para o contorno MAIS PERTO do ponto (dentro = 0), e a viga ganha
// uma margem maior. Laje e ambiente (superfícies grandes, embaixo de tudo) ficam de fundo: só pegam o
// toque quando nada mais está perto, como já era, porque estar dentro deles não diz nada.
// O renderizador que usa isto está em toque_canvas.ts (aqui não entra o Leaflet, para testar no Node).
export type Ponto = { x: number; y: number }

/** Margem do toque, em px de tela, além da metade da linha. */
export const MARGEM_PADRAO = 7
export const MARGEM_VIGA = 12

/** Opções que o contorno leva para o toque (vão junto das opções do L.polygon). */
export interface OpcoesDeToque {
  margemToque?: number
  toqueDeFundo?: boolean
  /** consolo ou capitel: em cima do pilar (empate), o pilar ganha; na faixa só da parte, abre a parte */
  toqueDeParte?: boolean
}

export function opcoesDeToque(tipo: string): OpcoesDeToque {
  if (tipo === 'consolo' || tipo === 'capitel') return { toqueDeParte: true }
  // a parede de alvenaria é fina como a viga (14 cm na planta de 1:200 dá 2 pt)
  if (tipo === 'V' || tipo === 'M') return { margemToque: MARGEM_VIGA }
  if (tipo === 'L' || tipo === 'A') return { toqueDeFundo: true }
  return {}
}

function distanciaAoSegmento(p: Ponto, a: Ponto, b: Ponto): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Distância do ponto ao contorno (anéis fechados, em px); 0 se o ponto está dentro (par/ímpar, como o Leaflet). */
export function distanciaAoContorno(p: Ponto, aneis: readonly (readonly Ponto[])[]): number {
  let dentro = false
  let menor = Infinity
  for (const anel of aneis) {
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const a = anel[i]
      const b = anel[j]
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro
      menor = Math.min(menor, distanciaAoSegmento(p, a, b))
    }
  }
  return dentro ? 0 : menor
}

export interface Candidato<T> {
  camada: T
  /** distância ao contorno já descontada a meia linha; 0 = dentro */
  d: number
  margem: number
  fundo: boolean
  /** consolo ou capitel: perde o empate para quem não é parte */
  parte?: boolean
}

/**
 * Quem leva o toque: dos que estão a até a própria margem, primeiro quem não é de fundo, depois o mais
 * perto; empate fica com o último desenhado (o que está por cima, como antes), menos consolo e
 * capitel, que perdem o empate: tocando dentro do pilar abre o pilar, mesmo com a parte por cima.
 */
export function escolherNoToque<T>(candidatos: readonly Candidato<T>[]): T | undefined {
  let melhor: Candidato<T> | undefined
  for (const c of candidatos) {
    if (c.d > c.margem) continue
    if (!melhor || (melhor.fundo && !c.fundo)) melhor = c
    else if (melhor.fundo === c.fundo && (c.d < melhor.d || (c.d === melhor.d && (!c.parte || !!melhor.parte)))) melhor = c
  }
  return melhor?.camada
}

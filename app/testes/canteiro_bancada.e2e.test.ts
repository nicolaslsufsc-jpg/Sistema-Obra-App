// Telas do Mapa do canteiro no Chrome, pela bancada (app/dev/canteiro.html): sem login nem servidor,
// com dedo (toque) e caneta de verdade (eventos "pen" do Chrome). Roda com SO_E2E=1 (GitHub, junto
// com as outras telas) ou SO_BANCADA=1.
//   No PC do Nicolas: SO_BANCADA=1 SO_PLAYWRIGHT=<pasta>/node_modules/playwright SO_CHROME=chrome npx vitest run testes/canteiro_bancada.e2e.test.ts
// SO_PRINTS=<pasta> salva capturas de tela e a imagem exportada.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { copyFileSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
/* eslint-disable @typescript-eslint/no-explicit-any */
type Page = any

const ATIVO = process.env.SO_E2E === '1' || process.env.SO_BANCADA === '1'
const suite = ATIVO ? describe : describe.skip
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PRINTS = process.env.SO_PRINTS

let servidor: ViteDevServer
let navegador: any
let url = ''

async function capturar(p: Page, nome: string) {
  if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `canteiro_${nome}.png`) })
}

const palco = (p: Page) => p.locator('[data-testid=canteiro-palco]')

/** Ponto da folha (largura 1000) → ponto da tela, pela vista que a tela expõe no próprio desenho. */
async function naTela(p: Page, x: number, y: number): Promise<[number, number]> {
  return p.evaluate(
    ([fx, fy]: [number, number]) => {
      const s = document.querySelector('[data-testid=canteiro-palco]') as SVGSVGElement
      const r = s.getBoundingClientRect()
      const v = s.dataset
      return [r.left + (fx - Number(v.vx)) * Number(v.vk), r.top + (fy - Number(v.vy)) * Number(v.vk)]
    },
    [x, y],
  )
}

/** As figuras que estão na folha, lidas do banco do módulo (o que ficou guardado de verdade). */
async function guardadas(p: Page, folha = 'geral'): Promise<Array<{ tipo: string; x: number; y: number; giro: number; tamanho: number; nome: string }>> {
  return p.evaluate(
    (f: string) =>
      new Promise((ok, erro) => {
        const pedido = indexedDB.open('sistema-obra-canteiro')
        pedido.onerror = () => erro(pedido.error)
        pedido.onsuccess = () => {
          const todos = pedido.result.transaction('mapas').objectStore('mapas').getAll()
          todos.onsuccess = () => {
            pedido.result.close()
            ok((todos.result as any[]).find((m) => m.folhaId === f)?.itens ?? [])
          }
        }
      }),
    folha,
  )
}

async function figurasNaTela(p: Page): Promise<number> {
  return Number(await palco(p).getAttribute('data-figuras'))
}

async function colocarComDedo(p: Page, figura: string, x: number, y: number) {
  await p.locator(`[data-testid=fig-${figura}]`).scrollIntoViewIfNeeded()
  await p.locator(`[data-testid=fig-${figura}]`).tap()
  const [tx, ty] = await naTela(p, x, y)
  await p.touchscreen.tap(tx, ty)
}

/** Arrasto com o mouse ou com a caneta (CDP), em passos, de um ponto da tela a outro. */
async function arrastar(cdp: any, de: [number, number], ate: [number, number], pointerType: 'mouse' | 'pen' = 'mouse') {
  const ev = (type: string, [x, y]: [number, number]) =>
    cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType })
  await ev('mousePressed', de)
  for (let k = 1; k <= 10; k++) await ev('mouseMoved', [de[0] + ((ate[0] - de[0]) * k) / 10, de[1] + ((ate[1] - de[1]) * k) / 10])
  await ev('mouseReleased', ate)
}

/** A página não rola de lado e nada passa da largura da tela. */
async function semRolarDeLado(p: Page) {
  const m = await p.evaluate(() => ({ rola: document.documentElement.scrollWidth, tela: window.innerWidth, palco: document.querySelector('.ct-palco')!.getBoundingClientRect().right }))
  expect(m.rola).toBeLessThanOrEqual(m.tela)
  expect(m.palco).toBeLessThanOrEqual(m.tela)
}

async function abrir(viewport: { width: number; height: number }) {
  const contexto = await navegador.newContext({ viewport, hasTouch: true, acceptDownloads: true })
  const p = await contexto.newPage()
  const erros: string[] = []
  p.on('pageerror', (e: Error) => erros.push(e.message))
  await p.goto(url)
  await palco(p).waitFor()
  return { contexto, p, erros }
}

suite('Mapa do canteiro na bancada (Chrome)', () => {
  beforeAll(async () => {
    // nada da bancada vai para o Supabase de verdade
    process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:9'
    servidor = await createServer({ root: RAIZ, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } })
    await servidor.listen()
    url = `${servidor.resolvedUrls!.local[0]}dev/canteiro.html`
    const pw = createRequire(import.meta.url)(process.env.SO_PLAYWRIGHT || 'playwright')
    navegador = await pw.chromium.launch(process.env.SO_CHROME ? { channel: process.env.SO_CHROME, headless: true } : { headless: true })
  }, 120_000)

  afterAll(async () => {
    await navegador?.close()
    await servidor?.close()
  })

  it('celular 375 px, dedo: coloca, arrasta, gira, aumenta, renomeia, apaga, desfaz e continua lá ao reabrir', async () => {
    const { contexto, p, erros } = await abrir({ width: 375, height: 700 })
    await semRolarDeLado(p)
    // caminho, área e as 23 figuras estão na paleta, e a paleta não empurra a página para o lado
    expect(await p.locator('[data-testid=canteiro-paleta] button').count()).toBe(25)
    expect(await p.locator('[data-testid=canteiro-desfazer]').isDisabled()).toBe(true)

    // toca na figura e toca na folha
    await colocarComDedo(p, 'caminhao_betoneira', 300, 200)
    expect(await figurasNaTela(p)).toBe(1)
    await expect.poll(() => guardadas(p).then((g) => g.length)).toBe(1)
    let [caminhao] = await guardadas(p)
    expect(caminhao).toMatchObject({ tipo: 'caminhao_betoneira', giro: 0, nome: 'Caminhão betoneira' })
    expect(Math.abs(caminhao.x - 300)).toBeLessThan(3)
    expect(Math.abs(caminhao.y - 200)).toBeLessThan(3)
    // a figura recém-colocada fica escolhida: aparece a linha de ações
    await p.locator('[data-testid=canteiro-nome]').waitFor()
    await capturar(p, '375_1_colocado')

    // arrasta com o dedo (toque de verdade pelo CDP)
    const cdp = await contexto.newCDPSession(p)
    const de = await naTela(p, 300, 200)
    const ate = await naTela(p, 600, 450)
    const toque = (type: string, q?: [number, number]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: q ? [{ x: q[0], y: q[1] }] : [] })
    await toque('touchStart', de)
    for (let k = 1; k <= 8; k++) await toque('touchMove', [de[0] + ((ate[0] - de[0]) * k) / 8, de[1] + ((ate[1] - de[1]) * k) / 8])
    await toque('touchEnd')
    await expect.poll(() => guardadas(p).then((g) => Math.round(g[0].x))).toBeGreaterThan(590)
    ;[caminhao] = await guardadas(p)
    expect(Math.abs(caminhao.x - 600)).toBeLessThan(4)
    expect(Math.abs(caminhao.y - 450)).toBeLessThan(4)

    // gira, aumenta e renomeia pelos botões. A pausa: o Chrome descarta o clique de um toque dado no
    // mesmo instante em que um arrasto termina (medido em 26/11/2026: 0 ms perde o clique, 600 ms não)
    await p.waitForTimeout(600)
    await p.locator('[data-testid=canteiro-girar-dir]').tap()
    await p.locator('[data-testid=canteiro-girar-dir]').tap()
    await p.locator('[data-testid=canteiro-maior]').tap()
    await p.locator('[data-testid=canteiro-nome]').fill('Betoneira 8 m³')
    await p.locator('[data-testid=canteiro-nome]').press('Enter')
    await expect.poll(() => guardadas(p).then((g) => g[0].nome)).toBe('Betoneira 8 m³')
    ;[caminhao] = await guardadas(p)
    expect(caminhao.giro).toBe(30)
    expect(caminhao.tamanho).toBe(144)
    expect(await p.locator('[data-testid=canteiro-itens]').innerHTML()).toContain('Betoneira 8 m³')
    await semRolarDeLado(p)
    await capturar(p, '375_2_girado')

    // desfazer volta o nome, depois o tamanho
    await p.locator('[data-testid=canteiro-desfazer]').tap()
    await expect.poll(() => guardadas(p).then((g) => g[0].nome)).toBe('Caminhão betoneira')
    await p.locator('[data-testid=canteiro-desfazer]').tap()
    await expect.poll(() => guardadas(p).then((g) => g[0].tamanho)).toBe(120)

    // segunda figura; apagar a primeira; desfazer traz de volta
    await colocarComDedo(p, 'cacamba_entulho', 200, 550)
    await expect.poll(() => guardadas(p).then((g) => g.length)).toBe(2)
    const [cx, cy] = await naTela(p, 600, 450)
    await p.touchscreen.tap(cx, cy)
    await p.locator('[data-testid=canteiro-apagar]').tap()
    await expect.poll(() => guardadas(p).then((g) => g.map((i) => i.tipo))).toEqual(['cacamba_entulho'])
    await p.locator('[data-testid=canteiro-desfazer]').tap()
    await expect.poll(() => guardadas(p).then((g) => g.length)).toBe(2)

    // fecha e abre de novo: o mapa continua no aparelho
    await p.reload()
    await palco(p).waitFor()
    expect(await figurasNaTela(p)).toBe(2)
    expect(await p.locator('[data-testid=canteiro-linha]').innerText()).toContain('2 figuras')
    await semRolarDeLado(p)
    await capturar(p, '375_3_reaberto')
    expect(erros).toEqual([])
    await contexto.close()
  }, 120_000)

  it('tablet 768 x 1024, caneta: coloca, arrasta, gira e muda o tamanho pelas alças; planta de fundo; imagem PNG', async () => {
    const { contexto, p, erros } = await abrir({ width: 768, height: 1024 })
    const cdp = await contexto.newCDPSession(p)
    await semRolarDeLado(p)

    // pavimento com planta em pedaços de imagem: o fundo já vem com a planta
    await p.locator('[data-testid=canteiro-folha]').selectOption({ label: 'Térreo' })
    await p.locator('[data-testid=canteiro-fundo]').waitFor()
    await expect.poll(() => p.locator('[data-testid=canteiro-palco] image').count()).toBeGreaterThan(10)

    // caneta: toca na figura e toca na planta
    await p.locator('[data-testid=fig-grua]').click()
    expect(await p.locator('[data-testid=canteiro-linha]').innerText()).toContain('Toque na folha: Grua')
    const alvo = await naTela(p, 500, 300)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: alvo[0], y: alvo[1], button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen' })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: alvo[0], y: alvo[1], button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' })
    await expect.poll(() => guardadas(p, 'a0000000-0000-0000-0000-0000000000c1').then((g) => g.length)).toBe(1)
    const ler = async () => (await guardadas(p, 'a0000000-0000-0000-0000-0000000000c1'))[0]

    // arrasta com a caneta
    await arrastar(cdp, await naTela(p, 500, 300), await naTela(p, 300, 400), 'pen')
    await expect.poll(() => ler().then((g) => Math.round(g.x))).toBeLessThan(310)
    let grua = await ler()
    expect(Math.abs(grua.x - 300)).toBeLessThan(4)
    expect(Math.abs(grua.y - 400)).toBeLessThan(4)

    // alça de girar (a bolinha de cima) levada para a direita da figura: 90 graus
    const centroDe = async (id: string): Promise<[number, number]> => {
      const r = await p.locator(`[data-testid=${id}]`).boundingBox()
      return [r.x + r.width / 2, r.y + r.height / 2]
    }
    await arrastar(cdp, await centroDe('canteiro-alca-girar'), await naTela(p, 300 + 200, 400), 'pen')
    await expect.poll(() => ler().then((g) => g.giro)).toBe(90)

    // alça de tamanho (o quadrado do canto) puxada para longe: a figura cresce
    const antes = (await ler()).tamanho
    const canto = await centroDe('canteiro-alca-tamanho')
    const centro = await naTela(p, 300, 400)
    await arrastar(cdp, canto, [centro[0] + (canto[0] - centro[0]) * 1.6, centro[1] + (canto[1] - centro[1]) * 1.6], 'pen')
    await expect.poll(() => ler().then((g) => g.tamanho)).toBeGreaterThan(antes * 1.4)
    grua = await ler()
    expect(grua.giro).toBe(90)
    await capturar(p, '768_1_planta')

    // um setor com nome
    await p.locator('[data-testid=fig-setor]').click()
    const s = await naTela(p, 720, 180)
    await p.mouse.click(s[0], s[1])
    await p.locator('[data-testid=canteiro-nome]').fill('Setor A · Armação')
    await p.locator('[data-testid=canteiro-nome]').press('Enter')
    await expect.poll(() => guardadas(p, 'a0000000-0000-0000-0000-0000000000c1').then((g) => g.map((i) => i.nome))).toContain('Setor A · Armação')

    // trocar para a folha em branco mantém as figuras; a escolha do fundo fica guardada
    await p.locator('[data-testid=canteiro-fundo]').selectOption({ label: 'Folha em branco' })
    await expect.poll(() => p.locator('[data-testid=canteiro-palco] image').count()).toBe(0)
    expect(await figurasNaTela(p)).toBe(2)
    await p.locator('[data-testid=canteiro-fundo]').selectOption({ label: 'Térreo · Planta de teste' })
    await expect.poll(() => p.locator('[data-testid=canteiro-palco] image').count()).toBeGreaterThan(10)

    // zoom pelos botões e "ver a folha inteira" não mexem nas figuras
    const k0 = Number(await palco(p).getAttribute('data-vk'))
    await p.getByRole('button', { name: 'Aproximar' }).click()
    expect(Number(await palco(p).getAttribute('data-vk'))).toBeGreaterThan(k0)
    await p.locator('[data-testid=canteiro-inteira]').click()
    expect(Number(await palco(p).getAttribute('data-vk'))).toBeCloseTo(k0, 5)
    expect((await ler()).tamanho).toBe(grua.tamanho)

    // imagem PNG: baixa um arquivo .png de verdade, com o tamanho da folha
    const [baixado] = await Promise.all([p.waitForEvent('download'), p.locator('[data-testid=canteiro-exportar]').click()])
    expect(baixado.suggestedFilename()).toMatch(/^mapa_canteiro_EXE_Terreo_\d{4}-\d{2}-\d{2}\.png$/)
    const arquivo = await baixado.path()
    const medidas = await p.evaluate(async (bytes: number[]) => {
      const img = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
      return [img.width, img.height]
    }, [...readFileSync(arquivo)])
    // folha de 1000 x 625 (planta 2048 x 1280) + faixa de título de 44 + legenda de uma linha (56 + 12), em 2400 px
    expect(medidas).toEqual([2400, Math.round((625 + 44 + 68) * 2.4)])
    if (PRINTS) copyFileSync(arquivo, path.join(PRINTS, 'canteiro_exportado.png'))

    // o outro pavimento tem o mapa dele (vazio) e a planta só com o contorno das peças
    await p.locator('[data-testid=canteiro-folha]').selectOption({ label: '1º pavimento' })
    await expect.poll(() => figurasNaTela(p)).toBe(0)
    await p.locator('[data-testid=canteiro-folha]').selectOption({ label: 'Térreo' })
    await expect.poll(() => figurasNaTela(p)).toBe(2)
    await semRolarDeLado(p)
    await capturar(p, '768_2_final')
    expect(erros).toEqual([])
    await contexto.close()
  }, 120_000)

  it('tablet: caminho com seta, área colorida, duplicar, ordem, mapas por fase e PDF A4', async () => {
    const { contexto, p, erros } = await abrir({ width: 768, height: 1024 })
    const cdp = await contexto.newCDPSession(p)
    const tocar = async (x: number, y: number) => {
      const [tx, ty] = await naTela(p, x, y)
      await p.touchscreen.tap(tx, ty)
      await p.waitForTimeout(60)
    }

    // caminho: toca nos pontos e conclui (com um ponto só, o Concluir fica apagado)
    await p.locator('[data-testid=fig-caminho]').tap()
    expect(await p.locator('[data-testid=canteiro-linha]').innerText()).toContain('faltam 2 pontos')
    await tocar(100, 600)
    expect(await p.locator('[data-testid=canteiro-concluir]').isDisabled()).toBe(true)
    await tocar(400, 600)
    await tocar(400, 300)
    await tocar(450, 250)
    await p.locator('[data-testid=canteiro-voltar-ponto]').tap()
    await p.locator('[data-testid=canteiro-cor]').tap() // laranja → azul
    await capturar(p, '768_3_tracando')
    await p.locator('[data-testid=canteiro-concluir]').tap()
    await expect.poll(() => guardadas(p).then((g) => g.length)).toBe(1)
    let [rota] = (await guardadas(p)) as any[]
    expect(rota).toMatchObject({ tipo: 'caminho', cor: 'azul', nome: 'Caminho' })
    expect(rota.pontos).toHaveLength(3)
    expect(Math.abs(rota.pontos[2][0] - 400) + Math.abs(rota.pontos[2][1] - 300)).toBeLessThan(6)
    await p.locator('[data-testid=canteiro-nome]').fill('Rota do caminhão')
    await p.locator('[data-testid=canteiro-nome]').press('Enter')

    // arrasta o último ponto do caminho (a bolinha do ponto) com a caneta
    await arrastar(cdp, await naTela(p, 400, 300), await naTela(p, 600, 200), 'pen')
    await expect.poll(() => guardadas(p).then((g: any[]) => Math.round(g[0].pontos[2][0]))).toBeGreaterThan(590)
    ;[rota] = (await guardadas(p)) as any[]
    expect(rota.pontos[0][0]).toBeLessThan(110)
    expect(rota.nome).toBe('Rota do caminhão')

    // área: três pontos, cor vermelha depois de pronta (o botão da cor passa para a seguinte)
    await p.locator('[data-testid=fig-area]').tap()
    await tocar(650, 400)
    await tocar(900, 400)
    await tocar(900, 620)
    await tocar(650, 620)
    await p.locator('[data-testid=canteiro-concluir]').tap()
    await expect.poll(() => guardadas(p).then((g) => g.length)).toBe(2)
    await p.locator('[data-testid=canteiro-nome]').fill('Área de risco')
    await p.locator('[data-testid=canteiro-nome]').press('Enter')
    // a área nasce com a cor do último traço (azul); dois toques: verde, vermelho
    await p.locator('[data-testid=canteiro-cor]').tap()
    await p.locator('[data-testid=canteiro-cor]').tap()
    await expect.poll(() => guardadas(p).then((g: any[]) => g[1].cor)).toBe('vermelho')
    // traçado não gira nem muda de tamanho: esses botões não aparecem
    expect(await p.locator('[data-testid=canteiro-girar-dir]').count()).toBe(0)

    // figura em cima da área: o toque pega a figura; fora dela, a área
    await p.locator('[data-testid=fig-grua]').tap()
    await tocar(775, 510)
    await expect.poll(() => guardadas(p).then((g) => g.length)).toBe(3)
    expect(await p.locator('[data-testid=canteiro-nome]').inputValue()).toBe('Grua')

    // duplicar: a cópia aparece ao lado e fica escolhida; desfazer tira a cópia
    await p.locator('[data-testid=canteiro-duplicar]').tap()
    await expect.poll(() => guardadas(p).then((g) => g.length)).toBe(4)
    let todas = (await guardadas(p)) as any[]
    expect(todas[3]).toMatchObject({ tipo: 'grua', x: todas[2].x + 30, y: todas[2].y + 30 })
    await p.locator('[data-testid=canteiro-desfazer]').tap()
    await expect.poll(() => guardadas(p).then((g) => g.length)).toBe(3)

    // ordem: duas figuras do mesmo tamanho empilhadas; a de cima vai para trás e o toque passa a pegar a outra
    await p.locator('[data-testid=fig-almoxarifado]').tap()
    await tocar(250, 200)
    await p.locator('[data-testid=fig-refeitorio]').tap()
    await tocar(250, 200)
    await expect.poll(() => guardadas(p).then((g) => g.length)).toBe(5)
    expect(await p.locator('[data-testid=canteiro-nome]').inputValue()).toBe('Refeitório')
    await p.locator('[data-testid=canteiro-tras]').tap()
    await expect.poll(() => guardadas(p).then((g) => g[0].tipo)).toBe('refeitorio')
    await tocar(50, 50) // solta
    await tocar(250, 200)
    expect(await p.locator('[data-testid=canteiro-nome]').inputValue()).toBe('Almoxarifado')
    await p.locator('[data-testid=canteiro-tras]').tap()
    await tocar(50, 50)
    await tocar(250, 200)
    expect(await p.locator('[data-testid=canteiro-nome]').inputValue()).toBe('Refeitório')
    await p.locator('[data-testid=canteiro-frente]').tap()
    await tocar(50, 50)
    await semRolarDeLado(p)
    await capturar(p, '768_4_tracados')

    // mapas por fase: dá nome ao principal, copia para a fase seguinte e muda só a cópia
    await p.locator('[data-testid=canteiro-mapas]').tap()
    await p.locator('[data-testid=canteiro-nome-mapa]').fill('Fase estrutura')
    await p.locator('[data-testid=canteiro-salvar-nome-mapa]').tap()
    await expect.poll(() => p.locator('[data-testid=canteiro-mapa] option').allInnerTexts()).toEqual(['Fase estrutura'])
    await p.locator('[data-testid=canteiro-copiar-mapa]').tap()
    await expect.poll(() => p.locator('[data-testid=canteiro-mapa] option').allInnerTexts()).toEqual(['Fase estrutura', 'Fase estrutura (cópia)'])
    await expect.poll(() => figurasNaTela(p)).toBe(5)
    await p.locator('[data-testid=canteiro-nome-mapa]').fill('Fase acabamento')
    await p.locator('[data-testid=canteiro-salvar-nome-mapa]').tap()
    await expect.poll(() => p.locator('[data-testid=canteiro-mapa] option').allInnerTexts()).toEqual(['Fase estrutura', 'Fase acabamento'])
    await capturar(p, '768_5_mapas')
    await p.locator('[data-testid=canteiro-mapas]').tap()
    // na fase acabamento a grua sai
    await tocar(775, 510)
    expect(await p.locator('[data-testid=canteiro-nome]').inputValue()).toBe('Grua')
    await p.locator('[data-testid=canteiro-apagar]').tap()
    await expect.poll(() => figurasNaTela(p)).toBe(4)
    // a fase estrutura continua com a grua
    await p.locator('[data-testid=canteiro-mapa]').selectOption({ label: 'Fase estrutura' })
    await expect.poll(() => figurasNaTela(p)).toBe(5)

    // mapa novo vazio; apagar pede confirmação e volta ao principal
    await p.locator('[data-testid=canteiro-mapas]').tap()
    await p.locator('[data-testid=canteiro-novo-mapa]').tap()
    await expect.poll(() => p.locator('[data-testid=canteiro-mapa] option').allInnerTexts()).toEqual(['Fase estrutura', 'Fase acabamento', 'Mapa 3'])
    await expect.poll(() => figurasNaTela(p)).toBe(0)
    await p.locator('[data-testid=canteiro-apagar-mapa]').tap()
    expect(await p.locator('[data-testid=canteiro-mapa] option').count()).toBe(3)
    await p.locator('[data-testid=canteiro-confirmar-apagar-mapa]').tap()
    await expect.poll(() => p.locator('[data-testid=canteiro-mapa] option').allInnerTexts()).toEqual(['Fase estrutura', 'Fase acabamento'])
    await expect.poll(() => figurasNaTela(p)).toBe(5)
    await p.locator('[data-testid=canteiro-mapas]').tap()

    // fecha e abre: volta no mesmo mapa (a escolha fica no histórico da tela) com tudo lá
    await p.locator('[data-testid=canteiro-mapa]').selectOption({ label: 'Fase acabamento' })
    await expect.poll(() => figurasNaTela(p)).toBe(4)
    await p.reload()
    await palco(p).waitFor()
    expect(await p.locator('[data-testid=canteiro-mapa] option').allInnerTexts()).toEqual(['Fase estrutura', 'Fase acabamento'])

    // PDF A4 deitado: um PDF de verdade, de uma página, com a imagem dentro
    await p.locator('[data-testid=canteiro-mapa]').selectOption({ label: 'Fase estrutura' })
    await expect.poll(() => figurasNaTela(p)).toBe(5)
    const [baixado] = await Promise.all([p.waitForEvent('download'), p.locator('[data-testid=canteiro-pdf]').click()])
    expect(baixado.suggestedFilename()).toMatch(/^mapa_canteiro_EXE_Canteiro_geral_Fase_estrutura_\d{4}-\d{2}-\d{2}\.pdf$/)
    const bytes = readFileSync(await baixado.path())
    const texto = bytes.toString('latin1')
    expect(texto.startsWith('%PDF-1.4')).toBe(true)
    expect(texto).toContain('/MediaBox [0 0 841.89 595.28]')
    expect(texto).toContain('/Width 2480 /Height 1753')
    expect(texto).toContain('/Filter /DCTDecode')
    // a imagem dentro do PDF é um JPEG inteiro (começa em FF D8 e termina em FF D9)
    const inicio = bytes.indexOf('stream\n', 0, 'latin1') + 7
    const tamanho = Number(/\/Length (\d+) >>\nstream/.exec(texto)![1])
    expect([bytes[inicio], bytes[inicio + 1], bytes[inicio + tamanho - 2], bytes[inicio + tamanho - 1]]).toEqual([0xff, 0xd8, 0xff, 0xd9])
    expect(tamanho).toBeGreaterThan(50_000)
    if (PRINTS) copyFileSync(await baixado.path(), path.join(PRINTS, 'canteiro_exportado.pdf'))
    // e o PNG do mesmo mapa, com a legenda
    const [png] = await Promise.all([p.waitForEvent('download'), p.locator('[data-testid=canteiro-exportar]').click()])
    if (PRINTS) copyFileSync(await png.path(), path.join(PRINTS, 'canteiro_exportado_legenda.png'))
    expect(erros).toEqual([])
    await contexto.close()
  }, 180_000)

  it('pinça com dois dedos aproxima a folha sem mover nem criar figura', async () => {
    const { contexto, p, erros } = await abrir({ width: 375, height: 700 })
    const cdp = await contexto.newCDPSession(p)
    await colocarComDedo(p, 'extintor', 500, 350)
    await expect.poll(() => guardadas(p).then((g) => g.length)).toBe(1)
    const [antes] = await guardadas(p)
    const k0 = Number(await palco(p).getAttribute('data-vk'))
    const [mx, my] = await naTela(p, 500, 350)
    const dedos = (type: string, d: number) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: d < 0 ? [] : [{ x: mx - d, y: my, id: 1 }, { x: mx + d, y: my, id: 2 }] })
    await dedos('touchStart', 30)
    for (const d of [45, 60, 80, 100, 120]) await dedos('touchMove', d)
    await dedos('touchEnd', -1)
    expect(Number(await palco(p).getAttribute('data-vk'))).toBeGreaterThan(k0 * 2.5)
    await p.waitForTimeout(200)
    expect(await guardadas(p)).toEqual([antes])
    await semRolarDeLado(p)
    await capturar(p, '375_4_zoom')

    // + da tela com uma figura escolhida no canto: o zoom é em volta dela, que continua à vista
    await p.locator('[data-testid=canteiro-inteira]').tap()
    await colocarComDedo(p, 'tapume', 150, 640)
    for (let n = 0; n < 3; n++) {
      await p.locator('[data-testid=canteiro-mais-zoom]').tap()
      await p.waitForTimeout(350)
    }
    const [zx, zy] = await naTela(p, 150, 640)
    const caixa = await palco(p).boundingBox()
    expect(zx).toBeGreaterThan(caixa.x)
    expect(zx).toBeLessThan(caixa.x + caixa.width)
    expect(zy).toBeGreaterThan(caixa.y)
    expect(zy).toBeLessThan(caixa.y + caixa.height)
    expect(erros).toEqual([])
    await contexto.close()
  }, 120_000)
})

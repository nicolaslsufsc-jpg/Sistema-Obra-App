// Telas do Concreto no Chrome, pela bancada (app/dev/concreto.html): sem login nem servidor,
// com caneta de verdade (eventos "pen" do Chrome) e dedo (toque). Roda com SO_E2E=1 (GitHub,
// junto com as outras telas) ou SO_BANCADA=1.
//   No PC do Nicolas: SO_BANCADA=1 SO_PLAYWRIGHT=<pasta>/node_modules/playwright SO_CHROME=chrome npx vitest run testes/concreto_bancada.e2e.test.ts
// SO_PRINTS=<pasta> salva capturas de tela.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
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
  if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `concreto_${nome}.png`) })
}

/** Botão ou linha de tabela (pavimentos, concretagens e ficha do dia são tabela desde 23/11/2026). */
async function clicar(p: Page, texto: string | RegExp) {
  await p.getByRole('button', { name: texto }).or(p.getByRole('row', { name: texto })).first().click()
}

/** Ponto da planta (x, y em pixels da planta) → ponto da tela. Usa o mapa exposto na bancada. */
async function naTela(p: Page, x: number, y: number): Promise<[number, number]> {
  return p.evaluate(
    ([px, py]: [number, number]) => {
      const caixa = document.querySelector('.cc-mapa') as HTMLElement & { __mapa: any }
      const q = caixa.__mapa.latLngToContainerPoint([-py, px])
      const r = caixa.getBoundingClientRect()
      return [r.left + q.x, r.top + q.y]
    },
    [x, y],
  )
}

/** Traço com caneta de verdade (CDP), passando pelos pontos da planta. */
async function tracarComCaneta(p: Page, cdp: any, pontosPlanta: Array<[number, number]>) {
  const pts: Array<[number, number]> = []
  for (let i = 0; i < pontosPlanta.length - 1; i++) {
    const [a, b] = [await naTela(p, ...pontosPlanta[i]), await naTela(p, ...pontosPlanta[i + 1])]
    for (let k = 0; k < 12; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / 12, a[1] + ((b[1] - a[1]) * k) / 12])
  }
  pts.push(await naTela(p, ...pontosPlanta[pontosPlanta.length - 1]))
  const ev = (type: string, [x, y]: [number, number]) =>
    cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen' })
  await ev('mousePressed', pts[0])
  for (const q of pts.slice(1)) await ev('mouseMoved', q)
  await ev('mouseReleased', pts[pts.length - 1])
}

async function tocarComCaneta(p: Page, cdp: any, x: number, y: number) {
  const q = await naTela(p, x, y)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: q[0], y: q[1], button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen' })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: q[0], y: q[1], button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' })
}

async function tocarComDedo(p: Page, x: number, y: number) {
  const [tx, ty] = await naTela(p, x, y)
  await p.touchscreen.tap(tx, ty)
}

const pecasDoPainel = (p: Page) => p.locator('[data-testid=pecas-caminhao] li').allInnerTexts()

/** Centro do pilar Pn da planta esquemática (grade de `colunas`, vão 320, margem 120). */
function centroPilar(n: number, colunas: number): [number, number] {
  return [120 + ((n - 1) % colunas) * 320, 120 + Math.floor((n - 1) / colunas) * 320]
}
/** Quadrado de 90 px da planta em volta de um ponto (pega o pilar e no máximo 6% das vigas). */
function laco([x, y]: [number, number], meio = 45): Array<[number, number]> {
  return [[x - meio, y - meio], [x + meio, y - meio], [x + meio, y + meio], [x - meio, y + meio], [x - meio, y - meio]]
}

suite('Concreto na bancada (Chrome)', () => {
  beforeAll(async () => {
    // nada da bancada vai para o Supabase de verdade
    process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:9'
    servidor = await createServer({ root: RAIZ, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } })
    await servidor.listen()
    url = `${servidor.resolvedUrls!.local[0]}dev/concreto.html`
    const pw = createRequire(import.meta.url)(process.env.SO_PLAYWRIGHT || 'playwright')
    navegador = await pw.chromium.launch(process.env.SO_CHROME ? { channel: process.env.SO_CHROME, headless: true } : { headless: true })
    // SO_FONTE_LARGA=1 (como na FVS, 25/11): todas as páginas em Verdana, mais larga que a fonte do
    // Windows e parecida com a do Linux do GitHub; pega no PC o topo que só estoura no CI
    if (process.env.SO_FONTE_LARGA) {
      const novo = navegador.newContext.bind(navegador)
      navegador.newContext = async (...a: unknown[]) => {
        const ctx = await novo(...a)
        await ctx.addInitScript(() => {
          const aplicar = () => {
            const s = document.createElement('style')
            s.textContent = '*{font-family:Verdana, sans-serif !important}'
            document.head.appendChild(s)
          }
          if (document.head) aplicar()
          else document.addEventListener('DOMContentLoaded', aplicar)
        })
        return ctx
      }
    }
  }, 120_000)

  afterAll(async () => {
    await navegador?.close()
    await servidor?.close()
  })

  it('tablet deitado: caneta desenha, toque marca peça, desfazer, dedo marca, relatório', async () => {
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true })
    const p = await contexto.newPage()
    const erros: string[] = []
    p.on('pageerror', (e: Error) => erros.push(e.message))
    await p.goto(url)
    await clicar(p, /Pavimento pequeno/)
    await clicar(p, /Trecho 2 · Vigas/)
    await clicar(p, 'Desenhar na planta')
    await p.locator('[data-testid=mapa] canvas.leaflet-zoom-animated').first().waitFor()
    await p.locator('[data-testid=chip-1]').click()
    const cdp = await contexto.newCDPSession(p)

    // fora do Android a tinta é um canvas comum: o de baixa latência deixava a planta preta no PC (16/11/2026)
    expect(await p.evaluate(() => (document.querySelector('canvas.cc-tinta') as HTMLCanvasElement).getContext('2d')!.getContextAttributes().desynchronized)).toBe(false)

    // botão lateral da caneta não desenha nem marca peça
    const [lx, ly] = await naTela(p, ...centroPilar(1, 5))
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: lx, y: ly, button: 'right', buttons: 2, clickCount: 1, pointerType: 'pen' })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: lx, y: ly, button: 'right', buttons: 0, clickCount: 1, pointerType: 'pen' })
    await p.waitForTimeout(200)
    expect(await pecasDoPainel(p)).toEqual([])

    // planta ainda deslizando (inércia do dedo): a caneta encosta e a planta para na hora
    const vistaOriginal = await p.evaluate(() => {
      const m = (document.querySelector('.cc-mapa') as any).__mapa
      const c = m.getCenter()
      m.panBy([120, 0], { animate: true, duration: 1.2 })
      return [c.lat, c.lng]
    })
    await p.waitForTimeout(100)
    // num vão vazio da planta, para o toque não marcar peça
    const [vx, vy] = await naTela(p, 1200, 600)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: vx, y: vy, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen' })
    const centro = () => p.evaluate(() => (document.querySelector('.cc-mapa') as any).__mapa.getCenter().lng)
    const c1 = await centro()
    await p.waitForTimeout(400)
    expect(await centro()).toBe(c1)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: vx, y: vy, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' })
    // devolve a planta ao lugar (o P1 saiu da tela com o deslize)
    await p.evaluate((c: [number, number]) => {
      const m = (document.querySelector('.cc-mapa') as any).__mapa
      m.setView(c, m.getZoom(), { animate: false })
    }, vistaOriginal)

    // laço em volta do P1 (grade de 5 colunas no pavimento pequeno)
    await tracarComCaneta(p, cdp, laco(centroPilar(1, 5)))
    await p.getByTestId('toast').filter({ hasText: 'entrou no caminhão 1' }).waitFor()
    expect(await pecasDoPainel(p)).toEqual(['P1 100%'])
    await capturar(p, 'tablet_desenho')

    // toque curto da caneta no P2: entra marcado "toque"
    await tocarComCaneta(p, cdp, ...centroPilar(2, 5))
    await p.getByTestId('toast').filter({ hasText: 'P2 entrou' }).waitFor()
    expect(await pecasDoPainel(p)).toEqual(['P1 100%', 'P2 toque'])

    // desfazer apaga a área: o P1 sai, o P2 (toque) fica
    await p.getByTestId('desfazer').click()
    await p.getByTestId('toast').filter({ hasText: 'Última área apagada' }).waitFor()
    expect(await pecasDoPainel(p)).toEqual(['P2 toque'])

    // dedo (toque na tela) na peça: tira o P2
    await tocarComDedo(p, ...centroPilar(2, 5))
    await p.getByTestId('toast').filter({ hasText: 'P2 saiu' }).waitFor()
    expect(await pecasDoPainel(p)).toEqual([])

    // o nome escrito na planta também é tocável (rótulo do P3, acima e à direita do pilar)
    const [cx3, cy3] = centroPilar(3, 5)
    await tocarComDedo(p, cx3 + 69, cy3 - 39)
    await p.getByTestId('toast').filter({ hasText: 'P3 entrou' }).waitFor()
    await tocarComDedo(p, cx3 + 69, cy3 - 39)
    await p.getByTestId('toast').filter({ hasText: 'P3 saiu' }).waitFor()
    expect(await pecasDoPainel(p)).toEqual([])

    // desenha de novo e confere o relatório
    await tracarComCaneta(p, cdp, laco(centroPilar(7, 5)))
    // Espera o aviso do laço ("1 peça entrou no caminhão 1."): o aviso anterior ("P3 saiu do
    // caminhão 1.") também contém "caminhão 1" e, sob carga, o relatório era lido antes do P7 entrar.
    await p.getByTestId('toast').filter({ hasText: 'peça entrou no caminhão 1' }).waitFor()
    // guia de estilo: no mapa, como no cabeçalho comum, o voltar é só a seta (44 px), sem texto
    const voltarMapa = p.locator('.cc-mapa-topo').getByRole('button', { name: 'Voltar', exact: true })
    expect(await voltarMapa.innerText()).toBe('‹')
    expect((await voltarMapa.boundingBox())!.width).toBeGreaterThanOrEqual(44)
    await voltarMapa.click()
    await clicar(p, 'Relatório de peças')
    const rel = await p.getByTestId('relatorio-caminhao').innerText()
    expect(rel).toMatch(/1\s+184201\s+8,5\s+P7/)
    await capturar(p, 'tablet_relatorio')

    // O aviso de envio acompanha o que foi gravado. Antes ficava com o número de quando o módulo
    // abriu e o envio esperava o próximo ciclo (até 5 min com internet).
    const naFila = (): Promise<number> =>
      p.evaluate(
        () =>
          new Promise<number>((ok, falha) => {
            const r = indexedDB.open('sistema-obra')
            r.onerror = () => falha(r.error)
            r.onsuccess = () => {
              const q = r.result.transaction('fila').objectStore('fila').getAll()
              q.onsuccess = () => {
                ok(q.result.filter((i: { estado: string }) => i.estado === 'pendente').length)
                r.result.close()
              }
            }
          }),
      )
    const pendentes = await naFila()
    expect(pendentes).toBeGreaterThan(0)
    await p.getByTestId('concreto-sync').filter({ hasText: `${pendentes} registro(s) esperando envio` }).waitFor({ timeout: 5000 })
    expect(erros).toEqual([])
    await contexto.close()
  }, 90_000)

  it('pavimento em 2 trechos: a área fica no trecho dela e o pilar da emenda conta nos dois', async () => {
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true })
    const p = await contexto.newPage()
    const erros: string[] = []
    p.on('pageerror', (e: Error) => erros.push(e.message))
    await p.goto(url)
    await clicar(p, /Pavimento em 2 trechos/)
    await clicar(p, '+ Nova concretagem')
    await p.getByLabel('Local').fill('Trechos 1 e 2')
    await p.getByLabel('fck (MPa)').fill('35')
    await clicar(p, 'Salvar concretagem')
    await clicar(p, '+ Caminhão')
    await p.getByLabel('Nota fiscal').fill('300001')
    await clicar(p, /^Salvar$/)
    await clicar(p, 'Desenhar onde foi')
    const trecho = p.getByTestId('trecho')
    await trecho.waitFor()
    expect(await trecho.locator('option').allInnerTexts()).toEqual(['Trecho 1', 'Trecho 2'])
    const cdp = await contexto.newCDPSession(p)

    // trecho 1 tem P1..P10 (grade de 4 colunas): P9 é pilar da emenda
    await tracarComCaneta(p, cdp, laco(centroPilar(9, 4)))
    await p.getByTestId('toast').filter({ hasText: 'caminhão 1' }).waitFor()
    expect(await pecasDoPainel(p)).toEqual(['P9 100%'])
    // P3 do trecho 1 fica onde, no trecho 2 (outras coordenadas), está o P11: o P11 não pode entrar
    await tracarComCaneta(p, cdp, laco(centroPilar(3, 4)))
    await p.getByTestId('toast').filter({ hasText: 'caminhão 1' }).waitFor()
    await p.waitForFunction(() => document.querySelectorAll('[data-testid=pecas-caminhao] li').length >= 2)
    expect(await pecasDoPainel(p)).toEqual(['P3 100%', 'P9 100%'])
    expect(await trecho.locator('option').allInnerTexts()).toEqual(['Trecho 1 · 2 áreas', 'Trecho 2'])

    // no trecho 2 a área do trecho 1 não aparece e não pode ser desfeita daqui
    await trecho.selectOption({ label: 'Trecho 2' })
    await p.waitForTimeout(300)
    expect(await p.getByTestId('painel').innerText()).toContain('0 áreas nesta planta')
    expect(await pecasDoPainel(p)).toEqual(['P3 100%', 'P9 100%'])
    await p.getByTestId('desfazer').click()
    await p.getByTestId('toast').filter({ hasText: 'não tem área desenhada nesta planta' }).waitFor()
    expect(await pecasDoPainel(p)).toEqual(['P3 100%', 'P9 100%'])
    await capturar(p, 'tablet_trecho2')
    expect(erros).toEqual([])
    await contexto.close()
  }, 90_000)

  // Decisão do Nicolas (04/11/2026, confirmada em 07/11): a forma não traz o contorno da laje, então
  // ela é uma peça por trecho ("Laje do Trecho 2"), marcada no toque, e a pessoa cria no primeiro toque.
  it('laje: uma peça por trecho, marcada no toque, entra no relatório e no CSV', async () => {
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true, acceptDownloads: true })
    const p = await contexto.newPage()
    const erros: string[] = []
    p.on('pageerror', (e: Error) => erros.push(e.message))
    await p.goto(url)
    await clicar(p, /Pavimento em 2 trechos/)
    await clicar(p, '+ Nova concretagem')
    await p.getByLabel('Local').fill('Trecho 1 · Laje')
    await p.getByLabel('fck (MPa)').fill('35')
    await clicar(p, 'Salvar concretagem')
    await clicar(p, '+ Caminhão')
    await p.getByLabel('Nota fiscal').fill('500001')
    await clicar(p, /^Salvar$/)
    await clicar(p, 'Desenhar onde foi')
    const trecho = p.getByTestId('trecho')
    await trecho.waitFor()
    const laje = p.getByTestId('laje')
    expect(await laje.innerText()).toContain('Laje do Trecho 1')
    expect(await laje.getAttribute('aria-pressed')).toBe('false')

    // o pilar vem do desenho da caneta; a laje, do toque no botão
    const cdp = await contexto.newCDPSession(p)
    await tracarComCaneta(p, cdp, laco(centroPilar(1, 4)))
    await p.getByTestId('toast').filter({ hasText: 'peça entrou no caminhão 1' }).waitFor()
    await laje.tap()
    await p.getByTestId('toast').filter({ hasText: 'Laje do Trecho 1 entrou no caminhão 1' }).waitFor()
    expect(await pecasDoPainel(p)).toEqual(['P1 100%', 'Laje do Trecho 1 toque'])
    expect(await laje.getAttribute('aria-pressed')).toBe('true')
    await capturar(p, 'tablet_laje')

    // cada trecho tem a sua laje; tocar de novo tira
    await trecho.selectOption({ label: 'Trecho 2' })
    await p.waitForFunction(() => document.querySelector('[data-testid=laje]')?.textContent?.includes('Laje do Trecho 2'))
    expect(await laje.getAttribute('aria-pressed')).toBe('false')
    await laje.tap()
    await p.getByTestId('toast').filter({ hasText: 'Laje do Trecho 2 entrou' }).waitFor()
    expect(await pecasDoPainel(p)).toEqual(['P1 100%', 'Laje do Trecho 1 toque', 'Laje do Trecho 2 toque'])
    await laje.tap()
    await p.getByTestId('toast').filter({ hasText: 'Laje do Trecho 2 saiu' }).waitFor()
    expect(await pecasDoPainel(p)).toEqual(['P1 100%', 'Laje do Trecho 1 toque'])

    // dois toques na laje do Trecho 2 criaram uma linha só em "elementos" (sem espaço no nome)
    const lajes = await p.evaluate(`(async () => {
      const { sincronizador } = await import('/src/nucleo/servicos.ts')
      const linhas = await sincronizador.linhas('elementos', 'b0000000-0000-0000-0000-0000000000aa')
      return linhas.filter((e) => e.pavimento_id === 'a0000000-0000-0000-0000-000000000004' && e.tipo === 'L').map((e) => e.nome).sort()
    })()`)
    expect(lajes).toEqual(['Laje_Trecho_1', 'Laje_Trecho_2'])

    // sem caminhão escolhido, o toque na laje mostra os caminhões dela
    await clicar(p, /^Ver$/)
    await trecho.selectOption({ label: 'Trecho 1' })
    await p.getByTestId('laje').tap()
    const painelLaje = await p.getByTestId('painel-peca').innerText()
    expect(painelLaje).toContain('Laje do Trecho 1')
    expect(painelLaje).toContain('NF 500001')

    // relatório e CSV
    await clicar(p, 'Voltar')
    await clicar(p, 'Voltar')
    await clicar(p, 'Relatório de peças')
    expect(await p.getByTestId('relatorio-caminhao').innerText()).toMatch(/500001[\s\S]*P1, Laje do Trecho 1/)
    await p.getByRole('tab', { name: 'Por peça' }).click()
    expect(await p.getByTestId('relatorio-peca').innerText()).toMatch(/Laje do Trecho 1\s+1 \(NF 500001\)/)
    const [baixado] = await Promise.all([p.waitForEvent('download'), clicar(p, 'Baixar CSV')])
    const csv = readFileSync(await baixado.path(), 'utf8')
    expect(csv).toContain(';500001;;Laje do Trecho 1;L;;não;toque\r\n')
    await capturar(p, 'tablet_relatorio_laje')
    expect(erros).toEqual([])
    await contexto.close()
  }, 120_000)

  it('laje: quem é de campo marca a laje que já existe, mas não cria', async () => {
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true })
    const p = await contexto.newPage()
    const erros: string[] = []
    p.on('pageerror', (e: Error) => erros.push(e.message))
    await p.goto(`${url}?papel=campo`)
    await clicar(p, /Pavimento em 2 trechos/)
    await clicar(p, '+ Nova concretagem')
    await p.getByLabel('Local').fill('Trecho 1 · Laje')
    await p.getByLabel('fck (MPa)').fill('35')
    await clicar(p, 'Salvar concretagem')
    await clicar(p, '+ Caminhão')
    await p.getByLabel('Nota fiscal').fill('600001')
    await clicar(p, /^Salvar$/)
    await clicar(p, 'Desenhar onde foi')
    const laje = p.getByTestId('laje')
    await laje.waitFor()
    expect(await laje.isDisabled()).toBe(true)
    expect(await p.getByTestId('painel').innerText()).toContain('Só gestor ou administrador cria a laje')
    await capturar(p, 'tablet_laje_campo')

    // a laje criada por um gestor (chegou pela sincronização): agora o campo marca
    await p.evaluate(`(async () => {
      const { banco } = await import('/src/nucleo/servicos.ts')
      const { idDaLaje, nomeNoBanco } = await import('/src/concreto/lajes.ts')
      const pav = 'a0000000-0000-0000-0000-000000000004'
      const id = await idDaLaje(pav, 'Trecho 1')
      const linha = { id, obra_id: 'b0000000-0000-0000-0000-0000000000aa', pavimento_id: pav, tipo: 'L', nome: nomeNoBanco('Trecho 1'), secao: null,
        usuario_id: '00000000-0000-0000-0000-0000000000b1', dispositivo_id: '00000000-0000-0000-0000-000000000000',
        criado_em_dispositivo: new Date().toISOString(), apagado: false }
      await banco.registros.put({ tabela: 'elementos', id, obra_id: linha.obra_id, linha, pendente: 0 })
    })()`)
    await p.reload()
    await clicar(p, /Pavimento em 2 trechos/)
    await clicar(p, /Trecho 1 · Laje/)
    await p.locator('.cc-linha').filter({ hasText: 'NF 600001' }).click()
    await clicar(p, 'Desenhar onde foi')
    await laje.waitFor()
    expect(await laje.isDisabled()).toBe(false)
    expect(await p.getByTestId('painel').innerText()).not.toContain('Só gestor ou administrador cria a laje')
    await laje.tap()
    await p.getByTestId('toast').filter({ hasText: 'Laje do Trecho 1 entrou no caminhão 1' }).waitFor()
    expect(await pecasDoPainel(p)).toEqual(['Laje do Trecho 1 toque'])
    expect(erros).toEqual([])
    await contexto.close()
  }, 90_000)

  // Rodada de teste de 08/11: o Desfazer tirava as vigas e deixava a laje que entrou com a área.
  it('caneta das vigas e laje: a laje entra com a área e sai no Desfazer e no Apagar áreas', async () => {
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true })
    const p = await contexto.newPage()
    const erros: string[] = []
    p.on('pageerror', (e: Error) => erros.push(e.message))
    p.on('dialog', (d: any) => d.accept())
    await p.goto(url)
    await clicar(p, /Pavimento em 2 trechos/)
    await clicar(p, '+ Nova concretagem')
    await p.getByLabel('Local').fill('Trecho 1 · Vigas e laje')
    await p.getByLabel('fck (MPa)').fill('35')
    await clicar(p, 'Salvar concretagem')
    await clicar(p, '+ Caminhão')
    await p.getByLabel('Nota fiscal').fill('700001')
    await clicar(p, /^Salvar$/)
    await clicar(p, 'Desenhar onde foi')
    const laje = p.getByTestId('laje')
    await laje.waitFor()
    await p.getByTestId('caneta-vigas_laje').click()
    const cdp = await contexto.newCDPSession(p)
    // retângulo em volta da V1 (entre P1 e P2 do trecho 1): pega os pilares de raspão, mas a
    // caneta das vigas e laje não conta pilar
    const emVoltaDaV1: Array<[number, number]> = [[130, 95], [430, 95], [430, 145], [130, 145], [130, 95]]

    await tracarComCaneta(p, cdp, emVoltaDaV1)
    await p.getByTestId('toast').filter({ hasText: 'A Laje do Trecho 1 também entrou' }).waitFor()
    expect(await pecasDoPainel(p)).toEqual(['V1 100%', 'Laje do Trecho 1 com a área'])
    expect(await laje.getAttribute('aria-pressed')).toBe('true')
    await capturar(p, 'tablet_laje_com_area')

    // Desfazer: sai tudo o que entrou com a área, vigas e laje
    await p.getByTestId('desfazer').click()
    await p.getByTestId('toast').filter({ hasText: 'Última área apagada. A Laje do Trecho 1 também saiu.' }).waitFor()
    expect(await pecasDoPainel(p)).toEqual([])
    expect(await laje.getAttribute('aria-pressed')).toBe('false')

    // duas áreas: o Desfazer tira a última e a laje fica (a outra área continua)
    await tracarComCaneta(p, cdp, emVoltaDaV1)
    await p.getByTestId('toast').filter({ hasText: 'também entrou' }).waitFor()
    await tracarComCaneta(p, cdp, [[450, 95], [750, 95], [750, 145], [450, 145], [450, 95]])
    await p.waitForFunction(() => document.querySelectorAll('[data-testid=pecas-caminhao] li').length === 3)
    expect(await pecasDoPainel(p)).toEqual(['V1 100%', 'V2 100%', 'Laje do Trecho 1 com a área'])
    await p.getByTestId('desfazer').click()
    await p.getByTestId('toast').filter({ hasText: /^Última área apagada\.$/ }).waitFor()
    expect(await pecasDoPainel(p)).toEqual(['V1 100%', 'Laje do Trecho 1 com a área'])

    // Apagar áreas: a laje sai junto
    await clicar(p, 'Apagar áreas')
    await p.getByTestId('toast').filter({ hasText: 'Áreas apagadas. A Laje do Trecho 1 também saiu.' }).waitFor()
    expect(await pecasDoPainel(p)).toEqual([])

    // laje marcada no toque vale mais que a área: o Desfazer não tira
    await laje.tap()
    await p.getByTestId('toast').filter({ hasText: 'Laje do Trecho 1 entrou no caminhão 1' }).waitFor()
    await tracarComCaneta(p, cdp, emVoltaDaV1)
    await p.getByTestId('toast').filter({ hasText: 'peça entrou no caminhão 1' }).waitFor()
    await p.getByTestId('desfazer').click()
    await p.getByTestId('toast').filter({ hasText: /^Última área apagada\.$/ }).waitFor()
    expect(await pecasDoPainel(p)).toEqual(['Laje do Trecho 1 toque'])
    expect(erros).toEqual([])
    await contexto.close()
  }, 90_000)

  // Pedido do Nicolas (26/11/2026): "tem vezes que a gente concreta os três juntos", e "Vigas" só.
  it('seis canetas: cada uma vale só nas peças dela; botões no tablet, seletor no celular (375, 768 e 1024)', async () => {
    const contexto = await navegador.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true })
    const p = await contexto.newPage()
    const erros: string[] = []
    p.on('pageerror', (e: Error) => erros.push(e.message))
    p.on('dialog', (d: any) => d.accept())
    await p.goto(url)
    await clicar(p, /Pavimento em 2 trechos/)
    await clicar(p, '+ Nova concretagem')
    await p.getByLabel('Local').fill('Trecho 1 · seis canetas')
    await p.getByLabel('fck (MPa)').fill('35')
    await clicar(p, 'Salvar concretagem')
    await clicar(p, '+ Caminhão')
    await p.getByLabel('Nota fiscal').fill('760001')
    await clicar(p, /^Salvar$/)
    await clicar(p, 'Desenhar onde foi')
    await p.getByTestId('laje').waitFor()

    // o topo do mapa: em 768 e 1024 os seis botões inteiros na tela; em 375 o seletor, sem rolar de lado
    for (const largura of [375, 768, 1024]) {
      // 768: tablet em pé (768 x 1024); 1024: tablet deitado
      const altura = largura === 375 ? 812 : largura === 768 ? 1024 : 768
      await p.setViewportSize({ width: largura, height: altura })
      await p.waitForTimeout(150)
      const topo = await p.evaluate(() => {
        const visivel = (el: Element) => (el as HTMLElement).offsetParent !== null
        const botoes = [...document.querySelectorAll('[data-testid^=caneta-]:not([data-testid=caneta-seletor])')]
        const seletor = document.querySelector('[data-testid=caneta-seletor]')!
        return {
          botoes: botoes.filter(visivel).map((b) => {
            const r = b.getBoundingClientRect()
            return { texto: (b as HTMLElement).innerText, dentro: r.left >= 0 && r.right <= window.innerWidth + 1, alto: r.height }
          }),
          seletor: visivel(seletor),
          topo: document.querySelector('.cc-mapa-topo')!.getBoundingClientRect().height,
          rolaDeLado: document.documentElement.scrollWidth > window.innerWidth + 1,
        }
      })
      // girar o aparelho ou mudar a largura: a planta se reenquadra e o P1 (120, 120) continua na tela
      const [px, py] = await naTela(p, 120, 120)
      const caixaMapa = await p.getByTestId('mapa').boundingBox()
      expect(px >= caixaMapa.x && px <= caixaMapa.x + caixaMapa.width && py >= caixaMapa.y && py <= caixaMapa.y + caixaMapa.height).toBe(true)
      expect(topo.rolaDeLado).toBe(false)
      if (largura === 375) {
        expect(topo.seletor).toBe(true)
        expect(topo.botoes).toEqual([])
      } else {
        expect(topo.seletor).toBe(false)
        expect(topo.botoes.map((b: { texto: string }) => b.texto)).toEqual(['Pilares', 'Vigas', 'Lajes', 'Pilares e vigas', 'Vigas e lajes', 'Pilares, vigas e lajes'])
        expect(topo.botoes.every((b: { dentro: boolean; alto: number }) => b.dentro && b.alto >= 40)).toBe(true)
      }
      await capturar(p, `canetas_${largura}${process.env.SO_FONTE_LARGA ? '_larga' : ''}`)
      // o topo não come o mapa
      expect(topo.topo).toBeLessThan(altura * 0.4)
    }

    // em volta da V1 com P1 e P2 inteiros (trecho 1: P1 em 120,120 e P2 em 440,120)
    await p.setViewportSize({ width: 1024, height: 768 })
    const cdp = await contexto.newCDPSession(p)
    const emVolta: Array<[number, number]> = [[85, 85], [475, 85], [475, 155], [85, 155], [85, 85]]
    const pecas = async (n: number) => {
      await p
        .waitForFunction((k: number) => document.querySelectorAll('[data-testid=pecas-caminhao] li').length === k, n, { timeout: 8000 })
        .catch(() => undefined)
      return (await pecasDoPainel(p)).sort()
    }

    // "Pilares e vigas": os dois pilares e a viga, sem a laje
    await p.getByTestId('caneta-pilares_vigas').click()
    await tracarComCaneta(p, cdp, emVolta)
    expect(await pecas(3)).toEqual(['P1 100%', 'P2 100%', 'V1 100%'])
    await clicar(p, 'Apagar áreas')
    await pecas(0)

    // "Vigas": só a viga, mesmo com os pilares dentro do traço
    await p.getByTestId('caneta-vigas').click()
    await tracarComCaneta(p, cdp, emVolta)
    expect(await pecas(1)).toEqual(['V1 100%'])
    await clicar(p, 'Apagar áreas')
    await pecas(0)

    // "Pilares, vigas e lajes": tudo, e a laje do trecho entra junto
    await p.getByTestId('caneta-pilares_vigas_laje').click()
    await tracarComCaneta(p, cdp, emVolta)
    await p.getByTestId('toast').filter({ hasText: 'A Laje do Trecho 1 também entrou' }).waitFor()
    expect(await pecas(4)).toEqual(['Laje do Trecho 1 com a área', 'P1 100%', 'P2 100%', 'V1 100%'])
    await capturar(p, 'canetas_tres_juntos_1024')

    // no celular, o seletor troca a caneta (e ela fica lembrada)
    await p.setViewportSize({ width: 375, height: 812 })
    await p.getByTestId('caneta-seletor').selectOption('laje')
    await p.getByText('Caneta marca lajes').waitFor()
    await p.setViewportSize({ width: 1024, height: 768 })
    expect(await p.getByTestId('caneta-laje').getAttribute('aria-pressed')).toBe('true')
    expect(erros).toEqual([])
    await contexto.close()
  }, 120_000)

  it('desenho unido e linhas retas: áreas que se tocam viram um contorno só; cantos tocados fecham a área (375, 768 e 1024)', async () => {
    const contexto = await navegador.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true })
    const p = await contexto.newPage()
    const erros: string[] = []
    p.on('pageerror', (e: Error) => erros.push(e.message))
    p.on('dialog', (d: any) => d.accept())
    await p.goto(url)
    await clicar(p, /Pavimento em 2 trechos/)
    await clicar(p, '+ Nova concretagem')
    await p.getByLabel('Local').fill('Trecho 1 · desenho unido')
    await p.getByLabel('fck (MPa)').fill('35')
    await clicar(p, 'Salvar concretagem')
    await clicar(p, '+ Caminhão')
    await p.getByLabel('Nota fiscal').fill('770001')
    await clicar(p, /^Salvar$/)
    await clicar(p, 'Desenhar onde foi')
    await p.getByTestId('laje').waitFor()
    const cdp = await contexto.newCDPSession(p)
    const pecas = async (n: number) => {
      await p
        .waitForFunction((k: number) => document.querySelectorAll('[data-testid=pecas-caminhao] li').length === k, n, { timeout: 8000 })
        .catch(() => undefined)
      return (await pecasDoPainel(p)).sort()
    }
    // desenhos das áreas no mapa: contornos (linha sem preenchimento) e preenchimentos (sem linha)
    const desenhos = () =>
      p.evaluate(() => {
        const m = (document.querySelector('.cc-mapa') as HTMLElement & { __mapa: any }).__mapa
        let contornos = 0
        let cheios = 0
        m.eachLayer((l: any) => {
          if (!l._latlngs || l.options.interactive !== false) return
          if (l.options.fill === false && l.options.weight >= 2) contornos++
          if (l.options.stroke === false) cheios++
        })
        return { contornos, cheios, numeros: document.querySelectorAll('.cc-num-cam').length }
      })

    // pilares em volta do P1 e, encostando nela, uma área de laje: um desenho só
    await p.getByTestId('caneta-pilares').click()
    await tracarComCaneta(p, cdp, laco([120, 120]))
    await pecas(1)
    await p.getByTestId('caneta-laje').click()
    await tracarComCaneta(p, cdp, [[150, 150], [300, 150], [300, 300], [150, 300], [150, 150]])
    await p.getByTestId('toast').filter({ hasText: 'também entrou' }).waitFor()
    expect(await desenhos()).toEqual({ contornos: 1, cheios: 1, numeros: 0 })
    await capturar(p, 'desenho_unido_1024')
    // as duas continuam gravadas, cada uma com a sua caneta
    await p.getByText('2 áreas nesta planta').waitFor()

    // linhas retas: em volta do P2 (440, 120), canto a canto; tocar o primeiro fecha
    await p.getByTestId('caneta-pilares').click()
    await p.getByTestId('modo-retas').click()
    await p.getByText('Toque os cantos da área', { exact: false }).waitFor()
    // a barra fica no alto da planta: traz o P2 para o meio, como o dedo faria
    await p.evaluate(() => {
      const m = (document.querySelector('.cc-mapa') as HTMLElement & { __mapa: any }).__mapa
      m.setView([-120, 440], m.getZoom(), { animate: false })
    })
    for (const q of [[400, 80], [480, 80], [480, 160], [400, 160]] as Array<[number, number]>) await tocarComCaneta(p, cdp, ...q)
    await p.getByText('4 cantos').waitFor()
    // tirar o último e pôr de novo
    await p.getByTestId('retas-tirar').click()
    await p.getByText('3 cantos').waitFor()
    await tocarComCaneta(p, cdp, 400, 160)
    await capturar(p, 'linhas_retas_cantos_1024')
    await tocarComCaneta(p, cdp, 400, 80)
    expect(await pecas(3)).toEqual(['Laje do Trecho 1 com a área', 'P1 100%', 'P2 100%'])
    await p.getByText('3 áreas nesta planta').waitFor()
    // área longe das outras: dois desenhos
    // caminhão escolhido: sem número (está no painel); em "Ver", cada desenho mostra o número do caminhão
    expect(await desenhos()).toEqual({ contornos: 2, cheios: 2, numeros: 0 })
    await p.getByRole('button', { name: 'Ver', exact: true }).click()
    await p.waitForFunction(() => document.querySelectorAll('.cc-num-cam').length === 2)
    expect(await p.locator('.cc-num-cam').allInnerTexts()).toEqual(['1', '1'])
    await capturar(p, 'numero_do_caminhao_1024')
    await p.getByTestId('chip-1').click()
    await p.getByTestId('barra-retas').waitFor()

    // a barra das linhas retas cabe no celular e no tablet, sem cobrir o + e −
    for (const [w, h] of [[375, 812], [768, 1024], [1024, 768]]) {
      await p.setViewportSize({ width: w, height: h })
      await p.waitForTimeout(150)
      const r = await p.evaluate(() => {
        const caixa = (s: string) => document.querySelector(s)!.getBoundingClientRect()
        const barra = caixa('[data-testid=barra-retas]')
        const zoom = caixa('.cc-zoom')
        const botoes = [...document.querySelectorAll('[data-testid=barra-retas] button')].map((b) => b.getBoundingClientRect())
        return {
          rolaDeLado: document.documentElement.scrollWidth > window.innerWidth + 1,
          cobreZoom: barra.right > zoom.left && barra.bottom > zoom.top && barra.top < zoom.bottom,
          dentro: botoes.every((b) => b.left >= 0 && b.right <= window.innerWidth + 1 && b.height >= 44),
          liga: document.querySelector('[data-testid=modo-retas]')!.getBoundingClientRect().right <= window.innerWidth + 1,
        }
      })
      expect(r).toEqual({ rolaDeLado: false, cobreZoom: false, dentro: true, liga: true })
      await capturar(p, `linhas_retas_${w}${process.env.SO_FONTE_LARGA ? '_larga' : ''}`)
    }

    // "Fechar área" pelo botão: em volta do P3 (760, 120), três cantos já fecham
    await p.setViewportSize({ width: 1024, height: 768 })
    await p.waitForTimeout(150)
    // cantos em gravata (lados cruzados): o Fechar recusa e os cantos ficam
    for (const q of [[700, 70], [820, 220], [820, 70], [700, 220]] as Array<[number, number]>) await tocarComCaneta(p, cdp, ...q)
    await p.getByText('4 cantos').waitFor()
    await p.getByTestId('retas-fechar').click()
    await p.getByTestId('toast').filter({ hasText: 'se cruzam' }).waitFor()
    await p.getByText('4 cantos').waitFor()
    for (let k = 0; k < 4; k++) await p.getByTestId('retas-tirar').click()
    await p.getByText('Toque os cantos da área', { exact: false }).waitFor()
    for (const q of [[700, 70], [820, 70], [760, 220]] as Array<[number, number]>) await tocarComCaneta(p, cdp, ...q)
    await p.getByText('3 cantos').waitFor()
    await p.getByTestId('retas-fechar').click()
    expect(await pecas(4)).toEqual(['Laje do Trecho 1 com a área', 'P1 100%', 'P2 100%', 'P3 100%'])
    // mover um canto: com "Retas" ligado, arrastar a ponta de baixo do triângulo para cima tira o P3
    await tracarComCaneta(p, cdp, [[760, 220], [760, 105]])
    await p.getByTestId('toast').filter({ hasText: 'Canto movido' }).waitFor()
    expect(await pecas(3)).toEqual(['Laje do Trecho 1 com a área', 'P1 100%', 'P2 100%'])
    await p.getByText('4 áreas nesta planta').waitFor()
    // rodada 12: arrastar o canto para perto de outro achatava a área numa lasca, sem aviso. Agora
    // o canto volta ao lugar, avisa e nada é gravado
    const contornosDoTriangulo = () =>
      p.evaluate(() => {
        const m = (document.querySelector('.cc-mapa') as HTMLElement & { __mapa: any }).__mapa
        const caixas: string[] = []
        m.eachLayer((l: any) => {
          if (!l._latlngs || l.options.interactive !== false || l.options.stroke !== false) return
          const b = l.getBounds()
          if (b.getWest() >= 650) caixas.push([b.getWest(), -b.getNorth(), b.getEast(), -b.getSouth()].map(Math.round).join(','))
        })
        return caixas
      })
    const antesDaLasca = await contornosDoTriangulo()
    expect(antesDaLasca).toHaveLength(1)
    await tracarComCaneta(p, cdp, [[760, 105], [735, 88], [712, 76]])
    await p.getByTestId('toast').filter({ hasText: 'O canto voltou ao lugar' }).waitFor()
    expect(await contornosDoTriangulo()).toEqual(antesDaLasca)
    expect(await pecas(3)).toEqual(['Laje do Trecho 1 com a área', 'P1 100%', 'P2 100%'])
    // Desfazer depois de mover o canto: o canto volta para onde estava e o P3 entra de novo
    await p.getByTestId('desfazer').click()
    await p.getByTestId('toast').filter({ hasText: 'O canto voltou para onde estava' }).waitFor()
    expect(await pecas(4)).toEqual(['Laje do Trecho 1 com a área', 'P1 100%', 'P2 100%', 'P3 100%'])
    // a ponta de baixo voltou para perto de 220 (o toque arredonda um pixel)
    expect(Number((await contornosDoTriangulo())[0].split(',')[3])).toBeGreaterThan(215)
    await p.getByText('4 áreas nesta planta').waitFor()

    // borracha: o toque da caneta apaga só a área tocada (o triângulo); o do dedo, a do P2
    await p.getByTestId('modo-borracha').click()
    await p.getByText('Toque na área para apagar').waitFor()
    await tocarComCaneta(p, cdp, 760, 82)
    await p.getByTestId('toast').filter({ hasText: 'Área apagada' }).waitFor()
    await p.getByText('3 áreas nesta planta').waitFor()
    // Desfazer depois da borracha: a área apagada volta (antes, apagava mais uma)
    await p.getByTestId('desfazer').click()
    await p.getByTestId('toast').filter({ hasText: 'A área apagada voltou' }).waitFor()
    await p.getByText('4 áreas nesta planta').waitFor()
    expect(await pecas(4)).toEqual(['Laje do Trecho 1 com a área', 'P1 100%', 'P2 100%', 'P3 100%'])
    await p.waitForTimeout(600) // a borracha ignora dois toques em menos de meio segundo
    await tocarComCaneta(p, cdp, 760, 82)
    await p.getByText('3 áreas nesta planta').waitFor()
    await p.waitForTimeout(600)
    await tocarComDedo(p, 440, 120)
    await p.getByText('2 áreas nesta planta').waitFor()
    expect(await pecas(2)).toEqual(['Laje do Trecho 1 com a área', 'P1 100%'])
    // fora de qualquer área: avisa e não apaga nada
    await p.waitForTimeout(600)
    await tocarComCaneta(p, cdp, 760, 440)
    await p.getByTestId('toast').filter({ hasText: 'Toque dentro de uma área' }).waitFor()
    // borracha de trecho: um traço em volta da metade direita da área de laje (150..300) tira só
    // esse pedaço; a área continua lá, menor, e continua sendo uma só com a do P1
    const direita = () =>
      p.evaluate(() => {
        const m = (document.querySelector('.cc-mapa') as HTMLElement & { __mapa: any }).__mapa
        let maior = -Infinity
        m.eachLayer((l: any) => {
          if (l._latlngs && l.options.interactive === false && l.options.stroke === false) maior = Math.max(maior, l.getBounds().getEast())
        })
        return Math.round(maior)
      })
    expect(await direita()).toBe(300)
    await tracarComCaneta(p, cdp, [[240, 130], [340, 130], [340, 320], [240, 320], [240, 130]])
    await p.getByTestId('toast').filter({ hasText: 'Pedaço apagado' }).waitFor()
    expect(await direita()).toBe(240)
    await p.getByText('2 áreas nesta planta').waitFor()
    // Desfazer depois do recorte: o pedaço volta (antes, apagava o que tinha sobrado da área)
    await p.getByTestId('desfazer').click()
    await p.getByTestId('toast').filter({ hasText: 'O pedaço recortado voltou' }).waitFor()
    await expect.poll(direita).toBe(300)
    await p.getByText('2 áreas nesta planta').waitFor()
    expect(await pecas(2)).toEqual(['Laje do Trecho 1 com a área', 'P1 100%'])
    // recorta de novo para seguir
    await tracarComCaneta(p, cdp, [[240, 130], [340, 130], [340, 320], [240, 320], [240, 130]])
    await p.getByTestId('toast').filter({ hasText: 'Pedaço apagado' }).waitFor()
    await expect.poll(direita).toBe(240)
    expect(await desenhos()).toEqual({ contornos: 1, cheios: 1, numeros: 0 })
    expect(await pecas(2)).toEqual(['Laje do Trecho 1 com a área', 'P1 100%'])
    // traço no meio da área, sem cruzar a borda: avisa (não há furo) e nada muda
    await tracarComCaneta(p, cdp, [[170, 200], [220, 200], [220, 260], [170, 260], [170, 200]])
    await p.getByTestId('toast').filter({ hasText: 'precisa cruzar a borda' }).waitFor()
    expect(await direita()).toBe(240)
    await capturar(p, 'borracha_1024')
    await p.setViewportSize({ width: 375, height: 812 })
    await p.waitForTimeout(150)
    const b = await p.evaluate(() => {
      const r = document.querySelector('[data-testid=borracha-pronto]')!.getBoundingClientRect()
      const z = document.querySelector('.cc-zoom')!.getBoundingClientRect()
      const liga = document.querySelector('[data-testid=modo-borracha]')!.getBoundingClientRect()
      return {
        rolaDeLado: document.documentElement.scrollWidth > window.innerWidth + 1,
        pronto: r.left >= 0 && r.right <= window.innerWidth + 1 && r.height >= 44 && !(r.right > z.left && r.bottom > z.top && r.top < z.bottom),
        liga: liga.right <= window.innerWidth + 1 && liga.height >= 40,
      }
    })
    expect(b).toEqual({ rolaDeLado: false, pronto: true, liga: true })
    await capturar(p, `borracha_375${process.env.SO_FONTE_LARGA ? '_larga' : ''}`)
    await p.setViewportSize({ width: 1024, height: 768 })
    await p.getByTestId('borracha-pronto').click()
    expect(await p.getByTestId('barra-borracha').count()).toBe(0)
    // volta para o traço livre: a barra some
    await p.getByTestId('modo-retas').click()
    expect(await p.getByTestId('barra-retas').count()).toBe(0)
    expect(erros).toEqual([])
    await contexto.close()
  }, 120_000)

  it('desenho unido em aparelho fraco: com a CPU 4x mais lenta, unir as áreas de um caminhão cabe num piscar', async () => {
    const contexto = await navegador.newContext({ viewport: { width: 768, height: 1024 } })
    const p = await contexto.newPage()
    await p.goto(url)
    const cdp = await contexto.newCDPSession(p)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const medir = (quantas: number, pontos: number) =>
      p.evaluate(
        async ([n, k]: [number, number]) => {
          // import pelo navegador (o vitest trocaria um import() escrito aqui)
          const { unirAreas } = await new Function('u', 'return import(u)')('/src/concreto/uniao.ts')
          const roda = (cx: number, cy: number, r: number) =>
            Array.from({ length: k }, (_, i) => {
              const a = (i / k) * Math.PI * 2
              const rr = r + Math.sin(i * 1.7) * 3
              return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]
            })
          const tempos: number[] = []
          for (let vez = 0; vez < 3; vez++) {
            // ids novos a cada vez: sem o resultado guardado
            const areas = Array.from({ length: n }, (_, i) => ({ id: `d${n}-${k}-${vez}-${i}`, contorno: roda(200 + i * 150, 300 + (i % 2) * 60, 100), alvo: 'vigas_laje' }))
            const t0 = performance.now()
            unirAreas(areas)
            tempos.push(performance.now() - t0)
          }
          return Math.round(tempos.sort((a, b) => a - b)[1])
        },
        [quantas, pontos] as [number, number],
      )
    const comum = await medir(4, 80) // dia a dia: 4 áreas de traço curto
    const pesado = await medir(12, 400) // exagero: 12 áreas de traço longo, todas encadeadas
    console.log(`DESEMPENHO uniao CPU4x: comum ${comum} ms, pesado ${pesado} ms`)
    if (PRINTS) (await import('node:fs')).writeFileSync(path.join(PRINTS, 'desempenho_uniao.txt'), `comum ${comum} ms, pesado ${pesado} ms\n`)
    expect(comum).toBeLessThan(50)
    expect(pesado).toBeLessThan(350)
    await contexto.close()
  }, 120_000)
  it('PDF do relatório: uma página com o desenho dos caminhões (áreas unidas e número) antes das tabelas, legenda em linhas', async () => {
    const contexto = await navegador.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true })
    // o Imprimir do navegador não abre no teste: a folha fica na página e é conferida
    await contexto.addInitScript(() => {
      window.print = () => {}
    })
    const p = await contexto.newPage()
    const erros: string[] = []
    p.on('pageerror', (e: Error) => erros.push(e.message))
    await p.goto(url)
    await clicar(p, /Pavimento pequeno/)
    // a concretagem de exemplo da bancada é sempre de ontem (dev/concreto.tsx)
    const ontem = new Date()
    ontem.setDate(ontem.getDate() - 1)
    const dd = (n: number) => String(n).padStart(2, '0')
    await clicar(p, new RegExp(`${dd(ontem.getDate())}/${dd(ontem.getMonth() + 1)}/${ontem.getFullYear()}`))
    await clicar(p, 'Desenhar na planta')
    await p.getByTestId('mapa').waitFor()
    const cdp = await contexto.newCDPSession(p)
    const pecas = async (n: number) =>
      p.waitForFunction((k: number) => document.querySelectorAll('[data-testid=pecas-caminhao] li').length === k, n, { timeout: 8000 })
    // caminhão 1: pilares P1 e P2 inteiros e parte do P3 (duas áreas separadas); caminhão 2: vigas e lajes
    await p.getByTestId('chip-1').click()
    await p.getByTestId('caneta-pilares').click()
    await tracarComCaneta(p, cdp, [[80, 80], [480, 80], [480, 160], [80, 160], [80, 80]])
    await pecas(2)
    await tracarComCaneta(p, cdp, [[700, 80], [760, 80], [760, 160], [700, 160], [700, 80]])
    await pecas(3)
    await p.getByTestId('chip-2').click()
    await p.getByTestId('caneta-vigas_laje').click()
    await tracarComCaneta(p, cdp, [[100, 100], [600, 100], [600, 300], [100, 300], [100, 100]])
    await p.getByTestId('toast').filter({ hasText: 'também entrou' }).waitFor()
    await p.goBack()
    await clicar(p, 'Relatório de peças')
    await p.getByTestId('relatorio-caminhao').waitFor()

    for (const [w, h] of [[375, 812], [768, 1024]]) {
      await p.setViewportSize({ width: w, height: h })
      await p.getByTestId('concreto-pdf-relatorio').click()
      await p.getByTestId('pdf-desenho').waitFor({ state: 'attached' })
      const f = await p.evaluate(() => {
        const folha = document.querySelector('.so-folha-pdf')!
        const desenho = folha.querySelector('[data-testid=pdf-desenho]')!
        return {
          paginasDeDesenho: folha.querySelectorAll('[data-testid=pdf-desenho]').length,
          // a página do desenho vem antes das tabelas
          antesDasTabelas: !!(desenho.compareDocumentPosition(folha.querySelector('.sf-tabela')!) & Node.DOCUMENT_POSITION_FOLLOWING),
          numeros: [...desenho.querySelectorAll('svg circle + text')].map((t) => t.textContent).sort(),
          contornos: desenho.querySelectorAll('svg path[fill=none]').length,
          legenda: [...desenho.querySelectorAll('.cc-pdf-legenda li')].map((li) => li.textContent),
          titulo: desenho.querySelector('.sf-titulo')!.textContent,
          nota: [...folha.querySelectorAll('.sf-secao .sf-nota')].map((n) => n.textContent)[0] ?? '',
          tabelas: folha.querySelectorAll('.sf-tabela').length,
        }
      })
      expect(f.paginasDeDesenho).toBe(1)
      expect(f.antesDasTabelas).toBe(true)
      // caminhão 1 tem dois desenhos separados (um número em cada); o 2, um; o 3 não desenhou
      expect(f.numeros).toEqual(['1', '1', '2'])
      expect(f.contornos).toBe(3)
      expect(f.legenda).toEqual(['1Caminhão 1 · NF 184201 · 8,5 m³', '2Caminhão 2 · NF 184202 · 8,5 m³'])
      expect(f.titulo).toBe('Concreto · Onde foi cada caminhão')
      expect(f.tabelas).toBe(2)
      // legenda das tabelas: uma frase por linha
      expect(f.nota.split('\n').length).toBeGreaterThanOrEqual(2)
      expect(f.nota).toContain('Percentual ao lado da peça')
      if (PRINTS && w === 768) {
        await p.emulateMedia({ media: 'print' })
        await p.screenshot({ path: path.join(PRINTS, 'concreto_pdf_relatorio_desenho.png'), fullPage: true })
        await p.pdf({ path: path.join(PRINTS, 'concreto_relatorio_com_desenho.pdf'), preferCSSPageSize: true, printBackground: true })
        await p.emulateMedia({ media: null })
      }
      // de volta ao app: a folha sai
      await p.keyboard.press('Shift')
      await p.waitForFunction(() => !document.querySelector('.so-folha-pdf'))
    }
    expect(erros).toEqual([])
    await contexto.close()
  }, 120_000)
  it('laje da FVS: a área de laje desenhada na FVS aparece no relatório do caminhão que desenhou em cima (celular e tablet)', async () => {
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true })
    const p = await contexto.newPage()
    const erros: string[] = []
    p.on('pageerror', (e: Error) => erros.push(e.message))
    p.on('dialog', (d: any) => d.accept())
    await p.goto(url)
    await clicar(p, /Pavimento em 2 trechos/)
    await clicar(p, '+ Nova concretagem')
    await p.getByLabel('Local').fill('Trecho 1 · Laje da FVS')
    await p.getByLabel('fck (MPa)').fill('35')
    await clicar(p, 'Salvar concretagem')
    await clicar(p, '+ Caminhão')
    await p.getByLabel('Nota fiscal').fill('700077')
    await clicar(p, /^Salvar$/)
    await clicar(p, 'Desenhar onde foi')
    await p.getByTestId('laje').waitFor()
    await p.getByTestId('caneta-vigas_laje').click()
    const cdp = await contexto.newCDPSession(p)
    await tracarComCaneta(p, cdp, [[130, 95], [430, 95], [430, 145], [130, 145], [130, 95]])
    await p.getByTestId('toast').filter({ hasText: 'também entrou' }).waitFor()

    // A FVS desenhou duas áreas de laje na mesma planta: uma debaixo da área do caminhão (metade
    // coberta) e outra longe. Entram direto no banco do aparelho, como se a FVS tivesse gravado.
    await p.evaluate(
      () =>
        new Promise<void>((ok, falha) => {
          const r = indexedDB.open('sistema-obra')
          r.onerror = () => falha(r.error)
          r.onsuccess = () => {
            const loja = r.result.transaction('registros', 'readwrite').objectStore('registros')
            const q = loja.getAll()
            q.onsuccess = () => {
              const area = q.result.filter((x: { tabela: string }) => x.tabela === 'caminhao_areas').pop()
              const ref = String(area.linha.planta_ref)
              const setor = ref.includes('@') ? ref.slice(0, ref.lastIndexOf('@')) : ref
              const nova = (id: string, nome: string, contorno: number[][]) => ({
                tabela: 'fvs_areas',
                id,
                obra_id: area.obra_id,
                pendente: 0,
                linha: {
                  id,
                  area_id: id,
                  obra_id: area.obra_id,
                  pavimento_id: null,
                  setor_id: setor,
                  planta_id: null,
                  nome,
                  ficha_id: 'f0000000-0000-0000-0000-0000000000b1',
                  codigo_ficha: null,
                  contorno,
                  cancelada: false,
                  usuario_id: area.linha.usuario_id,
                  dispositivo_id: area.linha.dispositivo_id,
                  criado_em_dispositivo: '2026-11-20T08:00:00.000Z',
                  apagado: false,
                },
              })
              // metade dentro da área do caminhão (x de 130 a 430): de 280 a 580 ficam 150 de 300 (o traço da caneta não é exato)
              loja.put(nova('e0000000-0000-0000-0000-0000000000b1', 'Laje A da FVS', [[280, 100], [580, 100], [580, 140], [280, 140]]))
              loja.put(nova('e0000000-0000-0000-0000-0000000000b2', 'Laje B da FVS', [[900, 600], [1000, 600], [1000, 700], [900, 700]]))
              loja.transaction.oncomplete = () => {
                r.result.close()
                ok()
              }
            }
          }
        }),
    )
    await p.reload()
    await clicar(p, /Pavimento em 2 trechos/)
    await clicar(p, /Trecho 1 · Laje da FVS/)
    await clicar(p, 'Relatório de peças')
    const rel = await p.getByTestId('relatorio-caminhao').innerText()
    expect(rel).toContain('V1')
    expect(rel).toMatch(/Laje A da FVS \((4[5-9]|5[0-5])%\)/)
    expect(rel).not.toContain('Laje B da FVS')
    await capturar(p, 'tablet_relatorio_laje_fvs')
    await p.getByRole('tab', { name: 'Por peça' }).click()
    expect(await p.getByTestId('relatorio-peca').innerText()).toMatch(/Laje A da FVS\s+1 \(NF 700077, (4[5-9]|5[0-5])%\)/)

    // celular em pé: a tabela não rola de lado
    await p.setViewportSize({ width: 375, height: 740 })
    await p.getByRole('tab', { name: 'Por caminhão' }).click()
    await p.getByTestId('relatorio-caminhao').waitFor()
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    expect(await p.getByTestId('relatorio-caminhao').innerText()).toContain('Laje A da FVS')
    await capturar(p, 'celular_relatorio_laje_fvs')
    expect(erros).toEqual([])
    await contexto.close()
  }, 90_000)

  it('obra de verdade: o mapa abre a prancha que a FVS guardou no aparelho', async () => {
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true })
    const p = await contexto.newPage()
    const erros: string[] = []
    p.on('pageerror', (e: Error) => erros.push(e.message))

    // a bancada da FVS guarda os pacotes de teste neste navegador, como o botão "Baixar" do módulo
    await p.goto(url.replace('dev/concreto.html', 'dev/fvs.html'))
    await p.getByText('Pavimento de teste').first().waitFor({ timeout: 60_000 })

    // mesma obra, sem ser a TESTE: sem a fonte da FVS, aqui apareceria "ainda não tem planta"
    await p.goto(`${url}?obra=b0000000-0000-0000-0000-0000000000bb`)
    await clicar(p, /Pavimento de teste/)
    await clicar(p, 'Mapa do pavimento')
    await p.locator('[data-testid=mapa] canvas.leaflet-zoom-animated').first().waitFor()
    expect(await p.locator('body').innerText()).not.toContain('ainda não tem planta')

    // o fundo é a imagem da prancha, tirada do pacote guardado no aparelho
    await p.waitForFunction(() => {
      const imgs = [...document.querySelectorAll<HTMLImageElement>('[data-testid=mapa] .leaflet-tile')]
      return imgs.length > 0 && imgs.some((i) => i.src.startsWith('blob:') && i.complete && i.naturalWidth === 512)
    })
    // só a planta de forma: a de ambientes da FVS não é para desenhar concretagem
    expect(await p.getByTestId('trecho').count()).toBe(0)
    await capturar(p, 'tablet_prancha_da_fvs')

    // o desenho conta as peças do pacote, com o id de "elementos" (P1 em x 150, y 150 na planta de teste)
    await clicar(p, 'Voltar')
    await clicar(p, '+ Nova concretagem')
    await p.getByLabel('Local').fill('Trecho 1')
    await p.getByLabel('fck (MPa)').fill('35')
    await clicar(p, 'Salvar concretagem')
    await clicar(p, '+ Caminhão')
    await p.getByLabel('Nota fiscal').fill('400001')
    await clicar(p, /^Salvar$/)
    await clicar(p, 'Desenhar onde foi')
    await p.locator('[data-testid=mapa] canvas.leaflet-zoom-animated').first().waitFor()
    const cdp = await contexto.newCDPSession(p)
    // laço menor que o padrão: nesta planta a viga começa colada no pilar (10 px, não 22)
    await tracarComCaneta(p, cdp, laco([150, 150], 30))
    await p.getByTestId('toast').filter({ hasText: 'peça entrou no caminhão 1' }).waitFor()
    expect(await pecasDoPainel(p)).toEqual(['P1 100%'])
    const area = await p.evaluate(`(async () => {
      const { sincronizador } = await import('/src/nucleo/servicos.ts')
      const [a] = await sincronizador.linhas('caminhao_areas', 'b0000000-0000-0000-0000-0000000000bb')
      return a.planta_ref
    })()`)
    // planta_ref = trecho da planta (setor) + revisão da prancha
    expect(area).toBe('a1000000-0000-0000-0000-0000000000f1@R00')
    expect(erros).toEqual([])
    await contexto.close()
  }, 120_000)

  it('obra de verdade: área gravada com o id da linha de "plantas" aparece na planta do trecho (o S23 de 22/11; celular e tablet)', async () => {
    const OBRA_BB = 'b0000000-0000-0000-0000-0000000000bb'
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true })
    const p = await contexto.newPage()
    const erros: string[] = []
    p.on('pageerror', (e: Error) => erros.push(e.message))
    await p.goto(url.replace('dev/concreto.html', 'dev/fvs.html'))
    await p.getByText('Pavimento de teste').first().waitFor({ timeout: 60_000 })
    await p.goto(`${url}?obra=${OBRA_BB}`)
    await clicar(p, /Pavimento de teste/)
    await clicar(p, '+ Nova concretagem')
    await p.getByLabel('Local').fill('Laje pela linha de plantas')
    await p.getByLabel('fck (MPa)').fill('35')
    await clicar(p, 'Salvar concretagem')
    await clicar(p, '+ Caminhão')
    await p.getByLabel('Nota fiscal').fill('560001')
    await clicar(p, /^Salvar$/)
    await p.getByRole('button', { name: 'Desenhar onde foi' }).waitFor()
    // como a carga das áreas da obra: planta_ref com o id da LINHA de "plantas" (não o do trecho)
    const ref = await p.evaluate(`(async () => {
      const { sincronizador } = await import('/src/nucleo/servicos.ts')
      const plantas = await sincronizador.linhas('plantas', '${OBRA_BB}')
      const pl = plantas.find((x) => x.setor_id === 'a1000000-0000-0000-0000-0000000000f1')
      const cams = await sincronizador.linhas('caminhoes', '${OBRA_BB}')
      const k = cams.find((x) => x.nota_fiscal === '560001')
      const contorno = [[130, 95], [430, 95], [430, 145], [130, 145]]
      await sincronizador.registrar('caminhao_areas', '${OBRA_BB}', 'a0000000-0000-0000-0000-00000000000a', { caminhao_id: k.id, planta_ref: pl.id + '@' + pl.revisao, contorno, alvo: 'vigas_laje', substitui_id: null, cancelado: false })
      return pl.id + '@' + pl.revisao
    })()`)
    expect(String(ref)).not.toMatch(/^a1000000-0000-0000-0000-0000000000f1@/)
    // abre de novo, como o aparelho depois de sincronizar
    await p.goto(`${url}?obra=${OBRA_BB}`)
    await clicar(p, /Pavimento de teste/)
    await clicar(p, /Laje pela linha de plantas/)
    await clicar(p, /NF 560001/)
    await clicar(p, 'Desenhar onde foi')
    await p.locator('[data-testid=mapa] canvas.leaflet-zoom-animated').first().waitFor()
    // áreas desenhadas no mapa (as peças são outras camadas: tocáveis)
    const areasNoMapa = () =>
      p.evaluate(() => {
        const m = (document.querySelector('.cc-mapa') as HTMLElement & { __mapa: any }).__mapa
        let n = 0
        m.eachLayer((l: any) => {
          if (l.getLatLngs && l.options?.interactive === false && l.options?.fillOpacity >= 0.35) n++
        })
        return n
      })
    for (const largura of [1280, 375]) {
      await p.setViewportSize({ width: largura, height: largura === 375 ? 812 : 800 })
      await p.getByTestId('laje-desenhada').waitFor()
      expect(await p.getByTestId('laje-desenhada').innerText()).toMatch(/Laje concretada: 1 área desenhada nesta planta/)
      expect(await p.getByText('1 área nesta planta').count()).toBe(1)
      expect(await areasNoMapa()).toBe(1)
      expect(await p.getByTestId('aviso-sem-planta').count()).toBe(0)
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      await capturar(p, `laje_pela_linha_de_plantas_${largura}`)
    }
    expect(erros).toEqual([])
    await contexto.close()
  }, 120_000)

  it('fundações: estaca e bloco ligados à mão aparecem no caminhão, no mapa e no relatório, sem desenho (celular e tablet)', async () => {
    const OBRA_BB = 'b0000000-0000-0000-0000-0000000000bb'
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true })
    const p = await contexto.newPage()
    const erros: string[] = []
    p.on('pageerror', (e: Error) => erros.push(e.message))
    // a bancada da FVS semeia a estaca E-P1.A e o bloco BL-P1 (sem geometria) no Pavimento de teste
    await p.goto(url.replace('dev/concreto.html', 'dev/fvs.html'))
    await p.getByText('Pavimento de teste').first().waitFor({ timeout: 60_000 })
    expect(await p.locator('body').innerText()).not.toMatch(/E-P1\.A|BL-P1/)
    await p.goto(`${url}?obra=${OBRA_BB}`)
    await clicar(p, /Pavimento de teste/)
    await clicar(p, '+ Nova concretagem')
    await p.getByLabel('Local').fill('Fundação bloco 1')
    await p.getByLabel('fck (MPa)').fill('30')
    await clicar(p, 'Salvar concretagem')
    await clicar(p, '+ Caminhão')
    await p.getByLabel('Nota fiscal').fill('870001')
    await clicar(p, /^Salvar$/)
    await p.getByRole('button', { name: 'Desenhar onde foi' }).waitFor()
    // como a carga das fundações: ligação à mão (origem manual), sem área desenhada
    await p.evaluate(`(async () => {
      const { sincronizador } = await import('/src/nucleo/servicos.ts')
      const k = (await sincronizador.linhas('caminhoes', '${OBRA_BB}')).find((x) => x.nota_fiscal === '870001')
      for (const el of ['e9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000002'])
        await sincronizador.registrar('caminhao_elementos', '${OBRA_BB}', 'a0000000-0000-0000-0000-00000000000a', { caminhao_id: k.id, elemento_id: el, origem: 'manual', fracao: null, incluido: true })
    })()`)
    for (const largura of [375, 1280]) {
      await p.setViewportSize({ width: largura, height: largura === 375 ? 812 : 800 })
      await p.goto(`${url}?obra=${OBRA_BB}`)
      await clicar(p, /Pavimento de teste/)
      await clicar(p, /Fundação bloco 1/)
      await clicar(p, /NF 870001/)
      const tela = await p.locator('body').innerText()
      expect(tela).toContain('Estaca E-P1.A')
      expect(tela).toContain('Bloco BL-P1')
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      await capturar(p, `fundacoes_caminhao_${largura}`)
      // no mapa: a planta abre normal e as duas peças estão na lista do caminhão, sem área
      await clicar(p, 'Desenhar onde foi')
      await p.locator('[data-testid=mapa] canvas.leaflet-zoom-animated').first().waitFor()
      expect(await p.locator('body').innerText()).not.toContain('ainda não tem planta')
      const lista = await pecasDoPainel(p)
      expect(lista.some((t: string) => t.startsWith('Estaca E-P1.A'))).toBe(true)
      expect(lista.some((t: string) => t.startsWith('Bloco BL-P1'))).toBe(true)
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      await capturar(p, `fundacoes_mapa_${largura}`)
    }
    // relatório de peças do lote
    await p.goto(`${url}?obra=${OBRA_BB}`)
    await clicar(p, /Pavimento de teste/)
    await clicar(p, /Fundação bloco 1/)
    await clicar(p, 'Relatório de peças')
    const rel = await p.getByTestId('relatorio-caminhao').innerText()
    expect(rel).toContain('Estaca E-P1.A')
    expect(rel).toContain('Bloco BL-P1')
    expect(erros).toEqual([])
    await contexto.close()
  }, 150_000)

  it('concretagem de exemplo: EXEMPLO na lista, no título, no aviso e na ficha de concreto (celular e tablet)', async () => {
    for (const largura of [375, 1280]) {
      const contexto = await navegador.newContext({ viewport: { width: largura, height: 812 }, hasTouch: true })
      const p = await contexto.newPage()
      await p.goto(`${url}?exemplo=1`)
      await clicar(p, /Pavimento pequeno/)
      await p.getByTestId('tabela-concretagens').locator('tbody tr').filter({ hasText: 'EXEMPLO · Trecho 2 · Vigas' }).first().waitFor()
      await capturar(p, `exemplo_${largura}_pavimento`)
      await clicar(p, /EXEMPLO · Trecho 2 · Vigas/)
      await expect.poll(() => p.locator('.aviso').filter({ hasText: 'Não é concretagem real da obra' }).count()).toBe(1)
      await capturar(p, `exemplo_${largura}_concretagem`)
      await clicar(p, 'Ficha de concreto do dia')
      const obs = await p.locator('[data-testid=ficha-concreto] tbody tr td:last-child').allTextContents()
      expect(obs.length).toBe(3)
      expect(obs.every((t: string) => t.startsWith('EXEMPLO'))).toBe(true)
      expect(await p.locator('.aviso').filter({ hasText: 'EXEMPLO' }).count()).toBe(1)
      expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(largura)
      await capturar(p, `exemplo_${largura}_ficha`)
      await contexto.close()
    }
  }, 90_000)

  it('engenheiro novo (rodada de 09/11): local obrigatório, "Salvar e próximo" não perde o que já foi digitado, "Tirar" inteiro', async () => {
    for (const largura of [375, 1280]) {
      const contexto = await navegador.newContext({ viewport: { width: largura, height: 812 }, hasTouch: true })
      const p = await contexto.newPage()
      await p.goto(url)
      // pavimento sem concretagem: uma linha curta (guia de estilo, 23/11/2026)
      await clicar(p, /Pavimento grande/)
      expect(await p.getByTestId('pavimento-vazio').innerText()).toBe('Sem concretagens')
      await p.getByRole('button', { name: /Voltar/ }).first().click()
      await clicar(p, /Pavimento pequeno/)
      await clicar(p, '+ Nova concretagem')
      // sem local não salva: antes ficava "sem local" nas listas e no mapa
      await clicar(p, 'Salvar concretagem')
      await p.getByText('Informe o local').waitFor()
      await p.getByLabel('Local').fill('Térreo · Trecho 1 · Pilares')
      await clicar(p, 'Salvar concretagem')
      await clicar(p, '+ Caminhão')
      await p.getByLabel('Nota fiscal').fill('900301')
      await p.getByLabel('Volume (m³)').fill('8')
      await clicar(p, 'Salvar e próximo caminhão')
      // digita o próximo logo depois do toque, sem esperar a gravação do anterior
      await p.getByLabel('Nota fiscal').fill('900302')
      await p.getByLabel('Slump medido (cm)').fill('11')
      await p.getByText('Caminhão 1 salvo.').waitFor()
      await p.waitForTimeout(300)
      expect(await p.getByLabel('Nota fiscal').inputValue()).toBe('900302')
      expect(await p.getByLabel('Slump medido (cm)').inputValue()).toBe('11')
      expect(await p.getByLabel('Sequência').inputValue()).toBe('2')
      // horário fora de ordem (varredura de 12/11): início antes da chegada vira aviso, sem impedir salvar
      await p.getByLabel('Chegada na obra').fill('08:00')
      await p.getByLabel('Início da descarga').fill('07:50')
      await p.getByText('Início da descarga (07:50) antes da chegada na obra (08:00). Confira.').waitFor()
      await p.getByLabel('Início da descarga').fill('08:05')
      expect(await p.getByText(/antes da chegada na obra/).count()).toBe(0)
      await clicar(p, /^Salvar$/)
      await p.locator('main h1').filter({ hasText: 'Caminhão 2 · NF 900302' }).waitFor()
      // laje no caminhão pelo mapa e, de volta, o botão "Tirar" numa linha só
      await clicar(p, 'Desenhar onde foi')
      await p.locator('[data-testid=mapa] canvas.leaflet-zoom-animated').first().waitFor()
      // o botão da laje do trecho (não a caneta "Lajes", desde 26/11)
      await p.getByTestId('laje').click()
      await p.getByTestId('toast').filter({ hasText: 'entrou' }).waitFor()
      await clicar(p, 'Ver caminhão e CPs')
      const tirar = p.locator('.cc-pecas li button').first()
      await tirar.waitFor()
      const alturas = await tirar.evaluate((b: HTMLElement) => {
        const r = document.createRange()
        r.selectNodeContents(b)
        return new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size
      })
      expect(alturas, `${largura}: "Tirar" quebrou em mais de uma linha`).toBe(1)
      await capturar(p, `engenheiro_${largura}_caminhao`)
      await contexto.close()
    }
  }, 90_000)

  it('laudo: os CPs de uma idade de todos os caminhões de uma vez, com exemplar e fck (celular e tablet)', async () => {
    for (const largura of [375, 1280]) {
      const contexto = await navegador.newContext({ viewport: { width: largura, height: 812 }, hasTouch: true })
      const p = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(url)
      await clicar(p, /Pavimento pequeno/)
      await clicar(p, /Trecho 2 · Vigas/)
      await clicar(p, 'Lançar laudo')
      await p.getByTestId('laudo').waitFor()
      // 3 caminhões, 2 caixas cada (CPs por idade); Enter passa para a próxima caixa
      expect(await p.locator('[data-testid=laudo] input').count()).toBe(6)
      await p.getByLabel('Caminhão 1, CP1, MPa').fill('30')
      await p.keyboard.press('Enter')
      await p.keyboard.type('32,4')
      await p.getByLabel('Caminhão 2, CP1, MPa').fill('28')
      expect(await p.getByTestId('laudo-exemplar-1').innerText()).toBe('32,4')
      // trocar de idade com valor não salvo pergunta antes (e aqui a pessoa desiste)
      p.once('dialog', (d: any) => d.dismiss())
      await p.getByTestId('laudo-idades').getByRole('tab', { name: '28 dias' }).click()
      expect(await p.getByLabel('Caminhão 1, CP1, MPa').inputValue()).toBe('30')
      expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(largura)
      await capturar(p, `laudo_${largura}`)
      await clicar(p, 'Salvar laudo de 7 dias')
      await p.getByRole('button', { name: 'Lançar laudo' }).waitFor()
      await p.locator('.cc-linha').filter({ hasText: 'NF 184201' }).click()
      await p.getByText('CP2: 32,4 MPa').waitFor()
      await p.getByRole('button', { name: /Voltar/ }).first().click()
      // de volta ao laudo: abre com o que já está lançado; na idade de controle, abaixo do fck fica marcado
      await clicar(p, 'Lançar laudo')
      expect(await p.getByLabel('Caminhão 1, CP1, MPa').inputValue()).toBe('30')
      await p.getByTestId('laudo-idades').getByRole('tab', { name: '28 dias' }).click()
      await p.getByLabel('Caminhão 3, CP1, MPa').fill('38')
      expect(await p.getByTestId('laudo-exemplar-3').innerText()).toContain('abaixo do fck')
      await clicar(p, 'Salvar laudo de 28 dias')
      await p.getByRole('button', { name: 'Lançar laudo' }).waitFor()
      expect(erros).toEqual([])
      await contexto.close()
    }
  }, 120_000)

  it('laudo: anexa o PDF do laboratório, recusa o que não é PDF nem foto e abre o anexado depois (celular e tablet)', async () => {
    const pdf = { name: 'laudo-7-dias.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') }
    const svg = { name: 'laudo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') }
    for (const largura of [375, 1280]) {
      const contexto = await navegador.newContext({ viewport: { width: largura, height: 812 }, hasTouch: true })
      const p = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(url)
      await clicar(p, /Pavimento pequeno/)
      await clicar(p, /Trecho 2 · Vigas/)
      await clicar(p, 'Lançar laudo')
      await p.getByTestId('laudo').waitFor()
      // SVG pode levar script: fica de fora, com a mensagem no campo
      await p.getByTestId('laudo-arquivo').setInputFiles(svg)
      await p.getByTestId('laudo-arquivo-erro').filter({ hasText: 'Só PDF ou foto' }).waitFor()
      await p.getByTestId('laudo-arquivo').setInputFiles(pdf)
      expect(await p.getByTestId('laudo-arquivo-erro').count()).toBe(0)
      await p.getByText('Vai junto ao salvar: laudo-7-dias.pdf').waitFor()
      await p.getByLabel('Caminhão 1, CP1, MPa').fill('30')
      await p.getByLabel('Caminhão 2, CP1, MPa').fill('29')
      expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(largura)
      await capturar(p, `laudo_pdf_${largura}`)
      await clicar(p, 'Salvar laudo de 7 dias')
      await p.getByRole('button', { name: 'Lançar laudo' }).waitFor()
      // de volta ao laudo: o PDF está anexado e abre
      await clicar(p, 'Lançar laudo')
      const anexo = p.getByTestId('laudo-anexo')
      await anexo.waitFor()
      expect(await anexo.innerText()).toBe('Abrir o laudo anexado (PDF)')
      expect(await anexo.getAttribute('href')).toMatch(/^blob:/)
      // a outra idade não tem laudo anexado
      await p.getByTestId('laudo-idades').getByRole('tab', { name: '28 dias' }).click()
      expect(await p.getByTestId('laudo-anexo').count()).toBe(0)
      await capturar(p, `laudo_pdf_anexado_${largura}`)
      expect(erros).toEqual([])
      await contexto.close()
    }
  }, 120_000)

  it('data do ensaio no futuro ou antes da moldagem: recusada com mensagem no campo (celular e tablet)', async () => {
    // achado do teste da obra de demonstração (13/11): aceitou ensaio em 20/11
    const d = new Date()
    d.setDate(d.getDate() + 7)
    const futuro = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    for (const largura of [375, 1280]) {
      const contexto = await navegador.newContext({ viewport: { width: largura, height: 812 }, hasTouch: true })
      const p = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(url)
      await clicar(p, /Pavimento pequeno/)
      await clicar(p, /Trecho 2 · Vigas/)
      // laudo: não grava e diz por quê
      await clicar(p, 'Lançar laudo')
      await p.getByTestId('laudo-data').fill(futuro)
      await p.getByLabel('Caminhão 1, CP1, MPa').fill('30')
      await clicar(p, 'Salvar laudo de 7 dias')
      await p.getByText(/A data do ensaio \(.*\) está no futuro\. Hoje é/).waitFor()
      expect(await p.getByTestId('laudo').count()).toBe(1)
      p.once('dialog', (dlg: any) => dlg.accept())
      await p.getByRole('button', { name: /Voltar/ }).first().click()
      // resultado avulso na tela do caminhão: mensagem embaixo do campo de data
      await p.locator('.cc-linha').filter({ hasText: 'NF 184201' }).click()
      await clicar(p, 'Lançar resultado')
      await p.getByLabel(/MPa \(7 dias\)/).fill('31')
      await p.getByLabel('Data do ensaio').fill(futuro)
      await clicar(p, 'Salvar resultado')
      await p.getByTestId('erro-data-ensaio').filter({ hasText: 'está no futuro' }).waitFor()
      expect(await p.getByText('31 MPa').count()).toBe(0)
      await p.getByLabel('Data do ensaio').fill('2000-01-01')
      await clicar(p, 'Salvar resultado')
      await p.getByTestId('erro-data-ensaio').filter({ hasText: 'antes da moldagem' }).waitFor()
      expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(largura)
      await capturar(p, `data_ensaio_${largura}`)
      expect(erros).toEqual([])
      await contexto.close()
    }
  }, 120_000)

  it('FVM: importa a lista de materiais, recebe com NC e com ensaio (retido), gestor libera (celular e tablet)', async () => {
    // lista fictícia (obra EXE), no formato do materiais.json do pacote da obra
    const lista = {
      name: 'materiais.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          materiais: [
            {
              codigo: 'ACO',
              nome: 'Aço CA-50',
              unidade: 't',
              estrutural: true,
              documentos: ['Certificado de qualidade do lote'],
              itens: [
                { codigo: '1', texto: 'Bitola conforme o pedido' },
                { codigo: '2', texto: 'Comprimento da barra (m)', valor: { min: 11.9, max: 12.1 } },
              ],
            },
            { codigo: 'BLOCO', nome: 'Bloco estrutural', unidade: 'un', estrutural: true, exige_ensaio: true, itens: [{ codigo: '1', texto: 'Sem trinca nem quebra' }] },
            { codigo: 'CONC', nome: 'Concreto usinado', unidade: 'm³', via: 'concreto' },
            { codigo: 'RUIM', nome: 'Sem itens' },
          ],
        }),
      ),
    }
    for (const largura of [375, 1280]) {
      const contexto = await navegador.newContext({ viewport: { width: largura, height: 812 }, hasTouch: true, isMobile: largura < 768 })
      const p = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const semRolarDeLado = async (nome: string) => {
        const r = await p.evaluate(() => ({
          largura: document.documentElement.scrollWidth,
          pequenos: [...document.querySelectorAll('button')]
            .filter((b) => b.offsetParent !== null)
            .map((b) => [b.textContent?.trim(), Math.round(b.getBoundingClientRect().height)] as const)
            .filter(([, h]) => h < 44),
        }))
        expect(r.largura, `${nome}: rola de lado`).toBeLessThanOrEqual(largura)
        expect(r.pequenos, `${nome}: botões pequenos`).toEqual([])
        await capturar(p, `fvm_${nome}_${largura}`)
      }
      await p.goto(url)
      await p.getByTestId('abrir-fvm').click()
      await p.getByTestId('importar-materiais').setInputFiles(lista)
      await p.getByTestId('resumo-importacao').filter({ hasText: 'Lista importada: 3 novo(s)' }).waitFor()
      expect(await p.getByTestId('erros-importacao').innerText()).toMatch(/RUIM: sem itens/)
      // a mesma lista de novo não muda nada
      await p.getByTestId('importar-materiais').setInputFiles(lista)
      await p.getByTestId('resumo-importacao').filter({ hasText: 'Nada mudou' }).waitFor()
      await semRolarDeLado('lista')

      // Aço com barra curta: o número medido marca NC sozinho; NC sem observação não grava
      await p.getByTestId('receber-material').click()
      expect(await p.getByTestId('escolher-material').innerText()).toMatch(/Recebido pela concretagem/)
      await clicar(p, /Aço CA-50/)
      await p.getByLabel('Fornecedor').fill('Fornecedor Exemplo')
      await p.getByLabel('Nota fiscal').fill('5501')
      await p.getByLabel('Lote / corrida (obrigatório)').fill('C-778')
      await p.getByLabel('Quantidade (t)').fill('2,5')
      await p.getByTestId('item-1').getByRole('button', { name: 'C', exact: true }).click()
      await p.getByTestId('item-2').getByRole('textbox').fill('11,5')
      expect(await p.getByTestId('item-2').getByRole('button', { name: 'NC' }).getAttribute('aria-pressed')).toBe('true')
      // com NC não existe "Liberado" puro, e a sugestão é devolver
      expect(await p.getByTestId('resultado').getByRole('button', { name: 'Liberado', exact: true }).count()).toBe(0)
      expect(await p.getByTestId('resultado').getByRole('button', { name: 'Devolvido' }).getAttribute('aria-pressed')).toBe('true')
      await semRolarDeLado('ficha_aco')
      await clicar(p, 'Salvar recebimento')
      await p.getByTestId('item-2').getByText('NC: escreva o que estava errado.').waitFor()
      await p.getByLabel('O que estava errado').fill('barras de 11,5 m')
      await p.getByLabel('Motivo e o que fazer com o material').fill('devolvido no caminhão')
      await clicar(p, 'Salvar recebimento')
      await p.getByText('Devolvido', { exact: true }).waitFor()
      await p.getByText('Comprimento da barra (m) — medido 11,5').waitFor()

      // Bloco exige ensaio: só dá para reter ou devolver; fica retido e avisa no início
      await p.getByRole('button', { name: /Voltar/ }).first().click()
      await p.getByTestId('receber-material').click()
      await clicar(p, /Bloco estrutural/)
      await p.getByLabel('Fornecedor').fill('Fornecedor Exemplo')
      await p.getByLabel('Nota fiscal').fill('5502')
      await p.getByLabel('Lote / corrida (obrigatório)').fill('B-12')
      await p.getByLabel('Quantidade (un)').fill('3000')
      await p.getByTestId('item-1').getByRole('button', { name: 'C', exact: true }).click()
      expect(await p.getByTestId('resultado').getByRole('button').allInnerTexts()).toEqual(['Retido — não usar', 'Devolvido'])
      await p.getByLabel('Motivo e o que fazer com o material').fill('aguardar ensaio de compressão')
      await clicar(p, 'Salvar recebimento')
      await p.getByTestId('aviso-retido').waitFor()
      await semRolarDeLado('retido')
      await p.getByRole('button', { name: /Voltar/ }).first().click()
      expect(await p.getByTestId('lista-retidos').innerText()).toMatch(/Bloco estrutural/)
      await p.getByRole('button', { name: /Voltar/ }).first().click()
      expect(await p.getByTestId('fvm-retidos').innerText()).toMatch(/1 material retido — não usar/)
      await semRolarDeLado('inicio')

      // gestor (aqui, admin) tira do retido com motivo
      await p.getByTestId('abrir-fvm').click()
      await p.getByTestId('lista-retidos').getByTestId('recebimento').click()
      await p.getByTestId('decidir-retido').getByRole('button', { name: 'Liberado', exact: true }).click()
      await clicar(p, 'Confirmar')
      await p.getByText('Escreva o motivo').waitFor()
      await p.getByLabel(/Motivo \(ex\.: ensaio aprovado/).fill('ensaio aprovado, laudo 45')
      await clicar(p, 'Confirmar')
      await p.getByTestId('motivo').filter({ hasText: 'ensaio aprovado, laudo 45' }).waitFor()
      expect(await p.getByTestId('aviso-retido').count()).toBe(0)
      await p.getByRole('button', { name: /Voltar/ }).first().click()
      expect(await p.getByTestId('lista-retidos').count()).toBe(0)
      expect(erros).toEqual([])
      await contexto.close()
    }
  }, 180_000)

  it('FVM: quem é de campo recebe, mas não troca a lista nem tira do retido', async () => {
    const contexto = await navegador.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })
    const p = await contexto.newPage()
    await p.goto(`${url}?papel=campo`)
    await p.getByTestId('abrir-fvm').click()
    await p.getByText('Só gestor ou admin troca a lista de materiais.').waitFor()
    expect(await p.getByTestId('importar-materiais').count()).toBe(0)
    await contexto.close()
  }, 60_000)

  it('reportar problema: print, comentário e o que vai junto; guarda no aparelho e baixa o .zip (celular e tablet)', async () => {
    for (const largura of [375, 1280]) {
      const contexto = await navegador.newContext({ viewport: { width: largura, height: 812 }, hasTouch: true, isMobile: largura < 768, acceptDownloads: true })
      const p = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(url)
      await clicar(p, /Pavimento pequeno/)
      // um erro do app antes de reportar: vai junto, sem o e-mail
      await p.evaluate(() => console.error('falhou para fulano@exemplo.com ao abrir'))
      await p.getByTestId('reportar').click()
      const janela = p.getByTestId('janela-reporte')
      await janela.waitFor()
      // sem comentário não guarda
      await p.getByTestId('reporte-baixar').click()
      await janela.getByText('Escreva o que aconteceu.').waitFor()
      await p.getByTestId('reporte-comentario').fill('O mapa ficou preto ao desenhar.')
      await janela.getByRole('button', { name: 'Impede de trabalhar' }).click()
      // um "print" de verdade (PNG feito no navegador)
      const png = await p.evaluate(() => {
        const c = document.createElement('canvas')
        c.width = 2400
        c.height = 1200
        const g = c.getContext('2d')!
        g.fillStyle = '#c62828'
        g.fillRect(0, 0, 2400, 1200)
        return c.toDataURL('image/png').split(',')[1]
      })
      await p.getByTestId('reporte-imagem').setInputFiles({ name: 'print.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
      await p.getByTestId('reporte-minis').locator('img').waitFor()
      // PDF não é imagem
      await p.getByTestId('reporte-imagem').setInputFiles({ name: 'x.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') })
      await janela.getByText('Escolha uma imagem (print ou foto).').waitFor()
      await janela.getByRole('button', { name: /Ver o que vai junto/ }).click()
      const junto = await p.getByTestId('reporte-junto').innerText()
      expect(junto).toMatch(/concreto \/ pavimento/)
      expect(junto).toMatch(/TESTE/)
      const r = await p.evaluate(() => ({
        largura: document.documentElement.scrollWidth,
        pequenos: [...document.querySelectorAll('.rp-janela button')]
          .filter((b) => (b as HTMLElement).offsetParent !== null)
          .map((b) => [b.textContent?.trim(), Math.round(b.getBoundingClientRect().height)] as const)
          .filter(([, h]) => h < 44),
      }))
      expect(r.largura).toBeLessThanOrEqual(largura)
      expect(r.pequenos).toEqual([])
      await capturar(p, `reportar_${largura}`)
      const [baixado] = await Promise.all([p.waitForEvent('download'), p.getByTestId('reporte-baixar').click()])
      expect(baixado.suggestedFilename()).toMatch(/^reporte-\d{4}-\d{2}-\d{2}-\d{4}-\w{4}\.zip$/)
      const zip = readFileSync(await baixado.path())
      if (PRINTS) writeFileSync(path.join(PRINTS, `reporte_${largura}.zip`), zip)
      expect(zip.subarray(0, 2).toString()).toBe('PK')
      const texto = zip.toString('latin1')
      expect(texto).toContain('reporte.txt')
      expect(texto).toContain('imagem-1.jpg')
      expect(zip.toString('utf8')).toContain('O mapa ficou preto ao desenhar.')
      expect(zip.toString('utf8')).toContain('Módulo / tela: concreto / pavimento')
      expect(zip.toString('utf8')).toContain('[console] falhou para [removido] ao abrir')
      expect(zip.toString('utf8')).not.toContain('fulano@')
      await p.getByTestId('reporte-aviso').waitFor()
      expect(await p.getByTestId('reportes-guardados').locator('li').count()).toBe(1)
      // fecha e o reporte continua guardado no aparelho (depois de recarregar a página)
      await janela.getByRole('button', { name: 'Fechar' }).click()
      expect(await p.getByTestId('janela-reporte').count()).toBe(0)
      await p.reload()
      await p.getByTestId('reportar').click()
      await p.getByTestId('reportes-guardados').locator('li').first().waitFor()
      expect(await p.getByTestId('reportes-guardados').locator('li').count()).toBe(1)
      // no mapa o botão não cobre o zoom nem o painel
      await janela.getByRole('button', { name: 'Fechar' }).click()
      await clicar(p, /Pavimento pequeno/)
      await clicar(p, /Trecho 2 · Vigas/)
      await clicar(p, 'Desenhar na planta')
      await p.locator('[data-testid=mapa] canvas.leaflet-zoom-animated').first().waitFor()
      // desde 22/11 o botão fica na barra de cima do mapa: não cobre a planta, o zoom, o painel nem os outros botões da barra
      const sobreposto = await p.evaluate(() => {
        const botao = document.querySelector('.rp-botao')!
        const b = botao.getBoundingClientRect()
        const cobre = (q: DOMRect) => q.width > 0 && !(q.right <= b.left || q.left >= b.right || q.bottom <= b.top || q.top >= b.bottom)
        return {
          naBarra: !!botao.closest('.cc-mapa-topo'),
          naTela: b.width > 0 && b.left >= 0 && b.right <= window.innerWidth && b.top >= 0,
          outros: [...document.querySelectorAll('.cc-zoom button, .cc-painel, .cc-mapa-topo button, [data-testid=mapa]')].filter((e) => e !== botao && cobre(e.getBoundingClientRect())).length,
        }
      })
      expect(sobreposto).toEqual({ naBarra: true, naTela: true, outros: 0 })
      await capturar(p, `reportar_mapa_${largura}`)
      expect(erros).toEqual([])
      await contexto.close()
    }
  }, 180_000)

  it('planilha de controle: escolhe o modelo da obra e baixa a planilha preenchida, um caminhão por linha (celular e tablet)', async () => {
    const { abrirXlsx, texto } = await import('../src/concreto/xlsx')
    for (const largura of [1280, 375]) {
      const contexto = await navegador.newContext({ viewport: { width: largura, height: 800 }, hasTouch: true, acceptDownloads: true })
      const p = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(url)
      await clicar(p, /Pavimento em 2 trechos/)
      await clicar(p, '+ Nova concretagem')
      await p.getByLabel('Local').fill('Trecho 1 · planilha')
      await p.getByLabel('fck (MPa)').fill('40')
      await clicar(p, 'Salvar concretagem')
      await clicar(p, '+ Caminhão')
      await p.getByLabel('Nota fiscal').fill(`80${largura}`)
      await clicar(p, /^Salvar$/)
      await p.getByText(`80${largura}`).first().waitFor()
      await p.goto(url)

      const secao = p.getByTestId('planilha-controle')
      await secao.scrollIntoViewIfNeeded()
      // o modelo de exemplo (obra EXE) serve de "modelo da obra"
      const [exemplo] = await Promise.all([p.waitForEvent('download'), secao.getByRole('button', { name: 'Baixar modelo de exemplo' }).click()])
      expect(exemplo.suggestedFilename()).toMatch(/\.xlsx$/)
      await p.getByTestId('planilha-modelo').setInputFiles(await exemplo.path())
      const [gerado] = await Promise.all([p.waitForEvent('download'), secao.getByRole('button', { name: 'Gerar planilha' }).click()])
      expect(await p.getByTestId('planilha-mensagem').innerText()).toMatch(/Planilha gerada: \d+ caminh/)
      // com SO_PRINTS, a planilha gerada fica guardada para abrir com outro leitor (openpyxl, Excel)
      if (PRINTS) await gerado.saveAs(path.join(PRINTS, `planilha_gerada_${largura}.xlsx`))
      const a = await abrirXlsx(new Uint8Array(readFileSync(await gerado.path())))
      const aba = texto(a, 'xl/worksheets/sheet2.xml')!
      expect(aba).toContain(`80${largura}`)
      expect(aba).toContain('Trecho 1 · planilha')
      expect(aba).toContain('INFORMAÇÕES A MAIS (SISTEMA OBRA)')
      // a concretagem de exemplo da apresentação não entra
      expect(aba).not.toContain('EXEMPLO-0001')
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      await capturar(p, `planilha_controle_${largura}`)

      // arquivo que não é planilha: mensagem, sem travar
      await p.getByTestId('planilha-modelo').setInputFiles({ name: 'errado.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('não sou planilha') })
      await secao.getByRole('button', { name: 'Gerar planilha' }).click()
      expect(await p.getByTestId('planilha-mensagem').innerText()).toContain('não é um .xlsx')

      // modelo guardado como arquivo da obra (23/11): depois disso, a planilha sai em um clique
      await p.getByTestId('planilha-modelo').setInputFiles(await exemplo.path())
      await secao.getByRole('button', { name: 'Guardar como modelo da obra' }).click()
      expect(await p.getByTestId('planilha-mensagem').innerText()).toContain('Modelo guardado')
      await p.goto(url)
      await p.getByTestId('planilha-modelo-obra').waitFor()
      expect(await p.getByTestId('planilha-modelo').count()).toBe(0)
      const [umClique] = await Promise.all([p.waitForEvent('download'), p.getByTestId('planilha-controle').getByRole('button', { name: 'Gerar planilha' }).click()])
      expect(umClique.suggestedFilename()).toMatch(/^planilha_controle_.*\.xlsx$/)
      expect(texto(await abrirXlsx(new Uint8Array(readFileSync(await umClique.path()))), 'xl/worksheets/sheet2.xml')).toContain(`80${largura}`)
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      await capturar(p, `planilha_um_clique_${largura}`)
      expect(erros).toEqual([])
      await contexto.close()
    }
  }, 150_000)

  it('laudos atrasados por lote: uma linha por concretagem, que abre os caminhões dela (celular e tablet)', async () => {
    for (const largura of [375, 1280]) {
      const contexto = await navegador.newContext({ viewport: { width: largura, height: 800 }, hasTouch: true })
      const p = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(url)
      // concretagem de 40 dias atrás com 2 caminhões e nenhum laudo: 7 e 28 dias atrasados
      const d = new Date()
      d.setDate(d.getDate() - 40)
      const data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const local = `Lote atrasado ${largura}`
      await clicar(p, /Pavimento em 2 trechos/)
      await clicar(p, '+ Nova concretagem')
      await p.getByLabel('Data', { exact: true }).fill(data)
      await p.getByLabel('Local').fill(local)
      await p.getByLabel('fck (MPa)').fill('40')
      await clicar(p, 'Salvar concretagem')
      await clicar(p, '+ Caminhão')
      await p.getByLabel('Nota fiscal').fill(`71${largura}`)
      await clicar(p, 'Salvar e próximo caminhão')
      await p.getByText('Caminhão 1 salvo.').waitFor()
      await p.getByLabel('Nota fiscal').fill(`72${largura}`)
      await clicar(p, /^Salvar$/)
      await p.getByText(`72${largura}`).first().waitFor()
      await p.goto(url)

      const alertas = p.getByTestId('alertas')
      await alertas.scrollIntoViewIfNeeded()
      // o título conta lotes, com os caminhões entre parênteses
      expect(await alertas.locator('h2').innerText()).toMatch(/Laudos que pedem atenção: \d+ lotes? \(\d+ caminh(ão|ões)\)/)
      const lote = alertas.getByTestId('alerta-lote').filter({ hasText: local })
      expect(await lote.count()).toBe(1)
      const texto = await lote.innerText()
      expect(texto).toContain('2 caminhões')
      expect(texto).toMatch(/7 dias: atrasado há 33 dias/)
      expect(texto).toMatch(/28 dias: atrasado há 12 dias/)
      // os caminhões não aparecem na lista até tocar no lote
      expect(await alertas.getByText(`NF 71${largura}`).count()).toBe(0)
      const linha = lote.locator('button[aria-expanded]')
      expect(await linha.getAttribute('aria-expanded')).toBe('false')
      await linha.tap()
      expect(await linha.getAttribute('aria-expanded')).toBe('true')
      const cams = lote.getByTestId('alerta-caminhoes').locator('li')
      expect(await cams.count()).toBe(2)
      expect(await cams.first().innerText()).toContain(`NF 71${largura}`)
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      await capturar(p, `laudos_por_lote_${largura}`)
      // tocar no caminhão abre a tela dele
      await cams.nth(1).locator('button').tap()
      await p.getByText(`72${largura}`).first().waitFor()
      // o pavimento conta lotes com problema, não caminhões
      await p.goto(url)
      expect(await p.getByTestId('tabela-pavimentos').getByRole('row', { name: /Pavimento em 2 trechos/ }).innerText()).toMatch(/\d+ lotes? com problema/)
      expect(erros).toEqual([])
      await contexto.close()
    }
  }, 120_000)

  it('laje desenhada no caminhão: a área de vigas e laje aparece como laje concretada no painel e no relatório (tablet e celular)', async () => {
    // campo não cria a laje do trecho: a laje que conta é a área desenhada (como na obra, onde a forma não traz a laje)
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true })
    const p = await contexto.newPage()
    const erros: string[] = []
    p.on('pageerror', (e: Error) => erros.push(e.message))
    await p.goto(`${url}?papel=campo`)
    await clicar(p, /Pavimento em 2 trechos/)
    await clicar(p, '+ Nova concretagem')
    await p.getByLabel('Local').fill('Trecho 1 · laje desenhada')
    await p.getByLabel('fck (MPa)').fill('35')
    await clicar(p, 'Salvar concretagem')
    await clicar(p, '+ Caminhão')
    await p.getByLabel('Nota fiscal').fill('730001')
    await clicar(p, /^Salvar$/)
    await clicar(p, 'Desenhar onde foi')
    await p.getByTestId('caneta-vigas_laje').click()
    const cdp = await contexto.newCDPSession(p)
    // antes de desenhar: nada de laje
    expect(await p.getByTestId('laje-desenhada').count()).toBe(0)
    await tracarComCaneta(p, cdp, [[130, 95], [430, 95], [430, 145], [130, 145], [130, 95]])
    await p.getByTestId('toast').filter({ hasText: 'peça entrou no caminhão 1' }).waitFor()
    expect(await p.getByTestId('laje-desenhada').innerText()).toMatch(/Laje concretada: 1 área desenhada nesta planta/)
    // a legenda do mapa sem caminhão explica a área cheia
    await capturar(p, 'laje_desenhada_1280')
    for (const largura of [375, 1280]) {
      await p.setViewportSize({ width: largura, height: 800 })
      expect(await p.getByTestId('laje-desenhada').isVisible()).toBe(true)
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    }
    await capturar(p, 'laje_desenhada_painel_1280')
    // relatório: a laje entra como peça do caminhão
    await p.setViewportSize({ width: 375, height: 800 })
    await p.goto(`${url}?papel=campo`)
    await clicar(p, /Pavimento em 2 trechos/)
    await clicar(p, /Trecho 1 · laje desenhada/)
    await clicar(p, 'Relatório de peças')
    const rel = await p.getByTestId('relatorio-caminhao').innerText()
    expect(rel).toContain('Laje (área desenhada)')
    expect(rel).toContain('V1')
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    await capturar(p, 'laje_desenhada_relatorio_375')
    expect(erros).toEqual([])
    await contexto.close()
  }, 90_000)

  it('celular em pé: nenhuma tela rola de lado e os botões têm pelo menos 44 px', async () => {
    const contexto = await navegador.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    const p = await contexto.newPage()
    await p.goto(url)
    const conferir = async (nome: string) => {
      await p.waitForTimeout(300)
      const r = await p.evaluate(() => {
        const largura = document.documentElement.scrollWidth
        const pequenos = [...document.querySelectorAll('button')]
          .filter((b) => b.offsetParent !== null && !b.closest('.cc-tabela, .cc-ficha'))
          .map((b) => [b.textContent?.trim(), Math.round(b.getBoundingClientRect().height)] as const)
          .filter(([, h]) => h < 44)
        return { largura, pequenos }
      })
      expect(r.largura, `${nome}: rola de lado`).toBeLessThanOrEqual(375)
      expect(r.pequenos, `${nome}: botões pequenos`).toEqual([])
      await capturar(p, `celular_${nome}`)
    }
    await conferir('inicio')
    await clicar(p, /Pavimento pequeno/)
    await conferir('pavimento')
    await clicar(p, /Trecho 2 · Vigas/)
    await conferir('concretagem')
    // relatório: número de nota não quebra no meio
    await clicar(p, 'Relatório de peças')
    await conferir('relatorio')
    const linhasDaNF = await p.locator('[data-testid=relatorio-caminhao] tbody tr:first-child td:nth-child(2)').evaluate((td: HTMLElement) => {
      const r = document.createRange()
      r.selectNodeContents(td)
      return new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size
    })
    expect(linhasDaNF).toBe(1)
    await p.getByRole('button', { name: 'Voltar' }).click()
    await p.locator('.cc-linha').filter({ hasText: 'NF 184201' }).click()
    await conferir('caminhao')
    await clicar(p, 'Desenhar onde foi')
    await p.locator('[data-testid=mapa] canvas.leaflet-zoom-animated').first().waitFor()
    await conferir('mapa')
    // fila de caminhões: quebra linha em vez de ficar cortada à direita (nada escondido numa rolagem de lado)
    const fila = await p.locator('.cc-chips[aria-label="Caminhões"]').evaluate((f: HTMLElement) => {
      const caixa = f.getBoundingClientRect()
      return {
        escondido: f.scrollWidth - f.clientWidth,
        cortados: [...f.querySelectorAll('button, select')]
          .map((b) => [b.textContent?.trim().slice(0, 20), b.getBoundingClientRect()] as const)
          .filter(([, r]) => r.right > caixa.right + 0.5 || r.bottom > caixa.bottom + 0.5 || r.right > innerWidth)
          .map(([t]) => t),
        n: f.querySelectorAll('button').length,
      }
    })
    expect(fila.n, 'Ver + caminhões').toBeGreaterThan(1)
    expect(fila.escondido, 'fila rola de lado').toBeLessThanOrEqual(0)
    expect(fila.cortados, 'caminhão ou concretagem cortados').toEqual([])
    await contexto.close()
  }, 90_000)

  for (const [aparelho, tela] of [
    ['tablet deitado', { viewport: { width: 1280, height: 800 }, hasTouch: true }],
    ['celular em pé', { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ] as const) {
    it(`${aparelho}: "Agora" põe a hora em 3 horas do caminhão (a saída da usina vem da NF); + e − ampliam o mapa sem desenhar`, async () => {
      const contexto = await navegador.newContext(tela)
      const p = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(url)
      await clicar(p, /Pavimento pequeno/)
      await clicar(p, /Trecho 2 · Vigas/)
      await clicar(p, '+ Caminhão')
      await p.getByLabel('Nota fiscal').fill('800001')

      // um toque em cada "Agora": a hora do relógio, no formato do campo
      const agora = p.getByTestId('agora')
      expect(await agora.count()).toBe(3)
      // a saída da usina não tem "Agora": é a hora da nota fiscal, não a da obra
      expect(await p.locator('label.cc-campo', { hasText: 'Saída da usina' }).getByTestId('agora').count()).toBe(0)
      for (let i = 0; i < 3; i++) {
        await agora.nth(i).tap()
        const caixa = await agora.nth(i).boundingBox()
        expect(caixa.height, 'Agora com pelo menos 48 px').toBeGreaterThanOrEqual(48)
      }
      const relogio = await p.evaluate(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() })
      expect(await p.getByLabel('Saída da usina', { exact: true }).inputValue()).toBe('')
      for (const rotulo of ['Chegada na obra', 'Início da descarga', 'Fim da descarga']) {
        const v: string = await p.getByLabel(rotulo, { exact: true }).inputValue()
        expect(v, rotulo).toMatch(/^\d{2}:\d{2}$/)
        const [h, m] = v.split(':').map(Number)
        expect(Math.abs(h * 60 + m - relogio) % 1439, rotulo).toBeLessThanOrEqual(1)
      }
      // o "Agora" não abre o relógio nem rola a página de lado
      expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(tela.viewport.width)
      await capturar(p, `agora_${tela.viewport.width}`)
      await clicar(p, /^Salvar$/)
      await clicar(p, 'Desenhar onde foi')
      await p.locator('[data-testid=mapa] canvas.leaflet-zoom-animated').first().waitFor()
      const zoom = () => p.evaluate(() => (document.querySelector('.cc-mapa') as HTMLElement & { __mapa: any }).__mapa.getZoom())
      const mais = p.getByTestId('zoom-mais')
      const menos = p.getByTestId('zoom-menos')
      // sem mouse, a barra de cima do mapa (Voltar, título, Desfazer, "!") cabe numa linha: a planta não perde altura
      const barra = await p.evaluate(() => {
        const l = document.querySelector('.cc-mapa-linha')!
        return { altura: l.getBoundingClientRect().height, botao: Math.max(...[...l.children].map((c) => c.getBoundingClientRect().height)) }
      })
      expect(barra.altura, 'barra do mapa numa linha').toBeLessThan(barra.botao * 1.5)
      // os botões estão visíveis, grandes e não ficam por baixo do painel
      for (const b of [mais, menos]) {
        const r = await b.boundingBox()
        expect(r.width).toBeGreaterThanOrEqual(48)
        expect(r.height).toBeGreaterThanOrEqual(48)
        const emCima = await p.evaluate(([x, y]: [number, number]) => document.elementFromPoint(x, y)?.getAttribute('data-testid'), [r.x + r.width / 2, r.y + r.height / 2])
        expect(emCima).toBe(await b.getAttribute('data-testid'))
      }
      const z0 = await zoom()
      await mais.tap()
      await expect.poll(zoom).toBe(z0 + 1)
      await p.waitForTimeout(400)
      // com a caneta escolhida, a ponta da caneta no + amplia e não começa um traço
      const cdp = await contexto.newCDPSession(p)
      const r = await mais.boundingBox()
      for (const type of ['mousePressed', 'mouseReleased'])
        await cdp.send('Input.dispatchMouseEvent', { type, x: r.x + r.width / 2, y: r.y + r.height / 2, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1, pointerType: 'pen' })
      await expect.poll(zoom).toBe(z0 + 2)
      await p.waitForTimeout(400)
      expect(await pecasDoPainel(p)).toEqual([])
      // F1: dois toques rápidos no − (o segundo no meio da animação) reduzem 2 níveis
      await menos.tap()
      await menos.tap()
      await expect.poll(zoom).toBe(z0)
      await p.waitForTimeout(400)
      expect(await zoom()).toBe(z0)
      await capturar(p, `zoom_${tela.viewport.width}`)

      // F3: no limite do zoom o + fica desligado (e com cara de desligado); o − continua
      const maximo = await p.evaluate(() => (document.querySelector('.cc-mapa') as HTMLElement & { __mapa: any }).__mapa.getMaxZoom())
      for (let i = 0; i < 12 && !(await mais.isDisabled()); i++) await mais.tap()
      await expect.poll(zoom).toBe(maximo)
      expect(await mais.isDisabled()).toBe(true)
      expect(await menos.isDisabled()).toBe(false)
      const corDesligado = await mais.evaluate((b: HTMLElement) => getComputedStyle(b).backgroundColor)
      const corLigado = await menos.evaluate((b: HTMLElement) => getComputedStyle(b).backgroundColor)
      expect(corDesligado).not.toBe(corLigado)
      await capturar(p, `zoom_max_${tela.viewport.width}`)
      await menos.tap()
      await expect.poll(() => mais.isDisabled()).toBe(false)

      // o aviso de peças (toast) não fica por cima do + e do − (Testador, 09/11), nem com texto longo
      // (o Desfazer sem área desenhada mostra um aviso; o texto é trocado por um longo, como o do Testador)
      await p.getByTestId('desfazer').tap()
      const aviso = p.getByTestId('toast')
      await aviso.waitFor()
      await aviso.evaluate((e: HTMLElement) => (e.textContent = '50 peças entraram no caminhão 1. A Laje (Planta inteira) também entrou.'))
      const caixaAviso = (await aviso.boundingBox())!
      for (const b of [mais, menos]) {
        const r = (await b.boundingBox())!
        const cruza = caixaAviso.x < r.x + r.width && r.x < caixaAviso.x + caixaAviso.width && caixaAviso.y < r.y + r.height && r.y < caixaAviso.y + caixaAviso.height
        expect(cruza, `aviso por cima do ${await b.getAttribute('data-testid')}`).toBe(false)
      }
      expect(caixaAviso.x + caixaAviso.width).toBeLessThanOrEqual(tela.viewport.width)
      await capturar(p, `aviso_${tela.viewport.width}`)
      expect(erros).toEqual([])
      await contexto.close()
    }, 90_000)
  }
})

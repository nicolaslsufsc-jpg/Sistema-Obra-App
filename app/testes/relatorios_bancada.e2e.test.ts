// Telas do módulo Relatórios no Chrome, pela bancada (app/dev/relatorios.html): sem login nem servidor,
// com caneta de verdade (eventos "pen" do Chrome) e dedo (toque). Roda com SO_E2E=1 (GitHub, junto com
// as outras telas) ou SO_BANCADA=1.
//   No PC do Nicolas: SO_BANCADA=1 SO_PLAYWRIGHT=<pasta>/node_modules/playwright SO_CHROME=chrome npx vitest run testes/relatorios_bancada.e2e.test.ts
// SO_PRINTS=<pasta> salva capturas de tela.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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

async function capturar(p: Page, nome: string, inteira = false) {
  if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `relatorios_${nome}.png`), fullPage: inteira })
}

const porTeste = (p: Page, id: string) => p.locator(`[data-testid="${id}"]`)

/** Ponto da planta (x, y em pixels da planta) → ponto da tela. Usa o mapa exposto na bancada. */
async function naTela(p: Page, x: number, y: number): Promise<[number, number]> {
  return p.evaluate(
    ([px, py]: [number, number]) => {
      const caixa = document.querySelector('.rl-mapa') as HTMLElement & { __mapa: any }
      const q = caixa.__mapa.latLngToContainerPoint([-py, px])
      const r = caixa.getBoundingClientRect()
      return [r.left + q.x, r.top + q.y]
    },
    [x, y],
  )
}

/** Centro do pilar Pn da planta esquemática (grade de `colunas`, vão 320, margem 120). */
function centroPilar(n: number, colunas: number): [number, number] {
  return [120 + ((n - 1) % colunas) * 320, 120 + Math.floor((n - 1) / colunas) * 320]
}

function quadrado([x, y]: [number, number], meio = 60): Array<[number, number]> {
  return [[x - meio, y - meio], [x + meio, y - meio], [x + meio, y + meio], [x - meio, y + meio], [x - meio, y - meio]]
}

async function pontosDoTraco(p: Page, planta: Array<[number, number]>): Promise<Array<[number, number]>> {
  const pts: Array<[number, number]> = []
  for (let i = 0; i < planta.length - 1; i++) {
    const [a, b] = [await naTela(p, ...planta[i]), await naTela(p, ...planta[i + 1])]
    for (let k = 0; k < 10; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / 10, a[1] + ((b[1] - a[1]) * k) / 10])
  }
  pts.push(await naTela(p, ...planta[planta.length - 1]))
  return pts
}

async function tracarComCaneta(p: Page, cdp: any, planta: Array<[number, number]>) {
  const pts = await pontosDoTraco(p, planta)
  const ev = (type: string, [x, y]: [number, number]) =>
    cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen' })
  await ev('mousePressed', pts[0])
  for (const q of pts.slice(1)) await ev('mouseMoved', q)
  await ev('mouseReleased', pts[pts.length - 1])
}

async function tracarComDedo(p: Page, cdp: any, planta: Array<[number, number]>) {
  const pts = await pontosDoTraco(p, planta)
  const toque = ([x, y]: [number, number]) => [{ x, y, id: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: toque(pts[0]) })
  for (const q of pts.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: toque(q) })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

/**
 * Espera o mapa ficar quieto: o mesmo mapa (a tela pode remontá-lo logo depois de abrir, quando a planta
 * e as marcas chegam), sem animação, por meio segundo. Toque antes disso cai no mapa velho e se perde.
 */
async function mapaParado(p: Page) {
  await p.evaluate(async () => {
    const atual = () => (document.querySelector('.rl-mapa') as HTMLElement & { __mapa?: any })?.__mapa
    let anterior = atual()
    let quieto = 0
    for (let i = 0; i < 100 && quieto < 5; i++) {
      await new Promise((r) => setTimeout(r, 100))
      const m = atual()
      quieto = m && m === anterior && !m._animatingZoom && !m._panAnim?._inProgress ? quieto + 1 : 0
      anterior = m
    }
  })
}

async function tocarComDedo(p: Page, x: number, y: number) {
  const [tx, ty] = await naTela(p, x, y)
  await p.touchscreen.tap(tx, ty)
}

const marcas = (p: Page): Promise<string[]> => porTeste(p, 'marcas').locator('li span').allInnerTexts()

/** Quantas peças estão pintadas de verdade na planta (o anel de cada peça marcada), sem esperar nada. */
const aneisNaPlanta = (p: Page): Promise<number> =>
  p.evaluate(() => {
    let n = 0
    ;(document.querySelector('.rl-mapa') as any).__mapa.eachLayer((l: any) => {
      if (l.options?.radius === 9 && l.options?.fill === false) n++
    })
    return n
  })

async function esperarMarcas(p: Page, esperado: string[]) {
  await p.waitForFunction(
    (e: string[]) => {
      const t = [...document.querySelectorAll('[data-testid="marcas"] li span')].map((x) => (x as HTMLElement).innerText)
      return JSON.stringify(t) === JSON.stringify(e)
    },
    esperado,
    { timeout: 4000 },
  ).catch(() => {})
  expect(await marcas(p)).toEqual(esperado)
}

/** Nenhuma tela do módulo pode rolar de lado; todo botão visível tem altura de dedo (42 px). */
async function conferirTela(p: Page, onde: string) {
  const r = await p.evaluate(() => {
    const larg = document.documentElement.scrollWidth - window.innerWidth
    const pequenos = [...document.querySelectorAll('button, select, label.rl-botao-foto')]
      .filter((b) => {
        const c = b.getBoundingClientRect()
        return c.width > 0 && c.height > 0 && c.height < 41.5
      })
      .map((b) => `${b.tagName} "${(b.textContent ?? '').trim().slice(0, 30)}" ${Math.round(b.getBoundingClientRect().height)}px`)
    return { larg, pequenos }
  })
  expect(r.larg, `${onde}: rola de lado`).toBeLessThanOrEqual(0)
  expect(r.pequenos, `${onde}: botão pequeno`).toEqual([])
}

async function novoContexto(tamanho: { width: number; height: number }, parametros = '') {
  const contexto = await navegador.newContext({ viewport: tamanho, hasTouch: true })
  const p = await contexto.newPage()
  const erros: string[] = []
  p.on('pageerror', (e: Error) => erros.push(e.message))
  p.on('dialog', (d: any) => d.accept())
  await p.goto(`${url}${parametros}`)
  await porTeste(p, 'aba-diario').waitFor()
  return { contexto, p, erros }
}

beforeAll(async () => {
  if (!ATIVO) return
  // nada da bancada vai para o Supabase de verdade
  process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:9'
  servidor = await createServer({ root: RAIZ, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } })
  await servidor.listen()
  url = `${servidor.resolvedUrls!.local[0]}dev/relatorios.html`
  const pw = createRequire(import.meta.url)(process.env.SO_PLAYWRIGHT || 'playwright')
  navegador = await pw.chromium.launch(process.env.SO_CHROME ? { channel: process.env.SO_CHROME, headless: true } : { headless: true })
}, 120_000)

afterAll(async () => {
  await navegador?.close()
  await servidor?.close()
})

// Só no PC do Nicolas, com a forma de verdade (os pacotes ficam fora do repositório; nada sai do PC):
//   py pipeline/fvs/bancada.py "<...>\FVS\pacotes"   (noutra janela)
//   SO_PASTA=http://127.0.0.1:8766/ SO_BANCADA=1 SO_PLAYWRIGHT=... SO_CHROME=chrome npx vitest run testes/relatorios_bancada.e2e.test.ts
const PASTA = process.env.SO_PASTA
;(ATIVO && PASTA ? describe : describe.skip)('Relatórios com a prancha de forma de verdade (só no PC)', () => {
  for (const [nome, tamanho] of [
    ['tablet', { width: 1280, height: 800 }],
    ['celular', { width: 375, height: 812 }],
  ] as const) {
    it(`${nome}: marca peça real no pacote da FVS e sai na impressão`, async () => {
      const contexto = await navegador.newContext({ viewport: tamanho, hasTouch: true })
      const p = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      p.on('dialog', (d: any) => d.accept())
      await p.goto(`${url}?pasta=${encodeURIComponent(PASTA!)}&pavimento=3`)
      await porTeste(p, 'aba-diario').waitFor({ timeout: 60_000 })
      await porTeste(p, 'abrir-hoje').click()
      await porTeste(p, 'novo-diario_servicos').click()
      await p.locator('#rl-descricao').fill('Armação de pilares')
      await p.getByRole('button', { name: 'Salvar e marcar na planta' }).click()
      await p.locator('.rl-mapa .leaflet-tile-loaded').first().waitFor({ timeout: 30_000 })

      // o pilar real: lê o manifest do trecho aberto para saber onde tocar
      const indice = await (await fetch(`${PASTA}indice.json`)).json()
      const pav = indice.pavimentos.find((x: any) => x.nome.includes('3'))
      const estrutura = pav.plantas.filter((x: any) => x.disciplina !== 'arquitetura')
      const trecho = await porTeste(p, 'trecho').evaluate((s: HTMLSelectElement) => s.options[s.selectedIndex].text)
      const pl = estrutura.find((x: any) => x.trecho === trecho)
      const manifest = await (await fetch(`${PASTA}${pl.pasta}manifest.json`)).json()
      const pilares = Object.values(manifest.elementos).filter((e: any) => e.tipo === 'P' && e.polys.length > 0) as any[]
      const centro = (e: any): [number, number] => {
        const pts = e.polys[0]
        return [pts.reduce((s: number, q: number[]) => s + q[0], 0) / pts.length, pts.reduce((s: number, q: number[]) => s + q[1], 0) / pts.length]
      }
      await capturar(p, `real_${nome}_vazia`)
      await tocarComDedo(p, ...centro(pilares[0]))
      await esperarMarcas(p, [pilares[0].nome])
      await tocarComDedo(p, ...centro(pilares[5]))
      expect((await marcas(p)).sort()).toEqual([pilares[0].nome, pilares[5].nome].sort())
      expect(await aneisNaPlanta(p)).toBe(2)
      await capturar(p, `real_${nome}_marcada`)
      await conferirTela(p, 'prancha de verdade')

      await porTeste(p, 'pronto').click()
      await porTeste(p, 'local-servico').getByText(pilares[0].nome, { exact: false }).waitFor()
      await porTeste(p, 'imprimir-dia').click()
      await porTeste(p, 'plantas-impressas').locator('svg').first().waitFor({ timeout: 30_000 })
      if (PRINTS) await capturar(p, `real_${nome}_impressao`, true)
      expect(erros).toEqual([])
      await contexto.close()
    }, 180_000)
  }
})

suite('Relatórios na bancada (Chrome)', () => {
  it('tablet deitado: escreve o dia, marca na planta com dedo e caneta, fecha, imprime', async () => {
    const { contexto, p, erros } = await novoContexto({ width: 1280, height: 800 })
    await capturar(p, 'tablet_inicio')
    await porTeste(p, 'abrir-hoje').click()
    await porTeste(p, 'clima').waitFor()

    // clima: um toque grava; chuva forte já vem como impraticável
    await porTeste(p, 'tempo-manha').getByRole('button', { name: 'Chuva forte' }).click()
    await porTeste(p, 'condicao-manha').getByRole('button', { name: 'Impraticável', pressed: true }).waitFor()
    await porTeste(p, 'tempo-tarde').getByRole('button', { name: 'Sol' }).click()
    await porTeste(p, 'condicao-tarde').getByRole('button', { name: 'Praticável', pressed: true }).waitFor()

    // mão de obra e equipamentos copiados do dia anterior da bancada
    await porTeste(p, 'copiar-diario_efetivo').click()
    await p.getByText('Total: 10 pessoas').waitFor()
    await porTeste(p, 'copiar-diario_equipamentos').click()
    await porTeste(p, 'secao-diario_equipamentos').getByText('Grua').waitFor()

    // formulário confere o que é obrigatório
    await porTeste(p, 'novo-diario_efetivo').click()
    await p.locator('#rl-funcao').fill('')
    await p.getByRole('button', { name: 'Salvar', exact: true }).click()
    await p.getByText('Preencha: Função.').waitFor()
    await p.locator('#rl-funcao').fill('Carpinteiro')
    await p.locator('#rl-quantidade').fill('abc')
    await p.getByRole('button', { name: 'Salvar', exact: true }).click()
    await p.getByText(/Quantidade de pessoas: número inteiro/).waitFor()
    await p.locator('#rl-quantidade').fill('4')
    await p.getByRole('button', { name: 'Salvar', exact: true }).click()
    await p.getByText('Total: 14 pessoas').waitFor()

    // serviço: salva e cai na planta
    await porTeste(p, 'novo-diario_servicos').click()
    await p.locator('#rl-descricao').fill('Forma de pilares')
    await p.locator('#rl-empresa').fill('Empresa de Teste')
    await porTeste(p, 'campo-situacao').getByRole('button', { name: 'Concluído' }).click()
    await p.locator('#rl-avanco_pct').fill('100')
    await p.getByRole('button', { name: 'Salvar e marcar na planta' }).click()
    await p.locator('.rl-mapa canvas.leaflet-zoom-animated').first().waitFor()
    await capturar(p, 'tablet_planta_vazia')

    // dedo marca e desmarca peça (20 pilares: 6 colunas)
    await tocarComDedo(p, ...centroPilar(1, 6))
    await esperarMarcas(p, ['P1'])
    await tocarComDedo(p, ...centroPilar(8, 6))
    await esperarMarcas(p, ['P1', 'P8'])
    await tocarComDedo(p, ...centroPilar(8, 6))
    await esperarMarcas(p, ['P1'])
    await tocarComDedo(p, ...centroPilar(8, 6))
    await esperarMarcas(p, ['P1', 'P8'])
    // a planta já está pintada quando o painel mostra a peça: as duas, não só a última
    expect(await aneisNaPlanta(p)).toBe(2)

    // caneta: traço vira área e o dedo continua sem desenhar; toque curto de caneta marca peça uma vez só
    const cdp = await contexto.newCDPSession(p)
    await tracarComCaneta(p, cdp, quadrado(centroPilar(3, 6)))
    await esperarMarcas(p, ['P1', 'P8', 'Área 1'])
    const [cx, cy] = await naTela(p, ...centroPilar(2, 6))
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen' })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' })
    await esperarMarcas(p, ['P1', 'P2', 'P8', 'Área 1'])
    // o "click" que vem depois da caneta é ignorado por 250 ms: não pode virar um segundo toque
    await p.waitForTimeout(300)
    await esperarMarcas(p, ['P1', 'P2', 'P8', 'Área 1'])

    // ponto em qualquer lugar da planta
    await porTeste(p, 'modo-ponto').click()
    await tocarComDedo(p, 280, 280)
    await esperarMarcas(p, ['P1', 'P2', 'P8', 'Área 1', 'Ponto 1'])
    await capturar(p, 'tablet_planta_marcada')
    await porTeste(p, 'desfazer').click()
    await esperarMarcas(p, ['P1', 'P2', 'P8', 'Área 1'])
    await porTeste(p, 'modo-tocar').click()

    await porTeste(p, 'pronto').click()
    await porTeste(p, 'clima').waitFor()
    await porTeste(p, 'local-servico').getByText('3º Pavimento: P1, P2, P8, 1 área').waitFor()

    // ocorrência sem marcar na planta
    await porTeste(p, 'novo-diario_ocorrencias').click()
    await porTeste(p, 'campo-tipo').getByRole('button', { name: 'Interrupção dos trabalhos' }).click()
    await p.locator('#rl-descricao').fill('Chuva parou a concretagem')
    await p.locator('#rl-horas_paradas').fill('2,5')
    await p.getByRole('button', { name: 'Só salvar' }).click()
    await p.getByText('Horas paradas: 2,5').waitFor()
    await capturar(p, 'tablet_dia', true)

    // corrigir um registro: abre, muda, salva; a correção vale e não duplica
    await porTeste(p, 'secao-diario_ocorrencias').getByRole('button', { name: /Chuva parou/ }).click()
    await p.locator('#rl-horas_paradas').fill('3')
    await p.getByRole('button', { name: 'Salvar', exact: true }).click()
    await p.getByText('Horas paradas: 3').waitFor()
    expect(await porTeste(p, 'secao-diario_ocorrencias').locator('.rl-item').count()).toBe(1)

    // fechar: número 1, ninguém mais adiciona; reabrir mantém o número
    await porTeste(p, 'fechar-dia').click()
    await porTeste(p, 'situacao-dia').getByText('RDO nº 1').waitFor()
    expect(await porTeste(p, 'novo-diario_efetivo').count()).toBe(0)
    await capturar(p, 'tablet_dia_fechado')

    // para imprimir: com a planta em desenho, sem o aviso de rascunho
    await porTeste(p, 'imprimir-dia').click()
    await p.getByRole('heading', { name: 'Relatório Diário de Obra' }).waitFor()
    await porTeste(p, 'plantas-impressas').locator('svg').first().waitFor()
    expect(await porTeste(p, 'rascunho').count()).toBe(0)
    expect(await p.getByText('RDO nº 1').count()).toBeGreaterThan(0)
    if (PRINTS) {
      await p.emulateMedia({ media: 'print' })
      await capturar(p, 'tablet_impressao', true)
      await p.pdf({ path: path.join(PRINTS, 'relatorios_rdo.pdf'), format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } })
      await p.emulateMedia({ media: 'screen' })
    }
    await p.getByRole('button', { name: /Voltar/ }).click()
    await porTeste(p, 'reabrir-dia').click()
    await porTeste(p, 'situacao-dia').getByText('Aberto').waitFor()
    await porTeste(p, 'fechar-dia').click()
    await porTeste(p, 'situacao-dia').getByText('RDO nº 1').waitFor()

    // tudo continua depois de recarregar a página (está no banco do aparelho)
    await p.reload()
    await porTeste(p, 'aba-diario').waitFor()
    await porTeste(p, 'abrir-hoje').getByText(/14 pessoas/).waitFor()

    expect(erros).toEqual([])
    await contexto.close()
  }, 120_000)

  it('375 px, em pé: relatório de limpeza com a lista, marca com o dedo, acompanha e vê no mapa', async () => {
    const { contexto, p, erros } = await novoContexto({ width: 375, height: 812 })
    await conferirTela(p, 'início')
    await capturar(p, 'celular_inicio')

    await porTeste(p, 'aba-relatorios').click()
    await porTeste(p, 'novo-relatorio').click()
    await porTeste(p, 'tipos-relatorio').waitFor()
    await conferirTela(p, 'tipos de relatório')
    await capturar(p, 'celular_tipos')
    await porTeste(p, 'tipo-limpeza').click()
    await p.locator('#rl-titulo').waitFor()
    expect(await p.locator('#rl-titulo').inputValue()).toBe('Vistoria de limpeza')
    await p.locator('#rl-descricao').fill('Muito entulho no corredor')
    const itens = porTeste(p, 'conferencia').locator('.rl-chips')
    await itens.nth(0).getByRole('button', { name: 'Ruim' }).click()
    await itens.nth(1).getByRole('button', { name: 'OK' }).click()
    await conferirTela(p, 'formulário de relatório')
    await capturar(p, 'celular_form_limpeza', true)
    await p.getByRole('button', { name: 'Salvar e marcar na planta' }).click()
    await p.locator('.rl-mapa canvas.leaflet-zoom-animated').first().waitFor()
    await conferirTela(p, 'planta')

    // dedo marca peça; no modo Área o dedo desenha em vez de arrastar a planta
    await tocarComDedo(p, ...centroPilar(1, 6))
    await esperarMarcas(p, ['P1'])
    const cdp = await contexto.newCDPSession(p)
    const antes = await naTela(p, 120, 120)
    await porTeste(p, 'modo-area').click()
    await tracarComDedo(p, cdp, quadrado(centroPilar(3, 6), 150))
    await esperarMarcas(p, ['P1', 'Área 1'])
    expect(await naTela(p, 120, 120)).toEqual(antes) // a planta não saiu do lugar
    await porTeste(p, 'modo-tocar').click()
    await capturar(p, 'celular_planta')

    // volta para o relatório: fala onde foi; Ruim na lista deixa aberto
    await porTeste(p, 'pronto').click()
    await porTeste(p, 'local-relatorio').getByText('3º Pavimento: P1, 1 área').waitFor()
    await porTeste(p, 'situacao-relatorio').getByText('Aberto').waitFor()
    await conferirTela(p, 'relatório')
    await capturar(p, 'celular_relatorio', true)

    // foto de verdade: entra, aparece e continua no aparelho
    await p.locator('[data-testid="input-foto"]').setInputFiles({
      name: 'foto.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==', 'base64'),
    })
    await porTeste(p, 'fotos').locator('img').waitFor()

    // andamento muda a situação
    await porTeste(p, 'nova-situacao').getByRole('button', { name: 'Resolvido' }).click()
    await p.locator('#rl-comentario').fill('Entulho retirado')
    await porTeste(p, 'salvar-andamento').click()
    await porTeste(p, 'situacao-relatorio').getByText('Resolvido').waitFor()
    await porTeste(p, 'andamento').getByText('Entulho retirado').waitFor()

    // lista e filtros
    await p.getByRole('button', { name: /Voltar/ }).click()
    await porTeste(p, 'contagem-relatorios').getByText('1 relatório, 0 em aberto.').waitFor()
    await porTeste(p, 'filtro-situacao').getByRole('button', { name: 'Aberto' }).click()
    await p.getByText('Nenhum relatório com este filtro.').waitFor()
    await porTeste(p, 'filtro-situacao').getByRole('button', { name: 'Resolvido' }).click()
    await porTeste(p, 'lista-relatorios').getByText('Vistoria de limpeza').waitFor()
    await conferirTela(p, 'lista de relatórios')
    await capturar(p, 'celular_relatorios')

    // mapa da obra: toque na peça mostra o que aconteceu ali e leva ao registro
    await porTeste(p, 'abrir-mapa').click()
    await p.locator('.rl-mapa canvas.leaflet-zoom-animated').first().waitFor()
    await conferirTela(p, 'mapa')
    await mapaParado(p)
    // Pendência em docs/modulos/5_relatorios.md (16/11/2026): no celular simulado, o primeiro toque logo
    // depois de abrir o mapa às vezes se perde e o segundo funciona. Até confirmar num aparelho de verdade,
    // o teste toca de novo uma vez; se nem o segundo abrir, falha.
    await tocarComDedo(p, ...centroPilar(1, 6))
    if (!(await porTeste(p, 'entradas').getByText('Vistoria de limpeza').isVisible().catch(() => false))) {
      await p.waitForTimeout(300)
      await tocarComDedo(p, ...centroPilar(1, 6))
    }
    await porTeste(p, 'entradas').getByText('Vistoria de limpeza').waitFor({ timeout: 5000 })
    await capturar(p, 'celular_mapa')
    await porTeste(p, 'entradas').getByText('Vistoria de limpeza').click()
    await porTeste(p, 'situacao-relatorio').waitFor()

    // o dia do celular: tudo sem rolar de lado
    await p.getByRole('button', { name: /Voltar/ }).click()
    await p.getByRole('button', { name: /Voltar/ }).click()
    await porTeste(p, 'aba-diario').click()
    await porTeste(p, 'abrir-hoje').click()
    await porTeste(p, 'clima').waitFor()
    await conferirTela(p, 'dia')
    await porTeste(p, 'relatorios-do-dia').getByText('Vistoria de limpeza').waitFor()
    await capturar(p, 'celular_dia', true)

    expect(erros).toEqual([])
    await contexto.close()
  }, 120_000)

  it('tablet em planta sem pacote e pavimento sem peças; leitura só vê', async () => {
    const { contexto, p, erros } = await novoContexto({ width: 800, height: 1100 }, '?papel=leitura')
    expect(await porTeste(p, 'novo-relatorio').count()).toBe(0)
    await porTeste(p, 'abrir-hoje').click()
    await porTeste(p, 'clima').waitFor()
    expect(await porTeste(p, 'novo-diario_servicos').count()).toBe(0)
    expect(await porTeste(p, 'fechar-dia').count()).toBe(0)
    expect(await porTeste(p, 'tempo-manha').getByRole('button', { name: 'Sol' }).isDisabled()).toBe(true)
    await p.getByRole('button', { name: /Voltar/ }).click()
    await porTeste(p, 'abrir-mapa').click()
    await p.locator('.rl-mapa canvas.leaflet-zoom-animated').first().waitFor()
    await porTeste(p, 'pavimento').selectOption({ label: 'Sem peças' })
    await porTeste(p, 'sem-planta').waitFor()
    await capturar(p, 'tablet_sem_planta')
    expect(erros).toEqual([])
    await contexto.close()
  }, 60_000)

  // Rodada de 09/11/2026: alguém novo preenchendo um dia inteiro (as 3 coisas que mais atrapalhavam)
  for (const [nome, tamanho] of [
    ['375 px', { width: 375, height: 812 }],
    ['tablet', { width: 1280, height: 800 }],
  ] as const) {
    it(`${nome}: voltar do formulário cai no mesmo ponto do dia, empresa continua no "adicionar outro", relato fora das ocorrências`, async () => {
      const { contexto, p, erros } = await novoContexto(tamanho)
      await porTeste(p, 'abrir-hoje').click()
      await porTeste(p, 'clima').waitFor()

      // 1. o dia não volta ao topo depois de salvar
      await porTeste(p, 'novo-diario_materiais').scrollIntoViewIfNeeded()
      const antes = await p.evaluate(() => Math.round(window.scrollY))
      expect(antes).toBeGreaterThan(100)
      await porTeste(p, 'novo-diario_materiais').click()
      await p.locator('#rl-material').fill('Areia média')
      await p.getByRole('button', { name: 'Salvar', exact: true }).click()
      await porTeste(p, 'secao-diario_materiais').getByText('Areia média').waitFor()
      await p.waitForFunction((y: number) => Math.abs(window.scrollY - y) < 40, antes, { timeout: 3000 })

      // 2. "Salvar e adicionar outro" guarda a empresa e diz o que salvou
      await porTeste(p, 'novo-diario_efetivo').click()
      await p.locator('#rl-empresa').fill('Empreiteira Exemplo')
      await p.locator('#rl-funcao').fill('Pedreiro')
      await p.locator('#rl-quantidade').fill('4')
      await p.getByRole('button', { name: 'Salvar e adicionar outro' }).click()
      await p.getByText('Salvo: Pedreiro · 4. Pode adicionar o próximo.').waitFor()
      expect(await p.locator('#rl-empresa').inputValue()).toBe('Empreiteira Exemplo')
      expect(await p.locator('#rl-funcao').inputValue()).toBe('')
      await p.locator('#rl-funcao').fill('Servente')
      await p.locator('#rl-quantidade').fill('2')
      await p.getByRole('button', { name: 'Salvar e adicionar outro' }).click()
      await p.getByText('Salvo: Servente · 2. Pode adicionar o próximo.').waitFor()
      await p.getByRole('button', { name: /Voltar/ }).first().click()
      await porTeste(p, 'secao-diario_efetivo').getByText('Empreiteira Exemplo').first().waitFor()
      expect(await porTeste(p, 'secao-diario_efetivo').getByText('Empreiteira Exemplo').count()).toBe(2)

      // 3. o relato tem seção própria: não aparece como tipo de ocorrência
      await porTeste(p, 'novo-diario_ocorrencias').click()
      await porTeste(p, 'campo-tipo').getByRole('button', { name: 'Interrupção dos trabalhos' }).waitFor()
      expect(await porTeste(p, 'campo-tipo').getByRole('button', { name: 'Relato do dia' }).count()).toBe(0)
      await capturar(p, `dia_novato_${nome.replace(' ', '')}`)
      expect(erros).toEqual([])
      await contexto.close()
    }, 60_000)

    // Achados do Testador (09/11/2026)
    it(`${nome}: planta abre no pavimento do serviço, aviso do relato no lugar, RDO sem palavra partida e relato fora das ocorrências`, async () => {
      const { contexto, p, erros } = await novoContexto(tamanho)
      await porTeste(p, 'abrir-hoje').click()
      await porTeste(p, 'clima').waitFor()

      // aviso do relato dentro da seção, não preso no alto da tela
      await porTeste(p, 'escrever-relato').click()
      await p.locator('.rl-relato-texto').fill('Dia normal, sem chuva.')
      await porTeste(p, 'salvar-relato').click()
      await porTeste(p, 'relato-dia').getByTestId('msg-relato').waitFor()
      expect(await p.locator('[data-testid="msg-relato"]').evaluate((e: Element) => getComputedStyle(e).position)).toBe('static')

      // serviço que cita o pavimento: a planta abre nele (o último, com planta, é o 4º)
      await porTeste(p, 'novo-diario_servicos').click()
      await p.locator('#rl-descricao').fill('Armação de pilares do 3º pavimento')
      await p.getByRole('button', { name: 'Salvar e marcar na planta' }).click()
      await porTeste(p, 'pavimento').waitFor()
      expect(await porTeste(p, 'pavimento').locator('option:checked').innerText()).toBe('3º Pavimento')
      await porTeste(p, 'pronto').click()
      await porTeste(p, 'clima').waitFor()

      // uma ocorrência e a folha do RDO
      await porTeste(p, 'novo-diario_ocorrencias').click()
      await porTeste(p, 'campo-tipo').getByRole('button', { name: 'Visita' }).click()
      await p.locator('#rl-descricao').fill('Visita do fiscal')
      await p.getByRole('button', { name: 'Só salvar' }).click()
      await porTeste(p, 'clima').waitFor()
      await porTeste(p, 'imprimir-dia').click()
      await porTeste(p, 'relato-impresso').getByText('Dia normal, sem chuva.').waitFor()
      const folha = await p.evaluate(() => {
        const tabelas = [...document.querySelectorAll('.rl-doc-secao')].filter((s) => s.querySelector('h2')?.textContent?.startsWith('Ocorrências'))
        // cabeçalho partido = o texto dele ocupa mais de uma linha
        const linhas = (el: Element) => {
          const r = document.createRange()
          r.selectNodeContents(el)
          return new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size
        }
        const partidos = [...document.querySelectorAll('.rl-doc-tabela th')].filter((th) => linhas(th) > 1)
        return { ocorrencias: tabelas.map((t) => (t as HTMLElement).innerText).join('\n'), partidos: partidos.map((th) => th.textContent), larg: document.documentElement.scrollWidth - window.innerWidth }
      })
      expect(folha.ocorrencias).toContain('Visita do fiscal')
      expect(folha.ocorrencias).not.toContain('Relato do dia')
      expect(folha.partidos).toEqual([])
      expect(folha.larg).toBeLessThanOrEqual(0)
      await capturar(p, `rdo_${nome.replace(' ', '')}`, true)
      expect(erros).toEqual([])
      await contexto.close()
    }, 60_000)
  }
})

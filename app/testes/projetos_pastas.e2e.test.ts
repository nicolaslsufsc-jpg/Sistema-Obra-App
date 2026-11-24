// Lista de projetos em pastas e subpastas (23/11/2026) no Chrome, pela bancada (app/dev/projetos.html?muitas=1:
// obra de teste TST com mais 84 pranchas fictícias em pastas do Autodoc). Celular em pé (375 px) e tablet, com toque.
// Roda com SO_E2E=1 (GitHub) ou SO_BANCADA=1.
//   No PC do Nicolas: SO_BANCADA=1 SO_PLAYWRIGHT=<pasta>/node_modules/playwright SO_CHROME=chrome npx vitest run testes/projetos_pastas.e2e.test.ts
// SO_PRINTS=<pasta> salva capturas de tela.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
/* eslint-disable @typescript-eslint/no-explicit-any */

const ATIVO = process.env.SO_E2E === '1' || process.env.SO_BANCADA === '1'
const suite = ATIVO ? describe : describe.skip
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PRINTS = process.env.SO_PRINTS
const NO_BRASIL = { timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' }

let servidor: ViteDevServer
let navegador: any
let url = ''

suite('Projetos: pranchas em pastas e subpastas (bancada, Chromium)', () => {
  beforeAll(async () => {
    servidor = await createServer({ root: RAIZ, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } })
    await servidor.listen()
    url = `${servidor.resolvedUrls!.local[0]}dev/projetos.html?autodoc=ok&muitas=1`
    const pw = createRequire(import.meta.url)(process.env.SO_PLAYWRIGHT || 'playwright')
    navegador = await pw.chromium.launch(process.env.SO_CHROME ? { channel: process.env.SO_CHROME, headless: true } : { headless: true })
  }, 120_000)

  afterAll(async () => {
    await navegador?.close()
    await servidor?.close()
  })

  for (const [nome, largura, altura] of [
    ['celular', 375, 812],
    ['tablet', 768, 1024],
  ] as const) {
    it(`${nome} ${largura}x${altura}: as vigas do 2º pavimento tipo em 4 toques, com contagem e avisos em cada pasta`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: true, isMobile: largura < 700 })
      const p = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const estouro = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      const print = async (n: string) => {
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `projetos-pastas-${nome}-${n}.png`), fullPage: true })
      }
      const pasta = (n: string) => p.getByTestId('lista-pastas').locator(`[data-pasta="${n}"]`)

      await p.goto(url)
      // painel da obra: o bloco por disciplina conta as cópias em campo como o quadro (testador, 23/11) e não
      // repete disciplina no quadro
      await p.getByTestId('obra-disciplinas').locator('details').first().waitFor()
      const blocos = await p.getByTestId('obra-disciplinas').locator('summary').allInnerTexts()
      await p.getByTestId('quadro-situacao').waitFor()
      const quadro = await p.getByTestId('quadro-disciplina').locator('b').allInnerTexts()
      expect(new Set(quadro).size).toBe(quadro.length)
      if (await p.getByTestId('quadro-frase').innerText().then((t: string) => /[1-9]\d* a trocar/.test(t))) expect(blocos.join(' | ')).toMatch(/a trocar/)
      for (const b of blocos) if (/a trocar|conferir/.test(b)) expect(b).not.toMatch(/em dia/)
      await print('0-painel')
      await p.getByRole('button', { name: /^Lista de projetos/ }).tap()

      // raiz: uma pasta por disciplina, com a contagem
      await p.getByTestId('lista-pastas').waitFor()
      const estrutura = pasta('Estrutura')
      expect(await estrutura.locator('td').nth(1).innerText()).toBe('88') // tabela desde 23/11/2026: Pasta | Pranchas | Avisos
      // os avisos das pranchas de dentro aparecem já na pasta de cima
      expect(await estrutura.innerText()).toMatch(/a recolher|conferir|nova/)
      expect(await estouro()).toBeLessThanOrEqual(0)
      await print('1-raiz')

      // toque 1, 2, 3, 4: Estrutura › LO › Vigas › 2º pavimento
      await estrutura.tap()
      await pasta('LO').tap()
      expect(await pasta('Vigas').locator('td').nth(1).innerText()).toBe('30')
      await pasta('Vigas').tap()
      await print('2-vigas')
      expect(await p.getByTestId('lista-pastas').locator('[data-pasta]').evaluateAll((l: Element[]) => l.map((x) => x.getAttribute('data-pasta')))).toEqual([
        'Pilotis',
        'Mezanino',
        '2º pavimento',
        '3º pavimento',
        '4º pavimento',
        'Cobertura',
      ])
      await pasta('2º pavimento').tap()
      const pranchas = p.getByTestId('lista-pranchas').locator('tbody tr')
      expect(await pranchas.count()).toBe(5)
      expect(await pranchas.allInnerTexts()).toEqual(Array(5).fill(expect.stringMatching(/VIGAS DO 2º PAVIMENTO TIPO/)))
      expect(await p.getByTestId('lista-trilha').innerText()).toMatch(/Todas\s*›\s*Estrutura\s*›\s*LO\s*›\s*Vigas\s*›\s*2º pavimento/)
      expect(await estouro()).toBeLessThanOrEqual(0)
      await print('3-vigas-2pav')

      // voltar do aparelho sobe uma pasta; a trilha leva direto a qualquer uma
      await p.goBack()
      await pasta('Mezanino').waitFor()
      await p.getByTestId('lista-trilha').getByRole('button', { name: 'Todas' }).tap()
      await pasta('Estrutura').waitFor()

      // a busca vale por cima de todas as pastas e diz onde cada prancha está
      await p.getByLabel('Buscar por código ou título').fill('vigas do 3º')
      await p.getByTestId('lista-onde').first().waitFor()
      expect(await p.getByTestId('lista-onde').first().innerText()).toBe('LO › Vigas › 3º pavimento')
      expect(await p.locator('.so-tabela tbody tr').count()).toBe(5)
      expect(await estouro()).toBeLessThanOrEqual(0)
      await print('4-busca')
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)
  }
})

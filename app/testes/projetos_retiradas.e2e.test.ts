// Cópias de pasta retirada do Autodoc (24/11/2026): a pasta com todas as pranchas obsoletas some do canteiro,
// sem apagar nada. Bancada (app/dev/projetos.html): ?retirada=1 põe uma pasta fictícia assim, com 2 cópias em
// campo. O canteiro tem de ficar com os mesmos números de sem ela, e dizer quantas não aparecem.
// Celular em pé (375 px) e tablet, com toque. Roda com SO_E2E=1 (GitHub) ou SO_BANCADA=1.
//   No PC do Nicolas: SO_BANCADA=1 SO_PLAYWRIGHT=<pasta>/node_modules/playwright SO_CHROME=chrome npx vitest run testes/projetos_retiradas.e2e.test.ts
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
let base = ''

suite('Projetos: cópias de pasta retirada fora do canteiro (bancada, Chromium)', () => {
  beforeAll(async () => {
    servidor = await createServer({ root: RAIZ, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } })
    await servidor.listen()
    base = `${servidor.resolvedUrls!.local[0]}dev/projetos.html?autodoc=ok`
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
    it(`${nome} ${largura}x${altura}: o canteiro não conta as cópias da pasta retirada e avisa quantas são`, async () => {
      const canteiro = async (extra: string) => {
        const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: true, isMobile: largura < 700 })
        const p = await contexto.newPage()
        const erros: string[] = []
        p.on('pageerror', (e: Error) => erros.push(e.message))
        await p.goto(base + extra)
        await p.getByTestId('obra-canteiro').tap()
        await p.getByTestId('painel-resumo').waitFor()
        const numeros = {
          frase: await p.getByTestId('quadro-frase').innerText(),
          trocar: await p.getByTestId('painel-desatualizadas').innerText(),
          conferir: await p.getByTestId('painel-conferir').innerText(),
        }
        const aviso = (await p.getByTestId('painel-retiradas').count()) ? await p.getByTestId('painel-retiradas').innerText() : null
        const estouro = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        if (PRINTS && extra) await p.screenshot({ path: path.join(PRINTS, `projetos-retiradas-${nome}.png`), fullPage: true })
        await contexto.close()
        return { numeros, aviso, estouro, erros }
      }
      const sem = await canteiro('')
      const com = await canteiro('&retirada=1')
      // as 2 cópias da pasta retirada não viram "a trocar" nem "conferir": os números ficam iguais
      expect(com.numeros).toEqual(sem.numeros)
      expect(sem.aviso).toBeNull()
      expect(com.aviso).toMatch(/^2 cópias em campo não aparecem aqui: são de uma pasta do Autodoc/)
      expect(com.aviso).toMatch(/Nada foi apagado/)
      expect([sem.estouro, com.estouro].every((x) => x <= 0)).toBe(true)
      expect([...sem.erros, ...com.erros]).toEqual([])
    }, 120_000)
  }
})

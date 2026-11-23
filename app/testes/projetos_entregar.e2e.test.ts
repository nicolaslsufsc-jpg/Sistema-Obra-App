// "Entregar cópia" no Chrome, pela bancada (app/dev/projetos.html): sem login nem servidor, obra de teste TST.
// O caminho inteiro COM TOQUE: botão do topo → disciplina → marcar várias pranchas (23/11) → empresa e pessoa → cópias → assinatura
// com o dedo/caneta → salvar. Celular em pé (375 px) e tablet.
// Roda com SO_E2E=1 (GitHub, junto com as outras telas) ou SO_BANCADA=1.
//   No PC do Nicolas: SO_BANCADA=1 SO_PLAYWRIGHT=<pasta>/node_modules/playwright SO_CHROME=chrome npx vitest run testes/projetos_entregar.e2e.test.ts
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
const OBRA = 'b0000000-0000-0000-0000-0000000000bb'
const NO_BRASIL = { timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' }

let servidor: ViteDevServer
let navegador: any
let url = ''

/** Entregas gravadas no aparelho (lidas pelo núcleo, na página), da mais antiga para a mais nova. */
function entregas(p: Page): Promise<{ colaborador: string | null; documento: string; assinatura: string | null; data: string; pendente: boolean }[]> {
  // texto, e não função: o import() tem que rodar no navegador, não ser reescrito pelo vitest
  return p.evaluate(`(async () => {
    const { sincronizador } = await import('/src/nucleo/servicos.ts')
    const l = await sincronizador.linhas('distribuicao_eventos', '${OBRA}')
    return l
      .filter((e) => e.tipo === 'entrega')
      .sort((a, b) => (a.criado_em_dispositivo < b.criado_em_dispositivo ? -1 : a.criado_em_dispositivo > b.criado_em_dispositivo ? 1 : 0))
      .map((e) => ({ colaborador: e.colaborador ?? null, documento: e.documento_id, assinatura: e.assinatura_id ?? null, data: e.data_evento }))
  })()`)
}

/** Risca o quadro com TOQUE de verdade (eventos de toque do navegador), como o dedo ou a caneta. */
async function assinarComToque(contexto: any, p: Page) {
  const quadro = p.getByTestId('assinatura-quadro')
  await quadro.scrollIntoViewIfNeeded()
  const b = await quadro.boundingBox()
  const cdp = await contexto.newCDPSession(p)
  const pontos = Array.from({ length: 14 }, (_, i) => ({ x: b.x + 20 + i * 12, y: b.y + 30 + (i % 2 ? 20 : 0) }))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pontos[0]] })
  for (const pt of pontos.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  // o navegador ignora um toque colado no fim do risco; quem assina leva mais que isto até o botão
  await p.waitForTimeout(700)
}

suite('Projetos: entregar cópia com toque (bancada, Chromium)', () => {
  beforeAll(async () => {
    servidor = await createServer({ root: RAIZ, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } })
    await servidor.listen()
    url = `${servidor.resolvedUrls!.local[0]}dev/projetos.html?autodoc=ok`
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
    it(`${nome} ${largura}x${altura}: do botão do topo até a entrega assinada, 3 pranchas de uma vez, 2 cópias de cada`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: true, isMobile: largura < 700 })
      const p = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      p.on('dialog', (d: any) => d.accept())
      const estouro = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      const print = async (n: string) => {
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `projetos-entregar-${nome}-${n}.png`), fullPage: true })
      }

      await p.goto(url)
      const botao = p.getByTestId('obra-entregar')
      await botao.waitFor()
      // o botão está na primeira tela, logo abaixo do título, com alvo de toque folgado
      const caixa = await botao.boundingBox()
      expect(caixa.y).toBeLessThan(200)
      expect(caixa.height).toBeGreaterThanOrEqual(44)
      const emCampoAntes = Number(await p.getByTestId('obra-em-campo').innerText())
      const antes = (await entregas(p)).length

      // 1. disciplina em botões
      await botao.tap()
      await p.getByTestId('entregar-disciplina').first().waitFor()
      expect(await p.getByTestId('entregar-pranchas').count()).toBe(0)
      await p.getByTestId('entregar-disciplina').filter({ hasText: 'Estrutura' }).tap()

      // 2. pranchas da disciplina, com a revisão vigente indicada; a busca acha pelo título
      await p.getByTestId('entregar-prancha').first().waitFor()
      expect(await p.getByTestId('entregar-disciplina').filter({ hasText: 'Estrutura' }).getAttribute('aria-pressed')).toBe('true')
      expect(await p.getByTestId('entregar-prancha').first().innerText()).toMatch(/(LO|EX) R\d\d/)
      const todas = await p.getByTestId('entregar-prancha').count()
      await p.getByTestId('entregar-busca').fill('pilotis')
      await expect.poll(() => p.getByTestId('entregar-prancha').count()).toBeLessThan(todas)
      expect(await p.getByTestId('entregar-barra').count()).toBe(0)

      // várias folhas de uma vez (23/11): o toque marca; duas de Estrutura...
      const linhas = p.getByTestId('entregar-prancha')
      const codigo = await linhas.nth(0).getAttribute('data-codigo')
      await linhas.nth(0).tap()
      await linhas.nth(1).tap()
      expect(await linhas.nth(0).getAttribute('aria-checked')).toBe('true')
      expect(await p.getByTestId('entregar-seguir').innerText()).toBe('Entregar 2 pranchas')
      // ...desmarca e marca de novo (o toque alterna)
      await linhas.nth(1).tap()
      expect(await p.getByTestId('entregar-seguir').innerText()).toBe('Entregar 1 prancha')
      await linhas.nth(1).tap()
      await print('0-marcadas')
      // ...e uma de outra disciplina: em "Todas" as marcadas continuam marcadas
      await p.getByTestId('entregar-busca').fill('')
      await p.getByTestId('entregar-disciplina').filter({ hasText: 'Todas' }).tap()
      await expect.poll(() => p.getByTestId('entregar-prancha').count()).toBeGreaterThan(todas)
      expect(await p.locator('[data-testid=entregar-prancha][aria-checked=true]').count()).toBe(2)
      await p.locator('[data-testid=entregar-prancha][data-codigo*=".AR."]').first().tap()
      expect(await p.getByTestId('entregar-seguir').innerText()).toBe('Entregar 3 pranchas')
      // o filtro de pavimento corta a lista e não desmarca nada
      if (await p.getByTestId('entregar-pavimento').count()) {
        const antesPav = await p.getByTestId('entregar-prancha').count()
        await p.getByTestId('entregar-pavimento').nth(1).tap()
        await expect.poll(() => p.getByTestId('entregar-prancha').count()).toBeLessThan(antesPav)
        expect(await p.getByTestId('entregar-seguir').innerText()).toBe('Entregar 3 pranchas')
      }
      // a barra de baixo fica na tela, mesmo com a lista longa
      const barra = await p.getByTestId('entregar-barra').boundingBox()
      expect(barra.y + barra.height).toBeLessThanOrEqual(altura + 1)
      expect(await estouro()).toBeLessThanOrEqual(0)
      await print('1-escolha')

      // seguir, voltar (as marcadas continuam) e seguir de novo
      await p.getByTestId('entregar-seguir').tap()
      await p.getByTestId('entrega-mais-pranchas').waitFor()
      await p.goBack()
      await p.getByTestId('entregar-barra').waitFor()
      expect(await p.getByTestId('entregar-seguir').innerText()).toBe('Entregar 3 pranchas')
      await p.getByTestId('entregar-seguir').tap()
      // o formulário já vem com as 3: a primeira no topo, as outras marcadas em "Mais pranchas"
      await p.getByTestId('entrega-mais-pranchas').waitFor()
      expect(await p.locator('[data-testid=entrega-mais-pranchas] input[type=checkbox]:checked').count()).toBe(2)
      expect(await p.getByRole('button', { name: /^Registrar entrega/ }).innerText()).toContain('3 pranchas')

      // 3. para quem: empresa em botões, pessoa já conhecida em botão, ou nome novo
      await p.getByTestId('entrega-empresa').first().waitFor()
      await p.getByTestId('entrega-empresa').filter({ hasText: 'Empreiteira Alfa' }).tap()
      await p.getByTestId('entrega-pessoa').first().waitFor()
      expect(await p.getByTestId('entrega-pessoa').allInnerTexts()).toContain('João')
      await p.getByTestId('entrega-pessoa').filter({ hasText: 'João' }).tap()
      expect(await p.getByTestId('entrega-nome').inputValue()).toBe('João')
      await p.getByTestId('entrega-nome').fill('Pessoa Nova')

      // 4. a data de hoje já vem; quantas cópias
      const hoje = await p.evaluate(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })
      expect(await p.locator('input[type=date]').inputValue()).toBe(hoje)
      expect(await p.getByTestId('entrega-copias').inputValue()).toBe('1')
      await p.getByTestId('entrega-copias').fill('0')
      await p.getByRole('button', { name: /^Registrar entrega/ }).tap()
      await p.getByText('Informe de 1 a 20 cópias.').waitFor()
      await p.getByTestId('entrega-copias').fill('2')
      expect(await p.getByText('Informe de 1 a 20 cópias.').count()).toBe(0) // o aviso some quando o número fica certo

      // 5. assinatura com toque
      expect(await p.getByTestId('entrega-sem-assinatura').count()).toBe(1)
      await assinarComToque(contexto, p)
      expect(await p.getByTestId('entrega-sem-assinatura').count()).toBe(0)
      expect(await estouro()).toBeLessThanOrEqual(0)
      await print('2-formulario')

      // 6. salvar: grava no aparelho (sem servidor na bancada) e abre o comprovante
      await p.getByRole('button', { name: /^Registrar entrega/ }).tap()
      await p.getByText(/Entrega registrada: 2 cópias de .* e mais 2 pranchas/).waitFor()
      expect(await estouro()).toBeLessThanOrEqual(0)
      await print('3-comprovante')
      const novas = (await entregas(p)).slice(antes)
      // 3 pranchas × 2 cópias = 6 registros, cada prancha o seu, todos com UMA assinatura
      expect(novas).toHaveLength(6)
      expect(novas.every((e) => e.colaborador === 'Pessoa Nova' && e.data === hoje && !!e.assinatura)).toBe(true)
      expect(new Set(novas.map((e) => e.assinatura)).size).toBe(1)
      expect(new Set(novas.map((e) => e.documento)).size).toBe(3)
      expect(codigo).toMatch(/^TST\.ES\./)

      // já entra na conta das cópias em campo: as 6 contam
      await p.goto(url)
      await p.getByTestId('obra-em-campo').waitFor()
      await expect.poll(async () => Number(await p.getByTestId('obra-em-campo').innerText())).toBe(emCampoAntes + 6)
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)
  }
})

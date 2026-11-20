// Telas do modo sem conta no Chromium, com o app compilado e uma pasta de obra de teste ao lado
// (dados_obra/): o app abre direto na obra, a FVS mostra a planta guardada, "Salvar arquivo" baixa o
// .obra e "Restaurar" repõe num navegador limpo. Celular (375 px) e tablet.
// Roda com SO_E2E=1 (GitHub, junto com as outras telas) ou SO_BANCADA=1.
//   No PC do Nicolas: SO_BANCADA=1 SO_PLAYWRIGHT=<pasta>/node_modules/playwright SO_CHROME=chrome npx vitest run testes/local.e2e.test.ts
// SO_PRINTS=<pasta> salva capturas de tela.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import { montarZip } from './montar_zip'
import { lerNomesProibidos, nomesNoTexto } from '../sem_dados_de_obra'
import { amostraIfc } from './ifc/amostra'
import { DISTRIBUICAO_EXE, VIGENTES_EXE } from '../src/projetos/exemplo_exe'
import { sistemasInstalados } from '../src/integracoes/sistema_oficial'
import { abrirMenuObra, comPavimentosDoAparelho } from './menu_obra'
/* eslint-disable @typescript-eslint/no-explicit-any */
type Page = any

const ATIVO = process.env.SO_E2E === '1' || process.env.SO_BANCADA === '1'
const suite = ATIVO ? describe : describe.skip
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SAIDA = mkdtempSync(path.join(os.tmpdir(), 'sistema-obra-local-'))
const PRINTS = process.env.SO_PRINTS
const NO_BRASIL = { timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' }
// Projetos e Relatórios fora do menu desde 18/11/2026 (código guardado): os testes deles ficam parados até voltarem.
// O IFC voltou em 20/11/2026, sem o selo "beta", e o teste dele roda sempre.
const BETAS_NO_MENU = false
const itBeta = BETAS_NO_MENU ? it : it.skip

const PLANTA = 'a2000000-0000-0000-0000-0000000000f1'
const PECA = 'e0000000-0000-0000-0000-000000000001'
const FICHA_DE_TESTE = { codigo: 'TESTE-PVS-P', titulo: 'Pilares (ficha de teste)', revisao: '0', aplica_a: ['P'], itens: [{ n: 1, etapa: 'MONTAGEM', titulo: 'Prumo da fôrma', dispositivo: 'Prumo', tolerancia: '2 mm' }] }

const conferencia = (b: string | Uint8Array) => ({ sha256: createHash('sha256').update(b).digest('hex'), tamanho: Buffer.byteLength(b) })

/** Uma pasta de obra de teste, no formato do exportar_bancada.py, com uma planta sem imagem. */
function escreverPastaDeTeste(saida: string) {
  const pasta = path.join(saida, 'dados_obra')
  mkdirSync(path.join(pasta, 'pav', 'planta'), { recursive: true })
  const manifest = {
    formato: 1,
    planta_id: PLANTA,
    obra: 'EXE',
    pavimento: '3º Pavimento',
    trecho: 'Planta inteira',
    prancha: 'TESTE.ES.LO.001',
    revisao: 'R00',
    largura: 2000,
    altura: 1300,
    tile: 512,
    niveis: [0],
    elementos: { [PECA]: { tipo: 'P', nome: 'P1', secao: '19x50', rotulo: [150, 110, 200, 130], polys: [[[140, 125], [160, 125], [160, 175], [140, 175]]] } },
    detalhes: {},
    pedacos: {},
  }
  const indice = {
    obra: 'EXE',
    // o nome por extenso só vem no pacote (o site não leva, "Tirar o nome" de 08/11)
    nome: 'Obra Exemplo',
    pavimentos: [
      {
        nome: '3º Pavimento',
        pecas: [{ id: PECA, tipo: 'P', nome: 'P1', secao: '19x50' }],
        plantas: [
          { id: PLANTA, trecho: 'Planta inteira', pasta: 'pav/planta/', prancha: 'TESTE.ES.LO.001', revisao: 'R00', largura: 2000, altura: 1300, elementos: 1, disciplina: 'estrutura', manifest: conferencia(JSON.stringify(manifest)), pacote: conferencia(new Uint8Array()) },
        ],
      },
    ],
  }
  writeFileSync(path.join(pasta, 'indice.json'), JSON.stringify(indice))
  writeFileSync(path.join(pasta, 'fichas.json'), JSON.stringify([FICHA_DE_TESTE]))
  writeFileSync(path.join(pasta, 'pav', 'planta', 'manifest.json'), JSON.stringify(manifest))
  writeFileSync(path.join(pasta, 'pav', 'planta', 'pacote.bin'), new Uint8Array())
}

let site: PreviewServer
let navegador: any
let url = ''

/** Abre o bloco "Cópia de segurança e aparelho" do menu (fechado por padrão), tocando no título como a pessoa. */
async function abrirCopia(p: Page) {
  const bloco = p.getByTestId('bloco-copia')
  if (!(await bloco.evaluate((d: HTMLDetailsElement) => d.open))) await bloco.locator(':scope > summary').click()
}

/** Textos visíveis com contraste abaixo de 4,5:1 contra o fundo (o primeiro fundo opaco acima deles).
 *  Lê as cores pelo navegador num canvas, para entender qualquer formato (rgb, color-mix, color(srgb ...)). */
function contrasteBaixo(p: Page): Promise<string[]> {
  return p.evaluate(() => {
    const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    const rgba = (c: string) => {
      cv.clearRect(0, 0, 1, 1)
      cv.fillStyle = '#000'
      cv.fillStyle = c
      cv.fillRect(0, 0, 1, 1)
      const d = cv.getImageData(0, 0, 1, 1).data
      return [d[0], d[1], d[2], d[3] / 255]
    }
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const fundo = (e: Element | null): number[] => {
      // as camadas meio transparentes por cima do fundo opaco se misturam com ele
      const camadas: number[][] = []
      for (; e; e = e.parentElement) {
        const c = rgba(getComputedStyle(e).backgroundColor)
        if (c[3] > 0) camadas.push(c)
        if (c[3] > 0.9) break
      }
      let base = [255, 255, 255]
      for (const c of camadas.reverse()) base = base.map((v, i) => v * (1 - c[3]) + c[i] * c[3])
      return base
    }
    const vis = (e: Element) => {
      const r = e.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(e).visibility !== 'hidden'
    }
    const ruins = new Set<string>()
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const e = n.parentElement
      const t = n.textContent!.trim()
      if (!e || t.length < 2 || !vis(e) || e.closest('.leaflet-pane')) continue // texto da prancha é desenho
      const cs = getComputedStyle(e)
      const c = rgba(cs.color)
      const b = fundo(e)
      const texto = c.slice(0, 3).map((v, i) => v * c[3] + b[i] * (1 - c[3]))
      const l1 = lum(texto), l2 = lum(b)
      const r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      if (r < 4.5 && !(e.closest('button') as HTMLButtonElement | null)?.disabled) ruins.add(`${t.slice(0, 30)} ${r.toFixed(1)}:1`)
    }
    return [...ruins]
  })
}

/** Botões, campos e etiquetas de marcar visíveis com menos de 44 px de altura ou largura. */
function toquesPequenos(p: Page): Promise<string[]> {
  return p.evaluate(() =>
    [...document.querySelectorAll('button, a[href], select, input:not([type=hidden]):not([type=file]), summary, label:has(input)')]
      .filter((e) => {
        const r = e.getBoundingClientRect()
        const escondido = getComputedStyle(e).visibility === 'hidden' || e.closest('details:not([open]) > :not(summary)')
        return r.width > 0 && r.height > 0 && !escondido && (r.height < 44 || r.width < 44)
      })
      .map((e) => {
        const r = e.getBoundingClientRect()
        return `${(e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`
      }),
  )
}

/** Abre o app: a pasta da obra entra sozinha e o menu da EXE aparece. */
/** Abre o endereço do app. Desde 18/11 reabrir volta ao último módulo aberto: aqui ele é esquecido antes (o menu). */
async function irAoApp(p: Page) {
  if (p.url().startsWith('http')) await p.evaluate(() => localStorage.removeItem('casca_ultimo_modulo')).catch(() => {})
  await p.goto(url)
}

/** Abre o app no menu da obra. */
async function abrirNaObra(p: Page) {
  await irAoApp(p)
  await p.getByText('Sem conta: tudo fica guardado neste aparelho.').waitFor({ timeout: 30_000 })
}

suite('modo sem conta com a pasta da obra (Chromium)', () => {
  beforeAll(async () => {
    // nada do modo sem conta vai ao Supabase de verdade
    process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:9'
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'chave-publica-de-teste'
    // como o Cloudflare compila: dentro do vitest o NODE_ENV é "test", e o Vite deixaria o modo de
    // desenvolvimento ligado (import.meta.env.DEV), com o ?dados= e tudo
    const ambiente = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      await build({ root: RAIZ, logLevel: 'error', build: { outDir: SAIDA, emptyOutDir: true } })
    } finally {
      process.env.NODE_ENV = ambiente
    }
    escreverPastaDeTeste(SAIDA)
    site = await preview({ root: RAIZ, logLevel: 'error', build: { outDir: SAIDA }, preview: { port: 0, host: '127.0.0.1' } })
    url = site.resolvedUrls!.local[0]
    const pw = createRequire(import.meta.url)(process.env.SO_PLAYWRIGHT || 'playwright')
    // WebGL2 por software: o leitor de IFC desenha em 3D (o GitHub não tem placa de vídeo)
    const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    navegador = await pw.chromium.launch(process.env.SO_CHROME ? { channel: process.env.SO_CHROME, headless: true, args } : { headless: true, args })
  }, 180_000)

  afterAll(async () => {
    await navegador?.close()
    await site?.close()
    rmSync(SAIDA, { recursive: true, force: true })
  })

  for (const [nome, largura, altura] of [
    ['celular', 375, 812],
    ['tablet', 1280, 800],
  ] as const) {
    it(`${nome} ${largura}x${altura}: abre direto na EXE, a FVS tem a planta, salva e restaura`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700, acceptDownloads: true })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const print = async (n: string) => {
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `local-${nome}-${n}.png`), fullPage: true })
      }

      await abrirNaObra(p)
      await print('1-menu')

      // Menu sem conta: a obra da pasta, sem login, sem Sair, sem Trocar de obra; FVS, Concreto, Relatórios e Documentos (desde 09/11/2026)
      await p.getByRole('heading', { name: /EXE/ }).waitFor()
      expect(await p.getByText('Obra Exemplo').count()).toBe(1)
      expect(await p.getByText('Nenhum registro ainda.').count()).toBe(1)
      // tela inicial limpa: salvamento e aparelho num bloco fechado, com uma linha calma à vista
      expect(await p.getByTestId('bloco-copia').evaluate((d: HTMLDetailsElement) => d.open)).toBe(false)
      expect(await p.getByRole('button', { name: 'Salvar arquivo' }).isVisible()).toBe(false)
      expect(await p.getByTestId('persistente').isVisible()).toBe(false)
      expect(await p.getByTestId('aviso-sem-copia').count()).toBe(0)
      expect((await p.getByTestId('bloco-copia').locator(':scope > summary').boundingBox()).height).toBeGreaterThanOrEqual(44)
      await comPavimentosDoAparelho(p, (lista) => lista.filter({ hasText: /^3º Pavimento$/ }).waitFor())
      // menu da obra (topo, 20/11/2026): sem conta, a troca de obra é pelo pacote; não há Sair nem Trocar de obra
      const painelObra = await abrirMenuObra(p)
      await painelObra.getByRole('button', { name: 'Trocar de obra / abrir pacote (.zip)' }).waitFor()
      expect(await p.getByRole('button', { name: 'Sair', exact: true }).count()).toBe(0)
      expect(await p.getByRole('button', { name: 'Trocar de obra', exact: true }).count()).toBe(0)
      expect(await p.getByTestId('menu-obra').getAttribute('aria-expanded')).toBe('true')
      await p.keyboard.press('Escape') // fecha no Esc
      expect(await p.getByTestId('painel-obra').count()).toBe(0)
      expect(await p.getByTestId('menu-obra').getAttribute('aria-expanded')).toBe('false')
      expect(await p.getByRole('button', { name: 'Nova obra' }).count()).toBe(0)
      expect(await p.getByRole('button', { name: 'Usar neste aparelho, sem conta' }).count()).toBe(0)
      for (const m of ['FVS', 'Concreto', 'Documentos', 'IFC']) expect(await p.getByRole('button', { name: new RegExp(`^${m}`) }).count()).toBe(1)
      // Projetos e Relatórios fora do menu desde 18/11/2026; nenhum módulo do menu com o selo "beta" (20/11/2026)
      expect(await p.locator('.selo-beta').count()).toBe(0)
      for (const m of ['Projetos', 'Relatórios']) expect(await p.getByRole('button', { name: new RegExp(`^${m}`) }).count()).toBe(BETAS_NO_MENU ? 1 : 0)
      // a lista de pavimentos saiu da tela do menu (20/11/2026)
      expect(await p.getByTestId('pavimentos-obra').isVisible()).toBe(false)

      // FVS: o pavimento da pasta, com a planta já guardada no aparelho (botão Abrir, não Baixar)
      await p.getByRole('button', { name: /^FVS/ }).click()
      await p.getByRole('heading', { name: 'FVS', exact: true }).waitFor()
      await p.getByRole('button', { name: 'Abrir', exact: true }).waitFor()
      expect(await p.locator('.fv-baixar').count()).toBe(0)
      await print('2-fvs')
      await p.getByRole('button', { name: 'Voltar ao menu', exact: true }).click()

      // Relatórios fora do menu desde 18/11/2026 (código guardado): o roteiro dele fica parado até voltar
      if (BETAS_NO_MENU) {
        // Relatórios (de volta ao menu em 09/11/2026): os três dias de exemplo e os relatórios avulsos
        await p.getByRole('button', { name: /^Relatórios/ }).click()
        await p.getByTestId('abrir-hoje').waitFor()
        // são da apresentação: selo EXEMPLO, sem número de RDO e fora das contagens (09/11/2026)
        expect(await p.getByTestId('lista-dias').locator('li').count()).toBe(3)
        expect(await p.getByTestId('lista-dias').getByTestId('selo-exemplo').count()).toBe(3)
        expect(await p.getByTestId('lista-dias').getByText('Nº 1').count()).toBe(0)
        await p.getByTestId('aviso-exemplos').waitFor()
        // o aviso dos exemplos fica no fim da tela, depois de "Escrever o diário de hoje" (demo de 14/11)
        expect(
          await p.evaluate(() => {
            const hoje = document.querySelector('[data-testid="abrir-hoje"]')!
            const aviso = document.querySelector('[data-testid="aviso-exemplos"]')!
            return !!(hoje.compareDocumentPosition(aviso) & Node.DOCUMENT_POSITION_FOLLOWING)
          }),
        ).toBe(true)
        expect(await p.getByTestId('dias-impraticaveis').count()).toBe(0)
        await print('3-diario')
        await p.getByTestId('aba-relatorios').click()
        await p.getByTestId('lista-relatorios').getByText(/Vazamento de nata/).waitFor()
        await p.getByTestId('lista-relatorios').getByText(/Vistoria de limpeza/).waitFor()
        await p.getByTestId('contagem-relatorios').getByText('0 relatórios, 0 em aberto. Mais 3 de exemplo.').waitFor()
        expect(await p.getByTestId('lista-relatorios').getByText('Atrasado').count()).toBe(0)
        await print('4-relatorios')
        // o relatório de exemplo não sai na impressão
        await p.getByTestId('lista-relatorios').getByText(/Vazamento de nata/).click()
        await p.getByTestId('situacao-relatorio').getByTestId('selo-exemplo').waitFor()
        await p.getByTestId('imprimir-relatorio').click()
        await p.getByTestId('imprimir-sem-relatorio').getByText('Relatório de exemplo: não sai na impressão.').waitFor()
        await p.goBack()
        await p.goBack()
        // Tirar os exemplos: diário, relatórios, concretagem, laje e documentos saem; não voltam ao recarregar
        p.once('dialog', (d: any) => d.accept())
        await p.getByTestId('tirar-exemplos').click()
        await p.getByTestId('contagem-relatorios').getByText('0 relatórios, 0 em aberto.', { exact: true }).waitFor()
        expect(await p.getByTestId('aviso-exemplos').count()).toBe(0)
        await p.getByTestId('aba-diario').click()
        await p.getByText('Nenhum dia anterior registrado.').waitFor()
        await p.getByRole('button', { name: 'Voltar', exact: true }).click()
        await p.getByRole('button', { name: /^Relatórios/ }).waitFor()

        // Recarregar cai direto no menu, sem preparar tudo de novo (e os exemplos tirados não voltam)
        await abrirNaObra(p)
        await p.getByRole('button', { name: /^Relatórios/ }).click()
        await p.getByText('Nenhum dia anterior registrado.').waitFor()
        expect(await p.getByTestId('aviso-exemplos').count()).toBe(0)
        await p.getByRole('button', { name: 'Voltar', exact: true }).click()
      } else {
        // Recarregar cai direto no menu, sem preparar tudo de novo
        await abrirNaObra(p)
        await p.getByRole('button', { name: /^FVS/ }).waitFor()
      }

      // Salvar arquivo
      await abrirCopia(p)
      const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Salvar arquivo' }).click()])
      expect(download.suggestedFilename()).toMatch(/^salvo-EXE-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.obra$/)
      const arquivo = await download.path()
      await p.getByText(/Último salvamento: hoje às/).waitFor()

      // Restaurar num navegador limpo (que também abre direto na EXE)
      const limpo = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const q: Page = await limpo.newPage()
      q.on('pageerror', (e: Error) => erros.push(e.message))
      await abrirNaObra(q)
      await q.getByLabel('Arquivo de salvamento').setInputFiles(arquivo)
      await q.getByText('0 registros restaurados, 0 já estavam aqui.').waitFor()

      expect(erros).toEqual([])
      await limpo.close()
      await contexto.close()
    }, 120_000)
  }

  // Bug do teste no celular (18/11): fechar o Chrome com a FVS aberta e abrir de novo voltava ao menu.
  // Página nova no mesmo contexto = Chrome reaberto (o aparelho guarda tudo, o histórico some).
  for (const [nome, largura, altura] of [
    ['celular', 375, 812],
    ['tablet', 768, 1024],
  ] as const) {
    it(`${nome} ${largura}x${altura}: Chrome fechado na planta da FVS reabre na peça; o voltar passa pelo início e cai no menu`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const painelCom = (q: Page, n: string) => q.waitForFunction((x: string) => document.querySelector('.fv-nm')?.textContent === x, n)

      await abrirNaObra(p)
      await p.getByRole('button', { name: /^FVS/ }).click()
      await p.getByRole('heading', { name: 'FVS', exact: true }).waitFor()
      await p.getByTestId('fvs-busca-obra').fill('P1')
      await p.getByTestId('fvs-busca-linha').first().locator('button').click()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await painelCom(p, 'P1')

      // recarregar: continua na planta, com o painel
      await p.reload()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor({ timeout: 30_000 })
      await painelCom(p, 'P1')

      // Chrome fechado e aberto de novo
      await p.close()
      const q: Page = await contexto.newPage()
      q.on('pageerror', (e: Error) => erros.push(e.message))
      await q.goto(url)
      await q.locator('.fv-mapa .leaflet-tile').first().waitFor({ timeout: 30_000 })
      await painelCom(q, 'P1')
      // o voltar do Android: início da FVS, depois o menu; reabrir de novo abre no menu
      await q.goBack()
      await q.getByRole('heading', { name: 'FVS', exact: true }).waitFor()
      await q.goBack()
      await q.getByRole('button', { name: /^FVS/ }).waitFor()
      await q.close()
      const r: Page = await contexto.newPage()
      r.on('pageerror', (e: Error) => erros.push(e.message))
      await abrirNaObra(r)
      await r.getByRole('button', { name: /^FVS/ }).waitFor()
      expect(await r.getByRole('heading', { name: 'FVS', exact: true }).count()).toBe(0)

      // abrir a FVS pelo menu começa no início, mesmo com a planta guardada de antes
      await r.getByRole('button', { name: /^FVS/ }).click()
      await r.getByRole('heading', { name: 'FVS', exact: true }).waitFor()
      expect(await r.locator('.fv-mapa').count()).toBe(0)
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)
  }

  // Concreto sem conta (PR #39): a faixa "só neste aparelho · Salvar arquivo" no lugar do aviso de envio.
  for (const [nome, largura, altura] of [
    ['celular', 375, 812],
    ['tablet', 1280, 800],
  ] as const) {
    it(`${nome} ${largura}x${altura}: no Concreto a faixa diz "só neste aparelho" e o "Salvar arquivo" dela baixa o .obra`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700, acceptDownloads: true })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const faixa = p.getByTestId('faixa-local')
      try {
        // sem registro nenhum: sem faixa
        await abrirNaObra(p)
        await p.getByRole('button', { name: /^Concreto/ }).click()
        await p.getByRole('heading', { name: 'Concreto' }).waitFor()
        await p.waitForTimeout(500)
        expect(await faixa.count()).toBe(0)

        // um registro (C no P1, pela FVS) e de volta ao Concreto
        await abrirNaObra(p)
        await p.getByRole('button', { name: /^FVS/ }).click()
        await p.getByRole('button', { name: 'Abrir', exact: true }).click()
        await p.fill('.fv-busca', 'P1')
        await p.press('.fv-busca', 'Enter')
        await p.waitForFunction(() => document.querySelector('.fv-nm')?.textContent === 'P1')
        await p.locator('.fv-item[data-item="1"] button[data-r="C"]').click()
        await p.locator('.fv-item[data-item="1"] button[data-r="C"].on').waitFor()
        await abrirNaObra(p)
        await p.getByRole('button', { name: /^Concreto/ }).click()
        await faixa.filter({ hasText: '1 registro só neste aparelho · ainda sem arquivo' }).waitFor()
        expect(await p.getByText(/esperando envio/).count()).toBe(0)
        expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(largura)
        // "Salvar arquivo": não se confunde com o "Salvar" do formulário do caminhão (B1 do Testador)
        const salvar = faixa.getByRole('button', { name: 'Salvar arquivo', exact: true })
        expect(await faixa.getByRole('button', { name: 'Salvar', exact: true }).count()).toBe(0)
        expect((await salvar.boundingBox())!.height).toBeGreaterThanOrEqual(44)
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `local-${nome}-concreto-faixa.png`) })

        // Salvar: baixa o .obra e a faixa fica verde, sem o botão
        const [download] = await Promise.all([p.waitForEvent('download'), salvar.click()])
        expect(download.suggestedFilename()).toMatch(/^salvo-EXE-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.obra$/)
        await faixa.filter({ hasText: /^Salvo às \d{2}:\d{2}: 1 registro no arquivo\.$/ }).waitFor()
        expect(await faixa.getAttribute('class')).toContain('salvo')
        expect(await salvar.count()).toBe(0)
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `local-${nome}-concreto-faixa-salvo.png`) })

        // o menu enxerga o mesmo salvamento
        await abrirNaObra(p)
        await abrirCopia(p)
        await p.getByText(/Último salvamento: hoje às/).waitFor()
        expect(erros).toEqual([])
      } finally {
        await contexto.close()
      }
    }, 120_000)
  }

  // IFC (de volta ao menu em 13/11/2026, como beta): o selo aparece, o leitor abre e lê a amostra
  // (escrita à mão, sem dado de obra) com o app compilado e sem internet.
  for (const [nome, largura, altura] of [
    ['celular', 375, 812],
    ['tablet', 768, 1024],
  ] as const) {
    it(`${nome} ${largura}x${altura}: menu mostra o IFC (sem selo beta) e abre o visor`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const amostra = path.join(SAIDA, 'amostra.ifc')
      writeFileSync(amostra, amostraIfc())

      await abrirNaObra(p)
      // sem internet: o leitor (e o web-ifc.wasm) tem que vir do cache do app
      await p.evaluate(() => navigator.serviceWorker.ready)
      await contexto.setOffline(true)
      await p.reload()
      await p.getByText('Sem conta: tudo fica guardado neste aparelho.').waitFor({ timeout: 30_000 })

      const ifc = p.getByRole('button', { name: /^IFC/ })
      expect(await ifc.locator('.selo-beta').count()).toBe(0)
      expect(await p.getByRole('button', { name: /^IFC beta/i }).count()).toBe(0)
      await ifc.click()
      await p.getByRole('heading', { name: 'Importe aqui seu IFC' }).waitFor({ timeout: 30_000 })
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `local-${nome}-ifc-1-vazio.png`) })

      await p.setInputFiles('[data-testid=ifc-arquivos]', amostra)
      await p.waitForFunction(() => !document.querySelector('.ifc-vazio') && !document.querySelector('.ifc-leituras'), null, { timeout: 60_000 })
      expect(await p.getByRole('button', { name: 'Buscar' }).isEnabled()).toBe(true)
      expect(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `local-${nome}-ifc-2-modelo.png`) })

      await p.getByRole('button', { name: 'Voltar ao menu' }).click()
      await p.getByRole('button', { name: /^IFC/ }).waitFor()
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)
  }

  // Caixas dos módulos (20/11/2026, "arruma o tamanho das caixas"): todas com a mesma altura (a da maior
  // da grade, não só por linha), o "Abrir ›" no mesmo lugar em todas e a descrição em até 2 linhas.
  for (const [largura, altura] of [
    [768, 1024],
    [800, 1280],
    [375, 812],
    [384, 832],
  ] as const) {
    it(`${largura}x${altura}: caixas dos módulos iguais, "Abrir" alinhado e descrição em até 2 linhas`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      try {
        await abrirNaObra(p)
        await p.getByRole('button', { name: /^IFC/ }).waitFor()
        const caixas = await p.locator('.menu-modulos .modulo').evaluateAll((bs: HTMLElement[]) =>
          bs.map((b) => {
            const r = b.getBoundingClientRect()
            const abrir = b.querySelector('.modulo-abrir')!.getBoundingClientRect()
            const d = b.querySelector('.modulo-descricao') as HTMLElement
            // linhas visíveis da descrição: o topo distinto de cada pedaço do texto (não depende do line-height),
            // contando só o que fica dentro da caixa (o corte em 2 linhas esconde o resto)
            const caixa = d.getBoundingClientRect()
            const faixa = document.createRange()
            faixa.selectNodeContents(d)
            const linhas = new Set(
              [...faixa.getClientRects()].filter((q) => q.width > 0 && q.top >= caixa.top - 1 && q.bottom <= caixa.bottom + 1).map((q) => Math.round(q.top)),
            ).size
            return { topo: r.top, altura: r.height, abrirAbaixo: r.bottom - abrir.bottom, abrirDireita: r.right - abrir.right, abrirAcima: abrir.top - r.top, linhas }
          }),
        )
        expect(caixas.length).toBeGreaterThanOrEqual(4)
        // mesma altura em todas, inclusive em linhas diferentes da grade
        const alturas = caixas.map((c) => c.altura)
        expect(Math.max(...alturas) - Math.min(...alturas)).toBeLessThanOrEqual(1)
        // o "Abrir ›" no mesmo lugar em todas: colado embaixo no tablet; na linha do título no celular
        for (const medida of ['abrirAbaixo', 'abrirDireita', 'abrirAcima'] as const) {
          const v = caixas.map((c) => c[medida])
          expect(Math.max(...v) - Math.min(...v), medida).toBeLessThanOrEqual(1)
        }
        if (largura >= 600) expect(caixas[0].abrirAbaixo).toBeLessThanOrEqual(24)
        // tablet: as caixas lado a lado (2 colunas) e a altura não cresce por causa de uma só
        if (largura >= 600) expect(new Set(caixas.map((c) => Math.round(c.topo))).size).toBeLessThan(caixas.length)
        for (const c of caixas) {
          expect(c.linhas).toBeGreaterThanOrEqual(1)
          expect(c.linhas).toBeLessThanOrEqual(2)
        }
        expect(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
      } finally {
        await contexto.close()
      }
    }, 120_000)
  }

  // Projetos (de volta ao menu em 14/11/2026, como beta): abre sem conta, cadastra empresa sem o
  // aviso falso de "esperando envio", a mensagem cabe em 375 px e nenhum nome de sistema fica fixo.
  for (const [nome, largura, altura] of [
    ['celular', 375, 812],
    ['tablet', 768, 1024],
  ] as const) {
    itBeta(`${nome} ${largura}x${altura}: menu mostra Projetos beta, cadastra empresa sem aviso de envio`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const semEstouro = async () => expect(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)

      await abrirNaObra(p)
      const projetos = p.getByRole('button', { name: /^Projetos/ })
      expect(await projetos.locator('.selo-beta').innerText()).toMatch(/beta/i)
      await projetos.click()

      // abre no painel; sem base importada, mostra o formulário de importar
      await p.getByTestId('painel-importar').waitFor()
      await p.getByRole('button', { name: 'Empresas', exact: true }).click()

      // sem pranchas: diz o que fazer, sem script, sem servidor, sem nome de sistema
      const vazio = p.getByTestId('projetos-vazio')
      await vazio.waitFor()
      expect(await vazio.innerText()).toContain('Ainda não há pranchas')
      expect(await p.locator('body').innerText()).not.toMatch(/Autodoc|pipeline|sincroniza/i)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `local-${nome}-projetos-1-inicio.png`), fullPage: true })

      await p.getByRole('button', { name: /^Empresas/ }).click()
      await p.getByLabel('Nome').fill('Empreiteira Exemplo')
      await p.getByRole('button', { name: 'Cadastrar' }).click()
      await p.getByText('Empresa Empreiteira Exemplo cadastrada.').waitFor()
      await semEstouro()
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `local-${nome}-projetos-2-empresa.png`), fullPage: true })

      // volta ao início e reabre o módulo: o registro está na fila, mas sem conta não há "envio"
      await p.getByRole('button', { name: 'Voltar', exact: true }).click()
      await vazio.waitFor()
      expect(await p.getByText('1 empresa cadastrada').count()).toBe(1)
      await p.getByRole('button', { name: 'Voltar', exact: true }).click()
      await p.getByTestId('painel-importar').waitFor()
      await p.getByRole('button', { name: 'Voltar', exact: true }).click()
      await projetos.click()
      await p.getByTestId('painel-importar').waitFor()
      await p.waitForTimeout(1500)
      expect(await p.getByTestId('projetos-sync').count()).toBe(0)
      expect(await p.getByText(/esperando envio/).count()).toBe(0)
      await semEstouro()

      await p.getByRole('button', { name: 'Voltar', exact: true }).click()
      await projetos.waitFor()
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)
  }

  // Painel de Projetos (14/11/2026): importa a lista vigente e a distribuição (CSV da obra EXE) e mostra
  // em dia, desatualizadas, conferir, faixas de atraso, barras e listas, sem estourar a largura.
  for (const [nome, largura, altura] of [
    ['celular', 375, 812],
    ['tablet', 768, 1024],
  ] as const) {
    itBeta(`${nome} ${largura}x${altura}: Projetos importa a base e mostra o painel`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const vig = path.join(SAIDA, 'vigentes_exe.csv')
      const dist = path.join(SAIDA, 'distribuicao_exe.csv')
      writeFileSync(vig, VIGENTES_EXE)
      writeFileSync(dist, '﻿' + DISTRIBUICAO_EXE) // com BOM, como o Excel salva

      await abrirNaObra(p)
      await p.getByRole('button', { name: /^Projetos/ }).click()
      await p.getByTestId('painel-importar').waitFor()
      // arquivo errado: recusa e diz o que falta, sem gravar nada
      writeFileSync(path.join(SAIDA, 'errado.csv'), 'a;b\n1;2')
      await p.setInputFiles('[data-testid=arquivo-distribuicao]', path.join(SAIDA, 'errado.csv'))
      await p.getByRole('button', { name: 'Importar', exact: true }).click()
      await p.getByRole('alert').filter({ hasText: 'não tem as colunas' }).waitFor()

      await p.setInputFiles('[data-testid=arquivo-vigentes]', vig)
      await p.setInputFiles('[data-testid=arquivo-distribuicao]', dist)
      await p.getByRole('button', { name: 'Importar', exact: true }).click()
      await p.getByTestId('painel-resumo').waitFor()
      expect(await p.getByTestId('painel-desatualizadas').innerText()).toBe('4')
      expect(await p.getByTestId('painel-conferir').innerText()).toBe('4')
      expect(await p.getByTestId('painel-lista').locator('li').count()).toBe(4)
      expect(await p.getByTestId('painel-recolhidas').innerText()).toContain('1 cópia ficou fora da conta')
      expect(await p.getByText('a LO saiu depois da entrega').count()).toBe(2)
      expect(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `local-${nome}-projetos-3-painel.png`), fullPage: true })
      // tema escuro (padrão): contraste de 4,5:1 no painel inteiro (janela alta para entrar tudo na conta)
      const contrasteDaTelaToda = async () => {
        await p.setViewportSize({ width: largura, height: 5000 })
        const ruins = await contrasteBaixo(p)
        await p.setViewportSize({ width: largura, height: altura })
        return ruins
      }
      expect(await contrasteDaTelaToda(), 'escuro, painel').toEqual([])

      // tocar na linha abre a prancha: a vigente e todas as cópias da folha (linhas 5 e 7 em campo, 6 provavelmente recolhida)
      await p.getByTestId('painel-lista').locator('li').nth(3).click()
      await p.getByTestId('painel-prancha').waitFor()
      expect(await p.getByTestId('prancha-em-campo').locator('li').count()).toBe(2)
      expect(await p.getByTestId('prancha-fora').innerText()).toContain('provavelmente recolhida')
      expect(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `local-${nome}-projetos-4-prancha.png`), fullPage: true })
      expect(await contrasteDaTelaToda(), 'escuro, prancha').toEqual([])
      await p.getByRole('button', { name: 'Voltar', exact: true }).click()
      await p.getByTestId('painel-resumo').waitFor()

      // a base fica no aparelho: fechar e abrir o módulo mostra o painel de novo, sem importar
      await p.getByRole('button', { name: 'Voltar', exact: true }).click()
      await p.getByRole('button', { name: /^Projetos/ }).click()
      await p.getByTestId('painel-resumo').waitFor()
      expect(await p.getByTestId('painel-datas').innerText()).toContain('Lista vigente importada em')

      // modo sol (claro): o mesmo painel, também com 4,5:1
      await p.getByRole('button', { name: 'Voltar', exact: true }).click()
      await p.getByTestId('botao-tema').click()
      await p.getByRole('button', { name: /^Projetos/ }).click()
      await p.getByTestId('painel-resumo').waitFor()
      expect(await p.evaluate(() => document.documentElement.dataset.tema)).toBe('claro')
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `local-${nome}-projetos-5-painel-claro.png`), fullPage: true })
      expect(await contrasteDaTelaToda(), 'claro, painel').toEqual([])
      await p.getByTestId('painel-lista').locator('li').first().click()
      await p.getByTestId('painel-prancha').waitFor()
      expect(await contrasteDaTelaToda(), 'claro, prancha').toEqual([])
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    // painel-2 (14/11/2026): abas Pranchas e Entregas, edição com histórico (nada se apaga) e escritório
    itBeta(`${nome} ${largura}x${altura}: Projetos abas, edição com histórico e escritório, nos dois temas`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const print = async (n: string) => {
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `local-${nome}-projetos-${n}.png`), fullPage: true })
      }
      const estouro = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      const contraste = async (onde: string) => {
        await p.setViewportSize({ width: largura, height: 5000 })
        expect(await contrasteBaixo(p), onde).toEqual([])
        await p.setViewportSize({ width: largura, height: altura })
      }
      const vig = path.join(SAIDA, 'vigentes_exe_2.csv')
      const dist = path.join(SAIDA, 'distribuicao_exe_2.csv')
      writeFileSync(vig, VIGENTES_EXE)
      writeFileSync(dist, DISTRIBUICAO_EXE)
      await abrirNaObra(p)
      await p.getByRole('button', { name: /^Projetos/ }).click()
      await p.getByTestId('painel-importar').waitFor()
      await p.setInputFiles('[data-testid=arquivo-vigentes]', vig)
      await p.setInputFiles('[data-testid=arquivo-distribuicao]', dist)
      await p.getByRole('button', { name: 'Importar', exact: true }).click()
      await p.getByTestId('painel-resumo').waitFor()
      // sem nenhuma pasta registrada, o escritório não acusa nada
      expect(await p.getByTestId('painel-escritorio').innerText()).toBe('0')

      // aba Pranchas: as 6 folhas da lista, com busca
      await p.getByRole('button', { name: 'Pranchas', exact: true }).click()
      await p.getByTestId('lista-pranchas').waitFor()
      expect(await p.getByTestId('lista-pranchas').locator('li').count()).toBe(6)
      await p.getByPlaceholder('Buscar código, título ou número').fill('pilotis')
      expect(await p.getByTestId('lista-pranchas').locator('li').count()).toBe(1)
      expect(await estouro()).toBeLessThanOrEqual(0)
      await print('6-pranchas')
      await contraste('escuro, pranchas')

      // aba Entregas: 10 em campo, 1 devolvida; busca por empresa
      await p.getByRole('button', { name: 'Entregas', exact: true }).click()
      await p.getByTestId('lista-entregas').waitFor()
      expect(await p.getByTestId('lista-entregas').locator('li').count()).toBe(10)
      await p.getByRole('button', { name: /^Devolvidas/ }).click()
      expect(await p.getByTestId('lista-entregas').locator('li').count()).toBe(1)
      await p.getByRole('button', { name: /^Em campo/ }).click()
      await p.getByPlaceholder('Buscar empresa, colaborador ou prancha').fill('gama')
      expect(await p.getByTestId('lista-entregas').locator('li').count()).toBe(2)
      expect(await estouro()).toBeLessThanOrEqual(0)
      await print('7-entregas')
      await contraste('escuro, entregas')

      // abre a prancha da HIDRO pelo painel
      await p.getByRole('button', { name: 'Painel', exact: true }).click()
      await p.getByTestId('painel-lista').locator('li').nth(3).click()
      await p.getByTestId('painel-prancha').waitFor()
      expect(await p.getByTestId('prancha-escritorio').innerText()).toContain('sem registro')

      // escritório: a pasta está com a vigente
      await p.getByRole('button', { name: /^Atualizar: a pasta está com LO R00/ }).click()
      await p.getByTestId('prancha-escritorio').getByText('LO R00').waitFor()

      // corrigir a prancha: a vigente passa a LO R01 e a pasta do escritório fica para trás
      await p.getByRole('button', { name: 'Corrigir a prancha' }).click()
      await p.getByTestId('form-vigente').getByLabel('Revisão (número)').fill('1')
      await p.getByTestId('form-vigente').getByRole('button', { name: 'Salvar correção' }).click()
      await p.getByTestId('prancha-vigente').getByText('LO R01').waitFor()
      await p.getByTestId('prancha-escritorio').getByText('A pasta do escritório não tem a vigente.').waitFor()

      // registrar a devolução da linha 5: vai para "Fora da conta", sem apagar nada
      const linha5 = p.getByTestId('prancha-em-campo').locator('li').filter({ hasText: 'linha 5 ·' })
      await linha5.getByRole('button', { name: 'Registrar devolução' }).click()
      await print('8-edicao')
      // nenhum campo do formulário passa da borda dele (a página pode não estourar e o campo ficar cortado)
      const foraDoForm = await p.getByTestId('form-copia').evaluate((f: Element) => {
        const caixa = f.getBoundingClientRect()
        return [...f.querySelectorAll('input, select, button')].filter((c) => {
          const r = c.getBoundingClientRect()
          return r.left < caixa.left - 1 || r.right > caixa.right + 1
        }).length
      })
      expect(foraDoForm).toBe(0)
      await contraste('escuro, edição aberta')
      await p.getByTestId('form-copia').getByRole('button', { name: 'Salvar correção' }).click()
      await p.getByText('Devolução registrada (linha 5).').waitFor()
      expect(await p.getByTestId('prancha-fora').innerText()).toMatch(/devolvida[\s\S]*linha 5 ·/)
      const historico = await p.getByTestId('prancha-historico').innerText()
      expect(historico).toContain('linha 5 corrigida')
      expect(historico).toContain('prancha corrigida: vigente LO R01')
      expect(historico).toContain('pasta do escritório com LO R00')
      expect(historico).toContain('importado da lista vigente')
      expect(await estouro()).toBeLessThanOrEqual(0)
      await print('9-prancha-editada')

      // o painel refaz a conta com as correções
      await p.getByRole('button', { name: 'Voltar', exact: true }).click()
      await p.getByTestId('painel-resumo').waitFor()
      expect(await p.getByTestId('painel-escritorio').innerText()).toBe('1')
      expect(await p.getByTestId('painel-lista-escritorio').locator('li').count()).toBe(1)
      expect(await p.getByTestId('painel-desatualizadas').innerText()).toBe('5')
      expect(await p.getByTestId('painel-conferir').innerText()).toBe('3')

      // as correções ficam no aparelho: fechar e abrir o módulo mantém tudo
      await p.getByRole('button', { name: 'Voltar', exact: true }).click()
      await p.getByRole('button', { name: /^Projetos/ }).click()
      await p.getByTestId('painel-resumo').waitFor()
      expect(await p.getByTestId('painel-escritorio').innerText()).toBe('1')

      // modo sol (claro): abas e prancha com 4,5:1
      await p.getByRole('button', { name: 'Voltar', exact: true }).click()
      await p.getByTestId('botao-tema').click()
      await p.getByRole('button', { name: /^Projetos/ }).click()
      await p.getByTestId('painel-resumo').waitFor()
      await contraste('claro, painel')
      await p.getByRole('button', { name: 'Pranchas', exact: true }).click()
      await p.getByTestId('lista-pranchas').waitFor()
      await contraste('claro, pranchas')
      await p.getByRole('button', { name: 'Entregas', exact: true }).click()
      await p.getByTestId('lista-entregas').waitFor()
      await contraste('claro, entregas')
      await p.getByTestId('lista-entregas').locator('li').first().click()
      await p.getByTestId('painel-prancha').waitFor()
      await p.getByTestId('prancha-em-campo').getByRole('button', { name: 'Corrigir' }).first().click()
      await print('10-edicao-claro')
      await contraste('claro, edição aberta')
      expect(erros).toEqual([])
      await contexto.close()
    }, 150_000)
  }

  // Documentos (09/11/2026): lista mestra com os exemplos, revisão nova com PDF, cadastro, imprimir,
  // e o "Salvar arquivo" leva os documentos novos para outro navegador.
  for (const [nome, largura, altura] of [
    ['celular', 375, 812],
    ['tablet', 1280, 800],
  ] as const) {
    it(`${nome} ${largura}x${altura}: Documentos (lista mestra, revisão nova, cadastro, imprimir, salvar e restaurar)`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700, acceptDownloads: true })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const print = async (n: string) => {
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `documentos-${nome}-${n}.png`), fullPage: true })
      }
      await abrirNaObra(p)
      await p.getByRole('button', { name: /^Documentos/ }).click()

      // Obra: exemplos marcados EXEMPLO; o vencido de exemplo tem selo, mas não entra no aviso do topo
      await p.getByTestId('lista-mestra').getByText('Certificado de calibração · trena 5 m').waitFor()
      const trena = p.getByTestId('lista-mestra').getByRole('button', { name: /EXE-CAL-TR01/ })
      expect(await trena.getByText('Vencido').count()).toBe(1)
      expect(await trena.getByText('EXEMPLO').count()).toBe(1)
      expect(await p.getByTestId('avisos').count()).toBe(0)
      await p.getByTestId('aviso-exemplos').waitFor()
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      // Registros dos outros módulos, só leitura (fichas da FVS do pacote, concretagens, NC)
      await p.getByTestId('registros-modulos').getByText('Registros dos módulos').waitFor()
      for (const g of ['registros-fvs', 'registros-concreto', 'registros-nc']) await p.getByTestId(g).waitFor()
      // o aviso diz o que a impressão faz (desde o #64 os exemplos saem marcados) e não manda para módulo fora do menu (20/11)
      await p.getByTestId('aviso-exemplos').getByText(/saem na impressão com a marca EXEMPLO/).waitFor()
      if (!BETAS_NO_MENU) {
        await p.getByTestId('registros-nc').getByText('O módulo Relatórios está fora do menu por enquanto.').waitFor()
        expect(await p.getByText('Para abrir: menu da obra › Relatórios').count()).toBe(0)
      }
      await print('1-obra')

      // Empresa: filtro por categoria e por status
      await p.getByTestId('aba-empresa').click()
      await p.getByTestId('lista-mestra').getByText('Manual da Qualidade').waitFor()
      await p.getByTestId('filtro-categoria').selectOption('pes')
      await p.getByTestId('contagem').getByText('2 de 9 documentos.').waitFor()
      await p.getByTestId('filtro-categoria').selectOption('')
      await p.getByTestId('filtro-status').getByRole('button', { name: 'Em revisão' }).click()
      await p.getByTestId('lista-mestra').getByText('Não conformidade e ação corretiva').waitFor()
      expect(await p.getByTestId('lista-mestra').locator('li').count()).toBe(1)
      await p.getByTestId('filtro-status').getByRole('button', { name: 'Todos' }).click()
      await print('2-empresa')

      // Documento com revisão anterior (obsoleta) e o arquivo abre
      await p.getByTestId('lista-mestra').getByRole('button', { name: /EXE-PS-01/ }).click()
      await p.getByTestId('titulo-documento').getByText('Controle de documentos e registros').waitFor()
      await p.getByTestId('revisoes-anteriores').getByText('Obsoleto').waitFor()
      expect(await p.getByTestId('abrir-arquivo').first().getAttribute('href')).toMatch(/^blob:/)
      const [aba] = await Promise.all([contexto.waitForEvent('page'), p.getByTestId('abrir-arquivo').first().click()])
      await aba.close()
      await print('3-documento')

      // Revisão nova com um PDF: a rev. 02 vira obsoleta
      await p.getByTestId('revisao-nova').click()
      await p.getByTestId('salvar-documento').click()
      await p.getByTestId('erro-revisao').waitFor()
      await p.getByLabel('Revisão', { exact: true }).fill('03')
      await p.getByLabel(/Arquivo: PDF ou foto/).setInputFiles({ name: 'EXE-PS-01_rev03.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') })
      await print('4-revisao')
      await p.getByTestId('salvar-documento').click()
      await p.getByTestId('revisoes-anteriores').getByText('rev. 02', { exact: true }).waitFor()
      expect(await p.getByTestId('revisoes-anteriores').getByText('Obsoleto').count()).toBe(2)
      await p.getByText('EXE-PS-01_rev03.pdf', { exact: false }).first().waitFor()
      await p.getByRole('button', { name: 'Voltar', exact: true }).click()

      // Cadastrar na obra, sem arquivo
      await p.getByTestId('aba-obra').click()
      await p.getByTestId('cadastrar').click()
      await p.getByLabel('Código').fill('EXE-ATA-01')
      await p.getByLabel('Título').fill('Ata de reunião de obra nº 1')
      await p.getByLabel('Revisão', { exact: true }).fill('00')
      await p.getByLabel('Responsável').fill('Engenheiro da obra')
      await p.getByLabel('Categoria').selectOption('outros')
      await p.getByTestId('salvar-documento').click()
      await p.getByTestId('titulo-documento').getByText('Ata de reunião de obra nº 1').waitFor()
      await p.getByRole('button', { name: 'Voltar', exact: true }).click()
      await p.getByTestId('lista-mestra').getByText('Ata de reunião de obra nº 1').waitFor()

      // Imprimir a lista mestra da obra
      await p.getByTestId('imprimir-lista').click()
      await p.getByTestId('folha-lista-mestra').getByText('EXE-ATA-01').waitFor()
      // a folha bate com a tela: o exemplo sai marcado EXEMPLO, com a nota de que não vale (demo de 14/11)
      const folha = p.getByTestId('folha-lista-mestra')
      await folha.locator('tr', { hasText: 'EXE-CAL-TR01' }).getByText('EXEMPLO ·').waitFor()
      expect(await folha.locator('tr', { hasText: 'EXE-ATA-01' }).getByText('EXEMPLO ·').count()).toBe(0)
      await p.getByTestId('nota-exemplos').getByText(/de exemplo \(marcados EXEMPLO\) e não valem para a auditoria/).waitFor()
      // a folha cabe na tela (375 e tablet): nada passa da borda
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await print('5-imprimir')
      await p.getByRole('button', { name: 'Voltar', exact: true }).click()

      // Tirar os exemplos: fica só o que é da obra (e a revisão nova feita aqui, na empresa)
      p.once('dialog', (d: any) => d.accept())
      await p.getByTestId('tirar-exemplos').click()
      await p.getByTestId('contagem').getByText('1 documento.').waitFor()
      expect(await p.getByTestId('aviso-exemplos').count()).toBe(0)
      await p.getByTestId('aba-empresa').click()
      await p.getByTestId('lista-mestra').getByRole('button', { name: /EXE-PS-01/ }).getByText(/rev\. 03/).waitFor()
      await p.getByTestId('contagem').getByText('1 documento.').waitFor()
      await p.getByRole('button', { name: 'Voltar ao menu', exact: true }).click()

      // Salvar e restaurar num navegador limpo: a revisão nova (com o PDF) e o documento novo voltam
      await abrirCopia(p)
      const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Salvar arquivo' }).click()])
      const arquivo = await download.path()
      const limpo = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const q: Page = await limpo.newPage()
      q.on('pageerror', (e: Error) => erros.push(e.message))
      await abrirNaObra(q)
      await q.getByLabel('Arquivo de salvamento').setInputFiles(arquivo)
      await q.getByText('3 registros restaurados, 0 já estavam aqui.').waitFor()
      await q.getByRole('button', { name: /^Documentos/ }).click()
      await q.getByTestId('lista-mestra').getByText('Ata de reunião de obra nº 1').waitFor()
      await q.getByTestId('aba-empresa').click()
      await q.getByTestId('lista-mestra').getByRole('button', { name: /EXE-PS-01/ }).getByText(/rev\. 03/).waitFor()

      expect(erros).toEqual([])
      await limpo.close()
      await contexto.close()
    }, 120_000)
  }

  /** O pacote da obra em .zip, como o compactar_pacote.py grava (dentro de dados_obra/, .bin sem compressão). */
  function zipDaPasta(mudarIndice: (i: any) => any = (i) => i, nome = 'EXE_pacote.zip', pastaDoZip?: string, historico?: object): string {
    const pasta = path.join(SAIDA, 'dados_obra')
    const arquivos: Record<string, Uint8Array> = {}
    for (const rel of ['indice.json', 'fichas.json', 'pav/planta/manifest.json', 'pav/planta/pacote.bin']) {
      arquivos[`dados_obra/${rel}`] = new Uint8Array(readFileSync(path.join(pasta, rel)))
    }
    arquivos['dados_obra/indice.json'] = new TextEncoder().encode(JSON.stringify(mudarIndice(JSON.parse(readFileSync(path.join(pasta, 'indice.json'), 'utf-8')))))
    if (historico) arquivos['dados_obra/historico.json'] = new TextEncoder().encode(JSON.stringify(historico))
    const destino = path.join(pastaDoZip ?? mkdtempSync(path.join(os.tmpdir(), 'sistema-obra-zip-')), nome)
    writeFileSync(destino, montarZip(arquivos))
    return destino
  }

  for (const [nome, largura, altura] of [
    ['celular', 375, 812],
    ['tablet', 1280, 800],
  ] as const) {
    it(`${nome} ${largura}x${altura}: sem a pasta ao lado, abre o pacote da obra (.zip) e a planta fica no aparelho`, async () => {
      const zip = zipDaPasta()
      const ruim = path.join(path.dirname(zip), 'outro.zip')
      writeFileSync(ruim, montarZip({ 'fotos/a.txt': 'não é a obra' }))
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      // como no Cloudflare: o site não tem a pasta da obra
      await contexto.route('**/dados_obra/**', (r: any) => r.fulfill({ status: 404, body: '' }))
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const print = async (n: string) => {
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `zip-${nome}-${n}.png`), fullPage: true })
      }
      try {
        await irAoApp(p)
        await p.getByRole('heading', { name: 'Sem conta, sem internet' }).waitFor({ timeout: 30_000 })
        await print('1-entrar')

        // um .zip que não é a obra: avisa e fica na mesma tela
        await p.getByLabel('Pacote da obra (.zip)').setInputFiles(ruim)
        await p.getByRole('alert').filter({ hasText: 'não é o pacote da obra' }).waitFor()

        // o pacote certo: guarda as plantas e cai no menu da EXE
        await p.getByLabel('Pacote da obra (.zip)').setInputFiles(zip)
        await p.getByText('Sem conta: tudo fica guardado neste aparelho.').waitFor({ timeout: 30_000 })
        await p.getByRole('heading', { name: /EXE/ }).waitFor()
        await comPavimentosDoAparelho(p, (lista) => lista.filter({ hasText: /^3º Pavimento$/ }).waitFor())
        await print('2-menu')

        // fechado e aberto de novo, sem a pasta e sem o .zip: abre direto na obra, com a planta
        await p.reload()
        await p.getByText('Sem conta: tudo fica guardado neste aparelho.').waitFor({ timeout: 30_000 })
        await p.getByRole('button', { name: /^FVS/ }).click()
        await p.getByRole('button', { name: 'Abrir', exact: true }).click()
        await p.fill('.fv-busca', 'P1')
        await p.press('.fv-busca', 'Enter')
        await p.waitForFunction(() => document.querySelector('.fv-nm')?.textContent === 'P1')
        await print('3-planta')

        // pelo menu, um pacote novo (aqui o mesmo) entra de novo sem perder nada
        await irAoApp(p)
        await p.getByText('Sem conta: tudo fica guardado neste aparelho.').waitFor({ timeout: 30_000 })
        await (await abrirMenuObra(p)).getByTestId('abrir-pacote').getByRole('button', { name: 'Trocar de obra / abrir pacote (.zip)' }).waitFor()
        await p.getByLabel('Pacote da obra (.zip)').setInputFiles(zip)
        await p.getByText('Sem conta: tudo fica guardado neste aparelho.').waitFor({ timeout: 30_000 })
        await comPavimentosDoAparelho(p, (lista) => lista.filter({ hasText: /^3º Pavimento$/ }).waitFor())

        // nada saiu da tela pelos lados
        expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        expect(erros).toEqual([])
      } finally {
        await contexto.close()
        rmSync(path.dirname(zip), { recursive: true, force: true })
      }
    }, 120_000)
  }

  /** O mesmo pacote com a planta pesando `mb` MB (o .bin vai sem compressão, como no pacote de verdade). */
  function zipPesado(mb: number): string {
    const pasta = path.join(SAIDA, 'dados_obra')
    const bin = new Uint8Array(mb * 1024 * 1024)
    const indice = JSON.parse(readFileSync(path.join(pasta, 'indice.json'), 'utf-8'))
    indice.pavimentos[0].plantas[0].pacote = conferencia(bin)
    const destino = path.join(mkdtempSync(path.join(os.tmpdir(), 'sistema-obra-zip-')), 'EXE_pesado.zip')
    writeFileSync(
      destino,
      montarZip({
        'dados_obra/indice.json': JSON.stringify(indice),
        'dados_obra/fichas.json': new Uint8Array(readFileSync(path.join(pasta, 'fichas.json'))),
        'dados_obra/pav/planta/manifest.json': new Uint8Array(readFileSync(path.join(pasta, 'pav/planta/manifest.json'))),
        'dados_obra/pav/planta/pacote.bin': bin,
      }),
    )
    return destino
  }

  for (const [nome, largura, altura] of [
    ['celular', 375, 812],
    ['tablet', 1280, 800],
  ] as const) {
    it(`${nome} ${largura}x${altura}: aparelho com 60 MB e pacote de 80 MB: diz quanto liberar, não grava nada e deixa escolher outro arquivo`, async () => {
      const pesado = zipPesado(80)
      const leve = zipDaPasta(undefined, 'EXE_pacote.zip', path.dirname(pesado))
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      await contexto.route('**/dados_obra/**', (r: any) => r.fulfill({ status: 404, body: '' }))
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      try {
        // o aparelho do Testador: 60 MB para o site (Storage.overrideQuotaForOrigin, como no Chrome com o disco cheio)
        const cdp = await contexto.newCDPSession(p)
        await cdp.send('Storage.overrideQuotaForOrigin', { origin: new URL(url).origin, quotaSize: 60 * 1024 * 1024 })
        await irAoApp(p)
        await p.getByRole('heading', { name: 'Sem conta, sem internet' }).waitFor({ timeout: 30_000 })

        await p.getByLabel('Pacote da obra (.zip)').setInputFiles(pesado)
        const aviso = p.getByRole('alert').filter({ hasText: 'Não coube no aparelho' })
        await aviso.waitFor({ timeout: 30_000 })
        expect(await aviso.textContent()).toMatch(/precisa de cerca de 80 MB(?: e há \d+ MB livres)?\. Libere pelo menos \d+ MB/)
        expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `espaco-${nome}-1-nao-coube.png`), fullPage: true })

        // nada ficou gravado pela metade: a planta não está no aparelho
        const plantas = () =>
          p.evaluate(
            () =>
              new Promise<number>((ok) => {
                const r = indexedDB.open('sistema-obra-fvs')
                r.onsuccess = () => {
                  const db = r.result
                  if (!db.objectStoreNames.contains('pacotes')) return ok(0)
                  const c = db.transaction('pacotes').objectStore('pacotes').count()
                  c.onsuccess = () => ok(c.result)
                }
                r.onerror = () => ok(-1)
              }),
          )
        expect(await plantas()).toBe(0)

        // tentar de novo sem liberar: o mesmo aviso, sem o texto preso da tentativa anterior
        await p.evaluate(() => {
          const w = window as any
          w.textosVistos = []
          new MutationObserver(() => {
            const t = document.querySelector('[data-testid=preparando]')?.textContent
            if (t && w.textosVistos[w.textosVistos.length - 1] !== t) w.textosVistos.push(t)
          }).observe(document.body, { childList: true, subtree: true, characterData: true })
        })
        await p.getByRole('button', { name: 'Tentar de novo' }).click()
        await p.waitForFunction(() => (window as any).textosVistos.length > 0 && document.querySelector('[role=alert]'), null, { timeout: 30_000 })
        expect(await aviso.count()).toBe(1)
        expect((await p.evaluate(() => (window as any).textosVistos))[0]).toBe('Abrindo a obra EXE…')

        // escolher outro arquivo (o pacote certo, menor) pela mesma tela: entra na obra
        await p.getByRole('button', { name: 'Escolher outro arquivo' }).waitFor()
        await p.getByLabel('Pacote da obra (.zip)').setInputFiles(leve)
        await p.getByText('Sem conta: tudo fica guardado neste aparelho.').waitFor({ timeout: 30_000 })
        await comPavimentosDoAparelho(p, (lista) => lista.filter({ hasText: /^3º Pavimento$/ }).waitFor())
        expect(await plantas()).toBe(1)
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `espaco-${nome}-2-outro-arquivo.png`), fullPage: true })
        expect(erros).toEqual([])
      } finally {
        await contexto.close()
        rmSync(path.dirname(pesado), { recursive: true, force: true })
      }
    }, 120_000)
  }

  for (const [nome, largura, altura] of [
    ['celular', 375, 812],
    ['tablet', 1280, 800],
  ] as const) {
    it(`${nome} ${largura}x${altura}: .zip de outra obra ou mais antigo pede confirmação; cancelar não mexe em nada`, async () => {
      const zipCerto = zipDaPasta((i) => ({ ...i, gerado_em: '2026-11-08T13:00:00Z' }))
      const pasta = path.dirname(zipCerto)
      const outra = zipDaPasta((i) => ({ ...i, obra: 'OUTRA2', nome: 'Outra Obra', gerado_em: '2026-11-09T11:30:00Z' }), 'OUTRA2.zip', pasta)
      const antigo = zipDaPasta((i) => ({ ...i, gerado_em: '2026-11-01T13:00:00Z' }), 'EXE_antigo.zip', pasta)
      const novo = zipDaPasta((i) => ({ ...i, gerado_em: '2026-11-10T13:00:00Z' }), 'EXE_novo.zip', pasta)
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      await contexto.route('**/dados_obra/**', (r: any) => r.fulfill({ status: 404, body: '' }))
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const naLac = async () => {
        await p.getByText('Sem conta: tudo fica guardado neste aparelho.').waitFor({ timeout: 30_000 })
        await p.getByRole('heading', { name: /EXE/ }).waitFor()
      }
      const banco = () => p.evaluate(() => new Promise<string>((ok) => {
        const r = indexedDB.open('sistema-obra')
        r.onsuccess = () => {
          const tx = r.result.transaction(['meta', 'registros'])
          const meta = tx.objectStore('meta').getAll()
          const registros = tx.objectStore('registros').getAll()
          tx.oncomplete = () => {
            ok(JSON.stringify([meta.result, registros.result]))
            r.result.close()
          }
        }
      }))
      try {
        // primeira vez, aparelho vazio: o .zip da EXE abre sem perguntar
        await irAoApp(p)
        await p.getByLabel('Pacote da obra (.zip)').setInputFiles(zipCerto)
        await naLac()
        const antes = await banco()

        // .zip de outra obra: mostra as duas, com data; cancelar volta ao menu da EXE sem mexer em nada
        await abrirMenuObra(p) // o pacote .zip fica no menu da obra (topo, 20/11/2026)
        await p.getByLabel('Pacote da obra (.zip)').setInputFiles(outra)
        await p.getByRole('heading', { name: 'Trocar de obra?' }).waitFor()
        const quadro = await p.getByTestId('comparacao-pacote').innerText()
        expect(quadro).toContain('Obra OUTRA2 (Outra Obra), gerado em 09/11/2026 às 08:30')
        expect(quadro).toContain('Obra EXE (Obra Exemplo), pacote de 08/11/2026 às 10:00')
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `zip-${nome}-5-trocar-obra.png`), fullPage: true })
        expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await p.getByRole('button', { name: 'Cancelar' }).click()
        await naLac()
        expect(await banco()).toBe(antes)

        // .zip mais antigo da mesma obra: pede confirmação; cancelar também não mexe
        await abrirMenuObra(p) // o pacote .zip fica no menu da obra (topo, 20/11/2026)
        await p.getByLabel('Pacote da obra (.zip)').setInputFiles(antigo)
        await p.getByRole('heading', { name: 'Abrir um pacote mais antigo?' }).waitFor()
        expect(await p.getByTestId('comparacao-pacote').innerText()).toContain('gerado em 01/11/2026 às 10:00')
        await p.getByRole('button', { name: 'Cancelar' }).click()
        await naLac()
        expect(await banco()).toBe(antes)

        // mais novo da mesma obra: segue direto
        await abrirMenuObra(p) // o pacote .zip fica no menu da obra (topo, 20/11/2026)
        await p.getByLabel('Pacote da obra (.zip)').setInputFiles(novo)
        await naLac()
        expect(await p.getByRole('heading', { name: /pacote mais antigo|Trocar de obra/ }).count()).toBe(0)

        // confirmando a troca, o app passa para a outra obra
        await abrirMenuObra(p) // o pacote .zip fica no menu da obra (topo, 20/11/2026)
        await p.getByLabel('Pacote da obra (.zip)').setInputFiles(outra)
        await p.getByRole('button', { name: 'Trocar para a obra OUTRA2' }).click()
        await p.getByRole('heading', { name: /OUTRA2/ }).waitFor({ timeout: 30_000 })
        expect(erros).toEqual([])
      } finally {
        await contexto.close()
        rmSync(pasta, { recursive: true, force: true })
      }
    }, 150_000)
  }

  // Com a pasta da obra ao lado do app, a pessoa troca para outra obra por um .zip e recarrega:
  // a obra escolhida continua (antes a pasta ganhava sempre; demonstração, 14/11).
  for (const [nome, largura, altura] of [
    ['celular', 375, 812],
    ['tablet', 1280, 800],
  ] as const) {
    it(`${nome} ${largura}x${altura}: com a pasta ao lado, a obra escolhida por .zip continua depois de recarregar`, async () => {
      const outra = zipDaPasta((i) => ({ ...i, obra: 'OUTRA2', nome: 'Outra Obra', gerado_em: '2026-11-09T11:30:00Z' }), 'OUTRA2.zip')
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      try {
        // primeira vez: a pasta (EXE) abre direto
        await irAoApp(p)
        await p.getByRole('heading', { name: /EXE/ }).waitFor({ timeout: 30_000 })
        // troca para a outra obra pelo .zip
        await abrirMenuObra(p) // o pacote .zip fica no menu da obra (topo, 20/11/2026)
        await p.getByLabel('Pacote da obra (.zip)').setInputFiles(outra)
        await p.getByRole('button', { name: 'Trocar para a obra OUTRA2' }).click()
        await p.getByRole('heading', { name: /OUTRA2/ }).waitFor({ timeout: 30_000 })
        // recarrega (F5, ou fecha e abre o app): continua na OUTRA2, com a pasta da EXE ainda ao lado
        await p.reload()
        await p.getByRole('heading', { name: /OUTRA2/ }).waitFor({ timeout: 30_000 })
        expect(await p.getByRole('heading', { name: /EXE/ }).count()).toBe(0)
        // e a planta da obra escolhida abre (veio do .zip, guardada no aparelho)
        await p.getByRole('button', { name: /^FVS/ }).click()
        await p.getByRole('button', { name: 'Abrir', exact: true }).first().click()
        await p.locator('.fv-mapa .leaflet-tile').first().waitFor({ timeout: 30_000 })
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `obra-escolhida-${nome}.png`) })
        expect(erros).toEqual([])
      } finally {
        await contexto.close()
        rmSync(path.dirname(outra), { recursive: true, force: true })
      }
    }, 150_000)
  }

  // Sistema oficial (docs/modulos/integracoes.md): o pacote de teste não tem sistema_oficial. Marcado no app,
  // nada de lançamento nem de "Ficha no ..." aparece. Com um galho instalado, o mesmo pacote com o campo
  // mostra tudo de novo, com o nome do galho.
  for (const [nome, largura, altura] of [
    ['celular', 375, 812],
    ['tablet', 1280, 800],
  ] as const) {
    it(`${nome} ${largura}x${altura}: pacote sem sistema_oficial não mostra nada de sistema oficial`, async () => {
      const galho = sistemasInstalados()[0] ?? null
      // uma ficha aberta no sistema oficial, sem peça no app (vai para a lista "fichas do histórico")
      const historico = {
        fichas_campo: [
          { id: '7c1e2a40-0000-4000-8000-000000000001', codigo: 'FIC-0001', local: 'Local do exemplo', status: 'Em andamento', ficha_codigo: null, elemento_id: null, qtd_a: 1, qtd_r: 0, qtd_na: 0 },
        ],
        eventos: [],
      }
      const semSistemaComHistorico = zipDaPasta((i) => ({ ...i, gerado_em: new Date(Date.now() - 120_000).toISOString() }), 'EXE_historico_sem_sistema.zip', undefined, historico)
      const comSistema = galho ? zipDaPasta((i) => ({ ...i, sistema_oficial: galho.id, gerado_em: new Date(Date.now() - 60_000).toISOString() }), 'EXE_com_sistema.zip', undefined, historico) : null
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const naObra = () => p.getByText('Sem conta: tudo fica guardado neste aparelho.').waitFor({ timeout: 30_000 })
      const texto = () => p.evaluate(() => document.body.innerText)
      const print = async (n: string) => {
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `sistema-${nome}-${n}.png`), fullPage: true })
      }
      const formDoConcreto = async () => {
        await p.getByRole('button', { name: /^Concreto/ }).click()
        await p.getByText('3º Pavimento').first().click()
        await p.getByRole('button', { name: /Nova concretagem/ }).click()
        await p.getByText('Data', { exact: true }).waitFor()
      }
      try {
        await abrirNaObra(p)
        // marca C no P1: algo para lançar, se a obra tivesse sistema oficial
        await p.getByRole('button', { name: /^FVS/ }).click()
        await p.getByRole('button', { name: 'Abrir', exact: true }).click()
        await p.fill('.fv-busca', 'P1')
        await p.press('.fv-busca', 'Enter')
        await p.waitForFunction(() => document.querySelector('.fv-nm')?.textContent === 'P1')
        await p.locator('.fv-item[data-item="1"] button[data-r="C"]').click()
        await p.locator('.fv-sit', { hasText: /Liberad|Em andamento/ }).first().waitFor()
        await p.getByRole('button', { name: 'Voltar', exact: true }).first().click()
        await p.getByRole('heading', { name: 'FVS', exact: true }).waitFor()
        // sem conta não há servidor: a marcação não vira "esperando envio" (obra de demonstração, 13/11)
        expect(await p.getByText(/esperando envio|quando a internet voltar/).count()).toBe(0)
        await print('1-fvs-sem-sistema')
        expect(await p.getByTestId('fvs-entra-lancamento').count()).toBe(0)
        expect(await p.getByTestId('fvs-entra-duplicadas').count()).toBe(0)
        expect(await texto()).not.toMatch(/sistema oficial|lançar no/i)
        if (galho) expect((await texto()).toLowerCase()).not.toContain(galho.nome.toLowerCase())
        await p.getByRole('button', { name: 'Voltar ao menu', exact: true }).first().click()
        await naObra()

        // Concreto: sem o campo da ficha do sistema oficial
        await formDoConcreto()
        await print('2-concreto-sem-sistema')
        // sem conta não há servidor: a marcação da FVS não vira "esperando envio" no Concreto (obra de demonstração, 13/11)
        expect(await p.getByText(/esperando envio|quando a internet voltar/).count()).toBe(0)
        expect(await p.getByText(/^Nº da ficha/).count()).toBe(0)
        expect(await texto()).not.toMatch(/sistema oficial/i)

        // pacote com historico.json mas sem sistema_oficial: aviso discreto no início da FVS, nada mais
        await irAoApp(p)
        await naObra()
        await abrirMenuObra(p) // o pacote .zip fica no menu da obra (topo, 20/11/2026)
        await p.getByLabel('Pacote da obra (.zip)').setInputFiles(semSistemaComHistorico)
        await naObra()
        await p.getByRole('button', { name: /^FVS/ }).click()
        const avisoSistema = p.getByTestId('fvs-aviso-sistema')
        await avisoSistema.waitFor()
        expect(await avisoSistema.innerText()).toBe(
          'Este pacote tem histórico de um sistema oficial, mas não diz qual. Gere o pacote de novo com --sistema-oficial.',
        )
        expect(await p.getByTestId('fvs-entra-lancamento').count()).toBe(0)
        expect(await p.getByTestId('fvs-entra-duplicadas').count()).toBe(0)
        await print('2b-fvs-historico-sem-sistema')
        await p.getByRole('button', { name: 'Voltar ao menu', exact: true }).first().click()
        await naObra()

        if (galho && comSistema) {
          // o mesmo pacote com sistema_oficial: o lançamento e o campo voltam, com o nome do galho
          await irAoApp(p)
          await naObra()
          await abrirMenuObra(p) // o pacote .zip fica no menu da obra (topo, 20/11/2026)
          await p.getByLabel('Pacote da obra (.zip)').setInputFiles(comSistema)
          await naObra()
          await p.getByRole('button', { name: /^FVS/ }).click()
          const entrada = p.getByTestId('fvs-entra-lancamento')
          await entrada.waitFor()
          expect(await entrada.innerText()).toContain(`para lançar no ${galho.nome}`)
          expect(await p.getByTestId('fvs-aviso-sistema').count()).toBe(0)
          await print('3-fvs-com-sistema')
          await p.getByRole('button', { name: 'Voltar ao menu', exact: true }).first().click()
          await naObra()
          await formDoConcreto()
          await p.getByText('Nº da ficha', { exact: true }).waitFor()
          await print('4-concreto-com-sistema')
        }
        expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(largura)
        expect(erros).toEqual([])
      } finally {
        await contexto.close()
        if (comSistema) rmSync(path.dirname(comSistema), { recursive: true, force: true })
      }
    }, 150_000)
  }

  it('tablet: planta tirada do aparelho pede o .zip de novo sem perder marcação nem registro', async () => {
    const zip = zipDaPasta()
    const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: 1280, height: 800 } })
    await contexto.route('**/dados_obra/**', (r: any) => r.fulfill({ status: 404, body: '' }))
    const p: Page = await contexto.newPage()
    const erros: string[] = []
    p.on('pageerror', (e: Error) => erros.push(e.message))
    const naObra = () => p.getByText('Sem conta: tudo fica guardado neste aparelho.').waitFor({ timeout: 30_000 })
    const guardados = () => p.getByText(/registros? guardados? neste aparelho\./).innerText()
    const conferirP1 = async () => {
      await p.fill('.fv-busca', 'P1')
      await p.press('.fv-busca', 'Enter')
      await p.waitForFunction(() => document.querySelector('.fv-nm')?.textContent === 'P1')
      expect(await p.locator('.fv-sit').first().innerText()).toBe('Com NC')
      expect(await p.locator('.fv-item[data-item="1"] textarea').inputValue()).toBe('Fora de prumo')
    }
    try {
      // abre o .zip (como o Android: escolhe o arquivo) e marca NC com texto no P1
      await irAoApp(p)
      await p.getByLabel('Pacote da obra (.zip)').setInputFiles(zip)
      await naObra()
      await p.getByRole('button', { name: /^FVS/ }).click()
      await p.getByRole('button', { name: 'Abrir', exact: true }).click()
      await p.fill('.fv-busca', 'P1')
      await p.press('.fv-busca', 'Enter')
      await p.waitForFunction(() => document.querySelector('.fv-nm')?.textContent === 'P1')
      await p.locator('.fv-item[data-item="1"] button[data-r="NC"]').click()
      const campo = p.locator('.fv-item[data-item="1"] textarea')
      await campo.fill('Fora de prumo')
      await campo.blur()
      await p.locator('.fv-hist-obs', { hasText: 'Fora de prumo' }).waitFor({ state: 'attached' })
      await irAoApp(p)
      await naObra()
      const antes = await guardados()

      // as plantas saem do aparelho (o banco só delas), longe do app aberto
      await p.goto(url + 'icone.svg')
      await p.evaluate(() => new Promise<void>((ok, falha) => {
        const r = indexedDB.deleteDatabase('sistema-obra-fvs')
        r.onsuccess = () => ok()
        r.onerror = () => falha(r.error)
        r.onblocked = () => falha(new Error('bloqueado'))
      }))

      // sem o .zip nesta sessão: a planta pede o pacote, e nada do que foi marcado sai
      await irAoApp(p)
      await naObra()
      expect(await guardados()).toBe(antes)
      await p.getByRole('button', { name: /^FVS/ }).click()
      await p.locator('.fv-baixar').first().click()
      await p.getByRole('alert').filter({ hasText: 'abra o pacote da obra (.zip) no menu' }).waitFor()
      await p.getByRole('button', { name: 'Voltar ao menu', exact: true }).click()
      await naObra()
      expect(await guardados()).toBe(antes)

      // abre o .zip pelo menu: a planta volta e o P1 continua com o NC e o texto
      await abrirMenuObra(p) // o pacote .zip fica no menu da obra (topo, 20/11/2026)
      await p.getByLabel('Pacote da obra (.zip)').setInputFiles(zip)
      await naObra()
      expect(await guardados()).toBe(antes)
      await p.getByRole('button', { name: /^FVS/ }).click()
      await p.getByRole('button', { name: 'Abrir', exact: true }).click()
      await conferirP1()
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, 'zip-tablet-4-planta-de-volta.png'), fullPage: true })
      expect(erros).toEqual([])
    } finally {
      await contexto.close()
      rmSync(path.dirname(zip), { recursive: true, force: true })
    }
  }, 150_000)

  it('o site compilado não lê ?dados= e não leva dado de obra; com dados_obra/ em public/, o build falha', async () => {
    // o build do beforeAll (o mesmo do Cloudflare): sem ?dados= e com o manifesto pedido com o cookie (Access)
    const js = readdirSync(path.join(SAIDA, 'assets')).filter((n) => n.endsWith('.js')).map((n) => readFileSync(path.join(SAIDA, 'assets', n), 'utf-8')).join('\n')
    // o compilador escreve os textos com crase: get(`dados`)
    expect(js).toMatch(/["'`]dados_obra\/["'`]/) // o código do pacote está aqui: a busca abaixo vale
    expect(js).not.toMatch(/\.get\(["'`]dados["'`]\)/)
    // nem o nome da obra nem o da construtora
    const textos = [js, ...readdirSync(path.join(SAIDA, 'assets')).filter((n) => n.endsWith('.css')).map((n) => readFileSync(path.join(SAIDA, 'assets', n), 'utf-8')), readFileSync(path.join(SAIDA, 'index.html'), 'utf-8'), readFileSync(path.join(SAIDA, 'manifest.webmanifest'), 'utf-8')]
    const proibidos = lerNomesProibidos(path.resolve(RAIZ, '..'))
    expect(textos.flatMap((t) => nomesNoTexto(t, proibidos))).toEqual([])
    expect(readFileSync(path.join(SAIDA, 'index.html'), 'utf-8')).toMatch(/<link rel="manifest"[^>]*crossorigin="use-credentials"/)

    // alguém deixa a pasta da obra em public/: o build para antes de publicar
    const publico = mkdtempSync(path.join(os.tmpdir(), 'sistema-obra-public-'))
    const saida = mkdtempSync(path.join(os.tmpdir(), 'sistema-obra-dist-'))
    // compila como o Cloudflare (produção): em modo de teste o JSX leva o caminho das pastas do PC
    const ambiente = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      cpSync(path.join(RAIZ, 'public'), publico, { recursive: true })
      mkdirSync(path.join(publico, 'dados_obra'))
      writeFileSync(path.join(publico, 'dados_obra', 'indice.json'), '{"obra":"EXE","pavimentos":[]}')
      await expect(build({ root: RAIZ, publicDir: publico, logLevel: 'silent', build: { outDir: saida, emptyOutDir: true } })).rejects.toThrow(/não é do app no site compilado.*dados_obra\/indice\.json/)
      // e qualquer outro arquivo que não está na lista do app (uma foto, por exemplo)
      rmSync(path.join(publico, 'dados_obra'), { recursive: true })
      writeFileSync(path.join(publico, 'foto.jpg'), 'não é do app')
      await expect(build({ root: RAIZ, publicDir: publico, logLevel: 'silent', build: { outDir: saida, emptyOutDir: true } })).rejects.toThrow(/não é do app no site compilado.*foto\.jpg/)
    } finally {
      process.env.NODE_ENV = ambiente
      rmSync(publico, { recursive: true, force: true })
      rmSync(saida, { recursive: true, force: true })
    }
  }, 180_000)

  it('tablet: a ficha muda de revisão na pasta da obra e o que foi marcado continua na tela', async () => {
    const arquivoDeFichas = path.join(SAIDA, 'dados_obra', 'fichas.json')
    const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: 1280, height: 800 } })
    const p: Page = await contexto.newPage()
    const erros: string[] = []
    p.on('pageerror', (e: Error) => erros.push(e.message))
    const abrirP1 = async () => {
      await p.getByRole('button', { name: /^FVS/ }).click()
      await p.getByRole('button', { name: 'Abrir', exact: true }).click()
      await p.fill('.fv-busca', 'P1')
      await p.press('.fv-busca', 'Enter')
      await p.waitForFunction(() => document.querySelector('.fv-nm')?.textContent === 'P1')
    }
    const observacao = p.locator('.fv-hist-obs', { hasText: 'Fora de prumo' })
    const totalDoHistorico = () => p.getByTestId('fvs-hist-peca').locator('summary').innerText()
    try {
      // marca R no P1, na rev. 0 da ficha, com o "O que fazer?"
      await abrirNaObra(p)
      await abrirP1()
      await p.locator('.fv-item[data-item="1"] button[data-r="NC"]').click()
      const campo = p.locator('.fv-item[data-item="1"] textarea')
      await campo.fill('Fora de prumo')
      await campo.blur()
      await observacao.waitFor({ state: 'attached' })
      await p.waitForFunction(() => document.querySelector('.fv-sit')?.textContent === 'Com NC')
      const antes = await totalDoHistorico()

      // sai a rev. 1 da ficha na pasta da obra (com um item a mais), e o app é aberto de novo
      writeFileSync(arquivoDeFichas, JSON.stringify([{ ...FICHA_DE_TESTE, revisao: '1', itens: [...FICHA_DE_TESTE.itens, { n: 2, etapa: 'MONTAGEM', titulo: 'Nível da fôrma' }] }]))
      await abrirNaObra(p)
      await abrirP1()

      // a peça continua com NC na rev. 0, com o texto e o histórico; o painel avisa que a vigente é a rev. 1
      expect(await p.getByTestId('fvs-ficha-do-painel').innerText()).toContain('rev. 0 (a vigente é a rev. 1; esta peça foi marcada nesta)')
      expect(await p.locator('.fv-sit').first().innerText()).toBe('Com NC')
      expect(await p.locator('.fv-item[data-item="1"] textarea').inputValue()).toBe('Fora de prumo')
      await observacao.waitFor({ state: 'attached' })
      expect(await totalDoHistorico()).toBe(antes)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, 'local-tablet-3-revisao-nova.png'), fullPage: true })
      expect(erros).toEqual([])
    } finally {
      writeFileSync(arquivoDeFichas, JSON.stringify([FICHA_DE_TESTE]))
      await contexto.close()
    }
  }, 120_000)

  it('tablet: .obra marcado na rev. 0 e restaurado noutro aparelho que já tem a rev. 1 (falha N1)', async () => {
    const arquivoDeFichas = path.join(SAIDA, 'dados_obra', 'fichas.json')
    const tablet = await navegador.newContext({ ...NO_BRASIL, viewport: { width: 1280, height: 800 }, acceptDownloads: true })
    const outro = await navegador.newContext({ ...NO_BRASIL, viewport: { width: 1280, height: 800 } })
    const erros: string[] = []
    const abrirP1 = async (p: Page) => {
      await p.getByRole('button', { name: /^FVS/ }).click()
      await p.getByRole('button', { name: 'Abrir', exact: true }).click()
      await p.fill('.fv-busca', 'P1')
      await p.press('.fv-busca', 'Enter')
      await p.waitForFunction(() => document.querySelector('.fv-nm')?.textContent === 'P1')
    }
    try {
      // o tablet marca R no P1 na rev. 0 e salva o .obra
      const p: Page = await tablet.newPage()
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await abrirNaObra(p)
      await abrirP1(p)
      await p.locator('.fv-item[data-item="1"] button[data-r="NC"]').click()
      const campo = p.locator('.fv-item[data-item="1"] textarea')
      await campo.fill('Fora de prumo')
      await campo.blur()
      await p.locator('.fv-hist-obs', { hasText: 'Fora de prumo' }).waitFor({ state: 'attached' })
      await p.waitForFunction(() => document.querySelector('.fv-sit')?.textContent === 'Com NC')
      await abrirNaObra(p)
      await abrirCopia(p)
      const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Salvar arquivo' }).click()])
      const arquivo = await download.path()

      // sai a rev. 1; o outro aparelho abre o app (já com a rev. 1) e só depois restaura
      writeFileSync(arquivoDeFichas, JSON.stringify([{ ...FICHA_DE_TESTE, revisao: '1', itens: [...FICHA_DE_TESTE.itens, { n: 2, etapa: 'MONTAGEM', titulo: 'Nível da fôrma' }] }]))
      const q: Page = await outro.newPage()
      q.on('pageerror', (e: Error) => erros.push(e.message))
      await abrirNaObra(q)
      await q.getByLabel('Arquivo de salvamento').setInputFiles(arquivo)
      await q.getByText(/^[1-9]\d* registros restaurados, 0 já estavam aqui\.$/).waitFor()

      // fechado e aberto de novo, o P1 mostra o R da rev. 0, com o texto, como no tablet
      for (let vez = 0; vez < 2; vez++) {
        await abrirNaObra(q)
        await abrirP1(q)
        expect(await q.getByTestId('fvs-ficha-do-painel').innerText()).toContain('rev. 0 (a vigente é a rev. 1; esta peça foi marcada nesta)')
        expect(await q.locator('.fv-sit').first().innerText()).toBe('Com NC')
        expect(await q.locator('.fv-item[data-item="1"] textarea').inputValue()).toBe('Fora de prumo')
        await q.locator('.fv-hist-obs', { hasText: 'Fora de prumo' }).waitFor({ state: 'attached' })
      }
      if (PRINTS) await q.screenshot({ path: path.join(PRINTS, 'local-tablet-4-obra-rev0-restaurado.png'), fullPage: true })
      expect(erros).toEqual([])
    } finally {
      writeFileSync(arquivoDeFichas, JSON.stringify([FICHA_DE_TESTE]))
      await outro.close()
      await tablet.close()
    }
  }, 150_000)

  it('tablet: .obra de antes da troca para C/NC (com A e R) restaura e aparece como C e NC', async () => {
    const tablet = await navegador.newContext({ ...NO_BRASIL, viewport: { width: 1280, height: 800 }, acceptDownloads: true })
    const outro = await navegador.newContext({ ...NO_BRASIL, viewport: { width: 1280, height: 800 } })
    const erros: string[] = []
    const abrirP1 = async (p: Page) => {
      await p.getByRole('button', { name: /^FVS/ }).click()
      await p.getByRole('button', { name: 'Abrir', exact: true }).click()
      await p.fill('.fv-busca', 'P1')
      await p.press('.fv-busca', 'Enter')
      await p.waitForFunction(() => document.querySelector('.fv-nm')?.textContent === 'P1')
    }
    try {
      // marca NC com texto no P1 e salva o .obra
      const p: Page = await tablet.newPage()
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await abrirNaObra(p)
      await abrirP1(p)
      await p.locator('.fv-item[data-item="1"] button[data-r="NC"]').click()
      const campo = p.locator('.fv-item[data-item="1"] textarea')
      await campo.fill('Fora de prumo')
      await campo.blur()
      await p.locator('.fv-hist-obs', { hasText: 'Fora de prumo' }).waitFor({ state: 'attached' })
      await abrirNaObra(p)
      await abrirCopia(p)
      const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Salvar arquivo' }).click()])
      const bruto = readFileSync(await download.path())
      const json = (bruto[0] === 0x1f && bruto[1] === 0x8b ? gunzipSync(bruto) : bruto).toString('utf-8')

      // o mesmo arquivo como o app gravava até 08/11/2026: R no lugar de NC, JSON sem compressão
      expect(json).toContain('"resultado":"NC"')
      const antigo = path.join(SAIDA, 'salvo-antigo.obra')
      writeFileSync(antigo, json.replaceAll('"resultado":"NC"', '"resultado":"R"'))

      const q: Page = await outro.newPage()
      q.on('pageerror', (e: Error) => erros.push(e.message))
      await abrirNaObra(q)
      await q.getByLabel('Arquivo de salvamento').setInputFiles(antigo)
      await q.getByText(/^[1-9]\d* registros restaurados, 0 já estavam aqui\.$/).waitFor()
      await abrirNaObra(q)
      await abrirP1(q)
      expect(await q.locator('.fv-sit').first().innerText()).toBe('Com NC')
      await q.locator('.fv-item[data-item="1"] button[data-r="NC"].on').waitFor()
      expect(await q.locator('.fv-item[data-item="1"] textarea').inputValue()).toBe('Fora de prumo')
      // a reinspeção do NC antigo funciona: C vai para a rodada seguinte
      await q.locator('.fv-item[data-item="1"] button[data-r="C"]').click()
      await q.locator('.fv-item[data-item="1"] button[data-r="C"].on').waitFor()
      await q.waitForFunction(() => document.querySelector('.fv-sit')?.textContent !== 'Com NC')
      expect(erros).toEqual([])
    } finally {
      await outro.close()
      await tablet.close()
    }
  }, 150_000)

  // Tema (14/11/2026): escuro por padrão e "Modo sol (claro)" no menu, lembrado no aparelho.
  // Nos dois temas, todo texto visível tem contraste de 4,5:1 ou mais (WCAG AA) no menu, na FVS,
  // na planta e na ficha.
  for (const [largura, altura] of [
    [375, 812],
    [768, 1024],
  ] as const) {
    it(`${largura}x${altura}: tema escuro e modo sol, contraste ≥ 4,5:1 nos dois`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      try {
        const passar = async (tema: string) => {
          const fundo = await p.evaluate(() => getComputedStyle(document.body).backgroundColor)
          for (const [tela, abrir] of [
            ['menu', async () => {}],
            ['fvs', async () => {
              await p.getByRole('button', { name: /^FVS/ }).click()
              await p.getByRole('button', { name: 'Abrir', exact: true }).waitFor()
            }],
            ['planta e ficha', async () => {
              await p.getByRole('button', { name: 'Abrir', exact: true }).click()
              await p.fill('.fv-busca', 'P1')
              await p.press('.fv-busca', 'Enter')
              await p.waitForFunction(() => document.querySelector('.fv-nm')?.textContent === 'P1')
              await p.waitForTimeout(400)
            }],
          ] as const) {
            await abrir()
            if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `tema-${tema}-${largura}-${tela}.png`) })
            expect(await contrasteBaixo(p), `${tema}, ${tela}`).toEqual([])
          }
          return fundo
        }

        // sem escolha: escuro, com o botão do modo sol no menu
        await abrirNaObra(p)
        const botao = p.getByTestId('botao-tema')
        expect(await botao.getAttribute('aria-label')).toBe('Modo sol (claro)')
        expect(await p.getByRole('button', { name: 'Modo sol (claro)', exact: true }).count()).toBe(1)
        expect((await botao.boundingBox()).height).toBeGreaterThanOrEqual(44)
        expect((await botao.boundingBox()).width).toBeGreaterThanOrEqual(44)
        expect(await passar('escuro')).toBe('rgb(18, 20, 22)')

        // modo sol: claro de hoje, e continua claro depois de fechar e abrir o app
        await abrirNaObra(p)
        await p.getByTestId('botao-tema').click()
        expect(await p.getByTestId('botao-tema').getAttribute('aria-label')).toBe('Modo escuro')
        await abrirNaObra(p)
        expect(await p.evaluate(() => document.documentElement.dataset.tema)).toBe('claro')
        expect(await passar('claro')).toBe('rgb(244, 246, 248)')

        // e volta ao escuro
        await abrirNaObra(p)
        await p.getByTestId('botao-tema').click()
        await abrirNaObra(p)
        expect(await p.evaluate(() => document.documentElement.dataset.tema)).toBeUndefined()
        expect(erros).toEqual([])
      } finally {
        await contexto.close()
      }
    }, 120_000)
  }

  // Telas comuns (front end, 19/11/2026): entrada sem obra, Nova obra e menu com o bloco da cópia aberto,
  // nos dois temas, no celular, no tablet em pé e no tablet deitado. Em todas: contraste ≥ 4,5:1,
  // nada de tocar menor que 44 px, nenhuma rolagem para o lado e nenhum erro na página.
  for (const [largura, altura] of [
    [375, 812],
    [768, 1024],
    [1024, 768],
  ] as const) {
    it(`${largura}x${altura}: telas comuns nos dois temas (contraste, toque de 44 px, sem rolagem lateral)`, async () => {
      for (const tema of ['escuro', 'claro'] as const) {
        const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
        if (tema === 'claro') await contexto.addInitScript(() => localStorage.setItem('tema', 'claro'))
        const p: Page = await contexto.newPage()
        const erros: string[] = []
        p.on('pageerror', (e: Error) => erros.push(e.message))
        const conferir = async (tela: string) => {
          await p.waitForTimeout(300)
          if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `comum-${tema}-${largura}-${tela}.png`), fullPage: true })
          const onde = `${tema}, ${largura}, ${tela}`
          expect(await contrasteBaixo(p), onde).toEqual([])
          expect(await toquesPequenos(p), onde).toEqual([])
          expect(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), onde).toBeLessThanOrEqual(0)
        }
        try {
          // entrada, como no Cloudflare: sem a pasta da obra ao lado
          await contexto.route('**/dados_obra/**', (r: any) => r.fulfill({ status: 404, body: '' }))
          await irAoApp(p)
          await p.getByRole('heading', { name: 'Sem conta, sem internet' }).waitFor({ timeout: 30_000 })
          await conferir('entrada')
          await p.goto(new URL('nova_obra.html', url).href)
          await p.getByRole('heading', { name: 'Nova obra' }).waitFor({ timeout: 30_000 })
          await conferir('nova-obra')
          // menu da obra, com a pasta de volta
          await contexto.unroute('**/dados_obra/**')
          await abrirNaObra(p)
          await comPavimentosDoAparelho(p, (lista) => lista.first().waitFor())
          await conferir('menu')
          await abrirCopia(p)
          await conferir('menu-copia')
          expect(erros, tema).toEqual([])
        } finally {
          await contexto.close()
        }
      }
    }, 180_000)
  }
})

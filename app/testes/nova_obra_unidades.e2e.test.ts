// Versão PC, página "Como conferir" (ideia 14, pendência 11, 25/11/2026), no Chromium com o app compilado e uma
// pasta de obra de teste ao lado (dados_obra/, modo sem conta: a pessoa é administradora da própria obra).
// Troca a unidade de uma ficha, confere que a troca fica gravada depois de reabrir e que a página só aparece
// no PC: no celular (375 px) e no tablet (toque) a barra do PC nem monta.
// Roda com SO_E2E=1 (GitHub, junto com as outras telas) ou SO_BANCADA=1.
//   No PC do Nicolas: SO_BANCADA=1 SO_PLAYWRIGHT=<pasta>/node_modules/playwright SO_CHROME=chrome npx vitest run testes/nova_obra_unidades.e2e.test.ts
// SO_PRINTS=<pasta> salva capturas de tela.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
/* eslint-disable @typescript-eslint/no-explicit-any */
type Page = any

const ATIVO = process.env.SO_E2E === '1' || process.env.SO_BANCADA === '1'
const suite = ATIVO ? describe : describe.skip
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SAIDA = mkdtempSync(path.join(os.tmpdir(), 'sistema-obra-unidades-'))
const PRINTS = process.env.SO_PRINTS
const NO_BRASIL = { timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' }

const PLANTA = 'a2000000-0000-0000-0000-0000000000f1'
const PECA = 'e0000000-0000-0000-0000-000000000001'
const FICHAS = [
  { codigo: 'EXE-PVS-01', titulo: 'Pilares', revisao: '0', aplica_a: ['P'], itens: [{ n: 1, etapa: 'MONTAGEM', titulo: 'Prumo da fôrma', dispositivo: 'Prumo', tolerancia: '2 mm' }] },
  { codigo: 'EXE-PVS-02', titulo: 'Alvenaria', revisao: '0', aplica_a: ['M'], itens: [{ n: 1, etapa: 'EXECUÇÃO', titulo: 'Prumo da parede', dispositivo: 'Prumo', tolerancia: '3 mm' }] },
]

const conferencia = (b: string | Uint8Array) => ({ sha256: createHash('sha256').update(b).digest('hex'), tamanho: Buffer.byteLength(b) })

/** Uma pasta de obra de teste, no formato do exportar_bancada.py, com uma planta sem imagem. */
function escreverPastaDeTeste(saida: string) {
  const pasta = path.join(saida, 'dados_obra')
  mkdirSync(path.join(pasta, 'pav', 'planta'), { recursive: true })
  const manifest = {
    formato: 1,
    planta_id: PLANTA,
    obra: 'EXE',
    pavimento: 'Térreo',
    trecho: 'Planta inteira',
    prancha: 'EXE-FORMA-TERREO-R00',
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
    nome: 'Obra Exemplo',
    pavimentos: [
      {
        nome: 'Térreo',
        pecas: [{ id: PECA, tipo: 'P', nome: 'P1', secao: '19x50' }],
        plantas: [
          { id: PLANTA, trecho: 'Planta inteira', pasta: 'pav/planta/', prancha: 'EXE-FORMA-TERREO-R00', revisao: 'R00', largura: 2000, altura: 1300, elementos: 1, disciplina: 'estrutura', manifest: conferencia(JSON.stringify(manifest)), pacote: conferencia(new Uint8Array()) },
        ],
      },
    ],
  }
  writeFileSync(path.join(pasta, 'indice.json'), JSON.stringify(indice))
  writeFileSync(path.join(pasta, 'fichas.json'), JSON.stringify(FICHAS))
  writeFileSync(path.join(pasta, 'pav', 'planta', 'manifest.json'), JSON.stringify(manifest))
  writeFileSync(path.join(pasta, 'pav', 'planta', 'pacote.bin'), new Uint8Array())
}

let site: PreviewServer
let navegador: any
let url = ''

/** Hoje e ontem em São Paulo, AAAA-MM-DD (como a tela calcula). */
function dia(deslocamento = 0): string {
  const d = new Date(Date.now() + deslocamento * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}

/** Abre o app na obra: no PC (versão PC ligada) ele vai direto para a barra lateral; no toque, o menu. */
async function abrirNaObra(p: Page, pc = false) {
  await p.goto(url)
  if (pc) await p.getByTestId('pc-casca').waitFor({ timeout: 30_000 })
  else await p.getByText('Sem conta: tudo fica guardado neste aparelho.').waitFor({ timeout: 30_000 })
}

async function print(p: Page, nome: string) {
  if (!PRINTS) return
  mkdirSync(PRINTS, { recursive: true })
  await p.screenshot({ path: path.join(PRINTS, `unidades_${nome}.png`), fullPage: true })
}

suite('Versão PC: trocar a unidade de conferência (Chromium)', () => {
  beforeAll(async () => {
    process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:9'
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'chave-publica-de-teste'
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
    navegador = await pw.chromium.launch(process.env.SO_CHROME ? { channel: process.env.SO_CHROME, headless: true } : { headless: true })
  }, 180_000)

  afterAll(async () => {
    await navegador?.close()
    await site?.close()
    rmSync(SAIDA, { recursive: true, force: true })
  })

  it('PC: o administrador troca, a troca fica gravada, a anterior vira histórico e o passado é recusado', async () => {
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 860 }, ...NO_BRASIL })
    await ctx.addInitScript(() => localStorage.setItem('versao_pc', 'ligada'))
    const p = await ctx.newPage()
    try {
      await abrirNaObra(p, true)
      await p.getByTestId('pc-ir-unidades').click()
      await p.getByTestId('pc-pagina-unidades').waitFor()
      const pilares = p.getByTestId('un-ficha-EXE-PVS-01')
      const paredes = p.getByTestId('un-ficha-EXE-PVS-02')
      await expect(pilares.getByTestId('un-hoje').textContent()).resolves.toMatch(/Hoje: Por peça \(padrão\)/)
      await expect(paredes.getByTestId('un-hoje').textContent()).resolves.toMatch(/Hoje: Por parede \(padrão\)/)
      await print(p, 'pc_1_lista')

      // "Por parede" não serve para a ficha de pilares (não vale para parede): fica desligado na lista
      await pilares.getByTestId('un-trocar').click()
      expect(await pilares.locator('[data-testid=un-unidade] option[value=parede]').evaluate((o: HTMLOptionElement) => o.disabled)).toBe(true)
      expect(await pilares.getByTestId('un-desde').inputValue()).toBe(dia())
      await pilares.getByTestId('un-unidade').selectOption('pavimento')
      await pilares.getByText('um toque confere todos os locais do pavimento').waitFor()
      // data no passado: recusa, o que já foi conferido fica como foi
      await pilares.getByTestId('un-desde').fill(dia(-1))
      await pilares.getByTestId('un-gravar').click()
      await expect(pilares.getByTestId('un-erro').textContent()).resolves.toMatch(/de hoje em diante/)
      await print(p, 'pc_2_troca')
      await pilares.getByTestId('un-desde').fill(dia())
      await pilares.getByTestId('un-gravar').click()
      await p.getByTestId('un-gravada').waitFor()
      await pilares.getByTestId('un-hoje').filter({ hasText: /^Hoje: Por pavimento$/ }).waitFor({ timeout: 10_000 })
      await expect(pilares.locator('.un-historico').textContent()).resolves.toMatch(/Por pavimento desde/)

      // troca marcada para depois: hoje continua pavimento, e a lista mostra a próxima
      await pilares.getByTestId('un-trocar').click()
      await pilares.getByTestId('un-unidade').selectOption('trecho')
      await pilares.getByTestId('un-desde').fill(dia(10))
      await pilares.getByTestId('un-gravar').click()
      await p.getByTestId('un-gravada').waitFor()
      // a lista relê o aparelho logo depois de gravar
      await pilares.getByTestId('un-hoje').filter({ hasText: /Hoje: Por pavimento · a partir de .*: Por trecho/ }).waitFor({ timeout: 10_000 })
      await print(p, 'pc_3_gravada')

      // reabrir o app: as duas trocas continuam lá (gravadas no aparelho, na fila do núcleo)
      await abrirNaObra(p, true)
      await p.getByTestId('pc-ir-unidades').click()
      const h = await p.getByTestId('un-ficha-EXE-PVS-01').locator('.un-historico').textContent()
      expect(h).toMatch(/Por pavimento desde .* · Por trecho desde/)
    } finally {
      await ctx.close()
    }
  }, 120_000)

  it('celular (375 px) e tablet: a página do PC não aparece', async () => {
    for (const [nome, opcoes] of [
      ['celular', { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true }],
      ['tablet', { viewport: { width: 1280, height: 800 }, hasTouch: true, isMobile: true }],
    ] as const) {
      const ctx = await navegador.newContext({ ...opcoes, ...NO_BRASIL })
      await ctx.addInitScript(() => localStorage.setItem('versao_pc', 'ligada'))
      const p = await ctx.newPage()
      try {
        await abrirNaObra(p)
        expect(await p.getByTestId('pc-casca').count()).toBe(0)
        expect(await p.getByTestId('pc-ir-unidades').count()).toBe(0)
        await print(p, `${nome}_menu`)
      } finally {
        await ctx.close()
      }
    }
  }, 120_000)
})

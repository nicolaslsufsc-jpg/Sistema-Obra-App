// Medida pedida em 09/11 (Professor): tempo e memória para desenhar os tiles de uma prancha A1 pesada
// no navegador, em 375 px e com a CPU 4x mais lenta. Limite: 1 minuto e 300 MB.
// Só roda com SO_MEDIR=1 (não é teste de passa ou falha do GitHub: depende da máquina).
//   SO_MEDIR=1 SO_PLAYWRIGHT=<pasta>/node_modules/playwright SO_CHROME=chrome npx vitest run testes/nova_obra_medida.e2e.test.ts
// Memória: o maior total (working set) dos processos do Chrome do teste, somados, lido do Windows a cada
// 0,3 s, menos o total antes de começar. Inclui o worker do pdf.js e o processo da GPU; fora do Windows,
// só a memória JavaScript da página.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import { pranchaPesadaA1 } from './obra_exemplo2'
/* eslint-disable @typescript-eslint/no-explicit-any */

const suite = process.env.SO_MEDIR === '1' ? describe : describe.skip
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let servidor: ViteDevServer
let navegador: any
let base = ''

/** Soma o working set dos processos do Chrome do Playwright, a cada 0,3 s; imprime uma linha por leitura. */
function vigiarMemoria(): { parar: () => Promise<number[]>; proc: ChildProcess } {
  const script =
    "while ($true) { $s = (Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*playwright_chromiumdev_profile*' } | Measure-Object -Property WorkingSetSize -Sum).Sum; [Console]::Out.WriteLine($s); [Console]::Out.Flush(); Start-Sleep -Milliseconds 300 }"
  const proc = spawn('powershell.exe', ['-NoProfile', '-Command', script])
  const leituras: number[] = []
  proc.stdout.on('data', (d: Buffer) => {
    for (const l of d.toString().split(/\r?\n/)) if (/^\d+$/.test(l.trim())) leituras.push(Number(l.trim()))
  })
  return {
    proc,
    parar: async () => {
      proc.kill()
      return leituras
    },
  }
}

suite('Nova obra: medida dos tiles (A1 pesada, 375 px, CPU 4x)', () => {
  beforeAll(async () => {
    servidor = await createServer({ root: RAIZ, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } })
    await servidor.listen()
    base = servidor.resolvedUrls!.local[0]
    const pw = createRequire(import.meta.url)(process.env.SO_PLAYWRIGHT || 'playwright')
    navegador = await pw.chromium.launch(process.env.SO_CHROME ? { channel: process.env.SO_CHROME, headless: true } : { headless: true })
  }, 120_000)

  afterAll(async () => {
    await navegador?.close()
    await servidor?.close()
  })

  it('mede', async () => {
    const ctx = await navegador.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    const p = await ctx.newPage()
    await p.goto(`${base}nova_obra.html`)
    // carrega os módulos antes de ligar a CPU lenta (o Vite de desenvolvimento compila na hora)
    await p.evaluate(`import('/src/nova_obra/pdf.ts')`)
    const pdf = Buffer.from(pranchaPesadaA1()).toString('base64')
    const cdp = await ctx.newCDPSession(p)
    await new Promise((ok) => setTimeout(ok, 1500))
    const vigia = process.platform === 'win32' ? vigiarMemoria() : null
    await new Promise((ok) => setTimeout(ok, 1200))
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const r = await p.evaluate(`(async () => {
      const m = await import('/src/nova_obra/pdf.ts')
      const bytes = Uint8Array.from(atob('${pdf}'), (c) => c.charCodeAt(0))
      let pico = 0
      const relogio = setInterval(() => { pico = Math.max(pico, performance.memory?.usedJSHeapSize ?? 0) }, 100)
      const t0 = performance.now()
      const doc = await m.abrirPdf(bytes.buffer)
      const pg = await doc.getPage(1)
      const t1 = performance.now()
      const textos = await m.textosDaPagina(pg)
      const t2 = performance.now()
      const tam = m.tamanhoDaPagina(pg)
      const g = await m.gerarTiles(pg, [0, 0, tam.largura, tam.altura])
      const t3 = performance.now()
      clearInterval(relogio)
      let bytesTiles = 0
      for (const b of g.tiles.values()) bytesTiles += b.size
      await doc.fechar()
      return { abrir: (t1 - t0) / 1000, textos: textos.length, lerTextos: (t2 - t1) / 1000, tiles: g.tiles.size, desenhar: (t3 - t2) / 1000, mbTiles: bytesTiles / 1048576, picoJsMb: pico / 1048576, niveis: g.niveis }
    })()`)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    const leituras = vigia ? await vigia.parar() : []
    const antes = leituras.slice(0, 3).reduce((a, b) => Math.min(a, b), Infinity)
    const pico = leituras.reduce((a, b) => Math.max(a, b), 0)
    const resultado = { ...r, total: r.abrir + r.lerTextos + r.desenhar, memoriaChromeMb: leituras.length ? (pico - antes) / 1048576 : null, leituras: leituras.length }
    console.log('MEDIDA', JSON.stringify(resultado))
    expect(r.tiles).toBeGreaterThan(10)
    await ctx.close()
  }, 600_000)
})

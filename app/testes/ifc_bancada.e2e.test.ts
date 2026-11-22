// Leitor de IFC no Chrome, pela bancada (app/dev/ifc.html), com a amostra escrita à mão (não é dado de obra).
// Tablet deitado e celular em pé (375 px). O 3D roda de verdade (WebGL2 por software no GitHub).
// Roda com SO_E2E=1 (GitHub, junto com as outras telas) ou SO_BANCADA=1.
//   No PC do Nicolas: SO_BANCADA=1 SO_PLAYWRIGHT=<pasta>/node_modules/playwright SO_CHROME=chrome npx vitest run testes/ifc_bancada.e2e.test.ts
// SO_PRINTS=<pasta> salva capturas de tela.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import { amostraIfc } from './ifc/amostra'
/* eslint-disable @typescript-eslint/no-explicit-any */
type Page = any

const ATIVO = process.env.SO_E2E === '1' || process.env.SO_BANCADA === '1'
const suite = ATIVO ? describe : describe.skip
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PRINTS = process.env.SO_PRINTS

let servidor: ViteDevServer
let navegador: any
let url = ''
let pasta = ''
let arq = ''
let est = ''

const semRolagemHorizontal = (p: Page): Promise<number> => p.evaluate(() => document.documentElement.scrollWidth - innerWidth)

async function abrirModelos(p: Page, arquivos: string[], total: number) {
  await p.setInputFiles('[data-testid=ifc-arquivos]', arquivos)
  await p.waitForFunction((n: number) => (window as any).__ifc?.modelos.length === n && (window as any).__ifc.leituras.length === 0, total, { timeout: 60_000 })
  await p.waitForTimeout(400)
}

const totalDaBusca = (p: Page): Promise<number> => p.evaluate(() => (window as any).__ifc.resultado.total)

/** Abre a aba, se ainda não estiver aberta. */
async function abrirAba(p: Page, nome: string) {
  const aba = p.locator('.ifc-aba', { hasText: nome })
  if ((await aba.getAttribute('aria-pressed')) !== 'true') await aba.click()
}

async function esperarCorte(p: Page) {
  await p.waitForFunction(() => {
    const c = (window as any).__ifc.corte
    return c && !c.calculando
  })
}

suite('Leitor de IFC na bancada (Chrome)', () => {
  beforeAll(async () => {
    process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:9'
    pasta = mkdtempSync(path.join(tmpdir(), 'ifc-teste-'))
    arq = path.join(pasta, 'amostra_ARQ.ifc')
    est = path.join(pasta, 'amostra_EST.ifc')
    writeFileSync(arq, amostraIfc())
    // A mesma amostra 100 m ao lado: é assim que chegam arquivos de programas diferentes.
    writeFileSync(est, amostraIfc().replace('#22=IFCCARTESIANPOINT((0.,0.,0.));', '#22=IFCCARTESIANPOINT((100000.,0.,0.));'))
    servidor = await createServer({ root: RAIZ, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } })
    await servidor.listen()
    url = `${servidor.resolvedUrls!.local[0]}dev/ifc.html`
    const pw = createRequire(import.meta.url)(process.env.SO_PLAYWRIGHT || 'playwright')
    const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    navegador = await pw.chromium.launch(process.env.SO_CHROME ? { channel: process.env.SO_CHROME, headless: true, args } : { headless: true, args })
  }, 120_000)

  afterAll(async () => {
    await navegador?.close()
    await servidor?.close()
    if (pasta) rmSync(pasta, { recursive: true, force: true })
  })

  for (const [nome, largura, altura] of [
    ['tablet', 1280, 800],
    ['celular', 375, 812],
  ] as const) {
    it(`${nome} ${largura}x${altura}: abrir, buscar, cortar, sobrepor`, async () => {
      const contexto = await navegador.newContext({ viewport: { width: largura, height: altura }, hasTouch: largura < 700, acceptDownloads: true })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const capturar = async (passo: string) => {
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `ifc_${nome}_${passo}.png`) })
      }

      // ------------------------------------------------------------ tela vazia
      await p.goto(url)
      await p.getByRole('button', { name: 'Importar IFC' }).first().waitFor()
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await capturar('1_vazio')

      // ------------------------------------------------------------ abrir
      await abrirModelos(p, [arq], 1)
      expect(await p.evaluate(() => (window as any).__ifc.modelos[0].flags.length)).toBe(5)
      await capturar('2_aberto')

      // ------------------------------------------------------------ tocar numa peça: seleção na placa de vídeo, não por cálculo
      await p.evaluate(() => (window as any).__ifc.visor.vista('frente', 0))
      await p.waitForTimeout(500)
      const ponto = await p.evaluate(() => {
        const s = (window as any).__ifc
        const m = s.modelos[0]
        const i = m.modelo.meta.nomes.indexOf('Parede A')
        const c = s.visor.caixaDoElemento(m.chave, i).getCenter(new (s.visor.camera.position.constructor)())
        const t = s.visor.naTela([c.x, c.y, c.z])
        const r = s.visor.canvas.getBoundingClientRect()
        return [r.left + t.x, r.top + t.y]
      })
      await p.mouse.click(ponto[0], ponto[1])
      await p.getByTestId('ifc-elemento').waitFor()
      expect(await p.getByTestId('ifc-elemento').innerText()).toContain('Parede A')
      expect(await p.getByTestId('ifc-elemento').innerText()).toContain('Alvenaria Externa')
      await capturar('3_selecionado')
      await p.getByRole('button', { name: 'Fechar ficha da peça' }).click()

      // tocar no vazio não seleciona nada
      await p.evaluate(() => (window as any).__ifc.visor.vista('iso', 0))
      await p.waitForTimeout(500)
      const canto = await p.evaluate(() => {
        const r = (window as any).__ifc.visor.canvas.getBoundingClientRect()
        return [r.left + 6, r.bottom - 6]
      })
      await p.mouse.click(canto[0], canto[1])
      expect(await p.evaluate(() => (window as any).__ifc.selecao)).toBeNull()

      // ------------------------------------------------------------ buscar
      await abrirAba(p, 'Buscar')
      await p.getByTestId('ifc-busca').fill('fck') // só existe numa propriedade do pilar
      await p.waitForFunction(() => (window as any).__ifc.resultado.total === 1)
      await capturar('4_busca')
      await p.getByTestId('ifc-aba-lista').click()
      await p.locator('.ifc-resultado').first().click()
      await p.getByTestId('ifc-elemento').waitFor()
      expect(await p.getByTestId('ifc-elemento').innerText()).toContain('P1')
      await capturar('5_ficha')
      // o resto do modelo vira fantasma, sem sumir
      expect(await p.evaluate(() => (window as any).__ifc.modelos[0].flags.filter((f: number) => f & 4).length)).toBe(4)
      await p.getByRole('button', { name: 'Fechar ficha da peça' }).click()
      await p.getByRole('button', { name: 'Limpar filtros' }).click()
      expect(await totalDaBusca(p)).toBe(5)
      await p.getByRole('tab', { name: 'Filtros' }).click()
      await p.locator('.ifc-opcao', { hasText: 'Terreo' }).click()
      expect(await totalDaBusca(p)).toBe(3)
      await p.getByRole('radio', { name: 'Isolar' }).click()
      expect(await p.evaluate(() => (window as any).__ifc.modelos[0].flags.filter((f: number) => f === 0).length)).toBe(2)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await p.getByRole('button', { name: 'Limpar filtros' }).click()
      await p.getByRole('radio', { name: 'Destacar' }).click()

      // ------------------------------------------------------------ cores
      await abrirAba(p, 'Cores')
      for (const modo of ['Por modelo', 'Por pavimento', 'Cores do arquivo', 'Por categoria']) await p.locator('.ifc-modo', { hasText: modo }).click()
      await capturar('6_cores')

      // ------------------------------------------------------------ cortes
      await abrirAba(p, 'Cortes')
      await p.locator('select').selectOption('Terreo')
      await p.getByRole('button', { name: 'Gerar planta' }).click()
      await esperarCorte(p)
      expect(await p.evaluate(() => (window as any).__ifc.corte.nome)).toContain('Terreo')
      expect(await p.evaluate(() => (window as any).__ifc.corte.resultado.pecas.length)).toBe(3)
      await p.getByText('3 peças cortadas').waitFor()
      await p.waitForTimeout(450)
      await capturar('7_planta_3d')

      const baixar = p.waitForEvent('download')
      await p.getByRole('button', { name: 'DXF' }).click()
      const dxf = await baixar
      const destino = path.join(pasta, `${nome}.dxf`)
      await dxf.saveAs(destino)
      expect(dxf.suggestedFilename()).toMatch(/\.dxf$/)
      expect(readFileSync(destino, 'utf8')).toContain('POLYLINE')
      for (const [botao, fim] of [
        ['SVG', /\.svg$/],
        ['Imagem', /\.png$/],
      ] as const) {
        const outro = p.waitForEvent('download')
        await p.getByRole('button', { name: botao }).click()
        expect((await outro).suggestedFilename()).toMatch(fim)
      }

      await p.getByTestId('ifc-ver-2d').click()
      await p.waitForTimeout(300)
      await capturar('8_planta_2d')
      await p.locator('.ifc-faixa').getByRole('button', { name: 'Voltar ao 3D' }).click()
      await abrirAba(p, 'Cortes')

      // mover o plano para cima do prédio: não pega nada e diz isso
      await p.getByRole('button', { name: 'Tirar o corte' }).click()
      await p.getByRole('button', { name: 'Corte transversal' }).click()
      await esperarCorte(p)
      await p.getByTestId('ifc-ver-2d').click()
      await p.waitForTimeout(300)
      expect(await p.locator('.ifc-nivel').allInnerTexts()).toEqual(expect.arrayContaining([expect.stringContaining('Terreo')]))
      await capturar('9_corte_2d')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await p.locator('.ifc-faixa').getByRole('button', { name: 'Voltar ao 3D' }).click()
      await abrirAba(p, 'Cortes')
      await p.getByRole('button', { name: 'Guardar este corte' }).click()
      await p.getByRole('button', { name: 'Tirar o corte' }).click()
      await p.locator('.ifc-guardado-abrir', { hasText: 'Corte transversal' }).click()
      await esperarCorte(p)
      expect(await p.evaluate(() => (window as any).__ifc.corte.resultado.pecas.length)).toBeGreaterThan(0)
      await p.getByRole('button', { name: 'Tirar o corte' }).click()

      // ------------------------------------------------------------ sobrepor um segundo IFC, que vem fora de lugar
      await abrirModelos(p, [est], 2)
      await p.getByTestId('ifc-desalinhado').waitFor()
      expect(await p.getByTestId('ifc-desalinhado').innerText()).toContain('amostra_EST.ifc')
      await capturar('10_desalinhado')

      // alinhar por pontos: toca no modelo que mexe e no de referência (o toque em si já foi testado acima)
      await p.getByTestId('ifc-desalinhado').getByRole('button', { name: 'Marcar pontos' }).click()
      const distancia = await p.evaluate(() => {
        const s = (window as any).__ifc
        const a = s.modelos[0]
        const b = s.modelos[1]
        const canto = (m: any) => {
          const c = s.visor.caixaDoElemento(m.chave, m.modelo.meta.nomes.indexOf('P1'))
          return [c.min.x, c.min.y, c.min.z]
        }
        const toque = (m: any) => s.visor.eventos.aoTocar({ chave: m.chave, elemento: 0, ponto: canto(m), normal: [0, 1, 0], vertice: canto(m) })
        toque(b)
        toque(a)
        s.concluirAlinhamento()
        const ca = canto(a)
        const cb = canto(b)
        return Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2])
      })
      expect(distancia).toBeLessThan(0.001)
      expect(await p.getByTestId('ifc-desalinhado').count()).toBe(0)
      await abrirAba(p, 'Modelos')
      expect(await p.locator('.ifc-modelo').count()).toBe(2)
      await p.getByRole('slider', { name: /Opacidade de amostra_ARQ/ }).fill('0.3')
      await p.waitForTimeout(200)
      await capturar('11_sobrepostos')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)

      // o corte passa pelos dois modelos
      await abrirAba(p, 'Cortes')
      await p.locator('select').selectOption('Terreo')
      await p.getByRole('button', { name: 'Gerar planta' }).click()
      await esperarCorte(p)
      expect(await p.evaluate(() => (window as any).__ifc.corte.nome)).toContain('Terreo')
      expect(await p.evaluate(() => (window as any).__ifc.corte.resultado.pecas.length)).toBe(6)
      await p.getByRole('button', { name: 'Tirar o corte' }).click()

      // ------------------------------------------------------------ levar para outro aparelho: converte aqui, abre lá
      await abrirAba(p, 'Modelos')
      const levar = p.waitForEvent('download')
      await p.locator('.ifc-modelo').first().getByRole('button', { name: 'Levar para outro aparelho' }).click()
      const pacote = await levar
      expect(pacote.suggestedFilename()).toBe('amostra_ARQ.obra3d')
      const caminhoPacote = path.join(pasta, `${nome}.obra3d`)
      await pacote.saveAs(caminhoPacote)
      const outroAparelho = await navegador.newContext({ viewport: { width: largura, height: altura } })
      const q: Page = await outroAparelho.newPage()
      await q.goto(url)
      await q.getByRole('button', { name: 'Importar IFC' }).first().waitFor()
      await abrirModelos(q, [caminhoPacote], 1)
      expect(await q.evaluate(() => (window as any).__ifc.modelos[0].nome)).toBe('amostra_ARQ.ifc')
      await q.locator('.ifc-aba', { hasText: 'Buscar' }).click()
      await q.getByTestId('ifc-busca').fill('fck')
      await q.waitForFunction(() => (window as any).__ifc.resultado.total === 1)
      await outroAparelho.close()

      // ------------------------------------------------------------ guardado no aparelho: reabre sem ler o IFC
      await p.reload()
      await p.locator('.ifc-vazio-guardados').waitFor()
      expect(await p.locator('.ifc-vazio-guardados li').count()).toBe(2)
      await p.locator('.ifc-vazio-guardados button', { hasText: 'amostra_ARQ.ifc' }).click()
      await p.waitForFunction(() => (window as any).__ifc.modelos.length === 1 && (window as any).__ifc.leituras.length === 0)
      expect(await p.evaluate(() => (window as any).__ifc.modelos[0].flags.length)).toBe(5)
      // o alinhamento feito antes continua valendo só no modelo que mexeu
      expect(await p.evaluate(() => (window as any).__ifc.modelos[0].ajuste.delta[0])).toBe(0)

      expect(erros).toEqual([])
      await contexto.close()
    }, 180_000)

    it(`${nome} ${largura}x${altura}: IFCs da obra, baixar para usar sem internet, apagar e enviar`, async () => {
      const contexto = await navegador.newContext({ viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const capturar = async (passo: string) => {
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `ifc_obra_${nome}_${passo}.png`) })
      }
      await p.goto(`${url}?obra=exe`)
      // começa sem nada guardado (outro teste pode ter deixado)
      await p.evaluate(async () => {
        const raiz = await navigator.storage.getDirectory()
        for await (const [n] of (raiz as any).entries()) await raiz.removeEntry(n, { recursive: true })
        localStorage.clear()
      })
      await p.reload()
      const lista = p.getByTestId('ifcs-da-obra').first()
      await lista.waitFor()
      const item = lista.getByTestId('ifc-da-obra').filter({ hasText: 'EXE_amostra.ifc' })
      expect(await item.innerText()).toContain('para baixar')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await capturar('1_lista')
      // tela baixa (celular com a barra do Chrome): o topo da tela vazia, com o Importar IFC, continua alcançável
      await p.setViewportSize({ width: largura, height: 420 })
      const importar = p.getByTestId('ifc-importar').getByRole('button', { name: 'Importar IFC' })
      await importar.scrollIntoViewIfNeeded()
      expect((await importar.boundingBox())!.y).toBeGreaterThanOrEqual(0)
      await p.setViewportSize({ width: largura, height: altura })

      // baixar: barra de progresso, depois o modelo abre e fica guardado
      await item.getByRole('button', { name: 'Baixar para usar offline' }).click()
      await p.waitForFunction(() => (window as any).__ifc?.modelos.length === 1 && (window as any).__ifc.leituras.length === 0, null, { timeout: 60_000 })
      expect(await p.evaluate(() => (window as any).__ifc.modelos[0].flags.length)).toBe(5)
      await p.waitForFunction(() => (window as any).__ifc.guardados.length === 1, null, { timeout: 30_000 })

      // no painel Modelos o IFC aparece como "neste aparelho", com Abrir e Apagar
      await abrirAba(p, 'Modelos')
      await item.getByRole('button', { name: 'Apagar EXE_amostra.ifc deste aparelho' }).waitFor()
      expect(await item.innerText()).toContain('neste aparelho')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await capturar('2_baixado')

      // depois de recarregar (sem servidor nenhum): continua guardado e abre pelo botão
      await p.reload()
      await item.getByRole('button', { name: 'Abrir' }).click()
      await p.waitForFunction(() => (window as any).__ifc?.modelos.length === 1, null, { timeout: 60_000 })

      // apagar do aparelho: fecha o modelo e volta a "Baixar"
      await abrirAba(p, 'Modelos')
      await item.getByRole('button', { name: 'Apagar EXE_amostra.ifc deste aparelho' }).click()
      await item.getByRole('button', { name: 'Baixar para usar offline' }).waitFor()
      await p.waitForFunction(() => (window as any).__ifc.guardados.length === 0)
      expect(await p.evaluate(() => (window as any).__ifc.modelos.length)).toBe(0)

      // gestor envia outro IFC: aparece na lista, em uma parte
      await p.setInputFiles('[data-testid=ifc-enviar-arquivo]', est)
      await lista.getByTestId('ifc-da-obra').filter({ hasText: 'amostra_EST.ifc' }).waitFor()
      expect(await p.evaluate(() => (window as any).__ifcFonte.linhas.map((l: any) => l.nome_original).filter((n: string) => n.startsWith('amostra_EST.ifc')))).toEqual([
        expect.stringMatching(/^amostra_EST\.ifc \(parte 1 de 1, envio [0-9a-f]{8}\)$/),
      ])
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await capturar('3_enviado')

      expect(erros).toEqual([])
      await contexto.close()
    }, 180_000)

    it(`${nome} ${largura}x${altura}: baixar modelo da obra pelo Drive (tamanho, Wi-Fi, importar)`, async () => {
      const contexto = await navegador.newContext({ viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      // nada sai para o Google nos testes
      await contexto.route(/google\.com/, (r: any) => r.abort())
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const capturar = async (passo: string) => {
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `ifc_drive_${nome}_${passo}.png`) })
      }
      await p.goto(`${url}?obra=exe`)
      await p.evaluate(async () => {
        const raiz = await navigator.storage.getDirectory()
        for await (const [n] of (raiz as any).entries()) await raiz.removeEntry(n, { recursive: true })
        localStorage.clear()
      })
      await p.reload()

      // lista de exemplo da EXE: nome, disciplina e tamanho
      const secao = p.getByTestId('modelos-da-obra').first()
      await secao.waitFor()
      expect(await secao.innerText()).toContain('lista de exemplo da obra EXE')
      const grande = secao.getByTestId('modelo-drive').filter({ hasText: 'EXE.HI.LO.000.GERAL-R00.ifc' })
      expect(await grande.innerText()).toContain('Hidráulico · 1 GB')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await capturar('1_lista')

      // antes de baixar: tamanho, Wi-Fi e o aviso de modelo grande para o aparelho
      await grande.getByRole('button', { name: 'Baixar', exact: true }).click()
      const texto = await grande.innerText()
      expect(texto).toContain('1 GB para baixar')
      expect(texto).toContain('Wi-Fi')
      expect(texto).toContain('Prefira abrir no PC')
      const link = grande.getByRole('link', { name: 'Abrir no Drive para baixar' })
      expect(await link.getAttribute('href')).toBe('https://drive.usercontent.google.com/download?id=exemplo_exe_hidraulico&export=download&confirm=t')
      expect(await link.getAttribute('target')).toBe('_blank')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await capturar('2_avisos')
      const [aba] = await Promise.all([contexto.waitForEvent('page'), link.click()])
      await aba.close()
      await grande.getByText('Quando o Drive terminar de baixar').waitFor()
      await grande.getByRole('button', { name: 'Cancelar' }).count()

      // a obra carrega a lista dela (JSON); o modelo importado aparece como "neste aparelho"
      const lista = path.join(pasta, 'modelos_drive.json')
      writeFileSync(
        lista,
        JSON.stringify({ tipo: 'sistema-obra/modelos-drive', versao: 1, modelos: [{ nome: 'amostra_ARQ.ifc', disciplina: 'Arquitetura', tamanho: 4000, drive: 'exemplo_exe_amostra_arq' }] }),
      )
      await p.setInputFiles('[data-testid=modelos-drive-arquivo] >> nth=0', lista)
      const item = secao.getByTestId('modelo-drive').filter({ hasText: 'amostra_ARQ.ifc' })
      await item.waitFor()
      expect(await secao.innerText()).not.toContain('lista de exemplo')
      // a confirmação fica na seção, discreta; o aviso vermelho do leitor é só para erro
      await secao.getByRole('status').getByText('Lista de modelos carregada: 1 modelo(s).').waitFor()
      expect(await p.locator('.ifc-avisos').count()).toBe(0)
      await item.getByRole('button', { name: 'Baixar', exact: true }).click()
      expect(await item.innerText()).not.toContain('Wi-Fi')
      await abrirModelos(p, [arq], 1)
      await p.waitForFunction(() => (window as any).__ifc.guardados.length === 1, null, { timeout: 30_000 })
      await abrirAba(p, 'Modelos')
      const noPainel = p.getByTestId('modelo-drive').filter({ hasText: 'amostra_ARQ.ifc' }).first()
      await noPainel.getByText('neste aparelho').waitFor()
      await capturar('3_neste_aparelho')

      // a lista fica no aparelho: recarregar não perde
      await p.reload()
      await p.getByTestId('modelo-drive').filter({ hasText: 'amostra_ARQ.ifc' }).first().waitFor()

      expect(erros).toEqual([])
      await contexto.close()
    }, 180_000)
  }
})

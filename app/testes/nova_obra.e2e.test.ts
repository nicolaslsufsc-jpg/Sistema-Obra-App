// Nova obra no Chrome (nova_obra.html): monta a Obra Exemplo 2 pela tela (obra, pavimentos, ficha colada
// do Excel, etapa da concretagem), salva o .zip e abre esse .zip no app sem conta. Tablet e 375 px.
// Roda com SO_E2E=1 (GitHub, junto com as outras telas) ou SO_BANCADA=1.
//   No PC do Nicolas: SO_BANCADA=1 SO_PLAYWRIGHT=<pasta>/node_modules/playwright SO_CHROME=chrome npx vitest run testes/nova_obra.e2e.test.ts
// SO_PRINTS=<pasta> salva capturas de tela.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import { abrirZip } from '../src/nucleo/zip'
import { FICHAS_PARA_COLAR, gerarObraExemplo2, pdfMuitasPaginas, pdfPaginaGigante } from './obra_exemplo2'
import { comPavimentosDoAparelho, escolherPacote } from './menu_obra'
import { abrirFormaFvs } from './fvs_inicio'
/* eslint-disable @typescript-eslint/no-explicit-any */
type Page = any

const ATIVO = process.env.SO_E2E === '1' || process.env.SO_BANCADA === '1'
const suite = ATIVO ? describe : describe.skip
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PRINTS = process.env.SO_PRINTS

let servidor: ViteDevServer
let navegador: any
let base = ''

async function print(p: Page, nome: string) {
  if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `nova_obra_${nome}.png`), fullPage: true })
}

/** Nada passa da largura da tela, e todo botão visível tem pelo menos 44 px de altura. */
async function conferirTela(p: Page) {
  const r = await p.evaluate(() => ({
    sobra: document.documentElement.scrollWidth - window.innerWidth,
    baixos: [...document.querySelectorAll('button')]
      .filter((b) => (b as HTMLElement).offsetParent && b.getBoundingClientRect().height < 44)
      .map((b) => b.textContent),
    // caixas de marcar: a etiqueta inteira é o alvo, com pelo menos 44 x 44 px
    caixas: [...document.querySelectorAll('label:has(> input[type="checkbox"])')]
      .filter((l) => (l as HTMLElement).offsetParent && (l.getBoundingClientRect().height < 44 || l.getBoundingClientRect().width < 44))
      .map((l) => l.textContent),
  }))
  expect(r.sobra).toBeLessThanOrEqual(0)
  expect(r.baixos).toEqual([])
  expect(r.caixas).toEqual([])
}

suite('Nova obra (telas)', () => {
  beforeAll(async () => {
    process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:9'
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

  for (const [nome, largura, altura] of [
    ['tablet', 1280, 800],
    ['celular', 375, 812],
  ] as const) {
    it(`${nome}: monta a obra, salva o .zip e o app abre a obra pelo .zip`, async () => {
      const ctx = await navegador.newContext({ viewport: { width: largura, height: altura }, acceptDownloads: true, locale: 'pt-BR' })
      const p = await ctx.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${base}nova_obra.html`)

      // 1. obra: o código fica no formato do banco enquanto se digita
      await p.getByLabel('Código da obra').fill('ex 2')
      expect(await p.getByLabel('Código da obra').inputValue()).toBe('EX-2')
      await p.getByLabel('Código da obra').fill('EX2')
      await p.getByLabel('Nome da obra').fill('Obra Exemplo 2')
      await p.getByLabel('Empresa (opcional)').fill('Construtora Exemplo')
      await conferirTela(p)
      await print(p, `${nome}_1_obra`)
      await p.getByRole('button', { name: 'Seguir para os pavimentos' }).click()

      // 2. pavimentos: atalho e depois renomear
      await p.getByLabel('Subsolos').fill('0')
      await p.getByLabel('Pavimentos acima do térreo').fill('1')
      await p.getByLabel('Cobertura').uncheck()
      await p.getByRole('button', { name: 'Preencher a lista' }).click()
      expect(await p.getByLabel('Pavimento 1').inputValue()).toBe('Térreo')
      await p.getByLabel('Pavimento 2').fill('Tipo 1')
      await conferirTela(p)
      await print(p, `${nome}_2_pavimentos`)
      await p.getByRole('button', { name: 'Seguir para as plantas' }).click()
      // plantas: pula (a obra também sai sem planta)
      await p.getByRole('heading', { name: 'Plantas' }).waitFor()
      await conferirTela(p)
      await p.getByRole('button', { name: 'Seguir para as fichas' }).click()

      // 3. ficha: colar do Excel e marcar a etapa da concretagem
      await p.getByRole('button', { name: '+ Nova ficha' }).click()
      await p.getByLabel('Código').first().fill('EX2-PVS-01')
      await p.getByLabel('Título').first().fill('Execução de pilares')
      await p.getByLabel('Itens colados do Excel').fill(FICHAS_PARA_COLAR)
      await p.getByRole('button', { name: 'Acrescentar os itens colados' }).click()
      await p.getByText('5 itens acrescentados.').waitFor()
      await p.getByRole('heading', { name: 'Itens (5)' }).waitFor()
      await p.getByLabel('Etapa da concretagem').selectOption('etapa:Lançamento')
      await conferirTela(p)
      await print(p, `${nome}_3_ficha`)
      await p.getByRole('button', { name: 'Pronto' }).click()
      await p.getByRole('button', { name: /EX2-PVS-01 Execução de pilares/ }).waitFor()
      await p.getByRole('button', { name: 'Seguir para as pessoas' }).click()

      // pessoas: quem terá acesso quando publicar no servidor (e-mail inválido segura o salvar)
      await p.getByRole('heading', { name: 'Quem tem acesso' }).waitFor()
      await p.getByRole('button', { name: 'Pôr pessoa' }).click()
      await p.getByLabel('Nome').fill('Maria Exemplo')
      await p.getByLabel('E-mail (pode ficar vazio)').fill('maria@')
      await p.getByLabel('Papel').selectOption('gestor')
      await conferirTela(p)
      await print(p, `${nome}_4_pessoas`)
      await p.getByRole('button', { name: 'Seguir para salvar' }).click()
      await p.getByText('Maria Exemplo: e-mail inválido (maria@).').waitFor()
      expect(await p.getByRole('button', { name: 'Publicar no servidor' }).isDisabled()).toBe(true)
      await p.getByRole('alert').getByRole('button', { name: 'Pessoas' }).click()
      await p.getByLabel('E-mail (pode ficar vazio)').fill('maria@exemplo.com')
      await p.getByRole('button', { name: 'Seguir para salvar' }).click()

      // salvar e publicar
      await p.getByText('Tudo certo para salvar.').waitFor()
      await p.getByText('1 pessoa com acesso').waitFor()
      await conferirTela(p)
      await print(p, `${nome}_5_salvar`)
      // sem ter entrado no app com a conta de administrador, a publicação nem começa
      await p.getByRole('button', { name: 'Publicar no servidor' }).click()
      await p.getByText(/Entre no app com a conta de administrador/).waitFor()
      await conferirTela(p)
      const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Salvar pacote da obra (.zip)' }).click()])
      expect(download.suggestedFilename()).toMatch(/^obra_EX2_\d{4}-\d{2}-\d{2}\.zip$/)
      const arquivo = await download.path()
      const zip = await abrirZip(new Blob([readFileSync(arquivo)]))
      const indice = JSON.parse((await zip.texto('indice.json'))!)
      expect(indice).toMatchObject({ obra: 'EX2', nome: 'Obra Exemplo 2', pavimentos: [{ nome: 'Térreo' }, { nome: 'Tipo 1' }] })
      const fichas = JSON.parse((await zip.texto('fichas.json'))!)
      expect(fichas[0].itens.map((i: { concretagem: boolean }) => i.concretagem)).toEqual([false, false, false, true, false])

      // o rascunho fica no navegador: recarregar não perde nada
      await p.reload()
      expect(await p.getByLabel('Código da obra').inputValue()).toBe('EX2')

      // 5. o .zip abre no app sem conta, como o de sempre
      await p.goto(base)
      await p.getByRole('heading', { name: 'Sem conta, sem internet' }).waitFor({ timeout: 30_000 })
      await escolherPacote(p, arquivo)
      await p.getByText('Sem conta: tudo fica guardado neste aparelho.').waitFor({ timeout: 30_000 })
      await p.getByRole('heading', { name: /EX2/ }).waitFor()
      expect(await p.getByText('Obra Exemplo 2').count()).toBeGreaterThan(0)
      await comPavimentosDoAparelho(p, async (lista: Page) => {
        await lista.filter({ hasText: /^Tipo 1$/ }).waitFor()
        expect(await lista.allInnerTexts()).toEqual(['Térreo', 'Tipo 1'])
      })
      await print(p, `${nome}_5_app`)
      // a FVS abre numa obra ainda sem planta, sem erro
      await p.getByRole('button', { name: /FVS/ }).click()
      await p.getByRole('heading', { name: 'FVS', exact: true }).waitFor()
      await p.waitForTimeout(500)
      await print(p, `${nome}_6_fvs`)
      expect(erros).toEqual([])
      await ctx.close()
    }, 120_000)
  }

  for (const [nome, largura, altura] of [
    ['tablet', 1280, 800],
    ['celular', 375, 812],
  ] as const) {
    it(`${nome}: plantas da Obra Exemplo 2 (PDF com texto e escaneado), salva e abre na FVS`, async () => {
      const pranchas = gerarObraExemplo2()
      const terreo = pranchas[0]
      const escaneada = pranchas[2]
      const ctx = await navegador.newContext({ viewport: { width: largura, height: altura }, acceptDownloads: true, locale: 'pt-BR' })
      // começa com obra, pavimentos e uma ficha já cadastrados (a etapa 1 tem o próprio teste)
      await ctx.addInitScript(() => {
        if (localStorage.getItem('nova_obra:rascunho')) return
        localStorage.setItem(
          'nova_obra:rascunho',
          JSON.stringify({
            codigo: 'EX2',
            nome: 'Obra Exemplo 2',
            empresa: '',
            pavimentos: ['Térreo', 'Tipo 1'],
            plantas: [],
            fichas: [{ codigo: 'EX2-PVS-01', titulo: 'Pilares', revisao: '0', aplica_a: ['P', 'V'], concretagem: { modo: 'pelo_nome' }, itens: [{ etapa: 'Fôrma', titulo: 'Prumo', descricao: '', dispositivo: '', tolerancia: '' }] }],
          }),
        )
      })
      const p = await ctx.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${base}nova_obra.html`)
      await p.getByRole('button', { name: '3. Plantas' }).click()

      // Térreo: PDF com camadas e texto
      await p.getByLabel('PDF da planta do Térreo').setInputFiles({ name: terreo.arquivo, mimeType: 'application/pdf', buffer: Buffer.from(terreo.pdf) })
      await p.getByRole('heading', { name: 'Térreo: Planta inteira' }).waitFor({ timeout: 30_000 })
      expect(await p.getByLabel('Escala da planta').inputValue()).toBe('75') // lida do carimbo
      // janela: arrastar em volta do desenho, deixando o carimbo de fora
      await p.waitForFunction(() => document.querySelector('[data-testid="folha"] canvas'))
      await p.getByTestId('folha').scrollIntoViewIfNeeded()
      const caixa = await p.getByTestId('folha').boundingBox()
      const s = caixa.width / 2384
      const xs = terreo.pecas.flatMap((pc) => [pc.retangulo[0], pc.retangulo[2]])
      const ys = terreo.pecas.flatMap((pc) => [pc.retangulo[1], pc.retangulo[3]])
      const [jx0, jy0, jx1, jy1] = [Math.min(...xs) - 40, Math.min(...ys) - 40, Math.max(...xs) + 90, Math.max(...ys) + 40]
      await p.mouse.move(caixa.x + jx0 * s, caixa.y + jy0 * s)
      await p.mouse.down()
      await p.mouse.move(caixa.x + jx1 * s, caixa.y + jy1 * s, { steps: 5 })
      await p.mouse.up()
      await p.waitForFunction(() => JSON.parse(localStorage.getItem('nova_obra:rascunho')!).plantas[0].janela[0] > 0)
      const janela: number[] = await p.evaluate(() => JSON.parse(localStorage.getItem('nova_obra:rascunho')!).plantas[0].janela)
      // na tela de 375 px, um pixel é uns 6 pontos da folha
      expect(Math.abs(janela[0] - jx0)).toBeLessThan(10)
      expect(Math.abs(janela[2] - jx1)).toBeLessThan(10)
      await conferirTela(p)
      await print(p, `${nome}_p1_janela`)
      await p.getByRole('button', { name: 'Desenhar a planta' }).click()
      await p.getByText(/Planta desenhada: \d+ imagens/).waitFor({ timeout: 60_000 })
      await p.waitForFunction(() => (window as any).__noMapa)
      await p.waitForTimeout(400)

      // nomes pequenos na tela (achado do Testador): no celular a dica aparece e "Aproximar" resolve
      const dica = p.getByRole('note').filter({ hasText: 'Os nomes estão pequenos' })
      if (nome === 'celular') {
        await dica.waitFor()
        const antes = await p.evaluate(() => {
          const m = (window as any).__noMapa
          return { z: m.getZoom(), c: m.getCenter() }
        })
        await p.getByRole('button', { name: 'Aproximar' }).click()
        await dica.waitFor({ state: 'detached' })
        // volta para a planta inteira (os toques abaixo contam com ela toda na tela)
        await p.evaluate((a: any) => (window as any).__noMapa.setView(a.c, a.z, { animate: false }), antes)
        await dica.waitFor()
      } else expect(await dica.count()).toBe(0)

      // tocar no nome: P-01, VT-01 e P-02 (coordenadas da página menos a janela)
      let origem = [janela[0], janela[1]]
      const tocar = async (xPag: number, yPag: number) => {
        // o mapa inteiro na tela (o clique fora da parte visível não chega)
        await p.evaluate(() => document.querySelector('[data-testid="mapa-pecas"]')!.scrollIntoView({ block: 'center' }))
        const [tx, ty] = await p.evaluate(
          ([x, y]: [number, number]) => {
            const m = (window as any).__noMapa
            const q = m.latLngToContainerPoint([-y, x])
            const r = m.getContainer().getBoundingClientRect()
            return [r.left + q.x, r.top + q.y]
          },
          [xPag - origem[0], yPag - origem[1]],
        )
        await p.mouse.click(tx, ty)
      }
      const peca = (n: string) => terreo.pecas.find((pc) => pc.nome === n)!.retangulo
      const centroY = (r: number[]) => (r[1] + r[3]) / 2
      await tocar(peca('P-01')[2] + 15, centroY(peca('P-01')))
      await p.getByLabel('Nome da peça').waitFor()
      expect(await p.getByLabel('Nome da peça').inputValue()).toBe('P-01')
      expect(await p.getByLabel('Seção').inputValue()).toBe('20x50')
      const v = peca('VT-01')
      await tocar((v[0] + v[2]) / 2 - 20, v[1] - 10)
      await p.waitForFunction(() => (document.querySelector('.no-peca input') as HTMLInputElement | null)?.value === 'VT-01')
      await tocar(peca('P-02')[2] + 15, centroY(peca('P-02')))
      await p.getByText('2 pilares, 1 vigas, 0 lajes.', { exact: false }).waitFor()
      // tocar longe de qualquer nome avisa e não cria peça
      await tocar(peca('P-01')[0] + 90, centroY(peca('P-01')) + 120)
      await p.getByText(/Sem nome aqui/).waitFor()
      // conferência: as 3 marcadas pelo nome ainda não têm contorno; tocar na lista abre a peça
      await p.getByText('Sem contorno (3)').waitFor()
      await p.getByRole('group', { name: 'Sem contorno' }).getByRole('button', { name: 'P-02' }).click()
      await p.waitForFunction(() => (document.querySelector('.no-peca input') as HTMLInputElement | null)?.value === 'P-02')
      await conferirTela(p)
      await print(p, `${nome}_p2_pecas`)
      // nome com HTML (de um PDF ou digitado) aparece como texto no rótulo, sem virar elemento
      await p.getByLabel('Nome da peça').fill('<img src=x id=xss>')
      await p.locator('.no-rotulo', { hasText: '<imgsrc=xid=xss>' }).waitFor()
      expect(await p.locator('#xss').count()).toBe(0)
      await p.getByLabel('Nome da peça').fill('P-02')
      // abrir a peça pela lista aproxima: a dica de nomes pequenos some
      await dica.waitFor({ state: 'detached' })
      await p.getByRole('button', { name: 'Pronto' }).click()

      // Tipo 1: o PDF escaneado, só desenhando
      await p.getByLabel('PDF da planta do Tipo 1').setInputFiles({ name: escaneada.arquivo, mimeType: 'application/pdf', buffer: Buffer.from(escaneada.pdf) })
      await p.getByText(/não tem texto \(parece escaneado\)/).waitFor({ timeout: 30_000 })
      expect(await p.getByLabel('Escala da planta').inputValue()).toBe('')
      await p.getByLabel('Escala da planta').selectOption('75')
      await p.getByRole('button', { name: 'Desenhar a planta' }).click()
      await p.getByText(/Planta desenhada: \d+ imagens/).waitFor({ timeout: 60_000 })
      await p.waitForTimeout(400)
      expect(await p.getByRole('button', { name: 'Tocar no nome' }).isDisabled()).toBe(true)
      const r1 = escaneada.pecas.find((pc) => pc.nome === 'P-01')!.retangulo
      origem = [0, 0] // janela = folha inteira
      await tocar(r1[0] - 4, r1[1] - 4)
      await tocar(r1[2] + 4, r1[3] + 4)
      await p.getByLabel('Nome da peça').fill('P-101')
      await p.getByText('1 pilares, 0 vigas, 0 lajes.', { exact: false }).waitFor()
      await conferirTela(p)
      await print(p, `${nome}_p3_escaneada`)
      await p.getByRole('button', { name: 'Pronto' }).click()

      // salvar e conferir o .zip
      await p.getByRole('button', { name: '6. Salvar' }).click()
      // dá para salvar, mas avisa das 3 marcadas pelo nome sem contorno (achado do Testador)
      await p.getByText('Dá para salvar, mas confira:').waitFor()
      await p.getByText(/^3 peças sem contorno: na FVS aparecem só como o retângulo do nome/).waitFor()
      expect(await p.getByText('Tudo certo para salvar.').count()).toBe(0)
      await conferirTela(p)
      const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Salvar pacote da obra (.zip)' }).click()])
      const arquivo = await download.path()
      const zip = await abrirZip(new Blob([readFileSync(arquivo)]))
      const indice = JSON.parse((await zip.texto('indice.json'))!)
      expect(indice.pavimentos.map((pv: any) => [pv.nome, pv.pecas.length, pv.plantas.length])).toEqual([
        ['Térreo', 3, 1],
        ['Tipo 1', 1, 1],
      ])
      const m = JSON.parse((await zip.texto(indice.pavimentos[0].plantas[0].pasta + 'manifest.json'))!)
      expect(m.escala).toBe(75)
      expect(Object.keys(m.pedacos).length).toBeGreaterThan(0)
      const mEsc = JSON.parse((await zip.texto(indice.pavimentos[1].plantas[0].pasta + 'manifest.json'))!)
      expect(Object.values(mEsc.elementos)).toEqual([expect.objectContaining({ nome: 'P-101', polys: [expect.any(Array)] })])

      // o app abre a obra e a planta na FVS
      await p.goto(base)
      await p.getByRole('heading', { name: 'Sem conta, sem internet' }).waitFor({ timeout: 30_000 })
      await escolherPacote(p, arquivo)
      await p.getByText('Sem conta: tudo fica guardado neste aparelho.').waitFor({ timeout: 60_000 })
      await p.getByRole('button', { name: /FVS/ }).click()
      await p.getByRole('heading', { name: 'FVS', exact: true }).waitFor()
      await abrirFormaFvs(p)
      await p.waitForFunction(() => document.querySelectorAll('.leaflet-tile-container img').length > 0, null, { timeout: 30_000 })
      await p.waitForTimeout(800)
      await print(p, `${nome}_p4_fvs`)
      expect(erros).toEqual([])
      await ctx.close()
    }, 240_000)

    it(`${nome}: lê as peças sozinho depois de ensinar com 2 toques (etapa 3)`, async () => {
      const pranchas = gerarObraExemplo2()
      const terreo = pranchas[0]
      const tipoA = pranchas.find((x) => x.trecho === 'Trecho A')!
      const ctx = await navegador.newContext({ viewport: { width: largura, height: altura }, acceptDownloads: true, locale: 'pt-BR' })
      await ctx.addInitScript(() => {
        if (localStorage.getItem('nova_obra:rascunho')) return
        localStorage.setItem(
          'nova_obra:rascunho',
          JSON.stringify({
            codigo: 'EX2',
            nome: 'Obra Exemplo 2',
            empresa: '',
            pavimentos: ['Térreo', 'Tipo 1'],
            plantas: [],
            fichas: [{ codigo: 'EX2-PVS-01', titulo: 'Pilares', revisao: '0', aplica_a: ['P', 'V'], concretagem: { modo: 'pelo_nome' }, itens: [{ etapa: 'Fôrma', titulo: 'Prumo', descricao: '', dispositivo: '', tolerancia: '' }] }],
          }),
        )
      })
      const p = await ctx.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${base}nova_obra.html`)
      await p.getByRole('button', { name: '3. Plantas' }).click()
      const tocar = async (xPag: number, yPag: number) => {
        await p.evaluate(() => document.querySelector('[data-testid="mapa-pecas"]')!.scrollIntoView({ block: 'center' }))
        const [tx, ty] = await p.evaluate(
          ([x, y]: [number, number]) => {
            const m = (window as any).__noMapa
            const q = m.latLngToContainerPoint([-y, x])
            const r = m.getContainer().getBoundingClientRect()
            return [r.left + q.x, r.top + q.y]
          },
          [xPag, yPag],
        )
        await p.mouse.click(tx, ty)
      }
      const subirEDesenhar = async (pav: string, prancha: (typeof pranchas)[number]) => {
        await p.getByLabel(`PDF da planta do ${pav}`).setInputFiles({ name: prancha.arquivo, mimeType: 'application/pdf', buffer: Buffer.from(prancha.pdf) })
        await p.getByRole('button', { name: 'Desenhar a planta' }).click()
        await p.getByText(/Planta desenhada: \d+ imagens/).waitFor({ timeout: 60_000 })
        await p.waitForFunction(() => (window as any).__noMapa)
        await p.waitForTimeout(400)
      }

      // Térreo: outra projetista, o app não conhece; pede para ensinar
      await subirEDesenhar('Térreo', terreo)
      await p.getByRole('button', { name: 'Ler as peças sozinho' }).click()
      await p.getByText('Não achei peças nesta planta.', { exact: false }).waitFor()
      await p.getByText('1 de 2: toque no nome de um pilar.').waitFor()
      await conferirTela(p)
      await print(p, `${nome}_l1_ensinar`)
      const peca = (n: string) => terreo.pecas.find((pc) => pc.nome === n)!.retangulo
      // no meio do vão, longe de nome: avisa e espera o mesmo toque
      const meioDoVao = [(peca('P-01')[0] + peca('P-02')[2]) / 2, (peca('P-01')[1] + peca('P-05')[3]) / 2]
      await tocar(meioDoVao[0], meioDoVao[1])
      await p.getByText(/não achei nome de peça/).waitFor()
      await tocar(peca('P-01')[2] + 15, (peca('P-01')[1] + peca('P-01')[3]) / 2)
      await p.getByText('2 de 2: agora toque no nome de uma viga.').waitFor()
      const v = peca('VT-01')
      await tocar((v[0] + v[2]) / 2 - 20, v[1] - 10)
      await p.getByText('Aprendi. Li 12 pilares e 9 vigas.', { exact: false }).waitFor()
      await p.getByText('12 pilares, 9 vigas, 0 lajes.', { exact: false }).waitFor()
      // tudo com contorno e seção, nenhum nome sobrando
      await p.getByText('Nada para conferir nesta planta.').waitFor()
      await conferirTela(p)
      await print(p, `${nome}_l2_lidas`)
      await p.getByRole('button', { name: 'Pronto' }).click()

      // Tipo 1, trecho A: o trecho vem do título da prancha (achado do Testador)
      await subirEDesenhar('Tipo 1', tipoA)
      await p.getByRole('heading', { name: 'Tipo 1: Trecho A' }).waitFor()
      // marcado à mão pelo nome, o pilar já ganha o contorno da leitura (perfil ensinado no Térreo)
      const pA = tipoA.pecas.find((pc) => pc.tipo === 'P')!
      await tocar(pA.retangulo[2] + 15, (pA.retangulo[1] + pA.retangulo[3]) / 2)
      await p.waitForFunction(
        (n: string) => JSON.parse(localStorage.getItem('nova_obra:rascunho')!).plantas[1].pecas.some((pc: any) => pc.nome === n && pc.polys.length === 1),
        pA.nome,
      )
      // mesma projetista: já lê sozinho
      await p.getByRole('button', { name: 'Ler as peças sozinho' }).click()
      await p.getByText('Li 9 pilares e 6 vigas.', { exact: false }).waitFor()
      await conferirTela(p)
      await p.getByRole('button', { name: 'Pronto' }).click()

      await p.getByRole('button', { name: '6. Salvar' }).click()
      await p.getByText('Tudo certo para salvar.').waitFor()
      const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Salvar pacote da obra (.zip)' }).click()])
      const zip = await abrirZip(new Blob([readFileSync(await download.path())]))
      const indice = JSON.parse((await zip.texto('indice.json'))!)
      expect(indice.pavimentos.map((pv: any) => [pv.nome, pv.pecas.length])).toEqual([
        ['Térreo', terreo.pecas.length],
        ['Tipo 1', tipoA.pecas.length],
      ])
      const m = JSON.parse((await zip.texto(indice.pavimentos[0].plantas[0].pasta + 'manifest.json'))!)
      const p01 = Object.values(m.elementos).find((e: any) => e.nome === 'P-01') as any
      expect(p01).toMatchObject({ tipo: 'P', secao: '20x50', polys: [expect.any(Array)] })
      expect(erros).toEqual([])
      await ctx.close()
    }, 240_000)
  }

  for (const [nome, largura, altura] of [
    ['tablet', 1280, 800],
    ['celular', 375, 812],
  ] as const) {
    it(`${nome}: PDF com página gigante é recusado com mensagem clara (Revisor)`, async () => {
      const ctx = await navegador.newContext({ viewport: { width: largura, height: altura }, locale: 'pt-BR' })
      await ctx.addInitScript(() => {
        if (localStorage.getItem('nova_obra:rascunho')) return
        localStorage.setItem('nova_obra:rascunho', JSON.stringify({ codigo: 'EX2', nome: 'Obra Exemplo 2', empresa: '', pavimentos: ['Térreo'], plantas: [], fichas: [] }))
      })
      const p = await ctx.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${base}nova_obra.html`)
      await p.getByRole('button', { name: '3. Plantas' }).click()
      await p.getByLabel('PDF da planta do Térreo').setInputFiles({ name: 'EX-GIGANTE.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdfPaginaGigante()) })
      await p.getByRole('alert').filter({ hasText: 'EX-GIGANTE.pdf: A página do PDF tem 4,94 m x 4,94 m' }).waitFor({ timeout: 30_000 })
      // PDF com 25 páginas (a Nova obra lê só a primeira e aceita até 20)
      await p.getByLabel('PDF da planta do Térreo').setInputFiles({ name: 'EX-PAGINAS.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdfMuitasPaginas(25)) })
      await p.getByRole('alert').filter({ hasText: 'O PDF tem 25 páginas, e o app aceita até 20' }).waitFor({ timeout: 30_000 })
      // arquivo que não é PDF
      await p.getByLabel('PDF da planta do Térreo').setInputFiles({ name: 'EX-LIXO.pdf', mimeType: 'application/pdf', buffer: Buffer.from('isto não é um PDF '.repeat(100)) })
      await p.getByRole('alert').filter({ hasText: 'Não consegui abrir EX-LIXO.pdf como PDF. O arquivo não é um PDF válido' }).waitFor({ timeout: 30_000 })
      // nada entrou: o pavimento continua sem planta e o botão volta
      expect(await p.locator('.no-ficha').count()).toBe(0)
      await p.getByRole('button', { name: '+ PDF da planta' }).waitFor()
      await conferirTela(p)
      await print(p, `${nome}_pdf_gigante`)
      expect(erros).toEqual([])
      await ctx.close()
    }, 60_000)
  }
})

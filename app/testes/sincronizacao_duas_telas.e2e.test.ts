// Sincronização sólida, pelas telas: dois aparelhos (dois navegadores) na mesma obra.
// Roteiro e riscos em docs/modulos/0_nucleo_sincronizacao.md (testes E1 a E4).
// Rodar com: E2E=1 bash supabase/testes/rodar_integracao.sh (o PostgREST só roda no Linux: no PC
// do Nicolas, só pelo GitHub).
//
// Por que o Diário de obra (Relatórios) e não a FVS: a obra de teste não tem planta publicada, e a
// FVS e o Concreto só marcam em cima da planta. O Diário grava pelo mesmo núcleo (registrar, fila,
// envio, download) e aceita foto, então cobre o mesmo caminho. Quando houver planta de teste, vale
// repetir o E1 marcando um pilar na FVS.
//
// Aparelho A = campo (celular, 375 px). Aparelho B = gestor (tablet, 800 px).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
/* eslint-disable @typescript-eslint/no-explicit-any */
type Browser = any
type BrowserContext = any
type Page = any
import { iniciarServidorTeste, type ServidorTeste } from './servidor_teste'
import { CODIGO_TESTE, USUARIOS } from './dados'

const ATIVO = process.env.SO_PGRST_URL && process.env.SO_E2E === '1'
const suite = ATIVO ? describe : describe.skip
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SAIDA = mkdtempSync(path.join(os.tmpdir(), 'sistema-obra-dist-'))
const PRINTS = process.env.SO_PRINTS
// O banco de teste é o mesmo para todos os arquivos da rodada: os textos levam uma marca desta
// execução, e as contagens filtram por ela.
const MARCA = `s${Date.now().toString(36)}`
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==', 'base64')

let servidor: ServidorTeste
let site: PreviewServer
let navegador: Browser
let urlApp = ''

interface Aparelho {
  nome: string
  contexto: BrowserContext
  p: Page
  erros: string[]
  /** Últimas mensagens do console da página (vão na mensagem de erro do teste, para o log do CI). */
  console: string[]
}
let A: Aparelho
let B: Aparelho

async function capturar(ap: Aparelho, nome: string) {
  if (PRINTS)
    await ap.p.screenshot({
      path: path.join(PRINTS, `sinc_${ap.nome}_${nome}.png`),
      fullPage: true,
    })
}

async function novoAparelho(nome: string, viewport: { width: number; height: number }): Promise<Aparelho> {
  const contexto = await navegador.newContext({
    viewport,
    deviceScaleFactor: PRINTS ? 2 : 1,
  })
  const p = await contexto.newPage()
  const erros: string[] = []
  p.on('pageerror', (e: Error) => erros.push(e.message))
  p.on('dialog', (d: { accept(): Promise<void> }) => d.accept())
  const mensagens: string[] = []
  p.on('console', (m: { type(): string; text(): string }) => {
    mensagens.push(`${m.type()}: ${m.text()}`)
    if (mensagens.length > 40) mensagens.shift()
  })
  return { nome, contexto, p, erros, console: mensagens }
}

/**
 * Espera o texto da barra de sincronização casar com `esperado`. Se não casar no prazo, o erro diz
 * o que a barra mostrava e o console da página: o CI é o único lugar onde estes testes rodam.
 */
async function esperarBarra(ap: Aparelho, esperado: RegExp, prazoMs: number) {
  const fim = Date.now() + prazoMs
  let visto = ''
  // o que a barra mostrou no caminho (fora "Sincronizando…"): vai para o log, para saber se o app
  // passou por um estado errado antes de chegar ao certo
  const caminho: string[] = []
  while (Date.now() < fim) {
    visto = ((await ap.p.getByTestId('estado-sincronizacao').textContent().catch(() => '')) ?? '').trim()
    if (esperado.test(visto)) {
      if (caminho.length) console.warn(`${ap.nome}: antes de ${esperado}, a barra mostrou: ${caminho.join(' | ')}`)
      return
    }
    if (visto && !visto.startsWith('Sincronizando') && !caminho.includes(visto)) caminho.push(visto)
    await ap.p.waitForTimeout(500)
  }
  const botoes = await ap.p.locator('.barra button').allTextContents().catch(() => [])
  const linhas = [
    `${ap.nome}: a barra não mostrou ${esperado} em ${prazoMs / 1000} s.`,
    `Barra: "${visto}"`,
    `Antes: ${caminho.join(' | ')}`,
    `Botões: ${JSON.stringify(botoes)}`,
    'Console:',
    ...ap.console,
  ]
  throw new Error(linhas.join('\n'))
}

/** Se a barra pede "Entrar de novo" (teste anterior parou no meio), entra para este teste não depender dele. */
async function garantirLogin(ap: Aparelho, email: string) {
  await irAoMenu(ap.p)
  const entrarDeNovo = ap.p.getByRole('button', { name: 'Entrar de novo' })
  if (await entrarDeNovo.isVisible()) {
    await entrarDeNovo.click()
    await entrar(ap.p, email)
  }
}

// o menu da obra fica no topo desde 20/11/2026 (Trocar de obra e Sair dentro dele)
const menu = (p: Page) => p.getByTestId('menu-obra')

/** Código de teste na tela de login; depois escolhe a OBRA1 se o app perguntar. */
async function entrar(p: Page, email: string) {
  await p.getByLabel('E-mail').fill(email)
  await p.getByRole('button', { name: 'Enviar código' }).click()
  await p.getByRole('heading', { name: 'Digite o código' }).waitFor()
  await p.getByLabel('Código').fill(CODIGO_TESTE)
  await p.getByRole('button', { name: 'Entrar' }).click()
  const escolher = p.getByRole('button', { name: /OBRA1/ })
  await Promise.race([escolher.waitFor(), menu(p).waitFor()])
  if (await escolher.isVisible()) await escolher.click()
  await menu(p).waitFor()
}

/** Volta ao menu da obra pelos botões "Voltar" (ou pelo voltar do navegador). */
async function irAoMenu(p: Page) {
  for (let i = 0; i < 10; i++) {
    if (await menu(p).isVisible()) return
    const voltar = p.getByRole('button', { name: 'Voltar' }).first()
    if (await voltar.isVisible()) await voltar.click()
    else await p.goBack()
    await p.waitForTimeout(250)
  }
  await menu(p).waitFor()
}

/** No menu: "Sincronizar agora" e espera terminar (a hora da última sincronização muda). */
async function sincronizar(p: Page) {
  await irAoMenu(p)
  const estado = p.getByTestId('estado-sincronizacao')
  const antes = await estado.getAttribute('data-ultima')
  const botao = p.getByRole('button', { name: 'Sincronizar agora' })
  await expect.poll(() => botao.isEnabled(), { timeout: 20_000 }).toBe(true)
  await botao.click()
  await expect.poll(async () => (await estado.getAttribute('data-ultima')) !== antes && !(await estado.textContent())?.includes('Sincronizando'), { timeout: 30_000 }).toBe(true)
}

async function textoDaFila(p: Page): Promise<string> {
  await irAoMenu(p)
  return (await p.getByTestId('fila').textContent()) ?? ''
}

/**
 * Confere o texto da fila no menu. O menu abre com a contagem em 0 ("Nada esperando envio.") e conta
 * em seguida: ler na hora pegava o 0 (CI do #86, 18/11/2026). Espera chegar ao esperado e continuar
 * igual por 1,5 s, para um "Nada" de antes da contagem não passar por certo.
 */
async function filaDeve(p: Page, esperado: string | RegExp) {
  const casa = (t: string) => (typeof esperado === 'string' ? t === esperado : esperado.test(t))
  await expect.poll(() => textoDaFila(p), { timeout: 15_000 }).toSatisfy(casa)
  await p.waitForTimeout(1_500)
  expect(await textoDaFila(p)).toSatisfy(casa)
}

/** Abre o Diário de obra no dia de hoje. */
async function diaDeHoje(p: Page) {
  await irAoMenu(p)
  await p.getByRole('button', { name: /^Relatórios/ }).click()
  await p.getByTestId('abrir-hoje').click()
  await p.getByTestId('secao-diario_efetivo').waitFor()
}

/** Linhas de uma tabela guardadas no aparelho (todas as versões: original e correções). */
function linhasNoAparelho(p: Page, tabela: string): Promise<Record<string, unknown>[]> {
  return p.evaluate(
    (t: string) =>
      new Promise<Record<string, unknown>[]>((ok, falha) => {
        const r = indexedDB.open('sistema-obra')
        r.onerror = () => falha(r.error)
        r.onsuccess = () => {
          const q = r.result.transaction('registros').objectStore('registros').getAll()
          q.onsuccess = () => {
            ok(q.result.filter((l: { tabela: string }) => l.tabela === t).map((l: { linha?: Record<string, unknown> }) => l.linha ?? l))
            r.result.close()
          }
        }
      }),
    tabela,
  )
}

const comMarca = (linhas: Record<string, unknown>[], texto: string) => linhas.filter((l) => JSON.stringify(l).includes(texto))

suite('sincronização entre dois aparelhos (telas)', () => {
  beforeAll(async () => {
    servidor = await iniciarServidorTeste({
      pgrstUrl: process.env.SO_PGRST_URL!,
      segredoJwt: process.env.SO_JWT_SEGREDO!,
      usuarios: Object.values(USUARIOS),
    })
    process.env.VITE_SUPABASE_URL = servidor.url
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'chave-publica-de-teste'
    const ambiente = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    // O Diário pode estar fora do menu (betas escondidos): este build de teste abre os módulos fora do
    // menu também (ver modulos.ts). Só aqui; o build de produção não liga.
    process.env.VITE_TESTE_MODULOS_FORA_DO_MENU = '1'
    try {
      await build({
        root: RAIZ,
        logLevel: 'error',
        build: { outDir: SAIDA, emptyOutDir: true },
      })
    } finally {
      process.env.NODE_ENV = ambiente
      delete process.env.VITE_TESTE_MODULOS_FORA_DO_MENU
    }
    site = await preview({
      root: RAIZ,
      logLevel: 'error',
      build: { outDir: SAIDA },
      preview: { port: 4181, strictPort: false },
    })
    urlApp = site.resolvedUrls!.local[0]
    const { chromium } = createRequire(import.meta.url)('playwright')
    navegador = await chromium.launch()

    A = await novoAparelho('A', { width: 375, height: 812 })
    B = await novoAparelho('B', { width: 800, height: 1280 })
    for (const [ap, email] of [
      [A, USUARIOS.campo.email],
      [B, USUARIOS.gestor.email],
    ] as const) {
      await ap.p.goto(urlApp)
      await ap.p.getByRole('heading', { name: 'Sistema Obra' }).waitFor()
      await entrar(ap.p, email)
      await ap.p.getByText(/Sincronizado hoje/).waitFor({ timeout: 20_000 })
      // service worker pronto: sem internet a página recarrega do cache do app
      await ap.p.evaluate(() => navigator.serviceWorker.ready.then(() => true))
    }
  }, 180_000)

  // Cada teste começa com os dois aparelhos com internet: um teste que falha no meio de um trecho sem
  // internet (E2) deixava o seguinte começar desligado e cair por outro motivo (CI do #86, 18/11/2026).
  beforeEach(async () => {
    for (const ap of [A, B]) await ap?.contexto.setOffline(false)
  })

  afterAll(async () => {
    await navegador?.close()
    await site?.close()
    await servidor?.fechar()
    rmSync(SAIDA, { recursive: true, force: true })
  })

  it('E1: A sem internet corrige com foto, B corrige o mesmo registro; os dois terminam iguais e o histórico tem tudo', async () => {
    const texto = `Ocorrência E1 ${MARCA}`
    // A registra com internet e os dois aparelhos recebem
    await diaDeHoje(A.p)
    await A.p.getByTestId('novo-diario_ocorrencias').click()
    await A.p.getByTestId('campo-tipo').getByRole('button').first().click()
    await A.p.locator('#rl-descricao').fill(texto)
    await A.p.locator('#rl-horas_paradas').fill('1')
    await A.p.getByRole('button', { name: 'Só salvar' }).click()
    await A.p
      .getByTestId('secao-diario_ocorrencias')
      .getByRole('button', { name: new RegExp(texto) })
      .waitFor()
    await sincronizar(A.p)
    await filaDeve(A.p, 'Nada esperando envio.')
    await sincronizar(B.p)
    await diaDeHoje(B.p)
    await B.p
      .getByTestId('secao-diario_ocorrencias')
      .getByRole('button', { name: new RegExp(texto) })
      .waitFor()

    // A perde a internet: corrige as horas e põe uma foto
    await A.contexto.setOffline(true)
    await diaDeHoje(A.p)
    await A.p
      .getByTestId('secao-diario_ocorrencias')
      .getByRole('button', { name: new RegExp(texto) })
      .click()
    await A.p.locator('#rl-horas_paradas').fill('2')
    await A.p.getByRole('button', { name: 'Salvar', exact: true }).click()
    await A.p
      .getByTestId('secao-diario_ocorrencias')
      .getByRole('button', { name: new RegExp(texto) })
      .click()
    expect(await A.p.locator('#rl-horas_paradas').inputValue()).toMatch(/^2([,.]0)?$/)
    await A.p.locator('[data-testid="input-foto"]').setInputFiles({ name: 'e1.png', mimeType: 'image/png', buffer: PNG })
    await A.p.getByTestId('fotos').locator('li').first().waitFor()
    await capturar(A, 'e1_sem_internet')
    await filaDeve(A.p, /registros? esperando envio/)

    // B, com internet e depois de A, corrige o mesmo registro
    await B.p
      .getByTestId('secao-diario_ocorrencias')
      .getByRole('button', { name: new RegExp(texto) })
      .click()
    await B.p.locator('#rl-horas_paradas').fill('3')
    await B.p.getByRole('button', { name: 'Salvar', exact: true }).click()
    await B.p.getByTestId('secao-diario_ocorrencias').waitFor()
    await sincronizar(B.p)

    // A volta: envia o que guardou e recebe a correção de B
    await A.contexto.setOffline(false)
    await sincronizar(A.p)
    await filaDeve(A.p, 'Nada esperando envio.')
    await sincronizar(B.p)

    // Os dois mostram a mesma coisa: vale a correção mais nova (B) e a foto de A aparece nos dois
    for (const ap of [A, B]) {
      await diaDeHoje(ap.p)
      const secao = ap.p.getByTestId('secao-diario_ocorrencias')
      expect(await secao.getByRole('button', { name: new RegExp(texto) }).count()).toBe(1)
      await secao.getByRole('button', { name: new RegExp(texto) }).click()
      expect(await ap.p.locator('#rl-horas_paradas').inputValue()).toMatch(/^3([,.]0)?$/)
      await ap.p.getByTestId('fotos').locator('li').first().waitFor()
      expect(await ap.p.getByTestId('fotos').locator('li').count()).toBe(1)
      await capturar(ap, 'e1_final')
      // histórico: original + correção de A + correção de B, nos dois aparelhos
      const versoes = comMarca(await linhasNoAparelho(ap.p, 'diario_ocorrencias'), texto)
      expect(versoes.map((l) => Number(l.horas_paradas)).sort()).toEqual([1, 2, 3])
    }
    expect(A.erros).toEqual([])
    expect(B.erros).toEqual([])
  }, 180_000)

  it('E2: 20 registros sem internet, com a página recarregada no meio; B recebe os 20, sem repetir', async () => {
    const funcao = (i: number) => `Função E2 ${MARCA} ${String(i).padStart(2, '0')}`
    const naSecao = (p: Page) =>
      p
        .getByTestId('secao-diario_efetivo')
        .locator('.rl-item')
        .filter({ hasText: `Função E2 ${MARCA}` })

    await A.contexto.setOffline(true)
    await diaDeHoje(A.p)
    const adicionar = async (de: number, ate: number) => {
      await A.p.getByTestId('novo-diario_efetivo').click()
      for (let i = de; i <= ate; i++) {
        await A.p.locator('#rl-funcao').fill(funcao(i))
        await A.p.locator('#rl-quantidade').fill('1')
        await A.p.getByRole('button', { name: 'Salvar e adicionar outro' }).click()
        await A.p.getByText(new RegExp(`Salvo: ${funcao(i)}`)).waitFor()
      }
      await A.p.getByRole('button', { name: 'Voltar' }).first().click()
      await A.p.getByTestId('secao-diario_efetivo').waitFor()
    }
    await adicionar(1, 10)
    expect(await naSecao(A.p).count()).toBe(10)

    // recarrega sem internet (o app vem do cache): os 10 continuam no aparelho e na fila
    await A.p.reload()
    await irAoMenu(A.p)
    await A.p.getByText(/Sem internet\. Pode continuar trabalhando/).waitFor()
    await filaDeve(A.p, '10 registros esperando envio.')
    await diaDeHoje(A.p)
    expect(await naSecao(A.p).count()).toBe(10)
    await adicionar(11, 20)
    expect(await naSecao(A.p).count()).toBe(20)
    await capturar(A, 'e2_20_sem_internet')

    await A.contexto.setOffline(false)
    await sincronizar(A.p)
    await filaDeve(A.p, 'Nada esperando envio.')
    // sincronizar de novo não pode repetir nada
    await sincronizar(A.p)
    await sincronizar(B.p)
    await diaDeHoje(B.p)
    await expect.poll(() => naSecao(B.p).count(), { timeout: 10_000 }).toBe(20)
    const nomes = (await naSecao(B.p).allTextContents()).map((t: string) => /Função E2 \S+ (\d\d)/.exec(t)?.[1])
    expect(new Set(nomes).size).toBe(20)
    expect(comMarca(await linhasNoAparelho(B.p, 'diario_efetivo'), `Função E2 ${MARCA}`)).toHaveLength(20)
    await capturar(B, 'e2_recebidos')
    expect(A.erros).toEqual([])
  }, 240_000)

  it('E3: login vencido, registra mesmo assim, entra de novo e tudo sobe', async () => {
    const texto = `Ocorrência E3 ${MARCA}`
    // Login vencido de verdade: o token de acesso já passou da hora e o de renovação não vale mais
    // (como depois de semanas sem abrir o app). O supabase-js tenta renovar, o servidor recusa.
    await irAoMenu(A.p)
    await A.p.evaluate(() => {
      const chave = 'sistema-obra-sessao'
      const s = JSON.parse(localStorage.getItem(chave)!)
      s.expires_at = Math.floor(Date.now() / 1000) - 3600
      s.refresh_token = 'renovacao-vencida'
      localStorage.setItem(chave, JSON.stringify(s))
    })
    await A.p.reload()
    await menu(A.p).waitFor()
    // a sincronização roda sozinha ao abrir o menu; não clicar, para não disputar com ela
    await esperarBarra(A, /Seu login venceu/, 75_000)
    await capturar(A, 'e3_login_venceu')

    // registra com o login vencido: fica no aparelho, esperando
    await diaDeHoje(A.p)
    await A.p.getByTestId('novo-diario_ocorrencias').click()
    await A.p.getByTestId('campo-tipo').getByRole('button').first().click()
    await A.p.locator('#rl-descricao').fill(texto)
    await A.p.getByRole('button', { name: 'Só salvar' }).click()
    await A.p
      .getByTestId('secao-diario_ocorrencias')
      .getByRole('button', { name: new RegExp(texto) })
      .waitFor()
    await filaDeve(A.p, '1 registro esperando envio.')
    expect(await A.p.getByText(/foram recusados|foi recusado/).count()).toBe(0)

    // entra de novo com a mesma conta: nada se perde e o registro sobe
    await A.p.getByRole('button', { name: 'Entrar de novo' }).click()
    await entrar(A.p, USUARIOS.campo.email)
    await sincronizar(A.p)
    await filaDeve(A.p, 'Nada esperando envio.')
    await sincronizar(B.p)
    await diaDeHoje(B.p)
    await B.p
      .getByTestId('secao-diario_ocorrencias')
      .getByRole('button', { name: new RegExp(texto) })
      .waitFor()
    expect(A.erros).toEqual([])
  }, 180_000)

  it('E4: barra de sincronização e lista de recusados legíveis no celular (375 px) e no tablet', async () => {
    // Três itens recusados com mensagem longa, colocados direto na fila do aparelho: o que se
    // confere aqui é a leitura na tela, não o motivo da recusa (esse está nos testes de integração).
    const recusar = (ap: Aparelho, usuarioId: string) =>
      ap.p.evaluate(
        ({ usuarioId, marca }: { usuarioId: string; marca: string }) =>
          new Promise<void>((ok, falha) => {
            const r = indexedDB.open('sistema-obra')
            r.onerror = () => falha(r.error)
            r.onsuccess = () => {
              const tx = r.result.transaction('fila', 'readwrite')
              for (let i = 1; i <= 3; i++) {
                tx.objectStore('fila').add({
                  usuario_id: usuarioId,
                  obra_id: '11111111-1111-1111-1111-111111111111',
                  tabela: 'diario_ocorrencias',
                  id: `${marca}-recusado-${i}`,
                  linha: {},
                  estado: 'erro',
                  tentativas: 1,
                  erro: 'new row violates row-level security policy for table "diario_ocorrencias" (código 42501, permissão negada para esta conta nesta obra)',
                  criado_em: new Date().toISOString(),
                })
              }
              tx.oncomplete = () => {
                r.result.close()
                ok()
              }
              tx.onerror = () => falha(tx.error)
            }
          }),
        { usuarioId, marca: MARCA },
      )

    for (const [ap, usuarioId, larguras] of [
      [A, USUARIOS.campo.id, [375, 812]],
      [B, USUARIOS.gestor.id, [800, 1280]],
    ] as const) {
      await garantirLogin(ap, ap === A ? USUARIOS.campo.email : USUARIOS.gestor.email)
      await recusar(ap, usuarioId)
      await ap.p.setViewportSize({ width: larguras[0], height: larguras[1] })
      await ap.p.reload()
      await menu(ap.p).waitFor()
      const lista = ap.p.locator('.erro-fila')
      await lista.getByText('3 registros foram recusados pelo servidor.').waitFor()
      await capturar(ap, 'e4_recusados')

      // nada sai da tela para o lado: a página não rola na horizontal
      const larguraPagina = await ap.p.evaluate(() => document.documentElement.scrollWidth)
      expect(larguraPagina).toBeLessThanOrEqual(larguras[0])
      for (const alvo of [
        ap.p.getByTestId('estado-sincronizacao'),
        ap.p.getByTestId('fila'),
        ap.p.getByRole('button', { name: 'Sincronizar agora' }),
        lista.locator('li').first(),
        lista.getByRole('button', { name: 'Tentar enviar de novo' }),
      ]) {
        const caixa = await alvo.boundingBox()
        expect(caixa).not.toBeNull()
        expect(caixa!.x).toBeGreaterThanOrEqual(0)
        expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(larguras[0] + 0.5)
      }
      // letra legível (pelo menos 14 px) e botão grande o bastante para o dedo (44 px de altura)
      const fonte = await lista
        .locator('li')
        .first()
        .evaluate((el: Element) => parseFloat(getComputedStyle(el).fontSize))
      expect(fonte).toBeGreaterThanOrEqual(14)
      const botao = await lista.getByRole('button', { name: 'Tentar enviar de novo' }).boundingBox()
      expect(botao!.height).toBeGreaterThanOrEqual(44)
    }
    expect(A.erros).toEqual([])
    expect(B.erros).toEqual([])
  }, 120_000)
})

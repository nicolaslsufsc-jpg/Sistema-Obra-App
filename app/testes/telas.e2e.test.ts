// Teste das telas no Chromium, com o app compilado de verdade (service worker incluso)
// apontando para o servidor de teste. Rodar com: E2E=1 bash supabase/testes/rodar_integracao.sh

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
// O Playwright vem pré-instalado no ambiente (não é dependência do app, para não baixar
// outro navegador). Sem os tipos dele aqui, ficam como "any".
/* eslint-disable @typescript-eslint/no-explicit-any */
type Browser = any
type BrowserContext = any
type Page = any
import { iniciarServidorTeste, type ServidorTeste } from './servidor_teste'
import { CODIGO_TESTE, USUARIOS } from './dados'

const ATIVO = process.env.SO_PGRST_URL && process.env.SO_E2E === '1'
const suite = ATIVO ? describe : describe.skip
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Pasta de compilação própria de cada execução (duas execuções juntas não se atropelam).
const SAIDA = mkdtempSync(path.join(os.tmpdir(), 'sistema-obra-dist-'))
const PRINTS = process.env.SO_PRINTS // pasta para salvar capturas de tela (opcional)

let servidor: ServidorTeste
let site: PreviewServer
let navegador: Browser
let contexto: BrowserContext
let pagina: Page
let urlApp = ''
let ultimoDialogo = ''

async function capturar(nome: string) {
  if (PRINTS) await pagina.screenshot({ path: path.join(PRINTS, `${nome}.png`), fullPage: true })
}

async function entrar(email: string) {
  await pagina.getByLabel('E-mail').fill(email)
  await pagina.getByRole('button', { name: 'Enviar código' }).click()
  await pagina.getByRole('heading', { name: 'Digite o código' }).waitFor()
  await pagina.getByLabel('Código').fill(CODIGO_TESTE)
  await pagina.getByRole('button', { name: 'Entrar' }).click()
}

suite('telas no navegador', () => {
  beforeAll(async () => {
    servidor = await iniciarServidorTeste({
      pgrstUrl: process.env.SO_PGRST_URL!,
      segredoJwt: process.env.SO_JWT_SEGREDO!,
      usuarios: Object.values(USUARIOS),
    })
    process.env.VITE_SUPABASE_URL = servidor.url
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'chave-publica-de-teste'
    // como o Cloudflare compila: dentro do vitest o NODE_ENV é "test", e o Vite deixaria o modo de
    // desenvolvimento ligado (import.meta.env.DEV)
    const ambiente = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      await build({ root: RAIZ, logLevel: 'error', build: { outDir: SAIDA, emptyOutDir: true } })
    } finally {
      process.env.NODE_ENV = ambiente
    }
    site = await preview({ root: RAIZ, logLevel: 'error', build: { outDir: SAIDA }, preview: { port: 4180, strictPort: false } })
    urlApp = site.resolvedUrls!.local[0]

    const { chromium } = createRequire(import.meta.url)('playwright')
    navegador = await chromium.launch()
    contexto = await navegador.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: PRINTS ? 2 : 1 })
    pagina = await contexto.newPage()
    // "Sair" pede confirmação (confirm): aceita e guarda o texto para conferir.
    pagina.on('dialog', async (d: { message(): string; accept(): Promise<void> }) => {
      ultimoDialogo = d.message()
      await d.accept()
    })
  }, 120_000)

  afterAll(async () => {
    await navegador?.close()
    await site?.close()
    await servidor?.fechar()
    rmSync(SAIDA, { recursive: true, force: true })
  })

  it('entra com código, vê só a própria obra e baixa o cadastro', async () => {
    await pagina.goto(urlApp)
    await pagina.getByRole('heading', { name: 'Sistema Obra' }).waitFor()
    await capturar('1-entrar')
    await entrar(USUARIOS.campo.email)

    await pagina.getByRole('heading', { name: 'Escolha a obra' }).waitFor()
    await pagina.getByRole('button', { name: /OBRA1/ }).waitFor()
    await capturar('2-obras')
    expect(await pagina.getByRole('button', { name: /OBRA2/ }).count()).toBe(0)
    await pagina.getByRole('button', { name: /OBRA1/ }).click()

    await pagina.getByText(/Sincronizado hoje/).waitFor({ timeout: 20_000 })
    await pagina.getByText(/Térreo, 2º Pavimento, Cobertura/).waitFor()
    expect(await pagina.getByTestId('papel').textContent()).toBe('Campo')
    await capturar('3-menu')
  })

  it('abre sem internet com os dados do aparelho', async () => {
    // Garante que o service worker controla a página (instalado na primeira visita).
    await pagina.evaluate(() => navigator.serviceWorker.ready.then(() => true))
    await pagina.reload()
    expect(await pagina.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

    await contexto.setOffline(true)
    await pagina.reload()
    await pagina.getByText(/Sem internet\. Pode continuar trabalhando/).waitFor()
    await pagina.getByText(/Térreo, 2º Pavimento, Cobertura/).waitFor()
    await capturar('4-menu-sem-internet')

    // O Concreto é um arquivo separado, carregado só ao abrir: sem internet vem do cache do app.
    await pagina.getByRole('button', { name: /^Concreto/ }).click()
    await pagina.getByRole('heading', { name: 'Concreto', exact: true }).waitFor()
    await pagina.goBack()
    await pagina.getByText(/Térreo, 2º Pavimento, Cobertura/).waitFor()

    // Quando a internet volta, sincroniza de novo (a hora da última sincronização muda).
    const barra = pagina.getByTestId('estado-sincronizacao')
    const antes = await barra.getAttribute('data-ultima')
    await pagina.waitForTimeout(1100)
    await contexto.setOffline(false)
    await pagina.waitForFunction(
      (valorAntes: string) =>
        document.querySelector('[data-testid="estado-sincronizacao"]')?.getAttribute('data-ultima') !== valorAntes,
      antes,
      { timeout: 20_000 },
    )
    await pagina.getByText(/Sincronizado hoje/).waitFor()
  })

  it('sair pede confirmação e volta para a tela de e-mail', async () => {
    await pagina.getByRole('button', { name: 'Sair' }).click()
    await pagina.getByRole('button', { name: 'Enviar código' }).waitFor()
    expect(ultimoDialogo).toMatch(/Sair desta conta neste aparelho/)
  })

  it('conta sem acesso vê a explicação de como pedir acesso', async () => {
    await entrar(USUARIOS.fora.email)
    await pagina.getByText(/ainda não tem acesso a nenhuma obra/).waitFor()
    await pagina.getByText(USUARIOS.fora.email, { exact: false }).first().waitFor()
    await capturar('5-sem-acesso')
  })

  it('app fechado enquanto a pessoa lê o e-mail: volta direto na tela do código', async () => {
    await pagina.getByRole('button', { name: 'Sair' }).click()
    await pagina.getByLabel('E-mail').fill(USUARIOS.campo.email)
    await pagina.getByRole('button', { name: 'Enviar código' }).click()
    await pagina.getByRole('heading', { name: 'Digite o código' }).waitFor()
    await pagina.reload()
    await pagina.getByRole('heading', { name: 'Digite o código' }).waitFor()
    await pagina.getByText(USUARIOS.campo.email).waitFor()
    await pagina.getByRole('button', { name: 'Trocar e-mail' }).click()
    await pagina.getByRole('button', { name: 'Enviar código' }).waitFor()
  })

  it('código errado mostra mensagem clara', async () => {
    await pagina.getByLabel('E-mail').fill(USUARIOS.campo.email)
    await pagina.getByRole('button', { name: 'Enviar código' }).click()
    await pagina.getByLabel('Código').fill('999999')
    await pagina.getByRole('button', { name: 'Entrar' }).click()
    await pagina.getByText(/Código errado ou vencido/).waitFor()
  })

  it('admin dá, muda e tira acesso pela tela Pessoas da obra', async () => {
    await pagina.getByRole('button', { name: 'Trocar e-mail' }).click()
    await entrar(USUARIOS.admin.email)
    await pagina.getByRole('button', { name: /OBRA1/ }).click()
    // O menu é longo: rola até o fim antes de abrir, para conferir que a tela nova começa no alto.
    await pagina.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await pagina.getByRole('button', { name: 'Pessoas da obra' }).click()
    await pagina.getByRole('heading', { name: 'Pessoas da obra OBRA1' }).waitFor()
    expect(await pagina.evaluate(() => window.scrollY)).toBe(0)

    // O próprio admin aparece, sem controles.
    const linhaAdmin = pagina.getByTestId('com-acesso').filter({ hasText: USUARIOS.admin.email })
    await linhaAdmin.getByText('Administrador (vê todas as obras)').waitFor()

    // Quem entrou e não tem acesso fica numa lista recolhida.
    await pagina.getByTestId('sem-acesso-lista').locator('summary').click()
    const semAcesso = pagina.getByTestId('sem-acesso').filter({ hasText: USUARIOS.fora.email })
    await semAcesso.waitFor()
    await capturar('6-pessoas')
    await semAcesso.getByLabel(`Papel para ${USUARIOS.fora.email}`).selectOption('gestor')
    await semAcesso.getByRole('button', { name: `Dar acesso a ${USUARIOS.fora.email}` }).click()
    expect(ultimoDialogo).toMatch(/Dar acesso de Gestor à obra OBRA1 para fora@teste.local/)
    const linha = pagina.getByTestId('com-acesso').filter({ hasText: USUARIOS.fora.email })
    await linha.waitFor()
    await pagina.getByTestId('mensagem').filter({ hasText: `${USUARIOS.fora.email} agora é Gestor na OBRA1.` }).waitFor()
    expect(await linha.getByLabel(`Papel de ${USUARIOS.fora.email}`).inputValue()).toBe('gestor')

    await linha.getByLabel(`Papel de ${USUARIOS.fora.email}`).selectOption('leitura')
    expect(ultimoDialogo).toMatch(/Mudar o papel de fora@teste.local .* de Gestor para Somente leitura/)
    await pagina.getByTestId('mensagem').filter({ hasText: `${USUARIOS.fora.email} agora é Somente leitura.` }).waitFor()
    expect(await linha.getByLabel(`Papel de ${USUARIOS.fora.email}`).inputValue()).toBe('leitura')

    await linha.getByRole('button', { name: `Tirar acesso de ${USUARIOS.fora.email}` }).click()
    expect(ultimoDialogo).toMatch(/Tirar o acesso de fora@teste.local/)
    expect(ultimoDialogo).toMatch(/fica preso no celular/)
    await pagina.getByTestId('mensagem').filter({ hasText: `${USUARIOS.fora.email} não tem mais acesso à OBRA1.` }).waitFor()
    await pagina.getByTestId('sem-acesso-lista').locator('summary').click()
    await pagina.getByTestId('sem-acesso').filter({ hasText: USUARIOS.fora.email }).waitFor()

    // E-mail errado no formulário: o campo continua preenchido para corrigir.
    await pagina.getByLabel(/E-mail da pessoa/).fill('ninguem@teste.local')
    await pagina.getByRole('button', { name: 'Dar acesso', exact: true }).click()
    await pagina.getByTestId('mensagem').filter({ hasText: /nenhuma conta com o e-mail ninguem@teste.local/ }).waitFor()
    expect(await pagina.getByLabel(/E-mail da pessoa/).inputValue()).toBe('ninguem@teste.local')

    // "Voltar" do navegador (ou do Android) volta ao menu em vez de sair do app.
    await pagina.goBack()
    await pagina.getByRole('button', { name: 'Pessoas da obra' }).waitFor()
    await pagina.getByRole('button', { name: 'Pessoas da obra' }).click()
    await pagina.getByRole('button', { name: 'Voltar para a obra' }).click()
    await pagina.getByRole('button', { name: 'Pessoas da obra' }).waitFor()
  })

  it('quem não é admin não vê o botão Pessoas da obra', async () => {
    await pagina.getByRole('button', { name: 'Sair' }).click()
    await entrar(USUARIOS.gestor.email)
    await pagina.getByRole('button', { name: /OBRA1/ }).click()
    await pagina.getByRole('button', { name: 'Trocar de obra' }).waitFor()
    expect(await pagina.getByRole('button', { name: 'Pessoas da obra' }).count()).toBe(0)
  })

  it('menu abre o módulo pronto e o voltar do Android retorna ao menu', async () => {
    // Desde 18/11/2026 o menu tem FVS, Concreto e Documentos: os betas Projetos, IFC e Relatórios saíram,
    // com o código guardado.
    const concreto = pagina.getByRole('button', { name: /^Concreto/ })
    expect(await concreto.isEnabled()).toBe(true)
    for (const beta of [/^IFC/, /^Projetos/, /^Relatórios/]) expect(await pagina.getByRole('button', { name: beta }).count()).toBe(0)

    await concreto.click()
    await pagina.getByRole('heading', { name: 'Concreto', exact: true }).waitFor()
    expect(await pagina.evaluate(() => history.state?.tela)).toBe('concreto')
    await pagina.goBack()
    await pagina.getByRole('button', { name: 'Trocar de obra' }).waitFor()

    // O "Voltar" da tela inicial do módulo também volta ao menu.
    await pagina.getByRole('button', { name: /^Concreto/ }).click()
    await pagina.getByRole('heading', { name: 'Concreto', exact: true }).waitFor()
    await pagina.getByRole('button', { name: 'Voltar', exact: true }).click()
    await pagina.getByRole('button', { name: 'Trocar de obra' }).waitFor()
  })

  it('FVS abre pelo menu e o voltar retorna ao menu', async () => {
    const fvs = pagina.getByRole('button', { name: /^FVS/ })
    expect(await fvs.isEnabled()).toBe(true)
    await fvs.click()
    await pagina.getByRole('heading', { name: 'FVS', exact: true }).waitFor()
    expect(await pagina.evaluate(() => history.state?.tela)).toBe('fvs')
    // obra de teste sem planta publicada: a tela explica como publicar
    await pagina.getByText('Nenhuma planta publicada nesta obra ainda', { exact: false }).waitFor()
    await pagina.getByRole('button', { name: 'Voltar', exact: true }).click()
    await pagina.getByRole('button', { name: 'Trocar de obra' }).waitFor()
  })

  // Bug do teste no celular (18/11): reabrir o app voltava ao menu em vez do módulo aberto.
  it('recarregar ou reabrir com o módulo aberto volta nele; depois de Sair, abre no login', async () => {
    await pagina.getByRole('button', { name: /^Concreto/ }).click()
    await pagina.getByRole('heading', { name: 'Concreto', exact: true }).waitFor()
    await pagina.reload()
    await pagina.getByRole('heading', { name: 'Concreto', exact: true }).waitFor()

    // Chrome fechado e aberto: página nova, sem o histórico, com o que o aparelho guardou
    const nova = await contexto.newPage()
    await nova.goto(urlApp)
    await nova.getByRole('heading', { name: 'Concreto', exact: true }).waitFor()
    await nova.goBack() // o voltar do Android cai no menu
    await nova.getByRole('button', { name: 'Trocar de obra' }).waitFor()
    await nova.close()

    // Sair: reabrir cai no login, não no módulo
    await pagina.getByRole('button', { name: 'Voltar', exact: true }).click()
    await pagina.getByRole('button', { name: 'Trocar de obra' }).waitFor()
    await pagina.getByRole('button', { name: /^Concreto/ }).click()
    await pagina.getByRole('heading', { name: 'Concreto', exact: true }).waitFor()
    await pagina.goBack()
    await pagina.getByRole('button', { name: 'Sair' }).click()
    await pagina.getByRole('button', { name: 'Enviar código' }).waitFor()
    await pagina.reload()
    await pagina.getByRole('button', { name: 'Enviar código' }).waitFor()
    expect(await pagina.getByRole('heading', { name: 'Concreto', exact: true }).count()).toBe(0)
  })
})

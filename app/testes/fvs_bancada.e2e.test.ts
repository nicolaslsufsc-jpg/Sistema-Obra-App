// Telas da FVS no Chrome, pela bancada (app/dev/fvs.html): sem login nem servidor, com as duas
// plantas de teste (forma e ambientes). Tablet deitado e celular em pé (375 px).
// Roda com SO_E2E=1 (GitHub, junto com as outras telas) ou SO_BANCADA=1.
//   No PC do Nicolas: SO_BANCADA=1 SO_PLAYWRIGHT=<pasta>/node_modules/playwright SO_CHROME=chrome npx vitest run testes/fvs_bancada.e2e.test.ts
// SO_PRINTS=<pasta> salva capturas de tela.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
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
// As horas na tela dependem do fuso do aparelho. No GitHub a máquina está em UTC: sem isto, "09:30" vira "12:30".
const NO_BRASIL = { timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' }

let servidor: ViteDevServer
let navegador: any
let url = ''

interface Registro {
  el: string
  ficha: string
  item: number
  r: string | null
  rod: number
  obs: string | null
  lote: string | null
  planta: string | null
  /** barra de laje: o registro vai em barra_id (desde 20/11), e "el" mostra a barra como local */
  barra: string | null
  /** ficha aberta do registro (null: só no app) */
  fc: string | null
}

/** Registros marcados no app, do mais antigo para o mais novo (lidos pelo núcleo, na página). */
function registros(p: Page): Promise<Registro[]> {
  // texto, e não função: o import() tem que rodar no navegador, não ser reescrito pelo vitest
  return p.evaluate(`(async () => {
    const { sincronizador } = await import('/src/nucleo/servicos.ts')
    const l = await sincronizador.linhas('fvs_eventos', '${OBRA}')
    return l
      .filter((e) => !e.origem_id) // só o que foi marcado no app, não o histórico importado
      .sort((a, b) => (a.criado_em_dispositivo < b.criado_em_dispositivo ? -1 : a.criado_em_dispositivo > b.criado_em_dispositivo ? 1 : a.id < b.id ? -1 : 1))
      .map((e) => ({ el: e.elemento_id ?? e.barra_id, ficha: e.ficha_id, item: e.item, r: e.resultado, rod: e.rodada, obs: e.observacao, lote: e.lote_id, planta: e.planta_id, barra: e.barra_id ?? null, fc: e.ficha_campo_id ?? null }))
  })()`)
}

/** Ponto da planta (pontos da folha) → ponto da tela. A tela expõe o mapa em desenvolvimento. */
function naTela(p: Page, x: number, y: number): Promise<[number, number]> {
  return p.evaluate(
    ([px, py]: [number, number]) => {
      const m = (window as any).__fvMapa
      const q = m.latLngToContainerPoint([-py, px])
      const r = m.getContainer().getBoundingClientRect()
      return [r.left + q.x, r.top + q.y]
    },
    [x, y],
  )
}

// Início da FVS em 3 níveis (21/11/2026): pavimentos → disciplinas do pavimento → opções da disciplina.

/** Volta à lista de pavimentos (nível 1): da planta, o voltar passa pelas opções e pelas disciplinas. */
async function noInicio(p: Page, timeout = 30_000) {
  const fim = Date.now() + timeout
  for (;;) {
    if (await p.getByTestId('fvs-pavimento').first().isVisible().catch(() => false)) return
    const nivel = await p.locator('[data-testid=fvs-nivel-disciplina], [data-testid=fvs-nivel-pavimento]').count().catch(() => 0)
    if (nivel) {
      await p.goBack()
      continue
    }
    if (Date.now() > fim) throw new Error('não chegou à lista de pavimentos da FVS')
    await p.waitForTimeout(200)
  }
}

/** Do início, entra no pavimento (o primeiro, ou o de `nome`) e na disciplina ("estrutura", "alvenaria"...). */
async function naDisciplina(p: Page, disciplina: string, nome?: string) {
  await noInicio(p)
  const cartoes = p.getByTestId('fvs-pavimento')
  await (nome ? cartoes.filter({ hasText: nome }) : cartoes).first().click()
  await p.locator(`[data-testid=fvs-disciplina][data-disciplina=${disciplina}]`).click()
  await p.getByTestId('fvs-nivel-disciplina').waitFor()
}

/** Abre a planta de forma pela Estrutura: na aba `tipo` (opção da forma no aparelho) ou pelo botão da planta. */
async function abrirForma(p: Page, tipo = 'P') {
  await naDisciplina(p, 'estrutura')
  const opcao = p.locator(`[data-testid=fvs-opcao-forma][data-tipo=${tipo}]`)
  const planta = p.getByTestId('fvs-secao-estrutura').locator('[data-testid=fvs-planta], .fv-trechos .fv-abrir')
  await opcao.or(planta).first().click()
}

/** Abre a planta de ambientes pelo botão "Todos os ambientes" de Acabamentos, e não pelas opções (Alvenaria,
 *  Reboco...), que também abrem a planta. */
async function abrirPlantaDeAmbientes(p: Page) {
  await naDisciplina(p, 'acabamentos')
  await p.getByTestId('fvs-ambientes').locator('[data-testid=fvs-planta], .fv-trechos .fv-abrir').first().click()
}

async function tocarNaPlanta(p: Page, x: number, y: number) {
  const [tx, ty] = await naTela(p, x, y)
  await p.mouse.click(tx, ty)
}

/** Põe a planta em (centro, zoom) sem animação e espera ela assentar antes do toque.
 *  Espera fixa não bastava (CI do #49, P6a e P5 no celular): ao fechar o painel, o mapa ainda se ajusta
 *  ao novo tamanho (o efeito do painel, 60 ms depois, faz invalidateSize). Com o processador lento do
 *  GitHub, esse ajuste podia cair entre a conta do ponto e o toque, e o dedo caía fora da peça.
 *  Aqui: espera o mapa saber o próprio tamanho e não ter animação, enquadra, e espera 150 ms sem movimento. */
/** Espera o mapa parar: tamanho certo, sem animação e 150 ms sem movimento (o voo mexe o mapa a cada quadro). */
async function mapaParado(p: Page) {
  await p.evaluate(() => {
    const w = window as any
    const m = w.__fvMapa
    if (!m.__vigiaMovimento) {
      m.__vigiaMovimento = true
      m.on('move resize zoom', () => (w.__ultimoMovimento = performance.now()))
      w.__ultimoMovimento = performance.now()
    }
  })
  await p.waitForFunction(() => {
    const w = window as any
    const m = w.__fvMapa
    const c = m.getContainer()
    const s = m.getSize()
    const parado = !m._animatingZoom && !(m._panAnim && m._panAnim._inProgress)
    return s.x === c.clientWidth && s.y === c.clientHeight && parado && performance.now() - (w.__ultimoMovimento ?? 0) > 150
  })
}

async function enquadrar(p: Page, centro: [number, number], zoom: number) {
  await p.evaluate(() => void ((window as any).__ultimoMovimento = performance.now()))
  await mapaParado(p)
  await p.evaluate(([c, z]: [[number, number], number]) => void (window as any).__fvMapa.setView(c, z, { animate: false }), [centro, zoom] as [[number, number], number])
  await mapaParado(p)
}

/** Enquadra a folha inteira (a busca deixa o zoom em cima de um local só). */
async function verFolhaInteira(p: Page) {
  // Falha rara (09/11, 1 em 20 suítes no celular): o enquadro pega (-2,5) e, até 250 ms depois, o mapa
  // volta ao zoom 0, alvo do voo da busca do P2 que estava terminando. Para a próxima vez dizer quem mexeu,
  // registra cada movimento do mapa nesses 250 ms (quem chamou, e o zoom).
  // Antes de enquadrar, espera o voo da busca acabar: com a máquina lenta (CI, 21/11 à noite) a espera
  // fixa de quem chama não bastava, o voo continuava depois do enquadro e o toque seguinte caía fora
  await mapaParado(p)
  const antes = await p.evaluate(() => {
    const m = (window as any).__fvMapa
    const w = window as any
    w.__movimentos = []
    if (!m.__espiado) {
      m.__espiado = true
      for (const k of ['flyTo', 'setView', '_resetView', '_move', 'invalidateSize', 'panBy']) {
        const f = m[k]
        m[k] = function (...a: any[]) {
          if (w.__movimentos) w.__movimentos.push(`${k} z=${m.getZoom().toFixed(2)} ${String(new Error().stack).replace(/\s+/g, ' ').slice(6, 300)}`)
          return f.apply(this, a)
        }
      }
    }
    const r = { z: m.getZoom(), anim: !!m._animatingZoom, voo: !!m._flyToFrame, pan: !!(m._panAnim && m._panAnim._inProgress) }
    m.fitBounds([[-1300, 0], [0, 2000]], { animate: false })
    return { ...r, depois: m.getZoom() }
  })
  await p.waitForTimeout(250)
  const { z, movimentos } = await p.evaluate(() => {
    const w = window as any
    const r = { z: w.__fvMapa.getZoom(), movimentos: w.__movimentos.slice(0, 12) }
    w.__movimentos = null
    return r
  })
  if (z > -1) throw new Error(`DIAG verFolhaInteira não pegou: ${JSON.stringify({ ...antes, z250: z, movimentos })}`)
  await mapaParado(p)
}

async function buscar(p: Page, texto: string) {
  await p.fill('.fv-busca', texto)
  await p.press('.fv-busca', 'Enter')
}

const semRolagemHorizontal = (p: Page): Promise<number> => p.evaluate(() => document.documentElement.scrollWidth - innerWidth)

/** Tudo o que está no topo da planta fica dentro dele (nada cortado nem para fora da tela). */
const topoCabe = (p: Page): Promise<boolean> =>
  p.evaluate(() => {
    const t = document.querySelector('.fv-topo')!.getBoundingClientRect()
    return [...document.querySelectorAll('.fv-topo > *')].every((e) => {
      const r = e.getBoundingClientRect()
      return (r.width === 0 && r.height === 0) || (r.left >= t.left - 0.5 && r.right <= t.right + 0.5 && r.top >= t.top - 0.5 && r.bottom <= t.bottom + 0.5)
    })
  })

/** Alvos de toque visíveis com menos de 44 px de altura (topo da planta e painel da peça).
 *  A caixa de trecho do título também conta (tinha 30 px até o teste com cabo de 20/11). */
const alvosPequenos = (p: Page): Promise<string[]> =>
  p.evaluate(() =>
    [...document.querySelectorAll('.fv-topo button, .fv-topo select, .fv-topo input, .fv-bt-legenda, .fv-painel button, .fv-painel select, .fv-painel summary, .fv-painel label.fv-foto')]
      .filter((e) => !e.closest('.fv-zoom'))
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' })
      .filter((e) => e.getBoundingClientRect().height < 43.5)
      .map((e) => `${(e.textContent || e.getAttribute('aria-label') || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 24)} (${Math.round(e.getBoundingClientRect().height)} px)`),
  )

/** Textos visíveis com contraste abaixo de 4,5:1 (o mesmo cálculo do local.e2e). */
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
      if (!e || t.length < 2 || !vis(e) || e.closest('.leaflet-pane')) continue
      const c = rgba(getComputedStyle(e).color)
      const b = fundo(e)
      const texto = c.slice(0, 3).map((v, i) => v * c[3] + b[i] * (1 - c[3]))
      const l1 = lum(texto), l2 = lum(b)
      const r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      if (r < 4.5 && !(e.closest('button') as HTMLButtonElement | null)?.disabled) ruins.add(`${t.slice(0, 30)} ${r.toFixed(1)}:1`)
    }
    return [...ruins]
  })
}

/** Contraste nos dois temas (claro, o padrão desde 21/11/2026, e o escuro). */
async function contrasteNosDoisTemas(p: Page): Promise<string[]> {
  const claro = await contrasteBaixo(p)
  await p.evaluate(() => (document.documentElement.dataset.tema = 'escuro'))
  const escuro = await contrasteBaixo(p)
  await p.evaluate(() => delete document.documentElement.dataset.tema)
  return [...escuro.map((t) => `escuro: ${t}`), ...claro.map((t) => `claro: ${t}`)]
}

const item = (p: Page, n: number, r: 'C' | 'NC' | 'NA') => p.locator(`.fv-item[data-item="${n}"] button[data-r="${r}"]`)
const nomeNoPainel = (p: Page, nome: string) => p.waitForFunction((n: string) => document.querySelector('.fv-nm')?.textContent === n, nome)

suite('FVS na bancada (Chrome)', () => {
  beforeAll(async () => {
    // nada da bancada vai para o Supabase de verdade
    process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:9'
    servidor = await createServer({ root: RAIZ, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } })
    await servidor.listen()
    url = `${servidor.resolvedUrls!.local[0]}dev/fvs.html`
    const pw = createRequire(import.meta.url)(process.env.SO_PLAYWRIGHT || 'playwright')
    navegador = await pw.chromium.launch(process.env.SO_CHROME ? { channel: process.env.SO_CHROME, headless: true } : { headless: true })
  }, 120_000)

  afterAll(async () => {
    await navegador?.close()
    await servidor?.close()
  })

  // Tablet em pé (768) e deitado (1024): o cabeçalho espremia o título e "Planta inteira" ficava em pé,
  // uma letra por linha, à esquerda de Pilares/Vigas/Lajes (Pilotis da obra piloto, 14/11).
  for (const [largura, altura] of [
    [768, 1024],
    [1024, 768],
    [375, 812],
  ] as const) {
    it(`${largura}x${altura}: título da planta legível no cabeçalho (pavimento e planta numa linha cada)`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      await p.goto(url)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      // como na obra: folha única (o nome da planta é texto, não a escolha de trecho) e contador da obra grande
      await p.evaluate(() => {
        document.querySelector('.fv-nomes b')!.textContent = 'Pilotis'
        const sel = document.querySelector('.fv-nomes select')
        const s = document.createElement('span')
        s.textContent = 'Planta inteira'
        if (sel) sel.replaceWith(s)
        else document.querySelector('.fv-nomes span')!.textContent = 'Planta inteira'
        // o contador vem em vários pedaços de texto ("1", "/", "24", " liberados"): troca todos os
        // que vêm antes do "· com NC" por um só, como numa obra grande
        // (desde 24/11 o "x/y liberados" fica num span próprio, .fv-prog-lib)
        document.querySelector('.fv-prog .fv-prog-lib')!.textContent = '1.234/4.348 liberados'
      })
      const medida = await p.evaluate(() => {
        const linha = (e: Element | null) => {
          if (!e) return { linhas: 1, largura: 999 }
          const r = e.getBoundingClientRect()
          return { linhas: Math.round(r.height / parseFloat(getComputedStyle(e).lineHeight || '16')), largura: r.width }
        }
        return { pav: linha(document.querySelector('.fv-nomes b')), planta: linha(document.querySelector('.fv-nomes span')) }
      })
      expect(medida.pav.linhas, 'pavimento em uma linha').toBeLessThanOrEqual(1)
      expect(medida.planta.linhas, 'planta em uma linha').toBeLessThanOrEqual(1)
      // dá para ler: cabe pelo menos "Pilotis" e o começo de "Planta inteira"
      expect(medida.pav.largura).toBeGreaterThanOrEqual(45)
      expect(medida.planta.largura).toBeGreaterThanOrEqual(45)
      expect(await topoCabe(p)).toBe(true)
      expect(await alvosPequenos(p)).toEqual([])
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_cabecalho_${largura}.png`) })
      await contexto.close()
    })
  }

  // Rodada com a obra piloto (20/11): com a quarta aba (Furos), em 384 px ela saía cortada ("Fu") e em 800 px
  // o "Etapas" saía cortado e o contador "0/385 liberados" ia a 4 linhas.
  for (const [largura, altura] of [
    [384, 832],
    [375, 812],
    [768, 1024],
    [800, 1280],
    [1024, 768],
  ] as const) {
   // fonte larga: no Linux do CI a fonte do sistema é ~20% mais larga e o contador ia a 3 linhas em 375 px;
   // a Verdana tem largura parecida, então a falta de folga aparece também no Windows
   for (const larga of [false, true]) {
    it(`${largura}x${altura}${larga ? ' (fonte larga)' : ''}: quatro abas inteiras, "Etapas" inteiro e contador em até 2 linhas`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      await p.goto(`${url}?furos=1`)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      if (larga) await p.addStyleTag({ content: 'body, button, input, select { font-family: Verdana, sans-serif !important; }' })
      expect(await p.locator('.fv-seg button').allTextContents()).toEqual(['Pilares', 'Vigas', 'Lajes', 'Furos'])
      // contador de obra grande, como o Pilotis
      await p.evaluate(() => {
        document.querySelector('.fv-prog .fv-prog-lib')!.textContent = '0/385 liberados'
      })
      const m = await p.evaluate(() => {
        const seg = document.querySelector('.fv-seg') as HTMLElement
        const s = seg.getBoundingClientRect()
        const etapa = document.querySelector('.fv-etapa') as HTMLSelectElement
        const ce = getComputedStyle(etapa)
        const cv = document.createElement('canvas').getContext('2d')!
        cv.font = `${ce.fontWeight} ${ce.fontSize} ${ce.fontFamily}`
        const prog = document.querySelector('.fv-prog') as HTMLElement
        // linhas do texto do contador: cada pedaço de texto que começa numa altura nova
        const r = document.createRange()
        r.selectNodeContents(prog)
        // (o link "1 com NC" tem a caixa um pouco deslocada do texto da mesma linha: junta o que fica a menos de 6 px)
        const topos = [...r.getClientRects()].filter((x) => x.width > 0).map((x) => x.top).sort((a, b) => a - b)
        const linhas = topos.filter((t, i) => i === 0 || t - topos[i - 1] > 6).length
        // a folga do contador não pode vir da caixa do trecho nem da busca
        const trecho = document.querySelector('.fv-nomes select') as HTMLSelectElement | null
        const ct = trecho ? getComputedStyle(trecho) : null
        const busca = document.querySelector('.fv-busca') as HTMLInputElement
        const cb = getComputedStyle(busca)
        const larguraDe = (texto: string, c: CSSStyleDeclaration) => {
          cv.font = `${c.fontWeight} ${c.fontSize} ${c.fontFamily}`
          return cv.measureText(texto).width
        }
        return {
          trechoPrecisa: trecho && ct ? larguraDe(trecho.options[trecho.selectedIndex].text, ct) + 24 : 0,
          trechoTem: trecho ? trecho.clientWidth : 0,
          buscaPrecisa: larguraDe(busca.placeholder, cb) + parseFloat(cb.paddingLeft) + parseFloat(cb.paddingRight),
          buscaTem: busca.clientWidth,
          abasRolam: seg.scrollWidth > seg.clientWidth + 1,
          abasFora: [...seg.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().right > s.right + 0.5).map((b) => b.textContent),
          etapaPrecisa: larguraDe(etapa.options[etapa.selectedIndex].text, ce) + 24,
          etapaTem: etapa.clientWidth,
          linhasDoContador: linhas,
        }
      })
      expect(m.abasRolam, 'as 4 abas cabem sem rolar').toBe(false)
      expect(m.abasFora).toEqual([])
      expect(m.etapaTem, '"Etapas" inteiro').toBeGreaterThanOrEqual(m.etapaPrecisa)
      // verde só com concretagem (24/11): o P1, com a ficha toda aceita e sem caminhão, fica azul, e o topo tem
      // "p/ concretar" e "com NC" juntos. Mesmo assim, 2 linhas: no aperto a 2ª vira "■ 1 · 1 NC"
      expect(await p.getByTestId('fvs-para-concretar').count()).toBe(1)
      expect(await p.getByTestId('fvs-ver-reprovacoes').count()).toBe(1)
      expect(m.linhasDoContador, 'contador em até 2 linhas').toBeLessThanOrEqual(2)
      // as palavras continuam no texto (leitor de tela e quem procura "p/ concretar")
      expect(await p.getByTestId('fvs-progresso').textContent()).toContain('1 p/ concretar')
      expect(m.trechoTem, '"Trecho 1" inteiro').toBeGreaterThanOrEqual(m.trechoPrecisa)
      expect(m.buscaTem, '"Buscar" inteiro').toBeGreaterThanOrEqual(m.buscaPrecisa)
      expect(await topoCabe(p)).toBe(true)
      expect(await alvosPequenos(p)).toEqual([])
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      // a planta começa embaixo do topo: o topo mais alto não cobre o mapa
      const [topo, mapa] = await p.evaluate(() => [document.querySelector('.fv-topo')!.getBoundingClientRect().bottom, document.querySelector('.fv-mapa')!.getBoundingClientRect().top])
      expect(mapa).toBeGreaterThanOrEqual(topo - 1)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_quatro_abas_${largura}${larga ? '_larga' : ''}.png`) })
      await contexto.close()
    })
   }
  }

  // Testador com a obra piloto (20/11): em 375 px o "cabeçalho" ia até ~440 de 812 px. O topo tinha 172
  // a 222 px; o resto era mapa vazio, escuro como o topo, porque a planta abria centrada na vertical.
  // Agora o desenho abre encostado embaixo do topo, inteiro, e a sobra fica embaixo.
  for (const [nome, busca] of [
    ['FVS com quatro abas', '?furos=1'],
    ['Ambientes', '?abrir=ambientes&esquadrias=1&servico=TESTE-PVS-REB&aba=ambientes'],
  ] as const) {
    it(`375x812: ${nome}, o desenho começa logo embaixo do topo`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: 375, height: 812 }, hasTouch: true })
      const p: Page = await contexto.newPage()
      await p.goto(`${url}${busca}`)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.waitForTimeout(400)
      const m = await p.evaluate(() => {
        const mapa = (window as unknown as { __fvMapa: any }).__fvMapa
        let cima = Infinity
        let baixo = -Infinity
        mapa.eachLayer((l: any) => {
          if (!l.getBounds || !l._latlngs) return
          const b = l.getBounds()
          cima = Math.min(cima, mapa.latLngToContainerPoint(b.getNorthWest()).y)
          baixo = Math.max(baixo, mapa.latLngToContainerPoint(b.getSouthEast()).y)
        })
        const caixa = mapa.getContainer().getBoundingClientRect()
        return {
          topo: document.querySelector('.fv-topo')!.getBoundingClientRect().bottom,
          cima: caixa.top + cima,
          baixo: caixa.top + baixo,
          fim: caixa.bottom,
        }
      })
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_desenho_no_topo_${nome.split(' ')[0]}.png`) })
      expect(m.topo, 'o topo em si').toBeLessThanOrEqual(230)
      expect(m.cima, 'desenho não fica embaixo do topo').toBeGreaterThanOrEqual(m.topo - 1)
      expect(m.cima - m.topo, 'desenho encostado no topo').toBeLessThanOrEqual(40)
      expect(m.baixo, 'desenho inteiro na tela').toBeLessThanOrEqual(m.fim + 1)
      await contexto.close()
    })
  }

  // Locais fora da planta (21/11): blocos, cortinas e paredes do sistema oficial (locais_sistema). A lista
  // agrupa pelo local pai; o local abre com a ficha aberta e os itens; o C reinspeciona o NC (V02) e a
  // marcação vai em local_id, sem planta.
  for (const [largura, altura] of [
    [375, 812],
    [800, 1280],
  ] as const) {
    it(`${largura}x${altura}: locais fora da planta, lista e marcação no local`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&locais=1`)
      await noInicio(p)
      expect(await p.getByTestId('fvs-entra-locais').innerText()).toContain('4 locais fora da planta')
      await p.getByTestId('fvs-entra-locais').click()
      await p.getByRole('heading', { name: 'Locais fora da planta' }).waitFor()
      const nomes = async () => (await p.getByTestId('fvs-local').allInnerTexts()).map((l: string) => l.split('\n')[0])
      const lista = await p.getByTestId('fvs-local').allInnerTexts()
      expect(await nomes()).toEqual(['Cortina trecho 1', 'Parede 1', 'Bloco B2', 'Bloco B10 (com nome comprido para ver a quebra de linha no celular)'])
      expect(lista[3]).toContain('Com NC')
      // cada linha diz o serviço; o serviço filtra a lista (23/11: cortina, parede aparente, blocos)
      expect(lista[1]).toContain('Parede de concreto aparente')
      const servicos = p.getByTestId('fvs-locais-servicos').getByRole('button')
      expect((await servicos.allInnerTexts()).map((t: string) => t.replace(/\s+/g, ' ').trim())).toEqual([
        'Todos 4',
        'Blocos de fundação e baldrames (ficha de teste) 2',
        'Cortina de contenção (ficha de teste) 1',
        'Parede de concreto aparente (ficha de teste) 1',
      ])
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await servicos.filter({ hasText: 'Parede de concreto' }).click()
      expect(await nomes()).toEqual(['Parede 1'])
      await p.getByTestId('fvs-local').click()
      await p.getByTestId('fvs-tela-local').waitFor()
      expect(await p.getByTestId('fvs-local-itens').locator('h2').innerText()).toContain('EXE-PVS-PAREDE')
      await p.locator('.fv-item[data-item="1"] button[data-r="C"]').click()
      await p.locator('.fv-item[data-item="1"] [data-testid="fvs-local-resultado"]').waitFor()
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      // voltar cai de novo na parede; Todos mostra a lista inteira
      await p.goBack()
      await p.getByRole('heading', { name: 'Locais fora da planta' }).waitFor()
      expect(await nomes()).toEqual(['Parede 1'])
      await servicos.filter({ hasText: 'Todos' }).click()
      expect(await p.getByTestId('fvs-local').count()).toBe(4)

      await p.getByTestId('fvs-local').filter({ hasText: 'Bloco B10' }).click()
      await p.getByTestId('fvs-tela-local').waitFor()
      expect(await p.getByTestId('fvs-local-fichas').innerText()).toContain('Pendente Reinspeção')
      expect(await p.getByTestId('fvs-local-resultado').innerText()).toContain('NC em 02/10')
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      // tratativa do NC também no local do sistema (25/11): a causa grava na hora
      const tratLocal = p.locator('.fv-item[data-item="3"] [data-testid=fvs-trat]')
      await tratLocal.locator('summary').click()
      await tratLocal.getByTestId('fvs-trat-causa-projeto').click()
      await p.waitForFunction(async () => {
        const req = indexedDB.open('sistema-obra')
        const todas = await new Promise<any[]>((ok) => {
          req.onsuccess = () => {
            const t = req.result.transaction('registros').objectStore('registros').getAll()
            t.onsuccess = () => ok(t.result)
          }
        })
        return todas.some((x) => x.tabela === 'fvs_tratativas' && x.linha.causa === 'projeto')
      })
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await p.locator('.fv-item[data-item="3"] button[data-r="C"]').click()
      await p.locator('.fv-item[data-item="3"] .fv-hr', { hasText: 'V02' }).waitFor()
      // reinspecionado: a tratativa continua à vista, com a pergunta da eficácia
      await p.locator('.fv-item[data-item="3"] .fv-nc-fechada [data-testid=fvs-trat-eficacia-eficaz]').waitFor()
      await p.getByTestId('fvs-hist').waitFor()
      const gravados = await p.evaluate(async () => {
        const req = indexedDB.open('sistema-obra')
        return await new Promise<unknown[]>((ok) => {
          req.onsuccess = () => {
            const t = req.result.transaction('registros').objectStore('registros').getAll()
            t.onsuccess = () => ok(t.result.filter((x: any) => x.tabela === 'fvs_eventos' && x.pendente).map((x: any) => [x.linha.item, x.linha.resultado, x.linha.rodada, !!x.linha.local_id, x.linha.elemento_id ?? null, x.linha.planta_id]))
          }
        })
      })
      // o C da parede (item 1) e a reinspeção do bloco (item 3), os dois em local_id, sem planta
      expect((gravados as Array<[number]>).sort((a, b) => a[0] - b[0])).toEqual([
        [1, 'C', 1, true, null, null],
        [3, 'C', 2, true, null, null],
      ])
      await p.goBack()
      await p.getByRole('heading', { name: 'Locais fora da planta' }).waitFor()
      expect((await p.getByTestId('fvs-local').allInnerTexts())[3]).toContain('Em andamento')
      expect(erros).toEqual([])
      await contexto.close()
    })
  }

  // Planta de blocos de fundação (23/11, lista grande 2.2): o bloco é peça K da planta "Blocos" (disciplina
  // fundacao). Fundação → Blocos → toque no BL-P2 → ficha de blocos (aplica_a K) → C gravado no bloco.
  for (const [largura, altura] of [
    [375, 812],
    [768, 1024],
  ] as const) {
    it(`${largura}x${altura}: planta de blocos: tocar no bloco abre a ficha de blocos e marca`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&blocos=1`)
      await noInicio(p)
      await p.getByTestId('fvs-pavimento').first().click()
      const fundacao = p.locator('[data-testid=fvs-disciplina][data-disciplina=fundacao]')
      expect(await fundacao.innerText()).toContain('Blocos de fundação')
      // a Fundação vem antes da Estrutura (ordem da obra)
      expect(await p.getByTestId('fvs-disciplina').first().getAttribute('data-disciplina')).toBe('fundacao')
      await fundacao.click()
      await p.getByTestId('fvs-nivel-disciplina').waitFor()
      expect(await p.getByTestId('fvs-nivel-disciplina').innerText()).toContain('8 locais') // 3 blocos, 2 estacas no BL-P2, 2 quadrados da escavação e 1 viga baldrame (24/11)
      await p.getByTestId('fvs-nivel-disciplina').locator('[data-testid=fvs-planta], .fv-trechos .fv-abrir').first().click()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      // só blocos: sem aba Lajes (a planta de blocos não tem laje)
      expect(await p.locator('.fv-topo').innerText()).not.toContain('Lajes')
      await enquadrar(p, [-150, 450], 0)
      await tocarNaPlanta(p, 450, 150)
      await p.getByTestId('fvs-painel').waitFor()
      await nomeNoPainel(p, 'BL-P2')
      const painel = await p.getByTestId('fvs-painel').innerText()
      expect(painel).toContain('TESTE-PVS-BLOCO')
      expect(painel).not.toContain('detalhe desta peça')
      await p.locator('.fv-item[data-item="1"] button[data-r="C"]').click()
      await p.locator('.fv-item[data-item="1"] button[data-r="C"].on').waitFor()
      await expect
        .poll(() => registros(p).then((rs) => rs.map((r) => [r.el, r.ficha, r.item, r.r])))
        .toEqual([['e9000000-0000-0000-0000-000000000016', 'f0000000-0000-0000-0000-000000000030', 1, 'C']])
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_blocos_${largura}.png`) })
      expect(erros).toEqual([])
      await contexto.close()
    })

    // rodada 9b do testador (24/11/2026): depois de abrir a planta de fundação, os quadrados da escavação viravam
    // "Apto ESC" e a ficha de escavação, o acabamento "Outros" em todos os apartamentos
    it(`${largura}x${altura}: grade de escavação fora dos acabamentos por cômodo`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&blocos=1&acabamentos=1`)
      await noInicio(p)
      await p.getByTestId('fvs-pavimento').first().click()
      await p.locator('[data-testid=fvs-disciplina][data-disciplina=fundacao]').click()
      await p.getByTestId('fvs-nivel-disciplina').waitFor()
      await p.getByTestId('fvs-nivel-disciplina').locator('[data-testid=fvs-planta], .fv-trechos .fv-abrir').first().click()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.getByRole('button', { name: /^Voltar/ }).click()
      await p.getByTestId('fvs-nivel-disciplina').waitFor()
      await p.getByRole('button', { name: /^Voltar para/ }).click()
      await p.locator('[data-testid=fvs-disciplina][data-disciplina=acabamentos]').waitFor()
      const acab = p.locator('[data-testid=fvs-disciplina][data-disciplina=acabamentos]')
      await expect.poll(() => acab.innerText()).toContain('Reboco, Piso e revestimento, Pintura')
      expect(await acab.innerText()).not.toContain('Outros')
      await acab.click()
      const filtro = p.getByTestId('fvs-filtro-acabamento')
      await expect.poll(() => filtro.locator('button').allInnerTexts()).toEqual(['Reboco', 'Piso e revestimento', 'Pintura', 'Todos'])
      const aptos = () => p.getByTestId('fvs-apartamento').allInnerTexts()
      await expect.poll(aptos).toHaveLength(7)
      expect((await aptos()).join(' | ')).not.toMatch(/ESC|Escavação/)
      await filtro.getByRole('button', { name: 'Todos' }).click()
      expect((await p.getByTestId('fvs-ambientes').getByTestId('fvs-opcao-ambiente').allInnerTexts()).join(' | ')).not.toContain('Escavação')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    // vigas baldrames (etapa 2, 24/11/2026): locais "K" com "grade": "baldrame", na aba dos blocos, com a ficha dos blocos
    it(`${largura}x${altura}: viga baldrame: abre com a ficha dos blocos e diz "Viga baldrame"`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&blocos=1`)
      await noInicio(p)
      await p.getByTestId('fvs-pavimento').first().click()
      await p.locator('[data-testid=fvs-disciplina][data-disciplina=fundacao]').click()
      await p.getByTestId('fvs-nivel-disciplina').waitFor()
      await p.getByTestId('fvs-nivel-disciplina').locator('[data-testid=fvs-planta], .fv-trechos .fv-abrir').first().click()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.locator('.fv-seg button', { hasText: 'Blocos e baldrames' }).click()
      await enquadrar(p, [-150, 450], 0)
      await tocarNaPlanta(p, 600, 150)
      await p.getByTestId('fvs-painel').waitFor()
      await nomeNoPainel(p, 'VB-V1')
      expect(await p.getByTestId('fvs-painel').locator('.fv-inf').first().innerText()).toContain('Viga baldrame')
      expect(await p.getByTestId('fvs-painel').innerText()).toContain('TESTE-PVS-BLOCO')
      await p.locator('.fv-item[data-item="1"] button[data-r="C"]').click()
      await p.locator('.fv-item[data-item="1"] button[data-r="C"].on').waitFor()
      await expect
        .poll(() => registros(p).then((rs) => rs.map((r) => [r.el, r.ficha, r.item, r.r])))
        .toEqual([['e9000000-0000-0000-0000-000000000064', 'f0000000-0000-0000-0000-000000000030', 1, 'C']])
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_baldrame_${largura}.png`) })
      expect(erros).toEqual([])
      await contexto.close()
    })

    // grade de escavação (item 1.2, 24/11/2026): quadrados "A" na planta de fundação com só a ficha da grade;
    // a ficha de escavação não aparece nos cômodos (planta de ambientes)
    it(`${largura}x${altura}: grade de escavação: só a ficha da grade no quadrado, e nenhuma nos cômodos`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&blocos=1`)
      await noInicio(p)
      await p.getByTestId('fvs-pavimento').first().click()
      await p.locator('[data-testid=fvs-disciplina][data-disciplina=fundacao]').click()
      await p.getByTestId('fvs-nivel-disciplina').waitFor()
      await p.getByTestId('fvs-nivel-disciplina').locator('[data-testid=fvs-planta], .fv-trechos .fv-abrir').first().click()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.locator('.fv-seg button', { hasText: 'Escavação' }).click()
      const servicos = await p.locator('select').evaluateAll((ss: Element[]) => ss.map((s) => [...(s as HTMLSelectElement).options].map((o) => o.text)))
      expect(servicos).toContainEqual(['Escavação (ficha de teste)'])
      await enquadrar(p, [-150, 450], 0)
      await tocarNaPlanta(p, 395, 210)
      await p.getByTestId('fvs-painel').waitFor()
      await nomeNoPainel(p, 'ESC-A1')
      const painel = await p.getByTestId('fvs-painel').innerText()
      expect(painel).toContain('TESTE-PVS-ESC')
      expect(painel).not.toContain('Reboco')
      // o painel diz "Escavação", não "Ambiente" (pedido do Professor, 24/11)
      expect(await p.getByTestId('fvs-painel').locator('.fv-inf').first().innerText()).toContain('Escavação')
      expect(painel).not.toContain('Ambiente')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      // nos cômodos (planta de ambientes) a ficha de escavação não entra
      await p.locator('select[aria-label=Trecho]').selectOption({ label: 'Ambientes' })
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      const nosComodos = await p.locator('select').evaluateAll((ss: Element[]) => ss.flatMap((s) => [...(s as HTMLSelectElement).options].map((o) => o.text)))
      expect(nosComodos).not.toContain('Escavação (ficha de teste)')
      expect(nosComodos).toContain('Reboco (ficha de teste)')
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_escavacao_${largura}.png`) })
      expect(erros).toEqual([])
      await contexto.close()
    })
  }

  // Rodada com a obra piloto (20/11): a aba Pilares mostrava 385 e o início contava 445 (+60 arranques do
  // pilar de cima, que estão na planta só para ver o detalhe). O arranque fica fora das contas e da planilha.
  for (const [largura, altura] of [
    [384, 832],
    [800, 1280],
  ] as const) {
    it(`${largura}x${altura}: arranque só com detalhe fica fora da aba, do início e da planilha`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700, acceptDownloads: true })
      const p: Page = await contexto.newPage()
      await p.goto(`${url}?abrir=0&arranque=1`)
      const pavimento = p.getByTestId('fvs-pavimento')
      await noInicio(p)
      await p.getByText(/de 62 peças liberadas/).first().waitFor()
      expect(await pavimento.innerText()).toContain('de 62 peças liberadas')
      expect(await p.getByTestId('fvs-resumo-obra').innerText()).toContain('de 62 peças liberadas')
      const [dl] = await Promise.all([p.waitForEvent('download'), p.getByTestId('fvs-planilha-situacao').click()])
      const planilha = readFileSync(await dl.path(), 'utf8')
      expect(planilha).toContain(';P7;')
      expect(planilha).not.toContain(';P7a;')
      // na planta, a aba Pilares continua com os 24 (o P7a aparece só para o detalhe)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      expect(await p.getByTestId('fvs-progresso').innerText()).toContain('/24 liberados')
      await contexto.close()
    })
  }

  // Teste com cabo (20/11): no S23 (384 px) a caixa de trecho mostrava só "Trecho" (sem o número) e
  // "Lajes" saía cortado; no tablet (800 px) a caixa tinha 30 px de altura.
  for (const [largura, altura] of [
    [384, 832],
    [375, 812],
    [768, 1024],
    [800, 1280],
    [1024, 768],
  ] as const) {
    it(`${largura}x${altura}: caixa de trecho com o número e 44 px; abas e "Buscar" inteiros`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      await p.goto(url)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      const m = await p.evaluate(() => {
        const sel = document.querySelector('.fv-nomes select') as HTMLSelectElement
        // largura do texto escolhido com a fonte da caixa, mais o espaço da seta
        const cs = getComputedStyle(sel)
        const cv = document.createElement('canvas').getContext('2d')!
        cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
        const texto = sel.options[sel.selectedIndex].text
        const seg = document.querySelector('.fv-seg') as HTMLElement
        const s = seg.getBoundingClientRect()
        // reteste com cabo (20/11): no tablet de 800 px o campo de busca mostrava só "Busc"
        const busca = document.querySelector('.fv-busca') as HTMLInputElement
        const cb = getComputedStyle(busca)
        cv.font = `${cb.fontWeight} ${cb.fontSize} ${cb.fontFamily}`
        return {
          buscaPrecisa: cv.measureText(busca.placeholder).width + parseFloat(cb.paddingLeft) + parseFloat(cb.paddingRight),
          buscaTem: busca.clientWidth,
          texto,
          precisa: cv.measureText(texto).width + 24,
          tem: sel.clientWidth,
          altura: sel.getBoundingClientRect().height,
          abasRolam: seg.scrollWidth > seg.clientWidth + 1,
          abasFora: [...seg.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().right > s.right + 0.5).map((b) => b.textContent),
        }
      })
      expect(m.texto).toMatch(/\d/)
      expect(m.tem, `"${m.texto}" cabe na caixa`).toBeGreaterThanOrEqual(m.precisa)
      expect(m.altura).toBeGreaterThanOrEqual(43.5)
      expect(m.abasRolam, 'Pilares, Vigas e Lajes cabem sem rolar').toBe(false)
      expect(m.abasFora).toEqual([])
      expect(m.buscaTem, '"Buscar" inteiro').toBeGreaterThanOrEqual(m.buscaPrecisa)
      expect(await topoCabe(p)).toBe(true)
      expect(await alvosPequenos(p)).toEqual([])
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_trecho_${largura}.png`) })
      await contexto.close()
    })
  }

  // Regras da obra (19/11): o prazo só avisa (pede confirmação e grava "Marcado antes do prazo");
  // a ligação marca C no item ligado da mesma peça, mostra a origem e se desfaz.
  for (const [largura, altura] of [
    [375, 812],
    [768, 1024],
    [1024, 768],
  ] as const) {
    it(`${largura}x${altura}: prazo da desforma avisa e pede confirmação; a ligação marca C e se desfaz`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&regras=1`)
      await noInicio(p)
      // tela só de leitura das regras, pelo início
      await p.getByTestId('fvs-entra-regras').click()
      expect(await p.getByTestId('fvs-regra-prazo').innerText()).toContain('Libera 3 dias depois da concretagem da peça')
      expect(await p.getByTestId('fvs-regra-prazo').innerText()).toContain('Sem falhas de concretagem')
      const lig = await p.getByTestId('fvs-regra-ligacao').innerText()
      expect(lig).toContain('Armadura e espaçadores')
      expect(lig).toContain('Prumo da fôrma')
      expect(await p.getByTestId('fvs-regras-fora').count()).toBe(0)
      // residenciais do escoramento (3.8, 23/11): o nome e os pilares
      expect(await p.getByTestId('fvs-regra-residencial').allTextContents()).toEqual([
        expect.stringContaining('Residencial 1'),
        expect.stringContaining('Residencial 2'),
      ])
      expect(await p.getByTestId('fvs-regra-residencial').nth(1).textContent()).toContain('6 pilares: P4, P5, P6')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      expect(await contrasteNosDoisTemas(p), 'contraste da tela das regras').toEqual([])
      // nada abaixo de 14 px na tela das regras (leitura no sol)
      const pequenos = await p.locator('.fv-regras li *').evaluateAll((l: Element[]) => l.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 14).map((e) => e.textContent))
      expect(pequenos).toEqual([])
      // celular: o título fica numa linha só, embaixo do Voltar
      const titulo = await p.locator('.fv-regras h1').evaluate((e: HTMLElement) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight || '32')))
      expect(titulo).toBeLessThanOrEqual(1)
      expect(await alvosPequenos(p)).toEqual([])
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_regras_${largura}.png`), fullPage: true })
      await p.locator('.fv-regras .fv-voltar').click()
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await buscar(p, 'P6')
      await nomeNoPainel(p, 'P6')
      const selo = p.locator('.fv-item[data-item="7"]').getByTestId('fvs-prazo')
      const doItem = async (n: number) => (await registros(p)).filter((e) => e.item === n)

      // sem concretagem marcada: o prazo ainda não tem data
      await selo.waitFor()
      expect(await selo.innerText()).toContain('ainda sem data')
      // concretagem C: o prazo começa a contar
      await item(p, 6, 'C').click()
      await p.locator('.fv-item[data-item="6"] button[data-r="C"].on').waitFor()
      await expect.poll(() => selo.innerText(), { timeout: 5000 }).toMatch(/faltam 3 dias \(libera em \d\d\/\d\d\)/)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      expect((await contrasteNosDoisTemas(p)).filter((t) => t.includes('Aguardando')), 'contraste do selo').toEqual([])
      expect(await alvosPequenos(p)).toEqual([])
      if (PRINTS) await p.locator('.fv-item[data-item="7"]').screenshot({ path: path.join(PRINTS, `fvs_prazo_${largura}.png`) })

      // tela de escoramento (22/11, guia): cabeçalho comum, só a seta à esquerda, sem "Voltar" escrito
      await p.locator('.fv-topo .fv-voltar').click()
      await noInicio(p)
      await p.getByTestId('fvs-entra-escoramento').click()
      const seta = p.locator('.fv-escoramento .so-cab-voltar')
      await seta.waitFor()
      expect((await seta.innerText()).trim()).toBe('‹')
      expect(await seta.getAttribute('aria-label')).toBe('Voltar')
      expect((await seta.boundingBox())!.width).toBeGreaterThanOrEqual(44)
      expect(await seta.evaluate((e: HTMLElement) => e.getBoundingClientRect().left)).toBeLessThan(40)
      // a situação da peça não corta no fim: quebra linha dentro do botão (22/11, 375 px)
      const situacao = p.getByTestId('fvs-esc-situacao').first()
      // a linha tem content-visibility: auto: fora da tela o navegador não desenha e o innerText vem vazio (CI de 22/11)
      await situacao.scrollIntoViewIfNeeded()
      await expect.poll(() => situacao.innerText(), { timeout: 5000 }).toMatch(/aguardando \(faltam 3 dias, libera em \d\d\/\d\d\)/)
      expect(
        await situacao.evaluate((e: HTMLElement) => {
          const b = e.closest('button')!.getBoundingClientRect()
          const r = e.getBoundingClientRect()
          return e.scrollWidth <= e.clientWidth + 1 && r.right <= b.right + 1
        }),
      ).toBe(true)
      // por residencial (3.8, 23/11): o P6 concretado abre o aviso do Residencial 2, que mostra o que falta
      const avisoR2 = p.getByTestId('fvs-esc-aviso').filter({ hasText: 'Residencial 2' }).filter({ hasText: 'Desforma dos pilares' })
      await expect.poll(() => avisoR2.innerText(), { timeout: 5000 }).toMatch(/P6 \(libera \d\d\/\d\d\)/)
      expect(await avisoR2.innerText()).toContain('esperando concretagem')
      expect(await avisoR2.innerText()).toContain('falta concretar P4, P5')
      expect(await p.getByTestId('fvs-esc-residenciais').locator('h2').innerText()).toBe('Por residencial')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      expect(await alvosPequenos(p)).toEqual([])
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_escoramento_${largura}.png`), fullPage: true })
      await seta.click()
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await buscar(p, 'P6')
      await nomeNoPainel(p, 'P6')

      // C dentro do prazo: cancelar não grava nada
      let pergunta = ''
      p.once('dialog', (d: any) => { pergunta = d.message(); void d.dismiss() })
      await item(p, 7, 'C').click()
      await expect.poll(() => pergunta).toContain('Desforma')
      expect(pergunta).toContain('Marcar C mesmo assim?')
      await p.waitForTimeout(300)
      expect(await doItem(7)).toEqual([])
      expect(await p.locator('.fv-item[data-item="7"] button[data-r="C"].on').count()).toBe(0)
      // OK: grava, com a observação
      p.once('dialog', (d: any) => void d.accept())
      await item(p, 7, 'C').click()
      await p.locator('.fv-item[data-item="7"] button[data-r="C"].on').waitFor()
      const desforma = await doItem(7)
      expect(desforma.map((e) => e.r)).toEqual(['C'])
      expect(desforma[0].obs).toMatch(/^Marcado antes do prazo \(libera em \d\d\/\d\d\)$/)
      await expect.poll(() => selo.count(), { timeout: 5000 }).toBe(0)

      // ligação: C na armadura (item 4) marca C no prumo (item 5), com a origem; Desfazer limpa só o ligado
      await item(p, 4, 'C').click()
      await p.locator('.fv-toast', { hasText: 'também C pela ligação: Prumo da fôrma' }).waitFor()
      await p.locator('.fv-item[data-item="5"] button[data-r="C"].on').waitFor()
      const prumo = await doItem(5)
      expect(prumo.map((e) => e.r)).toEqual(['C'])
      expect(prumo[0].obs).toBe('Pela ligação: item 4 (Armadura e espaçadores)')
      expect(prumo[0].lote).toBeTruthy()
      // o painel mostra a origem no lugar de "em lote"; o C antes do prazo mostra o aviso
      expect(await p.locator('.fv-item[data-item="5"]').getByTestId('fvs-obs-c').innerText()).toContain('Pela ligação: item 4')
      expect(await p.locator('.fv-item[data-item="7"]').getByTestId('fvs-obs-c').innerText()).toContain('Marcado antes do prazo')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_ligacao_${largura}.png`) })
      await p.getByTestId('fvs-desfazer').click()
      await p.locator('.fv-toast', { hasText: 'Desfeito: 1 item' }).waitFor()
      await expect.poll(() => p.locator('.fv-item[data-item="5"] button.on').count(), { timeout: 5000 }).toBe(0)
      expect(await p.locator('.fv-item[data-item="4"] button[data-r="C"].on').count()).toBe(1)

      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)
  }

  // Rastreio do concreto (19/11): o item da ficha fica C pelo caminhão, só calculado (nada gravado na FVS)
  for (const [largura, altura] of [
    [375, 812],
    [768, 1024],
    [1024, 768],
  ] as const) {
    it(`${largura}x${altura}: o item do rastreio fica C pelo caminhão do Concreto, sem gravar nada`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&rastreio=1&regras=1`)
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await buscar(p, 'P6')
      await nomeNoPainel(p, 'P6')
      await p.locator('.fv-item[data-item="6"] button[data-r="C"].on').waitFor()
      const obs = await p.locator('.fv-item[data-item="6"]').getByTestId('fvs-obs-c').innerText()
      expect(obs).toMatch(/Pelo Concreto: caminhão 2 · NF 4321 · \d\d\/\d\d/)
      expect(await p.locator('.fv-item[data-item="6"] .fv-hr').innerText()).toMatch(/^C · V01 · Pelo Concreto/)
      // o prazo da desforma conta da concretagem de hoje: faltam 3 dias
      expect(await p.locator('.fv-item[data-item="7"]').getByTestId('fvs-prazo').innerText()).toContain('faltam 3 dias')
      // nada foi gravado na FVS
      expect(await registros(p)).toEqual([])
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.locator('.fv-item[data-item="6"]').screenshot({ path: path.join(PRINTS, `fvs_rastreio_${largura}.png`) })
      // peça sem caminhão: o item fica vazio
      await buscar(p, 'P7')
      await nomeNoPainel(p, 'P7')
      expect(await p.locator('.fv-item[data-item="6"] button.on').count()).toBe(0)
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)
  }

  // Contador do topo com "p/ concretar" e "com NC" juntos (24/11, pedido do Professor): ia a 3 linhas no celular
  // e a 5 no tablet em pé com três abas (o contador encolhia até 50 px). Agora 2 linhas no máximo; no aperto a
  // 2ª vira "■ 1 · 1 NC" (o quadrado azul da peça na planta)
  for (const [largura, altura] of [
    [375, 812],
    [768, 1024],
    [1024, 768],
  ] as const) {
    for (const larga of [false, true]) {
      it(`${largura}x${altura}${larga ? ' (fonte larga)' : ''}: contador com "p/ concretar" e "com NC" em até 2 linhas, legível`, async () => {
        const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
        const p: Page = await contexto.newPage()
        const erros: string[] = []
        p.on('pageerror', (e: Error) => erros.push(e.message))
        await p.goto(url)
        await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
        if (larga) await p.addStyleTag({ content: 'body, button, input, select { font-family: Verdana, sans-serif !important; }' })
        await p.waitForTimeout(300)
        expect(await p.getByTestId('fvs-para-concretar').count()).toBe(1)
        expect(await p.getByTestId('fvs-ver-reprovacoes').count()).toBe(1)
        const m = await p.evaluate(() => {
          const prog = document.querySelector('.fv-prog') as HTMLElement
          const r = document.createRange()
          r.selectNodeContents(prog)
          const topos = [...r.getClientRects()].filter((x) => x.width > 0).map((x) => x.top).sort((a, b) => a - b)
          // o que aparece na tela: os pedaços com tamanho de letra (as palavras escondidas têm 0 px)
          const visivel = [...prog.querySelectorAll('*')]
            .filter((e) => parseFloat(getComputedStyle(e).fontSize) > 0 && getComputedStyle(e).display !== 'none')
            .map((e) => parseFloat(getComputedStyle(e).fontSize))
          const azul = prog.querySelector('.fv-q-azul') as HTMLElement
          return {
            linhas: topos.filter((t, i) => i === 0 || t - topos[i - 1] > 6).length,
            menorLetra: Math.min(parseFloat(getComputedStyle(prog).fontSize), ...visivel),
            quadrado: getComputedStyle(azul).display !== 'none',
            larguraDoContador: prog.getBoundingClientRect().width,
          }
        })
        expect(m.linhas, 'contador em até 2 linhas').toBeLessThanOrEqual(2)
        expect(m.menorLetra, 'letra de pelo menos 11 px').toBeGreaterThanOrEqual(11)
        expect(m.larguraDoContador).toBeGreaterThanOrEqual(80)
        // no aperto (até 900 px), o quadrado azul no lugar das palavras; na tela larga, por extenso
        expect(m.quadrado).toBe(largura <= 900)
        // o que se vê: no aperto as palavras ("p/ concretar", "com") têm letra de 0 px (fv-longo)
        const longo = await p.locator('.fv-prog .fv-longo').evaluateAll((l: Element[]) => l.map((e) => parseFloat(getComputedStyle(e).fontSize)))
        expect(longo.length).toBe(2)
        for (const t of longo) expect(t === 0).toBe(largura <= 900)
        // as palavras continuam no texto (leitor de tela); o "1 NC" continua levando à lista
        expect(await p.getByTestId('fvs-progresso').textContent()).toContain('1 p/ concretar')
        expect(await p.getByTestId('fvs-ver-reprovacoes').textContent()).toContain('1 com NC')
        expect(await topoCabe(p)).toBe(true)
        expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
        expect(await alvosPequenos(p)).toEqual([])
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `contador_dois_${largura}${larga ? '_larga' : ''}.png`), clip: { x: 0, y: 0, width: largura, height: 200 } })
        expect(erros).toEqual([])
        await contexto.close()
      }, 60_000)
    }
  }

  // Achado #2 da lista de campo (24/11), decisão do Nicolas: "a peça fica verde quando estiver numa concretagem
  // cadastrada ... Vamos botar um coeficiente aí de 90%". Ficha toda marcada sem concretagem fica azul.
  for (const [largura, altura] of [
    [375, 812],
    [1024, 768],
  ] as const) {
    it(`${largura}x${altura}: verde só com concretagem cadastrada no Concreto (pilar pelo caminhão, laje por 90% da área)`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&rastreio=1&lajeconcretada=1`)
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      const sit = () => p.locator('.fv-inf .fv-sit').textContent()
      const marcarTudo = async (ns: readonly number[]) => {
        for (const n of ns) await item(p, n, 'C').click()
        await p.waitForFunction((k: number) => document.querySelectorAll('.fv-item button[data-r="C"].on').length >= k, ns.length)
      }
      // P6 tem caminhão (o item 6 já vem C pelo Concreto): com o resto C, verde
      await buscar(p, 'P6')
      await nomeNoPainel(p, 'P6')
      await marcarTudo([1, 2, 3, 4, 5, 7])
      await p.waitForFunction(() => document.querySelector('.fv-inf .fv-sit')?.textContent === 'Liberado')
      // P7 sem caminhão: a ficha inteira C fica azul (liberado para concretar), não verde
      await buscar(p, 'P7')
      await nomeNoPainel(p, 'P7')
      await marcarTudo([1, 2, 3, 4, 5, 6, 7])
      await p.waitForFunction(() => document.querySelector('.fv-inf .fv-sit')?.textContent === 'Liberado p/ concretar')
      expect(await sit()).toBe('Liberado p/ concretar')
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `verde_concretagem_pilar_${largura}.png`) })
      await p.locator('.fv-cab button').click()
      await p.getByTestId('fvs-painel').waitFor({ state: 'detached' })

      // laje: a área dentro da área do caminhão fica verde; a de fora, azul
      await p.locator('.fv-seg button', { hasText: 'Lajes' }).click()
      const novaArea = async (nome: string, pontos: ReadonlyArray<readonly [number, number]>) => {
        const cx = pontos.reduce((t, q) => t + q[0], 0) / pontos.length
        const cy = pontos.reduce((t, q) => t + q[1], 0) / pontos.length
        await enquadrar(p, [-cy, cx], 0)
        await p.getByTestId('fvs-nova-area').click()
        await p.getByTestId('fvs-desenho').waitFor()
        for (const [x, y] of pontos) await tocarNaPlanta(p, x, y)
        await p.getByTestId('fvs-concluir-area').click()
        await p.getByTestId('fvs-caixa-nome').fill(nome)
        await p.getByTestId('fvs-caixa-criar').click()
        await nomeNoPainel(p, nome)
        await p.getByTestId('fvs-area-info').waitFor()
      }
      await novaArea('Laje concretada', [[650, 370], [850, 370], [850, 560], [650, 560]])
      await marcarTudo([1, 2, 3, 4, 5])
      await p.waitForFunction(() => document.querySelector('.fv-inf .fv-sit')?.textContent === 'Liberado')
      await p.locator('.fv-cab button').click()
      await p.getByTestId('fvs-painel').waitFor({ state: 'detached' })
      // só a ponta dentro da área do caminhão (x de 600 a 640 de 400 a 640): menos de 90%, azul
      await novaArea('Laje meio fora', [[400, 400], [640, 400], [640, 500], [400, 500]])
      await marcarTudo([1, 2, 3, 4, 5])
      await p.waitForFunction(() => document.querySelector('.fv-inf .fv-sit')?.textContent === 'Liberado p/ concretar')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `verde_concretagem_laje_${largura}.png`) })
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)
  }

  // Revisão de telas da 06 (20/11): na planta de ambientes com esquadrias, o topo passava da tela em
  // 768 px, cortava os textos em 800 e no celular; o código da esquadria era letra branca em planta clara.
  for (const [largura, altura] of [
    [375, 812],
    [384, 832],
    [768, 1024],
    [800, 1280],
    [1024, 768],
    [1280, 800],
  ] as const) {
    it(`${largura}x${altura}: ambientes com esquadrias: o topo cabe, nada cortado, e o código da esquadria se lê nos dois temas`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&esquadrias=1`)
      await noInicio(p)
      await abrirPlantaDeAmbientes(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      /** Caixas do topo em que o texto escolhido (ou a dica) não cabe: texto + margens + a seta. */
      const cortados = () =>
        p.evaluate(() => {
          const cv = document.createElement('canvas').getContext('2d')!
          return [...document.querySelectorAll<HTMLSelectElement | HTMLInputElement>('.fv-topo select, .fv-topo input')].flatMap((c) => {
            const cs = getComputedStyle(c)
            cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
            const texto = c instanceof HTMLSelectElement ? c.options[c.selectedIndex].text : c.placeholder
            const precisa = cv.measureText(texto).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + (c instanceof HTMLSelectElement ? 20 : 0)
            return c.clientWidth + 0.5 >= precisa ? [] : [`${texto} (${Math.round(c.clientWidth)} de ${Math.round(precisa)} px)`]
          })
        })
      const linhasDoProgresso = () =>
        p.getByTestId('fvs-progresso').evaluate((e: HTMLElement) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)))
      const confere = async (aba: string) => {
        // o nome da ficha de teste é curto; a ficha de alvenaria de verdade tem o nome mais comprido das
        // fichas de ambiente ("Alvenaria em Bloco Cerâmico Comum") e cortava em 768 e 1280 px
        await p.getByTestId('fvs-servico').evaluate((s: HTMLSelectElement) => (s.options[s.selectedIndex].text = 'Alvenaria em Bloco Cerâmico Comum'))
        expect(await topoCabe(p), `${aba}: o topo cabe`).toBe(true)
        expect(await cortados(), `${aba}: nada cortado`).toEqual([])
        expect(await alvosPequenos(p)).toEqual([])
        expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
        // do tablet para cima, o progresso fica numa linha só ("0/7 OK" quebrava em duas em 800 px)
        if (largura > 700) expect(await linhasDoProgresso(), `${aba}: progresso numa linha`).toBe(1)
      }
      await confere('Ambientes')
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `ambientes_topo_${largura}_aba_ambientes.png`) })
      await p.locator('.fv-seg button', { hasText: 'Esquadrias' }).click()
      await p.getByTestId('fvs-item-esquadria').waitFor()
      await confere('Esquadrias')
      // o outro item de esquadria da ficha de teste também cabe
      await p.getByTestId('fvs-item-esquadria').selectOption({ index: 1 })
      await confere('Esquadrias, item 7')
      // a fonte do Linux (CI do GitHub) é mais larga que a do Windows: no CI, caixas que cabiam no PC
      // ficavam 7 a 32 px curtas. A Verdana, onde existe, tem a largura dela; assim a falta de folga
      // aparece também no teste rodado no Windows (no Linux, sem Verdana, fica a fonte do sistema)
      await p.addStyleTag({ content: 'body, button, input, select { font-family: Verdana, sans-serif !important; }' })
      await p.locator('.fv-seg button', { hasText: 'Ambientes' }).click()
      await confere('Ambientes, fonte larga')
      await p.locator('.fv-seg button', { hasText: 'Esquadrias' }).click()
      await p.getByTestId('fvs-item-esquadria').selectOption({ index: 0 })
      await confere('Esquadrias, fonte larga')
      await p.getByTestId('fvs-item-esquadria').selectOption({ index: 1 })
      await confere('Esquadrias, item 7, fonte larga')

      // o código da esquadria: etiqueta clara com letra escura, igual nos dois temas (a planta é sempre clara)
      await enquadrar(p, [-200, 260], 1)
      const etiqueta = () =>
        p.evaluate(() => {
          const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
          const lum = (cor: string) => {
            cv.clearRect(0, 0, 1, 1)
            cv.fillStyle = cor
            cv.fillRect(0, 0, 1, 1)
            const d = cv.getImageData(0, 0, 1, 1).data
            const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
            return 0.2126 * f(d[0]) + 0.7152 * f(d[1]) + 0.0722 * f(d[2])
          }
          const esq = [...document.querySelectorAll<HTMLElement>('.fv-rot-esq span')].find((e) => e.textContent === 'JA120B')!
          const amb = document.querySelector<HTMLElement>('.fv-rot:not(.fv-rot-esq) span')
          const ce = getComputedStyle(esq)
          const [l1, l2] = [lum(ce.color), lum(ce.backgroundColor)]
          return {
            contraste: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05),
            fundoClaro: l2 > 0.8,
            fonte: parseFloat(ce.fontSize),
            // o número do ambiente não tem fundo próprio: a letra tem que ser escura (fica em cima da planta)
            ambienteEscuro: amb ? lum(getComputedStyle(amb).color) < 0.1 : true,
          }
        })
      await p.locator('.fv-rot-esq span', { hasText: 'JA120B' }).waitFor()
      for (const tema of ['escuro', 'claro'] as const) {
        await p.evaluate((t: string) => {
          if (t === 'escuro') document.documentElement.dataset.tema = 'escuro'
          else delete document.documentElement.dataset.tema
        }, tema)
        const e = await etiqueta()
        expect(e.contraste, `${tema}: contraste da etiqueta`).toBeGreaterThanOrEqual(7)
        expect(e.fundoClaro, `${tema}: etiqueta clara`).toBe(true)
        expect(e.fonte).toBeGreaterThanOrEqual(11)
        expect(e.ambienteEscuro, `${tema}: número do ambiente em letra escura`).toBe(true)
        expect(await topoCabe(p)).toBe(true)
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `ambientes_topo_${largura}_${tema}.png`) })
      }
      await p.evaluate(() => delete document.documentElement.dataset.tema)
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)
  }

  for (const [largura, altura] of [
    [375, 812],
    [1024, 768],
  ] as const) {
    it(`${largura}x${altura}: ficha que não vale no tipo de cômodo fica apagada, fora da contagem e sem itens`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      // ?comodos=1: o reboco de teste não vale nas 4 suítes com nome (aptos 103 e 104), e o 104-03 ficou sem nome
      // num apartamento com nomes (sem tipo: nenhuma ficha vale nele)
      await p.goto(`${url}?abrir=ambientes&comodos=1&servico=TESTE-PVS-REB&aba=ambientes`)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      expect(await p.getByTestId('fvs-progresso').innerText()).toContain('0/15 liberados')
      await buscar(p, '104-03')
      await nomeNoPainel(p, '104-03')
      expect(await p.getByTestId('fvs-fora-da-ficha').innerText()).toContain('ficou sem nome na planta')
      expect(await p.getByTestId('fvs-sit-fora-da-ficha').innerText()).toBe('Sem tipo de cômodo')
      expect(await p.locator('.fv-item').count()).toBe(0)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `ambientes_sem_tipo_${largura}.png`) })
      await buscar(p, 'suite 01 103')
      await nomeNoPainel(p, 'Suíte 01')
      const aviso = p.getByTestId('fvs-fora-da-ficha')
      await aviso.waitFor()
      expect(await aviso.innerText()).toContain('não vale em Suíte 01')
      expect(await p.locator('.fv-item').count()).toBe(0)
      // sem "Pendente": a ficha não se aplica no cômodo
      expect(await p.getByTestId('fvs-sit-fora-da-ficha').innerText()).toBe('Não se aplica')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `ambientes_fora_da_ficha_${largura}.png`) })
      // na alvenaria a suíte vale: itens de volta e os 19 ambientes na conta (o sem tipo continua fora)
      await p.getByTestId('fvs-servico').selectOption('TESTE-PVS-ALV')
      await p.locator('.fv-ficha', { hasText: 'TESTE-PVS-ALV' }).waitFor()
      expect(await aviso.count()).toBe(0)
      expect(await p.getByTestId('fvs-sit-fora-da-ficha').count()).toBe(0)
      expect(await p.locator('.fv-item').count()).toBeGreaterThan(0)
      // o 104-03 (sem tipo) fica fora também na alvenaria: 19, não 20
      expect(await p.getByTestId('fvs-progresso').innerText()).toContain('0/19 liberados')
      // 25/11: cômodo com vãos fora da ficha (?comodos=2, o 101-01 tem janela e porta): os vãos somem junto com os itens
      // (antes, a faixa "Esquadrias: 0 de N OK" ficava marcável num cômodo que não leva a ficha)
      // contexto novo: a planta de teste fica guardada no aparelho e não é baixada de novo com outro ?comodos
      expect(erros).toEqual([])
      await contexto.close()
      const outro = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const q: Page = await outro.newPage()
      q.on('pageerror', (e: Error) => erros.push(e.message))
      await q.goto(`${url}?abrir=ambientes&comodos=2&esquadrias=1&servico=TESTE-PVS-REB&aba=ambientes`)
      await q.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await buscar(q, '101-01')
      await q.getByTestId('fvs-sit-fora-da-ficha').waitFor()
      expect(await q.getByTestId('fvs-esquadrias-do-ambiente').count()).toBe(0)
      // na alvenaria o 101-01 vale: os vãos voltam
      await q.getByTestId('fvs-servico').selectOption('TESTE-PVS-ALV')
      await q.getByTestId('fvs-esquadrias-do-ambiente').waitFor()
      expect(erros).toEqual([])
      await outro.close()
    }, 120_000)

    it(`${largura}x${altura}: unidade de conferência por trecho marca o grupo; ficha sem unidade segue como sempre`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=ambientes&regras=unidades&servico=TESTE-PVS-REB&aba=ambientes`)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await buscar(p, '101-01')
      await nomeNoPainel(p, '101-01')
      // o painel diz que a conferência é por trecho e quantos locais vão junto
      const aviso = p.getByTestId('fvs-unidade-grupo')
      await aviso.waitFor()
      expect(await aviso.innerText()).toMatch(/Conferência por trecho: o C marca também os outros \d+ locais do trecho/)
      expect(await p.getByTestId('fvs-unidade-anterior').count()).toBe(0)
      // um C no item 1 do 101-01 marca o item 1 dos outros ambientes do trecho
      await p.locator('.fv-item[data-item="1"] button[data-r="C"]').click()
      await p.locator('.fv-item[data-item="1"] button[data-r="C"].on').waitFor()
      await p.getByText(/mais \d+ locais do trecho/).waitFor()
      await buscar(p, '102-01')
      await nomeNoPainel(p, '102-01')
      await p.locator('.fv-item[data-item="1"] button[data-r="C"].on').waitFor()
      expect(await p.locator('.fv-item[data-item="2"] button[data-r="C"].on').count()).toBe(0)
      // o que já está marcado não é sobrescrito: NA no item 2 do 102-01 continua NA depois do C do grupo
      await p.locator('.fv-item[data-item="2"] button[data-r="NA"]').click()
      await p.locator('.fv-item[data-item="2"] button[data-r="NA"].on').waitFor()
      await buscar(p, '101-01')
      await nomeNoPainel(p, '101-01')
      await p.locator('.fv-item[data-item="2"] button[data-r="C"]').click()
      await p.locator('.fv-item[data-item="2"] button[data-r="C"].on').waitFor()
      await buscar(p, '102-01')
      await nomeNoPainel(p, '102-01')
      await p.locator('.fv-item[data-item="2"] button[data-r="NA"].on').waitFor()
      expect(await p.locator('.fv-item[data-item="2"] button[data-r="C"].on').count()).toBe(0)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      // ficha sem unidade nas regras (a alvenaria): sem aviso, e o C fica só no local, como sempre
      await p.getByTestId('fvs-servico').selectOption('TESTE-PVS-ALV')
      await p.locator('.fv-item').first().waitFor()
      expect(await p.getByTestId('fvs-unidade-grupo').count()).toBe(0)
      await p.locator('.fv-item[data-item="1"] button[data-r="C"]').click()
      await p.locator('.fv-item[data-item="1"] button[data-r="C"].on').waitFor()
      await buscar(p, '101-01')
      await nomeNoPainel(p, '101-01')
      await p.locator('.fv-item').first().waitFor()
      expect(await p.locator('.fv-item[data-item="1"] button[data-r="C"].on').count()).toBe(0)
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${largura}x${altura}: acabamentos por acabamento (reboco, piso, pintura) e andamento por apartamento`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      // libera o reboco do 101-01 (os 4 itens C) na planta de ambientes
      await p.goto(`${url}?abrir=ambientes&acabamentos=1&servico=TESTE-PVS-REB&aba=ambientes`)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await buscar(p, '101-01')
      await nomeNoPainel(p, '101-01')
      for (const n of [1, 2, 3, 4]) {
        await p.locator(`.fv-item[data-item="${n}"] button[data-r="C"]`).click()
        await p.locator(`.fv-item[data-item="${n}"] button[data-r="C"].on`).waitFor()
      }
      expect(await p.getByTestId('fvs-progresso').innerText()).toContain('1/20 liberados')

      // menu do pavimento: Acabamentos diz as categorias, não as fichas uma a uma
      await p.goto(`${url}?abrir=0&acabamentos=1`)
      await noInicio(p)
      await p.getByTestId('fvs-pavimento').first().click()
      await expect.poll(() => p.locator('[data-testid=fvs-disciplina][data-disciplina=acabamentos]').innerText()).toContain('Reboco, Piso e revestimento, Pintura')
      await p.locator('[data-testid=fvs-disciplina][data-disciplina=acabamentos]').click()
      const filtro = p.getByTestId('fvs-filtro-acabamento')
      const chips = () => filtro.locator('button').allInnerTexts()
      await expect.poll(chips).toEqual(['Reboco', 'Piso e revestimento', 'Pintura', 'Todos'])
      // começa no reboco: só a opção do reboco e o andamento dele por apartamento
      expect(await filtro.locator('button[aria-pressed=true]').innerText()).toBe('Reboco')
      const opcoes = () => p.getByTestId('fvs-ambientes').getByTestId('fvs-opcao-ambiente').allInnerTexts()
      expect(await opcoes()).toEqual([expect.stringContaining('Reboco (ficha de teste)')])
      expect(await p.getByTestId('fvs-resumo-acabamento').innerText()).toContain('Reboco (ficha de teste): 1 de 20 liberados')
      const aptos = () => p.getByTestId('fvs-apartamento').allInnerTexts()
      await expect.poll(aptos).toEqual([
        'Apto 101: Reboco (ficha de teste) 1 de 3',
        'Apto 102: Reboco (ficha de teste) 0 de 3',
        'Apto 103: Reboco (ficha de teste) 0 de 3',
        'Apto 104: Reboco (ficha de teste) 0 de 3',
        'Apto 105: Reboco (ficha de teste) 0 de 3',
        'Apto 106: Reboco (ficha de teste) 0 de 3',
        'Área comum: Reboco (ficha de teste) 0 de 2',
      ])
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `acabamentos_reboco_${largura}.png`), fullPage: true })
      // "Por apartamento" abre e fecha e mostra a seta (▾ aberta, ▸ fechada; rodada 9 do testador)
      const porApto = p.getByTestId('fvs-por-apartamento')
      const seta = () => porApto.locator('summary').evaluate((s: Element) => getComputedStyle(s, '::before').content)
      expect(await seta()).toBe('"▾"')
      await porApto.locator('summary').click()
      await expect.poll(() => porApto.evaluate((d: Element) => (d as HTMLDetailsElement).open)).toBe(false)
      expect(await seta()).toBe('"▸"')
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `acabamentos_por_apto_fechado_${largura}.png`), fullPage: true })
      await porApto.locator('summary').click()
      await expect.poll(aptos).toHaveLength(7)
      // piso: não vale no AC-02, então a área comum conta 1
      await filtro.getByRole('button', { name: 'Piso e revestimento' }).click()
      expect(await opcoes()).toEqual([expect.stringContaining('Piso cerâmico (teste)')])
      await expect.poll(aptos).toContain('Área comum: Piso cerâmico (teste) 0 de 1')
      // uma ficha só no acabamento: sem o seletor de ficha
      expect(await p.getByTestId('fvs-ficha-apartamento').count()).toBe(0)
      expect(await p.getByTestId('fvs-resumo-acabamento').innerText()).toContain('Piso cerâmico (teste): 0 de 19 liberados')
      // Todos: as três opções juntas e o aviso para escolher um acabamento
      await filtro.getByRole('button', { name: 'Todos' }).click()
      expect((await opcoes()).length).toBe(3)
      expect(await p.getByTestId('fvs-por-apartamento').count()).toBe(0)
      expect(await p.getByTestId('fvs-ambientes').innerText()).toContain('Escolha um acabamento')
      // a escolha fica: sai para o pavimento e volta, continua em Todos
      await filtro.getByRole('button', { name: 'Pintura' }).click()
      await p.getByRole('button', { name: /^Voltar para/ }).click()
      await p.locator('[data-testid=fvs-disciplina][data-disciplina=acabamentos]').click()
      expect(await filtro.locator('button[aria-pressed=true]').innerText()).toBe('Pintura')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `acabamentos_pintura_${largura}.png`), fullPage: true })
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${largura}x${altura}: planta de ambientes aberta pelo menu do pavimento, já no serviço e na aba escolhidos`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const abaAtiva = () => p.locator('.fv-seg button.on').textContent()
      // opção "Reboco" (opcoes_ambientes.ts: abre { servico, aba: 'ambientes' })
      await p.goto(`${url}?abrir=ambientes&esquadrias=1&servico=TESTE-PVS-REB&aba=ambientes`)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      expect(await p.getByTestId('fvs-servico').inputValue()).toBe('TESTE-PVS-REB')
      expect(await abaAtiva()).toBe('Ambientes')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      // opção "Esquadrias": a aba Esquadrias, com o item de esquadria da ficha escolhida
      await p.goto(`${url}?abrir=ambientes&esquadrias=1&servico=TESTE-PVS-REB&aba=esquadrias`)
      await p.getByTestId('fvs-item-esquadria').waitFor()
      expect(await p.getByTestId('fvs-servico').inputValue()).toBe('TESTE-PVS-REB')
      expect(await abaAtiva()).toBe('Esquadrias')
      expect(await p.getByTestId('fvs-item-esquadria').locator('option').allTextContents()).toEqual(['5. Requadros dos vãos'])
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `ambientes_menu_${largura}_esquadrias.png`) })
      // ficha que não existe: abre na primeira, sem erro
      await p.goto(`${url}?abrir=ambientes&esquadrias=1&servico=NAO-EXISTE&aba=ambientes`)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      expect(await p.getByTestId('fvs-servico').inputValue()).toBe('TESTE-PVS-ALV')
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)
  }

  for (const [nome, largura, altura] of [
    ['tablet', 1280, 800],
    ['celular', 375, 812],
  ] as const) {
    it(`${nome} ${largura}x${altura}: ambientes por ficha e estrutura no mesmo pavimento`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const capturar = async (passo: string) => {
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_${nome}_${passo}.png`) })
      }

      // ------------------------------------------------------------ início: estrutura e ambientes
      await p.goto(`${url}?abrir=0`)
      const pavimento = p.getByTestId('fvs-pavimento')
      await noInicio(p)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await capturar('1_inicio')
      // nível 2 (21/11/2026): as disciplinas do pavimento; a alvenaria dos ambientes vai para Alvenaria
      await pavimento.first().click()
      const disciplinas = () => p.getByTestId('fvs-disciplina').evaluateAll((l: HTMLElement[]) => l.map((e) => e.dataset.disciplina))
      await expect.poll(disciplinas).toEqual(['estrutura', 'alvenaria', 'acabamentos'])
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await naDisciplina(p, 'acabamentos')
      const cartaoAmbientes = p.getByTestId('fvs-ambientes')
      expect(await cartaoAmbientes.innerText()).toContain('20 ambientes · nenhuma ficha começada')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)

      // ------------------------------------------------------------ planta de ambientes
      await abrirPlantaDeAmbientes(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.waitForTimeout(400)
      expect(await p.locator('.fv-seg').count()).toBe(0) // não há pilar nem viga para escolher
      expect(await p.getByTestId('fvs-servico').locator('option').allTextContents()).toEqual(['Alvenaria (ficha de teste)', 'Reboco (ficha de teste)'])
      expect(await p.getByTestId('fvs-progresso').innerText()).toContain('0/20 liberados')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      expect(await topoCabe(p)).toBe(true)

      // busca pelo apartamento: enquadra os ambientes dele e, com zoom, escreve o número de cada um
      await buscar(p, '101')
      await p.locator('.fv-toast', { hasText: 'Apto 101: 3 ambientes' }).waitFor()
      await p.waitForTimeout(900)
      expect(await p.locator('.fv-rot span').allTextContents()).toContain('101-03')
      await capturar('2_apto')

      // toque na sala do 101 (ambiente 101-03)
      await tocarNaPlanta(p, 320, 480)
      await p.getByTestId('fvs-painel').waitFor()
      await nomeNoPainel(p, '101-03')
      const info = await p.locator('.fv-inf').innerText()
      expect(info).toContain('Ambiente')
      expect(info).toContain('Apto 101')
      expect(info).toContain('44,0 m²')
      expect(await p.locator('.fv-det').count()).toBe(0) // ambiente não tem detalhe de prancha
      expect(await p.getByTestId('fvs-painel').innerText()).not.toContain('detalhe desta peça')
      const atalhos = p.getByTestId('fvs-irmaos').locator('.fv-chip')
      expect(await atalhos.allTextContents()).toEqual(['01', '02', '03'])

      await item(p, 1, 'C').click()
      await item(p, 2, 'C').click()
      await item(p, 3, 'NC').click()
      await p.locator('.fv-item[data-item="3"] textarea').waitFor()
      const marcados = await registros(p)
      expect(marcados.map((e) => [e.item, e.r, e.rod])).toEqual([[1, 'C', 1], [2, 'C', 1], [3, 'NC', 1]])
      expect(new Set(marcados.map((e) => e.ficha)).size).toBe(1)
      expect(marcados.every((e) => e.planta)).toBe(true) // guarda a planta (revisão da prancha) usada
      expect(await p.getByTestId('fvs-irmaos').locator('.fv-chip.on.s-reprovado').count()).toBe(1)
      expect(await p.getByTestId('fvs-progresso').innerText()).toContain('1 com NC')
      await capturar('3_painel')

      // a mesma sala está pendente no reboco: cada ficha tem a sua situação
      await p.getByTestId('fvs-servico').selectOption({ index: 1 })
      await p.locator('.fv-ficha', { hasText: 'TESTE-PVS-REB' }).waitFor()
      expect(await p.locator('.fv-item button.on').count()).toBe(0)
      expect(await p.getByTestId('fvs-irmaos').locator('.fv-chip.s-reprovado').count()).toBe(0)
      expect(await p.getByTestId('fvs-progresso').innerText()).not.toContain('com NC')
      await p.getByTestId('fvs-servico').selectOption({ index: 0 })
      await p.locator('.fv-ficha', { hasText: 'TESTE-PVS-ALV' }).waitFor()

      // atalho para outro ambiente do apartamento
      await atalhos.first().click()
      await nomeNoPainel(p, '101-01')

      // nome do cômodo (tabela por apartamento-tipo): a busca acha "living 103"; o painel mostra o cômodo
      // em cima e o número ao lado; os atalhos levam o nome de cada cômodo
      await buscar(p, 'living 103')
      await nomeNoPainel(p, 'Living / Cozinha')
      const infoComodo = await p.locator('.fv-inf').innerText()
      expect(infoComodo).toContain('103-03')
      expect(infoComodo).toContain('Apto 103')
      expect(await p.getByTestId('fvs-irmaos').locator('.fv-chip').allTextContents()).toEqual(['01 Suíte 01', '02 Suíte 02', '03 Living / Cozinha'])
      expect(await p.locator('#fv-lista option[value="Suíte 02 - Apto 104"]').count()).toBe(1)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await p.waitForTimeout(900) // fim do voo até a sala do 103
      await capturar('3b_comodo')

      // pincel: um toque marca a ficha inteira da sala do 102, registrado como lote
      await p.locator('.fv-cab button').click()
      await p.locator('.fv-bpincel').click()
      const barra = p.getByTestId('fvs-pincel')
      await barra.waitFor()
      expect(await barra.locator('b').innerText()).toContain('nos ambientes')
      expect(await barra.locator('b').innerText()).toContain('Alvenaria')
      await verFolhaInteira(p)
      await tocarNaPlanta(p, 770, 425)
      await p.locator('.fv-toast', { hasText: '102-03: 6 itens C' }).waitFor()
      const doPincel = (await registros(p)).slice(3)
      expect(doPincel.length).toBe(6)
      expect(new Set(doPincel.map((e) => e.lote)).size).toBe(1)
      expect(doPincel.every((e) => e.r === 'C' && e.lote)).toBe(true)
      await capturar('4_pincel')
      await barra.getByRole('button', { name: 'Sair' }).click()

      // ------------------------------------------------------------ início resume a ficha começada
      await p.locator('.fv-topo .fv-voltar').click()
      await noInicio(p)
      // o P1 (ficha toda aceita, sem concretagem cadastrada no Concreto) fica azul, não verde (achado #2, 24/11)
      expect(await pavimento.innerText()).toContain('0 de 62 peças liberadas · 1 p/ concretar · 1 com NC · 1 com ficha duplicada')
      await capturar('5_inicio_depois')
      await naDisciplina(p, 'acabamentos')
      const resumo = await cartaoAmbientes.locator('.fv-servicos').innerText()
      expect(resumo).toContain('Alvenaria (ficha de teste): 1 de 20 liberados · 1 com NC')
      expect(resumo).not.toContain('Reboco')
      // o "⋯ Mais" (tirar do aparelho) fica nas disciplinas do pavimento
      await p.goBack()
      await p.getByTestId('fvs-nivel-pavimento').waitFor()

      // falta de espaço: tira as plantas do pavimento do aparelho. Marcações ficam; depois é só baixar de novo
      const marcacoesAntes = (await registros(p)).length
      let textoDaConfirmacao = ''
      p.once('dialog', (d: any) => {
        textoDaConfirmacao = d.message()
        return d.dismiss()
      })
      // fica recolhido num "⋯ Mais", longe do Abrir (demonstração, 14/11)
      expect(await p.getByTestId('fvs-tirar-pavimento').isVisible()).toBe(false)
      await p.getByTestId('fvs-mais-pavimento').click()
      await p.getByTestId('fvs-tirar-pavimento').click()
      await p.waitForTimeout(100)
      expect(textoDaConfirmacao).toContain('Tirar do aparelho as plantas de Pavimento de teste')
      expect(textoDaConfirmacao).toContain('As marcações não são afetadas')
      // disse não: nada muda (o pavimento continua no aparelho)
      await noInicio(p)
      expect(await pavimento.innerText()).toContain('No aparelho')

      // ficha sem peça na planta: fica na lista, com a situação e as contagens
      const semPeca = p.getByTestId('fvs-sem-peca')
      await semPeca.locator('summary').click()
      const textoSemPeca = await semPeca.innerText()
      expect(textoSemPeca).toContain('Ver as 1 fichas')
      expect(textoSemPeca).toContain('Laje (ficha de teste) · Em Andamento')
      expect(textoSemPeca).toContain('4 C · 0 NC · 0 NA')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)

      // ------------------------------------------------------------ planta de forma, mesmo pavimento
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.waitForTimeout(400)
      expect(await p.locator('.fv-seg button').allTextContents()).toEqual(['Pilares', 'Vigas', 'Lajes'])
      expect(await p.locator('.fv-rot').count()).toBe(0) // o nome da peça já está na prancha
      // P1 veio aprovado do histórico e P2 tem uma ficha com NC. Sem concretagem cadastrada no Concreto, o P1
      // fica azul (liberado para concretar), não verde (achado #2, 24/11)
      const progresso = await p.getByTestId('fvs-progresso').innerText()
      expect(progresso).toContain('0/24 liberados')
      expect(progresso).toContain('1 p/ concretar')
      expect(await p.getByTestId('fvs-progresso').getAttribute('title')).toBe('0 de 24 pilares liberados')
      expect(progresso).toContain('1 com NC')
      expect(await p.locator('.fv-nomes select option').allTextContents()).toEqual(['Trecho 1', 'Ambientes'])
      expect(await topoCabe(p)).toBe(true)

      // legenda das cores: no tablet fica à vista; no celular, recolhida, para não cobrir a planta
      const legenda = p.getByTestId('fvs-legenda')
      if (largura < 700) {
        expect(await legenda.isVisible()).toBe(false)
        await p.getByTestId('fvs-bt-legenda').click()
        await legenda.waitFor()
        await p.getByTestId('fvs-bt-legenda').click()
        await legenda.waitFor({ state: 'hidden' })
      } else {
        expect(await legenda.isVisible()).toBe(true)
        expect(await p.getByTestId('fvs-bt-legenda').isVisible()).toBe(false)
      }

      // ---------------------------------------------------------- histórico do Construpoint
      // P1: registro com a data de quando foi feito e o nome de quem marcou, não "hoje" nem "outra pessoa"
      await buscar(p, 'P1')
      await nomeNoPainel(p, 'P1')
      expect(await p.locator('.fv-item[data-item="1"] .fv-hr').innerText()).toBe('C em 10/08 às 09:30 · V01 · Pessoa Um')
      expect(await p.getByTestId('fvs-fichas-abertas').innerText()).toContain('FVS-TESTE-0001')
      expect(await p.locator('.fv-sit').first().innerText()).toBe('Liberado p/ concretar') // sem concretagem cadastrada: azul (achado #2)
      expect(await p.locator('.fv-aberta').first().evaluate((e: Element) => e.tagName)).toBe('DIV') // uma ficha só: nada para escolher

      // P2: ficha duplicada. Abre na que tem R; a outra continua lá, aprovada.
      await buscar(p, 'P2')
      await nomeNoPainel(p, 'P2')
      const abertas = p.getByTestId('fvs-fichas-abertas')
      expect((await abertas.innerText()).toLowerCase()).toContain('ficha duplicada: 2 fichas nesta peça')
      expect(await abertas.locator('button.fv-aberta.on b').innerText()).toBe('FVS-TESTE-0003')
      const comR = abertas.locator('button', { hasText: 'FVS-TESTE-0003' })
      const aceita = abertas.locator('button', { hasText: 'FVS-TESTE-0002' })
      expect(await comR.innerText()).toContain('Pendente Reinspeção')
      expect(await comR.innerText()).toContain('Com NC')
      expect(await aceita.innerText()).toContain('Aceito')
      expect(await aceita.innerText()).toContain('Liberado')
      expect(await p.locator('.fv-item[data-item="2"] .fv-hr').innerText()).toBe('NC em 30/09 às 08:15 · V01 · Pessoa Dois')
      expect(await p.locator('.fv-item[data-item="2"] textarea').inputValue()).toBe('Falta espaçador')
      await capturar('6_duplicada')
      // alvos de toque com pelo menos 44 px no topo e no painel (Fechar, Etapa C, Desmarcar NC, foto, "1 com NC")
      expect(await alvosPequenos(p)).toEqual([])
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      expect(await topoCabe(p)).toBe(true)

      // a outra ficha mostra as marcações dela, sem o R
      await aceita.click()
      await p.locator('button.fv-aberta.on', { hasText: 'FVS-TESTE-0002' }).waitFor()
      expect(await p.locator('.fv-item[data-item="2"] .fv-hr').innerText()).toBe('C em 11/08 às 09:30 · V01 · Pessoa Um')
      expect(await p.locator('.fv-item textarea').count()).toBe(0)

      // reinspeção feita no app vale só para a ficha escolhida: a duplicada não muda
      await comR.click()
      await p.locator('button.fv-aberta.on', { hasText: 'FVS-TESTE-0003' }).waitFor()
      const antesDaReinspecao = (await registros(p)).length
      await item(p, 2, 'C').click()
      await p.locator('.fv-item[data-item="2"] button[data-r="C"].on').waitFor()
      const reinspecao = (await registros(p)).slice(antesDaReinspecao)
      expect(reinspecao.map((e) => [e.item, e.r, e.rod])).toEqual([[2, 'C', 2]])
      expect(await aceita.innerText()).toContain('Liberado')
      // ficha única (23/11): o que ainda não está no Construpoint fica em tom mais claro, na mesma ficha
      await p.locator('.fv-item.so-app[data-item="2"]').waitFor()
      expect(await p.locator('.fv-item[data-item="2"] [data-testid=fvs-so-no-app]').innerText()).toContain('ainda não está no')
      expect(await p.locator('.fv-item[data-item="1"]').getAttribute('class')).not.toContain('so-app')

      // P3 tem ficha aberta (agendada) e uma marcação feita só no app, sem ficha: vira uma ficha só,
      // sem a aba "Marcado só no app" (pedido do Nicolas, 23/11)
      await p.evaluate(`(async () => {
        const { banco } = await import('/src/nucleo/servicos.ts')
        const base = (await banco.registros.get(['fichas_modelo', 'f0000000-0000-0000-0000-000000000001'])).linha
        await banco.registros.put({ tabela: 'fvs_eventos', id: 'f9000000-0000-0000-0000-000000000123', obra_id: base.obra_id, pendente: 0, linha: { ...base, itens: undefined, id: 'f9000000-0000-0000-0000-000000000123', elemento_id: 'e0000000-0000-0000-0000-000000000003', ficha_id: base.id, item: 1, resultado: 'C', rodada: 1, observacao: null, lote_id: null, planta_id: null, ficha_campo_id: null, usuario_id: 'outra', criado_em_dispositivo: '2026-10-01T12:00:00.000Z' } })
      })()`)
      await p.goto(`${url}?abrir=0`)
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await buscar(p, 'P3')
      await nomeNoPainel(p, 'P3')
      await p.locator('.fv-item.so-app[data-item="1"]').waitFor()
      const abertasP3 = p.getByTestId('fvs-fichas-abertas')
      expect(await abertasP3.innerText()).not.toContain('Marcado só no app')
      expect(await abertasP3.getByTestId('fvs-ficha-com-app').innerText()).toContain('tom mais claro')
      expect(await p.locator('.fv-aberta').count()).toBe(1)
      await capturar('6_ficha_unica')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)

      // pincel não escolhe por conta própria numa peça com duas fichas
      await p.locator('.fv-cab button').click()
      await p.locator('.fv-bpincel').click()
      await p.getByTestId('fvs-pincel').waitFor()
      const antesDoPincel = (await registros(p)).length
      await verFolhaInteira(p)
      const centroP2: [number, number] = [150 + 300, 150]
      await tocarNaPlanta(p, ...centroP2)
      await p.locator('.fv-toast', { hasText: 'tem 2 fichas no Construpoint' }).waitFor({ timeout: 8000 }).catch(async (e: Error) => {
        // falhou só no GitHub, no celular: diz o que havia na tela em vez de só "não apareceu"
        const [x, y] = await naTela(p, ...centroP2)
        const estado = await p.evaluate(([tx, ty]: [number, number]) => {
          const m = (window as any).__fvMapa
          const el = document.elementFromPoint(tx, ty)
          return {
            aviso: document.querySelector('.fv-toast')?.textContent ?? null,
            sobOPonto: `${el?.tagName}.${el?.className}`,
            zoom: m.getZoom(),
            tamanho: m.getSize(),
            centro: m.getCenter(),
            painel: document.querySelector('.fv-nm')?.textContent ?? null,
            pincel: !!document.querySelector('[data-testid=fvs-pincel]'),
            tipo: document.querySelector('.fv-seg button.on')?.textContent ?? null,
            historia: history.state,
          }
        }, [x, y])
        const novos = (await registros(p)).slice(antesDoPincel).map((r) => `${r.el} item ${r.item}`)
        throw new Error(`Toque no P2 sem aviso: ${JSON.stringify({ x, y, novos, ...estado })} (${e.message})`)
      })
      expect((await registros(p)).length).toBe(antesDoPincel)
      await p.getByTestId('fvs-pincel').getByRole('button', { name: 'Sair' }).click()

      await buscar(p, 'P4')
      await p.getByTestId('fvs-painel').waitFor()
      await nomeNoPainel(p, 'P4')
      expect(await p.locator('.fv-det img').count()).toBe(1)
      const antes = (await registros(p)).length
      await item(p, 1, 'C').click()
      // R, escreve o que fazer e toca em A logo em seguida: a observação fica e o A é a reinspeção
      await item(p, 4, 'NC').click()
      const campo = p.locator('.fv-item[data-item="4"] textarea')
      await campo.waitFor()
      await campo.fill('Fora de prumo')
      await item(p, 4, 'C').click()
      await p.locator('.fv-item[data-item="4"] button[data-r="C"].on').waitFor()
      const doPilar = (await registros(p)).slice(antes)
      expect(doPilar.filter((e) => e.item === 4).map((e) => [e.r, e.rod, e.obs])).toEqual([['NC', 1, null], ['NC', 1, 'Fora de prumo'], ['C', 2, null]])
      expect(new Set(doPilar.map((e) => e.ficha)).size).toBe(1)
      expect(doPilar[0].ficha).not.toBe(marcados[0].ficha) // ficha de pilar, não a de alvenaria
      await capturar('6_pilar')

      await p.locator('.fv-seg button', { hasText: 'Vigas' }).click()
      await p.waitForFunction(() => document.querySelector('[data-testid=fvs-progresso]')?.getAttribute('title')?.includes('vigas'))
      expect(await p.locator('.fv-etapa option').count()).toBeGreaterThan(1)
      // o filtro cabe inteiro no celular ("Todas as eta…" cortado não dizia o que era; demonstração, 09/11)
      expect(await p.locator('.fv-etapa option').first().innerText()).toBe('Etapas')
      expect(await p.locator('.fv-etapa').evaluate((s: HTMLSelectElement) => {
        const c = document.createElement('canvas').getContext('2d')!
        c.font = getComputedStyle(s).font
        const st = getComputedStyle(s)
        // a seta do select ocupa uns 20 px à direita, além do padding
        const livre = s.clientWidth - parseFloat(st.paddingLeft) - Math.max(parseFloat(st.paddingRight), 20)
        return c.measureText(s.options[s.selectedIndex].text).width <= livre // celular: 81 de 85 px
      })).toBe(true)

      // agora diz sim: as plantas saem do aparelho e o botão vira "Baixar"; as marcações continuam
      await p.locator('.fv-topo .fv-voltar').click()
      await noInicio(p)
      const marcacoesDepois = (await registros(p)).length
      expect(marcacoesDepois).toBeGreaterThan(marcacoesAntes)
      p.once('dialog', (d: any) => d.accept())
      await pavimento.first().click()
      if (!(await p.getByTestId('fvs-tirar-pavimento').isVisible())) await p.getByTestId('fvs-mais-pavimento').click()
      await p.getByTestId('fvs-tirar-pavimento').click()
      await p.getByTestId('fvs-tirar-pavimento').waitFor({ state: 'detached' })
      await noInicio(p)
      expect(await pavimento.innerText()).toContain('Ainda não baixado')
      // na Estrutura, a forma volta a ter o Baixar
      await naDisciplina(p, 'estrutura')
      await p.getByTestId('fvs-secao-estrutura').getByRole('button', { name: /Baixar/ }).first().waitFor()
      expect(await p.getByTestId('fvs-opcao-forma').count()).toBe(0)
      expect((await registros(p)).length).toBe(marcacoesDepois)

      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: lista de reprovações leva até a peça`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const capturar = async (passo: string) => {
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_rep_${nome}_${passo}.png`) })
      }
      const linhas = p.getByTestId('fvs-rep')
      const contagem = () => p.getByTestId('fvs-rep-contagem').innerText()

      await p.goto(`${url}?abrir=0`)
      const entrada = p.getByTestId('fvs-entra-reprovacoes')
      await entrada.waitFor()
      expect(await entrada.innerText()).toContain('1 reprovação aberta')
      await entrada.click()

      // a linha traz peça, onde, item, o que fazer, quem e quando
      await linhas.first().waitFor()
      expect(await contagem()).toBe('1 aberta · 0 reinspecionadas')
      expect(await linhas.count()).toBe(1)
      const texto = (await linhas.first().textContent()) ?? ''
      for (const parte of ['P2', 'Pavimento de teste', 'Trecho 1', 'NC V01', '2. Projeto liberado na revisão vigente', 'Falta espaçador', 'NC em 30/09 às 08:15 · Pessoa Dois', 'FVS-TESTE-0003']) {
        expect(texto).toContain(parte)
      }
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await capturar('1_lista')

      // filtros
      expect(await p.getByTestId('fvs-rep-quem').locator('option').allTextContents()).toEqual(['Todos', 'Pessoa Dois'])
      expect(await p.getByTestId('fvs-rep-trecho').locator('option').allTextContents()).toEqual(['Todos', 'Trecho 1'])
      await p.getByTestId('fvs-rep-situacao').selectOption('reinspecionadas')
      await p.getByTestId('fvs-rep-vazia').waitFor()
      expect(await p.getByTestId('fvs-rep-vazia').innerText()).toBe('Sem reprovações com estes filtros')
      await p.getByTestId('fvs-rep-situacao').selectOption('abertas')
      await linhas.first().waitFor()

      // enviar a lista: no celular abre o "compartilhar"; sem ele, copia o texto
      await p.evaluate(() => {
        ;(navigator as any).share = (d: { text: string }) => {
          ;(window as any).__enviado = d.text
          return Promise.resolve()
        }
      })
      await p.getByTestId('fvs-rep-enviar').click()
      await p.waitForFunction(() => (window as any).__enviado)
      const enviado: string = await p.evaluate(() => (window as any).__enviado)
      expect(enviado).toContain('Reprovações abertas · TESTE')
      expect(enviado).toContain('*P2* · Pavimento de teste · Trecho 1')
      expect(enviado).toContain('O que fazer: Falta espaçador')
      await p.evaluate(() => {
        ;(navigator as any).share = undefined
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: (t: string) => {
              ;(window as any).__copiado = t
              return Promise.resolve()
            },
          },
        })
      })
      await p.getByTestId('fvs-rep-enviar').click()
      await p.getByTestId('fvs-rep-enviou').waitFor()
      expect(await p.evaluate(() => (window as any).__copiado)).toBe(enviado)

      // planilha só com o que está filtrado
      const [dlRep] = await Promise.all([p.waitForEvent('download'), p.getByTestId('fvs-rep-planilha').click()])
      expect(dlRep.suggestedFilename()).toMatch(/^reprovacoes_TESTE_\d{4}-\d{2}-\d{2}\.csv$/)
      const planilhaRep = readFileSync(await dlRep.path(), 'utf8')
      expect(planilhaRep.trim().split('\r\n').length).toBe(2)
      expect(planilhaRep).toContain('Pavimento de teste;Trecho 1;Pilar;P2;TESTE-PVS-P;FVS-TESTE-0003;2;')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)

      // o toque abre a planta certa, na peça, na ficha com o R, com o item à vista
      await linhas.first().locator('button.fv-rep').click()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await nomeNoPainel(p, 'P2')
      expect(await p.locator('.fv-nomes select').inputValue()).toBeTruthy()
      expect(await p.locator('button.fv-aberta.on b').innerText()).toBe('FVS-TESTE-0003')
      const destaque = p.locator('.fv-item.destaque[data-item="2"]')
      await destaque.waitFor()
      await p.waitForTimeout(500)
      const visivel = await destaque.evaluate((e: Element) => {
        const r = e.getBoundingClientRect()
        const c = e.closest('.fv-corpo')!.getBoundingClientRect()
        return r.top >= c.top - 1 && r.top < c.bottom
      })
      expect(visivel).toBe(true)
      // a peça ficou no meio da área do mapa, e não a folha inteira enquadrada
      const peca = await p.evaluate(() => {
        const m = (window as any).__fvMapa
        const q = m.latLngToContainerPoint([-150, 450]) // centro do P2 na planta de teste
        const t = m.getSize()
        return { x: q.x / t.x, y: q.y / t.y, zoom: m.getZoom() }
      })
      expect(peca.x).toBeGreaterThan(0.2)
      expect(peca.x).toBeLessThan(0.8)
      expect(peca.y).toBeGreaterThan(0.2)
      expect(peca.y).toBeLessThan(0.8)
      expect(peca.zoom).toBeGreaterThan(-1)
      await capturar('2_na_peca')

      // voltar devolve à lista, como estava
      await p.locator('.fv-topo .fv-voltar').click()
      await linhas.first().waitFor()
      expect(await contagem()).toBe('1 aberta · 0 reinspecionadas')

      // reinspeção aprovada: sai das abertas, fica nas reinspecionadas, com o R e o A
      await linhas.first().locator('button.fv-rep').click()
      await nomeNoPainel(p, 'P2')
      await item(p, 2, 'C').click()
      await p.locator('.fv-item[data-item="2"] button[data-r="C"].on').waitFor()
      await p.locator('.fv-topo .fv-voltar').click()
      await p.getByTestId('fvs-rep-vazia').waitFor()
      expect(await contagem()).toBe('0 abertas · 1 reinspecionada')
      await p.getByTestId('fvs-rep-situacao').selectOption('reinspecionadas')
      await linhas.first().waitFor()
      const reinspecionada = (await linhas.first().textContent()) ?? ''
      expect(reinspecionada).toContain('C V02')
      expect(reinspecionada).toContain('Falta espaçador')
      expect(reinspecionada).toContain('Reinspecionado: C às')
      await capturar('3_reinspecionada')
      await p.getByTestId('fvs-rep-situacao').selectOption('abertas')

      // R novo no app com foto: entra na lista, com a miniatura
      await p.locator('.fv-voltar').first().click()
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.waitForTimeout(300)
      await buscar(p, 'P4')
      await nomeNoPainel(p, 'P4')
      await item(p, 1, 'NC').click()
      const campo = p.locator('.fv-item[data-item="1"] textarea')
      await campo.waitFor()
      await campo.fill('Trocar a fôrma')
      await campo.blur()
      // PNG de 1 pixel
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
      await p.locator('.fv-item[data-item="1"] input[type=file]').setInputFiles({ name: 'nc.png', mimeType: 'image/png', buffer: png })
      // a foto aparece no painel, e o toque amplia
      const mini = p.locator('.fv-item[data-item="1"] .fv-foto-mini img')
      await mini.waitFor()
      await p.locator('.fv-item[data-item="1"] .fv-foto', { hasText: 'Outra foto' }).waitFor()
      await mini.click()
      await p.locator('.fv-zoom img').waitFor()
      await p.locator('.fv-zoom-fechar').click()
      await p.locator('.fv-zoom').waitFor({ state: 'detached' })
      await nomeNoPainel(p, 'P4')
      await p.locator('.fv-topo .fv-voltar').click()
      await noInicio(p)
      await entrada.click()
      await linhas.first().waitFor()
      const comFoto = linhas.first()
      const textoFoto = (await comFoto.textContent()) ?? ''
      expect(textoFoto).toContain('P4')
      expect(textoFoto).toContain('Trocar a fôrma')
      expect(textoFoto).toContain('você')
      await comFoto.locator('.fv-rep-foto img').waitFor()
      await capturar('4_com_foto')

      // planta fora do aparelho: avisa e oferece baixar, em vez de abrir uma planta vazia
      await p.evaluate(`(async () => {
        const { limparPacotes } = await import('/src/fvs/pacote.ts')
        await limparPacotes({ obraId: '${OBRA}', usuarioId: '00000000-0000-0000-0000-0000000000a1' }, new Set())
      })()`)
      await p.reload()
      await noInicio(p)
      await entrada.click()
      await linhas.first().waitFor()
      await linhas.first().locator('button.fv-rep').click()
      const oferta = p.getByTestId('fvs-rep-oferta')
      await oferta.waitFor()
      expect(await oferta.innerText()).toContain('não está no aparelho')
      expect(await oferta.getByRole('button').count()).toBe(1)
      await capturar('5_baixar')

      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: tratativa do NC: quem resolve, prazo que só avisa, causa, concessão com quem decidiu e eficácia`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const capturar = async (passo: string) => {
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_trat_${nome}_${passo}.png`) })
      }
      const linhas = p.getByTestId('fvs-rep')
      const contagem = () => p.getByTestId('fvs-rep-contagem').innerText()
      // tratativas gravadas no aparelho, da mais antiga para a mais nova
      const tratativas = (): Promise<Array<Record<string, unknown>>> =>
        p.evaluate(`(async () => {
          const { sincronizador } = await import('/src/nucleo/servicos.ts')
          const ls = await sincronizador.linhas('fvs_tratativas', '${OBRA}')
          return ls.sort((a, b) => (a.criado_em_dispositivo < b.criado_em_dispositivo ? -1 : 1))
            .map((t) => ({ resp: t.responsavel, prazo: t.prazo, causa: t.causa, conc: t.concessao, por: t.concessao_por, efic: t.eficacia, ev: t.evento_nc_id }))
        })()`)
      const ultima = async () => (await tratativas()).at(-1) ?? null
      const esperar = async (f: (t: Record<string, unknown> | null) => boolean) => {
        for (let i = 0; i < 50 && !f(await ultima()); i++) await p.waitForTimeout(100)
        expect(f(await ultima())).toBe(true)
      }

      await p.goto(`${url}?abrir=0`)
      await p.getByTestId('fvs-entra-reprovacoes').click()
      await linhas.first().locator('button.fv-rep').click()
      await nomeNoPainel(p, 'P2')
      const trat = p.locator('.fv-item[data-item="2"] [data-testid=fvs-trat]')
      await trat.waitFor()
      // vindo da lista para o item, a tratativa já abre
      expect(await trat.evaluate((e: Element) => (e as HTMLDetailsElement).open)).toBe(true)
      expect(await tratativas()).toEqual([])

      // quem resolve (texto: grava ao sair do campo)
      const resp = trat.getByTestId('fvs-trat-responsavel')
      await resp.fill('Empreiteiro Exemplo')
      await resp.blur()
      await esperar((t) => t?.resp === 'Empreiteiro Exemplo')
      // prazo vencido: avisa, e nada fica bloqueado
      await trat.getByTestId('fvs-trat-prazo').fill('2026-01-10')
      await trat.getByTestId('fvs-trat-aviso-prazo').waitFor()
      expect(await trat.getByTestId('fvs-trat-aviso-prazo').innerText()).toBe('até 10/01/2026 · atrasado')
      await esperar((t) => t?.prazo === '2026-01-10')
      expect(await item(p, 2, 'C').isEnabled()).toBe(true)
      // causa: um toque
      await trat.getByTestId('fvs-trat-causa-material').click()
      await esperar((t) => t?.causa === 'material')
      expect(await trat.getByTestId('fvs-trat-causa-material').getAttribute('aria-pressed')).toBe('true')
      expect(await trat.getByTestId('fvs-trat-resumo').innerText()).toContain('atrasado')

      // concessão sem quem decidiu: avisa e não vale (o banco recusaria)
      const antes = (await tratativas()).length
      await trat.getByTestId('fvs-trat-concessao').check()
      await trat.getByTestId('fvs-trat-falta-quem').waitFor()
      await p.waitForTimeout(300)
      expect((await tratativas()).length).toBe(antes)
      const quem = trat.getByTestId('fvs-trat-concessao_por')
      await quem.fill('Engenheiro Exemplo')
      await quem.blur()
      await esperar((t) => t?.conc === true)
      await p.locator('.fv-item[data-item="2"] [data-testid=fvs-concessao]').waitFor()
      const ts = await tratativas()
      expect(ts.at(-1)).toEqual({ resp: 'Empreiteiro Exemplo', prazo: '2026-01-10', causa: 'material', conc: true, por: 'Engenheiro Exemplo', efic: null, ev: ts[0].ev })
      // cada mudança é uma linha nova, todas do mesmo NC, nenhuma concessão sem nome
      expect(new Set(ts.map((t) => t.ev)).size).toBe(1)
      expect(ts.every((t) => !t.conc || !!t.por)).toBe(true)
      expect(await alvosPequenos(p)).toEqual([])
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      expect(await contrasteNosDoisTemas(p)).toEqual([])
      await capturar('1_tratativa')

      // na lista: a concessão fecha o NC sem reinspeção, com quem decidiu
      await p.locator('.fv-topo .fv-voltar').click()
      await p.getByTestId('fvs-rep-vazia').waitFor()
      expect(await contagem()).toBe('0 abertas · 0 reinspecionadas · 1 sob concessão')
      await p.getByTestId('fvs-rep-situacao').selectOption('todas')
      await linhas.first().waitFor()
      const texto = (await linhas.first().textContent()) ?? ''
      for (const parte of ['NC V01 · concessão', 'Quem resolve: Empreiteiro Exemplo', 'Causa: Material', 'Aceito sob concessão por Engenheiro Exemplo']) expect(texto).toContain(parte)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await capturar('2_lista')

      // sem concessão de novo, reinspeção C: a tratativa fica à vista e pergunta se a correção resolveu
      await linhas.first().locator('button.fv-rep').click()
      await nomeNoPainel(p, 'P2')
      await trat.getByTestId('fvs-trat-concessao').uncheck()
      await esperar((t) => t?.conc === false)
      await p.locator('.fv-item[data-item="2"] [data-testid=fvs-concessao]').waitFor({ state: 'detached' })
      await item(p, 2, 'C').click()
      await p.locator('.fv-item[data-item="2"] button[data-r="C"].on').waitFor()
      const fechada = p.locator('.fv-item[data-item="2"] .fv-nc-fechada [data-testid=fvs-trat]')
      await fechada.waitFor()
      expect(await fechada.evaluate((e: Element) => (e as HTMLDetailsElement).open)).toBe(true)
      // reinspecionado: o prazo não avisa mais e só a eficácia se mexe
      expect(await fechada.getByTestId('fvs-trat-aviso-prazo').count()).toBe(0)
      expect(await fechada.getByTestId('fvs-trat-responsavel').isDisabled()).toBe(true)
      await fechada.getByTestId('fvs-trat-eficacia-eficaz').click()
      await esperar((t) => t?.efic === 'eficaz')
      expect(await ultima()).toMatchObject({ resp: 'Empreiteiro Exemplo', causa: 'material', conc: false, efic: 'eficaz' })
      expect(await fechada.getByTestId('fvs-trat-resumo').innerText()).toContain('Correção eficaz')
      expect(await alvosPequenos(p)).toEqual([])
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await capturar('3_eficacia')

      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: lista do que falta lançar no Construpoint`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700, acceptDownloads: true })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const capturar = async (passo: string) => {
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_lan_${nome}_${passo}.png`) })
      }

      // o histórico veio do Construpoint: não há nada para lançar
      await p.goto(`${url}?abrir=0`)
      await noInicio(p)
      expect(await p.getByTestId('fvs-entra-lancamento').count()).toBe(0)

      // marca no app: um item numa peça com ficha do Construpoint, um R com texto numa peça sem ficha
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.waitForTimeout(300)
      await buscar(p, 'P3')
      await nomeNoPainel(p, 'P3')
      await item(p, 1, 'C').click()
      await p.locator('.fv-item[data-item="1"] button[data-r="C"].on').waitFor()
      await buscar(p, 'P4')
      await nomeNoPainel(p, 'P4')
      await item(p, 2, 'NC').click()
      const campo = p.locator('.fv-item[data-item="2"] textarea')
      await campo.waitFor()
      await campo.fill('=Trocar a fôrma; urgente')
      await campo.blur()
      await p.waitForTimeout(200)
      await p.locator('.fv-topo .fv-voltar').click()
      await noInicio(p)

      const entrada = p.getByTestId('fvs-entra-lancamento')
      await entrada.waitFor()
      expect(await entrada.innerText()).toContain('2 marcações para lançar no Construpoint')
      await entrada.click()

      const fichas = p.getByTestId('fvs-lan-ficha')
      await fichas.first().waitFor()
      expect(await p.getByTestId('fvs-lan-contagem').innerText()).toBe('2 marcações em 2 fichas')
      const primeira = await fichas.nth(0).textContent()
      expect(primeira).toContain('P3')
      expect(primeira).toContain('FVS-TESTE-0004') // a ficha agendada no Construpoint
      expect(primeira).toContain('1. Local limpo e desimpedido')
      const segunda = await fichas.nth(1).textContent()
      expect(segunda).toContain('P4')
      expect(segunda).toContain('Sem ficha no Construpoint: abrir uma nova')
      expect(segunda).toContain('=Trocar a fôrma; urgente')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await capturar('1_lista')

      // planilha: abre no Excel, com o texto de campo seguro
      const [download] = await Promise.all([p.waitForEvent('download'), p.getByTestId('fvs-lan-planilha').click()])
      expect(download.suggestedFilename()).toMatch(/^lancar_construpoint_TESTE_\d{4}-\d{2}-\d{2}\.csv$/)
      const conteudo = readFileSync(await download.path(), 'utf8')
      expect(conteudo.charCodeAt(0)).toBe(0xfeff)
      expect(conteudo).toContain('Pavimento de teste;P3;TESTE-PVS-P;')
      expect(conteudo).toContain('FVS-TESTE-0004')
      expect(conteudo).toContain('abrir ficha nova')
      expect(conteudo).toContain(`"'=Trocar a fôrma; urgente"`)

      // "já lancei": sai da lista e do botão, e dá para ver de novo
      await p.getByTestId('fvs-lan-marcar').click()
      await p.getByTestId('fvs-lan-vazia').waitFor()
      await p.getByTestId('fvs-lan-tudo').click()
      await fichas.first().waitFor()
      expect(await fichas.count()).toBe(2)
      await p.getByTestId('fvs-lan-tudo').click()
      await p.getByTestId('fvs-lan-vazia').waitFor()
      await p.locator('.fv-lancamento .fv-voltar').click()
      await noInicio(p)
      expect(await p.getByTestId('fvs-entra-lancamento').count()).toBe(0)

      // planilha da situação da obra: uma linha por peça e ficha, inclusive o que está pendente
      expect(await p.getByTestId('fvs-resumo-obra').innerText()).toContain('0 de 62 peças liberadas')
      const [dlSituacao] = await Promise.all([p.waitForEvent('download'), p.getByTestId('fvs-planilha-situacao').click()])
      expect(dlSituacao.suggestedFilename()).toMatch(/^situacao_fvs_TESTE_\d{4}-\d{2}-\d{2}\.csv$/)
      const situacao = readFileSync(await dlSituacao.path(), 'utf8')
      expect(situacao.charCodeAt(0)).toBe(0xfeff)
      expect(situacao).toContain('Pavimento de teste;Pilar;P1;20x60;TESTE-PVS-P;Liberado p/ concretar;7;0;0;0;100;10/08/2026;09:30;Pessoa Um;FVS-TESTE-0001;Aceito;')
      expect(situacao).toContain(';Com NC;') // P2: uma das duas fichas tem R
      expect(situacao).toContain(';FVS-TESTE-0002;Aceito;sim')
      expect(situacao).toContain(';FVS-TESTE-0003;Pendente Reinspeção;sim')
      expect(situacao).toContain('Pavimento de teste;Pilar;P24;25x50;TESTE-PVS-P;Pendente;0;0;0;7;;;;;;;')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)

      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: recarregar no mesmo instante do toque não perde a marcação (CPU 4x, S3)`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      // tablet comum: CPU 4x mais lenta, como na sonda do Testador
      const cdp = await contexto.newCDPSession(p)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
      const abrirPeca = async (peca: string) => {
        await p.goto(`${url}?abrir=0`)
        await noInicio(p, 60_000)
        await abrirForma(p)
        await p.locator('.fv-mapa .leaflet-tile').first().waitFor({ timeout: 60_000 })
        await buscar(p, peca)
        await nomeNoPainel(p, peca)
      }

      // toque e recarregar logo em seguida, sem esperar o botão acender: 5 vezes, 5 itens do P7
      for (let n = 1; n <= 5; n++) {
        await abrirPeca('P7')
        await item(p, n, 'C').click()
        await p.reload({ waitUntil: 'commit' }).catch(() => {})
      }
      await abrirPeca('P7')
      for (let n = 1; n <= 5; n++) await p.locator(`.fv-item[data-item="${n}"] button[data-r="C"].on`).waitFor({ timeout: 10_000 })
      expect((await registros(p)).filter((r) => r.r === 'C' && r.item <= 5).length).toBe(5)
      // o início avisa que marcações feitas antes de recarregar foram gravadas agora (só na reabertura em que refez)
      // "Etapa A" (lote) e recarregar no mesmo instante: o lote fica inteiro, com um lote só
      await abrirPeca('P8')
      const etapa = p.locator('.fv-etapa-tit button').first()
      const vaziosNaEtapa = Number(((await etapa.innerText()).match(/\((\d+)\)/) ?? [])[1])
      expect(vaziosNaEtapa).toBeGreaterThan(1)
      await etapa.click()
      await p.reload({ waitUntil: 'commit' }).catch(() => {})
      await abrirPeca('P8')
      await expect.poll(async () => (await registros(p)).filter((r) => r.lote && r.r === 'C').length, { timeout: 10_000 }).toBe(vaziosNaEtapa)
      const lotes = new Set((await registros(p)).filter((r) => r.lote).map((r) => r.lote))
      expect(lotes.size).toBe(1)
      // nada ficou anotado para refazer de novo
      expect(await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('fvs_toques:') && localStorage.getItem(k) !== '[]').length)).toBe(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/s3_${nome}_lote.png` })

      expect(erros).toEqual([])
      await contexto.close()
    }, 240_000)

    it(`${nome} ${largura}x${altura}: desenho de duas peças (P6 e P6a) deixa escolher; o nome vai direto`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&gemeo=1`)
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.waitForTimeout(300)
      const painel = p.getByTestId('fvs-painel')
      const escolha = p.getByTestId('fvs-escolha-peca')
      // P6 e P6a: o mesmo pilar desenhado em (1640..1660, 125..175); nome do P6 acima, do P6a abaixo
      const focar = () => enquadrar(p, [-150, 1650], 1)
      const tocarNoDesenho = async () => {
        await focar()
        await tocarNaPlanta(p, 1650, 160)
      }

      // toque no desenho: pergunta qual peça, em ordem de nome
      await tocarNoDesenho()
      await escolha.waitFor()
      const botoes = escolha.locator('.fv-escolha-pecas button')
      expect(await botoes.locator('b').allInnerTexts()).toEqual(['P6', 'P6a'])
      // cada botão diz a situação da peça, como a legenda, e tem altura de dedo
      const textos = await botoes.allInnerTexts()
      for (const t of textos) expect(t).toMatch(/Pendente|Em andamento|Liberado|Com NC/)
      for (const h of await botoes.evaluateAll((l: HTMLElement[]) => l.map((b) => b.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44)
      expect(await escolha.getByRole('button', { name: 'Cancelar' }).evaluate((b: HTMLElement) => b.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44)
      expect(await painel.count()).toBe(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/fvs21_${nome}_1_escolha.png` })
      await escolha.locator('button[data-situacao]', { hasText: 'P6a' }).click()
      await nomeNoPainel(p, 'P6a')
      expect(await escolha.count()).toBe(0)
      // NC no P6a: na próxima escolha, ele aparece "Com NC" e o P6 continua "Pendente"
      await item(p, 1, 'NC').click()
      await p.waitForFunction(() => document.querySelector('.fv-item[data-item="1"] button[data-r="NC"].on'))
      // um voltar só fecha o painel
      await p.goBack()
      await painel.waitFor({ state: 'detached' })
      expect(await p.locator('.fv-mapa').count()).toBe(1)

      // o voltar do aparelho fecha a escolha, sem sair da planta e sem abrir nada
      await tocarNoDesenho()
      await escolha.waitFor()
      expect(await escolha.locator('button[data-situacao="reprovado"]').innerText()).toContain('P6a')
      expect(await escolha.locator('button', { hasText: 'P6a' }).innerText()).toContain('Com NC')
      expect(await escolha.locator('button[data-situacao]').filter({ has: p.locator('b', { hasText: /^P6$/ }) }).innerText()).toContain('Pendente')
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/fvs21_${nome}_3_situacao.png` })
      await p.goBack()
      await escolha.waitFor({ state: 'detached' })
      expect(await p.locator('.fv-mapa').count()).toBe(1)
      expect(await painel.count()).toBe(0)
      // Cancelar também
      await tocarNoDesenho()
      await escolha.getByRole('button', { name: 'Cancelar' }).click()
      await escolha.waitFor({ state: 'detached' })
      expect(await painel.count()).toBe(0)

      // com o painel do P6 aberto, escolher o P6a troca o painel; um voltar só fecha
      // enquadro logo depois da busca (no meio do voo) vale: antes, o ajuste do painel no meio do voo
      // agendava uma animação de zoom que engolia o enquadro por uns 250 ms e o toque caía fora (CI do #42)
      for (const atraso of [120, 220]) {
        await p.evaluate(() => (window as any).__fvMapa.setView([-600, 1000], -2, { animate: false }))
        await p.waitForTimeout(300)
        await buscar(p, 'P6')
        await nomeNoPainel(p, 'P6')
        const z = await p.evaluate(async (ms: number) => {
          const m = (window as any).__fvMapa
          await new Promise((ok) => setTimeout(ok, ms))
          m.setView([-150, 1650], 1, { animate: false })
          await new Promise((ok) => setTimeout(ok, 600))
          return m.getZoom()
        }, atraso)
        expect(z).toBe(1)
        await p.locator('.fv-cab button').click()
        await painel.waitFor({ state: 'detached' })
      }
      await buscar(p, 'P6')
      await nomeNoPainel(p, 'P6')
      await tocarNoDesenho()
      await escolha.locator('button[data-situacao]', { hasText: 'P6a' }).click()
      await nomeNoPainel(p, 'P6a')
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/fvs21_${nome}_2_p6a.png` })
      await p.goBack()
      await painel.waitFor({ state: 'detached' })
      expect(await p.locator('.fv-mapa').count()).toBe(1)

      // o nome vai direto à peça, sem perguntar
      await focar()
      await tocarNaPlanta(p, 1685, 190)
      await nomeNoPainel(p, 'P6a')
      expect(await escolha.count()).toBe(0)
      await p.goBack()
      await painel.waitFor({ state: 'detached' })
      // peça sem par: o desenho abre direto, como antes
      await enquadrar(p, [-150, 1350], 1)
      await tocarNaPlanta(p, 1350, 160)
      await nomeNoPainel(p, 'P5')
      expect(await escolha.count()).toBe(0)

      expect(await semRolagemHorizontal(p)).toBe(0)
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: toque na viga fina, junto do pilar, abre a viga (achado do Testador, 09/11)`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0`)
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      const painel = p.getByTestId('fvs-painel')
      // zoom em que a V1 (14 pontos de altura) fica com 3,5 px na tela, como no celular com a folha toda
      const tocarPerto = async (x: number, y: number, dx: number, dy: number) => {
        await p.evaluate(() => void (window as any).__fvMapa.setView([-150, 300], -2, { animate: false }))
        await p.waitForTimeout(200)
        const [tx, ty] = await naTela(p, x, y)
        await p.mouse.click(tx + dx, ty + dy)
      }
      const fechar = async () => {
        await p.locator('.fv-cab button').click()
        await painel.waitFor({ state: 'detached' })
      }

      // em cima da viga, a 2 px da borda do P1 (que fica a menos que a tolerância): antes abria o P1
      await tocarPerto(160, 150, 2, 0)
      await nomeNoPainel(p, 'V1')
      await fechar()
      // no meio do P1, junto da viga: continua abrindo o pilar
      await tocarPerto(150, 150, 0, 0)
      await nomeNoPainel(p, 'P1')
      await fechar()
      // a 12 px do eixo da viga, longe de pilar: a viga tem margem maior (antes não abria nada)
      await tocarPerto(300, 150, 0, 12)
      await nomeNoPainel(p, 'V1')
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/toque_${nome}_viga.png` })
      expect(erros).toEqual([])
      await contexto.close()
    }, 60_000)

    it(`${nome} ${largura}x${altura}: consolo e capitel abrem o pilar na seção da parte; o pilar só fica verde com os itens dela`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&partes=1`)
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      const painel = p.getByTestId('fvs-painel')
      const fechar = async () => {
        await p.locator('.fv-cab button').click()
        await painel.waitFor({ state: 'detached' })
      }
      const consolo = p.getByTestId('fvs-parte-consolo')

      // P8: consolo à direita do pilar. Na faixa só do consolo, abre o P8 com a seção do consolo aberta
      await enquadrar(p, [-450, 470], 1)
      await tocarNaPlanta(p, 495, 467)
      await nomeNoPainel(p, 'P8')
      await consolo.waitFor()
      expect(await consolo.evaluate((d: HTMLDetailsElement) => d.open)).toBe(true)
      expect(await consolo.locator('img').count()).toBe(1)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/partes_${nome}_consolo.png` })
      await fechar()
      // no meio do pilar: abre o pilar, com o consolo fechado
      await enquadrar(p, [-450, 470], 1)
      await tocarNaPlanta(p, 450, 450)
      await nomeNoPainel(p, 'P8')
      await consolo.waitFor()
      expect(await consolo.evaluate((d: HTMLDetailsElement) => d.open)).toBe(false)

      // itens comuns todos C: falta o consolo, não fica verde
      for (const n of [1, 2, 3, 4, 5, 6, 7]) await item(p, n, 'C').click()
      const sit = p.locator('.fv-inf .fv-sit')
      await p.waitForFunction(() => (document.querySelectorAll('.fv-item button[data-r="C"].on').length >= 7))
      expect(await sit.textContent()).not.toBe('Liberado')
      await consolo.locator('summary').click()
      for (const n of [8, 9]) await item(p, n, 'C').click()
      // tudo marcado, sem concretagem cadastrada: azul (achado #2, 24/11)
      await p.waitForFunction(() => document.querySelector('.fv-inf .fv-sit')?.textContent === 'Liberado p/ concretar')
      // o capitel o P8 não tem: o item dele nem aparece
      expect(await p.locator('.fv-item[data-item="10"]').count()).toBe(0)
      // os itens do consolo só existem no app (24/11): o painel diz, e só neles
      const soDoApp = p.getByTestId('fvs-item-so-do-app')
      expect(await soDoApp.count()).toBe(2)
      expect(await p.locator('.fv-item[data-item="8"] [data-testid="fvs-item-so-do-app"]').innerText()).toBe('Só do app (não vai para o Construpoint)')
      expect(await p.locator('.fv-item[data-item="9"] [data-testid="fvs-item-so-do-app"]').count()).toBe(1)
      expect(await p.locator('.fv-item[data-item="1"] [data-testid="fvs-item-so-do-app"]').count()).toBe(0)
      // legível: pelo menos 14 px, como os outros rótulos do painel
      expect(await soDoApp.first().evaluate((e: HTMLElement) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/partes_${nome}_so_do_app.png` })
      await fechar()

      // P9: capitel em volta do pilar
      await enquadrar(p, [-450, 770], 1)
      await tocarNaPlanta(p, 705, 500)
      await nomeNoPainel(p, 'P9')
      const capitel = p.getByTestId('fvs-parte-capitel')
      await capitel.waitFor()
      expect(await capitel.evaluate((d: HTMLDetailsElement) => d.open)).toBe(true)
      expect(await p.getByTestId('fvs-parte-consolo').count()).toBe(0)
      // o item do capitel também é só do app
      expect(await capitel.getByTestId('fvs-item-so-do-app').innerText()).toBe('Só do app (não vai para o Construpoint)')
      await fechar()

      // pilar sem parte: nenhuma seção de parte
      await enquadrar(p, [-150, 170], 1)
      await tocarNaPlanta(p, 150, 150)
      await nomeNoPainel(p, 'P1')
      expect(await p.locator('.fv-parte').count()).toBe(0)
      await fechar()

      // laje por cima do capitel do P9, que segue pendente: a laje vale só pela ficha dela (desde 23/11,
      // pedido do Nicolas; antes ficava com NC até o capitel ser liberado)
      await p.locator('.fv-seg button', { hasText: 'Lajes' }).click()
      await enquadrar(p, [-450, 750], 0)
      await p.getByTestId('fvs-nova-area').click()
      await p.getByTestId('fvs-desenho').waitFor()
      for (const [x, y] of [[650, 370], [850, 370], [850, 560], [650, 560]]) await tocarNaPlanta(p, x, y)
      await p.getByTestId('fvs-concluir-area').click()
      await p.getByTestId('fvs-caixa-nome').fill('Laje do capitel')
      await p.getByTestId('fvs-caixa-criar').click()
      await nomeNoPainel(p, 'Laje do capitel')
      await p.getByTestId('fvs-area-info').waitFor()
      expect(await p.locator('.fv-inf .fv-sit').textContent()).toBe('Pendente')
      expect(await p.getByTestId('fvs-area-travada').count()).toBe(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/partes_${nome}_laje_capitel.png` })
      expect(await semRolagemHorizontal(p)).toBe(0)

      // na lista do que falta lançar, os itens do consolo do P8 dizem que não vão para o Construpoint (24/11)
      await p.locator('.fv-topo .fv-voltar').click()
      await noInicio(p)
      await p.getByTestId('fvs-entra-lancamento').click()
      const doP8 = p.getByTestId('fvs-lan-ficha').filter({ hasText: 'P8' })
      await doP8.waitFor()
      expect(await doP8.getByTestId('fvs-lan-so-do-app').count()).toBe(2)
      const itensDoP8 = await doP8.locator('.fv-lan-item').evaluateAll((l: Element[]) =>
        l.map((e) => [e.querySelector('b')!.textContent!.split('.')[0], !!e.querySelector('[data-testid="fvs-lan-so-do-app"]')]),
      )
      expect(itensDoP8.filter((x: [string, boolean]) => x[1]).map((x: [string, boolean]) => x[0])).toEqual(['8', '9'])
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/partes_${nome}_lancar_so_do_app.png` })

      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: redesenhar o pilar ponto a ponto no fim da ficha; o desenho novo vale no toque e volta ao original`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      p.on('dialog', (d: any) => d.accept())
      await p.goto(`${url}?abrir=0`)
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      const painel = p.getByTestId('fvs-painel')
      const fechar = async () => {
        await p.locator('.fv-cab button').click()
        await painel.waitFor({ state: 'detached' })
      }
      const redesenhos = () =>
        p.evaluate(`(async () => {
          const { sincronizador } = await import('/src/nucleo/servicos.ts')
          const l = await sincronizador.linhas('fvs_redesenhos', '${OBRA}')
          return l.sort((a, b) => (a.criado_em_dispositivo < b.criado_em_dispositivo ? -1 : 1)).map((r) => ({ id: r.id, contorno: r.contorno, substitui_id: r.substitui_id, cancelado: r.cancelado }))
        })()`)

      // P2: pilar em (450, 150), contorno original de 440 a 460 por 125 a 175
      await enquadrar(p, [-150, 450], 1)
      await tocarNaPlanta(p, 450, 150)
      await nomeNoPainel(p, 'P2')
      expect(await p.getByTestId('fvs-redesenhada').count()).toBe(0)
      expect(await p.getByTestId('fvs-voltar-original').count()).toBe(0)
      await p.getByTestId('fvs-redesenhar-peca').click()
      await painel.waitFor({ state: 'detached' })
      const barra = p.getByTestId('fvs-desenho')
      await barra.waitFor()
      expect(await barra.textContent()).toContain('Novo contorno de P2')
      await enquadrar(p, [-150, 470], 1)
      // os cantos, um a mais por engano (desfeito), e o toque no primeiro canto fecha o contorno
      const cantos = (n: number) => p.waitForFunction((k: number) => document.querySelector('[data-testid=fvs-desenho]')?.textContent?.includes(`(${k} cantos)`), n)
      for (const [x, y] of [[430, 110], [520, 110], [520, 190], [430, 190], [480, 230]]) await tocarNaPlanta(p, x, y)
      await cantos(5)
      await p.getByTestId('fvs-desfazer-ponto').click()
      await cantos(4)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/redesenho_${nome}_desenhando.png` })
      await tocarNaPlanta(p, 430, 110)
      await barra.waitFor({ state: 'detached' })
      await nomeNoPainel(p, 'P2')
      await p.getByTestId('fvs-redesenhada').waitFor()
      expect(await p.getByTestId('fvs-redesenho-revisao').count()).toBe(0)
      let linhas = await redesenhos()
      expect(linhas).toHaveLength(1)
      expect(linhas[0].contorno).toEqual([[430, 110], [520, 110], [520, 190], [430, 190]])
      expect(linhas[0].substitui_id).toBeNull()
      if (PRINTS) {
        await p.getByTestId('fvs-redesenho').scrollIntoViewIfNeeded()
        await p.screenshot({ path: `${PRINTS}/redesenho_${nome}_painel.png` })
      }
      await fechar()

      // o toque usa o desenho novo: (500, 185) fica fora do original e de todas as vigas
      await enquadrar(p, [-150, 470], 1)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/redesenho_${nome}_planta.png` })
      await tocarNaPlanta(p, 500, 185)
      await nomeNoPainel(p, 'P2')

      // voltar ao original: linha nova cancelando, apontando para o redesenho (nada se apaga)
      await p.getByTestId('fvs-voltar-original').click()
      await p.getByTestId('fvs-redesenhada').waitFor({ state: 'detached' })
      linhas = await redesenhos()
      expect(linhas).toHaveLength(2)
      expect(linhas[1].cancelado).toBe(true)
      expect(linhas[1].substitui_id).toBe(linhas[0].id)
      expect(await p.getByTestId('fvs-voltar-original').count()).toBe(0)
      await fechar()
      // de volta ao original: o mesmo ponto já não é do P2
      await enquadrar(p, [-150, 470], 1)
      await tocarNaPlanta(p, 500, 185)
      await p.waitForTimeout(400)
      expect(await painel.count()).toBe(0)

      expect(await semRolagemHorizontal(p)).toBe(0)
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    // Achado #6 da lista de campo (24/11): viga com ficha aberta do sistema oficial e o item de furação OK pelos
    // furos ficava laranja: o item ia para "só no app" (outra revisão da ficha) e virava uma ficha à parte.
    it(`${nome} ${largura}x${altura}: furos da viga com ficha aberta: o item vai para a ficha aberta e a viga fica liberada`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&furos=1&furosaberta=1`)
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      const painel = p.getByTestId('fvs-painel')
      const aba = (t: string) => p.locator('.fv-seg button', { hasText: t }).click()
      const aviso = (texto: string) => p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), texto)
      const V1 = 'e1000000-0000-0000-0000-000000000001'
      const FC = 'f8000000-0000-0000-0000-000000000091'
      const sitDaViga = async () => {
        await aba('Vigas')
        await enquadrar(p, [-150, 300], 1)
        await tocarNaPlanta(p, 300, 156)
        await nomeNoPainel(p, 'V1')
        return p.locator('.fv-inf .fv-sit').textContent()
      }
      // itens 1 a 4 aceitos no sistema oficial, o de furação vazio
      expect(await sitDaViga()).toBe('Em andamento')
      await p.locator('.fv-cab button').click()
      await painel.waitFor({ state: 'detached' })
      await aba('Furos')
      for (const [x, n] of [[220, 1], [300, 2], [380, 3]] as const) {
        await enquadrar(p, [-150, x], 2)
        await tocarNaPlanta(p, x, 150)
        await aviso(`V1-F${n}: OK`)
      }
      // o item de furação vai para a ficha aberta da V1, na revisão dela (R0), com o número do item nela
      await expect
        .poll(async () => (await registros(p)).filter((r) => r.el === V1).map((r) => [r.fc, r.ficha, r.item, r.r]))
        .toEqual([[FC, 'f0000000-0000-0000-0000-000000000091', 5, 'C']])
      // rodada 9b do testador (24/11): o painel do furo mostra a ficha em que o item conta (a aberta, R0), não a vigente
      await buscar(p, 'V1-F3')
      await nomeNoPainel(p, 'V1-F3')
      expect(await p.getByTestId('fvs-ficha-do-painel').innerText()).toBe('TESTE-PVS-V · Vigas (ficha de teste) · rev. 0 · ficha FVS-TESTE-0091')
      await p.locator('.fv-cab button').click()
      await painel.waitFor({ state: 'detached' })
      expect(await sitDaViga()).toBe('Liberado p/ concretar') // sem concretagem cadastrada: azul (achado #2)
      // uma ficha só no painel: sem a aba "Marcado só no app"
      expect(await painel.getByText('Marcado só no app').count()).toBe(0)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furos_ficha_aberta_${nome}.png` })
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: furo de viga: o toque alterna OK, errado e sem conferir; os furos marcam o item de furação da ficha da viga`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&furos=1`)
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      expect(await p.locator('.fv-seg button').allTextContents()).toEqual(['Pilares', 'Vigas', 'Lajes', 'Furos'])
      const painel = p.getByTestId('fvs-painel')
      const fechar = async () => {
        await p.locator('.fv-cab button').click()
        await painel.waitFor({ state: 'detached' })
      }
      const aba = (t: string) => p.locator('.fv-seg button', { hasText: t }).click()
      const aviso = (texto: string) => p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), texto)
      const F1 = 'e3000000-0000-0000-0000-000000000001'
      const V1 = 'e1000000-0000-0000-0000-000000000001'
      const ultimo = async (el = F1) => (await registros(p)).filter((r) => r.el === el).at(-1)
      // o item de furação da viga (5 na ficha de teste), que os furos marcam
      const itemDaViga = () => ultimo(V1).then((r) => (r ? { item: r.item, r: r.r, obs: r.obs } : null))
      // furo só aparece de perto (zoom 1,5 ou mais, 20/11): o toque é no zoom 2, com o furo no meio
      const noFuro = async (x: number, y: number) => {
        await enquadrar(p, [-y, x], 2)
        await tocarNaPlanta(p, x, y)
      }
      const sitDaViga = async () => {
        await enquadrar(p, [-150, 300], 1)
        await aba('Vigas')
        await enquadrar(p, [-150, 300], 1)
        await tocarNaPlanta(p, 300, 156)
        await nomeNoPainel(p, 'V1')
        return p.locator('.fv-inf .fv-sit').textContent()
      }

      // fora da aba Furos, o toque em cima do furo abre a viga, com o resumo dos furos dela
      expect(await sitDaViga()).toBe('Pendente')
      expect(await p.getByTestId('fvs-furos-da-viga').locator('h3').textContent()).toBe('Furos: 0 de 3 OK')
      await fechar()

      // aba Furos: sem conferir → OK → errado (o painel abre) → sem conferir
      await aba('Furos')
      // furo não é peça: a conta da aba é de furos OK, não de "liberados" (bug do celular, 18/11)
      expect(await p.getByTestId('fvs-progresso').innerText()).toBe('0/3 OK')
      expect(await p.getByTestId('fvs-progresso').getAttribute('title')).toBe('0 de 3 furos OK')
      // longe (zoom abaixo de 1,5), os furos de viga somem; sem área de laje desenhada, ficam num número
      // por quadrado de 6 m de obra (20/11; 340 pontos na 1:50, a linha x = 340 separa V1-F3 dos outros
      // dois); o toque no número aproxima até eles
      await enquadrar(p, [-150, 300], 0)
      const numero = p.getByTestId('fvs-numero-furos')
      await numero.first().waitFor()
      expect(await numero.allTextContents()).toEqual(['2 furos', '1 furo'])
      for (const b of await numero.all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furos_${nome}_numero.png` })
      await numero.first().click()
      await numero.first().waitFor({ state: 'detached' })
      expect(await p.evaluate(() => (window as any).__fvMapa.getZoom())).toBeGreaterThanOrEqual(1.5)
      await noFuro(220, 150)
      await aviso('V1-F1: OK')
      // o furo grava no item de furação da ficha da viga (sem ficha própria)
      expect(await ultimo()).toMatchObject({ el: F1, ficha: 'f0000000-0000-0000-0000-000000000002', item: 5, r: 'C', rod: 1 })
      // um furo OK e dois sem conferir: o item da viga continua pendente (nada gravado nela)
      expect(await itemDaViga()).toBe(null)
      await noFuro(220, 150)
      // 2º toque (testador no tablet, 21/11): a caixa do NC, igual à do ponto e da barra; nada gravado ainda
      const caixaNc = p.getByTestId('fvs-nc-furo')
      await caixaNc.waitFor()
      expect(await caixaNc.innerText()).toContain('O NC só é gravado depois de Confirmar')
      expect(await caixaNc.getByRole('button').allTextContents()).toEqual(['Confirmar', 'Desmarcar', 'Cancelar'])
      expect(await ultimo()).toMatchObject({ el: F1, r: 'C' })
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furo_viga_${nome}_caixa_nc.png` })
      await p.getByTestId('fvs-nc-furo-cancelar').click()
      await caixaNc.waitFor({ state: 'detached' })
      expect(await ultimo()).toMatchObject({ el: F1, r: 'C' })
      await noFuro(220, 150)
      await p.getByTestId('fvs-nc-furo-texto').fill('furo deslocado')
      await p.getByTestId('fvs-nc-furo-confirmar').click()
      await aviso('V1-F1: errado')
      await nomeNoPainel(p, 'V1-F1')
      expect(await ultimo()).toMatchObject({ el: F1, r: 'NC' })
      await expect.poll(itemDaViga).toEqual({ item: 5, r: 'NC', obs: 'Furo errado: V1-F1' })
      expect(await p.getByTestId('fvs-furo-info').textContent()).toContain('Sanitário')
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furos_${nome}_errado.png` })
      // do furo para a viga: furo errado reprova a viga, mesmo sem nada marcado nela
      await p.getByTestId('fvs-ir-viga').click()
      await nomeNoPainel(p, 'V1')
      expect(await p.locator('.fv-inf .fv-sit').textContent()).toBe('Com NC')
      expect(await p.getByTestId('fvs-furos-da-viga').locator('h3').textContent()).toBe('Furos: 0 de 3 OK, 1 errado')
      await fechar()
      await aba('Furos')
      await noFuro(220, 150)
      await aviso('V1-F1: sem conferir')
      expect((await ultimo())?.r).toBe(null)
      await expect.poll(() => itemDaViga().then((i) => i?.r)).toBe(null)
      // Desfazer volta ao errado
      await p.getByTestId('fvs-desfazer').click()
      await aviso('Desfeito: V1-F1')
      expect(await ultimo()).toMatchObject({ el: F1, r: 'NC' })
      await expect.poll(() => itemDaViga().then((i) => i?.r)).toBe('NC')

      // corrigido: errado → sem conferir → OK; os três OK
      await noFuro(220, 150)
      await aviso('V1-F1: sem conferir')
      await noFuro(220, 150)
      await aviso('V1-F1: OK')
      await noFuro(300, 150)
      await aviso('V1-F2: OK')

      // viga com os outros itens C e um furo sem conferir: o item de furação fica pendente, não fica verde
      await expect.poll(() => itemDaViga().then((i) => i?.r)).toBe(null)
      await sitDaViga()
      for (const n of [1, 2, 3, 4]) await item(p, n, 'C').click()
      await p.waitForFunction(() => document.querySelectorAll('.fv-item button[data-r="C"].on').length >= 4)
      expect(await p.locator('.fv-inf .fv-sit').textContent()).toBe('Em andamento')
      // na viga com furos, o item de furação não se marca à mão: quem manda são os furos
      expect(await p.locator('.fv-item[data-item="5"] button[data-r]').count()).toBe(0)
      expect(await p.getByTestId('fvs-item-pelos-furos').textContent()).toContain('2 de 3 OK')
      expect(await p.getByTestId('fvs-furos-da-viga').locator('h3').textContent()).toBe('Furos: 2 de 3 OK')
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furos_${nome}_viga.png` })
      // o chip do F3 leva ao furo; com ele OK, a viga fica liberada
      await p.getByTestId('fvs-furos-da-viga').getByRole('button', { name: /^V1-F3/ }).click()
      await nomeNoPainel(p, 'V1-F3')
      await fechar()
      await noFuro(380, 150)
      await aviso('V1-F3: OK')
      await expect.poll(itemDaViga).toMatchObject({ item: 5, r: 'C' })
      expect(await sitDaViga()).toBe('Liberado p/ concretar') // sem concretagem cadastrada: azul (achado #2)
      expect(await semRolagemHorizontal(p)).toBe(0)

      // a busca do início mostra o furo como a planta (bug do celular, 18/11: aparecia "Pendente")
      await fechar()
      await p.locator('.fv-topo .fv-voltar').click()
      await noInicio(p)
      await p.getByTestId('fvs-busca-obra').fill('V1-F1')
      const linhaDoFuro = p.getByTestId('fvs-busca-linha').first()
      await linhaDoFuro.waitFor()
      expect(await linhaDoFuro.locator('b').textContent()).toBe('V1-F1')
      expect(await linhaDoFuro.locator('.fv-sit').textContent()).toBe('Liberado')
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: furos de laje: ligados à área desenhada; esgoto e água marcam o item da área, elétrica só NC e pergunta no C`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const dialogos: string[] = []
      let aceitar = false
      p.on('dialog', (d: any) => {
        dialogos.push(d.message())
        void (aceitar ? d.accept() : d.dismiss())
      })
      await p.goto(`${url}?abrir=0&furoslaje=1`)
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      expect(await p.locator('.fv-seg button').allTextContents()).toEqual(['Pilares', 'Vigas', 'Lajes', 'Furos'])
      const painel = p.getByTestId('fvs-painel')
      const fechar = async () => {
        await p.locator('.fv-cab button').click()
        await painel.waitFor({ state: 'detached' })
      }
      const aba = (t: string) => p.locator('.fv-seg button', { hasText: t }).click()
      const aviso = (texto: string) => p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), texto)
      // o item da ficha de laje de teste gravado na área (6 esgoto, 7 água, 8 elétrica)
      const itemDaArea = (n: number) =>
        p.evaluate(`(async () => {
          const { sincronizador } = await import('/src/nucleo/servicos.ts')
          const l = (await sincronizador.linhas('fvs_eventos', '${OBRA}')).filter((e) => e.area_id && e.item === ${n})
          l.sort((a, b) => (a.criado_em_dispositivo < b.criado_em_dispositivo ? -1 : a.criado_em_dispositivo > b.criado_em_dispositivo ? 1 : a.id < b.id ? -1 : 1))
          const u = l.at(-1)
          return u ? { r: u.resultado, obs: u.observacao } : null
        })()`)
      // furo de laje só aparece de perto (zoom 1,5 ou mais, 20/11): o toque é no zoom 2, com o furo no meio
      const furo = async (x: number, y: number) => {
        await enquadrar(p, [-y, x], 2)
        await tocarNaPlanta(p, x, y)
      }
      const progresso = () => p.getByTestId('fvs-progresso').innerText()

      // celular: Pincel e Por item com 14 px; as quatro abas não cabem, e a borda do lado em que a fila
      // continua esmaece (revisão da 06, 20/11: "Pilares" aparecia como "ares", sem sinal de mais abas)
      const fila = () => p.locator('.fv-seg').evaluate((s: HTMLElement) => ({ esq: s.classList.contains('mais-esq'), dir: s.classList.contains('mais-dir'), cabe: s.scrollWidth <= s.clientWidth }))
      expect(await p.locator('.fv-bpincel, .fv-bitem').evaluateAll((l: Element[]) => l.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 14).map((e) => e.textContent))).toEqual([])
      const filaNoInicio = await fila()
      if (filaNoInicio.cabe) expect(filaNoInicio).toEqual({ esq: false, dir: false, cabe: true })
      else expect(filaNoInicio).toEqual({ esq: false, dir: true, cabe: false })

      // antes da área (21/11, "furos esgoto/água não funcionando"): o furo de laje fora de área já grava, no
      // próprio furo, na ficha de laje que tem o item da instalação dele; contam FL1 a FL5 (FL6, de Geral, nunca)
      await aba('Furos')
      if (!filaNoInicio.cabe) await expect.poll(fila).toEqual({ esq: true, dir: false, cabe: false })
      expect(await progresso()).toBe('0/5 OK')
      // FL4 e FL5 a 8 pontos um do outro (32 px no zoom 2): o toque entre os dois pega os dois alvos e
      // pergunta qual (20/11)
      await furo(604, 400)
      const qual = p.getByTestId('fvs-escolha-furo')
      await qual.waitFor()
      expect(await qual.locator('.fv-escolha-pecas button b').allTextContents()).toEqual(['FL4', 'FL5'])
      expect(await qual.locator('.fv-escolha-pecas button').evaluateAll((l: Element[]) => l.every((b) => b.getBoundingClientRect().height >= 44))).toBe(true)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furos_laje_${nome}_qual_furo.png` })
      const escolherFL4 = async () => {
        await qual.waitFor()
        await qual.locator('.fv-escolha-pecas button', { hasText: 'FL4' }).click()
        await qual.waitFor({ state: 'detached' })
      }
      await escolherFL4()
      await aviso('FL4: OK')
      await expect.poll(progresso).toBe('1/5 OK')
      // o aviso quebra linha em vez de cortar o fim, e cabe na tela
      const avisoCabe = await p.locator('.fv-toast').evaluate((t: HTMLElement) => {
        const s = t.querySelector('span')!
        return s.scrollWidth <= s.clientWidth + 1 && s.scrollHeight <= s.clientHeight + 1 && t.getBoundingClientRect().right <= innerWidth + 0.5
      })
      expect(avisoCabe).toBe(true)
      // 2º toque: errado; o painel abre e diz onde ficou o registro
      await tocarNaPlanta(p, 604, 400)
      await escolherFL4()
      await p.getByTestId('fvs-nc-furo-texto').fill('furo deslocado')
      await p.getByTestId('fvs-nc-furo-confirmar').click()
      await aviso('FL4: errado')
      await nomeNoPainel(p, 'FL4')
      expect(await p.getByTestId('fvs-furo-fora-area').textContent()).toContain('o registro fica no furo')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await fechar()
      // 3º toque: sem conferir
      await furo(604, 400)
      await escolherFL4()
      await aviso('FL4: sem conferir')
      await expect.poll(progresso).toBe('0/5 OK')

      // área de laje no vão de P8, P9, P14 e P15: pega FL1 (esgoto), FL2 (água) e FL3 (elétrica)
      await aba('Lajes')
      await enquadrar(p, [-600, 600], 0)
      await p.getByTestId('fvs-nova-area').click()
      await p.getByTestId('fvs-desenho').waitFor()
      for (const [x, y] of [[470, 470], [730, 470], [730, 730], [470, 730]]) await tocarNaPlanta(p, x, y)
      await p.getByTestId('fvs-concluir-area').click()
      await p.getByTestId('fvs-caixa-nome').fill('Laje dos furos')
      await p.getByTestId('fvs-caixa-criar').click()
      await nomeNoPainel(p, 'Laje dos furos')
      // esgoto e água: sem botões, quem marca são os furos; elétrica: botões, com o resumo das passagens
      expect(await p.locator('.fv-item[data-item="6"] button[data-r]').count()).toBe(0)
      expect(await p.locator('.fv-item[data-item="7"] button[data-r]').count()).toBe(0)
      expect(await p.locator('.fv-item[data-item="6"]').getByTestId('fvs-item-pelos-furos-laje').textContent()).toContain('0 de 1 OK')
      expect(await p.locator('.fv-item[data-item="8"] button[data-r]').count()).toBe(3)
      expect(await p.getByTestId('fvs-item-eletrica-furos').textContent()).toContain('0 de 1 OK')
      expect(await p.locator('.fv-etapa-tit', { hasText: 'INSTALAÇÕES' }).getByRole('button').textContent()).toBe('Etapa C (1)')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furos_laje_${nome}_area.png` })
      await fechar()

      // longe (zoom 0): no lugar dos furos, o número da área (FL1, FL2 e FL3; FL6 de Geral fica de fora) e o
      // do quadrado de FL4 e FL5 (fora de área); a conta da aba é dos 5; o toque no número aproxima até os furos
      await aba('Furos')
      await enquadrar(p, [-600, 600], 0)
      const numero = p.getByTestId('fvs-numero-furos')
      await numero.first().waitFor()
      expect((await numero.allTextContents()).sort()).toEqual(['2 furos', '3 furos'])
      expect(await progresso()).toBe('0/5 OK')
      const daArea = numero.filter({ hasText: '3 furos' })
      const caixaDoNumero = await daArea.boundingBox()
      expect(caixaDoNumero!.height).toBeGreaterThanOrEqual(44)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furos_laje_${nome}_numero.png` })
      await daArea.click()
      await daArea.waitFor({ state: 'detached' })
      expect(await p.evaluate(() => (window as any).__fvMapa.getZoom())).toBeGreaterThanOrEqual(1.5)

      // FL1 (esgoto) OK: o item 6 da área fica C
      await aba('Furos')
      await furo(520, 520)
      await aviso('FL1: OK')
      await expect.poll(() => itemDaArea(6), { timeout: 5000 }).toEqual({ r: 'C', obs: null })
      // FL3 (elétrica): OK e depois errado: o item 8 fica NC sozinho, com o furo na observação
      await furo(680, 560)
      await aviso('FL3: OK')
      expect(await itemDaArea(8)).toBeNull() // o C da elétrica nunca é dos furos
      await furo(680, 560)
      await p.getByTestId('fvs-nc-furo-texto').fill('furo deslocado')
      await p.getByTestId('fvs-nc-furo-confirmar').click()
      await aviso('FL3: errado')
      await nomeNoPainel(p, 'FL3')
      expect(await p.getByTestId('fvs-ir-area').textContent()).toBe('Ver a área Laje dos furos')
      await expect.poll(() => itemDaArea(8), { timeout: 5000 }).toEqual({ r: 'NC', obs: 'Furo errado: FL3' })
      await fechar()
      // FL3 de novo: sem conferir; o NC dos furos volta a pendente
      await furo(680, 560)
      await aviso('FL3: sem conferir')
      await expect.poll(() => itemDaArea(8), { timeout: 5000 }).toEqual({ r: null, obs: null })

      // C à mão na elétrica com passagem sem conferir: pergunta; Cancelar não grava, OK grava
      await aba('Lajes')
      await enquadrar(p, [-600, 600], 0)
      await tocarNaPlanta(p, 700, 700)
      await nomeNoPainel(p, 'Laje dos furos')
      await p.locator('.fv-item[data-item="8"] button[data-r="C"]').click()
      await expect.poll(() => dialogos.length).toBe(1)
      expect(dialogos[0]).toBe('1 passagem elétrica ainda sem conferir. Marcar C mesmo assim?')
      expect((await itemDaArea(8))?.r ?? null).toBeNull()
      aceitar = true
      await p.locator('.fv-item[data-item="8"] button[data-r="C"]').click()
      await expect.poll(() => itemDaArea(8).then((x: any) => x?.r), { timeout: 5000 }).toBe('C')
      expect(await contrasteNosDoisTemas(p), 'contraste do painel da área').toEqual([])
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: instalações: hidráulica, esgoto, elétrico, preventivo e SPDA abrem cada uma na aba Pontos e gravam no item da disciplina`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&instalacoes=1`)
      await noInicio(p)
      // nível 2: as cinco na ordem do menu, e a ficha de instalações "por ambiente" (não em Acabamentos)
      const cartao = (d: string) => p.locator(`[data-testid=fvs-disciplina][data-disciplina=${d}]`)
      await p.getByTestId('fvs-pavimento').first().click()
      await cartao('instalacoes').waitFor()
      expect((await cartao('instalacoes').innerText()).replace(/\s+/g, ' ')).toContain('Hidráulica, Esgoto, Elétrico, Preventivo contra incêndio, SPDA, por ambiente')
      expect(await cartao('acabamentos').innerText()).not.toContain('Instalações (ficha de teste)')
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/instalacoes_${nome}_pavimento.png`, fullPage: true })
      await noInicio(p)
      await naDisciplina(p, 'instalacoes')
      const secoes = p.getByTestId('fvs-secao-outra')
      expect(await secoes.locator('h3').allTextContents()).toEqual(['Hidráulica', 'Esgoto', 'Elétrico', 'Preventivo contra incêndio', 'SPDA'])
      // a de ficha conta "x de y OK"; o preventivo (sem ficha) diz que é só consulta (rodada 9, 24/11)
      const linhaDa = (s: string) => secoes.filter({ has: p.locator('h3', { hasText: new RegExp(`^${s}$`) }) }).getByRole('button').first()
      await expect.poll(() => linhaDa('Hidráulica').innerText()).toContain('0 de 4 pontos OK')
      expect(await linhaDa('Preventivo contra incêndio').innerText()).toContain('6 pontos · só consulta')
      expect(await linhaDa('Hidráulica').innerText()).not.toContain('só consulta')
      expect(await p.getByTestId('fvs-ambientes-instalacoes').getByTestId('fvs-opcao-ambiente').allInnerTexts()).toEqual([expect.stringContaining('Instalações (ficha de teste)')])
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/instalacoes_${nome}_menu.png`, fullPage: true })

      // [seção, disciplina, ponto 1, quantos pontos, item da ficha (null: planta de consulta, sem ficha)]
      const disciplinas = [
        ['Hidráulica', 'hidro', 'PONTO_AGUA 1 (ponto de água)', 4, 1],
        ['Esgoto', 'sanitario', 'RALO 1 (ralo)', 4, 2],
        ['Elétrico', 'eletrico', 'CAIXA_PASSAGEM 1 (caixa de passagem)', 5, 3],
        ['Preventivo contra incêndio', 'preventivo', 'HIDRANTE 1 (hidrante)', 6, null],
        ['SPDA', 'spda', 'CAPTOR 1 (captor)', 6, 4],
      ] as const
      for (const [i, [secao, d, nomeDoPonto, total, item]] of disciplinas.entries()) {
        await naDisciplina(p, 'instalacoes')
        await secoes.filter({ has: p.locator('h3', { hasText: new RegExp(`^${secao}$`) }) }).getByRole('button').first().click()
        await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
        // uma aba só (Pontos), sem a fila de abas; o progresso conta os pontos da disciplina
        expect(await p.locator('.fv-seg button').allTextContents()).toEqual([])
        const y = 200 + 150 * i
        if (item === null) {
          // planta de consulta (PPCI): o topo diz, o toque só mostra o ponto e nada grava
          await expect.poll(() => p.getByTestId('fvs-progresso').innerText()).toBe('Só consulta')
          await enquadrar(p, [-y, 300], 2)
          await tocarNaPlanta(p, 300, y)
          await p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), `${nomeDoPonto} · só consulta`)
          await p.waitForTimeout(500)
          // a placa sobre o extintor (sessão 6, 25/11): nem de perto se separam; o toque diz os dois
          await enquadrar(p, [-y, 600], 3)
          await tocarNaPlanta(p, 600, y)
          await p.waitForFunction(
            (t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t),
            'No mesmo lugar: EXTINTOR 2 (extintor) + Placa de extintor (sinalização) · só consulta',
          )
          expect((await registros(p)).filter((r) => r.barra?.startsWith(`pt-${d}-`))).toEqual([])
          if (PRINTS) await p.screenshot({ path: `${PRINTS}/instalacoes_${nome}_${d}.png` })
          await p.locator('.fv-topo .fv-voltar').click()
          await noInicio(p)
          continue
        }
        await expect.poll(() => p.getByTestId('fvs-progresso').innerText()).toBe(`0/${total} OK`)
        await enquadrar(p, [-y, 300], 2)
        await tocarNaPlanta(p, 300, y)
        await p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), `${nomeDoPonto}: OK`)
        await expect.poll(() => registros(p).then((rs) => rs.filter((r) => r.barra === `pt-${d}-1`).map((r) => [r.item, r.r]))).toEqual([[item, 'C']])
        await expect.poll(() => p.getByTestId('fvs-progresso').innerText()).toBe(`1/${total} OK`)
        if (d === 'hidro') {
          // "Desmarcar" (bug do testador, 21/11): o 2º toque abre a caixa; Desmarcar grava registro vazio, sem NC
          await tocarNaPlanta(p, 300, y)
          await p.getByTestId('fvs-nc-ponto-desmarcar').click()
          await p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), `${nomeDoPonto}: sem conferir`)
          await expect.poll(() => registros(p).then((rs) => rs.filter((r) => r.barra === `pt-${d}-1`).map((r) => [r.item, r.r]))).toEqual([[item, 'C'], [item, null]])
          await expect.poll(() => p.getByTestId('fvs-progresso').innerText()).toBe(`0/${total} OK`)
          expect(await p.getByTestId('fvs-nc-ponto').count()).toBe(0)
        }
        // a linha (eletroduto, tubulação de incêndio) também se toca, no meio dela
        if (d === 'eletrico') {
          await enquadrar(p, [-(y + 60), 750], 2)
          await tocarNaPlanta(p, 750, y + 60)
          await p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), '(eletroduto): OK')
        }
        expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
        if (PRINTS) await p.screenshot({ path: `${PRINTS}/instalacoes_${nome}_${d}.png` })
        await p.locator('.fv-topo .fv-voltar').click()
        await noInicio(p)
      }
      expect(erros).toEqual([])
      await contexto.close()
    }, 180_000)

    it(`${nome} ${largura}x${altura}: elétrico sem item de ambiente volta para a ficha de laje (25/11)`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&instalacoes=1&redes=1&furoslaje=1&laje=1`)
      await noInicio(p)
      const aviso = (texto: string) => p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), texto)
      const progresso = () => p.getByTestId('fvs-progresso').innerText()
      const doPonto = (id: string) => registros(p).then((rs) => rs.filter((r) => r.barra === id).map((r) => [r.ficha, r.item, r.r]))
      const F = (n: number) => `f0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
      await naDisciplina(p, 'instalacoes')
      await p.getByTestId('fvs-secao-outra').filter({ has: p.locator('h3', { hasText: /^Elétrico$/ }) }).getByRole('button').first().click()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      // 5 da laje (caixa de passagem, 2 pontos de luz, quadro, eletroduto) e 3 caixas de parede
      await expect.poll(progresso).toBe('0/8 OK')
      await enquadrar(p, [-500, 300], 2)
      await tocarNaPlanta(p, 300, 500)
      await aviso('CAIXA_PASSAGEM 1 (caixa de passagem): OK')
      await expect.poll(() => doPonto('pt-eletrico-1')).toEqual([[F(9), 8, 'C']])
      await enquadrar(p, [-500, 600], 2)
      await tocarNaPlanta(p, 600, 500)
      await aviso('PONTO_LUZ 2 (ponto de luz): OK')
      await expect.poll(() => doPonto('pt-eletrico-2')).toEqual([[F(9), 8, 'C']])
      await expect.poll(progresso).toBe('2/8 OK')
      // a caixa de parede segue nas fichas de ambiente (pergunta alvenaria ou drywall)
      await enquadrar(p, [-610, 450], 2)
      await tocarNaPlanta(p, 450, 610)
      await p.getByTestId('fvs-escolha-ficha').waitFor()
      expect((await p.getByTestId('fvs-escolha-ficha-opcao').allInnerTexts()).join(' ')).not.toContain('Laje')
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/eletrico_laje_${nome}.png` })
      await p.getByTestId('fvs-escolha-ficha-cancelar').click()
      // no 101-02, nenhuma ficha de elétrica vale (&laje=1): a caixa de parede de lá vai para a laje, sem perguntar
      await enquadrar(p, [-610, 750], 2)
      await tocarNaPlanta(p, 750, 610)
      await aviso('Caixa 4x2 (caixa de parede): OK')
      await expect.poll(() => doPonto('pt-eletrico-cp3')).toEqual([[F(9), 8, 'C']])
      expect(await p.getByTestId('fvs-escolha-ficha').count()).toBe(0)
      expect(erros).toEqual([])
      await contexto.close()
    })

    it(`${nome} ${largura}x${altura}: 5.1 a 5.3: tubo e coluna na ficha de redes, caixa de parede pergunta alvenaria ou drywall uma vez por ambiente`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&instalacoes=1&redes=1`)
      await noInicio(p)
      const aviso = (texto: string) => p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), texto)
      const progresso = () => p.getByTestId('fvs-progresso').innerText()
      const doPonto = (id: string) => registros(p).then((rs) => rs.filter((r) => r.barra === id).map((r) => [r.ficha, r.item, r.r]))
      const secao = (s: string) => p.getByTestId('fvs-secao-outra').filter({ has: p.locator('h3', { hasText: new RegExp(`^${s}$`) }) })
      const F = (n: number) => `f0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
      // hidráulica: 4 pontos na ficha de teste, tubo e coluna na de redes (item 10): 6 contam
      await naDisciplina(p, 'instalacoes')
      await secao('Hidráulica').getByRole('button').first().click()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await expect.poll(progresso).toBe('0/6 OK')
      await enquadrar(p, [-260, 750], 2)
      await tocarNaPlanta(p, 750, 260)
      await aviso('Tubo 25 mm (tubo): OK')
      await expect.poll(() => doPonto('pt-hidro-tubo')).toEqual([[F(51), 10, 'C']])
      await enquadrar(p, [-260, 1200], 2)
      await tocarNaPlanta(p, 1200, 260)
      await aviso('AF-1 (coluna (prumada)): OK')
      await expect.poll(() => doPonto('pt-hidro-coluna')).toEqual([[F(51), 10, 'C']])
      // o ponto de água segue no item 1 da ficha de teste
      await enquadrar(p, [-200, 300], 2)
      await tocarNaPlanta(p, 300, 200)
      await aviso('PONTO_AGUA 1 (ponto de água): OK')
      await expect.poll(() => doPonto('pt-hidro-1')).toEqual([[F(20), 1, 'C']])
      await expect.poll(progresso).toBe('3/6 OK')
      await p.locator('.fv-topo .fv-voltar').click()
      await noInicio(p)

      // elétrico: 5 da ficha de teste (com o eletroduto) e 3 caixas de parede
      await naDisciplina(p, 'instalacoes')
      await secao('Elétrico').getByRole('button').first().click()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await expect.poll(progresso).toBe('0/8 OK')
      const y = 610
      // antes, um ponto da ficha de teste: o aviso dele (com Desfazer) fica 5 s embaixo da tela
      await enquadrar(p, [-500, 300], 2)
      await tocarNaPlanta(p, 300, 500)
      await aviso('CAIXA_PASSAGEM 1 (caixa de passagem): OK')
      // 1ª caixa do 101-01: pergunta qual ficha (com o nome do ambiente, não o id); Cancelar não grava
      await enquadrar(p, [-y, 450], 2)
      await tocarNaPlanta(p, 450, y)
      await p.getByTestId('fvs-escolha-ficha').waitFor()
      // o aviso de antes não cobre as opções (teste de desempenho de 24/11: no celular o dedo caía no Desfazer)
      expect(await p.locator('.fv-toast').count()).toBe(0)
      for (const o of await p.getByTestId('fvs-escolha-ficha-opcao').all()) {
        expect(await o.evaluate((e: Element) => { const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) })).toBe(true)
      }
      expect((await p.getByTestId('fvs-escolha-ficha').innerText()).replace(/\s+/g, ' ')).toContain('Qual ficha? · 101-01')
      await p.getByTestId('fvs-escolha-ficha-cancelar').click()
      await p.waitForTimeout(400)
      expect(await doPonto('pt-eletrico-cp1')).toEqual([])
      // de novo: escolhe alvenaria (item 4)
      await tocarNaPlanta(p, 450, y)
      await p.getByTestId('fvs-escolha-ficha').waitFor()
      expect(await p.getByTestId('fvs-escolha-ficha-opcao').allInnerTexts()).toEqual(['Elétrica em alvenaria (teste)', 'Elétrica em drywall (teste)'])
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/redes_${nome}_qual_ficha.png` })
      await p.getByTestId('fvs-escolha-ficha-opcao').first().click()
      await aviso('Caixa 4x2 (caixa de parede): OK')
      await expect.poll(() => doPonto('pt-eletrico-cp1')).toEqual([[F(52), 4, 'C']])
      expect(await p.getByTestId('fvs-escolha-ficha').count()).toBe(0)
      // 2º toque na mesma caixa: a caixa do NC, sem perguntar de novo (a ficha é a do registro)
      await tocarNaPlanta(p, 450, y)
      await p.getByTestId('fvs-nc-ponto').waitFor()
      expect(await p.getByTestId('fvs-escolha-ficha').count()).toBe(0)
      await p.getByTestId('fvs-nc-ponto-texto').fill('Caixa baixa')
      await p.getByTestId('fvs-nc-ponto-confirmar').click()
      await expect.poll(() => doPonto('pt-eletrico-cp1')).toEqual([[F(52), 4, 'C'], [F(52), 4, 'NC']])
      // outra caixa do mesmo ambiente: sem pergunta, na alvenaria
      await enquadrar(p, [-y, 1050], 2)
      await tocarNaPlanta(p, 1050, y)
      await aviso('Caixa 4x2 (caixa de parede): OK')
      await expect.poll(() => doPonto('pt-eletrico-cp2')).toEqual([[F(52), 4, 'C']])
      // caixa do 101-02, onde o drywall não vale (sem_fichas da planta de ambientes): sem pergunta, na alvenaria
      await enquadrar(p, [-y, 750], 2)
      await tocarNaPlanta(p, 750, y)
      await aviso('Caixa 4x2 (caixa de parede): OK')
      expect(await p.getByTestId('fvs-escolha-ficha').count()).toBe(0)
      await expect.poll(() => doPonto('pt-eletrico-cp3')).toEqual([[F(52), 4, 'C']])
      await expect.poll(progresso).toBe('3/8 OK · 1 errada')
      expect(erros).toEqual([])
      await contexto.close()
    }, 150_000)

    it(`${nome} ${largura}x${altura}: SPDA igual aos furos: filtro por tipo, toque OK, 2º toque NC, "+ Área" e o avanço no menu`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&instalacoes=1`)
      await noInicio(p)
      const aviso = (texto: string) => p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), texto)
      const progresso = () => p.getByTestId('fvs-progresso').innerText()
      const doPonto = (id: string) => registros(p).then((rs) => rs.filter((r) => r.barra === id).map((r) => r.r))
      const secaoSpda = () => p.getByTestId('fvs-secao-outra').filter({ has: p.locator('h3', { hasText: /^SPDA$/ }) })
      const y = 800
      // ícones (22/11, "so as lajes tem icones, bota um icone para cada"): cada botão do menu tem o dele
      const semIcone = () => p.locator('button.fv-bt-armadura:not(:has(svg.fv-bt-icone))').count()
      await p.getByTestId('fvs-pavimento').first().click()
      await p.getByTestId('fvs-disciplina').first().waitFor()
      expect(await semIcone()).toBe(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/icones_${nome}_pavimento.png`, fullPage: true })
      await noInicio(p)
      await naDisciplina(p, 'instalacoes')
      expect(await semIcone()).toBe(0)
      expect(await p.locator('[data-testid=fvs-opcoes] svg.fv-bt-icone').evaluateAll((s: Element[]) => s.map((e) => e.getAttribute('data-icone')))).toEqual(['hidro', 'sanitario', 'eletrico', 'preventivo', 'spda', 'instalacoes'])
      // uma entrada só de SPDA, com o avanço lido do pacote
      expect(await secaoSpda().getByRole('button').count()).toBe(1)
      await expect.poll(() => secaoSpda().innerText().then((t: string) => t.replace(/\s+/g, ' '))).toContain('0 de 6 pontos OK')
      await secaoSpda().getByRole('button').first().click()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await expect.poll(progresso).toBe('0/6 OK')
      // filtro por tipo de ponto, com a contagem; o tipo escolhido conta e aparece sozinho
      const filtro = p.getByTestId('fvs-filtro-pontos')
      expect(await filtro.locator('option').allTextContents()).toEqual(['Todos (6)', 'Captor (2)', 'Descida (1)', 'Caixa de inspeção (1)', 'Haste de aterramento (1)', 'Conector de aterramento (1)'])
      expect(await filtro.isVisible()).toBe(true)
      const noMapa = () =>
        p.evaluate(() => {
          let n = 0
          ;(window as any).__fvMapa.eachLayer((l: any) => void (l.getRadius && l.options.radius === 7 && n++))
          return n
        })
      expect(await noMapa()).toBe(6)
      await filtro.selectOption('captor')
      await expect.poll(progresso).toBe('0/2 OK')
      // os pontos fora do filtro saem do mapa
      await expect.poll(noMapa).toBe(2)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/spda_${nome}_filtro.png` })
      // toque = OK
      await enquadrar(p, [-y, 300], 2)
      await tocarNaPlanta(p, 300, y)
      await aviso('CAPTOR 1 (captor): OK')
      await expect.poll(() => doPonto('pt-spda-1')).toEqual(['C'])
      await expect.poll(progresso).toBe('1/2 OK')
      // 2º toque = a caixa do NC: Confirmar (com texto), Desmarcar e Cancelar
      await tocarNaPlanta(p, 300, y)
      await p.getByTestId('fvs-nc-ponto').waitFor()
      for (const b of ['fvs-nc-ponto-confirmar', 'fvs-nc-ponto-desmarcar', 'fvs-nc-ponto-cancelar']) expect(await p.getByTestId(b).count()).toBe(1)
      expect(await p.getByTestId('fvs-nc-ponto-confirmar').isDisabled()).toBe(true)
      await p.getByTestId('fvs-nc-ponto-texto').fill('Captor solto')
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/spda_${nome}_nc.png` })
      await p.getByTestId('fvs-nc-ponto-confirmar').click()
      await expect.poll(() => doPonto('pt-spda-1')).toEqual(['C', 'NC'])
      expect(await p.getByTestId('fvs-nc-ponto').count()).toBe(0)
      // "+ Área" com o filtro Captor: só o CAPTOR 5 (o 1 já está conferido; a descida fica fora do filtro)
      const desenhar = async () => {
        await p.getByTestId('fvs-area-pontos').click()
        await p.getByTestId('fvs-desenho').waitFor()
        expect(await p.getByTestId('fvs-desenho').innerText()).toContain('Área dos pontos')
        await enquadrar(p, [-(y + 30), 650], -2)
        expect(await p.evaluate(() => (window as any).__fvMapa.dragging.enabled())).toBe(true)
        for (const [x, yy] of [[250, y - 40], [1100, y - 40], [1100, y + 100], [250, y + 100]]) await tocarNaPlanta(p, x, yy)
        await p.getByTestId('fvs-concluir-area').click()
        await p.getByTestId('fvs-selecao-furos').waitFor()
      }
      await desenhar()
      expect((await p.getByTestId('fvs-selecao-furos').innerText()).replace(/\s+/g, ' ')).toContain('1 ponto sem conferir nesta área (de 2) · Captor')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/spda_${nome}_selecao.png` })
      await p.getByTestId('fvs-selecao-confirmar').click()
      await aviso('1 ponto OK nesta área')
      await expect.poll(() => doPonto('pt-spda-5')).toEqual(['C'])
      // todos os tipos: a mesma área pega a descida, a caixa e o conector (a haste, em x = 1200, fica fora)
      await filtro.selectOption('todos')
      await desenhar()
      expect((await p.getByTestId('fvs-selecao-furos').innerText()).replace(/\s+/g, ' ')).toContain('3 pontos sem conferir nesta área (de 5)')
      await p.getByTestId('fvs-selecao-confirmar').click()
      await aviso('3 pontos OK nesta área')
      await expect.poll(progresso).toBe('4/6 OK · 1 errada')
      // o aviso do lote fica (sem relógio) e fecha no ✕; o Desfazer de antes já não está mais
      await p.waitForTimeout(6000)
      expect(await p.getByTestId('fvs-desfazer').isVisible()).toBe(true)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/spda_${nome}_desfazer.png` })
      // um Desfazer volta os três
      await p.getByTestId('fvs-desfazer').click()
      await aviso('Desfeito: 3 pontos')
      await expect.poll(progresso).toBe('1/6 OK · 1 errada')
      // no menu, o avanço: 1 OK (CAPTOR 5) e 1 errado (CAPTOR 1)
      await p.locator('.fv-topo .fv-voltar').click()
      await noInicio(p)
      await naDisciplina(p, 'instalacoes')
      await expect.poll(() => secaoSpda().innerText().then((t: string) => t.replace(/\s+/g, ' '))).toContain('1 de 6 pontos OK · 1 errado')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/spda_${nome}_menu.png`, fullPage: true })
      expect(erros).toEqual([])
      await contexto.close()
    }, 150_000)

    it(`${nome} ${largura}x${altura}: planta com muitos pontos: de longe um número por quadrado, que aproxima; de perto o toque marca`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&instalacoes=1&muitos=1`)
      await noInicio(p)
      const aviso = (texto: string) => p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), texto)
      const numeros = p.getByTestId('fvs-numero-pontos')
      const noMapa = () =>
        p.evaluate(() => {
          let n = 0
          ;(window as any).__fvMapa.eachLayer((l: any) => void (l.getRadius && l.options.radius === 7 && n++))
          return n
        })
      await naDisciplina(p, 'instalacoes')
      await p.getByTestId('fvs-secao-outra').filter({ has: p.locator('h3', { hasText: /^Elétrico$/ }) }).getByRole('button').first().click()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await expect.poll(() => p.getByTestId('fvs-progresso').innerText()).toBe('0/105 OK')
      // longe: só números (a soma dá os 105), nenhuma bolinha
      await numeros.first().waitFor()
      const soma = async () => (await numeros.allTextContents()).reduce((t: number, x: string) => t + Number(x.match(/(\d+) pontos?/)?.[1] ?? 0), 0)
      expect(await soma()).toBe(105)
      expect(await noMapa()).toBe(0)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/muitos_${nome}_longe.png` })
      // o toque longe não marca: pede para aproximar
      await tocarNaPlanta(p, 300, 500)
      await aviso('Muitos pontos aqui')
      expect((await registros(p)).filter((r) => r.barra?.startsWith('pt-eletrico-'))).toEqual([])
      // o toque no número aproxima (até caber o quadrado, ou 2 zooms; não pula direto para os pontos)
      const z0 = await p.evaluate(() => (window as any).__fvMapa.getZoom())
      await numeros.first().click()
      await expect.poll(() => p.evaluate(() => (window as any).__fvMapa.getZoom())).toBeGreaterThan(z0)
      await mapaParado(p)
      // perto (zoom 1: os pontos de teste ficam a 15 pt, 24 px pede 1,6x): as bolinhas voltam e o toque marca
      await enquadrar(p, [-500, 300], 1)
      await expect.poll(noMapa).toBeGreaterThan(0)
      expect(await numeros.count()).toBe(0)
      await tocarNaPlanta(p, 300, 500)
      await aviso('CAIXA_PASSAGEM 1 (caixa de passagem): OK')
      await expect.poll(() => registros(p).then((rs) => rs.filter((r) => r.barra === 'pt-eletrico-1').map((r) => [r.item, r.r]))).toEqual([[3, 'C']])
      // um ponto da grade, de perto
      await enquadrar(p, [-660, 390], 1)
      await tocarNaPlanta(p, 390, 660)
      await aviso('LUZ 44 (ponto de luz): OK')
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/muitos_${nome}_perto.png` })
      // de volta longe, o número do quadrado conta o OK
      await enquadrar(p, [-500, 600], -2)
      await expect.poll(async () => (await numeros.allTextContents()).join(' | ')).toMatch(/2 de \d+ pontos OK|1 de \d+ pontos OK/)
      // "+ Área" na planta toda (24/11): grava tudo numa transação só no aparelho (até 500 por vez, núcleo
      // registrarVarios); com 103 pontos, sem "Gravando x de y…" no meio
      await p.evaluate(() => {
        const w = window as any
        w.__avisos = []
        new MutationObserver(() => {
          const t = document.querySelector('.fv-toast span')?.textContent
          if (t && w.__avisos.at(-1) !== t) w.__avisos.push(t)
        }).observe(document.body, { subtree: true, childList: true, characterData: true })
      })
      await p.getByTestId('fvs-area-pontos').click()
      await p.getByTestId('fvs-desenho').waitFor()
      await enquadrar(p, [-615, 790], -2)
      for (const [x, yy] of [[260, 460], [1320, 460], [1320, 770], [260, 770]]) await tocarNaPlanta(p, x, yy)
      await p.getByTestId('fvs-concluir-area').click()
      await p.getByTestId('fvs-selecao-furos').waitFor()
      const quantos = Number((await p.getByTestId('fvs-selecao-furos').innerText()).match(/(\d+) pontos sem conferir/)?.[1])
      expect(quantos).toBeGreaterThanOrEqual(100)
      await p.getByTestId('fvs-selecao-confirmar').click()
      await aviso(`${quantos} pontos OK nesta área`)
      const avisos: string[] = await p.evaluate(() => (window as any).__avisos)
      expect(avisos.filter((t) => t.startsWith('Gravando'))).toEqual([])
      expect(avisos.at(-1)).toBe(`${quantos} pontos OK nesta área`)
      // todos no aparelho, um registro C por ponto, e na fila para subir
      await expect.poll(async () => (await registros(p)).filter((r) => r.barra?.startsWith('pt-eletrico-') && r.r === 'C').length).toBe(quantos + 2)
      expect(await p.getByTestId('fvs-progresso').innerText()).toBe('105/105 OK')
      // o Desfazer do aviso tira o lote inteiro
      await p.locator('.fv-toast').getByRole('button', { name: 'Desfazer' }).click()
      await expect.poll(() => p.getByTestId('fvs-progresso').innerText()).toBe('2/105 OK')
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: furos de laje em plantas próprias: uma por camada, só os furos dela, o item da área da forma`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&furoslaje=1&furacao=1`)
      const pavimento = p.getByTestId('fvs-pavimento')
      await noInicio(p)
      expect(await pavimento.count()).toBe(1)
      // Estrutura (nível 3): uma aba só, "Furos" (21/11 noite, "compilar as abas em uma só"); as camadas antigas
      // ficam no seletor do topo da planta
      await naDisciplina(p, 'estrutura')
      const secao = p.getByTestId('fvs-secao-outra').filter({ has: p.locator('h3', { hasText: /^Furos$/ }) })
      await secao.waitFor()
      expect(await secao.getByRole('button').count()).toBe(1)
      expect((await secao.getByRole('button').innerText()).replace(/\s+/g, ' ')).toMatch(/^Furos /)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furacao_${nome}_menu.png`, fullPage: true })

      const painel = p.getByTestId('fvs-painel')
      const fechar = async () => {
        await p.locator('.fv-cab button').click()
        await painel.waitFor({ state: 'detached' })
      }
      const aviso = (texto: string) => p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), texto)
      const itemDaArea = (n: number) =>
        p.evaluate(`(async () => {
          const { sincronizador } = await import('/src/nucleo/servicos.ts')
          const l = (await sincronizador.linhas('fvs_eventos', '${OBRA}')).filter((e) => e.area_id && e.item === ${n})
          l.sort((a, b) => (a.criado_em_dispositivo < b.criado_em_dispositivo ? -1 : a.criado_em_dispositivo > b.criado_em_dispositivo ? 1 : a.id < b.id ? -1 : 1))
          const u = l.at(-1)
          return u ? { r: u.resultado, obs: u.observacao } : null
        })()`)
      const registrosDe = (nomeDoFuro: string) =>
        p.evaluate(`(async () => {
          const { sincronizador } = await import('/src/nucleo/servicos.ts')
          const els = await sincronizador.linhas('elementos', '${OBRA}')
          const ids = new Set(els.filter((e) => e.nome === '${nomeDoFuro}').map((e) => e.id))
          return (await sincronizador.linhas('fvs_eventos', '${OBRA}')).filter((e) => ids.has(e.elemento_id)).length
        })()`)
      const furo = async (x: number, y: number) => {
        await enquadrar(p, [-y, x], 2)
        await tocarNaPlanta(p, x, y)
      }
      const abrir = async (trecho: string) => {
        if (trecho === 'Trecho 1') await abrirForma(p)
        else {
          await naDisciplina(p, 'estrutura')
          await secao.getByRole('button').click()
          await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
          // a entrada abre a primeira camada (esgoto); as outras pelo seletor do topo
          if (trecho !== 'Furos de esgoto') await p.getByRole('combobox', { name: 'Trecho' }).selectOption({ label: trecho })
        }
        await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      }
      const voltar = async () => {
        // a camada trocada pelo seletor do topo entra no histórico: o Voltar passa por ela antes do menu
        for (let i = 0; i < 3 && (await p.locator('.fv-mapa').count()); i++) {
          await p.locator('.fv-topo .fv-voltar').click()
          await p.waitForTimeout(400)
        }
        await noInicio(p)
      }

      // forma: sem aba Furos (os de laje foram para as plantas próprias); a área é desenhada aqui
      await abrir('Trecho 1')
      expect(await p.locator('.fv-seg button').allTextContents()).toEqual(['Pilares', 'Vigas', 'Lajes'])
      await p.locator('.fv-seg button', { hasText: 'Lajes' }).click()
      await enquadrar(p, [-600, 600], 0)
      await p.getByTestId('fvs-nova-area').click()
      await p.getByTestId('fvs-desenho').waitFor()
      for (const [x, y] of [[470, 470], [730, 470], [730, 730], [470, 730]]) await tocarNaPlanta(p, x, y)
      await p.getByTestId('fvs-concluir-area').click()
      await p.getByTestId('fvs-caixa-nome').fill('Laje dos furos')
      await p.getByTestId('fvs-caixa-criar').click()
      await nomeNoPainel(p, 'Laje dos furos')
      // o item de esgoto continua marcado pelos furos, mesmo com eles em outra planta
      expect(await p.locator('.fv-item[data-item="6"] button[data-r]').count()).toBe(0)
      expect(await p.locator('.fv-item[data-item="6"]').getByTestId('fvs-item-pelos-furos-laje').textContent()).toContain('0 de 1 OK')
      await fechar()
      await voltar()

      // planta de esgoto: só a aba Furos; longe, o número da área conta o FL1 e o do quadrado, FL4 e FL5 (fora
      // dela, gravam no próprio furo, 21/11)
      await abrir('Furos de esgoto')
      expect(await p.locator('.fv-seg button').allTextContents()).toEqual([]) // uma aba só: sem a fila de abas, como na armadura
      await enquadrar(p, [-600, 600], 0)
      const numero = p.getByTestId('fvs-numero-furos')
      await numero.first().waitFor()
      expect((await numero.allTextContents()).sort()).toEqual(['1 furo', '2 furos'])
      expect(await p.getByTestId('fvs-progresso').innerText()).toBe('0/3 OK')
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furacao_${nome}_esgoto_longe.png` })
      // o FL2 (água) não aparece aqui: o toque nele não grava nada
      await furo(600, 640)
      await p.waitForTimeout(600)
      expect(await registrosDe('FL2')).toBe(0)
      // FL1 OK: o item 6 da área (da forma) fica C
      await furo(520, 520)
      await aviso('FL1: OK')
      await expect.poll(() => itemDaArea(6), { timeout: 5000 }).toEqual({ r: 'C', obs: null })
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furacao_${nome}_esgoto_ok.png` })
      await voltar()

      // planta de água: FL2 errado deixa o item 7 NC, com o furo na observação
      await abrir('Furos de água')
      await furo(600, 640)
      await aviso('FL2: OK')
      await furo(600, 640)
      await p.getByTestId('fvs-nc-furo-texto').fill('furo deslocado')
      await p.getByTestId('fvs-nc-furo-confirmar').click()
      await aviso('FL2: errado')
      await expect.poll(() => itemDaArea(7), { timeout: 5000 }).toEqual({ r: 'NC', obs: 'Furo errado: FL2' })
      await nomeNoPainel(p, 'FL2')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      // o painel abriu: o mapa encolhe e põe o furo no meio da faixa (60 ms depois); espera assentar
      await p.waitForFunction(() => {
        const m = (window as any).__fvMapa
        const c = m.getContainer()
        return m.getSize().y === c.clientHeight && !m._animatingZoom
      })
      await p.waitForTimeout(300)
      // o furo está à vista, acima do painel e fora do aviso
      const [xFuro, yFuro] = await naTela(p, 600, 640)
      const caixa = (await painel.boundingBox())!
      const sobOPainel = xFuro >= caixa.x && xFuro <= caixa.x + caixa.width && yFuro >= caixa.y - 50 && yFuro <= caixa.y + caixa.height
      expect(sobOPainel).toBe(false)
      expect(await p.evaluate(([x, y]: [number, number]) => !!document.elementFromPoint(x, y)?.closest('.fv-mapa'), [xFuro, yFuro] as [number, number])).toBe(true)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furacao_${nome}_agua_nc.png` })
      // 3º toque com o painel do NC aberto (regra de 21/11, passoDoToque): sem conferir e o painel fecha
      await tocarNaPlanta(p, 600, 640)
      await aviso('FL2: sem conferir')
      await painel.waitFor({ state: 'detached' })
      await expect.poll(() => itemDaArea(7), { timeout: 5000 }).toEqual({ r: null, obs: null })
      // e de novo: OK, errado
      await furo(600, 640)
      await aviso('FL2: OK')
      await furo(600, 640)
      await p.getByTestId('fvs-nc-furo-texto').fill('furo deslocado')
      await p.getByTestId('fvs-nc-furo-confirmar').click()
      await aviso('FL2: errado')
      await expect.poll(() => itemDaArea(7), { timeout: 5000 }).toEqual({ r: 'NC', obs: 'Furo errado: FL2' })
      await fechar()
      await voltar()

      // no menu, o avanço da aba Furos soma as camadas: FL1 OK, FL2 errado
      await naDisciplina(p, 'estrutura')
      await expect.poll(async () => (await secao.getByRole('button').innerText()).replace(/\s+/g, ' ')).toMatch(/1 de \d+ furos OK · 1 errado/)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furacao_${nome}_menu_avanco.png`, fullPage: true })

      // de volta na forma: o painel da área mostra o que as plantas de furação marcaram
      await abrir('Trecho 1')
      await p.locator('.fv-seg button', { hasText: 'Lajes' }).click()
      await enquadrar(p, [-600, 600], 0)
      await tocarNaPlanta(p, 700, 700)
      await nomeNoPainel(p, 'Laje dos furos')
      expect(await p.locator('.fv-item[data-item="6"]').getByTestId('fvs-item-pelos-furos-laje').textContent()).toContain('1 de 1 OK')
      expect(await contrasteNosDoisTemas(p), 'contraste do painel da área').toEqual([])
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: furação numa planta só, igual à armadura: cada furo grava na ficha da peça (pilar, viga ou laje)`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&furos=1&furoslaje=1&furacaototal=1`)
      await noInicio(p)
      const FICHA_P = 'f0000000-0000-0000-0000-000000000001'
      const FICHA_V = 'f0000000-0000-0000-0000-000000000002'
      const FICHA_L = 'f0000000-0000-0000-0000-000000000009'
      const aviso = (texto: string) => p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), texto)
      const progresso = () => p.getByTestId('fvs-progresso').innerText()
      // o último registro de um local (pelo nome): a ficha, o item e o resultado
      const ultimo = (nomeDoLocal: string) =>
        p.evaluate(`(async () => {
          const { sincronizador } = await import('/src/nucleo/servicos.ts')
          const els = await sincronizador.linhas('elementos', '${OBRA}')
          const ids = new Set(els.filter((e) => e.nome === '${nomeDoLocal}').map((e) => e.id))
          const l = (await sincronizador.linhas('fvs_eventos', '${OBRA}')).filter((e) => ids.has(e.elemento_id))
          l.sort((a, b) => (a.criado_em_dispositivo < b.criado_em_dispositivo ? -1 : a.criado_em_dispositivo > b.criado_em_dispositivo ? 1 : a.id < b.id ? -1 : 1))
          const u = l.at(-1)
          return u ? { ficha: u.ficha_id, item: u.item, r: u.resultado } : null
        })()`)
      const furo = async (x: number, y: number) => {
        await enquadrar(p, [-y, x], 2)
        await tocarNaPlanta(p, x, y)
      }

      // forma: sem a opção "Furos de viga" (todos os furos foram para a planta de furação)
      await naDisciplina(p, 'estrutura')
      await p.getByTestId('fvs-opcao-forma').first().waitFor()
      expect(await p.locator('[data-testid=fvs-opcao-forma][data-tipo=F]').count()).toBe(0)
      const secao = p.getByTestId('fvs-secao-outra').filter({ has: p.locator('h3', { hasText: /^Furos$/ }) })
      const linha = () => secao.getByRole('button').first().innerText().then((t: string) => t.replace(/\s+/g, ' '))
      expect(await secao.getByRole('button').count()).toBe(1)
      expect(await linha()).toMatch(/^Furos /)
      await secao.getByRole('button').first().click()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      // uma aba só; contam os 3 da V1, o FL7 (furo de laje em cima da V1: vai para a viga), a caixinha do P1
      // e FL1 a FL5 (FL6, de Geral, fica de fora)
      expect(await p.locator('.fv-seg button').allTextContents()).toEqual([])
      expect(await progresso()).toBe('0/10 OK')

      // caixinha no pilar: o item de furos da ficha do pilar
      await furo(150, 150)
      await aviso('P1-F1: OK')
      expect(await ultimo('P1-F1')).toEqual({ ficha: FICHA_P, item: 8, r: 'C' })
      await expect.poll(() => ultimo('P1'), { timeout: 5000 }).toEqual({ ficha: FICHA_P, item: 8, r: 'C' })
      // furo de laje em cima da viga: o item de furação da ficha da viga
      await furo(260, 150)
      await aviso('FL7: OK')
      expect(await ultimo('FL7')).toEqual({ ficha: FICHA_V, item: 5, r: 'C' })
      // furo de laje fora de área: o item de esgoto da ficha de laje
      await furo(520, 520)
      await aviso('FL1: OK')
      expect(await ultimo('FL1')).toEqual({ ficha: FICHA_L, item: 6, r: 'C' })
      await expect.poll(progresso).toBe('3/10 OK')
      // furo bem visível: bolinha de 20 px
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furacao_total_${nome}_planta.png` })

      // filtro por tipo dentro da aba (21/11 noite): todos primeiro; "Furos em pilar" conta só a caixinha do P1
      const filtro = p.getByTestId('fvs-filtro-furos')
      const opcoes = await filtro.locator('option').allTextContents()
      expect(opcoes[0]).toBe('Todos (10)')
      expect(opcoes).toContain('Em pilar (1)')
      expect(opcoes.length).toBeGreaterThan(2)
      await filtro.selectOption('pilar')
      await expect.poll(progresso).toBe('1/1 OK')
      // o furo de laje some da planta: o toque nele não grava nada
      const antes = await ultimo('FL2')
      await furo(600, 640)
      await p.waitForTimeout(600)
      expect(await ultimo('FL2')).toEqual(antes)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furacao_total_${nome}_filtro_pilar.png` })
      await filtro.selectOption('todos')
      await expect.poll(progresso).toBe('3/10 OK')

      // "Desmarcar" na caixa do 2º toque (testador no tablet, 21/11): registro novo vazio, sem gravar NC antes
      await furo(520, 520)
      await p.getByTestId('fvs-nc-furo').waitFor()
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furacao_total_${nome}_caixa_nc.png` })
      await p.getByTestId('fvs-nc-furo-desmarcar').click()
      await aviso('FL1: sem conferir')
      expect(await p.getByTestId('fvs-nc-furo').count()).toBe(0)
      expect(await ultimo('FL1')).toEqual({ ficha: FICHA_L, item: 6, r: null })
      await expect.poll(progresso).toBe('2/10 OK')

      // no menu, o avanço da furação
      await p.locator('.fv-topo .fv-voltar').click()
      await noInicio(p)
      await naDisciplina(p, 'estrutura')
      await expect.poll(linha).toContain('2 de 10 furos OK')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furacao_total_${nome}_menu.png`, fullPage: true })
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: "+ Área" na planta de furos: seleciona os furos de uma área e confirma OK em todos, com Desfazer e o filtro`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&furos=1&furoslaje=1&furacaototal=1`)
      await noInicio(p)
      const aviso = (texto: string) => p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), texto)
      const progresso = () => p.getByTestId('fvs-progresso').innerText()
      const ultimoR = (nomeDoLocal: string) =>
        p.evaluate(`(async () => {
          const { sincronizador } = await import('/src/nucleo/servicos.ts')
          const els = await sincronizador.linhas('elementos', '${OBRA}')
          const ids = new Set(els.filter((e) => e.nome === '${nomeDoLocal}').map((e) => e.id))
          const l = (await sincronizador.linhas('fvs_eventos', '${OBRA}')).filter((e) => ids.has(e.elemento_id))
          l.sort((a, b) => (a.criado_em_dispositivo < b.criado_em_dispositivo ? -1 : a.criado_em_dispositivo > b.criado_em_dispositivo ? 1 : a.id < b.id ? -1 : 1))
          return l.at(-1)?.resultado ?? null
        })()`)
      await naDisciplina(p, 'estrutura')
      // ícones (22/11): Pilares, Vigas, Lajes, as 4 armaduras e Furos, todos com o dele
      await p.getByTestId('fvs-secao-outra').first().waitFor()
      expect(await p.locator('button.fv-bt-armadura:not(:has(svg.fv-bt-icone))').count()).toBe(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/icones_${nome}_estrutura.png`, fullPage: true })
      await p.getByTestId('fvs-secao-outra').filter({ has: p.locator('h3', { hasText: /^Furos$/ }) }).getByRole('button').first().click()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      expect(await progresso()).toBe('0/10 OK')
      // o título do pavimento não corta com reticências (quebra em duas linhas, docs/DESIGN.md)
      expect(await p.locator('.fv-nomes b').evaluate((b: HTMLElement) => b.scrollWidth <= b.clientWidth + 1 && b.scrollHeight <= b.clientHeight + 3)).toBe(true)
      // na planta de furos, "+ Área" no lugar do Pincel
      expect(await p.locator('.fv-topo').getByRole('button', { name: 'Pincel' }).count()).toBe(0)
      // FL1 já OK antes: a seleção não mexe nele
      await enquadrar(p, [-520, 520], 2)
      await tocarNaPlanta(p, 520, 520)
      await aviso('FL1: OK')
      // a área em volta do vão: FL1, FL2, FL3 e o FL6 (Geral, não conta); FL4 e FL5 ficam fora
      const desenhar = async () => {
        await p.getByTestId('fvs-area-furos').click()
        await p.getByTestId('fvs-desenho').waitFor()
        expect(await p.getByTestId('fvs-desenho').innerText()).toContain('Área dos furos')
        await enquadrar(p, [-600, 600], 0)
        // a planta continua andando (arrastar com o dedo; dois dedos dão zoom)
        expect(await p.evaluate(() => (window as any).__fvMapa.dragging.enabled())).toBe(true)
        for (const [x, y] of [[470, 470], [730, 470], [730, 730], [470, 730]]) await tocarNaPlanta(p, x, y)
        await p.getByTestId('fvs-concluir-area').click()
        await p.getByTestId('fvs-selecao-furos').waitFor()
      }
      await desenhar()
      expect((await p.getByTestId('fvs-selecao-furos').innerText()).replace(/\s+/g, ' ')).toContain('2 furos sem conferir nesta área (de 3)')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furos_area_${nome}_selecao.png` })
      await p.getByTestId('fvs-selecao-confirmar').click()
      await aviso('2 furos OK nesta área')
      await expect.poll(progresso).toBe('3/10 OK')
      expect([await ultimoR('FL2'), await ultimoR('FL3'), await ultimoR('FL4')]).toEqual(['C', 'C', null])
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furos_area_${nome}_ok.png` })
      // o Desfazer não some sozinho (22/11, testador: sumia em menos de 8 s): fica até o próximo aviso ou o ✕
      await p.waitForTimeout(9000)
      expect(await p.getByTestId('fvs-desfazer').isVisible()).toBe(true)
      expect((await p.getByTestId('fvs-aviso-fechar').boundingBox())!.width).toBeGreaterThanOrEqual(44)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      // um Desfazer volta todos (o FL1, marcado antes, continua)
      await p.getByTestId('fvs-desfazer').click()
      await aviso('Desfeito: 2 furos')
      await expect.poll(progresso).toBe('1/10 OK')
      expect([await ultimoR('FL1'), await ultimoR('FL2'), await ultimoR('FL3')]).toEqual(['C', null, null])
      // com o filtro "Água": só o FL2
      await p.getByTestId('fvs-filtro-furos').selectOption('agua')
      await desenhar()
      expect((await p.getByTestId('fvs-selecao-furos').innerText()).replace(/\s+/g, ' ')).toContain('1 furo sem conferir nesta área · Água')
      await p.getByTestId('fvs-selecao-confirmar').click()
      await aviso('1 furo OK nesta área')
      await expect.poll(progresso).toBe('1/1 OK')
      expect([await ultimoR('FL2'), await ultimoR('FL3')]).toEqual(['C', null])
      // Cancelar a seleção não grava nada
      await p.getByTestId('fvs-filtro-furos').selectOption('todos')
      await desenhar()
      await p.getByTestId('fvs-selecao-cancelar').click()
      await p.getByTestId('fvs-selecao-furos').waitFor({ state: 'detached' })
      expect(await ultimoR('FL3')).toBe(null)
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: forma publicada antes da planta "Furação" (sem furos_separados): os furos ficam só na Furação`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&furos=1&furoslaje=1&furacaototal=antiga`)
      await noInicio(p)
      await naDisciplina(p, 'estrutura')
      await p.getByTestId('fvs-opcao-forma').first().waitFor()
      // sem a opção "Furos de viga" na forma, e a aba Furos no menu
      await p.waitForTimeout(800)
      expect(await p.locator('[data-testid=fvs-opcao-forma][data-tipo=F]').count()).toBe(0)
      expect(await p.getByTestId('fvs-secao-outra').filter({ has: p.locator('h3', { hasText: /^Furos$/ }) }).count()).toBe(1)
      // na forma, nenhum F: nem aba, nem bolinha
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      expect(await p.locator('.fv-seg button').allTextContents()).not.toContain('Furos')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/furacao_forma_antiga_${nome}.png` })
      expect(erros).toEqual([])
      await contexto.close()
    }, 60_000)

    it(`${nome} ${largura}x${altura}: ligação entre peças: o C no item da área de laje marca os pilares e as vigas de dentro dela, mostra a origem e se desfaz`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&regras=pecas`)
      await noInicio(p)
      // tela das regras: a ligação entre peças diz que vale para as peças de dentro da área
      await p.getByTestId('fvs-entra-regras').click()
      expect(await p.getByTestId('fvs-regra-ligacao').count()).toBe(3)
      expect(await p.getByTestId('fvs-regras-entre-pecas').textContent()).toContain('cada pilar e viga dentro dela')
      const daLaje = p.getByTestId('fvs-regra-ligacao').filter({ hasText: 'TESTE-PVS-V item 4' })
      expect(await daLaje.innerText()).toContain('em cada pilar e viga dentro da área de laje')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      expect(await contrasteNosDoisTemas(p), 'contraste da tela das regras').toEqual([])
      expect(await p.locator('.fv-regras li *').evaluateAll((l: Element[]) => l.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 14).map((e) => e.textContent))).toEqual([])
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `ligacao_pecas_${nome}_regras.png`), fullPage: true })
      await p.locator('.fv-regras .fv-voltar').click()
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      const painel = p.getByTestId('fvs-painel')
      const fechar = async () => {
        await p.locator('.fv-cab button').click()
        await painel.waitFor({ state: 'detached' })
      }
      const aba = (t: string) => p.locator('.fv-seg button', { hasText: t }).click()
      const aviso = (texto: string) => p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), texto)
      const P8 = 'e0000000-0000-0000-0000-000000000008'
      const P9 = 'e0000000-0000-0000-0000-000000000009'
      const V7 = 'e1000000-0000-0000-0000-000000000007'
      const V12 = 'e1000000-0000-0000-0000-000000000012'
      const V25 = 'e1000000-0000-0000-0000-000000000025'
      const ultimo = async (el: string, n: number) => (await registros(p)).filter((r) => r.el === el && r.item === n).at(-1)
      // o item 4 da ficha de laje de teste, gravado na área
      const itemDaArea = () =>
        p.evaluate(`(async () => {
          const { sincronizador } = await import('/src/nucleo/servicos.ts')
          const l = (await sincronizador.linhas('fvs_eventos', '${OBRA}')).filter((e) => e.area_id && e.item === 4)
          l.sort((a, b) => (a.criado_em_dispositivo < b.criado_em_dispositivo ? -1 : a.criado_em_dispositivo > b.criado_em_dispositivo ? 1 : a.id < b.id ? -1 : 1))
          return l.at(-1)?.resultado ?? null
        })()`)
      const ORIGEM = 'Pela ligação: Laje ligada · item 4 (Rastreabilidade do concreto)'

      // a V25 já tem o item 4 marcado à mão (NA): a ligação não mexe nela
      await aba('Vigas')
      await buscar(p, 'V25')
      await nomeNoPainel(p, 'V25')
      await item(p, 4, 'NA').click()
      await p.locator('.fv-item[data-item="4"] button[data-r="NA"].on').waitFor()
      await fechar()

      // área de laje com o P8, a V7 e a V25 dentro (o centro de cada um); P9, P14 e V12 ficam de fora
      await aba('Lajes')
      await enquadrar(p, [-570, 570], 0)
      await p.getByTestId('fvs-nova-area').click()
      await p.getByTestId('fvs-desenho').waitFor()
      for (const [x, y] of [[420, 420], [720, 420], [720, 720], [420, 720]]) await tocarNaPlanta(p, x, y)
      await p.getByTestId('fvs-concluir-area').click()
      await p.getByTestId('fvs-caixa-nome').fill('Laje ligada')
      await p.getByTestId('fvs-caixa-criar').click()
      await nomeNoPainel(p, 'Laje ligada')

      // C no item 4 da área (botão do painel): marca o P8 (item 6) e a V7 (item 4); o aviso diz quais
      await item(p, 4, 'C').click()
      await aviso('Laje ligada: C pela ligação em 2 peças: P8 e V7')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `ligacao_pecas_${nome}_aviso.png`) })
      const noP8 = await ultimo(P8, 6)
      const naV7 = await ultimo(V7, 4)
      expect([noP8?.r, noP8?.obs]).toEqual(['C', ORIGEM])
      expect([naV7?.r, naV7?.obs]).toEqual(['C', ORIGEM])
      expect(noP8?.lote).toBeTruthy()
      expect(naV7?.lote).toBe(noP8?.lote)
      // quem já estava marcado e quem está fora da área não muda
      expect((await ultimo(V25, 4))?.r).toBe('NA')
      expect(await ultimo(V12, 4)).toBeUndefined()
      expect(await ultimo(P9, 6)).toBeUndefined()
      expect(await itemDaArea()).toBe('C')

      // Desfazer do aviso: limpa só os ligados; o item da área continua C
      await p.getByTestId('fvs-desfazer').click()
      await aviso('Desfeito: 2 itens')
      expect((await ultimo(P8, 6))?.r).toBeNull()
      expect((await ultimo(V7, 4))?.r).toBeNull()
      expect((await ultimo(V25, 4))?.r).toBe('NA')
      expect(await itemDaArea()).toBe('C')

      // de novo, agora pela Etapa C da área (lote): "+2 pela ligação"
      await item(p, 4, 'C').click()
      await expect.poll(() => itemDaArea(), { timeout: 5000 }).toBeNull()
      await p.locator('.fv-etapa-tit', { hasText: 'CONCRETAGEM' }).getByRole('button').click()
      await aviso('Laje ligada: 1 item C em concretagem · +2 pela ligação')
      expect((await ultimo(P8, 6))?.r).toBe('C')
      expect((await ultimo(V7, 4))?.r).toBe('C')
      await fechar()

      // na viga: o item ligado aparece C, com a origem no lugar de "em lote"
      await aba('Vigas')
      await buscar(p, 'V7')
      await nomeNoPainel(p, 'V7')
      await p.locator('.fv-item[data-item="4"] button[data-r="C"].on').waitFor()
      expect(await p.locator('.fv-item[data-item="4"]').getByTestId('fvs-obs-c').innerText()).toContain('Pela ligação: Laje ligada · item 4')
      expect(await p.locator('.fv-item[data-item="4"] .fv-hr').innerText()).not.toContain('em lote')
      expect(await contrasteNosDoisTemas(p), 'contraste do painel da viga').toEqual([])
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `ligacao_pecas_${nome}_viga.png`) })
      await fechar()
      // no pilar: o C ligado na concretagem (item 6) inicia o prazo da desforma (item 7)
      await aba('Pilares')
      await buscar(p, 'P8')
      await nomeNoPainel(p, 'P8')
      await p.locator('.fv-item[data-item="6"] button[data-r="C"].on').waitFor()
      expect(await p.locator('.fv-item[data-item="7"]').getByTestId('fvs-prazo').innerText()).toMatch(/faltam 3 dias/)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: esquadrias nos ambientes: um toque cada, a porta nos dois cômodos, o item escolhido e o do ambiente`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&esquadrias=1`)
      await noInicio(p)
      await abrirPlantaDeAmbientes(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      // com esquadrias, a planta de ambientes ganha abas, e o serviço continua no topo
      expect(await p.locator('.fv-seg button').allTextContents()).toEqual(['Ambientes', 'Esquadrias'])
      expect(await p.getByTestId('fvs-servico').locator('option').allTextContents()).toEqual(['Alvenaria (ficha de teste)', 'Reboco (ficha de teste)'])
      expect(await p.getByTestId('fvs-progresso').innerText()).toContain('0/20 liberados')
      expect(await topoCabe(p)).toBe(true)
      const painel = p.getByTestId('fvs-painel')
      const fechar = async () => {
        await p.locator('.fv-cab button').click()
        await painel.waitFor({ state: 'detached' })
      }
      const aba = (t: string) => p.locator('.fv-seg button', { hasText: t }).click()
      const aviso = (texto: string) => p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), texto)
      const ALV = 'f0000000-0000-0000-0000-000000000003'
      const REB = 'f0000000-0000-0000-0000-000000000004'
      const A1 = 'e2000000-0000-0000-0000-000000000001' // 101-01
      const E1 = 'e4000000-0000-0000-0000-000000000001' // 101-01-PM80
      const E2 = 'e4000000-0000-0000-0000-000000000002' // 101-02-PM80 (a mesma porta, do outro lado)
      const ultimo = async (el: string, n?: number) => (await registros(p)).filter((r) => r.el === el && (n === undefined || r.item === n)).at(-1)
      const doAmbiente = (n: number) => ultimo(A1, n).then((r) => (r ? { ficha: r.ficha, r: r.r, obs: r.obs } : null))

      // ------------------------------------------------------------ aba Esquadrias
      await aba('Esquadrias')
      // esquadria não é peça: a conta é de esquadrias OK
      expect(await p.getByTestId('fvs-progresso').innerText()).toBe('0/7 OK')
      // a alvenaria tem dois itens de vão: o toque marca o escolhido aqui
      expect(await p.getByTestId('fvs-item-esquadria').locator('option').allTextContents()).toEqual(['3. Primeira fiada conferida', '7. Vergas e contravergas'])
      expect(await topoCabe(p)).toBe(true)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await enquadrar(p, [-200, 260], 1)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/esquadrias_${nome}_aba.png` })
      await tocarNaPlanta(p, 305, 170)
      await aviso('101-01-PM80: OK')
      // grava na própria esquadria, no item 3 da ficha de alvenaria (sem ficha própria)
      expect(await ultimo(E1)).toMatchObject({ ficha: ALV, item: 3, r: 'C', rod: 1 })
      // a mesma porta do lado do 101-02 é outro local: continua sem conferir
      expect(await ultimo(E2)).toBe(undefined)
      await tocarNaPlanta(p, 335, 170)
      await aviso('101-02-PM80: OK')
      expect(await ultimo(E2)).toMatchObject({ ficha: ALV, item: 3, r: 'C' })
      // o 101-01 tem três esquadrias: com uma OK, o item do ambiente continua pendente
      expect(await doAmbiente(3)).toBe(null)
      await tocarNaPlanta(p, 180, 112)
      await aviso('101-01-JA120B: OK')
      await tocarNaPlanta(p, 220, 280)
      await aviso('101-01-PM70: OK')
      await expect.poll(() => doAmbiente(3)).toEqual({ ficha: ALV, r: 'C', obs: null })

      // segundo toque: errado; o painel da esquadria abre e o item do ambiente fica NC com o nome dela
      await tocarNaPlanta(p, 180, 112)
      await aviso('101-01-JA120B: errado')
      await nomeNoPainel(p, '101-01-JA120B')
      expect(await p.getByTestId('fvs-esquadria-info').innerText()).toContain('Janela JA120B')
      await expect.poll(() => doAmbiente(3)).toEqual({ ficha: ALV, r: 'NC', obs: 'Esquadria errada: 101-01-JA120B' })
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/esquadrias_${nome}_errada.png` })

      // da esquadria para o ambiente: os itens de vão são das esquadrias, sem botões
      await p.getByTestId('fvs-ir-ambiente').click()
      await nomeNoPainel(p, '101-01')
      expect(await p.locator('.fv-inf .fv-sit').textContent()).toBe('Com NC')
      const doAmb = p.getByTestId('fvs-esquadrias-do-ambiente')
      expect(await doAmb.locator('h3').textContent()).toContain('Esquadrias: 2 de 3 OK, 1 errada')
      expect(await doAmb.locator('.fv-chip').allTextContents()).toEqual(['JA120B', 'PM70', 'PM80'])
      expect(await p.locator('.fv-item[data-item="3"] button[data-r]').count()).toBe(0)
      expect(await p.locator('.fv-item[data-item="7"] button[data-r]').count()).toBe(0)
      expect(await p.getByTestId('fvs-item-pelas-esquadrias').allTextContents()).toEqual(['Marcado pelas esquadrias (2 de 3 OK, 1 errada)', 'Marcado pelas esquadrias (0 de 3 OK)'])
      // os outros itens continuam à mão
      expect(await item(p, 1, 'C').count()).toBe(1)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/esquadrias_${nome}_ambiente.png` })
      await fechar()

      // ------------------------------------------------------------ outro item: vergas
      await aba('Esquadrias')
      await p.getByTestId('fvs-item-esquadria').selectOption('7')
      // a conta e a cor são do item escolhido: nas vergas, nada conferido ainda
      expect(await p.getByTestId('fvs-progresso').innerText()).toBe('0/7 OK')
      await enquadrar(p, [-200, 260], 1)
      await tocarNaPlanta(p, 305, 170)
      await aviso('101-01-PM80: OK')
      expect(await ultimo(E1)).toMatchObject({ ficha: ALV, item: 7, r: 'C' })
      // o item 3 da mesma porta não mudou
      expect(await ultimo(E1, 3)).toMatchObject({ r: 'C' })
      // Desfazer volta ao que estava (sem conferir)
      await p.getByTestId('fvs-desfazer').click()
      await aviso('Desfeito: 101-01-PM80')
      expect((await ultimo(E1, 7))?.r).toBe(null)

      // ------------------------------------------------------------ outro serviço: reboco
      await p.getByTestId('fvs-servico').selectOption({ index: 1 })
      expect(await p.getByTestId('fvs-item-esquadria').locator('option').allTextContents()).toEqual(['5. Requadros dos vãos'])
      expect(await p.getByTestId('fvs-progresso').innerText()).toBe('0/7 OK')
      await enquadrar(p, [-200, 260], 1)
      await tocarNaPlanta(p, 305, 170)
      await aviso('101-01-PM80: OK')
      expect(await ultimo(E1)).toMatchObject({ ficha: REB, item: 5, r: 'C' })
      expect(await topoCabe(p)).toBe(true)

      // a busca do início mostra a esquadria pela marca dela (o pior dos serviços)
      await p.locator('.fv-topo .fv-voltar').click()
      await noInicio(p)
      await p.getByTestId('fvs-busca-obra').fill('101-01-JA120B')
      const linha = p.getByTestId('fvs-busca-linha').first()
      await linha.waitFor()
      expect(await linha.locator('b').textContent()).toBe('101-01-JA120B')
      expect(await linha.locator('.fv-sit').textContent()).toBe('Com NC')
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: item de esquadria só de janela: a porta fica só para ver e fora da conta`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const aviso = (texto: string) => p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), texto)
      await p.goto(`${url}?abrir=ambientes&esquadrias=1&contramarco=1&servico=TESTE-PVS-REB&aba=esquadrias`)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.getByTestId('fvs-item-esquadria').waitFor()
      expect(await p.getByTestId('fvs-item-esquadria').locator('option').allTextContents()).toEqual(['5. Requadros dos vãos', '6. Contramarco das janelas'])
      // requadros: todas as 7 esquadrias; contramarco das janelas: só as janelas
      expect(await p.getByTestId('fvs-progresso').innerText()).toBe('0/7 OK')
      await p.getByTestId('fvs-item-esquadria').selectOption('6')
      const conta = await p.getByTestId('fvs-progresso').innerText()
      const total = Number(/0\/(\d+) OK/.exec(conta)?.[1])
      expect(total).toBeGreaterThan(0)
      expect(total).toBeLessThan(7)
      expect(await topoCabe(p)).toBe(true)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await enquadrar(p, [-200, 260], 1)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/esquadrias_${nome}_so_janela.png` })
      // a porta não marca: avisa por quê
      await tocarNaPlanta(p, 305, 170)
      await aviso('não vale em PM80')
      // a janela marca
      await tocarNaPlanta(p, 180, 112)
      await aviso('101-01-JA120B: OK')
      expect(await p.getByTestId('fvs-progresso').innerText()).toBe(`1/${total} OK`)
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: esquadria de cômodo em que a ficha não vale: não se marca nela (porta do banho no reboco)`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const aviso = (texto: string) => p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), texto)
      // ?comodos=1&esquadrias=1: o 101-03 é "Banho 01" e o reboco de teste não vale nele
      await p.goto(`${url}?abrir=ambientes&comodos=1&esquadrias=1&servico=TESTE-PVS-REB&aba=ambientes`)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await buscar(p, '101-03')
      await nomeNoPainel(p, 'Banho 01')
      await p.getByTestId('fvs-fora-da-ficha').waitFor()
      // o painel do banho não oferece as portas dele para marcar no reboco
      expect(await p.getByTestId('fvs-esquadrias-do-ambiente').count()).toBe(0)
      // no 101-01 (vale) as esquadrias continuam no painel
      await buscar(p, '101-01')
      await nomeNoPainel(p, 'Dormitório 01')
      await p.getByTestId('fvs-esquadrias-do-ambiente').waitFor()
      // aba Esquadrias: das 7, as 2 do banho (PM70 e PM90) saem da conta e o toque nelas só avisa
      await p.goto(`${url}?abrir=ambientes&comodos=1&esquadrias=1&servico=TESTE-PVS-REB&aba=esquadrias`)
      await p.getByTestId('fvs-item-esquadria').waitFor()
      expect(await p.getByTestId('fvs-progresso').innerText()).toBe('0/5 OK')
      await enquadrar(p, [-296, 220], 1)
      await tocarNaPlanta(p, 220, 312)
      await aviso('não vale em Banho 01 (101-03-PM70, 101-03)')
      expect(await p.getByTestId('fvs-progresso').innerText()).toBe('0/5 OK')
      // a porta do outro lado (no 101-01, onde vale) marca
      await tocarNaPlanta(p, 220, 280)
      await aviso('101-01-PM70: OK')
      expect(await p.getByTestId('fvs-progresso').innerText()).toBe('1/5 OK')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/esquadrias_${nome}_fora_da_ficha.png` })
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: modulação no ambiente: o recorte da 1ª fiada do apartamento como detalhe, com os outros cômodos`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&modulacao=1`)
      await noInicio(p)
      await abrirPlantaDeAmbientes(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      // a sala do 101: o recorte da modulação no lugar do detalhe, e os cômodos do apartamento logo abaixo.
      // Enquadra o ponto antes de tocar: com espera fixa depois da busca, o toque caía fora da tela de
      // 375 px quando o voo do mapa atrasava (revisão de telas, 20/11)
      await enquadrar(p, [-480, 320], 0)
      await tocarNaPlanta(p, 320, 480)
      await nomeNoPainel(p, '101-03')
      const mod = p.getByTestId('fvs-modulacao')
      expect(await mod.locator('h3').textContent()).toBe('Modulação · Apto 101')
      expect(await mod.locator('.fv-dica').first().textContent()).toContain('TESTE.VD.EX.024.TIPA-R00')
      await expect.poll(() => mod.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)
      expect(await p.getByTestId('fvs-irmaos').locator('.fv-chip').allTextContents()).toEqual(['01', '02', '03'])
      // a ficha continua no painel, como sem modulação
      expect(await p.getByTestId('fvs-ficha-do-painel').textContent()).toContain('TESTE-PVS-ALV')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/modulacao_${nome}_painel.png` })
      // o quarto do mesmo apartamento mostra o mesmo recorte
      await p.getByTestId('fvs-irmaos').locator('.fv-chip').first().click()
      await nomeNoPainel(p, '101-01')
      expect(await p.getByTestId('fvs-modulacao').locator('h3').textContent()).toBe('Modulação · Apto 101')
      // outro apartamento, sem recorte no pacote: o painel de sempre, sem aviso de detalhe faltando
      await p.locator('.fv-cab button').click()
      await p.getByTestId('fvs-painel').waitFor({ state: 'detached' })
      await enquadrar(p, [-480, 770], 0)
      await tocarNaPlanta(p, 770, 480)
      await nomeNoPainel(p, '102-03')
      expect(await p.getByTestId('fvs-modulacao').count()).toBe(0)
      expect(await p.getByTestId('fvs-painel').innerText()).not.toContain('detalhe desta peça')
      expect(await p.getByTestId('fvs-irmaos').locator('.fv-chip').count()).toBe(3)
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: modulação de paredes: seção própria no pavimento, cada parede um local da ficha de alvenaria`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&vedacao=1`)
      const pavimento = p.getByTestId('fvs-pavimento')
      await noInicio(p)
      // as paredes não contam na estrutura
      expect(await pavimento.first().innerText()).toContain('de 62 peças liberadas')
      // a Alvenaria (com a modulação) vem antes dos Acabamentos (a alvenaria vem antes do reboco)
      await pavimento.first().click()
      await expect.poll(() => p.getByTestId('fvs-disciplina').evaluateAll((l: HTMLElement[]) => l.map((e) => e.dataset.disciplina))).toEqual(['estrutura', 'alvenaria', 'acabamentos'])
      await naDisciplina(p, 'alvenaria')
      const secao = p.getByTestId('fvs-secao-vedacao')
      expect(await secao.getByTestId('fvs-resumo-paredes').innerText()).toBe('0 de 9 paredes liberadas')
      expect((await secao.innerText()).replace(/\s+/g, ' ')).toContain('9 paredes · TESTE.VD.EX.001.PAV-R00')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/vedacao_${nome}_inicio.png`, fullPage: true })

      await secao.getByRole('button', { name: /Abrir/ }).click()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      expect(await p.locator('.fv-seg').count()).toBe(0) // só paredes: sem abas, sem área de laje
      expect(await p.getByTestId('fvs-progresso').innerText()).toContain('0/9 liberados')
      expect(await topoCabe(p)).toBe(true)
      // a parede entre as duas suítes do 101 (x = 320, y de 100 a 290): o toque na linha fina abre a parede
      await enquadrar(p, [-200, 320], 0)
      await tocarNaPlanta(p, 321, 200)
      await nomeNoPainel(p, '101-M02')
      const info = await p.locator('.fv-inf').innerText()
      expect(info).toContain('Parede')
      expect(info).toContain('Apto 101')
      expect(info).toContain('3,80 m · 14 cm')
      expect(info).not.toContain('seção')
      expect(await p.getByTestId('fvs-painel').innerText()).not.toContain('detalhe desta peça')
      expect(await p.getByTestId('fvs-ficha-do-painel').textContent()).toContain('TESTE-PVS-ALV')
      for (let n = 1; n <= 6; n++) await item(p, n, 'C').click()
      await expect.poll(async () => (await registros(p)).length).toBe(6)
      expect(await p.getByTestId('fvs-progresso').innerText()).toContain('1/9 liberados')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/vedacao_${nome}_painel.png` })

      // a busca pelo apartamento enquadra as paredes dele
      await p.locator('.fv-cab button').click()
      await p.getByTestId('fvs-painel').waitFor({ state: 'detached' })
      await buscar(p, '102')
      await p.locator('.fv-toast', { hasText: 'Apto 102: 4 paredes' }).waitFor()

      // de volta ao início: a parede liberada conta na modulação, não na estrutura nem nos ambientes
      await p.goto(`${url}?abrir=0&vedacao=1`)
      await naDisciplina(p, 'alvenaria')
      expect(await p.getByTestId('fvs-resumo-paredes').innerText()).toBe('1 de 9 paredes liberadas')
      await naDisciplina(p, 'acabamentos')
      expect(await p.getByTestId('fvs-ambientes').innerText()).toContain('nenhuma ficha começada')
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: projetos no ambiente: modulação, paginação e impermeabilização, cada um nas fichas dele`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&modulacao=1&projetos=1`)
      await noInicio(p)
      await abrirPlantaDeAmbientes(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await enquadrar(p, [-480, 320], 0)
      await tocarNaPlanta(p, 320, 480)
      await nomeNoPainel(p, '101-03')
      // alvenaria (a primeira ficha): a modulação e a impermeabilização (sem lista de fichas); a paginação não
      expect(await p.getByTestId('fvs-ficha-do-painel').textContent()).toContain('TESTE-PVS-ALV')
      expect(await p.getByTestId('fvs-modulacao').locator('h3').textContent()).toBe('Modulação · Apto 101')
      const proj = p.getByTestId('fvs-projeto')
      expect(await proj.locator('h3').allTextContents()).toEqual(['Impermeabilização · Apto 101'])
      expect(await proj.locator('.fv-dica').first().textContent()).toContain('TESTE.IM.EX.006.PAV-R01')
      await expect.poll(() => proj.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)
      // os recortes vêm antes dos cômodos do apartamento
      const ordem = await p
        .locator('[data-testid="fvs-modulacao"], [data-testid="fvs-projeto"], [data-testid="fvs-irmaos"]')
        .evaluateAll((els: Element[]) => els.map((e) => e.getAttribute('data-testid')))
      expect(ordem).toEqual(['fvs-modulacao', 'fvs-projeto', 'fvs-irmaos'])
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      // reboco no topo: a paginação de piso entra (a lista de fichas dela tem o reboco de teste)
      await p.locator('.fv-cab button').click()
      await p.getByTestId('fvs-painel').waitFor({ state: 'detached' })
      await p.getByTestId('fvs-servico').selectOption({ index: 1 })
      await enquadrar(p, [-480, 320], 0)
      await tocarNaPlanta(p, 320, 480)
      await nomeNoPainel(p, '101-03')
      expect(await p.getByTestId('fvs-ficha-do-painel').textContent()).toContain('TESTE-PVS-REB')
      expect(await p.getByTestId('fvs-projeto').locator('h3').allTextContents()).toEqual([
        'Paginação de piso · Apto 101',
        'Impermeabilização · Apto 101',
      ])
      // tocar na imagem amplia
      await p.getByTestId('fvs-projeto').first().locator('img').click()
      await p.locator('.fv-zoom img, [data-testid="fvs-zoom"] img').first().waitFor()
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/projetos_${nome}_painel.png` })
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: barras de laje: toque OK, NC só com Confirmar, Desfazer, "Tudo OK" da camada e o item de armadura da laje`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&barras=1`)
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      expect(await p.locator('.fv-seg button').allTextContents()).toEqual(['Pilares', 'Vigas', 'Lajes', 'Barras'])
      const painel = p.getByTestId('fvs-painel')
      const aviso = (texto: string) => p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), texto)
      const N1 = 'e4000000-0000-0000-0000-000000000001'
      const ultimo = async (el: string) => (await registros(p)).filter((r) => r.el === el).at(-1)
      // o item 3 da ficha de laje de teste ("Armadura e espaçadores"), que as barras marcam, gravado na área
      const itemDaLaje = () =>
        p.evaluate(`(async () => {
          const { sincronizador } = await import('/src/nucleo/servicos.ts')
          const l = (await sincronizador.linhas('fvs_eventos', '${OBRA}')).filter((e) => e.area_id && e.item === 3)
          l.sort((a, b) => (a.criado_em_dispositivo < b.criado_em_dispositivo ? -1 : a.criado_em_dispositivo > b.criado_em_dispositivo ? 1 : a.id < b.id ? -1 : 1))
          const u = l.at(-1)
          return u ? { r: u.resultado, obs: u.observacao } : null
        })()`)

      // área de laje no vão de P8, P9, P14 e P15: pega as quatro barras do vão e a N4, que passa para o vizinho
      await p.locator('.fv-seg button', { hasText: 'Lajes' }).click()
      await enquadrar(p, [-600, 600], 0)
      await p.getByTestId('fvs-nova-area').click()
      await p.getByTestId('fvs-desenho').waitFor()
      for (const [x, y] of [[470, 470], [730, 470], [730, 730], [470, 730]]) await tocarNaPlanta(p, x, y)
      await p.getByTestId('fvs-concluir-area').click()
      await p.getByTestId('fvs-caixa-nome').fill('Laje das barras')
      await p.getByTestId('fvs-caixa-criar').click()
      await nomeNoPainel(p, 'Laje das barras')
      expect(await p.getByTestId('fvs-barras-da-area').innerText()).toContain('Barras: 0 de 5 OK')
      // o item de armadura não tem botões: quem marca são as barras; e o "Etapa C" da etapa dele pula o item
      expect(await p.locator('.fv-item[data-item="3"] button[data-r]').count()).toBe(0)
      expect(await p.getByTestId('fvs-item-pelas-barras').textContent()).toContain('0 de 5 OK')
      expect(await p.locator('.fv-etapa-tit', { hasText: 'MONTAGEM' }).getByRole('button').textContent()).toBe('Etapa C (1)')

      // "Ver as barras" leva à aba Barras; a camada começa pela primeira das pranchas
      await p.getByTestId('fvs-ver-barras').click()
      await painel.waitFor({ state: 'detached' })
      expect(await p.locator('.fv-seg button.on').innerText()).toBe('Barras')
      // no celular as abas não cabem: a fila rola e a aba escolhida fica à vista
      const abaVisivel = () =>
        p.evaluate(() => {
          const f = document.querySelector('.fv-seg')!.getBoundingClientRect()
          const b = document.querySelector('.fv-seg button.on')!.getBoundingClientRect()
          return b.left >= f.left - 1 && b.right <= f.right + 1
        })
      await expect.poll(abaVisivel).toBe(true)
      expect(await p.getByTestId('fvs-camada').inputValue()).toBe('transversal_superior')
      await p.getByTestId('fvs-camada').selectOption('longitudinal_inferior')
      expect(await p.getByTestId('fvs-progresso').innerText()).toBe('0/4 OK')

      // a barra passa por cima da viga: na aba Barras o toque é da barra, não da viga (N4 sobre a V entre P9 e P15)
      await enquadrar(p, [-700, 750], 1)
      await tocarNaPlanta(p, 750, 700)
      await aviso('N4 (long. inf.): OK')
      expect(await painel.count()).toBe(0)
      await p.getByTestId('fvs-desfazer').click()
      await aviso('Desfeito: N4')
      // toque com margem (10 px ao lado da N1): sem conferir → OK, com Desfazer
      await enquadrar(p, [-600, 600], 1)
      await tocarNaPlanta(p, 600, 525)
      await aviso('N1 (long. inf.): OK')
      expect(await ultimo(N1)).toMatchObject({ el: N1, ficha: 'f0000000-0000-0000-0000-000000000009', item: 3, r: 'C' })
      // vai ao servidor em barra_id (a barra não está em elementos), sempre com a planta
      expect(await ultimo(N1)).toMatchObject({ barra: N1, planta: expect.any(String) })
      expect(await p.getByTestId('fvs-progresso').innerText()).toBe('1/4 OK')
      await p.getByTestId('fvs-desfazer').click()
      await aviso('Desfeito: N1')
      expect((await ultimo(N1))?.r).toBe(null)
      await tocarNaPlanta(p, 600, 520)
      await aviso('N1 (long. inf.): OK')

      // OK → errada: abre a caixa; sem texto não confirma; Cancelar não grava nada
      const n = (await registros(p)).length
      await tocarNaPlanta(p, 600, 520)
      const caixa = p.getByTestId('fvs-nc-barra')
      await caixa.waitFor()
      expect(await p.getByTestId('fvs-nc-barra-confirmar').isDisabled()).toBe(true)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/barras_${nome}_nc.png` })
      expect(await semRolagemHorizontal(p)).toBe(0)
      await p.getByTestId('fvs-nc-barra-cancelar').click()
      await caixa.waitFor({ state: 'detached' })
      expect((await registros(p)).length).toBe(n)
      expect((await ultimo(N1))?.r).toBe('C')
      // com o texto e Confirmar: NC na barra, e o item da laje vira NC dizendo qual
      await tocarNaPlanta(p, 600, 520)
      await p.getByTestId('fvs-nc-barra-texto').fill('faltou espaçador')
      await p.getByTestId('fvs-nc-barra-confirmar').click()
      await aviso('N1 (long. inf.): errada')
      expect(await ultimo(N1)).toMatchObject({ r: 'NC', obs: 'faltou espaçador' })
      await expect.poll(itemDaLaje).toEqual({ r: 'NC', obs: 'Barra errada: N1 (long. inf.): faltou espaçador' })

      // a caixa da área abre o painel sem sair da aba Barras; "Tudo OK" marca as sem conferir da camada
      await p.getByTestId('fvs-caixa-area').click()
      await nomeNoPainel(p, 'Laje das barras')
      expect(await p.locator('.fv-seg button.on').innerText()).toBe('Barras')
      expect(await p.locator('.fv-cab .fv-sit').innerText()).toBe('Com NC')
      await p.getByTestId('fvs-tudo-ok-camada').click()
      await aviso('Laje das barras: 3 barras OK')
      await p.getByTestId('fvs-barras-da-area').locator('b', { hasText: 'Barras: 3 de 5 OK, 1 errada' }).waitFor()
      expect(await p.getByTestId('fvs-tudo-ok-camada').isDisabled()).toBe(true)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/barras_${nome}_laje.png` })
      await p.locator('.fv-cab button').click()
      await painel.waitFor({ state: 'detached' })

      // a errada corrigida (errada → sem conferir → OK): falta a camada transversal, o item fica pendente
      await enquadrar(p, [-600, 600], 1)
      await tocarNaPlanta(p, 600, 520)
      await aviso('N1 (long. inf.): sem conferir')
      await tocarNaPlanta(p, 600, 520)
      await aviso('N1 (long. inf.): OK')
      await expect.poll(() => itemDaLaje().then((i: any) => i?.r)).toBe(null)
      // a outra camada inteira OK: todas as barras da área OK, o item de armadura fica C sozinho
      await p.getByTestId('fvs-camada').selectOption('transversal_superior')
      await p.getByTestId('fvs-caixa-area').click()
      await nomeNoPainel(p, 'Laje das barras')
      await p.getByTestId('fvs-tudo-ok-camada').click()
      await aviso('Laje das barras: 1 barra OK')
      await expect.poll(itemDaLaje).toEqual({ r: 'C', obs: null })
      await p.getByTestId('fvs-item-pelas-barras').locator('span', { hasText: '5 de 5 OK' }).waitFor()

      expect(await semRolagemHorizontal(p)).toBe(0)
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    // Achado #5 da lista de campo (24/11), o Nicolas: "se tem duas barras muito próximas, elas são juntas. Então a
    // pessoa dá um clique e já confira as duas." A N6 corre colada na N1 (4,4 cm): um toque, as duas OK, sem zoom;
    // o 2º toque abre o NC e a pessoa escolhe qual das duas está errada; a outra fica OK.
    it(`${nome} ${largura}x${altura}: barras juntas: um toque confere as duas e o NC escolhe qual está errada`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&barras=1&juntas=1`)
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      const aviso = (texto: string) => p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), texto)
      const N1 = 'e4000000-0000-0000-0000-000000000001'
      const N6 = 'e4000000-0000-0000-0000-000000000006'
      const das = async () => {
        const rs = await registros(p)
        // sem registro: 'nada'; registro vazio (sem conferir): null
        return [N1, N6].map((id) => {
          const u = rs.filter((r) => r.el === id).at(-1)
          return u ? u.r : 'nada'
        })
      }
      await p.locator('.fv-seg button', { hasText: 'Barras' }).click()
      await p.getByTestId('fvs-camada').selectOption('longitudinal_inferior')
      expect(await p.getByTestId('fvs-progresso').innerText()).toBe('0/5 OK')
      // de longe (zoom 0, as duas a ~2,5 px uma da outra): o toque pega as duas, sem pedir zoom
      await enquadrar(p, [-600, 600], 0)
      await tocarNaPlanta(p, 610, 521)
      await aviso('Barras juntas N1 + N6 (long. inf.): OK')
      await expect.poll(das).toEqual(['C', 'C'])
      expect(await p.getByTestId('fvs-progresso').innerText()).toBe('2/5 OK')
      // um Desfazer para as duas
      await p.getByTestId('fvs-desfazer').click()
      await aviso('Desfeito: 2 barras')
      // o Desfazer grava as duas de novo sem conferir (como o "Tudo OK" da camada)
      await expect.poll(das).toEqual([null, null])
      await tocarNaPlanta(p, 610, 521)
      await aviso('Barras juntas N1 + N6 (long. inf.): OK')
      await expect.poll(das).toEqual(['C', 'C'])

      // 2º toque: a caixa do NC pergunta qual das duas está errada
      await tocarNaPlanta(p, 610, 521)
      const caixa = p.getByTestId('fvs-nc-barra')
      await caixa.waitFor()
      const qual = p.getByTestId('fvs-nc-barra-qual')
      expect(await qual.getByRole('button').allInnerTexts()).toEqual(['N1 1ø8 C=400', 'N6 1ø8 C=400'])
      await qual.locator(`button[data-barra="${N6}"]`).click()
      expect(await qual.locator('button.on').innerText()).toBe('N6 1ø8 C=400')
      expect(await caixa.locator('b').first().innerText()).toContain('N6')
      expect(await semRolagemHorizontal(p)).toBe(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/barras_juntas_${nome}.png` })
      await p.getByTestId('fvs-nc-barra-texto').fill('Bitola trocada')
      await p.getByTestId('fvs-nc-barra-confirmar').click()
      await caixa.waitFor({ state: 'detached' })
      await expect.poll(das).toEqual(['C', 'NC'])
      expect((await registros(p)).filter((r) => r.el === N6).at(-1)?.obs).toBe('Bitola trocada')

      // 3º toque (com uma errada): tira a verificação das duas
      await tocarNaPlanta(p, 610, 521)
      await aviso('Barras juntas N1 + N6 (long. inf.): sem conferir')
      await expect.poll(das).toEqual([null, null])
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: "Por item": um item, vários pilares; NC só com Confirmar; reinspeção; Desfazer; consolo só no pilar que tem; ficha completa`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&partes=1`)
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      const FICHA_P = 'f0000000-0000-0000-0000-000000000001'
      const pilar = (n: number) => `e0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
      // P1 a P6 na linha de cima (y 150), P7 a P12 na de baixo (y 450), de 300 em 300 a partir de x 150.
      // Histórico da bancada: P1 com ficha aberta toda aprovada, P2 com duas fichas (duplicada), P3 agendada.
      const ondeFica = (n: number): [number, number] => [150 + ((n - 1) % 6) * 300, 150 + Math.floor((n - 1) / 6) * 300]
      const tocarPilar = async (n: number, dx = 0, dy = 0) => {
        const [x, y] = ondeFica(n)
        await enquadrar(p, [-y, x], 0)
        await tocarNaPlanta(p, x + dx, y + dy)
      }
      const aviso = (texto: string) => p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), texto)
      const ultimo = async (n: number, item: number) => (await registros(p)).filter((r) => r.el === pilar(n) && r.item === item).at(-1)
      const conta = () => p.getByTestId('fvs-por-item-conta').innerText()
      const barra = p.getByTestId('fvs-por-item')
      const painel = p.getByTestId('fvs-painel')

      // o botão fica ao lado do Pincel, no topo, sem nada cortado
      const bt = p.getByTestId('fvs-bt-por-item')
      await bt.waitFor()
      expect(await topoCabe(p)).toBe(true)
      expect(await alvosPequenos(p)).toEqual([])
      await bt.click()
      await barra.waitFor()
      // sem item guardado, começa pelo primeiro da ficha; os itens vêm por etapa
      const escolha = p.getByTestId('fvs-por-item-escolha')
      expect(await escolha.inputValue()).toBe('1')
      expect(await escolha.locator('optgroup').evaluateAll((gs: HTMLOptGroupElement[]) => gs.map((g) => g.label))).toContain('Montagem')
      await escolha.selectOption('5')
      // P1 já vem OK pelo histórico; o P2, com duas fichas, não conta (o modo não escolhe a ficha)
      expect(await conta()).toBe('1 de 23 OK')

      // três pilares em sequência: cada toque grava C só no item 5, sem abrir painel
      for (const n of [10, 11, 12]) {
        await tocarPilar(n)
        await aviso(`P${n} · Prumo da fôrma: OK`)
        await expect.poll(() => ultimo(n, 5)).toMatchObject({ ficha: FICHA_P, r: 'C', rod: 1, obs: null })
      }
      expect(await painel.count()).toBe(0)
      expect((await registros(p)).filter((r) => r.item !== 5)).toEqual([])
      await expect.poll(conta).toBe('4 de 23 OK')
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/por_item_${nome}_barra.png` })

      // Desfazer volta o último a sem conferir
      await p.getByTestId('fvs-desfazer').click()
      await aviso('Desfeito: P12 · Prumo da fôrma')
      await expect.poll(async () => (await ultimo(12, 5))?.r).toBe(null)
      await expect.poll(conta).toBe('3 de 23 OK')

      // pilar com duas fichas: avisa e não grava
      const nd = (await registros(p)).length
      await tocarPilar(2)
      await aviso('P2 tem 2 fichas')
      expect((await registros(p)).length).toBe(nd)

      // OK → errado: abre a caixa; sem texto não confirma; Cancelar não grava nada
      const n0 = (await registros(p)).length
      await tocarPilar(11)
      const caixa = p.getByTestId('fvs-nc-item')
      await caixa.waitFor()
      expect(await p.getByTestId('fvs-nc-item-confirmar').isDisabled()).toBe(true)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/por_item_${nome}_nc.png` })
      expect(await semRolagemHorizontal(p)).toBe(0)
      await p.getByTestId('fvs-nc-item-cancelar').click()
      await caixa.waitFor({ state: 'detached' })
      expect((await registros(p)).length).toBe(n0)
      // com o texto e Confirmar: NC na mesma rodada, com a observação
      await tocarPilar(11)
      await p.getByTestId('fvs-nc-item-texto').fill('fora de prumo 8 mm')
      await p.getByTestId('fvs-nc-item-confirmar').click()
      await aviso('P11 · Prumo da fôrma: errado')
      await expect.poll(() => ultimo(11, 5)).toMatchObject({ r: 'NC', rod: 1, obs: 'fora de prumo 8 mm' })
      await expect.poll(conta).toBe('2 de 23 OK · 1 errado')
      // errado → OK é a reinspeção (V02): o NC da V01 continua nas reprovações
      await tocarPilar(11)
      await aviso('P11 · Prumo da fôrma: OK (reinspeção V02)')
      await expect.poll(() => ultimo(11, 5)).toMatchObject({ r: 'C', rod: 2, obs: null })
      await expect.poll(conta).toBe('3 de 23 OK')

      // item do consolo: só o P8 tem consolo nesta planta. No P1 avisa e não grava; o toque no consolo marca o P8
      await escolha.selectOption('8')
      await expect.poll(conta).toBe('0 de 1 OK')
      const n1 = (await registros(p)).length
      await tocarPilar(1)
      await aviso('P1 não tem consolo nesta planta.')
      expect((await registros(p)).length).toBe(n1)
      // no consolo, abaixo da viga que passa por cima dele
      await tocarPilar(8, 30, 18)
      await aviso('P8 · Barras principais (tirante): OK')
      await expect.poll(() => ultimo(8, 8)).toMatchObject({ ficha: FICHA_P, r: 'C' })
      await expect.poll(conta).toBe('1 de 1 OK')
      expect(await painel.count()).toBe(0)

      // viga com o modo ligado: avisa e não abre
      await enquadrar(p, [-150, 300], 0)
      await tocarNaPlanta(p, 300, 150)
      await aviso('toque nos pilares')
      expect(await painel.count()).toBe(0)

      // Sair: o toque volta a abrir o pilar, que mostra o C do prumo
      await p.getByTestId('fvs-por-item-sair').click()
      await barra.waitFor({ state: 'detached' })
      await tocarPilar(10)
      await nomeNoPainel(p, 'P10')
      expect(await item(p, 5, 'C').getAttribute('aria-pressed')).toBe('true')
      await p.locator('.fv-cab button').click()
      await painel.waitFor({ state: 'detached' })

      // o pincel marca a ficha inteira do P4; depois, pelo "Por item", o prumo errado e corrigido fecha a ficha
      await p.locator('.fv-bpincel', { hasText: 'Pincel' }).click()
      await p.getByTestId('fvs-pincel').waitFor()
      await tocarPilar(4)
      await aviso('P4: 7 itens C')
      await bt.click()
      await p.getByTestId('fvs-pincel').waitFor({ state: 'detached' })
      // volta com o item da última vez (guardado no aparelho)
      expect(await escolha.inputValue()).toBe('8')
      await escolha.selectOption('5')
      await tocarPilar(4)
      await p.getByTestId('fvs-nc-item-texto').fill('prumo errado')
      await p.getByTestId('fvs-nc-item-confirmar').click()
      await aviso('P4 · Prumo da fôrma: errado')
      // Desfazer do NC volta ao C
      await p.getByTestId('fvs-desfazer').click()
      await aviso('Desfeito: P4 · Prumo da fôrma')
      await expect.poll(() => ultimo(4, 5)).toMatchObject({ r: 'C', obs: null })
      await tocarPilar(4)
      await p.getByTestId('fvs-nc-item-texto').fill('prumo errado')
      await p.getByTestId('fvs-nc-item-confirmar').click()
      await aviso('P4 · Prumo da fôrma: errado')
      await tocarPilar(4)
      await aviso('P4 · Prumo da fôrma: OK (reinspeção V02) · ficha completa')
      await expect.poll(() => ultimo(4, 5)).toMatchObject({ r: 'C', rod: 2 })

      // trocar de aba desliga o modo, e ele não volta sozinho
      await p.locator('.fv-seg button', { hasText: 'Vigas' }).click()
      await barra.waitFor({ state: 'detached' })
      await p.locator('.fv-seg button', { hasText: 'Pilares' }).click()
      expect(await barra.count()).toBe(0)

      // nada ficou preso no diário de toques
      expect(await p.evaluate((o: string) => localStorage.getItem(`fvs_toques:${o}`), OBRA)).toBeNull()
      expect(await semRolagemHorizontal(p)).toBe(0)
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)
    it(`${nome} ${largura}x${altura}: "Por item" na viga e no ambiente, com NA pelo toque; o item fica guardado por tipo e por serviço`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0`)
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      const FICHA_V = 'f0000000-0000-0000-0000-000000000002'
      const viga = (n: number) => `e1000000-0000-0000-0000-${String(n).padStart(12, '0')}`
      const aviso = (texto: string) => p.waitForFunction((t: string) => document.querySelector('.fv-toast')?.textContent?.includes(t), texto)
      const ultimo = async (el: string, item: number) => (await registros(p)).filter((r) => r.el === el && r.item === item).at(-1)
      const conta = () => p.getByTestId('fvs-por-item-conta').innerText()
      const barra = p.getByTestId('fvs-por-item')
      const escolha = p.getByTestId('fvs-por-item-escolha')
      const bt = p.getByTestId('fvs-bt-por-item')
      // V1, V2 e V3: a linha de cima, entre os pilares de y 150 (x 160 a 440, 460 a 740, 760 a 1040)
      const tocarEm = async (x: number, y: number) => {
        await enquadrar(p, [-y, x], 0)
        await tocarNaPlanta(p, x, y)
      }

      // ------------------------------------------------------------ vigas
      await p.locator('.fv-seg button', { hasText: 'Vigas' }).click()
      await bt.waitFor()
      expect(await topoCabe(p)).toBe(true)
      await bt.click()
      await barra.waitFor()
      await escolha.selectOption('2')
      expect(await escolha.locator('option:checked').innerText()).toBe('2. Fundo e laterais da fôrma')
      expect(await conta()).toBe('0 de 38 OK')
      await tocarEm(300, 150)
      await aviso('V1 · Fundo e laterais da fôrma: OK')
      await expect.poll(() => ultimo(viga(1), 2)).toMatchObject({ ficha: FICHA_V, r: 'C' })
      // NA na barra: o toque marca NA (sobre o C também); no NA, tira o NA
      await p.getByTestId('fvs-por-item-NA').click()
      expect(await p.getByTestId('fvs-por-item-NA').getAttribute('aria-pressed')).toBe('true')
      await tocarEm(600, 150)
      await aviso('V2 · Fundo e laterais da fôrma: não se aplica')
      await expect.poll(() => ultimo(viga(2), 2)).toMatchObject({ r: 'NA', rod: 1 })
      await tocarEm(300, 150)
      await aviso('V1 · Fundo e laterais da fôrma: não se aplica')
      await expect.poll(() => ultimo(viga(1), 2)).toMatchObject({ r: 'NA', rod: 1 })
      await expect.poll(conta).toBe('0 de 36 OK · 2 NA')
      expect(await p.getByTestId('fvs-legenda').textContent()).toContain('Item NA')
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/por_item_${nome}_vigas_na.png` })
      await tocarEm(600, 150)
      await aviso('V2 · Fundo e laterais da fôrma: sem conferir')
      await expect.poll(async () => (await ultimo(viga(2), 2))?.r).toBe(null)
      // Desfazer volta o NA
      await p.getByTestId('fvs-desfazer').click()
      await aviso('Desfeito: V2')
      await expect.poll(async () => (await ultimo(viga(2), 2))?.r).toBe('NA')
      // de volta ao OK: o NA vira C; o C pede o NC com observação
      await p.getByTestId('fvs-por-item-C').click()
      await tocarEm(600, 150)
      await aviso('V2 · Fundo e laterais da fôrma: OK')
      await tocarEm(600, 150)
      await p.getByTestId('fvs-nc-item-texto').fill('fundo torto')
      await p.getByTestId('fvs-nc-item-confirmar').click()
      await aviso('V2 · Fundo e laterais da fôrma: errado')
      await expect.poll(() => ultimo(viga(2), 2)).toMatchObject({ r: 'NC', obs: 'fundo torto' })
      // NA sobre o errado é a reinspeção
      await p.getByTestId('fvs-por-item-NA').click()
      await tocarEm(600, 150)
      await aviso('V2 · Fundo e laterais da fôrma: não se aplica (reinspeção V02)')
      await expect.poll(() => ultimo(viga(2), 2)).toMatchObject({ r: 'NA', rod: 2 })
      // pilar com o modo nas vigas: avisa e não abre
      await tocarEm(450, 150)
      await aviso('toque nas vigas')
      expect(await p.getByTestId('fvs-painel').count()).toBe(0)
      expect(await semRolagemHorizontal(p)).toBe(0)

      // Pilares: o modo desliga e, ao entrar, o item é o dos pilares (não o das vigas)
      await p.locator('.fv-seg button', { hasText: 'Pilares' }).click()
      await barra.waitFor({ state: 'detached' })
      await bt.click()
      expect(await escolha.inputValue()).toBe('1')
      expect(await p.getByTestId('fvs-por-item-C').getAttribute('aria-pressed')).toBe('true')
      await p.getByTestId('fvs-por-item-sair').click()

      // ------------------------------------------------------------ ambientes
      await p.goto(`${url}?abrir=0`)
      await abrirPlantaDeAmbientes(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await bt.waitFor()
      expect(await topoCabe(p)).toBe(true)
      await bt.click()
      await escolha.selectOption('3')
      expect(await escolha.locator('option:checked').innerText()).toBe('3. Primeira fiada conferida')
      expect(await conta()).toBe('0 de 20 OK')
      // a sala do 101 (101-03)
      await tocarEm(320, 480)
      await aviso('101-03 · Primeira fiada conferida: OK')
      const AMB = (await registros(p)).at(-1)!
      expect(AMB).toMatchObject({ ficha: 'f0000000-0000-0000-0000-000000000003', item: 3, r: 'C' })
      expect(await p.getByTestId('fvs-painel').count()).toBe(0)
      if (PRINTS) await p.screenshot({ path: `${PRINTS}/por_item_${nome}_ambientes.png` })
      // trocar o serviço no topo troca a ficha: o item passa ao primeiro do reboco, e a cor e a conta são do reboco
      await p.getByTestId('fvs-servico').selectOption({ label: 'Reboco (ficha de teste)' })
      await expect.poll(() => escolha.locator('option:checked').innerText()).toBe('1. Alvenaria liberada')
      expect(await conta()).toBe('0 de 20 OK')
      await tocarEm(320, 480)
      await aviso('101-03 · Alvenaria liberada: OK')
      expect((await registros(p)).at(-1)).toMatchObject({ el: AMB.el, ficha: 'f0000000-0000-0000-0000-000000000004', item: 1, r: 'C' })
      // de volta à alvenaria: o item 3 guardado volta, com o OK do 101-03
      await p.getByTestId('fvs-servico').selectOption({ label: 'Alvenaria (ficha de teste)' })
      await expect.poll(() => escolha.locator('option:checked').innerText()).toBe('3. Primeira fiada conferida')
      await expect.poll(conta).toBe('1 de 20 OK')

      expect(await p.evaluate((o: string) => localStorage.getItem(`fvs_toques:${o}`), OBRA)).toBeNull()
      expect(await semRolagemHorizontal(p)).toBe(0)
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: o voltar do aparelho fecha o que está aberto antes de sair da planta`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0`)
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.waitForTimeout(300)
      const painel = p.getByTestId('fvs-painel')
      const zoom = p.locator('.fv-zoom')

      // painel aberto: voltar fecha o painel e fica na planta
      await buscar(p, 'P4')
      await nomeNoPainel(p, 'P4')
      await p.goBack()
      await painel.waitFor({ state: 'detached' })
      expect(await p.locator('.fv-mapa').count()).toBe(1)

      // trocar de peça com o painel aberto não acumula voltas: um voltar só fecha
      await buscar(p, 'P4')
      await nomeNoPainel(p, 'P4')
      await buscar(p, 'P5')
      await nomeNoPainel(p, 'P5')
      await p.goBack()
      await painel.waitFor({ state: 'detached' })

      // imagem ampliada: voltar fecha só a imagem, o painel continua
      await buscar(p, 'P4')
      await nomeNoPainel(p, 'P4')
      await p.locator('.fv-det img').click()
      await zoom.waitFor()
      await p.goBack()
      await zoom.waitFor({ state: 'detached' })
      await nomeNoPainel(p, 'P4')

      // o botão Fechar da imagem e o do painel também desfazem a volta: nada sobra no histórico
      await p.locator('.fv-det img').click()
      await zoom.waitFor()
      await p.locator('.fv-zoom-fechar').click()
      await zoom.waitFor({ state: 'detached' })
      await nomeNoPainel(p, 'P4')
      await p.locator('.fv-cab button').click()
      await painel.waitFor({ state: 'detached' })
      await p.waitForTimeout(100)
      expect(await p.locator('.fv-mapa').count()).toBe(1)
      await p.goBack()
      await noInicio(p)

      // o "‹" do topo sai da planta de uma vez, com o painel aberto
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.waitForTimeout(300)
      await buscar(p, 'P4')
      await nomeNoPainel(p, 'P4')
      await p.locator('.fv-topo .fv-voltar').click()
      await noInicio(p)

      // veio da lista: a peça abre com o painel; voltar devolve à lista
      await p.getByTestId('fvs-entra-reprovacoes').click()
      const linhas = p.getByTestId('fvs-rep')
      await linhas.first().waitFor()
      await linhas.first().locator('button.fv-rep').click()
      await nomeNoPainel(p, 'P2')
      await p.goBack()
      await linhas.first().waitFor()

      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: busca de peça na obra inteira, a partir do início`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0`)
      await noInicio(p)
      const busca = p.getByTestId('fvs-busca-obra')
      const linhas = p.getByTestId('fvs-busca-linha')

      // sem texto, nada de lista; com texto, a peça, o pavimento e a situação
      expect(await linhas.count()).toBe(0)
      await busca.fill('p2')
      await linhas.first().waitFor()
      const primeira = (await linhas.first().textContent()) ?? ''
      for (const parte of ['P2', 'Pilar', 'Pavimento de teste', '20x60', 'Com NC']) expect(primeira).toContain(parte)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_busca_${nome}.png`) })

      // só o número também acha, com a viga junto
      await busca.fill('4')
      await p.waitForFunction(() => document.querySelector('[data-testid=fvs-busca-linha]')?.textContent?.startsWith('P4'))
      expect(await p.evaluate(() => [...document.querySelectorAll('[data-testid=fvs-busca-linha] b')].slice(0, 2).map((b) => b.textContent))).toEqual(['P4', 'V4'])

      // nada encontrado
      await busca.fill('P999')
      await p.getByTestId('fvs-busca-vazia').waitFor()

      // o toque leva à peça, com o painel aberto; ao voltar, a busca continua lá
      await busca.fill('P4')
      await p.waitForFunction(() => document.querySelector('[data-testid=fvs-busca-linha] b')?.textContent === 'P4')
      await linhas.first().locator('button').click()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await nomeNoPainel(p, 'P4')
      await p.locator('.fv-topo .fv-voltar').click()
      await linhas.first().waitFor()
      expect(await busca.inputValue()).toBe('P4')

      // a situação acompanha o que foi marcado
      await busca.fill('')
      expect(await linhas.count()).toBe(0)

      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: lote marcado por engano se desfaz; o histórico do item fica no painel`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0`)
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.waitForTimeout(300)
      const desfazer = p.getByTestId('fvs-desfazer')
      const ultimos = async () => {
        const m = new Map<string, string | null>()
        for (const e of await registros(p)) m.set(`${e.el}|${e.item}`, e.r)
        return [...m.values()].filter(Boolean).length
      }

      // Etapa C no painel: desfazer limpa os itens que o lote marcou
      await buscar(p, 'P4')
      await nomeNoPainel(p, 'P4')
      // o botão diz o que marca (C), não "A" (achado do Testador, 09/11)
      expect(await p.locator('.fv-etapa-tit button').first().innerText()).toBe('Etapa C (2)')
      await p.locator('.fv-etapa-tit button').first().click()
      await p.locator('.fv-toast', { hasText: 'P4: 2 itens C em condições de início' }).waitFor()
      // o aviso não cobre o painel (Fechar) nem a barra de cima (Testador, 09/11), nem com texto longo
      await p.locator('.fv-toast span').evaluate((e: HTMLElement) => (e.textContent = 'Foto guardada. Vai para o servidor quando houver internet.'))
      const cobertos = await p.evaluate(() => {
        const a = document.querySelector('.fv-toast')!.getBoundingClientRect()
        const cruza = (r: DOMRect) => a.left < r.right && r.left < a.right && a.top < r.bottom && r.top < a.bottom
        return ['.fv-painel', '.fv-topo', '.fv-cab button'].filter((s) => {
          const e = document.querySelector(s)
          return e && cruza(e.getBoundingClientRect())
        })
      })
      expect(cobertos, 'aviso por cima de').toEqual([])
      // celular: com o painel aberto sobra pouca planta; o aviso é uma faixa baixa colada no painel (desde
      // 20/11 o texto quebra em vez de cortar: aqui são duas linhas, da altura do botão Desfazer)
      if (largura < 700) {
        const faixa = await p.evaluate(() => {
          const a = document.querySelector('.fv-toast')!.getBoundingClientRect()
          const pn = document.querySelector('.fv-painel')!.getBoundingClientRect()
          return { altura: a.height, folga: pn.top - a.bottom }
        })
        expect(faixa.altura).toBeLessThanOrEqual(48)
        expect(Math.abs(faixa.folga)).toBeLessThanOrEqual(1)
      }
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_aviso_${nome}.png`) })
      const marcadosComA = p.locator('.fv-item button[data-r="C"].on')
      await expect.poll(() => marcadosComA.count(), { timeout: 5000 }).toBe(2)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_lote_${nome}_1_desfazer.png`) })
      await desfazer.click()
      await p.locator('.fv-toast', { hasText: 'Desfeito: 2 itens' }).waitFor()
      await expect.poll(() => marcadosComA.count(), { timeout: 5000 }).toBe(0)
      expect(await ultimos()).toBe(0)

      // item que mudou depois do lote fica como está
      await p.locator('.fv-etapa-tit button').first().click()
      await p.locator('.fv-toast', { hasText: '2 itens C' }).waitFor()
      await item(p, 1, 'NA').click()
      await p.locator('.fv-item[data-item="1"] button[data-r="NA"].on').waitFor()
      await desfazer.click()
      await p.locator('.fv-toast', { hasText: 'Desfeito: 1 item' }).waitFor()
      await expect.poll(() => p.locator('.fv-item[data-item="2"] button.on').count(), { timeout: 5000 }).toBe(0)
      expect(await p.locator('.fv-item[data-item="1"] button[data-r="NA"].on').count()).toBe(1)

      // o que foi marcado e desfeito não entra na lista para lançar; só o NA
      await p.locator('.fv-cab button').click()

      // pincel: o toque errado também se desfaz, e a cor da peça volta
      await p.locator('.fv-bpincel').click()
      await p.getByTestId('fvs-pincel').waitFor()
      await verFolhaInteira(p)
      await tocarNaPlanta(p, 150 + 3 * 300, 150) // centro do P4... da grade: coluna 3, linha 0
      await p.locator('.fv-toast', { hasText: 'P4' }).waitFor()
      const antes = await ultimos()
      await desfazer.click()
      await p.locator('.fv-toast', { hasText: /Desfeito: \d+ ite/ }).waitFor()
      expect(await ultimos()).toBeLessThan(antes)
      await p.getByTestId('fvs-pincel').getByRole('button', { name: 'Sair' }).click()

      // histórico do item: o R com o texto e a foto continuam acessíveis depois da reinspeção
      await buscar(p, 'P5')
      await nomeNoPainel(p, 'P5')
      await item(p, 3, 'NC').click()
      const campo = p.locator('.fv-item[data-item="3"] textarea')
      await campo.waitFor()
      await campo.fill('Fora de esquadro')
      await campo.blur()
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
      await p.locator('.fv-item[data-item="3"] input[type=file]').setInputFiles({ name: 'nc.png', mimeType: 'image/png', buffer: png })
      await p.locator('.fv-item[data-item="3"] .fv-foto-mini img').waitFor()
      expect(await p.getByTestId('fvs-hist').count()).toBe(0) // o R que vale aparece aberto, não no histórico
      await item(p, 3, 'C').click()
      await p.locator('.fv-item[data-item="3"] button[data-r="C"].on').waitFor()
      const hist = p.locator('.fv-item[data-item="3"]').getByTestId('fvs-hist')
      await hist.waitFor()
      expect(await hist.locator('summary').innerText()).toContain('Reprovado antes: V01')
      await hist.locator('summary').click()
      expect(await hist.innerText()).toContain('Fora de esquadro')
      await hist.locator('.fv-foto-mini img').waitFor()
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.locator('.fv-item[data-item="3"]').screenshot({ path: path.join(PRINTS, `fvs_lote_${nome}_2_hist.png`) })

      // R desmarcado por engano não vira histórico
      await item(p, 4, 'NC').click()
      await p.locator('.fv-item[data-item="4"] textarea').waitFor()
      await p.locator('.fv-item[data-item="4"] .fv-link').click()
      await p.locator('.fv-item[data-item="4"] textarea').waitFor({ state: 'detached' })
      await item(p, 4, 'C').click()
      await p.locator('.fv-item[data-item="4"] button[data-r="C"].on').waitFor()
      expect(await p.locator('.fv-item[data-item="4"]').getByTestId('fvs-hist').count()).toBe(0)

      // mas todos os registros continuam acessíveis, do mais novo para o mais antigo
      const todos = p.getByTestId('fvs-hist-peca')
      await todos.locator('summary').click()
      const linhasDoHistorico = await todos.locator('li').allInnerTexts()
      expect(linhasDoHistorico[0]).toContain('C item 4')
      expect(linhasDoHistorico[1]).toContain('Desmarcado item 4')
      expect(linhasDoHistorico[2]).toContain('NC item 4')
      expect(linhasDoHistorico.some((l: string) => l.includes('Fora de esquadro'))).toBe(true)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)

      // o que foi marcado e desfeito não entra na lista para lançar: do P4 só fica o NA
      await p.locator('.fv-topo .fv-voltar').click()
      await noInicio(p)
      await p.getByTestId('fvs-entra-lancamento').click()
      const fichas = p.getByTestId('fvs-lan-ficha')
      await fichas.first().waitFor()
      const doP4 = fichas.filter({ hasText: 'P4' })
      expect(await doP4.count()).toBe(1)
      expect(await doP4.locator('.fv-lan-item').count()).toBe(1)
      expect(await doP4.locator('.fv-lan-res').innerText()).toBe('NA')

      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: sem internet, tudo o que está no aparelho continua funcionando`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&revisao=1`)
      const pavimento = p.getByTestId('fvs-pavimento')
      await noInicio(p)
      expect(await pavimento.count()).toBe(1)
      await naDisciplina(p, 'estrutura')
      const linha = p.getByTestId('fvs-secao-estrutura').locator('li', { hasText: 'Trecho 1' })
      await linha.getByRole('button', { name: 'Abrir R00' }).waitFor()

      await contexto.setOffline(true)
      await p.locator('.faixa-aviso', { hasText: 'Sem internet' }).waitFor()
      // não dá para baixar a revisão nova, e a tela diz por quê; a planta que está aqui abre
      expect(await linha.getByRole('button', { name: /^Baixar R01/ }).isDisabled()).toBe(true)
      await linha.getByRole('button', { name: 'Abrir R00' }).click()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.waitForTimeout(300)
      expect(await p.locator('.fv-pend', { hasText: 'sem internet' }).count()).toBe(1)
      const faixa = p.getByTestId('fvs-baixar-revisao')
      expect(await faixa.isDisabled()).toBe(true)
      expect(await faixa.innerText()).toBe('Baixe com internet')

      // marca, escreve, tira foto, usa o lote e desfaz: nada disso depende da rede
      await buscar(p, 'P4')
      await nomeNoPainel(p, 'P4')
      const antes = (await registros(p)).length
      await item(p, 1, 'C').click()
      await p.locator('.fv-item[data-item="1"] button[data-r="C"].on').waitFor()
      await item(p, 3, 'NC').click()
      const campo = p.locator('.fv-item[data-item="3"] textarea')
      await campo.waitFor()
      await campo.fill('Marcado sem internet')
      await campo.blur()
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
      await p.locator('.fv-item[data-item="3"] input[type=file]').setInputFiles({ name: 'nc.png', mimeType: 'image/png', buffer: png })
      await p.locator('.fv-item[data-item="3"] .fv-foto-mini img').waitFor()
      await p.locator('.fv-etapa-tit button').first().click()
      await p.getByTestId('fvs-desfazer').click()
      await p.locator('.fv-toast', { hasText: 'Desfeito' }).waitFor()
      const marcados = (await registros(p)).slice(antes)
      expect(marcados.some((e) => e.obs === 'Marcado sem internet')).toBe(true)

      // listas e busca também
      await p.locator('.fv-topo .fv-voltar').click()
      await noInicio(p)
      await p.getByTestId('fvs-busca-obra').fill('P4')
      await p.getByTestId('fvs-busca-linha').first().waitFor()
      await p.getByTestId('fvs-busca-obra').fill('')
      await p.getByTestId('fvs-entra-reprovacoes').click()
      const rep = p.getByTestId('fvs-rep')
      await rep.first().waitFor()
      expect((await rep.first().textContent()) ?? '').toContain('Marcado sem internet')
      await rep.first().locator('.fv-rep-foto img').waitFor() // a foto ainda está no aparelho
      await p.locator('.fv-reprovacoes .fv-voltar').click()
      await noInicio(p)

      // a internet volta: a revisão nova pode ser baixada
      await contexto.setOffline(false)
      await p.waitForFunction(() => !document.querySelector('.faixa-aviso')?.textContent?.includes('Sem internet'))
      await naDisciplina(p, 'estrutura')
      expect(await linha.getByRole('button', { name: /^Baixar R01/ }).isEnabled()).toBe(true)

      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: o que fazer é gravado se a pessoa sai do app logo depois de digitar`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0`)
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.waitForTimeout(300)
      await buscar(p, 'P4')
      await nomeNoPainel(p, 'P4')
      await item(p, 1, 'NC').click()
      const campo = p.locator('.fv-item[data-item="1"] textarea')
      await campo.waitFor()
      await campo.fill('Texto digitado às pressas')
      // o app vai para o fundo antes de passar 1 s, com o campo ainda em foco
      await p.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await expect.poll(async () => (await registros(p)).at(-1)!.obs, { timeout: 5000 }).toBe('Texto digitado às pressas')

      // no celular, ao tocar no campo ele sobe para o alto do painel, onde o teclado não cobre
      if (largura < 700) {
        await p.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }))
        await p.locator('.fv-corpo').evaluate((c: Element) => c.scrollTo(0, 0))
        await campo.focus()
        await p.waitForTimeout(450)
        const naAlturaCerta = await campo.evaluate((e: Element) => {
          const r = e.getBoundingClientRect()
          const c = e.closest('.fv-corpo')!.getBoundingClientRect()
          return r.top - c.top < c.height / 3
        })
        expect(naAlturaCerta).toBe(true)
      }

      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: revisão nova da ficha não apaga o que já foi marcado; relógio atrasado avisa`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0`)
      const pavimento = p.getByTestId('fvs-pavimento')
      await noInicio(p)
      const abrirTrecho = async () => {
        await abrirForma(p)
        await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
        await p.waitForTimeout(300)
      }
      await abrirTrecho()

      // P4 marcado inteiro na rev. 0: liberado
      await buscar(p, 'P4')
      await nomeNoPainel(p, 'P4')
      // o botão de cada etapa some quando ela fica completa
      const etapas = p.locator('.fv-etapa-tit button')
      for (let n = await etapas.count(); n > 0; n = await etapas.count()) {
        await etapas.first().click()
        await p.waitForFunction((m: number) => document.querySelectorAll('.fv-etapa-tit button').length < m, n)
      }
      // tudo marcado, sem concretagem cadastrada: azul (achado #2, 24/11)
      await p.waitForFunction(() => document.querySelector('.fv-sit')?.textContent === 'Liberado p/ concretar')
      await p.locator('.fv-topo .fv-voltar').click()
      await noInicio(p)
      expect(await pavimento.innerText()).toContain('0 de 62 peças liberadas · 2 p/ concretar')

      // sai a rev. 1 da ficha, com outros itens. Chega também um registro do servidor, com hora "no futuro"
      await p.evaluate(`(async () => {
        const { banco } = await import('/src/nucleo/servicos.ts')
        const ficha = await banco.registros.get(['fichas_modelo', 'f0000000-0000-0000-0000-000000000001'])
        await banco.registros.put({ ...ficha, id: 'f0000000-0000-0000-0000-000000000099', linha: { ...ficha.linha, id: 'f0000000-0000-0000-0000-000000000099', revisao: '1', itens: ficha.linha.itens.slice(0, 2) } })
        const planta = await banco.registros.get(['plantas', 'a2000000-0000-0000-0000-0000000000f1'])
        await banco.registros.put({ ...planta, linha: { ...planta.linha, criado_em_servidor: new Date(Date.now() + 3600000).toISOString() } })
      })()`)
      await p.goto(`${url}?abrir=0`)
      await noInicio(p)

      // o que estava liberado (para concretar) continua assim, na revisão em que foi marcado
      expect(await pavimento.innerText()).toContain('0 de 62 peças liberadas · 2 p/ concretar')
      const relogio = p.getByTestId('fvs-relogio')
      await relogio.waitFor()
      expect(await relogio.innerText()).toContain('estão atrasadas')
      await abrirTrecho()
      await buscar(p, 'P4')
      await nomeNoPainel(p, 'P4')
      expect(await p.locator('.fv-sit').first().innerText()).toBe('Liberado p/ concretar')
      expect(await p.locator('.fv-item').count()).toBe(7)
      const naFicha = p.getByTestId('fvs-ficha-do-painel')
      expect(await naFicha.innerText()).toContain('rev. 0 (a vigente é a rev. 1; esta peça foi marcada nesta)')
      // ficha, revisão, dispositivo, tolerância e "toque na imagem para ampliar": nada abaixo de 14 px (revisão da 06, 20/11)
      const rotulos = await p.locator('.fv-painel .fv-mt, .fv-painel .fv-dica, .fv-painel .fv-ficha').evaluateAll((l: Element[]) => l.map((e): [number, string | null] => [parseFloat(getComputedStyle(e).fontSize), e.textContent]))
      expect(rotulos.length).toBeGreaterThan(0)
      expect(rotulos.filter((r: [number, string | null]) => r[0] < 14)).toEqual([])

      // peça que não foi marcada já usa a revisão nova
      await buscar(p, 'P5')
      await nomeNoPainel(p, 'P5')
      expect(await p.locator('.fv-item').count()).toBe(2)
      expect(await naFicha.innerText()).toContain('rev. 1')
      expect(await naFicha.innerText()).not.toContain('vigente')

      // registro com hora depois da do aparelho: o toque é gravado com a hora real, e o item avisa quem marcou e quando
      await p.evaluate(`(async () => {
        const { banco } = await import('/src/nucleo/servicos.ts')
        const base = (await banco.registros.get(['fichas_modelo', 'f0000000-0000-0000-0000-000000000099'])).linha
        await banco.registros.put({ tabela: 'fvs_eventos', id: 'f9000000-0000-0000-0000-000000000999', obra_id: base.obra_id, pendente: 0, linha: { ...base, itens: undefined, id: 'f9000000-0000-0000-0000-000000000999', elemento_id: 'e0000000-0000-0000-0000-000000000006', ficha_id: 'f0000000-0000-0000-0000-000000000099', item: 1, resultado: 'A', rodada: 1, usuario_id: 'outra', criado_em_dispositivo: new Date(Date.now() + 86400000).toISOString() } })
      })()`)
      await p.goto(`${url}?abrir=0`)
      await noInicio(p)
      // no início da FVS: há registro mais de 10 min à frente, com quem marcou e a data com o ano
      const naFrente = p.getByTestId('fvs-registro-na-frente')
      await naFrente.waitFor()
      const amanha = new Date(Date.now() + 86400000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })
      expect(await naFrente.innerText()).toContain('outra pessoa')
      expect(await naFrente.innerText()).toContain(amanha)
      await naFrente.getByText('Como acertar').click()
      expect(await naFrente.innerText()).toContain('Data e hora automáticas')
      await abrirTrecho()
      await buscar(p, 'P6')
      await nomeNoPainel(p, 'P6')
      const antes = (await registros(p)).length
      await item(p, 1, 'NC').click()
      await expect.poll(async () => (await registros(p)).length, { timeout: 5000 }).toBe(antes + 1)
      // continua valendo o C "do futuro", e o item diz por quê, sem sumir
      expect(await p.locator('.fv-item[data-item="1"] button[data-r="C"].on').count()).toBe(1)
      const doItem = p.getByTestId('fvs-hora-na-frente')
      await doItem.waitFor()
      expect(await doItem.innerText()).toContain('outra pessoa')
      expect(await doItem.innerText()).toContain('A sua foi gravada')
      expect(await p.locator('.fv-toast', { hasText: 'Confira a data' }).count()).toBe(0)
      if (process.env.SO_PRINTS) await p.screenshot({ path: `${process.env.SO_PRINTS}/s1_hora_${nome}.png` })

      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: revisão nova da prancha não tira a planta antiga do aparelho antes da hora`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const capturar = async (passo: string) => {
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_rev_${nome}_${passo}.png`) })
      }
      const pacotes = (): Promise<string[]> =>
        p.evaluate(`(async () => {
          const { pacotesNoAparelho } = await import('/src/fvs/pacote.ts')
          return [...(await pacotesNoAparelho()).keys()]
        })()`)
      const PLANTA_R00 = 'a2000000-0000-0000-0000-0000000000f1'
      const PLANTA_R01 = 'a2000000-0000-0000-0000-0000000000f3'

      // a R01 foi publicada: o cadastro chegou, o pacote ainda não
      await p.goto(`${url}?abrir=0&revisao=1`)
      const pavimento = p.getByTestId('fvs-pavimento')
      await noInicio(p)
      expect(await pavimento.count()).toBe(1)
      await naDisciplina(p, 'estrutura')
      const linha = p.getByTestId('fvs-secao-estrutura').locator('li', { hasText: 'Trecho 1' })
      await linha.getByRole('button', { name: 'Abrir R00' }).waitFor()
      expect(await linha.innerText()).toContain('no aparelho ainda está a R00')
      await linha.getByRole('button', { name: /^Baixar R01/ }).waitFor()
      expect(await pacotes()).toContain(PLANTA_R00)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await capturar('1_inicio')

      // a planta abre na revisão que está aqui, com aviso, e o registro guarda essa revisão
      await linha.getByRole('button', { name: 'Abrir R00' }).click()
      const aviso = p.getByTestId('fvs-revisao-antiga')
      await aviso.waitFor()
      expect(await aviso.innerText()).toContain('Planta na revisão R00. Já saiu a R01.')
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.waitForTimeout(300)
      await buscar(p, 'P4')
      await nomeNoPainel(p, 'P4')
      await item(p, 1, 'C').click()
      await p.locator('.fv-item[data-item="1"] button[data-r="C"].on').waitFor()
      expect((await registros(p)).at(-1)!.planta).toBe(PLANTA_R00)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await capturar('2_planta')
      await p.locator('.fv-topo .fv-voltar').click()
      await noInicio(p)

      // pela lista também: a peça abre na revisão que está aqui, em vez de pedir para baixar
      await p.getByTestId('fvs-entra-reprovacoes').click()
      await p.getByTestId('fvs-rep').first().waitFor()
      await p.getByTestId('fvs-rep').first().locator('button.fv-rep').click()
      await nomeNoPainel(p, 'P2')
      await aviso.waitFor()

      // baixa pela própria planta: passa a mostrar a nova, o painel continua e o aviso some
      await p.getByTestId('fvs-baixar-revisao').click()
      await aviso.waitFor({ state: 'detached' })
      await nomeNoPainel(p, 'P2')
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await item(p, 3, 'C').click()
      await p.locator('.fv-item[data-item="3"] button[data-r="C"].on').waitFor()
      expect((await registros(p)).at(-1)!.planta).toBe(PLANTA_R01)

      // de volta ao início: a anterior saiu do aparelho, a nova ficou
      await p.locator('.fv-topo .fv-voltar').click()
      await p.getByTestId('fvs-rep').first().waitFor()
      await p.locator('.fv-reprovacoes .fv-voltar').click()
      await noInicio(p)
      // com a R01 no aparelho, a forma vira as opções (Pilares, Vigas...), sem o aviso da revisão
      await naDisciplina(p, 'estrutura')
      await p.locator('[data-testid=fvs-opcao-forma][data-tipo=P]').waitFor()
      expect(await p.getByTestId('fvs-secao-estrutura').innerText()).not.toContain('no aparelho ainda')
      await expect.poll(pacotes, { timeout: 5000 }).not.toContain(PLANTA_R00)
      expect(await pacotes()).toContain(PLANTA_R01)

      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: planta fora do aparelho baixa dali mesmo, sem voltar ao início`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&revisao=1`)
      const pavimento = p.getByTestId('fvs-pavimento')
      await noInicio(p)
      await pavimento.first().click()
      await p.getByTestId('fvs-mais-pavimento').click()
      await p.getByTestId('fvs-tirar-pavimento').waitFor()
      p.once('dialog', (d: any) => d.accept())
      await p.getByTestId('fvs-tirar-pavimento').click()
      // quem diz que as plantas saíram é o "⋯ Mais" sumir (não sobra nada no aparelho)
      await p.getByTestId('fvs-tirar-pavimento').waitFor({ state: 'detached' })
      await naDisciplina(p, 'estrutura')
      expect(await p.getByTestId('fvs-secao-estrutura').getByRole('button', { name: 'Abrir R00' }).count()).toBe(0)

      // chega à planta por um caminho que não passa pelo início (o seletor de trecho, por exemplo)
      await p.goto(`${url}?revisao=1`)
      const fora = p.getByTestId('fvs-fora-do-aparelho')
      await fora.waitFor()
      const texto = await fora.innerText()
      expect(texto).toContain('Esta planta ainda não está no aparelho')
      expect(texto).toContain('TESTE.ES.LO.001.FOR-R01')
      // guia (22/11): o voltar é só a seta (44 px), como no cabeçalho comum
      const seta = fora.getByRole('button', { name: 'Voltar', exact: true })
      expect((await seta.innerText()).trim()).toBe('‹')
      expect((await seta.boundingBox())!.width).toBeGreaterThanOrEqual(44)
      // no canto esquerdo da tela dela (no tablet a coluna é centralizada)
      expect((await seta.boundingBox())!.x - (await fora.boundingBox())!.x).toBeLessThan(40)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_fora_${nome}.png`) })

      await p.getByTestId('fvs-baixar-agora').click()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      expect(await p.getByTestId('fvs-revisao-antiga').count()).toBe(0)
      expect(await p.getByTestId('fvs-fora-do-aparelho').count()).toBe(0)

      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: revisão nova chega com a planta aberta e a pessoa continua onde está`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0`)
      await noInicio(p)
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.waitForTimeout(300)
      await buscar(p, 'P4')
      await nomeNoPainel(p, 'P4')
      await item(p, 1, 'NC').click()
      await p.locator('.fv-item[data-item="1"] textarea').waitFor()

      // chega o cadastro da R01; a foto é o que faz a tela reler o aparelho
      await p.evaluate(`(async () => {
        const { banco } = await import('/src/nucleo/servicos.ts')
        const planta = await banco.registros.get(['plantas', 'a2000000-0000-0000-0000-0000000000f1'])
        await banco.registros.put({ ...planta, id: 'a2000000-0000-0000-0000-0000000000f3', linha: { ...planta.linha, id: 'a2000000-0000-0000-0000-0000000000f3', revisao: 'R01', substitui_id: 'a2000000-0000-0000-0000-0000000000f1' } })
      })()`)
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
      await p.locator('.fv-item[data-item="1"] input[type=file]').setInputFiles({ name: 'nc.png', mimeType: 'image/png', buffer: png })
      await p.getByTestId('fvs-revisao-antiga').waitFor()

      // não voltou para o início, o painel continua na peça e dá para continuar marcando
      await nomeNoPainel(p, 'P4')
      expect(await p.getByTestId('fvs-pavimento').count()).toBe(0)
      await item(p, 2, 'C').click()
      await p.locator('.fv-item[data-item="2"] button[data-r="C"].on').waitFor()

      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: mesma prancha publicada de novo (mesma revisão, id novo): "Planta atualizada · Baixar de novo"`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0&revisao=mesma`)
      await noInicio(p)
      // já na lista de pavimentos e no menu do pavimento, antes de entrar (rodada 9 do testador, 24/11)
      const cartao = p.getByTestId('fvs-pavimento').first()
      await cartao.getByTestId('fvs-aviso-revisao-pavimento').waitFor()
      expect((await cartao.innerText()).replace(/\s+/g, ' ')).toContain('Planta atualizada · Baixar de novo')
      expect(await cartao.innerText()).not.toContain('No aparelho')
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_planta_atualizada_lista_${nome}.png`) })
      await cartao.click()
      const estrutura = p.locator('[data-testid=fvs-disciplina][data-disciplina=estrutura]')
      expect(await estrutura.getByTestId('fvs-aviso-revisao-disciplina').innerText()).toBe('Planta atualizada · Baixar de novo')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await naDisciplina(p, 'estrutura')
      const linha = p.getByTestId('fvs-secao-estrutura').locator('li', { hasText: 'Trecho 1' })
      const aviso = linha.getByTestId('fvs-aviso-revisao')
      await aviso.waitFor()
      expect(await aviso.innerText()).toBe('Planta atualizada · Baixar de novo')
      expect(await linha.innerText()).not.toContain('Revisão nova')
      await linha.getByRole('button', { name: 'Abrir', exact: true }).waitFor()
      const baixar = linha.getByRole('button', { name: /^Baixar de novo/ })
      expect(await baixar.isDisabled()).toBe(false)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_planta_atualizada_${nome}.png`) })
      // dentro da planta, a faixa também não fala em revisão nova
      await linha.getByRole('button', { name: 'Abrir', exact: true }).click()
      const faixa = p.getByTestId('fvs-revisao-antiga')
      await faixa.waitFor()
      expect(await faixa.innerText()).toContain('Planta atualizada no servidor.')
      expect(await p.getByTestId('fvs-baixar-revisao').innerText()).toMatch(/^Baixar de novo/)
      // baixa: a faixa sai
      await p.getByTestId('fvs-baixar-revisao').click()
      await faixa.waitFor({ state: 'detached' })
      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: lista de fichas duplicadas e atalhos`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(`${url}?abrir=0`)
      const entrada = p.getByTestId('fvs-entra-duplicadas')
      await entrada.waitFor()
      expect(await entrada.innerText()).toContain('1 peça com ficha duplicada no Construpoint')
      await entrada.click()

      // as duas situações na mesma linha
      const linhas = p.getByTestId('fvs-dup')
      await linhas.first().waitFor()
      expect(await p.getByTestId('fvs-dup-contagem').innerText()).toBe('1 peça com mais de uma ficha no Construpoint')
      const texto = (await linhas.first().textContent()) ?? ''
      for (const parte of ['P2', 'FVS-TESTE-0002', 'FVS-TESTE-0003', 'Aceito', 'Liberado', 'Pendente Reinspeção', 'Com NC']) expect(texto).toContain(parte)
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_dup_${nome}_1_lista.png`) })

      // o toque abre a peça, na ficha que pede atenção
      await linhas.first().locator('button.fv-rep').click()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await nomeNoPainel(p, 'P2')
      expect(await p.locator('button.fv-aberta.on b').innerText()).toBe('FVS-TESTE-0003')
      await p.locator('.fv-topo .fv-voltar').click()
      await linhas.first().waitFor()
      await p.locator('.fv-duplicadas .fv-voltar').click()
      await noInicio(p)

      // "1 com NC" na planta leva às reprovações daquele trecho, já filtradas
      await abrirForma(p)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.getByTestId('fvs-ver-reprovacoes').click()
      await p.getByTestId('fvs-rep').first().waitFor()
      expect(await p.getByTestId('fvs-rep-trecho').inputValue()).toBe('Trecho 1')
      expect(await p.getByTestId('fvs-rep').count()).toBe(1)
      await p.locator('.fv-reprovacoes .fv-voltar').click()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()

      // busca: peça que não existe no pavimento avisa; a planta de ambientes acha o pilar e vai para o trecho dele
      await p.waitForTimeout(300)
      await buscar(p, 'P999')
      await p.locator('.fv-toast', { hasText: 'P999 não está neste pavimento' }).waitFor()
      await p.locator('.fv-nomes select').selectOption({ label: 'Ambientes' })
      await p.locator('.fv-busca').waitFor()
      await p.waitForTimeout(400)
      await buscar(p, 'P4')
      await nomeNoPainel(p, 'P4')
      expect(await p.locator('.fv-seg button.on').innerText()).toBe('Pilares')
      expect(await p.locator('.fv-nomes select').evaluate((e: HTMLSelectElement) => e.selectedOptions[0].textContent)).toBe('Trecho 1')

      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: peça fica azul quando pode concretar; pendente fica cinza`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      await p.goto(url)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.waitForTimeout(400)

      // a legenda diz as cores: cinza é o padrão, azul é liberado para concretar
      if (largura < 700) await p.getByTestId('fvs-bt-legenda').click()
      const legenda = p.getByTestId('fvs-legenda')
      expect(await legenda.innerText()).toContain('Liberado p/ concretar')
      const corDaLegenda = (texto: string) => legenda.locator('span', { hasText: texto }).locator('i').evaluate((e: HTMLElement) => getComputedStyle(e).borderTopColor)
      expect(await corDaLegenda('Pendente')).toBe('rgb(107, 112, 117)')
      expect(await corDaLegenda('p/ concretar')).toBe('rgb(21, 101, 192)')

      // as cores na planta: quantos polígonos de cada cor (o alvo invisível em volta do nome não conta)
      const coresNaPlanta = (): Promise<Record<string, number>> =>
        p.evaluate(`(() => {
          const c = {}
          window.__fvMapa.eachLayer((l) => {
            const f = l.options && l.options.fillColor
            if (f && l.getLatLngs && l.options.stroke !== false) c[f] = (c[f] || 0) + 1
          })
          return c
        })()`)
      const antes = await coresNaPlanta()
      // só o P1 (ficha toda aceita, sem concretagem cadastrada no Concreto): azul, não verde (achado #2, 24/11)
      expect(antes['#1565c0']).toBe(1)
      expect(antes['#1b5fa8']).toBeUndefined() // o azul antigo do pendente saiu
      expect(antes['#6b7075']).toBeGreaterThan(50) // pendente é cinza

      await buscar(p, 'P4')
      await nomeNoPainel(p, 'P4')
      const situacao = p.locator('.fv-cab .fv-sit')
      expect(await situacao.innerText()).toBe('Pendente')

      // falta um item das etapas antes da concretagem: ainda não
      for (const n of [1, 2, 3, 4]) await item(p, n, n === 4 ? 'NA' : 'C').click()
      await p.locator('.fv-item[data-item="4"] button[data-r="NA"].on').waitFor()
      expect(await situacao.innerText()).toBe('Em andamento')
      expect(await p.getByTestId('fvs-para-concretar').innerText()).toContain('1 p/ concretar') // só o P1

      // o último item antes da concretagem deixa azul, e o topo conta
      await item(p, 5, 'C').click()
      await p.locator('.fv-cab .fv-sit.s-concretagem').waitFor()
      expect(await situacao.innerText()).toBe('Liberado p/ concretar')
      expect(await p.getByTestId('fvs-para-concretar').innerText()).toContain('2 p/ concretar')
      await expect.poll(async () => (await coresNaPlanta())['#1565c0'], { timeout: 5000 }).toBe(2) // a peça na planta ficou azul
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      expect(await topoCabe(p)).toBe(true)

      // marcando a própria concretagem continua azul; um R tira; a reinspeção devolve
      await item(p, 6, 'C').click()
      await p.locator('.fv-item[data-item="6"] button[data-r="C"].on').waitFor()
      expect(await situacao.innerText()).toBe('Liberado p/ concretar')
      await item(p, 3, 'NC').click()
      await p.locator('.fv-cab .fv-sit.s-reprovado').waitFor()
      expect(await p.getByTestId('fvs-para-concretar').innerText()).toContain('1 p/ concretar')
      await item(p, 3, 'C').click()
      await p.locator('.fv-cab .fv-sit.s-concretagem').waitFor()

      // a ficha inteira sem concretagem cadastrada no Concreto: continua azul (achado #2, 24/11)
      await item(p, 7, 'C').click()
      await p.locator('.fv-item[data-item="7"] button[data-r="C"].on').waitFor()
      expect(await situacao.innerText()).toBe('Liberado p/ concretar')
      expect(await p.getByTestId('fvs-para-concretar').innerText()).toContain('2 p/ concretar')
      await item(p, 7, 'C').click() // desmarca
      await p.locator('.fv-item[data-item="7"] button[data-r="C"]:not(.on)').waitFor()
      await p.locator('.fv-cab .fv-sit.s-concretagem').waitFor()

      // filtrando uma etapa, a pergunta é outra: a cor diz se aquela etapa terminou
      await p.locator('.fv-etapa').selectOption('MONTAGEM')
      await p.waitForTimeout(100)
      expect(await p.getByTestId('fvs-para-concretar').count()).toBe(0)
      await p.locator('.fv-etapa').selectOption('')

      // o início conta à parte
      await p.goto(`${url}?abrir=0`)
      const pavimento = p.getByTestId('fvs-pavimento')
      await noInicio(p)
      expect(await pavimento.innerText()).toContain('2 p/ concretar')

      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)

    it(`${nome} ${largura}x${altura}: área de laje desenhada na planta e ligada a uma ficha`, async () => {
      const contexto = await navegador.newContext({ ...NO_BRASIL, viewport: { width: largura, height: altura }, hasTouch: largura < 700 })
      const p: Page = await contexto.newPage()
      const erros: string[] = []
      p.on('pageerror', (e: Error) => erros.push(e.message))
      const capturar = async (passo: string) => {
        if (PRINTS) await p.screenshot({ path: path.join(PRINTS, `fvs_laje_${nome}_${passo}.png`) })
      }
      const areasGravadas = (): Promise<Array<Record<string, any>>> =>
        p.evaluate(`(async () => {
          const { sincronizador } = await import('/src/nucleo/servicos.ts')
          return sincronizador.linhas('fvs_areas', '${OBRA}')
        })()`)
      const eventosGravados = (): Promise<Array<Record<string, any>>> =>
        p.evaluate(`(async () => {
          const { sincronizador } = await import('/src/nucleo/servicos.ts')
          return (await sincronizador.linhas('fvs_eventos', '${OBRA}')).filter((e) => e.area_id)
        })()`)

      await p.goto(url)
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await p.waitForTimeout(400)

      // a aba Lajes aparece na planta de forma, e sem área nenhuma explica o que fazer
      await p.locator('.fv-seg button', { hasText: 'Lajes' }).click()
      await p.getByTestId('fvs-dica-area').waitFor()
      expect(await p.getByTestId('fvs-progresso').innerText()).toContain('0/0 liberadas')
      expect(await topoCabe(p)).toBe(true)
      await verFolhaInteira(p)
      await capturar('1_aba')

      // o voltar do aparelho cancela o desenho, sem sair da planta
      await p.getByTestId('fvs-nova-area').click()
      const barra = p.getByTestId('fvs-desenho')
      await barra.waitFor()
      await tocarNaPlanta(p, 470, 470)
      await barra.locator('b', { hasText: '1 canto' }).waitFor()
      await p.goBack()
      await barra.waitFor({ state: 'detached' })
      expect(await p.locator('.fv-mapa').count()).toBe(1)

      // desenha: toque em peça vira canto, e não abre o painel
      await p.getByTestId('fvs-nova-area').click()
      await barra.waitFor()
      expect(await barra.locator('b').innerText()).toContain('0 cantos')
      expect(await p.getByTestId('fvs-concluir-area').isDisabled()).toBe(true)
      await tocarNaPlanta(p, 470, 470)
      await tocarNaPlanta(p, 1070, 470)
      await barra.locator('b', { hasText: '2 cantos' }).waitFor()
      expect(await p.getByTestId('fvs-painel').count()).toBe(0)
      expect(await p.getByTestId('fvs-concluir-area').isDisabled()).toBe(true)

      // um canto errado sai com "Desfazer ponto" (longe da barra do desenho, que tem botões de 44 px)
      await tocarNaPlanta(p, 1700, 1050)
      await barra.locator('b', { hasText: '3 cantos' }).waitFor()
      await p.getByTestId('fvs-desfazer-ponto').click()
      await barra.locator('b', { hasText: '2 cantos' }).waitFor()

      await tocarNaPlanta(p, 1070, 730)
      await tocarNaPlanta(p, 470, 730)
      await barra.locator('b', { hasText: '4 cantos' }).waitFor()
      await capturar('2_desenho')

      // tocar no primeiro canto fecha e abre a caixa que liga à ficha
      await tocarNaPlanta(p, 470, 470)
      const caixa = p.getByTestId('fvs-caixa-nova')
      await caixa.waitFor()
      expect(await barra.count()).toBe(0)
      expect(await p.getByTestId('fvs-caixa-nome').inputValue()).toBe('Laje 1')
      const opcoes = await p.getByTestId('fvs-caixa-ficha').locator('option').allTextContents()
      expect(opcoes[0]).toBe('TESTE-PVS-LAJE Laje (ficha de teste)')
      expect(opcoes.some((o: string) => o.includes('Alvenaria'))).toBe(false) // ficha de ambiente não entra
      await p.getByTestId('fvs-caixa-codigo').fill('FVS-1-LAJE-0042')
      expect(await semRolagemHorizontal(p)).toBeLessThanOrEqual(0)
      await capturar('3_caixa')

      // sem nome não cria
      await p.getByTestId('fvs-caixa-nome').fill('   ')
      expect(await p.getByTestId('fvs-caixa-criar').isDisabled()).toBe(true)
      await p.getByTestId('fvs-caixa-nome').fill('Laje Trecho A')
      await p.getByTestId('fvs-caixa-criar').click()

      // cria, abre o painel na ficha e aparece na planta como pendente, em cinza
      await nomeNoPainel(p, 'Laje Trecho A')
      const info = await p.locator('.fv-inf').innerText()
      expect(info).toContain('Laje')
      expect(info).toContain('49 m²') // 600 x 260 pontos, na escala 1:50
      expect(await p.getByTestId('fvs-area-info').innerText()).toContain('FVS-1-LAJE-0042')
      expect(await p.getByTestId('fvs-ficha-do-painel').innerText()).toContain('TESTE-PVS-LAJE')
      expect(await p.locator('.fv-painel select[aria-label="Ficha"]').count()).toBe(0) // a ficha foi escolhida na caixa
      expect(await p.getByTestId('fvs-painel').innerText()).not.toContain('detalhe desta peça')
      const caixaNaPlanta = p.getByTestId('fvs-caixa-area')
      expect(await caixaNaPlanta.innerText()).toBe('Laje Trecho A')
      // a cor da caixa muda no efeito depois do desenho, um quadro depois do painel: esperar, não ler
      const corDaCaixa = (s: string) => expect.poll(() => caixaNaPlanta.getAttribute('class'), { timeout: 5000 }).toContain(s)
      await corDaCaixa('s-nada')
      const [gravada] = await areasGravadas()
      expect(gravada.area_id).toBe(gravada.id)
      // o toque cai no pixel: na tela pequena, 1 pixel são uns 5 pontos da folha
      const desenhados: Array<[number, number]> = [[470, 470], [1070, 470], [1070, 730], [470, 730]]
      expect(gravada.contorno.length).toBe(4)
      gravada.contorno.forEach(([x, y]: [number, number], i: number) => {
        expect(Math.abs(x - desenhados[i][0])).toBeLessThan(8)
        expect(Math.abs(y - desenhados[i][1])).toBeLessThan(8)
      })
      expect(gravada.codigo_ficha).toBe('FVS-1-LAJE-0042')
      expect(gravada.cancelada).toBe(false)
      expect(gravada.planta_id).toBeTruthy()
      expect(gravada.setor_id).toBeTruthy()

      // marca os itens antes da concretagem: a área fica azul, a mesma regra das peças
      await item(p, 1, 'C').click()
      await item(p, 2, 'C').click()
      await p.locator('.fv-item[data-item="2"] button[data-r="C"].on').waitFor()
      await corDaCaixa('s-andamento')
      await item(p, 3, 'C').click()
      await p.locator('.fv-cab .fv-sit.s-concretagem').waitFor()
      await corDaCaixa('s-concretagem')
      expect(await p.getByTestId('fvs-para-concretar').innerText()).toContain('1 p/ concretar')
      const marcados = await eventosGravados()
      expect(marcados.length).toBe(3)
      expect(marcados.every((e) => e.area_id === gravada.id && !e.elemento_id && e.ficha_id && e.planta_id)).toBe(true)
      await capturar('4_azul')

      // fora da aba Lajes, a área não rouba o toque de quem marca pilar e viga; a caixa continua tocável
      await p.locator('.fv-cab button').click()
      await p.locator('.fv-seg button', { hasText: 'Pilares' }).click()
      await p.waitForTimeout(100)
      // com zoom na área: na folha inteira em 375 px, um toque cobre 40 pontos e sempre pega alguma viga
      await p.evaluate(() => {
        ;(window as any).__fvMapa.fitBounds([[-760, 440], [-460, 1100]], { animate: false })
      })
      await p.waitForTimeout(200)
      await tocarNaPlanta(p, 1000, 695) // dentro da área, longe das vigas e da caixa com o nome
      await p.waitForTimeout(150)
      expect(await p.getByTestId('fvs-painel').count()).toBe(0)
      await p.locator('.fv-seg button', { hasText: 'Lajes' }).click()
      await p.waitForTimeout(100)
      await tocarNaPlanta(p, 1000, 695)
      await nomeNoPainel(p, 'Laje Trecho A')
      await p.locator('.fv-cab button').click()
      await p.locator('.fv-seg button', { hasText: 'Pilares' }).click()
      await caixaNaPlanta.click()
      await nomeNoPainel(p, 'Laje Trecho A')
      expect(await p.locator('.fv-seg button.on').innerText()).toBe('Lajes')

      // redesenhar: a laje avançou. Contorno novo, as marcações continuam
      await p.getByTestId('fvs-redesenhar-area').click()
      await barra.waitFor()
      await barra.locator('b', { hasText: 'Novo contorno de Laje Trecho A' }).waitFor()
      await verFolhaInteira(p)
      for (const [x, y] of [[470, 470], [1370, 470], [1370, 730], [470, 730]]) await tocarNaPlanta(p, x, y)
      await p.getByTestId('fvs-concluir-area').click()
      await nomeNoPainel(p, 'Laje Trecho A')
      await p.locator('.fv-toast', { hasText: 'Contorno de Laje Trecho A atualizado' }).waitFor()
      expect(await p.locator('.fv-cab .fv-sit').innerText()).toBe('Liberado p/ concretar')
      expect((await areasGravadas()).length).toBe(2)
      expect(await p.locator('.fv-inf').innerText()).toContain('73 m²')

      // desenho que se cruza é recusado, com o motivo, e continua desenhando
      await p.getByTestId('fvs-redesenhar-area').click()
      await barra.waitFor()
      await verFolhaInteira(p)
      for (const [x, y] of [[470, 470], [1370, 730], [1370, 470], [470, 730]]) await tocarNaPlanta(p, x, y)
      await p.getByTestId('fvs-concluir-area').click()
      await p.locator('.fv-toast', { hasText: 'se cruzam' }).waitFor()
      expect(await barra.count()).toBe(1)
      await barra.getByRole('button', { name: 'Cancelar' }).click()
      await nomeNoPainel(p, 'Laje Trecho A')
      expect((await areasGravadas()).length).toBe(2)

      // a busca acha a área pelo nome, com espaço
      await p.locator('.fv-cab button').click()
      await buscar(p, 'laje trecho a')
      await nomeNoPainel(p, 'Laje Trecho A')

      // fechar e abrir de novo: continua lá, azul
      await p.reload()
      await p.locator('.fv-mapa .leaflet-tile').first().waitFor()
      await caixaNaPlanta.waitFor()
      await corDaCaixa('s-concretagem')

      // o início mostra o quanto da laje está liberado, e a busca da obra acha
      await p.goto(`${url}?abrir=0`)
      const pavimento = p.getByTestId('fvs-pavimento')
      await noInicio(p)
      expect(await p.getByTestId('fvs-resumo-lajes').innerText()).toContain('73 de 73 m²')
      // a área não entra na conta de peças da forma
      expect(await pavimento.innerText()).toContain('de 62 peças liberadas')
      await p.getByTestId('fvs-busca-obra').fill('Laje Trecho')
      const achada = p.getByTestId('fvs-busca-linha').first()
      await achada.waitFor()
      // textContent: a linha usa content-visibility, e antes do primeiro desenho o innerText vem vazio
      expect(await achada.locator('.fv-sit').textContent()).toBe('Liberado p/ concretar')
      await achada.locator('button').click()
      await nomeNoPainel(p, 'Laje Trecho A')

      // apagar: pergunta, some da planta e o que foi marcado fica guardado
      let texto = ''
      p.once('dialog', (d: any) => {
        texto = d.message()
        return d.dismiss()
      })
      await p.getByTestId('fvs-apagar-area').click()
      await p.waitForTimeout(100)
      expect(texto).toContain('Apagar Laje Trecho A')
      expect(await caixaNaPlanta.count()).toBe(1)
      p.once('dialog', (d: any) => d.accept())
      await p.getByTestId('fvs-apagar-area').click()
      await p.locator('.fv-toast', { hasText: 'Laje Trecho A apagada' }).waitFor()
      await p.waitForFunction(() => !document.querySelector('[data-testid=fvs-caixa-area]'))
      expect(await p.getByTestId('fvs-painel').count()).toBe(0)
      expect((await eventosGravados()).length).toBe(3)
      expect((await areasGravadas()).at(-1)).toBeTruthy()

      expect(erros).toEqual([])
      await contexto.close()
    }, 120_000)
  }
})

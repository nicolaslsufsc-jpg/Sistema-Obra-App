// Dado de obra nunca vai no site publicado (CLAUDE.md: "Dados de obra nunca no repositório").
// O app compilado é público (Cloudflare Pages); a obra chega ao tablet pelo .zip, escolhido no aparelho.
// Em vez de adivinhar o que é dado de obra (foto, prancha, planilha, .obra...), só passa o que o app
// é: a lista abaixo. Qualquer outro arquivo no dist (por exemplo algo deixado em public/) falha o
// build, aqui, no GitHub e no Cloudflare, antes de publicar. Arquivo novo e legítimo do app (um
// ícone, uma fonte): acrescente aqui, com o Professor/Nicolas sabendo.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/** Na raiz do site: a página, o service worker, o manifesto, os cabeçalhos e os ícones (public/). */
const NA_RAIZ = new Set([
  'index.html',
  'nova_obra.html', // Nova obra (docs/modulos/nova_obra.md)
  'sw.js',
  'manifest.webmanifest',
  '_headers',
  'apple-touch-icon.png',
  'icone.svg',
  'tema.js', // tema antes da primeira pintura (src/telas/tema.ts)
  'icone-192.png',
  'icone-512.png',
  'icone-maskable-512.png',
])
/** O código do service worker (workbox-<código>.js) e o código do app em assets/ (só .js, .css e .wasm). */
const PADROES = [/^workbox-[A-Za-z0-9_-]+\.js$/, /^assets\/[A-Za-z0-9._-]+\.(js|mjs|css|wasm)$/ /* .mjs: o worker do pdf.js (Nova obra) */]
const PASTAS = new Set(['assets/'])

/** Os caminhos (relativos, com /; pasta termina em /) que não são do app. Vazio = pode publicar. */
export function foraDoApp(caminhos: string[]): string[] {
  return caminhos.filter((c) => !(NA_RAIZ.has(c) || PASTAS.has(c) || PADROES.some((r) => r.test(c))))
}

/**
 * Nomes que não podem estar no código publicado (decisão do Nicolas em 08/11/2026, "Tirar o nome"):
 * o nome das obras e das empresas. O nome real chega ao aparelho no índice do pacote (.zip).
 * A lista fica FORA do repositório, para o próprio repositório não ter nome de empresa nenhum:
 * `nomes_proibidos.txt` na raiz do repositório (ignorado pelo git), ou a variável NOMES_PROIBIDOS
 * (no GitHub, um segredo), uma palavra ou expressão por linha. Na variável, também separados por ";":
 * o painel do Cloudflare Pages só aceita uma linha. Sem lista, só a outra trava vale.
 */
export function lerNomesProibidos(raizDoRepositorio: string, doAmbiente = process.env.NOMES_PROIBIDOS ?? ''): string[] {
  let doArquivo = ''
  try {
    doArquivo = readFileSync(path.join(raizDoRepositorio, 'nomes_proibidos.txt'), 'utf-8')
  } catch {
    // sem arquivo: segue com o que veio da variável
  }
  return [...new Set(`${doArquivo}\n${doAmbiente.replace(/;/g, '\n')}`.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')))]
}

/** Sem acento e em minúsculas, com os escapes do JS compilado (ã, \x41) já trocados pela letra. */
function normalizar(t: string): string {
  return t
    .replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/g, (_, a, b, c) => String.fromCodePoint(parseInt(a ?? b ?? c, 16)))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function padraoDoNome(nome: string): RegExp {
  // Sem diferença de maiúsculas e acentos. Entre as palavras do nome: espaço, hífen, _, ponto ou nada.
  // Sigla (nome todo em maiúsculas, sem espaço): não pode ter letra grudada dos lados, mas _ e
  // algarismo contam como separador (pega "dados_XYZ" e "XYZ2", não pega a sigla dentro de outra palavra).
  const partes = normalizar(nome).split(/[\s_-]+/).filter(Boolean).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const corpo = partes.join('[\\s_.-]*')
  return nome === nome.toUpperCase() && !/\s/.test(nome) ? new RegExp(`(?<![a-z])${corpo}(?![a-z])`) : new RegExp(corpo)
}
/** Arquivos de texto do site (o .wasm e as imagens não são código nosso nem texto). */
const DE_TEXTO = /\.(js|css|html|webmanifest)$|^_headers$/

/** Os nomes proibidos (da lista) que aparecem neste texto. */
export function nomesNoTexto(texto: string, nomes: readonly string[]): string[] {
  const t = normalizar(texto)
  return nomes.filter((n) => padraoDoNome(n).test(t))
}

/** No GitHub (CI=true), a lista tem de existir: sem o segredo NOMES_PROIBIDOS a trava ficaria desligada calada. */
export function exigirListaNoCi(nomes: readonly string[], ambiente: NodeJS.ProcessEnv = process.env): void {
  if (ambiente.CI === 'true' && !nomes.length) {
    throw new Error('No GitHub, a lista de nomes proibidos está vazia: cadastre o segredo NOMES_PROIBIDOS no repositório (Settings > Secrets and variables > Actions).')
  }
}

function listar(raiz: string, pasta = ''): string[] {
  return readdirSync(path.join(raiz, pasta), { withFileTypes: true }).flatMap((e) => {
    const rel = pasta ? `${pasta}/${e.name}` : e.name
    return e.isDirectory() ? [rel + '/', ...listar(raiz, rel)] : [rel]
  })
}

/** Confere a pasta de saída inteira depois de gravar (inclui o que veio de public/). */
export function semDadosDeObra(): Plugin {
  let saida = ''
  let proibidos: string[] = []
  return {
    name: 'sem-dados-de-obra',
    apply: 'build',
    configResolved(c) {
      saida = path.resolve(c.root, c.build.outDir)
      proibidos = lerNomesProibidos(path.resolve(c.root, '..'))
      exigirListaNoCi(proibidos)
    },
    closeBundle() {
      const nomes = listar(saida)
        .filter((c) => DE_TEXTO.test(c))
        .flatMap((c) => nomesNoTexto(readFileSync(path.join(saida, c), 'utf-8'), proibidos).map(() => `um nome da lista em ${c}`))
      if (nomes.length) {
        throw new Error(`Nome de obra ou de empresa (nomes_proibidos.txt) no site compilado: ${nomes.slice(0, 5).join(', ')}. O nome real vem só no pacote da obra (.zip).`)
      }
      const achados = foraDoApp(listar(saida))
      if (achados.length) {
        throw new Error(
          `Arquivo que não é do app no site compilado (${saida}): ${achados.slice(0, 5).join(', ')}${achados.length > 5 ? '…' : ''}. ` +
            'Dado de obra não vai no site (tire de app/public/; a obra vai ao tablet pelo .zip). ' +
            'Se for um arquivo novo do próprio app, acrescente na lista de app/sem_dados_de_obra.ts.',
        )
      }
    },
  }
}

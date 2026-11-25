// Planilha de controle do concreto no modelo da obra (pedido do Nicolas, 21/11/2026).
//
// O modelo é DADO DA OBRA: o .xlsx que a construtora já usa, vazio ou com dados antigos. Ele nunca
// entra no repositório (no repositório só o modelo de exemplo da obra EXE, modeloExe()). O app
// preenche só a tabela de rastreamento (uma linha por caminhão) e deixa o resto do arquivo como
// veio: as outras abas, os estilos, os gráficos e as fórmulas. Nas colunas com fórmula, a linha
// nova recebe a fórmula da primeira linha de dados do modelo, ajustada para a linha dela, e a
// Tabela do Excel cresce até a última linha. O que o app sabe a mais (peças, horários, CPs um a um)
// vai em colunas extras, depois da tabela. O Excel recalcula tudo ao abrir.
//
// Layout (LAYOUT_PADRAO): em qual aba e em qual coluna vai cada informação. É o layout comum de
// "rastreamento de concreto" (data, NF, volume, elemento, local, pavimento, fck 7 e 28 dias...).

import type { ArquivosXlsx } from './xlsx'
import { desescaparXml, escaparXml, gravarTexto, letrasDaColuna, separarCelula, serialDoExcel, texto } from './xlsx'
import { itemDaLista, itemNoComeco, listasDasColunas, localSemPavimento, pavimentoDeFundacao } from './planilha_listas'

export type CampoDaLinha = 'data' | 'nota_fiscal' | 'volume' | 'tipo' | 'setor' | 'pavimento' | 'fck_7' | 'fck_28' | 'observacao' | 'fornecedor'

export interface LayoutPlanilha {
  /** nome da aba com a tabela de rastreamento */
  aba: string
  /** coluna (letra) de cada informação; o que não estiver aqui fica com a fórmula ou em branco */
  colunas: Partial<Record<CampoDaLinha, string>>
  /** o que vai no fck quando o CP ainda não rompeu (as fórmulas do modelo leem "-" como "não ensaiado") */
  semResultado: string
  /**
   * tipo de elemento pelas peças do caminhão (P pilar, V viga, L laje). O texto tem que ser igual ao da
   * lista do modelo: o app usa o texto do modelo quando só muda espaço ou maiúscula ("Vigas " = "vigas").
   */
  tipos: Record<string, string>
}

export const LAYOUT_PADRAO: LayoutPlanilha = {
  aba: 'Rastreamento',
  colunas: { data: 'A', nota_fiscal: 'B', volume: 'C', tipo: 'D', setor: 'E', pavimento: 'F', fck_7: 'J', fck_28: 'K', fornecedor: 'R', observacao: 'S' },
  semResultado: '-',
  tipos: { P: 'Pilar', V: 'Vigas', L: 'Laje', VL: 'Lajes e Vigas', PV: 'Pilar, viga e laje', PL: 'Pilar, viga e laje', PVL: 'Pilar, viga e laje', outro: 'Outro' },
}

/** Colunas extras, depois da tabela do modelo: o que o app registra e a planilha não tem. */
export const EXTRAS = [
  'Caminhão nº',
  'Peças (Sistema Obra)',
  'Saída da usina',
  'Chegada na obra',
  'Início da descarga',
  'Fim da descarga',
  'Slump medido (cm)',
  'Água adicionada (L)',
  'CPs moldados',
  'CPs 7 dias (MPa)',
  'CPs 28 dias (MPa)',
  'Outras idades (MPa)',
  'fck da concretagem (MPa)',
  'Fornecedor',
  'Código da ficha no sistema oficial',
  'Observação da concretagem',
] as const

export const TITULO_EXTRAS = 'INFORMAÇÕES A MAIS (SISTEMA OBRA)'

export type Valor = string | number | null

export interface LinhaControle {
  data: string
  nota_fiscal: string | null
  volume: number | null
  tipo: string
  setor: string
  pavimento: string
  /** exemplar de 7 e 28 dias (o maior CP da idade, como na NBR 12655); null = ainda não rompeu */
  fck_7: number | null
  fck_28: number | null
  observacao: string | null
  fornecedor: string | null
  /** caminhão só de fundação (estaca, bloco): o pavimento vira o item de fundações da lista do modelo */
  fundacao: boolean
  /** na ordem de EXTRAS */
  extras: Valor[]
}

// ---------------------------------------------------------------------
// Linhas: uma por caminhão, a partir do que o Concreto tem
// ---------------------------------------------------------------------

export interface ConcretagemDaPlanilha {
  raiz: string
  data: string
  pavimento: string
  local_descricao: string
  codigo_oficial: string | null
  fornecedor: string | null
  fck_mpa: number
  observacao: string | null
}

export interface CaminhaoDaPlanilha {
  sequencia: number
  nota_fiscal: string | null
  volume_m3: number | null
  saida_usina: string | null
  chegada_obra: string | null
  inicio_descarga: string | null
  fim_descarga: string | null
  slump_medido_cm: number | null
  agua_adicionada_l: number | null
  cps_moldados: number | null
  observacao: string | null
  /** peças do caminhão (relatorio.ts), na ordem do relatório */
  pecas: Array<{ nome: string; tipo: string; fracao: number | null; parcial: boolean }>
  resultados: Array<{ idade_dias: number; numero_cp: number; resistencia_mpa: number }>
}

const hora = (iso: string | null): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const ordemNatural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

/** Rótulo de fundação quando o modelo da obra não traz um. */
const TIPOS_FUNDACAO: Readonly<Record<string, string>> = { S: 'Estaca', K: 'Bloco', SK: 'Estaca e bloco' }

/** Tipo de elemento pelas peças: só pilar = P, viga e laje = VL... Sem peça = "outro". */
export function tipoDoCaminhao(pecas: readonly { tipo: string }[], layout: LayoutPlanilha): string {
  const tem = new Set(pecas.map((p) => p.tipo))
  const estrutura = ['P', 'V', 'L'].filter((t) => tem.has(t)).join('')
  const fundacao = ['S', 'K'].filter((t) => tem.has(t)).join('')
  // fundações (22/11): caminhão só de estaca e/ou bloco; o modelo da obra pode não ter esses nomes
  if (fundacao && !estrutura) return layout.tipos[fundacao] ?? TIPOS_FUNDACAO[fundacao]
  return layout.tipos[estrutura + fundacao] ?? layout.tipos[estrutura] ?? layout.tipos.outro ?? ''
}

function textoDasPecas(pecas: CaminhaoDaPlanilha['pecas']): string {
  return pecas.map((p) => (p.parcial && p.fracao !== null ? `${p.nome} (${Math.round(p.fracao * 100)}%)` : p.nome)).join(', ')
}

/** O exemplar da idade: o maior CP rompido naquela idade (NBR 12655). */
export function exemplar(resultados: CaminhaoDaPlanilha['resultados'], idade: number): number | null {
  const v = resultados.filter((r) => r.idade_dias === idade).map((r) => r.resistencia_mpa)
  return v.length ? Math.max(...v) : null
}

const listaDeCps = (r: CaminhaoDaPlanilha['resultados'], idade: number) =>
  r
    .filter((x) => x.idade_dias === idade)
    .sort((a, b) => a.numero_cp - b.numero_cp)
    .map((x) => String(x.resistencia_mpa).replace('.', ','))
    .join(' / ') || null

export function linhaDoCaminhao(conc: ConcretagemDaPlanilha, c: CaminhaoDaPlanilha, layout: LayoutPlanilha = LAYOUT_PADRAO): LinhaControle {
  const outras = [...new Set(c.resultados.map((r) => r.idade_dias).filter((i) => i !== 7 && i !== 28))]
    .sort((a, b) => a - b)
    .map((i) => `${i} dias: ${listaDeCps(c.resultados, i)}`)
    .join('; ')
  return {
    data: conc.data,
    nota_fiscal: c.nota_fiscal,
    volume: c.volume_m3,
    tipo: tipoDoCaminhao(c.pecas, layout),
    setor: conc.local_descricao,
    pavimento: conc.pavimento,
    fck_7: exemplar(c.resultados, 7),
    fck_28: exemplar(c.resultados, 28),
    observacao: c.observacao,
    fornecedor: conc.fornecedor,
    fundacao: c.pecas.length > 0 && c.pecas.every((p) => p.tipo === 'S' || p.tipo === 'K'),
    extras: [
      c.sequencia,
      textoDasPecas(c.pecas) || null,
      hora(c.saida_usina),
      hora(c.chegada_obra),
      hora(c.inicio_descarga),
      hora(c.fim_descarga),
      c.slump_medido_cm,
      c.agua_adicionada_l,
      c.cps_moldados,
      listaDeCps(c.resultados, 7),
      listaDeCps(c.resultados, 28),
      outras || null,
      conc.fck_mpa,
      conc.fornecedor,
      conc.codigo_oficial,
      conc.observacao,
    ],
  }
}

/** Todas as linhas, por data, local e caminhão (a ordem em que a obra lança). */
export function linhasDaPlanilha(
  itens: ReadonlyArray<{ concretagem: ConcretagemDaPlanilha; caminhoes: readonly CaminhaoDaPlanilha[] }>,
  layout: LayoutPlanilha = LAYOUT_PADRAO,
): LinhaControle[] {
  return [...itens]
    .sort((a, b) => a.concretagem.data.localeCompare(b.concretagem.data) || ordemNatural.compare(a.concretagem.local_descricao, b.concretagem.local_descricao))
    .flatMap(({ concretagem, caminhoes }) =>
      [...caminhoes].sort((a, b) => a.sequencia - b.sequencia).map((c) => linhaDoCaminhao(concretagem, c, layout)),
    )
}

// ---------------------------------------------------------------------
// Preencher o modelo
// ---------------------------------------------------------------------

const RE_LINHA = /<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g
const RE_CELULA = /<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g
const attr = (tag: string, nome: string): string | null => {
  const m = new RegExp(`\\s${nome}="([^"]*)"`).exec(tag)
  return m ? m[1] : null
}
const semAttr = (tag: string, nome: string) => tag.replace(new RegExp(`\\s${nome}="[^"]*"`), '')
const comAttr = (tag: string, nome: string, valor: string) =>
  attr(tag, nome) === null ? tag.replace(/^<(\w+)/, `<$1 ${nome}="${valor}"`) : tag.replace(new RegExp(`(\\s${nome}=")[^"]*(")`), `$1${valor}$2`)

function caminhoRelativo(base: string, alvo: string): string {
  if (alvo.startsWith('/')) return alvo.slice(1)
  const partes = base.split('/').slice(0, -1)
  for (const p of alvo.split('/')) {
    if (p === '..') partes.pop()
    else if (p !== '.') partes.push(p)
  }
  return partes.join('/')
}

function relacoes(a: ArquivosXlsx, de: string): Array<{ id: string; tipo: string; alvo: string }> {
  const nome = de.replace(/([^/]+)$/, '_rels/$1.rels')
  const xml = texto(a, nome)
  if (!xml) return []
  return [...xml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => ({
    id: attr(m[0], 'Id') ?? '',
    tipo: attr(m[0], 'Type') ?? '',
    alvo: caminhoRelativo(de, desescaparXml(attr(m[0], 'Target') ?? '')),
  }))
}

/** Os textos que o modelo já tem (sharedStrings), para usar o mesmo texto da lista dele. */
function textosDoModelo(a: ArquivosXlsx): string[] {
  const xml = texto(a, 'xl/sharedStrings.xml') ?? ''
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => desescaparXml([...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')))
}

const normal = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')
export function rotuloDoModelo(rotulo: string, doModelo: readonly string[]): string {
  if (!rotulo) return rotulo
  return doModelo.find((t) => t === rotulo) ?? doModelo.find((t) => normal(t) === normal(rotulo)) ?? rotulo
}

/** Ajusta as referências relativas da fórmula de uma linha para outra (como "arrastar" no Excel). */
export function moverFormula(f: string, delta: number): string {
  if (delta === 0) return f
  // não mexe no que está entre aspas
  return f
    .split('"')
    .map((parte, i) =>
      i % 2 === 1
        ? parte
        : parte.replace(/(?<![A-Za-z0-9_.\]])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\d(A-Za-z_])/g, (tudo, c1, col, c2, lin) =>
            c2 === '$' ? tudo : `${c1}${col}${Number(lin) + delta}`,
          ),
    )
    .join('"')
}

function celulaComValor(ref: string, estilo: string | null, v: Valor): string {
  const s = estilo !== null ? ` s="${estilo}"` : ''
  if (v === null || v === '') return `<c r="${ref}"${s}/>`
  if (typeof v === 'number') return `<c r="${ref}"${s}><v>${v}</v></c>`
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escaparXml(v)}</t></is></c>`
}

/** Troca ou põe células numa linha, mantendo a ordem das colunas. */
function porNaLinha(linhaXml: string, numero: number, novas: Map<number, string>): string {
  const abre = /^<row\b[^>]*?(\/?)>/.exec(linhaXml)!
  const cab = semAttr(abre[0].replace(/\/>$/, '>'), 'spans')
  const celulas = abre[1] ? [] : [...linhaXml.matchAll(RE_CELULA)].map((m) => m[0])
  const porCol = new Map<number, string>()
  for (const c of celulas) porCol.set(separarCelula(attr(c, 'r')!).col, c)
  for (const [col, c] of novas) porCol.set(col, c)
  void numero
  return `${cab}${[...porCol.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]).join('')}</row>`
}

export interface ResultadoDoPreenchimento {
  linhas: number
  /** última linha da tabela no arquivo gerado */
  ultimaLinha: number
  colunaDosExtras: string
}

/**
 * Preenche o modelo (em `arquivos`, alterado no lugar) com as linhas. Com zero linhas, deixa uma linha
 * vazia só com as fórmulas: é assim que se prepara o modelo vazio da obra a partir da planilha cheia.
 */
export function preencherModelo(arquivos: ArquivosXlsx, linhas: readonly LinhaControle[], layout: LayoutPlanilha = LAYOUT_PADRAO): ResultadoDoPreenchimento {
  // 1. a aba e a tabela
  const wb = texto(arquivos, 'xl/workbook.xml')
  if (!wb) throw new Error('O arquivo não é uma planilha do Excel (.xlsx).')
  const tagAba = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((t) => desescaparXml(attr(t, 'name') ?? '') === layout.aba)
  if (!tagAba) throw new Error(`O modelo não tem a aba "${layout.aba}".`)
  const idAba = attr(tagAba, 'r:id')
  const caminhoAba = relacoes(arquivos, 'xl/workbook.xml').find((r) => r.id === idAba)?.alvo
  if (!caminhoAba || !arquivos.has(caminhoAba)) throw new Error(`Não achei a aba "${layout.aba}" dentro do arquivo.`)
  const tabelas = relacoes(arquivos, caminhoAba).filter((r) => r.tipo.endsWith('/table') && arquivos.has(r.alvo))
  if (!tabelas.length) throw new Error(`A aba "${layout.aba}" não tem uma Tabela do Excel (Inserir > Tabela).`)
  const caminhoTabela = tabelas[0].alvo
  let tabXml = texto(arquivos, caminhoTabela)!
  const refTabela = attr(/<table\b[^>]*>/.exec(tabXml)![0], 'ref')!
  const [ini, fim] = refTabela.split(':').map(separarCelula)
  const temCabecalho = attr(/<table\b[^>]*>/.exec(tabXml)![0], 'headerRowCount') !== '0'
  const linhaCab = ini.linha
  const primeira = temCabecalho ? ini.linha + 1 : ini.linha

  // 2. as linhas da aba
  let aba = texto(arquivos, caminhoAba)!
  const iDados = aba.indexOf('<sheetData')
  const fDados = aba.indexOf('</sheetData>')
  const abreDados = /<sheetData\b[^>]*?(\/?)>/.exec(aba.slice(iDados))!
  const corpo = abreDados[1] ? '' : aba.slice(iDados + abreDados[0].length, fDados)
  const antes: string[] = []
  const prototipos: string[] = []
  const depois: Array<{ r: number; xml: string }> = []
  for (const m of corpo.matchAll(RE_LINHA)) {
    const r = Number(attr(m[0], 'r'))
    if (r < primeira) antes.push(m[0])
    else if (r <= fim.linha) {
      if (prototipos.length < 200) prototipos.push(m[0])
    } else if (/<(v|f|is)\b/.test(m[0])) depois.push({ r, xml: m[0] })
  }

  // 3. o que cada coluna leva numa linha nova: estilo e fórmula da primeira linha de dados que tem.
  // Arquivo já gerado pelo app (tem o título dos extras na linha 1): os extras voltam para o mesmo lugar.
  const linha1 = antes.find((x) => attr(x, 'r') === '1') ?? ''
  const celTitulo = [...linha1.matchAll(RE_CELULA)].map((m) => m[0]).find((c) => c.includes(escaparXml(TITULO_EXTRAS)))
  const extrasAntigos = celTitulo ? separarCelula(attr(celTitulo, 'r')!).col : Infinity
  const estiloDe = new Map<number, string | null>()
  const formulaDe = new Map<number, { f: string; linha: number }>()
  let cabecalhoDaLinha = '<row>'
  let maiorColuna = fim.col
  prototipos.forEach((p, i) => {
    const r = Number(attr(p, 'r'))
    if (i === 0) cabecalhoDaLinha = semAttr(semAttr(/^<row\b[^>]*?>/.exec(p.replace(/\/>$/, '>'))![0], 'r'), 'spans')
    for (const m of p.matchAll(RE_CELULA)) {
      const { col } = separarCelula(attr(m[0], 'r')!)
      if (col >= extrasAntigos) continue
      maiorColuna = Math.max(maiorColuna, col)
      if (!estiloDe.has(col)) estiloDe.set(col, attr(m[0], 's'))
      const f = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(m[0])
      if (f && f[1].trim() && !formulaDe.has(col)) formulaDe.set(col, { f: desescaparXml(f[1]), linha: r })
    }
  })
  const colunaDe = new Map<number, CampoDaLinha>()
  for (const [campo, letra] of Object.entries(layout.colunas) as Array<[CampoDaLinha, string]>) colunaDe.set(separarCelula(`${letra}1`).col, campo)

  const doModelo = textosDoModelo(arquivos)
  const colExtras = Number.isFinite(extrasAntigos) ? extrasAntigos : maiorColuna + 1
  const estiloTexto = estiloDe.get(separarCelula(`${layout.colunas.observacao ?? 'A'}1`).col) ?? null

  // listas suspensas do modelo (tipo, local, pavimento, empreiteira): o texto da linha vira o item da lista
  const listas = listasDasColunas(arquivos, layout.aba)
  const listaDe = (campo: CampoDaLinha) => {
    const letra = layout.colunas[campo]
    return letra ? listas.get(separarCelula(`${letra}1`).col) : undefined
  }
  const pavimentoDe = (l: LinhaControle): string => {
    const lista = listaDe('pavimento')
    if (l.fundacao) {
      const f = pavimentoDeFundacao(lista)
      if (f) return f
    }
    // o local escrito pela obra começa pelo pavimento da lista ("Fundações RESIDENCIAL 1"): vale ele
    return itemNoComeco(l.setor, lista) ?? itemDaLista(l.pavimento, lista) ?? rotuloDoModelo(l.pavimento, doModelo)
  }

  // local: o item que aparece no texto; senão "pavimento + resto" ("Fundações RESIDENCIAL 1" → "FUNDAÇÃO-RESIDENCIAL 1");
  // senão o texto do app sem o pavimento na frente
  const setorDe = (l: LinhaControle): string => {
    const lista = listaDe('setor')
    const pav = pavimentoDe(l)
    const resto = localSemPavimento(l.setor, l.pavimento, pav)
    return itemDaLista(l.setor, lista) ?? itemDaLista(`${pav} ${resto}`, lista) ?? rotuloDoModelo(resto, doModelo)
  }

  const valorDe = (l: LinhaControle, campo: CampoDaLinha): Valor => {
    switch (campo) {
      case 'data':
        return /^\d{4}-\d{2}-\d{2}$/.test(l.data) ? serialDoExcel(l.data) : l.data
      case 'fck_7':
        return l.fck_7 ?? layout.semResultado
      case 'fck_28':
        return l.fck_28 ?? layout.semResultado
      case 'tipo':
        return itemDaLista(l.tipo, listaDe('tipo'), { palavra: true }) ?? rotuloDoModelo(l.tipo, doModelo)
      case 'setor':
        return setorDe(l)
      case 'pavimento':
        return pavimentoDe(l)
      case 'fornecedor':
        return l.fornecedor ? (itemDaLista(l.fornecedor, listaDe('fornecedor'), { contem: true }) ?? l.fornecedor) : null
      default:
        return l[campo]
    }
  }

  const novas: string[] = []
  const total = Math.max(linhas.length, 1)
  for (let i = 0; i < total; i++) {
    const r = primeira + i
    const l = linhas[i] as LinhaControle | undefined
    const cels: string[] = []
    const colunas = new Set<number>([...estiloDe.keys(), ...formulaDe.keys(), ...colunaDe.keys()])
    for (const col of [...colunas].sort((a, b) => a - b)) {
      const ref = `${letrasDaColuna(col)}${r}`
      const estilo = estiloDe.get(col) ?? null
      const campo = colunaDe.get(col)
      const formula = formulaDe.get(col)
      if (l && campo) cels.push(celulaComValor(ref, estilo, valorDe(l, campo)))
      else if (formula) cels.push(`<c r="${ref}"${estilo !== null ? ` s="${estilo}"` : ''}><f>${escaparXml(moverFormula(formula.f, r - formula.linha))}</f></c>`)
      else cels.push(`<c r="${ref}"${estilo !== null ? ` s="${estilo}"` : ''}/>`)
    }
    if (l) l.extras.forEach((v, j) => cels.push(celulaComValor(`${letrasDaColuna(colExtras + j)}${r}`, estiloTexto, v)))
    novas.push(`${comAttr(cabecalhoDaLinha, 'r', String(r))}${cels.join('')}</row>`)
  }
  const ultima = primeira + total - 1

  // 4. títulos das colunas extras: na linha do cabeçalho da tabela, e o título geral na primeira linha
  const linhasAntes = new Map<number, string>(antes.map((x) => [Number(attr(x, 'r')), x]))
  const estiloCab = (() => {
    const x = linhasAntes.get(linhaCab)
    const c = x ? [...x.matchAll(RE_CELULA)].map((m) => m[0]).find((c) => separarCelula(attr(c, 'r')!).col === fim.col) : undefined
    return c ? attr(c, 's') : null
  })()
  const porTitulo = (r: number, cels: Map<number, string>) => {
    const atual = linhasAntes.get(r) ?? `<row r="${r}"/>`
    linhasAntes.set(r, porNaLinha(atual, r, cels))
  }
  porTitulo(linhaCab, new Map(EXTRAS.map((t, j) => [colExtras + j, celulaComValor(`${letrasDaColuna(colExtras + j)}${linhaCab}`, estiloCab, t)])))
  if (linhaCab > 1) porTitulo(1, new Map([[colExtras, celulaComValor(`${letrasDaColuna(colExtras)}1`, estiloCab, TITULO_EXTRAS)]]))

  // 5. linhas com dados depois da tabela (raro): descem junto
  const desloc = ultima - fim.linha
  const depoisMovidas = depois.map(({ r, xml }) =>
    xml
      .replace(/^(<row\b[^>]*?\sr=")(\d+)"/, (_, a) => `${a}${r + desloc}"`)
      .replace(/(<c\b[^>]*?\sr="[A-Z]+)(\d+)"/g, (_, a, n) => `${a}${Number(n) + desloc}"`),
  )

  const ultimaColuna = letrasDaColuna(colExtras + EXTRAS.length - 1)
  const todas = [...[...linhasAntes.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]), ...novas, ...depoisMovidas]
  aba = `${aba.slice(0, iDados)}<sheetData>${todas.join('')}</sheetData>${aba.slice(abreDados[1] ? iDados + abreDados[0].length : fDados + '</sheetData>'.length)}`
  const ultimaDoArquivo = depoisMovidas.length ? depois[depois.length - 1].r + desloc : ultima
  aba = aba.replace(/<dimension\b[^>]*\/>/, `<dimension ref="A1:${ultimaColuna}${ultimaDoArquivo}"/>`)
  aba = aba.replace(/(<pane\b[^>]*\stopLeftCell=")[^"]*"/, `$1A${primeira}"`)
  aba = aba.replace(/(<selection\b[^>]*\sactiveCell=")[^"]*"/, `$1A${primeira}"`).replace(/(<selection\b[^>]*\ssqref=")[^"]*"/, `$1A${primeira}"`)
  gravarTexto(arquivos, caminhoAba, aba)

  // 6. a Tabela cresce (ou encolhe) até a última linha
  const novaRef = `${refTabela.split(':')[0]}:${letrasDaColuna(fim.col)}${ultima}`
  tabXml = tabXml.replace(/(<table\b[^>]*\sref=")[^"]*"/, `$1${novaRef}"`).replace(/(<autoFilter\b[^>]*\sref=")[^"]*"/, `$1${novaRef}"`)
  gravarTexto(arquivos, caminhoTabela, tabXml)

  // 7. o Excel recalcula tudo ao abrir (sem a cadeia de cálculo antiga, que apontava para as linhas velhas)
  if (arquivos.delete('xl/calcChain.xml')) {
    const rels = texto(arquivos, 'xl/_rels/workbook.xml.rels')
    if (rels) gravarTexto(arquivos, 'xl/_rels/workbook.xml.rels', rels.replace(/<Relationship\b[^>]*calcChain[^>]*\/>/g, ''))
    const tipos = texto(arquivos, '[Content_Types].xml')
    if (tipos) gravarTexto(arquivos, '[Content_Types].xml', tipos.replace(/<Override\b[^>]*calcChain[^>]*\/>/g, ''))
  }
  let wbNovo = wb
  const calc = /<calcPr\b[^>]*\/>/.exec(wbNovo)
  wbNovo = calc
    ? wbNovo.replace(calc[0], comAttr(calc[0].replace(/\/>$/, ' />'), 'fullCalcOnLoad', '1').replace(/ \/>$/, '/>'))
    : (() => {
        // calcPr vem antes destes, na ordem do formato
        const depoisDele = /<(oleSize|customWorkbookViews|pivotCaches|smartTagPr|smartTagTypes|webPublishing|fileRecoveryPr|webPublishObjects|extLst)\b/.exec(wbNovo)
        return depoisDele
          ? wbNovo.slice(0, depoisDele.index) + '<calcPr fullCalcOnLoad="1"/>' + wbNovo.slice(depoisDele.index)
          : wbNovo.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>')
      })()
  gravarTexto(arquivos, 'xl/workbook.xml', wbNovo)

  return { linhas: linhas.length, ultimaLinha: ultima, colunaDosExtras: letrasDaColuna(colExtras) }
}

// Listas do modelo da planilha de controle (pedido do Nicolas, 23/11/2026): o tipo de elemento, o
// local, o pavimento e a empreiteira da linha têm de ser um dos itens da lista suspensa da coluna,
// senão as fórmulas e os gráficos do modelo não contam o caminhão. As listas vêm do PRÓPRIO modelo
// (validação de dados "lista" de cada coluna da aba de rastreamento, que aponta para um nome definido
// ou para um intervalo de outra aba). Nada da obra fica no código: outra obra, outro modelo, outras listas.

import type { ArquivosXlsx } from './xlsx'
import { desescaparXml, numeroDaColuna, separarCelula, texto } from './xlsx'

const attr = (tag: string, nome: string): string | null => {
  const m = new RegExp(`\\s${nome}="([^"]*)"`).exec(tag)
  return m ? m[1] : null
}

function caminhoRelativo(base: string, alvo: string): string {
  if (alvo.startsWith('/')) return alvo.slice(1)
  const partes = base.split('/').slice(0, -1)
  for (const p of alvo.split('/')) {
    if (p === '..') partes.pop()
    else if (p !== '.') partes.push(p)
  }
  return partes.join('/')
}

function relacoes(a: ArquivosXlsx, de: string): Map<string, string> {
  const i = de.lastIndexOf('/')
  const rels = texto(a, `${de.slice(0, i + 1)}_rels/${de.slice(i + 1)}.rels`) ?? ''
  return new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], 'Id') ?? '', caminhoRelativo(de, attr(m[0], 'Target') ?? '')]))
}

/** Caminho do XML de cada aba, pelo nome da aba. */
export function abasDoModelo(a: ArquivosXlsx): Map<string, string> {
  const wb = texto(a, 'xl/workbook.xml') ?? ''
  const rel = relacoes(a, 'xl/workbook.xml')
  const m = new Map<string, string>()
  for (const t of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const caminho = rel.get(attr(t[0], 'r:id') ?? '')
    if (caminho) m.set(desescaparXml(attr(t[0], 'name') ?? ''), caminho)
  }
  return m
}

function textosCompartilhados(a: ArquivosXlsx): string[] {
  const xml = texto(a, 'xl/sharedStrings.xml') ?? ''
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => desescaparXml([...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')))
}

/** Valores de um intervalo de uma coluna ("'Aba'!$B$11:$B$40"), na ordem, sem vazio nem "-". */
function valoresDoIntervalo(a: ArquivosXlsx, abas: Map<string, string>, ref: string, comp: string[]): string[] {
  const m = /^'?(.+?)'?!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(ref.trim())
  if (!m) return []
  const xml = texto(a, abas.get(m[1].replace(/''/g, "'")) ?? '')
  if (!xml) return []
  const col = numeroDaColuna(m[2])
  const de = Number(m[3])
  const ate = Number(m[5] ?? m[3])
  const saida: string[] = []
  for (const c of xml.matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)) {
    const r = attr(c[0], 'r')
    if (!r) continue
    const pos = separarCelula(r)
    if (pos.col !== col || pos.linha < de || pos.linha > ate) continue
    const tipo = attr(c[0], 't')
    let v: string | null = null
    if (tipo === 'inlineStr') v = desescaparXml([...c[0].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))
    else {
      const bruto = /<v>([\s\S]*?)<\/v>/.exec(c[0])?.[1]
      if (bruto !== undefined) v = tipo === 's' ? (comp[Number(bruto)] ?? null) : desescaparXml(bruto)
    }
    if (v !== null && v.trim() && v.trim() !== '-') saida.push(v)
  }
  return [...new Set(saida)]
}

/**
 * Lista suspensa de cada coluna (número da coluna → itens) da aba `aba`. Lê as validações de dados
 * comuns e as do Excel novo (x14). Fórmula com nome definido: usa o nome da pasta (sem aba).
 */
export function listasDasColunas(a: ArquivosXlsx, aba: string): Map<number, string[]> {
  const abas = abasDoModelo(a)
  const xml = texto(a, abas.get(aba) ?? '') ?? ''
  const wb = texto(a, 'xl/workbook.xml') ?? ''
  const nomes = new Map<string, string>()
  for (const d of wb.matchAll(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g)) {
    const nome = attr(d[1], 'name')
    // o nome da pasta (sem localSheetId) vale mais que o de uma aba
    if (nome && (attr(d[1], 'localSheetId') === null || !nomes.has(nome))) nomes.set(nome, desescaparXml(d[2]))
  }
  const comp = textosCompartilhados(a)
  const pares: Array<{ formula: string; sqref: string }> = []
  for (const v of xml.matchAll(/<dataValidation\b([^>]*)>([\s\S]*?)<\/dataValidation>/g)) {
    if (attr(v[1], 'type') !== 'list') continue
    const f = /<formula1>([\s\S]*?)<\/formula1>/.exec(v[2])?.[1]
    if (f) pares.push({ formula: desescaparXml(f), sqref: attr(v[1], 'sqref') ?? '' })
  }
  for (const v of xml.matchAll(/<x14:dataValidation\b([^>]*)>([\s\S]*?)<\/x14:dataValidation>/g)) {
    if (attr(v[1], 'type') !== 'list') continue
    const f = /<xm:f>([\s\S]*?)<\/xm:f>/.exec(v[2])?.[1]
    const s = /<xm:sqref>([\s\S]*?)<\/xm:sqref>/.exec(v[2])?.[1]
    if (f && s) pares.push({ formula: desescaparXml(f), sqref: s })
  }
  const listas = new Map<number, string[]>()
  for (const { formula, sqref } of pares) {
    const f = formula.replace(/^=/, '').trim()
    const ref = nomes.get(f) ?? f
    if (ref.startsWith('"')) continue // lista digitada na própria validação: não é do modelo
    const itens = valoresDoIntervalo(a, abas, ref, comp)
    if (!itens.length) continue
    for (const t of sqref.split(/\s+/)) {
      if (!t) continue
      const col = separarCelula(t.split(':')[0]).col
      // a coluna fica com a primeira lista que aparecer
      if (!listas.has(col)) listas.set(col, itens)
    }
  }
  return listas
}

// sem maiúscula, acento, pontuação e plural ("Vigas " = "viga", "2° Pavimento" = "2º pavimento")
const sem = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/°/g, 'º')
    .replace(/[^\p{L}\p{N}º]+/gu, ' ')
    .trim()
    .split(' ')
    .map((p) => (p.length > 3 ? p.replace(/[oa]es$/, 'ao').replace(/s$/, '') : p))
    .join(' ')

/**
 * O item da lista para `valor`: o igual (sem contar maiúscula, acento, pontuação e plural); senão o maior
 * item que aparece inteiro dentro do valor ("Térreo Comercial" → "Térreo"). Opções: `palavra` aceita o
 * primeiro item que começa pela palavra do valor ("Bloco" → "Blocos de fundação"); `contem` aceita o menor
 * item que contém o valor ("Concreteira" → "Concreteira Exemplo Ltda"). Nenhum: null (fica o texto do app).
 */
export function itemDaLista(
  valor: string | null | undefined,
  lista: readonly string[] | undefined,
  opcoes: { palavra?: boolean; contem?: boolean } = {},
): string | null {
  if (!valor || !lista?.length) return null
  const v = sem(valor)
  if (!v) return null
  const igual = lista.find((i) => sem(i) === v)
  if (igual) return igual
  const dentro = lista
    .filter((i) => sem(i).length >= 3 && ` ${v} `.includes(` ${sem(i)} `))
    .sort((a, b) => sem(b).length - sem(a).length)
  if (dentro[0]) return dentro[0]
  if (opcoes.palavra && !v.includes(' ')) {
    const comeca = lista.find((i) => sem(i).startsWith(`${v} `))
    if (comeca) return comeca
  }
  if (opcoes.contem && v.length >= 4) {
    const contem = lista.filter((i) => ` ${sem(i)} `.includes(` ${v} `)).sort((a, b) => a.length - b.length)
    if (contem[0]) return contem[0]
  }
  return null
}

/** O item da lista com que o texto começa ("Fundações LAJE SUB-SETOR 1" → "Fundações"); o maior, se mais de um. */
export function itemNoComeco(valor: string | null | undefined, lista: readonly string[] | undefined): string | null {
  if (!valor || !lista?.length) return null
  const v = `${sem(valor)} `
  return lista.filter((i) => sem(i).length >= 3 && v.startsWith(`${sem(i)} `)).sort((a, b) => sem(b).length - sem(a).length)[0] ?? null
}

/** Item de fundação do pavimento ("Fundações"), se a lista tiver. */
export function pavimentoDeFundacao(lista: readonly string[] | undefined): string | null {
  return lista?.find((i) => sem(i).startsWith('funda')) ?? null
}

/** Tira do começo do local o nome do pavimento e os separadores ("Pilotis \ Trecho 1" → "Trecho 1"). */
export function localSemPavimento(local: string, ...pavimentos: Array<string | null | undefined>): string {
  let s = local.trim()
  for (const p of pavimentos) {
    if (!p) continue
    const re = new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s\\\\/|·-])[\\s\\\\/|·-]*`, 'i')
    s = s.replace(re, '')
  }
  return s.trim() || local.trim()
}

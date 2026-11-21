// Ler a ficha de controle de cópias (.xlsx do Excel) direto no app, sem passar para CSV (21/11/2026).
//
// O modelo é o da ficha de distribuição em uso nas obras: título nas primeiras linhas, cabeçalho
// (CÓDIGO DA PRANCHA, REVISÃO / VERSÃO, DESCRIÇÃO / TÍTULO, DISCIPLINA, Nº DE CÓPIAS ENTREGUES,
// DATA DE ENTREGA, EMPRESA, COLABORADOR, DATA DA DEVOLUÇÃO), às vezes em duas linhas mescladas, e
// as cópias embaixo. As colunas são achadas pelo nome, não pela letra. Datas do Excel (número de
// série) e datas digitadas como texto entram as duas. Lê só a primeira aba.
// A planilha é dado da obra: nunca vai para o repositório.

import { abrirXlsx, desescaparXml, numeroDaColuna, texto, type ArquivosXlsx } from '../concreto/xlsx'
import { normalizar } from './painel'

export type Grade = Map<number, Map<number, string>> // linha → coluna → texto

/** Os campos da distribuição, na ordem em que se procura o nome no cabeçalho. */
const CAMPOS: { campo: string; teste: RegExp }[] = [
  { campo: 'codigo', teste: /CODIGO/ },
  { campo: 'revisao', teste: /REVISAO|VERSAO/ },
  { campo: 'titulo', teste: /DESCRICAO|TITULO/ },
  { campo: 'disciplina', teste: /DISCIPLINA/ },
  { campo: 'copias', teste: /COPIAS/ },
  { campo: 'devolucao', teste: /DEVOLU/ },
  { campo: 'entrega', teste: /ENTREGA/ },
  { campo: 'empresa', teste: /EMPRESA/ },
  { campo: 'colaborador', teste: /COLABORADOR|RECEBEDOR/ },
]

export function campoDoCabecalho(t: string): string | null {
  const s = normalizar(t)
  if (!s) return null
  for (const { campo, teste } of CAMPOS) if (teste.test(s)) return campo
  return null
}

function textosCompartilhados(xml: string | null): string[] {
  if (!xml) return []
  const saida: string[] = []
  for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
    const partes = [...si.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1])
    saida.push(desescaparXml(partes.join('')))
  }
  return saida
}

const DATAS_PADRAO = new Set([14, 15, 16, 17, 22])

/** Índices de estilo (atributo s da célula) cujo formato é de data. */
function estilosDeData(xml: string | null): Set<number> {
  const datas = new Set<number>()
  if (!xml) return datas
  const formatos = new Map<number, string>()
  for (const m of xml.matchAll(/<numFmt\s[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) formatos.set(Number(m[1]), desescaparXml(m[2]))
  const xfs = xml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? ''
  let i = 0
  for (const xf of xfs.match(/<xf\b[^>]*\/?>/g) ?? []) {
    const id = Number(xf.match(/numFmtId="(\d+)"/)?.[1] ?? 0)
    const f = formatos.get(id)
    // formato próprio com dia/mês/ano (e sem ser só hora)
    if (DATAS_PADRAO.has(id) || (f && /[dy]/i.test(f.replace(/"[^"]*"|\[[^\]]*\]/g, '')))) datas.add(i)
    i++
  }
  return datas
}

/** Número de série do Excel → AAAA-MM-DD. */
export function dataDoSerial(n: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000)
  return d.toISOString().slice(0, 10)
}

/** Caminho da primeira aba (pela ordem do workbook.xml). */
function primeiraAba(a: ArquivosXlsx): string {
  const wb = texto(a, 'xl/workbook.xml') ?? ''
  const rid = wb.match(/<sheet\b[^>]*r:id="([^"]+)"/)?.[1]
  const rels = texto(a, 'xl/_rels/workbook.xml.rels') ?? ''
  if (rid) {
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      if (m[0].includes(`Id="${rid}"`)) {
        const alvo = m[0].match(/Target="([^"]+)"/)?.[1]
        if (alvo) return alvo.startsWith('/') ? alvo.slice(1) : 'xl/' + alvo.replace(/^\.\//, '')
      }
    }
  }
  if (a.has('xl/worksheets/sheet1.xml')) return 'xl/worksheets/sheet1.xml'
  throw new Error('O .xlsx não tem nenhuma aba.')
}

/** As células da aba como texto. Data vira AAAA-MM-DD. */
export function lerGrade(a: ArquivosXlsx, aba = primeiraAba(a)): Grade {
  const xml = texto(a, aba)
  if (!xml) throw new Error('O .xlsx não tem a aba indicada.')
  const compartilhados = textosCompartilhados(texto(a, 'xl/sharedStrings.xml'))
  const datas = estilosDeData(texto(a, 'xl/styles.xml'))
  const grade: Grade = new Map()
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1]
    const corpo = m[2] ?? ''
    const ref = attrs.match(/\br="([A-Z]+)(\d+)"/)
    if (!ref) continue
    const tipo = attrs.match(/\bt="([^"]+)"/)?.[1]
    const estilo = Number(attrs.match(/\bs="(\d+)"/)?.[1] ?? -1)
    const v = corpo.match(/<v>([\s\S]*?)<\/v>/)?.[1]
    let valor = ''
    if (tipo === 's') valor = compartilhados[Number(v)] ?? ''
    else if (tipo === 'inlineStr') valor = desescaparXml([...corpo.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''))
    else if (tipo === 'str' || tipo === 'e') valor = desescaparXml(v ?? '')
    else if (tipo === 'b') valor = v === '1' ? 'VERDADEIRO' : 'FALSO'
    else if (v !== undefined) {
      const n = Number(v)
      valor = datas.has(estilo) && Number.isFinite(n) && n > 0 ? dataDoSerial(n) : String(Number.isFinite(n) ? n : v)
    }
    valor = valor.trim()
    if (!valor) continue
    const linha = Number(ref[2])
    if (!grade.has(linha)) grade.set(linha, new Map())
    grade.get(linha)!.set(numeroDaColuna(ref[1]), valor)
  }
  return grade
}

/**
 * As cópias da grade como linhas com os nomes da distribuição (codigo, revisao, titulo, disciplina, copias,
 * entrega, empresa, colaborador, devolucao) e `linha` = número da linha no Excel.
 * O cabeçalho é a primeira linha que tem CÓDIGO; a linha logo abaixo completa nomes que vieram mesclados.
 */
export function linhasDaGrade(grade: Grade): Record<string, string>[] {
  const numeros = [...grade.keys()].sort((a, b) => a - b)
  const iCab = numeros.findIndex((n) => [...grade.get(n)!.values()].some((t) => campoDoCabecalho(t) === 'codigo'))
  if (iCab < 0) throw new Error('Não achei o cabeçalho da ficha (a coluna CÓDIGO DA PRANCHA).')
  const colunas = new Map<number, string>()
  const usados = new Set<string>()
  const marcar = (n: number) => {
    let achou = false
    for (const [col, t] of grade.get(n)!) {
      const campo = campoDoCabecalho(t)
      if (campo && !usados.has(campo) && !colunas.has(col)) {
        colunas.set(col, campo)
        usados.add(campo)
        achou = true
      }
    }
    return achou
  }
  marcar(numeros[iCab])
  // segunda linha do cabeçalho (mesclado): só se for a linha logo abaixo e trouxer nome de coluna novo
  const abaixo = numeros[iCab + 1]
  const ultimoCab = abaixo === numeros[iCab] + 1 && marcar(abaixo) ? abaixo : numeros[iCab]
  const saida: Record<string, string>[] = []
  for (const n of numeros) {
    if (n <= ultimoCab) continue
    const cel = grade.get(n)!
    const l: Record<string, string> = { linha: String(n) }
    for (const campo of usados) l[campo] = ''
    for (const [col, campo] of colunas) l[campo] = cel.get(col) ?? ''
    if (Object.entries(l).some(([k, v]) => k !== 'linha' && v)) saida.push(l)
  }
  return saida
}

/** Linhas da ficha .xlsx (primeira aba), prontas para `distribuicaoDeLinhas`. */
export async function linhasDaFichaXlsx(bytes: Uint8Array): Promise<Record<string, string>[]> {
  return linhasDaGrade(lerGrade(await abrirXlsx(bytes)))
}

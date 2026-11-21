// Exportar o controle do canteiro como a ficha de controle v2 do escritório (.xlsx com as abas FICHA,
// AUTODOC, ESCRITORIO e RESUMO), para quem quiser o Excel (21/11/2026). O app é a fonte; o Excel é cópia.

import { escaparXml, letrasDaColuna, montarXlsx, serialDoExcel, type ArquivosXlsx } from '../concreto/xlsx'
import { resumoPorEmpresa, situacaoFicha, SITUACOES_FICHA, type LinhaEscritorio } from './canteiro'
import { rotuloRev, type CopiaCruzada, type Vigente } from './painel'
import { baixarBlob } from '../nucleo/baixar'

/** Valor de célula: texto, número, data (AAAA-MM-DD, vira data do Excel) ou vazio. */
export type Celula = string | number | { data: string } | null

export interface Aba {
  nome: string
  linhas: Celula[][]
  /** primeira linha = cabeçalho (negrito, congelado e com filtro) */
  cabecalho?: boolean
  larguras?: number[]
}

const cod = new TextEncoder()

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

function celula(ref: string, v: Celula, negrito: boolean): string {
  if (v === null || v === '') return ''
  const s = negrito ? ' s="1"' : ''
  if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"${s}><v>${v}</v></c>` : ''
  if (typeof v === 'object') return /^\d{4}-\d{2}-\d{2}/.test(v.data) ? `<c r="${ref}" s="2"><v>${serialDoExcel(v.data.slice(0, 10))}</v></c>` : ''
  // texto que começa com = + - @ entra como texto mesmo (inlineStr não vira fórmula)
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escaparXml(v)}</t></is></c>`
}

function xmlDaAba(a: Aba): string {
  const ncol = Math.max(1, ...a.linhas.map((l) => l.length))
  const ult = `${letrasDaColuna(ncol)}${Math.max(1, a.linhas.length)}`
  const congelar = a.cabecalho
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
  const cols = a.larguras?.length ? `<cols>${a.larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''
  const linhas = a.linhas
    .map((l, i) => `<row r="${i + 1}">${l.map((v, j) => celula(`${letrasDaColuna(j + 1)}${i + 1}`, v, !!a.cabecalho && i === 0)).join('')}</row>`)
    .join('')
  const filtro = a.cabecalho && a.linhas.length > 1 ? `<autoFilter ref="A1:${ult}"/>` : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${ult}"/>${congelar}${cols}<sheetData>${linhas}</sheetData>${filtro}</worksheet>`
}

/** Nome de aba que o Excel aceita (até 31 caracteres, sem : \ / ? * [ ]). */
const nomeDeAba = (s: string) => s.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Aba'

/** Monta um .xlsx simples (sem fórmulas) com as abas na ordem dada. */
export function planilhaXlsx(abas: readonly Aba[]): Uint8Array<ArrayBuffer> {
  const a: ArquivosXlsx = new Map()
  const tipos = abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
  a.set(
    '[Content_Types].xml',
    cod.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${tipos}</Types>`,
    ),
  )
  a.set(
    '_rels/.rels',
    cod.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
  )
  const usados = new Set<string>()
  const nomes = abas.map((x) => {
    let n = nomeDeAba(x.nome)
    for (let k = 2; usados.has(n.toUpperCase()); k++) n = `${nomeDeAba(x.nome).slice(0, 28)} ${k}`
    usados.add(n.toUpperCase())
    return n
  })
  a.set(
    'xl/workbook.xml',
    cod.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nomes
        .map((n, i) => `<sheet name="${escaparXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    ),
  )
  a.set(
    'xl/_rels/workbook.xml.rels',
    cod.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join('')}<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
  )
  a.set('xl/styles.xml', cod.encode(ESTILOS))
  abas.forEach((x, i) => a.set(`xl/worksheets/sheet${i + 1}.xml`, cod.encode(xmlDaAba(x))))
  return montarXlsx(a)
}

// ---------------------------------------------------------------------------------------------
// As quatro abas da ficha v2
// ---------------------------------------------------------------------------------------------

const data = (d: string | null | undefined): Celula => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? { data: d } : d || null)

export const COLUNAS_FICHA_V2 = [
  'Linha da ficha', 'Data entrega', 'Empresa', 'Colaborador', 'Código', 'Disciplina', 'Título', 'Fase', 'Revisão', 'Cópias',
  'Data devolução', 'Situação', 'Revisão vigente', 'Vigente desde', 'Dias desatualizada', 'Conferir por quê',
] as const

export interface EntradaFichaV2 {
  obra: string
  hoje: string
  /** de onde veio a vigente ("servidor (Autodoc de 21/11/2026)", "lista importada"...) */
  fonteVigente: string
  cruzadas: readonly CopiaCruzada[]
  vigentes: readonly Vigente[]
  escritorio: readonly LinhaEscritorio[]
}

const LARGURAS_FICHA = [8, 12, 26, 20, 10, 16, 40, 6, 9, 7, 12, 12, 12, 12, 10, 34]

/** Aba FICHA: uma linha por cópia, na ordem da ficha, com a Situação. */
export function abaFicha(cruzadas: readonly CopiaCruzada[], nome = 'FICHA'): Aba {
  const ficha: Celula[][] = [
    [...COLUNAS_FICHA_V2],
    ...[...cruzadas]
      .sort((a, b) => a.copia.linha - b.copia.linha)
      .map((x) => {
        const c = x.copia
        const sit = situacaoFicha(x)
        return [
          c.linha,
          data(c.entrega) ?? c.entregaTexto,
          c.empresa,
          c.colaborador,
          c.codigo,
          c.disciplinaNome || c.disciplina,
          c.titulo,
          c.fase,
          c.revisao === null ? c.revisaoTexto : `R${String(c.revisao).padStart(2, '0')}`,
          c.copias,
          data(c.devolucao),
          sit,
          x.vigente ? rotuloRev(x.vigente.fase, x.vigente.revisao) : null,
          x.vigente ? data(x.vigente.data) : null,
          sit === 'RECOLHER' && x.dias !== undefined ? x.dias : null,
          sit === 'CONFERIR' ? x.motivo ?? '' : x.situacao === 'recolhida' ? 'provavelmente recolhida (a empresa tem uma cópia mais nova)' : null,
        ]
      }),
  ]
  return { nome, linhas: ficha, cabecalho: true, larguras: LARGURAS_FICHA }
}

export function abasFichaV2(e: EntradaFichaV2): Aba[] {
  const autodoc: Celula[][] = [
    ['Disciplina', 'Pasta', 'Número', 'Código', 'Fase', 'Revisão', 'Vigente desde', 'Status', 'Título'],
    ...[...e.vigentes]
      .sort((a, b) => a.disciplina.localeCompare(b.disciplina, 'pt-BR') || a.codigo.localeCompare(b.codigo))
      .map((v) => [v.disciplina, v.pasta, v.de === v.ate ? v.de : `${v.de} a ${v.ate}`, v.codigo, v.fase, `R${String(v.revisao).padStart(2, '0')}`, data(v.data), v.status, v.titulo]),
  ]
  const escritorio: Celula[][] = [
    ['Disciplina', 'Código', 'Título', 'Vigente', 'Vigente desde', 'No escritório', 'Situação'],
    ...e.escritorio.map((l) => [
      l.vigente.disciplina,
      l.vigente.codigo,
      l.vigente.titulo,
      rotuloRev(l.vigente.fase, l.vigente.revisao),
      data(l.vigente.data),
      l.registro ? rotuloRev(l.registro.fase, l.registro.revisao) : null,
      l.situacao,
    ]),
  ]
  const porEmpresa = resumoPorEmpresa(e.cruzadas)
  const total = (s: (typeof SITUACOES_FICHA)[number]) => porEmpresa.reduce((n, l) => n + l.porSituacao[s], 0)
  const esc = (s: LinhaEscritorio['situacao']) => e.escritorio.filter((l) => l.situacao === s).length
  const resumo: Celula[][] = [
    ['Controle de cópias de projeto'],
    ['Obra', e.obra],
    ['Data', { data: e.hoje }],
    ['Revisão vigente', e.fonteVigente],
    [],
    ['Empresa', 'Cópias', ...SITUACOES_FICHA],
    ...porEmpresa.map((l) => [l.empresa, l.total, ...SITUACOES_FICHA.map((s) => l.porSituacao[s])]),
    ['TOTAL', e.cruzadas.length, ...SITUACOES_FICHA.map(total)],
    [],
    ['Escritório (pasta do PC)', 'Folhas', 'OK', 'ATUALIZAR', 'CONFERIR', 'SEM CÓPIA'],
    ['', e.escritorio.length, esc('OK'), esc('ATUALIZAR'), esc('CONFERIR'), esc('SEM CÓPIA')],
  ]
  return [
    abaFicha(e.cruzadas),
    { nome: 'AUTODOC', linhas: autodoc, cabecalho: true, larguras: [16, 22, 10, 30, 6, 8, 12, 18, 50] },
    { nome: 'ESCRITORIO', linhas: escritorio, cabecalho: true, larguras: [16, 30, 50, 10, 12, 13, 12] },
    { nome: 'RESUMO', linhas: resumo, larguras: [30, 22, 10, 11, 11, 11] },
  ]
}

export function fichaV2Xlsx(e: EntradaFichaV2): Uint8Array<ArrayBuffer> {
  return planilhaXlsx(abasFichaV2(e))
}

/** Baixa um .xlsx (no celular vai para Downloads; no PC, a pasta de downloads do navegador). */
export function baixarXlsx(nome: string, abas: readonly Aba[]): void {
  baixarBlob(nome, new Blob([planilhaXlsx(abas)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
}

export function nomeFichaV2(codigoObra: string, hoje: string): string {
  return `${hoje}_${codigoObra}_controle_de_copias_ficha_v2.xlsx`
}

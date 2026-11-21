// Modelo de exemplo da planilha de controle do concreto, da obra fictícia EXE ("Obra Exemplo").
// É o único modelo no repositório: o de cada obra é dado da obra e fica fora daqui.
// Tem o que a planilha de controle precisa: aba "Instruções", aba "Rastreamento" com uma Tabela do
// Excel (cabeçalho na linha 3) e fórmulas na primeira linha de dados, e a aba "Parâmetros" com a
// lista de elementos e o fck de cada um (a fórmula do fck do projeto procura nela).

import { LAYOUT_PADRAO } from './planilha_controle'
import { gravarTexto, type ArquivosXlsx } from './xlsx'

const CABECALHO = [
  'Data da concretagem', 'NF do caminhão', 'Volume (m³)', 'Tipo de elemento', 'Local', 'Pavimento',
  'Conferência', 'Repetições', 'Aviso', 'fck 7 dias', 'fck 28 dias', 'fck do elemento', 'fck aprovado?', 'Parecer',
  'fck testemunho', 'Testemunho aprovado?', 'Reforço?', 'Empreiteira', 'Observações', 'Chave',
]
// Mesmo layout de LAYOUT_PADRAO: A data, B NF, C volume, D tipo, E local, F pavimento, G a I conferência
// (fórmulas), J fck 7, K fck 28, L fck do elemento (fórmula), M aprovado? e N parecer (fórmulas),
// O testemunho, P testemunho aprovado? e Q reforço (fórmulas), R empreiteira, S observações, T chave (fórmula)
export const LAYOUT_EXE = LAYOUT_PADRAO

const PARAMETROS: Array<[string, number]> = [
  ['Pilar', 40], ['Vigas ', 40], ['Laje', 35], ['Lajes e Vigas', 35], ['Pilar, viga e laje', 40], ['Outro', 25],
]

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const col = (n: number) => String.fromCharCode(64 + n)
const str = (ref: string, t: string, s = 0) => `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(t)}</t></is></c>`

export function modeloExe(): ArquivosXlsx {
  const a: ArquivosXlsx = new Map()
  gravarTexto(
    a,
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      [1, 2, 3].map((i) => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '<Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>',
  )
  gravarTexto(
    a,
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  )
  gravarTexto(
    a,
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Instruções" sheetId="1" r:id="rId1"/><sheet name="Rastreamento" sheetId="2" r:id="rId2"/><sheet name="Parâmetros" sheetId="3" r:id="rId3"/></sheets>' +
      '<definedNames><definedName name="parametros">\'Parâmetros\'!$A$2:$B$7</definedName></definedNames><calcPr calcId="191029"/></workbook>',
  )
  gravarTexto(
    a,
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      [1, 2, 3].map((i) => `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('') +
      '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
  )
  // estilos: 0 normal, 1 data dd/mm/aaaa, 2 título em negrito, 3 número com 1 casa
  gravarTexto(
    a,
    'xl/styles.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  )
  gravarTexto(
    a,
    'xl/sharedStrings.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${PARAMETROS.length}" uniqueCount="${PARAMETROS.length}">` +
      PARAMETROS.map(([t]) => `<si><t xml:space="preserve">${esc(t)}</t></si>`).join('') +
      '</sst>',
  )
  const ws = (corpo: string, extra = '') =>
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<dimension ref="A1:T4"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${corpo}</sheetData>${extra}</worksheet>`
  gravarTexto(a, 'xl/worksheets/sheet1.xml', ws(`<row r="1">${str('A1', 'Modelo de exemplo (obra EXE). Preencha a aba Rastreamento: uma linha por caminhão.', 2)}</row>`))
  const linha4 =
    '<row r="4">' +
    `<c r="A4" s="1"/><c r="B4" s="0"/><c r="C4" s="3"/><c r="D4" s="0"/><c r="E4" s="0"/><c r="F4" s="0"/>` +
    `<c r="G4" s="0"><f>IF(B4="","",IF(H4=1,"OK","NF repetida"))</f></c>` +
    `<c r="H4" s="0"><f>IF(B4="","",COUNTIF(B:B,B4))</f></c>` +
    `<c r="I4" s="0"><f>IF(G4="NF repetida","Confira a nota fiscal","")</f></c>` +
    `<c r="J4" s="3"/><c r="K4" s="3"/>` +
    `<c r="L4" s="3"><f>IF(D4="","",VLOOKUP(D4,parametros,2,FALSE))</f></c>` +
    `<c r="M4" s="0"><f>IF(L4="","",IF(K4="-","Não Ensaiado",IF(K4&lt;L4,"Não","OK")))</f></c>` +
    `<c r="N4" s="0"><f>IF(L4="","",IF(K4="-","",IF(K4&lt;L4,"Não","Aprovado")))</f></c>` +
    `<c r="O4" s="3"/><c r="P4" s="0"><f>IF(O4="","",IF(O4&gt;=L4,"Aprovado","Reprovado"))</f></c>` +
    `<c r="Q4" s="0"><f>IF(O4="","",IF(O4&gt;=L4,"Não se aplica","Verificar com o projetista"))</f></c>` +
    `<c r="R4" s="0"/><c r="S4" s="0"/><c r="T4" s="0"><f>CONCATENATE(D4,E4,F4)</f></c></row>`
  gravarTexto(
    a,
    'xl/worksheets/sheet2.xml',
    ws(
      `<row r="1">${str('A1', 'CONTROLE DE CONCRETO · OBRA EXEMPLO', 2)}</row>` +
        `<row r="2">${str('A2', 'Construtora Exemplo · uma linha por caminhão betoneira', 0)}</row>` +
        `<row r="3">${CABECALHO.map((t, i) => str(`${col(i + 1)}3`, t, 2)).join('')}</row>` +
        linha4,
      '<tableParts count="1"><tablePart r:id="rId1"/></tableParts>',
    ),
  )
  gravarTexto(
    a,
    'xl/worksheets/_rels/sheet2.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/></Relationships>',
  )
  gravarTexto(
    a,
    'xl/tables/table1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="Rastreamento" displayName="Rastreamento" ref="A3:T4" totalsRowShown="0">` +
      `<autoFilter ref="A3:T4"/><tableColumns count="${CABECALHO.length}">` +
      CABECALHO.map((t, i) => `<tableColumn id="${i + 1}" name="${esc(t)}"/>`).join('') +
      '</tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>',
  )
  gravarTexto(
    a,
    'xl/worksheets/sheet3.xml',
    ws(
      `<row r="1">${str('A1', 'Tipo de elemento', 2)}${str('B1', 'fck (MPa)', 2)}</row>` +
        PARAMETROS.map(([, f], i) => `<row r="${i + 2}"><c r="A${i + 2}" t="s"><v>${i}</v></c><c r="B${i + 2}"><v>${f}</v></c></row>`).join(''),
    ),
  )
  return a
}

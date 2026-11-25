// Tradução do tipo, local, pavimento e empreiteira para os itens das listas suspensas do modelo
// (pedido do Nicolas, 23/11/2026). Obra fictícia EXE: listas inventadas, postas no modelo de exemplo.
import { describe, expect, it } from 'vitest'
import { LAYOUT_PADRAO, preencherModelo, type LinhaControle } from './planilha_controle'
import { itemDaLista, listasDasColunas, localSemPavimento } from './planilha_listas'
import { modeloExe } from './modelo_exe'
import { gravarTexto, texto } from './xlsx'

const LOCAIS = ['FUNDAÇÃO-TORRE 1', 'PILOTIS-TORRE A', 'PILOTIS-TORRE B', '2º PAVIMENTO-TORRE A']
const PAVIMENTOS = ['Fundações', 'Subsolo', 'Térreo', 'Pilotis', '2º pavimento', '-']
const EMPREITEIRAS = ['Concreteira Exemplo Ltda']
const TIPOS = ['Estacas', 'Blocos de fundação', 'Bloco do Poço de Elevador', 'Pilar', 'Vigas ', 'Laje', 'Lajes e Vigas', 'Pilar, viga e laje', 'Outro']

const cel = (ref: string, t: string) => `<c r="${ref}" t="inlineStr"><is><t>${t}</t></is></c>`

/** O modelo EXE com listas na aba "Parâmetros" (colunas D a G) e as validações na aba de rastreamento. */
function modeloComListas() {
  const a = modeloExe()
  const p = texto(a, 'xl/worksheets/sheet3.xml')!
  const listas = [TIPOS, LOCAIS, PAVIMENTOS, EMPREITEIRAS]
  const linhas = Array.from({ length: 12 }, (_, i) => {
    const r = i + 11
    const cels = listas.map((l, j) => (l[i] !== undefined ? cel(`${'DEFG'[j]}${r}`, l[i]) : '')).join('')
    return cels ? `<row r="${r}">${cels}</row>` : ''
  }).join('')
  gravarTexto(a, 'xl/worksheets/sheet3.xml', p.replace('</sheetData>', `${linhas}</sheetData>`))
  const wb = texto(a, 'xl/workbook.xml')!
  gravarTexto(
    a,
    'xl/workbook.xml',
    wb.replace(
      '</definedNames>',
      `<definedName name="Pavimento">'Parâmetros'!$F$11:$F$22</definedName><definedName name="Pavimento" localSheetId="1">'Parâmetros'!$A$1:$A$2</definedName>` +
        `<definedName name="Empreiteiras">'Parâmetros'!$G$11:$G$14</definedName></definedNames>`,
    ),
  )
  const ws = texto(a, 'xl/worksheets/sheet2.xml')!
  gravarTexto(
    a,
    'xl/worksheets/sheet2.xml',
    ws
      .replace(
        '<tableParts',
        `<dataValidations count="3"><dataValidation type="list" allowBlank="1" sqref="D4:D5000"><formula1>'Parâmetros'!$D$11:$D$30</formula1></dataValidation>` +
          `<dataValidation type="list" allowBlank="1" sqref="F4:F5000"><formula1>Pavimento</formula1></dataValidation>` +
          `<dataValidation type="list" allowBlank="1" sqref="R4:R5000"><formula1>Empreiteiras</formula1></dataValidation></dataValidations><tableParts`,
      )
      .replace(
        '</worksheet>',
        `<extLst><ext uri="{CCE6A557-97BC-4b89-ADB6-D9C93CAAB3DF}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:dataValidations count="1" xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main">` +
          `<x14:dataValidation type="list" allowBlank="1"><x14:formula1><xm:f>'Parâmetros'!$E$11:$E$40</xm:f></x14:formula1><xm:sqref>E4:E5000</xm:sqref></x14:dataValidation></x14:dataValidations></ext></extLst></worksheet>`,
      ),
  )
  return a
}

const linha = (l: Partial<LinhaControle>): LinhaControle => ({
  data: '2026-11-20',
  nota_fiscal: '900001',
  volume: 8,
  tipo: 'Pilar',
  setor: 'Pilotis',
  pavimento: 'Pilotis',
  fck_7: null,
  fck_28: null,
  observacao: null,
  fornecedor: null,
  fundacao: false,
  extras: [],
  ...l,
})

/** Texto da célula na aba gerada. */
function valor(a: ReturnType<typeof modeloExe>, ref: string): string | null {
  const m = new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(texto(a, 'xl/worksheets/sheet2.xml')!)
  if (!m || !m[1]) return null
  return /<t[^>]*>([\s\S]*?)<\/t>/.exec(m[1])?.[1] ?? /<v>([\s\S]*?)<\/v>/.exec(m[1])?.[1] ?? null
}

describe('listas do modelo', () => {
  it('lê a lista de cada coluna pela validação (intervalo, nome definido da pasta e x14)', () => {
    const l = listasDasColunas(modeloComListas(), 'Rastreamento')
    expect(l.get(4)).toEqual(TIPOS)
    expect(l.get(5)).toEqual(LOCAIS)
    expect(l.get(6)).toEqual(PAVIMENTOS.filter((p) => p !== '-'))
    expect(l.get(18)).toEqual(EMPREITEIRAS)
    expect(listasDasColunas(modeloExe(), 'Rastreamento').size).toBe(0)
  })

  it('casa sem maiúscula, acento, plural e símbolo de grau', () => {
    expect(itemDaLista('Vigas', TIPOS)).toBe('Vigas ')
    expect(itemDaLista('2° Pavimento', PAVIMENTOS)).toBe('2º pavimento')
    expect(itemDaLista('Térreo Comercial', PAVIMENTOS)).toBe('Térreo')
    expect(itemDaLista('Pilotis PILOTIS-TORRE B', LOCAIS)).toBe('PILOTIS-TORRE B')
    expect(itemDaLista('Pilotis \\ Trecho 1', LOCAIS)).toBeNull()
    expect(itemDaLista('Bloco', TIPOS)).toBeNull()
    expect(itemDaLista('Bloco', TIPOS, { palavra: true })).toBe('Blocos de fundação')
    expect(itemDaLista('Estaca', TIPOS)).toBe('Estacas')
    expect(itemDaLista('Concreteira Exemplo', EMPREITEIRAS, { contem: true })).toBe('Concreteira Exemplo Ltda')
  })

  it('tira o pavimento do começo do local', () => {
    expect(localSemPavimento('Pilotis \\ Trecho 1', 'Pilotis')).toBe('Trecho 1')
    expect(localSemPavimento('Térreo Comercial', 'Térreo Comercial', 'Térreo')).toBe('Térreo Comercial')
    expect(localSemPavimento('Pilotis', 'Pilotis')).toBe('Pilotis')
  })

  it('a planilha sai com os itens das listas (tipo, local, pavimento, empreiteira)', () => {
    const a = modeloComListas()
    preencherModelo(
      a,
      [
        linha({ tipo: 'Vigas', setor: 'Pilotis PILOTIS-TORRE A', pavimento: 'Pilotis', fornecedor: 'Concreteira Exemplo' }),
        linha({ tipo: 'Estaca', setor: 'Fundações FUNDAÇÃO-TORRE 1', pavimento: 'Subsolo', fundacao: true }),
        linha({ tipo: 'Bloco', setor: 'Pilotis \\ Trecho 2', pavimento: 'Pilotis', fundacao: true, fornecedor: 'Outra Usina' }),
        linha({ tipo: 'Laje', setor: 'Térreo Comercial', pavimento: 'Térreo Comercial' }),
        linha({ tipo: 'Estaca', setor: 'Fundações TORRE 1', pavimento: 'Fundações', fundacao: true }),
        linha({ tipo: 'Pilar', setor: 'Fundações TORRE 1', pavimento: 'Subsolo' }),
      ],
      LAYOUT_PADRAO,
    )
    expect([valor(a, 'D4'), valor(a, 'E4'), valor(a, 'F4'), valor(a, 'R4')]).toEqual(['Vigas ', 'PILOTIS-TORRE A', 'Pilotis', 'Concreteira Exemplo Ltda'])
    expect([valor(a, 'D5'), valor(a, 'E5'), valor(a, 'F5')]).toEqual(['Estacas', 'FUNDAÇÃO-TORRE 1', 'Fundações'])
    // sem item no local: fica o texto do app sem o pavimento; empreiteira fora da lista fica como está
    expect([valor(a, 'D6'), valor(a, 'E6'), valor(a, 'F6'), valor(a, 'R6')]).toEqual(['Blocos de fundação', 'Trecho 2', 'Fundações', 'Outra Usina'])
    expect([valor(a, 'E7'), valor(a, 'F7')]).toEqual(['Térreo Comercial', 'Térreo'])
    expect(valor(a, 'E8')).toBe('FUNDAÇÃO-TORRE 1')
    // pavimento do app "Subsolo", local escrito "Fundações ...": vale o que abre o local
    expect([valor(a, 'E9'), valor(a, 'F9')]).toEqual(['FUNDAÇÃO-TORRE 1', 'Fundações'])
  })
})

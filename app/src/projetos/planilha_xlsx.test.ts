import { describe, expect, it } from 'vitest'
import { montarXlsx, serialDoExcel, type ArquivosXlsx } from '../concreto/xlsx'
import { lerArquivoDistribuicao } from './base'
import { distribuicaoDeLinhas, ErroDeArquivo } from './painel'
import { campoDoCabecalho, dataDoSerial, linhasDaFichaXlsx } from './planilha_xlsx'

// Ficha fictícia da obra EXE no mesmo desenho da ficha de controle: título em cima, cabeçalho em duas
// linhas (a DATA DA DEVOLUÇÃO fica na segunda), datas como número de série do Excel com estilo de data.
const cod = new TextEncoder()

function ficha(linhas: (string | number | null)[][], opcoes: { inicio?: number } = {}): Uint8Array {
  const textos: string[] = []
  const idx = (s: string) => {
    const i = textos.indexOf(s)
    if (i >= 0) return i
    textos.push(s)
    return textos.length - 1
  }
  const col = (i: number) => String.fromCharCode(65 + i)
  const inicio = opcoes.inicio ?? 1
  const xmlLinhas = linhas
    .map((l, i) => {
      const n = inicio + i
      const cels = l
        .map((v, j) => {
          if (v === null || v === '') return ''
          const ref = `${col(j)}${n}`
          if (typeof v === 'number') return `<c r="${ref}" s="1"><v>${v}</v></c>` // estilo 1 = data
          return `<c r="${ref}" t="s"><v>${idx(v)}</v></c>`
        })
        .join('')
      return `<row r="${n}">${cels}</row>`
    })
    .join('')
  const arq: ArquivosXlsx = new Map()
  arq.set('[Content_Types].xml', cod.encode('<?xml version="1.0"?><Types/>'))
  arq.set('xl/workbook.xml', cod.encode('<workbook><sheets><sheet name="FICHA" sheetId="1" r:id="rId1"/></sheets></workbook>'))
  arq.set('xl/_rels/workbook.xml.rels', cod.encode('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'))
  arq.set('xl/worksheets/sheet1.xml', cod.encode(`<worksheet><sheetData>${xmlLinhas}</sheetData></worksheet>`))
  arq.set('xl/styles.xml', cod.encode('<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>'))
  arq.set('xl/sharedStrings.xml', cod.encode(`<sst>${textos.map((t) => `<si><t>${t.replace(/&/g, '&amp;')}</t></si>`).join('')}</sst>`))
  return montarXlsx(arq)
}

const CAB = ['CÓDIGO DA PRANCHA', 'REVISÃO / VERSÃO', 'DESCRIÇÃO / TÍTULO', 'DISCIPLINA', 'Nº DE CÓPIAS ENTREGUES', 'DATA DE ENTREGA', 'EMPRESA', 'COLABORADOR', null]
const CAB2 = [null, null, null, null, null, null, null, null, 'DATA DA DEVOLUÇÃO']

const exemplo = () =>
  ficha([
    [null, null, 'CONTROLE DE DISTRIBUIÇÃO DE PROJETOS'],
    ['Obra:', 'Obra Exemplo', null, null, null, 'Data de Atualização', serialDoExcel('2026-11-20')],
    [],
    [],
    CAB,
    CAB2,
    ['4', 'R02 LO', 'FORMA 4º PAVTO', 'ESTRUTURAL', '2', serialDoExcel('2026-10-01'), 'Empreiteira Exemplo', 'Colaborador A', null],
    ['12', 'R00 ', 'PLANTA BAIXA', 'ARQUITETÔNICO', '1', '15/09/2026', 'Construtora Exemplo', 'Colaborador B', serialDoExcel('2026-10-20')],
    [],
    ['7', 'R01', 'CORTE', 'HIDRO', null, '01/10/226', 'Empreiteira Exemplo', null, null],
  ])

describe('ficha de distribuição em .xlsx', () => {
  it('acha as colunas pelo nome do cabeçalho, inclusive a da linha mesclada', async () => {
    const linhas = await linhasDaFichaXlsx(exemplo())
    expect(linhas).toHaveLength(3)
    expect(linhas[0]).toMatchObject({ linha: '7', codigo: '4', revisao: 'R02 LO', disciplina: 'ESTRUTURAL', copias: '2', entrega: '2026-10-01', empresa: 'Empreiteira Exemplo', devolucao: '' })
    expect(linhas[1]).toMatchObject({ linha: '8', devolucao: '2026-10-20', entrega: '15/09/2026' })
    expect(linhas[2].linha).toBe('10') // a linha vazia do meio não conta, mas o número do Excel fica
  })

  it('vira cópias do painel com as mesmas regras do CSV', async () => {
    const copias = distribuicaoDeLinhas(await linhasDaFichaXlsx(exemplo()))
    expect(copias.map((c) => [c.linha, c.codigo, c.fase, c.revisao, c.entrega, c.devolucao])).toEqual([
      [7, '4', 'LO', 2, '2026-10-01', null],
      [8, '12', 'EX', 0, '2026-09-15', '2026-10-20'],
      [10, '7', 'EX', 1, null, null], // ano com 3 dígitos: conferir (regra 3)
    ])
    expect(copias[1].disciplina).toBe('ARQUITETONICO')
    expect(copias[1].disciplinaNome).toBe('ARQUITETÔNICO')
  })

  it('o importador aceita o .xlsx e o CSV pelo mesmo caminho', async () => {
    const x = new File([exemplo() as BlobPart], 'ficha.xlsx')
    expect(await lerArquivoDistribuicao(x)).toHaveLength(3)
    const csv = 'codigo;revisao;disciplina;entrega;empresa;devolucao\n4;R01;ESTRUTURAL;2026-10-01;Empreiteira Exemplo;\n'
    expect(await lerArquivoDistribuicao(new File([csv], 'ficha.csv'))).toHaveLength(1)
  })

  it('sem cabeçalho ou sem as colunas: erro claro, nada importado', async () => {
    await expect(lerArquivoDistribuicao(new File([ficha([['qualquer', 'coisa']]) as BlobPart], 'x.xlsx'))).rejects.toThrow(/cabeçalho/)
    const semEmpresa = ficha([CAB.slice(0, 6), ['4', 'R01', 'X', 'ESTRUTURAL', '1', '01/10/2026']])
    await expect(lerArquivoDistribuicao(new File([semEmpresa as BlobPart], 'x.xlsx'))).rejects.toThrow(ErroDeArquivo)
    await expect(lerArquivoDistribuicao(new File([new Uint8Array([0x50, 0x4b, 1, 2]) as BlobPart], 'x.xlsx'))).rejects.toThrow(/xlsx/)
  })

  it('nomes de cabeçalho e datas de série', () => {
    expect(campoDoCabecalho('Nº DE CÓPIAS ENTREGUES')).toBe('copias')
    expect(campoDoCabecalho('DATA DA DEVOLUÇÃO')).toBe('devolucao')
    expect(campoDoCabecalho('DATA DE ENTREGA')).toBe('entrega')
    expect(campoDoCabecalho('Obra:')).toBeNull()
    expect(dataDoSerial(serialDoExcel('2026-11-21'))).toBe('2026-11-21')
  })
})

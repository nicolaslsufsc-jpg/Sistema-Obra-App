import { describe, expect, it } from 'vitest'
import { LAYOUT_EXE, modeloExe } from './modelo_exe'
import {
  EXTRAS,
  exemplar,
  linhasDaPlanilha,
  moverFormula,
  preencherModelo,
  rotuloDoModelo,
  tipoDoCaminhao,
  TITULO_EXTRAS,
  type CaminhaoDaPlanilha,
  type ConcretagemDaPlanilha,
} from './planilha_controle'
import { abrirXlsx, montarXlsx, serialDoExcel, texto } from './xlsx'

const conc = (data: string, local: string): ConcretagemDaPlanilha => ({
  raiz: `c-${data}-${local}`,
  data,
  pavimento: 'Pilotis',
  local_descricao: local,
  codigo_oficial: 'EXE-0001',
  fornecedor: 'Concreteira Exemplo',
  fck_mpa: 40,
  observacao: null,
})

const cam = (sequencia: number, nf: string, pecas: CaminhaoDaPlanilha['pecas'], resultados: CaminhaoDaPlanilha['resultados'] = []): CaminhaoDaPlanilha => ({
  sequencia,
  nota_fiscal: nf,
  volume_m3: 8,
  saida_usina: '2026-11-20T10:00:00.000Z',
  chegada_obra: null,
  inicio_descarga: null,
  fim_descarga: null,
  slump_medido_cm: 12,
  agua_adicionada_l: null,
  cps_moldados: 4,
  observacao: sequencia === 2 ? 'Caminhão & bomba <ok>' : null,
  pecas,
  resultados,
})

const linhas = () =>
  linhasDaPlanilha(
    [
      {
        concretagem: conc('2026-11-20', 'Trecho 2'),
        caminhoes: [cam(2, '900002', [{ nome: 'V1', tipo: 'V', fracao: 0.5, parcial: true }, { nome: 'Laje A', tipo: 'L', fracao: null, parcial: false }])],
      },
      {
        concretagem: conc('2026-11-19', 'Trecho 1'),
        caminhoes: [
          cam(2, '900001', [{ nome: 'V2', tipo: 'V', fracao: null, parcial: false }]),
          cam(1, '900000', [{ nome: 'P1', tipo: 'P', fracao: null, parcial: false }], [
            { idade_dias: 7, numero_cp: 1, resistencia_mpa: 30.1 },
            { idade_dias: 7, numero_cp: 2, resistencia_mpa: 31.4 },
            { idade_dias: 28, numero_cp: 1, resistencia_mpa: 42 },
            { idade_dias: 63, numero_cp: 1, resistencia_mpa: 47.5 },
          ]),
        ],
      },
    ],
    LAYOUT_EXE,
  )

async function gerar(n?: number) {
  const a = modeloExe()
  const l = linhas()
  const r = preencherModelo(a, n === undefined ? l : l.slice(0, n), LAYOUT_EXE)
  // passa pelo .zip de verdade, como o arquivo baixado
  const volta = await abrirXlsx(montarXlsx(a))
  return { r, a: volta, aba: texto(volta, 'xl/worksheets/sheet2.xml')!, tabela: texto(volta, 'xl/tables/table1.xml')! }
}

describe('planilha de controle: regras', () => {
  it('fórmula arrastada para outra linha muda só as referências relativas', () => {
    expect(moverFormula('IF(H4="","",IF(I4<J4,"Não H4","OK"))', 2)).toBe('IF(H6="","",IF(I6<J6,"Não H4","OK"))')
    expect(moverFormula('SUM($A$1:A4)+LOG10(B4)', 1)).toBe('SUM($A$1:A5)+LOG10(B5)')
    expect(moverFormula('XLOOKUP(Tabela2[[#This Row],[Coluna1]],Controle!M:M,Controle!M5)', 3)).toBe('XLOOKUP(Tabela2[[#This Row],[Coluna1]],Controle!M:M,Controle!M8)')
    expect(moverFormula('A$4+B4', 1)).toBe('A$4+B5')
  })

  it('tipo de elemento pelas peças e exemplar pelo maior CP da idade', () => {
    expect(tipoDoCaminhao([{ tipo: 'P' }], LAYOUT_EXE)).toBe('Pilar')
    expect(tipoDoCaminhao([{ tipo: 'L' }, { tipo: 'V' }], LAYOUT_EXE)).toBe('Lajes e Vigas')
    expect(tipoDoCaminhao([], LAYOUT_EXE)).toBe('Outro')
    expect(exemplar([{ idade_dias: 7, numero_cp: 1, resistencia_mpa: 30 }, { idade_dias: 7, numero_cp: 2, resistencia_mpa: 32 }], 7)).toBe(32)
    expect(exemplar([], 28)).toBeNull()
  })

  it('usa o texto da lista do modelo quando só muda espaço ou maiúscula', () => {
    expect(rotuloDoModelo('Vigas', ['Pilar', 'Vigas '])).toBe('Vigas ')
    expect(rotuloDoModelo('pilar', ['Pilar'])).toBe('Pilar')
    expect(rotuloDoModelo('Muro', ['Pilar'])).toBe('Muro')
  })

  it('linhas por data, local e caminhão; extras com peças, horários e CPs', () => {
    const l = linhas()
    expect(l.map((x) => x.nota_fiscal)).toEqual(['900000', '900001', '900002'])
    expect(l[0].fck_7).toBe(31.4)
    expect(l[0].fck_28).toBe(42)
    expect(l[1].fck_28).toBeNull()
    expect(l[2].tipo).toBe('Lajes e Vigas')
    const ex = (i: number, nome: (typeof EXTRAS)[number]) => l[i].extras[EXTRAS.indexOf(nome)]
    expect(ex(2, 'Peças (Sistema Obra)')).toBe('V1 (50%), Laje A')
    expect(ex(0, 'CPs 7 dias (MPa)')).toBe('30,1 / 31,4')
    expect(ex(0, 'Outras idades (MPa)')).toBe('63 dias: 47,5')
    expect(ex(0, 'Caminhão nº')).toBe(1)
    expect(String(ex(0, 'Saída da usina'))).toMatch(/^\d\d:\d\d$/)
  })
})

describe('planilha de controle: preencher o modelo', () => {
  it('uma linha por caminhão, com as fórmulas do modelo e a Tabela até a última linha', async () => {
    const { r, aba, tabela } = await gerar()
    expect(r).toEqual({ linhas: 3, ultimaLinha: 6, colunaDosExtras: 'U' })
    expect(tabela).toContain('ref="A3:T6"')
    expect(tabela).toContain('<autoFilter ref="A3:T6"/>')
    // dados nas colunas do layout
    expect(aba).toContain(`<c r="A4" s="1"><v>${serialDoExcel('2026-11-19')}</v></c>`)
    expect(aba).toContain('<c r="B4" s="0" t="inlineStr"><is><t xml:space="preserve">900000</t></is></c>')
    expect(aba).toContain('<c r="K4" s="3"><v>42</v></c>')
    // sem resultado ainda: "-" (as fórmulas do modelo leem como "não ensaiado")
    expect(aba).toContain('<c r="K5" s="3" t="inlineStr"><is><t xml:space="preserve">-</t></is></c>')
    // fórmula da linha-modelo, ajustada para a linha
    expect(aba).toContain('<f>IF(D6=&quot;&quot;,&quot;&quot;,VLOOKUP(D6,parametros,2,FALSE))</f>')
    expect(aba).toContain('<f>CONCATENATE(D5,E5,F5)</f>')
    // texto com caractere especial escapado
    expect(aba).toContain('Caminhão &amp; bomba &lt;ok&gt;')
    // extras depois da tabela, com título
    expect(aba).toContain(TITULO_EXTRAS)
    expect(aba).toContain('<c r="U3" s="2" t="inlineStr"><is><t xml:space="preserve">Caminhão nº</t></is></c>')
    expect(aba).toContain('<c r="V6" s="0" t="inlineStr"><is><t xml:space="preserve">V1 (50%), Laje A</t></is></c>')
    // U + 16 extras = até AJ
    expect(aba).toContain('<dimension ref="A1:AJ6"/>')
  })

  it('as outras abas e o resto do arquivo ficam como vieram; o Excel recalcula ao abrir', async () => {
    const original = modeloExe()
    const { a } = await gerar()
    for (const nome of ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet3.xml', 'xl/styles.xml', 'xl/sharedStrings.xml']) {
      expect(texto(a, nome)).toBe(texto(original, nome))
    }
    expect(texto(a, 'xl/workbook.xml')).toContain('fullCalcOnLoad="1"')
  })

  it('o tipo usa o texto exato da lista do modelo ("Vigas " com espaço)', async () => {
    const a = modeloExe()
    preencherModelo(a, [{ ...linhas()[1], tipo: 'Vigas' }], LAYOUT_EXE)
    expect(texto(a, 'xl/worksheets/sheet2.xml')).toContain('<t xml:space="preserve">Vigas </t>')
  })

  it('sem linhas, fica uma linha vazia só com as fórmulas (modelo vazio da obra)', async () => {
    const { r, aba, tabela } = await gerar(0)
    expect(r.ultimaLinha).toBe(4)
    expect(tabela).toContain('ref="A3:T4"')
    expect(aba).toContain('<f>CONCATENATE(D4,E4,F4)</f>')
    expect(aba).not.toContain('900000')
  })

  it('gerar de novo em cima de um arquivo já gerado troca as linhas e não duplica os extras', async () => {
    const { a } = await gerar()
    preencherModelo(a, linhas().slice(0, 1), LAYOUT_EXE)
    const aba = texto(a, 'xl/worksheets/sheet2.xml')!
    expect(texto(a, 'xl/tables/table1.xml')).toContain('ref="A3:T4"')
    expect(aba).not.toContain('900002')
    expect(aba.split(TITULO_EXTRAS).length).toBe(2)
    expect(aba).toContain('<c r="U3" s="2"')
    expect(aba).not.toMatch(/<c r="A[K-Z]3"/)
  })

  it('modelo sem a aba ou sem Tabela: mensagem clara', () => {
    expect(() => preencherModelo(modeloExe(), [], { ...LAYOUT_EXE, aba: 'Outra' })).toThrow('não tem a aba "Outra"')
    const a = modeloExe()
    a.delete('xl/worksheets/_rels/sheet2.xml.rels')
    expect(() => preencherModelo(a, [], LAYOUT_EXE)).toThrow('Tabela do Excel')
  })

  it('arquivo que não é .xlsx é recusado', async () => {
    await expect(abrirXlsx(new TextEncoder().encode('não sou zip'))).rejects.toThrow('não é um .xlsx')
  })
})

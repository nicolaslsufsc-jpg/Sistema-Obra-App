import { describe, expect, it } from 'vitest'
import { abrirXlsx, texto } from '../concreto/xlsx'
import { escritorioDasFolhas, folhaDoArquivo, lerIndiceEscritorio, pastaCurta, resumoPorEmpresa, situacaoFicha, vigentesDoServidor } from './canteiro'
import type { Linha } from '../nucleo/banco_local'
import type { Documento } from './dados'
import { DISTRIBUICAO_EXE, VIGENTES_EXE } from './exemplo_exe'
import { abasFichaV2, fichaV2Xlsx, nomeFichaV2 } from './ficha_v2'
import { cruzar, lerDistribuicao, lerVigentes } from './painel'
import { lerGrade } from './planilha_xlsx'

const HOJE = '2026-11-14'
const cruzadasExe = () => cruzar(lerDistribuicao(DISTRIBUICAO_EXE), lerVigentes(VIGENTES_EXE), HOJE)

function doc(id: string, codigo: string, extra: Partial<Documento> = {}): Documento {
  const [, sigla, numero, nome] = codigo.split('.')
  return { id, codigo, disciplina_sigla: sigla, disciplina: 'Estrutura', numero, nome_curto: nome, titulo: nome, pasta_autodoc: null, link_pasta: null, busca: codigo, ...extra }
}
const rev = (fase: string, numero: string, extra: Record<string, unknown> = {}) =>
  ({ id: `${fase}${numero}`, fase, numero, titulo: 'TÍTULO DA REVISÃO', status_autodoc: 'Aprovado', vista_em: '2026-11-10', cadastrada_em_autodoc: '2026-10-29T14:44:00Z', ...extra }) as unknown as Linha

describe('situação da ficha v2', () => {
  it('em dia → OK, desatualizada → RECOLHER, devolvida/recolhida → DEVOLVIDO, resto → CONFERIR', () => {
    const porLinha = new Map(cruzadasExe().map((x) => [x.copia.linha, situacaoFicha(x)]))
    expect(porLinha.get(1)).toBe('RECOLHER')
    expect(porLinha.get(2)).toBe('OK')
    expect(porLinha.get(4)).toBe('OK')
    expect(porLinha.get(6)).toBe('DEVOLVIDO') // provavelmente recolhida
    expect(porLinha.get(7)).toBe('CONFERIR') // revisão maior
    expect(porLinha.get(8)).toBe('CONFERIR') // não achada
    expect(porLinha.get(11)).toBe('CONFERIR') // data com erro
    expect(porLinha.get(12)).toBe('DEVOLVIDO')
  })

  it('resumo por empresa soma as situações, quem tem mais a recolher primeiro', () => {
    const r = resumoPorEmpresa(cruzadasExe())
    expect(r[0].empresa).toBe('Empreiteira Alfa')
    const alfa = r[0].porSituacao
    expect(alfa.RECOLHER + alfa.OK + alfa.DEVOLVIDO + alfa.CONFERIR).toBe(r[0].total)
    expect(r.reduce((n, l) => n + l.total, 0)).toBe(cruzadasExe().length)
  })
})

describe('vigente do servidor', () => {
  it('uma linha por documento, com o nome de disciplina da ficha e a fase que vale', () => {
    const documentos = [
      doc('d1', 'EXE.ES.134.FOR4PAVTIP', { pasta_autodoc: '129 - EXE/PROJETOS/Estrutura/Liberado Obra/Formas/' }),
      doc('d2', 'EXE.HI.004.AGUAFRIA', { disciplina: 'Hidrossanitário' }),
      doc('d3', 'EXE.HI.001.APROVACAO', { disciplina: 'DOCUMENTOS E APROVAÇÕES' }),
      doc('d4', 'EXE.XX.010.OUTRA', { disciplina: 'Climatização' }),
      doc('d5', 'EXE.ES.200.SEMREVISAO'),
    ]
    const vigentes = new Map([
      ['d1', rev('LO', '01')],
      ['d2', rev('EX', '03', { cadastrada_em_autodoc: null })],
      ['d3', rev('PL', '00')],
      ['d4', rev('EX', '00')],
    ])
    const v = vigentesDoServidor({ documentos, vigentes })
    expect(v).toHaveLength(4)
    expect(v[0]).toMatchObject({ disciplina: 'ESTRUTURAL', de: '134', codigo: 'EXE.ES.LO.134.FOR4PAVTIP', fase: 'LO', revisao: 1, data: '2026-10-29', pasta: 'LO/Formas' })
    expect(v[1]).toMatchObject({ disciplina: 'HIDRO', de: '4', fase: 'EX', revisao: 3, data: '2026-11-10' }) // sem data do Autodoc: a da lista
    expect(v[2]).toMatchObject({ disciplina: 'HIDRO', de: 'PL001' }) // aprovação legal não cruza com cópia de obra
    expect(v[3].disciplina).toBe('CLIMATIZACAO')
  })

  it('cruza com a ficha como a lista em CSV', () => {
    // no servidor cada folha é um documento (a lista em CSV junta a faixa 100 a 105 numa linha)
    const documentos = [doc('d1', 'EXE.ES.100.FORPILOTIS'), doc('d2', 'EXE.ES.101.FORPILOTIS')]
    const lo02 = rev('LO', '02', { cadastrada_em_autodoc: '2026-10-22T10:00:00Z' })
    const v = vigentesDoServidor({ documentos, vigentes: new Map([['d1', lo02], ['d2', lo02]]) })
    const x = cruzar(lerDistribuicao(DISTRIBUICAO_EXE), v, HOJE)
    expect(situacaoFicha(x.find((c) => c.copia.linha === 1)!)).toBe('RECOLHER')
    expect(situacaoFicha(x.find((c) => c.copia.linha === 2)!)).toBe('OK')
  })

  it('pasta curta', () => {
    expect(pastaCurta('129 - EXE/PROJETOS/Estrutura/Projeto Executivo/Pilares/', 'EX')).toBe('EX/Pilares')
    expect(pastaCurta(null, 'LO')).toBe('LO')
  })
})

describe('escritório pelo índice de pranchas do PC', () => {
  const INDICE = [
    '"codigo";"disciplina";"etapa";"revisao";"arquivo";"pasta_nova";"origem";"outras_copias";"md5"',
    '"EXE.ES.EX.100.FORPILOTIS-R02 - FORMAS";"ES";"EX";"R02";"EXE.ES.EX.100.FORPILOTIS-R02.pdf";"Formas";"";"";"A"',
    '"EXE.ES.LO.100.FORPILOTIS-R01 - FORMAS";"ES";"LO";"R01";"EXE.ES.LO.100.FORPILOTIS-R01.pdf";"Formas";"";"";"B"',
    '"EXE.ES.LO.100.FORPILOTIS-R02";"ES";"LO";"R02";"EXE.ES.LO.100.FORPILOTIS-R02.dwg";"Formas";"";"";"C"',
    '"EXE.ES.EX.200.PILSUBSOLO-R00 - PILARES";"ES";"EX";"R00";"EXE.ES.EX.200.PILSUBSOLO-R00.pdf";"Pilares";"";"";"D"',
    '"EXE.HI.LO.001.AGUAFRIA-R01";"HI";"LO";"R01";"x.pdf";"";"";"";"E"',
    '"LEIAME";"";"";"";"LEIAME.txt";"";"";"";""',
  ].join('\n')

  it('fica a revisão mais nova de cada folha (LO vale mais que EX)', () => {
    const m = lerIndiceEscritorio(INDICE, '2026-11-14')
    expect(m.get('EXE.ES.100.FORPILOTIS')).toEqual({ fase: 'LO', revisao: 2, data: '2026-11-14' })
    expect(m.get('EXE.ES.200.PILSUBSOLO')).toEqual({ fase: 'EX', revisao: 0, data: '2026-11-14' })
    expect(m.size).toBe(3)
    expect(folhaDoArquivo('EXE.AR.EX.001.CASA01-R06.dwg')).toEqual({ chave: 'EXE.AR.001.CASA01', fase: 'EX', revisao: 6 })
    expect(() => lerIndiceEscritorio('a;b\n1;2', HOJE)).toThrow(/codigo/)
  })

  it('OK, ATUALIZAR (EX na pasta com a LO vigente), CONFERIR (PC à frente) e SEM CÓPIA', () => {
    const linhas = escritorioDasFolhas(lerVigentes(VIGENTES_EXE), lerIndiceEscritorio(INDICE, HOJE))
    const sit = new Map(linhas.map((l) => [l.vigente.codigo, l.situacao]))
    expect(sit.get('EXE.ES.LO.100.FORPILOTIS')).toBe('OK')
    expect(sit.get('EXE.ES.LO.200.PILSUBSOLO')).toBe('ATUALIZAR')
    expect(sit.get('EXE.HI.LO.001.AGUAFRIA')).toBe('CONFERIR') // PC tem LO R01, a vigente é LO R00
    expect(sit.get('EXE.FU.LO.004.BLOCOS')).toBe('SEM CÓPIA')
  })
})

describe('exportar como a ficha v2 (.xlsx)', () => {
  const entrada = () => {
    const vigentes = lerVigentes(VIGENTES_EXE)
    return { obra: 'EXE', hoje: HOJE, fonteVigente: 'lista importada', cruzadas: cruzadasExe(), vigentes, escritorio: escritorioDasFolhas(vigentes, new Map()) }
  }

  it('quatro abas na ordem FICHA, AUTODOC, ESCRITORIO, RESUMO', async () => {
    const a = await abrirXlsx(fichaV2Xlsx(entrada()))
    const wb = texto(a, 'xl/workbook.xml')!
    expect([...wb.matchAll(/name="([^"]+)"/g)].map((m) => m[1])).toEqual(['FICHA', 'AUTODOC', 'ESCRITORIO', 'RESUMO'])
    const ficha = lerGrade(a, 'xl/worksheets/sheet1.xml')
    expect(ficha.get(1)!.get(12)).toBe('Situação')
    // linha 2 = linha 1 da ficha: desatualizada, entrega como data do Excel
    expect(ficha.get(2)!.get(1)).toBe('1')
    expect(ficha.get(2)!.get(2)).toBe('2026-10-15')
    expect(ficha.get(2)!.get(12)).toBe('RECOLHER')
    expect(ficha.get(2)!.get(13)).toBe('LO R02')
    expect(ficha.size).toBe(1 + cruzadasExe().length)
    const resumo = lerGrade(a, 'xl/worksheets/sheet4.xml')
    const totais = [...resumo.values()].find((l) => l.get(1) === 'TOTAL')!
    expect(totais.get(2)).toBe(String(cruzadasExe().length))
  })

  it('o que o arquivo traz bate com a conta do app', () => {
    const abas = abasFichaV2(entrada())
    const recolher = abas[0].linhas.filter((l) => l[11] === 'RECOLHER').length
    expect(recolher).toBe(cruzadasExe().filter((x) => situacaoFicha(x) === 'RECOLHER').length)
    expect(abas[2].linhas.slice(1).every((l) => l[6] === 'SEM CÓPIA')).toBe(true)
    expect(nomeFichaV2('EXE', HOJE)).toBe('2026-11-14_EXE_controle_de_copias_ficha_v2.xlsx')
  })

  it('texto que parece fórmula entra como texto', async () => {
    const e = entrada()
    const c = { ...e.cruzadas[0], copia: { ...e.cruzadas[0].copia, empresa: '=HYPERLINK("x")' } }
    const a = await abrirXlsx(fichaV2Xlsx({ ...e, cruzadas: [c] }))
    const xml = texto(a, 'xl/worksheets/sheet1.xml')!
    expect(xml).not.toContain('<f>')
    expect(xml).toContain('t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;x&quot;)')
  })
})

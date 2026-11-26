import { describe, expect, it } from 'vitest'
import { abrirXlsx, texto } from '../concreto/xlsx'
import { copiasDoCanteiro, pastasRetiradas, nomeSemCaixaAlta, nomesDeDisciplina, copiasDoApp, LINHA_APP, escritorioDasFolhas, folhaDoArquivo, lerIndiceEscritorio, pastaCurta, resumoPorEmpresa, situacaoFicha, vigentesDoServidor } from './canteiro'
import type { Linha } from '../nucleo/banco_local'
import type { Documento } from './dados'
import { DISTRIBUICAO_EXE, VIGENTES_EXE } from './exemplo_exe'
import { abasFichaV2, fichaV2Xlsx, nomeFichaV2 } from './ficha_v2'
import { cruzar, lerDistribuicao, lerVigentes, rotuloDaCopia } from './painel'
import { oQueFazerAgora } from './agora'
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

describe('pastas retiradas do Autodoc (24/11)', () => {
  const obs = (id: string) => rev('EX', '00', { id, obsoleta: true })
  const viva = (id: string) => rev('LO', '01', { id })
  // pasta A: tudo obsoleto (retirada); pasta B: uma folha obsoleta e outra viva (em uso); sem pasta: nunca
  const docs = [
    doc('a1', 'EXE.FR.001.FURAXXXXXX', { pasta_autodoc: 'X/PROJETOS/Furação/Antiga/' }),
    doc('a2', 'EXE.FR.002.FURAYYYYYY', { pasta_autodoc: 'X/PROJETOS/Furação/Antiga/' }),
    doc('b1', 'EXE.FR.010.FURAZZZZZZ', { pasta_autodoc: 'X/PROJETOS/Furação/Atual/' }),
    doc('b2', 'EXE.FR.011.FURAWWWWWW', { pasta_autodoc: 'X/PROJETOS/Furação/Atual/' }),
    doc('s1', 'EXE.FR.020.SEMPASTAXX'),
    doc('c1', 'EXE.FR.030.SEMREVXXXX', { pasta_autodoc: 'X/PROJETOS/Furação/Nova/' }),
  ]
  const revisoesDe = new Map<string, Linha[]>([
    ['a1', [obs('ra1')]],
    ['a2', [obs('ra2'), { ...obs('ra2b'), apagado: true } as Linha]],
    ['b1', [obs('rb1')]],
    ['b2', [viva('rb2')]],
    ['s1', [obs('rs1')]],
  ])

  it('só a pasta com todas as pranchas obsoletas; sem revisão ou sem pasta não conta', () => {
    expect([...pastasRetiradas({ documentos: docs, revisoesDe })]).toEqual(['X/PROJETOS/Furação/Antiga/'])
  })

  it('as cópias da pasta retirada saem do canteiro; a folha solta fora de uso continua', () => {
    const revs = [...revisoesDe.values()].flat()
    const ev = (id: string, documento_id: string, revisao_id: string) =>
      ({ id, tipo: 'entrega', documento_id, revisao_id, empresa_id: 'e1', colaborador: '', data_evento: '2026-11-01', criado_em_dispositivo: `2026-11-01T10:00:0${id.length}Z` }) as unknown as Linha
    const dados = {
      eventos: [ev('1', 'a1', 'ra1'), ev('22', 'a2', 'ra2'), ev('333', 'b1', 'rb1'), ev('4444', 'b2', 'rb2')],
      documentoPorId: new Map(docs.map((d) => [d.id, d])),
      revisaoPorId: new Map(revs.map((r) => [String(r.id), r])),
      vigentes: new Map([['b2', revisoesDe.get('b2')![0]]]),
      empresaPorId: new Map([['e1', { id: 'e1', nome: 'Empreiteira Alfa', contato: null, ativa: true }]]),
    }
    expect(copiasDoApp(dados).map((c) => c.app?.documentoId)).toEqual(['a1', 'a2', 'b1', 'b2'])
    const ret = pastasRetiradas({ documentos: docs, revisoesDe })
    const c = copiasDoApp(dados, ret)
    expect(c.map((x) => [x.app?.documentoId, !!x.app?.foraDeUso])).toEqual([
      ['b1', true],
      ['b2', false],
    ])
  })
})

describe('entregas do app no canteiro (21/11)', () => {
  const d1 = doc('d1', 'EXE.ES.100.FORPILOTIS')
  const lo01 = rev('LO', '01', { id: 'lo01', cadastrada_em_autodoc: '2026-10-22T10:00:00Z' })
  const lo02 = rev('LO', '02', { id: 'lo02', cadastrada_em_autodoc: '2026-11-02T10:00:00Z' })
  const ev = (id: string, extra: Record<string, unknown>) =>
    ({ id, documento_id: 'd1', empresa_id: 'e1', colaborador: 'João', criado_em_dispositivo: `2026-11-0${id.length}T10:00:00Z`, ...extra }) as unknown as Linha
  const eventos = [
    ev('a', { tipo: 'entrega', revisao_id: 'lo01', data_evento: '2026-10-25' }),
    ev('bb', { tipo: 'entrega', revisao_id: 'lo02', data_evento: '2026-11-05', assinatura_id: 'png1' }),
    ev('ccc', { tipo: 'devolucao', revisao_id: 'lo01', entrega_id: 'a', data_evento: '2026-11-05' }),
  ]
  const dados = {
    eventos,
    documentoPorId: new Map([['d1', d1]]),
    revisaoPorId: new Map([['lo01', lo01], ['lo02', lo02]]),
    vigentes: new Map([['d1', lo02]]),
    empresaPorId: new Map([['e1', { id: 'e1', nome: 'Empreiteira Alfa', contato: null, ativa: true }]]),
  }
  it('cada entrega vira uma cópia; a devolvida leva a data; a assinada leva a assinatura', () => {
    const c = copiasDoApp(dados)
    expect(c.map((x) => [x.linha, x.codigo, x.fase, x.revisao, x.empresa, x.colaborador, x.devolucao, x.app?.assinaturaId])).toEqual([
      [LINHA_APP, '100', 'LO', 1, 'Empreiteira Alfa', 'João', '2026-11-05', null],
      [LINHA_APP + 1, '100', 'LO', 2, 'Empreiteira Alfa', 'João', null, 'png1'],
    ])
  })
  it('cruza com a vigente do servidor: a assinada em campo fica em dia', () => {
    const x = cruzar(copiasDoApp(dados), vigentesDoServidor({ documentos: [d1], vigentes: dados.vigentes }), HOJE)
    const emCampo = x.filter((y) => y.situacao === 'em campo')
    expect(emCampo).toHaveLength(1)
    expect(emCampo[0].resultado).toBe('em dia')
    expect(emCampo[0].copia.app?.entregaId).toBe('bb')
  })
  it('folha sem revisão vigente (todas obsoletas): a cópia em campo é "recolher: prancha fora de uso"', () => {
    // d2 tem o MESMO número (100) de d1, que continua vigente: a cópia de d2 não pode cruzar com a folha d1
    const d2 = doc('d2', 'EXE.ES.100.FOROUTROXX')
    const ex00 = rev('EX', '00', { id: 'ex00', obsoleta: true })
    const comD2 = {
      ...dados,
      eventos: [...eventos, ev('dddd', { tipo: 'entrega', documento_id: 'd2', revisao_id: 'ex00', data_evento: '2026-08-01', colaborador: 'Pedro' })],
      documentoPorId: new Map([['d1', d1], ['d2', d2]]),
      revisaoPorId: new Map([['lo01', lo01], ['lo02', lo02], ['ex00', ex00]]),
    }
    const copias = copiasDoApp(comD2)
    expect(copias.map((c) => !!c.app?.foraDeUso)).toEqual([false, false, true])
    const x = cruzar(copias, vigentesDoServidor({ documentos: [d1, d2], vigentes: comD2.vigentes }), HOJE)
    const fora = x.find((y) => y.copia.app?.entregaId === 'dddd')!
    expect(fora).toMatchObject({ situacao: 'em campo', resultado: 'desatualizada', foraDeUso: true })
    expect(fora.vigente).toBeUndefined()
    // quem tem a vigente de d1 continua em dia: vale a revisão, não o número nem a pasta
    expect(x.find((y) => y.copia.app?.entregaId === 'bb')!.resultado).toBe('em dia')
    // entra no "recolher" do O que fazer agora, com o nome da pessoa, sem nada a plotar
    const o = oQueFazerAgora([], x)
    expect(o.recolher.map((r) => [r.x.copia.colaborador, r.vigente])).toEqual([['Pedro', null]])
    expect(situacaoFicha(fora)).toBe('RECOLHER')
  })
})

describe('várias cópias na mesma entrega (22/11)', () => {
  const d1 = doc('d1', 'EXE.ES.100.FORPILOTIS')
  const lo02 = rev('LO', '02', { id: 'lo02', cadastrada_em_autodoc: '2026-11-02T10:00:00Z' })
  const ev = (id: string, extra: Record<string, unknown>) =>
    ({ id, tipo: 'entrega', documento_id: 'd1', empresa_id: 'e1', colaborador: 'João', revisao_id: 'lo02', data_evento: '2026-11-10', criado_em_dispositivo: '2026-11-10T10:00:00Z', ...extra }) as unknown as Linha
  const montar = (eventos: Linha[]) => {
    const dados = { eventos, documentoPorId: new Map([['d1', d1]]), revisaoPorId: new Map([['lo02', lo02]]), vigentes: new Map([['d1', lo02]]), empresaPorId: new Map([['e1', { id: 'e1', nome: 'Empreiteira Alfa', contato: null, ativa: true }]]) }
    return cruzar(copiasDoApp(dados), vigentesDoServidor({ documentos: [d1], vigentes: dados.vigentes }), HOJE)
  }
  it('3 cópias da mesma revisão, no mesmo dia, para a mesma pessoa: as 3 ficam em campo', () => {
    const x = montar([ev('a', {}), ev('b', {}), ev('c', {})])
    expect(x.map((y) => [y.situacao, y.resultado])).toEqual([['em campo', 'em dia'], ['em campo', 'em dia'], ['em campo', 'em dia']])
  })
  it('a mesma revisão em outro dia continua "provavelmente recolhida" (só uma vale)', () => {
    const x = montar([ev('a', {}), ev('b', { data_evento: '2026-11-12' })])
    expect(x.map((y) => y.situacao).sort()).toEqual(['em campo', 'recolhida'])
  })
})

describe('ficha no aparelho + entregas do servidor (22/11)', () => {
  const daFicha = lerDistribuicao(DISTRIBUICAO_EXE)
  const servidor = [{ ...daFicha[0], linha: LINHA_APP, app: { entregaId: 'e1', documentoId: 'd1', assinaturaId: null } }]
  it('com entregas no servidor, a ficha importada não soma: nada conta em dobro', () => {
    const r = copiasDoCanteiro(daFicha, servidor)
    expect(r.fonte).toBe('servidor')
    expect(r.copias).toHaveLength(1)
    expect(r.copias.every((c) => !!c.app)).toBe(true)
    expect(r.ignoradas).toBe(daFicha.length)
    // a mesma cópia nas duas fontes aparece uma vez só no cruzamento
    expect(cruzar(r.copias, lerVigentes(VIGENTES_EXE), HOJE).filter((x) => x.situacao === 'em campo')).toHaveLength(1)
  })
  it('sem entregas no servidor, vale a ficha importada no aparelho', () => {
    const r = copiasDoCanteiro(daFicha, [])
    expect([r.fonte, r.copias.length, r.ignoradas]).toEqual(['ficha', daFicha.length, 0])
  })
  it('só o servidor, sem ficha no aparelho', () => {
    expect(copiasDoCanteiro([], servidor)).toMatchObject({ fonte: 'servidor', ignoradas: 0 })
  })
})

describe('acabamentos do quadro (22/11)', () => {
  it('a disciplina aparece com o nome do servidor, venha a cópia da ficha ou do servidor', () => {
    const nomes = nomesDeDisciplina([doc('h1', 'EXE.HI.004.AGUAFRIAXX', { disciplina: 'Hidrossanitário' }), doc('e1', 'EXE.ES.100.FORPILOTIS')])
    const hidro = cruzar(lerDistribuicao(DISTRIBUICAO_EXE), lerVigentes(VIGENTES_EXE), HOJE).find((x) => x.copia.disciplinaNome === 'HIDRO')!
    expect(nomes.get(hidro.copia.disciplina)).toBe('Hidrossanitário')
    expect(nomeSemCaixaAlta('FUNDAÇÃO')).toBe('Fundação')
    expect(nomeSemCaixaAlta('SPDA')).toBe('SPDA')
    expect(nomeSemCaixaAlta('Estrutura')).toBe('Estrutura')
  })
  it('duas disciplinas da ficha com o mesmo nome no servidor não aparecem iguais (ES e EC são "Estrutura")', () => {
    const nomes = nomesDeDisciplina([doc('e1', 'EXE.ES.100.FORPILOTIS', { disciplina: 'Estrutura' }), doc('c1', 'EXE.EC.1005.ESCVPILOXX', { disciplina: 'Estrutura' })])
    expect(nomes.get('ESTRUTURAL')).toBe('Estrutura')
    expect(nomes.get('ESCORAMENTO')).toBe('Escoramento')
  })
  it('a revisão da cópia do servidor mostra a fase; a da ficha fica como a planilha escreve', () => {
    expect(rotuloDaCopia({ fase: 'EX', revisao: 0, app: { entregaId: 'a', documentoId: 'd', assinaturaId: null, fase: 'EX' } })).toBe('EX R00')
    expect(rotuloDaCopia({ fase: 'EX', revisao: 2, app: { entregaId: 'a', documentoId: 'd', assinaturaId: null, fase: 'PE' } })).toBe('PE R02')
    expect(rotuloDaCopia({ fase: 'LO', revisao: 1, app: { entregaId: 'a', documentoId: 'd', assinaturaId: null } })).toBe('LO R01')
    expect(rotuloDaCopia({ fase: 'EX', revisao: 0 })).toBe('R00')
  })
})

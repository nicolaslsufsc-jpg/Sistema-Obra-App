import { describe, expect, it, vi } from 'vitest'
import { BancoLocal } from '../nucleo/banco_local'
import type { ObraLocal, UsuarioLocal } from '../nucleo/conta'
import { gerarSalvamento, aplicarSalvamento } from '../nucleo/salvamento'
import { idsDosExemplos, semearExemplos, pdfDeExemplo, tirarExemplos } from './exemplos'
import { Sincronizador } from '../nucleo/sincronizacao'
import { TABELAS_SINCRONIZADAS } from '../nucleo/tabelas'
import { banco as bancoDoApp } from '../nucleo/servicos'
import { registrarDocumento, trocarBaixador, urlDoArquivo } from './dados'
import {
  camposDoRascunho,
  conferirRascunho,
  contarVencidos,
  filtrar,
  montarDocumentos,
  recusaDoArquivo,
  statusDaRevisao,
  TABELA_DOCUMENTOS,
  validadeDe,
  LIMITE_ARQUIVO,
  type LinhaDocumento,
  type Rascunho,
} from './regras'

const OBRA: ObraLocal = { id: 'b0000000-0000-0000-0000-0000000000dd', codigo: 'EXE', nome: 'Obra Exemplo', empresa: null, papel: 'admin' }
const USUARIO: UsuarioLocal = { id: 'c0000000-0000-0000-0000-000000000001', email: 'sem-conta@este-aparelho' }
const HOJE = '2026-11-09'

/** Grava como o módulo grava (sincronizador do núcleo), num banco só do teste. */
const gravarLinha = (b: BancoLocal, obraId: string, usuarioId: string, campos: Record<string, unknown>) =>
  new Sincronizador({ banco: b, cliente: {} as never, tabelas: TABELAS_SINCRONIZADAS }).registrar(TABELA_DOCUMENTOS, obraId, usuarioId, campos)

let n = 0
function linha(c: Partial<LinhaDocumento>): LinhaDocumento {
  n++
  return {
    id: `id-${n}`,
    obra_id: OBRA.id,
    usuario_id: 'u',
    dispositivo_id: 'd',
    criado_em_dispositivo: `2026-11-01T10:00:${String(n).padStart(2, '0')}.000Z`,
    apagado: false,
    escopo: 'empresa',
    categoria: 'pes',
    codigo: 'EXE-PES-01',
    titulo: 'Alvenaria',
    revisao: '00',
    data_revisao: '2026-01-10',
    validade: null,
    responsavel: 'Engenharia',
    situacao: 'vigente',
    arquivo_id: null,
    observacao: null,
    substitui_id: null,
    cancelado: false,
    ...c,
  }
}

const rascunho = (c: Partial<Rascunho> = {}): Rascunho => ({
  escopo: 'obra',
  categoria: 'outros',
  codigo: 'EXE-ART-02',
  titulo: 'ART de projeto',
  revisao: '00',
  data_revisao: '2026-11-01',
  validade: '',
  responsavel: 'Responsável técnico',
  situacao: 'vigente',
  observacao: '',
  ...c,
})

describe('lista mestra', () => {
  it('revisão nova (mesmo código) deixa a anterior obsoleta; código igual noutro escopo é outro documento', () => {
    const r0 = linha({ revisao: '00', data_revisao: '2025-05-01' })
    const r1 = linha({ revisao: '01', data_revisao: '2026-03-01', titulo: 'Alvenaria de vedação' })
    const outro = linha({ escopo: 'obra', revisao: '00' })
    const docs = montarDocumentos([r1, r0, outro])
    expect(docs).toHaveLength(2)
    const doc = docs.find((d) => d.escopo === 'empresa')!
    expect(doc.atual.revisao).toBe('01')
    expect(doc.anteriores.map((r) => r.revisao)).toEqual(['00'])
    expect(statusDaRevisao(doc, doc.atual)).toBe('vigente')
    expect(statusDaRevisao(doc, doc.anteriores[0])).toBe('obsoleto')
  })

  it('correção (substitui_id) vale no lugar da linha; cancelar some com a revisão', () => {
    const r0 = linha({ revisao: '00' })
    const emRevisao = linha({ revisao: '00', substitui_id: r0.id, situacao: 'em_revisao' })
    let docs = montarDocumentos([r0, emRevisao])
    expect(docs).toHaveLength(1)
    expect(statusDaRevisao(docs[0], docs[0].atual)).toBe('em_revisao')
    expect(docs[0].anteriores).toHaveLength(0)

    const cancelada = linha({ revisao: '00', substitui_id: emRevisao.id, cancelado: true })
    docs = montarDocumentos([r0, emRevisao, cancelada])
    expect(docs).toHaveLength(0)
  })

  it('ordena por categoria (ordem do SiAC) e código com número', () => {
    const docs = montarDocumentos([
      linha({ categoria: 'pes', codigo: 'EXE-PES-10' }),
      linha({ categoria: 'pes', codigo: 'EXE-PES-2' }),
      linha({ categoria: 'sistema', codigo: 'EXE-MQ' }),
    ])
    expect(docs.map((d) => d.codigo)).toEqual(['EXE-MQ', 'EXE-PES-2', 'EXE-PES-10'])
  })

  it('validade: vencido, vence em até 30 dias, em dia e sem validade', () => {
    const [venc, perto, longe, sem] = [
      linha({ codigo: 'A', validade: '2026-11-01' }),
      linha({ codigo: 'B', validade: '2026-11-30' }),
      linha({ codigo: 'C', validade: '2027-06-01' }),
      linha({ codigo: 'D' }),
    ]
    const docs = montarDocumentos([venc, perto, longe, sem])
    const v = (c: string) => validadeDe(docs.find((d) => d.codigo === c)!, HOJE)
    expect(v('A')).toEqual({ tipo: 'vencido', dias: 8 })
    expect(v('B')).toEqual({ tipo: 'vence', dias: 21 })
    expect(v('C')).toEqual({ tipo: 'ok' })
    expect(v('D')).toEqual({ tipo: 'sem' })
    expect(contarVencidos(docs, HOJE)).toEqual({ vencidos: 1, vencendo: 1 })
    expect(filtrar(docs, { escopo: 'empresa', categoria: null, status: 'vencidos' }, HOJE).map((d) => d.codigo)).toEqual(['A'])
  })

  it('filtra por escopo, categoria, em revisão e busca sem acento', () => {
    const docs = montarDocumentos([
      linha({ codigo: 'X1', categoria: 'pes', titulo: 'Fôrma de pilares' }),
      linha({ codigo: 'X2', categoria: 'sistema', situacao: 'em_revisao' }),
      linha({ codigo: 'X3', escopo: 'obra', categoria: 'pqo' }),
    ])
    expect(filtrar(docs, { escopo: 'obra', categoria: null, status: 'todos' }, HOJE).map((d) => d.codigo)).toEqual(['X3'])
    expect(filtrar(docs, { escopo: 'empresa', categoria: 'pes', status: 'todos' }, HOJE).map((d) => d.codigo)).toEqual(['X1'])
    expect(filtrar(docs, { escopo: 'empresa', categoria: null, status: 'em_revisao' }, HOJE).map((d) => d.codigo)).toEqual(['X2'])
    expect(filtrar(docs, { escopo: 'empresa', categoria: null, status: 'todos', busca: 'forma' }, HOJE).map((d) => d.codigo)).toEqual(['X1'])
  })
})

describe('cadastro', () => {
  const existentes = montarDocumentos([linha({ escopo: 'obra', codigo: 'EXE-ART-01', revisao: '00' })])

  it('confere os campos obrigatórios e a validade', () => {
    expect(conferirRascunho(rascunho(), existentes)).toEqual({})
    const e = conferirRascunho(rascunho({ codigo: ' ', titulo: '', responsavel: '', data_revisao: '', validade: '2026-10-01' }), existentes)
    expect(Object.keys(e).sort()).toEqual(['codigo', 'data_revisao', 'responsavel', 'titulo'])
    expect(conferirRascunho(rascunho({ validade: '2026-10-01' }), existentes).validade).toMatch(/antes da data/)
  })

  it('código repetido só entra como revisão nova, e com revisão diferente', () => {
    expect(conferirRascunho(rascunho({ codigo: 'exe-art-01' }), existentes).codigo).toMatch(/Já existe/)
    const chave = existentes[0].chave
    expect(conferirRascunho(rascunho({ codigo: 'EXE-ART-01', revisao: '01' }), existentes, chave)).toEqual({})
    expect(conferirRascunho(rascunho({ codigo: 'EXE-ART-01', revisao: '00' }), existentes, chave).revisao).toMatch(/já existe/)
    // o mesmo código na empresa é outro documento
    expect(conferirRascunho(rascunho({ escopo: 'empresa', codigo: 'EXE-ART-01' }), existentes)).toEqual({})
  })

  it('arquivo: só PDF ou foto, até 10 MB', () => {
    expect(recusaDoArquivo(1000, 'application/pdf')).toBeNull()
    expect(recusaDoArquivo(1000, 'image/jpeg')).toBeNull()
    expect(recusaDoArquivo(1000, 'application/zip')).toMatch(/Só PDF ou foto/)
    expect(recusaDoArquivo(LIMITE_ARQUIVO + 1, 'application/pdf')).toMatch(/limite é 10 MB/)
  })

  it('a linha gravada vai para a fila e volta pelo salvamento (.obra) num aparelho limpo', async () => {
    const banco = new BancoLocal('teste-documentos-salvar')
    const campos = camposDoRascunho(rascunho(), null)
    const l = await gravarLinha(banco, OBRA.id, USUARIO.id, campos)
    expect(await banco.fila.count()).toBe(1)
    expect((await banco.registros.get([TABELA_DOCUMENTOS, l.id]))?.pendente).toBe(1)

    const salvo = await gerarSalvamento(banco, USUARIO, OBRA)
    const outro = new BancoLocal('teste-documentos-restaurar')
    expect(await aplicarSalvamento(outro, salvo, USUARIO)).toEqual({ novos: 1, repetidos: 0 })
    const docs = montarDocumentos((await outro.registros.where('[tabela+obra_id]').equals([TABELA_DOCUMENTOS, OBRA.id]).toArray()).map((r) => r.linha as LinhaDocumento))
    expect(docs.map((d) => d.codigo)).toEqual(['EXE-ART-02'])
  })
})

describe('exemplos', () => {
  it('semeia uma vez, fora da fila, com um PDF para cada revisão', async () => {
    const banco = new BancoLocal('teste-documentos-exemplos')
    const n = await semearExemplos(banco, OBRA, HOJE)
    expect(n).toBeGreaterThan(10)
    expect(await semearExemplos(banco, OBRA, HOJE)).toBe(0)
    expect(await banco.fila.count()).toBe(0)
    const linhas = (await banco.registros.where('[tabela+obra_id]').equals([TABELA_DOCUMENTOS, OBRA.id]).toArray()).map((r) => r.linha as LinhaDocumento)
    expect(linhas).toHaveLength(n)
    for (const l of linhas) expect(await banco.conteudos.get(l.arquivo_id!)).toBeTruthy()
    const docs = montarDocumentos(linhas)
    expect(docs.some((d) => d.anteriores.length > 0)).toBe(true)
    expect(docs.some((d) => d.atual.situacao === 'em_revisao')).toBe(true)
    // exemplo vem marcado e não conta no aviso de vencido
    expect(docs.every((d) => d.exemplo)).toBe(true)
    expect(contarVencidos(docs, HOJE)).toEqual({ vencidos: 0, vencendo: 0 })
    expect(new Set(docs.map((d) => d.escopo))).toEqual(new Set(['empresa', 'obra']))
  })

  it('obra da Nova obra (origem no pacote) não recebe exemplos e perde os que já tinha; a obra comum recebe', async () => {
    const demo = new BancoLocal('teste-documentos-exemplos-origem-1')
    await semearExemplos(demo, OBRA, HOJE) // aparelho que semeou antes da regra
    expect(await demo.registros.where('[tabela+obra_id]').equals([TABELA_DOCUMENTOS, OBRA.id]).count()).toBeGreaterThan(10)
    await demo.gravarMeta(`pacote_obra:${OBRA.id}`, { assinatura: 'x', raiz: 'zip:obra.zip', quando: '2026-11-14T10:00:00Z', gerado_em: null, origem: 'nova_obra' })
    expect(await semearExemplos(demo, OBRA, HOJE)).toBe(0)
    expect(await demo.registros.where('[tabela+obra_id]').equals([TABELA_DOCUMENTOS, OBRA.id]).count()).toBe(0)
    expect(await demo.registros.where('[tabela+obra_id]').equals(['arquivos', OBRA.id]).count()).toBe(0)

    const nova = new BancoLocal('teste-documentos-exemplos-origem-2')
    await nova.gravarMeta(`pacote_obra:${OBRA.id}`, { assinatura: 'x', raiz: 'zip:obra.zip', quando: '2026-11-14T10:00:00Z', gerado_em: null, origem: 'nova_obra' })
    expect(await semearExemplos(nova, OBRA, HOJE)).toBe(0)
    expect(await nova.registros.where('[tabela+obra_id]').equals([TABELA_DOCUMENTOS, OBRA.id]).count()).toBe(0)

    const comum = new BancoLocal('teste-documentos-exemplos-origem-3')
    await comum.gravarMeta(`pacote_obra:${OBRA.id}`, { assinatura: 'x', raiz: 'http://pc/', quando: '2026-11-14T10:00:00Z', gerado_em: null, origem: null })
    expect(await semearExemplos(comum, OBRA, HOJE)).toBeGreaterThan(10)
  })

  it('exemplo antigo (sem a coluna) é reconhecido pelo id; revisão nova feita aqui já é documento de verdade', async () => {
    const banco = new BancoLocal('teste-documentos-exemplos-ids')
    await semearExemplos(banco, OBRA, HOJE)
    const linhas = (await banco.registros.where('[tabela+obra_id]').equals([TABELA_DOCUMENTOS, OBRA.id]).toArray()).map((r) => {
      const { exemplo: _, ...sem } = r.linha as LinhaDocumento & { exemplo?: boolean }
      return sem as LinhaDocumento
    })
    const ids = await idsDosExemplos(OBRA.id)
    expect(montarDocumentos(linhas, ids).every((d) => d.exemplo)).toBe(true)
    const nova = await gravarLinha(banco, OBRA.id, USUARIO.id, { escopo: 'obra', categoria: 'equipamentos', codigo: 'EXE-CAL-TR01', titulo: 'Certificado novo', revisao: '01', data_revisao: HOJE, validade: '2027-11-09', responsavel: 'Mestre', situacao: 'vigente', arquivo_id: null, observacao: null })
    const docs = montarDocumentos([...linhas, nova as unknown as LinhaDocumento], ids)
    expect(docs.find((d) => d.codigo === 'EXE-CAL-TR01')!.exemplo).toBe(false)
  })

  it('só semeia em obra sem documento; "Tirar os exemplos" tira e não volta', async () => {
    const comDoc = new BancoLocal('teste-documentos-exemplos-obra-com-doc')
    await gravarLinha(comDoc, OBRA.id, USUARIO.id, { escopo: 'obra', categoria: 'outros', codigo: 'EXE-ART-01', titulo: 'ART', revisao: '00', data_revisao: HOJE, validade: null, responsavel: 'RT', situacao: 'vigente', arquivo_id: null, observacao: null })
    expect(await semearExemplos(comDoc, OBRA, HOJE)).toBe(0)
    expect(await comDoc.registros.where('[tabela+obra_id]').equals([TABELA_DOCUMENTOS, OBRA.id]).count()).toBe(1)

    const banco = new BancoLocal('teste-documentos-tirar-exemplos')
    const n = await semearExemplos(banco, OBRA, HOJE)
    const minha = await gravarLinha(banco, OBRA.id, USUARIO.id, { escopo: 'obra', categoria: 'outros', codigo: 'EXE-ATA-01', titulo: 'Ata', revisao: '00', data_revisao: HOJE, validade: null, responsavel: 'Eng.', situacao: 'vigente', arquivo_id: null, observacao: null })
    expect(await tirarExemplos(banco, OBRA.id)).toBe(n)
    const sobrou = await banco.registros.where('[tabela+obra_id]').equals([TABELA_DOCUMENTOS, OBRA.id]).toArray()
    expect(sobrou.map((r) => r.id)).toEqual([minha.id])
    expect(await banco.conteudos.count()).toBe(0)
    expect(await semearExemplos(banco, OBRA, HOJE)).toBe(0)
  })

  it('o PDF de exemplo é um PDF de verdade (cabeçalho, xref e fim)', () => {
    const t = new TextDecoder().decode(pdfDeExemplo(['DOCUMENTO DE EXEMPLO', 'Fôrma (pilares)']))
    expect(t.startsWith('%PDF-1.4')).toBe(true)
    expect(t).toContain('(Forma \\(pilares\\)) Tj')
    const xref = Number(/startxref\n(\d+)/.exec(t)![1])
    expect(t.slice(xref, xref + 4)).toBe('xref')
    expect(t.trimEnd().endsWith('%%EOF')).toBe(true)
  })
})

describe('com conta (item 3 do núcleo, 20/11)', () => {
  it('doc_documentos está entre as sincronizadas, depois de arquivos (o PDF chega antes da linha)', () => {
    expect(TABELAS_SINCRONIZADAS).toContain(TABELA_DOCUMENTOS)
    expect(TABELAS_SINCRONIZADAS.indexOf(TABELA_DOCUMENTOS)).toBeGreaterThan(TABELAS_SINCRONIZADAS.indexOf('arquivos'))
  })

  it('registrar vai pelo sincronizador: registro pendente e fila, com as colunas do núcleo', async () => {
    const obra = 'b0000000-0000-0000-0000-0000000000d7'
    const l = await registrarDocumento(obra, USUARIO.id, camposDoRascunho(rascunho(), null))
    const fila = (await bancoDoApp.fila.toArray()).filter((f) => f.obra_id === obra)
    expect(fila.map((f) => [f.tabela, f.id])).toEqual([[TABELA_DOCUMENTOS, l.id]])
    expect((await bancoDoApp.registros.get([TABELA_DOCUMENTOS, l.id]))?.pendente).toBe(1)
    expect(l).toMatchObject({ obra_id: obra, usuario_id: USUARIO.id, apagado: false })
    expect(typeof l.dispositivo_id).toBe('string')
  })

  it('o arquivo que já saiu do aparelho só vem do servidor quando a tela pede', async () => {
    const pdf = pdfDeExemplo(['DOCUMENTO DE EXEMPLO'])
    const pedidos: string[] = []
    trocarBaixador(async (caminho) => {
      pedidos.push(caminho)
      return pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer
    })
    const arquivo = { id: 'f0000000-0000-0000-0000-0000000000d7', caminho: `${OBRA.id}/documentos/x.pdf` }
    vi.stubGlobal('navigator', { ...globalThis.navigator, onLine: true })
    expect(await urlDoArquivo(arquivo)).toBeNull()
    expect(pedidos).toEqual([])
    const u = await urlDoArquivo(arquivo, true)
    expect(u).toMatchObject({ abrir: true, foto: false })
    expect(pedidos).toEqual([arquivo.caminho])
    // sem caminho (arquivo de exemplo ou do pacote, que mora só no aparelho): nem tenta
    expect(await urlDoArquivo({ id: arquivo.id }, true)).toBeNull()
    expect(pedidos).toHaveLength(1)
    // sem internet: nem tenta
    vi.stubGlobal('navigator', { ...globalThis.navigator, onLine: false })
    expect(await urlDoArquivo(arquivo, true)).toBeNull()
    expect(pedidos).toHaveLength(1)
    vi.unstubAllGlobals()
  })

  it('o formulário recusa texto maior que o servidor aceita', () => {
    const e = conferirRascunho({ ...rascunho(), titulo: 'T'.repeat(301), revisao: 'R'.repeat(21), responsavel: 'P'.repeat(201) }, [])
    expect(Object.keys(e).sort()).toEqual(['responsavel', 'revisao', 'titulo'])
    expect(conferirRascunho({ ...rascunho(), titulo: 'T'.repeat(300), revisao: 'R'.repeat(20), responsavel: 'P'.repeat(200) }, [])).toEqual({})
  })
})

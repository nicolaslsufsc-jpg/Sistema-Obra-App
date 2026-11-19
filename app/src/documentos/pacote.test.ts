import { describe, expect, it } from 'vitest'
import { BancoLocal } from '../nucleo/banco_local'
import type { ObraLocal } from '../nucleo/conta'
import { sha256Hex } from '../fvs/pacote'
import { pdfDeExemplo } from './exemplos'
import { gravarLinha } from './gravar'
import { semearDocumentosDoPacote, type DocumentoNoPacote } from './pacote'
import { montarDocumentos, TABELA_DOCUMENTOS, type LinhaDocumento } from './regras'

const OBRA: ObraLocal = { id: 'b0000000-0000-0000-0000-0000000000ee', codigo: 'EXE', nome: 'Obra Exemplo', empresa: null, papel: 'admin' }
let seq = 0
const novoBanco = () => new BancoLocal(`teste-doc-pacote-${++seq}`)

async function pacote(docs: Array<Omit<DocumentoNoPacote, 'arquivo'> & { pdf?: string }>) {
  const arquivos = new Map<string, Blob>()
  const lista: DocumentoNoPacote[] = []
  for (const d of docs) {
    const { pdf, ...resto } = d
    let arquivo = null
    if (pdf) {
      const bytes = pdfDeExemplo([pdf])
      const caminho = `arquivos/${d.codigo}.pdf`
      arquivos.set(caminho, new Blob([bytes as BlobPart]))
      arquivo = { caminho, nome: `${d.codigo}.pdf`, tipo: 'application/pdf', tamanho: bytes.byteLength, sha256: await sha256Hex(bytes.buffer.slice(0) as ArrayBuffer) }
    }
    lista.push({ ...resto, arquivo })
  }
  arquivos.set('indice.json', new Blob([JSON.stringify({ documentos: lista })]))
  return {
    arquivos,
    ler: async (c: string) => (c.startsWith('documentos/') ? (arquivos.get(c.slice('documentos/'.length)) ?? null) : null),
  }
}

const base = { categoria: 'sistema', titulo: 'Manual da Qualidade', revisao: '03', data_revisao: '2026-02-01', responsavel: 'Qualidade' }

async function docs(b: BancoLocal) {
  const linhas = await b.registros.where('[tabela+obra_id]').equals([TABELA_DOCUMENTOS, OBRA.id]).toArray()
  return montarDocumentos(linhas.map((r) => r.linha as unknown as LinhaDocumento))
}

describe('documentos da empresa no pacote da obra', () => {
  it('entram como baixados (fora da fila), escopo empresa, com o arquivo conferido', async () => {
    const b = novoBanco()
    const p = await pacote([{ ...base, codigo: 'exe-mq', pdf: 'Manual' }, { ...base, codigo: 'EXE-PES-01', categoria: 'pes', titulo: 'Alvenaria', revisao: '01', situacao: 'em_revisao' }])
    expect(await semearDocumentosDoPacote(b, OBRA, p.ler)).toBe(2)
    const d = await docs(b)
    expect(d.map((x) => [x.escopo, x.codigo])).toEqual([
      ['empresa', 'EXE-MQ'],
      ['empresa', 'EXE-PES-01'],
    ])
    expect(d[1].atual.situacao).toBe('em_revisao')
    expect(await b.fila.count()).toBe(0)
    const arq = await b.conteudos.get(d[0].atual.arquivo_id!)
    expect(arq?.bytes.byteLength).toBeGreaterThan(100)
    // o mesmo pacote de novo: nada muda
    expect(await semearDocumentosDoPacote(b, OBRA, p.ler)).toBe(0)
  })

  it('pacote novo troca o anterior, e o que foi feito no aparelho fica', async () => {
    const b = novoBanco()
    await semearDocumentosDoPacote(b, OBRA, (await pacote([{ ...base, codigo: 'EXE-MQ', pdf: 'v3' }, { ...base, codigo: 'EXE-SAI', titulo: 'Sai no próximo' }])).ler)
    await gravarLinha(b, OBRA.id, 'u', { ...base, escopo: 'empresa', codigo: 'EXE-LOCAL', titulo: 'Feito aqui', validade: null, situacao: 'vigente', arquivo_id: null, observacao: null })
    const antigoArquivo = (await docs(b)).find((x) => x.codigo === 'EXE-MQ')!.atual.arquivo_id!
    expect(await semearDocumentosDoPacote(b, OBRA, (await pacote([{ ...base, codigo: 'EXE-MQ', revisao: '04', data_revisao: '2026-10-01', pdf: 'v4' }])).ler)).toBe(1)
    const d = await docs(b)
    expect(d.map((x) => x.codigo).sort()).toEqual(['EXE-LOCAL', 'EXE-MQ'])
    expect(d.find((x) => x.codigo === 'EXE-MQ')!.atual.revisao).toBe('04')
    expect(await b.conteudos.get(antigoArquivo)).toBeUndefined()
    expect(await b.fila.count()).toBe(1)
  })

  it('sem pasta de documentos no pacote, nada acontece', async () => {
    const b = novoBanco()
    expect(await semearDocumentosDoPacote(b, OBRA, async () => null)).toBe(0)
  })

  it('arquivo diferente do índice ou campo faltando: erro e nada gravado', async () => {
    const b = novoBanco()
    const p = await pacote([{ ...base, codigo: 'EXE-MQ', pdf: 'certo' }])
    p.arquivos.set('arquivos/EXE-MQ.pdf', new Blob([pdfDeExemplo(['trocado!']) as BlobPart]))
    await expect(semearDocumentosDoPacote(b, OBRA, p.ler)).rejects.toThrow(/estragado/)
    const q = await pacote([{ ...base, codigo: 'EXE-MQ', responsavel: '' }])
    await expect(semearDocumentosDoPacote(b, OBRA, q.ler)).rejects.toThrow(/com problema/)
    expect(await b.registros.count()).toBe(0)
  })
})

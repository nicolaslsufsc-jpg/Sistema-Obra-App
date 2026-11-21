// Integração do módulo Documentos com conta (item 3 do núcleo, 20/11/2026): cadastro no aparelho →
// envio (PDF pelo núcleo, depois a linha) → PostgREST de verdade (RLS) → baixa em outro aparelho, que
// abre o PDF pelo armazenamento. Rodar com: bash supabase/testes/rodar_integracao.sh
// Sem as variáveis SO_* (ex.: "npm test" sozinho) estes testes são pulados.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { BancoLocal } from '../src/nucleo/banco_local'
import { Sincronizador } from '../src/nucleo/sincronizacao'
import { TABELAS_NUCLEO } from '../src/config'
import { TABELAS_SINCRONIZADAS } from '../src/nucleo/tabelas'
import { TABELA_DOCUMENTOS } from '../src/documentos/tabelas'
import { montarDocumentos, type LinhaDocumento } from '../src/documentos/regras'
import { pdfDeExemplo } from '../src/documentos/exemplos'
import { iniciarServidorTeste, tokenDe, type ServidorTeste, type UsuarioTeste } from './servidor_teste'
import { OBRA1, USUARIOS } from './dados'

const PGRST = process.env.SO_PGRST_URL
const SEGREDO = process.env.SO_JWT_SEGREDO ?? ''
const suite = PGRST ? describe : describe.skip
const TABELAS = [...TABELAS_NUCLEO, TABELA_DOCUMENTOS]
const { campo, gestor, leitura } = USUARIOS

let servidor: ServidorTeste
let sql: pg.Client
let contador = 0

function clienteDe(u: UsuarioTeste) {
  return createClient(servidor.url, 'chave-publica-de-teste', { accessToken: async () => tokenDe(u, SEGREDO, 3600) })
}

function sincronizadorDe(u: UsuarioTeste) {
  return new Sincronizador({ banco: new BancoLocal(`documentos-${++contador}`), cliente: clienteDe(u), tabelas: TABELAS })
}

const revisao = (c: Partial<LinhaDocumento> = {}) => ({
  escopo: 'empresa',
  categoria: 'pes',
  codigo: 'EXE-PES-07',
  titulo: 'Execução de contrapiso',
  revisao: '00',
  data_revisao: '2026-11-01',
  validade: null,
  responsavel: 'Engenheira da qualidade',
  situacao: 'vigente',
  arquivo_id: null,
  observacao: null,
  substitui_id: null,
  cancelado: false,
  ...c,
})

suite('documentos contra PostgREST real', () => {
  beforeAll(async () => {
    servidor = await iniciarServidorTeste({ pgrstUrl: PGRST!, segredoJwt: SEGREDO, usuarios: Object.values(USUARIOS) })
    sql = new pg.Client({ host: process.env.SO_PG_HOST, port: Number(process.env.SO_PG_PORT), user: 'postgres', database: 'postgres' })
    await sql.connect()
  })

  afterAll(async () => {
    await sql?.end()
    await servidor?.fechar()
  })

  it('a tabela está na lista de sincronização, depois de arquivos', () => {
    const pos = (t: string) => TABELAS_SINCRONIZADAS.indexOf(t)
    expect(pos(TABELA_DOCUMENTOS)).toBeGreaterThan(pos('arquivos'))
  })

  it('gestor cadastra com PDF e marca "em revisão"; quem só lê baixa a lista e abre o PDF', async () => {
    const sg = sincronizadorDe(gestor)
    const pdf = pdfDeExemplo(['DOCUMENTO DE EXEMPLO', 'EXE-PES-07 rev. 00'])
    const arquivo = await sg.registrarArquivo(OBRA1, gestor.id, 'documentos', new Blob([pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), 'EXE-PES-07_rev00.pdf')
    const doc = await sg.registrar(TABELA_DOCUMENTOS, OBRA1, gestor.id, revisao({ arquivo_id: arquivo.id }))
    await sg.registrar(TABELA_DOCUMENTOS, OBRA1, gestor.id, revisao({ arquivo_id: arquivo.id, situacao: 'em_revisao', substitui_id: doc.id }))
    const envio = await sg.enviar(gestor.id)
    expect(envio).toMatchObject({ enviados: 3, comErro: 0 })

    const n = await sql.query('select count(*)::int as n from public.doc_documentos where codigo = $1', ['EXE-PES-07'])
    expect(n.rows[0].n).toBe(2)
    const arq = await sql.query('select caminho from public.arquivos where id = $1', [arquivo.id])
    expect(arq.rows[0].caminho).toBe(`${OBRA1}/documentos/${arquivo.id}.pdf`)

    // outro aparelho, só leitura: baixa e monta a mesma lista mestra sem internet
    const sl = sincronizadorDe(leitura)
    await sl.baixar(OBRA1, leitura.id)
    const linhas = (await sl.linhas(TABELA_DOCUMENTOS, OBRA1)).filter((l) => l.codigo === 'EXE-PES-07') as unknown as LinhaDocumento[]
    const [d] = montarDocumentos(linhas)
    expect(d.atual.situacao).toBe('em_revisao')
    expect(d.anteriores).toHaveLength(0)
    // o PDF já saiu do aparelho do gestor (regra do núcleo) e vem do armazenamento
    const caminho = String((await sl.linhas('arquivos', OBRA1)).find((a) => a.id === arquivo.id)?.caminho)
    const { data, error } = await clienteDe(leitura).storage.from('obras').download(caminho)
    expect(error).toBeNull()
    expect(new Uint8Array(await data!.arrayBuffer())).toEqual(pdf)
  })

  it('campo e leitura não cadastram; o servidor recusa e nada entra', async () => {
    for (const u of [campo, leitura]) {
      const s = sincronizadorDe(u)
      await s.registrar(TABELA_DOCUMENTOS, OBRA1, u.id, revisao({ codigo: `EXE-NAO-${u.id.slice(-2)}` }))
      expect((await s.enviar(u.id)).comErro).toBe(1)
    }
    const n = await sql.query("select count(*)::int as n from public.doc_documentos where codigo like 'EXE-NAO-%'")
    expect(n.rows[0].n).toBe(0)
  })
})

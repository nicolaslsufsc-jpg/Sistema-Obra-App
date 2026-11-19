// Integração do módulo Projetos: registro no aparelho → envio → PostgREST de verdade (RLS) →
// views do banco e baixa em outro aparelho. Rodar com: bash supabase/testes/rodar_integracao.sh
// Sem as variáveis SO_* (ex.: "npm test" sozinho) estes testes são pulados.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { BancoLocal } from '../src/nucleo/banco_local'
import { Sincronizador } from '../src/nucleo/sincronizacao'
import { TABELAS_NUCLEO } from '../src/config'
import { TABELAS_SINCRONIZADAS } from '../src/nucleo/tabelas'
import { TABELAS_PROJETOS } from '../src/projetos/tabelas'
import { situacoes, vigentePorDocumento } from '../src/projetos/regras'
import { iniciarServidorTeste, tokenDe, type ServidorTeste, type UsuarioTeste } from './servidor_teste'
import { OBRA1, USUARIOS } from './dados'

const PGRST = process.env.SO_PGRST_URL
const SEGREDO = process.env.SO_JWT_SEGREDO ?? ''
const suite = PGRST ? describe : describe.skip
const TABELAS = [...TABELAS_NUCLEO, ...TABELAS_PROJETOS]
const { campo, gestor, leitura } = USUARIOS

let servidor: ServidorTeste
let sql: pg.Client
let contador = 0

function sincronizadorDe(u: UsuarioTeste) {
  const banco = new BancoLocal(`projetos-${++contador}`)
  const cliente = createClient(servidor.url, 'chave-publica-de-teste', { accessToken: async () => tokenDe(u, SEGREDO, 3600) })
  return new Sincronizador({ banco, cliente, tabelas: TABELAS })
}

suite('projetos contra PostgREST real', () => {
  beforeAll(async () => {
    servidor = await iniciarServidorTeste({ pgrstUrl: PGRST!, segredoJwt: SEGREDO, usuarios: Object.values(USUARIOS) })
    sql = new pg.Client({ host: process.env.SO_PG_HOST, port: Number(process.env.SO_PG_PORT), user: 'postgres', database: 'postgres' })
    await sql.connect()
  })

  afterAll(async () => {
    await sql?.end()
    await servidor?.fechar()
  })

  it('as tabelas do módulo estão na lista de sincronização, pais antes dos filhos', () => {
    const pos = (t: string) => TABELAS_SINCRONIZADAS.indexOf(t)
    for (const t of TABELAS_PROJETOS) expect(pos(t)).toBeGreaterThan(-1)
    expect(pos('documentos')).toBeLessThan(pos('revisoes'))
    expect(pos('revisoes')).toBeLessThan(pos('distribuicao_eventos'))
    expect(pos('empresas')).toBeLessThan(pos('distribuicao_eventos'))
    expect(pos('arquivos')).toBeLessThan(pos('distribuicao_eventos'))
  })

  it('gestor cadastra; campo entrega com foto e devolve; a view do banco e o aparelho batem', async () => {
    const sg = sincronizadorDe(gestor)
    const empresa = await sg.registrar('empresas', OBRA1, gestor.id, { nome: 'Empreiteira Teste', contato: null, ativa: true })
    const doc = await sg.registrar('documentos', OBRA1, gestor.id, {
      codigo: 'XPT.ES.112.FORPILOTIS', disciplina_sigla: 'ES', disciplina: 'Estrutura', numero: '112', nome_curto: 'FORPILOTIS',
      titulo: 'PLANTA DE FORMA DO PILOTIS', pasta_autodoc: null, link_pasta: null,
    })
    const ex = await sg.registrar('revisoes', OBRA1, gestor.id, { documento_id: doc.id, fase: 'EX', numero: '05', obsoleta: false, extensoes: 'pdf', vista_em: '2026-10-01' })
    const lo = await sg.registrar('revisoes', OBRA1, gestor.id, { documento_id: doc.id, fase: 'LO', numero: '02', obsoleta: false, extensoes: 'dwg,pdf', vista_em: '2026-11-03' })
    const envioGestor = await sg.enviar(gestor.id)
    expect(envioGestor.comErro).toBe(0)
    expect(envioGestor.enviados).toBe(4)

    // campo baixa o cadastro e registra a entrega da EX 05 (a vencida) com a foto do formulário
    const sc = sincronizadorDe(campo)
    await sc.baixar(OBRA1, campo.id)
    const foto = await sc.registrarArquivo(OBRA1, campo.id, 'projetos', new Blob(['foto de teste'], { type: 'image/jpeg' }), 'formulario.jpg')
    const entrega = await sc.registrar('distribuicao_eventos', OBRA1, campo.id, {
      tipo: 'entrega', empresa_id: empresa.id, colaborador: 'João', documento_id: doc.id, revisao_id: ex.id, entrega_id: null,
      data_evento: '2026-11-03', foto_id: foto.id, observacao: null,
    })
    const envioCampo = await sc.enviar(campo.id)
    expect(envioCampo.comErro).toBe(0)
    expect(envioCampo.enviados).toBe(2)

    const vig = await sql.query('select id from public.revisoes_vigentes where documento_id = $1', [doc.id])
    expect(vig.rows[0].id).toBe(lo.id)
    const sit = await sql.query('select situacao, revisao_em_campo_id, entregas_abertas from public.situacao_distribuicao where documento_id = $1', [doc.id])
    expect(sit.rows).toEqual([{ situacao: 'RECOLHER', revisao_em_campo_id: ex.id, entregas_abertas: 1 }])
    const arq = await sql.query('select caminho from public.arquivos where id = $1', [foto.id])
    expect(arq.rows[0].caminho).toBe(`${OBRA1}/projetos/${foto.id}.jpg`)

    // devolução aponta para a entrega
    await sc.registrar('distribuicao_eventos', OBRA1, campo.id, {
      tipo: 'devolucao', empresa_id: empresa.id, colaborador: 'João', documento_id: doc.id, revisao_id: ex.id, entrega_id: entrega.id,
      data_evento: '2026-11-04', foto_id: null, observacao: 'recolhida na obra',
    })
    expect((await sc.enviar(campo.id)).comErro).toBe(0)
    const depois = await sql.query('select situacao from public.situacao_distribuicao where documento_id = $1', [doc.id])
    expect(depois.rows).toEqual([{ situacao: 'DEVOLVIDO' }])

    // outro aparelho (só leitura) baixa tudo e calcula a mesma situação sem internet
    const sl = sincronizadorDe(leitura)
    await sl.baixar(OBRA1, leitura.id)
    const revs = (await sl.linhas('revisoes', OBRA1)).filter((r) => r.documento_id === doc.id)
    const eventos = (await sl.linhas('distribuicao_eventos', OBRA1)).filter((e) => e.documento_id === doc.id)
    const vigentes = vigentePorDocumento(revs)
    expect(vigentes.get(doc.id)?.id).toBe(lo.id)
    expect(situacoes(eventos, vigentes).map((s) => s.situacao)).toEqual(['DEVOLVIDO'])
  })

  it('quem só lê não registra entrega; campo não cadastra empresa; devolução de entrega alheia é recusada', async () => {
    const sg = sincronizadorDe(gestor)
    const empresaA = await sg.registrar('empresas', OBRA1, gestor.id, { nome: 'Empresa A', contato: null, ativa: true })
    const empresaB = await sg.registrar('empresas', OBRA1, gestor.id, { nome: 'Empresa B', contato: null, ativa: true })
    const doc = await sg.registrar('documentos', OBRA1, gestor.id, { codigo: 'XPT.AR.010.PLANTABAIX', disciplina_sigla: 'AR', numero: '010', nome_curto: 'PLANTABAIX', titulo: 'PLANTA BAIXA' })
    const rev = await sg.registrar('revisoes', OBRA1, gestor.id, { documento_id: doc.id, fase: 'EX', numero: '04', obsoleta: false, vista_em: '2026-11-03' })
    expect((await sg.enviar(gestor.id)).comErro).toBe(0)

    const sl = sincronizadorDe(leitura)
    await sl.registrar('distribuicao_eventos', OBRA1, leitura.id, { tipo: 'entrega', empresa_id: empresaA.id, documento_id: doc.id, revisao_id: rev.id, entrega_id: null, data_evento: '2026-11-03' })
    expect((await sl.enviar(leitura.id)).comErro).toBe(1)

    const sc = sincronizadorDe(campo)
    await sc.registrar('empresas', OBRA1, campo.id, { nome: 'Empresa do campo', contato: null, ativa: true })
    expect((await sc.enviar(campo.id)).comErro).toBe(1)

    const sc2 = sincronizadorDe(campo)
    const entregaA = await sc2.registrar('distribuicao_eventos', OBRA1, campo.id, { tipo: 'entrega', empresa_id: empresaA.id, documento_id: doc.id, revisao_id: rev.id, entrega_id: null, data_evento: '2026-11-03' })
    expect((await sc2.enviar(campo.id)).comErro).toBe(0)
    const sc3 = sincronizadorDe(campo)
    await sc3.registrar('distribuicao_eventos', OBRA1, campo.id, { tipo: 'devolucao', empresa_id: empresaB.id, documento_id: doc.id, revisao_id: rev.id, entrega_id: entregaA.id, data_evento: '2026-11-04' })
    const recusada = await sc3.enviar(campo.id)
    expect(recusada.comErro).toBe(1)
    const n = await sql.query("select count(*)::int as n from public.distribuicao_eventos where documento_id = $1 and tipo = 'devolucao'", [doc.id])
    expect(n.rows[0].n).toBe(0)
  })
})

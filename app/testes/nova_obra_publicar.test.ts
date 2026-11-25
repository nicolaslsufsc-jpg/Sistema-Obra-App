// Nova obra, "Publicar no servidor", contra o PostgREST de verdade (regras do banco valendo):
// o admin publica uma obra com planta, ficha e pessoas; depois confere o que ficou no banco e no
// armazenamento, e que quem não é admin não consegue.
// Rodar com: bash supabase/testes/rodar_integracao.sh

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { BancoLocal } from '../src/nucleo/banco_local'
import { Conta } from '../src/nucleo/conta'
import { Sincronizador } from '../src/nucleo/sincronizacao'
import { BLOCOS_SINCRONIZADOS, TABELAS_SINCRONIZADAS } from '../src/nucleo/tabelas'
import { BUCKET_OBRAS } from '../src/config'
import { fichaVazia, type EstadoPublicacao, type RascunhoObra } from '../src/nova_obra/modelo'
import { publicarObra } from '../src/nova_obra/publicar'
import { criarServidor } from '../src/nova_obra/servidor'
import type { TilesGuardados } from '../src/nova_obra/guardados'
import { iniciarServidorTeste, type ServidorTeste, type UsuarioTeste } from './servidor_teste'
import { CODIGO_TESTE, USUARIOS } from './dados'

const PGRST = process.env.SO_PGRST_URL
const suite = PGRST ? describe : describe.skip
const { admin, gestor, fora } = USUARIOS

let servidor: ServidorTeste
let sql: pg.Client
let n = 0

async function pecasDe(u: UsuarioTeste) {
  const banco = new BancoLocal(`nova-obra-publicar-${++n}`)
  const cliente = createClient(servidor.url, 'chave-publica-de-teste', { auth: { persistSession: true, autoRefreshToken: false, storageKey: `nova-obra-${n}` } })
  const conta = new Conta(cliente, banco)
  expect(await conta.pedirCodigo(u.email)).toBeNull()
  expect(await conta.confirmarCodigo(u.email, CODIGO_TESTE)).toEqual({ id: u.id, email: u.email })
  const sincronizador = new Sincronizador({
    banco,
    cliente,
    tabelas: TABELAS_SINCRONIZADAS,
    blocos: BLOCOS_SINCRONIZADOS,
    bucket: BUCKET_OBRAS,
    sessaoValida: (id) => conta.sessaoDoUsuario(id),
  })
  return { conta, servidor: criarServidor({ cliente, conta, sincronizador }) }
}

const rascunho = (codigo: string): RascunhoObra => ({
  codigo,
  nome: 'Obra Exemplo Nova',
  empresa: 'Construtora Exemplo',
  pavimentos: ['Térreo', 'Tipo 1'],
  fichas: [{ ...fichaVazia(), codigo: `${codigo}-PVS-01`, titulo: 'Pilares', itens: [{ etapa: 'Fôrma', titulo: 'Prumo', descricao: '', dispositivo: '', tolerancia: '' }] }],
  plantas: [
    {
      id: 'a2000000-0000-0000-0000-0000000000f1',
      pavimento: 'Térreo',
      trecho: 'Planta inteira',
      prancha: `${codigo}-FORMA-TERREO-R00`,
      revisao: 'R00',
      arquivo: `${codigo}-FORMA-TERREO-R00.pdf`,
      pagina: { largura: 2384, altura: 1684 },
      janela: [100, 50, 1100, 650],
      escala: 50,
      semTexto: false,
      pecas: [
        { tipo: 'P', nome: 'P-01', secao: '20x50', rotulo: [10, 10, 40, 20], polys: [] },
        { tipo: 'V', nome: 'VT-01', secao: '15x40', rotulo: [50, 10, 90, 20], polys: [] },
      ],
      gerada: { janela: [100, 50, 1100, 650], tiles: 1, bytes: 4, segundos: 1 },
    },
  ],
  pessoas: [
    { nome: 'Pessoa Fora', email: fora.email, papel: 'campo' },
    { nome: 'Pessoa Sem E-mail', email: '', papel: 'leitura' },
  ],
})

const lerTiles = async (id: string): Promise<TilesGuardados> => ({ id, janela: [100, 50, 1100, 650], niveis: [0], largura: 1000, altura: 600, tiles: [['0/0/0', new Blob(['webp'])]] })

async function contar(tabela: string, obraId: string): Promise<number> {
  const { rows } = await sql.query(`select count(*)::int as n from public.${tabela} where obra_id = $1`, [obraId])
  return rows[0].n
}

suite('Nova obra: publicar no servidor (PostgREST de verdade)', () => {
  beforeAll(async () => {
    servidor = await iniciarServidorTeste({ pgrstUrl: PGRST!, segredoJwt: process.env.SO_JWT_SEGREDO!, usuarios: Object.values(USUARIOS) })
    sql = new pg.Client({ host: process.env.SO_PG_HOST, port: Number(process.env.SO_PG_PORT), user: 'postgres', database: 'postgres' })
    await sql.connect()
  })

  afterAll(async () => {
    // Deixa "fora" sem acesso, como os outros testes esperam.
    await sql?.query("delete from public.acessos where usuario_id = $1 and obra_id in (select id from public.obras where codigo like 'EXE-NO%')", [fora.id])
    await sql?.end()
    await servidor?.fechar()
  })

  it('admin publica: obra, pavimentos, peças, planta com arquivos, ficha e convites no servidor', async () => {
    const { conta, servidor: s } = await pecasDe(admin)
    let estado: EstadoPublicacao | undefined
    const res = await publicarObra(rascunho('EXE-NO1'), s, lerTiles, (e) => (estado = e))
    expect(res).toMatchObject({ ok: true, avisos: [] })
    const obraId = estado!.obraId
    expect(estado).toMatchObject({ naFila: true, enviada: true, convidadas: [0, 1] })

    const { rows: obra } = await sql.query('select codigo, nome, empresa from public.obras where id = $1', [obraId])
    expect(obra).toEqual([{ codigo: 'EXE-NO1', nome: 'Obra Exemplo Nova', empresa: 'Construtora Exemplo' }])
    expect(await contar('pavimentos', obraId)).toBe(2)
    expect(await contar('elementos', obraId)).toBe(2)
    expect(await contar('plantas', obraId)).toBe(1)
    expect(await contar('fichas_modelo', obraId)).toBe(1)
    expect(await contar('arquivos', obraId)).toBe(2)
    // unidade de conferência das fichas (ideia 14): uma linha em fvs_regras
    const { rows: regras } = await sql.query('select regras from public.fvs_regras where obra_id = $1', [obraId])
    expect(regras.map((x) => x.regras.unidades.map((u: { unidade: string }) => u.unidade))).toEqual([['peca']])

    // a planta aponta para os dois arquivos, e eles estão no armazenamento
    const { rows: pl } = await sql.query(
      'select m.caminho as manifest, p.caminho as pacote from public.plantas pl join public.arquivos m on m.id = pl.manifest_id join public.arquivos p on p.id = pl.pacote_id where pl.obra_id = $1',
      [obraId],
    )
    expect(pl).toHaveLength(1)
    for (const caminho of [pl[0].manifest, pl[0].pacote]) expect(servidor.arquivos.has(`${BUCKET_OBRAS}/${caminho}`)).toBe(true)
    const manifest = JSON.parse(new TextDecoder().decode(servidor.arquivos.get(`${BUCKET_OBRAS}/${pl[0].manifest}`)!))
    expect(manifest).toMatchObject({ escala: 50, largura: 1000, altura: 600 })

    // convites: um com o e-mail da conta "fora", um esperando e-mail
    const { rows: convites } = await sql.query('select nome, email, papel from public.convites where obra_id = $1 order by nome', [obraId])
    expect(convites).toEqual([
      { nome: 'Pessoa Fora', email: fora.email, papel: 'campo' },
      { nome: 'Pessoa Sem E-mail', email: null, papel: 'leitura' },
    ])

    // a lista de obras do app já mostra a nova
    expect((await conta.obrasLocais()).map((o) => o.codigo)).toContain('EXE-NO1')

    // publicar de novo não cria nada (já está tudo feito)
    const antes = await contar('pavimentos', obraId)
    const de_novo = await publicarObra({ ...rascunho('EXE-NO1'), publicacao: estado }, s, lerTiles, (e) => (estado = e))
    expect(de_novo.ok).toBe(true)
    expect(await contar('pavimentos', obraId)).toBe(antes)
    expect((await sql.query('select count(*)::int as n from public.obras where codigo = $1', ['EXE-NO1'])).rows[0].n).toBe(1)
  })

  it('código já usado no servidor: recusa sem mexer na obra que está lá', async () => {
    const { servidor: s } = await pecasDe(admin)
    const res = await publicarObra(rascunho('EXE-NO1'), s, lerTiles, () => {})
    expect(res.ok).toBe(false)
    expect(!res.ok && res.erro).toMatch(/Já existe no servidor uma obra com o código EXE-NO1/)
  })

  it('quem não é admin não cria obra', async () => {
    const { servidor: s } = await pecasDe(gestor)
    const res = await publicarObra(rascunho('EXE-NO2'), s, lerTiles, () => {})
    expect(res.ok).toBe(false)
    expect(!res.ok && res.erro).toMatch(/não é de administrador/)
    expect((await sql.query("select count(*)::int as n from public.obras where codigo = 'EXE-NO2'")).rows[0].n).toBe(0)
  })
})

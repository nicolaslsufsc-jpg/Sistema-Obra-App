// Integração do módulo Concreto: registro no aparelho → envio → PostgREST de verdade (RLS) →
// baixa em outro aparelho. Rodar com: bash supabase/testes/rodar_integracao.sh
// Sem as variáveis SO_* (ex.: "npm test" sozinho) estes testes são pulados.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { BancoLocal } from '../src/nucleo/banco_local'
import { Sincronizador } from '../src/nucleo/sincronizacao'
import { TABELAS_NUCLEO } from '../src/config'
import { TABELAS_SINCRONIZADAS } from '../src/nucleo/tabelas'
import { TABELAS_CONCRETO } from '../src/concreto/tabelas'
import { camposDeCorrecao, vigentes, type Corrigivel } from '../src/concreto/vigentes'
import { estadoDasPecas, mudancasDoDesenho, prepararPecas } from '../src/concreto/pecas'
import { prepararArea } from '../src/concreto/geometria'
import { plantaEsquematica } from '../src/concreto/planta'
import { iniciarServidorTeste, tokenDe, type ServidorTeste, type UsuarioTeste } from './servidor_teste'
import { OBRA1, USUARIOS } from './dados'

const PGRST = process.env.SO_PGRST_URL
const SEGREDO = process.env.SO_JWT_SEGREDO ?? ''
const suite = PGRST ? describe : describe.skip
const TABELAS = [...TABELAS_NUCLEO, ...TABELAS_CONCRETO]
const { campo, gestor, leitura } = USUARIOS

let servidor: ServidorTeste
let sql: pg.Client
let contador = 0

function sincronizadorDe(u: UsuarioTeste) {
  const banco = new BancoLocal(`concreto-${++contador}`)
  const cliente = createClient(servidor.url, 'chave-publica-de-teste', { accessToken: async () => tokenDe(u, SEGREDO, 3600) })
  return new Sincronizador({ banco, cliente, tabelas: TABELAS })
}

suite('concreto contra PostgREST real', () => {
  let pavimentoId = ''
  const pecas: Array<{ id: string; tipo: string; nome: string }> = []

  beforeAll(async () => {
    servidor = await iniciarServidorTeste({ pgrstUrl: PGRST!, segredoJwt: SEGREDO, usuarios: Object.values(USUARIOS) })
    sql = new pg.Client({ host: process.env.SO_PG_HOST, port: Number(process.env.SO_PG_PORT), user: 'postgres', database: 'postgres' })
    await sql.connect()
    const { rows } = await sql.query('select id from public.pavimentos where obra_id = $1 order by ordem limit 1', [OBRA1])
    pavimentoId = rows[0].id
    // peças do pavimento (a FVS cadastra; aqui o "editor SQL")
    for (const [tipo, nome] of [['P', 'CP1'], ['P', 'CP2'], ['V', 'CV1']]) {
      const r = await sql.query(
        `insert into public.elementos (obra_id, pavimento_id, tipo, nome, usuario_id, dispositivo_id, criado_em_dispositivo)
         values ($1, $2, $3, $4, $5, '00000000-0000-0000-0000-000000000000', now()) returning id`,
        [OBRA1, pavimentoId, tipo, nome, USUARIOS.admin.id],
      )
      pecas.push({ id: r.rows[0].id, tipo, nome })
    }
  })

  afterAll(async () => {
    await sql?.end()
    await servidor?.fechar()
  })

  it('as tabelas do Concreto estão na lista de sincronização, pais antes dos filhos', () => {
    const pos = (t: string) => TABELAS_SINCRONIZADAS.indexOf(t)
    for (const t of TABELAS_CONCRETO) expect(pos(t)).toBeGreaterThan(-1)
    expect(pos('concretagens')).toBeLessThan(pos('caminhoes'))
    expect(pos('caminhoes')).toBeLessThan(pos('caminhao_areas'))
    expect(pos('elementos')).toBeLessThan(pos('caminhao_elementos'))
  })

  it('campo registra concretagem, caminhão, área e peças; outro aparelho baixa igual', async () => {
    const s = sincronizadorDe(campo)
    const conc = await s.registrar('concretagens', OBRA1, campo.id, {
      pavimento_id: pavimentoId,
      data: '2026-10-29',
      local_descricao: 'Pilotis \\ Trecho 1',
      codigo_construpoint: 'FIC-0212',
      fornecedor: 'Usina',
      fck_mpa: 40,
      slump_cm: 12,
      slump_tolerancia_cm: 2,
      idades_dias: [7, 28],
      cps_por_idade: 2,
      observacao: null,
    })
    const cam = await s.registrar('caminhoes', OBRA1, campo.id, {
      concretagem_id: conc.id,
      sequencia: 1,
      nota_fiscal: '900001',
      volume_m3: 8.5,
      inicio_descarga: '2026-10-29T10:40:00.000Z',
      slump_medido_cm: 12,
      agua_adicionada_l: null,
      cps_moldados: 4,
    })

    // desenho em volta do primeiro pilar da planta de teste
    const planta = plantaEsquematica('teste', 'Teste', pecas)
    const p1 = planta.elementos.find((e) => e.nome === 'CP1')!.polys[0]
    const contorno: Array<[number, number]> = [
      [p1[0][0] - 20, p1[0][1] - 20],
      [p1[2][0] + 20, p1[0][1] - 20],
      [p1[2][0] + 20, p1[2][1] + 20],
      [p1[0][0] - 20, p1[2][1] + 20],
    ]
    await s.registrar('caminhao_areas', OBRA1, campo.id, { caminhao_id: cam.id, planta_ref: planta.ref, contorno })
    const mud = mudancasDoDesenho(prepararPecas(planta.elementos), [prepararArea(contorno)], [])
    expect(mud.map((m) => m.elemento_id)).toEqual([pecas[0].id])
    for (const m of mud) {
      await s.registrar('caminhao_elementos', OBRA1, campo.id, { caminhao_id: cam.id, elemento_id: m.elemento_id, origem: 'desenho', fracao: m.fracao, incluido: true })
    }
    // correção da NF: linha nova que substitui a antiga
    const [vig] = vigentes((await s.linhas('caminhoes', OBRA1)).filter((l) => l.id === cam.id) as Corrigivel[])
    await s.registrar('caminhoes', OBRA1, campo.id, camposDeCorrecao(vig, ['concretagem_id', 'sequencia', 'nota_fiscal', 'volume_m3', 'inicio_descarga', 'cps_moldados'], { nota_fiscal: '900002' }))

    const envio = await s.enviar(campo.id)
    expect(envio.comErro).toBe(0)
    expect(envio.enviados).toBe(5)

    const { rows } = await sql.query(
      `select c.idades_dias, jsonb_array_length(a.contorno) as pontos, ce.fracao::float as fracao
       from public.concretagens c
       join public.caminhoes k on k.concretagem_id = c.id
       join public.caminhao_areas a on a.caminhao_id = k.id
       join public.caminhao_elementos ce on ce.caminhao_id = k.id
       where c.id = $1`,
      [conc.id],
    )
    expect(rows[0]).toEqual({ idades_dias: [7, 28], pontos: 4, fracao: 1 })

    // aparelho de quem só lê: baixa e chega ao mesmo estado
    const outro = sincronizadorDe(leitura)
    await outro.baixar(OBRA1, leitura.id)
    const cams = vigentes((await outro.linhas('caminhoes', OBRA1)) as Corrigivel[]).filter((c) => c.raiz === cam.id)
    expect(cams.map((c) => c.nota_fiscal)).toEqual(['900002'])
    const est = estadoDasPecas((await outro.linhas('caminhao_elementos', OBRA1)).filter((l) => l.caminhao_id === cam.id))
    expect(est.get(pecas[0].id)).toMatchObject({ incluido: true, fracao: 1, parcial: false })
  })

  it('resultado de laudo: campo é recusado, gestor lança', async () => {
    // caminhão próprio deste teste (não depende do teste anterior)
    const s0 = sincronizadorDe(campo)
    const conc = await s0.registrar('concretagens', OBRA1, campo.id, { pavimento_id: pavimentoId, data: '2026-10-30', fck_mpa: 30 })
    const cam = await s0.registrar('caminhoes', OBRA1, campo.id, { concretagem_id: conc.id, sequencia: 1, nota_fiscal: '200001' })
    expect((await s0.enviar(campo.id)).comErro).toBe(0)
    const caminhaoId = cam.id
    const resultado = { caminhao_id: caminhaoId, idade_dias: 7, numero_cp: 1, data_ensaio: '2026-11-05', resistencia_mpa: 31.5, origem: 'manual' }

    const sc = sincronizadorDe(campo)
    await sc.registrar('cp_resultados', OBRA1, campo.id, resultado)
    const recusado = await sc.enviar(campo.id)
    expect(recusado.comErro).toBe(1)

    const sg = sincronizadorDe(gestor)
    await sg.registrar('cp_resultados', OBRA1, gestor.id, resultado)
    const aceito = await sg.enviar(gestor.id)
    expect(aceito.comErro).toBe(0)
    const n = await sql.query('select count(*)::int as n from public.cp_resultados where caminhao_id = $1', [caminhaoId])
    expect(n.rows[0].n).toBe(1)
  })
})

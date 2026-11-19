// Laje como peça (decisão do Nicolas, 04/11/2026, confirmada em 07/11): a forma não traz o contorno
// da laje, então ela entra no caminhão como uma peça por trecho ("Laje do Trecho 2"), marcada no
// toque. Quem cria a linha em "elementos" é a própria pessoa, no primeiro toque.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { banco, sincronizador } from '../nucleo/servicos'
import { carregar, garantirLaje, podeCriarLaje, registrarPecas } from './dados'
import { idDaLaje, lajeDoTrecho, nomeDaLaje, nomeNoBanco } from './lajes'
import { mudancaDaLajeDoDesenho } from './pecas'
import { comoEntrou, csvPorCaminhao, relatorioPorCaminhao, relatorioPorPeca, type PecaRelatorio } from './relatorio'

const OBRA = 'b0000000-0000-0000-0000-0000000000a7'
const USUARIO = '00000000-0000-0000-0000-0000000000a7'

async function pecaDoBanco(id: string, pavimentoId: string, tipo: string, nome: string) {
  const linha = {
    id,
    obra_id: OBRA,
    pavimento_id: pavimentoId,
    tipo,
    nome,
    secao: null,
    usuario_id: USUARIO,
    dispositivo_id: '00000000-0000-0000-0000-000000000000',
    criado_em_dispositivo: '2026-11-07T10:00:00.000Z',
    apagado: false,
  }
  await banco.registros.put({ tabela: 'elementos', id, obra_id: OBRA, linha: linha as never, pendente: 0 })
}

const lajesNoAparelho = async (pavimentoId: string) =>
  (await sincronizador.linhas('elementos', OBRA)).filter((e) => e.pavimento_id === pavimentoId && e.tipo === 'L')

describe('laje por trecho', () => {
  it('no banco o nome não tem espaço (regra do núcleo); na tela é "Laje do Trecho 2"', () => {
    expect(nomeNoBanco('Trecho 2')).toBe('Laje_Trecho_2')
    expect(nomeNoBanco('  Trecho   10 ')).toBe('Laje_Trecho_10')
    expect(nomeNoBanco('Trecho 2')).toMatch(/^\S+$/)
    expect(nomeDaLaje('Trecho 2')).toBe('Laje do Trecho 2')
  })

  it('planta que não se chama "Trecho N" fica "Laje (nome da planta)", também ao ler do banco', async () => {
    expect(nomeDaLaje('Planta de teste')).toBe('Laje (Planta de teste)')
    const pav = 'a0000000-0000-0000-0000-0000000000f7'
    const id = await garantirLaje(OBRA, USUARIO, pav, 'Planta de teste', [])
    const [linha] = await lajesNoAparelho(pav)
    expect(linha.nome).toBe('Laje_Planta_de_teste')
    const pecas = (await carregar(OBRA)).pecasDoPavimento.get(pav) ?? []
    expect(pecas.map((p) => p.nome)).toEqual(['Laje (Planta de teste)'])
    expect(lajeDoTrecho(pecas, 'Planta de teste')?.id).toBe(id)
  })

  it('o id da laje é o mesmo em qualquer aparelho (UUID v5, conferido com o Python)', async () => {
    const pav = 'a0000000-0000-0000-0000-0000000000a7'
    // python: uuid.uuid5(UUID('6b0fc8e1-37dc-4d8b-a806-2564efba583b'), f'{pavimento}|L|Laje_Trecho_2')
    expect(await idDaLaje(pav, 'Trecho 2')).toBe('bb569f01-f520-5f28-999f-2de58bfe834f')
    expect(await idDaLaje(pav, 'Trecho 3')).toBe('4eb9c936-81c8-584b-8000-431808d9ae07')
    expect(await idDaLaje('a0000000-0000-0000-0000-0000000000a8', 'Trecho 2')).toBe('980667af-0e87-544a-a87f-ce6bc2cf7555')
  })

  it('só gestor e administrador criam a laje (o banco só deixa eles cadastrarem peça)', () => {
    expect(podeCriarLaje('admin')).toBe(true)
    expect(podeCriarLaje('gestor')).toBe(true)
    expect(podeCriarLaje('campo')).toBe(false)
    expect(podeCriarLaje('leitura')).toBe(false)
  })

  it('o primeiro toque cria a laje; o segundo usa a mesma, sem linha nova', async () => {
    const pav = 'a0000000-0000-0000-0000-0000000000b7'
    const id = await garantirLaje(OBRA, USUARIO, pav, 'Trecho 2', [])
    expect(id).toBe(await idDaLaje(pav, 'Trecho 2'))
    const [linha] = await lajesNoAparelho(pav)
    expect(linha).toMatchObject({ id, tipo: 'L', nome: 'Laje_Trecho_2', pavimento_id: pav })

    const d = await carregar(OBRA)
    expect(d.pecaPorId.get(id)?.nome).toBe('Laje do Trecho 2')
    const pecas = d.pecasDoPavimento.get(pav) ?? []
    expect(lajeDoTrecho(pecas, 'Trecho 2')?.id).toBe(id)
    expect(lajeDoTrecho(pecas, 'Trecho 1')).toBeUndefined()

    expect(await garantirLaje(OBRA, USUARIO, pav, 'Trecho 2', pecas)).toBe(id)
    expect(await lajesNoAparelho(pav)).toHaveLength(1)
    const naFila = (await banco.fila.toArray()).filter((f) => f.tabela === 'elementos' && f.id === id)
    expect(naFila).toHaveLength(1)
  })

  it('laje que já veio do servidor com outro id é reaproveitada', async () => {
    const pav = 'a0000000-0000-0000-0000-0000000000c7'
    const outro = 'e0000000-0000-0000-0000-0000000000c7'
    await pecaDoBanco(outro, pav, 'L', 'Laje_Trecho_3')
    const pecas = (await carregar(OBRA)).pecasDoPavimento.get(pav) ?? []
    expect(await garantirLaje(OBRA, USUARIO, pav, 'Trecho 3', pecas)).toBe(outro)
    expect(await lajesNoAparelho(pav)).toHaveLength(1)
  })

  it('laje de planta de teste (L1, com contorno) não é laje de trecho', async () => {
    const pav = 'a0000000-0000-0000-0000-0000000000d7'
    await pecaDoBanco('e0000000-0000-0000-0000-0000000001d7', pav, 'L', 'L1')
    const pecas = (await carregar(OBRA)).pecasDoPavimento.get(pav) ?? []
    expect(pecas.map((p) => p.nome)).toEqual(['L1'])
    expect(lajeDoTrecho(pecas, 'Trecho 1')).toBeUndefined()
  })

  it('laje que vem com a área: registro de desenho sem fração, que sai quando a área sai', async () => {
    const camRaiz = 'c0000000-0000-0000-0000-0000000000c1'
    const lajeId = await idDaLaje('a0000000-0000-0000-0000-0000000000c1', 'Trecho 1')
    const regsDoCaminhao = async () => (await carregar(OBRA)).registrosPecasDe.get(camRaiz) ?? []
    const estado = async () => (await carregar(OBRA)).pecasDe.get(camRaiz)?.get(lajeId)

    // desenhou: entra como desenho, sem fração ("com a área")
    const entra = mudancaDaLajeDoDesenho(true, lajeId, await regsDoCaminhao())
    expect(entra).toEqual({ elemento_id: lajeId, incluido: true, fracao: null })
    await registrarPecas(OBRA, USUARIO, camRaiz, [entra!], 'desenho')
    expect(await estado()).toMatchObject({ incluido: true, origem: 'desenho', fracao: null, parcial: false })
    expect(comoEntrou((await estado())!)).toBe('com a área')
    // outra área no mesmo trecho: nada a gravar
    expect(mudancaDaLajeDoDesenho(true, lajeId, await regsDoCaminhao())).toBeNull()

    // desfez a última área do trecho: a laje sai
    const sai = mudancaDaLajeDoDesenho(false, lajeId, await regsDoCaminhao())
    expect(sai).toEqual({ elemento_id: lajeId, incluido: false, fracao: null })
    await registrarPecas(OBRA, USUARIO, camRaiz, [sai!], 'desenho')
    expect(await estado()).toMatchObject({ incluido: false, origem: 'desenho' })

    // marcada no toque, vale o toque: a área que sai não tira a laje
    await registrarPecas(OBRA, USUARIO, camRaiz, [{ elemento_id: lajeId, incluido: true, fracao: 0 }], 'manual')
    await registrarPecas(OBRA, USUARIO, camRaiz, [mudancaDaLajeDoDesenho(true, lajeId, await regsDoCaminhao())!], 'desenho')
    await registrarPecas(OBRA, USUARIO, camRaiz, [mudancaDaLajeDoDesenho(false, lajeId, await regsDoCaminhao())!], 'desenho')
    expect(await estado()).toMatchObject({ incluido: true, origem: 'manual' })
    expect(comoEntrou((await estado())!)).toBe('toque')
  })

  it('relatório e CSV listam a laje marcada no toque, depois de pilares e vigas', async () => {
    const pav = 'a0000000-0000-0000-0000-0000000000e7'
    const cam = 'd0000000-0000-0000-0000-0000000000e7'
    await pecaDoBanco('e0000000-0000-0000-0000-0000000001e7', pav, 'P', 'P1')
    await pecaDoBanco('e0000000-0000-0000-0000-0000000002e7', pav, 'V', 'V1')
    const laje = await garantirLaje(OBRA, USUARIO, pav, 'Trecho 2', [])
    await registrarPecas(OBRA, USUARIO, cam, [{ elemento_id: laje, incluido: true, fracao: 0 }], 'manual')
    await registrarPecas(
      OBRA,
      USUARIO,
      cam,
      [
        { elemento_id: 'e0000000-0000-0000-0000-0000000002e7', incluido: true, fracao: 0.5 },
        { elemento_id: 'e0000000-0000-0000-0000-0000000001e7', incluido: true, fracao: 1 },
      ],
      'desenho',
    )

    const d = await carregar(OBRA)
    const pecas = new Map<string, PecaRelatorio>([...d.pecaPorId.values()].map((p) => [p.id, { id: p.id, nome: p.nome, tipo: p.tipo }]))
    const caminhao = { raiz: cam, sequencia: 1, nota_fiscal: '500001', volume_m3: 8 }
    const porCaminhao = relatorioPorCaminhao([caminhao], d.pecasDe, pecas)
    expect(porCaminhao[0].pecas.map((i) => [i.peca.nome, i.origem, i.fracao, i.parcial])).toEqual([
      ['P1', 'desenho', 1, false],
      ['V1', 'desenho', 0.5, true],
      ['Laje do Trecho 2', 'manual', null, false],
    ])
    expect(relatorioPorPeca(porCaminhao).map((l) => [l.peca.nome, l.caminhoes.map((x) => x.caminhao.sequencia)])).toEqual([
      ['P1', [1]],
      ['V1', [1]],
      ['Laje do Trecho 2', [1]],
    ])
    const csv = csvPorCaminhao({ data: '2026-11-07', local_descricao: 'Trecho 2 · Laje', codigo_construpoint: null }, porCaminhao, 'Sistema Exemplo')
    expect(csv).toContain('\r\n07/11/2026;Trecho 2 · Laje;;1;500001;8;Laje do Trecho 2;L;;não;toque\r\n')
  })
})

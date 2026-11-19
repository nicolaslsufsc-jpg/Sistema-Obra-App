import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { BancoLocal } from './banco_local'
import { ehModoLocal } from './local'
import { pacotesNoAparelho, removerPacotes } from '../fvs/pacote'
import { fichaDaPeca, fichasPara, type EventoFvs, type Ficha } from '../fvs/situacao'
import { compararComOAtual, dataDoPacoteGuardado, eFaltaDeEspaco, tamanhoQueFalta, textoSemEspaco, precisaConfirmar, linhasDoCadastro, linhasDoHistorico, localizarPacote, obraDoPacote, prepararObraLocal, uuidDeterministico, USUARIO_DO_PACOTE, type IndicePacote } from './pacote_obra'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
let n = 0
const novoBanco = () => new BancoLocal(`teste-pacote-${++n}`)

const PLANTA = 'a2000000-0000-0000-0000-0000000000f1'
const PECA = 'e0000000-0000-0000-0000-000000000001'
const INDICE: IndicePacote = {
  obra: 'EXE',
  pavimentos: [
    {
      nome: '3º Pavimento',
      pecas: [{ id: PECA, tipo: 'P', nome: 'P1', secao: '19x50' }],
      plantas: [
        {
          id: PLANTA,
          trecho: 'Planta inteira',
          pasta: '06_3_pavimento/Planta_inteira/',
          prancha: 'EXE.ES.LO.101',
          revisao: 'R03',
          largura: 2000,
          altura: 1300,
          elementos: 1,
          manifest: { sha256: '0'.repeat(64), tamanho: 10 },
          pacote: { sha256: '1'.repeat(64), tamanho: 0 },
        },
      ],
    },
  ],
}
const FICHAS = [{ codigo: 'EXE-PVS-001', titulo: 'Pilares', revisao: '0', aplica_a: ['P'], itens: [{ n: 1, etapa: 'MONTAGEM', titulo: 'Prumo' }] }]
const HISTORICO = {
  fichas_campo: [
    { id: 'f8000000-0000-0000-0000-000000000001', codigo: 'FVS-1', elemento_id: PECA, ficha_codigo: 'EXE-PVS-001', status: 'Aceito' },
    { id: 'f8000000-0000-0000-0000-000000000002', codigo: 'FVS-2', elemento_id: 'nao-esta-na-planta', ficha_codigo: 'EXE-PVS-001', status: 'Agendado' },
  ],
  eventos: [
    { id: 'f9000000-0000-0000-0000-000000000001', ficha_campo_id: 'f8000000-0000-0000-0000-000000000001', elemento_id: PECA, ficha_codigo: 'EXE-PVS-001', item: 1, resultado: 'A', rodada: 1, criado_em: '2026-08-12T19:45:39.000Z', verificado_por: 'Alguém' },
    { id: 'f9000000-0000-0000-0000-000000000002', ficha_campo_id: 'x', elemento_id: PECA, ficha_codigo: 'EXE-PVS-999', item: 1, resultado: 'A', rodada: 1, criado_em: '2026-08-12T19:45:39.000Z' },
  ],
}
const MANIFEST = { formato: 1, planta_id: 'outro-id-no-manifest', trecho: 'Planta inteira', prancha: 'EXE.ES.LO.101', revisao: 'R03', largura: 2000, altura: 1300, tile: 512, niveis: [0], elementos: { [PECA]: { tipo: 'P', nome: 'P1', secao: '19x50', rotulo: [0, 0, 1, 1], polys: [] } }, detalhes: {}, pedacos: {} }
const sha = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex')
// o índice confere manifest e pacote pelo tamanho e pelo SHA-256 (como o exportar_bancada.py grava)
INDICE.pavimentos[0].plantas[0].manifest = { sha256: sha(JSON.stringify(MANIFEST)), tamanho: new TextEncoder().encode(JSON.stringify(MANIFEST)).length }
INDICE.pavimentos[0].plantas[0].pacote = { sha256: sha(new Uint8Array()), tamanho: 0 }

/** Um servidor de mentira para a pasta do pacote. Conta os pedidos por arquivo. */
function servirPasta(raiz: string, arquivos: Record<string, unknown>) {
  const pedidos: string[] = []
  vi.stubGlobal('fetch', async (entrada: string | URL) => {
    const url = String(entrada)
    if (!url.startsWith(raiz)) return new Response('fora', { status: 404 })
    const nome = url.slice(raiz.length)
    pedidos.push(nome)
    if (!(nome in arquivos)) return new Response('não há', { status: 404 })
    const corpo = arquivos[nome]
    return corpo instanceof Blob ? new Response(corpo) : new Response(JSON.stringify(corpo), { headers: { 'content-type': 'application/json' } })
  })
  return pedidos
}

afterEach(() => vi.unstubAllGlobals())

describe('pacote da obra', () => {
  it('uuid determinístico: o mesmo texto dá o mesmo id, no formato de UUID', async () => {
    const a = await uuidDeterministico('obra-local:EXE')
    expect(a).toMatch(UUID)
    expect(await uuidDeterministico('obra-local:EXE')).toBe(a)
    expect(await uuidDeterministico('obra-local:LAD')).not.toBe(a)
  })

  it('a obra do pacote tem id fixo pelo código; o nome só vem do índice ("Tirar o nome", 08/11)', async () => {
    const o = await obraDoPacote({ obra: ' exe ' })
    expect(o).toMatchObject({ codigo: 'EXE', nome: 'Obra', papel: 'admin', empresa: null })
    expect(o.id).toBe((await obraDoPacote({ obra: 'EXE' })).id)
    expect((await obraDoPacote({ obra: 'XYZ', nome: 'Obra Xyz' })).nome).toBe('Obra Xyz')
  })

  it('o cadastro vira linhas das tabelas do núcleo e da FVS, com ids derivados', async () => {
    const obra = await obraDoPacote(INDICE)
    const { linhas, idDaFicha } = await linhasDoCadastro(obra, INDICE, FICHAS)
    const por = (t: string) => linhas.filter((l) => l.tabela === t)
    expect(por('pavimentos')).toHaveLength(1)
    expect(por('pavimentos')[0].linha).toMatchObject({ nome: '3º Pavimento', ordem: 1, obra_id: obra.id, usuario_id: USUARIO_DO_PACOTE })
    expect(por('elementos')[0].linha).toMatchObject({ id: PECA, pavimento_id: por('pavimentos')[0].linha.id, tipo: 'P', nome: 'P1' })
    expect(por('setores')[0].linha).toMatchObject({ nome_projeto: 'Planta inteira', disciplina: 'estrutura' })
    expect(por('arquivos').map((a) => a.linha.caminho)).toEqual([`${obra.id}/fvs/plantas/${PLANTA}/manifest.json`, `${obra.id}/fvs/plantas/${PLANTA}/pacote.bin`])
    expect(por('plantas')[0].linha).toMatchObject({ id: PLANTA, manifest_id: por('arquivos')[0].linha.id, pacote_id: por('arquivos')[1].linha.id, elementos: 1 })
    expect(por('fichas_modelo')[0].linha).toMatchObject({ codigo: 'EXE-PVS-001', aplica_a: ['P'] })
    expect(idDaFicha.get('EXE-PVS-001')).toBe(por('fichas_modelo')[0].linha.id)
    for (const l of linhas) if (l.tabela !== 'elementos' && l.tabela !== 'plantas') expect(l.linha.id).toMatch(UUID)
    // abrir de novo dá os mesmos ids
    const outra = await linhasDoCadastro(obra, INDICE, FICHAS)
    expect(outra.linhas.map((l) => l.linha.id)).toEqual(linhas.map((l) => l.linha.id))
  })

  it('config_fvs.json vira uma linha de fvs_regras com o objeto inteiro; sem ele (ou fora do formato), nenhuma', async () => {
    const obra = await obraDoPacote(INDICE)
    const config = { prazos: [{ id: 'escoramento', ficha: 'EXE-PVS-001', item: 1, dias: 21, depois_de: { tipo: 'concretagem' } }], ligacoes: [] }
    const regras = (await linhasDoCadastro(obra, INDICE, FICHAS, config)).linhas.filter((l) => l.tabela === 'fvs_regras')
    expect(regras).toHaveLength(1)
    expect(regras[0].linha).toMatchObject({ obra_id: obra.id, usuario_id: USUARIO_DO_PACOTE, regras: config, apagado: false })
    expect(regras[0].linha.id).toMatch(UUID)
    // id fixo por obra: o pacote seguinte troca a linha em vez de somar outra
    const outra = (await linhasDoCadastro(obra, INDICE, FICHAS, { prazos: [] })).linhas.find((l) => l.tabela === 'fvs_regras')
    expect(outra?.linha.id).toBe(regras[0].linha.id)
    for (const fora of [undefined, null, [], 'texto', 3]) {
      expect((await linhasDoCadastro(obra, INDICE, FICHAS, fora)).linhas.some((l) => l.tabela === 'fvs_regras')).toBe(false)
    }
  })

  it('preparar a obra com config_fvs.json: grava a regra; pacote com config nova troca; sem config, sai', async () => {
    const raiz = 'http://pc/dados_obra/'
    const arquivos: Record<string, unknown> = {
      'indice.json': INDICE,
      'fichas.json': FICHAS,
      'config_fvs.json': { prazos: [{ id: 'a', ficha: 'EXE-PVS-001', item: 1, dias: 21, depois_de: { tipo: 'concretagem' } }] },
      '06_3_pavimento/Planta_inteira/manifest.json': MANIFEST,
      '06_3_pavimento/Planta_inteira/pacote.bin': new Blob([]),
    }
    servirPasta(raiz, arquivos)
    const banco = novoBanco()
    const { obra } = await prepararObraLocal(banco, (await localizarPacote(raiz))!)
    const regras = async () => (await banco.registros.where('[tabela+obra_id]').equals(['fvs_regras', obra.id]).toArray()).map((r) => r.linha as Record<string, unknown>)
    expect((await regras()).map((l) => l.regras)).toEqual([arquivos['config_fvs.json']])

    // só a config mudou: o pacote conta como novo e a linha é trocada
    arquivos['config_fvs.json'] = { prazos: [], ligacoes: [{ id: 'l', de: { ficha: 'EXE-PVS-001', item: 1 }, para: { ficha: 'EXE-PVS-001', item: 2 } }] }
    await prepararObraLocal(banco, (await localizarPacote(raiz))!)
    expect((await regras()).map((l) => l.regras)).toEqual([arquivos['config_fvs.json']])

    // a config saiu do pacote: a regra sai do aparelho
    delete arquivos['config_fvs.json']
    await prepararObraLocal(banco, (await localizarPacote(raiz))!)
    expect(await regras()).toEqual([])
    // a planta guardada é do aparelho, não do banco: tira, para o teste seguinte guardar de novo
    await removerPacotes([PLANTA])
  })

  it('histórico: ficha aberta só liga à peça da planta; registro de ficha desconhecida fica de fora', async () => {
    const obra = await obraDoPacote(INDICE)
    const { idDaFicha } = await linhasDoCadastro(obra, INDICE, FICHAS)
    const linhas = linhasDoHistorico(obra, HISTORICO, idDaFicha, new Set([PECA]))
    const fc = linhas.filter((l) => l.tabela === 'fvs_fichas_campo')
    expect(fc[0].linha).toMatchObject({ elemento_id: PECA, ficha_id: idDaFicha.get('EXE-PVS-001') })
    expect(fc[1].linha).toMatchObject({ elemento_id: null, ficha_id: null, status: 'Agendado' })
    const ev = linhas.filter((l) => l.tabela === 'fvs_eventos')
    expect(ev).toHaveLength(1)
    expect(ev[0].linha).toMatchObject({ id: 'f9000000-0000-0000-0000-000000000001', criado_em_dispositivo: '2026-08-12T19:45:39.000Z', usuario_id: USUARIO_DO_PACOTE, verificado_por: 'Alguém' })
  })

  it('sem a pasta, localizar devolve null sem estourar', async () => {
    servirPasta('http://pc/dados_obra/', {})
    expect(await localizarPacote('http://pc/dados_obra/')).toBeNull()
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await localizarPacote('http://pc/dados_obra/')).toBeNull()
  })

  it('preparar a obra: entra sem conta, grava o cadastro e o histórico, guarda a planta; abrir de novo não refaz', async () => {
    const raiz = 'http://pc/dados_obra/'
    const pedidos = servirPasta(raiz, {
      'indice.json': INDICE,
      'fichas.json': FICHAS,
      'historico.json': HISTORICO,
      '06_3_pavimento/Planta_inteira/manifest.json': MANIFEST,
      '06_3_pavimento/Planta_inteira/pacote.bin': new Blob([]),
    })
    const banco = novoBanco()
    const pacote = (await localizarPacote(raiz))!
    expect(pacote.indice.obra).toBe('EXE')
    const progresso: string[] = []
    const r = await prepararObraLocal(banco, pacote, (p) => progresso.push(`${p.etapa} ${p.feitas}/${p.total}`))
    expect(r.obra.codigo).toBe('EXE')
    expect(r.plantasGuardadas).toBe(1)
    expect(await ehModoLocal(banco)).toBe(true)
    expect(await banco.lerMeta('usuario')).toEqual(r.usuario)
    expect(await banco.lerMeta('obras')).toEqual([r.obra])
    expect(await banco.lerMeta('obra_atual')).toBe(r.obra.id)
    // de onde veio o pacote fica guardado (o do pipeline não diz: null; o da Nova obra: 'nova_obra')
    expect((await banco.lerMeta<{ origem: unknown }>(`pacote_obra:${r.obra.id}`))?.origem).toBeNull()
    const conta = async (t: string) => banco.registros.where('[tabela+obra_id]').equals([t, r.obra.id]).count()
    expect(await conta('pavimentos')).toBe(1)
    expect(await conta('elementos')).toBe(1)
    expect(await conta('plantas')).toBe(1)
    expect(await conta('fichas_modelo')).toBe(1)
    expect(await conta('fvs_fichas_campo')).toBe(2)
    expect(await conta('fvs_eventos')).toBe(1)
    expect((await pacotesNoAparelho()).has(PLANTA)).toBe(true)
    expect(progresso).toContain('plantas 0/1')
    expect(progresso[progresso.length - 1]).toBe('plantas 1/1')
    expect(pedidos.filter((p) => p === 'historico.json')).toHaveLength(1)

    // segunda abertura: mesmo pacote, nada é relido nem regravado; o que está no aparelho continua
    const r2 = await prepararObraLocal(banco, (await localizarPacote(raiz))!)
    expect(r2.obra.id).toBe(r.obra.id)
    expect(r2.plantasGuardadas).toBe(0)
    expect(pedidos.filter((p) => p === 'historico.json')).toHaveLength(1)
    expect(pedidos.filter((p) => p.endsWith('pacote.bin'))).toHaveLength(1)
    expect(await conta('fvs_eventos')).toBe(1)
  })

  it('planta diferente do índice (cortada ou trocada) não fica como guardada (ressalva do Revisor, 08/11)', async () => {
    const outra = 'a2000000-0000-0000-0000-0000000000f9'
    const bin = new Uint8Array([1, 2, 3, 4])
    const indice: IndicePacote = { ...INDICE, pavimentos: [{ ...INDICE.pavimentos[0], plantas: [{ ...INDICE.pavimentos[0].plantas[0], id: outra, pasta: 'outra/', pacote: { sha256: sha(bin), tamanho: 4 } }] }] }
    for (const [caso, servido] of [['cortada', new Uint8Array([1, 2, 3])], ['trocada', new Uint8Array([9, 9, 9, 9])]] as const) {
      const raiz = `http://pc/${caso}/`
      servirPasta(raiz, { 'indice.json': indice, 'fichas.json': FICHAS, 'outra/manifest.json': MANIFEST, 'outra/pacote.bin': new Blob([servido]) })
      const banco = novoBanco()
      await expect(prepararObraLocal(banco, (await localizarPacote(raiz))!)).rejects.toThrow(/EXE\.ES\.LO\.101 do pacote da obra está estragada/)
      expect((await pacotesNoAparelho()).has(outra)).toBe(false)
      // sem marcar o pacote como lido: a próxima abertura tenta de novo
      expect(await banco.lerMeta(`pacote_obra:${(await obraDoPacote(indice)).id}`)).toBeUndefined()
    }
    // a certa entra
    servirPasta('http://pc/certa/', { 'indice.json': indice, 'fichas.json': FICHAS, 'outra/manifest.json': MANIFEST, 'outra/pacote.bin': new Blob([bin]) })
    await prepararObraLocal(novoBanco(), (await localizarPacote('http://pc/certa/'))!)
    expect((await pacotesNoAparelho()).has(outra)).toBe(true)
  })

  it('ficha muda de revisão no pacote: a antiga fica se algo marcado no aparelho usa ela; sem marcação, sai', async () => {
    const raiz = 'http://pc/dados_obra/'
    const VIGAS = { codigo: 'EXE-PVS-003', titulo: 'Vigas', revisao: '0', aplica_a: ['V'], itens: [{ n: 1, etapa: 'MONTAGEM', titulo: 'Nível' }] }
    const LAJE = { codigo: 'EXE-PVS-004', titulo: 'Laje', revisao: '0', aplica_a: ['L'], itens: [{ n: 1, etapa: 'MONTAGEM', titulo: 'Escoramento' }] }
    const historicoDaViga = { id: 'f9000000-0000-0000-0000-000000000003', ficha_campo_id: 'x', elemento_id: PECA, ficha_codigo: 'EXE-PVS-003', item: 1, resultado: 'A', rodada: 1, criado_em: '2026-08-13T10:00:00.000Z' }
    const arquivos: Record<string, unknown> = {
      'indice.json': INDICE,
      'fichas.json': [...FICHAS, VIGAS, LAJE],
      'historico.json': { ...HISTORICO, eventos: [...HISTORICO.eventos, historicoDaViga] },
      '06_3_pavimento/Planta_inteira/manifest.json': MANIFEST,
      '06_3_pavimento/Planta_inteira/pacote.bin': new Blob([]),
    }
    servirPasta(raiz, arquivos)
    const banco = novoBanco()
    const { obra, usuario } = await prepararObraLocal(banco, (await localizarPacote(raiz))!)
    const rev0 = (await linhasDoCadastro(obra, INDICE, FICHAS)).idDaFicha.get('EXE-PVS-001')!

    // a pessoa marca o P1 na rev. 0 dos pilares (registro na fila, como o app grava)
    const marca = { id: 'a9000000-0000-0000-0000-000000000001', obra_id: obra.id, usuario_id: usuario.id, dispositivo_id: 'd1', criado_em_dispositivo: '2026-11-08T10:00:00.000Z', apagado: false, elemento_id: PECA, ficha_id: rev0, item: 1, resultado: 'R', rodada: 1 }
    await banco.registros.put({ tabela: 'fvs_eventos', id: marca.id, obra_id: obra.id, linha: marca, pendente: 1 })

    // pacote novo: rev. 1 dos pilares e das vigas; a laje saiu
    arquivos['fichas.json'] = [{ ...FICHAS[0], revisao: '1', itens: [{ n: 1, etapa: 'MONTAGEM', titulo: 'Prumo e nível' }] }, { ...VIGAS, revisao: '1' }]
    await prepararObraLocal(banco, (await localizarPacote(raiz))!)
    const fichas = (await banco.registros.where('[tabela+obra_id]').equals(['fichas_modelo', obra.id]).toArray()).map((r) => r.linha as unknown as Ficha)
    // pilares: a rev. 0 fica (tem marcação do aparelho); vigas: a rev. 0 sai (só o histórico do pacote usava); laje: sai
    expect(fichas.map((f) => `${f.codigo} rev. ${f.revisao}`).sort()).toEqual(['EXE-PVS-001 rev. 0', 'EXE-PVS-001 rev. 1', 'EXE-PVS-003 rev. 1'])

    // a peça marcada continua na rev. 0, com a marcação; peça sem marcação já usa a rev. 1
    const porId = new Map(fichas.map((f) => [f.id, f]))
    const vigente = fichasPara('P', fichas)[0]
    expect(vigente.revisao).toBe('1')
    expect(fichaDaPeca(vigente, [marca as unknown as EventoFvs], (id) => porId.get(id))?.id).toBe(rev0)
    expect(fichaDaPeca(vigente, [], (id) => porId.get(id))?.id).toBe(vigente.id)
    expect((await banco.registros.get(['fvs_eventos', marca.id]))?.linha).toEqual(marca)

    // o histórico do pacote passa para as revisões vigentes
    const vigentes = new Set([...fichasPara('P', fichas), ...fichasPara('V', fichas)].map((f) => f.id))
    const doPacote = await banco.registros.where('[tabela+obra_id]').equals(['fvs_eventos', obra.id]).filter((r) => r.pendente === 0).toArray()
    expect(doPacote).toHaveLength(2)
    for (const r of doPacote) expect(vigentes.has(String(r.linha.ficha_id))).toBe(true)
  })
})

describe('pacote escolhido contra o que está no aparelho (ressalva do Revisor, 08/11)', () => {
  const comData = (obra: string, gerado_em?: string) => ({ indice: { ...INDICE, obra, gerado_em } })
  async function aparelhoCom(obra: string, gerado_em?: string | null) {
    const banco = novoBanco()
    const o = await obraDoPacote({ obra })
    await banco.gravarMeta('obras', [o])
    await banco.gravarMeta('obra_atual', o.id)
    await banco.gravarMeta(`pacote_obra:${o.id}`, { assinatura: 'x', raiz: 'zip:a.zip', quando: '2026-11-08T10:00:00Z', gerado_em })
    return banco
  }

  it('aparelho vazio, ou mesma obra com pacote igual ou mais novo: segue sem perguntar', async () => {
    expect(precisaConfirmar(await compararComOAtual(novoBanco(), comData('EXE', '2026-11-08T10:00:00Z')))).toBe(false)
    const banco = await aparelhoCom('EXE', '2026-11-08T10:00:00Z')
    expect(precisaConfirmar(await compararComOAtual(banco, comData('EXE', '2026-11-08T10:00:00Z')))).toBe(false)
    expect(precisaConfirmar(await compararComOAtual(banco, comData('exe', '2026-11-09T08:00:00Z')))).toBe(false)
    // nenhum dos dois com data (pacotes de antes de 08/11): igual a antes
    expect(precisaConfirmar(await compararComOAtual(await aparelhoCom('EXE', null), comData('EXE')))).toBe(false)
  })

  it('outra obra, pacote mais antigo ou sem data: pede confirmação, com as duas datas', async () => {
    const banco = await aparelhoCom('EXE', '2026-11-08T10:00:00Z')
    const outra = await compararComOAtual(banco, comData('OUTRA2', '2026-11-09T08:00:00Z'))
    expect(outra).toMatchObject({ outraObra: true, novo: { codigo: 'OUTRA2', geradoEm: '2026-11-09T08:00:00Z' }, atual: { codigo: 'EXE', nome: 'Obra', geradoEm: '2026-11-08T10:00:00Z' } })
    expect(precisaConfirmar(outra)).toBe(true)
    const antigo = await compararComOAtual(banco, comData('EXE', '2026-11-01T10:00:00Z'))
    expect([antigo.outraObra, antigo.maisAntigo, precisaConfirmar(antigo)]).toEqual([false, true, true])
    const semData = await compararComOAtual(banco, comData('EXE', 'não é data'))
    expect([semData.semData, semData.novo.geradoEm, precisaConfirmar(semData)]).toEqual([true, null, true])
  })

  it('comparar só lê: o aparelho fica como estava', async () => {
    const banco = await aparelhoCom('EXE', '2026-11-08T10:00:00Z')
    const antes = JSON.stringify(await banco.meta.toArray())
    await compararComOAtual(banco, comData('OUTRA2', '2026-11-09T08:00:00Z'))
    expect(JSON.stringify(await banco.meta.toArray())).toBe(antes)
  })
})

describe('data do pacote guardado (aviso de relógio atrasado)', () => {
  const comMeta = (valor: unknown) => ({ lerMeta: async () => valor }) as unknown as Pick<BancoLocal, 'lerMeta'>
  it('lê a data gravada quando o pacote abriu, e nada sem pacote ou sem data', async () => {
    expect(await dataDoPacoteGuardado(comMeta({ gerado_em: '2026-11-08T10:00:00Z' }), 'o1')).toBe('2026-11-08T10:00:00Z')
    expect(await dataDoPacoteGuardado(comMeta({ gerado_em: null }), 'o1')).toBeNull()
    expect(await dataDoPacoteGuardado(comMeta({ gerado_em: 'ontem' }), 'o1')).toBeNull()
    expect(await dataDoPacoteGuardado(comMeta(undefined), 'o1')).toBeNull()
  })
})

describe('aparelho sem espaço (achado do Testador, 09/11)', () => {
  it('o texto diz quanto a obra precisa, quanto há livre e quanto liberar', () => {
    const MB = 1024 * 1024
    expect(textoSemEspaco(200 * MB, 60 * MB)).toBe('Não coube no aparelho: a obra precisa de cerca de 200 MB e há 60 MB livres. Libere pelo menos 180 MB (fotos, vídeos ou apps que não usa) e tente de novo.')
    expect(textoSemEspaco(5 * MB, null)).toMatch(/precisa de cerca de 5 MB\. Libere pelo menos 6 MB/)
    // o navegador recusou mas diz que sobra: não repete o número dele
    expect(textoSemEspaco(80 * MB, 10240 * MB)).toBe('Não coube no aparelho: a obra precisa de cerca de 80 MB. Libere pelo menos 96 MB (fotos, vídeos ou apps que não usa) e tente de novo.')
    expect(eFaltaDeEspaco({ name: 'QuotaExceededError' })).toBe(true)
    expect(eFaltaDeEspaco({ name: 'AbortError', inner: { name: 'QuotaExceededError' } })).toBe(true)
    expect(eFaltaDeEspaco(new Error('outra coisa'))).toBe(false)
    expect(tamanhoQueFalta(INDICE.pavimentos[0].plantas)).toBe(INDICE.pavimentos[0].plantas[0].manifest.tamanho)
  })

  it('espaço livre menor que as plantas: avisa antes de gravar e o aparelho fica como estava', async () => {
    const raiz = 'http://pc/cheio/'
    const indice: IndicePacote = { ...INDICE, obra: 'EXG', pavimentos: [{ ...INDICE.pavimentos[0], plantas: [{ ...INDICE.pavimentos[0].plantas[0], id: 'a2000000-0000-0000-0000-0000000000b1' }] }] }
    servirPasta(raiz, { 'indice.json': indice, 'fichas.json': FICHAS, 'historico.json': HISTORICO })
    vi.stubGlobal('navigator', { storage: { estimate: async () => ({ quota: 1000, usage: 990 }) } })
    const banco = novoBanco()
    await expect(prepararObraLocal(banco, (await localizarPacote(raiz))!)).rejects.toThrow(/^Não coube no aparelho: .* há 0 MB livres/)
    expect(await banco.lerMeta('obras')).toBeUndefined()
    expect(await banco.lerMeta('obra_atual')).toBeUndefined()
  })

  it('o navegador recusa no meio: o que entrou pela metade sai e a obra não fica aberta', async () => {
    const p1 = 'a2000000-0000-0000-0000-0000000000a1'
    const p2 = 'a2000000-0000-0000-0000-0000000000a2'
    const base = INDICE.pavimentos[0].plantas[0]
    const indice: IndicePacote = { ...INDICE, obra: 'EXF', pavimentos: [{ ...INDICE.pavimentos[0], plantas: [{ ...base, id: p1, pasta: 'a/' }, { ...base, id: p2, pasta: 'b/' }] }] }
    const raiz = 'http://pc/meio/'
    servirPasta(raiz, { 'indice.json': indice, 'fichas.json': FICHAS, 'historico.json': HISTORICO, 'a/manifest.json': MANIFEST, 'a/pacote.bin': new Blob([]), 'b/manifest.json': MANIFEST, 'b/pacote.bin': new Blob([]) })
    vi.stubGlobal('navigator', { storage: { estimate: async () => ({ quota: 100 * 1024 * 1024, usage: 0 }) } })
    const put = IDBObjectStore.prototype.put
    let pacotes = 0
    const espiao = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'pacotes' && ++pacotes === 2) throw new DOMException('cheio', 'QuotaExceededError')
      return put.apply(this, args)
    })
    try {
      const banco = novoBanco()
      await banco.gravarMeta('obras', [])
      await expect(prepararObraLocal(banco, (await localizarPacote(raiz))!)).rejects.toThrow(/^Não coube no aparelho: a obra precisa de cerca de 1 MB\. Libere pelo menos 1 MB/)
      const noAparelho = await pacotesNoAparelho()
      expect(noAparelho.has(p1)).toBe(false)
      expect(noAparelho.has(p2)).toBe(false)
      expect(await banco.lerMeta('obras')).toEqual([])
      expect(await banco.lerMeta('obra_atual')).toBeUndefined()
      const obra = await obraDoPacote(indice)
      expect(await banco.registros.where('obra_id').equals(obra.id).count()).toBe(0)
      expect(await banco.lerMeta(`pacote_obra:${obra.id}`)).toBeUndefined()
    } finally {
      espiao.mockRestore()
    }
  })
})

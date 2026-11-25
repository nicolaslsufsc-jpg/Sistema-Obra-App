import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { banco } from '../nucleo/servicos'
import type { Linha } from '../nucleo/banco_local'
import { BLOCOS_SINCRONIZADOS, TABELAS_SINCRONIZADAS } from '../nucleo/tabelas'
import { carregar, comRegistros, localDoRegistro, observar, tocarItem, voltarItem, type DadosFvs } from './dados'
import { filtrarGrupos, filtrarPorServico, gruposDeLocais, nomeCurtoDoServico, quantosLocais, servicosDaLista, servicosDoLocal } from './locais'
import type { Ficha } from './situacao'

// Obra fictícia EXE: fundação com dois blocos e uma cortina, todos fora da planta (locais_sistema).
const OBRA = 'e0000000-0000-0000-0000-0000000010c1'
const RAIZ = 'e0000000-0000-0000-0000-0000000010a0'
const FUNDACAO = 'e0000000-0000-0000-0000-0000000010a1'
const B2 = 'e0000000-0000-0000-0000-0000000010b2'
const B10 = 'e0000000-0000-0000-0000-0000000010ba'
const CORTINA = 'e0000000-0000-0000-0000-0000000010c0'
const SEM_NADA = 'e0000000-0000-0000-0000-0000000010d0'
const PILAR = 'e0000000-0000-0000-0000-0000000010e0'

const BLOCO: Ficha = {
  id: 'e0000000-0000-0000-0000-0000000010f1',
  codigo: 'EXE-PVS-BLOCO',
  titulo: 'Blocos de fundação',
  revisao: '0',
  aplica_a: [],
  itens: [
    { n: 1, etapa: 'INÍCIO', titulo: 'Arrasamento das estacas' },
    { n: 2, etapa: 'EXECUÇÃO', titulo: 'Armadura' },
  ],
}

const CORTINA_F: Ficha = {
  id: 'e0000000-0000-0000-0000-0000000010f2',
  codigo: 'EXE-PVS-CORTINA',
  titulo: 'Cortina de contenção',
  revisao: '0',
  aplica_a: [],
  itens: [{ n: 1, etapa: 'INÍCIO', titulo: 'Escavação do trecho' }],
}

const nucleo = { usuario_id: 'u', dispositivo_id: 'd', criado_em_dispositivo: '2026-11-21T10:00:00Z', apagado: false }
function linha(tabela: string, id: string, campos: Record<string, unknown>) {
  return { tabela, id, obra_id: OBRA, linha: { id, obra_id: OBRA, ...nucleo, ...campos } as unknown as Linha, pendente: 0 as const }
}
const local = (id: string, origem: string, pai: string | null, nome: string, completo: string, extra: Record<string, unknown> = {}) =>
  linha('locais_sistema', id, { sistema: 'exe', origem_id: origem, origem_pai_id: pai, nome, nome_completo: completo, nivel: pai ? 2 : 0, ...extra })
const fichaAberta = (id: string, campos: Record<string, unknown>) =>
  linha('fvs_fichas_campo', id, { codigo: id.slice(-4), status: 'Em andamento', ficha_id: BLOCO.id, ficha_codigo: BLOCO.codigo, ficha_titulo: BLOCO.titulo, qtd_a: 1, qtd_r: 0, qtd_na: 0, ...campos })
const evento = (id: string, campos: Record<string, unknown>) => linha('fvs_eventos', id, { ficha_id: BLOCO.id, item: 1, resultado: 'C', rodada: 1, ...campos })

async function semear() {
  await banco.registros.bulkPut([
    linha('fichas_modelo', BLOCO.id, { codigo: BLOCO.codigo, titulo: BLOCO.titulo, revisao: '0', aplica_a: [], itens: BLOCO.itens }),
    linha('fichas_modelo', CORTINA_F.id, { codigo: CORTINA_F.codigo, titulo: CORTINA_F.titulo, revisao: '0', aplica_a: [], itens: CORTINA_F.itens }),
    local(RAIZ, '1', null, 'Obra Exemplo', 'Obra Exemplo'),
    local(FUNDACAO, '10', '1', 'Fundação', 'Obra Exemplo / Fundação'),
    local(B10, '110', '10', 'Bloco B10', 'Obra Exemplo / Fundação / Bloco B10'),
    local(B2, '102', '10', 'Bloco B2', 'Obra Exemplo / Fundação / Bloco B2'),
    local(CORTINA, '120', '1', 'Cortina trecho 1', 'Obra Exemplo / Cortina trecho 1', { apagado_no_sistema: true }),
    local(SEM_NADA, '130', '10', 'Bloco B30', 'Obra Exemplo / Fundação / Bloco B30'),
    // local que também é peça da planta: as fichas aparecem na peça, não na lista
    local(PILAR, '140', '1', 'P1', 'Obra Exemplo / P1', { elemento_id: 'pe1' }),
    fichaAberta('e0000000-0000-0000-0000-00000000fc01', { local_id: B2, local_construpoint: 'Fundação / Bloco B2' }),
    fichaAberta('e0000000-0000-0000-0000-00000000fc02', { local_id: CORTINA, local_construpoint: 'Cortina trecho 1', ficha_id: CORTINA_F.id, ficha_codigo: CORTINA_F.codigo, ficha_titulo: CORTINA_F.titulo }),
    // ficha sem local do sistema (histórico do pacote, sem conta): continua na lista "sem peça"
    fichaAberta('e0000000-0000-0000-0000-00000000fc03', { local_construpoint: 'Laje do térreo' }),
    // ficha num local que ainda não chegou ao aparelho: também continua na lista "sem peça"
    fichaAberta('e0000000-0000-0000-0000-00000000fc04', { local_id: 'e0000000-0000-0000-0000-0000000010ff', local_construpoint: 'Bloco B40' }),
    fichaAberta('e0000000-0000-0000-0000-00000000fc05', { local_id: PILAR, elemento_id: 'pe1', local_construpoint: 'P1' }),
    evento('e0000000-0000-0000-0000-00000000ee01', { local_id: B2, ficha_campo_id: 'e0000000-0000-0000-0000-00000000fc01' }),
    evento('e0000000-0000-0000-0000-00000000ee02', { local_id: B10, resultado: 'NC' }),
  ])
}

describe('locais fora da planta (locais_sistema, 21/11)', () => {
  it('o aparelho baixa locais_sistema e importacoes num bloco à parte, no fim', () => {
    expect(TABELAS_SINCRONIZADAS).toContain('locais_sistema')
    expect(TABELAS_SINCRONIZADAS.indexOf('locais_sistema')).toBeGreaterThan(TABELAS_SINCRONIZADAS.indexOf('fvs_eventos'))
    // num bloco só deles; desde 23/11 os redesenhos e o formulário da obra vêm depois, cada um no seu bloco
    expect(BLOCOS_SINCRONIZADOS).toContainEqual(['locais_sistema', 'importacoes'])
    expect(BLOCOS_SINCRONIZADOS.slice(-2)).toEqual([['fvs_redesenhos'], ['projetos_formularios']])
  })

  it('carregar separa as fichas por local do sistema e deixa as outras na lista sem peça', async () => {
    await semear()
    const d = await carregar(OBRA)
    expect(d.localPorId.size).toBe(7)
    expect([...d.fichasCampoDoLocal.keys()].sort()).toEqual([B2, CORTINA].sort())
    expect(d.fichasCampoSemPeca.map((f) => f.local)).toEqual(['Bloco B40', 'Laje do térreo'])
    // a do local que é peça fica na peça
    expect(d.fichasCampoDe.get('pe1')?.length).toBe(1)
    // a verificação do local entra no mesmo mapa das peças
    expect(d.eventosDe.get(B2)?.map((e) => e.resultado)).toEqual(['C'])
    expect(d.eventosDe.get(B10)?.map((e) => e.resultado)).toEqual(['NC'])
  })

  it('a lista agrupa pelo local pai, em ordem natural, só com os locais que têm ficha ou marcação', async () => {
    const d = await carregar(OBRA)
    const g = gruposDeLocais(d)
    expect(g.map((x) => [x.titulo, x.locais.map((l) => l.local.nome)])).toEqual([
      ['Obra Exemplo', ['Cortina trecho 1']],
      ['Obra Exemplo / Fundação', ['Bloco B2', 'Bloco B10']],
    ])
    const b10 = g[1].locais[1]
    expect([b10.fichas, b10.registros, b10.situacao]).toEqual([0, 1, 'reprovado'])
    expect(g[0].locais[0].local.apagado_no_sistema).toBe(true)
    expect(quantosLocais(d)).toBe(3)
    // busca sem acento e sem maiúscula, pelo nome ou pelo caminho
    expect(filtrarGrupos(g, 'fundacao').flatMap((x) => x.locais.map((l) => l.local.nome))).toEqual(['Bloco B2', 'Bloco B10'])
    expect(filtrarGrupos(g, 'b10').flatMap((x) => x.locais.map((l) => l.local.nome))).toEqual(['Bloco B10'])
    expect(filtrarGrupos(g, '  ')).toHaveLength(2)
  })

  it('serviços da lista (23/11): escolher a cortina mostra só os trechos dela', async () => {
    const d = await carregar(OBRA)
    const g = gruposDeLocais(d)
    // o B10 só tem marcação do app: o serviço vem da ficha em que ela foi feita
    expect(servicosDoLocal(d, B10)).toEqual([{ codigo: BLOCO.codigo, titulo: BLOCO.titulo }])
    expect(servicosDaLista(g).map((x) => [x.codigo, x.locais])).toEqual([
      [BLOCO.codigo, 2],
      [CORTINA_F.codigo, 1],
    ])
    expect(filtrarPorServico(g, CORTINA_F.codigo).flatMap((x) => x.locais.map((l) => l.local.nome))).toEqual(['Cortina trecho 1'])
    expect(filtrarPorServico(g, BLOCO.codigo).flatMap((x) => x.locais.map((l) => l.local.nome))).toEqual(['Bloco B2', 'Bloco B10'])
    expect(filtrarPorServico(g, '')).toHaveLength(2)
    expect(nomeCurtoDoServico('Supraestrutura - Parede Concreto Aparente')).toBe('Parede Concreto Aparente')
    expect(nomeCurtoDoServico('Cortina de Contenção')).toBe('Cortina de Contenção')
  })

  it('a marcação num local do sistema vai em local_id, sem planta, e a tela lê como as outras', async () => {
    const d = await carregar(OBRA)
    const c = { obraId: OBRA, usuarioId: '00000000-0000-0000-0000-0000000000a1', plantaId: null, fichaCampoId: null, locais: d.localPorId }
    const ok = await tocarItem(c, SEM_NADA, BLOCO, 2, 'C', [])
    expect([ok.local_id, ok.elemento_id, ok.area_id, ok.barra_id, ok.planta_id]).toEqual([SEM_NADA, undefined, undefined, undefined, null])
    expect(localDoRegistro(ok)).toBe(SEM_NADA)
    const depois = comRegistros(d, [ok])
    expect(depois.eventosDe.get(SEM_NADA)?.map((e) => [e.item, e.resultado])).toEqual([[2, 'C']])
    // o local passa a aparecer na lista
    expect(quantosLocais(depois as DadosFvs)).toBe(4)
    // desfazer e observação continuam no mesmo local
    const volta = await voltarItem(c, ok, undefined, depois.eventosDe.get(SEM_NADA) ?? [])
    expect([volta?.local_id, volta?.elemento_id, volta?.resultado]).toEqual([SEM_NADA, undefined, null])
    const nc = await tocarItem(c, SEM_NADA, BLOCO, 1, 'NC', [])
    const obs = await observar(c, comRegistros(d, [nc]).eventosDe.get(SEM_NADA)!.find((e) => e.id === nc.id)!, 'Estaca fora do eixo')
    expect([obs.local_id, obs.elemento_id, obs.observacao]).toEqual([SEM_NADA, undefined, 'Estaca fora do eixo'])
    // fora dos locais do sistema, a peça continua em elemento_id
    expect((await tocarItem(c, 'pe1', BLOCO, 1, 'C', [])).elemento_id).toBe('pe1')
  })
})

import { describe, expect, it } from 'vitest'
import { celula, linhasDaSituacao, montarPlanilha, planilhaDaSituacao, planilhaDeReprovacoes, type EntradaDaSituacao } from './planilha'
import type { EventoFvs, Ficha, FichaCampo } from './situacao'

const ficha: Ficha = {
  id: 'f1',
  codigo: 'TESTE-PVS-P',
  titulo: 'Pilares',
  revisao: '0',
  aplica_a: ['P'],
  itens: [
    { n: 1, etapa: 'INÍCIO', titulo: 'Local limpo' },
    { n: 2, etapa: 'EXECUÇÃO', titulo: 'Prumo' },
    { n: 3, etapa: 'EXECUÇÃO', titulo: 'Armadura' },
  ],
}

let seq = 0
function ev(elemento: string, item: number, resultado: EventoFvs['resultado'], extra: Partial<EventoFvs> = {}): EventoFvs {
  seq++
  return {
    id: `e${String(seq).padStart(4, '0')}`,
    elemento_id: elemento,
    ficha_id: 'f1',
    item,
    resultado,
    rodada: 1,
    observacao: null,
    lote_id: null,
    planta_id: null,
    usuario_id: 'u1',
    criado_em_dispositivo: `2026-11-05T12:00:${String(seq % 60).padStart(2, '0')}.000Z`,
    ...extra,
  }
}

const aberta = (id: string, elemento: string, extra: Partial<FichaCampo> = {}): FichaCampo => ({
  id,
  elemento_id: elemento,
  ficha_id: 'f1',
  codigo: `FVS-${id}`,
  local: '',
  ficha_codigo: 'TESTE-PVS-P',
  ficha_titulo: 'Pilares',
  status: 'Aceito',
  inspetor: null,
  atualizada_em: null,
  qtd_a: 0,
  qtd_r: 0,
  qtd_na: 0,
  ...extra,
})

function entrada(pecas: EntradaDaSituacao['pecas'], eventos: EventoFvs[] = [], abertas: FichaCampo[] = [], fichas: Ficha[] = [ficha]): EntradaDaSituacao {
  const eventosDe = new Map<string, EventoFvs[]>()
  for (const e of eventos) eventosDe.set(e.elemento_id, [...(eventosDe.get(e.elemento_id) ?? []), e])
  const fichasCampoDe = new Map<string, FichaCampo[]>()
  for (const a of abertas) fichasCampoDe.set(a.elemento_id!, [...(fichasCampoDe.get(a.elemento_id!) ?? []), a])
  return {
    pecas,
    pavimentos: [
      { id: 'sub', nome: 'Subsolo' },
      { id: 'p3', nome: '3º Pavimento' },
    ],
    fichas,
    fichaPorId: new Map(fichas.map((f) => [f.id, f])),
    fichasCampoDe,
    eventosDe,
    quem: (e) => e.verificado_por ?? 'você',
  }
}

const p = (id: string, nome: string, pavimento_id = 'p3', tipo = 'P') => ({ id, tipo, nome, secao: '20x60', pavimento_id })

describe('planilha da situação da obra', () => {
  it('peça sem marcação aparece como pendente: é o que falta', () => {
    const [l] = linhasDaSituacao(entrada([p('x', 'P1')]))
    expect(l).toMatchObject({ pavimento: '3º Pavimento', tipo: 'Pilar', peca: 'P1', secao: '20x60', ficha: 'TESTE-PVS-P', situacao: 'Pendente', a: 0, r: 0, na: 0, vazios: 3, conforme: null, ultima: null, quem: '', fichaNoSistema: '', duplicada: false })
  })

  it('conta pelo último registro de cada item, com a última marcação e quem fez', () => {
    const antes = [ev('x', 1, 'C'), ev('x', 2, 'C')]
    const ultimo = ev('x', 2, 'NC', { verificado_por: 'Pessoa Dois' })
    const [l] = linhasDaSituacao(entrada([p('x', 'P1')], [...antes, ultimo]))
    expect(l).toMatchObject({ situacao: 'Com NC', a: 1, r: 1, na: 0, vazios: 1, conforme: 50, ultima: ultimo.criado_em_dispositivo, quem: 'Pessoa Dois' })
  })

  it('item desmarcado volta a contar como vazio', () => {
    const [l] = linhasDaSituacao(entrada([p('x', 'P1')], [ev('x', 1, 'C'), ev('x', 1, null)]))
    expect(l).toMatchObject({ situacao: 'Pendente', a: 0, vazios: 3 })
  })

  it('ficha duplicada: uma linha para cada, cada uma com a sua situação', () => {
    const linhas = linhasDaSituacao(
      entrada(
        [p('x', 'P1')],
        [ev('x', 1, 'C', { ficha_campo_id: 'a' }), ev('x', 2, 'C', { ficha_campo_id: 'a' }), ev('x', 3, 'C', { ficha_campo_id: 'a' }), ev('x', 2, 'NC', { ficha_campo_id: 'b' })],
        [aberta('a', 'x'), aberta('b', 'x', { status: 'Pendente Reinspeção' })],
      ),
    )
    expect(linhas.map((l) => [l.fichaNoSistema, l.status, l.situacao, l.duplicada])).toEqual([
      ['FVS-a', 'Aceito', 'Liberado', true],
      ['FVS-b', 'Pendente Reinspeção', 'Com NC', true],
    ])
  })

  it('marcado só no app numa peça que tem ficha também aparece, para não sumir', () => {
    const linhas = linhasDaSituacao(entrada([p('x', 'P1')], [ev('x', 1, 'C')], [aberta('a', 'x')]))
    expect(linhas.map((l) => [l.fichaNoSistema, l.a])).toEqual([
      ['FVS-a', 0],
      ['', 1],
    ])
  })

  it('ficha modelo fora do app: fica a linha com o código e o status, sem inventar situação', () => {
    const [l] = linhasDaSituacao(entrada([p('x', 'P1')], [], [aberta('a', 'x', { ficha_id: null, ficha_codigo: 'OUTRA-PVS', status: 'Agendado' })]))
    expect(l).toMatchObject({ ficha: 'OUTRA-PVS', situacao: '', status: 'Agendado', vazios: 0 })
  })

  it('revisão nova da ficha: a peça marcada na anterior continua nela; a pendente já usa a nova', () => {
    const nova: Ficha = { ...ficha, id: 'f2', revisao: '1', itens: [{ n: 1, etapa: 'INÍCIO', titulo: 'Local limpo' }] }
    const linhas = linhasDaSituacao(entrada([p('x', 'P1'), p('y', 'P2')], [ev('x', 1, 'C')], [], [ficha, nova]))
    expect(linhas.map((l) => [l.peca, l.situacao, l.a, l.vazios])).toEqual([
      ['P1', 'Em andamento', 1, 2],
      ['P2', 'Pendente', 0, 1],
    ])
  })

  it('em ordem de pavimento, tipo e número da peça', () => {
    const linhas = linhasDaSituacao(entrada([p('c', 'P10'), p('b', 'P2'), p('d', 'V1', 'p3', 'V'), p('a', 'P99', 'sub')]))
    expect(linhas.map((l) => l.peca)).toEqual(['P99', 'P2', 'P10', 'V1'])
  })

  it('ambiente: só o serviço que começou; sem nenhum, uma linha pendente', () => {
    const alvenaria: Ficha = { ...ficha, id: 'alv', codigo: 'ALV', aplica_a: ['A'] }
    const reboco: Ficha = { ...ficha, id: 'reb', codigo: 'REB', aplica_a: ['A'] }
    const linhas = linhasDaSituacao(entrada([p('a1', '101-01', 'p3', 'A'), p('a2', '101-02', 'p3', 'A')], [ev('a1', 1, 'C', { ficha_id: 'alv' })], [], [ficha, alvenaria, reboco]))
    expect(linhas.map((l) => [l.peca, l.ficha, l.a, l.situacao])).toEqual([
      ['101-01', 'ALV', 1, 'Em andamento'],
      ['101-02', '', 0, 'Pendente'],
    ])
  })

  it('o arquivo abre no Excel, com acentos e sem executar fórmula', () => {
    const texto = planilhaDaSituacao(linhasDaSituacao(entrada([p('x', 'P1')], [ev('x', 1, 'C', { verificado_por: '=SOMA(1)' })])), 'Sistema Exemplo')
    expect(texto.charCodeAt(0)).toBe(0xfeff)
    const [cabecalho, linha] = texto.slice(1).split('\r\n')
    expect(cabecalho.startsWith('Pavimento;Tipo;Peça;Seção;Ficha;Situação;C;NC;NA;Itens vazios;% conforme;Última marcação;Hora;Quem marcou;')).toBe(true)
    expect(linha.startsWith('3º Pavimento;Pilar;P1;20x60;TESTE-PVS-P;Em andamento;1;0;0;2;100;')).toBe(true)
    expect(linha).toContain(`;'=SOMA(1);`)
    expect(cabecalho.endsWith(';Ficha no Sistema Exemplo;Status no Sistema Exemplo;Ficha duplicada')).toBe(true)
  })

  it('obra sem sistema oficial: a planilha não tem as colunas dele', () => {
    const texto = planilhaDaSituacao(linhasDaSituacao(entrada([p('x', 'P1')], [ev('x', 1, 'C')])))
    const [cabecalho, linha] = texto.slice(1).split('\r\n')
    expect(cabecalho.endsWith(';Hora;Quem marcou')).toBe(true)
    expect(cabecalho).not.toContain('Ficha no')
    expect(cabecalho.split(';').length).toBe(linha.split(';').length)
  })
})

describe('planilha de reprovações', () => {
  const r = {
    pecaNome: 'P1',
    tipo: 'P',
    fichaCodigo: 'TESTE-PVS-P',
    item: 2,
    etapa: 'EXECUÇÃO',
    itemTitulo: 'Prumo',
    rodada: 1,
    observacao: '=Trocar; urgente',
    quem: 'Pessoa Um',
    quando: '2026-11-05T15:00:00.000Z',
    aberta: true,
    fichaCampoCodigo: 'FVS-1',
    reinspecao: null,
  }

  it('uma linha por reprovação, com o texto seguro para o Excel', () => {
    const [cab, linha] = planilhaDeReprovacoes([r], () => '3º Pavimento', () => 'Trecho 2', 'Sistema Exemplo').slice(1).split('\r\n')
    expect(cab.startsWith('Pavimento;Trecho;Tipo;Peça;Ficha;Ficha no Sistema Exemplo;Item;Etapa;Verificação;O que fazer;Rodada;')).toBe(true)
    expect(linha.startsWith(`3º Pavimento;Trecho 2;Pilar;P1;TESTE-PVS-P;FVS-1;2;EXECUÇÃO;Prumo;"'=Trocar; urgente";V01;`)).toBe(true)
    expect(linha).toContain(';Pessoa Um;Aberta;')
  })

  it('obra sem sistema oficial: sem a coluna da ficha de lá', () => {
    const [cab, linha] = planilhaDeReprovacoes([r], () => '3º Pavimento', () => 'Trecho 2').slice(1).split('\r\n')
    expect(cab.startsWith('Pavimento;Trecho;Tipo;Peça;Ficha;Item;Etapa;')).toBe(true)
    expect(linha.startsWith('3º Pavimento;Trecho 2;Pilar;P1;TESTE-PVS-P;2;EXECUÇÃO;')).toBe(true)
  })

  it('reinspecionada traz o resultado, a data e quem', () => {
    const re = { ...r, aberta: false, reinspecao: { resultado: 'C', quando: '2026-11-06T15:00:00.000Z', quem: 'Pessoa Dois' } }
    const [, linha] = planilhaDeReprovacoes([re], () => '3º', () => '', 'Sistema Exemplo').slice(1).split('\r\n')
    expect(linha.endsWith(';Reinspecionada;C;06/11/2026;Pessoa Dois;;;;;;;')).toBe(true)
  })

  it('tratativa (25/11): quem resolve, prazo, causa, casos parecidos, concessão e eficácia no fim da linha', () => {
    const tratativa = {
      responsavel: 'Empreiteiro Exemplo',
      prazo: '2026-12-01',
      causa: 'outro' as const,
      causa_obs: 'Chuva',
      casos_parecidos: 'P2',
      concessao: true,
      concessao_por: 'Engenheiro',
      eficacia: null,
      eficacia_obs: null,
    }
    const [cab, linha] = planilhaDeReprovacoes([{ ...r, aberta: false, concessao: true, tratativa }], () => '3º', () => '').slice(1).split('\r\n')
    expect(cab.endsWith(';Quem resolve;Prazo;Causa;Casos parecidos;Concessão;Quem decidiu;Eficácia')).toBe(true)
    expect(linha.endsWith(';Concessão;;;;Empreiteiro Exemplo;01/12/2026;Outro (Chuva);P2;Sim;Engenheiro;')).toBe(true)
  })
})

describe('células da planilha', () => {
  it('protege fórmula, ponto e vírgula, aspas e quebra de linha', () => {
    expect(celula('=1+1')).toBe(`'=1+1`)
    expect(celula('-3')).toBe(`'-3`)
    expect(celula('@x')).toBe(`'@x`)
    expect(celula('a;b')).toBe('"a;b"')
    expect(celula('diz "oi"')).toBe('"diz ""oi"""')
    expect(celula('duas\nlinhas')).toBe('duas linhas')
    expect(celula(null)).toBe('')
    expect(celula(0)).toBe('0')
  })

  it('monta o arquivo com marca de UTF-8 e fim de linha do Windows', () => {
    expect(montarPlanilha(['A', 'B'], [[1, null]])).toBe('﻿A;B\r\n1;\r\n')
  })
})

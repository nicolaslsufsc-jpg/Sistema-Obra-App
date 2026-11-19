import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Linha } from '../nucleo/banco_local'
import {
  atrasado,
  categoriaDaPeca,
  COLUNAS,
  depoisDoFechamento,
  diaDaSemana,
  diasAntes,
  diasEntre,
  diasImpraticaveisNoMes,
  entradasDoMapa,
  montarDados,
  numeroAoFechar,
  pecaTocada,
  resumoDoDia,
  situacaoDoRelatorio,
  sugestoes,
  textoDoLocal,
  ultimoDiaCom,
  type LinhasPorTabela,
  type Relatorio,
} from './regras'
import { SECOES, CAMPOS_CADASTRO, TIPOS_OCORRENCIA, TIPOS_RELATORIO } from './tipos'
import { TABELAS_RELATORIOS } from './tabelas'

let n = 0
function linha(campos: Record<string, unknown>): Linha {
  n++
  return {
    id: `id-${String(n).padStart(4, '0')}`,
    obra_id: 'obra',
    usuario_id: 'u',
    dispositivo_id: 'd',
    criado_em_dispositivo: `2026-11-06T10:${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}.000Z`,
    apagado: false,
    ...campos,
  } as Linha
}

const PAV = { id: 'pav1', nome: '3º Pavimento', ordem: 3 }
const base = (extra: LinhasPorTabela = {}): LinhasPorTabela => ({
  pavimentos: [linha(PAV)],
  elementos: [
    linha({ id: 'p12', pavimento_id: 'pav1', tipo: 'P', nome: 'P12' }),
    linha({ id: 'p2', pavimento_id: 'pav1', tipo: 'P', nome: 'P2' }),
    linha({ id: 'v40', pavimento_id: 'pav1', tipo: 'V', nome: 'V40' }),
  ],
  ...extra,
})

describe('colunas conferem com a migração', () => {
  const pasta = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations')
  const sql = ['20261106120000_relatorios.sql', '20261107200000_relatorios_foto_marca.sql'].map((n) => readFileSync(path.join(pasta, n), 'utf8')).join('\n')
  /** Colunas de `create table public.<tabela> (...)` e as acrescentadas por `alter table ... add column`. */
  function colunasDa(tabela: string): Set<string> {
    const i = sql.indexOf(`create table public.${tabela} (`)
    expect(i, tabela).toBeGreaterThanOrEqual(0)
    const corpo = sql.slice(i, sql.indexOf('\n);', i))
    const colunas = new Set([...corpo.matchAll(/^ {2}([a-z_0-9]+) {2,}/gm)].map((m) => m[1]))
    for (const m of sql.matchAll(new RegExp(`alter table public\\.${tabela} add column ([a-z_0-9]+)`, 'g'))) colunas.add(m[1])
    return colunas
  }

  it('toda coluna que o app grava existe na tabela do banco (coluna errada seria recusada na hora do envio)', () => {
    for (const [tabela, colunas] of Object.entries(COLUNAS)) {
      const doBanco = colunasDa(tabela)
      for (const c of colunas) expect(doBanco.has(c), `${tabela}.${c}`).toBe(true)
    }
    for (const s of Object.values(SECOES)) {
      const doBanco = colunasDa(s.tabela)
      for (const c of s.campos) expect(doBanco.has(c.nome), `${s.tabela}.${c.nome}`).toBe(true)
    }
    const cadastro = colunasDa('diario_cadastro')
    for (const c of CAMPOS_CADASTRO) expect(cadastro.has(c.nome), c.nome).toBe(true)
  })

  it('toda tabela do módulo existe na migração, e as listas têm só códigos que o banco aceita', () => {
    for (const t of TABELAS_RELATORIOS) expect(sql).toContain(`select nucleo.preparar_tabela('public.${t}'`)
    for (const o of [...TIPOS_OCORRENCIA, ...TIPOS_RELATORIO]) expect(o.v).toMatch(/^[a-z_]{1,40}$/)
  })
})

describe('diário', () => {
  it('correção e apagamento: vale a linha que ninguém substituiu', () => {
    const a = linha({ data: '2026-11-06', funcao: 'Pedreiro', quantidade: 6, empresa: 'Construtora Exemplo' })
    const corrigida = linha({ data: '2026-11-06', funcao: 'Pedreiro', quantidade: 8, empresa: 'Construtora Exemplo', substitui_id: a.id })
    const b = linha({ data: '2026-11-06', funcao: 'Servente', quantidade: 3, empresa: 'Construtora Exemplo' })
    const apagada = linha({ data: '2026-11-06', funcao: 'Servente', quantidade: 3, empresa: 'Construtora Exemplo', substitui_id: b.id, cancelado: true })
    const d = montarDados(base({ diario_efetivo: [a, corrigida, b, apagada] }))
    const lista = d.efetivo.get('2026-11-06')!
    expect(lista.map((l) => l.quantidade)).toEqual([8])
    expect(lista[0].raiz).toBe(a.id) // quem aponta para o registro aponta para a primeira versão
    expect(resumoDoDia(d, '2026-11-06').pessoas).toBe(8)
  })

  it('dois aparelhos sem internet no mesmo dia: os registros somam, nada se perde', () => {
    const d = montarDados(
      base({
        diario_efetivo: [
          linha({ data: '2026-11-06', funcao: 'Pedreiro', quantidade: 6, dispositivo_id: 'A' }),
          linha({ data: '2026-11-06', funcao: 'Carpinteiro', quantidade: 4, dispositivo_id: 'B' }),
        ],
      }),
    )
    expect(resumoDoDia(d, '2026-11-06').pessoas).toBe(10)
    expect(d.dias).toEqual(['2026-11-06'])
  })

  it('clima: vale o último registro de cada período; desmarcado não conta como impraticável', () => {
    const d = montarDados(
      base({
        diario_clima: [
          linha({ data: '2026-11-06', periodo: 'manha', tempo: 'chuva_forte', condicao: 'impraticavel' }),
          linha({ data: '2026-11-06', periodo: 'manha', tempo: null, condicao: 'impraticavel' }),
          linha({ data: '2026-11-07', periodo: 'tarde', tempo: 'chuva_forte', condicao: 'impraticavel' }),
          linha({ data: '2026-12-01', periodo: 'tarde', tempo: 'chuva_forte', condicao: 'impraticavel' }),
        ],
      }),
    )
    expect(resumoDoDia(d, '2026-11-06').impraticavel).toBe(false)
    expect(resumoDoDia(d, '2026-11-07').impraticavel).toBe(true)
    expect(diasImpraticaveisNoMes(d, '2026-11-20')).toBe(1)
  })

  it('número do RDO: sobe ao fechar e fica o mesmo se o dia for reaberto', () => {
    const f1 = linha({ data: '2026-11-04', acao: 'fechado', numero: 1 })
    const f2 = linha({ data: '2026-11-05', acao: 'fechado', numero: 2 })
    const reab = linha({ data: '2026-11-05', acao: 'reaberto', numero: 2 })
    const d = montarDados(base({ diario_fechamentos: [f1, f2, reab] }))
    expect(numeroAoFechar(d, '2026-11-06')).toBe(3) // dia novo
    expect(numeroAoFechar(d, '2026-11-05')).toBe(2) // reaberto mantém
    expect(numeroAoFechar(d, '2026-11-03')).toBe(3) // dia atrasado não renumera os outros
    expect(resumoDoDia(d, '2026-11-05').fechado).toBe(false)
    expect(resumoDoDia(d, '2026-11-04').fechado).toBe(true)
  })

  it('registro que chegou depois de fechar o dia é apontado', () => {
    const antes = linha({ data: '2026-11-06', funcao: 'Pedreiro', quantidade: 1 })
    const fech = linha({ data: '2026-11-06', acao: 'fechado', numero: 1 })
    const depois = linha({ data: '2026-11-06', funcao: 'Servente', quantidade: 1 })
    const d = montarDados(base({ diario_efetivo: [antes, depois], diario_fechamentos: [fech] }))
    expect(depoisDoFechamento(d, '2026-11-06', antes)).toBe(false)
    expect(depoisDoFechamento(d, '2026-11-06', depois)).toBe(true)
  })

  it('copiar do dia anterior acha o último dia com registro, nunca o próprio dia nem depois', () => {
    const m = new Map([['2026-11-02', [1]], ['2026-11-04', [1]], ['2026-11-05', []], ['2026-11-07', [1]]])
    expect(ultimoDiaCom(m, '2026-11-06')).toBe('2026-11-04')
    expect(ultimoDiaCom(m, '2026-11-02')).toBeUndefined()
  })

  it('sugestões vêm do que já foi digitado, as mais usadas primeiro', () => {
    const m = new Map<string, Linha[]>([
      ['a', [linha({ empresa: 'Empreiteira B' }), linha({ empresa: 'Construtora Exemplo' })]],
      ['b', [linha({ empresa: 'Construtora Exemplo' }), linha({ empresa: null }), linha({ empresa: '  ' })]],
    ])
    expect(sugestoes(m, 'empresa')).toEqual(['Construtora Exemplo', 'Empreiteira B'])
  })

  it('datas não dependem do fuso do aparelho', () => {
    expect(diaDaSemana('2026-11-06')).toBe('sexta-feira')
    expect(diasEntre('2026-01-10', '2026-11-06')).toBe(300)
    expect(diasAntes('2026-03-01', 1)).toBe('2026-02-28')
  })
})

describe('relatórios', () => {
  const rel = (campos: Record<string, unknown>) => {
    const r = linha({ tipo: 'problema', data: '2026-11-01', titulo: 'x', prazo: null, itens: [], ...campos })
    return montarDados(base({ relatorios: [r] })).relatorios[0] as Relatorio
  }

  it('situação: vale o último andamento; sem andamento, problema nasce aberto', () => {
    const r = rel({})
    expect(situacaoDoRelatorio(r, undefined)).toBe('aberto')
    expect(situacaoDoRelatorio(r, [linha({ situacao: 'em_andamento' }), linha({ situacao: 'resolvido' })])).toBe('resolvido')
  })

  it('vistoria toda respondida sem Ruim nasce resolvida; com Ruim ou item em branco, aberta', () => {
    const ok = [{ item: 'a', resultado: 'ok' }, { item: 'b', resultado: 'atencao' }]
    expect(situacaoDoRelatorio(rel({ tipo: 'limpeza', itens: ok }), undefined)).toBe('resolvido')
    expect(situacaoDoRelatorio(rel({ tipo: 'limpeza', itens: [...ok, { item: 'c', resultado: 'ruim' }] }), undefined)).toBe('aberto')
    expect(situacaoDoRelatorio(rel({ tipo: 'limpeza', itens: [...ok, { item: 'c', resultado: null }] }), undefined)).toBe('aberto')
    expect(situacaoDoRelatorio(rel({ tipo: 'limpeza', itens: [] }), undefined)).toBe('aberto')
  })

  it('atrasado: prazo vencido e não resolvido', () => {
    const r = rel({ prazo: '2026-11-05' })
    expect(atrasado(r, 'aberto', '2026-11-06')).toBe(true)
    expect(atrasado(r, 'aberto', '2026-11-05')).toBe(false)
    expect(atrasado(r, 'resolvido', '2026-11-06')).toBe(false)
  })
})

describe('onde foi (marcas)', () => {
  const dados = () => {
    const s = linha({ id: 'serv', data: '2026-11-06', descricao: 'Forma', situacao: 'concluido' })
    const s2 = linha({ id: 'serv2', data: '2026-11-01', descricao: 'Armação', situacao: 'em_andamento' })
    const r = linha({ id: 'rel', tipo: 'problema', data: '2026-11-06', titulo: 'Vazamento', itens: [] })
    const m1 = linha({ servico_id: 'serv', pavimento_id: 'pav1', planta_ref: 't@R1', forma: 'peca', elemento_id: 'p12' })
    const m2 = linha({ servico_id: 'serv', pavimento_id: 'pav1', planta_ref: 't@R1', forma: 'peca', elemento_id: 'v40' })
    const m3 = linha({ servico_id: 'serv', pavimento_id: 'pav1', planta_ref: 't@R1', forma: 'peca', elemento_id: 'p2' })
    const m4 = linha({ servico_id: 'serv', pavimento_id: 'pav1', planta_ref: 't@R1', forma: 'area', contorno: [[0, 0], [1, 0], [1, 1]] })
    const tirada = linha({ servico_id: 'serv', pavimento_id: 'pav1', planta_ref: 't@R1', forma: 'peca', elemento_id: 'v40', substitui_id: m2.id, cancelado: true })
    const m5 = linha({ relatorio_id: 'rel', pavimento_id: 'pav1', planta_ref: 't@R1', forma: 'ponto', contorno: [[5, 5]] })
    const m6 = linha({ servico_id: 'serv2', pavimento_id: 'pav1', planta_ref: 't@R1', forma: 'peca', elemento_id: 'p12' })
    return montarDados(base({ diario_servicos: [s, s2], relatorios: [r], rel_marcas: [m1, m2, m3, m4, tirada, m5, m6] }))
  }

  it('escreve o local em ordem de pilar e viga, com número em ordem natural, sem a peça tirada', () => {
    const d = dados()
    expect(textoDoLocal(d, d.marcas.get('serv')!)).toBe('3º Pavimento: P2, P12, 1 área')
    expect(textoDoLocal(d, d.marcas.get('rel')!)).toBe('3º Pavimento: 1 ponto')
  })

  it('mapa filtra pelo período e o problema aberto pinta a peça por cima do serviço', () => {
    const d = dados()
    expect(entradasDoMapa(d, '2026-11-06', '2026-11-06').map((e) => e.titulo).sort()).toEqual(['Forma', 'Vazamento'])
    const tudo = entradasDoMapa(d, '', '')
    expect(tudo).toHaveLength(3)
    expect(categoriaDaPeca(tudo.filter((e) => e.marcas.some((m) => m.elemento_id === 'p12')))).toBe('servico_concluido')
    expect(categoriaDaPeca(tudo)).toBe('problema')
    expect(categoriaDaPeca([])).toBeNull()
  })

  it('toque: peça em cheio vence peça menor na folga do dedo; laje só sem pilar nem viga no alcance', () => {
    const q = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    const el = (id: string, tipo: 'P' | 'V' | 'L', poli: Array<[number, number]>) => ({ id, tipo, nome: id, rotulo: [-99, -99, -98, -98] as const, polys: [poli] })
    const pecas = [el('grande', 'P', q(0, 0, 20, 20)), el('pequeno', 'P', q(24, 0, 28, 4)), el('viga', 'V', q(100, 0, 200, 10)), el('laje', 'L', q(0, 30, 300, 300))]
    // bem dentro do pilar grande, com o pequeno dentro da folga: foi este bug que marcou o P407 no lugar do P116
    expect(pecaTocada(pecas, 18, 2, 10)?.id).toBe('grande')
    // fora dos dois, na folga: vale a folga
    expect(pecaTocada(pecas, 30, 2, 5)?.id).toBe('pequeno')
    // em cima da laje, mas perto do pilar: o pilar
    expect(pecaTocada(pecas, 10, 32, 15)?.id).toBe('grande')
    // laje longe de pilar e viga: a laje
    expect(pecaTocada(pecas, 150, 150, 5)?.id).toBe('laje')
    // fora de tudo: nada
    expect(pecaTocada(pecas, 500, 500, 5)).toBeUndefined()
  })

  it('relatório resolvido sai do vermelho', () => {
    const r = linha({ id: 'rel', tipo: 'problema', data: '2026-11-06', titulo: 'Vazamento', itens: [] })
    const m = linha({ relatorio_id: 'rel', pavimento_id: 'pav1', planta_ref: 't@R1', forma: 'ponto', contorno: [[5, 5]] })
    const a = linha({ relatorio_id: 'rel', situacao: 'resolvido' })
    const d = montarDados(base({ relatorios: [r], rel_marcas: [m], relatorio_andamentos: [a] }))
    expect(entradasDoMapa(d, '', '')[0].categoria).toBe('resolvido')
  })
})

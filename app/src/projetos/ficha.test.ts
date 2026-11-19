import { describe, expect, it } from 'vitest'
import type { Linha } from '../nucleo/banco_local'
import type { DadosProjetos } from './dados'
import { COLUNAS_FICHA, fichaCsv, nomeDaFicha, valorCsv } from './ficha'
import { escritorioPorDocumento, situacoes, vigentePorDocumento } from './regras'

let n = 0
function linha(campos: Record<string, unknown>): Linha {
  n++
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    obra_id: 'o',
    usuario_id: 'u',
    dispositivo_id: 'd',
    criado_em_dispositivo: `2026-11-03T10:00:${String(n % 60).padStart(2, '0')}.000Z`,
    apagado: false,
    ...campos,
  }
}

function dados(): DadosProjetos {
  const lo = linha({ documento_id: 'd1', fase: 'LO', numero: '02', obsoleta: false, vista_em: '2026-11-01' })
  const ex = linha({ documento_id: 'd1', fase: 'EX', numero: '05', obsoleta: false, vista_em: '2026-10-01' })
  const e1 = linha({ tipo: 'entrega', empresa_id: 'A', colaborador: 'João', documento_id: 'd1', revisao_id: ex.id, entrega_id: null, data_evento: '2026-10-05', observacao: '=soma' })
  const e2 = linha({ tipo: 'entrega', empresa_id: 'B', colaborador: null, documento_id: 'd1', revisao_id: lo.id, entrega_id: null, data_evento: '2026-11-02', observacao: 'via; motoboy' })
  const dev = linha({ tipo: 'devolucao', empresa_id: 'B', documento_id: 'd1', revisao_id: lo.id, entrega_id: e2.id, data_evento: '2026-11-03', observacao: null })
  const eventos = [e1, e2, dev]
  const vigentes = vigentePorDocumento([lo, ex])
  const sit = situacoes(eventos, vigentes)
  const documentos = [{ id: 'd1', codigo: 'XPT.ES.112.FORPILOTIS', disciplina_sigla: 'ES', disciplina: 'Estrutura', numero: '112', nome_curto: 'FORPILOTIS', titulo: 'PILOTIS', pasta_autodoc: null, link_pasta: null, busca: '' }]
  const empresas = [
    { id: 'A', nome: 'Alfa', contato: null, ativa: true },
    { id: 'B', nome: 'Beta', contato: null, ativa: true },
  ]
  return {
    hoje: '2026-11-04',
    documentos,
    documentoPorId: new Map(documentos.map((d) => [d.id, d])),
    revisoesDe: new Map([['d1', [lo, ex]]]),
    revisaoPorId: new Map([[lo.id, lo], [ex.id, ex]]),
    vigentes,
    novas: [lo],
    empresas,
    empresaPorId: new Map(empresas.map((e) => [e.id, e])),
    eventos,
    situacoes: sit,
    situacoesDe: new Map([['d1', sit]]),
    escritorio: escritorioPorDocumento([]),
  }
}

describe('ficha de cópias em CSV', () => {
  it('começa com BOM, usa ponto e vírgula e tem uma linha por entrega', () => {
    const csv = fichaCsv(dados())
    expect(csv.startsWith('﻿')).toBe(true)
    const linhas = csv.replace('﻿', '').trimEnd().split('\r\n')
    expect(linhas[0]).toBe(COLUNAS_FICHA.join(';'))
    expect(linhas).toHaveLength(3)
  })
  it('entrega aberta em revisão vencida sai como RECOLHER, com a vigente ao lado', () => {
    const csv = fichaCsv(dados())
    const alfa = csv.split('\r\n').find((l) => l.startsWith('05/10/2026;Alfa'))!
    expect(alfa).toBe("05/10/2026;Alfa;João;XPT.ES.112.FORPILOTIS;EX;R05;;RECOLHER;LO R02;'=soma")
  })
  it('entrega devolvida traz a data da devolução e DEVOLVIDO; texto com ponto e vírgula vai entre aspas', () => {
    const csv = fichaCsv(dados())
    const beta = csv.split('\r\n').find((l) => l.startsWith('02/11/2026;Beta'))!
    expect(beta).toBe('02/11/2026;Beta;;XPT.ES.112.FORPILOTIS;LO;R02;03/11/2026;DEVOLVIDO;LO R02;"via; motoboy"')
  })
  it('valores seguros para o Excel', () => {
    expect(valorCsv('+55 48')).toBe("'+55 48")
    expect(valorCsv('a"b')).toBe('"a""b"')
    expect(valorCsv(null)).toBe('')
    expect(valorCsv('linha\nnova')).toBe('"linha\nnova"')
  })
  it('nome do arquivo', () => {
    expect(nomeDaFicha('EXE', '2026-11-04')).toBe('ficha-copias-EXE_2026-11-04.csv')
  })
})

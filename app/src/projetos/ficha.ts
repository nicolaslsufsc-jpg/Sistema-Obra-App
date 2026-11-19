// Ficha de controle de cópias em CSV para o Excel em português (como a ficha v2 do escritório):
// uma linha por entrega, com a devolução e a situação na mesma linha.

import type { DadosProjetos } from './dados'
import { rotulo } from './regras'
import { baixarBlob } from '../nucleo/baixar'

export const COLUNAS_FICHA = [
  'Data entrega', 'Empresa', 'Colaborador', 'Código Autodoc', 'Fase', 'Revisão', 'Data devolução', 'Situação',
  'Revisão vigente', 'Observação',
] as const

function dataBR(data: unknown): string {
  if (!data) return ''
  const [a, m, d] = String(data).slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** Valor seguro para o Excel: aspas quando precisa, apóstrofo antes de fórmula. */
export function valorCsv(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v)
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function fichaCsv(d: DadosProjetos): string {
  const devolucaoDa = new Map<string, (typeof d.eventos)[number]>()
  for (const e of d.eventos) if (e.tipo === 'devolucao' && !e.apagado) devolucaoDa.set(String(e.entrega_id), e)
  const situacaoDe = new Map(d.situacoes.map((s) => [`${s.empresa_id}|${s.documento_id}`, s]))

  const linhas = d.eventos
    .filter((e) => e.tipo === 'entrega' && !e.apagado)
    .map((e) => {
      const doc = d.documentoPorId.get(String(e.documento_id))
      const emp = d.empresaPorId.get(String(e.empresa_id))
      const rev = d.revisaoPorId.get(String(e.revisao_id))
      const dev = devolucaoDa.get(e.id)
      const sit = situacaoDe.get(`${String(e.empresa_id)}|${String(e.documento_id)}`)
      const vigente = d.vigentes.get(String(e.documento_id))
      return {
        ordem: `${emp?.nome ?? ''}|${doc?.codigo ?? ''}|${String(e.data_evento)}`,
        campos: [
          dataBR(e.data_evento),
          emp?.nome ?? String(e.empresa_id),
          e.colaborador ?? '',
          doc?.codigo ?? String(e.documento_id),
          rev ? String(rev.fase) : '',
          rev ? `R${String(rev.numero)}` : '',
          dev ? dataBR(dev.data_evento) : '',
          dev ? 'DEVOLVIDO' : (sit?.situacao ?? ''),
          vigente ? rotulo(vigente) : '',
          [e.observacao, dev?.observacao].filter(Boolean).join(' / '),
        ],
      }
    })
    .sort((a, b) => a.ordem.localeCompare(b.ordem, 'pt-BR'))
  const texto = [COLUNAS_FICHA.map(valorCsv).join(';'), ...linhas.map((l) => l.campos.map(valorCsv).join(';'))].join('\r\n')
  return `﻿${texto}\r\n`
}

export function nomeDaFicha(codigoObra: string, hoje: string): string {
  return `ficha-copias-${codigoObra}_${hoje}.csv`
}

/** Dispara o download de um texto como arquivo (funciona no Chrome do Android e no PC). */
export function baixarTexto(nome: string, texto: string, tipo = 'text/csv;charset=utf-8'): void {
  baixarBlob(nome, new Blob([texto], { type: tipo }))
}

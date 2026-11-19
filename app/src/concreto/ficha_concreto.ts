// Ficha de controle de concreto usinado do dia, montada a partir dos caminhões do dia.
// O app gera as linhas para colar na planilha da obra (a partir da primeira célula da tabela),
// um CSV e uma versão para imprimir. Nenhum modelo de empresa fica no repositório.
// Colunas: Data | fck | Lacre | Nº caminhão | NF | Volume | A/C | Slump | CP |
//   Saída central | Chegada obra | Início descarga | Fim descarga | Observação.
// Lacre e A/C não são registrados no app (ficam vazios, como no lançamento manual).

import { ROTULO_EXEMPLO } from './exemplo'

export interface ConcretagemDaFicha {
  raiz: string
  data: string
  pavimento_id: string
  local_descricao: string
  codigo_construpoint: string | null
  fornecedor: string | null
  fck_mpa: number
  slump_cm: number | null
  slump_tolerancia_cm: number | null
  criado_em_dispositivo: string
  /** concretagem de exemplo da apresentação (exemplo.ts): toda linha dela sai com EXEMPLO */
  exemplo?: boolean
}

export interface CaminhaoDaFicha {
  sequencia: number
  nota_fiscal: string | null
  volume_m3: number | null
  saida_usina: string | null
  chegada_obra: string | null
  inicio_descarga: string | null
  fim_descarga: string | null
  slump_medido_cm: number | null
  agua_adicionada_l: number | null
  cps_moldados: number | null
  observacao: string | null
}

export interface LinhaDaFicha {
  concretagemRaiz: string
  data: string
  fck: number
  lacre: ''
  caminhao: number
  nf: string
  volume: number | null
  ac: ''
  slump: number | null
  cps: number | null
  saida: string
  chegada: string
  inicio: string
  fim: string
  observacao: string
}

export interface FichaDoDia {
  cabecalho: { obra: string; fornecedor: string; data: string; fck: string; brita: string; slump: string }
  linhas: LinhaDaFicha[]
  volumeTotal: number
  avisos: string[]
}

export const COLUNAS_FICHA = [
  'Data', 'fck', 'Lacre', 'Caminhão', 'NF', 'Volume (m³)', 'A/C', 'Slump', 'CP',
  'Saída central', 'Chegada obra', 'Início descarga', 'Fim descarga', 'Observação',
] as const

const dataBR = (d: string) => d.slice(0, 10).split('-').reverse().join('/')
const numBR = (v: number | null) => (v === null || Number.isNaN(v) ? '' : String(v).replace('.', ','))

/** HH:MM no fuso do aparelho (o formulário grava a hora digitada no dia da concretagem). */
export function horaCurta(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function unicos<T>(lista: readonly T[]): T[] {
  return [...new Set(lista)]
}

/** Hora do primeiro caminhão (chegada, senão saída, senão início), para ordenar as concretagens do dia. */
function primeiraHora(cams: readonly CaminhaoDaFicha[]): string | null {
  const horas = cams.map((c) => c.chegada_obra ?? c.saida_usina ?? c.inicio_descarga).filter((h): h is string => !!h)
  return horas.length ? horas.sort()[0] : null
}

export function fichaDoDia(o: {
  obra: { codigo: string; nome: string }
  data: string
  concretagens: readonly ConcretagemDaFicha[]
  caminhoesDe: ReadonlyMap<string, readonly CaminhaoDaFicha[]>
  pavimentos: ReadonlyMap<string, string>
}): FichaDoDia {
  const doDia = o.concretagens
    .filter((c) => c.data === o.data)
    .map((c) => ({ c, cams: [...(o.caminhoesDe.get(c.raiz) ?? [])].sort((a, b) => a.sequencia - b.sequencia) }))
    .sort((a, b) => {
      const ha = primeiraHora(a.cams)
      const hb = primeiraHora(b.cams)
      if (ha && hb && ha !== hb) return ha < hb ? -1 : 1
      if (ha && !hb) return -1
      if (!ha && hb) return 1
      return a.c.criado_em_dispositivo.localeCompare(b.c.criado_em_dispositivo)
    })

  const linhas: LinhaDaFicha[] = []
  const avisos: string[] = []
  for (const { c, cams } of doDia) {
    const identificacao = [o.pavimentos.get(c.pavimento_id), c.local_descricao, c.codigo_construpoint].filter((t) => !!t).join(' · ')
    cams.forEach((x, i) => {
      const obs = [
        c.exemplo ? ROTULO_EXEMPLO : '',
        i === 0 ? identificacao : '',
        x.agua_adicionada_l !== null && x.agua_adicionada_l > 0 ? `Água: ${numBR(x.agua_adicionada_l)} L` : '',
        x.observacao?.trim() ?? '',
      ].filter((t) => t !== '')
      linhas.push({
        concretagemRaiz: c.raiz,
        data: dataBR(c.data),
        fck: c.fck_mpa,
        lacre: '',
        caminhao: x.sequencia,
        nf: x.nota_fiscal ?? '',
        volume: x.volume_m3,
        ac: '',
        slump: x.slump_medido_cm,
        cps: x.cps_moldados,
        saida: horaCurta(x.saida_usina),
        chegada: horaCurta(x.chegada_obra),
        inicio: horaCurta(x.inicio_descarga),
        fim: horaCurta(x.fim_descarga),
        observacao: obs.join(' · '),
      })
    })
  }

  const fcks = unicos(doDia.map((d) => d.c.fck_mpa))
  const fornecedores = unicos(doDia.map((d) => d.c.fornecedor?.trim() ?? '').filter((f) => f !== ''))
  const slumps = unicos(
    doDia
      .filter((d) => d.c.slump_cm !== null)
      .map((d) => `${numBR(d.c.slump_cm)}${d.c.slump_tolerancia_cm !== null ? ` ± ${numBR(d.c.slump_tolerancia_cm)}` : ''}`),
  )
  if (fcks.length > 1) avisos.push(`As concretagens do dia têm fck diferente (${fcks.join(' e ')} MPa): confira o cabeçalho.`)
  if (fornecedores.length > 1) avisos.push(`As concretagens do dia têm fornecedor diferente (${fornecedores.join(' e ')}): confira o cabeçalho.`)
  if (slumps.length > 1) avisos.push(`As concretagens do dia têm slump diferente (${slumps.join(' e ')} cm): confira o cabeçalho.`)
  if (doDia.length > 0 && linhas.length === 0) avisos.push('Nenhum caminhão registrado nas concretagens deste dia.')
  if (doDia.some((d) => d.c.exemplo)) avisos.push(`Este dia tem a concretagem de ${ROTULO_EXEMPLO} da apresentação (não é real): não copie as linhas dela para a ficha da obra.`)
  if (linhas.some((l) => !l.nf)) avisos.push('Há caminhão sem nota fiscal.')
  if (linhas.some((l) => l.volume === null)) avisos.push('Há caminhão sem volume.')

  return {
    cabecalho: {
      obra: [o.obra.codigo, o.obra.nome].filter((t) => !!t).join(' · '),
      fornecedor: fornecedores.join(' / '),
      data: dataBR(o.data),
      fck: fcks.map(String).join(' / '),
      brita: '',
      slump: slumps.join(' / '),
    },
    linhas,
    volumeTotal: Math.round(linhas.reduce((s, l) => s + (l.volume ?? 0), 0) * 100) / 100,
    avisos,
  }
}

function celulas(l: LinhaDaFicha): string[] {
  return [
    l.data,
    String(l.fck),
    l.lacre,
    String(l.caminhao),
    l.nf,
    numBR(l.volume),
    l.ac,
    numBR(l.slump),
    l.cps === null ? '' : String(l.cps),
    l.saida,
    l.chegada,
    l.inicio,
    l.fim,
    l.observacao,
  ]
}

function celulaCsv(t: string): string {
  let s = t
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  if (/[;"\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

function celulaTab(t: string): string {
  return t.replace(/[\t\r\n]+/g, ' ')
}

/** Só as linhas dos caminhões, separadas por tabulação: colar na primeira célula da tabela da planilha. */
export function linhasParaExcel(f: FichaDoDia): string {
  return f.linhas.map((l) => celulas(l).map(celulaTab).join('\t')).join('\r\n')
}

/** Arquivo completo (cabeçalho da ficha + colunas), para quem não tem a planilha à mão. */
export function csvDoDia(f: FichaDoDia): string {
  const c = f.cabecalho
  const saida: string[][] = [
    ['Controle de concreto usinado'],
    ['Obra', c.obra],
    ['Fornecedor', c.fornecedor],
    ['Data', c.data],
    ['fck (MPa)', c.fck],
    ['Brita', c.brita],
    ['Slump (cm)', c.slump],
    [],
    [...COLUNAS_FICHA],
    ...f.linhas.map(celulas),
  ]
  return '﻿' + saida.map((l) => l.map(celulaCsv).join(';')).join('\r\n') + '\r\n'
}

/** Dias (AAAA-MM-DD) com concretagem, do mais recente ao mais antigo. */
export function diasComConcretagem(concretagens: readonly { data: string }[]): string[] {
  return unicos(concretagens.map((c) => c.data)).sort((a, b) => b.localeCompare(a))
}

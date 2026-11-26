// Ficha de entrega no formato do formulário da obra (23/11/2026, pedido do Nicolas: "o relatório de entrega
// tem que ser no formato do formulário" da empresa, só na obra que tem esse formulário).
//
// O modelo é DADO da obra, nunca código: título, código e datas do formulário, setores, disciplinas com
// as siglas que marcam cada caixa e o logo (imagem pequena em data URL). Vem da tabela projetos_formularios
// (linha mais nova da obra com tipo 'entrega'); obra sem modelo continua com o comprovante de sempre.
// Aqui ficam só as contas, puras; o desenho da folha está em telas/FichaEntrega.tsx.
import type { Linha } from '../nucleo/banco_local'
import type { DadosProjetos } from './dados'
import { normalizar } from './regras'

import { TABELAS_PROJETOS_FORMULARIOS } from './tabelas'

export const TABELA_FORMULARIOS = TABELAS_PROJETOS_FORMULARIOS[0]

export interface DisciplinaDaFicha {
  /** como está impresso na caixa: "Estrutural" */
  nome: string
  /** siglas de disciplina dos códigos das pranchas que marcam esta caixa: ["ES"] */
  siglas: string[]
  /** a caixa "Outros": marca o que não cai em nenhuma outra e escreve o nome na linha dela */
  outros?: boolean
}

export interface ModeloFichaEntrega {
  /** linhas do título no meio do cabeçalho */
  titulo: string[]
  /** "Referência / Arquivo" */
  referencia: string
  emissao: string
  revisao: string
  versao: string
  tipo: string
  setores: string
  /** imagem do logo (data:image/png;base64,...); sem ela, a caixa fica com o nome da empresa */
  logo?: string
  empresa?: string
  disciplinas: DisciplinaDaFicha[]
  /** linhas da tabela em cada página (o formulário impresso tem 15) */
  linhas_por_pagina: number
}

const texto = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Confere o modelo vindo do servidor (ou do pacote). Formato errado = null (vale o comprovante de sempre). */
export function lerModelo(v: unknown): ModeloFichaEntrega | null {
  if (!v || typeof v !== 'object') return null
  const m = v as Record<string, unknown>
  const titulo = Array.isArray(m.titulo) ? m.titulo.map((t) => texto(t)).filter(Boolean).slice(0, 4) : []
  const disciplinas = Array.isArray(m.disciplinas)
    ? m.disciplinas.flatMap((x) => {
        const d = (x ?? {}) as Record<string, unknown>
        const nome = texto(d.nome, 60)
        if (!nome) return []
        const siglas = Array.isArray(d.siglas) ? d.siglas.map((s) => texto(s, 10).toUpperCase()).filter(Boolean) : []
        return [{ nome, siglas, ...(d.outros === true ? { outros: true } : {}) }]
      })
    : []
  if (titulo.length === 0 || disciplinas.length === 0) return null
  const logo = texto(m.logo, 600_000)
  const n = Number(m.linhas_por_pagina)
  return {
    titulo,
    referencia: texto(m.referencia, 40),
    emissao: texto(m.emissao, 20),
    revisao: texto(m.revisao, 20),
    versao: texto(m.versao, 10),
    tipo: texto(m.tipo, 60),
    setores: texto(m.setores, 120),
    ...(logo.startsWith('data:image/') ? { logo } : {}),
    ...(texto(m.empresa, 120) ? { empresa: texto(m.empresa, 120) } : {}),
    disciplinas,
    linhas_por_pagina: Number.isInteger(n) && n >= 5 && n <= 40 ? n : 15,
  }
}

/** O modelo que vale na obra: a linha mais nova de tipo 'entrega' (só inclusão, como a fvs_regras). */
export function modeloDasLinhas(linhas: readonly Linha[]): ModeloFichaEntrega | null {
  const quando = (l: Linha) => String(l.criado_em_servidor ?? l.criado_em_dispositivo ?? '')
  const daEntrega = linhas.filter((l) => !l.apagado && (l.tipo ?? 'entrega') === 'entrega').sort((a, b) => quando(b).localeCompare(quando(a)))
  for (const l of daEntrega) {
    const m = lerModelo(l.modelo)
    if (m) return m
  }
  return null
}

export interface LinhaDaFicha {
  codigo: string
  descricao: string
  versao: string
  copias: number
  data: string
  empreiteira: string
  nome: string
}

const dataBR = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : iso)

/**
 * Uma linha por prancha entregue: as N cópias da mesma prancha e revisão (N registros com a mesma
 * assinatura) viram uma linha com "Nº de cópias" = N. Na ordem em que foram registradas.
 */
export function linhasDaFicha(d: Pick<DadosProjetos, 'documentoPorId' | 'revisaoPorId' | 'empresaPorId'>, eventos: readonly Linha[]): LinhaDaFicha[] {
  const m = new Map<string, LinhaDaFicha>()
  for (const e of eventos) {
    const k = `${String(e.documento_id)}|${String(e.revisao_id)}|${String(e.empresa_id)}|${normalizar(String(e.colaborador ?? ''))}|${String(e.data_evento)}`
    const ja = m.get(k)
    if (ja) {
      ja.copias++
      continue
    }
    const doc = d.documentoPorId.get(String(e.documento_id))
    const rev = d.revisaoPorId.get(String(e.revisao_id))
    m.set(k, {
      codigo: doc?.codigo ?? '',
      descricao: doc?.titulo ?? '',
      versao: rev ? `${String(rev.fase ?? '')} R${String(rev.numero ?? '')}`.trim() : '',
      copias: 1,
      data: dataBR(String(e.data_evento ?? '')),
      empreiteira: d.empresaPorId.get(String(e.empresa_id))?.nome ?? '',
      nome: String(e.colaborador ?? '').trim(),
    })
  }
  return [...m.values()]
}

/**
 * Quais caixas de disciplina ficam marcadas, pela sigla do código das pranchas entregues.
 * O que não cai em nenhuma caixa marca "Outros" (se o modelo tiver), com o nome da disciplina escrito.
 */
export function disciplinasDaFicha(
  modelo: Pick<ModeloFichaEntrega, 'disciplinas'>,
  pranchas: readonly { disciplina_sigla: string; disciplina: string }[],
): { marcadas: Set<string>; outros: string[] } {
  const marcadas = new Set<string>()
  const outros: string[] = []
  const caixaOutros = modelo.disciplinas.find((x) => x.outros)
  for (const p of pranchas) {
    const sigla = p.disciplina_sigla.toUpperCase()
    const caixa = modelo.disciplinas.find((x) => !x.outros && x.siglas.includes(sigla))
    if (caixa) marcadas.add(caixa.nome)
    else if (caixaOutros) {
      marcadas.add(caixaOutros.nome)
      const nome = p.disciplina || sigla
      if (nome && !outros.includes(nome)) outros.push(nome)
    }
  }
  return { marcadas, outros }
}

/** Divide as linhas em páginas e completa a última com linhas em branco (como o formulário impresso). */
export function paginasDaFicha<T>(linhas: readonly T[], porPagina: number): (T | null)[][] {
  const paginas: (T | null)[][] = []
  for (let i = 0; i < Math.max(linhas.length, 1); i += porPagina) paginas.push(linhas.slice(i, i + porPagina))
  const ultima = paginas[paginas.length - 1]
  while (ultima.length < porPagina) ultima.push(null)
  return paginas
}

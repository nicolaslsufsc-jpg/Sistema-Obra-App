// Painel das cópias em campo (Projetos, 14/11/2026).
//
// Entrada: dois CSV que a pessoa importa no app (dados da obra, nunca no repositório):
//  - lista vigente: uma linha por faixa de pranchas (disciplina, numero_de, numero_ate, codigo_exemplo,
//    revisao, data, status, titulo, pasta). A fase (LO, EX...) sai do código: OBRA.LL.FASE.NNN.NOME.
//  - distribuição (ficha de cópias entregues): codigo, revisao ("R02" ou "R02 LO"), titulo, disciplina,
//    copias, entrega, empresa, colaborador, devolucao.
//
// Regras decididas pelo Nicolas em 14/11/2026 (docs/modulos/2_projetos.md):
//  1. Revisão sem fase vale como EX. A LO tem revisão própria: cópia EX com o mesmo número da LO vigente
//     é DESATUALIZADA.
//  2. Chave da prancha: disciplina + número sem os zeros da frente ("4" = "004").
//  3. Data de entrega com erro (ano com 3 dígitos) vai para conferir, sem adivinhar.
//  4. Mesma empresa com 2+ cópias da mesma prancha em campo: fica só a mais nova (maior revisão; no empate,
//     entrega mais recente). As outras são "provavelmente recolhida" e não pesam no painel.
//  5. Atraso = hoje − data da revisão vigente. Sem prazo fixo.
//  6. Cópia que já diz LO, mas o Autodoc tem a mesma LO com data bem depois da entrega: conferir.
//  7. Número com mais de uma folha (privativas x gerais, cortes x fachadas): escolhe pela semelhança do
//     título; sem como decidir, conferir.

export type Fase = 'LO' | 'EX' | string

export interface Vigente {
  disciplina: string
  pasta: string
  de: string
  ate: string
  codigo: string
  fase: Fase
  revisao: number
  data: string // AAAA-MM-DD
  status: string
  titulo: string
}

export interface Copia {
  linha: number
  codigo: string
  revisao: number | null
  fase: Fase
  revisaoTexto: string
  titulo: string
  disciplina: string
  /** a disciplina como veio na planilha (com acento), para mostrar */
  disciplinaNome: string
  copias: number
  entrega: string | null // AAAA-MM-DD, ou null se a data está errada
  entregaTexto: string
  empresa: string
  colaborador: string
  devolucao: string | null
}

export type Resultado = 'em dia' | 'desatualizada' | 'conferir'

export type MotivoConferir = 'não achada' | 'revisão maior' | 'datas' | 'mais de uma folha' | 'data de entrega' | 'revisão ilegível'

export interface CopiaCruzada {
  copia: Copia
  /** em campo = sem devolução; recolhida = "provavelmente recolhida" (regra 4) */
  situacao: 'em campo' | 'devolvida' | 'recolhida'
  resultado: Resultado
  motivo?: MotivoConferir
  vigente?: Vigente
  /** dias desde a data da revisão vigente (só desatualizada) */
  dias?: number
  /** a cópia é EX e a vigente é LO com o mesmo número */
  loDepois?: boolean
}

// ---------------------------------------------------------------------------------------------
// Leitura dos CSV
// ---------------------------------------------------------------------------------------------

/** Lê um CSV com ";" ou "," (o que aparecer mais na primeira linha), aspas e BOM. */
export function lerCsv(texto: string): Record<string, string>[] {
  const t = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const primeira = t.slice(0, t.indexOf('\n') === -1 ? t.length : t.indexOf('\n'))
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : ','
  const linhas: string[][] = []
  let campo = ''
  let linha: string[] = []
  let aspas = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === sep) {
      linha.push(campo)
      campo = ''
    } else if (c === '\n') {
      linha.push(campo)
      linhas.push(linha)
      linha = []
      campo = ''
    } else campo += c
  }
  if (campo !== '' || linha.length) {
    linha.push(campo)
    linhas.push(linha)
  }
  const [cab, ...resto] = linhas.filter((l) => l.some((c) => c.trim() !== ''))
  if (!cab) return []
  const nomes = cab.map((c) => normalizar(c).toLowerCase().replace(/\s+/g, '_'))
  return resto.map((l) => Object.fromEntries(nomes.map((n, i) => [n, (l[i] ?? '').trim()])))
}

export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
}

/** Chave do número: sem zeros da frente se for só dígito ("004" → "4"); senão, o texto em maiúsculas. */
export function chaveNumero(n: string): string {
  const s = n.trim().toUpperCase()
  return /^\d+$/.test(s) ? String(Number(s)) : s
}

/** "R02" → 2; "R02 LO" → 2; ilegível → null. */
export function lerRevisao(texto: string): { numero: number | null; fase: Fase } {
  const s = normalizar(texto)
  const m = s.match(/R\s*(\d+)/)
  const fase = /\bLO\b/.test(s) ? 'LO' : 'EX'
  return { numero: m ? Number(m[1]) : null, fase }
}

/** AAAA-MM-DD ou DD/MM/AAAA → AAAA-MM-DD; ano que não tem 4 dígitos → null (regra 3). */
export function lerData(texto: string): string | null {
  const s = texto.trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d+)/)
  if (m && m[3].length === 4) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

const COLUNAS_VIGENTES = ['disciplina', 'numero_de', 'numero_ate', 'codigo_exemplo', 'revisao', 'data']
const COLUNAS_DISTRIBUICAO = ['codigo', 'revisao', 'disciplina', 'entrega', 'empresa', 'devolucao']

export class ErroDeArquivo extends Error {}

function conferirColunas(linhas: Record<string, string>[], exigidas: string[], qual: string) {
  const tem = new Set(Object.keys(linhas[0] ?? {}))
  const faltam = exigidas.filter((c) => !tem.has(c))
  if (linhas.length === 0) throw new ErroDeArquivo(`O arquivo da ${qual} está vazio.`)
  if (faltam.length) throw new ErroDeArquivo(`O arquivo da ${qual} não tem as colunas: ${faltam.join(', ')}.`)
}

export function lerVigentes(texto: string): Vigente[] {
  const linhas = lerCsv(texto)
  conferirColunas(linhas, COLUNAS_VIGENTES, 'lista vigente')
  return linhas
    .filter((l) => l.disciplina && normalizar(l.disciplina) !== 'DISCIPLINA')
    .map((l) => {
      const partes = l.codigo_exemplo.split('.')
      return {
        disciplina: normalizar(l.disciplina),
        pasta: l.pasta ?? '',
        de: chaveNumero(l.numero_de),
        ate: chaveNumero(l.numero_ate || l.numero_de),
        codigo: l.codigo_exemplo,
        fase: partes.length >= 4 ? partes[2].toUpperCase() : 'EX',
        revisao: lerRevisao(l.revisao).numero ?? 0,
        data: lerData(l.data) ?? '',
        status: l.status ?? '',
        titulo: l.titulo ?? '',
      }
    })
}

export function lerDistribuicao(texto: string): Copia[] {
  const linhas = lerCsv(texto)
  conferirColunas(linhas, COLUNAS_DISTRIBUICAO, 'distribuição')
  const copias: Copia[] = []
  linhas.forEach((l, i) => {
    const disc = normalizar(l.disciplina)
    // linhas de cabeçalho repetidas no meio da planilha (regra 3 da proposta)
    if (!disc || disc === 'DISCIPLINA' || normalizar(l.empresa) === 'EMPRESA' || !l.codigo) return
    if (!/\d|[A-Z]/i.test(l.codigo) || normalizar(l.codigo).startsWith('CODIGO')) return
    const r = lerRevisao(l.revisao)
    copias.push({
      linha: Number(l.linha) || i + 2,
      codigo: chaveNumero(l.codigo),
      revisao: r.numero,
      fase: r.fase,
      revisaoTexto: l.revisao,
      titulo: l.titulo ?? '',
      disciplina: disc,
      disciplinaNome: l.disciplina.trim(),
      copias: Number(l.copias) || 1,
      entrega: lerData(l.entrega),
      entregaTexto: l.entrega,
      empresa: l.empresa.trim(),
      colaborador: (l.colaborador ?? '').trim(),
      devolucao: l.devolucao?.trim() ? lerData(l.devolucao) ?? l.devolucao.trim() : null,
    })
  })
  return copias
}

// ---------------------------------------------------------------------------------------------
// Cruzamento
// ---------------------------------------------------------------------------------------------

function dentro(v: Vigente, numero: string): boolean {
  if (v.de === numero || v.ate === numero) return true
  const n = Number(numero)
  const de = Number(v.de)
  const ate = Number(v.ate)
  return Number.isFinite(n) && Number.isFinite(de) && Number.isFinite(ate) && /^\d+$/.test(numero) && n >= de && n <= ate
}

function palavras(s: string): Set<string> {
  return new Set(
    normalizar(s)
      .split(/[^A-Z0-9]+/)
      .filter((p) => p.length >= 3),
  )
}

/** Palavras em comum entre o título da cópia e o da folha (o que está entre parênteses na lista é nota, não título). */
function semelhanca(a: string, b: string): number {
  b = b.replace(/\([^)]*\)/g, ' ')
  const pa = palavras(a)
  let n = 0
  for (const p of palavras(b)) if (pa.has(p)) n++
  return n
}

const FASE_RANK: Record<string, number> = { LO: 2, EX: 1 }
const rankFase = (f: Fase) => FASE_RANK[f] ?? 0

/** Qual linha da lista vigente vale para a cópia. `undefined` = não achada; `null` = não dá para decidir. */
export function acharVigente(c: Copia, vigentes: readonly Vigente[]): Vigente | null | undefined {
  const cand = vigentes.filter((v) => v.disciplina === c.disciplina && dentro(v, c.codigo))
  if (cand.length === 0) return undefined
  // mesma faixa listada nas duas fases: vale a de fase mais forte (LO > EX), depois o maior número
  const distintas = new Map<string, Vigente>()
  for (const v of cand) distintas.set(`${v.titulo}|${v.de}|${v.ate}`, v)
  const unicas = [...distintas.values()]
  if (unicas.length === 1) return melhor(cand)
  // mais de uma folha com o mesmo número: escolhe pelo título (regra 7). Mesmo quando as folhas têm
  // a mesma revisão e data, a folha certa importa: é ela que separa as cópias no grupo das recolhidas.
  const notas = unicas.map((v) => ({ v, n: semelhanca(c.titulo, v.titulo) }))
  const topo = Math.max(...notas.map((x) => x.n))
  const vencedoras = notas.filter((x) => x.n === topo).map((x) => x.v)
  if (topo > 0 && vencedoras.length === 1) return melhor(cand.filter((v) => v.titulo === vencedoras[0].titulo && v.de === vencedoras[0].de && v.ate === vencedoras[0].ate))
  // o título não decide, mas todas as folhas dizem a mesma revisão e data: o resultado é o mesmo
  if (new Set(unicas.map((v) => `${v.fase}${v.revisao}${v.data}`)).size === 1) return melhor(cand)
  if (topo > 0 && new Set(vencedoras.map((v) => `${v.fase}${v.revisao}`)).size === 1) return melhor(vencedoras)
  // o título não decide: se só uma das folhas tem a revisão da cópia, é ela
  const mesmaRev = (topo > 0 ? vencedoras : unicas).filter((v) => v.revisao === c.revisao)
  if (mesmaRev.length >= 1 && new Set(mesmaRev.map((v) => `${v.fase}${v.revisao}`)).size === 1) return melhor(mesmaRev)
  return null
}

/** Entre linhas da mesma folha, a que vale: LO antes de EX, depois a maior revisão e a data mais nova. */
export function melhor(vs: readonly Vigente[]): Vigente {
  return [...vs].sort((a, b) => rankFase(b.fase) - rankFase(a.fase) || b.revisao - a.revisao || b.data.localeCompare(a.data))[0]
}

export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000)
}

/** Diferença, em dias, a partir da qual a LO "saiu bem depois" da entrega de uma cópia que já diz LO. */
export const LO_BEM_DEPOIS_DIAS = 15

export function compararCopia(c: Copia, v: Vigente | null | undefined, hoje: string): Pick<CopiaCruzada, 'resultado' | 'motivo' | 'vigente' | 'dias' | 'loDepois'> {
  if (v === undefined) return { resultado: 'conferir', motivo: 'não achada' }
  if (v === null) return { resultado: 'conferir', motivo: 'mais de uma folha' }
  if (c.revisao === null) return { resultado: 'conferir', motivo: 'revisão ilegível', vigente: v }
  if (!c.entrega) return { resultado: 'conferir', motivo: 'data de entrega', vigente: v }
  const dias = v.data ? Math.max(0, diasEntre(v.data, hoje)) : undefined
  if (c.revisao > v.revisao) return { resultado: 'conferir', motivo: 'revisão maior', vigente: v }
  if (c.revisao < v.revisao) return { resultado: 'desatualizada', vigente: v, dias }
  // mesmo número
  // cópia sem "LO" com o mesmo número da LO vigente: só está desatualizada se a LO saiu depois da entrega
  // (entregue depois da LO, a cópia já é a LO, só não foi anotada assim)
  if (v.fase === 'LO' && c.fase !== 'LO') {
    return v.data && v.data > c.entrega ? { resultado: 'desatualizada', vigente: v, dias, loDepois: true } : { resultado: 'em dia', vigente: v }
  }
  if (v.fase === 'LO' && c.fase === 'LO' && v.data && diasEntre(c.entrega, v.data) > LO_BEM_DEPOIS_DIAS) {
    return { resultado: 'conferir', motivo: 'datas', vigente: v }
  }
  return { resultado: 'em dia', vigente: v }
}

/** Cruza tudo. As devolvidas entram com situação "devolvida" e não pesam no painel. */
export function cruzar(copias: readonly Copia[], vigentes: readonly Vigente[], hoje: string): CopiaCruzada[] {
  const saida: CopiaCruzada[] = copias.map((c) => {
    const v = acharVigente(c, vigentes)
    return { copia: c, situacao: c.devolucao ? 'devolvida' : 'em campo', ...compararCopia(c, v, hoje) }
  })
  // regra 4: mesma empresa + prancha + folha com 2 ou mais em campo → fica só a mais nova.
  // Grupo: disciplina + número sem zeros + empresa + folha do Autodoc (o código da vigente achada).
  // Desempate (igual à conta do Professor, 14/11): maior revisão; no empate, a entrega mais recente.
  const grupos = new Map<string, CopiaCruzada[]>()
  for (const x of saida) {
    if (x.situacao !== 'em campo') continue
    const k = `${x.copia.disciplina}|${chaveNumero(x.copia.codigo)}|${normalizar(x.copia.empresa)}|${x.vigente?.codigo ?? ''}`
    const g = grupos.get(k)
    if (g) g.push(x)
    else grupos.set(k, [x])
  }
  for (const g of grupos.values()) {
    if (g.length < 2) continue
    g.sort(
      (a, b) =>
        (b.copia.revisao ?? -1) - (a.copia.revisao ?? -1) ||
        (b.copia.entrega ?? '').localeCompare(a.copia.entrega ?? '') ||
        a.copia.linha - b.copia.linha,
    )
    for (const x of g.slice(1)) x.situacao = 'recolhida'
  }
  return saida
}

// ---------------------------------------------------------------------------------------------
// Resumo para o painel
// ---------------------------------------------------------------------------------------------

export const FAIXAS = [
  { rotulo: 'até 15 dias', ate: 15 },
  { rotulo: '16 a 30', ate: 30 },
  { rotulo: '31 a 60', ate: 60 },
  { rotulo: 'mais de 60', ate: Infinity },
] as const

export interface Barra {
  nome: string
  quantas: number
  maiorAtraso: number
}

export interface Resumo {
  emCampo: number
  emDia: number
  desatualizadas: CopiaCruzada[]
  conferir: CopiaCruzada[]
  recolhidas: number
  faixas: number[]
  porEmpresa: Barra[]
  porDisciplina: Barra[]
}

function barras(itens: readonly CopiaCruzada[], chave: (x: CopiaCruzada) => string): Barra[] {
  const m = new Map<string, Barra>()
  for (const x of itens) {
    const k = chave(x)
    const b = m.get(k) ?? { nome: k, quantas: 0, maiorAtraso: 0 }
    b.quantas++
    b.maiorAtraso = Math.max(b.maiorAtraso, x.dias ?? 0)
    m.set(k, b)
  }
  return [...m.values()].sort((a, b) => b.quantas - a.quantas || b.maiorAtraso - a.maiorAtraso || a.nome.localeCompare(b.nome, 'pt-BR'))
}

export function resumir(cruzadas: readonly CopiaCruzada[]): Resumo {
  const campo = cruzadas.filter((x) => x.situacao === 'em campo')
  const desatualizadas = campo
    .filter((x) => x.resultado === 'desatualizada')
    .sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0) || a.copia.disciplina.localeCompare(b.copia.disciplina) || a.copia.linha - b.copia.linha)
  const faixas = FAIXAS.map(() => 0)
  for (const x of desatualizadas) faixas[FAIXAS.findIndex((f) => (x.dias ?? 0) <= f.ate)]++
  return {
    emCampo: campo.length,
    emDia: campo.filter((x) => x.resultado === 'em dia').length,
    desatualizadas,
    conferir: campo.filter((x) => x.resultado === 'conferir'),
    recolhidas: cruzadas.filter((x) => x.situacao === 'recolhida').length,
    faixas,
    porEmpresa: barras(desatualizadas, (x) => x.copia.empresa || '(sem empresa)'),
    porDisciplina: barras(desatualizadas, (x) => x.copia.disciplinaNome || x.copia.disciplina),
  }
}

/** "LO R02", "R00" (EX não aparece, como na planilha). */
export function rotuloRev(fase: Fase, numero: number | null): string {
  const r = numero === null ? '?' : `R${String(numero).padStart(2, '0')}`
  return fase === 'EX' ? r : `${fase} ${r}`
}

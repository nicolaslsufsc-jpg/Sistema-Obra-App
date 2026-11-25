// Regras do módulo Relatórios, sem nada de banco nem de tela (testadas em relatorios.test.ts).
//
// O diário de um dia é o conjunto dos registros com aquela data: não existe linha "dia".
// Correção e apagamento seguem o Concreto (substitui_id, cancelado, vigentes).

import type { Linha } from '../nucleo/banco_local'
import { pecaNoPonto } from '../concreto/pecas'
import type { ElementoPlanta } from '../concreto/planta'
import { ultimoPorChave, vigentes, type Corrigivel, type Vigente } from '../concreto/vigentes'
import { tipoRelatorio } from './tipos'

/** Colunas do módulo copiadas numa correção. O teste confere cada uma com a migração. */
export const COLUNAS = {
  diario_efetivo: ['data', 'empresa', 'funcao', 'quantidade', 'observacao'],
  diario_equipamentos: ['data', 'nome', 'quantidade', 'situacao', 'observacao'],
  diario_materiais: ['data', 'material', 'quantidade', 'unidade', 'fornecedor', 'nota_fiscal', 'observacao'],
  diario_servicos: ['data', 'descricao', 'empresa', 'situacao', 'avanco_pct', 'local_texto', 'observacao'],
  diario_ocorrencias: ['data', 'tipo', 'descricao', 'horas_paradas', 'local_texto'],
  relatorios: ['tipo', 'data', 'titulo', 'descricao', 'gravidade', 'responsavel', 'prazo', 'local_texto', 'itens'],
  rel_marcas: ['servico_id', 'ocorrencia_id', 'relatorio_id', 'foto_id', 'pavimento_id', 'planta_ref', 'forma', 'elemento_id', 'contorno'],
  rel_fotos: ['data', 'servico_id', 'ocorrencia_id', 'relatorio_id', 'arquivo_id', 'legenda'],
} as const

export type TabelaCorrigivel = keyof typeof COLUNAS

/** Linha vigente de uma tabela corrigível. */
export type Registro = Vigente<Corrigivel>

export interface ItemRelatorio {
  item: string
  resultado: 'ok' | 'atencao' | 'ruim' | null
}

export type Relatorio = Registro & {
  tipo: string
  data: string
  titulo: string
  descricao: string | null
  gravidade: 'baixa' | 'media' | 'alta' | null
  responsavel: string | null
  prazo: string | null
  local_texto: string | null
  itens: ItemRelatorio[]
}

export type Marca = Registro & {
  servico_id: string | null
  ocorrencia_id: string | null
  relatorio_id: string | null
  /** onde a foto foi tirada (migração 20261107200000) */
  foto_id?: string | null
  pavimento_id: string
  planta_ref: string | null
  forma: 'peca' | 'area' | 'ponto'
  elemento_id: string | null
  contorno: Array<[number, number]> | null
}

export type Foto = Registro & {
  data: string
  servico_id: string | null
  ocorrencia_id: string | null
  relatorio_id: string | null
  arquivo_id: string
  legenda: string | null
}

/** A que uma marca ou foto pertence. `raiz` = primeira versão do registro. A foto só tem marca. */
export interface Alvo {
  tipo: 'servico' | 'ocorrencia' | 'relatorio' | 'foto'
  raiz: string
}

export function campoDoAlvo(alvo: Alvo): Record<string, string> {
  return { [`${alvo.tipo}_id`]: alvo.raiz }
}

export function alvoDe(l: { servico_id?: unknown; ocorrencia_id?: unknown; relatorio_id?: unknown; foto_id?: unknown }): Alvo | null {
  if (l.servico_id) return { tipo: 'servico', raiz: String(l.servico_id) }
  if (l.ocorrencia_id) return { tipo: 'ocorrencia', raiz: String(l.ocorrencia_id) }
  if (l.relatorio_id) return { tipo: 'relatorio', raiz: String(l.relatorio_id) }
  if (l.foto_id) return { tipo: 'foto', raiz: String(l.foto_id) }
  return null
}

/** Ocorrência que é o relato do dia (texto corrido), e não um evento. */
export const TIPO_RELATO = 'relato'
export const ehRelato = (l: Record<string, unknown>) => l.tipo === TIPO_RELATO

/** A foto pela raiz, em qualquer lista (do dia ou de um registro). */
export function fotoDaRaiz(d: Pick<DadosRelatorios, 'fotosDoDia' | 'fotosDoAlvo'>, raiz: string): Foto | undefined {
  for (const lista of [...d.fotosDoDia.values(), ...d.fotosDoAlvo.values()]) {
    const f = lista.find((x) => x.raiz === raiz)
    if (f) return f
  }
  return undefined
}

export interface Pavimento {
  id: string
  nome: string
  ordem: number
}

export interface Peca {
  id: string
  pavimento_id: string
  tipo: string
  nome: string
}

export interface ArquivoFoto {
  id: string
  caminho: string
  tipo: string
}

/** O que `sincronizador.linhas` devolve, por tabela. */
export type LinhasPorTabela = Record<string, readonly Linha[]>

export interface DadosRelatorios {
  pavimentos: Pavimento[]
  pecasDoPavimento: Map<string, Peca[]>
  pecaPorId: Map<string, Peca>
  /** Último registro dos dados da obra. */
  cadastro?: Linha
  /** data → período → último registro */
  clima: Map<string, Map<string, Linha>>
  efetivo: Map<string, Registro[]>
  equipamentos: Map<string, Registro[]>
  materiais: Map<string, Registro[]>
  servicos: Map<string, Registro[]>
  ocorrencias: Map<string, Registro[]>
  /** data → último registro de fechar ou reabrir */
  fechamentos: Map<string, Linha>
  relatorios: Relatorio[]
  /** raiz do relatório → andamentos, do mais antigo para o mais novo */
  andamentos: Map<string, Linha[]>
  /** raiz do alvo → marcas */
  marcas: Map<string, Marca[]>
  /** raiz do alvo → fotos */
  fotosDoAlvo: Map<string, Foto[]>
  /** data → fotos sem alvo */
  fotosDoDia: Map<string, Foto[]>
  arquivos: Map<string, ArquivoFoto>
  /** Dias com algum registro, do mais novo para o mais velho. */
  dias: string[]
  /**
   * Raízes (e ids) dos registros de exemplo da apresentação (exemplos.ts). Aparecem nas telas com o
   * selo EXEMPLO, mas ficam fora das impressões, dos avisos e das contagens (Nova obra, 09/11/2026).
   */
  exemplos: Set<string>
}

/**
 * Quem assina os exemplos: o "usuário do pacote" (USUARIO_DO_PACOTE, em nucleo/pacote_obra.ts; o teste
 * confere que é o mesmo). O pacote da obra nunca grava nas tabelas do diário, dos relatórios nem do
 * concreto, então ali essa assinatura só pode ser exemplo. Os semeados depois de 09/11 têm também
 * `exemplo: true`.
 */
export const USUARIO_DOS_EXEMPLOS = '00000000-0000-0000-0000-0000000000c0'

export function ehLinhaDeExemplo(l: Pick<Linha, 'usuario_id'> & { exemplo?: unknown }): boolean {
  return l.exemplo === true || l.usuario_id === USUARIO_DOS_EXEMPLOS
}

/** Tipos que o relatório mostra (estaca e bloco do Concreto ficam de fora). */
const TIPOS_DO_RELATORIO: ReadonlySet<string> = new Set(['P', 'V', 'L', 'A', 'F', 'E', 'M'])

/**
 * A laje que o exemplo criou para a concretagem fictícia. O pacote da obra também traz lajes com a
 * mesma assinatura (e o mesmo id, que vem do Python), então "do pacote" não basta: a do exemplo tem
 * `exemplo: true` (desde 09/11) ou, nas semeadas antes, a hora dela não é a do pacote (o pacote grava
 * o pavimento e as peças dele com a mesma hora).
 */
export function lajesDeExemplo(elementos: readonly Linha[], pavimentos: readonly Linha[]): Set<string> {
  const horaDoPacote = new Map(pavimentos.map((p) => [p.id, p.criado_em_dispositivo]))
  const s = new Set<string>()
  for (const e of elementos) {
    if (e.tipo !== 'L') continue
    const ex = (e as { exemplo?: unknown }).exemplo === true
    const antigo = e.usuario_id === USUARIO_DOS_EXEMPLOS && horaDoPacote.has(String(e.pavimento_id)) && horaDoPacote.get(String(e.pavimento_id)) !== e.criado_em_dispositivo
    if (ex || antigo) s.add(e.id)
  }
  return s
}

function agrupar<T>(itens: readonly T[], chave: (t: T) => string | null | undefined): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const i of itens) {
    const k = chave(i)
    if (!k) continue
    const l = m.get(k)
    if (l) l.push(i)
    else m.set(k, [i])
  }
  return m
}

const antesNaHora = (a: Linha, b: Linha) => a.criado_em_dispositivo.localeCompare(b.criado_em_dispositivo)

function porData(linhas: readonly Linha[] | undefined): Map<string, Registro[]> {
  const v = vigentes((linhas ?? []) as Corrigivel[]).sort(antesNaHora)
  return agrupar(v, (l) => String(l.data))
}

export function montarDados(t: LinhasPorTabela): DadosRelatorios {
  const pavimentos = (t.pavimentos ?? [])
    .map((p) => ({ id: p.id, nome: String(p.nome), ordem: Number(p.ordem) }))
    .sort((a, b) => a.ordem - b.ordem)
  // estaca e bloco do Concreto (S, K) e tipo desconhecido: fora do relatório, sem erro (22/11)
  const pecas: Peca[] = (t.elementos ?? []).filter((e) => TIPOS_DO_RELATORIO.has(String(e.tipo))).map((e) => ({ id: e.id, pavimento_id: String(e.pavimento_id), tipo: String(e.tipo), nome: String(e.nome) }))

  const clima = new Map<string, Map<string, Linha>>()
  for (const l of ultimoPorChave(t.diario_clima ?? [], (c) => `${String(c.data)}|${String(c.periodo)}`).values()) {
    const d = String(l.data)
    if (!clima.has(d)) clima.set(d, new Map())
    clima.get(d)!.set(String(l.periodo), l)
  }

  const relatorios = vigentes((t.relatorios ?? []) as Corrigivel[])
    .map((r) => ({ ...r, itens: (r.itens as ItemRelatorio[] | null) ?? [] }) as Relatorio)
    .sort((a, b) => b.data.localeCompare(a.data) || b.criado_em_dispositivo.localeCompare(a.criado_em_dispositivo))

  // elementos: só a laje que o exemplo criou (as peças do pacote têm a mesma assinatura)
  const exemplos = lajesDeExemplo(t.elementos ?? [], t.pavimentos ?? [])
  for (const [nome, linhas] of Object.entries(t)) {
    if (nome === 'pavimentos' || nome === 'arquivos' || nome === 'elementos') continue
    for (const l of linhas ?? []) if (ehLinhaDeExemplo(l)) exemplos.add(l.id)
  }
  const marcas = vigentes((t.rel_marcas ?? []) as Corrigivel[]) as Marca[]
  const fotos = (vigentes((t.rel_fotos ?? []) as Corrigivel[]) as Foto[]).sort(antesNaHora)

  const dados: DadosRelatorios = {
    pavimentos,
    pecasDoPavimento: agrupar(pecas, (p) => p.pavimento_id),
    pecaPorId: new Map(pecas.map((p) => [p.id, p])),
    cadastro: [...(t.diario_cadastro ?? [])].sort(antesNaHora).at(-1),
    clima,
    efetivo: porData(t.diario_efetivo),
    equipamentos: porData(t.diario_equipamentos),
    materiais: porData(t.diario_materiais),
    servicos: porData(t.diario_servicos),
    ocorrencias: porData(t.diario_ocorrencias),
    fechamentos: new Map([...ultimoPorChave(t.diario_fechamentos ?? [], (f) => String(f.data))].map(([k, v]) => [k, v])),
    relatorios,
    andamentos: new Map([...agrupar(t.relatorio_andamentos ?? [], (a) => String(a.relatorio_id))].map(([k, l]) => [k, [...l].sort(antesNaHora)])),
    marcas: agrupar(marcas, (m) => alvoDe(m)?.raiz),
    fotosDoAlvo: agrupar(fotos, (f) => alvoDe(f)?.raiz),
    fotosDoDia: agrupar(fotos.filter((f) => !alvoDe(f)), (f) => f.data),
    arquivos: new Map((t.arquivos ?? []).map((a) => [a.id, { id: a.id, caminho: String(a.caminho), tipo: String(a.tipo ?? '') }])),
    dias: [],
    exemplos,
  }
  dados.dias = diasCom(dados)
  return dados
}

function diasCom(d: DadosRelatorios): string[] {
  const dias = new Set<string>()
  for (const m of [d.clima, d.efetivo, d.equipamentos, d.materiais, d.servicos, d.ocorrencias, d.fotosDoDia, d.fechamentos]) {
    for (const [k, v] of m) if (!(v instanceof Map) || v.size > 0) dias.add(k)
  }
  return [...dias].sort().reverse()
}

/** Registro de exemplo (ou feito em cima de um: correção, andamento, foto ou marca de um exemplo). */
export function ehDeExemplo(d: Pick<DadosRelatorios, 'exemplos'>, l: { id: string; raiz?: string }): boolean {
  return d.exemplos.has(l.raiz ?? l.id)
}

/** Quantos registros de exemplo há (para o aviso e o botão "Tirar os exemplos"). */
export function quantosExemplos(d: Pick<DadosRelatorios, 'exemplos'>): number {
  return d.exemplos.size
}

/** O dia tem algum registro de exemplo. */
export function diaTemExemplo(d: DadosRelatorios, data: string): boolean {
  if (d.exemplos.size === 0) return false
  if ([...(d.clima.get(data)?.values() ?? [])].some((c) => ehDeExemplo(d, c))) return true
  const f = d.fechamentos.get(data)
  if (f && ehDeExemplo(d, f)) return true
  return [d.efetivo, d.equipamentos, d.materiais, d.servicos, d.ocorrencias, d.fotosDoDia].some((m) => (m.get(data) ?? []).some((l) => ehDeExemplo(d, l)))
}

/** O dia só tem registros de exemplo. */
export function diaDeExemplo(d: DadosRelatorios, semEx: DadosRelatorios, data: string): boolean {
  return d.dias.includes(data) && !semEx.dias.includes(data)
}

const cache = new WeakMap<DadosRelatorios, DadosRelatorios>()

/** Os mesmos dados sem os exemplos: para imprimir, contar e avisar. */
export function semExemplos(d: DadosRelatorios): DadosRelatorios {
  if (d.exemplos.size === 0) return d
  const ja = cache.get(d)
  if (ja) return ja
  const fora = (l: { id: string; raiz?: string }) => !ehDeExemplo(d, l)
  const porDia = <T extends { id: string; raiz?: string }>(m: Map<string, T[]>) => {
    const r = new Map<string, T[]>()
    for (const [k, v] of m) {
      const f = v.filter(fora)
      if (f.length) r.set(k, f)
    }
    return r
  }
  const porAlvo = <T extends { id: string; raiz?: string }>(m: Map<string, T[]>) => {
    const r = new Map<string, T[]>()
    for (const [k, v] of m) {
      if (d.exemplos.has(k)) continue
      const f = v.filter(fora)
      if (f.length) r.set(k, f)
    }
    return r
  }
  const clima = new Map<string, Map<string, Linha>>()
  for (const [dia, periodos] of d.clima) {
    const f = new Map([...periodos].filter(([, c]) => fora(c)))
    if (f.size) clima.set(dia, f)
  }
  const pecas = [...d.pecaPorId.values()].filter((p) => !d.exemplos.has(p.id))
  const s: DadosRelatorios = {
    ...d,
    pecasDoPavimento: agrupar(pecas, (p) => p.pavimento_id),
    pecaPorId: new Map(pecas.map((p) => [p.id, p])),
    clima,
    efetivo: porDia(d.efetivo),
    equipamentos: porDia(d.equipamentos),
    materiais: porDia(d.materiais),
    servicos: porDia(d.servicos),
    ocorrencias: porDia(d.ocorrencias),
    fechamentos: new Map([...d.fechamentos].filter(([, f]) => fora(f))),
    relatorios: d.relatorios.filter(fora),
    andamentos: porAlvo(d.andamentos),
    marcas: porAlvo(d.marcas),
    fotosDoAlvo: porAlvo(d.fotosDoAlvo),
    fotosDoDia: porDia(d.fotosDoDia),
    dias: [],
    exemplos: new Set(),
  }
  s.dias = diasCom(s)
  cache.set(d, s)
  return s
}

// ---------------------------------------------------------------------
// Dia
// ---------------------------------------------------------------------

export interface ResumoDia {
  data: string
  pessoas: number
  equipamentos: number
  materiais: number
  servicos: number
  ocorrencias: number
  relatorios: number
  fotos: number
  impraticavel: boolean
  horasParadas: number
  fechado: boolean
  numero: number | null
}

export function resumoDoDia(d: DadosRelatorios, data: string): ResumoDia {
  const fech = d.fechamentos.get(data)
  const fotosDosAlvos = [...(d.servicos.get(data) ?? []), ...(d.ocorrencias.get(data) ?? [])].reduce((s, l) => s + (d.fotosDoAlvo.get(l.raiz)?.length ?? 0), 0)
  return {
    data,
    pessoas: (d.efetivo.get(data) ?? []).reduce((s, l) => s + Number(l.quantidade ?? 0), 0),
    equipamentos: (d.equipamentos.get(data) ?? []).reduce((s, l) => s + Number(l.quantidade ?? 0), 0),
    materiais: d.materiais.get(data)?.length ?? 0,
    servicos: d.servicos.get(data)?.length ?? 0,
    ocorrencias: (d.ocorrencias.get(data) ?? []).filter((l) => !ehRelato(l)).length,
    relatorios: d.relatorios.filter((r) => r.data === data).length,
    fotos: (d.fotosDoDia.get(data)?.length ?? 0) + fotosDosAlvos,
    impraticavel: [...(d.clima.get(data)?.values() ?? [])].some((c) => c.tempo && c.condicao === 'impraticavel'),
    horasParadas: (d.ocorrencias.get(data) ?? []).reduce((s, l) => s + Number(l.horas_paradas ?? 0), 0),
    fechado: fech?.acao === 'fechado',
    numero: fech ? Number(fech.numero) : null,
  }
}

/** Dias com clima impraticável em algum período, no mês de `data` (AAAA-MM-DD). */
export function diasImpraticaveisNoMes(d: DadosRelatorios, data: string): number {
  const mes = data.slice(0, 7)
  let n = 0
  for (const [dia, periodos] of semExemplos(d).clima) {
    if (dia.startsWith(mes) && [...periodos.values()].some((c) => c.tempo && c.condicao === 'impraticavel')) n++
  }
  return n
}

/**
 * Número do RDO: dado no primeiro fechamento do dia e mantido se o dia for reaberto.
 * Antes de fechar o dia não tem número: assim, escrever um dia atrasado não renumera os outros.
 */
export function numeroAoFechar(d: DadosRelatorios, data: string): number {
  // os dias de exemplo (RDO nº 1 e nº 2 da apresentação) não ocupam número: o primeiro RDO de verdade é o nº 1
  const reais = semExemplos(d).fechamentos
  const ja = reais.get(data)
  if (ja) return Number(ja.numero)
  let maior = 0
  for (const f of reais.values()) maior = Math.max(maior, Number(f.numero))
  return maior + 1
}

/** Registrado depois de o dia ser fechado (aparelho que estava sem internet, por exemplo). */
export function depoisDoFechamento(d: DadosRelatorios, data: string, l: Linha): boolean {
  const f = d.fechamentos.get(data)
  return f?.acao === 'fechado' && l.criado_em_dispositivo > f.criado_em_dispositivo
}

/** Dia mais recente antes de `data` que tem linhas nessa seção. Para "Copiar do dia anterior". */
export function ultimoDiaCom(mapa: ReadonlyMap<string, readonly unknown[]>, data: string): string | undefined {
  let melhor: string | undefined
  for (const [dia, l] of mapa) {
    if (dia < data && l.length > 0 && (!melhor || dia > melhor)) melhor = dia
  }
  return melhor
}

/** Valores já digitados numa coluna, do mais usado para o menos usado (sugestões do formulário). */
export function sugestoes(mapa: ReadonlyMap<string, readonly Linha[]>, coluna: string, limite = 30): string[] {
  const n = new Map<string, number>()
  for (const l of mapa.values()) {
    for (const r of l) {
      const v = r[coluna]
      if (typeof v === 'string' && v.trim()) n.set(v, (n.get(v) ?? 0) + 1)
    }
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).slice(0, limite).map(([v]) => v)
}

// ---------------------------------------------------------------------
// Relatórios
// ---------------------------------------------------------------------

export type SituacaoRelatorio = 'aberto' | 'em_andamento' | 'resolvido'

/**
 * Vale o último andamento. Sem andamento: vistoria com lista toda respondida e nenhum "Ruim" já
 * nasce resolvida (não há nada a fazer); o resto nasce aberto.
 */
export function situacaoDoRelatorio(r: Relatorio, andamentos: readonly Linha[] | undefined): SituacaoRelatorio {
  const ultimo = andamentos?.at(-1)
  if (ultimo) return ultimo.situacao as SituacaoRelatorio
  if (tipoRelatorio(r.tipo).itens && r.itens.length > 0 && r.itens.every((i) => i.resultado && i.resultado !== 'ruim')) return 'resolvido'
  return 'aberto'
}

export function atrasado(r: Relatorio, situacao: SituacaoRelatorio, hoje: string): boolean {
  return !!r.prazo && r.prazo < hoje && situacao !== 'resolvido'
}

// ---------------------------------------------------------------------
// Onde foi (marcas na planta)
// ---------------------------------------------------------------------

const ordemNatural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })
const ORDEM_TIPO: Record<string, number> = { P: 0, V: 1, L: 2 }

export interface LocalDoPavimento {
  pavimentoId: string
  nome: string
  pecas: string[]
  areas: number
  pontos: number
}

/** Marcas agrupadas por pavimento, para escrever onde foi. */
export function locaisDasMarcas(d: Pick<DadosRelatorios, 'pavimentos' | 'pecaPorId'>, marcas: readonly Marca[]): LocalDoPavimento[] {
  const saida: LocalDoPavimento[] = []
  for (const pav of d.pavimentos) {
    const doPav = marcas.filter((m) => m.pavimento_id === pav.id)
    if (doPav.length === 0) continue
    const pecas = [...new Set(doPav.filter((m) => m.forma === 'peca').map((m) => m.elemento_id!))]
      .map((id) => d.pecaPorId.get(id))
      .filter((p): p is Peca => !!p)
      .sort((a, b) => (ORDEM_TIPO[a.tipo] ?? 3) - (ORDEM_TIPO[b.tipo] ?? 3) || ordemNatural.compare(a.nome, b.nome))
      .map((p) => p.nome)
    saida.push({
      pavimentoId: pav.id,
      nome: pav.nome,
      pecas,
      areas: doPav.filter((m) => m.forma === 'area').length,
      pontos: doPav.filter((m) => m.forma === 'ponto').length,
    })
  }
  return saida
}

/** "3º Pavimento: P12, V40, 1 área". Vários pavimentos, separados por " · ". */
export function textoDoLocal(d: Pick<DadosRelatorios, 'pavimentos' | 'pecaPorId'>, marcas: readonly Marca[]): string {
  return locaisDasMarcas(d, marcas)
    .map((l) => {
      const partes = [...l.pecas]
      if (l.areas) partes.push(l.areas === 1 ? '1 área' : `${l.areas} áreas`)
      if (l.pontos) partes.push(l.pontos === 1 ? '1 ponto' : `${l.pontos} pontos`)
      return `${l.nome}: ${partes.join(', ')}`
    })
    .join(' · ')
}

/**
 * Peça tocada na planta. Com o andar inteiro na tela do celular as peças ficam a poucos pixels umas
 * das outras, então a ordem importa: primeiro a peça acertada em cheio; depois a que está na folga
 * do dedo; a laje (que fica por baixo de tudo) só se não houver pilar nem viga no alcance.
 */
export function pecaTocada(elementos: readonly ElementoPlanta[], x: number, y: number, folga: number): ElementoPlanta | undefined {
  const semLaje = elementos.filter((e) => e.tipo !== 'L')
  return pecaNoPonto(semLaje, x, y, 0) ?? pecaNoPonto(semLaje, x, y, folga) ?? pecaNoPonto(elementos, x, y, folga)
}

export type CategoriaMapa = 'servico' | 'servico_concluido' | 'ocorrencia' | 'problema' | 'resolvido' | 'foto'

export const COR_CATEGORIA: Record<CategoriaMapa, string> = {
  servico: '#1565c0',
  servico_concluido: '#2e7d32',
  ocorrencia: '#ef6c00',
  problema: '#c62828',
  resolvido: '#6b7280',
  foto: '#6a1b9a',
}

/** Quanto mais importante, por cima: peça com problema aberto fica vermelha mesmo com serviço. */
const PRIORIDADE: Record<CategoriaMapa, number> = { foto: 0, resolvido: 1, servico: 2, servico_concluido: 3, ocorrencia: 4, problema: 5 }

export interface EntradaMapa {
  alvo: Alvo
  data: string
  titulo: string
  categoria: CategoriaMapa
  marcas: Marca[]
}

/** Tudo que tem marca na planta, no período pedido (datas inclusive; vazio = sem limite). */
export function entradasDoMapa(d: DadosRelatorios, desde: string, ate: string): EntradaMapa[] {
  const noPeriodo = (data: string) => (!desde || data >= desde) && (!ate || data <= ate)
  const saida: EntradaMapa[] = []
  for (const [data, lista] of d.servicos) {
    if (!noPeriodo(data)) continue
    for (const s of lista) {
      const marcas = d.marcas.get(s.raiz)
      if (marcas?.length) {
        saida.push({
          alvo: { tipo: 'servico', raiz: s.raiz },
          data,
          titulo: String(s.descricao),
          categoria: s.situacao === 'concluido' ? 'servico_concluido' : 'servico',
          marcas,
        })
      }
    }
  }
  for (const [data, lista] of d.ocorrencias) {
    if (!noPeriodo(data)) continue
    for (const o of lista) {
      if (ehRelato(o)) continue
      const marcas = d.marcas.get(o.raiz)
      if (marcas?.length) saida.push({ alvo: { tipo: 'ocorrencia', raiz: o.raiz }, data, titulo: String(o.descricao), categoria: 'ocorrencia', marcas })
    }
  }
  for (const r of d.relatorios) {
    if (!noPeriodo(r.data)) continue
    const marcas = d.marcas.get(r.raiz)
    if (marcas?.length) {
      const resolvido = situacaoDoRelatorio(r, d.andamentos.get(r.raiz)) === 'resolvido'
      saida.push({ alvo: { tipo: 'relatorio', raiz: r.raiz }, data: r.data, titulo: r.titulo, categoria: resolvido ? 'resolvido' : 'problema', marcas })
    }
  }
  // fotos com o ponto de onde foram tiradas (do dia ou de um registro)
  for (const lista of [...d.fotosDoDia.values(), ...d.fotosDoAlvo.values()]) {
    for (const f of lista) {
      if (!noPeriodo(f.data)) continue
      const marcas = d.marcas.get(f.raiz)
      if (marcas?.length) saida.push({ alvo: { tipo: 'foto', raiz: f.raiz }, data: f.data, titulo: f.legenda || 'Foto', categoria: 'foto', marcas })
    }
  }
  return saida
}

/** Categoria que pinta a peça: a mais importante entre as entradas que a marcaram. */
export function categoriaDaPeca(entradas: readonly EntradaMapa[]): CategoriaMapa | null {
  let melhor: CategoriaMapa | null = null
  for (const e of entradas) if (!melhor || PRIORIDADE[e.categoria] > PRIORIDADE[melhor]) melhor = e.categoria
  return melhor
}

// ---------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------

export function dataBR(data: string | null | undefined): string {
  if (!data) return ''
  const [a, m, d] = String(data).slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

/** Dia da semana da data (AAAA-MM-DD), sem depender do fuso do aparelho. */
export function diaDaSemana(data: string): string {
  const [a, m, d] = data.split('-').map(Number)
  return DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]
}

/** Dias entre duas datas (AAAA-MM-DD); positivo se `ate` vem depois de `de`. */
export function diasEntre(de: string, ate: string): number {
  const utc = (s: string) => {
    const [a, m, d] = s.split('-').map(Number)
    return Date.UTC(a, m - 1, d)
  }
  return Math.round((utc(ate) - utc(de)) / 86_400_000)
}

/** Data `n` dias antes (AAAA-MM-DD). */
export function diasAntes(data: string, n: number): string {
  const [a, m, d] = data.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------
// Pavimento citado no texto (serviço ou ocorrência sem marca ainda)
// ---------------------------------------------------------------------

const paraComparar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[ºª°]/g, 'o')
    .replace(/\s+/g, ' ')

/**
 * O pavimento que o texto cita ("Armação de pilares do 2º pavimento", "laje do 3o pav", "Térreo"), ou
 * null. Quem acabou de escrever o serviço não precisa escolher de novo na planta. Vale o nome mais
 * comprido que aparece (para "12º" não virar "2º"); número + "pav" vale para "Nº Pavimento".
 */
export function pavimentoNoTexto(texto: string, pavimentos: readonly Pavimento[]): string | null {
  const t = ` ${paraComparar(texto)} `
  let melhor: { id: string; tamanho: number } | null = null
  for (const p of pavimentos) {
    const nome = paraComparar(p.nome).trim()
    if (!nome) continue
    const escapado = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    let achou = new RegExp(`(^|[^a-z0-9])${escapado}([^a-z0-9]|$)`).test(t)
    const numero = /^(\d+)\s*o?\s*pav/.exec(nome)?.[1]
    if (!achou && numero) achou = new RegExp(`(^|[^0-9])${numero}\\s*o?\\s*pav`).test(t)
    if (achou && (!melhor || nome.length > melhor.tamanho)) melhor = { id: p.id, tamanho: nome.length }
  }
  return melhor?.id ?? null
}

// ---------------------------------------------------------------------
// Foto anexada (Diário e relatórios)
// ---------------------------------------------------------------------

/** Foto do celular antes de reduzir: até 20 MB (a de 50 MP passa de 10). */
export const LIMITE_FOTO = 20 * 1024 * 1024
export const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const

/** Tipo da foto escolhida (o HEIC do iPhone às vezes chega sem tipo). */
export function tipoDaFoto(f: { type: string; name: string }): string {
  if (f.type) return f.type
  return /\.hei[cf]$/i.test(f.name) ? 'image/heic' : 'application/octet-stream'
}

/** A foto pode entrar? Mensagem de recusa ou null. SVG não: pode ter script. */
export function recusaDaFoto(tamanho: number, tipo: string): string | null {
  if (!(TIPOS_FOTO as readonly string[]).includes(tipo)) return 'Só foto (JPG, PNG, WEBP ou HEIC).'
  if (tamanho === 0) return 'A foto está vazia.'
  if (tamanho > LIMITE_FOTO) return `Foto de ${Math.round(tamanho / 1024 / 1024)} MB: o limite é 20 MB.`
  return null
}

/** Aviso da sincronização no topo do módulo. O recusado vem primeiro: não some sozinho e alguém precisa olhar.
 *  Sem conta (`local`) não há servidor: nenhum aviso de envio (mesma regra da FVS e do Concreto, 13/11). */
export function avisoDaSincronizacao(e: { online: boolean; pendentes: number; comErro: number; local?: boolean }): string {
  if (e.local) return ''
  if (e.comErro > 0) return `${e.comErro} registro(s) recusado(s) pelo servidor. Continuam guardados no aparelho: veja a lista no menu da obra.`
  if (!e.online) return 'Sem internet: tudo fica guardado no aparelho e vai quando a internet voltar.'
  return e.pendentes > 0 ? `${e.pendentes} registro(s) esperando envio.` : ''
}

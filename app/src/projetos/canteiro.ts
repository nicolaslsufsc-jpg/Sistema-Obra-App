// Controle do canteiro (21/11/2026): a ficha de cópias da obra × a revisão vigente do Autodoc, com a
// Situação de cada cópia como na ficha de controle v2 (OK / RECOLHER / DEVOLVIDO / CONFERIR) e o
// escritório (a revisão que está na pasta do PC) × a vigente. Sem migração: a ficha e o índice do
// escritório são importados no aparelho; a vigente vem do servidor quando há conta.
// Plano aprovado pelo Nicolas em 21/11/2026 (docs/modulos/2_projetos.md).

import type { DadosProjetos, Documento } from './dados'
import { chaveFolha, compararEscritorio, type RegistroEscritorio } from './edicoes'
import { chaveNumero, lerCsv, melhor, normalizar, type Copia, type CopiaCruzada, type Fase, type Vigente } from './painel'

/** Nome da disciplina como a ficha de cópias escreve, pela sigla do código. Sigla fora daqui: o nome do Autodoc. */
export const DISCIPLINAS_FICHA: Record<string, string> = {
  ES: 'ESTRUTURAL',
  EC: 'ESCORAMENTO',
  FU: 'FUNDAÇÃO',
  HI: 'HIDRO',
  SA: 'SANITÁRIO',
  FR: 'FURAÇÃO',
  SP: 'SPDA',
  VD: 'VEDAÇÃO',
  AR: 'ARQUITETÔNICO',
}

const FASES_DE_OBRA = new Set(['LO', 'EX'])

/**
 * Chave da disciplina (a mesma das cópias e da lista vigente) → o nome como o servidor escreve ("Hidrossanitário").
 * Para as telas mostrarem a disciplina com uma grafia só, venha a cópia da ficha ou do servidor.
 */
export function nomesDeDisciplina(documentos: readonly Pick<Documento, 'disciplina_sigla' | 'disciplina'>[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const d of documentos) {
    if (!d.disciplina) continue
    const k = normalizar(DISCIPLINAS_FICHA[d.disciplina_sigla.toUpperCase()] ?? d.disciplina)
    if (!m.has(k)) m.set(k, d.disciplina)
  }
  // duas disciplinas da ficha com o mesmo nome no servidor (ES "ESTRUTURAL" e EC "ESCORAMENTO" são "Estrutura"
  // lá; testador, 23/11): o nome do servidor fica com a que bate com ele, a outra leva o nome da ficha
  const todas = [...m]
  for (const [k, nome] of todas) {
    const mesmas = todas.filter(([, x]) => x === nome)
    if (mesmas.length < 2) continue
    const n = normalizar(nome)
    const dona = mesmas.find(([x]) => x === n) ?? mesmas.find(([x]) => x.startsWith(n) || n.startsWith(x)) ?? mesmas[0]
    if (dona[0] !== k) m.set(k, nomeSemCaixaAlta(Object.values(DISCIPLINAS_FICHA).find((f) => normalizar(f) === k) ?? k))
  }
  return m
}

/** "FUNDAÇÃO" → "Fundação": nome que só existe na ficha, na mesma grafia dos nomes do servidor. */
export function nomeSemCaixaAlta(nome: string): string {
  return nome === nome.toUpperCase() && nome.length > 4 ? nome.charAt(0) + nome.slice(1).toLowerCase() : nome
}

/** "…/PROJETOS/Estrutura/Liberado Obra/Formas/" → "LO/Formas" (o que a lista vigente chama de pasta). */
export function pastaCurta(pasta: string | null, fase: Fase): string {
  if (!pasta) return fase
  const partes = pasta.split('/').map((p) => p.trim()).filter(Boolean)
  const i = partes.findIndex((p) => normalizar(p) === 'PROJETOS')
  const resto = (i >= 0 ? partes.slice(i + 2) : partes).filter((p) => !/^(LIBERADO OBRA|PROJETO EXECUTIVO)$/.test(normalizar(p)))
  return [fase, ...resto].join('/')
}

/** Folha da lista vigente (chaveFolha do código) → id do documento no servidor: liga a base às telas de entrega. */
export function documentosPorFolha(d: Pick<DadosProjetos, 'documentos' | 'vigentes'>): Map<string, string> {
  const m = new Map<string, string>()
  for (const doc of d.documentos) {
    const r = d.vigentes.get(doc.id)
    if (!r) continue
    const fase = String(r.fase ?? 'EX').toUpperCase()
    m.set(chaveFolha({ codigo: `${doc.codigo.split('.')[0]}.${doc.disciplina_sigla.toUpperCase()}.${fase}.${doc.numero}.${doc.nome_curto}` }), doc.id)
  }
  return m
}

/** Linhas das entregas do app na conta do canteiro: começam aqui (a ficha usa números pequenos). */
export const LINHA_APP = 900_000

/**
 * Pastas do Autodoc retiradas da obra (24/11/2026, decisão do Nicolas de 22/11: a pasta que a obra deixou de
 * usar some de todos os módulos). Sem cadastro nem nome de pasta: vale a marca que já está no banco. Uma pasta
 * está retirada quando TODAS as pranchas dela têm revisão e todas as revisões estão obsoletas. Uma folha solta
 * que saiu de uso dentro de uma pasta ainda em uso não conta: a cópia dela continua "a trocar".
 */
export function pastasRetiradas(d: Pick<DadosProjetos, 'documentos' | 'revisoesDe'>): Set<string> {
  const viva = new Map<string, boolean>()
  for (const doc of d.documentos) {
    const pasta = (doc.pasta_autodoc ?? '').trim()
    if (!pasta) continue
    const revs = (d.revisoesDe.get(doc.id) ?? []).filter((r) => !r.apagado)
    const retirada = revs.length > 0 && revs.every((r) => !!r.obsoleta)
    viva.set(pasta, (viva.get(pasta) ?? false) || !retirada)
  }
  return new Set([...viva].filter(([, v]) => !v).map(([p]) => p))
}

/**
 * As entregas registradas no app (com ou sem assinatura) como cópias do canteiro (achado do testador, 21/11:
 * "a entrega assinada tem que entrar no canteiro"). Uma cópia por entrega; devolvida quando há a devolução
 * dela. Número e disciplina como na lista vigente do servidor, para cruzar com a mesma folha.
 */
export function copiasDoApp(
  d: Pick<DadosProjetos, 'eventos' | 'documentoPorId' | 'revisaoPorId' | 'vigentes' | 'empresaPorId'>,
  /** pastas retiradas (pastasRetiradas): as cópias delas não aparecem no canteiro; o banco não muda */
  retiradas: ReadonlySet<string> = new Set(),
): Copia[] {
  const vivos = d.eventos.filter((e) => !e.apagado)
  const devolucao = new Map<string, string>()
  for (const e of vivos) if (e.tipo === 'devolucao' && e.entrega_id) devolucao.set(String(e.entrega_id), String(e.data_evento ?? '').slice(0, 10))
  const entregas = vivos
    .filter((e) => e.tipo === 'entrega')
    .sort((a, b) => String(a.criado_em_dispositivo ?? '').localeCompare(String(b.criado_em_dispositivo ?? '')) || a.id.localeCompare(b.id))
  const saida: Copia[] = []
  entregas.forEach((e, i) => {
    const doc = d.documentoPorId.get(String(e.documento_id))
    const rev = d.revisaoPorId.get(String(e.revisao_id))
    if (!doc || !rev) return
    if (retiradas.has((doc.pasta_autodoc ?? '').trim())) return
    const vig = d.vigentes.get(doc.id)
    const faseVig = String(vig?.fase ?? rev.fase ?? 'EX').toUpperCase()
    const fase = (String(rev.fase ?? 'EX').toUpperCase() === 'LO' ? 'LO' : 'EX') as Fase
    const sigla = doc.disciplina_sigla.toUpperCase()
    const numero = Number(rev.numero)
    const entrega = String(e.data_evento ?? '').slice(0, 10) || null
    saida.push({
      linha: LINHA_APP + i,
      codigo: FASES_DE_OBRA.has(faseVig) ? chaveNumero(doc.numero) : faseVig + doc.numero,
      revisao: Number.isFinite(numero) ? numero : null,
      fase,
      revisaoTexto: `R${String(rev.numero ?? '').padStart(2, '0')}${fase === 'LO' ? ' LO' : ''}`,
      titulo: doc.titulo,
      disciplina: normalizar(DISCIPLINAS_FICHA[sigla] ?? doc.disciplina ?? sigla),
      disciplinaNome: doc.disciplina,
      copias: 1,
      entrega,
      entregaTexto: entrega ?? '',
      empresa: d.empresaPorId.get(String(e.empresa_id))?.nome ?? 'empresa sem cadastro',
      colaborador: String(e.colaborador ?? ''),
      devolucao: devolucao.get(e.id) ?? null,
      // sem revisão vigente no servidor (todas obsoletas): a folha saiu de uso
      app: { entregaId: e.id, documentoId: doc.id, assinaturaId: (e.assinatura_id as string | null) ?? null, fase: String(rev.fase ?? 'EX').toUpperCase(), ...(vig ? {} : { foraDeUso: true }) },
    })
  })
  return saida
}

/**
 * De onde saem as cópias do canteiro (22/11/2026). Quando o servidor já tem entregas da obra, valem SÓ elas:
 * a ficha importada no aparelho é a mesma informação (a ficha foi gravada no servidor) e somar as duas contava
 * cada cópia em dobro. Sem entregas no servidor (ou sem conta), vale a ficha importada no aparelho.
 */
export function copiasDoCanteiro(daFicha: readonly Copia[], doServidor: readonly Copia[]): { copias: Copia[]; fonte: 'servidor' | 'ficha'; ignoradas: number } {
  if (doServidor.length) return { copias: [...doServidor], fonte: 'servidor', ignoradas: daFicha.length }
  return { copias: [...daFicha], fonte: 'ficha', ignoradas: 0 }
}

/**
 * A lista vigente a partir do servidor (uma linha por documento, a revisão vigente dele).
 * Mesmas chaves da lista em CSV: disciplina pelo nome da ficha, número sem zeros; fase que não é de obra
 * (PL, DE, AP...) entra com a fase na frente do número, para não cruzar com cópia de obra.
 */
export function vigentesDoServidor(d: Pick<DadosProjetos, 'documentos' | 'vigentes'>): Vigente[] {
  const saida: Vigente[] = []
  for (const doc of d.documentos) {
    const r = d.vigentes.get(doc.id)
    if (!r) continue
    const fase = String(r.fase ?? 'EX').toUpperCase()
    const sigla = doc.disciplina_sigla.toUpperCase()
    const obra = doc.codigo.split('.')[0]
    const numero = FASES_DE_OBRA.has(fase) ? chaveNumero(doc.numero) : fase + doc.numero
    const data = String(r.cadastrada_em_autodoc ?? r.vista_em ?? '').slice(0, 10)
    saida.push({
      disciplina: normalizar(DISCIPLINAS_FICHA[sigla] ?? doc.disciplina ?? sigla),
      pasta: pastaCurta(doc.pasta_autodoc, fase),
      de: numero,
      ate: numero,
      codigo: `${obra}.${sigla}.${fase}.${doc.numero}.${doc.nome_curto}`,
      fase,
      revisao: Number(r.numero) || 0,
      data,
      status: String(r.status_autodoc ?? ''),
      titulo: String(r.titulo ?? '') || doc.titulo,
    })
  }
  return saida
}

// ---------------------------------------------------------------------------------------------
// Situação da cópia, como na ficha v2
// ---------------------------------------------------------------------------------------------

export type SituacaoFicha = 'OK' | 'RECOLHER' | 'DEVOLVIDO' | 'CONFERIR'

export const SITUACOES_FICHA: readonly SituacaoFicha[] = ['OK', 'RECOLHER', 'DEVOLVIDO', 'CONFERIR']

/**
 * em dia → OK; desatualizada em campo → RECOLHER; devolvida ou provavelmente recolhida → DEVOLVIDO;
 * o resto (não achada no Autodoc, revisão maior que a vigente, datas, folha ambígua) → CONFERIR.
 */
export function situacaoFicha(x: Pick<CopiaCruzada, 'situacao' | 'resultado'>): SituacaoFicha {
  if (x.situacao !== 'em campo') return 'DEVOLVIDO'
  if (x.resultado === 'em dia') return 'OK'
  if (x.resultado === 'desatualizada') return 'RECOLHER'
  return 'CONFERIR'
}

// ---------------------------------------------------------------------------------------------
// Escritório pelo índice de pranchas do PC
// ---------------------------------------------------------------------------------------------

// OBRA.DISC.FASE.NUMERO.NOME-RNN (o resto do nome, título e extensão, não importa)
const CODIGO_ARQUIVO = /^([A-Z0-9]+)\.([A-Z]{2,3})\.([A-Z]{2})\.([A-Z0-9]+)\.([A-Z0-9]+?)-R(\d{1,3})\b/i

export interface FolhaNoPc {
  chave: string
  fase: Fase
  revisao: number
}

/** "OBRA.ES.LO.134.NOME-R01 - TÍTULO.pdf" → chave da folha (sem a fase), fase e revisão. */
export function folhaDoArquivo(nome: string): FolhaNoPc | null {
  const m = CODIGO_ARQUIVO.exec(nome.trim())
  if (!m) return null
  const [, obra, disc, fase, numero, nomeCurto, rev] = m
  return { chave: chaveFolha({ codigo: `${obra}.${disc}.${fase}.${numero}.${nomeCurto}` }), fase: fase.toUpperCase(), revisao: Number(rev) }
}

const PESO: Record<string, number> = { LO: 2, EX: 1 }
const maisNova = (a: FolhaNoPc, b: FolhaNoPc) => (PESO[a.fase] ?? 0) - (PESO[b.fase] ?? 0) || a.revisao - b.revisao

/**
 * O índice de pranchas do escritório (CSV com a coluna "codigo" ou "arquivo") → a revisão mais nova que
 * está no PC de cada folha. `dia` = quando o índice foi importado (a pasta "foi atualizada" até ali).
 */
export function lerIndiceEscritorio(texto: string, dia: string): Map<string, RegistroEscritorio> {
  const linhas = lerCsv(texto)
  if (!linhas.length || !('codigo' in linhas[0] || 'arquivo' in linhas[0])) throw new Error('O índice do escritório não tem a coluna codigo nem a coluna arquivo.')
  const porFolha = new Map<string, FolhaNoPc>()
  for (const l of linhas) {
    const f = folhaDoArquivo(l.codigo ?? '') ?? folhaDoArquivo(l.arquivo ?? '')
    if (!f) continue
    const atual = porFolha.get(f.chave)
    if (!atual || maisNova(f, atual) > 0) porFolha.set(f.chave, f)
  }
  return new Map([...porFolha].map(([k, f]) => [k, { fase: f.fase, revisao: f.revisao, data: dia }]))
}

export type SituacaoEscritorio = 'OK' | 'ATUALIZAR' | 'CONFERIR' | 'SEM CÓPIA'

export interface LinhaEscritorio {
  vigente: Vigente
  registro: RegistroEscritorio | null
  situacao: SituacaoEscritorio
}

/** Uma linha por folha vigente: a revisão que está no escritório e se precisa atualizar (CONFERIR = o PC tem revisão maior que a vigente). */
export function escritorioDasFolhas(vigentes: readonly Vigente[], escritorio: ReadonlyMap<string, RegistroEscritorio>): LinhaEscritorio[] {
  const porFolha = new Map<string, Vigente[]>()
  for (const v of vigentes) porFolha.set(chaveFolha(v), [...(porFolha.get(chaveFolha(v)) ?? []), v])
  const saida: LinhaEscritorio[] = []
  for (const [k, vs] of porFolha) {
    const v = melhor(vs)
    const r = escritorio.get(k) ?? null
    let situacao: SituacaoEscritorio = 'SEM CÓPIA'
    if (r) {
      // regra estrita (compararEscritorio): EX R03 na pasta com a LO R03 vigente é ATUALIZAR
      const c = compararEscritorio(r, v)
      situacao = c === 'desatualizado' ? 'ATUALIZAR' : c === 'à frente' ? 'CONFERIR' : 'OK'
    }
    saida.push({ vigente: v, registro: r, situacao })
  }
  return saida.sort((a, b) => a.vigente.disciplina.localeCompare(b.vigente.disciplina, 'pt-BR') || a.vigente.codigo.localeCompare(b.vigente.codigo))
}

// ---------------------------------------------------------------------------------------------
// Resumo por empresa (aba RESUMO)
// ---------------------------------------------------------------------------------------------

export interface LinhaResumoEmpresa {
  empresa: string
  total: number
  porSituacao: Record<SituacaoFicha, number>
}

export function resumoPorEmpresa(cruzadas: readonly CopiaCruzada[]): LinhaResumoEmpresa[] {
  const m = new Map<string, LinhaResumoEmpresa>()
  for (const x of cruzadas) {
    const nome = x.copia.empresa || '(sem empresa)'
    let l = m.get(normalizar(nome))
    if (!l) {
      l = { empresa: nome, total: 0, porSituacao: { OK: 0, RECOLHER: 0, DEVOLVIDO: 0, CONFERIR: 0 } }
      m.set(normalizar(nome), l)
    }
    l.total++
    l.porSituacao[situacaoFicha(x)]++
  }
  return [...m.values()].sort((a, b) => b.porSituacao.RECOLHER - a.porSituacao.RECOLHER || a.empresa.localeCompare(b.empresa, 'pt-BR'))
}

/**
 * O escritório que vale: o do índice importado e o registrado no app ("Atualizar" na prancha). Para a mesma
 * folha fica o de data mais recente; na mesma data, o registrado no app.
 */
export function mesclarEscritorio(indice: Readonly<Record<string, RegistroEscritorio>> | undefined, noApp: ReadonlyMap<string, RegistroEscritorio>): Map<string, RegistroEscritorio> {
  const m = new Map(Object.entries(indice ?? {}))
  for (const [k, r] of noApp) {
    const atual = m.get(k)
    if (!atual || r.data >= atual.data) m.set(k, r)
  }
  return m
}

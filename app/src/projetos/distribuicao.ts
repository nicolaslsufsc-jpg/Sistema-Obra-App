// Lista de distribuição (quem recebe cada projeto) e o que falta entregar (proposta aprovada em 20/11/2026).
// Uma regra vale para uma disciplina inteira ou para uma pasta do Autodoc dentro dela (ESTRUTURAL/LO/Vigas);
// a regra da pasta vale mais que a da disciplina. O destinatário é um nome (empresa + colaborador), sem conta.
// Nada se apaga: mudar ou desativar uma regra grava uma linha nova com `substitui_id` (como edicoes.ts).
// Desde 20/11/2026 fica na tabela sincronizada `distribuicao_destinatarios` (migração
// 20261120130000_projetos_destinatarios.sql): com conta, sobe ao servidor e desce para os outros aparelhos
// da obra; só o gestor inclui (regra do servidor; a tela também esconde). Antes ficava no banco do
// navegador (meta `projetos_destinatarios:<obra>`): a lista antiga passa para a tabela uma vez, com os
// mesmos ids, na primeira leitura.
import { banco, sincronizador } from '../nucleo/servicos'
import type { Linha } from '../nucleo/banco_local'
import { TABELA_DESTINATARIOS } from './tabelas'
import { chaveFolha } from './edicoes'
import { lerCsv, melhor, normalizar, ErroDeArquivo, type CopiaCruzada, type Vigente } from './painel'
import { ordemPavimento, pavimentoDe } from './obra'

export interface DadosDestinatario {
  /** disciplina normalizada (sem acento, maiúscula), como em Vigente.disciplina */
  disciplina: string
  /** pasta do Autodoc ("LO/Vigas"); vazio = a disciplina inteira */
  pasta: string
  /** pavimento ("3º pavimento", "Térreo", como pavimentoDe); vazio ou ausente = todos (21/11/2026) */
  pavimento?: string
  empresa: string
  /** vazio = qualquer pessoa da empresa */
  colaborador: string
  copias: number
  ativo: boolean
  /** a partir de quando a regra vale (AAAA-MM-DD): revisão nova depois disso gera "a entregar" */
  desde: string
}

export interface Destinatario extends DadosDestinatario {
  id: string
  /** a regra que esta substitui (null = regra nova) */
  substitui_id: string | null
  em: string
  usuario: string
}

/** A lista antiga, do banco do navegador (até 20/11/2026). */
export const chaveAntiga = (obraId: string) => `projetos_destinatarios:${obraId}`

/** Quem gravou, para o histórico ("mudada em ... por ..."): o app dá o nome de cada usuario_id. */
export type NomeDe = (usuarioId: string) => string

const NESTE_APARELHO: NomeDe = () => 'neste aparelho'

/** As colunas da regra na tabela (as do núcleo, id e hora, vêm do sincronizador). */
const colunas = (n: DadosDestinatario & { substitui_id?: string | null }) => ({
  disciplina: n.disciplina,
  pasta: n.pasta,
  pavimento: n.pavimento ?? '',
  empresa: n.empresa,
  colaborador: n.colaborador,
  copias: n.copias,
  ativo: n.ativo,
  desde: n.desde,
  substitui_id: n.substitui_id ?? null,
})

function daLinha(l: Linha, nomeDe: NomeDe): Destinatario {
  return {
    id: l.id,
    disciplina: String(l.disciplina ?? ''),
    pasta: String(l.pasta ?? ''),
    pavimento: String(l.pavimento ?? ''),
    empresa: String(l.empresa ?? ''),
    colaborador: String(l.colaborador ?? ''),
    copias: Number(l.copias ?? 1),
    ativo: l.ativo !== false,
    desde: String(l.desde ?? ''),
    substitui_id: (l.substitui_id as string | null) ?? null,
    em: String(l.criado_em_dispositivo),
    usuario: nomeDe(String(l.usuario_id)),
  }
}

/** Uma passagem por obra de cada vez: duas leituras juntas não passam a lista antiga duas vezes. */
const passando = new Map<string, Promise<void>>()

/**
 * A lista antiga (meta do navegador) vai para a tabela, na ordem em que foi gravada (a regra antes da
 * versão que a substitui) e com os mesmos ids; depois a meta sai. A hora de cada linha passa a ser a
 * da passagem (o núcleo carimba), e quem gravou passa a ser quem está no aparelho.
 */
function passarListaAntiga(obraId: string, usuarioId: string): Promise<void> {
  const ja = passando.get(obraId)
  if (ja) return ja
  const p = (async () => {
    const antiga = await banco.lerMeta<Destinatario[]>(chaveAntiga(obraId))
    if (!antiga?.length) return
    const naTabela = new Set((await sincronizador.linhas(TABELA_DESTINATARIOS, obraId, { incluirApagadas: true })).map((l) => l.id))
    for (const d of antiga) {
      if (!naTabela.has(d.id)) await sincronizador.registrar(TABELA_DESTINATARIOS, obraId, usuarioId, { id: d.id, ...colunas(d) })
    }
    await banco.meta.delete(chaveAntiga(obraId))
  })().finally(() => passando.delete(obraId))
  passando.set(obraId, p)
  return p
}

/** Todas as linhas da lista da obra (regras e versões), da mais antiga para a mais nova. */
export async function lerDestinatarios(obraId: string, usuarioId = '', nomeDe: NomeDe = NESTE_APARELHO): Promise<Destinatario[]> {
  if (usuarioId) await passarListaAntiga(obraId, usuarioId)
  const linhas = await sincronizador.linhas(TABELA_DESTINATARIOS, obraId)
  // pela hora; na mesma hora (o relógio repete o milissegundo), a regra antes da versão que a substitui
  return linhas
    .map((l) => daLinha(l, nomeDe))
    .sort((a, b) => (a.em < b.em ? -1 : a.em > b.em ? 1 : b.substitui_id === a.id ? -1 : a.substitui_id === b.id ? 1 : 0))
}

/** Grava regras novas ou versões novas de regras (com `substitui_id`). Nada é apagado. */
export async function gravarDestinatarios(
  obraId: string,
  novas: (DadosDestinatario & { substitui_id?: string | null })[],
  usuarioId: string,
  nomeDe: NomeDe = NESTE_APARELHO,
): Promise<Destinatario[]> {
  await passarListaAntiga(obraId, usuarioId)
  // uma de cada vez, na ordem: a regra chega ao servidor antes da versão que a substitui
  for (const n of novas) await sincronizador.registrar(TABELA_DESTINATARIOS, obraId, usuarioId, colunas(n))
  return lerDestinatarios(obraId, usuarioId, nomeDe)
}

/** A versão que vale de cada regra (a que nenhuma outra substitui), ativas e inativas. */
export function regrasAtuais(todas: readonly Destinatario[]): Destinatario[] {
  const substituidas = new Set(todas.map((d) => d.substitui_id).filter(Boolean))
  return todas.filter((d) => !substituidas.has(d.id))
}

/** Histórico de uma regra: da mais nova para a primeira. */
export function historicoDaRegra(todas: readonly Destinatario[], id: string): Destinatario[] {
  const porId = new Map(todas.map((d) => [d.id, d]))
  const saida: Destinatario[] = []
  let atual = porId.get(id)
  while (atual && saida.length < 1000) {
    saida.push(atual)
    atual = atual.substitui_id ? porId.get(atual.substitui_id) : undefined
  }
  return saida
}

export const chavePessoa = (empresa: string, colaborador: string) => `${normalizar(empresa)}|${normalizar(colaborador)}`

const mesmaPasta = (a: string, b: string) => normalizar(a).replace(/\s+/g, ' ') === normalizar(b).replace(/\s+/g, ' ')

/** O pavimento de uma folha da lista vigente (o 5º pedaço do código é o nome curto; o título completa). */
export const pavimentoDaFolha = (v: Partial<Pick<Vigente, 'codigo' | 'titulo'>>) => pavimentoDe({ nome_curto: (v.codigo ?? '').split('.')[4] ?? '', titulo: v.titulo ?? '' })

/** A chave de uma regra: disciplina, pasta, pavimento e pessoa (a mesma chave = versão nova da mesma regra). */
export const chaveRegra = (r: Pick<DadosDestinatario, 'disciplina' | 'pasta' | 'pavimento' | 'empresa' | 'colaborador'>) =>
  `${r.disciplina}|${normalizar(r.pasta)}|${normalizar(r.pavimento ?? '')}|${chavePessoa(r.empresa, r.colaborador)}`

/**
 * As regras ativas que valem para uma folha: as da pasta dela; se não houver nenhuma, as da disciplina inteira.
 * Regra com pavimento só vale para as folhas daquele pavimento (21/11/2026: "fulano recebe o 3º pavimento").
 */
export function regrasDaFolha(regras: readonly Destinatario[], v: Pick<Vigente, 'disciplina' | 'pasta'> & Partial<Pick<Vigente, 'codigo' | 'titulo'>>): Destinatario[] {
  let pav: string | null = null
  const doPavimento = (r: Destinatario) => !r.pavimento || normalizar(r.pavimento) === normalizar((pav ??= pavimentoDaFolha(v)))
  const ativas = regras.filter((r) => r.ativo && r.disciplina === v.disciplina && doPavimento(r))
  const daPasta = ativas.filter((r) => r.pasta && mesmaPasta(r.pasta, v.pasta))
  return daPasta.length ? daPasta : ativas.filter((r) => !r.pasta)
}

export interface Pendencia {
  regra: Destinatario
  vigente: Vigente
  /** trocar = a pessoa tem uma cópia antiga em campo; nova = revisão saiu depois que a regra passou a valer */
  motivo: 'trocar' | 'nova'
  /** cópias antigas que a pessoa deve devolver */
  devolver: CopiaCruzada[]
}

export interface GrupoAEntregar {
  empresa: string
  colaborador: string
  pendencias: Pendencia[]
}

/**
 * O que falta entregar, por pessoa. Para cada folha da lista vigente e cada regra que vale para ela:
 * - a pessoa já tem a vigente em campo (em dia): nada;
 * - tem só cópia desatualizada em campo: "trocar" (entregar a nova e recolher a antiga);
 * - não tem nenhuma, e a revisão vigente é de depois que a regra passou a valer: "nova".
 * Regra sem colaborador vale para a empresa: qualquer pessoa dela com a cópia conta.
 */
export function aEntregar(vigentes: readonly Vigente[], cruzadas: readonly CopiaCruzada[], regras: readonly Destinatario[]): GrupoAEntregar[] {
  // cópias em campo por folha
  const porFolha = new Map<string, CopiaCruzada[]>()
  for (const x of cruzadas) {
    if (!x.vigente || x.situacao !== 'em campo') continue
    const k = chaveFolha(x.vigente)
    porFolha.set(k, [...(porFolha.get(k) ?? []), x])
  }
  const folhas = new Map<string, Vigente[]>()
  for (const v of vigentes) folhas.set(chaveFolha(v), [...(folhas.get(chaveFolha(v)) ?? []), v])

  const grupos = new Map<string, GrupoAEntregar>()
  for (const [k, vs] of folhas) {
    const v = melhor(vs)
    const copias = porFolha.get(k) ?? []
    for (const r of regrasDaFolha(regras, v)) {
      const daPessoa = copias.filter(
        (x) => normalizar(x.copia.empresa) === normalizar(r.empresa) && (!r.colaborador || normalizar(x.copia.colaborador) === normalizar(r.colaborador)),
      )
      if (daPessoa.some((x) => x.resultado === 'em dia')) continue
      const antigas = daPessoa.filter((x) => x.resultado === 'desatualizada')
      let motivo: Pendencia['motivo'] | null = null
      if (antigas.length) motivo = 'trocar'
      else if (!daPessoa.length && v.data && v.data >= r.desde) motivo = 'nova'
      if (!motivo) continue
      const gk = chavePessoa(r.empresa, r.colaborador)
      const g = grupos.get(gk) ?? { empresa: r.empresa, colaborador: r.colaborador, pendencias: [] }
      g.pendencias.push({ regra: r, vigente: v, motivo, devolver: antigas })
      grupos.set(gk, g)
    }
  }
  const lista = [...grupos.values()]
  for (const g of lista) g.pendencias.sort((a, b) => a.vigente.disciplina.localeCompare(b.vigente.disciplina, 'pt-BR') || a.vigente.codigo.localeCompare(b.vigente.codigo))
  return lista.sort((a, b) => b.pendencias.length - a.pendencias.length || a.empresa.localeCompare(b.empresa, 'pt-BR') || a.colaborador.localeCompare(b.colaborador, 'pt-BR'))
}

const COLUNAS = ['disciplina', 'empresa']

/**
 * Lê a lista sugerida (destinatarios_sugeridos.csv do conversor, ou feita à mão):
 * disciplina;pasta;empresa;colaborador;copias;ativo (e pavimento, opcional). Linhas iguais (mesma disciplina, pasta,
 * pavimento e pessoa) viram uma.
 */
export function lerListaDestinatarios(texto: string, hoje: string): DadosDestinatario[] {
  const linhas = lerCsv(texto)
  if (!linhas.length) throw new ErroDeArquivo('O arquivo da lista de distribuição está vazio.')
  const faltam = COLUNAS.filter((c) => !(c in linhas[0]))
  if (faltam.length) throw new ErroDeArquivo(`O arquivo da lista de distribuição não tem as colunas: ${faltam.join(', ')}.`)
  const vistas = new Set<string>()
  const saida: DadosDestinatario[] = []
  for (const l of linhas) {
    const disciplina = normalizar(l.disciplina ?? '')
    const empresa = (l.empresa ?? '').trim()
    if (!disciplina || !empresa || disciplina === 'DISCIPLINA') continue
    const d: DadosDestinatario = {
      disciplina,
      pasta: (l.pasta ?? '').trim(),
      pavimento: (l.pavimento ?? '').trim(),
      empresa,
      colaborador: (l.colaborador ?? '').trim(),
      copias: Math.max(1, Number(l.copias) || 1),
      ativo: !/^(nao|não|n|0|false)$/i.test((l.ativo ?? '').trim()),
      desde: hoje,
    }
    const k = chaveRegra(d)
    if (vistas.has(k)) continue
    vistas.add(k)
    saida.push(d)
  }
  return saida
}

/** Junta a lista importada com as regras que já existem: a mesma regra (disciplina, pasta, pavimento, pessoa) vira versão nova. */
export function mesclarLista(atuais: readonly Destinatario[], novas: readonly DadosDestinatario[]): (DadosDestinatario & { substitui_id: string | null })[] {
  const porChave = new Map(atuais.map((r) => [chaveRegra(r), r]))
  const saida: (DadosDestinatario & { substitui_id: string | null })[] = []
  for (const n of novas) {
    const ja = porChave.get(chaveRegra(n))
    if (ja && ja.ativo === n.ativo && ja.copias === n.copias) continue // nada mudou
    saida.push({ ...n, desde: ja ? ja.desde : n.desde, substitui_id: ja?.id ?? null })
  }
  return saida
}

// ---------------------------------------------------------------------------------------------
// Sugerir regras pelo que cada um tem (21/11/2026, item B das 5 listas)
// ---------------------------------------------------------------------------------------------

export interface SugestaoRegra {
  dados: DadosDestinatario
  /** quantas folhas da lista vigente a pessoa tem em campo nesse grupo */
  folhas: number
  /** a regra (desativada) que a sugestão reativaria; null = regra nova */
  substitui_id: string | null
}

/**
 * Uma sugestão por pessoa × disciplina × pavimento, a partir das cópias em campo (ficha + entregas do app).
 * Cópias = o maior número de cópias que a pessoa tem de uma folha do grupo. Quando a pessoa tem todos os
 * pavimentos da disciplina, a sugestão vira uma só, sem pavimento. O que uma regra ativa já cobre não aparece.
 * Nada é gravado: o gestor confere, muda e confirma (só o confirmado vira regra).
 */
export function sugerirRegras(vigentes: readonly Vigente[], cruzadas: readonly CopiaCruzada[], regras: readonly Destinatario[], hoje: string): SugestaoRegra[] {
  interface Grupo { empresa: string; colaborador: string; disciplina: string; pavimento: string; folhas: Set<string>; copias: number }
  const grupos = new Map<string, Grupo>()
  const cobre = (r: Destinatario, x: CopiaCruzada) =>
    normalizar(r.empresa) === normalizar(x.copia.empresa) && (!r.colaborador || normalizar(r.colaborador) === normalizar(x.copia.colaborador))
  for (const x of cruzadas) {
    if (x.situacao !== 'em campo' || !x.vigente || !x.copia.empresa.trim()) continue
    if (regrasDaFolha(regras, x.vigente).some((r) => cobre(r, x))) continue // já tem regra
    const pavimento = pavimentoDaFolha(x.vigente)
    const k = `${chavePessoa(x.copia.empresa, x.copia.colaborador)}|${x.vigente.disciplina}|${pavimento}`
    const g = grupos.get(k) ?? { empresa: x.copia.empresa.trim(), colaborador: x.copia.colaborador.trim(), disciplina: x.vigente.disciplina, pavimento, folhas: new Set<string>(), copias: 1 }
    g.folhas.add(chaveFolha(x.vigente))
    g.copias = Math.max(g.copias, Number(x.copia.copias) || 1)
    grupos.set(k, g)
  }
  // pavimentos que existem em cada disciplina da lista vigente
  const pavDaDisc = new Map<string, Set<string>>()
  for (const v of vigentes) pavDaDisc.set(v.disciplina, (pavDaDisc.get(v.disciplina) ?? new Set()).add(pavimentoDaFolha(v)))
  // junta por pessoa × disciplina: com todos os pavimentos, vira uma regra só
  const porPessoaDisc = new Map<string, Grupo[]>()
  for (const g of grupos.values()) {
    const k = `${chavePessoa(g.empresa, g.colaborador)}|${g.disciplina}`
    porPessoaDisc.set(k, [...(porPessoaDisc.get(k) ?? []), g])
  }
  const saida: SugestaoRegra[] = []
  const atuais = new Map(regras.map((r) => [chaveRegra(r), r]))
  const empurrar = (g: Omit<Grupo, 'folhas'>, folhas: number) => {
    const dados: DadosDestinatario = { disciplina: g.disciplina, pasta: '', pavimento: g.pavimento, empresa: g.empresa, colaborador: g.colaborador, copias: g.copias, ativo: true, desde: hoje }
    saida.push({ dados, folhas, substitui_id: atuais.get(chaveRegra(dados))?.id ?? null })
  }
  for (const gs of porPessoaDisc.values()) {
    const todos = pavDaDisc.get(gs[0].disciplina) ?? new Set<string>()
    if (todos.size > 1 && [...todos].every((p) => gs.some((g) => g.pavimento === p))) {
      empurrar({ ...gs[0], pavimento: '', copias: Math.max(...gs.map((g) => g.copias)) }, gs.reduce((s, g) => s + g.folhas.size, 0))
    } else if (todos.size <= 1) {
      empurrar({ ...gs[0], pavimento: '' }, gs[0].folhas.size)
    } else for (const g of gs) empurrar(g, g.folhas.size)
  }
  return saida.sort(
    (a, b) =>
      a.dados.empresa.localeCompare(b.dados.empresa, 'pt-BR') ||
      a.dados.colaborador.localeCompare(b.dados.colaborador, 'pt-BR') ||
      a.dados.disciplina.localeCompare(b.dados.disciplina, 'pt-BR') ||
      ordemPavimento(a.dados.pavimento ?? '') - ordemPavimento(b.dados.pavimento ?? ''),
  )
}

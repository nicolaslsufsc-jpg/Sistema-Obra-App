// Lista de distribuição (quem recebe cada projeto) e o que falta entregar (proposta aprovada em 20/11/2026).
// Uma regra vale para uma disciplina inteira ou para uma pasta do Autodoc dentro dela (ESTRUTURAL/LO/Vigas);
// a regra da pasta vale mais que a da disciplina. O destinatário é um nome (empresa + colaborador), sem conta.
// Nada se apaga: mudar ou desativar uma regra grava uma linha nova com `substitui_id` (como edicoes.ts).
// Fica no banco do navegador (meta `projetos_destinatarios:<obra>`), como a base, até a migração do núcleo.
import { banco } from '../nucleo/servicos'
import { chaveFolha } from './edicoes'
import { lerCsv, melhor, normalizar, ErroDeArquivo, type CopiaCruzada, type Vigente } from './painel'

export interface DadosDestinatario {
  /** disciplina normalizada (sem acento, maiúscula), como em Vigente.disciplina */
  disciplina: string
  /** pasta do Autodoc ("LO/Vigas"); vazio = a disciplina inteira */
  pasta: string
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

const chave = (obraId: string) => `projetos_destinatarios:${obraId}`

export async function lerDestinatarios(obraId: string): Promise<Destinatario[]> {
  return (await banco.lerMeta<Destinatario[]>(chave(obraId))) ?? []
}

/** Grava regras novas ou versões novas de regras (com `substitui_id`). Nada é apagado. */
export async function gravarDestinatarios(
  obraId: string,
  novas: (DadosDestinatario & { substitui_id?: string | null })[],
  usuario: string,
  agora = new Date(),
): Promise<Destinatario[]> {
  const todas = await lerDestinatarios(obraId)
  const linhas = novas.map((n) => ({ ...n, substitui_id: n.substitui_id ?? null, id: crypto.randomUUID(), em: agora.toISOString(), usuario }))
  const lista = [...todas, ...linhas]
  await banco.gravarMeta(chave(obraId), lista)
  return lista
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

/** As regras ativas que valem para uma folha: as da pasta dela; se não houver nenhuma, as da disciplina inteira. */
export function regrasDaFolha(regras: readonly Destinatario[], v: Pick<Vigente, 'disciplina' | 'pasta'>): Destinatario[] {
  const ativas = regras.filter((r) => r.ativo && r.disciplina === v.disciplina)
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
 * disciplina;pasta;empresa;colaborador;copias;ativo. Linhas iguais (mesma disciplina, pasta e pessoa) viram uma.
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
      empresa,
      colaborador: (l.colaborador ?? '').trim(),
      copias: Math.max(1, Number(l.copias) || 1),
      ativo: !/^(nao|não|n|0|false)$/i.test((l.ativo ?? '').trim()),
      desde: hoje,
    }
    const k = `${d.disciplina}|${normalizar(d.pasta)}|${chavePessoa(d.empresa, d.colaborador)}`
    if (vistas.has(k)) continue
    vistas.add(k)
    saida.push(d)
  }
  return saida
}

/** Junta a lista importada com as regras que já existem: a mesma regra (disciplina, pasta, pessoa) vira versão nova. */
export function mesclarLista(atuais: readonly Destinatario[], novas: readonly DadosDestinatario[]): (DadosDestinatario & { substitui_id: string | null })[] {
  const porChave = new Map(atuais.map((r) => [`${r.disciplina}|${normalizar(r.pasta)}|${chavePessoa(r.empresa, r.colaborador)}`, r]))
  const saida: (DadosDestinatario & { substitui_id: string | null })[] = []
  for (const n of novas) {
    const ja = porChave.get(`${n.disciplina}|${normalizar(n.pasta)}|${chavePessoa(n.empresa, n.colaborador)}`)
    if (ja && ja.ativo === n.ativo && ja.copias === n.copias) continue // nada mudou
    saida.push({ ...n, desde: ja ? ja.desde : n.desde, substitui_id: ja?.id ?? null })
  }
  return saida
}

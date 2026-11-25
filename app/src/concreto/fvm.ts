// FVM: recebimento de materiais controlados (PBQP-H/SiAC 8.6.1 e 8.5.2), dentro do módulo Concreto.
// Proposta de 14/11/2026 (fora do repositório, 09_ESTAGIO\PBQP-H\fvm_proposta.md). Aqui só as regras,
// sem tela e sem banco, para testar sozinhas.
//
// A lista de materiais controlados e os critérios de aceite são DADO da obra: chegam num arquivo
// `materiais.json` (o mesmo formato que o pacote da obra vai trazer) e nunca ficam no código.

export interface ItemDeCriterio {
  codigo: string
  texto: string
  /** Item medido: o número digitado decide C (dentro) ou NC (fora). */
  valor?: { min: number; max: number }
}

export interface MaterialControlado {
  codigo: string
  nome: string
  unidade: string
  /** Material estrutural: o lote é obrigatório (rastreabilidade, 8.5.2.2). */
  estrutural: boolean
  /** Precisa de ensaio antes de usar: o recebimento começa retido. */
  exige_ensaio: boolean
  /** "concreto": recebido pelo fluxo do caminhão, não por esta ficha. */
  via: string | null
  itens: ItemDeCriterio[]
  /** Documentos que devem vir com a entrega (ex.: certificado do lote). */
  documentos: string[]
  ordem: number
}

export type Resposta = 'C' | 'NC' | 'NA'

export interface ConferenciaDoItem {
  codigo: string
  texto: string
  resultado: Resposta
  valor: number | null
  observacao: string | null
}

export type SituacaoRecebimento = 'liberado' | 'liberado_ressalva' | 'retido' | 'devolvido'

export const ROTULO_SITUACAO_RECEBIMENTO: Record<SituacaoRecebimento, string> = {
  liberado: 'Liberado',
  liberado_ressalva: 'Liberado com ressalva',
  retido: 'Retido — não usar',
  devolvido: 'Devolvido',
}

export const LIMITES = { fornecedor: 200, nota_fiscal: 40, lote: 60, observacao: 2000, motivo: 500, quantidadeMax: 10_000_000 } as const

// ---------------------------------------------------------------------
// Lista de materiais (materiais.json)
// ---------------------------------------------------------------------

const texto = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Lê o materiais.json. Material com problema fica de fora e vira uma linha em `erros`; o resto entra. */
export function lerListaDeMateriais(conteudo: string): { materiais: MaterialControlado[]; erros: string[] } {
  let dados: unknown
  try {
    dados = JSON.parse(conteudo)
  } catch {
    return { materiais: [], erros: ['O arquivo não é um materiais.json válido (JSON com erro).'] }
  }
  const lista = (dados as { materiais?: unknown })?.materiais
  if (!Array.isArray(lista)) return { materiais: [], erros: ['O arquivo não tem a lista "materiais".'] }
  const materiais: MaterialControlado[] = []
  const erros: string[] = []
  const vistos = new Set<string>()
  lista.forEach((m: Record<string, unknown>, i) => {
    const codigo = texto(m?.codigo, 40)
    const nome = texto(m?.nome, 120)
    const onde = codigo || `item ${i + 1}`
    if (!codigo || !nome) return erros.push(`${onde}: falta o código ou o nome.`)
    if (vistos.has(codigo)) return erros.push(`${codigo}: código repetido (fica só o primeiro).`)
    const via = texto(m.via, 20) || null
    const itens: ItemDeCriterio[] = []
    const brutos = Array.isArray(m.itens) ? (m.itens as Record<string, unknown>[]) : []
    for (const [j, it] of brutos.entries()) {
      const t = texto(it?.texto, 300)
      if (!t) continue
      const item: ItemDeCriterio = { codigo: texto(it.codigo, 20) || String(j + 1), texto: t }
      const v = it.valor as { min?: unknown; max?: unknown } | undefined
      if (v && Number.isFinite(Number(v.min)) && Number.isFinite(Number(v.max)) && Number(v.min) <= Number(v.max)) {
        item.valor = { min: Number(v.min), max: Number(v.max) }
      }
      itens.push(item)
    }
    if (!via && itens.length === 0) return erros.push(`${codigo}: sem itens de conferência.`)
    vistos.add(codigo)
    materiais.push({
      codigo,
      nome,
      unidade: texto(m.unidade, 20) || 'un',
      estrutural: m.estrutural === true,
      exige_ensaio: m.exige_ensaio === true,
      via,
      itens,
      documentos: (Array.isArray(m.documentos) ? m.documentos : []).map((d) => texto(d, 200)).filter(Boolean),
      ordem: materiais.length,
    })
  })
  return { materiais, erros }
}

/** Campos de um material como vão para a linha de `materiais_controlados`. */
export function camposDoMaterial(m: MaterialControlado): Record<string, unknown> {
  return {
    codigo: m.codigo,
    nome: m.nome,
    unidade: m.unidade,
    estrutural: m.estrutural,
    exige_ensaio: m.exige_ensaio,
    via: m.via,
    itens: m.itens,
    documentos: m.documentos,
    ordem: m.ordem,
  }
}

/**
 * O que muda ao importar uma lista nova: material novo entra, o que mudou vira correção e o que
 * saiu da lista é cancelado (os recebimentos dele continuam, com a cópia do nome e dos itens).
 */
export function compararListas<A extends { codigo: string }>(
  atuais: readonly A[],
  novos: readonly MaterialControlado[],
): { incluir: MaterialControlado[]; corrigir: { atual: A; novo: MaterialControlado }[]; cancelar: A[] } {
  const porCodigo = new Map(atuais.map((a) => [a.codigo, a]))
  const incluir: MaterialControlado[] = []
  const corrigir: { atual: A; novo: MaterialControlado }[] = []
  for (const n of novos) {
    const a = porCodigo.get(n.codigo)
    if (!a) incluir.push(n)
    else if (JSON.stringify(camposDoMaterial(n)) !== JSON.stringify(camposDoMaterial(a as unknown as MaterialControlado))) corrigir.push({ atual: a, novo: n })
  }
  const codigosNovos = new Set(novos.map((n) => n.codigo))
  return { incluir, corrigir, cancelar: atuais.filter((a) => !codigosNovos.has(a.codigo)) }
}

// ---------------------------------------------------------------------
// Editor do modelo de material (gestor, 25/11): o mesmo dado do materiais.json, digitado no app
// ---------------------------------------------------------------------

export const LIMITES_MATERIAL = { codigo: 40, nome: 120, unidade: 20, item: 300, itens: 200, documento: 200, documentos: 50 } as const

export interface FormMaterial {
  codigo: string
  nome: string
  unidade: string
  estrutural: boolean
  exige_ensaio: boolean
  /** cada item com o código que já tinha (vazio = item novo) */
  itens: { codigo: string; texto: string }[]
  documentos: string[]
}

/**
 * Erros do formulário (chave = campo; "item:<i>" e "doc:<i>" pela posição). Vazio = pode salvar.
 * `outrosCodigos`: códigos dos outros materiais da obra (o código não repete).
 */
export function errosDoMaterial(f: FormMaterial, outrosCodigos: readonly string[], via: string | null = null): Record<string, string> {
  const e: Record<string, string> = {}
  const codigo = f.codigo.trim()
  if (!codigo) e.codigo = 'Informe o código (ex.: ACO-CA50).'
  else if (codigo.length > LIMITES_MATERIAL.codigo) e.codigo = `Código com no máximo ${LIMITES_MATERIAL.codigo} letras.`
  else if (outrosCodigos.some((c) => c.toLowerCase() === codigo.toLowerCase())) e.codigo = 'Já existe um material com esse código.'
  if (!f.nome.trim()) e.nome = 'Informe o nome do material.'
  else if (f.nome.trim().length > LIMITES_MATERIAL.nome) e.nome = `Nome com no máximo ${LIMITES_MATERIAL.nome} letras.`
  if (f.unidade.trim().length > LIMITES_MATERIAL.unidade) e.unidade = `Unidade com no máximo ${LIMITES_MATERIAL.unidade} letras.`
  const itens = f.itens.filter((i) => i.texto.trim())
  if (!via && itens.length === 0) e.itens = 'Escreva pelo menos um item a conferir no recebimento.'
  if (itens.length > LIMITES_MATERIAL.itens) e.itens = `No máximo ${LIMITES_MATERIAL.itens} itens.`
  f.itens.forEach((i, n) => {
    if (i.texto.trim().length > LIMITES_MATERIAL.item) e[`item:${n}`] = `Item com no máximo ${LIMITES_MATERIAL.item} letras.`
  })
  const docs = f.documentos.filter((d) => d.trim())
  if (docs.length > LIMITES_MATERIAL.documentos) e.documentos = `No máximo ${LIMITES_MATERIAL.documentos} documentos.`
  f.documentos.forEach((d, n) => {
    if (d.trim().length > LIMITES_MATERIAL.documento) e[`doc:${n}`] = `Documento com no máximo ${LIMITES_MATERIAL.documento} letras.`
  })
  return e
}

/**
 * Material pronto para gravar. Item que já existia fica com o mesmo código (e com a faixa `valor`, se a
 * lista importada trazia); item novo ganha o próximo número livre. Linhas em branco saem.
 */
export function materialDoFormulario(
  f: FormMaterial,
  base: Pick<MaterialControlado, 'via' | 'ordem' | 'itens'> | null,
  ordemNova: number,
): MaterialControlado {
  const antigos = new Map((base?.itens ?? []).map((i) => [i.codigo, i]))
  const usados = new Set(f.itens.map((i) => i.codigo).filter(Boolean))
  let proximo = 1
  const novoCodigo = () => {
    while (usados.has(String(proximo)) || antigos.has(String(proximo))) proximo++
    usados.add(String(proximo))
    return String(proximo)
  }
  const itens: ItemDeCriterio[] = f.itens
    .filter((i) => i.texto.trim())
    .map((i) => {
      const antigo = i.codigo ? antigos.get(i.codigo) : undefined
      const item: ItemDeCriterio = { codigo: antigo ? antigo.codigo : novoCodigo(), texto: i.texto.trim() }
      if (antigo?.valor) item.valor = antigo.valor
      return item
    })
  const documentos = [...new Set(f.documentos.map((d) => d.trim()).filter(Boolean))]
  return {
    codigo: f.codigo.trim(),
    nome: f.nome.trim(),
    unidade: f.unidade.trim() || 'un',
    estrutural: f.estrutural,
    exige_ensaio: f.exige_ensaio,
    via: base?.via ?? null,
    itens,
    documentos,
    ordem: base ? base.ordem : ordemNova,
  }
}

/** Formulário a partir de um material (para editar) ou vazio (material novo). */
export function formularioDoMaterial(m: MaterialControlado | null): FormMaterial {
  if (!m) return { codigo: '', nome: '', unidade: 'un', estrutural: false, exige_ensaio: false, itens: [{ codigo: '', texto: '' }], documentos: [] }
  return {
    codigo: m.codigo,
    nome: m.nome,
    unidade: m.unidade,
    estrutural: m.estrutural,
    exige_ensaio: m.exige_ensaio,
    itens: m.itens.map((i) => ({ codigo: i.codigo, texto: i.texto })),
    documentos: [...m.documentos],
  }
}

// ---------------------------------------------------------------------
// Ficha de recebimento
// ---------------------------------------------------------------------

/** Resultado de um item medido: dentro da faixa é C, fora é NC; sem número, nada ainda. */
export function resultadoDoValor(item: ItemDeCriterio, valor: number | null): Resposta | null {
  if (!item.valor || valor === null || Number.isNaN(valor)) return null
  return valor >= item.valor.min && valor <= item.valor.max ? 'C' : 'NC'
}

/** O que o app sugere: algum NC → devolver; exige ensaio ou faltou documento → reter; senão, liberar. */
export function situacaoSugerida(
  material: Pick<MaterialControlado, 'exige_ensaio'>,
  conferencia: readonly Pick<ConferenciaDoItem, 'resultado'>[],
  faltaDocumento = false,
): SituacaoRecebimento {
  if (conferencia.some((c) => c.resultado === 'NC')) return 'devolvido'
  return material.exige_ensaio || faltaDocumento ? 'retido' : 'liberado'
}

/**
 * Situações que a pessoa pode escolher no recebimento. Com NC não há "Liberado" puro: só com ressalva
 * (concessão). Material que exige ensaio não sai liberado do portão: retido ou devolvido, e quem libera
 * depois é o gestor (decisão 5 da proposta).
 */
export function situacoesPossiveis(
  conferencia: readonly Pick<ConferenciaDoItem, 'resultado'>[],
  material?: Pick<MaterialControlado, 'exige_ensaio'>,
): SituacaoRecebimento[] {
  const temNc = conferencia.some((c) => c.resultado === 'NC')
  if (material?.exige_ensaio) return temNc ? ['devolvido', 'retido'] : ['retido', 'devolvido']
  return temNc ? ['devolvido', 'retido', 'liberado_ressalva'] : ['liberado', 'retido', 'devolvido']
}

export interface FormRecebimento {
  data: string
  fornecedor: string
  nota_fiscal: string
  lote: string
  quantidade: number | null
  conferencia: ConferenciaDoItem[]
  situacao: SituacaoRecebimento | null
  motivo: string
}

/** Erros por campo (chave = campo; "item:<codigo>" para um item da conferência). Vazio = pode salvar. */
export function errosDoRecebimento(material: MaterialControlado, f: FormRecebimento, hoje: string): Record<string, string> {
  const e: Record<string, string> = {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data)) e.data = 'Informe a data.'
  else if (f.data > hoje) e.data = 'A data do recebimento não pode ser depois de hoje.'
  if (!f.fornecedor.trim()) e.fornecedor = 'Informe o fornecedor.'
  if (!f.nota_fiscal.trim()) e.nota_fiscal = 'Informe a nota fiscal.'
  if (material.estrutural && !f.lote.trim()) e.lote = 'Material estrutural: informe o lote (ou a corrida).'
  if (f.quantidade === null) e.quantidade = 'Informe a quantidade.'
  else if (Number.isNaN(f.quantidade) || f.quantidade <= 0 || f.quantidade > LIMITES.quantidadeMax) e.quantidade = 'Quantidade: número maior que zero.'
  for (const item of material.itens) {
    const c = f.conferencia.find((x) => x.codigo === item.codigo)
    if (!c) e[`item:${item.codigo}`] = 'Marque C, NC ou NA.'
    else if (c.resultado === 'NC' && !c.observacao?.trim()) e[`item:${item.codigo}`] = 'NC: escreva o que estava errado.'
  }
  if (!f.situacao) e.situacao = 'Escolha o resultado do recebimento.'
  else if (!situacoesPossiveis(f.conferencia, material).includes(f.situacao)) {
    e.situacao = material.exige_ensaio
      ? 'Material com ensaio: fica retido (ou devolvido) até o gestor liberar.'
      : 'Com item NC, só dá para devolver, reter ou liberar com ressalva.'
  }
  else if (f.situacao !== 'liberado' && !f.motivo.trim()) e.motivo = 'Escreva o motivo (o que fazer com o material).'
  return e
}

// ---------------------------------------------------------------------
// Lista de recebimentos
// ---------------------------------------------------------------------

/** Retidos primeiro (não podem ser usados), depois do mais novo para o mais antigo. */
export function ordenarRecebimentos<R extends { situacao: string; data: string; criado_em_dispositivo: string }>(lista: readonly R[]): R[] {
  return [...lista].sort(
    (a, b) =>
      Number(b.situacao === 'retido') - Number(a.situacao === 'retido') ||
      b.data.localeCompare(a.data) ||
      b.criado_em_dispositivo.localeCompare(a.criado_em_dispositivo),
  )
}

// ---------------------------------------------------------------------
// Onde o lote foi usado (recebimento_usos, 25/11): marcado à mão, como a ligação entre fichas da FVS
// ---------------------------------------------------------------------

export const LIMITES_USO = { local_texto: 200, observacao: 1000 } as const

export interface FormUso {
  pavimento_id: string
  elemento_id: string | null
  local_texto: string
  quantidade: number | null
  data: string
}

/** Material retido ou devolvido não pode ser usado: a tela nem mostra o formulário. */
export function podeMarcarUso(situacao: SituacaoRecebimento): boolean {
  return situacao === 'liberado' || situacao === 'liberado_ressalva'
}

/** Erros por campo. Vazio = pode salvar. A data vai do recebimento até hoje. */
export function errosDoUso(f: FormUso, recebimento: { data: string; situacao: SituacaoRecebimento }, hoje: string): Record<string, string> {
  const e: Record<string, string> = {}
  if (!podeMarcarUso(recebimento.situacao)) e.situacao = 'Material retido ou devolvido não pode ser usado.'
  if (!f.pavimento_id) e.pavimento_id = 'Escolha o pavimento.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data)) e.data = 'Informe a data.'
  else if (f.data > hoje) e.data = 'A data não pode ser depois de hoje.'
  else if (f.data < recebimento.data) e.data = 'A data não pode ser antes do recebimento.'
  if (f.quantidade !== null && (Number.isNaN(f.quantidade) || f.quantidade <= 0 || f.quantidade > LIMITES.quantidadeMax)) {
    e.quantidade = 'Quantidade: número maior que zero (ou deixe em branco).'
  }
  if (f.local_texto.trim().length > LIMITES_USO.local_texto) e.local_texto = `No máximo ${LIMITES_USO.local_texto} letras.`
  return e
}

/** Soma da quantidade marcada nos usos (os sem quantidade não entram). */
export function quantidadeUsada(usos: readonly { quantidade: number | null }[]): number {
  return usos.reduce((s, u) => s + (u.quantidade ?? 0), 0)
}

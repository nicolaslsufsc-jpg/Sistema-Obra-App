// Situação das peças nas fichas (PVS), a partir dos registros de campo (só inclusão).
//
// Regras (docs/modulos/1_fvs.md):
// - Vale o último registro de cada peça + ficha + item (por criado_em_dispositivo, depois id).
// - Resultado C (conforme), NC (não conforme), NA (não aplicável) ou vazio (desmarcado). Até 08/11/2026
//   eram A (aprovado) e R (reprovado): o que foi gravado assim é lido como C e NC (normalizarResultado).
// - Rodada: V01 até a primeira não conformidade. Marcar C, NC ou NA num item que está NC é a reinspeção:
//   vai para a rodada seguinte (V02, V03...). Mudar só a observação de um NC fica na mesma rodada.
// - Peça liberada na ficha: todos os itens com último resultado C ou NA. Qualquer NC = reprovada.
// - Liberada para concretar: sem nenhum NC, todos os itens das etapas antes da concretagem com C ou NA,
//   e a ficha ainda não terminou. Ficha sem etapa de concretagem (alvenaria, por exemplo) não tem isso.
// - Ficha aberta (FichaCampo): a ficha de um local no sistema oficial. A mesma peça pode ter mais de
//   uma (ficha duplicada): cada uma tem os seus registros e a sua situação, e nenhuma apaga a outra.

export type Resultado = 'C' | 'NC' | 'NA'

/** Locais que não são peça de estrutura: ambiente, furo, esquadria e parede de alvenaria (modulação, 20/11). */
export const FORA_DA_ESTRUTURA: ReadonlySet<string> = new Set(['A', 'F', 'E', 'M'])

/** Nome por extenso de cada resultado, como na ficha (PVS). */
export const NOME_DO_RESULTADO: Record<Resultado, string> = { C: 'Conforme', NC: 'Não conforme', NA: 'Não aplicável' }

/**
 * Resultado gravado, em qualquer formato, no formato atual. Até 08/11/2026 o app, o .obra e o histórico
 * do sistema oficial gravavam A (aprovado) e R (reprovado): continuam valendo, como C e NC. Nada é regravado;
 * a tradução é feita toda vez que o registro é lido. Valor desconhecido vira vazio.
 */
export function normalizarResultado(valor: unknown): Resultado | null {
  switch (valor) {
    case 'C':
    case 'A':
      return 'C'
    case 'NC':
    case 'R':
      return 'NC'
    case 'NA':
      return 'NA'
    default:
      return null
  }
}

export interface ItemFicha {
  n: number
  etapa: string
  titulo: string
  descricao?: string
  dispositivo?: string
  tolerancia?: string
  /**
   * Etapa da concretagem marcada à mão (Nova obra, 09/11/2026): true nos itens da etapa de concretagem,
   * false nos outros. Ficha sem esta marca em nenhum item (as de antes) continua adivinhando pelo nome
   * da etapa. Todos false = ficha sem etapa de concretagem.
   */
  concretagem?: boolean
  /**
   * Item do rastreio do concreto (19/11/2026): fica C, só calculado, quando a peça tem caminhão lançado
   * no Concreto (fvs/rastreio.ts). Um por ficha, só em pilar e viga. Vem da ficha, como dado.
   */
  rastreio_concreto?: boolean
  /**
   * Item de uma parte do pilar ("consolo", "capitel"): só vale no pilar que tem a parte na planta
   * (o pacote diz quais têm). Nos outros, só conta se alguém marcar. Vem da ficha modelo, como dado.
   */
  parte?: string
  /**
   * Item de furação da ficha de viga ("passagens em vigas"): quem marca são os furos da viga na planta
   * (aba Furos). Todos OK: C; algum errado: NC; algum sem conferir: pendente. Vem da ficha, como dado.
   */
  furos?: boolean
  /**
   * Item de armadura da ficha de laje: quem marca são as barras das pranchas de armação na planta de forma
   * (aba Barras, plano A de 18/11/2026). Todas as barras da área OK: C; alguma errada: NC. Vem da ficha.
   */
  barras?: boolean
  /**
   * Item dos pontos de instalação na ficha de laje (item 4, 19/11/2026): esgoto e água são marcados pelos
   * furos de laje SAN e HID da área (furos_laje.ts); a elétrica fica à mão. Vem da ficha.
   */
  instalacao?: 'esgoto' | 'agua' | 'eletrica'
  /**
   * Item da ficha de ambiente que os pontos de uma disciplina marcam (instalações, 20/11/2026): na planta da
   * disciplina (aba Pontos) a pessoa confere ralo, caixa, ponto de água... um a um (pontos.ts). Vem da ficha.
   */
  pontos?: 'hidro' | 'sanitario' | 'eletrico' | 'preventivo' | 'spda'
  /**
   * Item de vão ou esquadria da ficha de ambiente ("eixos e vãos", "requadros", "recorte na porta"): quem
   * marca são as esquadrias do ambiente na planta (aba Esquadrias, 19/11/2026), uma a uma, como os furos.
   * Pode haver mais de um na ficha; a pessoa escolhe qual no topo da aba. Vem da ficha, como dado.
   */
  esquadrias?: boolean
}

export interface Ficha {
  id: string
  codigo: string
  titulo: string
  revisao: string
  aplica_a: string[]
  itens: ItemFicha[]
  /** só na tela (fichaNaPeca): as partes que a peça tem na planta; nunca gravado */
  partesDaPeca?: readonly string[]
}

const fichasNaPeca = new WeakMap<Ficha, Map<string, Ficha>>()

/**
 * A ficha como vale numa peça: os itens das partes que ela tem (consolo, capitel) passam a contar.
 * Peça sem parte, ou ficha sem item de parte: a própria ficha. Guardada, para a mesma peça receber
 * sempre o mesmo objeto (a tela compara por igualdade para não recalcular).
 */
export function fichaNaPeca<F extends Ficha | undefined>(ficha: F, partes?: readonly string[]): F {
  if (!ficha) return ficha
  const base = (ficha as Ficha & { base?: Ficha }).base ?? ficha
  const validas = (partes ?? []).filter((t) => base.itens.some((it) => it.parte === t))
  if (!validas.length) return base as F
  const chave = [...new Set(validas)].sort().join('|')
  let porChave = fichasNaPeca.get(base)
  if (!porChave) fichasNaPeca.set(base, (porChave = new Map()))
  let f = porChave.get(chave)
  if (!f) {
    f = { ...base, partesDaPeca: chave.split('|') }
    Object.defineProperty(f, 'base', { value: base, enumerable: false })
    porChave.set(chave, f)
  }
  return f as F
}

/** O item conta na situação da peça: item comum, item de parte que a peça tem, ou já marcado. */
function itemConta(ficha: Ficha, it: ItemFicha, marcado: boolean): boolean {
  return !it.parte || marcado || !!ficha.partesDaPeca?.includes(it.parte)
}

/** As partes (consolo, capitel) que a ficha tem itens, na ordem em que aparecem. */
export function partesDaFicha(ficha: Ficha | undefined): string[] {
  const vistas: string[] = []
  for (const it of ficha?.itens ?? []) if (it.parte && !vistas.includes(it.parte)) vistas.push(it.parte)
  return vistas
}

/**
 * Situação de uma parte do pilar (consolo, capitel) só pelos itens dela. Ficha sem item da parte:
 * undefined (não há o que conferir).
 */
export function situacaoDaParte(ficha: Ficha | undefined, eventos: readonly EventoFvs[], parte: string): Situacao | undefined {
  const itens = ficha?.itens.filter((it) => it.parte === parte) ?? []
  if (!ficha || !itens.length) return undefined
  const ult = ultimosPorItem(eventos.filter((e) => e.ficha_id === ficha.id))
  let marcados = 0
  for (const it of itens) {
    const r = ult.get(it.n)?.resultado
    if (r === 'NC') return 'reprovado'
    if (r) marcados++
  }
  return marcados === 0 ? 'nada' : marcados >= itens.length ? 'liberado' : 'andamento'
}

export interface EventoFvs {
  id: string
  elemento_id: string
  ficha_id: string
  item: number
  resultado: Resultado | null
  rodada: number
  observacao: string | null
  lote_id: string | null
  planta_id: string | null
  usuario_id: string
  criado_em_dispositivo: string
  /** ficha aberta a que o registro pertence; vazio = marcado só no app, sem ficha aberta */
  ficha_campo_id?: string | null
  /** quem marcou, pelo nome, quando a pessoa não tem conta no app (histórico do sistema oficial) */
  verificado_por?: string | null
  /** id da verificação no sistema oficial: registro que veio de lá, e não foi marcado no app */
  origem_id?: string | null
}

/** Uma ficha aberta num local (no sistema oficial). Sem peça na planta: elemento_id vazio. */
export interface FichaCampo {
  id: string
  elemento_id: string | null
  /** local do sistema oficial (locais_sistema), também quando não é peça da planta */
  local_id?: string | null
  ficha_id: string | null
  codigo: string
  local: string
  ficha_codigo: string | null
  ficha_titulo: string | null
  status: string
  inspetor: string | null
  atualizada_em: string | null
  qtd_a: number
  qtd_r: number
  qtd_na: number
}

export type Situacao = 'nada' | 'andamento' | 'concretagem' | 'liberado' | 'reprovado'

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  nada: 'Pendente',
  andamento: 'Em andamento',
  concretagem: 'Liberado p/ concretar',
  liberado: 'Liberado',
  reprovado: 'Com NC',
}

export function maisNovo(a: EventoFvs, b: EventoFvs): boolean {
  if (a.criado_em_dispositivo !== b.criado_em_dispositivo) return a.criado_em_dispositivo > b.criado_em_dispositivo
  return a.id > b.id
}

/** Último registro de cada item (n do item → registro). */
export function ultimosPorItem(eventos: readonly EventoFvs[]): Map<number, EventoFvs> {
  const m = new Map<number, EventoFvs>()
  for (const e of eventos) {
    const atual = m.get(e.item)
    if (!atual || maisNovo(e, atual)) m.set(e.item, e)
  }
  return m
}

/** Histórico de um item, do mais antigo para o mais novo. */
export function historico(eventos: readonly EventoFvs[], item: number): EventoFvs[] {
  return eventos.filter((e) => e.item === item).sort((a, b) => (maisNovo(a, b) ? 1 : -1))
}

/** Uma rodada em que o item foi reprovado. */
export interface ReprovacaoDoItem {
  rodada: number
  /** o último NC da rodada: quando e quem */
  evento: EventoFvs
  observacao: string | null
  /** os registros NC da rodada (a foto fica no que estava valendo quando foi tirada) */
  eventos: EventoFvs[]
}

/**
 * As reprovações de um item, a partir do histórico dele (do mais antigo para o mais novo). A rodada
 * só conta se terminou em NC: NC desmarcado na mesma rodada foi engano.
 */
export function reprovacoesDoItem(hist: readonly EventoFvs[]): ReprovacaoDoItem[] {
  const porRodada = new Map<number, EventoFvs[]>()
  for (const e of hist) {
    const l = porRodada.get(e.rodada)
    if (l) l.push(e)
    else porRodada.set(e.rodada, [e])
  }
  const saida: ReprovacaoDoItem[] = []
  for (const [rodada, doItem] of [...porRodada].sort((a, b) => a[0] - b[0])) {
    const evento = doItem[doItem.length - 1]
    if (evento.resultado !== 'NC') continue
    const eventos = doItem.filter((e) => e.resultado === 'NC')
    // "O que fazer?" apagado no último registro é texto apagado, e não o de antes
    saida.push({ rodada, evento, observacao: evento.observacao, eventos })
  }
  return saida
}

export function etapasDa(ficha: Ficha): string[] {
  const vistas: string[] = []
  for (const it of ficha.itens) if (!vistas.includes(it.etapa)) vistas.push(it.etapa)
  return vistas
}

/** A etapa da concretagem em si ("CONCRETAGEM", "COLOCAÇÃO DE ARMADURAS E CONCRETAGEM"). "ANTES DA CONCRETAGEM" vem antes dela. */
function ehEtapaDeConcretar(etapa: string): boolean {
  const t = etapa.toUpperCase()
  return t.includes('CONCRET') && !t.includes('ANTES')
}

const itensAntesGuardados = new WeakMap<Ficha, readonly ItemFicha[]>()

/** Os itens que têm que estar prontos para concretar. Ficha sem etapa de concretagem: nenhum. */
export function itensAntesDaConcretagem(ficha: Ficha): readonly ItemFicha[] {
  const ja = itensAntesGuardados.get(ficha)
  if (ja) return ja
  const marcada = ficha.itens.some((it) => typeof it.concretagem === 'boolean')
  const i = marcada ? ficha.itens.findIndex((it) => it.concretagem === true) : ficha.itens.findIndex((it) => ehEtapaDeConcretar(it.etapa))
  // item de consolo e capitel não segura o azul do pilar: ele trava a área de laje (areas.ts)
  const lista = i > 0 ? ficha.itens.slice(0, i).filter((it) => !it.parte) : []
  itensAntesGuardados.set(ficha, lista)
  return lista
}

/** Os itens da etapa da concretagem em si (marcados à mão com `concretagem: true`, ou pelo nome da etapa). */
export function itensDaConcretagem(ficha: Pick<Ficha, 'itens'>): ItemFicha[] {
  const marcada = ficha.itens.some((it) => typeof it.concretagem === 'boolean')
  return ficha.itens.filter((it) => (marcada ? it.concretagem === true : ehEtapaDeConcretar(it.etapa)))
}

/** Situação da peça na ficha (só nos itens da etapa, se escolhida). */
export function situacaoDaPeca(ficha: Ficha, eventos: readonly EventoFvs[], etapa?: string): Situacao {
  const itens = ficha.itens.filter((i) => !etapa || i.etapa === etapa)
  const ult = ultimosPorItem(eventos.filter((e) => e.ficha_id === ficha.id))
  let marcados = 0
  let contam = 0
  for (const it of itens) {
    const r = ult.get(it.n)?.resultado
    if (r === 'NC') return 'reprovado'
    if (r) marcados++
    if (itemConta(ficha, it, !!r)) contam++
  }
  if (marcados === 0) return 'nada'
  if (marcados >= contam) return 'liberado'
  // olhando uma etapa só, a pergunta é outra: se aquela etapa terminou
  if (!etapa) {
    const antes = itensAntesDaConcretagem(ficha)
    if (antes.length && antes.every((it) => ult.get(it.n)?.resultado)) return 'concretagem'
  }
  return 'andamento'
}

/** Percentual de itens conformes (C) entre os que se aplicam (C + NC), como no rodapé da PVS. */
export function percentualConforme(ficha: Ficha, eventos: readonly EventoFvs[]): number | null {
  const ult = ultimosPorItem(eventos.filter((e) => e.ficha_id === ficha.id))
  let a = 0
  let r = 0
  for (const it of ficha.itens) {
    const res = ult.get(it.n)?.resultado
    if (res === 'C') a++
    else if (res === 'NC') r++
  }
  return a + r === 0 ? null : Math.round((100 * a) / (a + r))
}

/**
 * O que gravar quando a pessoa toca no botão `resultado` de um item.
 * - Item vazio ou C/NA: tocar no mesmo botão desmarca; noutro, troca (mesma rodada).
 * - Item NC: qualquer botão é a reinspeção (rodada seguinte). Desmarcar um NC é `desmarcarR`.
 */
export function aoTocar(atual: EventoFvs | undefined, resultado: Resultado): { resultado: Resultado | null; rodada: number } {
  if (!atual || atual.resultado === null) return { resultado, rodada: atual?.rodada ?? 1 }
  if (atual.resultado === 'NC') return { resultado, rodada: atual.rodada + 1 }
  if (atual.resultado === resultado) return { resultado: null, rodada: atual.rodada }
  return { resultado, rodada: atual.rodada }
}

export const rotuloRodada = (rodada: number) => `V${String(rodada).padStart(2, '0')}`

/** Ficha vigente de cada código (maior revisão) que se aplica ao tipo de peça. */
export function fichasPara(tipo: string, fichas: readonly Ficha[]): Ficha[] {
  const porCodigo = new Map<string, Ficha>()
  for (const f of fichas) {
    if (!f.aplica_a.includes(tipo)) continue
    const atual = porCodigo.get(f.codigo)
    if (!atual || compararRevisao(f.revisao, atual.revisao) > 0) porCodigo.set(f.codigo, f)
  }
  return [...porCodigo.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }))
}

/**
 * A ficha da peça: a vigente do código ou, se a peça já foi marcada só numa revisão anterior dele,
 * essa. Revisão nova da ficha vale para a inspeção nova: o que já foi marcado não volta a pendente.
 * Só contam os registros marcados no app; os do sistema oficial seguem a ficha aberta deles.
 */
export function fichaDaPeca(vigente: Ficha | undefined, eventos: readonly EventoFvs[], fichaPorId: (id: string) => Ficha | undefined): Ficha | undefined {
  if (!vigente) return undefined
  let anterior: Ficha | undefined
  for (const e of eventos) {
    if (e.ficha_campo_id) continue
    if (e.ficha_id === vigente.id) return vigente
    const f = fichaPorId(e.ficha_id)
    if (f?.codigo === vigente.codigo && (!anterior || compararRevisao(f.revisao, anterior.revisao) > 0)) anterior = f
  }
  return anterior ?? vigente
}

/** Só os registros de uma ficha aberta (null = os marcados no app sem ficha aberta). */
export function daFichaAberta(eventos: readonly EventoFvs[], fichaCampoId: string | null): EventoFvs[] {
  return eventos.filter((e) => (e.ficha_campo_id ?? null) === fichaCampoId)
}

/** Situação de várias fichas juntas: com NC ganha de tudo; só é liberado se todas estiverem. */
export function combinarSituacoes(lista: readonly Situacao[]): Situacao {
  if (lista.includes('reprovado')) return 'reprovado'
  if (lista.length === 0 || lista.every((s) => s === 'nada')) return 'nada'
  if (lista.every((s) => s === 'liberado')) return 'liberado'
  return lista.every((s) => s === 'liberado' || s === 'concretagem') ? 'concretagem' : 'andamento'
}

/** O item de furação da ficha de viga (marcado com `"furos": true` na ficha), se houver. */
export function itemDosFuros(ficha: Ficha | undefined): ItemFicha | undefined {
  return ficha?.itens.find((i) => i.furos)
}

/** Situação de um furo: o último registro dele no item de furação (C/NA OK, NC errado, vazio pendente). */
export function situacaoDoFuro(fichaId: string, item: number, eventos: readonly EventoFvs[]): Situacao {
  const r = ultimosPorItem(eventos.filter((e) => e.ficha_id === fichaId)).get(item)?.resultado
  return r === 'NC' ? 'reprovado' : r ? 'liberado' : 'nada'
}

/**
 * Situação do furo fora da planta (busca da obra): pelo item de furação da ficha de viga, como a planta
 * faz. Sem isso, o furo era lido como peça comum (sem ficha própria) e aparecia sempre "Pendente".
 */
export function situacaoDoFuroNaObra(fichaDeViga: Ficha | undefined, eventos: readonly EventoFvs[], fichaPorId: (id: string) => Ficha | undefined): Situacao {
  const ficha = fichaDaPeca(fichaDeViga, eventos, fichaPorId)
  const item = itemDosFuros(ficha)?.n
  return ficha && item !== undefined ? situacaoDoFuro(ficha.id, item, eventos) : 'nada'
}

/** Os itens de vão ou esquadria da ficha de ambiente (marcados com `"esquadrias": true`), na ordem da ficha. */
export function itensDasEsquadrias(ficha: Ficha | undefined): ItemFicha[] {
  return ficha?.itens.filter((i) => i.esquadrias) ?? []
}

/**
 * Situação da esquadria fora da planta (busca da obra): pelo pior dos itens de esquadria das fichas de
 * ambiente (qualquer serviço). Algum errado: reprovado; algum OK e nenhum errado: liberado; nada: pendente.
 */
export function situacaoDaEsquadriaNaObra(fichasDeAmbiente: readonly Ficha[], eventos: readonly EventoFvs[]): Situacao {
  const sits = fichasDeAmbiente.flatMap((f) => itensDasEsquadrias(f).map((i) => situacaoDoFuro(f.id, i.n, eventos)))
  if (sits.includes('reprovado')) return 'reprovado'
  return sits.includes('liberado') ? 'liberado' : 'nada'
}

/** "Esquadrias: 3 de 5 OK, 1 errada" (o mesmo resumo dos furos, no feminino). */
export function resumoDasEsquadrias(esqs: readonly Situacao[]): { total: number; ok: number; errados: number; texto: string } {
  const r = resumoDosFuros(esqs)
  return { ...r, texto: `Esquadrias: ${r.ok} de ${r.total} OK${r.errados ? `, ${r.errados} errada${r.errados > 1 ? 's' : ''}` : ''}` }
}

/** O resultado que os furos dão ao item de furação da viga: algum errado NC; todos OK C; senão pendente. */
export function resultadoPelosFuros(furos: readonly Situacao[]): Resultado | null {
  if (!furos.length) return null
  if (furos.includes('reprovado')) return 'NC'
  return furos.every((s) => s === 'liberado') ? 'C' : null
}

/** "Furos: 3 de 5 OK, 1 errado" (OK = conferido; NA também conta como resolvido). */
export function resumoDosFuros(furos: readonly Situacao[]): { total: number; ok: number; errados: number; texto: string } {
  const ok = furos.filter((s) => s === 'liberado').length
  const errados = furos.filter((s) => s === 'reprovado').length
  const texto = `Furos: ${ok} de ${furos.length} OK${errados ? `, ${errados} errado${errados > 1 ? 's' : ''}` : ''}`
  return { total: furos.length, ok, errados, texto }
}

/** Situação de uma ficha aberta, com os registros dela. Ficha modelo não cadastrada = sem marcação. */
export function situacaoDaFichaAberta(fc: FichaCampo, fichaPorId: (id: string) => Ficha | undefined, eventos: readonly EventoFvs[], etapa?: string, partes?: readonly string[]): Situacao {
  const ficha = fichaNaPeca(fc.ficha_id ? fichaPorId(fc.ficha_id) : undefined, partes)
  return ficha ? situacaoDaPeca(ficha, daFichaAberta(eventos, fc.id === SO_NO_APP ? null : fc.id), etapa) : 'nada'
}

/**
 * Situação do local na planta: com fichas abertas, a combinação de todas (ficha duplicada com um R
 * fica com NC, mesmo que a outra esteja aprovada); sem nenhuma, a ficha padrão do tipo.
 * Marcação feita só no app antes de a ficha do sistema oficial chegar também conta, para não sumir.
 */
export function situacaoDoLocal(
  fichaPadrao: Ficha | undefined,
  fichasAbertas: readonly FichaCampo[],
  fichaPorId: (id: string) => Ficha | undefined,
  eventos: readonly EventoFvs[],
  etapa?: string,
  /** partes do pilar na planta (consolo, capitel): os itens delas passam a contar */
  partes?: readonly string[],
): Situacao {
  const doApp = daFichaAberta(eventos, null)
  const padrao = fichaNaPeca(fichaPadrao, partes)
  const situacaoDoApp = padrao ? situacaoDaPeca(padrao, doApp, etapa) : 'nada'
  if (!fichasAbertas.length) return situacaoDoApp
  const delas = fichasAbertas.map((fc) => situacaoDaFichaAberta(fc, fichaPorId, eventos, etapa, partes))
  return combinarSituacoes(doApp.length ? [...delas, situacaoDoApp] : delas)
}

/**
 * Situação de uma parte (consolo, capitel) no local: pela ficha padrão (marcado só no app) e por cada
 * ficha aberta que tem itens da parte, combinadas. undefined = nenhuma ficha do local tem item da parte.
 */
export function situacaoDaParteNoLocal(
  fichaPadrao: Ficha | undefined,
  fichasAbertas: readonly FichaCampo[],
  fichaPorId: (id: string) => Ficha | undefined,
  eventos: readonly EventoFvs[],
  parte: string,
): Situacao | undefined {
  const lista: Situacao[] = []
  const doApp = situacaoDaParte(fichaPadrao, daFichaAberta(eventos, null), parte)
  if (doApp && (!fichasAbertas.length || doApp !== 'nada')) lista.push(doApp)
  for (const fc of fichasAbertas) {
    const s = situacaoDaParte(fc.ficha_id ? fichaPorId(fc.ficha_id) : undefined, daFichaAberta(eventos, fc.id), parte)
    if (s) lista.push(s)
  }
  return lista.length ? combinarSituacoes(lista) : undefined
}

const PESO_SITUACAO: Record<Situacao, number> = { reprovado: 0, andamento: 1, nada: 2, concretagem: 3, liberado: 4 }

/**
 * Id da "ficha" dos registros marcados só no app numa peça que também tem ficha do sistema oficial.
 * Só existe na tela: esses registros têm ficha_campo_id vazio.
 */
export const SO_NO_APP = 'so-no-app'

/** A "ficha" dos registros marcados só no app, para aparecer ao lado das do sistema oficial. */
export function fichaSoNoApp(ficha: Ficha): FichaCampo {
  return {
    id: SO_NO_APP,
    elemento_id: null,
    ficha_id: ficha.id,
    codigo: 'Marcado só no app',
    local: '',
    ficha_codigo: ficha.codigo,
    ficha_titulo: ficha.titulo,
    status: 'Sem ficha no sistema oficial',
    inspetor: null,
    atualizada_em: null,
    qtd_a: 0,
    qtd_r: 0,
    qtd_na: 0,
  }
}

/** Fichas abertas da pior situação para a melhor: o painel abre na que pede atenção. */
export function ordenarFichasAbertas(fichasAbertas: readonly FichaCampo[], fichaPorId: (id: string) => Ficha | undefined, eventos: readonly EventoFvs[]): FichaCampo[] {
  return [...fichasAbertas].sort(
    (a, b) => PESO_SITUACAO[situacaoDaFichaAberta(a, fichaPorId, eventos)] - PESO_SITUACAO[situacaoDaFichaAberta(b, fichaPorId, eventos)] || a.codigo.localeCompare(b.codigo),
  )
}

/** Uma peça com mais de uma ficha no sistema oficial. */
export interface PecaDuplicada {
  chave: string
  pecaId: string
  pecaNome: string
  tipo: string
  pavimentoId: string
  /** local no sistema oficial da primeira ficha: é o que diz o trecho */
  local: string | null
  plantaMarcada: null
  fichas: FichaCampo[]
}

/** Peças com ficha duplicada, em ordem de pavimento e de número. */
export function listarDuplicadas(
  pecas: Iterable<{ id: string; tipo: string; nome: string; pavimento_id: string }>,
  fichasDe: ReadonlyMap<string, readonly FichaCampo[]>,
  pavimentos: ReadonlyArray<{ id: string }>,
): PecaDuplicada[] {
  const ordemDoPavimento = new Map(pavimentos.map((p, i) => [p.id, i]))
  const natural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })
  const saida: PecaDuplicada[] = []
  for (const p of pecas) {
    const fichas = fichasDe.get(p.id)
    if (!fichas || fichas.length < 2) continue
    saida.push({ chave: p.id, pecaId: p.id, pecaNome: p.nome, tipo: p.tipo, pavimentoId: p.pavimento_id, local: fichas[0].local || null, plantaMarcada: null, fichas: [...fichas] })
  }
  return saida.sort(
    (a, b) => (ordemDoPavimento.get(a.pavimentoId) ?? 0) - (ordemDoPavimento.get(b.pavimentoId) ?? 0) || natural.compare(a.pecaNome, b.pecaNome) || a.tipo.localeCompare(b.tipo),
  )
}

type LocalResumo = { id: string; tipo: string }
type EventosDe = (id: string) => readonly EventoFvs[]
/** Fichas abertas do local e fichas modelo por id, para o resumo contar a ficha duplicada certo. */
export type ContextoCampo = {
  fichasDe: (id: string) => readonly FichaCampo[]
  ficha: (id: string) => Ficha | undefined
  /** partes do pilar (consolo, capitel) pelo pacote guardado no aparelho */
  partesDe?: (id: string) => readonly string[]
}

/**
 * Peças de estrutura (ambiente, furo, esquadria e parede não contam): quantas liberadas e quantas com NC na ficha
 * do seu tipo. Com `so`, só os locais desse tipo ("M": as paredes da modulação).
 */
export function resumoDaEstrutura(locais: readonly LocalResumo[], fichas: readonly Ficha[], eventosDe: EventosDe, campo?: ContextoCampo, so?: string) {
  const fichaDoTipo = new Map<string, Ficha | undefined>()
  const mapaDeFichas = new Map(fichas.map((f) => [f.id, f]))
  const porId = (id: string) => mapaDeFichas.get(id)
  let total = 0
  let liberadas = 0
  let paraConcretar = 0
  let comR = 0
  let duplicadas = 0
  for (const l of locais) {
    // furo de viga conta dentro da viga (pelo item de furação da ficha), e não como peça; a esquadria, no ambiente;
    // a parede, na modulação
    if (so ? l.tipo !== so : FORA_DA_ESTRUTURA.has(l.tipo)) continue
    total++
    if (!fichaDoTipo.has(l.tipo)) fichaDoTipo.set(l.tipo, fichasPara(l.tipo, fichas)[0])
    const abertas = campo?.fichasDe(l.id) ?? []
    if (abertas.length > 1) duplicadas++
    const eventos = eventosDe(l.id)
    const fichaPorId = campo?.ficha ?? porId
    const s = situacaoDoLocal(fichaDaPeca(fichaDoTipo.get(l.tipo), eventos, fichaPorId), abertas, fichaPorId, eventos, undefined, campo?.partesDe?.(l.id))
    if (s === 'liberado') liberadas++
    if (s === 'concretagem') paraConcretar++
    if (s === 'reprovado') comR++
  }
  return { total, liberadas, paraConcretar, comR, duplicadas }
}

/**
 * Ambientes: para cada ficha por ambiente (alvenaria, reboco...) que já tem alguma marcação,
 * quantos ambientes liberados e quantos com NC. Ficha ainda não começada não entra na lista.
 */
export function resumoDosAmbientes(locais: readonly LocalResumo[], fichas: readonly Ficha[], eventosDe: EventosDe) {
  const ambientes = locais.filter((l) => l.tipo === 'A')
  const mapaDeFichas = new Map(fichas.map((f) => [f.id, f]))
  const porId = (id: string) => mapaDeFichas.get(id)
  // começada = tem pelo menos um item marcado hoje (item marcado e depois desmarcado não conta)
  const comecadas = new Set<string>()
  for (const a of ambientes) {
    const porFicha = new Map<string, EventoFvs[]>()
    for (const e of eventosDe(a.id)) {
      const l = porFicha.get(e.ficha_id)
      if (l) l.push(e)
      else porFicha.set(e.ficha_id, [e])
    }
    for (const [fichaId, evs] of porFicha) {
      if (!comecadas.has(fichaId) && [...ultimosPorItem(evs).values()].some((e) => e.resultado)) comecadas.add(fichaId)
    }
  }
  // por código: o que começou numa revisão anterior da ficha continua na lista
  const codigosComecados = new Set([...comecadas].map((id) => porId(id)?.codigo))
  const servicos = fichasPara('A', fichas)
    .filter((f) => codigosComecados.has(f.codigo))
    .map((ficha) => {
      let liberados = 0
      let comR = 0
      for (const a of ambientes) {
        const eventos = eventosDe(a.id)
        const s = situacaoDaPeca(fichaDaPeca(ficha, eventos, porId) ?? ficha, eventos)
        if (s === 'liberado') liberados++
        if (s === 'reprovado') comR++
      }
      return { ficha, liberados, comR }
    })
  return { total: ambientes.length, servicos }
}

export function compararRevisao(a: string, b: string): number {
  const na = Number(a.replace(/\D/g, ''))
  const nb = Number(b.replace(/\D/g, ''))
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
  return a.localeCompare(b)
}

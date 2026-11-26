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
export const FORA_DA_ESTRUTURA: ReadonlySet<string> = new Set(['A', 'F', 'E', 'M', 'K', 'S'])

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
   * Item que só existe no app, não na ficha do sistema oficial (não vai para lá). Sem o campo: os itens de
   * consolo e capitel (com parte), que o app criou em 17/11 (itemSoDoApp). Vem da ficha, como dado.
   */
  so_app?: boolean
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
  pontos?: DisciplinaDoItem | readonly DisciplinaDoItem[]
  /**
   * Só estes tipos de ponto marcam o item (5.1 a 5.3, 23/11/2026): duas fichas marcam a mesma disciplina
   * (trajeto de água na EXE-PVS-14, altura dos pontos na EXE-PVS-15). Sem a lista: todos os tipos da disciplina.
   */
  pontos_tipos?: readonly string[]
  /**
   * Item de vão ou esquadria da ficha de ambiente ("eixos e vãos", "requadros", "recorte na porta"): quem
   * marca são as esquadrias do ambiente na planta (aba Esquadrias, 19/11/2026), uma a uma, como os furos.
   * Pode haver mais de um na ficha; a pessoa escolhe qual no topo da aba. Vem da ficha, como dado.
   * Lista (23/11/2026): o item vale só nas esquadrias dela, por classe ("janela", "porta") ou pelo começo do
   * código ("PCF", "PV"): contramarco de janela só nas janelas, porta corta-fogo só nas PCF. `true`: em todas.
   */
  esquadrias?: boolean | readonly string[]
}

/**
 * Item só do app (24/11, pedido do Professor): não existe na ficha do sistema oficial e não vai para lá. Os
 * itens de consolo e capitel (parte) foram criados no app em 17/11; na obra piloto são os itens 25 a 34 da
 * ficha de pilar, que lá tem 24. A ficha pode dizer o contrário com so_app.
 */
export function itemSoDoApp(it: Pick<ItemFicha, 'parte' | 'so_app'> | undefined): boolean {
  return it ? (it.so_app ?? !!it.parte) : false
}

/** Disciplina de pontos de instalação que um item da ficha pode marcar (o mesmo de pontos.ts). */
export type DisciplinaDoItem = 'hidro' | 'sanitario' | 'eletrico' | 'preventivo' | 'spda'

/** As disciplinas de pontos que o item marca ("pontos" em texto ou lista, 23/11/2026); vazio se nenhuma. */
export function disciplinasDoItem(i: Pick<ItemFicha, 'pontos'>): readonly DisciplinaDoItem[] {
  return i.pontos === undefined ? [] : typeof i.pontos === 'string' ? [i.pontos] : i.pontos
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
  /**
   * Só na tela: as outras fichas do mesmo modelo nesta peça, juntadas nesta (a mais completa) na leitura
   * (juntarFichasDoModelo). Os registros continuam gravados cada um na sua ficha.
   */
  juntas?: readonly FichaCampo[]
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
  // item de consolo e capitel não segura o azul do pilar: a parte tem a cor própria na planta (a área de laje
  // não olha para ela desde 23/11)
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
export function situacaoDaPeca(
  ficha: Ficha,
  eventos: readonly EventoFvs[],
  etapa?: string,
  /**
   * Pilar, viga e laje (concretada.ts, achado #2, 24/11): se a peça está numa concretagem cadastrada no Concreto.
   * Com ele, verde = azul (tudo antes da concretagem marcado, sem NC) + concretada; a ficha toda marcada sem
   * concretagem fica azul. undefined: a regra de antes (ficha completa = verde), para os outros tipos.
   */
  concretada?: boolean,
): Situacao {
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
  if (!etapa && concretada !== undefined) {
    const antes = itensAntesDaConcretagem(ficha)
    if (antes.length) {
      if (!antes.every((it) => ult.get(it.n)?.resultado)) return 'andamento'
      return concretada ? 'liberado' : 'concretagem'
    }
  }
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

/**
 * Tipos de peça em que duas fichas do mesmo modelo viram uma só na tela (pedido do Nicolas de 21/11:
 * a viga com duas fichas do sistema oficial). Pilar fica como está (duas abas) até ele pedir.
 */
const TIPOS_QUE_JUNTAM: readonly string[] = ['V']

/** Quantos itens a ficha tem com C ou NC, e com qualquer resultado: a "mais completa" ganha. */
function completude(eventos: readonly EventoFvs[], fc: FichaCampo): [number, number] {
  let marcados = 0
  let todos = 0
  for (const e of ultimosPorItem(daFichaAberta(eventos, fc.id)).values()) {
    if (!e.resultado) continue
    todos++
    if (e.resultado !== 'NA') marcados++
  }
  return [marcados, todos]
}

/**
 * Fichas abertas da peça com as do mesmo modelo juntadas (decisão do Nicolas de 21/11): fica uma por
 * modelo, a mais completa (mais itens com C ou NC, depois com qualquer resultado, depois a mais nova), e as
 * outras vão em `juntas`. Só na leitura: nada é apagado nem regravado. Só para os tipos de TIPOS_QUE_JUNTAM.
 */
export function juntarFichasDoModelo(fichasAbertas: readonly FichaCampo[], fichaPorId: (id: string) => Ficha | undefined, eventos: readonly EventoFvs[]): FichaCampo[] {
  if (fichasAbertas.length < 2 || fichasAbertas.some((fc) => fc.juntas)) return fichasAbertas as FichaCampo[]
  const porModelo = new Map<string, FichaCampo[]>()
  for (const fc of fichasAbertas) {
    const modelo = fc.ficha_id ? fichaPorId(fc.ficha_id) : undefined
    if (!modelo || !modelo.aplica_a.some((t) => TIPOS_QUE_JUNTAM.includes(t))) continue
    porModelo.set(modelo.id, [...(porModelo.get(modelo.id) ?? []), fc])
  }
  if (![...porModelo.values()].some((l) => l.length > 1)) return fichasAbertas as FichaCampo[]
  const saida: FichaCampo[] = []
  const feitos = new Set<string>()
  for (const fc of fichasAbertas) {
    const grupo = fc.ficha_id ? porModelo.get(fc.ficha_id) : undefined
    if (!grupo || grupo.length < 2) {
      saida.push(fc)
      continue
    }
    if (feitos.has(fc.ficha_id!)) continue
    feitos.add(fc.ficha_id!)
    const nota = new Map(grupo.map((g) => [g.id, completude(eventos, g)]))
    const [base, ...juntas] = [...grupo].sort((a, b) => {
      const [ma, ta] = nota.get(a.id)!
      const [mb, tb] = nota.get(b.id)!
      return mb - ma || tb - ta || (b.atualizada_em ?? '').localeCompare(a.atualizada_em ?? '') || a.codigo.localeCompare(b.codigo)
    })
    saida.push({ ...base, juntas })
  }
  return saida
}

/**
 * Registros de uma ficha aberta como a tela mostra. Ficha com outras juntadas: item a item, os registros
 * da ficha que vence o item. Quem vence: (1) o registro mais novo, se foi marcado no app (é a correção
 * feita depois do que veio do sistema oficial; o app grava na ficha da base); (2) senão, a ficha com NC
 * no item (o NC prevalece sobre o C, decisão do Nicolas de 21/11); (3) senão, a base, se tem resultado;
 * (4) senão, a primeira das outras que tem. SO_NO_APP = os marcados no app sem ficha aberta.
 */
export function eventosDaFichaAberta(eventos: readonly EventoFvs[], fc: FichaCampo): EventoFvs[] {
  const proprios = daFichaAberta(eventos, fc.id === SO_NO_APP ? null : fc.id)
  if (!fc.juntas?.length) return proprios
  // ficha única (23/11): o marcado só no app (SO_NO_APP) é mais uma junta, com a mesma regra item a item
  const porFicha = [proprios, ...fc.juntas.map((j) => daFichaAberta(eventos, j.id === SO_NO_APP ? null : j.id))].map((evs) => {
    const m = new Map<number, EventoFvs[]>()
    for (const e of evs) m.set(e.item, [...(m.get(e.item) ?? []), e])
    return m
  })
  const itens = new Set(porFicha.flatMap((m) => [...m.keys()]))
  const saida: EventoFvs[] = []
  for (const item of itens) {
    const ultimos = porFicha.map((m) => {
      let u: EventoFvs | undefined
      for (const e of m.get(item) ?? []) if (!u || maisNovo(e, u)) u = e
      return u
    })
    let novo = -1
    ultimos.forEach((u, i) => {
      if (u && (novo < 0 || maisNovo(u, ultimos[novo]!))) novo = i
    })
    // correção feita no app: o histórico do item junta as fichas (o NC de lá e a reinspeção daqui)
    if (novo >= 0 && !ultimos[novo]!.origem_id) {
      for (const m of porFicha) saida.push(...(m.get(item) ?? []))
      continue
    }
    let vence = ultimos.findIndex((u) => u?.resultado === 'NC')
    if (vence < 0) vence = ultimos.findIndex((u) => !!u?.resultado)
    if (vence < 0) vence = novo >= 0 ? novo : 0
    saida.push(...(porFicha[vence].get(item) ?? []))
  }
  return saida
}

/** A ficha da tela que mostra esta ficha aberta (ela mesma ou a base em que ela foi juntada). */
export function fichaDaTela(fichasDaTela: readonly FichaCampo[], id: string | null | undefined): FichaCampo | undefined {
  if (!id) return undefined
  return fichasDaTela.find((fc) => fc.id === id || fc.juntas?.some((j) => j.id === id))
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

/**
 * O item de esquadria vale nesta esquadria? `true` (ou sem dado da esquadria): sim. Lista: a classe ("porta",
 * "janela") ou o começo do código ("PCF" pega PCF90) tem de estar nela. Maiúsculas e minúsculas tanto faz.
 */
export function esquadriaValeNoItem(item: Pick<ItemFicha, 'esquadrias'> | undefined, esq: { codigo: string; classe: string } | undefined): boolean {
  const f = item?.esquadrias
  if (!Array.isArray(f) || !f.length || !esq) return true
  const cod = esq.codigo.toUpperCase()
  return f.some((x) => {
    const k = x.trim().toUpperCase()
    return !!k && (k === esq.classe.toUpperCase() || cod.startsWith(k))
  })
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
export function situacaoDaFichaAberta(
  fc: FichaCampo,
  fichaPorId: (id: string) => Ficha | undefined,
  eventos: readonly EventoFvs[],
  etapa?: string,
  partes?: readonly string[],
  /** pilar, viga e laje: numa concretagem cadastrada (situacaoDaPeca) */
  concretada?: boolean,
): Situacao {
  const ficha = fichaNaPeca(fc.ficha_id ? fichaPorId(fc.ficha_id) : undefined, partes)
  return ficha ? situacaoDaPeca(ficha, eventosDaFichaAberta(eventos, fc), etapa, concretada) : 'nada'
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
  /** pilar, viga e laje: numa concretagem cadastrada no Concreto (concretada.ts); verde só com ela */
  concretada?: boolean,
): Situacao {
  // furos e barras gravados só no app contam dentro da ficha aberta da peça (achado #6, 24/11)
  if (fichasAbertas.length) eventos = automaticosNaFichaAberta(eventos, fichasAbertas, fichaPorId)
  const doApp = daFichaAberta(eventos, null)
  const padrao = fichaNaPeca(fichaPadrao, partes)
  const situacaoDoApp = padrao ? situacaoDaPeca(padrao, doApp, etapa, concretada) : 'nada'
  if (!fichasAbertas.length) return situacaoDoApp
  // o marcado só no app entra na ficha aberta do mesmo modelo (ficha única, 23/11), como o painel mostra
  const { fichas, juntou } = juntarMarcadosNoApp(juntarFichasDoModelo(fichasAbertas, fichaPorId, eventos), eventos)
  const delas = fichas.map((fc) => situacaoDaFichaAberta(fc, fichaPorId, eventos, etapa, partes, concretada))
  return combinarSituacoes(doApp.length && !juntou ? [...delas, situacaoDoApp] : delas)
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
  // ficha única (23/11): o marcado só no app vai junto da ficha aberta do mesmo modelo
  const { fichas, juntou } = juntarMarcadosNoApp(fichasAbertas, eventos)
  const doApp = juntou ? undefined : situacaoDaParte(fichaPadrao, daFichaAberta(eventos, null), parte)
  if (doApp && (!fichasAbertas.length || doApp !== 'nada')) lista.push(doApp)
  for (const fc of fichas) {
    const s = situacaoDaParte(fc.ficha_id ? fichaPorId(fc.ficha_id) : undefined, eventosDaFichaAberta(eventos, fc), parte)
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

/**
 * Ficha única por peça (pedido do Nicolas de 23/11): o que foi marcado só no app (registro sem ficha
 * aberta) entra na ficha aberta do mesmo modelo, como mais uma junta, e a aba "Marcado só no app" some.
 * Item a item vale a regra de eventosDaFichaAberta (o mais novo marcado no app; senão o NC; senão a base).
 * Só na leitura: nada é apagado nem regravado, e a marcação nova grava na ficha aberta.
 * `juntou` false = não havia o que juntar, ou o marcado no app é de um modelo que nenhuma ficha aberta tem:
 * aí a aba à parte continua (fichaSoNoApp).
 */
export function juntarMarcadosNoApp(fichasDaTela: readonly FichaCampo[], eventos: readonly EventoFvs[]): { fichas: FichaCampo[]; juntou: boolean } {
  const doApp = daFichaAberta(eventos, null)
  if (!doApp.length || !fichasDaTela.length) return { fichas: fichasDaTela as FichaCampo[], juntou: false }
  const modelos = new Set(doApp.map((e) => e.ficha_id))
  // todos os registros do app têm de caber numa ficha aberta só (um modelo só, e ela existe)
  const alvo = modelos.size === 1 ? fichasDaTela.find((fc) => fc.ficha_id === doApp[0].ficha_id) : undefined
  if (!alvo) return { fichas: fichasDaTela as FichaCampo[], juntou: false }
  const soNoApp = fichaSoNoApp({ id: alvo.ficha_id ?? '', codigo: alvo.ficha_codigo ?? '', titulo: alvo.ficha_titulo ?? '' } as Ficha)
  return { fichas: fichasDaTela.map((fc) => (fc === alvo ? { ...fc, juntas: [...(fc.juntas ?? []), soNoApp] } : fc)), juntou: true }
}

/**
 * Registros de uma ficha aberta da peça como a tela mostra, para o pincel e o "Por item": com o marcado
 * só no app junto, se ele entra nela (ficha única, 23/11). Sem ficha aberta, só os do app, como antes.
 */
export function eventosNaFicha(eventos: readonly EventoFvs[], fichaCampoId: string | null, fichasAbertas: readonly FichaCampo[]): EventoFvs[] {
  const fc = fichaCampoId ? fichasAbertas.find((f) => f.id === fichaCampoId) : undefined
  if (!fc) return daFichaAberta(eventos, fichaCampoId)
  return eventosDaFichaAberta(eventos, juntarMarcadosNoApp([fc], eventos).fichas[0])
}

/** Item que o app marca sozinho: o de furação (pelos furos) ou o de armadura (pelas barras de laje). */
export type ItemAutomatico = 'furos' | 'barras'

/** Qual item automático é o `item` da ficha (undefined: item comum, marcado pela pessoa). */
export function itemAutomatico(ficha: Ficha | undefined, item: number): ItemAutomatico | undefined {
  const it = ficha?.itens.find((i) => i.n === item)
  return it?.furos ? 'furos' : it?.barras ? 'barras' : undefined
}

/**
 * A ficha aberta em uso da peça em que o item automático (furos ou barras) grava, e o número do item nela
 * (achado #6 da lista de campo, 24/11: a viga com o item de furação OK ficava laranja, porque o item ia
 * para "só no app" e virava uma ficha à parte, com um item só, em andamento para sempre).
 * Em uso = as fichas abertas como a tela mostra (duas do mesmo modelo na viga viram uma). Entre as que têm
 * o item: a do mesmo modelo da ficha do app; senão a do mesmo código (outra revisão); senão, se for uma só,
 * ela. Undefined: a peça não tem ficha aberta com o item, ou há mais de uma e nenhuma é do mesmo modelo.
 */
export function fichaAbertaDoAutomatico(
  tipo: ItemAutomatico,
  fichaDoApp: Ficha | undefined,
  fichasAbertas: readonly FichaCampo[],
  fichaPorId: (id: string) => Ficha | undefined,
  eventos: readonly EventoFvs[],
  /** o número do item na ficha do app (para a revisão que não marca o item como automático) */
  item?: number,
): { fc: FichaCampo; ficha: Ficha; item: number } | undefined {
  if (!fichasAbertas.length) return undefined
  const candidatas: { fc: FichaCampo; ficha: Ficha; item: number }[] = []
  for (const fc of juntarFichasDoModelo(fichasAbertas, fichaPorId, eventos)) {
    const ficha = fc.ficha_id ? fichaPorId(fc.ficha_id) : undefined
    const it = ficha?.itens.find((i) => (tipo === 'furos' ? i.furos : i.barras))
    if (ficha && it) candidatas.push({ fc, ficha, item: it.n })
  }
  const achada =
    candidatas.find((x) => x.ficha.id === fichaDoApp?.id) ??
    candidatas.find((x) => !!fichaDoApp && x.ficha.codigo === fichaDoApp.codigo) ??
    (candidatas.length === 1 ? candidatas[0] : undefined)
  if (achada || !fichaDoApp || item === undefined) return achada
  // a revisão da ficha aberta não marca o item como automático: a do mesmo código, no mesmo número de item
  for (const fc of juntarFichasDoModelo(fichasAbertas, fichaPorId, eventos)) {
    const ficha = fc.ficha_id ? fichaPorId(fc.ficha_id) : undefined
    if (ficha?.codigo === fichaDoApp.codigo && ficha.itens.some((i) => i.n === item)) return { fc, ficha, item }
  }
  return undefined
}

/**
 * Registros automáticos (furos e barras) gravados só no app numa peça que tem ficha aberta: passam a contar
 * dentro da ficha aberta em uso (fichaAbertaDoAutomatico), com o número do item dela. Só na leitura: nada é
 * regravado, e conserta os registros que já existem (V17, V49, V182 do 3º, 24/11). Os outros ficam iguais.
 */
export function automaticosNaFichaAberta(eventos: readonly EventoFvs[], fichasAbertas: readonly FichaCampo[], fichaPorId: (id: string) => Ficha | undefined): EventoFvs[] {
  if (!fichasAbertas.length || !eventos.some((e) => !e.ficha_campo_id)) return eventos as EventoFvs[]
  const alvos = new Map<string, ReturnType<typeof fichaAbertaDoAutomatico> | null>()
  let mudou = false
  const saida = eventos.map((e) => {
    if (e.ficha_campo_id) return e
    const doApp = fichaPorId(e.ficha_id)
    const tipo = itemAutomatico(doApp, e.item)
    if (!tipo) return e
    const chave = `${e.ficha_id}:${tipo}`
    if (!alvos.has(chave)) alvos.set(chave, fichaAbertaDoAutomatico(tipo, doApp, fichasAbertas, fichaPorId, eventos, e.item) ?? null)
    const alvo = alvos.get(chave)
    if (!alvo) return e
    mudou = true
    return { ...e, ficha_campo_id: alvo.fc.id, ficha_id: alvo.ficha.id, item: alvo.item }
  })
  return mudou ? saida : (eventos as EventoFvs[])
}

/** Registro que está valendo e foi marcado no app, ainda não chegou ao sistema oficial nem foi dado como lançado. */
export function soNoAppAinda(e: Pick<EventoFvs, 'id' | 'origem_id'> | undefined, lancados: ReadonlySet<string>): boolean {
  return !!e && !e.origem_id && !lancados.has(e.id)
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
  /** pilar, viga e laje numa concretagem cadastrada (concretadaDe): verde só com ela (achado #2, 24/11) */
  concretada?: (id: string, tipo: string) => boolean | undefined
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
    const s = situacaoDoLocal(fichaDaPeca(fichaDoTipo.get(l.tipo), eventos, fichaPorId), abertas, fichaPorId, eventos, undefined, campo?.partesDe?.(l.id), campo?.concretada?.(l.id, l.tipo))
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
/**
 * Avanço das fichas por ambiente de um pavimento. `vale(ambienteId, codigo)` diz se a ficha vale no cômodo (tabela
 * ficha × tipo de cômodo, `sem_fichas` do pacote); cada serviço conta só os ambientes em que vale (`total` do serviço).
 * Sem `vale`, toda ficha vale em todo ambiente, como antes.
 */
export function resumoDosAmbientes(
  locais: readonly LocalResumo[],
  fichas: readonly Ficha[],
  eventosDe: EventosDe,
  vale: (ambienteId: string, codigo: string) => boolean = () => true,
) {
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
      let total = 0
      for (const a of ambientes) {
        if (!vale(a.id, ficha.codigo)) continue
        total++
        const eventos = eventosDe(a.id)
        const s = situacaoDaPeca(fichaDaPeca(ficha, eventos, porId) ?? ficha, eventos)
        if (s === 'liberado') liberados++
        if (s === 'reprovado') comR++
      }
      return { ficha, liberados, comR, total }
    })
  return { total: ambientes.length, servicos }
}

export function compararRevisao(a: string, b: string): number {
  const na = Number(a.replace(/\D/g, ''))
  const nb = Number(b.replace(/\D/g, ''))
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
  return a.localeCompare(b)
}

// Leitura e registro dos dados da FVS no aparelho (pelo núcleo: funciona sem internet).

import { caminhoesDasPecas, type CaminhaoDaPeca } from '../concreto/rastreio'
import { datasDoConcreto, ehDoConcreto, registroDoRastreio } from './rastreio'
import type { Linha } from '../nucleo/banco_local'
import type { PapelNaObra } from '../nucleo/conta'
import { banco, cliente, sincronizador } from '../nucleo/servicos'
import { BUCKET_OBRAS } from '../config'
import { areasVigentes, travasDaArea, type AreaDeLaje, type LinhaDeArea, type Ponto, type TravaDaArea } from './areas'
import { dataHoraCompleta } from './formato'
import { aoTocar, daFichaAberta, fichaDaPeca, fichaNaPeca, fichasPara, normalizarResultado, situacaoDaParteNoLocal, ultimosPorItem, type EventoFvs, type Ficha, type FichaCampo, type ItemFicha, type Resultado } from './situacao'
import { baixarPacote, comPrazo, escalaGuardada, partesDaPlantaGuardadas, partesGuardadas, soDetalheGuardado, type ParteDaPlanta, DownloadParado, lerComProgresso, LIMITE_SEM_DADOS_MS, type ArquivoServidor, type Baixador, type DonoDoPacote } from './pacote'
import { listarParaLancar, type LinhaDeLancamento } from './lancamento'
import { linhasDaSituacao, type LinhaDaSituacao } from './planilha'
import { listarReprovacoes, type Reprovacao } from './reprovacoes'
import { cadeiaDeRevisoes, type RevisaoAnterior } from './revisoes'
import { TABELAS_FVS } from './tabelas'
import { refazerToques } from './toques'
import { regrasVigentes, type RegrasFvs } from './regras'
import { alvosDaLigacao, alvosEntrePecas, observacaoDaLigacao, observacaoEntrePecas, temLigacaoEntrePecas, type PecaDaArea } from './ligacoes'
import { observacaoDoPrazo, prazoPendente, type PrazoDoItem } from './prazos'

export { TABELAS_FVS }

export interface Pavimento {
  id: string
  nome: string
  ordem: number
}

export interface Planta {
  id: string
  pavimento_id: string
  setor_id: string
  trecho: string
  /** "estrutura" (planta de forma: pilares e vigas) ou "arquitetura" (planta de ambientes) */
  disciplina: string
  prancha: string
  revisao: string
  elementos: number
  manifest: ArquivoServidor | null
  pacote: ArquivoServidor | null
  criado_em_dispositivo: string
}

export interface Peca {
  id: string
  pavimento_id: string
  tipo: string
  nome: string
  secao: string | null
}

export interface DadosFvs {
  pavimentos: Pavimento[]
  /** só as vigentes (que nenhuma revisão nova substituiu), por pavimento, em ordem de trecho */
  plantasDe: Map<string, Planta[]>
  plantaPorId: Map<string, Planta>
  /** planta vigente -> revisões anteriores do trecho (o pacote delas pode ainda estar no aparelho) */
  anterioresDe: Map<string, RevisaoAnterior[]>
  /** planta substituída -> planta vigente do trecho */
  vigenteDe: Map<string, string>
  fichas: Ficha[]
  fichaPorId: Map<string, Ficha>
  /** fichas abertas por peça (mais de uma = ficha duplicada) */
  fichasCampoDe: Map<string, FichaCampo[]>
  /** fichas abertas num local que não é peça da planta (laje, bloco, peça fora da prancha) */
  fichasCampoSemPeca: FichaCampo[]
  /** peças das plantas e áreas de laje desenhadas (tipo L) */
  pecaPorId: Map<string, Peca>
  /** áreas de laje por pavimento (desenhadas no app, cada uma ligada a uma ficha) */
  areasDe: Map<string, AreaDeLaje[]>
  areaPorId: Map<string, AreaDeLaje>
  /** registros por peça ou área */
  eventosDe: Map<string, EventoFvs[]>
  /** fotos (arquivo_id) por registro */
  fotosDe: Map<string, string[]>
  /** arquivos da obra por id (para achar a foto no armazenamento) */
  arquivoPorId: Map<string, ArquivoServidor>
  /** nome de cada pessoa (perfis.nome), guardado no aparelho para funcionar sem internet */
  nomePorUsuario: Map<string, string>
  /** quem está usando o app (para mostrar "você" enquanto o nome não chegou) */
  usuarioId?: string
  /** registros que a pessoa já disse ter lançado no sistema oficial (só neste aparelho) */
  lancados: Set<string>
  /** hora do servidor no registro mais novo que chegou dele: serve para notar relógio atrasado */
  servidorMaisNovo: string | null
  /** regras da obra entre itens das fichas: prazos e ligações (fvs_regras; sem linha, nenhuma) */
  regras: RegrasFvs
}

/** Diferença normal entre o relógio do aparelho e o do servidor: abaixo disto, não incomoda ninguém. */
const MARGEM_RELOGIO_MS = 10 * 60 * 1000

/** Aviso da sincronização, de uma linha, para o topo das telas. O registro recusado vem primeiro: esse não vai sozinho.
 *  Sem conta (`local`) não há servidor: nada de "esperando envio" nem de "quando a internet voltar" (obra de demonstração, 13/11). */
export function avisoDaSincronizacao(e: { online: boolean; pendentes: number; comErro: number; local?: boolean }): string {
  if (e.local) return ''
  if (e.comErro > 0) return `${e.comErro} registro(s) recusado(s) pelo servidor. Veja no menu da obra.`
  if (!e.online) return 'Sem internet: as marcações ficam no aparelho e vão quando a internet voltar.'
  return e.pendentes > 0 ? `${e.pendentes} registro(s) esperando envio.` : ''
}

/** O relógio do aparelho está atrasado: chegou do servidor registro feito "no futuro". */
export function relogioAtrasado(agora: number, servidorMaisNovo: string | null | undefined): boolean {
  return !!servidorMaisNovo && Date.parse(servidorMaisNovo) - agora > MARGEM_RELOGIO_MS
}

/**
 * "Vale o último registro": se o último registro de um item tem hora depois da hora deste aparelho
 * (relógio diferente entre aparelhos), a marcação nova é gravada com a hora real, mas o registro "do
 * futuro" continua valendo. A tela avisa, com quem marcou e quando (pedido 6 ao núcleo, docs/modulos/1_fvs.md).
 * Gravar com a hora ajustada mudaria o contrato do núcleo (docs/02): decisão do Nicolas, ainda aberta.
 */
export function horaNaFrente(atual: Pick<EventoFvs, 'criado_em_dispositivo'> | undefined, agora = Date.now()): boolean {
  return !!atual && Date.parse(atual.criado_em_dispositivo) > agora
}

/** Texto do aviso de um item cujo registro valendo tem hora depois da deste aparelho. */
export function avisoHoraNaFrente(quem: string, iso: string): string {
  return `Está valendo a marcação de ${quem}, de ${dataHoraCompleta(iso)}, depois da hora deste aparelho. A sua foi gravada, mas não aparece aqui até a data e a hora dos aparelhos serem acertadas.`
}

/** Como acertar o relógio do Android: o caminho que a pessoa segue no aparelho. */
export const COMO_ACERTAR_HORA =
  'No Android: Configurações > Sistema > Data e hora. Ligue "Data e hora automáticas" e "Fuso horário automático" (ou escolha Brasília, GMT-3). Faça o mesmo no aparelho de quem marcou com hora errada.'

/**
 * Registro mais à frente da hora deste aparelho, além da margem normal (10 min): ou este relógio está
 * atrasado, ou o do aparelho de quem marcou estava adiantado. Devolve o mais à frente, ou nada.
 */
export function registroNaFrente(d: Pick<DadosFvs, 'eventosDe'>, agora = Date.now()): EventoFvs | null {
  let mais: EventoFvs | null = null
  for (const evs of d.eventosDe.values()) {
    for (const e of evs) if (!mais || e.criado_em_dispositivo > mais.criado_em_dispositivo) mais = e
  }
  return mais && Date.parse(mais.criado_em_dispositivo) - agora > MARGEM_RELOGIO_MS ? mais : null
}

/** O relógio deste aparelho está antes da data em que o pacote da obra foi gerado (com a margem normal). */
export function relogioAntesDoPacote(agora: number, geradoEm: string | null | undefined): boolean {
  return !!geradoEm && Date.parse(geradoEm) - agora > MARGEM_RELOGIO_MS
}

const chaveLancados = (obraId: string) => `fvs_lancados:${obraId}`

const CHAVE_NOMES = 'fvs_nomes'

/** Quem marcou, pelo nome: o do sistema oficial, o do perfil ou, sem isso, "você" e "outra pessoa". */
export function quemMarcou(e: Pick<EventoFvs, 'verificado_por' | 'usuario_id'>, d: Pick<DadosFvs, 'nomePorUsuario'>, usuarioId: string): string {
  return e.verificado_por || d.nomePorUsuario.get(e.usuario_id) || (e.usuario_id === usuarioId ? 'você' : 'outra pessoa')
}

/** Reprovações da obra inteira (a mesma lista no início e na tela da lista). */
export function reprovacoesDaObra(d: DadosFvs): Reprovacao[] {
  return listarReprovacoes({
    pecas: d.pecaPorId.values(),
    eventosDe: d.eventosDe,
    fichaPorId: d.fichaPorId,
    fichasCampoDe: d.fichasCampoDe,
    fotosDe: d.fotosDe,
    quem: (e) => quemMarcou(e, d, d.usuarioId ?? ''),
  })
}

/** Guarda neste aparelho que estes registros já foram lançados no sistema oficial. */
export async function marcarLancados(obraId: string, ids: readonly string[]) {
  const antes = (await banco.lerMeta<string[]>(chaveLancados(obraId))) ?? []
  await banco.gravarMeta(chaveLancados(obraId), [...new Set([...antes, ...ids])])
}

/** O que foi marcado no app e falta lançar no sistema oficial. Sem lancados: tudo o que foi marcado no app. */
export function paraLancarDaObra(d: DadosFvs, lancados?: ReadonlySet<string> | null): LinhaDeLancamento[] {
  // o item calculado pelo Concreto não foi marcado por ninguém: não entra na lista do que lançar
  const eventosDe = new Map([...d.eventosDe].map(([k, l]) => [k, l.some(ehDoConcreto) ? l.filter((e) => !ehDoConcreto(e)) : l]))
  return listarParaLancar(
    {
      pecas: d.pecaPorId.values(),
      pavimentos: d.pavimentos,
      eventosDe,
      fichaPorId: d.fichaPorId,
      fichasCampoDe: d.fichasCampoDe,
      quem: (e) => quemMarcou(e, d, d.usuarioId ?? ''),
    },
    lancados,
  )
}

/** Situação de todas as peças da obra, uma linha por peça e ficha, para a planilha do escritório. */
export function situacaoDaObra(d: DadosFvs): LinhaDaSituacao[] {
  return linhasDaSituacao({
    // arranque do pilar de cima (só detalhe) fica de fora, como na aba Pilares e no início
    pecas: [...d.pecaPorId.values()].filter((p) => !soDetalheGuardado(p.id)),
    pavimentos: d.pavimentos,
    fichas: d.fichas,
    fichaPorId: d.fichaPorId,
    fichasCampoDe: d.fichasCampoDe,
    eventosDe: d.eventosDe,
    quem: (e) => quemMarcou(e, d, d.usuarioId ?? ''),
    areaDe: (id) => d.areaPorId?.get(id),
    escalaDe: (plantaId) => escalaDaArea(d, plantaId),
    partesDe: partesDoPilar,
    travadaDe: (id) => {
      const a = d.areaPorId?.get(id)
      return !!a && travasDaAreaNaObra(d, a).length > 0
    },
  })
}

/**
 * Escala da planta em que a área foi desenhada, pelo manifest guardado no aparelho. Se aquela revisão
 * já saiu do aparelho, vale a da revisão vigente do mesmo trecho (a área fica no mesmo lugar).
 */
export function escalaDaArea(d: Pick<DadosFvs, 'vigenteDe'>, plantaId: string | null): number | undefined {
  return escalaGuardada(plantaId) ?? escalaGuardada(plantaId ? d.vigenteDe.get(plantaId) : null)
}

/** Consolo e capitel do pilar que ainda não estão liberados (pela ficha padrão do pilar e pelas abertas). */
export function situacaoDaParteNaObra(d: Pick<DadosFvs, 'fichas' | 'fichaPorId' | 'eventosDe' | 'fichasCampoDe'>, elementoId: string, parte: string) {
  const eventos = d.eventosDe.get(elementoId) ?? []
  const fichaPorId = (id: string) => d.fichaPorId.get(id)
  return situacaoDaParteNoLocal(fichaDaPeca(fichasPara('P', d.fichas)[0], eventos, fichaPorId), d.fichasCampoDe.get(elementoId) ?? [], fichaPorId, eventos, parte)
}

/**
 * O que trava a área de laje: consolo ou capitel dentro dela ainda não liberado. As partes vêm do
 * pacote da planta em que a área foi desenhada (ou da revisão vigente do trecho), guardado no aparelho.
 */
export function travasDaAreaNaObra(
  d: Pick<DadosFvs, 'vigenteDe' | 'fichas' | 'fichaPorId' | 'eventosDe' | 'fichasCampoDe'>,
  a: Pick<AreaDeLaje, 'contorno' | 'planta_id'>,
  partes?: readonly ParteDaPlanta[],
  situacaoDe: (elementoId: string, parte: string) => ReturnType<typeof situacaoDaParteNaObra> = (id, parte) => situacaoDaParteNaObra(d, id, parte),
): TravaDaArea[] {
  let lista = partes ?? partesDaPlantaGuardadas(a.planta_id)
  if (!lista.length && !partes && a.planta_id) lista = partesDaPlantaGuardadas(d.vigenteDe.get(a.planta_id))
  return lista.length ? travasDaArea(a.contorno, lista, situacaoDe) : []
}

/** Consolo e capitel de um pilar pelo pacote guardado no aparelho (para os resumos fora da planta). */
export const partesDoPilar = (id: string): readonly string[] => partesGuardadas(id)

/** A ficha padrão de um local: a área de laje tem a sua, escolhida ao desenhar; a peça, a do tipo. */
export function fichaDoLocalNaObra(d: Pick<DadosFvs, 'areaPorId' | 'fichaPorId' | 'fichas'>, p: Pick<Peca, 'id' | 'tipo'>): Ficha | undefined {
  const area = d.areaPorId.get(p.id)
  if (area) return d.fichaPorId.get(area.ficha_id)
  return fichasPara(p.tipo, d.fichas)[0]
}

/**
 * Busca os nomes de quem divide obra com a pessoa e guarda no aparelho. Devolve true se mudou algo.
 * Sem internet ou sem permissão, fica com o que já tinha: nome é detalhe, não pode atrapalhar o campo.
 */
export async function atualizarNomes(): Promise<boolean> {
  try {
    const { data, error } = await cliente.from('perfis').select('id, nome')
    if (error || !data) return false
    const novos: Record<string, string> = {}
    for (const l of data as Array<{ id: string; nome: string | null }>) if (l.nome) novos[l.id] = l.nome
    const antes = (await banco.lerMeta<Record<string, string>>(CHAVE_NOMES)) ?? {}
    if (JSON.stringify(antes) === JSON.stringify(novos)) return false
    await banco.gravarMeta(CHAVE_NOMES, novos)
    return true
  } catch (e) {
    // sem internet ou sem permissão: fica com os nomes que já tinha (o erro fica no console)
    console.warn('FVS: nomes de quem marcou não atualizados', e)
    return false
  }
}

const ordemNatural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

/** Planta de ambientes (fichas por ambiente: alvenaria, reboco...) e não de forma (pilares e vigas). */
export const ehDeAmbientes = (p: Pick<Planta, 'disciplina'>) => p.disciplina === 'arquitetura'

/** Planta de armadura de laje: uma por direção (longitudinal inferior...), com a prancha de armação no fundo e
 *  só as barras daquela direção, nas coordenadas da forma do pavimento (pipeline/fvs/armadura_laje.py). */
export const ehDeArmadura = (p: Pick<Planta, 'disciplina'>) => p.disciplina === 'armadura'

/** Planta de modulação do pavimento (20/11/2026): cada parede de alvenaria é um local "M", conferido pela ficha
 *  de alvenaria; o fundo é a prancha de 1ª fiada ou a de arquitetura (pipeline/fvs/vedacao.py). */
export const ehDeVedacao = (p: Pick<Planta, 'disciplina'>) => p.disciplina === 'vedacao'

/** Planta de furos de laje de uma camada (21/11/2026): esgoto, água ou elétrica, com o fundo da forma e
 *  nas coordenadas dela (pipeline/fvs/furos.py). As áreas de laje da forma valem aqui. */
export const ehDeFuracao = (p: Pick<Planta, 'disciplina'>) => p.disciplina === 'furacao'

function agrupar<T>(itens: readonly T[], chave: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const i of itens) {
    const k = chave(i)
    const l = m.get(k)
    if (l) l.push(i)
    else m.set(k, [i])
  }
  return m
}

/**
 * Hora no formato único do app (UTC, milissegundos). "Vale o último registro" compara como texto, e o
 * servidor devolve a hora no fuso do banco ("-03:00"): sem isto, um registro antigo poderia ganhar.
 */
export function horaNormal(iso: string): string {
  if (iso.length === 24 && iso.endsWith('Z')) return iso
  const t = Date.parse(iso)
  return Number.isNaN(t) ? iso : new Date(t).toISOString()
}

/**
 * O local de um registro: a peça (elemento_id), a área de laje (area_id) ou a barra de laje (barra_id,
 * desde 20/11/2026; antes a barra ia em elemento_id, e esses registros continuam valendo).
 */
export const localDoRegistro = (l: Readonly<Record<string, unknown>>): string => String(l.elemento_id ?? l.area_id ?? l.barra_id)

function paraEvento(l: Linha): EventoFvs {
  return {
    id: l.id,
    // para a tela, a área de laje e a barra são locais como a peça: os registros delas ficam na mesma lista
    elemento_id: localDoRegistro(l),
    ficha_id: String(l.ficha_id),
    item: Number(l.item),
    resultado: normalizarResultado(l.resultado),
    rodada: Number(l.rodada ?? 1),
    observacao: (l.observacao as string | null) ?? null,
    lote_id: (l.lote_id as string | null) ?? null,
    planta_id: (l.planta_id as string | null) ?? null,
    usuario_id: l.usuario_id,
    criado_em_dispositivo: horaNormal(l.criado_em_dispositivo),
    ficha_campo_id: (l.ficha_campo_id as string | null) ?? null,
    verificado_por: (l.verificado_por as string | null) ?? null,
    origem_id: (l.origem_id as string | null) ?? null,
  }
}

/**
 * Dados com registros novos, sem reler o aparelho. Com milhares de registros (o histórico da obra),
 * reler tudo a cada toque passa do limite de resposta do campo (0,1 s).
 */
export function comRegistros(d: DadosFvs, linhas: readonly Linha[]): DadosFvs {
  const eventosDe = new Map(d.eventosDe)
  for (const l of linhas) {
    const e = paraEvento(l)
    const atuais = eventosDe.get(e.elemento_id) ?? []
    // o registro pode já ter vindo na leitura do aparelho
    if (!atuais.some((x) => x.id === e.id)) eventosDe.set(e.elemento_id, [...atuais, e])
  }
  return { ...d, eventosDe }
}

function paraFichaCampo(l: Linha): FichaCampo {
  return {
    id: l.id,
    elemento_id: (l.elemento_id as string | null) ?? null,
    ficha_id: (l.ficha_id as string | null) ?? null,
    codigo: String(l.codigo),
    local: String(l.local_construpoint ?? ''),
    ficha_codigo: (l.ficha_codigo as string | null) ?? null,
    ficha_titulo: (l.ficha_titulo as string | null) ?? null,
    status: String(l.status ?? ''),
    inspetor: (l.inspetor as string | null) ?? null,
    atualizada_em: (l.atualizada_em as string | null) ?? null,
    qtd_a: Number(l.qtd_a ?? 0),
    qtd_r: Number(l.qtd_r ?? 0),
    qtd_na: Number(l.qtd_na ?? 0),
  }
}

/** Lê tudo da FVS da obra (o que já foi baixado + o que foi registrado aqui). */
export async function carregar(obraId: string): Promise<DadosFvs> {
  // tudo de uma vez, inclusive os caminhões do Concreto (antes vinham depois, somando o tempo ao abrir)
  const [pav, set, elem, arqs, fic, pla, evs, fot, fcs, ars, nomes, lancados, regras, caminhoes] = await Promise.all([
    sincronizador.linhas('pavimentos', obraId),
    sincronizador.linhas('setores', obraId),
    sincronizador.linhas('elementos', obraId),
    sincronizador.linhas('arquivos', obraId),
    sincronizador.linhas('fichas_modelo', obraId),
    sincronizador.linhas('plantas', obraId),
    sincronizador.linhas('fvs_eventos', obraId),
    sincronizador.linhas('fvs_fotos', obraId),
    sincronizador.linhas('fvs_fichas_campo', obraId),
    sincronizador.linhas('fvs_areas', obraId),
    banco.lerMeta<Record<string, string>>(CHAVE_NOMES),
    banco.lerMeta<string[]>(chaveLancados(obraId)),
    sincronizador.linhas('fvs_regras', obraId),
    // caminhões do Concreto por peça (sem Concreto na obra, nenhum): o item do rastreio fica C, só calculado
    caminhoesDasPecas(obraId).catch(() => new Map<string, CaminhaoDaPeca[]>()),
  ])
  const setor = new Map(set.map((s) => [s.id, { nome: String(s.nome_projeto), disciplina: String(s.disciplina ?? 'estrutura') }]))
  const arquivo = new Map(arqs.map((a) => [a.id, { id: a.id, caminho: String(a.caminho), hash: String(a.hash), tamanho: Number(a.tamanho) }]))
  const substituidas = new Set(pla.map((p) => p.substitui_id as string | null).filter(Boolean) as string[])
  const plantas: Planta[] = pla
    .filter((p) => !substituidas.has(p.id))
    .map((p) => ({
      id: p.id,
      pavimento_id: String(p.pavimento_id),
      setor_id: String(p.setor_id),
      trecho: setor.get(String(p.setor_id))?.nome ?? 'Trecho',
      disciplina: setor.get(String(p.setor_id))?.disciplina ?? 'estrutura',
      prancha: String(p.prancha),
      revisao: String(p.revisao),
      elementos: Number(p.elementos ?? 0),
      manifest: arquivo.get(String(p.manifest_id)) ?? null,
      pacote: arquivo.get(String(p.pacote_id)) ?? null,
      criado_em_dispositivo: p.criado_em_dispositivo,
    }))
  const plantasDe = new Map<string, Planta[]>()
  for (const [k, l] of agrupar(plantas, (p) => p.pavimento_id)) {
    // duas plantas vigentes no mesmo trecho (publicadas em paralelo): fica a mais nova
    const porSetor = new Map<string, Planta>()
    for (const p of l) {
      const a = porSetor.get(p.setor_id)
      if (!a || Date.parse(p.criado_em_dispositivo) > Date.parse(a.criado_em_dispositivo)) porSetor.set(p.setor_id, p)
    }
    // estrutura primeiro (é a ordem da obra), depois a armadura de laje, depois as plantas de ambientes
    const ordem = (p: Planta) => (ehDeAmbientes(p) ? 2 : ehDeArmadura(p) || ehDeFuracao(p) ? 1 : 0)
    plantasDe.set(k, [...porSetor.values()].sort((a, b) => ordem(a) - ordem(b) || ordemNatural.compare(a.trecho, b.trecho)))
  }
  const fichas: Ficha[] = fic.map((f) => ({
    id: f.id,
    codigo: String(f.codigo),
    titulo: String(f.titulo),
    revisao: String(f.revisao ?? '0'),
    aplica_a: (f.aplica_a as string[]) ?? [],
    itens: ((f.itens as ItemFicha[]) ?? []).map((i) => ({ ...i, n: Number(i.n), etapa: i.etapa ?? '' })),
  }))
  // peça de exemplo (a laje que os exemplos do Concreto criam, `exemplo: true`) não é peça da FVS:
  // não conta nos totais nem aparece no mapa (obra de demonstração, 13/11)
  const pecas: Peca[] = elem.filter((e) => e.exemplo !== true).map((e) => ({
    id: e.id,
    pavimento_id: String(e.pavimento_id),
    tipo: String(e.tipo),
    nome: String(e.nome),
    secao: (e.secao as string | null) ?? null,
  }))
  const areas = areasVigentes(ars as unknown as LinhaDeArea[])
  for (const a of areas) pecas.push({ id: a.id, pavimento_id: a.pavimento_id, tipo: 'L', nome: a.nome, secao: null })
  const fichasCampo = fcs.map(paraFichaCampo)
  const fotosDe = new Map<string, string[]>()
  for (const f of fot) {
    const k = String(f.evento_id)
    fotosDe.set(k, [...(fotosDe.get(k) ?? []), String(f.arquivo_id)])
  }
  const { anterioresDe, vigenteDe } = cadeiaDeRevisoes(pla)
  let servidorMaisNovo: string | null = null
  for (const l of [...pla, ...evs]) {
    const s = l.criado_em_servidor as string | undefined
    if (s && (!servidorMaisNovo || s > servidorMaisNovo)) servidorMaisNovo = s
  }
  const fichaPorId = new Map(fichas.map((f) => [f.id, f]))
  const areaPorId = new Map(areas.map((a) => [a.id, a]))
  const eventosDe = agrupar(evs.map(paraEvento), (e) => e.elemento_id)
  for (const p of pecas) {
    const lista = caminhoes.get(p.id)
    if (!lista) continue
    const ficha = fichaDoLocalNaObra({ areaPorId, fichaPorId, fichas }, p)
    const calculado = registroDoRastreio(p.id, ficha, lista, eventosDe.get(p.id) ?? [])
    if (calculado) eventosDe.set(p.id, [...(eventosDe.get(p.id) ?? []), calculado])
  }
  return {
    pavimentos: pav.map((p) => ({ id: p.id, nome: String(p.nome), ordem: Number(p.ordem) })).sort((a, b) => a.ordem - b.ordem),
    plantasDe,
    plantaPorId: new Map(plantas.map((p) => [p.id, p])),
    anterioresDe,
    vigenteDe,
    fichas,
    fichaPorId,
    fichasCampoDe: agrupar(fichasCampo.filter((f) => f.elemento_id), (f) => String(f.elemento_id)),
    fichasCampoSemPeca: fichasCampo.filter((f) => !f.elemento_id).sort((a, b) => ordemNatural.compare(a.local, b.local)),
    pecaPorId: new Map(pecas.map((p) => [p.id, p])),
    areasDe: agrupar(areas, (a) => a.pavimento_id),
    areaPorId,
    eventosDe,
    fotosDe,
    arquivoPorId: arquivo,
    nomePorUsuario: new Map(Object.entries(nomes ?? {})),
    lancados: new Set(lancados ?? []),
    servidorMaisNovo,
    regras: regrasVigentes(regras),
  }
}

export function podeRegistrar(papel: PapelNaObra): boolean {
  return papel !== 'leitura'
}

// ---------------------------------------------------------------------
// Registro (sempre inclusão)
// ---------------------------------------------------------------------

export interface Contexto {
  obraId: string
  usuarioId: string
  plantaId: string | null
  /** ficha aberta em que a pessoa está marcando (peça com ficha do sistema oficial) */
  fichaCampoId?: string | null
  /** ids das áreas de laje: o registro delas vai em area_id, e não em elemento_id */
  areas?: { has(id: string): boolean }
  /**
   * ids das barras de laje do pacote da planta: o registro delas vai em barra_id (a barra não está em
   * elementos; migração 20261120140000_fvs_eventos_barra.sql), sempre com planta_id
   */
  barras?: { has(id: string): boolean }
}

/**
 * Texto para a tela quando uma marcação não foi gravada. Erro do banco do navegador vem em inglês e
 * não ajuda; a pessoa precisa saber que aquele toque não valeu.
 */
export function textoDoErroDeGravacao(e: unknown): string {
  const erro = e as { name?: string; message?: string; inner?: { name?: string } } | null
  if (erro?.name === 'QuotaExceededError' || erro?.inner?.name === 'QuotaExceededError') {
    return 'O aparelho está sem espaço: esta marcação não foi gravada. Libere espaço e marque de novo.'
  }
  // só erro nosso (Error comum) tem texto para mostrar
  if (erro?.name === 'Error' && erro.message) return erro.message
  return 'Esta marcação não foi gravada no aparelho. Tente de novo.'
}

/** Só leva a coluna quando há ficha aberta. */
const daFichaAbertaDe = (c: Contexto) => (c.fichaCampoId ? { ficha_campo_id: c.fichaCampoId } : {})

/** A coluna que diz onde foi marcado: a peça, a área de laje ou a barra de laje. */
const doLocal = (c: Contexto, id: string) => (c.areas?.has(id) ? { area_id: id } : c.barras?.has(id) ? { barra_id: id } : { elemento_id: id })

/**
 * Toque num botão C / NC / NA de um item. Devolve o registro gravado. `observacao`: o NC do modo "Por
 * item" já vai com o que está errado (escrito antes de Confirmar).
 */
export async function tocarItem(c: Contexto, pecaId: string, ficha: Ficha, item: number, resultado: Resultado, eventos: readonly EventoFvs[], id?: string, observacao?: string | null) {
  const atual = ultimosPorItem(eventos.filter((e) => e.ficha_id === ficha.id)).get(item)
  const novo = aoTocar(atual, resultado)
  return sincronizador.registrar('fvs_eventos', c.obraId, c.usuarioId, {
    // o id anotado no diário de toques (toques.ts): refeito depois de recarregar, não duplica
    ...(id ? { id } : {}),
    ...doLocal(c, pecaId),
    ficha_id: ficha.id,
    item,
    resultado: novo.resultado,
    rodada: novo.rodada,
    // a observação de um R continua no R seguinte da mesma rodada; reinspeção começa limpa. No C, só a
    // que a tela manda (o "Marcado antes do prazo" das regras da obra)
    observacao: ((novo.resultado === 'NC' || novo.resultado === 'C') && observacao?.trim()) || null,
    planta_id: c.plantaId,
    ...daFichaAbertaDe(c),
  })
}

/** Tira o NC de um item marcado por engano (mesma rodada, sem resultado). */
export async function desmarcarR(c: Contexto, pecaId: string, ficha: Ficha, item: number, eventos: readonly EventoFvs[], id?: string) {
  const atual = ultimosPorItem(eventos.filter((e) => e.ficha_id === ficha.id)).get(item)
  return sincronizador.registrar('fvs_eventos', c.obraId, c.usuarioId, {
    ...(id ? { id } : {}),
    ...doLocal(c, pecaId),
    ficha_id: ficha.id,
    item,
    resultado: null,
    rodada: atual?.rodada ?? 1,
    observacao: null,
    planta_id: c.plantaId,
    ...daFichaAbertaDe(c),
  })
}

/**
 * Desfazer de um toque só (o furo): volta o item ao que estava antes, se o registro mais novo ainda
 * é o que o toque gravou. Devolve o registro novo, ou undefined se o item já mudou depois.
 */
export async function voltarItem(c: Contexto, gravado: Linha, anterior: EventoFvs | undefined, eventos: readonly EventoFvs[]): Promise<Linha | undefined> {
  const doItem = daFichaAberta(eventos, (gravado.ficha_campo_id as string | null) ?? null).filter((e) => e.ficha_id === gravado.ficha_id)
  if (ultimosPorItem(doItem).get(Number(gravado.item))?.id !== gravado.id) return undefined
  return sincronizador.registrar('fvs_eventos', c.obraId, c.usuarioId, {
    ...doLocal(c, localDoRegistro(gravado)),
    ficha_id: gravado.ficha_id,
    item: gravado.item,
    resultado: anterior?.resultado ?? null,
    rodada: anterior?.rodada ?? Number(gravado.rodada ?? 1),
    observacao: anterior?.observacao ?? null,
    planta_id: c.plantaId,
    ...daFichaAbertaDe(c),
  })
}

/**
 * Item de furação da viga, marcado pelos furos dela: grava o resultado que os furos dão (C, NC ou
 * pendente). Sair do NC para outro resultado é a reinspeção (rodada seguinte); a observação do NC diz
 * qual furo está errado.
 */
export async function marcarPelosFuros(c: Contexto, vigaId: string, ficha: Ficha, item: number, resultado: Resultado | null, observacao: string | null, eventos: readonly EventoFvs[]) {
  const atual = ultimosPorItem(eventos.filter((e) => e.ficha_id === ficha.id)).get(item)
  const rodada = atual?.resultado === 'NC' && resultado && resultado !== 'NC' ? atual.rodada + 1 : (atual?.rodada ?? 1)
  return sincronizador.registrar('fvs_eventos', c.obraId, c.usuarioId, {
    ...doLocal(c, vigaId),
    ficha_id: ficha.id,
    item,
    resultado,
    rodada,
    observacao,
    planta_id: c.plantaId,
    ...daFichaAbertaDe(c),
  })
}

/**
 * Ligação entre fichas (regras da obra): depois do C em `item`, marca C nos itens ligados da mesma peça
 * que ainda estão vazios, com a origem na observação. Todos com o mesmo lote_id: o "Desfazer" do toque
 * os desfaz juntos (desfazerLote). Devolve os registros gravados (vazio sem ligação).
 */
export async function marcarPelasLigacoes(
  c: Contexto,
  regras: RegrasFvs,
  pecaId: string,
  ficha: Ficha,
  item: number,
  fichasDaPeca: readonly Ficha[],
  eventos: readonly EventoFvs[],
): Promise<Linha[]> {
  const alvos = alvosDaLigacao(regras, { ficha, item }, fichasDaPeca, eventos)
  if (!alvos.length) return []
  const lote = crypto.randomUUID()
  const gravados: Linha[] = []
  for (const a of alvos) {
    const atual = ultimosPorItem(eventos.filter((e) => e.ficha_id === a.ficha.id)).get(a.item)
    gravados.push(
      await sincronizador.registrar('fvs_eventos', c.obraId, c.usuarioId, {
        ...doLocal(c, pecaId),
        ficha_id: a.ficha.id,
        item: a.item,
        resultado: 'C',
        rodada: atual?.rodada ?? 1,
        observacao: observacaoDaLigacao(a),
        planta_id: c.plantaId,
        lote_id: lote,
        ...daFichaAbertaDe(c),
      }),
    )
  }
  return gravados
}

/**
 * Ligações depois de vários C na mesma peça (Etapa C, pincel, "Por item"): um item depois do outro, cada
 * um vendo o que os anteriores marcaram. Devolve tudo o que as ligações gravaram.
 */
export async function ligarDepoisDe(
  c: Contexto,
  regras: RegrasFvs,
  pecaId: string,
  ficha: Ficha,
  itens: readonly number[],
  eventos: readonly EventoFvs[],
): Promise<Linha[]> {
  if (!regras.ligacoes.length || !itens.length) return []
  let evs = [...eventos]
  const todos: Linha[] = []
  for (const item of itens) {
    const g = await marcarPelasLigacoes(c, regras, pecaId, ficha, item, [ficha], evs)
    todos.push(...g)
    evs = [...evs, ...g.map(paraEvento)]
  }
  return todos
}

/** Uma peça de dentro da área de laje, para a ligação gravar nela: mais a ficha aberta em uso na peça. */
export interface PecaParaLigar extends PecaDaArea {
  fichaCampoId: string | null
}

/**
 * Ligação entre peças (regras com `entre: 'area'`, 20/11/2026): depois do C nos `itens` da ficha da
 * área de laje, marca C nos itens ligados, ainda vazios, de cada pilar e viga de dentro dela, com a
 * área na observação. Todos com o mesmo lote_id: o "Desfazer" do toque os desfaz juntos
 * (desfazerLote). Devolve os registros gravados (vazio sem ligação entre peças).
 */
export async function ligarEntrePecas(
  c: Contexto,
  regras: RegrasFvs,
  nomeDaArea: string,
  ficha: Ficha,
  itens: readonly number[],
  pecas: readonly PecaParaLigar[],
): Promise<Linha[]> {
  if (!itens.length || !pecas.length || !temLigacaoEntrePecas(regras)) return []
  // cada item vê o que o anterior marcou
  const vivas = new Map(pecas.map((p) => [p.id, { ...p, eventos: [...p.eventos] }]))
  const lote = crypto.randomUUID()
  const gravados: Linha[] = []
  for (const item of itens) {
    for (const a of alvosEntrePecas(regras, { ficha, item }, [...vivas.values()])) {
      const p = vivas.get(a.peca.id)!
      const atual = ultimosPorItem(p.eventos.filter((e) => e.ficha_id === a.ficha.id)).get(a.item)
      const g = await sincronizador.registrar('fvs_eventos', c.obraId, c.usuarioId, {
        elemento_id: p.id,
        ficha_id: a.ficha.id,
        item: a.item,
        resultado: 'C',
        rodada: atual?.rodada ?? 1,
        observacao: observacaoEntrePecas(nomeDaArea, a),
        planta_id: c.plantaId,
        lote_id: lote,
        ...(p.fichaCampoId ? { ficha_campo_id: p.fichaCampoId } : {}),
      })
      gravados.push(g)
      p.eventos.push(paraEvento(g))
    }
  }
  return gravados
}

/** O prazo das regras da obra que ainda segura este item da peça (null = nenhum). */
export function prazoDoItemNaPeca(
  d: Pick<DadosFvs, 'regras' | 'fichaPorId'>,
  ficha: Ficha,
  eventos: readonly EventoFvs[],
  item: number,
  agora = new Date(),
): PrazoDoItem | null {
  if (!d.regras.prazos.length) return null
  return prazoPendente(d.regras, { eventos, ficha, fichaPorId: (id) => d.fichaPorId.get(id), datasDoConcreto: datasDoConcreto(eventos) }, item, agora)
}

/**
 * Itens de um lote (Etapa C, pincel) ainda vazios e dentro do prazo das regras da obra: `peça#item` →
 * a observação que vai no registro. Vazio sem prazos.
 */
export function prazosDoLote(
  d: Pick<DadosFvs, 'regras' | 'fichaPorId'>,
  pecas: ReadonlyArray<{ id: string; ficha: Ficha; eventos: readonly EventoFvs[] }>,
  etapa: string | null,
  agora = new Date(),
): Map<string, string> {
  const m = new Map<string, string>()
  if (!d.regras.prazos.length) return m
  for (const p of pecas) {
    const ult = ultimosPorItem(p.eventos.filter((e) => e.ficha_id === p.ficha.id))
    for (const it of p.ficha.itens) {
      if ((etapa && it.etapa !== etapa) || ult.get(it.n)?.resultado) continue
      const prazo = prazoDoItemNaPeca(d, p.ficha, p.eventos, it.n, agora)
      if (prazo) m.set(`${p.id}#${it.n}`, observacaoDoPrazo(prazo))
    }
  }
  return m
}

/** "O que fazer?" de um item reprovado: registro novo igual ao atual, com a observação. */
export async function observar(c: Contexto, atual: EventoFvs, observacao: string) {
  return sincronizador.registrar('fvs_eventos', c.obraId, c.usuarioId, {
    ...doLocal(c, atual.elemento_id),
    ficha_id: atual.ficha_id,
    item: atual.item,
    resultado: atual.resultado,
    rodada: atual.rodada,
    observacao: observacao.trim() || null,
    planta_id: c.plantaId,
    ...daFichaAbertaDe(c),
    // continua o R de quem marcou: a pessoa só acrescentou o texto
    ...(atual.verificado_por ? { verificado_por: atual.verificado_por } : {}),
  })
}

/**
 * Marcação em lote (etapa inteira ou pincel): marca `resultado` nos itens ainda vazios
 * de cada peça. Todos os registros levam o mesmo lote_id. Devolve os registros gravados.
 */
export async function marcarLote(
  c: Contexto,
  pecas: ReadonlyArray<{ id: string; ficha: Ficha; eventos: readonly EventoFvs[] }>,
  etapa: string | null,
  resultado: 'C' | 'NA',
  /** o lote anotado no diário de toques: refeito depois de recarregar, completa o mesmo lote */
  loteId?: string,
  /** observação de alguns itens (`peça#item`): o "Marcado antes do prazo" das regras da obra */
  observacoes?: ReadonlyMap<string, string>,
): Promise<Linha[]> {
  const lote = loteId ?? crypto.randomUUID()
  const aMarcar: Array<{ peca: string; ficha: string; item: number; rodada: number }> = []
  for (const p of pecas) {
    const ult = ultimosPorItem(p.eventos.filter((e) => e.ficha_id === p.ficha.id))
    for (const it of p.ficha.itens) {
      if (etapa && it.etapa !== etapa) continue
      // consolo e capitel: o pincel sem etapa não marca; com a etapa da parte, só no pilar que a tem
      if (it.parte && (!etapa || !p.ficha.partesDaPeca?.includes(it.parte))) continue
      const atual = ult.get(it.n)
      if (atual?.resultado) continue
      aMarcar.push({ peca: p.id, ficha: p.ficha.id, item: it.n, rodada: atual?.rodada ?? 1 })
    }
  }
  const gravados: Linha[] = []
  for (const m of aMarcar) {
    gravados.push(
      await sincronizador.registrar('fvs_eventos', c.obraId, c.usuarioId, {
        ...doLocal(c, m.peca),
        ficha_id: m.ficha,
        item: m.item,
        resultado,
        rodada: m.rodada,
        observacao: (resultado === 'C' && observacoes?.get(`${m.peca}#${m.item}`)) || null,
        planta_id: c.plantaId,
        lote_id: lote,
        ...daFichaAbertaDe(c),
      }),
    )
  }
  return gravados
}

/**
 * Desfaz uma marcação em lote (toque errado no pincel, por exemplo): limpa os itens que ainda estão
 * como o lote deixou. Item que mudou depois do lote fica como está. Devolve os registros gravados.
 */
export async function desfazerLote(c: Contexto, lote: readonly Linha[], eventosDe: (id: string) => readonly EventoFvs[]): Promise<Linha[]> {
  const gravados: Linha[] = []
  for (const l of lote) {
    const doItem = daFichaAberta(eventosDe(localDoRegistro(l)), (l.ficha_campo_id as string | null) ?? null).filter((e) => e.ficha_id === l.ficha_id)
    if (ultimosPorItem(doItem).get(Number(l.item))?.id !== l.id) continue
    gravados.push(
      await sincronizador.registrar('fvs_eventos', c.obraId, c.usuarioId, {
        ...(l.area_id ? { area_id: l.area_id } : l.barra_id ? { barra_id: l.barra_id } : { elemento_id: l.elemento_id }),
        ficha_id: l.ficha_id,
        item: l.item,
        resultado: null,
        rodada: l.rodada,
        observacao: null,
        planta_id: l.planta_id,
        lote_id: l.lote_id,
        ...(l.ficha_campo_id ? { ficha_campo_id: l.ficha_campo_id } : {}),
      }),
    )
  }
  return gravados
}

/** Área de laje nova: a primeira linha aponta para si mesma (area_id = id). Funciona sem internet. */
export async function criarArea(
  c: Contexto,
  dados: { pavimentoId: string; setorId: string; nome: string; fichaId: string; codigoFicha: string; contorno: readonly Ponto[] },
): Promise<Linha> {
  const id = crypto.randomUUID()
  return sincronizador.registrar('fvs_areas', c.obraId, c.usuarioId, {
    id,
    area_id: id,
    pavimento_id: dados.pavimentoId,
    setor_id: dados.setorId,
    planta_id: c.plantaId,
    nome: dados.nome.trim(),
    ficha_id: dados.fichaId,
    codigo_ficha: dados.codigoFicha.trim() || null,
    contorno: dados.contorno,
    cancelada: false,
  })
}

/** Muda uma área (contorno novo ou apagar): linha nova com o mesmo area_id; as marcações continuam valendo. */
export async function mudarArea(c: Contexto, a: AreaDeLaje, mudanca: { contorno?: readonly Ponto[]; cancelada?: boolean }): Promise<Linha> {
  return sincronizador.registrar('fvs_areas', c.obraId, c.usuarioId, {
    area_id: a.id,
    pavimento_id: a.pavimento_id,
    setor_id: a.setor_id,
    planta_id: c.plantaId,
    nome: a.nome,
    ficha_id: a.ficha_id,
    codigo_ficha: a.codigo_ficha,
    contorno: mudanca.contorno ?? a.contorno,
    cancelada: mudanca.cancelada ?? false,
  })
}

/** Foto de uma não conformidade: guarda no aparelho e liga ao registro. */
export async function anexarFoto(c: Contexto, eventoId: string, foto: Blob) {
  const arq = await sincronizador.registrarArquivo(c.obraId, c.usuarioId, 'fvs', foto, `nc-${eventoId}.jpg`)
  await sincronizador.registrar('fvs_fotos', c.obraId, c.usuarioId, { evento_id: eventoId, arquivo_id: arq.id })
  return arq
}

/** Reduz a foto (lado maior 1600 px, JPEG) para não encher o aparelho nem a internet da obra. */
export async function reduzirFoto(arquivo: Blob, lado = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(arquivo)
    const k = Math.min(1, lado / Math.max(bmp.width, bmp.height))
    const tela = document.createElement('canvas')
    tela.width = Math.round(bmp.width * k)
    tela.height = Math.round(bmp.height * k)
    tela.getContext('2d')!.drawImage(bmp, 0, 0, tela.width, tela.height)
    bmp.close()
    const b = await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/jpeg', 0.82))
    return b ?? arquivo
  } catch (e) {
    // navegador que não reduz a imagem: vai a foto original, maior, mas não se perde
    console.warn('FVS: foto guardada sem reduzir', e)
    return arquivo
  }
}

const urlsDeFoto = new Map<string, string>()

/**
 * Endereço para mostrar uma foto: do aparelho, se ela ainda está esperando envio; senão, do
 * armazenamento (precisa de internet). Sem os dois, null: a tela mostra que há foto, sem a imagem.
 */
export async function urlDaFoto(arquivoId: string, arquivo?: ArquivoServidor): Promise<string | null> {
  const ja = urlsDeFoto.get(arquivoId)
  if (ja) return ja
  const local = await banco.conteudos.get(arquivoId)
  let foto: Blob | null = local ? new Blob([local.bytes]) : null
  if (!foto && arquivo && navigator.onLine) foto = await baixarArquivo(arquivo.caminho).catch((e) => {
      console.warn('FVS: foto não baixou', e)
      return null
    })
  if (!foto) return null
  const url = URL.createObjectURL(foto)
  urlsDeFoto.set(arquivoId, url)
  return url
}

/** De onde vêm os arquivos das plantas: o armazenamento do servidor. */
let baixarArquivo: Baixador = async (caminho, aoBytes) => {
  // conexão parada não tem alternativa: avisa logo, em vez de tentar o outro caminho e esperar de novo
  const seNaoParou = (e: unknown) => {
    if (e instanceof DownloadParado) throw e
    return null
  }
  if (aoBytes) {
    // por endereço assinado dá para acompanhar o progresso; se não der, baixa direto, sem progresso
    const assinado = await comPrazo(cliente.storage.from(BUCKET_OBRAS).createSignedUrl(caminho, 3600), LIMITE_SEM_DADOS_MS).catch(seNaoParou)
    const controle = new AbortController()
    const resposta = assinado?.data?.signedUrl ? await comPrazo(fetch(assinado.data.signedUrl, { signal: controle.signal }), LIMITE_SEM_DADOS_MS, () => controle.abort()).catch(seNaoParou) : null
    if (resposta?.ok) return lerComProgresso(resposta, aoBytes)
  }
  // sem contar os bytes não dá para ver se parou: o prazo é o do arquivo inteiro numa internet fraca
  const { data, error } = await comPrazo(cliente.storage.from(BUCKET_OBRAS).download(caminho), 10 * LIMITE_SEM_DADOS_MS)
  if (error || !data) throw new Error('Não consegui baixar a planta. Confira a internet e tente de novo.')
  return data
}

/** Só para a bancada e os testes: troca a origem dos arquivos das plantas (ex.: um servidor local). */
export function usarFonteDeArquivos(fonte: Baixador) {
  baixarArquivo = fonte
}

/** Baixa o pacote de uma planta (precisa de internet uma vez) e guarda no aparelho. */
export async function baixarPlanta(p: Planta, dono: DonoDoPacote, aoProgresso?: (fracao: number) => void) {
  if (!p.manifest || !p.pacote) throw new Error('Os arquivos desta planta ainda não chegaram ao aparelho. Sincronize e tente de novo.')
  return baixarPacote((caminho, aoBytes) => baixarArquivo(caminho, aoBytes), p.manifest, p.pacote, dono, aoProgresso)
}

/**
 * Ao abrir a FVS: refaz os toques anotados no diário (toques.ts) que não chegaram ao banco porque a
 * página recarregou no meio da gravação. Na ordem, cada um sobre os dados com o anterior já gravado.
 */
export async function refazerToquesDaObra(obraId: string, dados: DadosFvs, registrados: (l: readonly Linha[]) => DadosFvs): Promise<number> {
  let d = dados
  return refazerToques(
    obraId,
    async (id) => !!(await banco.registros.get(['fvs_eventos', id])),
    async (t) => {
      const c: Contexto = { obraId: t.obraId, usuarioId: t.usuarioId, plantaId: t.plantaId, fichaCampoId: t.fichaCampoId, areas: d.areaPorId }
      let feito: Linha | Linha[]
      if (t.tipo === 'lote') {
        const pecas = t.pecas.flatMap((p) => {
          const ficha = fichaNaPeca(d.fichaPorId.get(p.fichaId), partesGuardadas(p.id))
          return ficha ? [{ id: p.id, ficha, eventos: daFichaAberta(d.eventosDe.get(p.id) ?? [], p.fichaCampoId) }] : []
        })
        feito = await marcarLote(c, pecas, t.etapa, t.resultado, t.id)
      } else {
        const ficha = d.fichaPorId.get(t.fichaId)
        if (!ficha) throw new Error('a ficha do toque não está mais no aparelho')
        const evs = daFichaAberta(d.eventosDe.get(t.pecaId) ?? [], t.fichaCampoId)
        feito = t.tipo === 'item' ? await tocarItem(c, t.pecaId, ficha, t.item, t.resultado, evs, t.id, t.observacao) : await desmarcarR(c, t.pecaId, ficha, t.item, evs, t.id)
      }
      const linhas = Array.isArray(feito) ? feito : [feito]
      if (linhas.length) d = registrados(linhas)
      return feito
    },
  )
}

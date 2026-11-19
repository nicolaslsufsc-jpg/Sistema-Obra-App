// Pacote da obra: a pasta `dados_obra/` ao lado do app (gerada por pipeline/fvs/exportar_bancada.py),
// ou a mesma pasta num arquivo .zip escolhido no aparelho (pipeline/fvs/compactar_pacote.py; o Chrome
// do Android não abre pasta, só arquivo). Traz o cadastro da obra (pavimentos, trechos, peças, fichas), o histórico do sistema oficial e as
// plantas (manifest.json + pacote.bin de cada pavimento). Quando ela existe, o app abre direto na
// obra, sem login e sem servidor: é o modo sem conta (local.ts) já com a obra pronta.
//
// O cadastro entra no banco do aparelho como se tivesse sido baixado do servidor (pendente 0); o que
// a pessoa marca vai para a fila de pendentes como sempre, e "Salvar" (salvamento.ts) leva a fila.
// Os ids do cadastro são derivados do conteúdo (UUID determinístico): abrir de novo, ou abrir noutro
// PC com a mesma pasta, dá os mesmos ids, e o arquivo .obra de um PC restaura no outro.
import type { BancoLocal, Linha } from './banco_local'
import type { ObraLocal, UsuarioLocal } from './conta'
import { entrarSemConta } from './local'
import { espacoUsado } from './aparelho'
import { guardarPacote, pacotesNoAparelho, removerPacotes, sha256Hex, type Manifest } from '../fvs/pacote'
import { usarFonteDeArquivos } from '../fvs/dados'
import { abrirZip, ERRO_ZIP } from './zip'
import type { ItemFicha } from '../fvs/situacao'

export interface PlantaDoIndice {
  id: string
  trecho: string
  pasta: string
  prancha: string
  revisao: string
  largura: number
  altura: number
  elementos: number
  disciplina?: string
  manifest: { sha256: string; tamanho: number }
  pacote: { sha256: string; tamanho: number }
}

export interface IndicePacote {
  obra: string
  /** Nome por extenso (o pipeline grava com --nome; sem ele, NOME_SEM_PACOTE). */
  nome?: string
  /** Quando o pipeline gerou o pacote (ISO 8601). Pacote antigo não tem. */
  gerado_em?: string
  /** Sistema oficial externo da obra, ex. o id de um galho em src/integracoes/ (docs/modulos/integracoes.md). */
  sistema_oficial?: string
  /** De onde veio o pacote: 'nova_obra' = montado pelo assistente Nova obra (não recebe exemplos). */
  origem?: string
  pavimentos: Array<{
    nome: string
    pecas: Array<{ id: string; tipo: string; nome: string; secao: string }>
    plantas: PlantaDoIndice[]
  }>
}

export interface FichaDoPacote {
  codigo: string
  titulo: string
  revisao?: string
  tipo_modelo?: string
  aplica_a: string[]
  itens: ItemFicha[]
}

export interface HistoricoDoPacote {
  fichas_campo: Array<Record<string, unknown> & { id: string; ficha_codigo: string | null; elemento_id: string | null }>
  eventos: Array<Record<string, unknown> & { id: string; ficha_codigo: string; criado_em: string }>
}

/** De onde vêm os arquivos do pacote: a pasta ao lado do app ou um .zip escolhido no aparelho. */
export interface FonteDoPacote {
  /** Um arquivo do pacote pelo caminho dentro dele ("indice.json", "pav/planta/pacote.bin"); null = não existe. */
  ler(caminho: string): Promise<Blob | null>
  /** O que dizer quando uma planta tirada do aparelho não pode ser lida de novo daqui. */
  aviso: string
}

export interface PacoteLocalizado {
  /** de onde veio: endereço da pasta (terminado em "/") ou "zip:" e o nome do arquivo */
  raiz: string
  fonte: FonteDoPacote
  indice: IndicePacote
  textoIndice: string
}

const AVISO_DA_PASTA = 'A pasta da obra não respondeu. Abra o app de novo pelo ABRIR_SISTEMA_OBRA.bat.'
const AVISO_DO_ZIP = 'Para guardar esta planta de novo, abra o pacote da obra (.zip) no menu.'

function fonteDaPasta(raiz: string): FonteDoPacote {
  return {
    aviso: AVISO_DA_PASTA,
    async ler(caminho) {
      const r = await fetch(raiz + caminho, { cache: 'no-store' })
      return r.ok ? r.blob() : null
    },
  }
}

export interface ProgressoDoPacote {
  etapa: 'cadastro' | 'historico' | 'plantas'
  feitas: number
  total: number
}

/**
 * Nome da obra quando o índice do pacote não traz um (decisão do Nicolas em 08/11/2026, "Tirar o
 * nome"): o nome real só existe no pacote (o .zip, que fica nos aparelhos), nunca no site publicado.
 */
export const NOME_SEM_PACOTE = 'Obra'

/** Quem assina o cadastro e o histórico que vieram do pacote (não é ninguém do aparelho). */
export const USUARIO_DO_PACOTE = '00000000-0000-0000-0000-0000000000c0'
const DISPOSITIVO_DO_PACOTE = '00000000-0000-0000-0000-000000000000'
export const PASTA_DO_PACOTE = 'dados_obra/'
const PRAZO_LOCALIZAR_MS = 4000

const chaveDoPacote = (obraId: string) => `pacote_obra:${obraId}`

/** UUID derivado do texto (SHA-256, formato de UUID v5 pelos bits de versão e variante). */
export async function uuidDeterministico(texto: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)))
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const hex = [...h.subarray(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toLowerCase()

function ehIndice(x: unknown): x is IndicePacote {
  const i = x as IndicePacote
  return !!i && typeof i.obra === 'string' && i.obra.trim() !== '' && Array.isArray(i.pavimentos)
}

/**
 * Endereço da pasta do pacote: `dados_obra/` ao lado do app. `?dados=URL` só vale no modo de
 * desenvolvimento (bancada, `npm run dev`): no app compilado, um link com `?dados=` não troca a obra
 * de ninguém (o build tira este trecho; a lista de permissões já barrava endereço de fora).
 */
export function enderecoDoPacote(aceitarPedido = true): string {
  // import.meta.env.DEV vira false no build, e o compilador tira o trecho inteiro
  const pedido = import.meta.env.DEV && aceitarPedido && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('dados') : null
  const base = pedido || new URL(PASTA_DO_PACOTE, typeof document !== 'undefined' ? document.baseURI : 'http://localhost/').href
  return base.endsWith('/') ? base : base + '/'
}

/**
 * Procura o pacote da obra. null = não há (o app segue para o login). Não demora: sem resposta em
 * poucos segundos, desiste, porque esta leitura segura a tela inicial.
 */
export async function localizarPacote(raiz = enderecoDoPacote(), prazoMs = PRAZO_LOCALIZAR_MS): Promise<PacoteLocalizado | null> {
  const controle = new AbortController()
  const relogio = setTimeout(() => controle.abort(), prazoMs)
  try {
    const r = await fetch(raiz + 'indice.json', { signal: controle.signal, cache: 'no-store' })
    if (!r.ok) return null
    const textoIndice = await r.text()
    const indice = JSON.parse(textoIndice) as unknown
    return ehIndice(indice) ? { raiz, fonte: fonteDaPasta(raiz), indice, textoIndice } : null
  } catch {
    return null
  } finally {
    clearTimeout(relogio)
  }
}

/**
 * O pacote da obra num arquivo .zip escolhido no aparelho. A pasta pode estar na raiz do .zip ou dentro
 * de uma pasta (o "dados_obra/" inteiro compactado). Só lê o índice do .zip e o indice.json: as plantas
 * são lidas uma de cada vez, na hora de guardar.
 */
export async function abrirPacoteZip(arquivo: Blob, nome = arquivo instanceof File ? arquivo.name : 'pacote.zip'): Promise<PacoteLocalizado> {
  const naoEPacote = 'Este arquivo não é o pacote da obra (falta o indice.json). Escolha o .zip gerado pelo compactar_pacote.py.'
  let zip
  try {
    zip = await abrirZip(arquivo)
  } catch (e) {
    throw new Error(e instanceof Error && e.message !== ERRO_ZIP ? e.message : `${ERRO_ZIP}. Escolha o pacote da obra (.zip).`)
  }
  const caminhoDoIndice = [...zip.itens.keys()].filter((n) => n === 'indice.json' || n.endsWith('/indice.json')).sort((a, b) => a.length - b.length)[0]
  if (!caminhoDoIndice) throw new Error(naoEPacote)
  const prefixo = caminhoDoIndice.slice(0, -'indice.json'.length)
  const textoIndice = (await zip.texto(caminhoDoIndice)) ?? ''
  let indice: unknown
  try {
    indice = JSON.parse(textoIndice)
  } catch {
    throw new Error(naoEPacote)
  }
  if (!ehIndice(indice)) throw new Error(naoEPacote)
  return { raiz: `zip:${nome}`, fonte: { aviso: AVISO_DO_ZIP, ler: (caminho) => zip.blob(prefixo + caminho) }, indice, textoIndice }
}

/**
 * Sem pacote aberto nesta sessão (o app abriu direto na obra guardada): planta tirada do aparelho não
 * tem de onde vir até a pessoa abrir o pacote de novo.
 */
export function ligarFonteSemPacote() {
  usarFonteDeArquivos(async () => {
    throw new Error(AVISO_DO_ZIP)
  })
}

/** A obra do pacote, com id fixo pelo código: a mesma em qualquer aparelho que abra esta pasta. */
export async function obraDoPacote(indice: Pick<IndicePacote, 'obra' | 'nome' | 'sistema_oficial'>): Promise<ObraLocal> {
  const codigo = indice.obra.trim().toUpperCase()
  const obra: ObraLocal = { id: await uuidDeterministico(`obra-local:${codigo}`), codigo, nome: indice.nome?.trim() || NOME_SEM_PACOTE, empresa: null, papel: 'admin' }
  const sistema = typeof indice.sistema_oficial === 'string' ? indice.sistema_oficial.trim().toLowerCase() : ''
  if (sistema) obra.sistema_oficial = sistema
  return obra
}

type LinhaDeCadastro = { tabela: string; linha: Record<string, unknown> & { id: string } }

async function lerJson<T>(fonte: FonteDoPacote, caminho: string): Promise<T | null> {
  const b = await fonte.ler(caminho)
  return b ? (JSON.parse(await b.text()) as T) : null
}

async function assinatura(partes: string[]): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(partes.join('\n'))))
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** O config_fvs.json serve se a raiz for um objeto ({"prazos": [...], "ligacoes": [...]}); outra coisa fica de fora. */
function regrasValidas(config: unknown): config is Record<string, unknown> {
  return typeof config === 'object' && config !== null && !Array.isArray(config)
}

/**
 * As linhas do cadastro (pavimentos, trechos, peças, arquivos, plantas, fichas e regras da FVS), com ids derivados.
 * `configFvs`: o config_fvs.json do pacote. O objeto da raiz vai inteiro em fvs_regras.regras, numa linha só por obra.
 */
export async function linhasDoCadastro(obra: ObraLocal, indice: IndicePacote, fichas: readonly FichaDoPacote[], configFvs?: unknown): Promise<{ linhas: LinhaDeCadastro[]; idDaFicha: Map<string, string> }> {
  const base = { obra_id: obra.id, usuario_id: USUARIO_DO_PACOTE, dispositivo_id: DISPOSITIVO_DO_PACOTE, criado_em_dispositivo: new Date().toISOString(), apagado: false }
  const linhas: LinhaDeCadastro[] = []
  let ordem = 0
  for (const pv of indice.pavimentos) {
    ordem++
    const pavId = await uuidDeterministico(`${obra.id}:pav:${semAcento(pv.nome)}`)
    linhas.push({ tabela: 'pavimentos', linha: { ...base, id: pavId, nome: pv.nome, ordem } })
    for (const pc of pv.pecas) linhas.push({ tabela: 'elementos', linha: { ...base, id: pc.id, pavimento_id: pavId, tipo: pc.tipo, nome: pc.nome, secao: pc.secao || null } })
    for (const pl of pv.plantas) {
      const setorId = await uuidDeterministico(`${pavId}:setor:${semAcento(pl.trecho)}`)
      linhas.push({ tabela: 'setores', linha: { ...base, id: setorId, pavimento_id: pavId, nome_projeto: pl.trecho, disciplina: pl.disciplina ?? 'estrutura' } })
      const ids: Record<string, string> = {}
      for (const [nome, arq, tipo] of [['manifest.json', pl.manifest, 'application/json'], ['pacote.bin', pl.pacote, 'application/octet-stream']] as const) {
        ids[nome] = await uuidDeterministico(`${pl.id}:arquivo:${nome}`)
        linhas.push({ tabela: 'arquivos', linha: { ...base, id: ids[nome], caminho: `${obra.id}/fvs/plantas/${pl.id}/${nome}`, hash: arq.sha256, tamanho: arq.tamanho, tipo } })
      }
      linhas.push({
        tabela: 'plantas',
        linha: {
          ...base,
          id: pl.id,
          pavimento_id: pavId,
          setor_id: setorId,
          prancha: pl.prancha,
          revisao: pl.revisao,
          largura: pl.largura,
          altura: pl.altura,
          manifest_id: ids['manifest.json'],
          pacote_id: ids['pacote.bin'],
          elementos: pl.elementos,
        },
      })
    }
  }
  const idDaFicha = new Map<string, string>()
  for (const f of fichas) {
    const id = await uuidDeterministico(`${obra.id}:ficha:${f.codigo}:${f.revisao ?? '0'}`)
    idDaFicha.set(f.codigo, id)
    linhas.push({ tabela: 'fichas_modelo', linha: { ...base, id, codigo: f.codigo, titulo: f.titulo, revisao: f.revisao ?? '0', tipo_modelo: f.tipo_modelo ?? null, aplica_a: f.aplica_a, itens: f.itens } })
  }
  // Uma linha por obra, com id fixo: o pacote novo troca a anterior (gravarComoBaixado apaga e grava de novo).
  if (regrasValidas(configFvs)) linhas.push({ tabela: 'fvs_regras', linha: { ...base, id: await uuidDeterministico(`${obra.id}:fvs_regras`), regras: configFvs } })
  return { linhas, idDaFicha }
}

/**
 * Histórico do sistema oficial (o que já foi verificado antes do app) como linhas de fvs_fichas_campo e fvs_eventos. Ficha aberta só fica ligada
 * a uma peça que está na planta e a uma ficha que está no cadastro; as outras entram sem peça (consulta).
 */
export function linhasDoHistorico(obra: ObraLocal, h: HistoricoDoPacote, idDaFicha: ReadonlyMap<string, string>, pecas: ReadonlySet<string>): LinhaDeCadastro[] {
  const base = { obra_id: obra.id, usuario_id: USUARIO_DO_PACOTE, dispositivo_id: DISPOSITIVO_DO_PACOTE, criado_em_dispositivo: new Date().toISOString(), apagado: false }
  const linhas: LinhaDeCadastro[] = []
  for (const f of h.fichas_campo ?? []) {
    const noApp = !!f.elemento_id && pecas.has(f.elemento_id) && !!f.ficha_codigo && idDaFicha.has(f.ficha_codigo)
    linhas.push({ tabela: 'fvs_fichas_campo', linha: { ...base, ...f, elemento_id: noApp ? f.elemento_id : null, ficha_id: noApp ? idDaFicha.get(f.ficha_codigo!) : null } })
  }
  for (const e of h.eventos ?? []) {
    const fichaId = idDaFicha.get(e.ficha_codigo)
    if (!fichaId) continue
    linhas.push({ tabela: 'fvs_eventos', linha: { ...base, ...e, ficha_id: fichaId, criado_em_dispositivo: e.criado_em } })
  }
  return linhas
}

const TABELAS_DO_CADASTRO = ['pavimentos', 'setores', 'elementos', 'arquivos', 'plantas', 'fichas_modelo', 'fvs_regras']
const TABELAS_DO_HISTORICO = ['fvs_fichas_campo', 'fvs_eventos']
/** Tabelas da FVS cujas linhas apontam para uma ficha (fichas_modelo) pelo ficha_id. */
const TABELAS_QUE_USAM_FICHA = ['fvs_eventos', 'fvs_fichas_campo', 'fvs_areas']

/**
 * Fichas que algo feito neste aparelho usa (marcação, ficha aberta, área de laje). O histórico que veio
 * do pacote não conta: ele é refeito junto com o cadastro e passa para a revisão vigente.
 */
async function fichasEmUso(banco: BancoLocal, obraId: string): Promise<Set<string>> {
  const usadas = new Set<string>()
  await banco.registros
    .where('[tabela+obra_id]')
    .anyOf(TABELAS_QUE_USAM_FICHA.map((t) => [t, obraId]))
    .each((r) => {
      if (r.linha.usuario_id !== USUARIO_DO_PACOTE && typeof r.linha.ficha_id === 'string') usadas.add(r.linha.ficha_id)
    })
  return usadas
}

/**
 * Grava as linhas como baixadas (pendente 0), refazendo as tabelas dadas desta obra. A fila não é tocada,
 * e as linhas cujo id está em `manter` também ficam, mesmo que o pacote novo não as traga.
 */
async function gravarComoBaixado(banco: BancoLocal, obraId: string, tabelas: readonly string[], linhas: readonly LinhaDeCadastro[], manter: ReadonlySet<string> = new Set()) {
  await banco.transaction('rw', banco.registros, async () => {
    for (const t of tabelas) await banco.registros.where('[tabela+obra_id]').equals([t, obraId]).filter((r) => r.pendente === 0 && !manter.has(r.id)).delete()
    await banco.registros.bulkPut(linhas.map((l) => ({ tabela: l.tabela, id: l.linha.id, obra_id: obraId, linha: l.linha as unknown as Linha, pendente: 0 as const })))
  })
}

/** De onde a FVS lê uma planta desta obra quando ela foi tirada do aparelho: do próprio pacote. */
export function ligarFonteDasPlantas(obra: ObraLocal, pacote: Pick<PacoteLocalizado, 'fonte' | 'indice'>) {
  const pastaDaPlanta = new Map<string, string>()
  for (const pv of pacote.indice.pavimentos) for (const pl of pv.plantas) pastaDaPlanta.set(pl.id, pl.pasta)
  usarFonteDeArquivos(async (caminho, aoBytes) => {
    const [obraId, , , plantaId, nome] = caminho.split('/')
    const pasta = obraId === obra.id ? pastaDaPlanta.get(plantaId) : undefined
    if (!pasta) throw new Error('Esta planta não está no pacote da obra.')
    const b = await pacote.fonte.ler(pasta + nome).catch(() => null)
    if (!b) throw new Error(pacote.fonte.aviso)
    aoBytes?.(b.size)
    return b
  })
}

/**
 * Deixa a obra do pacote pronta no aparelho: entra sem conta, cadastra a obra, grava o cadastro e o
 * histórico (só quando o pacote mudou) e guarda as plantas que ainda não estão aqui. Devolve o
 * usuário e a obra para a casca abrir o menu.
 */
export async function prepararObraLocal(
  banco: BancoLocal,
  pacote: PacoteLocalizado,
  aoProgresso?: (p: ProgressoDoPacote) => void,
): Promise<{ usuario: UsuarioLocal; obra: ObraLocal; plantasGuardadas: number }> {
  const { raiz, fonte, indice } = pacote
  const usuario = await entrarSemConta(banco)
  const obra = await obraDoPacote(indice)
  const obras = (await banco.lerMeta<ObraLocal[]>('obras')) ?? []
  const obraAtualAntes = await banco.lerMeta<string>('obra_atual')
  const obraNova = !obras.some((o) => o.id === obra.id)
  const plantas = indice.pavimentos.flatMap((pv) => pv.plantas)
  const noAparelho = await pacotesNoAparelho()
  const faltam = plantas.filter((pl) => !noAparelho.has(pl.id))

  // Sem espaço no aparelho: melhor dizer antes de gravar do que encher pela metade e cair no meio.
  // (O histórico só entra na conta se faltar espaço: lê-lo antes custaria uma leitura a mais toda vez.)
  const precisa = tamanhoQueFalta(faltam)
  const espaco = await espacoUsado()
  const livre = espaco && espaco.total > 0 ? Math.max(0, espaco.total - espaco.usado) : null
  if (livre !== null && precisa > livre) throw new ErroSemEspaco(precisa, livre)

  const guardadasAgora: string[] = []
  try {
    return await gravarObraDoPacote()
  } catch (e) {
    if (!eFaltaDeEspaco(e)) throw e
    // O que entrou pela metade sai: plantas desta rodada e, se a obra não estava no aparelho, o cadastro
    // dela e as marcas de obra aberta (senão o app reabre numa obra incompleta).
    await removerPacotes(guardadasAgora).catch(() => {})
    if (obraNova) {
      await banco.esquecerObra(obra.id).catch(() => {})
      await banco.gravarMeta('obras', obras)
      if (obraAtualAntes) await banco.gravarMeta('obra_atual', obraAtualAntes)
      else await banco.apagarMeta('obra_atual')
    }
    const historico = await fonte.ler('historico.json').catch(() => null)
    const depois = await espacoUsado()
    throw new ErroSemEspaco(precisa + (historico?.size ?? 0),depois && depois.total > 0 ? Math.max(0, depois.total - depois.usado) : livre)
  }

  async function gravarObraDoPacote() {
    await banco.gravarMeta('obras', [obra, ...obras.filter((o) => o.id !== obra.id)])
    await banco.gravarMeta('obra_atual', obra.id)
    ligarFonteDasPlantas(obra, pacote)

    aoProgresso?.({ etapa: 'cadastro', feitas: 0, total: plantas.length })
    const fichas = (await lerJson<FichaDoPacote[]>(fonte, 'fichas.json')) ?? []
    const textoFichas = JSON.stringify(fichas)
    // Sem o arquivo, o servidor do site devolve o index.html (SPA): trata como 'sem regra', não quebra.
    const configFvs = await lerJson<unknown>(fonte, 'config_fvs.json').catch(() => null)
    // Sem config_fvs.json a assinatura fica a de antes: pacote antigo não regrava o cadastro à toa.
    const assinaturaNova = await assinatura([pacote.textoIndice, textoFichas, ...(configFvs === null ? [] : [JSON.stringify(configFvs)])])
    const anterior = await banco.lerMeta<{ assinatura: string }>(chaveDoPacote(obra.id))
    if (anterior?.assinatura !== assinaturaNova) {
      const { linhas, idDaFicha } = await linhasDoCadastro(obra, indice, fichas, configFvs)
      // Ficha que saiu do pacote (a rev. 0 quando chega a rev. 1, por exemplo) continua no aparelho se algo
      // marcado aqui usa ela. Sem isso, a peça marcada na revisão antiga perdia as marcações da tela e
      // voltava a pendente, embora os registros continuassem guardados.
      await gravarComoBaixado(banco, obra.id, TABELAS_DO_CADASTRO, linhas, await fichasEmUso(banco, obra.id))
      aoProgresso?.({ etapa: 'historico', feitas: 0, total: plantas.length })
      const historico = await lerJson<HistoricoDoPacote>(fonte, 'historico.json').catch(() => null)
      if (historico) {
        const pecas = new Set(indice.pavimentos.flatMap((pv) => pv.pecas.map((p) => p.id)))
        await gravarComoBaixado(banco, obra.id, TABELAS_DO_HISTORICO, linhasDoHistorico(obra, historico, idDaFicha, pecas))
      }
    }

    let guardadas = 0
    for (const pl of faltam) {
      aoProgresso?.({ etapa: 'plantas', feitas: guardadas, total: faltam.length })
      const [m, b] = await Promise.all([fonte.ler(pl.pasta + 'manifest.json'), fonte.ler(pl.pasta + 'pacote.bin')])
      if (!m || !b) throw new Error(`Não consegui ler a planta ${pl.prancha} do pacote da obra.`)
      // como no download do servidor: planta diferente do índice (cópia cortada, arquivo trocado) não entra
      const estragada = new Error(`A planta ${pl.prancha} do pacote da obra está estragada (diferente do índice). Gere o pacote de novo no PC.`)
      if (m.size !== pl.manifest?.tamanho || b.size !== pl.pacote?.tamanho) throw estragada
      const [mBytes, bBytes] = await Promise.all([m.arrayBuffer(), b.arrayBuffer()])
      if ((await sha256Hex(mBytes)) !== pl.manifest.sha256 || (await sha256Hex(bBytes)) !== pl.pacote.sha256) throw estragada
      const manifest = JSON.parse(new TextDecoder().decode(mBytes)) as Manifest
      await guardarPacote(JSON.stringify({ ...manifest, planta_id: pl.id }), b, { obraId: obra.id, usuarioId: usuario.id })
      guardadasAgora.push(pl.id)
      guardadas++
    }
    aoProgresso?.({ etapa: 'plantas', feitas: guardadas, total: faltam.length })
    await banco.gravarMeta(chaveDoPacote(obra.id), { assinatura: assinaturaNova, raiz, quando: new Date().toISOString(), gerado_em: dataDoPacote(indice), origem: indice.origem ?? null })
    return { usuario, obra, plantasGuardadas: guardadas }
  }
}

const MB = 1024 * 1024

/** Bytes das plantas que ainda vão entrar no aparelho (o que o índice diz de cada arquivo). */
export function tamanhoQueFalta(plantas: readonly Pick<PlantaDoIndice, 'manifest' | 'pacote'>[]): number {
  return plantas.reduce((t, pl) => t + (pl.manifest?.tamanho ?? 0) + (pl.pacote?.tamanho ?? 0), 0)
}

/** O navegador recusou gravar por falta de espaço (direto ou embrulhado pelo Dexie). */
export function eFaltaDeEspaco(e: unknown): boolean {
  const erro = e as { name?: string; inner?: { name?: string } } | null
  return erro?.name === 'QuotaExceededError' || erro?.inner?.name === 'QuotaExceededError'
}

/**
 * O texto para quem está com o aparelho cheio: quanto a obra precisa, quanto há livre e quanto liberar.
 * Liberar = o que falta mais uma folga de 20% do pacote (o banco do navegador ocupa mais que o arquivo).
 * Se o navegador recusou gravar mas diz que há espaço (a conta dele nem sempre bate com o disco),
 * o "livre" dele não vale: pede o pacote inteiro mais a folga.
 */
export function textoSemEspaco(precisa: number, livre: number | null): string {
  const mb = (b: number) => Math.max(1, Math.round(b / MB))
  const inicio = `Não coube no aparelho: a obra precisa de cerca de ${mb(precisa)} MB`
  const fim = '(fotos, vídeos ou apps que não usa) e tente de novo.'
  if (livre === null || livre >= precisa) return `${inicio}. Libere pelo menos ${mb(precisa * 1.2)} MB ${fim}`
  return `${inicio} e há ${Math.floor(livre / MB)} MB livres. Libere pelo menos ${mb(precisa - livre + precisa * 0.2)} MB ${fim}`
}

export class ErroSemEspaco extends Error {
  constructor(readonly precisa: number, readonly livre: number | null) {
    super(textoSemEspaco(precisa, livre))
    this.name = 'ErroSemEspaco'
  }
}

/** A data em que o pipeline gerou o pacote, ou null se o índice não tem (ou tem algo que não é data). */
export function dataDoPacote(indice: { gerado_em?: unknown }): string | null {
  const d = indice.gerado_em
  return typeof d === 'string' && !Number.isNaN(Date.parse(d)) ? d : null
}

/** A data do pacote que já está neste aparelho para a obra, ou null (obra com servidor, ou pacote sem data). */
export async function dataDoPacoteGuardado(banco: Pick<BancoLocal, 'lerMeta'>, obraId: string): Promise<string | null> {
  const lido = await banco.lerMeta<{ gerado_em?: string | null }>(chaveDoPacote(obraId))
  return lido ? dataDoPacote(lido) : null
}

export interface ObraDoPacoteResumo {
  codigo: string
  nome: string
  geradoEm: string | null
}

/** O pacote escolhido contra o que já está no aparelho, para a pessoa confirmar antes de trocar. */
export interface ComparacaoDoPacote {
  novo: ObraDoPacoteResumo
  atual: ObraDoPacoteResumo | null
  /** O pacote é de outra obra que a aberta no aparelho. */
  outraObra: boolean
  /** Mesma obra, gerado antes do que já está no aparelho. */
  maisAntigo: boolean
  /** Mesma obra, o aparelho tem data e o pacote não: não dá para saber se é mais novo. */
  semData: boolean
}

/** Só lê: nada muda no aparelho até a pessoa confirmar (ou nem precisar). */
export async function compararComOAtual(banco: BancoLocal, pacote: Pick<PacoteLocalizado, 'indice'>): Promise<ComparacaoDoPacote> {
  const obra = await obraDoPacote(pacote.indice)
  const novo = { codigo: obra.codigo, nome: obra.nome, geradoEm: dataDoPacote(pacote.indice) }
  const [atualId, obras] = await Promise.all([banco.lerMeta<string>('obra_atual'), banco.lerMeta<ObraLocal[]>('obras')])
  const aberta = (obras ?? []).find((o) => o.id === atualId)
  if (!aberta) return { novo, atual: null, outraObra: false, maisAntigo: false, semData: false }
  const lido = await banco.lerMeta<{ gerado_em?: string | null }>(chaveDoPacote(aberta.id))
  const atual = { codigo: aberta.codigo, nome: aberta.nome, geradoEm: lido ? dataDoPacote(lido) : null }
  const outraObra = aberta.id !== obra.id
  const maisAntigo = !outraObra && !!novo.geradoEm && !!atual.geradoEm && Date.parse(novo.geradoEm) < Date.parse(atual.geradoEm)
  const semData = !outraObra && !novo.geradoEm && !!atual.geradoEm
  return { novo, atual, outraObra, maisAntigo, semData }
}

export const precisaConfirmar = (c: ComparacaoDoPacote) => c.outraObra || c.maisAntigo || c.semData

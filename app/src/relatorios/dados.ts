// Leitura e registro do módulo Relatórios no aparelho (pelo núcleo: funciona sem internet).

import { BUCKET_OBRAS } from '../config'
import { carregarPlantas, type PecaCadastrada, type PlantaPavimento } from '../concreto/planta'
import { dataLocal } from '../concreto/cps'
import { camposDeCorrecao } from '../concreto/vigentes'
import { reduzirFoto } from '../fvs/dados'
import { pacotesNoAparelho } from '../fvs/pacote'
import { plantasDoPavimento } from '../fvs/plantas'
import type { PapelNaObra } from '../nucleo/conta'
import type { Linha } from '../nucleo/banco_local'
import { banco, cliente, sincronizador } from '../nucleo/servicos'
import { campoDoAlvo, COLUNAS, montarDados, numeroAoFechar, recusaDaFoto, tipoDaFoto, type Alvo, type DadosRelatorios, type Foto, type LinhasPorTabela, type Registro, type TabelaCorrigivel } from './regras'
import { montarAutomatico, type Automatico } from './automatico'
import { TABELAS_RELATORIOS } from './tabelas'

export function podeRegistrar(papel: PapelNaObra): boolean {
  return papel !== 'leitura'
}

/** Fechar o dia e os dados da obra no cabeçalho: gestor e admin (a regra do banco é a mesma). */
export function podeFechar(papel: PapelNaObra): boolean {
  return papel === 'admin' || papel === 'gestor'
}

/** Lê tudo do módulo (o que já foi baixado + o que foi registrado aqui). */
export async function carregar(obraId: string): Promise<DadosRelatorios> {
  const nomes = ['pavimentos', 'elementos', 'arquivos', ...TABELAS_RELATORIOS]
  const linhas = await Promise.all(nomes.map((n) => sincronizador.linhas(n, obraId)))
  const t: LinhasPorTabela = {}
  nomes.forEach((n, i) => {
    t[n] = linhas[i]
  })
  return montarDados(t)
}

// ---------------------------------------------------------------------
// Registro (sempre inclusão; correção = linha nova)
// ---------------------------------------------------------------------

export function registrar(tabela: (typeof TABELAS_RELATORIOS)[number], obraId: string, usuarioId: string, campos: Record<string, unknown>) {
  return sincronizador.registrar(tabela, obraId, usuarioId, campos)
}

export function corrigir(tabela: TabelaCorrigivel, obraId: string, usuarioId: string, atual: Registro, mudancas: Record<string, unknown>) {
  return sincronizador.registrar(tabela, obraId, usuarioId, camposDeCorrecao(atual, COLUNAS[tabela], mudancas))
}

export function cancelar(tabela: TabelaCorrigivel, obraId: string, usuarioId: string, atual: Registro) {
  return corrigir(tabela, obraId, usuarioId, atual, { cancelado: true })
}

/** Copia as linhas de um dia para outro (mão de obra e equipamentos se repetem de um dia para o outro). */
export async function copiarDoDia(tabela: 'diario_efetivo' | 'diario_equipamentos', obraId: string, usuarioId: string, linhas: readonly Registro[], data: string) {
  for (const l of linhas) {
    const campos: Record<string, unknown> = {}
    for (const c of COLUNAS[tabela]) campos[c] = l[c]
    await sincronizador.registrar(tabela, obraId, usuarioId, { ...campos, data })
  }
}

export async function fecharDia(d: DadosRelatorios, obraId: string, usuarioId: string, data: string, observacao: string | null) {
  return sincronizador.registrar('diario_fechamentos', obraId, usuarioId, { data, acao: 'fechado', numero: numeroAoFechar(d, data), observacao })
}

export async function reabrirDia(d: DadosRelatorios, obraId: string, usuarioId: string, data: string, observacao: string | null) {
  return sincronizador.registrar('diario_fechamentos', obraId, usuarioId, { data, acao: 'reaberto', numero: numeroAoFechar(d, data), observacao })
}

// ---------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------

/** Guarda a foto (reduzida) no aparelho; vai para o servidor quando houver internet. */
export async function anexarFoto(obraId: string, usuarioId: string, data: string, alvo: Alvo | null, arquivo: Blob & { name?: string }) {
  const tipo = tipoDaFoto({ type: arquivo.type, name: arquivo.name ?? '' })
  const recusa = recusaDaFoto(arquivo.size, tipo)
  if (recusa) throw new Error(recusa)
  const reduzida = await reduzirFoto(arquivo)
  // não deu para reduzir (HEIC no navegador que não lê, foto corrompida): só fica a original se for JPG,
  // PNG ou WEBP de até 10 MB; antes, qualquer arquivo entrava como veio
  if (reduzida === arquivo && (tipo === 'image/heic' || tipo === 'image/heif' || arquivo.size > 10 * 1024 * 1024)) {
    throw new Error('Não deu para ler esta foto neste aparelho. Tire de novo ou escolha uma em JPG.')
  }
  const a = await sincronizador.registrarArquivo(obraId, usuarioId, 'relatorios', reduzida, 'foto.jpg')
  return sincronizador.registrar('rel_fotos', obraId, usuarioId, { data, arquivo_id: a.id, ...(alvo ? campoDoAlvo(alvo) : {}) })
}

/**
 * Endereço para mostrar a foto. Ainda não enviada: vem do aparelho. Já enviada: precisa de
 * internet (o conteúdo sai do aparelho depois do envio, regra do núcleo). Sem internet: null.
 * Quem chama devolve o endereço com URL.revokeObjectURL quando parar de mostrar.
 */
export async function enderecoDaFoto(d: DadosRelatorios, foto: Foto): Promise<string | null> {
  const local = await banco.conteudos.get(foto.arquivo_id)
  if (local) return URL.createObjectURL(new Blob([local.bytes], { type: d.arquivos.get(foto.arquivo_id)?.tipo || 'image/jpeg' }))
  const arq = d.arquivos.get(foto.arquivo_id)
  if (!arq || !navigator.onLine) return null
  try {
    const { data, error } = await cliente.storage.from(BUCKET_OBRAS).download(arq.caminho)
    return error || !data ? null : URL.createObjectURL(data)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------
// Plantas
// ---------------------------------------------------------------------

/**
 * Plantas de forma do pavimento que estão no aparelho (quem baixa é a tela inicial da FVS).
 * Na obra TESTE, sem pacote baixado, vem a planta de teste do Concreto.
 */
export async function plantasDe(obra: { id: string; codigo: string }, pavimento: { id: string; nome: string }, pecas: readonly PecaCadastrada[]): Promise<PlantaPavimento[]> {
  try {
    const reais = await plantasDoPavimento(obra.id, pavimento.id, pavimento.nome)
    if (reais.length > 0) return reais
  } catch (e) {
    console.warn('Relatórios: não consegui abrir as plantas da FVS', e)
  }
  return carregarPlantas({ obraId: obra.id, obraCodigo: obra.codigo, pavimento, pecas })
}

/** Pavimento mais alto com planta no aparelho: por onde abrir a planta quando não há outra pista. */
export async function pavimentoComPlanta(obraId: string, pavimentos: readonly { id: string }[]): Promise<string | null> {
  const [plantas, noAparelho] = await Promise.all([sincronizador.linhas('plantas', obraId), pacotesNoAparelho()])
  const comPlanta = new Set(plantas.filter((p) => noAparelho.has(p.id)).map((p) => String(p.pavimento_id)))
  return [...pavimentos].reverse().find((p) => comPlanta.has(p.id))?.id ?? null
}

// ---------------------------------------------------------------------
// O que os outros módulos já registraram no dia
// ---------------------------------------------------------------------

/**
 * O bloco "O que o app registrou hoje" (automatico.ts): lê do aparelho só quando o dia abre (a FVS pode ter
 * dezenas de milhares de registros). `ate`: a hora do fechamento do dia; o que veio depois fica fora.
 */
export async function automaticoDoDia(obraId: string, data: string, ate?: string | null): Promise<Automatico> {
  const nomesDasTabelas = ['fvs_eventos', 'fichas_modelo', 'elementos', 'fvs_areas', 'plantas', 'pavimentos', 'concretagens', 'caminhoes', 'caminhao_elementos'] as const
  const [t, nomes] = await Promise.all([
    Promise.all(nomesDasTabelas.map((n) => sincronizador.linhas(n, obraId).catch(() => [] as Linha[]))),
    // os nomes de quem marcou (perfis.nome), que a FVS guarda no aparelho; sem eles, o texto diz "1 pessoa"
    banco.lerMeta<Record<string, string>>('fvs_nomes').catch(() => undefined),
  ])
  const [eventos, fichas, elementos, areas, plantas, pavimentos, concretagens, caminhoes, caminhaoElementos] = t
  return montarAutomatico({ data, ate, eventos, fichas, elementos, areas, plantas, pavimentos, concretagens, caminhoes, caminhaoElementos, nomes: nomes ?? {} })
}

/** A hora em que o dia foi fechado (o bloco automático para de mudar nela); dia aberto ou reaberto: null. */
export function horaDoFechamento(d: DadosRelatorios, data: string): string | null {
  const f = d.fechamentos.get(data)
  return f && f.acao === 'fechado' ? f.criado_em_dispositivo : null
}

export type DoAppFvs = { aprovados: number; reprovados: number; naoAplica: number; pecas: number }

/**
 * Itens da FVS verificados no dia. A FVS grava por registros: escrever a descrição de uma NC, trocar
 * C por NC ou desmarcar grava um registro novo do mesmo item, e vale o último. Por isso conta cada item
 * (peça, ficha, item e rodada) uma vez, pelo último registro dele no dia; antes, a descrição de uma NC
 * fazia o Diário mostrar "2 NC" para uma só (obra de demonstração, 13/11).
 */
export function contarFvsDoDia(fvs: readonly Linha[], data: string): DoAppFvs {
  const ultimo = new Map<string, Linha>()
  for (const e of fvs) {
    if (dataLocal(e.criado_em_dispositivo) !== data) continue
    const k = `${String(e.elemento_id)}|${String(e.ficha_id)}|${String(e.item)}|${String(e.rodada ?? 1)}`
    const a = ultimo.get(k)
    if (!a || e.criado_em_dispositivo > a.criado_em_dispositivo || (e.criado_em_dispositivo === a.criado_em_dispositivo && e.id > a.id)) ultimo.set(k, e)
  }
  const r = { aprovados: 0, reprovados: 0, naoAplica: 0, pecas: 0 }
  const pecas = new Set<string>()
  for (const e of ultimo.values()) {
    if (!e.resultado) continue // desmarcado no fim do dia: não conta
    // a FVS grava C e NC desde 08/11/2026; antes, A e R
    if (e.resultado === 'C' || e.resultado === 'A') r.aprovados++
    else if (e.resultado === 'NC' || e.resultado === 'R') r.reprovados++
    else if (e.resultado === 'NA') r.naoAplica++
    pecas.add(String(e.elemento_id))
  }
  r.pecas = pecas.size
  return r
}

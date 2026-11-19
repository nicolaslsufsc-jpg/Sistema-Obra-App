// Biblioteca de sincronização do núcleo. Usada por todos os módulos.
//
// Regras (docs/02_CONTRATO_NUCLEO.md, "Regras de sincronização"):
// - registrar(): grava no aparelho e põe na fila de saída. Funciona sem internet.
// - enviar(): manda a fila em ordem com "insert ... on conflict (id) do nothing".
//   Reenviar o mesmo item não duplica. Erro transitório para a fila; erro permanente
//   marca o item e segue.
// - baixar(): por obra e tabela, traz o que mudou desde (cursor - 5 min), em páginas
//   ordenadas por (atualizado_em, id), e grava por id.

import Dexie from 'dexie'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BancoLocal, ItemFila, Linha } from './banco_local'
import { erroDoArmazenamento, erroDoBanco, type ErroServidor } from './erros'
import { compararHoras, horaMenos } from './tempo'

export const MARGEM_BAIXA_MS = 5 * 60 * 1000
/**
 * Prazo de cada pedido ao servidor (envio de um lote, uma página da baixa). Numa internet fraca a
 * conexão pode ficar aberta sem resposta: sem prazo, a rodada nunca termina e as seguintes ficam
 * esperando até fechar o app (risco R2, docs/modulos/0_nucleo_sincronizacao.md).
 */
export const PRAZO_PEDIDO_MS = 60_000
/** Arquivo (foto): o prazo cresce com o tamanho, contando 16 kB/s (um 3G ruim). */
const BYTES_POR_SEGUNDO_MINIMO = 16 * 1024

/** Colunas que o núcleo preenche; o módulo não passa estas em registrar(). */
const COLUNAS_DO_NUCLEO = [
  'obra_id',
  'usuario_id',
  'dispositivo_id',
  'criado_em_dispositivo',
  'criado_em_servidor',
  'atualizado_em',
  'apagado',
] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface OpcoesSincronizador {
  banco: BancoLocal
  cliente: SupabaseClient
  /** Tabelas baixadas por obra, na ordem (pais antes dos filhos). */
  tabelas: readonly string[]
  /**
   * Opcional: as mesmas tabelas em blocos. O primeiro bloco baixa sozinho; os outros baixam ao
   * mesmo tempo, cada um na própria ordem. Sem blocos, baixa uma tabela por vez.
   */
  blocos?: readonly (readonly string[])[]
  bucket?: string
  /** Quantos registros por envio. */
  tamanhoLote?: number
  /** Quantas linhas por página na baixa. */
  tamanhoPagina?: number
  margemMs?: number
  /** Prazo de cada pedido (ms). Passou do prazo = erro transitório: a fila para e tenta depois. */
  prazoMs?: number
  /**
   * Confere se há login válido DESTA pessoa antes de falar com o servidor.
   * Sem login válido o supabase-js manda o pedido como visitante (anon) e o servidor
   * recusa: sem esta conferência, a recusa viraria "erro permanente" à toa.
   */
  sessaoValida?: (usuarioId: string) => Promise<boolean>
}

export interface ResultadoEnvio {
  enviados: number
  comErro: number
  /** Preenchido quando a fila parou por erro transitório (ex.: sem internet). */
  parouPor?: ErroServidor
}

export interface ResultadoBaixa {
  recebidos: number
  porTabela: Record<string, number>
  erro?: ErroServidor
}

export interface ResultadoSincronizacao {
  envio: ResultadoEnvio
  baixa: ResultadoBaixa
}

const SEM_LOGIN: ErroServidor = { gravidade: 'transitorio', mensagem: 'sem login válido neste momento' }
const SEM_RESPOSTA: ErroServidor = { gravidade: 'transitorio', mensagem: 'o servidor não respondeu a tempo' }
const CANCELADA: ErroServidor = { gravidade: 'transitorio', mensagem: 'baixa cancelada: os dados do aparelho foram limpos' }

class BaixaCancelada extends Error {}

export class Sincronizador {
  private readonly banco: BancoLocal
  private readonly cliente: SupabaseClient
  private readonly tabelas: readonly string[]
  private readonly blocos: readonly (readonly string[])[]
  private readonly bucket: string
  private readonly tamanhoLote: number
  private readonly tamanhoPagina: number
  private readonly margemMs: number
  private readonly prazoMs: number
  private readonly sessaoValida?: (usuarioId: string) => Promise<boolean>
  /** Sincronização em andamento e para quem (usuário + obra). */
  private atual: { chave: string; promessa: Promise<ResultadoSincronizacao> } | null = null
  /** Fila de sincronizações: uma termina antes da outra começar. */
  private cadeia: Promise<unknown> = Promise.resolve()

  constructor(o: OpcoesSincronizador) {
    this.banco = o.banco
    this.cliente = o.cliente
    this.tabelas = o.tabelas
    this.blocos = o.blocos ?? [o.tabelas]
    const nosBlocos = this.blocos.flat()
    if (nosBlocos.length !== o.tabelas.length || nosBlocos.some((t) => !o.tabelas.includes(t))) {
      throw new Error('Os blocos de sincronização precisam ter exatamente as tabelas sincronizadas')
    }
    this.bucket = o.bucket ?? 'obras'
    this.tamanhoLote = o.tamanhoLote ?? 100
    this.tamanhoPagina = o.tamanhoPagina ?? 1000
    this.margemMs = o.margemMs ?? MARGEM_BAIXA_MS
    this.prazoMs = o.prazoMs ?? PRAZO_PEDIDO_MS
    this.sessaoValida = o.sessaoValida
  }

  // -------------------------------------------------------------------
  // Registrar (offline)
  // -------------------------------------------------------------------

  /**
   * Inclui um registro: grava no aparelho e põe na fila de envio. Não precisa de internet.
   * `campos` são as colunas do módulo; `id` é opcional (gerado aqui se faltar).
   */
  async registrar(tabela: string, obraId: string, usuarioId: string, campos: Record<string, unknown>): Promise<Linha> {
    this.conferirTabela(tabela)
    const linha = await this.montarLinha(obraId, usuarioId, campos)
    await this.gravarPendente(tabela, linha)
    return linha
  }

  /**
   * Inclui um arquivo (ex.: foto de NC): guarda o conteúdo no aparelho e põe na fila.
   * Caminho no armazenamento: {obra_id}/{modulo}/{id}{extensão}.
   * Devolve a linha da tabela "arquivos" (use linha.id para referenciar o arquivo).
   * Depois de enviado, o conteúdo sai do aparelho (fica só no servidor).
   */
  async registrarArquivo(
    obraId: string,
    usuarioId: string,
    modulo: string,
    conteudo: Blob,
    nomeOriginal: string,
  ): Promise<Linha> {
    if (!/^[a-z_]+$/.test(modulo)) throw new Error(`Nome de módulo inválido: ${modulo}`)
    const id = crypto.randomUUID()
    const extensao = (/\.[a-z0-9]{1,8}$/i.exec(nomeOriginal)?.[0] ?? '').toLowerCase()
    const caminho = `${obraId}/${modulo}/${id}${extensao}`
    const bytes = await conteudo.arrayBuffer()
    const tipo = conteudo.type || 'application/octet-stream'
    const linha = await this.montarLinha(obraId, usuarioId, {
      id,
      caminho,
      nome_original: nomeOriginal,
      hash: await sha256Hex(bytes),
      tamanho: bytes.byteLength,
      tipo,
    })
    // ArrayBuffer (e não Blob): é guardado de forma confiável em qualquer IndexedDB.
    await this.gravarPendente('arquivos', linha, { caminho, tipo, tamanho: bytes.byteLength }, bytes)
    return linha
  }

  // -------------------------------------------------------------------
  // Enviar
  // -------------------------------------------------------------------

  async enviar(usuarioId: string): Promise<ResultadoEnvio> {
    const itens = await this.itensDaFila(usuarioId, 'pendente')
    let enviados = 0
    let comErro = 0
    if (itens.length === 0) return { enviados, comErro }

    let i = 0
    while (i < itens.length) {
      if (!(await this.temSessao(usuarioId))) return { enviados, comErro, parouPor: SEM_LOGIN }
      const item = itens[i]

      if (item.arquivo) {
        const erro = await this.enviarArquivo(item)
        if (!erro) enviados++
        else if (erro.gravidade === 'transitorio') return { enviados, comErro, parouPor: erro }
        else comErro++
        i++
        continue
      }

      // Lote: itens seguidos da mesma tabela, sem arquivo.
      let j = i + 1
      while (j < itens.length && j - i < this.tamanhoLote && itens[j].tabela === item.tabela && !itens[j].arquivo) j++
      const lote = itens.slice(i, j)

      const erro = await this.inserir(item.tabela, lote.map((x) => x.linha))
      if (!erro) {
        await this.confirmar(lote)
        enviados += lote.length
      } else if (erro.gravidade === 'transitorio') {
        return { enviados, comErro, parouPor: erro }
      } else if (lote.length === 1) {
        await this.marcarErro(lote[0], erro)
        comErro++
      } else {
        // Um item do lote é inválido: manda um por um para achar qual.
        for (const x of lote) {
          const e = await this.inserir(x.tabela, [x.linha])
          if (!e) {
            await this.confirmar([x])
            enviados++
          } else if (e.gravidade === 'transitorio') {
            return { enviados, comErro, parouPor: e }
          } else {
            await this.marcarErro(x, e)
            comErro++
          }
        }
      }
      i = j
    }
    return { enviados, comErro }
  }

  private async enviarArquivo(item: ItemFila): Promise<ErroServidor | null> {
    const arquivo = item.arquivo!
    if (!item.arquivo_enviado) {
      const conteudo = await this.banco.conteudos.get(item.id)
      if (!conteudo) {
        const erro: ErroServidor = { gravidade: 'permanente', mensagem: 'conteúdo do arquivo não está mais no aparelho' }
        await this.marcarErro(item, erro)
        return erro
      }
      let erro: ReturnType<typeof erroDoArmazenamento> | null = null
      try {
        const prazo = this.prazoMs + (arquivo.tamanho / BYTES_POR_SEGUNDO_MINIMO) * 1000
        const r = await comPrazo(
          this.cliente.storage.from(this.bucket).upload(arquivo.caminho, conteudo.bytes, { contentType: arquivo.tipo, upsert: false }),
          prazo,
        )
        if (r === ESGOTOU) return SEM_RESPOSTA
        if (r.error) erro = erroDoArmazenamento(r.error)
      } catch (e) {
        erro = erroDoArmazenamento(e)
      }
      // "Já existe" = enviado numa tentativa anterior (o caminho tem o id do registro).
      if (erro && !erro.duplicado) {
        if (erro.gravidade === 'permanente') await this.marcarErro(item, erro)
        return erro
      }
      await this.banco.fila.update(item.seq!, { arquivo_enviado: true })
    }
    const erro = await this.inserir('arquivos', [item.linha])
    if (!erro) {
      await this.confirmar([item])
      return null
    }
    if (erro.gravidade === 'permanente') await this.marcarErro(item, erro)
    return erro
  }

  private async inserir(tabela: string, linhas: Linha[]): Promise<ErroServidor | null> {
    const controle = new AbortController()
    try {
      const r = await comPrazo(
        this.cliente
          .from(tabela)
          .upsert(linhas, { onConflict: 'id', ignoreDuplicates: true, defaultToNull: false })
          .abortSignal(controle.signal),
        this.prazoMs,
        () => controle.abort(),
      )
      // Sem resposta: o servidor pode ter gravado ou não. Reenviar não duplica (id + ignoreDuplicates).
      if (r === ESGOTOU) return SEM_RESPOSTA
      return r.error ? erroDoBanco(r.status, r.error) : null
    } catch (e) {
      return { gravidade: 'transitorio', mensagem: String(e) }
    }
  }

  private async confirmar(itens: ItemFila[]): Promise<void> {
    const b = this.banco
    await b.transaction('rw', b.fila, b.registros, b.conteudos, async () => {
      await b.fila.bulkDelete(itens.map((x) => x.seq!))
      for (const x of itens) {
        await b.registros.update([x.tabela, x.id], { pendente: 0 })
        if (x.arquivo) await b.conteudos.delete(x.id)
      }
    })
  }

  private async marcarErro(item: ItemFila, erro: ErroServidor): Promise<void> {
    const detalhe = erro.codigo ? `${erro.mensagem} (${erro.codigo})` : erro.mensagem
    await this.banco.fila.update(item.seq!, { estado: 'erro', erro: detalhe, tentativas: item.tentativas + 1 })
  }

  // -------------------------------------------------------------------
  // Baixar
  // -------------------------------------------------------------------

  /**
   * Baixa as tabelas da obra. `usuarioId` (opcional) permite conferir o login antes.
   * Se o aparelho for limpo no meio (sair, trocar de pessoa), a baixa desiste sem gravar.
   */
  async baixar(obraId: string, usuarioId?: string): Promise<ResultadoBaixa> {
    const porTabela: Record<string, number> = {}
    let recebidos = 0
    if (usuarioId && !(await this.temSessao(usuarioId))) return { recebidos, porTabela, erro: SEM_LOGIN }
    const geracao = await this.banco.geracao()
    // Um bloco: tabela por tabela, para no primeiro erro (o filho não baixa sem o pai).
    const baixarBloco = async (bloco: readonly string[]): Promise<ErroServidor | undefined> => {
      for (const tabela of bloco) {
        const r = await this.baixarTabela(obraId, tabela, geracao)
        porTabela[tabela] = r.recebidos
        recebidos += r.recebidos
        if (r.erro) return r.erro
      }
      return undefined
    }
    const [primeiro, ...resto] = this.blocos
    const erroPrimeiro = primeiro ? await baixarBloco(primeiro) : undefined
    if (erroPrimeiro) return { recebidos, porTabela, erro: erroPrimeiro }
    // Os módulos ao mesmo tempo: no celular, cada pedido espera a ida e volta ao servidor, e
    // uma tabela por vez somava essas esperas. Erro num módulo não impede os outros de baixar.
    const erros = await Promise.all(resto.map(baixarBloco))
    const erro = erros.find((e) => e !== undefined)
    return erro ? { recebidos, porTabela, erro } : { recebidos, porTabela }
  }

  private async baixarTabela(
    obraId: string,
    tabela: string,
    geracao: number,
  ): Promise<{ recebidos: number; erro?: ErroServidor }> {
    const cursor = await this.banco.cursores.get([obraId, tabela])
    const desde = cursor ? horaMenos(cursor.valor, this.margemMs) : undefined
    let maior = cursor?.valor
    let ultimo: { hora: string; id: string } | undefined
    let recebidos = 0

    for (;;) {
      let consulta = this.cliente.from(tabela).select('*').eq('obra_id', obraId)
      if (ultimo) {
        // Página seguinte: (atualizado_em, id) > (último recebido)
        const h = `"${ultimo.hora}"`
        consulta = consulta.or(`atualizado_em.gt.${h},and(atualizado_em.eq.${h},id.gt."${ultimo.id}")`)
      } else if (desde) {
        consulta = consulta.gte('atualizado_em', desde)
      }
      let resposta
      const controle = new AbortController()
      try {
        const r = await comPrazo(
          consulta
            .order('atualizado_em', { ascending: true })
            .order('id', { ascending: true })
            .limit(this.tamanhoPagina)
            .abortSignal(controle.signal),
          this.prazoMs,
          () => controle.abort(),
        )
        if (r === ESGOTOU) return { recebidos, erro: SEM_RESPOSTA }
        resposta = r
      } catch (e) {
        return { recebidos, erro: { gravidade: 'transitorio', mensagem: String(e) } }
      }
      const { data, error, status } = resposta
      if (error) return { recebidos, erro: erroDoBanco(status, error) }

      const linhas = (data ?? []) as Linha[]
      if (linhas.length > 0) {
        const fim = linhas[linhas.length - 1]
        const novoCursor = !maior || compararHoras(fim.atualizado_em!, maior) > 0 ? fim.atualizado_em! : maior
        const b = this.banco
        try {
          await b.transaction('rw', b.registros, b.cursores, b.meta, async () => {
            // Limpeza no meio da baixa (sair, trocar de pessoa): não grava nada.
            if ((await b.geracao()) !== geracao) throw new BaixaCancelada()
            await b.registros.bulkPut(
              linhas.map((l) => ({ tabela, id: l.id, obra_id: l.obra_id, linha: l, pendente: 0 as const })),
            )
            await b.cursores.put({ obra_id: obraId, tabela, valor: novoCursor })
          })
        } catch (e) {
          if (e instanceof BaixaCancelada) return { recebidos, erro: CANCELADA }
          throw e
        }
        maior = novoCursor
        recebidos += linhas.length
      }
      if (linhas.length < this.tamanhoPagina) break
      const fim = linhas[linhas.length - 1]
      ultimo = { hora: fim.atualizado_em!, id: fim.id }
    }
    return { recebidos }
  }

  // -------------------------------------------------------------------
  // Sincronizar (enviar + baixar), uma de cada vez
  // -------------------------------------------------------------------

  /**
   * Envia a fila da pessoa e baixa a obra. Pedido igual ao que está em andamento devolve o
   * mesmo resultado; pedido diferente (outra obra ou pessoa) espera o atual terminar.
   */
  sincronizar(obraId: string, usuarioId: string): Promise<ResultadoSincronizacao> {
    const chave = `${usuarioId}:${obraId}`
    if (this.atual?.chave === chave) return this.atual.promessa
    const tarefa = async () => {
      const envio = await this.enviar(usuarioId)
      const baixa = await this.baixar(obraId, usuarioId)
      return { envio, baixa }
    }
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
    const executar = () => (locks ? locks.request('sistema-obra-sincronizacao', tarefa) : tarefa())
    const promessa = this.cadeia.then(executar, executar)
    this.cadeia = promessa.catch(() => undefined)
    const atual = { chave, promessa }
    this.atual = atual
    promessa.then(
      () => this.liberar(atual),
      () => this.liberar(atual),
    )
    return promessa
  }

  private liberar(atual: { chave: string; promessa: Promise<ResultadoSincronizacao> }) {
    if (this.atual === atual) this.atual = null
  }

  // -------------------------------------------------------------------
  // Consultas locais
  // -------------------------------------------------------------------

  /** Linhas de uma tabela da obra no aparelho (sem as apagadas). */
  async linhas(tabela: string, obraId: string, opcoes: { incluirApagadas?: boolean } = {}): Promise<Linha[]> {
    const registros = await this.banco.registros.where('[tabela+obra_id]').equals([tabela, obraId]).toArray()
    return registros.map((r) => r.linha).filter((l) => opcoes.incluirApagadas || !l.apagado)
  }

  /** Conta pelo índice, sem ler os itens (a fila pode ter fotos). */
  async contarFila(usuarioId: string): Promise<{ pendentes: number; comErro: number }> {
    const [pendentes, comErro] = await Promise.all([
      this.faixaDaFila(usuarioId, 'pendente').count(),
      this.faixaDaFila(usuarioId, 'erro').count(),
    ])
    return { pendentes, comErro }
  }

  itensComErro(usuarioId: string): Promise<ItemFila[]> {
    return this.itensDaFila(usuarioId, 'erro')
  }

  /** Volta os itens com erro para a fila (depois de corrigir permissão, por exemplo). */
  async tentarDeNovo(usuarioId: string): Promise<number> {
    const comErro = await this.itensComErro(usuarioId)
    await this.banco.transaction('rw', this.banco.fila, async () => {
      for (const item of comErro) await this.banco.fila.update(item.seq!, { estado: 'pendente', erro: undefined })
    })
    return comErro.length
  }

  // -------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------

  private async temSessao(usuarioId: string): Promise<boolean> {
    if (!this.sessaoValida) return true
    try {
      return await this.sessaoValida(usuarioId)
    } catch {
      return false
    }
  }

  private conferirTabela(tabela: string) {
    if (!this.tabelas.includes(tabela)) {
      throw new Error(`Tabela ${tabela} não está na lista de tabelas sincronizadas (src/nucleo/tabelas.ts)`)
    }
  }

  private async montarLinha(obraId: string, usuarioId: string, campos: Record<string, unknown>): Promise<Linha> {
    for (const c of COLUNAS_DO_NUCLEO) {
      if (c in campos) throw new Error(`A coluna ${c} é preenchida pelo núcleo; não passe em campos`)
    }
    const id = campos.id === undefined ? crypto.randomUUID() : String(campos.id)
    if (!UUID.test(id)) throw new Error(`id inválido: ${id}`)
    if (!UUID.test(obraId)) throw new Error(`obra_id inválido: ${obraId}`)
    return {
      ...campos,
      id,
      obra_id: obraId,
      usuario_id: usuarioId,
      dispositivo_id: await this.banco.dispositivoId(),
      criado_em_dispositivo: new Date().toISOString(),
      apagado: false,
    }
  }

  private async gravarPendente(
    tabela: string,
    linha: Linha,
    arquivo?: ItemFila['arquivo'],
    bytes?: ArrayBuffer,
  ): Promise<void> {
    const b = this.banco
    await b.transaction('rw', b.registros, b.fila, b.conteudos, async () => {
      await b.registros.put({ tabela, id: linha.id, obra_id: linha.obra_id, linha, pendente: 1 })
      if (bytes) await b.conteudos.put({ id: linha.id, bytes })
      await b.fila.add({
        usuario_id: linha.usuario_id,
        obra_id: linha.obra_id,
        tabela,
        id: linha.id,
        linha,
        arquivo,
        estado: 'pendente',
        tentativas: 0,
        criado_em: new Date().toISOString(),
      })
    })
  }

  private faixaDaFila(usuarioId: string, estado: ItemFila['estado']) {
    return this.banco.fila
      .where('[usuario_id+estado+seq]')
      .between([usuarioId, estado, Dexie.minKey], [usuarioId, estado, Dexie.maxKey])
  }

  /** Itens da fila da pessoa num estado, na ordem em que foram registrados. */
  private itensDaFila(usuarioId: string, estado: ItemFila['estado']): Promise<ItemFila[]> {
    return this.faixaDaFila(usuarioId, estado).toArray()
  }
}

const ESGOTOU = Symbol('prazo esgotado')

/** Espera a resposta até `ms`; depois disso devolve ESGOTOU (e chama `aoEsgotar`, para cancelar o pedido). */
async function comPrazo<T>(pedido: PromiseLike<T>, ms: number, aoEsgotar?: () => void): Promise<T | typeof ESGOTOU> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const prazo = new Promise<typeof ESGOTOU>((ok) => {
    timer = setTimeout(() => {
      aoEsgotar?.()
      ok(ESGOTOU)
    }, ms)
  })
  try {
    return await Promise.race([Promise.resolve(pedido), prazo])
  } finally {
    clearTimeout(timer)
  }
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const resumo = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(resumo), (b) => b.toString(16).padStart(2, '0')).join('')
}

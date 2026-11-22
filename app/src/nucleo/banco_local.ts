// Banco local do aparelho (IndexedDB via Dexie).
//
// Uma tabela genérica "registros" guarda as linhas baixadas de TODAS as tabelas
// sincronizadas, por (tabela, id). Assim um módulo novo não precisa mexer no esquema
// do banco local: basta registrar o nome da tabela em src/nucleo/tabelas.ts.

import Dexie, { type Table } from 'dexie'

/** Linha como vem do servidor (colunas do contrato + colunas do módulo). */
export interface Linha {
  id: string
  obra_id: string
  usuario_id: string
  dispositivo_id: string
  criado_em_dispositivo: string
  criado_em_servidor?: string // só existe depois de chegar ao servidor
  atualizado_em?: string // só existe depois de chegar ao servidor
  apagado: boolean
  [coluna: string]: unknown
}

export interface RegistroLocal {
  tabela: string
  id: string
  obra_id: string
  linha: Linha
  /** 1 = criado neste aparelho e ainda não confirmado pelo servidor. */
  pendente: 0 | 1
}

export interface ArquivoPendente {
  caminho: string
  tipo: string
  tamanho: number
}

/**
 * Conteúdo (bytes) de um arquivo ainda não enviado, guardado à parte da fila.
 * Assim contar ou listar a fila não carrega fotos na memória.
 */
export interface ConteudoPendente {
  /** id da linha em "arquivos" */
  id: string
  bytes: ArrayBuffer
}

export interface ItemFila {
  seq?: number
  usuario_id: string
  obra_id: string
  tabela: string
  id: string
  linha: Linha
  /** Só para item da tabela "arquivos"; os bytes ficam em BancoLocal.conteudos. */
  arquivo?: ArquivoPendente
  /** Arquivo já está no armazenamento; falta só a linha em "arquivos". */
  arquivo_enviado?: boolean
  estado: 'pendente' | 'erro'
  tentativas: number
  erro?: string
  criado_em: string
}

export interface Cursor {
  obra_id: string
  tabela: string
  /** Maior atualizado_em já recebido (texto exato do servidor). */
  valor: string
}

export interface Meta {
  chave: string
  valor: unknown
}

export class BancoLocal extends Dexie {
  registros!: Table<RegistroLocal, [string, string]>
  fila!: Table<ItemFila, number>
  conteudos!: Table<ConteudoPendente, string>
  cursores!: Table<Cursor, [string, string]>
  meta!: Table<Meta, string>

  constructor(nome = 'sistema-obra') {
    super(nome)
    this.version(1).stores({
      registros: '[tabela+id], [tabela+obra_id], obra_id',
      // [usuario_id+estado+seq]: contar e percorrer a fila de uma pessoa, em ordem, sem ler os itens.
      fila: '++seq, [usuario_id+estado+seq], obra_id',
      conteudos: 'id',
      cursores: '[obra_id+tabela], obra_id',
      meta: 'chave',
    })
  }

  async lerMeta<T>(chave: string): Promise<T | undefined> {
    return (await this.meta.get(chave))?.valor as T | undefined
  }

  async gravarMeta(chave: string, valor: unknown): Promise<void> {
    await this.meta.put({ chave, valor })
  }

  async apagarMeta(chave: string): Promise<void> {
    await this.meta.delete(chave)
  }

  /** Identificador deste aparelho (gerado uma vez, guardado para sempre). */
  async dispositivoId(): Promise<string> {
    return this.transaction('rw', this.meta, async () => {
      const atual = await this.lerMeta<string>('dispositivo_id')
      if (atual) return atual
      const novo = crypto.randomUUID()
      await this.gravarMeta('dispositivo_id', novo)
      return novo
    })
  }

  /**
   * Número que muda toda vez que o aparelho apaga dados baixados (sair, trocar de pessoa,
   * perder acesso a uma obra). Uma baixa que começou antes da limpeza confere este número
   * antes de gravar e desiste se ele mudou: assim nada da pessoa anterior volta ao aparelho.
   */
  async geracao(): Promise<number> {
    return (await this.lerMeta<number>('geracao')) ?? 0
  }

  private async avancarGeracao(): Promise<void> {
    await this.gravarMeta('geracao', (await this.geracao()) + 1)
  }

  /**
   * Apaga do aparelho o que foi baixado de uma obra (registros e cursores).
   * NÃO apaga a fila: registro feito aqui e ainda não enviado nunca é descartado em silêncio.
   */
  async esquecerObra(obraId: string): Promise<void> {
    await this.transaction('rw', this.registros, this.cursores, this.meta, async () => {
      await this.avancarGeracao()
      const pendentes = await this.registros.where('obra_id').equals(obraId).filter((r) => r.pendente === 1).count()
      if (pendentes > 0) {
        // Mantém o que ainda não foi enviado para continuar aparecendo até o envio.
        await this.registros.where('obra_id').equals(obraId).filter((r) => r.pendente === 0).delete()
      } else {
        await this.registros.where('obra_id').equals(obraId).delete()
      }
      await this.cursores.where('obra_id').equals(obraId).delete()
    })
  }

  /**
   * Passa a fila (e os registros ainda não enviados) de uma pessoa para outra, numa transação só.
   * Uso: o que foi feito no modo sem conta sobe em nome de quem entrou com e-mail (C1, 18/11/2026).
   * Devolve quantos itens da fila mudaram de dono.
   */
  async passarFila(de: string, para: string): Promise<number> {
    if (de === para) return 0
    return this.transaction('rw', this.fila, this.registros, async () => {
      const itens = await this.fila.filter((i) => i.usuario_id === de).toArray()
      for (const i of itens) await this.fila.update(i.seq!, { usuario_id: para, linha: { ...i.linha, usuario_id: para } })
      await this.registros
        .filter((r) => r.pendente === 1 && r.linha.usuario_id === de)
        .modify((r) => {
          r.linha = { ...r.linha, usuario_id: para }
        })
      return itens.length
    })
  }

  /** Apaga tudo que foi baixado (troca de usuário no mesmo aparelho). A fila fica. */
  async esquecerTudoBaixado(): Promise<void> {
    // Antes percorria registro por registro (filter + delete): com a obra real no S23 (~65 mil
    // registros) o Sair levava dezenas de segundos sem mudar a tela (22/11/2026). Agora: guarda só
    // os registros ainda não enviados, esvazia a tabela de uma vez e põe esses de volta.
    // Todo registro com pendente = 1 tem item na fila (gravados e confirmados na mesma transação),
    // então a fila diz quais são, sem ler os outros.
    await this.transaction('rw', this.registros, this.fila, this.cursores, this.meta, async () => {
      await this.avancarGeracao()
      const chaves: [string, string][] = []
      await this.fila.each((item) => {
        chaves.push([item.tabela, item.id])
      })
      const guardar = (await this.registros.bulkGet(chaves)).filter(
        (r): r is RegistroLocal => r !== undefined && r.pendente === 1,
      )
      await this.registros.clear()
      if (guardar.length > 0) await this.registros.bulkPut(guardar)
      await this.cursores.clear()
    })
  }
}

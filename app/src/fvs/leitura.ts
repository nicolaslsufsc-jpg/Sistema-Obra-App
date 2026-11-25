// Os dados que a tela mostra: leituras do aparelho e registros que acabaram de ser gravados.
//
// O toque não relê o aparelho: o registro entra direto nos dados da tela, porque com milhares de
// registros reler tudo passa do limite de resposta do campo (0,1 s). A sincronização continua mandando
// reler de tempos em tempos, e as duas coisas se cruzam. Sem cuidado, uma leitura que começou antes do
// toque apagaria a marcação recém-feita da tela: é o "marca e não registra" que este app existe para evitar.

import Dexie from 'dexie'
import type { Linha } from '../nucleo/banco_local'
import { comRegistros, type DadosFvs } from './dados'

/**
 * Últimos dados mostrados, por obra e pessoa, enquanto a página estiver aberta (pedido do Nicolas, 21/11:
 * "FVS demora 5s para abrir"; ler milhares de marcações do aparelho levava segundos no tablet). Sair da
 * FVS e entrar de novo mostra estes na hora. Só relê o aparelho se ele mudou com a FVS fechada (a
 * sincronização, o Concreto, o pacote da obra), se a última leitura passou de 30 min, ou quando a
 * sincronização trouxer dado novo com a FVS aberta (como antes).
 */
const ultimosDados = new Map<string, { dados: DadosFvs; lidoEm: number }>()
const RELER_DEPOIS_MS = 30 * 60 * 1000

/** Telas da FVS abertas agora: o que elas gravam já entra nos dados delas (registrados). */
let abertas = 0
let mudouComAFvsFechada = false
let ouvindo = false
function ouvirOAparelho(): void {
  if (ouvindo) return
  ouvindo = true
  // qualquer gravação no banco do app ('sistema-obra'), desta página ou de outra aba
  Dexie.on('storagemutated', (partes) => {
    if (abertas === 0 && Object.keys(partes).some((k) => k.startsWith('idb://sistema-obra/'))) mudouComAFvsFechada = true
  })
}

export function dadosGuardados(chave: string): DadosFvs | null {
  return ultimosDados.get(chave)?.dados ?? null
}

/**
 * Obra sem fichas e sem plantas no aparelho: ou é nova, ou os dados dela ainda estão chegando (troca de obra,
 * testador 23/11: a FVS dizia "ainda não tem fichas" e só mostrava as peças depois de recarregar a página).
 */
export function obraVazia(d: Pick<DadosFvs, 'fichas' | 'plantasDe'>): boolean {
  return d.fichas.length === 0 && d.plantasDe.size === 0
}

/** Os guardados desta chave ainda valem (nada mudou com a FVS fechada e têm menos de 30 min). Obra vazia
 *  não vale: ler de novo é rápido e pega o que chegou depois. */
function guardadoValeDe(chave: string, agora = Date.now()): boolean {
  const g = ultimosDados.get(chave)
  return !!g && !obraVazia(g.dados) && !mudouComAFvsFechada && agora - g.lidoEm < RELER_DEPOIS_MS
}

/**
 * Chama `f` quando o banco do app mudar (qualquer gravação, desta página ou de outra aba), no máximo uma vez a
 * cada `espera` ms. Devolve a função que para de ouvir. Uso: a FVS aberta com a obra vazia relê sozinha quando
 * os dados da obra chegam (a baixa que o menu começou continua gravando depois que a FVS abre).
 */
export function aoMudarOAparelho(f: () => void, espera = 500): () => void {
  let relogio: ReturnType<typeof setTimeout> | undefined
  const ouvir = (partes: Record<string, unknown>) => {
    if (!Object.keys(partes).some((k) => k.startsWith('idb://sistema-obra/'))) return
    clearTimeout(relogio)
    relogio = setTimeout(f, espera)
  }
  Dexie.on('storagemutated', ouvir)
  return () => {
    clearTimeout(relogio)
    Dexie.on('storagemutated').unsubscribe(ouvir)
  }
}

/** Leitura feita antes de a FVS abrir (pre_leitura.ts), por chave, enquanto não termina. */
const preLeituras = new Map<string, Promise<void>>()

/**
 * Lê os dados da FVS por trás, com o módulo ainda fechado (aprovado pelo Professor em 21/11: a primeira
 * abertura levava ~3 s no tablet). Só lê: o resultado fica guardado como o da última abertura e vale
 * pelas mesmas regras (o que mudar no aparelho durante ou depois da leitura faz a FVS reler ao abrir).
 * Com a FVS aberta, ou com dados guardados que ainda valem, não faz nada.
 */
export function preLer(chave: string, ler: () => Promise<DadosFvs>): Promise<void> {
  if (abertas > 0 || guardadoValeDe(chave)) return Promise.resolve()
  const emCurso = preLeituras.get(chave)
  if (emCurso) return emCurso
  ouvirOAparelho()
  const inicio = Date.now()
  mudouComAFvsFechada = false
  const feita = ler()
    .then((d) => {
      // a FVS abriu e leu por conta própria nesse meio tempo: a leitura dela é mais nova
      const atual = ultimosDados.get(chave)
      if (atual && atual.lidoEm >= inicio) return
      if (!ultimosDados.has(chave)) ultimosDados.clear()
      ultimosDados.set(chave, { dados: d, lidoEm: inicio })
    })
    .catch((e) => console.warn('FVS: leitura antecipada falhou (a FVS lê ao abrir)', e))
    .finally(() => preLeituras.delete(chave))
  preLeituras.set(chave, feita)
  return feita
}

/** A leitura antecipada desta chave, se está em curso (a FVS aberta espera por ela em vez de ler de novo). */
export function preLeituraEmCurso(chave: string): Promise<void> | null {
  return preLeituras.get(chave) ?? null
}

export class DadosDaTela {
  private atual: DadosFvs | null
  /** Registros gravados durante cada leitura em curso: ela pode não ter visto. */
  private readonly durante = new Set<Linha[]>()
  private ultimaLeitura = 0

  constructor(
    private readonly ler: () => Promise<DadosFvs>,
    private readonly publicar: (d: DadosFvs) => void,
    /** obra e pessoa: guarda os dados para a próxima abertura do módulo (sem chave, não guarda) */
    private readonly chave?: string,
  ) {
    this.atual = chave ? dadosGuardados(chave) : null
    ouvirOAparelho()
  }

  /** Os dados guardados ainda valem: dá para abrir sem reler o aparelho. */
  guardadoVale(agora = Date.now()): boolean {
    return !!this.chave && guardadoValeDe(this.chave, agora)
  }

  /** Passa a mostrar os dados guardados, se ainda valem (os da leitura antecipada que acabou). */
  usarGuardado(): DadosFvs | null {
    if (!this.guardadoVale()) return null
    const d = dadosGuardados(this.chave!)!
    this.atual = d
    this.publicar(d)
    return d
  }

  /** O módulo abriu (true) ou fechou (false). */
  aberta(sim: boolean): void {
    abertas = Math.max(0, abertas + (sim ? 1 : -1))
  }

  dados(): DadosFvs | null {
    return this.atual
  }

  async recarregar(): Promise<DadosFvs> {
    const minha = ++this.ultimaLeitura
    const chegaram: Linha[] = []
    this.durante.add(chegaram)
    const inicio = Date.now()
    // o que mudar daqui em diante, esta leitura ou a tela aberta vê
    mudouComAFvsFechada = false
    try {
      const lidos = await this.ler()
      // uma leitura mais nova já foi pedida: ela é que vale, esta não pode passar por cima
      if (minha !== this.ultimaLeitura && this.atual) return this.atual
      return this.trocar(comRegistros(lidos, chegaram), inicio)
    } finally {
      this.durante.delete(chegaram)
    }
  }

  /** Acrescenta registros recém-gravados, sem reler o aparelho. */
  registrados(linhas: readonly Linha[]): DadosFvs {
    for (const lista of this.durante) lista.push(...linhas)
    if (!this.atual) throw new Error('FVS: registro gravado antes de a tela ter dados')
    return this.trocar(comRegistros(this.atual, linhas))
  }

  private trocar(d: DadosFvs, lidoEm?: number): DadosFvs {
    this.atual = d
    if (this.chave) {
      // só a última obra aberta: os dados de uma obra inteira ocupam memória
      if (!ultimosDados.has(this.chave)) ultimosDados.clear()
      ultimosDados.set(this.chave, { dados: d, lidoEm: lidoEm ?? ultimosDados.get(this.chave)?.lidoEm ?? 0 })
    }
    this.publicar(d)
    return d
  }
}

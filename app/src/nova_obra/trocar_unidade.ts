// Trocar a unidade de conferência de uma ficha numa obra já publicada (ideia 14, pendência 11, 25/11/2026).
// Só conta, sem tela e sem banco: a tela (TelaUnidades.tsx) lê as linhas de fvs_regras e grava a versão nova.
//
// fvs_regras é só inclusão: cada linha é a configuração inteira da obra numa versão, e vale a mais nova.
// Trocar = copiar a versão que vale (prazos, ligações, residenciais e o que mais houver, sem mexer) e
// acrescentar em `unidades` uma entrada nova com `desde`. A entrada anterior continua lá: é o histórico,
// e os registros já feitos continuam em cada local.
import { historicoDeUnidades, lerRegras, unidadeDe, type RegrasFvs, type Unidade, type UnidadeDaFicha } from '../fvs/regras'
import { UNIDADES } from './modelo'

/** Uma linha de fvs_regras como vem do banco do aparelho. */
export interface LinhaDeRegras {
  id: string
  regras?: unknown
  apagado?: unknown
  criado_em_servidor?: unknown
  criado_em_dispositivo?: unknown
}

/** A ficha publicada na obra, como importa aqui (de fichas_modelo). */
export interface FichaDaObra {
  codigo: string
  titulo: string
  aplica_a: readonly string[]
  /** com mais de uma revisão do mesmo código, vale a maior */
  revisao?: string
}

/** A linha que vale: a mais nova (mesma escolha de regrasVigentes, em fvs/regras.ts). */
export function linhaVigente<T extends LinhaDeRegras>(linhas: readonly T[]): T | undefined {
  const quando = (l: LinhaDeRegras) => String(l.criado_em_servidor ?? l.criado_em_dispositivo ?? '')
  let atual: T | undefined
  for (const l of linhas) {
    if (l.apagado === true) continue
    if (!atual || quando(l) > quando(atual) || (quando(l) === quando(atual) && l.id > atual.id)) atual = l
  }
  return atual
}

const PECAS = ['P', 'V', 'L']

/** Sem entrada em `unidades`, a FVS segue como sempre: peça, ou ambiente/parede quando a ficha só vale para eles. */
export function unidadePadrao(aplicaA: readonly string[]): Unidade {
  if (aplicaA.length && aplicaA.every((t) => t === 'M')) return 'parede'
  if (aplicaA.length && aplicaA.every((t) => t === 'A')) return 'ambiente'
  return 'peca'
}

export const nomeDaUnidade = (u: Unidade) => UNIDADES.find((x) => x.id === u)?.nome ?? u

/** Por que esta unidade não serve para a ficha como ela foi publicada (null = serve). */
export function unidadeNaoServe(ficha: FichaDaObra, unidade: Unidade): string | null {
  const a = ficha.aplica_a
  if (unidade === 'peca' && !a.some((t) => PECAS.includes(t)))
    return `A ficha ${ficha.codigo} não vale para pilar, viga nem laje. Para conferir por peça, publique uma revisão da ficha com a peça no "Vale para".`
  if (unidade === 'parede' && !a.includes('M'))
    return `A ficha ${ficha.codigo} não vale para parede. Para conferir por parede, publique uma revisão da ficha com "Parede" no "Vale para".`
  if (unidade === 'ambiente' && !a.includes('A'))
    return `A ficha ${ficha.codigo} não vale para ambiente. Para conferir por ambiente, publique uma revisão da ficha com "Ambiente" no "Vale para".`
  return null
}

export interface UnidadeNaTela {
  ficha: FichaDaObra
  /** a que vale hoje */
  hoje: Unidade
  /** true = não há entrada para a ficha até hoje: vale o padrão */
  padrao: boolean
  /** troca já marcada para depois de hoje (a mais nova) */
  depois?: UnidadeDaFicha
  historico: UnidadeDaFicha[]
}

/** Uma linha por ficha (código), na ordem do código. */
export function unidadesDaObra(fichas: readonly FichaDaObra[], regras: RegrasFvs, hoje: string): UnidadeNaTela[] {
  const porCodigo = new Map<string, FichaDaObra>()
  const rev = (f: FichaDaObra) => Number.parseInt(f.revisao ?? '0', 10) || 0
  for (const f of fichas) {
    const c = f.codigo.trim()
    const ja = porCodigo.get(c)
    if (c && (!ja || rev(f) >= rev(ja))) porCodigo.set(c, f)
  }
  return [...porCodigo.values()]
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }))
    .map((ficha) => {
      const valendo = unidadeDe(regras, ficha.codigo, hoje)
      const historico = historicoDeUnidades(regras, ficha.codigo)
      const futuras = historico.filter((u) => u.desde > hoje)
      return { ficha, hoje: valendo ?? unidadePadrao(ficha.aplica_a), padrao: !valendo, depois: futuras.at(-1), historico }
    })
}

const DATA = /^\d{4}-\d{2}-\d{2}$/

/**
 * A versão nova de fvs_regras com a troca. Recusa (com o porquê) data inválida ou no passado, data antes da
 * última troca já marcada, a mesma unidade que já vale nessa data e unidade que não serve para a ficha.
 */
export function regrasComTroca(
  linhas: readonly LinhaDeRegras[],
  ficha: FichaDaObra,
  unidade: Unidade,
  desde: string,
  hoje: string,
): { ok: true; regras: Record<string, unknown>; entrada: UnidadeDaFicha } | { ok: false; erro: string } {
  if (!UNIDADES.some((u) => u.id === unidade)) return { ok: false, erro: 'Escolha como conferir.' }
  if (!DATA.test(desde) || Number.isNaN(Date.parse(desde))) return { ok: false, erro: 'Escolha a data em que a troca começa a valer.' }
  if (desde < hoje) return { ok: false, erro: 'A troca vale de hoje em diante: o que já foi conferido fica como foi. Escolha hoje ou uma data depois.' }
  const naoServe = unidadeNaoServe(ficha, unidade)
  if (naoServe) return { ok: false, erro: naoServe }

  const vigente = linhaVigente(linhas)
  const bruto = vigente && vigente.regras && typeof vigente.regras === 'object' && !Array.isArray(vigente.regras) ? (vigente.regras as Record<string, unknown>) : {}
  const regras = lerRegras(bruto)
  const historico = historicoDeUnidades(regras, ficha.codigo)
  const ultima = historico.at(-1)
  if (ultima && desde < ultima.desde)
    return { ok: false, erro: `Já há uma troca marcada para ${dataBR(ultima.desde)} (${nomeDaUnidade(ultima.unidade)}). Escolha essa data ou uma depois.` }
  const naData = unidadeDe(regras, ficha.codigo, desde) ?? unidadePadrao(ficha.aplica_a)
  if (naData === unidade) return { ok: false, erro: `Em ${dataBR(desde)} a ficha ${ficha.codigo} já é conferida ${nomeDaUnidade(unidade).toLowerCase()}.` }

  const antigas = Array.isArray(bruto.unidades) ? (bruto.unidades as unknown[]) : []
  const ids = new Set(antigas.map((u) => (u && typeof u === 'object' ? String((u as { id?: unknown }).id) : '')))
  let n = antigas.length + 1
  while (ids.has(`unidade-${n}`)) n++
  const entrada: UnidadeDaFicha = { id: `unidade-${n}`, ficha: ficha.codigo.trim(), unidade, desde }
  return { ok: true, regras: { ...bruto, unidades: [...antigas, entrada] }, entrada }
}

/** AAAA-MM-DD → DD/MM/AAAA */
export function dataBR(d: string): string {
  const [a, m, dia] = d.split('-')
  return dia && m && a ? `${dia}/${m}/${a}` : d
}

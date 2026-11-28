// Diário automático (26/11/2026, pedido do Nicolas: "fazer o relatório automático do dia... foi realizada a
// verificação de tal ficha, tal ficha. Foi realizada a concretagem de tantos caminhões da laje e tal").
//
// Parte pura, sem banco e sem tela (automatico.test.ts). Só lê o que a FVS e o Concreto gravaram: não grava nada.
// O bloco se refaz a cada vez que o dia abre. Dia fechado: entram só os registros feitos até a hora do fechamento
// (`ate`), então o bloco para de mudar sem precisar guardar cópia; o que chegou depois é só contado ("depois").

import { dataLocal } from '../concreto/cps'
import { vigentes, type Corrigivel } from '../concreto/vigentes'
import type { Linha } from '../nucleo/banco_local'

export interface EntradasDoAutomatico {
  data: string
  /** hora do fechamento do dia (criado_em_dispositivo do fechamento); sem ela, o dia está aberto */
  ate?: string | null
  eventos: readonly Linha[]
  fichas: readonly Linha[]
  elementos: readonly Linha[]
  areas: readonly Linha[]
  plantas: readonly Linha[]
  pavimentos: readonly Linha[]
  concretagens: readonly Linha[]
  caminhoes: readonly Linha[]
  caminhaoElementos: readonly Linha[]
  /** perfis.nome por usuário, quando o aparelho tem */
  nomes?: Readonly<Record<string, string>>
}

export interface FvsDoDia {
  ficha: string
  pavimento: string
  locais: number
  conformes: number
  naoConformes: number
  naoAplica: number
  /** nomes de quem marcou; sem nome conhecido, fica vazio e `semNome` diz quantas pessoas */
  quem: string[]
  semNome: number
}

export interface ConcretagemDoDia {
  raiz: string
  local: string
  pavimento: string
  fornecedor: string
  caminhoes: number
  volume: number
  fck: number | null
}

export interface Automatico {
  fvs: FvsDoDia[]
  concretagens: ConcretagemDoDia[]
  /** o texto do diário, uma frase por item, na ordem: concretagens, depois fichas */
  frases: string[]
  /** registros da FVS e concretagens do dia feitos depois do fechamento (ficam fora do bloco) */
  depois: number
  /** totais da FVS no dia (para quem só quer o número) */
  total: { locais: number; conformes: number; naoConformes: number; naoAplica: number }
}

const n = (v: number, casas = 2) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas })
const plural = (q: number, um: string, varios: string) => `${n(q, 0)} ${q === 1 ? um : varios}`
const ordem = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

/** "A, B e C" */
export function lista(itens: readonly string[]): string {
  if (itens.length <= 1) return itens.join('')
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}

/** "no 3º Pavimento", "na Cobertura": o artigo pelo fim da primeira palavra (sem inventar: "em" quando não dá) */
export function noPavimento(nome: string): string {
  if (!nome) return ''
  const p = nome.trim().split(/\s+/)[0].toLowerCase()
  if (/^\d+[ªa]$/.test(p) || /(a|ção|são|em)$/.test(p)) return `na ${nome}`
  if (/^\d+[ºo°]$/.test(p) || /(o|or|is|im|ete)$/.test(p)) return `no ${nome}`
  return `em ${nome}`
}

/** O local de um registro da FVS (peça, área de laje, barra ou ponto, local do sistema oficial). */
const localDe = (e: Linha): string => String(e.elemento_id ?? e.area_id ?? e.barra_id ?? e.local_id ?? '')

export function montarAutomatico(x: EntradasDoAutomatico): Automatico {
  const nomePav = new Map(x.pavimentos.map((p) => [p.id, String(p.nome ?? '')]))
  const ordemPav = new Map(x.pavimentos.map((p) => [String(p.nome ?? ''), Number(p.ordem ?? 0)]))
  const pavDoElemento = new Map(x.elementos.map((e) => [e.id, String(e.pavimento_id ?? '')]))
  const nomeDoElemento = new Map(x.elementos.map((e) => [e.id, String(e.nome ?? '')]))
  const pavDaPlanta = new Map(x.plantas.map((p) => [p.id, String(p.pavimento_id ?? '')]))
  const pavDaArea = new Map<string, string>()
  for (const a of x.areas) pavDaArea.set(String(a.area_id ?? a.id), String(a.pavimento_id ?? ''))
  const ficha = new Map(x.fichas.map((f) => [f.id, [f.codigo, f.titulo].filter(Boolean).map(String).join(' · ')]))
  const antes = (l: Linha) => !x.ate || l.criado_em_dispositivo <= x.ate
  let depois = 0

  // ---------------- FVS: o último registro de cada item no dia (a correção grava registro novo do mesmo item)
  const ultimo = new Map<string, Linha>()
  for (const e of x.eventos) {
    if (dataLocal(e.criado_em_dispositivo) !== x.data) continue
    if (!antes(e)) {
      depois++
      continue
    }
    const k = `${localDe(e)}|${String(e.ficha_id)}|${String(e.item)}|${String(e.rodada ?? 1)}`
    const a = ultimo.get(k)
    if (!a || e.criado_em_dispositivo > a.criado_em_dispositivo || (e.criado_em_dispositivo === a.criado_em_dispositivo && e.id > a.id)) ultimo.set(k, e)
  }
  interface Grupo extends FvsDoDia {
    _locais: Set<string>
    _quem: Set<string>
    _sem: Set<string>
  }
  const grupos = new Map<string, Grupo>()
  const todosOsLocais = new Set<string>()
  for (const e of ultimo.values()) {
    if (!e.resultado) continue // desmarcado no fim do dia: não conta
    const local = localDe(e)
    const pavId = pavDoElemento.get(local) ?? pavDaArea.get(local) ?? (e.planta_id ? pavDaPlanta.get(String(e.planta_id)) : undefined) ?? ''
    const pav = nomePav.get(pavId) ?? ''
    const nomeFicha = ficha.get(String(e.ficha_id)) ?? 'ficha sem nome'
    const k = `${nomeFicha}|${pav}`
    let g = grupos.get(k)
    if (!g) {
      g = { ficha: nomeFicha, pavimento: pav, locais: 0, conformes: 0, naoConformes: 0, naoAplica: 0, quem: [], semNome: 0, _locais: new Set(), _quem: new Set(), _sem: new Set() }
      grupos.set(k, g)
    }
    // a FVS grava C e NC desde 08/11/2026; antes, A e R
    if (e.resultado === 'C' || e.resultado === 'A') g.conformes++
    else if (e.resultado === 'NC' || e.resultado === 'R') g.naoConformes++
    else if (e.resultado === 'NA') g.naoAplica++
    g._locais.add(local)
    todosOsLocais.add(local)
    const nome = (e.verificado_por ? String(e.verificado_por) : '') || x.nomes?.[e.usuario_id] || ''
    if (nome) g._quem.add(nome)
    else g._sem.add(e.usuario_id)
  }
  const fvs: FvsDoDia[] = [...grupos.values()]
    .map(({ _locais, _quem, _sem, ...g }) => ({ ...g, locais: _locais.size, quem: [..._quem].sort(ordem.compare), semNome: _sem.size }))
    .sort((a, b) => (ordemPav.get(a.pavimento) ?? 0) - (ordemPav.get(b.pavimento) ?? 0) || ordem.compare(a.ficha, b.ficha))

  // ---------------- Concreto: as concretagens do dia, com os caminhões e as peças de cada uma
  const caminhoes = vigentes(x.caminhoes as Corrigivel[])
  const pecasDoCaminhao = new Map<string, string[]>()
  for (const ce of x.caminhaoElementos) {
    if (ce.incluido === false) continue
    const nome = nomeDoElemento.get(String(ce.elemento_id))
    if (!nome) continue
    const l = pecasDoCaminhao.get(String(ce.caminhao_id)) ?? []
    l.push(nome)
    pecasDoCaminhao.set(String(ce.caminhao_id), l)
  }
  const concretagens: ConcretagemDoDia[] = []
  for (const c of vigentes(x.concretagens as Corrigivel[])) {
    if (c.data !== x.data) continue
    if (!antes(c as unknown as Linha)) {
      depois++
      continue
    }
    const deste = caminhoes.filter((k) => k.concretagem_id === c.raiz)
    let local = String(c.local_descricao ?? '').trim()
    if (!local) {
      // sem o local por escrito: as peças marcadas nos caminhões (até 6 nomes)
      const pecas = [...new Set(deste.flatMap((k) => [...(pecasDoCaminhao.get(k.raiz) ?? []), ...(pecasDoCaminhao.get(k.id) ?? [])]))].sort(ordem.compare)
      local = pecas.length > 6 ? `${pecas.slice(0, 6).join(', ')} e mais ${pecas.length - 6}` : lista(pecas)
    }
    concretagens.push({
      raiz: c.raiz,
      local,
      pavimento: nomePav.get(String(c.pavimento_id)) ?? '',
      fornecedor: String(c.fornecedor ?? '').trim(),
      caminhoes: deste.length,
      volume: deste.reduce((s, k) => s + Number(k.volume_m3 ?? 0), 0),
      fck: c.fck_mpa === null || c.fck_mpa === undefined ? null : Number(c.fck_mpa),
    })
  }
  concretagens.sort((a, b) => (ordemPav.get(a.pavimento) ?? 0) - (ordemPav.get(b.pavimento) ?? 0) || ordem.compare(a.local, b.local))

  const total = fvs.reduce((s, g) => ({ locais: 0, conformes: s.conformes + g.conformes, naoConformes: s.naoConformes + g.naoConformes, naoAplica: s.naoAplica + g.naoAplica }), { locais: 0, conformes: 0, naoConformes: 0, naoAplica: 0 })
  total.locais = todosOsLocais.size
  return { fvs, concretagens, frases: [...concretagens.map(fraseDaConcretagem), ...fvs.map(fraseDaFvs)], depois, total }
}

/** "Foi realizada a concretagem da laje L1 no 3º Pavimento, com 3 caminhões e 24 m³ de concreto fck 30 MPa (Concreteira X)." */
export function fraseDaConcretagem(c: ConcretagemDoDia): string {
  const onde = [c.local ? `de ${c.local}` : '', noPavimento(c.pavimento)].filter(Boolean).join(' ')
  const partes = [c.caminhoes > 0 ? plural(c.caminhoes, 'caminhão', 'caminhões') : '', c.volume > 0 ? `${n(c.volume)} m³` : ''].filter(Boolean)
  const concreto = c.fck ? ` de concreto fck ${n(c.fck, 1)} MPa` : c.volume > 0 ? ' de concreto' : ''
  const com = partes.length ? `, com ${lista(partes)}${c.volume > 0 || c.fck ? concreto : ''}` : c.fck ? `, concreto fck ${n(c.fck, 1)} MPa` : ''
  const semCaminhao = c.caminhoes === 0 ? ' Nenhum caminhão lançado ainda.' : ''
  return `Foi realizada a concretagem${onde ? ` ${onde}` : ''}${com}${c.fornecedor ? ` (${c.fornecedor})` : ''}.${semCaminhao}`
}

/** "Foi realizada a verificação da ficha X no 3º Pavimento, em 12 locais: 80 itens conformes, 2 não conformes e 1 não se aplica. Marcado por A e B." */
export function fraseDaFvs(g: FvsDoDia): string {
  const itens = [
    g.conformes ? plural(g.conformes, 'item conforme', 'itens conformes') : '',
    g.naoConformes ? plural(g.naoConformes, 'não conforme', 'não conformes') : '',
    g.naoAplica ? plural(g.naoAplica, 'não se aplica', 'não se aplicam') : '',
  ].filter(Boolean)
  const quem = [...g.quem, ...(g.semNome ? [g.quem.length ? plural(g.semNome, 'outra pessoa', 'outras pessoas') : plural(g.semNome, 'pessoa', 'pessoas')] : [])]
  const pav = noPavimento(g.pavimento)
  return `Foi realizada a verificação da ficha ${g.ficha}${pav ? ` ${pav}` : ''}, em ${plural(g.locais, 'local', 'locais')}: ${lista(itens)}.${quem.length ? ` Marcado por ${lista(quem)}.` : ''}`
}

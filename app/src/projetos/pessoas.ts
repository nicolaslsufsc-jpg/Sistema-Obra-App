// Quem tem o quê (21/11/2026, pedido do Nicolas: "quando eu clico no fulano, ele tem tal projeto, tal
// projeto... segundo o pavimento... tem tais projetos atrasados, tem que tirar dele tais projetos").
//
// Em cima do cruzamento que o painel já faz (painel.ts) e do "a entregar" (distribuicao.ts):
//  - pessoa = empresa + colaborador da ficha de cópias (colaborador vazio = "sem nome", da empresa);
//  - em campo = cópias sem devolução (as "provavelmente recolhidas" da regra 4 não contam);
//  - atrasada = a cópia em campo não é mais a revisão vigente: tirar dela e entregar a nova;
//  - conferir = o cruzamento não decidiu (não achada, revisão maior, datas...);
//  - a entregar = o que a lista de distribuição diz que falta para ela (nova ou trocar).
// A ficha de cópias não tem prazo de devolução: o único critério de atraso é a revisão.
// Funções puras: sem banco nem rede.
import type { GrupoAEntregar, Pendencia } from './distribuicao'
import { normalizar, type CopiaCruzada } from './painel'

export interface Pessoa {
  chave: string
  empresa: string
  /** vazio = entregue para a empresa, sem nome de colaborador */
  colaborador: string
  emCampo: CopiaCruzada[]
  atrasadas: CopiaCruzada[]
  conferir: CopiaCruzada[]
  emDia: number
  aEntregar: Pendencia[]
  /** maior atraso das atrasadas, em dias desde a revisão vigente */
  maiorAtraso: number
  /** última entrega para a pessoa (AAAA-MM-DD), em campo ou não */
  ultimaEntrega: string
}

export interface EmpresaComPessoas {
  empresa: string
  pessoas: Pessoa[]
  emCampo: number
  atrasadas: number
  conferir: number
  aEntregar: number
}

export const chavePessoa = (empresa: string, colaborador: string) => `${normalizar(empresa)}|${normalizar(colaborador)}`

/** Uma linha por pessoa que já recebeu cópia ou tem algo a receber; mais atrasadas primeiro. */
export function pessoasDaObra(cruzadas: readonly CopiaCruzada[], pendentes: readonly GrupoAEntregar[] = []): Pessoa[] {
  const mapa = new Map<string, Pessoa>()
  const pegar = (empresa: string, colaborador: string) => {
    const k = chavePessoa(empresa, colaborador)
    let p = mapa.get(k)
    if (!p) {
      p = { chave: k, empresa: empresa.trim(), colaborador: colaborador.trim(), emCampo: [], atrasadas: [], conferir: [], emDia: 0, aEntregar: [], maiorAtraso: 0, ultimaEntrega: '' }
      mapa.set(k, p)
    }
    return p
  }
  for (const x of cruzadas) {
    const c = x.copia
    if (!c.empresa.trim()) continue
    const p = pegar(c.empresa, c.colaborador)
    if (c.entrega && c.entrega > p.ultimaEntrega) p.ultimaEntrega = c.entrega
    if (x.situacao !== 'em campo') continue
    p.emCampo.push(x)
    if (x.resultado === 'desatualizada') {
      p.atrasadas.push(x)
      p.maiorAtraso = Math.max(p.maiorAtraso, x.dias ?? 0)
    } else if (x.resultado === 'conferir') p.conferir.push(x)
    else p.emDia++
  }
  for (const g of pendentes) pegar(g.empresa, g.colaborador).aEntregar.push(...g.pendencias)
  return [...mapa.values()].sort(
    (a, b) =>
      b.atrasadas.length - a.atrasadas.length ||
      b.aEntregar.length - a.aEntregar.length ||
      a.empresa.localeCompare(b.empresa, 'pt-BR') ||
      a.colaborador.localeCompare(b.colaborador, 'pt-BR'),
  )
}

/** As pessoas por empresa (o menu): empresa com mais atrasadas primeiro. */
export function porEmpresa(pessoas: readonly Pessoa[]): EmpresaComPessoas[] {
  const mapa = new Map<string, EmpresaComPessoas>()
  for (const p of pessoas) {
    const k = normalizar(p.empresa)
    const e = mapa.get(k) ?? { empresa: p.empresa, pessoas: [], emCampo: 0, atrasadas: 0, conferir: 0, aEntregar: 0 }
    e.pessoas.push(p)
    e.emCampo += p.emCampo.length
    e.atrasadas += p.atrasadas.length
    e.conferir += p.conferir.length
    e.aEntregar += p.aEntregar.length
    mapa.set(k, e)
  }
  return [...mapa.values()].sort((a, b) => b.atrasadas - a.atrasadas || b.emCampo - a.emCampo || a.empresa.localeCompare(b.empresa, 'pt-BR'))
}

export interface GrupoDaPessoa {
  disciplina: string
  pastas: { pasta: string; copias: CopiaCruzada[] }[]
}

/**
 * O que a pessoa tem em campo, por disciplina e pasta do Autodoc ("LO/Pilares", "LO/Formas"): é como a obra
 * separa armadura, forma e pavimento. Dentro da pasta, por número da folha (o título diz o pavimento).
 * Cópia que não achou a vigente fica em "sem pasta".
 */
export function gruposDaPessoa(p: Pessoa): GrupoDaPessoa[] {
  const disc = new Map<string, Map<string, CopiaCruzada[]>>()
  for (const x of p.emCampo) {
    const d = x.copia.disciplinaNome || x.copia.disciplina || 'Sem disciplina'
    const pasta = x.vigente?.pasta || 'sem pasta'
    const pastas = disc.get(d) ?? new Map<string, CopiaCruzada[]>()
    pastas.set(pasta, [...(pastas.get(pasta) ?? []), x])
    disc.set(d, pastas)
  }
  const ordem = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })
  return [...disc.entries()]
    .sort((a, b) => ordem.compare(a[0], b[0]))
    .map(([disciplina, pastas]) => ({
      disciplina,
      pastas: [...pastas.entries()]
        .sort((a, b) => (a[0] === 'sem pasta' ? 1 : b[0] === 'sem pasta' ? -1 : ordem.compare(a[0], b[0])))
        .map(([pasta, copias]) => ({ pasta, copias: [...copias].sort((a, b) => ordem.compare(a.copia.codigo, b.copia.codigo)) })),
    }))
}

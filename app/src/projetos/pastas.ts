// Pranchas em pastas e subpastas (23/11/2026, pedido do Nicolas: "agrupar em pastas e subpastas, quantas
// necessárias; está um pouco difícil de achar hoje"). A árvore sai dos dados que já existem, sem cadastro:
//   disciplina › pasta do Autodoc (normalmente a fase LO/EX e o tipo: "LO/Vigas", "EX/Formas") › pavimento
// O pavimento (pelo código e título, ver obra.ts) só vira pasta quando a pasta tem muitas pranchas de
// pavimentos diferentes. Sem pasta do Autodoc, vale a fase da revisão vigente. Pasta com uma subpasta só e
// nenhuma prancha junta com ela ("LO / Vigas"), para gastar menos toques. Cada pasta leva as contagens das
// pranchas de dentro (todas as subpastas), para os avisos aparecerem já na pasta de cima.
import type { Documento } from './dados'
import { ordemPavimento, pavimentoDe } from './obra'
import { normalizar } from './regras'

export interface InfoPrancha {
  /** fase da revisão vigente (LO, EX...), para a prancha sem pasta do Autodoc */
  fase?: string | null
  nova?: boolean
  /** cópias em campo com revisão antiga */
  recolher?: number
  conferir?: number
}

export interface Contas {
  pranchas: number
  novas: number
  /** pranchas com cópia desatualizada em campo */
  recolher: number
  conferir: number
}

export interface Pasta extends Contas {
  nome: string
  /** caminho desde a raiz (nomes), a rota da tela leva isto */
  caminho: string[]
  pastas: Pasta[]
  docs: Documento[]
}

/** A partir de quantas pranchas uma pasta se divide por pavimento (se tiver 2 ou mais pavimentos). */
export const MIN_PAVIMENTO = 7

const FASES = ['LO', 'EX']

/** Os nomes de pasta de uma prancha, sem a raiz da obra no Autodoc ("123 - Obra") nem a disciplina repetida. */
export function pastasDaPrancha(d: Pick<Documento, 'pasta_autodoc' | 'disciplina'>, fase?: string | null): string[] {
  let partes = String(d.pasta_autodoc ?? '')
    .split(/[\\/]/)
    .map((p) => p.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
  // a pasta raiz da obra no Autodoc ("123 - Nome da obra") e o que vem antes dela não ajudam a achar
  const raiz = partes.findIndex((p) => /^\d+\s*-\s/.test(p))
  if (raiz >= 0) partes = partes.slice(raiz + 1)
  // a pasta da disciplina (e o que vem antes dela, como "PROJETOS") também não: o nome já é a pasta de cima
  const disc = normalizar(d.disciplina).trim()
  const daDisc = partes.map((x) => normalizar(x)).lastIndexOf(disc)
  if (daDisc >= 0) partes = partes.slice(daDisc + 1)
  if (partes.length === 0 && fase) partes = [String(fase).toUpperCase()]
  return partes
}

const zerar = (): Contas => ({ pranchas: 0, novas: 0, recolher: 0, conferir: 0 })
function somar(c: Contas, i: InfoPrancha) {
  c.pranchas++
  if (i.nova) c.novas++
  if (i.recolher) c.recolher++
  if (i.conferir) c.conferir++
}

function ordemPasta(a: Pasta, b: Pasta): number {
  const fa = FASES.indexOf(a.nome.toUpperCase())
  const fb = FASES.indexOf(b.nome.toUpperCase())
  if (fa >= 0 || fb >= 0) return (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb)
  const pa = ordemPavimento(a.nome)
  const pb = ordemPavimento(b.nome)
  // pavimentos na ordem da obra (tipo, ático, cobertura e geral no fim); o resto em ordem alfabética
  const conhecido = (n: number) => n < 1099
  if (conhecido(pa) || conhecido(pb)) return pa - pb
  return a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })
}

/**
 * A árvore das pranchas: a raiz tem as disciplinas (na ordem em que vêm), e cada uma as suas pastas.
 * `info` diz a fase vigente e os avisos de cada prancha.
 */
export function arvoreDePranchas(docs: readonly Documento[], info: (d: Documento) => InfoPrancha = () => ({}), minPavimento = MIN_PAVIMENTO): Pasta {
  const raiz: Pasta = { nome: '', caminho: [], pastas: [], docs: [], ...zerar() }
  const filha = (p: Pasta, nome: string): Pasta => {
    let f = p.pastas.find((x) => x.nome === nome)
    if (!f) {
      f = { nome, caminho: [...p.caminho, nome], pastas: [], docs: [], ...zerar() }
      p.pastas.push(f)
    }
    return f
  }
  for (const d of docs) {
    const i = info(d)
    somar(raiz, i)
    let p = filha(raiz, d.disciplina || 'Sem disciplina')
    somar(p, i)
    for (const nome of pastasDaPrancha(d, i.fase)) {
      p = filha(p, nome)
      somar(p, i)
    }
    p.docs.push(d)
  }
  const arrumar = (p: Pasta, nivel: number) => {
    // pasta grande com pavimentos diferentes: uma subpasta por pavimento
    if (nivel > 0 && p.docs.length >= minPavimento) {
      const porPav = new Map<string, Documento[]>()
      for (const d of p.docs) {
        const pav = pavimentoDe(d)
        porPav.set(pav, [...(porPav.get(pav) ?? []), d])
      }
      // só divide quando ajuda: 2 ou mais pavimentos e, em média, 3 ou mais pranchas por pavimento
      if (porPav.size >= 2 && p.docs.length >= porPav.size * 3) {
        for (const [pav, ds] of porPav) {
          const f = filha(p, pav)
          for (const d of ds) {
            somar(f, info(d))
            f.docs.push(d)
          }
        }
        p.docs = []
      }
    }
    for (const f of p.pastas) arrumar(f, nivel + 1)
    if (nivel > 0) p.pastas.sort(ordemPasta)
    p.docs.sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }))
    // uma subpasta só e nenhuma prancha solta: junta as duas ("LO / Vigas")
    if (nivel >= 1 && p.pastas.length === 1 && p.docs.length === 0) {
      const f = p.pastas[0]
      p.nome = `${p.nome} / ${f.nome}`
      p.pastas = f.pastas
      p.docs = f.docs
      // o caminho das de baixo continua valendo: a pasta juntada responde pelos dois nomes
      p.caminho = f.caminho
    }
  }
  arrumar(raiz, 0)
  return raiz
}

/** A pasta de um caminho (nomes desde a raiz); caminho que não existe mais = a pasta mais funda que existe. */
export function acharPasta(raiz: Pasta, caminho: readonly string[]): Pasta {
  let p = raiz
  let i = 0
  while (i < caminho.length) {
    // uma pasta juntada ("LO / Vigas") tem o caminho dos dois nomes
    const f = p.pastas.find((x) => x.caminho.length > i && x.caminho.slice(i).every((n, j) => caminho[i + j] === n))
      ?? p.pastas.find((x) => x.caminho[i] === caminho[i])
    if (!f) break
    p = f
    i = f.caminho.length
  }
  return p
}

/** Onde a prancha fica (para mostrar na busca): "Estrutura › LO › Vigas › 2º pavimento". */
export function caminhoDaPrancha(raiz: Pasta, id: string): string[] {
  const achar = (p: Pasta, trilha: string[]): string[] | null => {
    if (p.docs.some((d) => d.id === id)) return trilha
    for (const f of p.pastas) {
      const r = achar(f, [...trilha, f.nome])
      if (r) return r
    }
    return null
  }
  return achar(raiz, []) ?? []
}

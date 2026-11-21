// Folha padrão do "Exportar PDF" (frente 06, 21/11/2026): cabeçalho com a obra, a data e quem gerou, e
// tabelas legíveis em A4. Cada módulo só monta os dados (FolhaPdf); o desenho e a impressão ficam em
// ExportarPdf.tsx. O PDF sai pelo Imprimir do navegador ("Salvar como PDF"), sem biblioteca.
import { EMAIL_SEM_CONTA } from '../nucleo/local'

export type Celula = string | number | null | undefined

export interface TabelaPdf {
  titulo?: string
  colunas: readonly string[]
  linhas: ReadonlyArray<readonly Celula[]>
  /** Colunas curtas (números, datas): ficam estreitas e sem quebra de linha. Posições em `colunas`. */
  curtas?: readonly number[]
  /** Texto no lugar da tabela quando não há linha. */
  vazio?: string
  /** Nota pequena embaixo da tabela. */
  nota?: string
}

export interface FolhaPdf {
  /** "FVS", "Concreto", "Projetos", "Documentos" */
  modulo: string
  /** o que é a folha: "Pavimento Térreo", "Lista de projetos"... */
  titulo: string
  /** uma linha embaixo do título (filtros, data da concretagem...) */
  sub?: string
  /** números principais, um por caixa: "12 de 40 liberadas" */
  resumo?: readonly string[]
  tabelas: readonly TabelaPdf[]
  /** deitada para tabela larga; o padrão é em pé */
  deitada?: boolean
}

/** Quem gerou: o nome da pessoa (quando o aparelho sabe), o e-mail, ou o aparelho no modo sem conta. */
export function textoDeQuem(u: { id: string; email: string }, nomes?: Readonly<Record<string, string>> | null): string {
  if (u.email === EMAIL_SEM_CONTA) return 'este aparelho (sem conta)'
  return nomes?.[u.id]?.trim() || u.email
}

const dois = (n: number) => String(n).padStart(2, '0')

/** "21/11/2026 08:45", na hora do aparelho. */
export function dataHoraBR(d: Date): string {
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`
}

/** Nome sugerido do arquivo (o Chrome usa o título da página): "FVS_EXE_Pavimento-Terreo_2026-11-21". */
export function nomeDoArquivoPdf(f: Pick<FolhaPdf, 'modulo' | 'titulo'>, codigoDaObra: string, d: Date): string {
  const limpo = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  const data = `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
  return [limpo(f.modulo), limpo(codigoDaObra), limpo(f.titulo), data].filter(Boolean).join('_')
}

/** Texto da célula: vazio vira "—"; número sai com vírgula. */
export function textoDaCelula(c: Celula): string {
  if (c === null || c === undefined || c === '') return '—'
  if (typeof c === 'number') return Number.isInteger(c) ? String(c) : c.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  return c
}

// Folha do "Exportar PDF" da FVS (21/11/2026): andamento, fichas por peça e não conformidades, de um
// pavimento ou da obra inteira. Os dados são os mesmos da planilha da situação e da lista de reprovações.
import type { FolhaPdf } from '../telas/folha_pdf'
import { resumoDaTratativa } from './tratativas'
import { dataHoraBR } from '../telas/folha_pdf'
import type { LinhaDaSituacao } from './planilha'
import type { Reprovacao } from './reprovacoes'

const NOME_TIPO: Record<string, string> = { P: 'Pilar', V: 'Viga', L: 'Laje', A: 'Ambiente', F: 'Furo' }
const quando = (iso: string | null) => (iso ? dataHoraBR(new Date(iso)) : '')

export function folhaDaFvs({
  titulo,
  linhas,
  reprovacoes,
  comPavimento = false,
  nomeDoPavimento = () => '',
}: {
  titulo: string
  linhas: readonly LinhaDaSituacao[]
  reprovacoes: readonly Reprovacao[]
  /** obra inteira: uma coluna com o pavimento */
  comPavimento?: boolean
  nomeDoPavimento?: (pavimentoId: string) => string
}): FolhaPdf {
  // andamento: quantas fichas em cada situação, na ordem em que aparecem
  const porSituacao = new Map<string, number>()
  for (const l of linhas) {
    const s = l.situacao || 'Sem ficha no app'
    porSituacao.set(s, (porSituacao.get(s) ?? 0) + 1)
  }
  const abertas = reprovacoes.filter((r) => r.aberta)
  const pav = comPavimento ? ['Pavimento'] : []
  return {
    modulo: 'FVS',
    titulo,
    resumo: [
      `${linhas.length} ${linhas.length === 1 ? 'ficha' : 'fichas'}`,
      ...[...porSituacao].map(([s, n]) => `${n} ${s.toLowerCase()}`),
      `${abertas.length} ${abertas.length === 1 ? 'NC aberta' : 'NCs abertas'}`,
    ],
    tabelas: [
      {
        titulo: 'Fichas por peça',
        colunas: [...pav, 'Tipo', 'Peça', 'Ficha', 'Situação', 'C', 'NC', 'NA', 'Vazios', '% conf.', 'Última marcação', 'Quem'],
        curtas: [...pav.map((_, i) => i), ...[0, 2, 4, 5, 6, 7, 8, 9].map((i) => i + pav.length)],
        linhas: linhas.map((l) => [
          ...(comPavimento ? [l.pavimento] : []),
          l.tipo,
          l.secao ? `${l.peca} (${l.secao})` : l.peca,
          l.ficha,
          l.situacao,
          l.a,
          l.r,
          l.na,
          l.vazios,
          l.conforme === null ? '' : `${l.conforme}%`,
          quando(l.ultima),
          l.quem,
        ]),
        vazio: 'Nenhuma peça com ficha.',
        nota: 'C conforme · NC não conforme · NA não se aplica · Vazios: itens ainda sem marcação.',
      },
      {
        titulo: 'Não conformidades',
        colunas: [...pav, 'Peça', 'Ficha', 'Item', 'O que fazer', 'Tratativa', 'Rodada', 'Marcada em', 'Quem', 'Situação'],
        curtas: [...pav.map((_, i) => i), ...[1, 5, 6].map((i) => i + pav.length)],
        linhas: reprovacoes.map((r) => [
          ...(comPavimento ? [nomeDoPavimento(r.pavimentoId)] : []),
          `${NOME_TIPO[r.tipo] ?? r.tipo} ${r.pecaNome}`,
          r.fichaCodigo,
          `${r.item}. ${r.itemTitulo}`,
          r.observacao,
          resumoDaTratativa(r.tratativa, r.aberta),
          `V${String(r.rodada).padStart(2, '0')}`,
          quando(r.quando),
          r.quem,
          r.concessao ? `Concessão (${r.tratativa?.concessao_por ?? ''})` : r.aberta ? 'Aberta' : `Reinspecionada (${r.reinspecao?.resultado ?? ''}) em ${quando(r.reinspecao?.quando ?? null)} por ${r.reinspecao?.quem ?? ''}`,
        ]),
        vazio: 'Nenhuma não conformidade.',
      },
    ],
    // doze colunas (com a tratativa, 25/11): deitada fica legível sem quebrar cada palavra
    deitada: true,
  }
}

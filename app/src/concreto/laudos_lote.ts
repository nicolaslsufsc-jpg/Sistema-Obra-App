// Laudos que pedem atenção, por lote (a concretagem inteira). Pedido do Nicolas (22/11): o laudo
// atrasado é sempre do lote inteiro; uma linha por caminhão deixava a lista longa demais.
// Uma linha por lote; tocar abre os caminhões daquele lote.

import { GRAVIDADE, piorSituacao, type SituacaoCP } from './cps'
import { idadesDoCaminhao, type Caminhao, type Concretagem, type DadosConcreto } from './dados'

export type SituacaoAlerta = Extract<SituacaoCP, 'atrasado' | 'abaixo_fck'>

export interface CaminhaoComAlerta {
  caminhao: Caminhao
  pior: SituacaoAlerta
}

export interface IdadeDoLote {
  idade: number
  /** Caminhões com laudo atrasado nesta idade. */
  atrasados: number
  /** Maior atraso (dias depois da data prevista) entre eles. */
  diasDeAtraso: number
  /** Caminhões abaixo do fck nesta idade (só na idade de controle). */
  abaixo: number
}

export interface LoteComAlerta {
  concretagem: Concretagem
  pior: SituacaoAlerta
  /** Só os caminhões do lote com alerta, na ordem do caminhão. */
  caminhoes: CaminhaoComAlerta[]
  /** Por idade (7, 28...), só as que têm alerta. */
  idades: IdadeDoLote[]
}

const ehAlerta = (s: SituacaoCP | null): s is SituacaoAlerta => s === 'atrasado' || s === 'abaixo_fck'

/** Lotes com laudo atrasado ou abaixo do fck; o pior primeiro, depois o mais antigo. */
export function lotesComAlerta(d: DadosConcreto, hoje: string): LoteComAlerta[] {
  const lotes: LoteComAlerta[] = []
  for (const conc of d.concretagens) {
    const porIdade = new Map<number, IdadeDoLote>()
    const caminhoes: CaminhaoComAlerta[] = []
    for (const c of [...(d.caminhoesDe.get(conc.raiz) ?? [])].sort((a, b) => a.sequencia - b.sequencia)) {
      const idades = idadesDoCaminhao(d, c, conc, hoje)
      const pior = piorSituacao(idades.map((i) => i.situacao))
      if (!ehAlerta(pior)) continue
      caminhoes.push({ caminhao: c, pior })
      for (const i of idades) {
        if (!ehAlerta(i.situacao)) continue
        const x = porIdade.get(i.idade) ?? { idade: i.idade, atrasados: 0, diasDeAtraso: 0, abaixo: 0 }
        if (i.situacao === 'atrasado') {
          x.atrasados++
          x.diasDeAtraso = Math.max(x.diasDeAtraso, i.dias)
        } else x.abaixo++
        porIdade.set(i.idade, x)
      }
    }
    if (caminhoes.length === 0) continue
    lotes.push({
      concretagem: conc,
      pior: piorSituacao(caminhoes.map((c) => c.pior)) as SituacaoAlerta,
      caminhoes,
      idades: [...porIdade.values()].sort((a, b) => a.idade - b.idade),
    })
  }
  return lotes.sort((a, b) => GRAVIDADE[a.pior] - GRAVIDADE[b.pior] || a.concretagem.data.localeCompare(b.concretagem.data))
}

/** "7 dias: atrasado há 12 dias · 28 dias: 2 abaixo do fck" */
export function resumoDasIdades(l: LoteComAlerta): string {
  return l.idades
    .map((i) => {
      const partes: string[] = []
      if (i.atrasados > 0) partes.push(`atrasado há ${i.diasDeAtraso === 1 ? '1 dia' : `${i.diasDeAtraso} dias`}`)
      if (i.abaixo > 0) partes.push(`${i.abaixo} abaixo do fck`)
      return `${i.idade} dias: ${partes.join(', ')}`
    })
    .join(' · ')
}

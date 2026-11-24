// Tipos de peça que o Concreto mostra (22/11/2026: fundações). Estaca (S) e bloco (K) não têm desenho
// na planta de forma: entram no caminhão pela ligação à mão (caminhao_elementos, origem 'manual') e
// aparecem na lista do caminhão, no relatório, no CSV e na planilha pelo nome com o tipo na frente.
import { nomeNaTela } from './lajes'

export const NOME_DO_TIPO: Readonly<Record<string, string>> = { P: 'Pilar', V: 'Viga', L: 'Laje', S: 'Estaca', K: 'Bloco' }

/** Ordem na lista do caminhão e no relatório: pilar, viga, laje, estaca, bloco, o resto. */
export const ORDEM_DO_TIPO: Readonly<Record<string, number>> = { P: 0, V: 1, L: 2, S: 3, K: 4 }

/** Tipo de fundação: sem desenho na planta, só pela lista. */
export const ehFundacao = (tipo: string): boolean => tipo === 'S' || tipo === 'K'

/** Nome da peça nas telas: "Estaca E-P72.A", "Bloco BL-P36"; laje de trecho como em lajes.ts; o resto como está. */
export function nomeDaPeca(tipo: string, nome: string): string {
  if (ehFundacao(tipo)) return `${NOME_DO_TIPO[tipo]} ${nome}`
  return nomeNaTela(tipo, nome)
}

/** Coluna "tipo" do CSV: P, V e L como sempre; estaca e bloco por extenso. */
export function tipoNoCsv(tipo: string): string {
  return ehFundacao(tipo) ? NOME_DO_TIPO[tipo] : tipo
}

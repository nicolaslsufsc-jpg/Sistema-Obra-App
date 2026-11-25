// Verde só com concretagem cadastrada (achado #2 da lista de campo, decisão do Nicolas de 24/11): "ela leia o
// módulo de concreto e a peça fica verde quando estiver numa concretagem cadastrada ... não precisar de uma
// tabela nova ... não precisa que seja a laje inteira. Vamos botar um coeficiente aí de 90%".
//
// Só leitura do Concreto (concreto/rastreio.ts), sem tabela nova e sem migração:
// - pilar e viga: os caminhões da peça (caminhao_elementos: o desenho do caminhão pegou a peça, ou a pessoa
//   incluiu à mão); a soma das frações tem de chegar a COBERTURA_CONCRETADA (incluída à mão conta inteira);
// - área de laje da FVS: a parte dela coberta pelas áreas dos caminhões (montarRastreioDasLajes), também
//   COBERTURA_CONCRETADA no mínimo.
// Os outros tipos (ambiente, parede, bloco, estaca...) seguem como antes: o Concreto não os liga à peça.

import type { CaminhaoDaPeca, RastreioDaLaje } from '../concreto/rastreio'

/** Quanto da peça ou da laje tem de estar numa concretagem cadastrada para ela ficar verde (90%). */
export const COBERTURA_CONCRETADA = 0.9

/** Tipos em que o verde pede a concretagem cadastrada: os que o Concreto liga à peça (pilar, viga, laje). */
export const TIPOS_CONCRETADOS: ReadonlySet<string> = new Set(['P', 'V', 'L'])

/**
 * Puro: ids das peças (pilar, viga) e das áreas de laje concretadas, pelos caminhões do Concreto.
 * Obra sem Concreto: conjunto vazio (nada fica verde nesses tipos; com a ficha completa, fica azul).
 */
export function pecasConcretadas(
  caminhoesDasPecas: ReadonlyMap<string, readonly CaminhaoDaPeca[]>,
  lajes: ReadonlyMap<string, Pick<RastreioDaLaje, 'cobertura'>>,
): Set<string> {
  const saida = new Set<string>()
  for (const [id, caminhoes] of caminhoesDasPecas) {
    const soma = caminhoes.reduce((s, c) => s + (c.fracao === null ? 1 : c.fracao), 0)
    if (soma >= COBERTURA_CONCRETADA) saida.add(id)
  }
  for (const [id, r] of lajes) if (r.cobertura >= COBERTURA_CONCRETADA) saida.add(id)
  return saida
}

/**
 * Se a peça está concretada, para a situação dela: true ou false nos tipos do Concreto; undefined nos outros
 * (a situação segue a regra antiga: ficha completa fica verde).
 */
export function concretadaDe(concretadas: ReadonlySet<string> | undefined, id: string, tipo: string | undefined): boolean | undefined {
  return concretadas && tipo && TIPOS_CONCRETADOS.has(tipo) ? concretadas.has(id) : undefined
}

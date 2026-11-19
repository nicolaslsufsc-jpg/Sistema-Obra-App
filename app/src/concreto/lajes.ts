// Laje como peça (decisão do Nicolas, 04/11/2026, confirmada em 07/11; docs/modulos/3_concreto.md).
// A forma traz o contorno de pilares e vigas, mas não o da laje. Por isso a laje entra no caminhão
// como uma peça por trecho ("Laje do Trecho 2"), marcada no toque, sem área.
//
// Quem cria a linha da laje em "elementos" é a própria pessoa, no primeiro toque (dados.ts,
// garantirLaje). O banco só deixa gestor e administrador cadastrarem peça.
//
// - Em "elementos" o nome não pode ter espaço (contrato do núcleo): grava "Laje_Trecho_2" e as telas
//   mostram "Laje do Trecho 2" (dados.ts troca o nome ao ler).
// - O id sai do pavimento e do nome (UUID v5). Dois aparelhos sem internet que criam a mesma laje
//   mandam o mesmo id, e o servidor guarda uma só (reenvio do mesmo id não duplica). Em Python:
//   uuid.uuid5(ESPACO_LAJES, f"{pavimento_id}|L|{nome no banco}").

/** Espaço de nomes dos ids de laje (UUID v5). Não mudar: muda o id de toda laje nova. */
export const ESPACO_LAJES = '6b0fc8e1-37dc-4d8b-a806-2564efba583b'

const PREFIXO = 'Laje_'

const limpar = (trecho: string) => trecho.trim().split(/\s+/).filter(Boolean)

/** Nome gravado em elementos.nome (sem espaço). */
export function nomeNoBanco(trecho: string): string {
  return PREFIXO + limpar(trecho).join('_')
}

/**
 * Nome da laje nas telas, no relatório e no CSV: "Laje do Trecho 2". Planta que não se chama
 * "Trecho N" (a de teste, por exemplo) fica "Laje (Planta de teste)".
 */
export function nomeDaLaje(trecho: string): string {
  const t = limpar(trecho).join(' ')
  return /^trecho\b/i.test(t) ? `Laje do ${t}` : `Laje (${t})`
}

/** Nome de "elementos" para as telas: só a laje de trecho muda ("Laje_Trecho_2" → "Laje do Trecho 2"). */
export function nomeNaTela(tipo: string, nome: string): string {
  return tipo === 'L' && nome.startsWith(PREFIXO) && nome.length > PREFIXO.length ? nomeDaLaje(nome.slice(PREFIXO.length).replace(/_/g, ' ')) : nome
}

/**
 * Peça (já com o nome da tela) que é laje de trecho. No banco o nome não tem espaço, então só a
 * laje de trecho chega às telas começando por "Laje ". As lajes "L1" da planta de teste têm
 * contorno e não são.
 */
export function ehLajeDeTrecho(p: { tipo: string; nome: string }): boolean {
  return p.tipo === 'L' && p.nome.startsWith('Laje ')
}

/** Laje do trecho entre as peças do pavimento (nomes da tela), se já existe. */
export function lajeDoTrecho<P extends { tipo: string; nome: string }>(pecas: readonly P[], trecho: string): P | undefined {
  const nome = nomeDaLaje(trecho)
  return pecas.find((p) => p.tipo === 'L' && p.nome === nome)
}

/** id da laje do trecho: o mesmo em qualquer aparelho e no Python. */
export function idDaLaje(pavimentoId: string, trecho: string): Promise<string> {
  return uuidV5(ESPACO_LAJES, `${pavimentoId}|L|${nomeNoBanco(trecho)}`)
}

/** UUID versão 5 (RFC 4122: SHA-1 do espaço de nomes + nome), igual ao uuid.uuid5 do Python. */
async function uuidV5(espaco: string, nome: string): Promise<string> {
  const ns = (espaco.replace(/-/g, '').match(/../g) ?? []).map((h) => parseInt(h, 16))
  const texto = new TextEncoder().encode(nome)
  const dados = new Uint8Array(ns.length + texto.length)
  dados.set(ns)
  dados.set(texto, ns.length)
  const b = new Uint8Array(await crypto.subtle.digest('SHA-1', dados)).slice(0, 16)
  b[6] = (b[6] & 0x0f) | 0x50
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

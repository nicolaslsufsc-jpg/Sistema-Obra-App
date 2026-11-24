// Redesenho de pilar ou viga (pedido do Nicolas, 23/11/2026, item 3.7): o contorno que saiu da prancha às
// vezes fica levemente errado, e a pessoa redesenha na planta, ponto a ponto. Parte pura, sem banco e sem
// tela (testada em redesenhos.test.ts).
//
// Tabela fvs_redesenhos, só inclusão: redesenhar de novo ou voltar ao original é uma linha nova com
// substitui_id = a que valia. Vale a ponta mais nova da cadeia, por peça e trecho. O original continua
// no pacote da planta: "voltar ao original" cancela, e a peça volta a usar o contorno do pacote.
//
// O redesenho entra no lugar do original no manifest que a planta usa (comRedesenhos): o desenho, a cor,
// o toque, a seleção por retângulo e as ligações enxergam o contorno novo sem mudar nada nelas.

import type { Ponto } from './areas'
import type { ElementoPacote, Manifest } from './pacote'

/** Tipos de peça que se redesenham: pilar e viga (a laje já é desenhada no app). */
export const TIPOS_REDESENHAVEIS: readonly string[] = ['P', 'V']

export interface Redesenho {
  /** a linha que está valendo (o substitui_id da próxima correção) */
  id: string
  elemento_id: string
  /** o trecho da planta: as coordenadas só valem nele */
  setor_id: string
  /** a revisão da prancha que estava na tela quando foi redesenhado */
  planta_id: string | null
  contorno: Ponto[]
  usuario_id: string
  criado_em_dispositivo: string
}

export interface LinhaDeRedesenho {
  id: string
  elemento_id?: unknown
  setor_id?: unknown
  planta_id?: unknown
  contorno?: unknown
  substitui_id?: unknown
  cancelado?: unknown
  usuario_id: string
  criado_em_dispositivo: string
}

/** Chave do redesenho: a peça no trecho (a mesma peça pode estar em dois trechos, com coordenadas diferentes). */
export const chaveDoRedesenho = (elementoId: string, setorId: string) => `${elementoId}|${setorId}`

const maisNova = (a: LinhaDeRedesenho, b: LinhaDeRedesenho) =>
  a.criado_em_dispositivo === b.criado_em_dispositivo ? a.id > b.id : a.criado_em_dispositivo > b.criado_em_dispositivo

/**
 * Os redesenhos que valem hoje, por peça e trecho. Linha que outra substitui não vale; das pontas que
 * sobram (dois aparelhos redesenhando sem internet), vale a mais nova. Ponta cancelada = voltou ao
 * original, e a peça fica fora do mapa.
 */
export function redesenhosVigentes(linhas: readonly LinhaDeRedesenho[]): Map<string, Redesenho> {
  const substituidas = new Set(linhas.map((l) => l.substitui_id).filter((s): s is string => typeof s === 'string' && !!s))
  const ponta = new Map<string, LinhaDeRedesenho>()
  for (const l of linhas) {
    if (substituidas.has(l.id) || !l.elemento_id || !l.setor_id) continue
    const k = chaveDoRedesenho(String(l.elemento_id), String(l.setor_id))
    const atual = ponta.get(k)
    if (!atual || maisNova(l, atual)) ponta.set(k, l)
  }
  const saida = new Map<string, Redesenho>()
  for (const [k, l] of ponta) {
    const contorno = contornoValido(l.contorno)
    if (l.cancelado === true || !contorno) continue
    saida.set(k, {
      id: l.id,
      elemento_id: String(l.elemento_id),
      setor_id: String(l.setor_id),
      planta_id: (l.planta_id as string | null) ?? null,
      contorno,
      usuario_id: l.usuario_id,
      criado_em_dispositivo: l.criado_em_dispositivo,
    })
  }
  return saida
}

function contornoValido(c: unknown): Ponto[] | null {
  if (!Array.isArray(c) || c.length < 3) return null
  for (const p of c) if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number') return null
  return c as Ponto[]
}

/** Retângulo [x0, y0, x1, y1] em volta dos pontos. */
function caixa(pts: readonly Ponto[]): [number, number, number, number] {
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/**
 * O manifest da planta com os redesenhos do trecho no lugar dos contornos originais. Sem redesenho no
 * trecho, devolve o mesmo objeto (a tela não refaz nada). O rótulo (o nome na planta) só muda quando o
 * original não tinha contorno nenhum.
 */
export function comRedesenhos<M extends Pick<Manifest, 'elementos'>>(manifest: M | undefined, redesenhos: ReadonlyMap<string, Redesenho> | undefined, setorId: string): M | undefined {
  if (!manifest || !redesenhos?.size) return manifest
  let elementos: Record<string, ElementoPacote> | null = null
  for (const [id, e] of Object.entries(manifest.elementos)) {
    const r = redesenhos.get(chaveDoRedesenho(id, setorId))
    if (!r || !TIPOS_REDESENHAVEIS.includes(e.tipo)) continue
    elementos ??= { ...manifest.elementos }
    elementos[id] = { ...e, polys: [r.contorno.map((p) => [p[0], p[1]] as [number, number])], ...(e.polys.length ? {} : { rotulo: caixa(r.contorno) }), redesenhada: true }
  }
  return elementos ? { ...manifest, elementos } : manifest
}

/**
 * Aviso de revisão nova: o redesenho foi feito noutra revisão da prancha que a que está na tela. O app
 * não apaga o redesenho sozinho (pode continuar certo); a pessoa confere e, se for o caso, volta ao original.
 */
export function avisoDeRevisaoNova(r: Pick<Redesenho, 'planta_id'>, plantaNaTela: string | null | undefined, revisaoDe: (plantaId: string) => string | undefined): string {
  if (!r.planta_id || !plantaNaTela || r.planta_id === plantaNaTela) return ''
  const feita = revisaoDe(r.planta_id)
  const agora = revisaoDe(plantaNaTela)
  const naRevisao = feita ? ` na revisão ${feita}` : ' noutra revisão'
  const esta = agora ? `Esta planta é a ${agora}` : 'Esta planta é de outra revisão'
  return `O contorno desta peça foi redesenhado à mão${naRevisao} da prancha. ${esta}: confira se o desenho ainda bate com o projeto ou volte ao original.`
}

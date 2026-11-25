// Entregas da obra agrupadas (23/11/2026, pedido do Nicolas: "uma aba com as entregas"). Cada registro de
// entrega é UMA cópia de UMA prancha; quem leva várias pranchas de uma vez assina uma vez só, e todos os
// registros dessa vez têm a mesma assinatura. Aqui eles voltam a ser "uma entrega": data e hora, pessoa,
// empresa, quantas pranchas e cópias. As entregas antigas, sem assinatura (a carga da ficha de 22/11 e as
// de antes da assinatura no app), agrupam por empresa + pessoa + dia. Só contas, puras; a tela é
// telas/TelaEntregas.tsx e o comprovante (telas/TelaComprovante.tsx) abre pela chave daqui.
import type { Linha } from '../nucleo/banco_local'
import type { DadosProjetos } from './dados'
import { normalizar } from './regras'

export interface EntregaAgrupada {
  /** 'a:<assinatura>' ou 's:<empresa>|<pessoa>|<dia>' (a rota do comprovante leva esta chave) */
  chave: string
  assinaturaId: string | null
  /** quando foi registrada (o primeiro registro da entrega), ISO */
  quando: string
  /** dia da entrega (data_evento), AAAA-MM-DD */
  dia: string
  colaborador: string
  empresa: string
  empresaId: string
  /** pranchas diferentes */
  pranchas: number
  /** registros (cópias) */
  copias: number
  /** quantas cópias já voltaram (devolução registrada) */
  devolvidas: number
}

type DadosEntregas = Pick<DadosProjetos, 'eventos' | 'empresaPorId'>

const dia = (e: Linha) => String(e.data_evento ?? e.criado_em_dispositivo ?? '').slice(0, 10)

/** A chave de grupo de um registro de entrega. */
export function chaveDaEntrega(e: Linha): string {
  if (e.assinatura_id) return `a:${String(e.assinatura_id)}`
  return `s:${String(e.empresa_id ?? '')}|${normalizar(String(e.colaborador ?? '').trim())}|${dia(e)}`
}

const entregasVivas = (d: Pick<DadosProjetos, 'eventos'>) => d.eventos.filter((e) => e.tipo === 'entrega' && !e.apagado)

/** Todas as entregas da obra, da mais nova para a mais velha. */
export function entregasDaObra(d: DadosEntregas): EntregaAgrupada[] {
  const devolvidas = new Set(d.eventos.filter((e) => e.tipo === 'devolucao' && !e.apagado && e.entrega_id).map((e) => String(e.entrega_id)))
  const grupos = new Map<string, { linhas: Linha[] }>()
  for (const e of entregasVivas(d)) {
    const k = chaveDaEntrega(e)
    const g = grupos.get(k)
    if (g) g.linhas.push(e)
    else grupos.set(k, { linhas: [e] })
  }
  const saida: EntregaAgrupada[] = []
  for (const [chave, { linhas }] of grupos) {
    linhas.sort((a, b) => String(a.criado_em_dispositivo ?? '').localeCompare(String(b.criado_em_dispositivo ?? '')))
    const l0 = linhas[0]
    const empresaId = String(l0.empresa_id ?? '')
    saida.push({
      chave,
      assinaturaId: l0.assinatura_id ? String(l0.assinatura_id) : null,
      quando: String(l0.criado_em_dispositivo ?? ''),
      dia: dia(l0),
      colaborador: String(l0.colaborador ?? '').trim(),
      empresa: d.empresaPorId.get(empresaId)?.nome ?? 'empresa sem cadastro',
      empresaId,
      pranchas: new Set(linhas.map((l) => String(l.documento_id))).size,
      copias: linhas.length,
      devolvidas: linhas.filter((l) => devolvidas.has(l.id)).length,
    })
  }
  // mais nova primeiro: pelo dia da entrega e, no mesmo dia, pela hora do registro
  return saida.sort((a, b) => b.dia.localeCompare(a.dia) || b.quando.localeCompare(a.quando) || a.chave.localeCompare(b.chave))
}

/** Os registros de uma entrega (pela chave da lista), na ordem em que foram registrados. */
export function eventosDaEntrega(d: Pick<DadosProjetos, 'eventos'>, chave: string): Linha[] {
  return entregasVivas(d)
    .filter((e) => chaveDaEntrega(e) === chave)
    .sort((a, b) => String(a.criado_em_dispositivo ?? '').localeCompare(String(b.criado_em_dispositivo ?? '')))
}

export interface FiltroEntregas {
  /** pessoa ou empresa */
  busca?: string
  /** AAAA-MM-DD, inclusive */
  de?: string
  ate?: string
  /** só as assinadas / só as sem assinatura */
  assinatura?: 'todas' | 'assinadas' | 'sem'
}

export function filtrarEntregas(lista: readonly EntregaAgrupada[], f: FiltroEntregas): EntregaAgrupada[] {
  const q = normalizar(f.busca ?? '').trim()
  return lista.filter(
    (x) =>
      (!q || normalizar(x.colaborador).includes(q) || normalizar(x.empresa).includes(q)) &&
      (!f.de || x.dia >= f.de) &&
      (!f.ate || x.dia <= f.ate) &&
      (!f.assinatura || f.assinatura === 'todas' || (f.assinatura === 'assinadas' ? !!x.assinaturaId : !x.assinaturaId)),
  )
}

export interface PessoaDaEmpresa {
  colaborador: string
  /** cópias ainda em campo (entregues e sem devolução) */
  emCampo: number
  ultimaEntrega: string
}

/**
 * Quem da empresa recebeu cópias (achado do testador, 23/11: a entrega assinada não aparecia na tela das
 * empresas, que só conta pranchas). Uma linha por pessoa, com as cópias ainda em campo.
 */
export function pessoasDaEmpresa(d: Pick<DadosProjetos, 'eventos'>, empresaId: string): PessoaDaEmpresa[] {
  const devolvidas = new Set(d.eventos.filter((e) => e.tipo === 'devolucao' && !e.apagado && e.entrega_id).map((e) => String(e.entrega_id)))
  const m = new Map<string, PessoaDaEmpresa>()
  for (const e of entregasVivas(d)) {
    if (String(e.empresa_id ?? '') !== empresaId) continue
    const nome = String(e.colaborador ?? '').trim() || 'sem nome'
    const k = normalizar(nome)
    const p = m.get(k) ?? { colaborador: nome, emCampo: 0, ultimaEntrega: '' }
    if (!devolvidas.has(e.id)) p.emCampo++
    if (dia(e) > p.ultimaEntrega) p.ultimaEntrega = dia(e)
    m.set(k, p)
  }
  return [...m.values()].sort((a, b) => b.ultimaEntrega.localeCompare(a.ultimaEntrega) || a.colaborador.localeCompare(b.colaborador, 'pt-BR'))
}

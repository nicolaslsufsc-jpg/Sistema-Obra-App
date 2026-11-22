// Botão "Atualizar do Autodoc" (21/11/2026, prioridade 1 do Projetos: "um botão para baixar os projetos e
// montar os dashboards"). O app grava um pedido no servidor (migração 20261121150000_projetos_pedidos_atualizacao.sql);
// o vigia do PC do escritório (fora do repositório, porque entra no Autodoc) pega o pedido a cada 5 min,
// puxa o relatório, publica a lista e baixa as revisões novas, e marca pronto ou erro. Só com conta e
// internet; só gestor pede. A tela acompanha o estado consultando o servidor enquanto o pedido está aberto.
import { cliente } from '../nucleo/servicos'

export type EstadoPedido = 'pendente' | 'buscando' | 'pronto' | 'erro'

export interface Falha {
  codigo: string
  motivo?: string
}

export interface ResumoPedido {
  revisoes_novas?: number
  baixadas?: number
  falharam?: Falha[]
}

export interface PedidoAtualizacao {
  id: string
  estado: EstadoPedido
  criado_em: string
  iniciado_em: string | null
  concluido_em: string | null
  resumo: ResumoPedido | null
  erro: string | null
}

/** De onde vêm os pedidos: o servidor. A bancada troca por um servidor falso (usarServidorDePedidos). */
export interface ServidorDePedidos {
  ultimo(obraId: string): Promise<PedidoAtualizacao | null>
  pedir(obraId: string): Promise<PedidoAtualizacao>
}

const COLUNAS = 'id, estado, criado_em, iniciado_em, concluido_em, resumo, erro'

const servidorDeVerdade: ServidorDePedidos = {
  async ultimo(obraId) {
    const { data, error } = await cliente
      .from('projetos_pedidos_atualizacao')
      .select(COLUNAS)
      .eq('obra_id', obraId)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as PedidoAtualizacao | null) ?? null
  },
  async pedir(obraId) {
    const { data, error } = await cliente.from('projetos_pedidos_atualizacao').insert({ obra_id: obraId }).select(COLUNAS).single()
    if (error) {
      // já há um pedido aberto (índice de "um aberto por obra"): segue acompanhando aquele
      if (error.code === '23505') {
        const aberto = await servidorDeVerdade.ultimo(obraId)
        if (aberto) return aberto
      }
      if (error.code === '42501') throw new Error('Só o gestor da obra pede a atualização do Autodoc.')
      throw new Error(error.message)
    }
    return data as PedidoAtualizacao
  },
}

let servidor: ServidorDePedidos = servidorDeVerdade

/** Só para a bancada e os testes. */
export function usarServidorDePedidos(s: ServidorDePedidos) {
  servidor = s
}

export const ultimoPedido = (obraId: string) => servidor.ultimo(obraId)
export const pedirAtualizacao = (obraId: string) => servidor.pedir(obraId)

/** Pendente há mais que isto: o PC do escritório não respondeu (o vigia roda a cada 5 min). */
export const PC_NAO_RESPONDEU_MS = 15 * 60_000
/** Buscando há mais que isto: o vigia caiu no meio (o servidor marca "interrompido" no próximo pedido). */
export const INTERROMPIDO_MS = 30 * 60_000

const dois = (n: number) => String(n).padStart(2, '0')
const hora = (iso: string | null) => {
  const d = new Date(String(iso ?? ''))
  return Number.isNaN(d.getTime()) ? '' : `${dois(d.getHours())}:${dois(d.getMinutes())}`
}
/** "hoje às 06:16", "ontem às 18:02" ou "em 20/11 às 09:40": um pedido antigo não parece o de agora. */
const quando = (iso: string | null, agora: Date) => {
  const d = new Date(String(iso ?? ''))
  if (Number.isNaN(d.getTime())) return ''
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dias = Math.round((dia(agora) - dia(d)) / 86_400_000)
  const onde = dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : `em ${dois(d.getDate())}/${dois(d.getMonth() + 1)}`
  return `${onde} às ${hora(iso)}`
}
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export interface TextoPedido {
  /** aberto = esperando ou buscando (a tela consulta de novo); parado = o PC não respondeu */
  tipo: 'aberto' | 'pronto' | 'erro' | 'parado'
  texto: string
  falharam: Falha[]
  /** o gestor pode pedir de novo agora */
  podePedir: boolean
}

/** O que a tela mostra sobre o último pedido. Função pura. */
export function textoDoPedido(p: PedidoAtualizacao | null, agora = new Date()): TextoPedido | null {
  if (!p) return null
  const desde = (iso: string | null) => agora.getTime() - new Date(String(iso ?? '')).getTime()
  if (p.estado === 'pendente') {
    if (desde(p.criado_em) > PC_NAO_RESPONDEU_MS)
      return { tipo: 'parado', texto: `O PC do escritório não respondeu (pedido às ${hora(p.criado_em)}). Confira se ele está ligado e com internet; o pedido continua valendo.`, falharam: [], podePedir: false }
    return { tipo: 'aberto', texto: `Pedido às ${hora(p.criado_em)}. Esperando o PC do escritório (ele confere a cada 5 min).`, falharam: [], podePedir: false }
  }
  if (p.estado === 'buscando') {
    if (desde(p.iniciado_em) > INTERROMPIDO_MS)
      return { tipo: 'erro', texto: `Interrompido: o PC começou às ${hora(p.iniciado_em)} e parou no meio. Peça de novo.`, falharam: [], podePedir: true }
    return { tipo: 'aberto', texto: `Buscando no Autodoc desde ${hora(p.iniciado_em)}…`, falharam: [], podePedir: false }
  }
  if (p.estado === 'erro') return { tipo: 'erro', texto: `Não atualizou (${hora(p.concluido_em)}): ${p.erro ?? 'erro sem descrição'}`, falharam: [], podePedir: true }
  const r = p.resumo ?? {}
  const falharam = Array.isArray(r.falharam) ? r.falharam.filter((f) => f && f.codigo) : []
  const partes = [plural(r.revisoes_novas ?? 0, 'revisão nova', 'revisões novas'), plural(r.baixadas ?? 0, 'baixada', 'baixadas')]
  if (falharam.length) partes.push(plural(falharam.length, 'falhou', 'falharam'))
  // Sem revisão nova, o "0 revisões novas, 0 baixadas" parecia que nada tinha rodado (Nicolas, 22/11):
  // a frase diz que o Autodoc foi conferido, quando, e que não há nada a trocar por causa dele.
  if (!(r.revisoes_novas ?? 0) && !(r.baixadas ?? 0) && !falharam.length)
    return { tipo: 'pronto', texto: `Conferido ${quando(p.concluido_em, agora)}: o Autodoc não tem revisão nova. A lista do app está igual à do Autodoc.`, falharam, podePedir: true }
  return { tipo: 'pronto', texto: `Pronto ${quando(p.concluido_em, agora)}: ${partes.join(', ')}.`, falharam, podePedir: true }
}

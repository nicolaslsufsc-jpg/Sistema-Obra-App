import { Selo } from '../../relatorios/telas/comum'
import { dataBR } from '../../relatorios/regras'
import { NOME_DO_STATUS, validadeDe, type Documento, type Status } from '../regras'

const TOM_DO_STATUS = { vigente: 'bom', em_revisao: 'info', obsoleto: 'neutro' } as const

export function SeloStatus({ status }: { status: Status }) {
  return <Selo tom={TOM_DO_STATUS[status]}>{NOME_DO_STATUS[status]}</Selo>
}

/** Documento de exemplo da demonstração: não é da obra. */
export function SeloExemplo() {
  return <span class="rl-selo doc-exemplo">EXEMPLO</span>
}

/** Vencido (vermelho), vence em X dias (amarelo) ou nada. */
export function SeloValidade({ doc, hoje }: { doc: Documento; hoje: string }) {
  const v = validadeDe(doc, hoje)
  if (v.tipo === 'vencido') return <Selo tom="ruim">Vencido</Selo>
  if (v.tipo === 'vence') return <span class="rl-selo doc-vence">{v.dias === 0 ? 'Vence hoje' : `Vence em ${v.dias} ${v.dias === 1 ? 'dia' : 'dias'}`}</span>
  return null
}

export function textoValidade(validade: string | null): string {
  return validade ? dataBR(validade) : 'não vence'
}

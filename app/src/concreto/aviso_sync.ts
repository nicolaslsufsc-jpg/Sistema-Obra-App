// Faixa de sincronização no topo do Concreto.
// No app sem conta (estado.local) não há servidor: nada "espera envio" nem "vai quando a internet
// voltar", então não mostra nada (teste da obra de demonstração, 13/11). Igual à FVS.

export interface EstadoDoEnvio {
  online: boolean
  pendentes: number
  comErro: number
  local?: boolean
}

export function avisoDaSincronizacao(e: EstadoDoEnvio): string {
  if (e.local) return ''
  // recusado pelo servidor vem primeiro: não some sozinho e alguém precisa olhar (lista no menu da obra)
  if (e.comErro > 0) return `${e.comErro} registro(s) recusado(s) pelo servidor. Continuam guardados no aparelho: veja a lista no menu da obra.`
  if (!e.online) return 'Sem internet: tudo fica guardado no aparelho e vai quando a internet voltar.'
  return e.pendentes > 0 ? `${e.pendentes} registro(s) esperando envio.` : ''
}

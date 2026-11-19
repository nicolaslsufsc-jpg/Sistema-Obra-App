// Faixa de envio no topo do Projetos.
// No app sem conta (estado.local) não há servidor: nada "espera envio" nem "vai quando a internet
// voltar", então não mostra nada. Mesmo comportamento da FVS e do Concreto.

export interface EstadoDoEnvio {
  online: boolean
  pendentes: number
  local?: boolean
}

export function avisoDoEnvio(e: EstadoDoEnvio): string {
  if (e.local) return ''
  if (!e.online) return 'Sem internet: tudo fica guardado no aparelho e vai quando a internet voltar.'
  return e.pendentes > 0 ? `${e.pendentes} registro(s) esperando envio.` : ''
}

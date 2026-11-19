// Datas e horas como aparecem nas telas da FVS.

export const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
export const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const ehHoje = (iso: string) => new Date(iso).toDateString() === new Date().toDateString()
/** "às 08:15" se foi hoje; senão, "em 30/09 às 08:15". */
export const quando = (iso: string) => (ehHoje(iso) ? `às ${hora(iso)}` : `em ${dia(iso)} às ${hora(iso)}`)
/** "08/11/2026 às 08:15": com o ano, para aviso de relógio errado (um aparelho em 2099 não pode parecer hoje). */
export const dataHoraCompleta = (iso: string) =>
  `${new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${hora(iso)}`
/** A data de hoje no aparelho, "2026-11-05": para nome de arquivo. toISOString daria a data em UTC, que à noite já é amanhã. */
export function hojeNoAparelho(agora = new Date()): string {
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`
}
export const hojeBr = () => new Date().toLocaleDateString('pt-BR')
export const mb = (bytes: number) => `${(bytes / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`

/**
 * Código de ficha do sistema oficial para ler na tela (o dado não muda). Vem às vezes com um
 * parêntese aberto sem fechar ("EXE-FVS-1(EXE-0001-2026"): mostra as duas partes separadas
 * ("EXE-FVS-1 · EXE-0001-2026"). Código sem isso volta igual.
 */
export function codigoParaLer(codigo: string): string {
  const abre = (codigo.match(/\(/g) ?? []).length
  const fecha = (codigo.match(/\)/g) ?? []).length
  if (abre === 0 || abre === fecha) return codigo
  return codigo.replace(/\s*\(\s*/g, ' · ').replace(/\)/g, '').trim()
}

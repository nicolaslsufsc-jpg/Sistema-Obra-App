import type { PapelNaObra } from '../nucleo/conta'

export const PAPEL: Record<PapelNaObra, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  campo: 'Campo',
  leitura: 'Somente leitura',
}

export function horaCurta(iso: string): string {
  const d = new Date(iso)
  const hoje = new Date()
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === hoje.toDateString()) return `hoje às ${hora}`
  return `${d.toLocaleDateString('pt-BR')} às ${hora}`
}

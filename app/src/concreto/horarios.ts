// Ordem dos horários do caminhão: saída da usina → chegada na obra → início → fim da descarga.
// Fora de ordem vira aviso, não erro: a ficha de papel pode estar certa (caminhão que passa da
// meia-noite, por exemplo) e quem está no campo decide.

export interface HorariosDoCaminhao {
  saida: string
  chegada: string
  inicio: string
  fim: string
}

const PASSOS: { chave: keyof HorariosDoCaminhao; nome: string; de: string }[] = [
  { chave: 'saida', nome: 'saída da usina', de: 'da' },
  { chave: 'chegada', nome: 'chegada na obra', de: 'da' },
  { chave: 'inicio', nome: 'início da descarga', de: 'do' },
  { chave: 'fim', nome: 'fim da descarga', de: 'do' },
]

/** Avisos de horário fora de ordem. Campos vazios são pulados (compara com o anterior preenchido). */
export function avisosDeHorario(h: HorariosDoCaminhao): string[] {
  const avisos: string[] = []
  let anterior: { hora: string; nome: string; de: string } | null = null
  for (const p of PASSOS) {
    const hora = h[p.chave]
    if (!hora) continue
    if (anterior && hora < anterior.hora) avisos.push(`${p.nome[0].toUpperCase()}${p.nome.slice(1)} (${hora}) antes ${anterior.de} ${anterior.nome} (${anterior.hora}). Confira.`)
    anterior = { hora, nome: p.nome, de: p.de }
  }
  return avisos
}

/** Texto para quando a gravação falha: o botão volta a funcionar e a pessoa sabe que não salvou. */
export function mensagemDeFalha(e: unknown): string {
  const motivo = e instanceof Error ? e.message : String(e ?? '')
  return motivo ? `Não salvou: ${motivo}. Confira e tente de novo.` : 'Não salvou. Confira e tente de novo.'
}

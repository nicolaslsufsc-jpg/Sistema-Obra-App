// Horas do servidor vêm como texto ISO com microssegundos, ex.:
//   "2026-11-03T18:26:53.123456+00:00" ou "2026-11-03T15:26:53.123456-03:00"
// Date do JavaScript só guarda milissegundos, então comparar cursores com Date pode
// errar por menos de 1 ms. Aqui a hora vira um inteiro de microssegundos (bigint).

const ISO =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/

/** Microssegundos desde 1970-01-01 UTC. Lança erro se o texto não for uma hora ISO válida. */
export function paraMicros(iso: string): bigint {
  const m = ISO.exec(iso.trim())
  if (!m) throw new Error(`Hora em formato inesperado: ${iso}`)
  const [, ano, mes, dia, hora, minuto, segundo, fracao = '', fuso] = m
  const ms = Date.UTC(+ano, +mes - 1, +dia, +hora, +minuto, +segundo)
  let micros = BigInt(ms) * 1000n + BigInt((fracao + '000000').slice(0, 6))
  if (fuso !== 'Z') {
    const sinal = fuso[0] === '-' ? -1n : 1n
    const [h, min = '0'] = fuso.slice(1).replace(':', '').match(/^(\d{2})(\d{2})?$/)!.slice(1)
    const deslocamento = (BigInt(+h) * 60n + BigInt(+min)) * 60_000_000n
    micros -= sinal * deslocamento
  }
  return micros
}

/** Hora ISO em UTC com 6 casas decimais, ex.: "2026-11-03T18:26:53.123456Z". */
export function deMicros(micros: bigint): string {
  const ms = micros / 1000n
  const resto = micros % 1000n
  const base = new Date(Number(ms)).toISOString() // ...ss.mmmZ
  return `${base.slice(0, 23)}${resto.toString().padStart(3, '0')}Z`
}

/** a > b ? 1 : a < b ? -1 : 0, comparando como hora (fusos diferentes funcionam). */
export function compararHoras(a: string, b: string): number {
  const x = paraMicros(a)
  const y = paraMicros(b)
  return x > y ? 1 : x < y ? -1 : 0
}

/** Hora ISO (UTC) `ms` milissegundos antes da hora dada. */
export function horaMenos(iso: string, ms: number): string {
  return deMicros(paraMicros(iso) - BigInt(ms) * 1000n)
}

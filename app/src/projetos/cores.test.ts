// Tema escuro (14/11/2026): toda cor do módulo passa pelas variáveis de src/tema.css.
// Cor solta (#hex, rgb(), hsl()) no CSS do módulo vira caixa clara no meio da tela escura.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('cores de Projetos', () => {
  it('projetos.css não tem cor solta, só variáveis do tema', () => {
    const css = readFileSync(new URL('./projetos.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const soltas = css.split('\n').flatMap((l, i) => (/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(l) ? [`${i + 1}: ${l.trim()}`] : []))
    expect(soltas).toEqual([])
  })
})

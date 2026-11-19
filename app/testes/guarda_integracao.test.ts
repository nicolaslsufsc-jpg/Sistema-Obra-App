// Guarda do CI: os testes de integração e de tela "pulam" quando não acham o PostgREST (no PC do
// Nicolas, Windows, é o normal). No rodar_integracao.sh isso não pode acontecer em silêncio: o
// script liga SO_EXIGIR_INTEGRACAO=1 e este teste falha se faltar o servidor ou o navegador, em vez
// de deixar o CI verde com tudo pulado.

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

describe.runIf(process.env.SO_EXIGIR_INTEGRACAO === '1')('guarda: integração roda de verdade', () => {
  it('PostgREST de teste no ar', async () => {
    expect(process.env.SO_PGRST_URL, 'SO_PGRST_URL vazio: os testes de integração iam pular').toBeTruthy()
    expect(process.env.SO_JWT_SEGREDO).toBeTruthy()
    const r = await fetch(process.env.SO_PGRST_URL!)
    expect(r.ok).toBe(true)
  })

  it.runIf(process.env.E2E === '1')('com E2E=1, as telas rodam (SO_E2E e Playwright)', () => {
    expect(process.env.SO_E2E, 'SO_E2E vazio: os testes de tela iam pular').toBe('1')
    expect(() => createRequire(import.meta.url)('playwright')).not.toThrow()
  })
})

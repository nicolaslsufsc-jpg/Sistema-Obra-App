import { describe, expect, it } from 'vitest'
import { linkSeguro } from './links'

describe('linkSeguro', () => {
  it('aceita http e https', () => {
    expect(linkSeguro('https://app.autodoc.com.br/pasta/1')).toBe('https://app.autodoc.com.br/pasta/1')
    expect(linkSeguro(' http://exemplo.com ')).toBe('http://exemplo.com/')
  })
  it('recusa javascript:, data: e texto solto', () => {
    expect(linkSeguro('javascript:alert(1)')).toBeNull()
    expect(linkSeguro('  JavaScript:alert(1)')).toBeNull()
    expect(linkSeguro('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(linkSeguro('pasta/sem/protocolo')).toBeNull()
    expect(linkSeguro('')).toBeNull()
    expect(linkSeguro(null)).toBeNull()
  })
})

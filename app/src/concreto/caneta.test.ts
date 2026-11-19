import { describe, expect, it } from 'vitest'
import { rapidoNesteAparelho } from './caneta'

// Tela preta no PC ao desenhar a área (16/11/2026): a tinta de baixa latência perde a
// transparência em algumas placas de vídeo do Windows. Ela fica só no Android.
describe('tinta da caneta', () => {
  it('PC (Windows, Mac, Linux): tinta comum, com transparência', () => {
    expect(rapidoNesteAparelho('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36')).toBe(false)
    expect(rapidoNesteAparelho('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36')).toBe(false)
    expect(rapidoNesteAparelho('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36')).toBe(false)
  })

  it('Android (tablet e celular): tinta de baixa latência', () => {
    expect(rapidoNesteAparelho('Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36')).toBe(true)
  })
})

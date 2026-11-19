import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { digestCompat, instalarCompat, sha1, sha256, sha512, uuidCompat } from './compat'

const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('')

describe('compat sem HTTPS', () => {
  const amostras = ['', 'abc', 'Obra Exemplo · 3º Pavimento', 'x'.repeat(55), 'y'.repeat(56), 'q'.repeat(111), 'q'.repeat(112), 'q'.repeat(128), 'z'.repeat(64), 'w'.repeat(1000)]

  it('SHA-256 e SHA-1 batem com o do Node', () => {
    for (const s of amostras) {
      const b = new TextEncoder().encode(s)
      expect(hex(sha256(b))).toBe(createHash('sha256').update(b).digest('hex'))
      expect(hex(sha1(b))).toBe(createHash('sha1').update(b).digest('hex'))
      expect(hex(sha512(b))).toBe(createHash('sha512').update(b).digest('hex'))
    }
  })

  it('digest aceita nome solto e objeto, e pedaço de buffer', async () => {
    const b = new TextEncoder().encode('__abc__').subarray(2, 5)
    expect(hex(await digestCompat('SHA-256', b))).toBe(createHash('sha256').update('abc').digest('hex'))
    expect(hex(await digestCompat({ name: 'SHA-1' }, b))).toBe(createHash('sha1').update('abc').digest('hex'))
  })

  it('uuid no formato v4 e sem repetir', () => {
    const vistos = new Set<string>()
    for (let i = 0; i < 500; i++) {
      const u = uuidCompat()
      expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      vistos.add(u)
    }
    expect(vistos.size).toBe(500)
  })

  it('só preenche o que falta', () => {
    const falso = { getRandomValues: <T extends ArrayBufferView<ArrayBuffer>>(a: T) => globalThis.crypto.getRandomValues(a) } as unknown as Crypto
    instalarCompat(falso)
    expect(typeof falso.randomUUID).toBe('function')
    expect(typeof falso.subtle.digest).toBe('function')
    const original = globalThis.crypto.randomUUID
    instalarCompat(globalThis.crypto)
    expect(globalThis.crypto.randomUUID).toBe(original)
  })
})

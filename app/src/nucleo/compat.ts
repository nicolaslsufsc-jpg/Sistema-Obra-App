// Abre o app num celular pela rede da obra (http://IP-do-PC:8770), sem HTTPS.
// Fora de conexão segura (HTTPS ou localhost) o navegador esconde crypto.randomUUID e crypto.subtle,
// e o app parava em "Carregando…". Aqui entram substitutos só quando eles faltam: no HTTPS e no
// localhost nada muda. O IndexedDB funciona normal pela rede; só a instalação offline (service worker)
// fica sem, até o app ser aberto por HTTPS.

type Digest = (alg: AlgorithmIdentifier, dados: BufferSource) => Promise<ArrayBuffer>

function bytesDe(d: BufferSource): Uint8Array {
  if (d instanceof ArrayBuffer) return new Uint8Array(d)
  return new Uint8Array(d.buffer, d.byteOffset, d.byteLength)
}

/** Mensagem com o preenchimento do SHA (bit 1, zeros e o tamanho em bits, big-endian, 64 bits). */
function preencher(m: Uint8Array): DataView {
  const tam = Math.ceil((m.length + 9) / 64) * 64
  const b = new Uint8Array(tam)
  b.set(m)
  b[m.length] = 0x80
  const v = new DataView(b.buffer)
  const bits = m.length * 8
  v.setUint32(tam - 8, Math.floor(bits / 0x100000000))
  v.setUint32(tam - 4, bits >>> 0)
  return v
}

const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

export function sha256(m: Uint8Array): Uint8Array {
  const v = preencher(m)
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const w = new Uint32Array(64)
  const rot = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let p = 0; p < v.byteLength; p += 64) {
    for (let i = 0; i < 16; i++) w[i] = v.getUint32(p + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0
      const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0
  }
  const out = new DataView(new ArrayBuffer(32))
  h.forEach((x, i) => out.setUint32(i * 4, x))
  return new Uint8Array(out.buffer)
}

export function sha1(m: Uint8Array): Uint8Array {
  const v = preencher(m)
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]
  const w = new Uint32Array(80)
  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n))
  for (let p = 0; p < v.byteLength; p += 64) {
    for (let i = 0; i < 16; i++) w[i] = v.getUint32(p + i * 4)
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    let [a, b, c, d, e] = h
    for (let i = 0; i < 80; i++) {
      const [f, k] = i < 20 ? [(b & c) | (~b & d), 0x5a827999] : i < 40 ? [b ^ c ^ d, 0x6ed9eba1] : i < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] : [b ^ c ^ d, 0xca62c1d6]
      const t = (rotl(a, 5) + f + e + k + w[i]) >>> 0
      e = d; d = c; c = rotl(b, 30) >>> 0; b = a; a = t
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0; h[4] = (h[4] + e) >>> 0
  }
  const out = new DataView(new ArrayBuffer(20))
  h.forEach((x, i) => out.setUint32(i * 4, x))
  return new Uint8Array(out.buffer)
}


// SHA-512 com BigInt: lento, mas só serve para o teste que o Dexie faz ao abrir (1 byte).
const K512 = [
  '428a2f98d728ae22', '7137449123ef65cd', 'b5c0fbcfec4d3b2f', 'e9b5dba58189dbbc', '3956c25bf348b538', '59f111f1b605d019', '923f82a4af194f9b', 'ab1c5ed5da6d8118',
  'd807aa98a3030242', '12835b0145706fbe', '243185be4ee4b28c', '550c7dc3d5ffb4e2', '72be5d74f27b896f', '80deb1fe3b1696b1', '9bdc06a725c71235', 'c19bf174cf692694',
  'e49b69c19ef14ad2', 'efbe4786384f25e3', '0fc19dc68b8cd5b5', '240ca1cc77ac9c65', '2de92c6f592b0275', '4a7484aa6ea6e483', '5cb0a9dcbd41fbd4', '76f988da831153b5',
  '983e5152ee66dfab', 'a831c66d2db43210', 'b00327c898fb213f', 'bf597fc7beef0ee4', 'c6e00bf33da88fc2', 'd5a79147930aa725', '06ca6351e003826f', '142929670a0e6e70',
  '27b70a8546d22ffc', '2e1b21385c26c926', '4d2c6dfc5ac42aed', '53380d139d95b3df', '650a73548baf63de', '766a0abb3c77b2a8', '81c2c92e47edaee6', '92722c851482353b',
  'a2bfe8a14cf10364', 'a81a664bbc423001', 'c24b8b70d0f89791', 'c76c51a30654be30', 'd192e819d6ef5218', 'd69906245565a910', 'f40e35855771202a', '106aa07032bbd1b8',
  '19a4c116b8d2d0c8', '1e376c085141ab53', '2748774cdf8eeb99', '34b0bcb5e19b48a8', '391c0cb3c5c95a63', '4ed8aa4ae3418acb', '5b9cca4f7763e373', '682e6ff3d6b2b8a3',
  '748f82ee5defb2fc', '78a5636f43172f60', '84c87814a1f0ab72', '8cc702081a6439ec', '90befffa23631e28', 'a4506cebde82bde9', 'bef9a3f7b2c67915', 'c67178f2e372532b',
  'ca273eceea26619c', 'd186b8c721c0c207', 'eada7dd6cde0eb1e', 'f57d4f7fee6ed178', '06f067aa72176fba', '0a637dc5a2c898a6', '113f9804bef90dae', '1b710b35131c471b',
  '28db77f523047d84', '32caab7b40c72493', '3c9ebe0a15c9bebc', '431d67c49c100d4c', '4cc5d4becb3e42b6', '597f299cfc657e2a', '5fcb6fab3ad6faec', '6c44198c4a475817',
].map((h) => BigInt('0x' + h))

export function sha512(m: Uint8Array): Uint8Array {
  const M = (1n << 64n) - 1n
  const tam = Math.ceil((m.length + 17) / 128) * 128
  const b = new Uint8Array(tam)
  b.set(m)
  b[m.length] = 0x80
  const v = new DataView(b.buffer)
  const bits = m.length * 8
  v.setUint32(tam - 8, Math.floor(bits / 0x100000000))
  v.setUint32(tam - 4, bits >>> 0)
  const h = ['6a09e667f3bcc908', 'bb67ae8584caa73b', '3c6ef372fe94f82b', 'a54ff53a5f1d36f1', '510e527fade682d1', '9b05688c2b3e6c1f', '1f83d9abfb41bd6b', '5be0cd19137e2179'].map((x) => BigInt('0x' + x))
  const rot = (x: bigint, n: bigint) => ((x >> n) | (x << (64n - n))) & M
  const w: bigint[] = new Array(80)
  for (let p = 0; p < tam; p += 128) {
    for (let i = 0; i < 16; i++) w[i] = v.getBigUint64(p + i * 8)
    for (let i = 16; i < 80; i++) {
      const s0 = rot(w[i - 15], 1n) ^ rot(w[i - 15], 8n) ^ (w[i - 15] >> 7n)
      const s1 = rot(w[i - 2], 19n) ^ rot(w[i - 2], 61n) ^ (w[i - 2] >> 6n)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) & M
    }
    let [a, bb, c, d, e, f, g, hh] = h
    for (let i = 0; i < 80; i++) {
      const t1 = (hh + (rot(e, 14n) ^ rot(e, 18n) ^ rot(e, 41n)) + ((e & f) ^ (~e & M & g)) + K512[i] + w[i]) & M
      const t2 = ((rot(a, 28n) ^ rot(a, 34n) ^ rot(a, 39n)) + ((a & bb) ^ (a & c) ^ (bb & c))) & M
      hh = g; g = f; f = e; e = (d + t1) & M; d = c; c = bb; bb = a; a = (t1 + t2) & M
    }
    ;[a, bb, c, d, e, f, g, hh].forEach((x, i) => { h[i] = (h[i] + x) & M })
  }
  const out = new DataView(new ArrayBuffer(64))
  h.forEach((x, i) => out.setBigUint64(i * 8, x))
  return new Uint8Array(out.buffer)
}

export const digestCompat: Digest = async (alg, dados) => {
  const nome = (typeof alg === 'string' ? alg : alg.name).toUpperCase().replace('-', '')
  const b = bytesDe(dados)
  const r = nome === 'SHA256' ? sha256(b) : nome === 'SHA1' ? sha1(b) : nome === 'SHA512' ? sha512(b) : null
  if (!r) throw new Error(`Resumo ${nome} indisponível sem HTTPS`)
  return r.buffer.slice(r.byteOffset, r.byteOffset + r.byteLength) as ArrayBuffer
}

export function uuidCompat(): `${string}-${string}-${string}-${string}-${string}` {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`
}

/** Põe os substitutos no lugar do que falta. Chamada uma vez, antes de tudo, em main.tsx. */
export function instalarCompat(c: Crypto | undefined = globalThis.crypto): void {
  if (!c) return
  if (typeof c.randomUUID !== 'function') {
    try { Object.defineProperty(c, 'randomUUID', { value: uuidCompat, configurable: true }) } catch { /* sem como */ }
  }
  if (!c.subtle || typeof c.subtle.digest !== 'function') {
    try { Object.defineProperty(c, 'subtle', { value: { digest: digestCompat }, configurable: true }) } catch { /* sem como */ }
  }
}

instalarCompat()

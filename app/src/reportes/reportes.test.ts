import { describe, expect, it } from 'vitest'
import { limparTexto, navegadorResumido, nomeDoReporte, textoDoReporte, versaoDoApp, type ContextoDoReporte } from './coleta'
import { AnelDeErros } from './erros'
import { crc32, montarZip } from './zip'

describe('dados que vão junto: sem dado pessoal', () => {
  it('tira e-mail, token, chave, id e parâmetro de endereço da mensagem de erro', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJh'
    const t = limparTexto(
      `falhou para ana.silva@exemplo.com com ${jwt} chave sb_secret_abc123XYZ id 0f8c2a1e-1111-4222-8333-944445555666 em https://x.supabase.co/auth/v1/verify?token=999&type=magic`,
    )
    expect(t).not.toMatch(/ana\.silva|eyJ|sb_secret|0f8c2a1e|token=999/)
    expect(t).toContain('https://x.supabase.co/auth/v1/verify?[removido]')
    expect(t).toContain('[id]')
    expect(limparTexto('x'.repeat(1000)).length).toBeLessThanOrEqual(300)
    // mensagem comum fica como está
    expect(limparTexto('TypeError: Cannot read properties of undefined')).toBe('TypeError: Cannot read properties of undefined')
  })

  it('guarda só os últimos 20 erros, já limpos', () => {
    const anel = new AnelDeErros(20)
    for (let i = 1; i <= 25; i++) anel.anotar('console', `erro ${i} de joao@exemplo.com`)
    anel.anotar('promessa', new Error('sem rede'))
    const l = anel.lista()
    expect(l).toHaveLength(20)
    expect(l[0]).toMatch(/erro 7 /)
    expect(l.at(-1)).toMatch(/\[promessa\] Error: sem rede$/)
    expect(l.join(' ')).not.toMatch(/joao@/)
  })

  it('versão do app vem do nome do arquivo do build', () => {
    const doc = { querySelectorAll: () => [{ src: 'http://localhost/assets/index-Bx9_k2Qa.js' }] } as unknown as Document
    expect(versaoDoApp(doc, false)).toBe('index-Bx9_k2Qa')
    expect(versaoDoApp({ querySelectorAll: () => [] } as unknown as Document, false)).toBe('desconhecida')
    expect(versaoDoApp(doc, true)).toBe('desenvolvimento')
  })

  it('navegador resumido, sem o user agent inteiro', () => {
    expect(navegadorResumido('Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36')).toBe('Chrome 131 · Android 13')
    expect(navegadorResumido('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36 OPR/115.0')).toBe('Opera · Windows')
  })

  it('texto do reporte traz o comentário e o que vai junto', () => {
    const contexto: ContextoDoReporte = {
      modulo: 'concreto',
      tela: 'caminhao',
      versao_app: 'index-abc',
      obra_id: 'b0000000-0000-0000-0000-0000000000ee',
      obra_codigo: 'EXE',
      usuario_id: 'u1',
      sem_conta: true,
      tela_px: '375×812',
      navegador: 'Chrome 131 · Android 13',
      instalado: false,
      online: false,
      fila: { pendentes: 3, com_erro: 0, ultima_sincronizacao: null },
      erros: ['10:00:00 [erro] TypeError: x'],
    }
    const t = textoDoReporte({ criado_em: '2026-11-18T12:00:00Z', comentario: 'O mapa ficou preto.', gravidade: 'impede', contexto, imagens: [1] })
    expect(t).toContain('Gravidade: Impede de trabalhar')
    expect(t).toContain('O mapa ficou preto.')
    expect(t).toContain('Módulo / tela: concreto / caminhao')
    expect(t).toContain('Obra: EXE')
    expect(t).toContain('sem conta (só neste aparelho) · sem internet')
    expect(t).toContain('- 10:00:00 [erro] TypeError: x')
    expect(nomeDoReporte({ id: 'abcd1234', criado_em: new Date(2026, 10, 18, 9, 42).toISOString() })).toBe('reporte-2026-11-18-0942-abcd')
  })
})

/** Lê o .zip pelo diretório central, como um descompactador faz. */
function lerZip(z: Uint8Array): { nome: string; dados: Uint8Array }[] {
  const v = new DataView(z.buffer, z.byteOffset, z.byteLength)
  const fim = z.length - 22
  expect(v.getUint32(fim, true)).toBe(0x06054b50)
  const n = v.getUint16(fim + 10, true)
  let p = v.getUint32(fim + 16, true)
  const saida = []
  for (let i = 0; i < n; i++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50)
    const crc = v.getUint32(p + 16, true)
    const tam = v.getUint32(p + 20, true)
    const lenNome = v.getUint16(p + 28, true)
    const local = v.getUint32(p + 42, true)
    const nome = new TextDecoder().decode(z.subarray(p + 46, p + 46 + lenNome))
    expect(v.getUint32(local, true)).toBe(0x04034b50)
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const dados = z.subarray(inicio, inicio + tam)
    expect(crc32(dados)).toBe(crc)
    saida.push({ nome, dados })
    p += 46 + lenNome
  }
  return saida
}

describe('.zip do reporte', () => {
  it('CRC-32 confere com o valor de referência', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('monta um .zip que se lê de volta, com nome acentuado', () => {
    const texto = new TextEncoder().encode('Reporte: não abriu a planta\n')
    const img = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])
    const z = montarZip([
      { nome: 'reporte-x/reporte.txt', dados: texto },
      { nome: 'reporte-x/imagem-1.jpg', dados: img },
    ])
    const l = lerZip(z)
    expect(l.map((a) => a.nome)).toEqual(['reporte-x/reporte.txt', 'reporte-x/imagem-1.jpg'])
    expect(new TextDecoder().decode(l[0].dados)).toBe('Reporte: não abriu a planta\n')
    expect([...l[1].dados]).toEqual([...img])
  })
})

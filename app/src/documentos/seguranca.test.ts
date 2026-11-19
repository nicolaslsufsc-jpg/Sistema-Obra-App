// Ajustes da revisão de segurança do Documentos (Revisor, 09/11/2026).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { lerNomesProibidos, nomesNoTexto } from '../../sem_dados_de_obra'
import { pdfDeExemplo } from './exemplos'
import { ACEITAR_NO_SELETOR, comoAbrir, LIMITE_ARQUIVO, recusaDoArquivo, tipoDoArquivo } from './regras'

const bytes = (t: string) => new TextEncoder().encode(t)

describe('Documentos: arquivos que entram e que abrem', () => {
  it('1. só PDF, JPEG, PNG, WEBP e HEIC entram; SVG (pode ter script) e HTML não', () => {
    for (const t of ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']) expect(recusaDoArquivo(1000, t)).toBeNull()
    for (const t of ['image/svg+xml', 'text/html', 'image/gif', 'application/octet-stream', '']) expect(recusaDoArquivo(1000, t)).toMatch(/Só PDF ou foto/)
    expect(ACEITAR_NO_SELETOR).not.toMatch(/image\/\*/)
    expect(tipoDoArquivo({ type: '', name: 'IMG_0001.HEIC' })).toBe('image/heic')
    expect(tipoDoArquivo({ type: '', name: 'desenho.svg' })).toBe('application/octet-stream')
  })

  it('2. abre pelo que o arquivo É: PDF com %PDF, foto com assinatura; o resto só baixa', () => {
    expect(comoAbrir(pdfDeExemplo(['x']).slice(0, 16))).toMatchObject({ abrir: true, tipo: 'application/pdf' })
    expect(comoAbrir(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toMatchObject({ abrir: true, tipo: 'image/jpeg', foto: true })
    expect(comoAbrir(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toMatchObject({ abrir: true, tipo: 'image/png' })
    expect(comoAbrir(bytes('RIFF\0\0\0\0WEBPVP8 '))).toMatchObject({ abrir: true, tipo: 'image/webp' })
    expect(comoAbrir(bytes('\0\0\0\x18ftypheic'))).toMatchObject({ abrir: true, tipo: 'image/heic' })
    // um .obra restaurado com registro "application/pdf" mas HTML ou SVG dentro: nunca abre numa aba
    for (const t of ['<html><script>alert(1)</script>', '<svg onload="alert(1)">', '<?xml version="1.0"?><svg/>', ' %PDF', '']) {
      expect(comoAbrir(bytes(t))).toEqual({ abrir: false, tipo: 'application/octet-stream', foto: false })
    }
  })

  it('3. o limite de 10 MB vale também para foto (antes de reduzir)', () => {
    expect(recusaDoArquivo(LIMITE_ARQUIVO, 'image/jpeg')).toBeNull()
    expect(recusaDoArquivo(LIMITE_ARQUIVO + 1, 'image/jpeg')).toMatch(/limite é 10 MB/)
    expect(recusaDoArquivo(LIMITE_ARQUIVO + 1, 'image/heic')).toMatch(/limite é 10 MB/)
    // a tela passa o tamanho de verdade (antes, foto ia como 0)
    const tela = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'telas', 'TelaFormulario.tsx'), 'utf-8')
    expect(tela).toContain('recusaDoArquivo(f.size, tipoDoArquivo(f))')
  })

  it('4. os textos do módulo não têm nome da lista de nomes proibidos (nem nome de branch com ele)', () => {
    const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
    // a mesma conferência da trava do build (siglas só como palavra inteira)
    const doc = readFileSync(path.join(raiz, 'docs', 'modulos', '4_documentos.md'), 'utf-8')
    expect(doc).toContain('PR #42')
    // só conta (não mostra o nome achado)
    expect(nomesNoTexto(doc, lerNomesProibidos(raiz)).length).toBe(0)
  })
})

describe('Documentos e Diário: nome e foto anexada (Professor, 12/11/2026)', () => {
  it('5. nome do arquivo sai limpo: sem pasta, sem controle, sem inverter o texto, até 120 caracteres', async () => {
    const { nomeLimpo } = await import('./regras')
    expect(nomeLimpo('C:\\fotos\\..\\laudo.pdf')).toBe('laudo.pdf')
    expect(nomeLimpo('../../etc/passwd')).toBe('passwd')
    expect(nomeLimpo('fatura\u202Efdp.exe')).toBe('faturafdp.exe')
    expect(nomeLimpo('a<b>:c"d|e?f*.pdf')).toBe('a_b__c_d_e_f_.pdf')
    expect(nomeLimpo('linha\nnova\t.pdf')).toBe('linhanova.pdf')
    expect(nomeLimpo('   ...   ')).toBe('arquivo')
    expect(nomeLimpo('')).toBe('arquivo')
    const longo = nomeLimpo('x'.repeat(300) + '.pdf')
    expect(longo).toHaveLength(120)
    expect(longo.endsWith('.pdf')).toBe(true)
  })

  it('6. foto do Diário: só JPG, PNG, WEBP ou HEIC, até 20 MB (SVG e vazio não)', async () => {
    const { recusaDaFoto, tipoDaFoto, LIMITE_FOTO } = await import('../relatorios/regras')
    expect(recusaDaFoto(5_000_000, 'image/jpeg')).toBeNull()
    expect(recusaDaFoto(LIMITE_FOTO, 'image/png')).toBeNull()
    expect(recusaDaFoto(LIMITE_FOTO + 1, 'image/jpeg')).toMatch(/limite é 20 MB/)
    expect(recusaDaFoto(0, 'image/jpeg')).toMatch(/vazia/)
    for (const t of ['image/svg+xml', 'image/gif', 'text/html', 'application/octet-stream']) expect(recusaDaFoto(1000, t)).toMatch(/Só foto/)
    expect(tipoDaFoto({ type: '', name: 'IMG_1.HEIC' })).toBe('image/heic')
    expect(tipoDaFoto({ type: '', name: 'x.svg' })).toBe('application/octet-stream')
    // quem grava confere (não só a tela)
    const dados = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'relatorios', 'dados.ts'), 'utf-8')
    expect(dados).toContain('recusaDaFoto(arquivo.size, tipo)')
    const docs = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'dados.ts'), 'utf-8')
    expect(docs).toContain('recusaDoArquivo(arquivo.size, tipoDoArquivo(arquivo))')
  })
})

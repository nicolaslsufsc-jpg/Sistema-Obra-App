import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { conferirArquivo, conferirPagina, conferirPaginas, mensagemDoPdf, OPCOES_PDF, PDF_MAXIMO_BYTES, PLANTA_EM_BRANCO } from './limites'
import { gerarObraExemplo2, pdfComImagemGigante, pdfMuitasPaginas, pdfPaginaGigante } from '../../testes/obra_exemplo2'

async function abrir(pdf: Uint8Array) {
  const tarefa = pdfjs.getDocument({ data: pdf.slice(), ...OPCOES_PDF, verbosity: 0 })
  return { tarefa, doc: await tarefa.promise }
}

describe('limites do PDF (Nova obra)', () => {
  it('não usa eval: opção desligada, pdf.js sem eval e CSP sem unsafe-eval', () => {
    expect(OPCOES_PDF.isEvalSupported).toBe(false)
    for (const f of ['pdf.mjs', 'pdf.worker.mjs', 'pdf.worker.min.mjs']) {
      const js = readFileSync(`node_modules/pdfjs-dist/legacy/build/${f}`, 'utf8')
      expect(js, f).not.toMatch(/\beval\(|new Function\(/)
    }
    const csp = readFileSync('vite.config.ts', 'utf8')
    expect(csp).toMatch(/script-src 'self'/)
    expect(csp).not.toMatch(/'unsafe-eval'/)
  })

  it('imagem gigante dentro do PDF: o pdf.js pula a imagem (não trava) e a planta em branco tem aviso claro', async () => {
    const { tarefa, doc } = await abrir(pdfComImagemGigante())
    const ops = await (await doc.getPage(1)).getOperatorList()
    await tarefa.destroy()
    expect(ops.fnArray).not.toContain(pdfjs.OPS.paintImageXObject)
    // controle: a prancha escaneada pequena da Obra Exemplo 2 tem a imagem
    const escaneada = gerarObraExemplo2().find((p) => p.variante === 'escaneada')!
    const b = await abrir(escaneada.pdf)
    const opsB = await (await b.doc.getPage(1)).getOperatorList()
    await b.tarefa.destroy()
    expect(opsB.fnArray).toContain(pdfjs.OPS.paintImageXObject)
    expect(PLANTA_EM_BRANCO).toMatch(/^A planta saiu em branco\. .*50 milhões de pixels/)
    expect(mensagemDoPdf(new Error('Image exceeded maximum allowed size and was removed.'))).toMatch(/imagem grande demais/)
  })

  it('página gigante: recusa com a medida em metros; A0 passa', async () => {
    const { tarefa, doc } = await abrir(pdfPaginaGigante())
    const v = (await doc.getPage(1)).getViewport({ scale: 1 })
    await tarefa.destroy()
    expect(conferirPagina(v.width, v.height)).toMatch(/4,94 m x 4,94 m, maior do que o app consegue desenhar/)
    expect(conferirPagina(2384, 3370)).toBeNull() // A0
    expect(conferirPagina(20000, 100)).toMatch(/maior/) // lado comprido demais
  })

  it('arquivo acima de 200 MB não abre', () => {
    expect(conferirArquivo('x.pdf', PDF_MAXIMO_BYTES)).toBeNull()
    expect(conferirArquivo('x.pdf', 250 * 1024 * 1024)).toMatch(/^x\.pdf tem 250 MB, e o app abre PDF de até 200 MB/)
  })

  it('outros erros do pdf.js em português', () => {
    expect(mensagemDoPdf(Object.assign(new Error('No password given'), { name: 'PasswordException' }))).toMatch(/tem senha/)
    expect(mensagemDoPdf(Object.assign(new Error('Invalid PDF structure.'), { name: 'InvalidPDFException' }))).toMatch(/não é um PDF válido/)
    expect(mensagemDoPdf(new Error('outro'))).toBe('outro')
  })

  it('muitas páginas: até 20 passa; 25 é recusado com mensagem', async () => {
    const { tarefa, doc } = await abrir(pdfMuitasPaginas(25))
    const n = doc.numPages
    await tarefa.destroy()
    expect(n).toBe(25)
    expect(conferirPaginas(n)).toMatch(/^O PDF tem 25 páginas, e o app aceita até 20/)
    expect(conferirPaginas(20)).toBeNull()
    expect(conferirPaginas(1)).toBeNull()
    expect(conferirPaginas(0)).toMatch(/nenhuma página/)
  })

  it('PDF malformado: erro claro em português, sem travar', async () => {
    const lixo = new TextEncoder().encode('isto não é um PDF '.repeat(100))
    const erro = await pdfjs.getDocument({ data: lixo, ...OPCOES_PDF, verbosity: 0 }).promise.then(
      () => null,
      (e: unknown) => e,
    )
    expect(mensagemDoPdf(erro)).toBe('O arquivo não é um PDF válido (pode estar corrompido ou incompleto).')
  })

  it('texto do PDF nunca vira HTML: nada de innerHTML, e o Leaflet recebe elemento, não string', () => {
    const pasta = 'src/nova_obra/'
    for (const f of readdirSync(pasta).filter((x) => /\.tsx?$/.test(x) && !x.endsWith('.test.ts'))) {
      const js = readFileSync(pasta + f, 'utf8')
      expect(js, f).not.toMatch(/innerHTML|outerHTML|dangerouslySetInnerHTML|insertAdjacentHTML|document\.write/)
      for (const m of js.matchAll(/\.(bindTooltip|bindPopup|setTooltipContent|setPopupContent)\(([^,)]*)/g)) expect(m[2], `${f}: ${m[0]}`).toMatch(/^textoSeguro\(/)
    }
  })

})

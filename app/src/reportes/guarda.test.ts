import { afterEach, describe, expect, it } from 'vitest'
import type { ContextoDoReporte, Reporte } from './coleta'
import { _limparBancoDeReportes, apagarReporte, arquivosDoReporte, guardarReporte, listarReportes, MAX_REPORTES } from './guarda'
import { recusaDaImagem, tamanhoReduzido } from './imagem'

const contexto: ContextoDoReporte = {
  modulo: 'concreto', tela: 'inicio', versao_app: 'dev', obra_id: 'o', obra_codigo: 'EXE', usuario_id: 'u', sem_conta: true,
  tela_px: '375×812', navegador: 'Chrome', instalado: false, online: true, fila: { pendentes: 0, com_erro: 0, ultima_sincronizacao: null }, erros: [],
}
const rep = (i: number, imagens: Blob[] = []): Reporte => ({
  id: `id-${String(i).padStart(3, '0')}`,
  criado_em: new Date(2026, 10, 18, 8, i).toISOString(),
  comentario: `problema ${i}`,
  gravidade: 'atrapalha',
  contexto,
  imagens,
})

afterEach(() => _limparBancoDeReportes())

describe('reportes no aparelho', () => {
  it('guarda, lista do mais novo para o mais antigo e apaga', async () => {
    await guardarReporte(rep(1))
    await guardarReporte(rep(2))
    expect((await listarReportes()).map((r) => r.comentario)).toEqual(['problema 2', 'problema 1'])
    await apagarReporte('id-001')
    expect((await listarReportes()).map((r) => r.id)).toEqual(['id-002'])
  })

  it(`passa de ${MAX_REPORTES}: o mais antigo sai`, async () => {
    for (let i = 1; i <= MAX_REPORTES + 2; i++) await guardarReporte(rep(i))
    const l = await listarReportes()
    expect(l).toHaveLength(MAX_REPORTES)
    expect(l.at(-1)!.id).toBe('id-003')
  })

  it('mais de 3 imagens é recusado', async () => {
    const b = new Blob([new Uint8Array([1])])
    await expect(guardarReporte(rep(1, [b, b, b, b]))).rejects.toThrow(/3 imagens/)
  })

  it('arquivos do .zip: texto, json e imagens na pasta do reporte', async () => {
    const r = rep(5, [new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' })])
    const a = await arquivosDoReporte(r)
    expect(a.map((x) => x.nome.replace(/^reporte-[^/]+\//, ''))).toEqual(['reporte.txt', 'reporte.json', 'imagem-1.jpg'])
    expect(JSON.parse(new TextDecoder().decode(a[1].dados)).comentario).toBe('problema 5')
  })
})

describe('imagem do reporte', () => {
  it('só imagem, até 10 MB, sem SVG', () => {
    expect(recusaDaImagem({ size: 1000, type: 'image/png' })).toBeNull()
    expect(recusaDaImagem({ size: 1000, type: 'application/pdf' })).toMatch(/imagem/)
    expect(recusaDaImagem({ size: 1000, type: 'image/svg+xml' })).toMatch(/imagem/)
    expect(recusaDaImagem({ size: 11 * 1024 * 1024, type: 'image/jpeg' })).toMatch(/10 MB/)
  })
  it('reduz pelo lado maior, mantendo a proporção', () => {
    expect(tamanhoReduzido(1080, 2400)).toEqual([720, 1600])
    expect(tamanhoReduzido(800, 600)).toEqual([800, 600])
  })
})

// IFCs da obra: partes no servidor, juntar e conferir ao baixar. Obra fictícia, amostra escrita à mão.
import { describe, expect, it } from 'vitest'
import { IfcsDaObra, juntarIfc, lerNomeDaParte, montarLista, nomeDaParte, partirIfc, type FonteIfcs, type LinhaArquivo } from '../src/ifc/obra'
import { idDoArquivo } from '../src/ifc/motor/guardados'
import { sha256Hex } from '../src/fvs/pacote'
import type { Sessao } from '../src/ifc/sessao'
import { amostraIfc } from './ifc/amostra'

const OBRA = '00000000-0000-4000-8000-0000000000e1'
const linha = (id: string, nome: string, criado: string, extra: Partial<LinhaArquivo> = {}): LinhaArquivo => ({
  id,
  caminho: `${OBRA}/ifc/${id}`,
  nome_original: nome,
  hash: 'h',
  tamanho: 10,
  criado_em_servidor: criado,
  ...extra,
})

describe('nome das partes', () => {
  it('ida e volta, e recusa o que não é parte', () => {
    const n = nomeDaParte('Torre (rev 3).ifc', 2, 3, 'a1b2c3d4')
    expect(n).toBe('Torre (rev 3).ifc (parte 2 de 3, envio a1b2c3d4)')
    expect(lerNomeDaParte(n)).toEqual({ nome: 'Torre (rev 3).ifc', numero: 2, total: 3, envio: 'a1b2c3d4' })
    expect(lerNomeDaParte('foto.jpg')).toBeNull()
    expect(lerNomeDaParte('X.ifc (parte 4 de 3, envio a1b2c3d4)')).toBeNull()
    expect(lerNomeDaParte('X.ifc (parte 1 de 11, envio a1b2c3d4)')).toBeNull()
  })
})

describe('lista da obra', () => {
  it('junta as partes pelo envio, mostra o completo mais novo e o que ainda está subindo', () => {
    const linhas = [
      linha('1', nomeDaParte('A.ifc', 1, 2, 'aaaaaaaa'), '2026-11-20T10:00:00Z'),
      linha('2', nomeDaParte('A.ifc', 2, 2, 'aaaaaaaa'), '2026-11-20T10:00:01Z'),
      linha('3', nomeDaParte('A.ifc', 1, 1, 'bbbbbbbb'), '2026-11-19T10:00:00Z'), // envio velho: some
      linha('4', nomeDaParte('A.ifc', 1, 2, 'cccccccc'), '2026-11-21T10:00:00Z'), // novo, metade subiu
      linha('5', nomeDaParte('B.ifc', 1, 1, 'dddddddd'), '2026-11-20T10:00:00Z'),
      linha('6', nomeDaParte('B.ifc', 1, 1, 'dddddddd'), '2026-11-20T10:00:00Z'), // repetida
      linha('7', 'foto.jpg', '2026-11-20T10:00:00Z'),
      linha('8', nomeDaParte('C.ifc', 1, 1, 'eeeeeeee'), '2026-11-20T10:00:00Z', { caminho: `${OBRA}/fvs/8` }), // outro módulo
      linha('9', nomeDaParte('D.ifc', 1, 1, 'ffffffff'), '2026-11-20T10:00:00Z', { caminho: `outra-obra/ifc/9` }),
    ]
    const l = montarLista(linhas, OBRA)
    expect(l.map((i) => [i.nome, i.envio, i.completo, i.partes.map((p) => p.numero)])).toEqual([
      ['A.ifc', 'cccccccc', false, [1]],
      ['A.ifc', 'aaaaaaaa', true, [1, 2]],
      ['B.ifc', 'dddddddd', true, [1]],
    ])
    expect(l[1].tamanho).toBe(20)
  })
})

describe('partir e juntar', () => {
  it('o IFC volta igual, mesmo cortado em pedaços', async () => {
    const texto = amostraIfc()
    const [gz] = await partirIfc(new Blob([texto]))
    expect(gz.size).toBeLessThan(texto.length)
    const pedacos = [gz.slice(0, 100), gz.slice(100, 333), gz.slice(333)]
    expect(await (await juntarIfc(pedacos)).text()).toBe(texto)
  })
})

/** Sessão de mentira: guarda o que abrir. */
function sessaoFalsa() {
  const s = {
    guardados: [] as { id: string }[],
    modelos: [] as { id: string; chave: number }[],
    avisos: [] as string[],
    abertos: [] as File[],
    async abrirArquivos(arquivos: File[]) {
      for (const a of arquivos) {
        s.abertos.push(a)
        s.guardados.push({ id: idDoArquivo(a) })
      }
    },
    avisarUsuario(t: string) {
      s.avisos.push(t)
    },
    async abrirDoAparelho() {},
    async apagarDoAparelho(id: string) {
      s.guardados = s.guardados.filter((g) => g.id !== id)
    },
    fechar() {},
  }
  return s
}

async function fonteCom(partes: Blob[], estragar = false): Promise<FonteIfcs> {
  const linhas: LinhaArquivo[] = []
  for (let i = 0; i < partes.length; i++) {
    const hash = await sha256Hex(await partes[i].arrayBuffer())
    linhas.push(linha(`p${i}`, nomeDaParte('EXE.ifc', i + 1, partes.length, '0a0b0c0d'), '2026-11-20T12:00:00Z', { hash, tamanho: partes[i].size }))
  }
  return {
    listar: async () => linhas,
    async bytesDaParte(p, aoBytes) {
      const b = partes[p.numero - 1]
      aoBytes(b.size)
      return estragar && p.numero === 2 ? new Blob([new Uint8Array(b.size)]) : b
    },
    enviarParte: async () => {},
  }
}

describe('baixar para usar sem internet', () => {
  it('confere, junta, abre no leitor e lembra o modelo guardado; apagar esquece', async () => {
    const texto = amostraIfc()
    const [gz] = await partirIfc(new Blob([texto]))
    const s = sessaoFalsa()
    const l = new IfcsDaObra(await fonteCom([gz.slice(0, 200), gz.slice(200)]), OBRA, s as unknown as Sessao)
    await l.atualizar()
    expect(l.itens).toHaveLength(1)
    const fracoes: number[] = []
    l.assinar(() => {
      const b = l.baixando.get('0a0b0c0d')
      if (b) fracoes.push(b.fracao)
    })
    await l.baixar(l.itens[0])
    expect(s.avisos).toEqual([])
    expect(s.abertos).toHaveLength(1)
    expect(s.abertos[0].name).toBe('EXE.ifc')
    expect(await s.abertos[0].text()).toBe(texto)
    expect(fracoes.length).toBeGreaterThan(2)
    expect(l.guardadoDe(l.itens[0])).toBe(idDoArquivo(s.abertos[0]))
    expect(l.baixando.size).toBe(0)

    await l.apagar(l.itens[0])
    expect(l.guardadoDe(l.itens[0])).toBeNull()
    expect(s.guardados).toHaveLength(0)
  })

  it('parte que não confere: não abre e avisa', async () => {
    const [gz] = await partirIfc(new Blob([amostraIfc()]))
    const s = sessaoFalsa()
    const l = new IfcsDaObra(await fonteCom([gz.slice(0, 200), gz.slice(200)], true), OBRA, s as unknown as Sessao)
    await l.atualizar()
    await l.baixar(l.itens[0])
    expect(s.abertos).toHaveLength(0)
    expect(s.avisos[0]).toContain('parte 2')
    expect(l.guardadoDe(l.itens[0])).toBeNull()
  })

  it('enviar: só .ifc, e as partes saem com o nome do envio', async () => {
    const enviados: { nome: string; tamanho: number }[] = []
    const fonte: FonteIfcs = { listar: async () => [], bytesDaParte: async () => new Blob(), enviarParte: async (b, nome) => void enviados.push({ nome, tamanho: b.size }) }
    const s = sessaoFalsa()
    const l = new IfcsDaObra(fonte, OBRA, s as unknown as Sessao)
    expect(await l.enviar(new File(['x'], 'planta.pdf'))).toBe(false)
    expect(await l.enviar(new File([amostraIfc()], 'EXE_amostra.ifc'))).toBe(true)
    expect(enviados).toHaveLength(1)
    expect(lerNomeDaParte(enviados[0].nome)).toMatchObject({ nome: 'EXE_amostra.ifc', numero: 1, total: 1 })
  })
})

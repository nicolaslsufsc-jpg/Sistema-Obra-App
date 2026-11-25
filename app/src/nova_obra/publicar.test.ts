import { describe, expect, it } from 'vitest'
import { fichaVazia, problemas, type EstadoPublicacao, type RascunhoObra } from './modelo'
import { planoDePublicacao, publicarObra, type Servidor } from './publicar'
import type { PlantaRascunho } from './planta'
import type { TilesGuardados } from './guardados'

const OBRA_ID = 'b1000000-0000-0000-0000-000000000001'
const ADMIN = { id: 'u1000000-0000-0000-0000-000000000001', email: 'admin@exemplo.com' }

const planta: PlantaRascunho = {
  id: 'a2000000-0000-0000-0000-0000000000e2',
  pavimento: 'Térreo',
  trecho: 'Planta inteira',
  prancha: 'EXE-FORMA-TERREO-R00',
  revisao: 'R00',
  arquivo: 'EXE-FORMA-TERREO-R00.pdf',
  pagina: { largura: 2384, altura: 1684 },
  janela: [100, 50, 1100, 650],
  escala: 75,
  semTexto: false,
  pecas: [
    { tipo: 'P', nome: 'P-01', secao: '20x50', rotulo: [10, 10, 40, 20], polys: [] },
    { tipo: 'V', nome: 'VT-01', secao: '15x40', rotulo: [50, 10, 90, 20], polys: [[[50, 30], [90, 30], [90, 35], [50, 35]]] },
  ],
  gerada: { janela: [100, 50, 1100, 650], tiles: 1, bytes: 4, segundos: 1 },
}

const rascunho = (parcial: Partial<RascunhoObra> = {}): RascunhoObra => ({
  codigo: 'EXE-NO1',
  nome: 'Obra Exemplo Nova',
  empresa: 'Construtora Exemplo',
  pavimentos: ['Térreo', 'Tipo 1'],
  fichas: [{ ...fichaVazia(), codigo: 'EXE-PVS-01', titulo: 'Pilares', itens: [{ etapa: 'Fôrma', titulo: 'Prumo', descricao: '', dispositivo: '', tolerancia: '' }] }],
  plantas: [planta],
  pessoas: [
    { nome: 'Maria Exemplo', email: 'maria@exemplo.com', papel: 'gestor' },
    { nome: 'João Exemplo', email: '', papel: 'campo' },
  ],
  ...parcial,
})

const lerTiles = async (id: string): Promise<TilesGuardados> => ({ id, janela: [100, 50, 1100, 650], niveis: [0], largura: 1000, altura: 600, tiles: [['0/0/0', new Blob(['webp'])]] })

/** Servidor de mentira: guarda o que recebeu. `envios` diz o que cada chamada de enviar devolve. */
function servidorFalso(o: { admin?: boolean | string; usuario?: typeof ADMIN | null; existente?: { id: string } | null; envios?: Array<{ pendentes: number; comErro: number; parouPor?: string }>; recusar?: string[] } = {}) {
  const chamadas = { criarObra: [] as unknown[], registrar: [] as Array<{ tabela: string; campos: Record<string, unknown> }>, arquivos: [] as string[], enviar: 0, convidar: [] as unknown[][] }
  let n = 0
  const envios = [...(o.envios ?? [])]
  const s: Servidor = {
    usuario: async () => (o.usuario === undefined ? ADMIN : o.usuario),
    ehAdmin: async () => o.admin ?? true,
    obraPorCodigo: async () => o.existente ?? null,
    criarObra: async (obra) => {
      chamadas.criarObra.push(obra)
      return null
    },
    registrar: async (tabela, obraId, _u, campos) => {
      expect(obraId).toBe(OBRA_ID)
      chamadas.registrar.push({ tabela, campos })
      return { id: String(campos.id) }
    },
    registrarArquivo: async (_o, _u, modulo, _c, nome) => {
      expect(modulo).toBe('fvs')
      chamadas.arquivos.push(nome)
      return { id: `arq-${++n}` }
    },
    enviar: async () => {
      chamadas.enviar++
      return envios.shift() ?? { pendentes: 0, comErro: 0 }
    },
    convidar: async (obraId, nome, papel, email) => {
      chamadas.convidar.push([obraId, nome, papel, email])
      return o.recusar?.includes(nome) ? 'e-mail inválido' : null
    },
  }
  return { s, chamadas }
}

async function publicar(r: RascunhoObra, s: Servidor) {
  const estados: EstadoPublicacao[] = []
  const res = await publicarObra(r, s, lerTiles, (e) => estados.push(e), undefined, () => OBRA_ID)
  return { res, estados }
}

describe('Nova obra: publicar no servidor', () => {
  it('as linhas saem na ordem do servidor, sem as colunas do núcleo, e os arquivos da planta junto', async () => {
    const plano = await planoDePublicacao(rascunho(), OBRA_ID, lerTiles)
    expect(plano.obra).toEqual({ id: OBRA_ID, codigo: 'EXE-NO1', nome: 'Obra Exemplo Nova', empresa: 'Construtora Exemplo' })
    const tabelas = plano.registros.map((r) => (r.tipo === 'arquivo' ? `arquivo:${r.nome}` : r.tabela))
    expect(tabelas.indexOf('pavimentos')).toBeLessThan(tabelas.indexOf('elementos'))
    expect(tabelas.indexOf('arquivo:manifest.json')).toBeLessThan(tabelas.indexOf('plantas'))
    expect(tabelas.indexOf('arquivo:pacote.bin')).toBeLessThan(tabelas.indexOf('plantas'))
    expect(tabelas.filter((t) => t === 'pavimentos')).toHaveLength(2)
    expect(tabelas.filter((t) => t === 'elementos')).toHaveLength(2)
    expect(tabelas).toContain('fichas_modelo')
    for (const r of plano.registros) if (r.tipo === 'linha') for (const c of ['obra_id', 'usuario_id', 'dispositivo_id', 'criado_em_dispositivo', 'apagado']) expect(r.campos).not.toHaveProperty(c)
    const pl = plano.registros.find((r) => r.tipo === 'linha' && r.tabela === 'plantas')!
    const chaves = plano.registros.flatMap((r) => (r.tipo === 'arquivo' ? [r.chave] : []))
    expect(pl.tipo === 'linha' && chaves).toEqual(expect.arrayContaining([pl.tipo === 'linha' && pl.campos.manifest_id, pl.tipo === 'linha' && pl.campos.pacote_id]))
  })

  it('cria a obra, manda tudo pela fila e dá acesso às pessoas', async () => {
    const { s, chamadas } = servidorFalso()
    const { res, estados } = await publicar(rascunho(), s)
    expect(res).toMatchObject({ ok: true, avisos: [] })
    expect(chamadas.criarObra).toHaveLength(1)
    expect(chamadas.arquivos).toEqual(['manifest.json', 'pacote.bin'])
    // a planta aponta para os arquivos com o id que o servidor deu
    const pl = chamadas.registrar.find((r) => r.tabela === 'plantas')!
    expect([pl.campos.manifest_id, pl.campos.pacote_id].sort()).toEqual(['arq-1', 'arq-2'])
    expect(chamadas.convidar).toEqual([
      [OBRA_ID, 'Maria Exemplo', 'gestor', 'maria@exemplo.com'],
      [OBRA_ID, 'João Exemplo', 'campo', null],
    ])
    expect(estados.at(-1)).toMatchObject({ obraId: OBRA_ID, codigo: 'EXE-NO1', naFila: true, enviada: true, convidadas: [0, 1] })
  })

  it('sem login, sem ser administrador ou com o código já usado: não cria nada', async () => {
    for (const [o, erro] of [
      [{ usuario: null }, /Entre no app/],
      [{ admin: false }, /não é de administrador/],
      [{ existente: { id: 'outra-obra' } }, /Já existe no servidor uma obra com o código EXE-NO1/],
    ] as const) {
      const { s, chamadas } = servidorFalso(o)
      const { res } = await publicar(rascunho(), s)
      expect(res.ok).toBe(false)
      expect(!res.ok && res.erro).toMatch(erro)
      expect(chamadas.criarObra).toHaveLength(0)
      expect(chamadas.registrar).toHaveLength(0)
    }
  })

  it('se a internet cai no envio, "Publicar" de novo continua sem criar outra obra nem repetir linhas', async () => {
    const primeiro = servidorFalso({ envios: [{ pendentes: 5, comErro: 0, parouPor: 'sem internet' }] })
    const a = await publicar(rascunho(), primeiro.s)
    expect(a.res.ok).toBe(false)
    expect(!a.res.ok && a.res.erro).toMatch(/Toque em "Publicar" de novo/)
    const estado = a.estados.at(-1)!
    expect(estado).toMatchObject({ naFila: true, enviada: false, convidadas: [] })

    const segundo = servidorFalso({ existente: { id: OBRA_ID } })
    const b = await publicar(rascunho({ publicacao: estado }), segundo.s)
    expect(b.res.ok).toBe(true)
    expect(segundo.chamadas.criarObra).toHaveLength(0)
    expect(segundo.chamadas.registrar).toHaveLength(0)
    expect(segundo.chamadas.enviar).toBe(1)
    expect(segundo.chamadas.convidar).toHaveLength(2)
  })

  it('convite recusado vira aviso; depois só ele é tentado de novo', async () => {
    const um = servidorFalso({ recusar: ['João Exemplo'] })
    const a = await publicar(rascunho(), um.s)
    expect(a.res).toMatchObject({ ok: true, avisos: ['João Exemplo: e-mail inválido'] })
    const estado = a.estados.at(-1)!
    expect(estado.convidadas).toEqual([0])

    const dois = servidorFalso({ existente: { id: OBRA_ID } })
    await publicar(rascunho({ publicacao: estado }), dois.s)
    expect(dois.chamadas.enviar).toBe(0)
    expect(dois.chamadas.convidar).toEqual([[OBRA_ID, 'João Exemplo', 'campo', null]])
  })

  it('pessoas: nome, e-mail e papel conferidos antes de publicar', () => {
    expect(problemas(rascunho())).toEqual([])
    const p = problemas(
      rascunho({
        pessoas: [
          { nome: '', email: 'x@exemplo.com', papel: 'campo' },
          { nome: 'Ana', email: 'ana@', papel: 'campo' },
          { nome: 'Bia', email: 'X@exemplo.com', papel: 'leitura' },
          { nome: 'Caio', email: '', papel: 'chefe' as 'campo' },
        ],
      }),
    ).join('\n')
    expect(p).toMatch(/Pessoa 1: falta o nome/)
    expect(p).toMatch(/Ana: e-mail inválido/)
    expect(p).toMatch(/Bia: e-mail repetido/)
    expect(p).toMatch(/Caio: escolha o papel/)
  })
})

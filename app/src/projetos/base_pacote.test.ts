// A base que vem no pacote da obra entra sozinha só quando o aparelho ainda não tem base desta obra.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { banco } from '../nucleo/servicos'
import { baseDoPacote, importarBase, lerBase, lerBaseOuDoPacote } from './base'
import { DISTRIBUICAO_EXE, VIGENTES_EXE } from './exemplo_exe'

const OBRA = 'c0000000-0000-0000-0000-0000000000c1'
const SEM_PACOTE = 'c0000000-0000-0000-0000-0000000000c2'
const RAIZ = 'http://localhost:8770/dados_obra/'
const buscar = (async (url: string) => {
  if (url === RAIZ + 'projetos/vigentes.csv') return new Response(VIGENTES_EXE)
  if (url === RAIZ + 'projetos/distribuicao.csv') return new Response(DISTRIBUICAO_EXE)
  return new Response('', { status: 404 })
}) as unknown as typeof fetch

describe('base do Projetos dentro do pacote da obra', () => {
  it('obra sem pacote: nada', async () => {
    expect(await baseDoPacote(SEM_PACOTE, buscar)).toBeNull()
  })
  it('com pacote: lê os dois CSV e guarda', async () => {
    await banco.gravarMeta(`pacote_obra:${OBRA}`, { raiz: RAIZ })
    const b = await baseDoPacote(OBRA, buscar)
    expect(b!.copias).toHaveLength(12)
    expect(b!.vigentesArquivo).toBe('pacote da obra')
    expect((await lerBase(OBRA))!.copias).toHaveLength(12)
  })
  it('falta um dos CSV: não inventa base', async () => {
    const OUTRA = 'c0000000-0000-0000-0000-0000000000c3'
    await banco.gravarMeta(`pacote_obra:${OUTRA}`, { raiz: 'http://localhost:8770/outra/' })
    expect(await baseDoPacote(OUTRA, buscar)).toBeNull()
  })
  it('o que a pessoa importou ganha do pacote', async () => {
    await importarBase(OBRA, { vigentes: new File([VIGENTES_EXE], 'minha.csv') })
    expect((await lerBaseOuDoPacote(OBRA))!.vigentesArquivo).toBe('minha.csv')
  })
})

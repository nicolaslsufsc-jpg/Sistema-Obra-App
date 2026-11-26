// Teste cruzado do índice de apoios: o app (a conta do botão "Baixar índice de apoios" do Avanço) e o
// pipeline (pipeline/fvs/indice_apoios.py) leem os mesmos manifests da obra EXE e têm que dar o mesmo
// arquivo, o apoios_esperado.json. O lado do pipeline está em pipeline/testes/test_fvs_indice_apoios.py.
// Mudou a conta de um lado: os dois testes mostram.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { apoiosDaObra, type PlantaDoAparelho } from '../fvs/escoramento_residencial'
import type { ElementoPacote } from '../fvs/pacote'
import type { AreaDeLaje } from '../fvs/areas'
import { apoiosDasAreasPeloIndice, apoiosDoIndice, centrosDasPlantas, indiceDeApoios, lerCentrosDeApoios, lerIndiceDeApoios } from './avanco'

const EXEMPLO = path.resolve(__dirname, '../../../pipeline/testes/exemplos/apoios_exe')

interface Manifest {
  planta_id: string
  pavimento: string
  elementos: Record<string, ElementoPacote>
}

function manifests(pasta: string): Manifest[] {
  const saida: Manifest[] = []
  for (const nome of readdirSync(pasta).sort()) {
    const arq = path.join(pasta, nome)
    if (statSync(arq).isDirectory()) saida.push(...manifests(arq))
    else if (nome === 'manifest.json') saida.push(JSON.parse(readFileSync(arq, 'utf-8')) as Manifest)
  }
  return saida
}

describe('índice de apoios: app e pipeline dão o mesmo arquivo (obra EXE)', () => {
  const lidos = manifests(EXEMPLO)
  // o cadastro da obra como o app o tem: cada peça no pavimento da planta em que veio (o id do pavimento
  // aqui é o nome dele); a mesma peça repetida noutra planta do pavimento é a mesma linha
  const pecas = new Map<string, { id: string; tipo: 'P' | 'V' | 'L'; nome: string; pavimentoId: string; pavimento_id: string }>()
  for (const m of lidos)
    for (const [id, e] of Object.entries(m.elementos)) {
      // como o aparelho: fora o que está na planta só para ver o detalhe (soDetalheGuardado, em pecasBase)
      if ((e.tipo === 'P' || e.tipo === 'V' || e.tipo === 'L') && !e.so_detalhe) pecas.set(id, { id, tipo: e.tipo, nome: e.nome, pavimentoId: m.pavimento, pavimento_id: m.pavimento })
    }
  // as plantas como o aparelho as guarda (estruturaNoAparelho): só pilares, vigas e lajes, na ordem do id
  const plantas: PlantaDoAparelho[] = lidos
    .map((m) => ({ planta_id: m.planta_id, elementos: Object.fromEntries(Object.entries(m.elementos).filter(([, e]) => e.tipo === 'P' || e.tipo === 'V' || e.tipo === 'L')) }))
    .filter((p) => Object.keys(p.elementos).length > 0)
    .sort((a, b) => a.planta_id.localeCompare(b.planta_id))
  const esperado = JSON.parse(readFileSync(path.join(EXEMPLO, 'apoios_esperado.json'), 'utf-8')) as { pavimentos: unknown; centros: unknown }

  it('a conta do botão dá o apoios_esperado.json', () => {
    const apoios = apoiosDaObra(plantas, pecas, [])
    const indice = indiceDeApoios([...pecas.values()], apoios, (id) => id)
    expect(indice).toEqual(esperado.pavimentos)
  })

  it('o arquivo do pipeline é lido inteiro pelo app e volta nos mesmos apoios', () => {
    const lido = lerIndiceDeApoios(esperado)
    expect(lido).toEqual(esperado.pavimentos)
    const doIndice = apoiosDoIndice(lido, [...pecas.values()], (id) => id)
    const dasPlantas = apoiosDaObra(plantas, pecas, [])
    for (const [id, ap] of doIndice) {
      const p = dasPlantas.get(id)!
      const nomes = (ids: readonly string[]) => [...new Set(ids.map((i) => pecas.get(i)!.nome.trim()))].sort()
      expect(nomes(ap.pilares), id).toEqual(nomes(p.pilares))
      expect(nomes(ap.vigas), id).toEqual(nomes(p.vigas))
    }
    expect(doIndice.size).toBe(7)
  })

  // lajes desenhadas no app (25/11): os centros de pilares e vigas no índice, e o contorno da área
  const pavimentoDe = (id: string) => pecas.get(id)?.pavimento_id

  it('os centros das plantas do aparelho dão os do apoios_esperado.json', () => {
    expect(centrosDasPlantas(plantas, pavimentoDe, (id) => id)).toEqual(esperado.centros)
    expect(lerCentrosDeApoios(esperado)).toEqual(esperado.centros)
  })

  it('as áreas pelo índice dão o areas_esperado.json do pipeline e o mesmo que pelas plantas', () => {
    const lidas = JSON.parse(readFileSync(path.join(EXEMPLO, 'areas_exe.json'), 'utf-8')) as { areas: Array<{ id: string; pavimento: string; contorno: [number, number][] }> }
    const doPipeline = JSON.parse(readFileSync(path.join(EXEMPLO, 'areas_esperado.json'), 'utf-8')) as Record<string, [string[], string[]]>
    // o pavimento da área pelo nome, como o app casa (sem diferenciar maiúscula nem espaço)
    const ids = [...new Set([...pecas.values()].map((p) => p.pavimento_id))]
    const idDoPavimento = (nome: string) => ids.find((i) => i.trim().toUpperCase() === nome.trim().toUpperCase()) ?? nome
    const areas = lidas.areas.map((a) => ({ id: a.id, pavimento_id: idDoPavimento(a.pavimento), contorno: a.contorno }))
    const doIndice = apoiosDasAreasPeloIndice(lerCentrosDeApoios(esperado), areas, [...pecas.values()], (id) => id)
    const nomes = (lista: readonly string[]) => [...new Set(lista.map((i) => pecas.get(i)!.nome.trim()))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
    const comoNoPipeline = Object.fromEntries([...doIndice].map(([id, ap]) => [id, [nomes(ap.pilares), nomes(ap.vigas)]]))
    expect(comoNoPipeline).toEqual(doPipeline)
    // e igual à conta com a planta no aparelho (apoiosDaObra, que a tela usa quando tem a planta)
    const dasPlantas = apoiosDaObra(plantas, pecas, areas.map((a) => ({ ...a, planta_id: null }) as unknown as AreaDeLaje))
    for (const [id, ap] of doIndice) {
      expect(nomes(ap.pilares), id).toEqual(nomes(dasPlantas.get(id)!.pilares))
      expect(nomes(ap.vigas), id).toEqual(nomes(dasPlantas.get(id)!.vigas))
    }
  })

  it('índice antigo, sem centros: nenhuma área entra (a tela avisa)', () => {
    expect(lerCentrosDeApoios({ pavimentos: esperado.pavimentos })).toBeNull()
    // entrada torta fica de fora, o resto vale
    expect(lerCentrosDeApoios({ centros: { A: { planta: 'x', pecas: { 'L:L1': [1, 2], 'P:P1': [1, 2, 3], 'P:P2': [1, 'a'], 'V:V1': [3, 4] } }, B: { pecas: { 'P:P1': [1, 2] } } } })).toEqual({ A: { planta: 'x', pecas: { 'V:V1': [3, 4] } } })
    expect(apoiosDasAreasPeloIndice(null, [{ id: 'a', pavimento_id: '1º Pavimento', contorno: [[0, 0], [9, 0], [9, 9]] }], [...pecas.values()], (id) => id).size).toBe(0)
  })
})

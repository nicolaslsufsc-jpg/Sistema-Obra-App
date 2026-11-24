// Pranchas em pastas e subpastas (23/11/2026). Obra fictícia EXE.
import { describe, expect, it } from 'vitest'
import type { Documento } from './dados'
import { acharPasta, arvoreDePranchas, caminhoDaPrancha, pastasDaPrancha, type Pasta } from './pastas'

let n = 0
const doc = (disciplina: string, pasta: string | null, nome_curto: string, titulo: string): Documento => {
  n++
  return { id: `d${n}`, codigo: `EXE.XX.${String(n).padStart(3, '0')}.${nome_curto}`, disciplina_sigla: 'XX', disciplina, numero: String(n), nome_curto, titulo, pasta_autodoc: pasta, link_pasta: null, busca: '' }
}
const nomes = (p: Pasta) => p.pastas.map((x) => `${x.nome} (${x.pranchas})`)

describe('pasta de cada prancha', () => {
  it('tira a raiz da obra no Autodoc e a pasta da disciplina; sem pasta, vale a fase vigente', () => {
    expect(pastasDaPrancha({ disciplina: 'Estrutura', pasta_autodoc: 'LO/Vigas' })).toEqual(['LO', 'Vigas'])
    expect(pastasDaPrancha({ disciplina: 'Estrutura', pasta_autodoc: '123 - EXE (Obra Exemplo)/PROJETOS/Estrutura/Liberado Obra/' })).toEqual(['Liberado Obra'])
    expect(pastasDaPrancha({ disciplina: 'Hidráulica', pasta_autodoc: 'Hidraulica/LO' })).toEqual(['LO'])
    expect(pastasDaPrancha({ disciplina: 'Estrutura', pasta_autodoc: null }, 'ex')).toEqual(['EX'])
    expect(pastasDaPrancha({ disciplina: 'Estrutura', pasta_autodoc: '' })).toEqual([])
  })
})

describe('árvore das pranchas', () => {
  const docs: Documento[] = []
  const pavs = ['PILOTIS', 'MEZANINO', '2º PAVIMENTO TIPO', '3º PAVIMENTO TIPO']
  for (const pav of pavs) for (let i = 0; i < 3; i++) docs.push(doc('Estrutura', 'LO/Vigas', `VIG${i}`, `DETALHAMENTO DAS VIGAS DO ${pav}`))
  docs.push(doc('Estrutura', 'LO/Pilares', 'PIL1', 'PILARES DO PILOTIS'))
  docs.push(doc('Estrutura', 'EX/Formas', 'FOR1', 'FORMA DO PILOTIS'))
  // poucas pranchas, um pavimento cada: não divide por pavimento
  for (const pav of ['SUBSOLO', 'TÉRREO', 'PILOTIS']) docs.push(doc('Acústica', 'EX', 'ACU', `ACÚSTICA DO ${pav}`))
  const aviso = new Set([docs[6].id, docs[7].id])

  const raiz = arvoreDePranchas(docs, (d) => ({ recolher: aviso.has(d.id) ? 1 : 0, nova: d.id === docs[0].id }))

  it('disciplina › fase › tipo › pavimento, com LO antes de EX e os pavimentos na ordem da obra', () => {
    expect(nomes(raiz)).toEqual(['Estrutura (14)', 'Acústica / EX (3)'])
    const es = raiz.pastas[0]
    expect(nomes(es)).toEqual(['LO (13)', 'EX / Formas (1)'])
    expect(nomes(es.pastas[0])).toEqual(['Pilares (1)', 'Vigas (12)'])
    const vigas = es.pastas[0].pastas[1]
    expect(nomes(vigas)).toEqual(['Pilotis (3)', 'Mezanino (3)', '2º pavimento (3)', '3º pavimento (3)'])
    expect(raiz.pastas[1].docs).toHaveLength(3)
  })

  it('os avisos sobem para as pastas de cima', () => {
    const es = raiz.pastas[0]
    expect([es.recolher, es.novas]).toEqual([2, 1])
    expect(acharPasta(raiz, ['Estrutura', 'LO', 'Vigas', '2º pavimento']).recolher).toBe(2)
    expect(acharPasta(raiz, ['Estrutura', 'LO', 'Vigas', 'Pilotis']).recolher).toBe(0)
  })

  it('acha a pasta pelo caminho (também a juntada) e diz onde a prancha fica', () => {
    const v = acharPasta(raiz, ['Estrutura', 'LO', 'Vigas', '2º pavimento'])
    expect(v.docs.map((d) => d.titulo)).toEqual(Array(3).fill('DETALHAMENTO DAS VIGAS DO 2º PAVIMENTO TIPO'))
    expect(acharPasta(raiz, ['Acústica', 'EX']).nome).toBe('Acústica / EX')
    expect(acharPasta(raiz, ['Estrutura', 'não existe']).nome).toBe('Estrutura')
    expect(acharPasta(raiz, []).nome).toBe('')
    expect(caminhoDaPrancha(raiz, docs[6].id)).toEqual(['Estrutura', 'LO', 'Vigas', '2º pavimento'])
  })
})

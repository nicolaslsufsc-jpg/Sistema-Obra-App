// Esquadrias nos ambientes (FVS ambientes, fatia F2, 19/11). Fichas fictícias da obra EXE.
// Decisões do Nicolas (18/11): esquadria de um toque dentro do ambiente, como o furo na viga; a porta
// entre dois cômodos aparece nos dois; os itens de vão da ficha de ambiente são marcados por elas.
import { describe, expect, it } from 'vitest'
import { filhosDoManifest, furosDoManifest, paiDe, rotuloDoFilho, type ElementoPacote } from './pacote'
import { itensParaEscolher } from './porItem'
import { itensDasEsquadrias, resultadoPelosFuros, resumoDaEstrutura, resumoDasEsquadrias, situacaoDaEsquadriaNaObra, type EventoFvs, type Ficha, type Resultado } from './situacao'

const ALVENARIA: Ficha = {
  id: 'f-exe-alv',
  codigo: 'EXE-ALV',
  titulo: 'Alvenaria (Obra Exemplo)',
  revisao: '0',
  aplica_a: ['A'],
  itens: [
    { n: 1, etapa: 'MARCAÇÃO', titulo: 'Eixos e vãos', esquadrias: true },
    { n: 2, etapa: 'ELEVAÇÃO', titulo: 'Prumo' },
    { n: 3, etapa: 'ELEVAÇÃO', titulo: 'Vergas e contravergas', esquadrias: true },
  ],
}
const PINTURA: Ficha = { ...ALVENARIA, id: 'f-exe-pin', codigo: 'EXE-PIN', titulo: 'Pintura', itens: [{ n: 1, etapa: 'EXECUÇÃO', titulo: 'Recortes no entorno de esquadria', esquadrias: true }] }

let seq = 0
function ev(elemento: string, item: number, resultado: Resultado | null, ficha = ALVENARIA): EventoFvs {
  seq++
  return {
    id: `e${String(seq).padStart(4, '0')}`,
    elemento_id: elemento,
    ficha_id: ficha.id,
    item,
    resultado,
    rodada: 1,
    observacao: null,
    lote_id: null,
    planta_id: null,
    usuario_id: 'u',
    criado_em_dispositivo: `2026-11-19T10:00:${String(seq % 60).padStart(2, '0')}.${String(seq).padStart(3, '0')}Z`,
  }
}

describe('itens de esquadria da ficha de ambiente', () => {
  it('são achados pela marca, na ordem da ficha (a alvenaria tem dois)', () => {
    expect(itensDasEsquadrias(ALVENARIA).map((i) => i.n)).toEqual([1, 3])
    expect(itensDasEsquadrias(undefined)).toEqual([])
  })
  it('não entram no "Por item": quem marca são as esquadrias', () => {
    expect(itensParaEscolher(ALVENARIA).map((i) => i.n)).toEqual([2])
  })
  it('o resumo é no feminino', () => {
    expect(resumoDasEsquadrias(['liberado', 'nada', 'reprovado']).texto).toBe('Esquadrias: 1 de 3 OK, 1 errada')
    expect(resumoDasEsquadrias(['reprovado', 'reprovado']).texto).toBe('Esquadrias: 0 de 2 OK, 2 erradas')
    // o item do ambiente sai como o dos furos: alguma errada NC, todas OK C
    expect(resultadoPelosFuros(['liberado', 'liberado'])).toBe('C')
    expect(resultadoPelosFuros(['liberado', 'reprovado'])).toBe('NC')
  })
})

describe('esquadria fora da planta (busca na obra)', () => {
  it('vale o pior dos itens de esquadria de qualquer serviço', () => {
    expect(situacaoDaEsquadriaNaObra([ALVENARIA, PINTURA], [])).toBe('nada')
    expect(situacaoDaEsquadriaNaObra([ALVENARIA, PINTURA], [ev('e1', 1, 'C')])).toBe('liberado')
    expect(situacaoDaEsquadriaNaObra([ALVENARIA, PINTURA], [ev('e1', 1, 'C'), ev('e1', 1, 'NC', PINTURA)])).toBe('reprovado')
    // registro em item que não é de esquadria não conta
    expect(situacaoDaEsquadriaNaObra([ALVENARIA], [ev('e1', 2, 'NC')])).toBe('nada')
  })
  it('não conta como peça no início do pavimento', () => {
    const r = resumoDaEstrutura([{ id: 'e1', tipo: 'E' }, { id: 'a1', tipo: 'A' }], [ALVENARIA], () => [])
    expect(r.total).toBe(0)
  })
})

describe('filhos do manifest', () => {
  const base = { secao: '', rotulo: [0, 0, 1, 1] as [number, number, number, number], polys: [] }
  const elementos: Record<string, ElementoPacote> = {
    v1: { ...base, tipo: 'V', nome: 'V1' },
    f1: { ...base, tipo: 'F', nome: 'V1-F1', viga: 'v1', furo: { forma: 'circular', diametro: 10 } },
    a1: { ...base, tipo: 'A', nome: '101-01' },
    a2: { ...base, tipo: 'A', nome: '101-02' },
    e1: { ...base, tipo: 'E', nome: '101-01-PM80', ambiente: 'a1', esquadria: { codigo: 'PM80', classe: 'porta', outro_lado: '101-02' } },
    e2: { ...base, tipo: 'E', nome: '101-02-PM80', ambiente: 'a2', esquadria: { codigo: 'PM80', classe: 'porta', outro_lado: '101-01' } },
    e3: { ...base, tipo: 'E', nome: '101-01-JA120B', ambiente: 'a1', esquadria: { codigo: 'JA120B', classe: 'janela' } },
    solta: { ...base, tipo: 'E', nome: 'solta' },
  }
  it('agrupa as esquadrias por ambiente (a porta entre dois cômodos é uma em cada) e os furos por viga', () => {
    const m = filhosDoManifest({ elementos })
    expect(m.get('a1')).toEqual(['e3', 'e1'])
    expect(m.get('a2')).toEqual(['e2'])
    expect(m.get('v1')).toEqual(['f1'])
    expect(m.has('solta')).toBe(false)
    // os furos continuam só nas vigas
    expect([...furosDoManifest({ elementos }).keys()]).toEqual(['v1'])
  })
  it('o pai e o rótulo do botão dentro do ambiente', () => {
    expect(paiDe(elementos.e1)).toBe('a1')
    expect(paiDe(elementos.f1)).toBe('v1')
    expect(paiDe(elementos.a1)).toBe(undefined)
    expect(rotuloDoFilho('101-01-PM80', '101-01')).toBe('PM80')
    expect(rotuloDoFilho('101-01-PM70-2', '101-01')).toBe('PM70-2')
    expect(rotuloDoFilho('V1-F2', 'V1')).toBe('F2')
    expect(rotuloDoFilho('V1-F2', undefined)).toBe('F2')
  })
})

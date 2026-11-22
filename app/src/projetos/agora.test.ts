// "O que fazer agora" e "Sugerir regras" (21/11/2026). Obra fictícia EXE.
import { describe, expect, it } from 'vitest'
import { aEntregar, sugerirRegras, type DadosDestinatario, type Destinatario } from './distribuicao'
import { frasesAgora, oQueFazerAgora } from './agora'
import { DISTRIBUICAO_EXE, VIGENTES_EXE } from './exemplo_exe'
import { cruzar, lerDistribuicao, lerVigentes } from './painel'

const HOJE = '2026-11-14'
const vigentes = lerVigentes(VIGENTES_EXE)
const cruzadas = cruzar(lerDistribuicao(DISTRIBUICAO_EXE), vigentes, HOJE)
let n = 0
const regra = (d: Partial<DadosDestinatario>): Destinatario => ({
  disciplina: 'ESTRUTURAL', pasta: '', empresa: 'Empreiteira Alfa', colaborador: 'João', copias: 1, ativo: true, desde: '2026-01-01',
  ...d, id: `r${++n}`, substitui_id: null, em: '2026-11-14T10:00:00Z', usuario: 'eu',
})

describe('sugerir regras pelo que cada um tem', () => {
  const s = sugerirRegras(vigentes, cruzadas, [], HOJE)
  const de = (empresa: string, colaborador: string, disciplina: string) => s.filter((x) => x.dados.empresa === empresa && x.dados.colaborador === colaborador && x.dados.disciplina === disciplina)
  it('uma sugestão por pessoa, disciplina e pavimento, das cópias em campo', () => {
    expect(de('Empreiteira Alfa', 'João', 'ESTRUTURAL').map((x) => x.dados.pavimento)).toEqual(['Pilotis'])
    expect(de('Empreiteira Alfa', 'Pedro', 'ESTRUTURAL').map((x) => x.dados.pavimento)).toEqual(['Subsolo'])
    expect(s.every((x) => x.dados.ativo && x.dados.desde === HOJE && x.dados.pasta === '')).toBe(true)
  })
  it('quem tem todos os pavimentos da disciplina recebe uma regra só, sem pavimento', () => {
    const ana = de('Formas Delta', 'Ana', 'ESTRUTURAL')
    expect(ana).toHaveLength(1)
    expect(ana[0].dados.pavimento).toBe('')
    expect(ana[0].folhas).toBe(2)
  })
  it('o que uma regra ativa já cobre não aparece; regra desativada é reativada', () => {
    const com = sugerirRegras(vigentes, cruzadas, [regra({ empresa: 'Formas Delta', colaborador: '' })], HOJE)
    expect(com.some((x) => x.dados.empresa === 'Formas Delta')).toBe(false)
    const desativada = regra({ empresa: 'Formas Delta', colaborador: 'Ana', ativo: false })
    const r = sugerirRegras(vigentes, cruzadas, [desativada], HOJE).find((x) => x.dados.colaborador === 'Ana')!
    expect(r.substitui_id).toBe(desativada.id)
  })
  it('"qualquer pessoa" não é sugerida quando a empresa já tem pessoa com nome na disciplina e pavimento', () => {
    // linha 13: cópia da Empreiteira Alfa sem colaborador, na mesma folha que o João tem (FORMAS DO PILOTIS)
    const csv = DISTRIBUICAO_EXE + String.fromCharCode(10) + '13;101;R02 LO;FORMAS DO PILOTIS;ESTRUTURAL;1;2026-10-24;Empreiteira Alfa;;'
    const cz = cruzar(lerDistribuicao(csv), vigentes, HOJE)
    const sug = sugerirRegras(vigentes, cz, [], HOJE).filter((x) => x.dados.empresa === 'Empreiteira Alfa' && x.dados.disciplina === 'ESTRUTURAL')
    expect(sug.map((x) => x.dados.colaborador).sort()).toEqual(['João', 'Pedro'])
    // sem o João na sugestão, mas com ele já na lista: também não
    const com = sugerirRegras(vigentes, cz, [regra({ pavimento: 'Pilotis' })], HOJE)
    expect(com.some((x) => x.dados.empresa === 'Empreiteira Alfa' && !x.dados.colaborador)).toBe(false)
    // empresa sem ninguém com nome: "qualquer pessoa" continua
    const so = cruzar(lerDistribuicao(csv.replace(/Empreiteira Alfa;(João|Pedro)/g, 'Outra;$1')), vigentes, HOJE)
    expect(sugerirRegras(vigentes, so, [], HOJE).some((x) => x.dados.empresa === 'Empreiteira Alfa' && !x.dados.colaborador)).toBe(true)
  })
})

describe('o que fazer agora', () => {
  const o = oQueFazerAgora(aEntregar(vigentes, cruzadas, [regra({ copias: 2 })]), cruzadas)
  it('plotar: N cópias de cada folha para quem a regra manda, por folha', () => {
    expect(o.plotar.map((p) => [p.vigente.codigo, p.empresa, p.copias, p.motivo])).toEqual([
      ['EXE.ES.LO.100.FORPILOTIS', 'Empreiteira Alfa', 2, 'trocar'],
      ['EXE.ES.LO.200.PILSUBSOLO', 'Empreiteira Alfa', 2, 'nova'],
    ])
    expect(o.copias).toBe(4)
    expect(o.folhas).toBe(2)
  })
  it('recolher: toda cópia desatualizada em campo, com ou sem regra', () => {
    expect(o.recolher.map((r) => r.x.copia.linha).sort((a, b) => a - b)).toEqual([1, 3, 5, 9])
  })
  it('a frase do resumo', () => {
    expect(frasesAgora(o)).toBe('4 cópias a plotar, 4 a recolher')
    expect(frasesAgora({ copias: 0, recolher: [] })).toBe('nada a plotar nem a recolher')
    expect(frasesAgora({ copias: 1, recolher: [] })).toBe('1 cópia a plotar')
  })
})

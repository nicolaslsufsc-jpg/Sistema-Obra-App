import { describe, expect, it } from 'vitest'
import { cruzar, lerDistribuicao, lerVigentes } from './painel'
import { gruposDaPessoa, pavimentosDaPessoa, pessoasDaObra, porEmpresa, chavePessoa } from './pessoas'
import { DISTRIBUICAO_EXE, VIGENTES_EXE } from './exemplo_exe'
import type { GrupoAEntregar } from './distribuicao'

const HOJE = '2026-11-14'
const cruzadas = cruzar(lerDistribuicao(DISTRIBUICAO_EXE), lerVigentes(VIGENTES_EXE), HOJE)

describe('quem tem o quê (aba Pessoas)', () => {
  const pessoas = pessoasDaObra(cruzadas)
  const de = (empresa: string, colaborador: string) => pessoas.find((p) => p.chave === chavePessoa(empresa, colaborador))!

  it('uma pessoa por empresa + colaborador, mais atrasadas primeiro', () => {
    expect(pessoas.map((p) => p.colaborador).sort()).toEqual(['Ana', 'João', 'Maria', 'Paulo', 'Pedro', 'Rui'])
    expect(pessoas[0].atrasadas.length).toBeGreaterThanOrEqual(pessoas[1].atrasadas.length)
  })

  it('João: a cópia antiga em campo é atrasada; a devolvida não conta; a LO bem posterior vai para conferir', () => {
    const j = de('Empreiteira Alfa', 'João')
    expect(j.emCampo.map((x) => x.copia.linha).sort()).toEqual([1, 10])
    expect(j.atrasadas.map((x) => x.copia.linha)).toEqual([1])
    expect(j.conferir.map((x) => x.copia.linha)).toEqual([10])
    expect(j.maiorAtraso).toBe(23)
    expect(j.ultimaEntrega).toBe('2026-10-15')
  })

  it('a "provavelmente recolhida" não fica em campo', () => {
    const m = de('Hidráulica Beta', 'Maria')
    expect(m.emCampo.map((x) => x.copia.linha)).toEqual([5])
    expect(m.atrasadas.length).toBe(1)
  })

  it('Ana está em dia nas duas que acharam a vigente', () => {
    const a = de('Formas Delta', 'Ana')
    expect(a.emDia).toBe(2)
    expect(a.atrasadas.length).toBe(0)
    expect(a.conferir.length).toBe(1) // folha 300 não achada
  })

  it('menu por empresa: soma as pessoas; empresa com mais atrasadas primeiro', () => {
    const empresas = porEmpresa(pessoas)
    expect(empresas[0].empresa).toBe('Empreiteira Alfa')
    expect(empresas[0].pessoas.map((p) => p.colaborador).sort()).toEqual(['João', 'Paulo', 'Pedro'])
    expect(empresas[0].atrasadas).toBe(3)
  })

  it('o painel da pessoa separa por disciplina e pasta', () => {
    const g = gruposDaPessoa(de('Formas Delta', 'Ana'))
    expect(g.map((x) => x.disciplina)).toEqual(['ESTRUTURAL'])
    expect(g[0].pastas.map((p) => p.pasta)).toEqual(['LO/Formas', 'LO/Pilares', 'sem pasta'])
  })

  it('o painel da pessoa separa por pavimento e, dentro dele, por disciplina', () => {
    for (const p of pessoas) {
      const g = pavimentosDaPessoa(p)
      // nenhuma cópia some nem se repete
      expect(g.flatMap((x) => x.disciplinas.flatMap((d) => d.copias)).length).toBe(p.emCampo.length)
      // atrasadas do pavimento = desatualizadas dele
      for (const x of g) expect(x.atrasadas).toBe(x.disciplinas.flatMap((d) => d.copias).filter((c) => c.resultado === 'desatualizada').length)
    }
    const ana = pavimentosDaPessoa(de('Formas Delta', 'Ana'))
    expect(ana.length).toBeGreaterThan(0)
    expect(ana.every((x) => x.disciplinas.every((d) => d.disciplina === 'ESTRUTURAL'))).toBe(true)
  })

  it('quem só tem algo a receber também aparece (lista de distribuição)', () => {
    const pendentes = [{ empresa: 'Instaladora Zeta', colaborador: 'Lia', pendencias: [{ motivo: 'nova' } as never] }] as GrupoAEntregar[]
    const z = pessoasDaObra(cruzadas, pendentes).find((p) => p.empresa === 'Instaladora Zeta')!
    expect(z.emCampo.length).toBe(0)
    expect(z.aEntregar.length).toBe(1)
  })
})

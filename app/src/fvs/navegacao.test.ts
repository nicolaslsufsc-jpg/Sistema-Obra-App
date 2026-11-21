// Navegação da FVS em 3 níveis (21/11/2026): o agrupamento das plantas do pavimento em disciplinas sai só
// dos dados (a disciplina do setor e o título da ficha), com a obra fictícia EXE.
import { describe, expect, it } from 'vitest'
import type { Planta } from './dados'
import { disciplinasDoPavimento, ehOpcaoDeAlvenaria, nomeDaDisciplinaDoMenu } from './navegacao'
import type { OpcaoDosAmbientes } from './opcoes_ambientes'

const planta = (id: string, disciplina: string, trecho = id): Planta => ({
  id,
  pavimento_id: 'pv-exe-1',
  setor_id: `s-${id}`,
  trecho,
  disciplina,
  prancha: `EXE.${id}`,
  revisao: 'R00',
  elementos: 1,
  manifest: null,
  pacote: null,
  criado_em_dispositivo: '2026-11-21T10:00:00Z',
})
const opcao = (titulo: string): OpcaoDosAmbientes => ({ id: `amb:ficha:${titulo}`, titulo, setor: 'Ambientes', abre: { servico: titulo, aba: 'ambientes' }, projetos: [] })
const ids = (d: ReturnType<typeof disciplinasDoPavimento>) => d.map((x) => [x.id, x.plantas.map((p) => p.id)])

describe('disciplinas do pavimento', () => {
  it('agrupa pela disciplina do setor, na ordem da obra, só as que têm planta', () => {
    const plantas = [
      planta('hid', 'hidro'),
      planta('amb', 'arquitetura'),
      planta('for', 'estrutura'),
      planta('arm-li', 'armadura'),
      planta('fur-esg', 'furacao'),
      planta('ved', 'vedacao'),
      planta('ele', 'eletrico'),
    ]
    expect(ids(disciplinasDoPavimento(plantas))).toEqual([
      ['estrutura', ['for', 'arm-li', 'fur-esg']],
      ['alvenaria', ['ved']],
      ['acabamentos', ['amb']],
      ['instalacoes', ['hid', 'ele']],
    ])
    expect(disciplinasDoPavimento(plantas).map((d) => d.nome)).toEqual(['Estrutura', 'Alvenaria', 'Acabamentos', 'Instalações'])
  })

  it('pavimento só com a forma: só Estrutura', () => {
    expect(ids(disciplinasDoPavimento([planta('for', 'estrutura')]))).toEqual([['estrutura', ['for']]])
  })

  it('disciplina que o app não conhece vira um grupo próprio, depois dos conhecidos', () => {
    const d = disciplinasDoPavimento([planta('ppci', 'ppci'), planta('for', 'estrutura')])
    expect(ids(d)).toEqual([
      ['estrutura', ['for']],
      ['ppci', ['ppci']],
    ])
    expect(d[1].nome).toBe('Ppci')
    expect(nomeDaDisciplinaDoMenu('')).toBe('Outros')
  })

  it('planta de ambientes: alvenaria vai para Alvenaria, o resto para Acabamentos', () => {
    const amb = planta('amb', 'arquitetura')
    const com = (titulos: string[]) => ids(disciplinasDoPavimento([amb], new Map([['amb', titulos.map(opcao)]])))
    // sem o pacote no aparelho (sem opções): Acabamentos, com o Baixar
    expect(ids(disciplinasDoPavimento([amb]))).toEqual([['acabamentos', ['amb']]])
    expect(com(['Alvenaria de vedação', 'Reboco interno', 'Pintura'])).toEqual([
      ['alvenaria', ['amb']],
      ['acabamentos', ['amb']],
    ])
    expect(com(['Alvenaria estrutural'])).toEqual([['alvenaria', ['amb']]])
    expect(com(['Piso cerâmico'])).toEqual([['acabamentos', ['amb']]])
  })

  it('preventivo e ficha de ambiente com item de pontos vão para Instalações (21/11/2026)', () => {
    const amb = planta('amb', 'arquitetura')
    const inst: OpcaoDosAmbientes = { ...opcao('Instalações hidrossanitárias'), pontos: ['hidro', 'sanitario'] }
    const d = disciplinasDoPavimento([planta('prev', 'preventivo'), planta('spda', 'spda'), amb], new Map([['amb', [opcao('Reboco interno'), inst]]]))
    expect(ids(d)).toEqual([
      ['acabamentos', ['amb']],
      ['instalacoes', ['prev', 'spda', 'amb']],
    ])
    // só a ficha de instalações: a planta de ambientes não aparece em Acabamentos
    expect(ids(disciplinasDoPavimento([amb], new Map([['amb', [inst]]])))).toEqual([['instalacoes', ['amb']]])
  })

  it('opção de alvenaria pelo título da ficha', () => {
    for (const t of ['Alvenaria de vedação', 'Execução de VEDAÇÃO', 'Modulação da 1ª fiada', 'Marcação da primeira fiada']) expect(ehOpcaoDeAlvenaria({ titulo: t }), t).toBe(true)
    for (const t of ['Reboco interno', 'Contrapiso', 'Pintura', 'Esquadrias']) expect(ehOpcaoDeAlvenaria({ titulo: t }), t).toBe(false)
  })
})

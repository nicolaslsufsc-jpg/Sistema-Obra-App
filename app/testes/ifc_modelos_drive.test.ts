// "Baixar modelo da obra": a lista do Google Drive é conferida antes de virar link. Obra fictícia EXE.
import { describe, expect, it } from 'vitest'
import { avisosAntesDeBaixar, GRANDE_PARA_APARELHO, idDoDrive, lerLista, linkDoArquivo, listaDeExemplo, TIPO_LISTA } from '../src/ifc/modelos_drive'

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz_-0123'

describe('id do Drive', () => {
  it('aceita id puro e links do Drive; recusa o resto', () => {
    expect(idDoDrive(ID)).toBe(ID)
    expect(idDoDrive(`https://drive.google.com/file/d/${ID}/view?usp=drivesdk`)).toBe(ID)
    expect(idDoDrive(`https://drive.google.com/drive/folders/${ID}`)).toBe(ID)
    expect(idDoDrive(`https://drive.google.com/uc?export=download&id=${ID}`)).toBe(ID)
    expect(idDoDrive(`https://outro.site.com/file/d/${ID}/view`)).toBeNull()
    expect(idDoDrive(`http://drive.google.com/file/d/${ID}/view`)).toBeNull()
    expect(idDoDrive('javascript:alert(1)')).toBeNull()
    expect(idDoDrive('curto')).toBeNull()
    expect(idDoDrive(42)).toBeNull()
  })

  it('o link é montado pelo app, só para o Drive', () => {
    expect(linkDoArquivo(ID)).toBe(`https://drive.google.com/uc?export=download&id=${ID}`)
  })
})

describe('lista de modelos', () => {
  it('lê, confere e ordena por disciplina', () => {
    const l = lerLista(
      JSON.stringify({
        tipo: TIPO_LISTA,
        versao: 1,
        pasta: `https://drive.google.com/drive/folders/${ID}`,
        modelos: [
          { nome: 'EXE.HI.ifc', disciplina: 'Hidráulico', tamanho: 1e9, drive: ID },
          { nome: 'EXE.AR.ifc', disciplina: 'Arquitetura', tamanho: 3e8, drive: `https://drive.google.com/file/d/${ID}/view`, situacao: 'Projeto Executivo' },
          { nome: 'EXE.X.ifc', tamanho: 10, drive: ID },
        ],
      }),
    )
    expect(l.pasta).toBe(ID)
    expect(l.modelos.map((m) => [m.disciplina, m.nome])).toEqual([
      ['Arquitetura', 'EXE.AR.ifc'],
      ['Hidráulico', 'EXE.HI.ifc'],
      ['Outros', 'EXE.X.ifc'],
    ])
  })

  it('recusa arquivo que não é a lista, ou modelo sem id do Drive', () => {
    expect(() => lerLista('{')).toThrow('JSON')
    expect(() => lerLista(JSON.stringify({ modelos: [] }))).toThrow('tipo')
    expect(() => lerLista(JSON.stringify({ tipo: TIPO_LISTA, modelos: [] }))).toThrow('nenhum')
    expect(() => lerLista(JSON.stringify({ tipo: TIPO_LISTA, modelos: [{ nome: 'a.ifc', tamanho: 1, drive: 'https://mau.com/x' }] }))).toThrow('modelo 1')
  })

  it('a EXE tem lista de exemplo', () => {
    expect(listaDeExemplo().modelos.length).toBeGreaterThan(0)
    expect(listaDeExemplo().exemplo).toBe(true)
  })
})

describe('avisos antes de baixar', () => {
  const m = (tamanho: number) => ({ nome: 'x.ifc', disciplina: 'A', tamanho, drive: ID })
  it('pequeno: nada; grande: Wi-Fi; nos dados móveis: conecte no Wi-Fi; muito grande: prefira o PC', () => {
    expect(avisosAntesDeBaixar(m(5e6), {})).toEqual([])
    expect(avisosAntesDeBaixar(m(5e7), { tipo: 'wifi' })).toEqual(['Arquivo grande: baixe com Wi-Fi.'])
    expect(avisosAntesDeBaixar(m(5e7), { tipo: 'cellular' })[0]).toContain('dados móveis')
    expect(avisosAntesDeBaixar(m(5e7), { economia: true })[0]).toContain('dados móveis')
    const muito = avisosAntesDeBaixar(m(GRANDE_PARA_APARELHO), {})
    expect(muito).toHaveLength(2)
    expect(muito[1]).toContain('PC')
  })
})

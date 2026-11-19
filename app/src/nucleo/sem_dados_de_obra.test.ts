import { afterEach, describe, expect, it, vi } from 'vitest'
import { exigirListaNoCi, foraDoApp, lerNomesProibidos, nomesNoTexto } from '../../sem_dados_de_obra'
import { enderecoDoPacote } from './pacote_obra'

describe('só o que é do app vai no site compilado (lista do que pode, ressalva do Revisor)', () => {
  const DO_APP = [
    'index.html', 'sw.js', 'manifest.webmanifest', '_headers', 'workbox-2fbc6a65.js',
    'apple-touch-icon.png', 'icone.svg', 'icone-192.png', 'icone-512.png', 'icone-maskable-512.png',
    'assets/', 'assets/index-CKMfOqpp.js', 'assets/index-abc.css', 'assets/web-ifc-x_1.wasm', 'assets/workbox-window.prod.es5-abc.js',
  ]

  it('o app passa inteiro', () => {
    expect(foraDoApp(DO_APP)).toEqual([])
  })

  it('qualquer outra coisa falha: dado de obra conhecido, os casos do Revisor e pastas', () => {
    const outros = [
      'foto.jpg', 'planta.dxf', 'ficha.docx', 'pacote.7z', 'salvo.obra.gz', 'relatorio.txt', 'manifest.json',
      'salvo-EXE.obra', 'EXE_pacote.zip', 'EXE.ES.LO.101.PDF', 'modelo.ifc', 'planilha.xlsx', 'lista.csv',
      'dados_obra/', 'dados_obra/indice.json', 'pav/pacote.bin', 'historico.json',
      'assets/foto.jpg', 'assets/sub/', 'assets/sub/x.js', 'assets/x.js.map', 'icone-1024.png', 'workbox-x.js.map',
    ]
    expect(foraDoApp([...DO_APP, ...outros])).toEqual(outros)
  })
})

describe('sem o nome da obra nem da empresa no site ("Tirar o nome", 08/11)', () => {
  const LISTA = ['Vila Inventada', 'Bairro Ficticio', 'XYZ']
  it('acha os nomes da lista; sigla só como palavra; não confunde com pedaço de outra palavra', () => {
    expect(nomesNoTexto('var Or={EXE:`Vila Inventada Bairro Ficticio`}', LISTA)).toEqual(['Vila Inventada', 'Bairro Ficticio'])
    expect(nomesNoTexto('modelo da XYZ.', LISTA)).toEqual(['XYZ'])
    expect(nomesNoTexto('VILAINVENTADA e bairro ficticio', LISTA)).toEqual(['Vila Inventada', 'Bairro Ficticio'])
    expect(nomesNoTexto('/^ifcxyzterminal/ IFCXYZSEGMENT xyzflow', LISTA)).toEqual([])
    expect(nomesNoTexto('qualquer coisa', [])).toEqual([])
  })
  it('não escapa por minúscula, _, algarismo, acento, hífen nem escape do JS (Revisor, 09/11)', () => {
    expect(nomesNoTexto('fetch("dados_xyz/indice.json")', LISTA)).toEqual(['XYZ'])
    expect(nomesNoTexto('obra xyz2 e Xyz', LISTA)).toEqual(['XYZ'])
    expect(nomesNoTexto('obraXYZ', LISTA)).toEqual([])
    expect(nomesNoTexto('Vila-Inventada e Bairro Fictício', LISTA)).toEqual(['Vila Inventada', 'Bairro Ficticio'])
    expect(nomesNoTexto('"Vila Invent\\u0061da" e "Bairro_Fict\\u00edcio"', LISTA)).toEqual(['Vila Inventada', 'Bairro Ficticio'])
  })
  it('no GitHub, sem a lista o build para; no PC, sem a lista segue', () => {
    expect(() => exigirListaNoCi([], { CI: 'true' })).toThrow(/NOMES_PROIBIDOS/)
    expect(() => exigirListaNoCi(['XYZ'], { CI: 'true' })).not.toThrow()
    expect(() => exigirListaNoCi([], {})).not.toThrow()
  })
  it('a lista vem de fora do repositório: arquivo ignorado pelo git ou variável', () => {
    expect(lerNomesProibidos('/pasta/que/nao/existe', 'Vila Inventada\n# comentário\n\nXYZ\nXYZ')).toEqual(['Vila Inventada', 'XYZ'])
    expect(lerNomesProibidos('/pasta/que/nao/existe', '')).toEqual([])
    // no Cloudflare Pages a variável tem uma linha só: os nomes vão separados por ";"
    expect(lerNomesProibidos('/pasta/que/nao/existe', 'Vila Inventada; XYZ ;Obra Fictícia')).toEqual(['Vila Inventada', 'XYZ', 'Obra Fictícia'])
  })
})

describe('?dados= só no modo de desenvolvimento', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('no app compilado, ?dados= é ignorado e vale a dados_obra/ ao lado do app', () => {
    vi.stubGlobal('location', new URL('https://obra.pages.dev/?dados=https://outro.site/pacote/'))
    vi.stubGlobal('document', { baseURI: 'https://obra.pages.dev/' })
    expect(enderecoDoPacote(false)).toBe('https://obra.pages.dev/dados_obra/')
    expect(enderecoDoPacote(true)).toBe('https://outro.site/pacote/')
  })
})
